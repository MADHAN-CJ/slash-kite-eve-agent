import { sql } from 'drizzle-orm';
import { db } from '@/agent/lib/db/client';
import { errorResponse, requireUser } from '@/lib/server/auth';
import { creditsAllowanceUsd, monthWindowIst } from '@/lib/server/credits';

export const dynamic = 'force-dynamic';

/**
 * GET /api/usage → this month's credits for the signed-in user (plan D6):
 * the summed cost of their assistant turns (input, output, cache read and
 * cache write tokens, priced server-side when each turn was stored) against
 * the monthly allowance, in IST calendar months.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const { start, next } = monthWindowIst();
    const res = await db().execute<{ usd: string | null }>(sql`
      SELECT sum((m.cost->>'total')::numeric) AS usd
      FROM eve.messages m JOIN eve.threads t ON t.id = m.thread_id
      WHERE t.user_id = ${user.userId} AND m.role = 'assistant'
        AND m.created_at >= ${start.toISOString()}::timestamptz AND m.created_at < ${next.toISOString()}::timestamptz`);
    const monthUsd = Number(res.rows[0]?.usd ?? 0);
    const allowanceUsd = creditsAllowanceUsd();
    const leftPct = Math.max(0, Math.min(100, Math.round(100 - (monthUsd / allowanceUsd) * 100)));
    // The renewal day as an IST calendar date (the instant itself is 18:30 UTC the evening before).
    const resetsOn = new Date(next.getTime() + 5.5 * 36e5).toISOString().slice(0, 10);
    return Response.json({ monthUsd, allowanceUsd, leftPct, resetsOn });
  } catch (e) {
    return errorResponse(e, req);
  }
}
