import { expect, it } from 'vitest';
import { expectSeries } from '../helpers/assert';
import { DOWN, FLAT, PRICES, PY_DATA, UP, nonNull, refRsi, type Series } from '../helpers/data';
import { runJson } from '../helpers/mcp';
import { describeLive } from './_setup';

describeLive('rsi via kite__run_python', ({ client }) => {
  it("matches Wilder's smoothing for periods 2, 5 and 14", async () => {
    const out = await runJson<Record<string, Series>>(
      client(),
      `${PY_DATA}\nprint(json.dumps({str(p): z.rsi(PRICES, p) for p in (2, 5, 14)}))`,
    );
    for (const p of [2, 5, 14]) expectSeries(out[String(p)], refRsi(PRICES, p), 1e-9, `rsi(${p})`);
  });

  it('textbook period-2 values: [None, None, 100, 50]', async () => {
    const out = await runJson<Series>(client(), `${PY_DATA}\nprint(json.dumps(z.rsi([1.0, 2.0, 3.0, 2.0], 2)))`);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(100);
    expect(out[3]).toBeCloseTo(50, 9);
  });

  it('monotonic up → 100, down → 0, flat → 100 (no losses, by convention), always within [0, 100]', async () => {
    const out = await runJson<{ up: number; down: number; flat: number; all: Series }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"up": z.rsi(UP, 14)[-1], "down": z.rsi(DOWN, 14)[-1], "flat": z.rsi(FLAT, 14)[-1], "all": z.rsi(PRICES, 14)}))`,
    );
    expect(out.up).toBe(100);
    expect(out.down).toBeCloseTo(0, 9);
    expect(out.flat).toBe(100);
    expect(nonNull(out.all).every((v) => v >= 0 && v <= 100)).toBe(true);
  });

  it('warm-up is exactly `period` bars; too-short input is all None; default period is 14', async () => {
    const out = await runJson<{ seven: Series; short: Series; same: boolean }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"seven": z.rsi(PRICES, 7), "short": z.rsi(PRICES[:14], 14), "same": z.rsi(PRICES) == z.rsi(PRICES, 14)}))`,
    );
    expect(out.seven[6]).toBeNull();
    expect(out.seven[7]).not.toBeNull();
    expect(out.short.every((v) => v === null)).toBe(true);
    expect(out.same).toBe(true);
  });
});
