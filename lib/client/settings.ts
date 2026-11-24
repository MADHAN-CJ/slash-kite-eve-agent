/**
 * Client-side Zap session: the JWT from email-OTP login, stored in this
 * browser's localStorage and sent as a Bearer header on every request. The
 * token is the ONLY secret the browser ever holds — the MCP grant and the
 * Anthropic key live server-side. Clearing it logs out locally; server-side
 * threads are untouched and return on the next login with the same email.
 */

const TOKEN_STORAGE = 'slash_kite.token';
const USER_STORAGE = 'slash_kite.user';

export interface SessionUser {
  id: string;
  email: string;
}

export function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(TOKEN_STORAGE) ?? '';
}

export function getUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: SessionUser): void {
  localStorage.setItem(TOKEN_STORAGE, token);
  localStorage.setItem(USER_STORAGE, JSON.stringify(user));
}

/**
 * Sign out: ask the server to drop this user's MCP grant (plan D4 — the
 * connection to /markets ends with the app session), then forget the JWT.
 * The local session is cleared even if the server call fails.
 */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() });
  } catch {
    // offline — the grant is unreachable anyway; it expires on its own
  } finally {
    clearSession();
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_STORAGE);
  localStorage.removeItem(USER_STORAGE);
}

export function isLoggedIn(): boolean {
  return getToken().length > 0;
}

/** Headers attached to every API and eve-proxy request. */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function jsonError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export async function requestOtp(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/request-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: await jsonError(res, 'Could not send the code.') };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

export async function verifyOtp(
  email: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) return { ok: false, error: await jsonError(res, 'Invalid or expired code.') };
    const body = (await res.json()) as { token: string; user: SessionUser };
    setSession(body.token, body.user);
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}
