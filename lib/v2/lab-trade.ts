import type { TradeContext, TradeInstrument, TradeMarket } from './trade';

/** markets-hero's made-up trade fixtures; never used by the live ticket. */
const gold: TradeInstrument = {
  key: 'NSE:GOLDBEES',
  symbol: 'GOLDBEES',
  exchange: 'NSE',
  kind: 'equity',
  lotSize: 1,
  tickSize: 0.01,
  expiry: null,
  lastPrice: 99.82,
  asOf: '14:32',
};
const reliance: TradeInstrument = { ...gold, key: 'NSE:RELIANCE', symbol: 'RELIANCE', lastPrice: 2948.4 };
const nifty: TradeInstrument = {
  ...gold,
  key: 'NFO:NIFTY26DECFUT',
  symbol: 'NIFTY26DECFUT',
  displayName: 'NIFTY 30 DEC FUT',
  exchange: 'NFO',
  kind: 'future',
  lotSize: 75,
  expiry: '2026-12-30',
  lastPrice: 24265,
};

export function labTrade(state: string): { context: TradeContext; market: TradeMarket } {
  const instrument =
    state === 'fno'
      ? nifty
      : ['answer', 'reliance-watcher', 'invalid-order'].includes(state)
        ? reliance
        : gold;
  const rule = instrument === reliance ? '15-min candle closes below 2,912' : 'Price drops below 100';
  const from = state === 'answer' || state === 'fno' ? 'answer' : state === 'email' ? 'email' : 'watcher';
  const label =
    state === 'fno'
      ? 'Nifty levels for Thursday expiry'
      : state === 'answer'
        ? 'Where’s support on Reliance?'
        : state === 'email'
          ? 'today 14:05'
          : rule;
  return {
    context: {
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      from,
      label,
      rule: from === 'answer' ? undefined : rule,
    },
    market: { instruments: [instrument], selectedKey: instrument.key },
  };
}
