'use client';

import { type ReactNode, type Ref, useCallback, useEffect, useRef, useState } from 'react';
import { Mark, Word } from './brand';
import { Composer, type ComposerHandle } from './composer';
import { DepthBand } from './depth-band';
import { ArrowRight, Icon } from './icons';

/**
 * The chat app's frame — sidebar, header, the empty screen, the docked
 * composer, search, the phone drawer — with the DOM and class names of
 * markets-hero `ux/shared/chat/markup.js`, so `styles/v2/chat.css` and
 * `run.css` apply unchanged. It is a controlled component: chats, the Kite
 * status and credits come in as props, everything the user does goes out as
 * callbacks. What happens inside a conversation is passed as `children`.
 */

export interface ShellSession {
  id: string;
  title: string;
  /** ISO time of the last activity; shown as a date in search. */
  updatedAt: string;
  /** Extra text search may match (message content), when the caller has it. */
  searchText?: string;
}

/** `kite` connected · `delayed` signed in, Kite not connected · `ended` the Kite session is over · `out` signed out. */
export type ShellAuth = 'kite' | 'delayed' | 'ended' | 'out';

export interface ShellGate {
  text: string;
  action: string;
  onAction: () => void;
  /** The login is in progress in Kite's window: a spinner and Cancel replace the button (morning `w9`). */
  busy?: { onCancel: () => void };
}

/** How the box behaves while Kite is not connected: `readonly` = connect-kite's gate (dimmed, a tap opens the dialog); `off` = the morning's greyed box (one tap reconnects). */
export type ComposerGate = 'readonly' | 'off';

const RAIL_KEY = 'chat-rail';
const PANEL_KEY = 'chat-data';
const DELETE_CONFIRM_MS = 2500;
const SHARE_FEEDBACK_MS = 1400;
const EXAMPLES = [
  'Where’s support on Reliance?',
  'Tell me when NVDA crosses my level',
  'What’s RSI saying on TCS?',
  'Scan for stocks with RSI under 30',
] as const;
/** Behind the Kite gate the starters are led by "Surprise me" (connect-kite flow.js `setGate`). */
const GATED_EXAMPLES = ['Surprise me with what you can do', 'Where’s support on Reliance?', 'Crude mein aaj ka range kya hai?', 'Scan for stocks with RSI under 30'] as const;

function creditsText(left: number): string {
  if (left === 0) return 'No credits left this month';
  if (left <= 20) return `${left}% left this month.`;
  return `${left}% of this month’s credits left`;
}

function CreditsLine({ left }: { readonly left: number }) {
  return (
    <>
      <div className="cr5" style={{ '--cr': `${left}%` } as React.CSSProperties}>
        <span className="cr5b">
          <i />
        </span>
        <span className="cr5t">{creditsText(left)}</span>
      </div>
      <p className="legal">Facts from market data. Not investment advice.</p>
    </>
  );
}

function SessionRow({
  session,
  active,
  onOpen,
  onDelete,
}: {
  readonly session: ShellSession;
  readonly active: boolean;
  readonly onOpen: () => void;
  readonly onDelete: () => void;
}) {
  // Delete asks once: the first click arms the button for 2.5 s, the second deletes.
  const [armed, setArmed] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div className={active ? 'ss on' : 'ss'} data-id={session.id}>
      <button className="t" onClick={onOpen} type="button">
        {session.title}
      </button>
      <button
        aria-label="Delete chat"
        className={armed ? 'x ask' : 'x'}
        onClick={() => {
          if (armed) return onDelete();
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), DELETE_CONFIRM_MS);
        }}
        title={armed ? 'Click again to delete' : 'Delete chat'}
        type="button"
      >
        <Icon name="trash" />
      </button>
    </div>
  );
}

