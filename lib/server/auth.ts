import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Zap session auth: email OTP → 7-day JWT (HS256, AUTH_JWT_SECRET). The token
 * is the ONLY thing the browser holds; the MCP grant never leaves the
 * server. A 401 from these helpers ALWAYS means "log in to /markets again" — MCP
 * token problems are broker-status, never a 401 (§10 rule from zap-api).
 */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

const SESSION_DAYS = 7;

/** HS256 key for everything this server signs (session JWTs, the Kite login `state`). */
export function sessionSigningKey(): Uint8Array {
  const value = process.env.AUTH_JWT_SECRET;
  if (!value || value.length < 16) {
    throw new Error('AUTH_JWT_SECRET must be set to a random secret of at least 16 characters.');
  }
  // Hash to a fixed-length key so any-length secrets are fine.
  return new Uint8Array(createHash('sha256').update(value).digest());
}

export interface SessionUser {
  userId: string;
  email: string;
}

export async function signSessionJwt(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionSigningKey());
}

/** The authenticated user for a request, or a 401 HttpError. */
export async function requireUser(req: Request): Promise<SessionUser> {
  const header = req.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw new HttpError(401, 'Sign in to continue.');
  try {
    const { payload } = await jwtVerify(token, sessionSigningKey());
    if (!payload.sub || typeof payload.email !== 'string') throw new Error('bad claims');
    return { userId: payload.sub, email: payload.email };
  } catch {
    throw new HttpError(401, 'Your session has expired — sign in again.');
  }
}

/**
 * Route-handler wrapper: map HttpError to a JSON response, 500 otherwise.
 * Unhandled errors are logged, never returned — except to a request carrying
 * `x-debug-errors: <DEBUG_ERRORS_SECRET>` when that env is set (operator
 * diagnosis on hosts whose runtime logs are hard to reach). Unset = off.
 */
export function errorResponse(e: unknown, req?: Request): Response {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : String(e);
  console.error('[api] unhandled error:', message);
  const debug = process.env.DEBUG_ERRORS_SECRET;
  const reveal = Boolean(debug && req && req.headers.get('x-debug-errors') === debug);
  return Response.json({ error: 'Something went wrong.', ...(reveal ? { detail: message.slice(0, 500) } : {}) }, { status: 500 });
}
