import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { HttpError, sessionSigningKey } from './auth';

/**
 * Zerodha Kite Connect login for a /markets user (ported from the retired
 * app.slash.markets web app). The browser is sent to Kite's login page with a
 * signed `state` naming OUR user; Zerodha returns to the ONE redirect URL
 * registered on the Kite app (`<APP_BASE_URL>/api/broker/kite/callback`) with a
 * `request_token`, which the server exchanges (SHA-256 checksum) for the
 * access token. Kite ends every session around 06:00 IST the next day.
 */

const LOGIN_STATE_TTL = '10m';

function config() {
  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;
  if (!apiKey || !apiSecret) throw new HttpError(503, 'Zerodha login is not configured on this server.', 'KITE_NOT_CONFIGURED');
  return {
    apiKey,
    apiSecret,
    baseUrl: (process.env.KITE_BASE_URL ?? 'https://api.kite.trade').replace(/\/$/, ''),
    loginUrl: process.env.KITE_LOGIN_URL ?? 'https://kite.zerodha.com/connect/login',
  };
}

export function kiteApiKey(): string | null {
  return process.env.KITE_API_KEY ?? null;
}

export async function loginUrl(userId: string): Promise<string> {
  const { apiKey, loginUrl } = config();
  const state = await new SignJWT({ purpose: 'kite-login' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(LOGIN_STATE_TTL)
    .sign(sessionSigningKey());
  const params = new URLSearchParams({
    v: '3',
    api_key: apiKey,
    redirect_params: new URLSearchParams({ state }).toString(),
  });
  return `${loginUrl}?${params.toString()}`;
}

export async function userFromState(state: string | null): Promise<string> {
  if (!state) throw new HttpError(400, 'This login link has expired. Start the Zerodha login again.');
  try {
    const { payload } = await jwtVerify(state, sessionSigningKey());
    if (payload.purpose !== 'kite-login' || !payload.sub) throw new Error('bad state');
    return payload.sub;
  } catch {
    throw new HttpError(400, 'This login link has expired. Start the Zerodha login again.');
  }
}

export interface KiteSession {
  userId: string;
  userName: string;
  accessToken: string;
}

export async function exchangeRequestToken(requestToken: string): Promise<KiteSession> {
  const { apiKey, apiSecret, baseUrl } = config();
  const checksum = createHash('sha256').update(`${apiKey}${requestToken}${apiSecret}`).digest('hex');
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/session/token`, {
      method: 'POST',
      headers: { 'X-Kite-Version': '3', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(502, 'Could not reach Zerodha. Try again in a moment.');
  }
  const body = (await res.json().catch(() => null)) as {
    status?: string;
    message?: string;
    data?: { user_id?: string; user_name?: string; access_token?: string };
  } | null;
  if (!res.ok || body?.status !== 'success' || !body.data?.access_token || !body.data.user_id) {
    throw new HttpError(400, `Zerodha rejected the login: ${body?.message ?? res.status}`);
  }
  return {
    userId: body.data.user_id,
    userName: body.data.user_name ?? '',
    accessToken: body.data.access_token,
  };
}

export async function invalidateSession(accessToken: string): Promise<void> {
  const { apiKey, baseUrl } = config();
  const params = new URLSearchParams({ api_key: apiKey, access_token: accessToken });
  await fetch(`${baseUrl}/session/token?${params.toString()}`, {
    method: 'DELETE',
    headers: { 'X-Kite-Version': '3' },
    signal: AbortSignal.timeout(15_000),
  }).catch((e: unknown) => console.warn('[kite] session invalidation failed:', e));
}

/** Kite sessions end around 06:00 IST on the next calendar day. */
export function nextTokenExpiry(now = new Date()): Date {
  const istOffsetMs = 5.5 * 3600 * 1000;
  const ist = new Date(now.getTime() + istOffsetMs);
  const candidate = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 6, 0, 0);
  const utc = candidate - istOffsetMs;
  return new Date(utc <= now.getTime() ? utc + 24 * 3600 * 1000 : utc);
}
