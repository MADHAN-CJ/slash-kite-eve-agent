import { expect, it } from 'vitest';
import { expectSeries } from '../helpers/assert';
import { FLAT, PRICES, PY_DATA, refBollinger, refSma, type Series } from '../helpers/data';
import { runJson } from '../helpers/mcp';
import { describeLive } from './_setup';

type Bands = { upper: Series; middle: Series; lower: Series };

describeLive('bollinger via kite__run_python', ({ client }) => {
  it('middle is the SMA and bands are ± k × POPULATION std of the window', async () => {
    const out = await runJson<Record<string, Bands>>(
      client(),
      `${PY_DATA}\nprint(json.dumps({f"{p}:{k}": z.bollinger(PRICES, p, k) for p in (2, 5, 20) for k in (1.0, 2.0, 2.5)}))`,
    );
    for (const p of [2, 5, 20]) {
      for (const k of [1, 2, 2.5]) {
        const got = out[`${p}:${k.toFixed(1)}`];
        const ref = refBollinger(PRICES, p, k);
        expectSeries(got.middle, refSma(PRICES, p), 1e-9, `middle(${p})`);
        expectSeries(got.upper, ref.upper, 1e-9, `upper(${p},${k})`);
        expectSeries(got.lower, ref.lower, 1e-9, `lower(${p},${k})`);
      }
    }
  });

  it('hand-computed window [2,4,4,4,5,5,7,9] → middle 5, upper 9, lower 1 at k=2', async () => {
    const out = await runJson<Bands>(client(), `${PY_DATA}\nprint(json.dumps(z.bollinger([2.0,4.0,4.0,4.0,5.0,5.0,7.0,9.0], 8, 2.0)))`);
    expect(out.middle[7]).toBeCloseTo(5, 9);
    expect(out.upper[7]).toBeCloseTo(9, 9);
    expect(out.lower[7]).toBeCloseTo(1, 9);
  });

  it('bands collapse on a flat series; defaults are (20, 2.0); warm-up is period − 1', async () => {
    const out = await runJson<{ flat: Bands; same: boolean; six: Bands }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"flat": z.bollinger(FLAT, 5), "same": z.bollinger(PRICES) == z.bollinger(PRICES, 20, 2.0), "six": z.bollinger(PRICES, 6)}))`,
    );
    out.flat.middle.forEach((m, i) => {
      if (m !== null) {
        expect(out.flat.upper[i]).toBeCloseTo(m, 9);
        expect(out.flat.lower[i]).toBeCloseTo(m, 9);
      }
    });
    expect(out.same).toBe(true);
    expect(out.six.upper.slice(0, 5).every((v) => v === null)).toBe(true);
    expect(out.six.upper[5]).not.toBeNull();
  });
});
