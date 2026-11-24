import { authHeaders } from './settings';

/**
 * Client for the /markets MCP connection routes. The browser never sees a
 * token — it only learns whether the connection is usable and where to go to
 * (re)establish it.
 */
export interface McpStatus {
  connected: boolean;
  issuer: string;
  status: 'active' | 'expired' | 'none';
  accessExpiresAt: string | null;
}

export class SessionExpiredError extends Error {}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new SessionExpiredError('Session expired');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const getMcpStatus = async (): Promise<McpStatus> =>
  handle<McpStatus>(await fetch('/api/mcp/status', { headers: authHeaders(), cache: 'no-store' }));

/** Starts the OAuth flow: the browser leaves for the MCP's login page and returns to `/?mcp=…`. */
export async function startMcpConnect(): Promise<void> {
  const { url } = await handle<{ url: string }>(await fetch('/api/mcp/start', { method: 'POST', headers: authHeaders() }));
  window.location.assign(url);
}

export const disconnectMcp = async (): Promise<void> => {
  await handle<{ ok: true }>(await fetch('/api/mcp/disconnect', { method: 'POST', headers: authHeaders() }));
};

/** The `?mcp=connected|error&reason=` the callback lands with; cleared from the URL once read. */
export function consumeMcpReturn(): { outcome: 'connected' } | { outcome: 'error'; reason: string } | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const mcp = url.searchParams.get('mcp');
  if (!mcp) return null;
  const reason = url.searchParams.get('reason') ?? 'unknown';
  url.searchParams.delete('mcp');
  url.searchParams.delete('reason');
  window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
  return mcp === 'connected' ? { outcome: 'connected' } : { outcome: 'error', reason };
}
