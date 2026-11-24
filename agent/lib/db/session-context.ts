import { eq } from 'drizzle-orm';
import { db } from './client';
import { sessionContext } from './schema';

/**
 * Per-session ownership. WRITTEN only by the eve proxy (before forwarding
 * each send), READ only by the MCP connection's token resolver
 * (agent/lib/mcp/token.ts) and the persist hook's owner backfill. No secret
 * lives here — grants stay in mcp_grants, looked up by userId at call time.
 */

export async function upsertSessionContext(eveSessionId: string, userId: string): Promise<void> {
  await db()
    .insert(sessionContext)
    .values({ eveSessionId, userId })
    .onConflictDoUpdate({
      target: sessionContext.eveSessionId,
      set: { userId, updatedAt: new Date() },
    });
}

/**
 * Ownership for a session. Distinguishes "no row" (a direct `eve dev` send
 * with no proxy) from a lookup FAILURE, which callers treat as fail-closed:
 * never run a turn against another user's grant.
 */
export async function getSessionContext(
  eveSessionId: string,
): Promise<{ status: 'found'; userId: string } | { status: 'none' } | { status: 'error' }> {
  try {
    const row = await db().query.sessionContext.findFirst({
      where: eq(sessionContext.eveSessionId, eveSessionId),
    });
    if (!row) return { status: 'none' };
    return { status: 'found', userId: row.userId };
  } catch (e) {
    console.error('[session-context] lookup failed:', e instanceof Error ? e.message : e);
    return { status: 'error' };
  }
}
