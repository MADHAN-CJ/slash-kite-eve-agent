import { expect, it } from 'vitest';
import { expectSeries } from '../helpers/assert';
import { PY_DATA, candles, refVwap, type Series } from '../helpers/data';
import { runJson } from '../helpers/mcp';
import { describeLive } from './_setup';

describeLive('vwap via kite__run_python', ({ client }) => {
  it('is the running Σ(typical × volume) / Σvolume and stays inside the price range', async () => {
    const out = await runJson<Series>(client(), `${PY_DATA}\nprint(json.dumps(z.vwap(candles(30, 4.0))))`);
    const rows = candles(30, 4);
    expectSeries(out, refVwap(rows), 1e-9, 'vwap');
    out.forEach((v, i) => {
      const lo = Math.min(...rows.slice(0, i + 1).map((r) => r.low));
      const hi = Math.max(...rows.slice(0, i + 1).map((r) => r.high));
      expect(v).not.toBeNull();
      expect(v as number).toBeGreaterThanOrEqual(lo);
      expect(v as number).toBeLessThanOrEqual(hi);
    });
  });

  it('hand values: one bar = typical price; two bars (10×100 + 20×300)/400 = 17.5', async () => {
    const out = await runJson<{ one: Series; two: Series }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"one": z.vwap([{"high": 12, "low": 8, "close": 10, "volume": 500}]), "two": z.vwap([{"high": 12, "low": 8, "close": 10, "volume": 100}, {"high": 22, "low": 18, "close": 20, "volume": 300}])}))`,
    );
    expect(out.one[0]).toBeCloseTo(10, 9);
    expect(out.two[1]).toBeCloseTo(17.5, 9);
  });

  it('None while cumulative volume is 0 (zero or missing volume), [] on empty input', async () => {
    const out = await runJson<{ prefix: Series; zero: Series; empty: Series }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"prefix": z.vwap([{"high": 12, "low": 8, "close": 10, "volume": 0}, {"high": 12, "low": 8, "close": 10}, {"high": 14, "low": 10, "close": 12, "volume": 10}]), "zero": z.vwap([{"high": 1, "low": 1, "close": 1, "volume": 0}] * 3), "empty": z.vwap([])}))`,
    );
    expect(out.prefix[0]).toBeNull();
    expect(out.prefix[1]).toBeNull();
    expect(out.prefix[2]).toBeCloseTo(12, 9);
    expect(out.zero).toEqual([null, null, null]);
    expect(out.empty).toEqual([]);
  });
});
