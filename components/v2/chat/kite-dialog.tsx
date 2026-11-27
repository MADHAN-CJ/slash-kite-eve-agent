'use client';

import { useEffect, useRef, useState } from 'react';
import { fmtCountdown, type KiteMode, LOGIN_TIMEOUT_S, untilSix } from '@/lib/v2/kite-login';
import { Mark } from './brand';
import { useFocusTrap } from './use-focus-trap';

/**
 * The Connect Kite dialog (markets-hero ux/flows/connect-kite/flow.js), laid
 * out like a UPI checkout: the summary on the left, the action on the right.
 * Same DOM and class names as the prototype, so `styles/v2/kite.css` applies
 * unchanged. The login itself lives in the hook that owns `mode`.
 */

const STEPS = ['Tap Connect', 'Log in on Kite', 'Back on /markets'] as const;
const FAQ: readonly [string, string][] = [
  ['Does /markets get my password?', "No. You log in on Kite's own page, kite.zerodha.com. Your password is typed only there."],
  ['Can /markets place orders?', "No. It can't place, change or cancel orders, and it can't move money. Nothing in your account changes."],
  ['What does /markets read?', 'Prices, candles and option chains, plus your holdings and positions, so answers can use them.'],
  ['Will I be charged?', 'No. Connecting Kite is free.'],
  ['Why log in again every day?', 'Zerodha ends every session at 6:00 AM. Log in again any time from your profile.'],
  ['Can I disconnect?', 'Yes, any time, from your profile. Your access ends straight away.'],
];
const RING_C = 2 * Math.PI * 42;
const DONE_CLOSE_MS = 2400;

