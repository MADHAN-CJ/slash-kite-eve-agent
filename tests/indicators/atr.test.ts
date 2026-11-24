import { expect, it } from 'vitest';
import { expectSeries } from '../helpers/assert';
import { PY_DATA, candles, nonNull, refAtr, trueRanges, type Series } from '../helpers/data';
import { runJson } from '../helpers/mcp';
import { describeLive } from './_setup';

describeLive('atr via kite__run_python', ({ client }) => {
  it("matches Wilder's ATR on gapped candles for periods 3, 7, 14", async () => {
    const out = await runJson<Record<string, Series>>(
      client(),
      `${PY_DATA}\nrows = candles(40, 5.0)\nprint(json.dumps({str(p): z.atr(rows, p) for p in (3, 7, 14)}))`,
    );
    const rows = candles(40, 5);
    for (const p of [3, 7, 14]) expectSeries(out[String(p)], refAtr(rows, p), 1e-9, `atr(${p})`);
  });

  it('steady candles without gaps give a constant ATR of 2; a gap raises it', async () => {
    const out = await runJson<{ steady: Series; gapped: Series }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"steady": z.atr(candles(20), 5), "gapped": z.atr(candles(20, 5.0), 3)}))`,
    );
    expect(nonNull(out.steady).every((v) => Math.abs(v - 2) < 1e-9)).toBe(true);
    expect(trueRanges(candles(20, 5))[10]).toBeCloseTo(7, 9);
    expect(out.gapped[11]).not.toBeNull();
    expect(out.gapped[11] as number).toBeGreaterThan(2);
  });

  it('hand-computed period 2, too-short input, string numbers, default period 14', async () => {
    const out = await runJson<{ hand: Series; short: Series; strings: number; same: boolean }>(
      client(),
      `${PY_DATA}
hand = [{"high": 10, "low": 8, "close": 9}, {"high": 11, "low": 9, "close": 10}, {"high": 14, "low": 12, "close": 13}, {"high": 13, "low": 11, "close": 12}]
print(json.dumps({"hand": z.atr(hand, 2), "short": z.atr(candles(14), 14), "strings": z.atr([{"high": "11", "low": "9", "close": "10"}] * 6, 3)[-1], "same": z.atr(candles(30)) == z.atr(candles(30), 14)}))`,
    );
    expect(out.hand.slice(0, 2)).toEqual([null, null]);
    expect(out.hand[2]).toBeCloseTo(3, 9);
    expect(out.hand[3]).toBeCloseTo(2.5, 9);
    expect(out.short.every((v) => v === null)).toBe(true);
    expect(out.strings).toBeCloseTo(2, 9);
    expect(out.same).toBe(true);
  });
});