function SearchPanel({
  open,
  sessions,
  onClose,
  onOpenChat,
}: {
  readonly open: boolean;
  readonly sessions: readonly ShellSession[];
  readonly onClose: () => void;
  readonly onOpenChat: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const t = window.setTimeout(() => input.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const v = query.trim().toLowerCase();
  const hits = sessions
    .filter((c) => !v || c.title.toLowerCase().includes(v) || (c.searchText ?? '').toLowerCase().includes(v))
    .slice(0, 12);

  useEffect(() => {
    results.current?.querySelector('.sr.on')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (id: string) => {
    onClose();
    onOpenChat(id);
  };

  return (
    <div
      aria-label="Search chats"
      aria-modal="true"
      className={open ? 'srch on' : 'srch'}
      id="srch"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="sbox">
        <div className="row">
          <Icon name="search" />
          <input
            aria-label="Search your chats"
            autoComplete="off"
            id="sq"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(hits.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' && hits[active]) {
                e.preventDefault();
                pick(hits[active].id);
              }
            }}
            placeholder="Search your chats"
            ref={input}
            type="text"
            value={query}
          />
        </div>
        <div className="sres" id="sres" ref={results}>
          {hits.length > 0 ? (
            hits.map((c, i) => (
              <button className={i === active ? 'sr on' : 'sr'} data-i={i} key={c.id} onClick={() => pick(c.id)} type="button">
                <Icon name="chat" />
                <span>{c.title}</span>
                <small>{new Date(c.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
              </button>
            ))
          ) : (
            <div className="none">{sessions.length > 0 ? 'No chats match.' : 'No chats yet. Ask something to start one.'}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatTitle({ title, onRename }: { readonly title: string; readonly onRename?: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (!editing) return;
    settled.current = false;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  const done = (ok: boolean) => {
    if (settled.current) return;
    settled.current = true;
    const next = input.current?.value.trim() ?? '';
    if (ok && next && next !== title) onRename?.(next.slice(0, 80));
    setEditing(false);
  };

  return (
    <button
      className="ctitle"
      id="ctitle"
      onClick={() => {
        if (!editing && title && onRename) setEditing(true);
      }}
      title="Rename this chat"
      type="button"
    >
      {editing ? (
        <input
          aria-label="Chat title"
          defaultValue={title}
          onBlur={() => done(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') done(true);
            else if (e.key === 'Escape') done(false);
          }}
          ref={input}
        />
      ) : (
        title
      )}
    </button>
  );
}

export interface ChatShellProps {
  readonly sessions: readonly ShellSession[];
  readonly currentId: string | null;
  /** Title of the open conversation; empty on a new chat. */
  readonly title: string;
  readonly auth: ShellAuth;
  /** When the Kite session ends; drives the ring round the avatar. */
  readonly kiteUntil?: Date | null;
  /** The line under "Your account". Defaults follow `auth`. */
  readonly statusLine?: ReactNode;
  readonly gate?: ShellGate;
  readonly accountInitial?: string;
  readonly accountName?: string;
  /** Percent of this month's credits left. */
  readonly creditsLeft: number;
  /** No conversation on screen: the hero and its composer show. */
  readonly empty: boolean;
  readonly busy: boolean;
  readonly view?: 'chat' | 'watchers';
  /** Text placed in the empty-screen composer when it mounts (a question kept from sign-in). */
  readonly draft?: string;
  readonly composerDisabled?: boolean;
  readonly composerPlaceholder?: string;
  /** Kite not connected: how the box is closed and what a tap on it does. */
  readonly composerGate?: ComposerGate;
  readonly onGateTap?: (question?: string) => void;
  /** A question saved until Kite connects, shown above the box. */
  readonly waitingQuestion?: string;
  /** The mint strip after connecting (connect-kite `kok`). */
  readonly connectedStrip?: { text: string; sub: string } | null;
  /** Watchers paused because the Kite session ended (morning `bd9`). */
  readonly pausedWatchers?: number;
  /** The answer in view has sources: the right-hand panel may open. */
  readonly hasSources?: boolean;
  readonly sourcesPanel?: ReactNode;
  /** The narrow-screen Sources pane (same content, inside the thread column). */
  readonly sourcesPane?: ReactNode;
  readonly watchers?: ReactNode;
  /** Cards that replace or sit above the docked composer (limits). */
  readonly dockNotice?: ReactNode;
  /** Above the docked box (the Watch this panel, run.js `#wq5` before `#form1`). */
  readonly dockAbove?: ReactNode;
  readonly dockRef?: Ref<ComposerHandle>;
  readonly heroRef?: Ref<ComposerHandle>;
  readonly pulseKey?: number;
  readonly children?: ReactNode;
  readonly onAsk: (text: string) => void;
  readonly onStop: () => void;
  readonly onNewChat: () => void;
  readonly onOpenChat: (id: string) => void;
  readonly onDeleteChat: (id: string) => void;
  readonly onRenameChat?: (id: string, title: string) => void;
  readonly onWatchers: () => void;
  readonly onNewWatcher?: () => void;
  readonly onAccount: () => void;
  readonly onConnectKite: () => void;
  readonly onShare?: () => Promise<void> | void;
}

export function ChatShell(p: ChatShellProps) {
  const view = p.view ?? 'chat';
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const [tab, setTab] = useState<'answer' | 'data'>('answer');
  const [panelOn, setPanelOn] = useState(true);
  const [stuck, setStuck] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [shared, setShared] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setPanelOn(localStorage.getItem(PANEL_KEY) !== '0');
    } catch {
      // storage unavailable: the panel starts open
    }
  }, []);

  const setPanel = (on: boolean) => {
    setPanelOn(on);
    try {
      localStorage.setItem(PANEL_KEY, on ? '1' : '0');
    } catch {
      // storage unavailable
    }
  };

  const toggleRail = () => {
    const on = document.documentElement.classList.toggle('rail');
    try {
      localStorage.setItem(RAIL_KEY, on ? '1' : '0');
    } catch {
      // storage unavailable
    }
  };

  // Kite session ring: the share of a day left until the session ends.
  useEffect(() => {
    if (!p.kiteUntil) return;
    const left = Math.min(1, Math.max(0, (p.kiteUntil.getTime() - Date.now()) / (24 * 36e5)));
    document.documentElement.style.setProperty('--left', String(left));
  }, [p.kiteUntil]);

  const busyRef = useRef(p.busy);
  busyRef.current = p.busy;
  const stopRef = useRef(p.onStop);
  stopRef.current = p.onStop;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setDrawer(false);
        setSearch(true);
      } else if (e.key === 'Escape') {
        setSearch(false);
        setDrawer(false);
        // Esc stops a run (run.js): the hint by the stop square says so.
        if (busyRef.current) {
          e.preventDefault();
          stopRef.current();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A new conversation or a new chat always opens on the answer, not on Sources.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the conversation changes
  useEffect(() => {
    setTab('answer');
    setStuck(true);
  }, [p.currentId, p.empty]);

  // The box in view takes the caret whenever the conversation changes, without scrolling the page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus when the conversation changes
  useEffect(() => {
    if (view !== 'chat' || p.composerDisabled || p.composerGate) return;
    document.querySelector<HTMLTextAreaElement>(p.empty ? '#form0 .in' : '#form1 .in')?.focus({ preventScroll: true });
  }, [p.currentId, p.empty, view]);

  // Follow the conversation while the reader is near the end (app.js `toBottom`): every change to
  // the thread scrolls it into view until the reader scrolls up, and jump-to-latest brings them back.
  const stuckRef = useRef(true);
  stuckRef.current = stuck;
  useEffect(() => {
    const list = scroller.current?.querySelector('#list');
    const el = scroller.current;
    if (!list || !el) return;
    const follow = () => {
      if (stuckRef.current) el.scrollTop = el.scrollHeight;
    };
    // app.js scrolls on a new message and while an answer streams — not when a card or panel opens later.
    const mo = new MutationObserver((records) => {
      const newMessage = records.some((r) => r.target === list && r.addedNodes.length > 0);
      if (newMessage || busyRef.current) follow();
    });
    mo.observe(list, { childList: true, subtree: true, characterData: true });
    follow();
    return () => mo.disconnect();
  }, []);
  // A run that just finished lands at its end too (app.js reply() → toBottom()), after its tabs and sources render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the busy → idle edge matters
  useEffect(() => {
    if (p.busy) return;
    const el = scroller.current;
    if (el && stuckRef.current) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }, [p.busy]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new conversation starts at its end
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [p.currentId, p.empty]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 90);
    setScrolled(el.scrollTop > 4);
  }, []);

  const jump = () => {
    const el = scroller.current;
    if (!el) return;
    setStuck(true);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const share = async () => {
    if (!p.onShare) return;
    try {
      await p.onShare();
      setShared(true);
      window.setTimeout(() => setShared(false), SHARE_FEEDBACK_MS);
    } catch {
      // clipboard refused: nothing to confirm
    }
  };

  const close = (then: () => void) => () => {
    setDrawer(false);
    then();
  };

  const dataLabel = p.auth === 'delayed' ? '15M' : 'KITE';
  const gated = Boolean(p.composerGate);
  // body.gated dims the hero box (connect-kite flow.css); the class lives on <body> there.
  useEffect(() => {
    document.body.classList.toggle('gated', p.composerGate === 'readonly');
    return () => document.body.classList.remove('gated');
  }, [p.composerGate]);

  const status =
    p.statusLine ??
    (p.auth === 'kite' ? (
      <>
        <i />
        Kite connected · until 6:00 AM
      </>
    ) : p.auth === 'delayed' ? (
      <>
        <i />
        <button className="kl" id="kconn" onClick={p.onConnectKite} type="button">
          Connect Kite, it’s free
        </button>
      </>
    ) : p.auth === 'ended' ? (
      'Kite session expired'
    ) : (
      <>
        <i />
        Delayed data
      </>
    ));

  const appClass = [
    'app',
    p.empty ? 'empty' : '',
    p.busy ? 'busy' : '',
    view === 'watchers' ? 'view-alerts' : '',
    p.hasSources ? 'has-data' : '',
    panelOn ? '' : 'data-off',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div className={drawer ? 'scrim on' : 'scrim'} id="scrim" onClick={() => setDrawer(false)} />
      <SearchPanel onClose={() => setSearch(false)} onOpenChat={p.onOpenChat} open={search} sessions={p.sessions} />
      <div className={appClass} data-auth={p.auth} data-tab={tab} id="app">
        <aside aria-label="Navigation" className={drawer ? 'side open' : 'side'} id="side">
          <div className="s-top">
            <Mark />
            <Word />
            <span className="sp" />
            <button
              aria-label="Search chats"
              className="ib"
              id="search"
              onClick={() => {
                setDrawer(false);
                setSearch(true);
              }}
              type="button"
            >
              <Icon name="search" />
            </button>
            <button aria-label="Collapse sidebar" className="ib" id="rail" onClick={toggleRail} type="button">
              <Icon name="rail" />
            </button>
          </div>
          <nav className="nav">
            <button className="nv" id="new" onClick={close(p.onNewChat)} type="button">
              <Icon name="plus" />
              <span>New</span>
            </button>
            <button className={view === 'watchers' ? 'nv on' : 'nv'} id="navalerts" onClick={close(p.onWatchers)} type="button">
              <Icon name="bell" />
              <span>Watchers</span>
              {p.pausedWatchers ? <span className="bd9">{p.pausedWatchers} paused</span> : null}
            </button>
          </nav>
          <div className="grp">
            <span>Sessions</span>
          </div>
          <div className="sess" id="sess">
            {p.auth === 'out' ? (
              <p className="snote">Sign in to keep your chats.</p>
            ) : p.sessions.length > 0 ? (
              p.sessions.map((s) => (
                <SessionRow
                  active={view === 'chat' && s.id === p.currentId}
                  key={s.id}
                  onDelete={() => p.onDeleteChat(s.id)}
                  onOpen={close(() => p.onOpenChat(s.id))}
                  session={s}
                />
              ))
            ) : (
              <div className="none">Your chats will show up here.</div>
            )}
          </div>
          {/* The account row opens the account pop-up, except on its own controls. */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: the avatar inside is the keyboard target */}
          <div
            className="s-bot"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('#theme,#authbtn,#kconn,button:not(#av)')) return;
              p.onAccount();
            }}
          >
            <div className="av" id="av">
              {p.auth === 'out' ? '?' : (p.accountInitial ?? 'Y')}
            </div>
            <div className="who">
              <b id="wn">{p.auth === 'out' ? 'Signed out' : (p.accountName ?? 'Your account')}</b>
              <small id="ws">{status}</small>
            </div>
            <button className="authbtn" id="authbtn" onClick={p.onConnectKite} title="Sign in" type="button">
              <span>Sign in</span>
              <Icon name="signin" />
            </button>
            {/* Dark only for now (plan-v2 D3): the toggle is drawn as designed and does nothing yet. */}
            <button aria-label="Switch light or dark mode" className="ib" id="theme" type="button">
              <Icon name="sun" />
            </button>
          </div>
        </aside>

        <main className="main">
          <header className={scrolled ? 'top scrolled' : 'top'} id="top">
            <button aria-label="Open menu" className="ib menu" id="menu" onClick={() => setDrawer(true)} type="button">
              <Icon name="menu" />
            </button>
            <button aria-label="Back to new chat" className="ib" id="back" onClick={p.onNewChat} type="button">
              <Icon name="back" />
            </button>
            <span className="vtitle" id="atitle">
              Watchers
            </span>
            <ChatTitle
              onRename={p.currentId && p.onRenameChat ? (t) => p.onRenameChat?.(p.currentId as string, t) : undefined}
              title={p.title}
            />
            <span className="sp" />
            <button
              aria-label="Show sources"
              aria-pressed={tab === 'data'}
              className="ib"
              id="dview"
              onClick={() => setTab((t) => (t === 'data' ? 'answer' : 'data'))}
              type="button"
            >
              <Icon name="data" />
            </button>
            <button aria-label="Show sources" className="ib dopen" data-tip="Show sources" id="dopen" onClick={() => setPanel(true)} type="button">
              <Icon name="chevronsLeft" />
            </button>
            <button className="share" id="share" onClick={() => void share()} type="button">
              <Icon name="share" />
              <span>{shared ? 'Copied' : 'Share'}</span>
            </button>
          </header>

          <div className={p.gate?.busy ? 'nb w9' : 'nb'} id="nb">
            {p.gate?.busy ? <span className="sp9" /> : null}
            <span className="nt" id="nbt">
              {p.gate?.text ?? ''}
            </span>
            <button id="nbb" onClick={p.gate?.onAction} type="button">
              <span>{p.gate?.action ?? ''}</span>
              <ArrowRight />
            </button>
            {p.gate?.busy ? (
              <button className="cx9" data-k="cancel" onClick={p.gate.busy.onCancel} type="button">
                Cancel
              </button>
            ) : null}
          </div>

          <div className="body">
            {p.connectedStrip ? (
              <div className="kok on" id="kok">
                <i />
                {p.connectedStrip.text}
                <span>{p.connectedStrip.sub}</span>
              </div>
            ) : null}
            <section aria-label="Alerts" className="alerts" id="alerts">
              {p.watchers}
            </section>
            <div className="hero" id="hero">
              <DepthBand active={p.empty && view === 'chat'} />
              <p className="eyebrow" id="eyebrow">
                NSE · MCX · {p.auth === 'kite' ? 'Through Kite' : '15 minutes behind'}
              </p>
              <h1>What do you want to know?</h1>
              <div className={p.waitingQuestion && gated ? 'on' : undefined} id="waitq">
                {p.waitingQuestion && gated ? (
                  <div className="qcard">
                    <div className="qh">
                      <i className="dot" />
                      Your question<span className="st">runs after Kite</span>
                    </div>
                    <span>{p.waitingQuestion}</span>
                  </div>
                ) : null}
              </div>
              <Composer
                busy={p.busy}
                dataLabel={dataLabel}
                disabled={p.composerDisabled || p.composerGate === 'off'}
                gate={p.composerGate}
                handle={p.heroRef}
                id="form0"
                initialValue={p.draft}
                main
                onFocusGated={() => p.onGateTap?.()}
                onSend={p.onAsk}
                onStop={p.onStop}
                placeholder={p.composerPlaceholder}
                pulseKey={p.pulseKey}
              />
              <div className="ex" id="ex">
                {(gated && p.waitingQuestion ? [] : gated ? GATED_EXAMPLES : EXAMPLES).map((t, i) => (
                  <button className={gated && i === 0 ? 'sur' : undefined} key={t} onClick={() => (gated ? p.onGateTap?.(t) : p.onAsk(t))} type="button">
                    {t}
                  </button>
                ))}
              </div>
              <CreditsLine left={p.creditsLeft} />
            </div>

            <div className="lcol">
              <div className="scroll" id="scroll" onScroll={onScroll} ref={scroller}>
                <div aria-live="polite" className="col convo" id="list">
                  {p.children}
                </div>
                <div className="col pane" id="p-data">
                  <div id="datalist">{p.sourcesPane}</div>
                </div>
              </div>
              <div className="dock-wrap" id="dockwrap" style={tab === 'data' ? { display: 'none' } : undefined}>
                <button
                  aria-label="Jump to latest"
                  className={!stuck && tab === 'answer' && !p.empty ? 'on' : undefined}
                  id="jump"
                  onClick={jump}
                  type="button"
                >
                  <Icon name="down" />
                </button>
                {p.dockAbove}
                <Composer
                  busy={p.busy}
                  dataLabel={dataLabel}
                  disabled={p.composerDisabled || p.composerGate === 'off'}
                  gate={p.composerGate}
                  handle={p.dockRef}
                  id="form1"
                  onFocusGated={() => p.onGateTap?.()}
                  onSend={p.onAsk}
                  onStop={p.onStop}
                  placeholder={p.composerPlaceholder}
                  pulseKey={p.pulseKey}
                />
                <div className="lim5" id="lim5">
                  {p.dockNotice}
                </div>
                <CreditsLine left={p.creditsLeft} />
              </div>
            </div>
          </div>
        </main>
        <aside aria-label="Sources" className="right" id="right">
          <div className="r-in">
            <div className="r-top">
              <span>Sources</span>
              <button aria-label="Hide sources" className="ib" data-tip="Hide sources" id="dclose" onClick={() => setPanel(false)} type="button">
                <Icon name="chevronsRight" />
              </button>
            </div>
            <div id="rlist">{p.sourcesPanel}</div>
            <div className="r-foot">Fetched through the /markets API by your AI. The numbers in the answer come from these requests.</div>
          </div>
        </aside>
      </div>
      <div className="toast2" id="toast2" />
    </>
  );
}
