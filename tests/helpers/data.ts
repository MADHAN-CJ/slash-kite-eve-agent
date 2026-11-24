/**
 * Deterministic fixtures and FROM-SCRATCH textbook references for the
 * indicator tests. The references never call zapkite, so a regression in the
 * MCP's library cannot hide behind its own output. Numbers mirror the Python
 * suite in zap-kite-mcp/mcp/tests/indicators so both repos agree.
 */

export type Series = (number | null)[];

export const PRICES: number[] = [
  100, 102, 101, 105, 107, 106, 106, 104, 108, 110,
  109, 111, 115, 113, 112, 116, 118, 117, 119, 121,
  120, 118, 122, 125, 124, 126, 128, 127, 129, 131,
];
export const UP: number[] = Array.from({ length: 30 }, (_, i) => 100 + i);
export const DOWN: number[] = Array.from({ length: 30 }, (_, i) => 130 - i);
export const FLAT: number[] = Array.from({ length: 30 }, () => 100);

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Rising candles: high = close + 1, low = close − 1; optional gap at the midpoint. */
export function candles(n = 30, gap = 0): Candle[] {
  const rows: Candle[] = [];
  let close = 100;
  for (let i = 0; i < n; i++) {
    close += 1 + (i === Math.floor(n / 2) ? gap : 0);
    rows.push({
      time: `2026-10-15T09:${String(15 + i).padStart(2, '0')}:00+05:30`,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100 + 10 * i,
    });
  }
  return rows;
}

export const nonNull = (s: Series): number[] => s.filter((v): v is number => v !== null);

export function refSma(values: number[], period: number): Series {
  return values.map((_, i) =>
    i < period - 1 ? null : values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period,
  );
}

export function refEma(values: number[], period: number): Series {
  const out: Series = values.map(() => null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (values[i] - prev) * k + prev;
    out[i] = prev;
  }
  return out;
}

export function refRsi(values: number[], period: number): Series {
  const out: Series = values.map(() => null);
  if (values.length <= period) return out;
  const deltas = values.slice(1).map((v, i) => v - values[i]);
  const gains = deltas.map((d) => Math.max(d, 0));
  const losses = deltas.map((d) => Math.max(-d, 0));
  let ag = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let al = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const toRsi = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  out[period] = toRsi(ag, al);
  for (let i = period; i < deltas.length; i++) {
    ag = (ag * (period - 1) + gains[i]) / period;
    al = (al * (period - 1) + losses[i]) / period;
    out[i + 1] = toRsi(ag, al);
  }
  return out;
}

export function refMacd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = refEma(values, fast);
  const s = refEma(values, slow);
  const line: Series = values.map((_, i) => (f[i] === null || s[i] === null ? null : (f[i] as number) - (s[i] as number)));
  const start = line.findIndex((v) => v !== null);
  const sig: Series = values.map(() => null);
  if (start >= 0) {
    const dense = refEma(nonNull(line), signal);
    dense.forEach((v, j) => {
      sig[start + j] = v;
    });
  }
  const hist: Series = values.map((_, i) => (line[i] === null || sig[i] === null ? null : (line[i] as number) - (sig[i] as number)));
  return { macd: line, signal: sig, histogram: hist };
}

export function populationStd(window: number[]): number {
  const m = window.reduce((a, b) => a + b, 0) / window.length;
  return Math.sqrt(window.reduce((a, v) => a + (v - m) ** 2, 0) / window.length);
}

export function refBollinger(values: number[], period = 20, mult = 2) {
  const middle = refSma(values, period);
  const upper: Series = values.map(() => null);
  const lower: Series = values.map(() => null);
  middle.forEach((m, i) => {
    if (m === null) return;
    const sd = populationStd(values.slice(i - period + 1, i + 1));
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  });
  return { upper, middle, lower };
}

export function trueRanges(rows: { high: number; low: number; close: number }[]): number[] {
  const tr = [rows[0].high - rows[0].low];
  for (let i = 1; i < rows.length; i++) {
    const { high, low } = rows[i];
    const pc = rows[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - pc), Math.abs(low - pc)));
  }
  return tr;
}

export function refAtr(rows: { high: number; low: number; close: number }[], period = 14): Series {
  const out: Series = rows.map(() => null);
  if (rows.length <= period) return out;
  const tr = trueRanges(rows);
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < rows.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function refVwap(rows: { high: number; low: number; close: number; volume?: number }[]): Series {
  let pv = 0;
  let vol = 0;
  return rows.map((r) => {
    const v = r.volume ?? 0;
    pv += ((r.high + r.low + r.close) / 3) * v;
    vol += v;
    return vol ? pv / vol : null;
  });
}

export function refPctChange(values: number[]): Series {
  return values.map((v, i) => (i === 0 ? null : values[i - 1] ? ((v - values[i - 1]) / values[i - 1]) * 100 : null));
}

/** Black-76 (same formula the MCP uses); used for parity/round-trip references. */
export function black76(kind: 'CE' | 'PE', f: number, k: number, t: number, r: number, sigma: number): number {
  if (t <= 0 || sigma <= 0) {
    const intrinsic = kind === 'CE' ? Math.max(f - k, 0) : Math.max(k - f, 0);
    return Math.exp(-r * Math.max(t, 0)) * intrinsic;
  }
  const st = sigma * Math.sqrt(t);
  const d1 = (Math.log(f / k) + 0.5 * st * st) / st;
  const d2 = d1 - st;
  const df = Math.exp(-r * t);
  return kind === 'CE' ? df * (f * normCdf(d1) - k * normCdf(d2)) : df * (k * normCdf(-d2) - f * normCdf(-d1));
}

export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// Abramowitz–Stegun 7.1.26 (|error| < 1.5e-7) — plenty for parity checks at 1e-4.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** Python source for the shared fixtures (keeps scripts short and identical across files). */
export const PY_DATA = `
import json, zapkite as z
PRICES = ${JSON.stringify(PRICES)}
UP = ${JSON.stringify(UP)}
DOWN = ${JSON.stringify(DOWN)}
FLAT = ${JSON.stringify(FLAT)}
def candles(n=30, gap=0.0):
    rows, close = [], 100.0
    for i in range(n):
        close += 1.0 + (gap if i == n // 2 else 0.0)
        rows.append({"time": "2026-10-15T09:%02d:00+05:30" % (15 + i), "open": close - 0.5, "high": close + 1.0, "low": close - 1.0, "close": close, "volume": 100 + 10 * i})
    return rows
`;
