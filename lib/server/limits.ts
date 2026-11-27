import { sql } from 'drizzle-orm';
import { db } from '@/agent/lib/db/client';
import type { Usage } from '@/agent/lib/db/types';
import { creditsAllowanceUsd, monthWindowIst } from './credits';

/**
 * Limits (plan-v2 V10, decisions D6 + D15). Every threshold is an environment
 * variable with a default; the defaults are ASSUMPTIONS until the user confirms
 * them (plan §6a, V10):
 *
 *  - CREDITS_LOW_PCT      credits left (%) at or under which the bar turns sky
 *                         and reads "N% left this month." (prototype: 20).
 *  - CHAT_LONG_TOKENS     estimated context (transcript characters / 4) from
 *                         which a chat is "long" (soft note). Default 80 000.
 *  - CHAT_FULL_TOKENS     … from which it is "full" (card replaces the box,
 *                         the proxy refuses further turns). Default 150 000.
 *  - CHAT_LONG_TURNS /    the same by user turns (whichever trips first).
 *    CHAT_FULL_TURNS      Defaults 20 / 40.
 *
 * "Out" needs no threshold: the month's spend has reached the allowance.
 */

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const creditsLowPct = (): number => envInt('CREDITS_LOW_PCT', 20);

export interface CreditsNow {
  monthUsd: number;
  allowanceUsd: number;
  leftPct: number;
  lowPct: number;
  /** ISO date (IST) the allowance renews. */
  resetsOn: string;
  out: boolean;
}

/** This month's credits for a user, as GET /api/usage reports them. */
export async function creditsNow(userId: string): Promise<CreditsNow> {
  const { start, next } = monthWindowIst();
  const res = await db().execute<{ usd: string | null }>(sql`
    SELECT sum((m.cost->>'total')::numeric) AS usd
    FROM eve.messages m JOIN eve.threads t ON t.id = m.thread_id
    WHERE t.user_id = ${userId} AND m.role = 'assistant'
      AND m.created_at >= ${start.toISOString()}::timestamptz AND m.created_at < ${next.toISOString()}::timestamptz`);
  const monthUsd = Number(res.rows[0]?.usd ?? 0);
  const allowanceUsd = creditsAllowanceUsd();
  const leftPct = Math.max(0, Math.min(100, Math.round(100 - (monthUsd / allowanceUsd) * 100)));
  // The renewal day as an IST calendar date (the instant itself is 18:30 UTC the evening before).
  const resetsOn = new Date(next.getTime() + 5.5 * 36e5).toISOString().slice(0, 10);
  return { monthUsd, allowanceUsd, leftPct, lowPct: creditsLowPct(), resetsOn, out: monthUsd >= allowanceUsd };
}

export type ChatLimit = 'long' | 'full' | null;

export interface LimitMessage {
  role: string;
  content: string;
  usage: Usage | null;
  parts?: unknown;
}

/**
 * The context the next turn would carry, estimated from the stored transcript
 * (≈ 4 characters per token over message text and tool activity). The per-turn
 * `usage` rows cannot be used: eve sums every model call of a tool loop into
 * them, so one busy turn reads as 150k "input" tokens (seen live, 2026-11-27).
 */
function contextTokens(messages: readonly LimitMessage[]): number {
  let chars = 0;
  for (const m of messages) chars += m.content.length + (m.parts ? JSON.stringify(m.parts).length : 0);
  return Math.round(chars / 4);
}

/** Long / full by the estimated context, or by the number of user turns — whichever trips first. */
export function chatLimit(messages: readonly LimitMessage[]): ChatLimit {
  const tokens = contextTokens(messages);
  if (tokens >= envInt('CHAT_FULL_TOKENS', 150_000)) return 'full';
  const turns = messages.filter((m) => m.role === 'user').length;
  if (turns >= envInt('CHAT_FULL_TURNS', 40)) return 'full';
  if (tokens >= envInt('CHAT_LONG_TOKENS', 80_000)) return 'long';
  if (turns >= envInt('CHAT_FULL_TURNS', 40)) return 'full';
  if (turns >= envInt('CHAT_LONG_TURNS', 20)) return 'long';
  return null;
}

/**
 * "What carries over" when a full chat is left: a short, deterministic summary
 * built from what the app already stores — the chat's title, the opening of
 * the last answer, and the watchers started from this chat. No model call.
 */
export function carryOver(title: string | null, messages: readonly LimitMessage[], watcherLabels: readonly string[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.content.trim());
  const parts: string[] = [];
  if (last) {
    const plain = last.content
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#*_`>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const cut = plain.length > 220 ? `${plain.slice(0, 217).replace(/\s+\S*$/, '')}…` : plain;
    if (cut) parts.push(cut);
  }
  if (watcherLabels.length === 1) parts.push(`You started a watcher: ${watcherLabels[0]}.`);
  else if (watcherLabels.length > 1) parts.push(`You started ${watcherLabels.length} watchers: ${watcherLabels.join('; ')}.`);
  const head = title?.trim() ? `${title.trim().replace(/[.:]+$/, '')}: ` : '';
  return (head + parts.join(' ')).trim();
}
