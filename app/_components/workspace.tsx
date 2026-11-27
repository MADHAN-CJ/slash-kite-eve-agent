'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2Icon, LogInIcon, LogOutIcon } from 'lucide-react';
import { Wordmark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getUser, isLoggedIn, logout as apiLogout } from '@/lib/client/settings';
import {
  type BrokerStatus,
  consumeKiteReturn,
  describeStatus,
  getBrokerStatus,
  SessionExpiredError,
  startKiteLogin,
} from '@/lib/client/broker';
import { prefillFromParams, type TradeForm } from '@/lib/client/kite-publisher';
import {
  deleteThread as apiDeleteThread,
  renameThread as apiRenameThread,
  getThread,
  listThreads,
  type ThreadDetail,
  type ThreadSummary,
} from '@/lib/client/threads-api';
import { ConnectScreen } from './connect-screen';
import { KiteTradeCard } from './kite-trade-card';
import { Login } from './login';
import { Sidebar } from './sidebar';
import { ThreadChat } from './thread-chat';
import { WatchersView } from './watchers-view';

/**
 * The workspace shell (plan §10 / D18): login gate → Zerodha connect screen →
 * sidebar (chat history) + main pane (a fresh draft chat or a resumed thread).
 *
 * Logging in here IS logging in to the /markets MCP (shared users table), so
 * the only thing left to connect is the user's Zerodha session. While it is
 * not `active` the connect screen takes the main pane; the user may skip it
 * for the session, in which case a banner in chat keeps the Login-with-Kite
 * button one click away. Kite sessions end every morning, so the banner is
 * also what the user sees first thing on a new day.
 *
 * Two more panes sit beside the chats: Watchers (the checks the analyst set
 * up, managed here) and Trade on Kite (Zerodha's own order window, the only
 * order path). Neither needs an active Zerodha session, so the gate applies
 * to the chat panes only. `/?trade=1&tradingsymbol=…` opens the Trade pane
 * pre-filled — the link the analyst gives when the user wants to act.
 */

const SKIP_KEY = 'slash-kite:connect-skip';

type View = { kind: 'draft' } | { kind: 'thread'; id: string } | { kind: 'watchers' } | { kind: 'trade' };

/** Reads a `/?trade=1&…` deep link once and removes it from the address bar. */
function consumeTradeLink(): TradeForm | null {
  const url = new URL(window.location.href);
  const form = prefillFromParams(url.searchParams);
  if (!form) return null;
  window.history.replaceState(null, '', url.pathname + url.hash);
  return form;
}

const STARTERS = [
  'How is my portfolio doing today?',
  'Where is NIFTY headed this week?',
  'What moved my worst position today, and why?',
] as const;

export function Workspace() {
  // Session epoch: bumped on login/logout; keys the whole workspace.
  const [authEpoch, setAuthEpoch] = useState(0);
  const [loggedIn, setLoggedIn] = useState(false);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    const signedIn = isLoggedIn();
    const returnTo = new URL(window.location.href).searchParams.get('returnTo');
    if (signedIn && returnTo && /^\/chat(?:\?|$)/.test(returnTo)) {
      setReturning(true);
      window.location.replace(returnTo);
    } else setLoggedIn(signedIn);
  }, [authEpoch]);

  const logout = useCallback(() => {
    void apiLogout().finally(() => setAuthEpoch((n) => n + 1));
  }, []);

  if (returning) return null;
  if (!loggedIn) {
    return <Login onLoggedIn={() => setAuthEpoch((n) => n + 1)} />;
  }
  return <LoggedInWorkspace key={authEpoch} onLogout={logout} />;
}

function skipFlag(): string {
  return `${SKIP_KEY}:${getUser()?.id ?? ''}`;
}

