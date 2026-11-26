import { authHeaders } from './settings';

/**
 * Client for the Zerodha connection routes. The browser never sees a token —
 * it learns the connection status, where to go to log in to Zerodha, and
 * reads the `?kite=` outcome the callback lands with.
 */

export type BrokerStatusValue = 'active' | 'token_expired' | 'disconnected' | 'not_connected';

export interface BrokerStatus {
  status: BrokerStatusValue;
  kiteUserId: string | null;
  userName: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  publisherApiKey: string | null;
}

export class SessionExpiredError extends Error {}

export async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new SessionExpiredError('Session expired');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const getBrokerStatus = async (): Promise<BrokerStatus> =>
  handle<BrokerStatus>(await fetch('/api/broker', { headers: authHeaders(), cache: 'no-store' }));

/** Starts the Zerodha login: the browser leaves for Kite and returns to `/?kite=…`. */
export async function startKiteLogin(): Promise<void> {
  const { loginUrl } = await handle<{ loginUrl: string }>(
    await fetch('/api/broker/kite/login/start', { method: 'POST', headers: authHeaders() }),
  );
  window.location.assign(loginUrl);
}

export const disconnectBroker = async (): Promise<BrokerStatus> =>
  handle<BrokerStatus>(await fetch('/api/broker', { method: 'DELETE', headers: authHeaders() }));

/** The `?kite=connected|error&reason=` the callback lands with; cleared from the URL once read. */
export function consumeKiteReturn(): { outcome: 'connected' } | { outcome: 'error'; reason: string } | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const kite = url.searchParams.get('kite');
  if (!kite) return null;
  const reason = url.searchParams.get('reason') ?? 'unknown';
  url.searchParams.delete('kite');
  url.searchParams.delete('reason');
  window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
  return kite === 'connected' ? { outcome: 'connected' } : { outcome: 'error', reason };
}

export function describeStatus(s: BrokerStatus): string {
  switch (s.status) {
    case 'active':
      return `Zerodha connected${s.userName ? ` as ${s.userName}` : ''}${s.kiteUserId ? ` (${s.kiteUserId})` : ''}`;
    case 'token_expired':
      return 'Your Zerodha session has ended — Kite sessions end every morning. Log in again to continue.';
    case 'disconnected':
      return 'Zerodha was disconnected from this account. Log in again to continue.';
    default:
      return 'Zerodha is not connected to this account yet.';
  }
}
