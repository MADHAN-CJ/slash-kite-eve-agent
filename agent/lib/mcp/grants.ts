import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { mcpGrants, type McpGrantRow } from '../db/schema';
import { decryptSecret, encryptSecret } from '../db/crypto';

/**
 * Storage for a user's OAuth grant on the Kite MCP. Tokens are AES-256-GCM
 * at rest; this module is the only place they are decrypted, and only the
 * connection's token resolver and the /api/mcp routes call it.
 */

export interface GrantTokens {
  accessToken: string;
  refreshToken: string | null;
  accessExpiresAt: Date;
  scope: string | null;
}

export async function saveGrant(userId: string, issuer: string, t: GrantTokens): Promise<void> {
  const values = {
    issuer,
    accessTokenEnc: encryptSecret(t.accessToken),
    refreshTokenEnc: t.refreshToken ? encryptSecret(t.refreshToken) : null,
    accessExpiresAt: t.accessExpiresAt,
    scope: t.scope,
    status: 'active' as const,
    updatedAt: new Date(),
  };
  await db()
    .insert(mcpGrants)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: mcpGrants.userId, set: values });
}

export async function getGrant(userId: string): Promise<(GrantTokens & { issuer: string; status: McpGrantRow['status'] }) | null> {
  const row = await db().query.mcpGrants.findFirst({ where: eq(mcpGrants.userId, userId) });
  if (!row) return null;
  return {
    issuer: row.issuer,
    status: row.status,
    accessToken: decryptSecret(row.accessTokenEnc),
    refreshToken: row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) : null,
    accessExpiresAt: row.accessExpiresAt,
    scope: row.scope,
  };
}

/** The MCP has no revocation endpoint: forgetting the refresh token IS the revocation. */
export async function deleteGrant(userId: string): Promise<void> {
  await db().delete(mcpGrants).where(eq(mcpGrants.userId, userId));
}

export async function markGrantExpired(userId: string): Promise<void> {
  await db().update(mcpGrants).set({ status: 'expired', updatedAt: new Date() }).where(eq(mcpGrants.userId, userId));
}
