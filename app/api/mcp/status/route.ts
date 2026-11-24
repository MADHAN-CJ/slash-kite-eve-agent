import { connectionStatus } from '@/agent/lib/mcp/oauth';
import { errorResponse, requireUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/** GET /api/mcp/status → whether this user's /markets grant is usable. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return Response.json(await connectionStatus(user.userId));
  } catch (e) {
    return errorResponse(e);
  }
}
