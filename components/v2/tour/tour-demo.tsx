'use client';

import { useEffect, useRef, useState } from 'react';
import { TOUR_EXAMPLE, TOUR_MARKETS, TOUR_MARKET_IDS, type TourMarket } from '@/lib/v2/tour';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = () => new Date().toTimeString().slice(0, 8);
const price = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const yes = (base: string, on: boolean) => on ? base + ' on' : base;

function useTimeline(run: (later: (fn: () => void, ms: number) => void) => void) {
  useEffect(() => {
    const timers = new Set<number>();
    run((fn, ms) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    });
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [run]);
}

export function AskDemo({ picks, pick, sample }: {
  readonly picks: readonly TourMarket[];
  /** The market just picked: its first question runs at once (prototype `askRun(ASKS[m][0])`). Unpicking changes nothing. */
  readonly pick?: { market: TourMarket; n: number };
  readonly sample?: boolean;
}) {
  const [typing, setTyping] = useState('');
  const [rows, setRows] = useState<{ question: string; symbol: string; time: string }[]>([]);
  const next = useRef(0);
  const picksRef = useRef(picks);
  picksRef.current = picks;
  // A pick is an event: it forces a question only when it happens, not again when the
  // screen re-mounts (Back → screen 1 starts from the pool like the prototype's render()).
  const seenPick = useRef(pick?.n);

  useEffect(() => {
    let timer: number;
    const still = reducedMotion();
    const forcedPick = pick && pick.n !== seenPick.current ? pick.market : undefined;
    seenPick.current = pick?.n;
    const run = (forced?: TourMarket) => {
      const markets = picksRef.current.length ? picksRef.current : TOUR_MARKET_IDS;
      const pool = [...markets.map((m) => TOUR_MARKETS[m].asks[0]), ...markets.map((m) => TOUR_MARKETS[m].asks[1])];
      const index = next.current;
      const [question, symbol] = forced ? TOUR_MARKETS[forced].asks[0] : pool[index % pool.length];
      setTyping('');
      const done = () => {
        // The pool advances when the bubble lands, so a cancelled first run (dev double effect) replays the same question.
        if (!forced) next.current = index + 1;
        setRows((prev) => [...prev.slice(-2), { question, symbol, time: clock() }]);
        setTyping('');
        timer = window.setTimeout(() => run(), 1500);
      };
      if (still) {
        // Through a timer, so React's dev double effect run appends the bubble once.
        timer = window.setTimeout(done, 0);
        return;
      }
      let letter = 0;
      const type = () => {
        setTyping(question.slice(0, ++letter));
        timer = letter >= question.length ? window.setTimeout(done, 350) : window.setTimeout(type, 34);
      };
      timer = window.setTimeout(type, 34);
    };
    run(forcedPick);
    return () => window.clearTimeout(timer);
  }, [pick]);

  return <>
    <div className="sbar"><i />Chat<span id="aclk">{sample ? 'Sample demo' : ''}</span></div>
    <div className="sbd">
      <div className="qs" id="qs">
        {rows.map(({ question, symbol, time }, index) => (
          <div className="qi" key={`${time}-${question}-${index}`}><span>{question}</span><small><i />understood as <b>{symbol}</b><em> · {time}</em></small></div>
        ))}
      </div>
      <div className="mc"><span id="atx">{typing}</span><i className="caret" /></div>
    </div>
  </>;
}

export function AnswerDemo({ example, sample }: { readonly example: boolean; readonly sample?: boolean }) {
  const [stage, setStage] = useState(0);
  const [code, setCode] = useState(false);
  const [still, setStill] = useState(false);
  const timeline = useRef((later: (fn: () => void, ms: number) => void) => {
    if (reducedMotion()) {
      setStill(true);
      setStage(4);
      setCode(true);
      return;
    }
    const cycle = () => {
      setStage(1);
      setCode(false);
      later(() => setStage(2), 700);
      later(() => setStage(3), 1500);
      later(() => setStage(4), 1900);
      later(() => setCode(true), 3200);
      later(cycle, 9100);
    };
    cycle();
  }).current;
  useTimeline(timeline);

  return <>
    <div className="sbar"><i />{sample ? 'Sample run' : example ? 'Example run' : 'Run'}<span>{TOUR_EXAMPLE}</span></div>
    <div className="sbd">
      <div className="log" id="log">
        <div className={stage >= 2 ? 'ok' : undefined}><i /><span>Reading RELIANCE daily candles · 1,240 rows</span><em>{stage >= 2 && '✓'}</em></div>
        {stage >= 2 && !still && <div className={stage >= 3 ? 'ok' : undefined}><i /><span>Running support_levels(df, touches=3)</span><em>{stage >= 3 && '180 ms'}</em></div>}
      </div>
      <div className={yes('ans', stage >= 3)} id="ans" aria-hidden={stage < 3}>Support at <b>1,386 – 1,392</b>. Price held there 4 times since 3 Nov.</div>
      <div className={yes('rc2', stage >= 4)} id="rc2" aria-hidden={stage < 4}>
        <span>Read here <b>1,240 rows</b></span><span className="to">Sent to your agent <b>~60 tokens</b></span><span>{sample ? 'Example data' : '15 min delay'}</span><span className="sp" />
        <button aria-expanded={code} className={code ? 'on' : undefined} disabled={stage < 4} id="cbtn" onClick={() => setCode(!code)} type="button">Code</button>
      </div>
      <pre aria-hidden={!code} className={yes('code', code)} id="code">{'df = candles('}<i className="s">"RELIANCE"</i>{', '}<i className="s">"1d"</i>{', since='}<i className="s">"2025-01-01"</i>{')\nlv = support_levels(df, touches=3)\nlv.head(1)   '}<i className="c"># 1,386 – 1,392 · 4 touches</i></pre>
    </div>
  </>;
}

