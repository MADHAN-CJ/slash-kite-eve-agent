import { errorResponse, requireUser } from '@/lib/server/auth';
import { loginUrl, safeReturnPath } from '@/lib/server/kite';

export const dynamic = 'force-dynamic';

/**
 * POST `{ returnTo? }` → `{ loginUrl }`: where the browser goes to log in to
 * Zerodha (the state names this user). `returnTo` is the relative path the
 * callback sends the browser to afterwards — the v2 pop-up flow passes
 * `/kite/done`, which hands the result to the opener and closes itself.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => null)) as { returnTo?: unknown } | null;
    return Response.json({ loginUrl: await loginUrl(user.userId, safeReturnPath(body?.returnTo)) });
  } catch (e) {
    return errorResponse(e);
  }
}