const Kite = () => (
  <svg aria-hidden="true" viewBox="0 0 22 16">
    <path d="M0 8L11 0h11L11 8l11 8H11z" fill="#E8533F" />
    <path d="M11 8l11-8v16z" fill="#C93A26" opacity=".55" />
  </svg>
);
const Lock = () => (
  <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" viewBox="0 0 24 24">
    <rect height="10" rx="2" width="14" x="5" y="11" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
const Check = ({ small }: { readonly small?: boolean }) => (
  <svg fill="none" height={small ? 12 : undefined} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" width={small ? 12 : undefined}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const Cross = () => (
  <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3" viewBox="0 0 24 24">
    <path d="M7 7l10 10M17 7L7 17" />
  </svg>
);
const Shield = () => (
  <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const Chev = () => (
  <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const X = () => (
  <svg className="i" viewBox="0 0 24 24">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const Arrow = () => (
  <svg className="i" fill="none" height="16" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16">
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);

/** A question carried in from the homepage or the gated chat. */
export function QuestionCard({ q, state }: { readonly q: string; readonly state: string }) {
  return (
    <div className="qcard">
      <div className="qh">
        <i className="dot" />
        Your question<span className="st">{state}</span>
      </div>
      <span>{q}</span>
    </div>
  );
}

function BigRing({ cls, frac, children }: { readonly cls?: string; readonly frac: number; readonly children: React.ReactNode }) {
  return (
    <div className={cls ? `c4big ${cls}` : 'c4big'}>
      <svg viewBox="0 0 92 92">
        <circle className="bgc" cx="46" cy="46" r="42" />
        <circle className="fgc" cx="46" cy="46" id="bgr" r="42" strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - frac)} />
      </svg>
      {children}
    </div>
  );
}

type StepStatus = 'ok' | 'now' | 'todo' | 'bad';
function StepList({ st, notes = {} }: { readonly st: readonly StepStatus[]; readonly notes?: Record<number, string> }) {
  const label = (s: string, k: StepStatus) => (s === 'Tap Connect' ? (k === 'bad' ? 'Kite window blocked' : 'Kite window opened') : s === 'Log in on Kite' ? (k === 'bad' ? 'Login not finished' : 'Log in on Kite') : 'Back on /markets');
  return (
    <div className="c4steps">
      {STEPS.map((s, i) => (
        <div className={`is-${st[i]}`} key={s}>
          <i>{st[i] === 'ok' ? <Check /> : st[i] === 'bad' ? <Cross /> : null}</i>
          {label(s, st[i])}
          {notes[i] ? <small>{notes[i]}</small> : null}
        </div>
      ))}
    </div>
  );
}

/** The small browser that plays the three steps (prototype `runPreview`), with its exact timings. */
function Preview() {
  const root = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [draw, setDraw] = useState(false);
  const [press, setPress] = useState<1 | 2 | null>(null);
  const [cur, setCur] = useState<[number, number]>([80, 88]);
  const [curScale, setCurScale] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ids = timers.current;
    const at = (f: () => void, ms: number) => ids.push(window.setTimeout(f, ms));
    const pressBtn = (which: 1 | 2) => {
      setPress(which);
      setCurScale(true);
      at(() => {
        setPress(null);
        setCurScale(false);
      }, 160);
    };
    setId('');
    setPw('');
    setDraw(false);
    if (k === 0) {
      setCur([80, 88]);
      if (rm) return;
      at(() => setCur([52, 70]), 500);
      at(() => pressBtn(1), 1500);
      at(() => setK(1), 2100);
    }
    if (k === 1) {
      setCur([82, 40]);
      if (rm) {
        setId('AB1234');
        setPw('••••••••');
        return;
      }
      'AB1234'.split('').forEach((c, i) => at(() => setId((v) => v + c), 400 + i * 120));
      for (let i = 0; i < 8; i++) at(() => setPw((v) => `${v}•`), 1300 + i * 90);
      at(() => setCur([52, 71]), 2100);
      at(() => pressBtn(2), 3000);
      at(() => setK(2), 3500);
    }
    if (k === 2) {
      setCur([82, 86]);
      requestAnimationFrame(() => requestAnimationFrame(() => setDraw(true)));
      if (rm) return;
      at(() => setK(0), 3800);
    }
    return () => {
      ids.forEach(clearTimeout);
      ids.length = 0;
    };
  }, [k]);

  return (
    <>
      <div className="c4br" id="pv" ref={root}>
        <div className="c4bar">
          <i>
            <b />
            <b />
            <b />
          </i>
          <div className={k === 1 ? 'c4url is-kite' : 'c4url'} id="pvu">
            <Lock />
            <span>{k === 1 ? 'kite.zerodha.com' : 'slash.markets'}</span>
          </div>
        </div>
        <div className="c4pg">
          <svg className="c4cur" style={{ left: `${cur[0]}%`, top: `${cur[1]}%`, transform: curScale ? 'scale(.85)' : undefined }} viewBox="0 0 24 24">
            <path d="M4 2l15 11-6.5 1.2L9.3 21z" fill="#fff" stroke="#12211A" strokeLinejoin="round" strokeWidth="1.6" />
          </svg>
          <div className={k === 0 ? 'c4fr is-on' : 'c4fr'}>
            <h5>Connect Kite to continue</h5>
            <p>Real-time data. Read-only. Free.</p>
            <span className={press === 1 ? 'c4mb is-press' : 'c4mb'} id="pvb1">
              Log in with Kite
            </span>
          </div>
          <div className={k === 1 ? 'c4fr is-on' : 'c4fr'}>
            <div className="c4kite">
              <Kite />
              <h5>Login to Kite</h5>
              <div className="c4fld">
                <small>User ID</small>
                <span id="pvid">{id}</span>
              </div>
              <div className="c4fld">
                <small>Password</small>
                <span id="pvpw">{pw}</span>
              </div>
              <span className={press === 2 ? 'c4kbtn is-press' : 'c4kbtn'} id="pvb2">
                Login
              </span>
              <span className="c4pw">
                <Lock />
                Your password is typed only here, on Kite's page.
              </span>
            </div>
          </div>
          <div className={k === 2 ? 'c4fr is-on' : 'c4fr'}>
            <span className="c4okp">
              <Check small />
              Kite connected
            </span>
            <svg className={draw ? 'c4ln is-draw' : 'c4ln'} id="pvln" viewBox="0 0 300 80">
              <polyline points="0,62 25,58 45,64 70,48 95,52 120,40 140,44 165,30 190,34 215,22 240,26 265,14 300,10" />
            </svg>
            <span className="c4lbl">Nifty 50 · real-time</span>
          </div>
        </div>
      </div>
      <div className="c4pl" id="pvp">
        {STEPS.map((s, i) => (
          <button className={[i === k ? 'is-on' : '', i < k ? 'is-ok' : ''].filter(Boolean).join(' ') || undefined} key={s} onClick={() => setK(i)} type="button">
            <i>{i + 1}</i>
            {s}
          </button>
        ))}
      </div>
      <p className="c4cap">Illustration. Not a real account.</p>
    </>
  );
}

