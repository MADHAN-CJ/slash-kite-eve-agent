'use client';

import { useState } from 'react';
import type { WatcherCard as Card } from '@/lib/v2/answer-model';

/**
 * The watcher confirm card (markets-hero run.js `wCard`): what the agent is
 * about to watch, with the script it wrote, and nothing running until the
 * user taps Start watching (plan-v2 D8 — in this app only). After Start it
 * turns into the "Watching" card with Open Watchers and Trade on Kite.
 */

const HOURS: Record<string, string> = {
  NSE: '09:15 to 15:30',
  BSE: '09:15 to 15:30',
  NFO: '09:15 to 15:30',
  BFO: '09:15 to 15:30',
  CDS: '09:00 to 17:00',
  BCD: '09:00 to 17:00',
  MCX: '09:00 to 23:30',
};

function everyText(m: number): string {
  if (m >= 60 && m % 60 === 0) return `${m / 60} hour${m === 60 ? '' : 's'}`;
  return `${m} min`;
}

function endsText(days: number): string {
  const d = new Date(Date.now() + days * 864e5);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}, in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** The rule with its level in bold ("…closes below <b>2,912</b>"). */
function Rule({ text }: { readonly text: string }) {
  const m = /^(.*\b(?:below|under|above|over)\s+)((?:₹\s*)?[\d,]+(?:\.\d+)?)(.*)$/i.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]}
      <b>{m[2]}</b>
      {m[3]}
    </>
  );
}

export function WatcherConfirmCard({
  card,
  email,
  question,
  disabled,
  onStart,
  onChange,
  onOpenWatchers,
  onTrade,
}: {
  readonly card: Card;
  readonly email?: string;
  /** The user's request, for "Change it". */
  readonly question: string;
  readonly disabled?: boolean;
  readonly onStart: (card: Card) => void;
  readonly onChange: (card: Card, question: string) => void;
  readonly onOpenWatchers: () => void;
  readonly onTrade: () => void;
}) {
  const [code, setCode] = useState(false);
  const i = card.symbol.indexOf(':');
  const sym = i > 0 ? card.symbol.slice(i + 1) : card.symbol;
  const ex = i > 0 ? card.symbol.slice(0, i) : card.market || 'NSE';
  const market = card.market || ex;
  const live = card.state === 'live';
  const cls = ['wc5', live ? 'is-live' : '', code ? 'is-code' : ''].filter(Boolean).join(' ');
  const title = live ? 'Watching' : card.state === 'declined' ? 'Not started' : card.state === 'failed' ? 'Not created' : 'New watcher';

  return (
    <div className={cls} data-q={question}>
      <div className="wh5">
        <span className="wt5">{title}</span>
        <span className="wg5">
          {sym} · {ex}
        </span>
      </div>
      <p className="wr5">
        {sym}: <Rule text={card.label} />
      </p>
      <dl className="wd5">
        <dt>Checks</dt>
        <dd>
          Every {everyText(card.everyMinutes)}
          {/candle/i.test(card.label) ? ', at the candle close' : ''}
          {HOURS[market] ? ` · ${market} hours, ${HOURS[market]}` : ''}
        </dd>
        {card.now ? (
          <>
            <dt>Now</dt>
            <dd>{card.now}</dd>
          </>
        ) : null}
        <dt>Alerts</dt>
        <dd>{email ? `${email}, each time it becomes true` : 'Your email, each time it becomes true'}</dd>
        <dt>Ends</dt>
        <dd>{endsText(card.expiresDays)}</dd>
      </dl>
      <pre className="ws5">{card.script}</pre>
      {card.state === 'pending' ? (
        <div className="wb5">
          <button className="pr5" data-w="start" disabled={disabled || !card.approval} onClick={() => onStart(card)} type="button">
            Start watching
          </button>
          <button data-w="edit" disabled={disabled} onClick={() => onChange(card, question)} type="button">
            Change it
          </button>
          <button data-w="code" onClick={() => setCode((c) => !c)} type="button">
            {code ? 'Hide the script' : 'See the script'}
          </button>
        </div>
      ) : live ? (
        <div className="wb5">
          <a
            className="pr5"
            data-exit="watchers:new"
            href="#watchers"
            onClick={(e) => {
              e.preventDefault();
              onOpenWatchers();
            }}
          >
            Open Watchers
          </a>
          <button data-f5="trade" onClick={onTrade} type="button">
            Trade on Kite
          </button>
        </div>
      ) : null}
      <p className="wn5">
        {card.state === 'pending'
          ? 'The first check only sets a baseline. Pause or cancel it any time on Watchers.'
          : live
            ? 'The first check sets the baseline. You’ll get an email when it becomes true.'
            : card.state === 'declined'
              ? 'Nothing was started. Change the question and send it again.'
              : card.error}
      </p>
    </div>
  );
}

export interface LevelGuess {
  dir: 'above' | 'below';
  lv: number;
  why: string;
}

/** Watch this (run.js `watchFrom`): the levels from the answer's `ui:levels` block, or none. */
export function guessesFrom(text: string): { symbol: string; guesses: LevelGuess[] } | null {
  const m = /```ui:levels\n([\s\S]*?)\n```/.exec(text);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]) as { symbol?: string; levels?: { label?: string; price?: number; kind?: string }[] };
    const guesses = (o.levels ?? [])
      .filter((l) => typeof l.price === 'number')
      .map((l) => ({ dir: l.kind === 'resistance' ? ('above' as const) : ('below' as const), lv: l.price as number, why: (l.label ?? l.kind ?? '').toLowerCase() }));
    return { symbol: o.symbol ?? '', guesses };
  } catch {
    return null;
  }
}

const fmtL = (n: number) => n.toLocaleString('en-IN');
export const watchPrompt = (sym: string, g: LevelGuess) => `Tell me when ${sym} closes ${g.dir} ${fmtL(g.lv)} on the 15-min chart`;

/** The "Watch for" panel above the box (run.js `.wq5`). */
export function WatchPanel({
  guesses,
  picked,
  onPick,
  onOwn,
  onClose,
}: {
  readonly guesses: LevelGuess[];
  readonly picked: number | 'own';
  readonly onPick: (i: number) => void;
  readonly onOwn: () => void;
  readonly onClose: () => void;
}) {
  return (
    <div className="wq5 is-on" id="wq5">
      <div className="wq5h">
        <span>Watch for</span>
        <button aria-label="Close" className="wx5" onClick={onClose} type="button">
          <svg className="i" viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="wq5c">
        {guesses.map((g, i) => (
          <button className={picked === i ? 'is-on' : undefined} data-i={i} key={`${g.dir}${g.lv}`} onClick={() => onPick(i)} type="button">
            Closes {g.dir} <b>{fmtL(g.lv)}</b>
            <small>{g.why}</small>
          </button>
        ))}
        <button className={picked === 'own' ? 'is-on' : undefined} data-own="1" onClick={onOwn} type="button">
          Something else…
        </button>
      </div>
      <p className="wq5n">Change anything in the box, then send. It becomes a watcher only after you say Start.</p>
    </div>
  );
}
