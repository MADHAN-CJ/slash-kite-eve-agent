import { errorResponse, requireUser } from '@/lib/server/auth';
import { listWatches } from '@/lib/server/watches';

export const dynamic = 'force-dynamic';

/** GET /api/watches → the user's watchers, newest first, with their latest alerts. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return Response.json({ watches: await listWatches(user.userId) });
  } catch (e) {
    return errorResponse(e, req);
  }
}
