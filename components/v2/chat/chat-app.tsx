'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type BrokerStatus, consumeKiteReturn, disconnectBroker, getBrokerStatus, SessionExpiredError } from '@/lib/client/broker';
import { authHeaders, clearSession, getUser, isLoggedIn, logout } from '@/lib/client/settings';
import { deleteThread, getThread, listThreads, renameThread, type ThreadDetail, type ThreadSummary } from '@/lib/client/threads-api';
import { listWatches, mutateWatch, type WatchSummary } from '@/lib/client/watches';
import { toW8, type W8 } from '@/lib/v2/watcher-view';
import { WatchersScreen } from './watchers-screen';
import { untilSix } from '@/lib/v2/kite-login';
import type { ShellAuth, ShellGate, ShellLimits, ShellSession } from './chat-shell';
import { Conversation } from './conversation';
import { KiteDialog } from './kite-dialog';
import { toast } from './toast';
import { fetchUsage, type Usage } from './usage-api';
import { useKiteConnect } from './use-kite-connect';
import { AccountPanel } from './account-panel';
import { accountKite, accountUsage } from '@/lib/v2/account';
import { TradeDialog } from './trade-dialog';
import type { TradeContext } from '@/lib/v2/trade';
import { prefillFromParams } from '@/lib/client/kite-publisher';
import { type OnboardingState, type TourMarket, tourStarters } from '@/lib/v2/tour';
import { Tour } from '@/components/v2/tour/tour';
import { TourHelp } from '@/components/v2/tour/tour-help';
import { TourQuestion } from '@/components/v2/tour/tour-demo';
import { useTourLaunch } from '@/components/v2/tour/use-tour-launch';

/**
 * The /chat page: the v2 chat app on real data — threads, the eve session,
 * the Zerodha connection and this month's credits. Kite is the only data
 * source (plan D14): until it is connected the box is gated and everything
 * — the banner, the box, the starters, the sidebar link — opens the one
 * Connect Kite dialog (plan V4 pick), which logs in through a pop-up.
 */

type View = { kind: 'draft'; n: number } | { kind: 'thread'; id: string } | { kind: 'watchers' };

const STRIP_MS = 6000;
const WATCH_REFRESH_MS = 15_000;
const GATE_TEXT = 'Connect Kite to start asking. Read-only.';
const HOMEPAGE_QUESTION = 'slash-home:queued-question';

function readDraft(key: string) {
  try { return sessionStorage.getItem(key) ?? ''; } catch { return ''; }
}

function saveDraft(key: string, value: string) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {}
}

function authOf(b: BrokerStatus | null): ShellAuth {
  if (!b) return 'kite';
  if (b.status === 'active') return 'kite';
  if (b.status === 'token_expired') return 'ended';
  return 'delayed';
}

