import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { mcpGrants } from '../db/schema';
import { decryptSecret, encryptSecret } from '../db/crypto';

/**
 * Per-user cache of the MCP access token minted with the trusted-app grant
 * (plan D16). AES-256-GCM at rest; this module is the only place it is
 * decrypted, and only the connection's token resolver calls it. A missing
 * row simply means "mint one" — there is no expired/needs-reconnect state.
 */

export interface GrantTokens {
  accessToken: string;
  accessExpiresAt: Date;
  scope: string | null;
}

export async function saveGrant(userId: string, issuer: string, t: GrantTokens): Promise<void> {
  const values = {
    issuer,
    accessTokenEnc: encryptSecret(t.accessToken),
    accessExpiresAt: t.accessExpiresAt,
    scope: t.scope,
    updatedAt: new Date(),
  };
  await db()
    .insert(mcpGrants)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: mcpGrants.userId, set: values });
}

export async function getGrant(userId: string): Promise<(GrantTokens & { issuer: string }) | null> {
  const row = await db().query.mcpGrants.findFirst({ where: eq(mcpGrants.userId, userId) });
  if (!row) return null;
  return {
    issuer: row.issuer,
    accessToken: decryptSecret(row.accessTokenEnc),
    accessExpiresAt: row.accessExpiresAt,
    scope: row.scope,
  };
}

/** Logout: drop the cached token. The next tool call for this user mints a fresh one. */
export async function deleteGrant(userId: string): Promise<void> {
  await db().delete(mcpGrants).where(eq(mcpGrants.userId, userId));
}
