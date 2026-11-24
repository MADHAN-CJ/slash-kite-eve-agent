import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { decryptSecret, encryptSecret } from '../db/crypto';
import { mcpAuthTxns, mcpClients } from '../db/schema';
import { deleteGrant, getGrant, markGrantExpired, saveGrant, type GrantTokens } from './grants';

/**
 * OAuth 2.1 client for the Kite MCP (plan D3/D4). This app is a public
 * client (PKCE S256, no client secret) registered once per MCP origin via
 * dynamic client registration. Every app user runs the authorization-code
 * flow against the MCP's own login page; the resulting access/refresh pair
 * is stored per user and refreshed here. The MCP is never modified.
 */

export class McpOAuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_connected' | 'refresh_failed' | 'exchange_failed' | 'discovery_failed' | 'invalid_state',
  ) {
    super(message);
  }
}

export interface AsMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export const SCOPE = 'kite:read';
const TXN_TTL_MS = 10 * 60 * 1000;
/** Refresh when the access token has less than this left. */
const REFRESH_SKEW_MS = 2 * 60 * 1000;
const CLIENT_NAME = '/markets · Kite edition on eve';

export function mcpIssuer(): string {
  return (process.env.KITE_MCP_URL ?? 'https://mcp.slash.markets').replace(/\/$/, '');
}

