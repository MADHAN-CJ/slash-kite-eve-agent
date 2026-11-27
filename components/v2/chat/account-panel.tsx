'use client';

import { useEffect, useRef, useState } from 'react';

/** Account views take explicit data. The lab may supply the prototype's
 * invented usage split/calendar text; production must supply real values. */
export interface AccountKite {
  kind: 'on' | 'off' | 'out' | 'new' | 'loading';
  waiting?: boolean;
  failed?: boolean;
  expired?: boolean;
  hours: number;
  minutes: number;
  fraction: number;
  description: string;
  waitingNote: string;
  disconnectNote: string;
}

export interface AccountUsage {
  usedPct: number;
  resetLabel: string;
  chatsPct: number;
  watchersPct?: number;
  low: boolean;
  lowNote?: string;
}

export interface AccountPanelProps {
  open?: boolean;
  email: string;
  kite: AccountKite;
  usage: AccountUsage | null;
  connectorNote?: string;
  connectorUrl: string;
  chatGpt: { title: string; description: string };
  onClose: () => void;
  onConnect: () => void;
  onCancelConnect: () => void;
  onDisconnect: () => Promise<void> | void;
  onSignOut: () => void;
  signingOut?: boolean;
  /** Fixture screenshots follow the prototype's initial focus; live panels move focus inside. */
  autoFocus?: boolean;
}

const paths = {
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 6l-6 6 6 6',
  arrow: 'M9 6l6 6-6 6',
  plug: 'M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0zM12 17v4',
  out: 'M15 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2M21 12H8l3-3M11 15l-3-3',
};
const Icon = ({ name }: { readonly name: keyof typeof paths }) => (
  <svg
    className={name === 'arrow' ? 'ar' : undefined}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={paths[name]} />
  </svg>
);
const Kite = () => (
  <svg viewBox="0 0 22 16" aria-hidden="true">
    <path d="M0 8L11 0h11L11 8l11 8H11z" fill="#E8533F" />
    <path d="M11 8l11-8v16z" fill="#C93A26" opacity=".55" />
  </svg>
);

