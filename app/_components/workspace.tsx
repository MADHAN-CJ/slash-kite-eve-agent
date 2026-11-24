'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2Icon, LogOutIcon, PlugZapIcon } from 'lucide-react';
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
import { consumeMcpReturn, getMcpStatus, SessionExpiredError, startMcpConnect, type McpStatus } from '@/lib/client/mcp';
import {
  deleteThread as apiDeleteThread,
  renameThread as apiRenameThread,
  getThread,
  listThreads,
  type ThreadDetail,
  type ThreadSummary,
} from '@/lib/client/threads-api';
import { Login } from './login';
import { Sidebar } from './sidebar';
import { ThreadChat } from './thread-chat';

/**
 * The workspace shell: login gate → /markets connection → sidebar (chat
 * history) + main pane (a fresh draft chat or a resumed thread).
 *
 * MCP connection (plan D4/D14): right after login, if the user has no usable
 * grant, the browser is sent ONCE (per login, sessionStorage flag) to the
 * MCP's own login page and comes back to `/?mcp=connected|error`. Any later
 * loss of the grant shows a "Reconnect /markets" banner with a manual
 * button — never an automatic redirect loop.
 */

const AUTOSTART_KEY = 'slash-kite:mcp-autostart';

type View = { kind: 'draft' } | { kind: 'thread'; id: string };

const STARTERS = [
  'How is my portfolio doing today?',
  'Where is NIFTY headed this week?',
  'What moved my worst position today, and why?',
] as const;

export function Workspace() {
  // Session epoch: bumped on login/logout; keys the whole workspace.
  const [authEpoch, setAuthEpoch] = useState(0);
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    setLoggedIn(isLoggedIn());
  }, [authEpoch]);

  const logout = useCallback(() => {
    void apiLogout().finally(() => setAuthEpoch((n) => n + 1));
  }, []);

  if (!loggedIn) {
    return <Login onLoggedIn={() => setAuthEpoch((n) => n + 1)} />;
  }
  return <LoggedInWorkspace key={authEpoch} onLogout={logout} />;
}

function LoggedInWorkspace({ onLogout }: { readonly onLogout: () => void }) {
  const [view, setView] = useState<View>({ kind: 'draft' });
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // --- /markets MCP connection ---
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [mcpNotice, setMcpNotice] = useState<string | null>(null);
  const [mcpBusy, setMcpBusy] = useState(false);
  const refreshMcp = useCallback(async (): Promise<McpStatus | null> => {
    try {
      const st = await getMcpStatus();
      setMcp(st);
      return st;
    } catch (e) {
      if (e instanceof SessionExpiredError) onLogout();
      return null;
    }
  }, [onLogout]);
  const connectMcp = useCallback(async () => {
    setMcpBusy(true);
    setMcpNotice(null);
    try {
      await startMcpConnect(); // navigates away on success
    } catch (e) {
      setMcpBusy(false);
      if (e instanceof SessionExpiredError) return onLogout();
      setMcpNotice(e instanceof Error ? e.message : 'Could not start the /markets sign-in.');
    }
  }, [onLogout]);
  useEffect(() => {
    const back = consumeMcpReturn();
    if (back?.outcome === 'error') setMcpNotice(`/markets sign-in did not complete (${back.reason}). Try again.`);
    void refreshMcp().then((st) => {
      if (!st || st.connected) return;
      if (back) return; // just came back from the MCP — never bounce again automatically
      const user = getUser();
      const flag = `${AUTOSTART_KEY}:${user?.id ?? ''}`;
      try {
        if (sessionStorage.getItem(flag) === '1') return;
        sessionStorage.setItem(flag, '1');
      } catch {
        // storage unavailable — still connect once this render
      }
      void connectMcp();
    });
  }, [refreshMcp, connectMcp]);

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
    void refreshMcp();
  }, [refreshThreads, refreshMcp]);
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

  const sidebarActiveId = view.kind === 'thread' ? view.id : (adoptedThreadId ?? '');

  return (
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar
        activeId={sidebarActiveId}
        onDelete={(id) => void removeThread(id)}
        onNewChat={startNewChat}
        onRename={renameThread}
        onSelect={selectThread}
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
              data-testid="mcp-status"
              disabled={mcpBusy || mcp?.connected}
              onClick={() => void connectMcp()}
              size="sm"
              title={mcp?.connected ? `Connected to ${mcp.issuer}` : 'Connect to /markets'}
              variant="ghost"
            >
              <span className={mcp?.connected ? 'size-2 rounded-full bg-[#17be5f]' : 'size-2 rounded-full bg-destructive'} />
              {mcp === null ? 'Checking…' : mcp.connected ? '/markets connected' : 'Connect /markets'}
              {mcpBusy ? <Loader2Icon className="size-4 animate-spin" /> : <PlugZapIcon className="size-4" />}
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

        {mcp && !mcp.connected ? (
          <div
            className="flex items-center justify-between gap-3 border-b bg-destructive/5 px-4 py-2 text-sm"
            data-testid="mcp-banner"
            role="alert"
          >
            <span>
              {mcpNotice ??
                (mcp.status === 'expired'
                  ? 'Your /markets connection expired — the analyst can’t reach your Zerodha data until you reconnect.'
                  : 'Connect to /markets so the analyst can read your Zerodha account and market data.')}
            </span>
            <Button disabled={mcpBusy} onClick={() => void connectMcp()} size="sm" variant="outline">
              {mcpBusy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {mcp.status === 'expired' ? 'Reconnect' : 'Connect'}
            </Button>
          </div>
        ) : mcpNotice ? (
          <div className="border-b bg-muted px-4 py-2 text-sm" role="status">{mcpNotice}</div>
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
      </section>

      <Dialog onOpenChange={setLogoutConfirmOpen} open={logoutConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out</DialogTitle>
            <DialogDescription>
              Sign out of <Wordmark />
              {getUser()?.email ? ` (${getUser()?.email})` : ''}? Your chats stay on the server — logging
              back in with the same email brings them back. Your /markets connection is released and
              re-established on the next login.
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
