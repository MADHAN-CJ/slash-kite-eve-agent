import { errorResponse, requireUser } from '@/lib/server/auth';
import { listWatches } from '@/lib/server/watches';

export const dynamic = 'force-dynamic';

/** GET /api/watches[?alerts=N] → the user's watchers, newest first, with their latest N alerts (default 3, max 100). */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const n = Number(new URL(req.url).searchParams.get('alerts'));
    return Response.json({ watches: await listWatches(user.userId, Number.isFinite(n) && n > 0 ? n : undefined) });
  } catch (e) {
    return errorResponse(e, req);
  }
}
