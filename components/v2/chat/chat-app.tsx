'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type BrokerStatus, consumeKiteReturn, getBrokerStatus, SessionExpiredError } from '@/lib/client/broker';
import { clearSession, getUser, isLoggedIn, logout } from '@/lib/client/settings';
import { deleteThread, getThread, listThreads, renameThread, type ThreadDetail, type ThreadSummary } from '@/lib/client/threads-api';
import { listWatches } from '@/lib/client/watches';
import { untilSix } from '@/lib/v2/kite-login';
import type { ShellAuth, ShellGate, ShellSession } from './chat-shell';
import { Conversation } from './conversation';
import { KiteDialog } from './kite-dialog';
import { toast } from './toast';
import { fetchUsage, type Usage } from './usage-api';
import { useKiteConnect } from './use-kite-connect';

/**
 * The /chat page: the v2 chat app on real data — threads, the eve session,
 * the Zerodha connection and this month's credits. Kite is the only data
 * source (plan D14): until it is connected the box is gated and everything
 * — the banner, the box, the starters, the sidebar link — opens the one
 * Connect Kite dialog (plan V4 pick), which logs in through a pop-up.
 */

type View = { kind: 'draft'; n: number } | { kind: 'thread'; id: string } | { kind: 'watchers' };

const STRIP_MS = 6000;
const GATE_TEXT = 'Connect Kite to start asking. Read-only.';

function authOf(b: BrokerStatus | null): ShellAuth {
  if (!b) return 'kite';
  if (b.status === 'active') return 'kite';
  if (b.status === 'token_expired') return 'ended';
  return 'delayed';
}

export function ChatApp() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.replace('/');
      return;
    }
    setReady(true);
  }, []);
  if (!ready) return null;
  return <LoggedInChat />;
}

