import { HttpError } from '@/lib/server/auth';
import { storeSession } from '@/lib/server/broker';
import { exchangeRequestToken, userFromState } from '@/lib/server/kite';

export const dynamic = 'force-dynamic';

/**
 * Zerodha redirects here after login (the Kite app's registered redirect URL).
 * The signed `state` names the /markets user; the request token is exchanged
 * server-side and the session stored in the MCP's table. The browser lands
 * back on the app with `?kite=connected` or `?kite=error&reason=…`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = (process.env.APP_BASE_URL?.trim() || url.origin).replace(/\/$/, '');
  const home = new URL('/', base);
  const status = url.searchParams.get('status');
  const requestToken = url.searchParams.get('request_token');
  if ((status && status !== 'success') || !requestToken) {
    home.searchParams.set('kite', 'error');
    home.searchParams.set('reason', 'Zerodha login was cancelled.');
    return Response.redirect(home, 303);
  }
  try {
    const userId = await userFromState(url.searchParams.get('state'));
    const session = await exchangeRequestToken(requestToken);
    await storeSession(userId, session);
    home.searchParams.set('kite', 'connected');
  } catch (e) {
    const message = e instanceof HttpError ? e.message : 'Zerodha login failed.';
    if (!(e instanceof HttpError)) console.error('[kite callback]', e);
    home.searchParams.set('kite', 'error');
    home.searchParams.set('reason', message);
  }
  return Response.redirect(home, 303);
}
