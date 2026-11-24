'use client';

import { CandleChart, type Candle } from './candle-chart';
import { OptionChainChart, type ChainStrike } from './option-chain-chart';
import { extractChartLine, stdoutOf, toEpochSeconds, type ChartSpec } from './chart-line';

/**
 * Renders a chart under a `run_python` tool card when the script's output
 * ends with an `@@chart` line (plan D10). Used for both the live stream and
 * reloaded history (same text). Anything else renders nothing.
 */
export function ToolResultChart({ toolName, output }: { readonly toolName: string; readonly output: unknown }) {
  if (!toolName.endsWith('run_python')) return null;
  const text = resultText(output);
  if (!text) return null;
  const { chart } = extractChartLine(stdoutOf(text));
  if (!chart) return null;
  return <ChartFromSpec spec={chart} />;
}

export function ChartFromSpec({ spec }: { readonly spec: ChartSpec }) {
  if (spec.type === 'candles') {
    const candles: Candle[] = [];
    for (const r of spec.rows) {
      const timestamp = toEpochSeconds(r.time);
      if (timestamp === null) continue;
      candles.push({
        timestamp,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume ?? 0,
        openInterest: r.oi,
      });
    }
    if (candles.length < 2) return null;
    return <CandleChart candles={candles} instrument={spec.title ?? ''} interval={spec.interval} />;
  }
  const strikes: ChainStrike[] = spec.strikes.map((s) => ({
    strike: s.strike,
    ce: s.ce ? { ltp: s.ce.last_price, oi: s.ce.oi, iv: s.ce.iv, volume: s.ce.volume } : undefined,
    pe: s.pe ? { ltp: s.pe.last_price, oi: s.pe.oi, iv: s.pe.iv, volume: s.pe.volume } : undefined,
  }));
  return <OptionChainChart expiry={spec.expiry} strikes={strikes} underlyingLastPrice={spec.spot} />;
}

/** MCP tool results arrive as text, or as `{content:[{type:'text',text}]}`. */
export function resultText(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (!output || typeof output !== 'object') return null;
  const o = output as { content?: unknown; text?: unknown };
  if (typeof o.text === 'string') return o.text;
  if (Array.isArray(o.content)) {
    const texts = o.content
      .map((c) => (c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : null))
      .filter((t): t is string => t !== null);
    return texts.length ? texts.join('\n') : null;
  }
  return null;
}
