import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { db } from '../db/client';
import { decryptSecret, encryptSecret } from '../db/crypto';
import { mcpGrants } from '../db/schema';
import { deleteGrant, getGrant, type GrantTokens } from './grants';

/**
 * Trusted-app access to the /markets Kite MCP (plan D16). This app and the
 * MCP share one database, so an app user IS an MCP user (same `users` row).
 * Instead of sending the user through the MCP's own login page, the server
 * mints the user's MCP access token with the RFC 7523 JWT-bearer grant: a
 * short-lived assertion signed with a secret shared with the MCP, naming the
 * user (`sub`) and this confidential client. The MCP verifies it and issues an
 * access token (1 h, no refresh token) which is cached per user and re-minted
 * on demand. The user never sees any of this.
 */

export class McpOAuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_configured' | 'discovery_failed' | 'mint_failed',
  ) {
    super(message);
  }
}

export interface AsMetadata {
  issuer: string;
  token_endpoint: string;
  grant_types_supported?: string[];
}

export const SCOPE = 'kite:read';
export const JWT_BEARER = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
/** Re-mint when the cached token has less than this left. */
const REFRESH_SKEW_MS = 2 * 60 * 1000;
const ASSERTION_TTL_S = 60;

export function mcpIssuer(): string {
  return (process.env.KITE_MCP_URL ?? 'https://mcp.slash.markets').replace(/\/$/, '');
}

interface TrustedClient {
  clientId: string;
  clientSecret: string;
  assertionKey: Uint8Array;
}

/** The confidential client the MCP knows this deployment as (its env: ZAP_KITE_MCP_TRUSTED_CLIENT_*). */
export function trustedClient(): TrustedClient {
  const clientId = process.env.MCP_TRUSTED_CLIENT_ID?.trim();
  const clientSecret = process.env.MCP_TRUSTED_CLIENT_SECRET?.trim();
  const assertionSecret = process.env.MCP_ASSERTION_SECRET?.trim();
  if (!clientId || !clientSecret || !assertionSecret || assertionSecret.length < 32) {
    throw new McpOAuthError(
      'MCP_TRUSTED_CLIENT_ID, MCP_TRUSTED_CLIENT_SECRET and MCP_ASSERTION_SECRET (≥32 chars) must be set.',
      'not_configured',
    );
  }
  return { clientId, clientSecret, assertionKey: new TextEncoder().encode(assertionSecret) };
}

// --- Discovery (RFC 8414; falls back through RFC 9728 protected-resource metadata) ---

const metadataCache = new Map<string, { value: AsMetadata; at: number }>();
const METADATA_TTL_MS = 60 * 60 * 1000;

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
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
  if (!as?.token_endpoint) {
    throw new McpOAuthError(`Could not discover the OAuth server at ${issuer}.`, 'discovery_failed');
  }
  metadataCache.set(issuer, { value: as, at: Date.now() });
  return as;
}

// --- Minting (RFC 7523 §2.1 jwt-bearer) ---

/** The signed assertion for one user: 60 s life, single-use `jti`, audience = the MCP issuer. */
export async function buildAssertion(userId: string, issuer = mcpIssuer()): Promise<string> {
  const client = trustedClient();
  return new SignJWT({ client_id: client.clientId, resource: `${issuer}/`, scope: SCOPE })
    .setProtectedHeader({ alg: 'HS256', typ: 'oauth-id-jag+jwt' })
    .setIssuer(client.clientId)
    .setSubject(userId)
    .setAudience(issuer)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ASSERTION_TTL_S}s`)
    .sign(client.assertionKey);
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function mintAccessToken(userId: string, issuer = mcpIssuer()): Promise<GrantTokens> {
  const [as, client, assertion] = await Promise.all([discover(issuer), Promise.resolve(trustedClient()), buildAssertion(userId, issuer)]);
  const form = new URLSearchParams({
    grant_type: JWT_BEARER,
    assertion,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    scope: SCOPE,
    resource: `${issuer}/`,
  });
  const res = await fetch(as.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const body = ((await res.json().catch(() => null)) as TokenResponse | null) ?? {};
  if (!res.ok || !body.access_token) {
    throw new McpOAuthError(
      `The MCP refused to issue a token (${res.status}${body.error ? `: ${body.error}` : ''}${body.error_description ? ` — ${body.error_description}` : ''}).`,
      'mint_failed',
    );
  }
  return {
    accessToken: body.access_token,
    accessExpiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
    scope: body.scope ?? null,
  };
}

// --- Access tokens for the connection (minting serialized across processes) ---

const inflight = new Map<string, Promise<string>>();

function fresh(expiresAt: Date): boolean {
  return expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS;
}

/**
 * A usable MCP access token for the user: the cached one while it has more
 * than two minutes left, otherwise a freshly minted one. Minting is
 * serialized per user across processes with a transaction-scoped advisory
 * lock, so a burst of parallel tool calls (vitest workers, several eve
 * instances) produces one token, not one per caller. Failures are
 * configuration/server problems and surface as McpOAuthError — there is no
 * user action that fixes them, unlike the Kite session (see lib/server/broker).
 */
export async function accessTokenFor(userId: string): Promise<string> {
  const grant = await getGrant(userId);
  if (grant && fresh(grant.accessExpiresAt)) return grant.accessToken;

  const pending = inflight.get(userId);
  if (pending) return pending;
  const work = mintUnderLock(userId).finally(() => inflight.delete(userId));
  inflight.set(userId, work);
  return work;
}

async function mintUnderLock(userId: string): Promise<string> {
  const issuer = mcpIssuer();
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`mcp-grant:${userId}`}))`);
    const locked = await tx.execute(sql`
      select access_token_enc, access_expires_at from ${mcpGrants} where ${mcpGrants.userId} = ${userId}`);
    const row = locked.rows[0] as { access_token_enc: string; access_expires_at: Date | string } | undefined;
    // Another process minted while we waited for the lock: use its token.
    if (row && fresh(new Date(row.access_expires_at))) return decryptSecret(row.access_token_enc);

    const next = await mintAccessToken(userId, issuer);
    const values = {
      issuer,
      accessTokenEnc: encryptSecret(next.accessToken),
      accessExpiresAt: next.accessExpiresAt,
      scope: next.scope,
      updatedAt: new Date(),
    };
    await tx.insert(mcpGrants).values({ userId, ...values }).onConflictDoUpdate({ target: mcpGrants.userId, set: values });
    return next.accessToken;
  });
}

/** Logout: forget the cached token (the next call mints a new one). */
export async function dropGrant(userId: string): Promise<void> {
  await deleteGrant(userId);
}
