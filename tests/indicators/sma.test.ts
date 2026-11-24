import { expect, it } from 'vitest';
import { expectSeries } from '../helpers/assert';
import { FLAT, PRICES, PY_DATA, refSma, type Series } from '../helpers/data';
import { runJson, runPython } from '../helpers/mcp';
import { describeLive } from './_setup';

describeLive('sma via kite__run_python', ({ client }) => {
  it('matches the textbook window average for several periods', async () => {
    const out = await runJson<Record<string, Series>>(
      client(),
      `${PY_DATA}\nprint(json.dumps({str(p): z.sma(PRICES, p) for p in (1, 2, 5, 10, 20)}))`,
    );
    for (const p of [1, 2, 5, 10, 20]) expectSeries(out[String(p)], refSma(PRICES, p), 1e-9, `sma(${p})`);
  });

  it('period longer than the series is all None; period == length gives one value', async () => {
    const out = await runJson<{ longer: Series; equal: Series }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"longer": z.sma(PRICES[:5], 6), "equal": z.sma(PRICES[:5], 5)}))`,
    );
    expect(out.longer).toEqual([null, null, null, null, null]);
    expect(out.equal.slice(0, 4)).toEqual([null, null, null, null]);
    expect(out.equal[4]).toBeCloseTo(PRICES.slice(0, 5).reduce((a, b) => a + b, 0) / 5, 9);
  });

  it('flat series stays flat and empty input returns []', async () => {
    const out = await runJson<{ flat: Series; empty: Series }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"flat": z.sma(FLAT, 7), "empty": z.sma([], 3)}))`,
    );
    expectSeries(out.flat, refSma(FLAT, 7), 1e-9, 'flat');
    expect(out.empty).toEqual([]);
  });

  it('non-positive period raises ValueError (surfaces as a traceback)', async () => {
    const r = await runPython(client(), `${PY_DATA}\nz.sma(PRICES, 0)`);
    expect(r.isError).toBe(true);
    expect(r.raw).toMatch(/ValueError/);
  });
});
