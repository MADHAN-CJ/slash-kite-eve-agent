import { expect, it } from 'vitest';
import { expectSeries } from '../helpers/assert';
import { FLAT, PRICES, PY_DATA, nonNull, refPctChange, type Series } from '../helpers/data';
import { runJson } from '../helpers/mcp';
import { describeLive } from './_setup';

describeLive('pct_change via kite__run_python', ({ client }) => {
  it('first None, then bar-over-bar percent', async () => {
    const out = await runJson<Series>(client(), `${PY_DATA}\nprint(json.dumps(z.pct_change(PRICES)))`);
    expectSeries(out, refPctChange(PRICES), 1e-9, 'pct_change');
  });

  it('hand values, zero-previous → None, flat → 0, single and empty inputs', async () => {
    const out = await runJson<{ hand: Series; zero: Series; flat: Series; one: Series; empty: Series }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"hand": z.pct_change([100.0, 110.0, 99.0]), "zero": z.pct_change([0.0, 5.0, 10.0]), "flat": z.pct_change(FLAT), "one": z.pct_change([5.0]), "empty": z.pct_change([])}))`,
    );
    expect(out.hand[0]).toBeNull();
    expect(out.hand[1]).toBeCloseTo(10, 9);
    expect(out.hand[2]).toBeCloseTo(-10, 9);
    expect(out.zero).toEqual([null, null, 100]);
    expect(nonNull(out.flat).every((v) => v === 0)).toBe(true);
    expect(out.one).toEqual([null]);
    expect(out.empty).toEqual([]);
  });
});
