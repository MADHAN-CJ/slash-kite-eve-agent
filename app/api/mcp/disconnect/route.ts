import { disconnect } from '@/agent/lib/mcp/oauth';
import { errorResponse, requireUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/** POST /api/mcp/disconnect — forget the grant (the MCP has no revocation endpoint). */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await disconnect(user.userId);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
