/**
 * Credits (plan-v2 D6): every user gets a fixed dollar allowance per
 * calendar month (IST), spent by the real cost of their turns — normal,
 * cache-read and cache-write tokens alike (agent/lib/db/pricing.ts). The
 * allowance is `CREDITS_MONTHLY_USD`, 5 by default.
 */

const DEFAULT_ALLOWANCE_USD = 5;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function creditsAllowanceUsd(): number {
  const v = Number(process.env.CREDITS_MONTHLY_USD);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_ALLOWANCE_USD;
}

/** The current IST calendar month as UTC instants: [start, next). */
export function monthWindowIst(now = new Date()): { start: Date; next: Date } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS);
  const next = new Date(Date.UTC(y, m + 1, 1) - IST_OFFSET_MS);
  return { start, next };
}