function LoggedInWorkspace({ onLogout }: { readonly onLogout: () => void }) {
  const [view, setView] = useState<View>({ kind: 'draft' });
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // --- Zerodha connection ---
  const [broker, setBroker] = useState<BrokerStatus | null>(null);
  const [brokerNotice, setBrokerNotice] = useState<string | null>(null);
  const [brokerBusy, setBrokerBusy] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const refreshBroker = useCallback(async (): Promise<BrokerStatus | null> => {
    try {
      const st = await getBrokerStatus();
      setBroker(st);
      return st;
    } catch (e) {
      if (e instanceof SessionExpiredError) onLogout();
      return null;
    }
  }, [onLogout]);
  const loginKite = useCallback(async () => {
    setBrokerBusy(true);
    setBrokerNotice(null);
    try {
      await startKiteLogin(); // navigates away on success
    } catch (e) {
      setBrokerBusy(false);
      if (e instanceof SessionExpiredError) return onLogout();
      setBrokerNotice(e instanceof Error ? e.message : 'Could not start the Zerodha login.');
    }
  }, [onLogout]);
  const skipConnect = useCallback(() => {
    try {
      sessionStorage.setItem(skipFlag(), '1');
    } catch {
      // storage unavailable — skip for this render only
    }
    setSkipped(true);
  }, []);
  useEffect(() => {
    const back = consumeKiteReturn();
    if (back?.outcome === 'error') setBrokerNotice(`Zerodha login did not complete: ${back.reason}`);
    try {
      setSkipped(sessionStorage.getItem(skipFlag()) === '1');
    } catch {
      // storage unavailable
    }
    void refreshBroker();
  }, [refreshBroker]);
  const connected = broker?.status === 'active';

  // --- Trade on Kite (Kite Publisher; pre-filled from a watcher or a deep link) ---
  const [tradePrefill, setTradePrefill] = useState<TradeForm | null>(null);
  const openTrade = useCallback((form: TradeForm | null) => {
    if (form) setTradePrefill(form);
    setView({ kind: 'trade' });
  }, []);
  useEffect(() => {
    const linked = consumeTradeLink();
    if (linked) openTrade(linked);
  }, [openTrade]);

  // --- Threads (chat history) ---
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const refreshThreads = useCallback(async (): Promise<ThreadSummary[]> => {
    try {
      const list = await listThreads();
      setThreads(list);
      return list;
    } catch {
      return [];
    }
  }, []);
  const onTurnSettled = useCallback(() => {
    void refreshThreads();
    void refreshBroker();
  }, [refreshThreads, refreshBroker]);
  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  const removeThread = useCallback(
    async (id: string) => {
      setThreads((prev) => prev.filter((t) => t.id !== id));
      setView((v) => (v.kind === 'thread' && v.id === id ? { kind: 'draft' } : v));
      try {
        await apiDeleteThread(id);
      } finally {
        void refreshThreads();
      }
    },
    [refreshThreads],
  );

  const renameThread = useCallback(
    async (id: string, title: string) => {
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
      setDetail((d) => (d && d.id === id ? { ...d, title } : d));
      try {
        await apiRenameThread(id, title);
      } catch {
        void refreshThreads(); // revert to the server's truth
      }
    },
    [refreshThreads],
  );

  // --- Selected thread detail (history + resume cursor) ---
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const activeThreadId = view.kind === 'thread' ? view.id : null;
  useEffect(() => {
    if (!activeThreadId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    getThread(activeThreadId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetailError("Couldn't load that chat.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeThreadId]);

  // Draft lifecycle: remembers the eve session its first send created so the
  // sidebar can highlight the adopted row without remounting mid-stream.
  const [draftSessionId, setDraftSessionId] = useState<string | null>(null);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const adoptedThreadId = draftSessionId ? (threads.find((t) => t.eveSessionId === draftSessionId)?.id ?? null) : null;

  const startNewChat = useCallback(() => {
    setDraftSessionId(null);
    setDraftEpoch((n) => n + 1);
    setView({ kind: 'draft' });
  }, []);

  const selectThread = useCallback(
    (id: string) => {
      // The adopted row IS the live draft — don't remount it onto DB history.
      if (view.kind === 'draft' && id === adoptedThreadId) return;
      setDraftSessionId(null);
      setView({ kind: 'thread', id });
    },
    [view.kind, adoptedThreadId],
  );

  const sidebarActiveId = view.kind === 'thread' ? view.id : view.kind === 'draft' ? (adoptedThreadId ?? '') : '';

  const chatView = view.kind === 'draft' || view.kind === 'thread';
  // The connect screen owns the chat pane until Zerodha is active or the user skips it.
  const gate = chatView && broker !== null && !connected && !skipped;

  return (
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar
        activeId={sidebarActiveId}
        onDelete={(id) => void removeThread(id)}
        onNewChat={startNewChat}
        onOpenTrade={() => openTrade(null)}
        onOpenWatchers={() => setView({ kind: 'watchers' })}
        onRename={renameThread}
        onSelect={selectThread}
        section={view.kind === 'watchers' ? 'watchers' : view.kind === 'trade' ? 'trade' : 'chat'}
        threads={threads}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
          <span className="flex items-center gap-2 truncate font-medium text-sm">
            <Wordmark /> for Zerodha
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">read-only</span>
          </span>
          <span className="flex items-center gap-1">
            <Button
              data-testid="broker-status"
              disabled={brokerBusy || connected}
              onClick={() => void loginKite()}
              size="sm"
              title={broker ? describeStatus(broker) : 'Checking Zerodha…'}
              variant="ghost"
            >
              <span className={connected ? 'size-2 rounded-full bg-[#17be5f]' : 'size-2 rounded-full bg-destructive'} />
              {broker === null ? 'Checking…' : connected ? 'Zerodha connected' : 'Login with Kite'}
              {brokerBusy ? <Loader2Icon className="size-4 animate-spin" /> : <LogInIcon className="size-4" />}
            </Button>
            <Button
              aria-label="Sign out"
              onClick={() => setLogoutConfirmOpen(true)}
              size="sm"
              title={getUser()?.email ?? 'Sign out'}
              variant="ghost"
            >
              <LogOutIcon className="size-4" />
            </Button>
          </span>
        </header>

        {view.kind === 'watchers' ? (
          <WatchersView onLogout={onLogout} onNewChat={startNewChat} onTrade={openTrade} />
        ) : view.kind === 'trade' ? (
          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="trade-view">
            <div className="mx-auto max-w-2xl px-4 py-8">
              <KiteTradeCard apiKey={broker?.publisherApiKey ?? null} prefill={tradePrefill} />
            </div>
          </div>
        ) : gate ? (
          <ConnectScreen
            busy={brokerBusy}
            notice={brokerNotice}
            onLogin={() => void loginKite()}
            onSkip={skipConnect}
            status={broker}
          />
        ) : (
          <>
            {broker && !connected ? (
              <div
                className="flex items-center justify-between gap-3 border-b bg-destructive/5 px-4 py-2 text-sm"
                data-testid="broker-banner"
                role="alert"
              >
                <span>{brokerNotice ?? describeStatus(broker)}</span>
                <Button disabled={brokerBusy} onClick={() => void loginKite()} size="sm" variant="outline">
                  {brokerBusy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Login with Kite
                </Button>
              </div>
            ) : brokerNotice ? (
              <div className="border-b bg-muted px-4 py-2 text-sm" role="status">
                {brokerNotice}
              </div>
            ) : null}

            {view.kind === 'draft' ? (
              <ThreadChat
                history={[]}
                key={`draft:${draftEpoch}`}
                onSessionCreated={(sid) => {
                  setDraftSessionId(sid);
                  void refreshThreads();
                }}
                onTurnSettled={onTurnSettled}
                starters={STARTERS}
              />
            ) : detail ? (
              <ThreadChat
                history={detail.messages}
                key={`thread:${detail.id}`}
                onTurnSettled={onTurnSettled}
                session={{ sessionId: detail.eveSessionId, streamIndex: detail.streamIndex }}
                starters={STARTERS}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
                {detailError ?? 'Loading chat…'}
              </div>
            )}
          </>
        )}
      </section>

      <Dialog onOpenChange={setLogoutConfirmOpen} open={logoutConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out</DialogTitle>
            <DialogDescription>
              Sign out of <Wordmark />
              {getUser()?.email ? ` (${getUser()?.email})` : ''}? Your chats and your Zerodha connection stay
              with your /markets account — logging back in with the same email brings them back.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setLogoutConfirmOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setLogoutConfirmOpen(false);
                onLogout();
              }}
              type="button"
              variant="ghost"
            >
              <LogOutIcon className="size-4" /> Sign out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
