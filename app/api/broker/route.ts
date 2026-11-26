import { errorResponse, requireUser } from '@/lib/server/auth';
import { brokerStatus, disconnect } from '@/lib/server/broker';

export const dynamic = 'force-dynamic';

/** GET /api/broker → the user's Zerodha connection as the MCP sees it. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return Response.json(await brokerStatus(user.userId));
  } catch (e) {
    return errorResponse(e, req);
  }
}

/** DELETE /api/broker → invalidate the Kite session and mark the connection disconnected. */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    await disconnect(user.userId);
    return Response.json(await brokerStatus(user.userId));
  } catch (e) {
    return errorResponse(e, req);
  }
}
