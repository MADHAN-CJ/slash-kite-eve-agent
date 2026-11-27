/**
 * The Zerodha login as the Connect Kite dialog sees it (plan-v2 D11,
 * markets-hero ux/flows/connect-kite): Kite opens in a pop-up window, this
 * tab watches — the callback page reports through a BroadcastChannel, the
 * connection status is polled as a fallback, a closed window before the
 * login finished is `fail`, a window the browser refused is `blocked`, and
 * five minutes without a result is `timeout`. A reducer holds the mode so
 * the dialog and the tests share one state machine.
 */

export const KITE_LOGIN_CHANNEL = 'kite-login';
export const LOGIN_TIMEOUT_S = 300;
export const POLL_MS = 2500;
export const POPUP_FEATURES = 'popup=yes,width=460,height=640';

export type KiteLoginMessage = { outcome: 'connected' } | { outcome: 'error'; reason: string };

export type KiteMode = 'connect' | 'faq' | 'wait' | 'fail' | 'blocked' | 'timeout' | 'done';

export type KiteEvent =
  | { type: 'open' }
  | { type: 'faq' }
  | { type: 'back' }
  | { type: 'start'; opened: boolean }
  | { type: 'tick'; secondsLeft: number }
  | { type: 'connected' }
  | { type: 'window-closed' }
  | { type: 'report-blocked' }
  | { type: 'error'; reason: string }
  | { type: 'cancel' };

export interface KiteState {
  mode: KiteMode;
  secondsLeft: number;
  /** The last error from Kite's side, shown under the steps. */
  reason?: string;
}

export const initialKite: KiteState = { mode: 'connect', secondsLeft: LOGIN_TIMEOUT_S };

export function kiteReducer(s: KiteState, e: KiteEvent): KiteState {
  switch (e.type) {
    case 'open':
      // Reopening during an interrupted attempt goes back to Connect; Done stays until it closes itself.
      return s.mode === 'done' ? s : { mode: 'connect', secondsLeft: LOGIN_TIMEOUT_S };
    case 'faq':
      return { ...s, mode: 'faq' };
    case 'back':
      return { ...s, mode: 'connect' };
    case 'start':
      return e.opened ? { mode: 'wait', secondsLeft: LOGIN_TIMEOUT_S } : { mode: 'blocked', secondsLeft: LOGIN_TIMEOUT_S };
    case 'tick':
      if (s.mode !== 'wait') return s;
      return e.secondsLeft <= 0 ? { ...s, mode: 'timeout', secondsLeft: 0 } : { ...s, secondsLeft: e.secondsLeft };
    case 'connected':
      return { ...s, mode: 'done' };
    case 'window-closed':
      return s.mode === 'wait' ? { ...s, mode: 'fail' } : s;
    case 'report-blocked':
      return s.mode === 'wait' ? { ...s, mode: 'blocked' } : s;
    case 'error':
      return s.mode === 'wait' ? { ...s, mode: 'fail', reason: e.reason } : s;
    case 'cancel':
      return { mode: 'connect', secondsLeft: LOGIN_TIMEOUT_S };
  }
}

export interface PopupHandle {
  /** The window the browser gave us, or null when it refused (blocked). */
  readonly opened: boolean;
  readonly closed: () => boolean;
  readonly close: () => void;
  readonly focus: () => void;
}

/** Opens Kite in a pop-up. Call it from the click handler, or browsers block it. */
export function openKiteWindow(url: string): PopupHandle {
  const w = window.open(url, 'kite-login', POPUP_FEATURES);
  if (!w) return { opened: false, closed: () => true, close: () => {}, focus: () => {} };
  return {
    opened: true,
    closed: () => w.closed,
    close: () => {
      try {
        w.close();
      } catch {
        // cross-origin window already gone
      }
    },
    focus: () => {
      try {
        w.focus();
      } catch {
        // nothing to focus
      }
    },
  };
}

/** How much of a day is left until the session ends, and the "14h 32m" text. */
export function untilSix(kiteUntil: Date | null, now = new Date()): { frac: number; txt: string } {
  const end = kiteUntil ?? nextSixAm(now);
  const ms = Math.max(0, end.getTime() - now.getTime());
  const h = Math.floor(ms / 36e5);
  const m = Math.floor((ms % 36e5) / 6e4);
  return { frac: Math.min(1, ms / (24 * 36e5)), txt: `${h}h ${String(m).padStart(2, '0')}m` };
}

export function nextSixAm(now = new Date()): Date {
  const s = new Date(now);
  s.setHours(6, 0, 0, 0);
  if (s.getTime() <= now.getTime()) s.setDate(s.getDate() + 1);
  return s;
}

export const fmtCountdown = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
