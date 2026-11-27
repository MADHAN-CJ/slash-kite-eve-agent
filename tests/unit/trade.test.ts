import { describe, expect, it } from 'vitest';
import {
  badPrice,
  badQuantity,
  initialTicket,
  normalizedSymbol,
  orderValue,
  ticketEntry,
  watcherSide,
  type TradeContext,
  type TradeInstrument,
} from '@/lib/v2/trade';

const equity: TradeInstrument = {
  key: 'NSE:RELIANCE',
  symbol: 'RELIANCE',
  exchange: 'NSE',
  kind: 'equity',
  lotSize: 1,
  tickSize: 0.1,
  expiry: null,
  lastPrice: 2948.4,
  asOf: null,
};
const future: TradeInstrument = {
  ...equity,
  key: 'NFO:NIFTY26DECFUT',
  symbol: 'NIFTY26DECFUT',
  exchange: 'NFO',
  kind: 'future',
  lotSize: 65,
  expiry: '2026-12-29',
  lastPrice: 24265,
};
const ctx: TradeContext = { symbol: 'RELIANCE', from: 'answer', label: 'Where is support?' };

describe('the trade ticket', () => {
  it('requires Buy/Sell from an answer and preserves the drop-watcher Buy guess', () => {
    expect(initialTicket(ctx, equity).side).toBe('');
    expect(watcherSide('15-min candle closes below 2,912')).toBe('BUY');
    expect(watcherSide('Price drops below 100')).toBe('BUY');
    expect(watcherSide('RSI drops below 30')).toBe('');
    expect(watcherSide('put-call ratio drops below 1')).toBe('');
    expect(watcherSide('price crosses above 100')).toBe('');
  });
  it('uses the real lot size for the Publisher quantity and indicative value', () => {
    const form = { ...initialTicket(ctx, future), side: 'SELL' as const, quantity: '3' };
    expect(form.product).toBe('NRML');
    expect(ticketEntry(form, future)).toMatchObject({
      exchange: 'NFO',
      tradingsymbol: 'NIFTY26DECFUT',
      quantity: 195,
      transaction_type: 'SELL',
      product: 'NRML',
    });
    expect(orderValue(form, future)).toBe('₹47,31,675.00 · 195 units');
  });
  it('cannot hand off invalid, overflowing, fractional or unresolved quantities', () => {
    const form = { ...initialTicket(ctx, equity), side: 'BUY' as const };
    for (const quantity of ['0', '-1', '1.5', 'NaN', 'Infinity', '1e2', '9007199254740992']) {
      expect(badQuantity(quantity)).toBe(true);
      expect(ticketEntry({ ...form, quantity }, equity)).toBeNull();
    }
    expect(ticketEntry({ ...form, quantity: '9007199254740991' }, future)).toBeNull();
    expect(ticketEntry(form, null)).toBeNull();
    expect(ticketEntry({ ...form, side: '' }, equity)).toBeNull();
    expect(ticketEntry({ ...form, product: 'NRML' }, equity)).toBeNull();
  });
  it('never invents a price when the quote is absent and validates Limit independently', () => {
    const missing = { ...equity, lastPrice: null };
    const form = { ...initialTicket(ctx, missing), side: 'BUY' as const };
    expect(orderValue(form, missing)).toBe('—');
    expect(ticketEntry(form, missing)).toMatchObject({ order_type: 'MARKET' });
    for (const price of ['', '0', '-5', 'Infinity', 'NaN', '1e3'])
      expect(badPrice({ ...form, orderType: 'LIMIT', price })).toBe(true);
    expect(ticketEntry({ ...form, orderType: 'LIMIT', price: '2912.5' }, equity)).toMatchObject({
      order_type: 'LIMIT',
      price: 2912.5,
    });
  });
  it('keeps exact exchange-qualified symbols and interprets deep-link quantity as units', () => {
    expect(normalizedSymbol({ ...ctx, symbol: 'MCX:GOLD26DECFUT' })).toEqual({
      exchange: 'MCX',
      symbol: 'GOLD26DECFUT',
    });
    expect(normalizedSymbol({ ...ctx, symbol: 'NIFTY' })).toEqual({ exchange: undefined, symbol: 'NIFTY' });
    const prefill = {
      exchange: 'NFO' as const,
      tradingsymbol: future.symbol,
      side: 'BUY' as const,
      quantity: '130',
      orderType: 'MARKET' as const,
      product: 'NRML' as const,
      price: '',
      triggerPrice: '',
    };
    const f = initialTicket({ ...ctx, prefill }, future);
    expect(f.quantity).toBe('2');
    expect(ticketEntry(f, future)?.quantity).toBe(130);
    const implicit = initialTicket(
      { ...ctx, prefill, sideExplicit: false, quantityExplicit: false, productExplicit: false },
      future,
    );
    expect(implicit).toMatchObject({ side: '', quantity: '1', product: 'NRML' });
  });
});