export function ChatApp({ connectorUrl }: { readonly connectorUrl: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.replace(`/?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setReady(true);
  }, []);
  if (!ready) return null;
  return <LoggedInChat connectorUrl={connectorUrl} />;
}

function LoggedInChat({ connectorUrl }: { readonly connectorUrl: string }) {
  const loginReturn = useRef(window.location.pathname + window.location.search);
  const [view, setView] = useState<View>({ kind: 'draft', n: 0 });
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [broker, setBroker] = useState<BrokerStatus | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  /** V10: the carried-over summary shown above the next new chat's box. */
  const [carry, setCarry] = useState<string | null>(null);
  const [adopted, setAdopted] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paused, setPaused] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountNow, setAccountNow] = useState(() => Date.now());
  const [signingOut, setSigningOut] = useState(false);
  const brokerRequest = useRef(0);
  const [strip, setStrip] = useState<{ text: string; sub: string } | null>(null);
  const [queued, setQueued] = useState<{ text: string; n: number } | null>(null);
  const [reconnectNote, setReconnectNote] = useState<{ at: string; watchers: number; threadId: string | null } | null>(null);
  const [watches, setWatches] = useState<WatchSummary[] | null>(null);
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null);
  const clearPrefill = useCallback(() => setPrefill(null), []);
  const tour = useTourLaunch();
  const [tourReady, setTourReady] = useState(false);
  const [tourMarkets, setTourMarkets] = useState<TourMarket[]>([]);
  const [tourQuestion, setTourQuestion] = useState(() => readDraft(HOMEPAGE_QUESTION));
  const [tourError, setTourError] = useState('');
  const [tourSaving, setTourSaving] = useState(false);
  const [tourGate, setTourGate] = useState(false);
  const tourSavingRef = useRef(false);
  const questionKey = `slash-tour:queued-question:${getUser()?.id ?? ''}`;
  const [savedQuestion, setSavedQuestion] = useState(() => readDraft(questionKey));

  const saveQuestion = (question: string) => {
    setSavedQuestion(question);
    saveDraft(questionKey, question);
  };

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      let pending = false;
      try {
        const response = await fetch('/api/onboarding', { headers: authHeaders(), signal: controller.signal });
        if (response.ok) {
          const state = await response.json() as OnboardingState;
          if (controller.signal.aborted) return;
          setTourMarkets(state.markets);
          pending = state.pending;
        }
      } catch {
        // Chat still opens if onboarding is temporarily unavailable.
      }
      if (controller.signal.aborted) return;
      if (pending) tour.setShow(true);
      else {
        const landingQuestion = readDraft(HOMEPAGE_QUESTION);
        if (landingQuestion) setPrefill({ text: landingQuestion, n: Date.now() });
        saveDraft(HOMEPAGE_QUESTION, '');
        setTourQuestion('');
      }
      setTourReady(true);
    }
    void load();
    return () => controller.abort();
  }, [tour.setShow]);

  const [trade, setTrade] = useState<{ context: TradeContext; id: number } | null>(null);
  const openTrade = useCallback((context: TradeContext) => setTrade({ context, id: Date.now() }), []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const form = prefillFromParams(url.searchParams);
    if (!form) return;
    // These v1 order fields have no controls in the v2 prototype. Preserve
    // the full order in the existing form instead of silently changing it.
    if (form.orderType === 'SL' || form.orderType === 'SL-M' || form.product === 'MTF') {
      window.location.replace(`/${url.search}${url.hash}`);
      return;
    }
    const from = url.searchParams.get('from') === 'email' ? 'email' : 'answer';
    const rule = url.searchParams.get('rule')?.slice(0, 500);
    openTrade({ symbol: form.tradingsymbol, exchange: form.exchange, from, label: url.searchParams.get('context')?.slice(0, 500) || rule || 'Trade on Kite', rule, prefill: form, sideExplicit: url.searchParams.has('side') || url.searchParams.has('transaction_type'), quantityExplicit: url.searchParams.has('quantity'), productExplicit: url.searchParams.has('product') });
    for (const key of ['trade','tradingsymbol','exchange','side','transaction_type','quantity','product','order_type','price','trigger_price','from','rule','context']) url.searchParams.delete(key);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, [openTrade]);

  const signOut = useCallback(() => {
    setSigningOut(true);
    void logout().finally(() => window.location.replace('/'));
  }, []);
  const onSessionLost = useCallback((e: unknown) => {
    if (e instanceof SessionExpiredError) {
      clearSession();
      const returnTo = loginReturn.current;
      window.location.replace(returnTo.includes('trade=') ? `/?returnTo=${encodeURIComponent(returnTo)}` : '/');
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
    const request = ++brokerRequest.current;
    try {
      const status = await getBrokerStatus();
      if (request === brokerRequest.current) setBroker(status);
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
    if (auth === 'ended' || broker?.status === 'disconnected') void refreshPaused();
    else setPaused(0);
  }, [auth, broker?.status, refreshPaused]);

  // The Watchers screen: the whole alert log, refreshed while it is open.
  const refreshWatches = useCallback(async () => {
    try {
      setWatches(await listWatches(100));
    } catch (e) {
      onSessionLost(e);
    }
  }, [onSessionLost]);
  useEffect(() => {
    if (view.kind !== 'watchers') return;
    void refreshWatches();
    const t = window.setInterval(() => void refreshWatches(), WATCH_REFRESH_MS);
    return () => window.clearInterval(t);
  }, [view.kind, refreshWatches]);

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
      brokerRequest.current++;
      setBroker(st);
      setLastFailed(false);
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
  const emailLinkHandled = useRef(false);
  useEffect(() => {
    if (!tourReady || emailLinkHandled.current) return;
    emailLinkHandled.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.get('emailSettings') === '1') setAccountOpen(true);
    if (url.searchParams.get('view') === 'watchers') setView({ kind: 'watchers' });
    const thread = url.searchParams.get('thread');
    if (thread) setView({ kind: 'thread', id: thread }); // The API checks ownership.
    const connect = url.searchParams.get('connect');
    if (connect === '1' || connect === 'faq') {
      kite.openDialog();
      if (connect === 'faq') kite.faq();
    }
    const fix = url.searchParams.get('fixWatcher');
    if (fix) void listWatches().then(items => {
      const watch = items.find(w => w.id === fix);
      if (!watch) { toast('Watcher not found.'); return; }
      // A draft only: an email link never runs code or restarts a watcher.
      setView({ kind: 'draft', n: Date.now() });
      setPrefill({ text: `Help fix my watcher “${watch.label}”.\nError: ${watch.lastError ?? 'Not recorded'}\n\nScript:\n${watch.script}`, n: Date.now() });
    }).catch(() => toast('Could not load the watcher. Please try again.'));
    for (const key of ['emailSettings', 'view', 'thread', 'connect', 'fixWatcher']) url.searchParams.delete(key);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, [tourReady, kite]);
  const sendSavedQuestion = useCallback((question: string) => {
    setAdopted(null);
    setView({ kind: 'draft', n: Date.now() });
    setQueued({ text: question, n: Date.now() });
    setPrefill(null);
  }, []);
  const onDialogDone = useCallback(() => {
    kite.done();
    const question = kite.pendingQuestion || savedQuestion;
    if (question) {
      setSentRestoredQuestion(question);
      sendSavedQuestion(question);
      kite.clearPending();
    }
  }, [kite, savedQuestion, sendSavedQuestion]);
  const [sentRestoredQuestion, setSentRestoredQuestion] = useState('');
  useEffect(() => {
    if (!tourReady || tour.show || broker?.status !== 'active' || kite.open ||
        !savedQuestion || sentRestoredQuestion === savedQuestion) return;
    setSentRestoredQuestion(savedQuestion);
    sendSavedQuestion(savedQuestion);
  }, [tourReady, tour.show, broker?.status, kite.open, savedQuestion, sentRestoredQuestion, sendSavedQuestion]);

  const clearQueued = () => {
    if (queued?.text === savedQuestion) saveQuestion('');
    setSentRestoredQuestion('');
    setQueued(null);
  };

  const openKite = (question?: string) => kite.openDialog(question ?? (savedQuestion || kite.pendingQuestion));
  const gateTap = (question?: string) => {
    if (!tourGate && !savedQuestion) {
      openKite(question);
      return;
    }
    if (question) {
      saveQuestion(question);
      toast('Saved. It runs once Kite connects.', 3600);
    }
    tour.pulseGate();
  };
  const finishTour = async (markets: TourMarket[], connect: boolean) => {
    if (tourSavingRef.current) return;
    tourSavingRef.current = true;
    setTourSaving(true);
    setTourError('');
    try {
      const response = await fetch('/api/onboarding', {
        method: 'PUT',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ markets }),
      });
      if (response.status === 401) throw new SessionExpiredError();
      if (!response.ok) throw new Error();
      setTourMarkets(markets);
      if (tourQuestion) saveQuestion(tourQuestion);
      saveDraft(HOMEPAGE_QUESTION, '');
      setTourGate(true);
      if (connect && broker?.status !== 'active') openKite(tourQuestion || undefined);
      tour.finish(!connect);
    } catch (error) {
      if (!onSessionLost(error)) setTourError('Could not save your choices. Try again.');
    } finally {
      tourSavingRef.current = false;
      setTourSaving(false);
    }
  };

  const [lastFailed, setLastFailed] = useState(false);
  const closeDialog = useCallback(() => {
    setLastFailed(kite.state.mode === 'fail' || kite.state.mode === 'timeout' || kite.state.mode === 'blocked');
    kite.close();
  }, [kite]);

  useEffect(() => {
    if (!accountOpen) return;
    const timer = window.setInterval(() => setAccountNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [accountOpen]);

  useEffect(() => {
    if (broker?.status !== 'active' || !broker.expiresAt) return;
    const expiresAt = Date.parse(broker.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt - Date.now() > 2_147_483_647) return;
    const timer = window.setTimeout(() => {
      // Close the composer at the known expiry even if the status request fails.
      setBroker((current) => current === broker ? { ...current, status: 'token_expired' } : current);
      void refreshBroker();
    }, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [broker, refreshBroker]);

  const disconnectKite = async () => {
    brokerRequest.current++;
    try {
      const status = await disconnectBroker();
      brokerRequest.current++;
      setBroker(status);
      setLastFailed(false);
      setNotice(null);
      setStrip(null);
      setReconnectNote(null);
      if (view.kind === 'watchers') void refreshWatches();
      toast('Kite disconnected. Chat and watchers are paused.', 3200);
    } catch (error) {
      if (!onSessionLost(error)) {
        void refreshBroker();
        throw error;
      }
    }
  };

  const expiredEarly = broker?.status === 'token_expired' && accountKite(broker, paused, Date.now(), false).expired;
  const gate: ShellGate | undefined = connected
    ? undefined
    : broker?.status === 'disconnected'
      ? { text: 'Kite is disconnected. Connect to ask.', action: 'Connect Kite', onAction: () => openKite() }
    : auth === 'ended'
      ? lastFailed
        ? { text: 'Kite login didn’t finish. Nothing changed.', action: 'Try again', onAction: () => openKite() }
        : { text: notice ?? (expiredEarly ? 'Kite session expired. Reconnect to ask.' : 'Kite session ended at 6:00. Reconnect to ask.'), action: 'Reconnect Kite', onAction: () => openKite() }
      : { text: notice ?? GATE_TEXT, action: 'Connect Kite', onAction: () => openKite() };

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

  const replaceWatch = (u: WatchSummary) => setWatches((prev) => prev?.map((w) => (w.id === u.id ? u : w)) ?? prev);
  const mutate = async (w: W8, action: 'pause' | 'resume' | 'cancel', done: string) => {
    try {
      replaceWatch(await mutateWatch(w.id, action));
      toast(done);
    } catch (e) {
      if (!onSessionLost(e)) toast(e instanceof Error ? e.message : 'That didn’t work. Try again.');
    }
  };
  const openDraftWith = (text: string, send = false) => {
    setAdopted(null);
    setView({ kind: 'draft', n: Date.now() });
    if (send) setQueued({ text, n: Date.now() });
    else setPrefill({ text, n: Date.now() });
  };
  const watcherActions = {
    onOpenEmails: () => setAccountOpen(true),
    onPause: (w: W8) => mutate(w, 'pause', `${w.sym} paused. It stops checking until you resume.`),
    onResume: (w: W8) => mutate(w, 'resume', `${w.sym} is watching again. The next check sets a new baseline.`),
    onCancel: (w: W8) => mutate(w, 'cancel', `${w.sym} cancelled. It moved to Finished.`),
    onOpenChat: (w: W8) => {
      if (w.threadId) setView({ kind: 'thread', id: w.threadId });
      else toast('This watcher was set up outside this app (in Claude or ChatGPT), so there is no chat to open.');
    },
    onTrade: (w: W8) => openTrade({ symbol: w.sym, exchange: w.ex, from: 'watcher', label: w.rule, rule: w.rule }),
    onReconnect: () => kite.openDialog(),
    onFix: (w: W8) => {
      const text = `My watcher on ${w.sym} (“${w.rule}”) stopped: ${w.error ?? 'the script failed'}. Please fix its script.`;
      if (w.threadId) {
        setView({ kind: 'thread', id: w.threadId });
        setPrefill({ text, n: Date.now() });
      } else openDraftWith(text);
    },
    onWatchAgain: (w: W8) => openDraftWith(`Tell me when ${w.sym}: ${w.rule}`),
    onAskExample: (q: string) => openDraftWith(q, true),
  };

  const shell = {
    sessions,
    currentId,
    auth,
    kiteUntil: broker?.expiresAt ? new Date(broker.expiresAt) : null,
    statusLine: broker?.status === 'disconnected' ? (<><i />Kite disconnected</>) : auth === 'ended'
      ? (<><i />{expiredEarly ? 'Kite session expired' : 'Kite ended at 6:00 AM'}</>)
      : undefined,
    gate: gate && auth === 'ended' && view.kind === 'watchers' ? { ...gate, text: expiredEarly ? 'Kite session expired. Your watchers are paused until you reconnect.' : 'Kite session ended at 6:00. Your watchers are paused until you reconnect.' } : gate,
    email: getUser()?.email ?? undefined,
    onOpenWatchers: () => setView({ kind: 'watchers' }),
    accountInitial: (getUser()?.email ?? 'Y').slice(0, 1).toUpperCase(),
    creditsLeft: usage?.leftPct ?? 100,
    limits: {
      credits: usage ? (usage.monthUsd >= usage.allowanceUsd || usage.leftPct === 0 ? 'out' : usage.leftPct <= usage.lowPct ? 'low' : null) : null,
      chat: view.kind === 'thread' ? (detail?.limit ?? null) : null,
      resetsOn: usage?.resetsOn,
      carry: detail?.carry ?? '',
      onPlans: () => {
        setAccountNow(Date.now());
        setAccountOpen(true);
        void refreshUsage();
      },
      onWait: () => toast('Fine. Your chats stay open to read.', 3200),
      onNewChat: () => {
        setAdopted(null);
        setView({ kind: 'draft', n: Date.now() });
      },
      onCarry: () => {
        setCarry(detail?.carry || null);
        setAdopted(null);
        setView({ kind: 'draft', n: Date.now() });
      },
    } satisfies ShellLimits,
    carry: carry && view.kind === 'draft' ? { text: carry, onDismiss: () => setCarry(null) } : null,
    composerGate: connected ? undefined : auth === 'ended' ? ('off' as const) : ('readonly' as const),
    composerPlaceholder: connected ? undefined : auth === 'ended' ? 'Reconnect Kite to ask' : 'Connect Kite to start asking',
    onGateTap: gateTap,
    gatePulseKey: tour.pulse,
    gateQuestion: savedQuestion ? <TourQuestion label="saved for later" question={savedQuestion} sample /> : undefined,
    waitingQuestion: savedQuestion || kite.pendingQuestion,
    starters: tourGate || tourMarkets.length ? tourStarters(tourMarkets) : undefined,
    connectedStrip: strip,
    pausedWatchers: paused,
    view: view.kind === 'watchers' ? ('watchers' as const) : ('chat' as const),
    watchers:
      view.kind === 'watchers' ? (
        <WatchersScreen
          actions={watcherActions}
          email={getUser()?.email ?? ''}
          loading={watches === null}
          watchers={(watches ?? []).map((w) => toW8(w))}
        />
      ) : null,
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
      setAccountNow(Date.now());
      setAccountOpen(true);
      void refreshBroker();
      void refreshUsage();
      if (broker?.status === 'token_expired' || broker?.status === 'disconnected') void refreshPaused();
    },
    onConnectKite: () => openKite(),
    onTrade: openTrade,
  };

  const settled = () => {
    void refreshThreads();
    void refreshBroker();
    void refreshUsage();
    // The chat's long/full state is judged server-side from the turn just stored.
    const v = viewRef.current;
    if (v.kind === 'thread') {
      getThread(v.id)
        .then((d) => setDetail((prev) => (prev && prev.id === d.id ? { ...prev, limit: d.limit, carry: d.carry } : prev)))
        .catch(() => {});
    }
  };

  const dialog = (<>
    {accountOpen ? (
      <AccountPanel
        open={!kite.open}
        email={getUser()?.email ?? ''}
        kite={accountKite(broker, paused, accountNow, lastFailed)}
        usage={accountUsage(usage)}
        connectorUrl={connectorUrl}
        connectorNote="Your Kite connection is shared."
        emailPreferences
        chatGpt={{ title: 'In review', description: '' }}
        onClose={() => setAccountOpen(false)}
        onConnect={() => kite.openDialog()}
        onCancelConnect={kite.cancel}
        onDisconnect={disconnectKite}
        onSignOut={signOut}
        signingOut={signingOut}
      />
    ) : null}
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
    {trade ? <TradeDialog apiKey={broker?.publisherApiKey ?? null} context={trade.context} key={trade.id} onClose={() => setTrade(null)} onReconnect={() => kite.openDialog()} onSessionLost={onSessionLost} /> : null}
  </>);

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

  const renderChat = () => {
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
            onPrefilled={clearPrefill}
            prefillText={prefill?.text}
            queued={connected ? queued : null}
            onQueuedSent={clearQueued}
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
          onQueuedSent={clearQueued}
          onSessionCreated={(sid) => {
            setAdopted(sid);
            setCarry(null);
            void refreshThreads();
          }}
          onTurnSettled={settled}
          onPrefilled={clearPrefill}
            prefillText={prefill?.text}
          queued={connected ? queued : null}
          title={adoptedThread?.title ?? null}
        />
        {dialog}
      </>
    );
  };

  if (!tourReady) return null;
  return <>
    <div className={tour.launch ? 'tour-launch' : undefined} inert={tour.show && !tour.launch}>
      {renderChat()}
      {!kite.open && !accountOpen && !trade && <TourHelp onReplay={() => {
        setTourQuestion(savedQuestion);
        tour.setShow(true);
      }} />}
    </div>
    {tour.show && <div className={tour.launch ? 'tour-exit' : undefined} inert={tour.launch}>
      <Tour error={tourError} initialMarkets={tourMarkets} onFinish={(markets, connect) => void finishTour(markets, connect)} question={tourQuestion} sample saving={tourSaving} />
    </div>}
  </>;
}
