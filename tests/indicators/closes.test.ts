import { expect, it } from 'vitest';
import { PY_DATA, candles } from '../helpers/data';
import { runJson } from '../helpers/mcp';
import { describeLive } from './_setup';

describeLive('closes via kite__run_python', ({ client }) => {
  it('pulls the close column in order and can select any field', async () => {
    const out = await runJson<{ close: number[]; high: number[]; volume: number[] }>(
      client(),
      `${PY_DATA}\nrows = candles(5)\nprint(json.dumps({"close": z.closes(rows), "high": z.closes(rows, "high"), "volume": z.closes(rows, "volume")}))`,
    );
    const rows = candles(5);
    expect(out.close).toEqual(rows.map((r) => r.close));
    expect(out.high).toEqual(rows.map((r) => r.high));
    expect(out.volume).toEqual(rows.map((r) => r.volume));
  });

  it('missing or non-numeric values become 0.0 instead of raising; empty → []', async () => {
    const out = await runJson<{ bad: number[]; empty: number[] }>(
      client(),
      `${PY_DATA}\nprint(json.dumps({"bad": z.closes([{"close": "101.5"}, {"close": None}, {}, {"close": "n/a"}]), "empty": z.closes([])}))`,
    );
    expect(out.bad).toEqual([101.5, 0, 0, 0]);
    expect(out.empty).toEqual([]);
  });
});