export function redirectUri(): string {
  const base = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/mcp/callback`;
}

// --- Discovery (RFC 8414; falls back through RFC 9728 protected-resource metadata) ---

const metadataCache = new Map<string, { value: AsMetadata; at: number }>();
const METADATA_TTL_MS = 60 * 60 * 1000;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function discover(issuer = mcpIssuer()): Promise<AsMetadata> {
  const cached = metadataCache.get(issuer);
  if (cached && Date.now() - cached.at < METADATA_TTL_MS) return cached.value;

  let as = await fetchJson<AsMetadata>(`${issuer}/.well-known/oauth-authorization-server`);
  if (!as) {
    const prm = await fetchJson<{ authorization_servers?: string[] }>(`${issuer}/.well-known/oauth-protected-resource`);
    const server = prm?.authorization_servers?.[0]?.replace(/\/$/, '');
    if (server) as = await fetchJson<AsMetadata>(`${server}/.well-known/oauth-authorization-server`);
  }
  if (!as?.authorization_endpoint || !as.token_endpoint) {
    throw new McpOAuthError(`Could not discover the OAuth server at ${issuer}.`, 'discovery_failed');
  }
  metadataCache.set(issuer, { value: as, at: Date.now() });
  return as;
}

// --- Client registration (RFC 7591), once per issuer ---

interface ClientRecord {
  clientId: string;
  clientSecret: string | null;
}

export async function ensureClient(issuer = mcpIssuer()): Promise<ClientRecord> {
  const uri = redirectUri();
  const existing = await db().query.mcpClients.findFirst({ where: eq(mcpClients.issuer, issuer) });
  if (existing && existing.redirectUri === uri) {
    return { clientId: existing.clientId, clientSecret: existing.clientSecretEnc ? decryptSecret(existing.clientSecretEnc) : null };
  }
  const as = await discover(issuer);
  if (!as.registration_endpoint) {
    throw new McpOAuthError('The OAuth server does not offer dynamic client registration.', 'discovery_failed');
  }
  const res = await fetch(as.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: CLIENT_NAME,
      redirect_uris: [uri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as { client_id?: string; client_secret?: string; error?: string } | null;
  if (!res.ok || !body?.client_id) {
    throw new McpOAuthError(`Client registration failed (${res.status}${body?.error ? `: ${body.error}` : ''}).`, 'discovery_failed');
  }
  const values = {
    clientId: body.client_id,
    clientSecretEnc: body.client_secret ? encryptSecret(body.client_secret) : null,
    redirectUri: uri,
    registeredAt: new Date(),
  };
  await db()
    .insert(mcpClients)
    .values({ issuer, ...values })
    .onConflictDoUpdate({ target: mcpClients.issuer, set: values });
  return { clientId: body.client_id, clientSecret: body.client_secret ?? null };
}

// --- Authorization code + PKCE ---

const b64url = (buf: Buffer) => buf.toString('base64url');

/** Build the authorize URL for a user; the PKCE verifier stays in mcp_auth_txns. */
export async function startAuthorization(userId: string, issuer = mcpIssuer()): Promise<string> {
  const [as, client] = await Promise.all([discover(issuer), ensureClient(issuer)]);
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  await db().delete(mcpAuthTxns).where(and(eq(mcpAuthTxns.userId, userId), lt(mcpAuthTxns.expiresAt, new Date())));
  await db().insert(mcpAuthTxns).values({
    state,
    userId,
    issuer,
    codeVerifier: verifier,
    expiresAt: new Date(Date.now() + TXN_TTL_MS),
  });
  const url = new URL(as.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', client.clientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('resource', `${issuer}/`);
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(issuer: string, params: Record<string, string>): Promise<TokenResponse & { ok: boolean; status: number }> {
  const [as, client] = await Promise.all([discover(issuer), ensureClient(issuer)]);
  const form = new URLSearchParams({ ...params, client_id: client.clientId });
  if (client.clientSecret) form.set('client_secret', client.clientSecret);
  const res = await fetch(as.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const body = ((await res.json().catch(() => null)) as TokenResponse | null) ?? {};
  return { ...body, ok: res.ok, status: res.status };
}

function toGrant(t: TokenResponse): GrantTokens {
  if (!t.access_token) throw new McpOAuthError('Token response had no access token.', 'exchange_failed');
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    accessExpiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
    scope: t.scope ?? null,
  };
}

/** Callback: validate state, exchange the code, store the grant. Returns the user id. */
export async function completeAuthorization(state: string, code: string): Promise<string> {
  const txn = await db().query.mcpAuthTxns.findFirst({
    where: and(eq(mcpAuthTxns.state, state), gt(mcpAuthTxns.expiresAt, new Date())),
  });
  if (!txn) throw new McpOAuthError('This sign-in link has expired — start again from the app.', 'invalid_state');
  await db().delete(mcpAuthTxns).where(eq(mcpAuthTxns.state, state));
  const t = await tokenRequest(txn.issuer, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: txn.codeVerifier,
  });
  if (!t.ok) {
    throw new McpOAuthError(`Token exchange failed (${t.status}${t.error ? `: ${t.error}` : ''}).`, 'exchange_failed');
  }
  await saveGrant(txn.userId, txn.issuer, toGrant(t));
  return txn.userId;
}

// --- Access tokens for the connection (single-flight refresh per user) ---

const inflight = new Map<string, Promise<string>>();

/**
 * A usable access token for the user, refreshing when it is about to expire.
 * Throws McpOAuthError('not_connected') when there is no grant, and
 * 'refresh_failed' (grant marked expired) when the MCP rejects the refresh —
 * both mean "the user must reconnect /markets", never a silent fallback.
 */
export async function accessTokenFor(userId: string): Promise<string> {
  const grant = await getGrant(userId);
  if (!grant || grant.status !== 'active') {
    throw new McpOAuthError('Not connected to /markets — reconnect from the app.', 'not_connected');
  }
  if (grant.accessExpiresAt.getTime() - Date.now() > REFRESH_SKEW_MS) return grant.accessToken;
  if (!grant.refreshToken) {
    await markGrantExpired(userId);
    throw new McpOAuthError('The /markets connection expired — reconnect from the app.', 'refresh_failed');
  }
  const pending = inflight.get(userId);
  if (pending) return pending;
  const work = (async () => {
    try {
      const t = await tokenRequest(grant.issuer, { grant_type: 'refresh_token', refresh_token: grant.refreshToken as string });
      if (!t.ok) {
        await markGrantExpired(userId);
        throw new McpOAuthError(`The /markets connection expired (${t.error ?? t.status}) — reconnect from the app.`, 'refresh_failed');
      }
      const next = toGrant(t);
      // Servers that don't rotate keep the old refresh token valid.
      if (!next.refreshToken) next.refreshToken = grant.refreshToken;
      await saveGrant(userId, grant.issuer, next);
      return next.accessToken;
    } finally {
      inflight.delete(userId);
    }
  })();
  inflight.set(userId, work);
  return work;
}

export interface ConnectionStatus {
  connected: boolean;
  issuer: string;
  status: 'active' | 'expired' | 'none';
  accessExpiresAt: string | null;
}

export async function connectionStatus(userId: string): Promise<ConnectionStatus> {
  const grant = await getGrant(userId);
  if (!grant) return { connected: false, issuer: mcpIssuer(), status: 'none', accessExpiresAt: null };
  return {
    connected: grant.status === 'active',
    issuer: grant.issuer,
    status: grant.status,
    accessExpiresAt: grant.accessExpiresAt.toISOString(),
  };
}

export async function disconnect(userId: string): Promise<void> {
  await deleteGrant(userId);
}
