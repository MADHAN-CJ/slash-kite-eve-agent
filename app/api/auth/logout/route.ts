import { deleteGrant } from '@/agent/lib/mcp/grants';
import { errorResponse, requireUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout — drops the user's cached MCP access token (plan
 * D16: it is re-minted on the next login). The Zerodha session is NOT touched:
 * it belongs to the user's /markets account, not to this browser session. The
 * JWT itself is stateless; the browser forgets it. Idempotent.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await deleteGrant(user.userId);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
