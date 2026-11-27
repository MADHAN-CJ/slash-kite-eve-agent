import {
  EMPTY_FORM,
  splitSymbol,
  validate,
  type Exchange,
  type Side,
  type TradeForm,
} from '@/lib/client/kite-publisher';

/** The ticket carries its source, never a recommendation from the analyst. */
export interface TradeContext {
  symbol: string;
  exchange?: string;
  from: 'answer' | 'watcher' | 'email';
  label: string;
  rule?: string;
  prefill?: TradeForm;
  /** The v1 parser defaults to BUY; v2 answer links without a side must not. */
  sideExplicit?: boolean;
  quantityExplicit?: boolean;
  productExplicit?: boolean;
}

export interface TradeInstrument {
  key: string;
  symbol: string;
  exchange: Exchange;
  displayName?: string;
  kind: 'equity' | 'future' | 'option';
  lotSize: number;
  tickSize: number;
  expiry: string | null;
  lastPrice: number | null;
  /** The quote's exchange timestamp, not the time this ticket opened. */
  asOf: string | null;
}

export interface TradeMarket {
  instruments: TradeInstrument[];
  /** Only an exact, tradable instrument is selected automatically. */
  selectedKey: string | null;
}

export interface TicketForm {
  side: Side | '';
  quantity: string;
  orderType: 'MARKET' | 'LIMIT';
  product: 'CNC' | 'MIS' | 'NRML';
  price: string;
}

/** Preserve the prototype's Buy preselection for a watcher looking for a drop.
 * Other rules, including RSI and PCR thresholds, do not imply a side. */
export function watcherSide(rule: string): Side | '' {
  if (/\b(?:rsi|pcr|put.?call|volume|open interest|\boi\b)\b/i.test(rule)) return '';
  return /\b(?:price\s+)?(?:drops?|falls?)\s+(?:below|under)|\b(?:candle|price)\s+closes?\s+(?:below|under)/i.test(
    rule,
  )
    ? 'BUY'
    : '';
}

export function initialTicket(context: TradeContext, instrument: TradeInstrument | null): TicketForm {
  const p = context.prefill;
  const lot = instrument?.lotSize ?? 1;
  const hasQuantity = p && context.quantityExplicit !== false;
  const units = hasQuantity ? Number(p.quantity) : lot;
  return {
    side: p && context.sideExplicit !== false ? p.side : context.rule ? watcherSide(context.rule) : '',
    quantity: hasQuantity ? (lot > 1 ? String(units / lot) : p.quantity) : '1',
    orderType: p?.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
    product:
      p && context.productExplicit !== false && p.product !== 'MTF'
        ? p.product
        : instrument?.kind === 'equity'
          ? 'CNC'
          : 'NRML',
    price: p?.price || (instrument?.lastPrice != null ? String(instrument.lastPrice) : ''),
  };
}

export const badQuantity = (q: string): boolean =>
  !/^\d+$/.test(q) || !Number.isSafeInteger(Number(q)) || Number(q) < 1;
export const badPrice = (f: TicketForm): boolean =>
  f.orderType === 'LIMIT' &&
  (!/^\d*(?:\.\d+)?$/.test(f.price) || !Number.isFinite(Number(f.price)) || Number(f.price) <= 0);

export function ticketEntry(form: TicketForm, instrument: TradeInstrument | null): KitePublisherEntry | null {
  if (!instrument || !form.side || badQuantity(form.quantity) || badPrice(form)) return null;
  const quantity = Number(form.quantity) * instrument.lotSize;
  if (!Number.isSafeInteger(quantity)) return null;
  if (
    instrument.kind === 'equity'
      ? !['CNC', 'MIS'].includes(form.product)
      : !['NRML', 'MIS'].includes(form.product)
  )
    return null;
  const result = validate({
    ...EMPTY_FORM,
    exchange: instrument.exchange,
    tradingsymbol: instrument.symbol,
    side: form.side,
    quantity: String(quantity),
    orderType: form.orderType,
    price: form.price,
    product: form.product,
  });
  return result.ok ? result.entry : null;
}

export const money = (n: number): string =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function orderValue(form: TicketForm, instrument: TradeInstrument | null): string {
  if (!instrument || badQuantity(form.quantity) || badPrice(form)) return '—';
  const price = form.orderType === 'LIMIT' ? Number(form.price) : instrument.lastPrice;
  if (price === null) return '—';
  const units = Number(form.quantity) * instrument.lotSize;
  return `₹${money(units * price)}${instrument.lotSize > 1 ? ` · ${units} units` : ''}`;
}

export function ticketSummary(form: TicketForm, instrument: TradeInstrument | null): string {
  return `${form.side === 'SELL' ? 'Sell' : 'Buy'} ${form.quantity}${instrument && instrument.lotSize > 1 ? ' lot' : ''} ${instrument?.displayName ?? instrument?.symbol ?? ''} · ${form.product} · ${form.orderType === 'LIMIT' ? `Limit ${money(Number(form.price) || 0)}` : 'Market'}`;
}

export function normalizedSymbol(context: TradeContext): { exchange: string | undefined; symbol: string } {
  const split = splitSymbol(context.symbol, (context.exchange ?? 'NSE') as Exchange);
  return {
    exchange: context.symbol.includes(':') || context.exchange ? split.exchange : undefined,
    symbol: split.tradingsymbol,
  };
}
