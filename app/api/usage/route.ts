import { errorResponse, requireUser } from '@/lib/server/auth';
import { creditsNow } from '@/lib/server/limits';

export const dynamic = 'force-dynamic';

/**
 * GET /api/usage → this month's credits for the signed-in user (plan D6):
 * the summed cost of their assistant turns (input, output, cache read and
 * cache write tokens, priced server-side when each turn was stored) against
 * the monthly allowance, in IST calendar months. `lowPct` is the level at or
 * under which the UI shows the low-credits line (V10, CREDITS_LOW_PCT).
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const { monthUsd, allowanceUsd, leftPct, resetsOn, lowPct } = await creditsNow(user.userId);
    return Response.json({ monthUsd, allowanceUsd, leftPct, resetsOn, lowPct });
  } catch (e) {
    return errorResponse(e, req);
  }
}
