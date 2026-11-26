import { errorResponse, requireUser } from '@/lib/server/auth';
import { loginUrl } from '@/lib/server/kite';

export const dynamic = 'force-dynamic';

/** POST → `{ loginUrl }`: where the browser goes to log in to Zerodha (state names this user). */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    return Response.json({ loginUrl: await loginUrl(user.userId) });
  } catch (e) {
    return errorResponse(e);
  }
}