function LoggedInChat() {
  const [view, setView] = useState<View>({ kind: 'draft', n: 0 });
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [broker, setBroker] = useState<BrokerStatus | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [adopted, setAdopted] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paused, setPaused] = useState(0);
  const [strip, setStrip] = useState<{ text: string; sub: string } | null>(null);
  const [queued, setQueued] = useState<{ text: string; n: number } | null>(null);
  const [reconnectNote, setReconnectNote] = useState<{ at: string; watchers: number; threadId: string | null } | null>(null);

  const signOut = useCallback(() => {
    void logout().finally(() => window.location.replace('/'));
  }, []);
  const onSessionLost = useCallback((e: unknown) => {
    if (e instanceof SessionExpiredError) {
      clearSession();
      window.location.replace('/');
      return true;
    }
    return false;
  }, []);

  const refreshThreads = useCallback(async () => {
    try {
      setThreads(await listThreads());
    } catch (e) {
      onSessionLost(e);
    }
  }, [onSessionLost]);
  const refreshBroker = useCallback(async () => {
    try {
      setBroker(await getBrokerStatus());
    } catch (e) {
      onSessionLost(e);
    }
  }, [onSessionLost]);
  const refreshUsage = useCallback(async () => {
    try {
      setUsage(await fetchUsage());
    } catch {
      // credits are a courtesy line; the chat works without them
    }
  }, []);
  const refreshPaused = useCallback(async () => {
    try {
      const ws = await listWatches();
      setPaused(ws.filter((w) => w.status === 'PAUSED' && w.pausedBy === 'broker').length);
    } catch {
      setPaused(0);
    }
  }, []);

  useEffect(() => {
    const back = consumeKiteReturn();
    if (back?.outcome === 'error') setNotice(`Zerodha login did not complete: ${back.reason}`);
    void refreshThreads();
    void refreshBroker();
    void refreshUsage();
  }, [refreshThreads, refreshBroker, refreshUsage]);

  const auth = authOf(broker);
  const connected = auth === 'kite';
  useEffect(() => {
    if (auth === 'ended') void refreshPaused();
    else setPaused(0);
  }, [auth, refreshPaused]);

  useEffect(() => {
    if (view.kind !== 'thread') {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    getThread(view.id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!onSessionLost(e)) setView({ kind: 'draft', n: Date.now() });
      });
    return () => {
      cancelled = true;
    };
  }, [view, onSessionLost]);

  // --- Connect Kite: one dialog for the first connection and every reconnect ---
  const wasEnded = useRef(false);
  wasEnded.current = auth === 'ended';
  const viewRef = useRef(view);
  viewRef.current = view;
  const kite = useKiteConnect({
    onConnected: (st) => {
      setBroker(st);
      setNotice(null);
      const u = untilSix(st.expiresAt ? new Date(st.expiresAt) : null);
      setStrip({ text: 'Kite connected until 6:00 AM', sub: `${u.txt} left · read-only` });
      window.setTimeout(() => setStrip(null), STRIP_MS);
      if (wasEnded.current) {
        const at = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
        setReconnectNote({ at, watchers: paused, threadId: viewRef.current.kind === 'thread' ? viewRef.current.id : null });
      }
      void refreshThreads();
    },
    onFailed: (reason) => setNotice(reason),
  });
  const onDialogDone = useCallback(() => {
    kite.done();
    if (kite.pendingQuestion) {
      setQueued({ text: kite.pendingQuestion, n: Date.now() });
      kite.clearPending();
    }
  }, [kite]);
  const [lastFailed, setLastFailed] = useState(false);
  const closeDialog = useCallback(() => {
    setLastFailed(kite.state.mode === 'fail' || kite.state.mode === 'timeout' || kite.state.mode === 'blocked');
    kite.close();
  }, [kite]);

  const gate: ShellGate | undefined = connected
    ? undefined
    : auth === 'ended'
      ? lastFailed
        ? { text: 'Kite login didn’t finish. Nothing changed.', action: 'Try again', onAction: () => kite.openDialog() }
        : { text: notice ?? 'Kite session ended at 6:00. Reconnect to ask.', action: 'Reconnect Kite', onAction: () => kite.openDialog() }
      : { text: notice ?? GATE_TEXT, action: 'Connect Kite', onAction: () => kite.openDialog() };

  const sessions: ShellSession[] = threads.map((t) => ({ id: t.id, title: t.title ?? 'New chat', updatedAt: t.updatedAt }));
  const adoptedThread = adopted ? threads.find((t) => t.eveSessionId === adopted) : undefined;
  const currentId = view.kind === 'thread' ? view.id : view.kind === 'draft' ? (adoptedThread?.id ?? null) : null;

  const removeThread = async (id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (currentId === id) setView({ kind: 'draft', n: Date.now() });
    try {
      await deleteThread(id);
    } finally {
      void refreshThreads();
    }
  };
  const rename = async (id: string, title: string) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    try {
      await renameThread(id, title);
    } catch {
      void refreshThreads();
    }
  };

  const shell = {
    sessions,
    currentId,
    auth,
    kiteUntil: broker?.expiresAt ? new Date(broker.expiresAt) : null,
    statusLine: auth === 'ended' ? (<><i />Kite ended at 6:00 AM</>) : undefined,
    gate,
    accountInitial: (getUser()?.email ?? 'Y').slice(0, 1).toUpperCase(),
    creditsLeft: usage?.leftPct ?? 100,
    composerGate: connected ? undefined : auth === 'ended' ? ('off' as const) : ('readonly' as const),
    composerPlaceholder: connected ? undefined : auth === 'ended' ? 'Reconnect Kite to ask' : 'Connect Kite to start asking',
    onGateTap: (q?: string) => kite.openDialog(q ?? kite.pendingQuestion),
    waitingQuestion: kite.pendingQuestion,
    connectedStrip: strip,
    pausedWatchers: paused,
    view: view.kind === 'watchers' ? ('watchers' as const) : ('chat' as const),
    watchers: (
      <div className="aw">
        <div className="ah">
          <h2>Watchers</h2>
        </div>
        <p className="asub">Watchers move here in a later phase. Until then, manage them in the current app.</p>
        <div className="anone">
          <a className="kl" href="/">
            Open the current app
          </a>
        </div>
      </div>
    ),
    onNewChat: () => {
      setAdopted(null);
      setView({ kind: 'draft', n: Date.now() });
    },
    onOpenChat: (id: string) => {
      if (view.kind === 'draft' && id === adoptedThread?.id) return;
      setAdopted(null);
      setView({ kind: 'thread', id });
    },
    onDeleteChat: (id: string) => void removeThread(id),
    onRenameChat: (id: string, title: string) => void rename(id, title),
    onWatchers: () => setView({ kind: 'watchers' }),
    onAccount: () => {
      if (window.confirm(`Sign out of /markets${getUser()?.email ? ` (${getUser()?.email})` : ''}? Your chats and your Zerodha connection stay with your account.`)) signOut();
    },
    onConnectKite: () => kite.openDialog(),
  };

  const settled = () => {
    void refreshThreads();
    void refreshBroker();
    void refreshUsage();
  };

  const dialog = (
    <KiteDialog
      kiteUntil={shell.kiteUntil}
      mode={kite.state.mode}
      onBack={kite.back}
      onCancel={kite.cancel}
      onClose={closeDialog}
      onDone={onDialogDone}
      onFaq={kite.faq}
      onHelp={() => toast('A short how-to on logging in to Kite is coming.')}
      onNotNow={closeDialog}
      onReportBlocked={kite.reportBlocked}
      onStart={kite.start}
      open={kite.open}
      pendingQuestion={kite.pendingQuestion}
      secondsLeft={kite.state.secondsLeft}
    />
  );

  const noteFor = (threadId: string | null) =>
    reconnectNote && reconnectNote.threadId === threadId ? (
      <div className="sy9">
        <i />
        <div>
          <b>
            Kite connected at <span className="tm">{reconnectNote.at}</span>
          </b>
          , until 6:00 AM tomorrow.{reconnectNote.watchers ? ` Your ${reconnectNote.watchers} watchers are running again.` : ''}{' '}
          <a href="/" onClick={(e) => { e.preventDefault(); setView({ kind: 'watchers' }); }}>
            Open Watchers
          </a>
        </div>
      </div>
    ) : null;

  if (view.kind === 'thread') {
    if (!detail) {
      return (
        <>
          <Conversation {...shell} history={[]} key={`loading:${view.id}`} title={threads.find((t) => t.id === view.id)?.title ?? ''} />
          {dialog}
        </>
      );
    }
    return (
      <>
        <Conversation
          {...shell}
          afterThread={noteFor(detail.id)}
          history={detail.messages}
          key={`thread:${detail.id}`}
          onKiteExpired={refreshBroker}
          onTurnSettled={settled}
          queued={connected ? queued : null}
          onQueuedSent={() => setQueued(null)}
          session={{ sessionId: detail.eveSessionId, streamIndex: detail.streamIndex }}
          title={detail.title}
        />
        {dialog}
      </>
    );
  }
  const draftKey = view.kind === 'draft' ? view.n : 'watchers';
  return (
    <>
      <Conversation
        {...shell}
        afterThread={noteFor(null)}
        history={[]}
        key={`draft:${draftKey}`}
        onKiteExpired={refreshBroker}
        onQueuedSent={() => setQueued(null)}
        onSessionCreated={(sid) => {
          setAdopted(sid);
          void refreshThreads();
        }}
        onTurnSettled={settled}
        queued={connected ? queued : null}
        title={adoptedThread?.title ?? null}
      />
      {dialog}
    </>
  );
}