export function AccountPanel({
  open = true,
  email,
  kite: k,
  usage: u,
  connectorNote = 'Same Kite link and credits.',
  connectorUrl,
  chatGpt,
  onClose,
  onConnect,
  onCancelConnect,
  onDisconnect,
  onSignOut,
  signingOut,
  autoFocus = true,
}: AccountPanelProps) {
  const [view, setView] = useState<'main' | 'mcp'>('main');
  const [tab, setTab] = useState<'claude' | 'gpt'>('claude');
  const [confirm, setConfirm] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (autoFocus) root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key !== 'Tab') return;
      const controls = Array.from(
        root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]') ?? [],
      ).filter((el) => el.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      if (autoFocus) before?.focus();
    };
  }, [autoFocus, open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(connectorUrl);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError('Could not copy the link. Select it and copy it manually.');
    }
  };
  const disconnect = async () => {
    setDisconnecting(true);
    setError(null);
    try {
      await onDisconnect();
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect Kite. Try again.');
    } finally {
      setDisconnecting(false);
    }
  };

  const hero =
    k.kind === 'loading' ? (
      <div className="hk8" role="status">
        Checking Kite connection…
      </div>
    ) : (
      <div className={`hk8 ${k.kind}${k.waiting ? ' wait' : ''}`}>
        <div className="tp">
          <Kite />
          <span>Kite</span>
          <span className="pl">
            <i />
            {k.waiting
              ? 'Waiting for Kite'
              : k.kind === 'on'
                ? 'Connected'
                : k.kind === 'out'
                  ? 'Disconnected'
                  : k.kind === 'new'
                    ? 'Not connected'
                    : k.expired
                      ? 'Session expired'
                      : 'Ended at 6:00 AM'}
          </span>
        </div>
        {k.kind === 'on' ? (
          <>
            <div className="big">
              {k.hours}
              <small>h</small>
              {String(k.minutes).padStart(2, '0')}
              <small>m</small>
            </div>
            <div className="sub">left today · ends 6:00 AM</div>
            <div className="bar" role="img" aria-label={`${k.hours} hours ${k.minutes} minutes left`}>
              <i style={{ width: `${k.fraction * 100}%` }} />
            </div>
            <p className="why">
              Kite logs everyone out at 6 AM. Tap Reconnect once each morning and your chat and watchers keep
              going.
            </p>
            {confirm ? (
              <div className="cf">
                <p>{k.disconnectNote}</p>
                <div>
                  <button
                    type="button"
                    className="dn"
                    data-k="disc"
                    disabled={disconnecting}
                    onClick={() => void disconnect()}
                  >
                    {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                  <button
                    type="button"
                    data-k="keep"
                    disabled={disconnecting}
                    onClick={() => setConfirm(false)}
                  >
                    Keep
                  </button>
                </div>
              </div>
            ) : (
              <div className="ft">
                <span>Read-only. We never place orders.</span>
                <button type="button" data-k="ask" onClick={() => setConfirm(true)}>
                  Disconnect
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <h3>
              {k.kind === 'out'
                ? 'Kite is disconnected'
                : k.kind === 'new'
                  ? 'Connect Kite to start'
                  : k.expired
                    ? 'Kite session expired'
                    : 'Reconnect to start today'}
            </h3>
            <div className="sub">{k.description}</div>
            {k.failed ? (
              <p className="ac8-error" role="alert">
                Kite didn’t reconnect. Try again to start a fresh login.
              </p>
            ) : null}
            <button type="button" className="go" data-k="connect" disabled={k.waiting} onClick={onConnect}>
              {k.waiting ? (
                <>
                  <span className="sp8" />
                  Finish in Kite’s window
                </>
              ) : (
                <>
                  <Kite />
                  {k.failed
                    ? 'Try again'
                    : k.kind === 'out' || k.kind === 'new'
                      ? 'Connect Kite'
                      : 'Reconnect Kite'}
                </>
              )}
            </button>
            <div className="ft">
              <span>{k.waiting ? 'Takes about 10 seconds' : k.waitingNote}</span>
              {k.waiting ? (
                <button type="button" data-k="cancel" onClick={onCancelConnect}>
                  Cancel
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    );

  return (
    <div
      className={`pf8s${open ? ' is-on' : ''}`}
      id="pf8s"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pf8" id="pf8" role="dialog" aria-modal="true" aria-label="Your account" ref={root}>
        {view === 'main' ? (
          <>
            <div className="me8">
              <span className="av8">{email.slice(0, 1).toUpperCase()}</span>
              <div>
                <small>Signed in as</small>
                <b>{email}</b>
              </div>
              <button type="button" className="x8" data-k="close" aria-label="Close" onClick={onClose}>
                <Icon name="close" />
              </button>
            </div>
            {hero}
            {u ? (
              <div className={`us8${u.low ? ' low' : ''}`}>
                <div className="tp">
                  <span>
                    {u.watchersPct === undefined ? 'Chat credits this month' : 'Token usage this month'}
                  </span>
                  <em>resets {u.resetLabel}</em>
                </div>
                <div className="big">
                  {u.usedPct}%<small>used</small>
                </div>
                <div
                  className="mt"
                  role="img"
                  aria-label={
                    u.watchersPct === undefined
                      ? `${u.usedPct}% of monthly chat credits used`
                      : `${u.usedPct}% used: chats ${u.chatsPct}%, watchers ${u.watchersPct}%`
                  }
                >
                  <i className="c" style={{ width: `${u.chatsPct}%` }} />
                  {u.watchersPct !== undefined ? (
                    <i className="w" style={{ width: `${u.watchersPct}%` }} />
                  ) : null}
                </div>
                <div className="lg">
                  <span>
                    <i />
                    Chats <b>{u.chatsPct}%</b>
                  </span>
                  {u.watchersPct !== undefined ? (
                    <span>
                      <i className="w" />
                      Watchers <b>{u.watchersPct}%</b>
                    </span>
                  ) : null}
                </div>
                {u.lowNote ? <p className="nt">{u.lowNote}</p> : null}
              </div>
            ) : (
              <div className="us8" role="status">
                Chat credits unavailable.
              </div>
            )}
            <button type="button" className="rw8" data-k="mcp" onClick={() => setView('mcp')}>
              <Icon name="plug" />
              <span>Use in Claude or ChatGPT</span>
              <Icon name="arrow" />
            </button>
            <button type="button" className="rw8 so" data-k="out" disabled={signingOut} onClick={onSignOut}>
              <Icon name="out" />
              <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </>
        ) : (
          <>
            <div className="bk8">
              <button type="button" data-k="back" aria-label="Back" onClick={() => setView('main')}>
                <Icon name="back" />
              </button>
              <b>Use /markets in another app</b>
            </div>
            <div className="tb8" role="tablist">
              {(['claude', 'gpt'] as const).map((t) => (
                <button
                  type="button"
                  role="tab"
                  data-k="tab"
                  data-v={t}
                  className={t === tab ? 'is-on' : undefined}
                  aria-selected={t === tab}
                  tabIndex={t === tab ? 0 : -1}
                  key={t}
                  onClick={() => setTab(t)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      const next = t === 'claude' ? 'gpt' : 'claude';
                      setTab(next);
                      root.current?.querySelector<HTMLButtonElement>(`[data-v="${next}"]`)?.focus();
                    }
                  }}
                >
                  {t === 'claude' ? 'Claude' : 'ChatGPT'}
                </button>
              ))}
            </div>
            {tab === 'claude' ? (
              <ol className="stp8">
                <li>
                  <div>
                    Copy this link.
                    <div className="cp8">
                      <code>{connectorUrl}</code>
                      <button type="button" data-k="copy" onClick={() => void copy()}>
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </li>
                <li>
                  <div>
                    In Claude, open <b>Settings → Connectors</b> and add it.
                  </div>
                </li>
                <li>
                  <div>
                    Sign in with <b>{email}</b>. {connectorNote}
                  </div>
                </li>
              </ol>
            ) : (
              <div className="so8">
                <b>{chatGpt.title}</b>
                {chatGpt.description}
              </div>
            )}
          </>
        )}
        {error ? (
          <p className="ac8-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
