import { startAuthorization } from '@/agent/lib/mcp/oauth';
import { errorResponse, requireUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/** POST /api/mcp/start → `{ url }` the browser navigates to (the MCP's own login page). */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    return Response.json({ url: await startAuthorization(user.userId) });
  } catch (e) {
    return errorResponse(e);
  }
}
