import { expect, it } from 'vitest';
import { expectSeries } from '../helpers/assert';
import { FLAT, PRICES, PY_DATA, UP, nonNull, refMacd, type Series } from '../helpers/data';
import { runJson } from '../helpers/mcp';
import { describeLive } from './_setup';

type Macd = { macd: Series; signal: Series; histogram: Series };
const LONG = Array.from({ length: 60 }, (_, i) => 100 + (i % 7));

describeLive('macd via kite__run_python', ({ client }) => {
  it('defaults 12/26/9 match EMA(fast) − EMA(slow), signal over the dense line, histogram = macd − signal', async () => {
    const out = await runJson<Macd>(client(), `${PY_DATA}\nprint(json.dumps(z.macd(${JSON.stringify(LONG)})))`);
    const ref = refMacd(LONG);
    expect(Object.keys(out).sort()).toEqual(['histogram', 'macd', 'signal']);
    expectSeries(out.macd, ref.macd, 1e-9, 'macd');
    expectSeries(out.signal, ref.signal, 1e-9, 'signal');
    expectSeries(out.histogram, ref.histogram, 1e-9, 'histogram');
    expect(out.macd.findIndex((v) => v !== null)).toBe(25);
    expect(out.signal.findIndex((v) => v !== null)).toBe(25 + 8);
  });

  it('custom periods (3/6/3 and 2/4/2) keep the same structure', async () => {
    const out = await runJson<{ a: Macd; b: Macd }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"a": z.macd(PRICES, 3, 6, 3), "b": z.macd(PRICES, 2, 4, 2)}))`,
    );
    const ra = refMacd(PRICES, 3, 6, 3);
    expectSeries(out.a.macd, ra.macd, 1e-9, 'a.macd');
    expectSeries(out.a.histogram, ra.histogram, 1e-9, 'a.histogram');
    expect(out.b.macd.findIndex((v) => v !== null)).toBe(3);
    expect(out.b.signal.findIndex((v) => v !== null)).toBe(4);
  });

  it('flat → zero line; rising → positive; too short → all None', async () => {
    const out = await runJson<{ flat: Macd; up: Macd; short: Macd }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"flat": z.macd(FLAT, 3, 6, 3), "up": z.macd(UP, 5, 10, 3), "short": z.macd(PRICES[:10])}))`,
    );
    expect(nonNull(out.flat.macd).every((v) => Math.abs(v) < 1e-9)).toBe(true);
    expect(nonNull(out.up.macd).every((v) => v > 0)).toBe(true);
    expect([...out.short.macd, ...out.short.signal, ...out.short.histogram].every((v) => v === null)).toBe(true);
  });
});
