import type { WatchSummary } from '@/lib/server/watches';

/**
 * A watcher as the v2 Watchers screen shows it (markets-hero
 * ux/flows/watchers/flow.js). Pure: built from the API summary, so the lab
 * fixtures and the real list render through the same code.
 *
 * What the prototype had as fields and the MCP does not store is read from
 * what it does store: the level and its direction from the rule text
 * ("… below 2,912"), "true now" from the last check, "from which chat" from
 * eve.watcher_links. Nothing is guessed when the text doesn't say.
 */

export type W8Status = 'watching' | 'met' | 'paused' | 'error' | 'expired' | 'cancelled';

export interface W8Alert {
  at: string;
  /** "Today 14:05" · "Yesterday 15:30" · "19 Nov 10:32" (IST). */
  when: string;
  isToday: boolean;
  what: string;
  value: string | null;
  emailed: boolean;
}

export interface W8 {
  id: string;
  sym: string;
  ex: string;
  st: W8Status;
  /** Paused because the Kite session ended (not by the user). */
  kitePaused: boolean;
  rule: string;
  every: string;
  /** "25 Dec". */
  ends: string;
  /** For finished watchers: when it expired / was cancelled ("24 Nov"). */
  ended: string;
  now: string | null;
  lastChecked: string;
  /** Created moments ago and not checked on schedule yet. */
  started: boolean;
  /** "14:45": the next check after the creation dry run. */
  firstCheck: string | null;
  level: number | null;
  direction: 'below' | 'above' | null;
  error: string | null;
  metSince: string | null;
  alerts: W8Alert[];
  script: string;
  threadId: string | null;
  chat: string | null;
}

export const LIVE = (w: Pick<W8, 'st'>): boolean => w.st !== 'expired' && w.st !== 'cancelled';
export const STATUS_LABEL: Record<W8Status, string> = { watching: 'Watching', met: 'True now', paused: 'Paused', error: 'Stopped', expired: 'Expired', cancelled: 'Cancelled' };

const STARTED_WINDOW_MS = 10 * 60 * 1000;
const IST = 'Asia/Kolkata';

const istDay = (d: Date): string => d.toLocaleDateString('en-CA', { timeZone: IST });
const hm = (d: Date): string => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST });
const dayMonth = (d: Date): string => `${Number(d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: IST }))} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: IST })}`;

/** "Today 14:05" / "Yesterday 15:30" / "19 Nov 10:32". */
export function whenText(iso: string, now = new Date()): { text: string; isToday: boolean } {
  const d = new Date(iso);
  const today = istDay(now);
  const yesterday = istDay(new Date(now.getTime() - 864e5));
  if (istDay(d) === today) return { text: `Today ${hm(d)}`, isToday: true };
  if (istDay(d) === yesterday) return { text: `Yesterday ${hm(d)}`, isToday: false };
  return { text: `${dayMonth(d)} ${hm(d)}`, isToday: false };
}

export function everyText(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440} day`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour`;
  return `${minutes} min`;
}

/** The level and its direction, when the rule says them ("… below 2,912", "… above 70"). */
export function levelOf(rule: string): { level: number; direction: 'below' | 'above' } | null {
  const m = /\b(below|under|drops? below|falls? (?:under|below)|above|over|crosses above|goes above)\s+(?:₹\s*)?([\d,]+(?:\.\d+)?)/i.exec(rule);
  if (!m) return null;
  const level = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(level)) return null;
  return { level, direction: /below|under/i.test(m[1]) ? 'below' : 'above' };
}

const splitSymbol = (symbol: string, market: string): { sym: string; ex: string } => {
  const i = symbol.indexOf(':');
  return i > 0 ? { sym: symbol.slice(i + 1), ex: symbol.slice(0, i) } : { sym: symbol, ex: market };
};

export function toW8(w: WatchSummary, now = new Date()): W8 {
  const { sym, ex } = splitSymbol(w.symbol, w.market);
  const st: W8Status =
    w.status === 'ARMED' ? (w.lastMet ? 'met' : 'watching') : w.status === 'PAUSED' ? 'paused' : w.status === 'ERROR' ? 'error' : w.status === 'EXPIRED' ? 'expired' : 'cancelled';
  const created = new Date(w.createdAt).getTime();
  const started = st === 'watching' && w.alertCount === 0 && now.getTime() - created < STARTED_WINDOW_MS;
  const lvl = levelOf(w.label);
  const firstCheck = started && w.lastCheckedAt ? hm(new Date(new Date(w.lastCheckedAt).getTime() + w.checkEveryMinutes * 6e4)) : null;
  return {
    id: w.id,
    sym,
    ex,
    st,
    kitePaused: w.status === 'PAUSED' && w.pausedBy === 'broker',
    rule: w.label,
    every: everyText(w.checkEveryMinutes),
    ends: dayMonth(new Date(w.expiresAt)),
    ended: w.status === 'CANCELLED' ? dayMonth(new Date(w.updatedAt)) : dayMonth(new Date(w.expiresAt)),
    now: w.lastValue,
    lastChecked: w.lastCheckedAt ? whenText(w.lastCheckedAt, now).text.replace(/^Today /, '') : '—',
    started,
    firstCheck,
    level: lvl?.level ?? null,
    direction: lvl?.direction ?? null,
    error: w.status === 'ERROR' ? (w.statusReason ?? w.lastError ?? 'The script failed.') : null,
    metSince: st === 'met' && w.lastAlertAt ? hm(new Date(w.lastAlertAt)) : null,
    alerts: w.recentAlerts.map((a) => {
      const t = whenText(a.at, now);
      return { at: a.at, when: t.text, isToday: t.isToday, what: a.detail || w.label, value: a.value, emailed: a.emailed !== false };
    }),
    script: w.script,
    threadId: w.threadId,
    chat: w.threadTitle,
  };
}

/** Digits a value shows with: the level's decimals, else the value's own. */
const decimalsOf = (s: string): number => (s.includes('.') ? s.split('.')[1].length : 0);

export const fmtNum = (n: number, d: number): string => n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

/** "0.18 below your level", when both the value and the level are known. */
export function gapText(w: W8): string | null {
  if (w.now === null || w.level === null) return null;
  const v = Number(String(w.now).replace(/,/g, ''));
  if (!Number.isFinite(v)) return null;
  const d = decimalsOf(String(w.now));
  return `${fmtNum(Math.abs(v - w.level), d)} ${v > w.level ? 'above' : 'below'} your level`;
}

/** The big number, formatted like the prototype (Indian grouping, the value's own decimals). */
export function bigNumber(w: W8): string {
  if (w.now === null) return '—';
  const v = Number(String(w.now).replace(/,/g, ''));
  return Number.isFinite(v) ? fmtNum(v, decimalsOf(String(w.now))) : String(w.now);
}
