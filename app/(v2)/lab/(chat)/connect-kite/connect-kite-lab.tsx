'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ChatShell } from '@/components/v2/chat/chat-shell';
import { KiteDialog } from '@/components/v2/chat/kite-dialog';
import { initialKite, kiteReducer, type KiteMode, LOGIN_TIMEOUT_S, nextSixAm, untilSix } from '@/lib/v2/kite-login';

/**
 * The `connect-kite` flow from fixtures: the dialog over a fresh, gated chat.
 * The login is played by timers as the prototype does (Log in → waiting →
 * connected in 5.2 s); the real pop-up lives in `use-kite-connect.ts`.
 */

const AUTO_CONNECT_MS = 5200;
const SAMPLE_Q = 'Where’s support on Reliance?';

export function ConnectKiteLab({ state }: { readonly state: string }) {
  const [kite, dispatch] = useReducer(kiteReducer, initialKite);
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [strip, setStrip] = useState<{ text: string; sub: string } | null>(null);
  const [pending, setPending] = useState(state === 'blocked' || state === 'timeout' ? SAMPLE_Q : '');
  const [kiteUntil, setKiteUntil] = useState<Date | null>(null);
  const auto = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    document.documentElement.dataset.state = state;
    setKiteUntil(nextSixAm());
    setReady(true);
    const t: Partial<Record<string, () => void>> = {
      faq: () => dispatch({ type: 'faq' }),
      wait: () => dispatch({ type: 'start', opened: true }),
      fail: () => {
        dispatch({ type: 'start', opened: true });
        dispatch({ type: 'window-closed' });
      },
      blocked: () => dispatch({ type: 'start', opened: false }),
      timeout: () => {
        dispatch({ type: 'start', opened: true });
        dispatch({ type: 'tick', secondsLeft: 0 });
      },
      done: () => {
        dispatch({ type: 'start', opened: true });
        dispatch({ type: 'connected' });
      },
    };
    t[state]?.();
    return () => timers.current.forEach(clearTimeout);
  }, [state]);

  // Waiting: the countdown, and (as in the prototype) a login that completes by itself.
  useEffect(() => {
    if (kite.mode !== 'wait') return;
    const startedAt = Date.now();
    const tick = window.setInterval(() => dispatch({ type: 'tick', secondsLeft: LOGIN_TIMEOUT_S - Math.floor((Date.now() - startedAt) / 1000) }), 1000);
    const done = auto.current ? window.setTimeout(() => dispatch({ type: 'connected' }), AUTO_CONNECT_MS) : 0;
    return () => {
      window.clearInterval(tick);
      if (done) window.clearTimeout(done);
    };
  }, [kite.mode]);

  const start = useCallback(() => {
    auto.current = true;
    dispatch({ type: 'start', opened: true });
  }, []);
  const close = useCallback(() => {
    auto.current = false;
    dispatch({ type: 'cancel' });
    setOpen(false);
    const nb = document.getElementById('nb');
    if (nb) {
      nb.classList.remove('tpulse');
      void nb.offsetWidth;
      nb.classList.add('tpulse');
    }
  }, []);
  const onDone = useCallback(() => {
    setOpen(false);
    setConnected(true);
    const u = untilSix(nextSixAm());
    setStrip({ text: 'Kite connected until 6:00 AM', sub: `${u.txt} left · read-only` });
    timers.current.push(window.setTimeout(() => setStrip(null), 6000));
    setPending('');
  }, []);
  const openRef = useRef(false);
  openRef.current = open;
  const openDialog = useCallback((q?: string) => {
    if (q) setPending(q);
    if (!openRef.current) dispatch({ type: 'open' });
    setOpen(true);
  }, []);

  if (!ready) return null;
  return (
    <>
      <ChatShell
        auth={connected ? 'kite' : 'delayed'}
        busy={false}
        composerGate={connected ? undefined : 'readonly'}
        composerPlaceholder={connected ? undefined : 'Connect Kite to start asking'}
        connectedStrip={strip}
        creditsLeft={64}
        currentId={null}
        empty
        gate={connected ? undefined : { text: 'Connect Kite to start asking. Read-only.', action: 'Connect Kite', onAction: () => openDialog() }}
        kiteUntil={kiteUntil}
        onAccount={() => {}}
        onAsk={() => {}}
        onConnectKite={() => openDialog()}
        onDeleteChat={() => {}}
        onGateTap={(q) => openDialog(q)}
        onNewChat={() => {}}
        onOpenChat={() => {}}
        onStop={() => {}}
        onWatchers={() => {}}
        sessions={[]}
        title=""
        waitingQuestion={pending}
      />
      <KiteDialog
        kiteUntil={kiteUntil}
        mode={kite.mode as KiteMode}
        onBack={() => dispatch({ type: 'back' })}
        onCancel={() => {
          auto.current = false;
          dispatch({ type: 'cancel' });
        }}
        onClose={close}
        onDone={onDone}
        onFaq={() => dispatch({ type: 'faq' })}
        onNotNow={close}
        onReportBlocked={() => {
          auto.current = false;
          dispatch({ type: 'report-blocked' });
        }}
        onStart={start}
        open={open}
        pendingQuestion={pending}
        secondsLeft={kite.secondsLeft}
      />
    </>
  );
}
