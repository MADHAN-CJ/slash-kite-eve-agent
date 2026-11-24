import { describe, expect, it } from 'vitest';
import { extractChartLine, stdoutOf, toEpochSeconds } from '@/components/charts/chart-line';

const RAW = `exit_code=0 duration=120ms
--- stdout ---
TCS 3,500: above EMA50
@@chart {"type":"candles","title":"NSE:TCS 15m","interval":15,"rows":[{"time":"2026-10-15T09:15:00+05:30","open":1,"high":2,"low":0.5,"close":1.5,"volume":10},{"time":"2026-10-15T09:30:00+05:30","open":1.5,"high":2.5,"low":1,"close":2,"volume":12}]}
--- stderr ---
(empty)`;

describe('@@chart protocol', () => {
  it('extracts stdout from the MCP result and strips the chart line', () => {
    const { text, chart } = extractChartLine(stdoutOf(RAW));
    expect(text).toBe('TCS 3,500: above EMA50');
    expect(chart?.type).toBe('candles');
    if (chart?.type === 'candles') {
      expect(chart.rows).toHaveLength(2);
      expect(chart.interval).toBe(15);
      expect(chart.title).toBe('NSE:TCS 15m');
    }
  });

  it('parses an option chain spec with null sides', () => {
    const line = '@@chart {"type":"option_chain","underlying":"NIFTY","expiry":"2026-10-27","spot":24712.5,"strikes":[{"strike":24700,"ce":{"last_price":194,"oi":10,"iv":0.15},"pe":null},{"strike":24750,"ce":null,"pe":{"oi":5}}]}';
    const { chart } = extractChartLine(`answer\n${line}`);
    expect(chart?.type).toBe('option_chain');
    if (chart?.type === 'option_chain') {
      expect(chart.spot).toBe(24712.5);
      expect(chart.strikes[0].pe).toBeUndefined();
      expect(chart.strikes[1].ce).toBeUndefined();
    }
  });

  it('ignores malformed or non-trailing chart lines and keeps the text intact', () => {
    expect(extractChartLine('@@chart {not json}')).toEqual({ text: '@@chart {not json}', chart: null });
    expect(extractChartLine('@@chart {"type":"candles","rows":[]}\nmore text').chart).toBeNull();
    expect(extractChartLine('plain').chart).toBeNull();
    expect(extractChartLine('').chart).toBeNull();
  });

  it('drops rows with missing numbers and caps at 500 rows', () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({ time: `2026-10-15T09:15:${String(i % 60).padStart(2, '0')}+05:30`, open: 1, high: 2, low: 0, close: 1 }));
    const spec = { type: 'candles', rows: [...rows, { time: 'x' }, { open: 1 }] };
    const { chart } = extractChartLine(`@@chart ${JSON.stringify(spec)}`);
    expect(chart?.type).toBe('candles');
    if (chart?.type === 'candles') expect(chart.rows.length).toBe(500);
  });

  it('converts IST timestamps to epoch seconds', () => {
    expect(toEpochSeconds('2026-10-15T09:15:00+05:30')).toBe(Date.parse('2026-10-15T03:45:00Z') / 1000);
    expect(toEpochSeconds('nope')).toBeNull();
  });
});
