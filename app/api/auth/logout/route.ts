import { deleteGrant } from '@/agent/lib/mcp/grants';
import { errorResponse, requireUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout — drops the user's /markets MCP grant (plan D4: the
 * MCP connection lives exactly as long as the app session). The JWT itself is
 * stateless; the browser forgets it. Idempotent.
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