export function KiteDialog({
  open,
  mode,
  secondsLeft,
  pendingQuestion,
  kiteUntil,
  onStart,
  onFaq,
  onBack,
  onCancel,
  onReportBlocked,
  onNotNow,
  onClose,
  onDone,
  onHelp,
}: {
  readonly open: boolean;
  readonly mode: KiteMode;
  readonly secondsLeft: number;
  readonly pendingQuestion: string;
  readonly kiteUntil: Date | null;
  readonly onStart: () => void;
  readonly onFaq: () => void;
  readonly onBack: () => void;
  readonly onCancel: () => void;
  readonly onReportBlocked: () => void;
  readonly onNotNow: () => void;
  readonly onClose: () => void;
  /** The Done screen has shown for its 2.4 s. */
  readonly onDone: () => void;
  readonly onHelp?: () => void;
}) {
  const u = untilSix(kiteUntil);
  const kd = useRef<HTMLDivElement>(null);

  // Done: the card pulses once, then the dialog hands over to the chat.
  useEffect(() => {
    if (mode !== 'done') return;
    const el = kd.current;
    if (el) {
      el.classList.remove('c4pulse');
      void el.offsetWidth;
      el.classList.add('c4pulse');
    }
    const t = window.setTimeout(onDone, DONE_CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [mode, onDone]);

  useFocusTrap(kd, open, '.c4go, .kxb');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode !== 'done') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, mode, onClose]);

  const closeBtn = (
    <button aria-label="Close" className="kxb" onClick={onClose} type="button">
      <X />
    </button>
  );
  const go = (label: string, onClick: () => void, arrow = true) => (
    <button className="c4go" id="kgo" onClick={onClick} type="button">
      {label} {arrow ? <Arrow /> : null}
    </button>
  );
  const bad = mode === 'fail' || mode === 'blocked' || mode === 'timeout';

  return (
    <div aria-label="Connect Kite" aria-modal="true" className={open ? 'kdlg is-on' : 'kdlg'} id="kv" onClick={(e) => e.target === e.currentTarget && mode !== 'done' && onClose()} role="dialog">
      <div className="kd" id="kd" ref={kd}>
        <div className="c4s" id="ks">
          <div className="c4pair">
            <span>
              <Mark />
            </span>
            <em>⇄</em>
            <span>
              <Kite />
            </span>
          </div>
          <h2>Connect Kite</h2>
          <p>Real-time data for your questions.</p>
          <div className="c4sum">
            <div>
              Access<b>Read-only</b>
            </div>
            <div>
              Lasts
              <b>
                <i className="c4ring" style={{ '--p': u.frac } as React.CSSProperties} />
                until 6:00 AM
              </b>
            </div>
            <div>
              Cost<b>Free</b>
            </div>
          </div>
          {pendingQuestion ? <QuestionCard q={pendingQuestion} state="runs after Kite" /> : null}
          <button className="c4safe" id="ksafe" onClick={onFaq} type="button">
            <Shield />
            Is it safe to connect?
          </button>
          <div className="c4ft">Kite Connect is Zerodha's official way for an app to read an account.</div>
        </div>
        <div className="c4a" id="ka">
          {mode === 'connect' ? (
            <>
              {closeBtn}
              <h3>How connecting works</h3>
              {open ? <Preview /> : null}
              {go('Log in with Kite', onStart)}
              <div className="c4fine">Opens kite.zerodha.com in a new window</div>
              <button className="c4safe c4m" id="ksafe2" onClick={onFaq} type="button">
                <Shield />
                Is it safe to connect?
              </button>
            </>
          ) : mode === 'faq' ? (
            <>
              {closeBtn}
              <button className="c4back" id="kbk" onClick={onBack} type="button">
                ‹ How connecting works
              </button>
              <h3>Is it safe to connect?</h3>
              <div className="c4faq">
                {FAQ.map(([q, a], i) => (
                  <details key={q} open={i === 0}>
                    <summary>
                      {q}
                      <Chev />
                    </summary>
                    <p>{a}</p>
                  </details>
                ))}
              </div>
              {go('Log in with Kite', onStart)}
            </>
          ) : mode === 'wait' ? (
            <>
              {closeBtn}
              <div className="c4wait">
                <BigRing frac={secondsLeft / LOGIN_TIMEOUT_S}>
                  <b id="wct">{fmtCountdown(secondsLeft)}</b>
                </BigRing>
                <h3>Log in on Kite's page</h3>
                <p className="c4sub">We opened kite.zerodha.com in a new window. Enter your Kite user ID and password there, not here.</p>
              </div>
              <StepList notes={{ 0: 'done' }} st={['ok', 'now', 'todo']} />
              <p className="c4keep">Keep this screen open. It updates on its own.</p>
              <div className="c4links" style={{ marginTop: 'auto' }}>
                <button id="kc" onClick={onCancel} type="button">
                  Cancel
                </button>
                <button id="kre" onClick={onReportBlocked} type="button">
                  Window didn’t open?
                </button>
              </div>
            </>
          ) : bad ? (
            <>
              {closeBtn}
              <div className="c4wait">
                <BigRing cls="is-bad" frac={1}>
                  <svg className="c4ic" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" viewBox="0 0 24 24">
                    <path d="M7 7l10 10M17 7L7 17" />
                  </svg>
                </BigRing>
                <h3>{mode === 'blocked' ? 'Kite’s window didn’t open' : mode === 'timeout' ? 'Kite login timed out' : "Kite didn't connect"}</h3>
                <p className="c4sub">
                  {mode === 'blocked' ? 'Allow pop-ups for this site, then try again.' : mode === 'timeout' ? 'The login window expired. Try again to start a new login.' : 'The Kite window closed before the login finished.'}
                </p>
              </div>
              <StepList st={mode === 'blocked' ? ['bad', 'todo', 'todo'] : ['ok', 'bad', 'todo']} />
              <div className="c4err" role="status">
                {pendingQuestion ? 'Your question is saved for when you connect.' : 'Nothing was shared. Your Kite account is as it was.'}
              </div>
              {go('Try again', onStart, false)}
              <div className="c4links">
                <button id="kc" onClick={onNotNow} type="button">
                  Not now
                </button>
                <button id="khelp" onClick={onHelp} type="button">
                  Trouble logging in?
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="c4wait">
                <BigRing cls="is-ok" frac={u.frac}>
                  <svg className="c4ic" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6" viewBox="0 0 24 24">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </BigRing>
                <h3>Kite connected</h3>
                <p className="c4sub">Real-time data until 6:00 AM. {u.txt} left.</p>
              </div>
              <StepList st={['ok', 'ok', 'ok']} />
              <p className="c4keep">{pendingQuestion ? 'Running your question now.' : 'Opening chat.'}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