const WATCH_LEVEL = 1386;
const WATCH_POINTS = 48;
const y = (p: number) => ((1404 - p) / 26) * 100;

export function WatchDemo({ sample }: { readonly sample?: boolean }) {
  const [view, setView] = useState({ points: [] as number[], checks: 214, hit: false, mail: false, time: '' });
  // The first walk survives Strict Mode's dev-only double effect run (see TourDepth).
  const first = useRef<number[]>(null);
  const timeline = useRef((later: (fn: () => void, ms: number) => void) => {
    const walk = () => {
      let value = 1398;
      return Array.from({ length: WATCH_POINTS }, () => {
        value += (Math.random() - 0.5) * 1.4;
        return Math.max(1389, Math.min(1402, value));
      });
    };
    const reset = (start?: number[]) => {
      let points = start ?? walk();
      let checks = 214;
      setView({ points, checks, hit: false, mail: false, time: clock() });
      const step = () => {
        const value = points[WATCH_POINTS - 1] - 0.55 + Math.random() * 0.7;
        points = [...points.slice(1), value];
        const hit = value < WATCH_LEVEL;
        setView({ points, checks: ++checks, hit, mail: false, time: clock() });
        if (hit) {
          later(() => setView((prev) => ({ ...prev, mail: true })), 350);
          later(reset, 4200);
        } else {
          later(step, 300);
        }
      };
      if (!reducedMotion()) later(step, 300);
    };
    reset((first.current ??= walk()));
  }).current;
  useTimeline(timeline);
  const last = view.points.at(-1);
  const color = view.hit ? 'var(--mint)' : 'var(--ink)';

  return <>
    <div className="sbar"><i />{sample ? 'Sample watcher' : 'Watcher'}<span>every minute · emails you</span></div>
    <div className="sbd">
      <div className="wc"><div className="wt">RELIANCE falls below <b>1,386</b></div><span className="wn">checks today {view.checks}</span>
        <div className={view.hit ? 'ws hit' : 'ws'}><i /><span>{view.hit && last !== undefined ? `hit at ${price(last)} · ${view.time}` : `watching · checked ${view.time}`}</span></div>
      </div>
      <div className="wch">
        <svg aria-hidden="true" viewBox="0 0 300 100" preserveAspectRatio="none">
          <line x1="0" x2="300" y1={y(WATCH_LEVEL)} y2={y(WATCH_LEVEL)} stroke="var(--peach)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <polyline points={view.points.map((p, i) => `${(i / (WATCH_POINTS - 1) * 300).toFixed(1)},${y(p).toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeOpacity=".85" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {last !== undefined && <circle cx="300" cy={y(last)} r="3" fill={color} />}
        </svg>
        <span className="lv" style={{ top: `${y(WATCH_LEVEL)}%` }}>your level 1,386</span>
      </div>
      <div aria-hidden={!view.mail} className={yes('mail', view.mail)}>✉ {sample ? 'Example email' : 'Email sent'} · RELIANCE fell below 1,386<small>{view.mail && view.time}</small></div>
    </div>
  </>;
}

const QUOTES: Record<string, readonly [string, number]> = {
  RELIANCE: ['NSE', 1412.35], NIFTY: ['NSE', 25768.40], BANKNIFTY: ['NSE', 58210.15],
  CRUDE: ['MCX', 5412], GOLD: ['MCX', 126450], HDFCBANK: ['NSE', 1986.20], TCS: ['NSE', 3120.10],
};

const walking: { symbol?: string; price: number } = { price: 0 };

export function TourQuestion({ question, label, sample }: { readonly question: string; readonly label: string; readonly sample?: boolean }) {
  const symbol = question.toUpperCase().match(/\b(BANK NIFTY|BANKNIFTY|RELIANCE|HDFC BANK|HDFCBANK|NIFTY|CRUDE|GOLD|TCS)\b/)?.[0].replace(' ', '');
  const quote = symbol ? QUOTES[symbol] : undefined;
  const [tick, setTick] = useState({ time: '', price: 0 });

  useEffect(() => {
    if (!quote) return;
    if (walking.symbol !== symbol) Object.assign(walking, { symbol, price: quote[1] });
    setTick({ time: clock(), price: walking.price });
    if (reducedMotion()) return;
    const id = window.setInterval(() => {
      walking.price *= 1 + (Math.random() - 0.48) * 0.0006;
      setTick({ time: clock(), price: walking.price });
    }, 1300);
    return () => window.clearInterval(id);
  }, [quote, symbol]);

  const value = quote ? tick.price || quote[1] : 0;
  const change = quote ? (value / (quote[1] * (1 - 0.0031)) - 1) * 100 : 0;

  return <div className="qcard">
    <div className="qh"><i className="dot" />Your question<span className="st">{label}</span></div>
    <span>{question}</span>
    {quote && <div className="tick">
      <span>{symbol} · {quote[0]}</span><b className="flash" key={tick.time}>{price(value)}</b>
      <span className={change >= 0 ? 'up' : 'dn'}>{change >= 0 ? '▲' : '▼'}{Math.abs(change).toFixed(2)}%</span>
      <span className="dl">{sample ? 'Sample quote' : `15m delayed · ${tick.time}`}</span>
    </div>}
  </div>;
}
