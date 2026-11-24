/**
 * The `@@chart` protocol (plan D10): a script run through the MCP may end its
 * printed output with ONE line `@@chart {json}`. The UI strips that line from
 * the text it shows and renders the JSON as a chart. Anything malformed is
 * ignored — the raw text stays visible, nothing is lost.
 */

export interface ChartCandleRow {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  oi?: number;
}

export interface ChartChainSide {
  last_price?: number;
  oi?: number;
  iv?: number;
  volume?: number;
}

export type ChartSpec =
  | { type: 'candles'; title?: string; interval?: number; rows: ChartCandleRow[] }
  | {
      type: 'option_chain';
      underlying?: string;
      expiry?: string;
      spot: number;
      strikes: { strike: number; ce?: ChartChainSide | null; pe?: ChartChainSide | null }[];
    };

const MARKER = '@@chart ';
const MAX_ROWS = 500;

/** `exit_code=… --- stdout --- … --- stderr --- …` → just the stdout block. */
export function stdoutOf(text: string): string {
  const start = text.indexOf('--- stdout ---');
  if (start < 0) return text;
  const body = text.slice(start + '--- stdout ---'.length);
  const end = body.indexOf('\n--- stderr ---');
  return (end < 0 ? body : body.slice(0, end)).replace(/^\n/, '');
}

/**
 * Split a tool result's text into the visible text and the chart spec (if any).
 * Accepts the raw MCP result string or an already-extracted stdout.
 */
export function extractChartLine(text: string): { text: string; chart: ChartSpec | null } {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    if (!line.startsWith(MARKER)) return { text, chart: null };
    const chart = parseSpec(line.slice(MARKER.length));
    const rest = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n').replace(/\n+$/, '');
    return { text: rest, chart };
  }
  return { text, chart: null };
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function parseSpec(json: string): ChartSpec | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  if (o.type === 'candles' && Array.isArray(o.rows)) {
    const rows: ChartCandleRow[] = [];
    for (const r of o.rows.slice(-MAX_ROWS)) {
      if (!r || typeof r !== 'object') continue;
      const c = r as Record<string, unknown>;
      const open = num(c.open), high = num(c.high), low = num(c.low), close = num(c.close);
      if (typeof c.time !== 'string' || open === undefined || high === undefined || low === undefined || close === undefined) continue;
      rows.push({ time: c.time, open, high, low, close, volume: num(c.volume), oi: num(c.oi) });
    }
    if (rows.length < 2) return null;
    return {
      type: 'candles',
      title: typeof o.title === 'string' ? o.title : undefined,
      interval: num(o.interval),
      rows,
    };
  }

  if (o.type === 'option_chain' && Array.isArray(o.strikes)) {
    const spot = num(o.spot);
    if (spot === undefined) return null;
    const side = (v: unknown): ChartChainSide | undefined => {
      if (!v || typeof v !== 'object') return undefined;
      const s = v as Record<string, unknown>;
      return { last_price: num(s.last_price), oi: num(s.oi), iv: num(s.iv), volume: num(s.volume) };
    };
    const strikes = o.strikes
      .slice(0, MAX_ROWS)
      .map((s) => (s && typeof s === 'object' ? (s as Record<string, unknown>) : null))
      .filter((s): s is Record<string, unknown> => s !== null && num(s.strike) !== undefined)
      .map((s) => ({ strike: num(s.strike) as number, ce: side(s.ce), pe: side(s.pe) }));
    if (strikes.length < 2) return null;
    return {
      type: 'option_chain',
      underlying: typeof o.underlying === 'string' ? o.underlying : undefined,
      expiry: typeof o.expiry === 'string' ? o.expiry : undefined,
      spot,
      strikes,
    };
  }
  return null;
}

/** ISO/IST string → epoch seconds (the candle chart's time axis). */
export function toEpochSeconds(time: string): number | null {
  const ms = Date.parse(time);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
