import { expect, it } from 'vitest';
import { PY_DATA, black76 } from '../helpers/data';
import { runJson } from '../helpers/mcp';
import { describeLive } from './_setup';

/**
 * The computed option analytics behind z.option_chain: Black-76 on the
 * forward, bisection IV, greeks, max pain. Reached through the sandbox's
 * zapkite.options_math (importable inside run_python).
 */
const F = 24_700;
const T = 10 / 365;
const R = 0.07;
const SIGMA = 0.15;
const PY = `${PY_DATA}\nfrom zapkite.options_math import black76_price, implied_vol, option_greeks, max_pain\nimport math\nF, T, R, SIGMA = ${F}, ${T}, ${R}, ${SIGMA}`;

describeLive('options math via kite__run_python', ({ client }) => {
  it('Black-76 call/put match an independent implementation and obey put–call parity', async () => {
    const out = await runJson<{ grid: { k: number; t: number; s: number; ce: number; pe: number }[] }>(
      client(),
      `${PY}
grid = []
for km in (0.9, 0.98, 1.0, 1.02, 1.1):
    for t in (1/365, 7/365, 30/365, 1.0):
        for s in (0.05, 0.15, 0.4, 1.0):
            grid.append({"k": F * km, "t": t, "s": s, "ce": black76_price("CE", F, F * km, t, R, s), "pe": black76_price("PE", F, F * km, t, R, s)})
print(json.dumps({"grid": grid}))`,
    );
    expect(out.grid.length).toBe(80);
    for (const g of out.grid) {
      // The reference erf is accurate to ~1.5e-7, i.e. a few thousandths of a rupee on a 24,700 forward.
      expect(Math.abs(g.ce - black76('CE', F, g.k, g.t, R, g.s))).toBeLessThan(2e-2);
      expect(Math.abs(g.pe - black76('PE', F, g.k, g.t, R, g.s))).toBeLessThan(2e-2);
      expect(Math.abs(g.ce - g.pe - Math.exp(-R * g.t) * (F - g.k))).toBeLessThan(1e-6);
    }
  });

  it('implied vol round-trips the price and rejects impossible prices', async () => {
    const out = await runJson<{ rt: number[]; zero: null; belowIntrinsic: null; tooHigh: null; expired: null }>(
      client(),
      `${PY}
rt = [implied_vol(k, black76_price(k, F, F * 1.01, T, R, s), F, F * 1.01, T, R) for k in ("CE", "PE") for s in (0.08, 0.15, 0.40)]
print(json.dumps({"rt": rt, "zero": implied_vol("CE", 0.0, F, F, T, R), "belowIntrinsic": implied_vol("CE", 10.0, 25000, 24000, T, R), "tooHigh": implied_vol("CE", F * 2, F, F, T, R), "expired": implied_vol("CE", 100.0, F, F, 0.0, R)}))`,
    );
    const expected = [0.08, 0.15, 0.4, 0.08, 0.15, 0.4];
    out.rt.forEach((iv, i) => expect(Math.abs(iv - expected[i])).toBeLessThan(2e-4));
    expect(out.zero).toBeNull();
    expect(out.belowIntrinsic).toBeNull();
    expect(out.tooHigh).toBeNull();
    expect(out.expired).toBeNull();
  });

  it('greeks have the right signs and ranges; deep ITM delta → 1, far OTM → 0', async () => {
    type G = { iv: number | null; delta: number | null; gamma: number | null; theta: number | null; vega: number | null; intrinsic: number; time_value: number | null };
    const out = await runJson<{ ce: G; pe: G; itm: G; otm: G; dead: G; forward: G }>(
      client(),
      `${PY}
spot = F * math.exp(-R * T)
ce = option_greeks("CE", black76_price("CE", F, F, T, R, SIGMA), spot, F, T, R).as_dict()
pe = option_greeks("PE", black76_price("PE", F, F, T, R, SIGMA), spot, F, T, R).as_dict()
itm = option_greeks("CE", 2060.0, 24700.0, 22700.0, T, R).as_dict()
otm = option_greeks("CE", 2.0, 24700.0, 26700.0, T, R).as_dict()
dead = option_greeks("CE", 50.0, F, F, 0.0, R).as_dict()
fwd = option_greeks("CE", black76_price("CE", 25000.0, F, T, R, SIGMA), 24000.0, F, T, R, forward=25000.0).as_dict()
print(json.dumps({"ce": ce, "pe": pe, "itm": itm, "otm": otm, "dead": dead, "forward": fwd}))`,
    );
    expect(Math.abs((out.ce.iv as number) - SIGMA)).toBeLessThan(1e-3);
    expect(out.ce.delta as number).toBeGreaterThan(0.45);
    expect(out.ce.delta as number).toBeLessThan(0.6);
    expect(out.ce.gamma as number).toBeGreaterThan(0);
    expect(out.ce.vega as number).toBeGreaterThan(0);
    expect(out.ce.theta as number).toBeLessThan(0);
    expect(out.pe.delta as number).toBeGreaterThan(-0.6);
    expect(out.pe.delta as number).toBeLessThan(-0.4);
    expect(Math.abs((out.pe.gamma as number) - (out.ce.gamma as number))).toBeLessThan(1e-5);
    expect(out.itm.delta as number).toBeGreaterThan(0.95);
    expect(out.itm.intrinsic).toBeCloseTo(2000, 6);
    expect(out.otm.delta as number).toBeLessThan(0.08);
    expect(out.otm.intrinsic).toBe(0);
    expect(out.dead.iv).toBeNull();
    expect(out.dead.delta).toBeNull();
    expect(Math.abs((out.forward.iv as number) - SIGMA)).toBeLessThan(1e-3);
  });

  it('max pain minimises writer payout; ties resolve to the lowest strike', async () => {
    const out = await runJson<{ mid: number; empty: null; single: number; calls: number; puts: number; tie: number }>(
      client(),
      `${PY}
print(json.dumps({
  "mid": max_pain([(100.0, 10.0, 0.0), (110.0, 5.0, 5.0), (120.0, 0.0, 10.0)]),
  "empty": max_pain([]),
  "single": max_pain([(24700.0, 0.0, 0.0)]),
  "calls": max_pain([(100.0, 0.0, 0.0), (110.0, 1000.0, 0.0), (120.0, 1000.0, 0.0)]),
  "puts": max_pain([(100.0, 0.0, 1000.0), (110.0, 0.0, 1000.0), (120.0, 0.0, 1000.0)]),
  "tie": max_pain([(100.0, 0.0, 1000.0), (110.0, 0.0, 1000.0), (120.0, 0.0, 0.0)]),
}))`,
    );
    expect(out.mid).toBe(110);
    expect(out.empty).toBeNull();
    expect(out.single).toBe(24700);
    expect(out.calls).toBe(100);
    expect(out.puts).toBe(120);
    expect(out.tie).toBe(110);
  });
});
