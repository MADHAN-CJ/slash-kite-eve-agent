import { expect, it } from 'vitest';
import { expectSeries } from '../helpers/assert';
import { FLAT, PRICES, PY_DATA, UP, nonNull, refEma, type Series } from '../helpers/data';
import { runJson } from '../helpers/mcp';
import { describeLive } from './_setup';

describeLive('ema via kite__run_python', ({ client }) => {
  it('is seeded with the first-period SMA then follows k = 2/(period+1)', async () => {
    const out = await runJson<Record<string, Series>>(
      client(),
      `${PY_DATA}\nprint(json.dumps({str(p): z.ema(PRICES, p) for p in (2, 3, 9, 12, 26)}))`,
    );
    for (const p of [2, 3, 9, 12, 26]) expectSeries(out[String(p)], refEma(PRICES, p), 1e-9, `ema(${p})`);
  });

  it('known small case: ema([1..5], 3) == [None, None, 2, 3, 4]', async () => {
    const out = await runJson<Series>(client(), `${PY_DATA}\nprint(json.dumps(z.ema([1.0, 2.0, 3.0, 4.0, 5.0], 3)))`);
    expect(out).toEqual([null, null, 2, 3, 4]);
  });

  it('too-short series and non-positive periods return all None (no exception)', async () => {
    const out = await runJson<{ short: Series; zero: Series; neg: Series }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"short": z.ema(PRICES[:4], 5), "zero": z.ema(PRICES, 0), "neg": z.ema(PRICES, -1)}))`,
    );
    expect(out.short).toEqual([null, null, null, null]);
    expect(out.zero.every((v) => v === null)).toBe(true);
    expect(out.neg.every((v) => v === null)).toBe(true);
  });

  it('flat series is flat; a rising series is tracked from below and faster by shorter periods', async () => {
    const out = await runJson<{ flat: Series; up10: Series; fast: number; slow: number }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"flat": z.ema(FLAT, 5), "up10": z.ema(UP, 10), "fast": z.ema(PRICES, 5)[-1], "slow": z.ema(PRICES, 20)[-1]}))`,
    );
    expect(nonNull(out.flat).every((v) => Math.abs(v - 100) < 1e-9)).toBe(true);
    const tail = nonNull(out.up10);
    expect(tail.every((v, i) => i === 0 || v > tail[i - 1])).toBe(true);
    expect(tail[tail.length - 1]).toBeLessThan(UP[UP.length - 1]);
    const last = PRICES[PRICES.length - 1];
    expect(Math.abs(last - out.fast)).toBeLessThan(Math.abs(last - out.slow));
  });
});
