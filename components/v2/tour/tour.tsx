'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Word } from '@/components/v2/chat/brand';
import { TOUR_MARKETS, TOUR_MARKET_IDS, type TourMarket } from '@/lib/v2/tour';
import { AnswerDemo, AskDemo, TourQuestion, WatchDemo } from './tour-demo';
import { TourDepth } from './tour-depth';

const SCREENS = [
  { name: 'Ask', title: 'Ask in your own words', body: 'Any NSE stock, index, F&O or MCX contract. English or Hinglish.' },
  { name: 'Answer', title: 'Get the answer, and the code', body: <>It runs code on the candles and shows what it read. Tap <b>Code</b> to check the maths.</> },
  { name: 'Watch', title: 'Make it a watcher', body: 'Any answer can become a watcher. It keeps checking after you close the chat, and emails you when it hits.' },
] as const;

export function Tour({ question, initialMarkets, onFinish, sample, saving, error }: {
  readonly question: string;
  readonly initialMarkets: readonly TourMarket[];
  readonly onFinish: (markets: TourMarket[], connect: boolean) => void;
  readonly sample?: boolean;
  readonly saving?: boolean;
  readonly error?: string;
}) {
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<TourMarket[]>(() => [...initialMarkets]);
  const [pick, setPick] = useState<{ market: TourMarket; n: number }>();
  const dialog = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLHeadingElement>(null);
  const screen = SCREENS[step];
  const last = step === SCREENS.length - 1;

  useEffect(() => {
    copy.current?.focus({ preventScroll: true });
    dialog.current?.scrollTo(0, 0);
  }, [step]);

  const finish = (connect = false) => {
    if (!saving) onFinish(picks, connect);
  };
  const next = () => {
    if (last) finish(true);
    else setStep(step + 1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish();
    } else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement))) {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft' && step > 0) {
      e.preventDefault();
      setStep(step - 1);
    } else if (e.key === 'Tab') {
      const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const edge = e.shiftKey ? buttons.at(0) : buttons.at(-1);
      const other = e.shiftKey ? buttons.at(-1) : buttons.at(0);
      if (document.activeElement === edge || (e.shiftKey && document.activeElement === copy.current)) {
        e.preventDefault();
        other?.focus();
      }
    }
  };

  const toggle = (market: TourMarket) => {
    const wasPicked = picks.includes(market);
    setPicks(wasPicked ? picks.filter((m) => m !== market) : [...picks, market]);
    if (!wasPicked) setPick({ market, n: Date.now() });
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: the overlay needs the prototype's grid layout and launch animation
    <div aria-label="Welcome to /markets" aria-modal="true" className="onb on" id="onb" onKeyDown={onKeyDown} ref={dialog} role="dialog">
      <TourDepth />
      <div className="ob-top">
        <div className="lg"><Word /></div>
        <div aria-label={`Step ${step + 1} of 3`} className="segs" id="segs">
          {SCREENS.map(({ name }, i) => <i className={i <= step ? 'on' : undefined} key={name}><b /></i>)}
        </div>
        <button className="ob-skip" disabled={saving} id="obskip" onClick={() => finish()} type="button">Skip</button>
      </div>
      <div className="ob-main" id="obmain">
        <div className="ob-copy" key={screen.name}>
          <div className="eb"><b>0{step + 1}</b> / 03 · {screen.name}</div>
          <h1 ref={copy} tabIndex={-1}>{screen.title}</h1>
          <p>{screen.body}</p>
          {step === 0 && <div className="picks">
            <small>What do you trade? Pick any.</small>
            <div id="picks">{TOUR_MARKET_IDS.map((market) => (
              <button aria-pressed={picks.includes(market)} className={picks.includes(market) ? 'on' : undefined} disabled={saving} key={market} onClick={() => toggle(market)} type="button">
                <i aria-hidden="true">✓</i>{TOUR_MARKETS[market].label}
              </button>
            ))}</div>
          </div>}
          {question && <TourQuestion question={question} label="runs after Kite" sample={sample} />}
          {last && <p className="gate"><i />{question ? 'Connect Kite and your question runs first.' : 'Asking and watching run on your Kite login.'} Read-only. It never places orders.</p>}
          <div className="ob-act">
            {step > 0 && <button className="bk" disabled={saving} id="bk" onClick={() => setStep(step - 1)} type="button">Back</button>}
            <button className="go" disabled={saving} id="nx" onClick={next} type="button">{saving ? 'Saving…' : last ? 'Connect Kite' : 'Continue'}</button>
            {last ? <button className="bk" disabled={saving} id="nn" onClick={() => finish()} type="button">Not now</button> : <span className="kb"><kbd>Enter</kbd></span>}
          </div>
          {error && <p className="tour-error" role="alert">{error}</p>}
        </div>
        <div className={`ob-stage s${step}`} id="stage" key={step}>
          {step === 0 ? <AskDemo pick={pick} picks={picks} sample={sample} /> : step === 1 ? <AnswerDemo example={Boolean(question)} sample={sample} /> : <WatchDemo sample={sample} />}
        </div>
      </div>
    </div>
  );
}
