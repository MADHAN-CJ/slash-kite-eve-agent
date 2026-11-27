export const TOUR_EXAMPLE = 'Where’s support on Reliance?';

export const TOUR_MARKETS = {
  eq: {
    label: 'NSE stocks',
    asks: [[TOUR_EXAMPLE, 'NSE · RELIANCE'], ['HDFC Bank 200 DMA se kitna door hai?', 'NSE · HDFCBANK']],
  },
  ix: {
    label: 'Index',
    asks: [['Bank Nifty 20 EMA ke upar close hua?', 'NSE · NIFTY BANK'], ['Nifty ka is hafte ka range kya raha?', 'NSE · NIFTY 50']],
  },
  fo: {
    label: 'F&O',
    asks: [['Nifty 25,800 CE pe OI kahan build ho raha hai?', 'NFO · NIFTY 25800 CE'], ['Bank Nifty PCR aaj kitna hai?', 'NFO · BANKNIFTY options']],
  },
  mcx: {
    label: 'MCX',
    asks: [['Crude mein aaj ka range kya hai?', 'MCX · CRUDEOIL DEC FUT'], ['Gold 15 min pe trend kya hai?', 'MCX · GOLD FEB FUT']],
  },
} as const;

export type TourMarket = keyof typeof TOUR_MARKETS;
export const TOUR_MARKET_IDS = Object.keys(TOUR_MARKETS) as TourMarket[];

export function tourStarters(picks: readonly TourMarket[]) {
  const markets = picks.length ? picks : (['eq', 'mcx', 'fo'] as const);
  return ['Surprise me with what you can do', ...markets.slice(0, 3).map((market) => TOUR_MARKETS[market].asks[0][0])];
}

export function isTourMarket(value: unknown): value is TourMarket {
  return typeof value === 'string' && Object.hasOwn(TOUR_MARKETS, value);
}

export interface OnboardingState {
  pending: boolean;
  markets: TourMarket[];
}
