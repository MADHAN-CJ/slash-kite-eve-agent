'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { type BrokerStatus, getBrokerStatus } from '@/lib/client/broker';
import { authHeaders } from '@/lib/client/settings';
import { initialKite, KITE_LOGIN_CHANNEL, type KiteLoginMessage, kiteReducer, LOGIN_TIMEOUT_S, openKiteWindow, POLL_MS, type PopupHandle } from '@/lib/v2/kite-login';

/**
 * Owns the Connect Kite dialog and the pop-up login (plan-v2 D11):
 * `start()` opens Zerodha in a new window from the click, then this tab
 * waits — the callback page reports over a BroadcastChannel, the status is
 * polled every 2.5 s as a fallback, a window closed before the login finished
 * is a failure, a refused window is `blocked`, five minutes is a timeout.
 * On `done` the dialog shows the connected screen and then hands over.
 */
export function useKiteConnect({ onConnected, onFailed }: { readonly onConnected: (status: BrokerStatus) => void; readonly onFailed?: (reason: string) => void }) {
  const [state, dispatch] = useReducer(kiteReducer, initialKite);
  const [open, setOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const popup = useRef<PopupHandle | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const openRef = useRef(false);
  openRef.current = open;
  const openDialog = useCallback((question?: string) => {
    if (question !== undefined) setPendingQuestion(question);
    // Already open: keep whatever screen it is on (a second tap on the gate must not reset a wait).
    if (!openRef.current) dispatch({ type: 'open' });
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    popup.current?.close();
    popup.current = null;
    dispatch({ type: 'cancel' });
    setOpen(false);
  }, []);

  const start = useCallback(async () => {
    // The window must open inside the click: open it blank first, then point it at Kite.
    const handle = openKiteWindow('about:blank');
    popup.current = handle;
    dispatch({ type: 'start', opened: handle.opened });
    if (!handle.opened) return;
    try {
      const res = await fetch('/api/broker/kite/login/start', { method: 'POST', headers: { ...authHeaders(), 'content-type': 'application/json' }, body: JSON.stringify({ returnTo: '/kite/done' }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not start the Zerodha login.');
      const { loginUrl } = (await res.json()) as { loginUrl: string };
      const w = window.open(loginUrl, 'kite-login');
      if (!w) throw new Error('The Kite window closed.');
    } catch (e) {
      handle.close();
      dispatch({ type: 'error', reason: e instanceof Error ? e.message : 'Could not start the Zerodha login.' });
      onFailed?.(e instanceof Error ? e.message : 'Could not start the Zerodha login.');
    }
  }, [onFailed]);

  // While waiting: the countdown, the window watcher and the status poll.
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  useEffect(() => {
    if (state.mode !== 'wait') return;
    const startedAt = Date.now();
    let settled = false;
    const connected = (status: BrokerStatus) => {
      if (settled) return;
      settled = true;
      popup.current?.close();
      popup.current = null;
      dispatch({ type: 'connected' });
      onConnectedRef.current(status);
    };
    const tick = window.setInterval(() => {
      const left = LOGIN_TIMEOUT_S - Math.floor((Date.now() - startedAt) / 1000);
      dispatch({ type: 'tick', secondsLeft: left });
      if (left <= 0) popup.current?.close();
    }, 1000);
    const poll = window.setInterval(async () => {
      try {
        const st = await getBrokerStatus();
        if (st.status === 'active' && new Date(st.connectedAt ?? 0).getTime() >= startedAt - 60_000) connected(st);
        else if (popup.current && popup.current.closed()) dispatch({ type: 'window-closed' });
      } catch {
        // the next poll will try again
      }
    }, POLL_MS);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(KITE_LOGIN_CHANNEL);
      channel.onmessage = async (ev: MessageEvent<KiteLoginMessage>) => {
        if (ev.data?.outcome === 'connected') {
          try {
            connected(await getBrokerStatus());
          } catch {
            // the poll will confirm
          }
        } else if (ev.data?.outcome === 'error') {
          popup.current?.close();
          dispatch({ type: 'error', reason: ev.data.reason });
        }
      };
    } catch {
      // no BroadcastChannel: polling covers it
    }
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
      channel?.close();
    };
  }, [state.mode]);

  const actions = {
    openDialog,
    close,
    start: () => void start(),
    faq: () => dispatch({ type: 'faq' }),
    back: () => dispatch({ type: 'back' }),
    cancel: () => {
      popup.current?.close();
      popup.current = null;
      dispatch({ type: 'cancel' });
    },
    reportBlocked: () => {
      popup.current?.close();
      popup.current = null;
      dispatch({ type: 'report-blocked' });
    },
    notNow: close,
    done: () => {
      setOpen(false);
      dispatch({ type: 'cancel' });
    },
    /** The full-page login, for browsers that refuse pop-ups. */
    continueHere: async () => {
      const res = await fetch('/api/broker/kite/login/start', { method: 'POST', headers: { ...authHeaders(), 'content-type': 'application/json' }, body: JSON.stringify({ returnTo: '/chat' }) });
      if (!res.ok) return;
      const { loginUrl } = (await res.json()) as { loginUrl: string };
      window.location.assign(loginUrl);
    },
    clearPending: () => setPendingQuestion(''),
  };
  return { state, open, pendingQuestion, ...actions };
}
