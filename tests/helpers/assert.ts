import { expect } from 'vitest';
import type { Series } from './data';

/** Element-wise comparison of two aligned series, None/null-aware, with tolerance. */
export function expectSeries(got: unknown, ref: Series, tol = 1e-9, label = ''): void {
  expect(Array.isArray(got), `${label} should be a list`).toBe(true);
  const g = got as (number | null)[];
  expect(g.length, `${label} length`).toBe(ref.length);
  for (let i = 0; i < ref.length; i++) {
    const r = ref[i];
    const v = g[i];
    if (r === null) {
      expect(v, `${label}[${i}] should be None`).toBeNull();
    } else {
      expect(v, `${label}[${i}] should be a number`).not.toBeNull();
      expect(Math.abs((v as number) - r), `${label}[${i}] = ${v} vs ref ${r}`).toBeLessThanOrEqual(tol);
    }
  }
}
