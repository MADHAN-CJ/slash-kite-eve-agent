import { eq } from 'drizzle-orm';
import { db } from '@/agent/lib/db/client';
import { brokerConnections, type BrokerConnectionStatus } from '@/agent/lib/db/mcp-schema';
import { invalidateSession, kiteApiKey, type KiteSession, nextTokenExpiry } from './kite';
import { decryptFromMcp, encryptForMcp } from './mcp-crypto';
import { sql } from 'drizzle-orm';

/**
 * The user's Zerodha connection, read and written in the MCP's own
 * `broker_connections` table (plan D15/D17) so the MCP's tools see exactly
 * what this app shows. The access token is encrypted with the MCP's key.
 * `status` is what the UI gates on: only `active` means the agent can read
 * Zerodha data; everything else shows the Login-with-Kite prompt.
 */

export type BrokerStatusValue = BrokerConnectionStatus | 'not_connected';

export interface BrokerStatus {
  status: BrokerStatusValue;
  kiteUserId: string | null;
  userName: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  /** Kite Connect api_key, for the Kite Publisher button (public by design). */
  publisherApiKey: string | null;
}

export async function brokerStatus(userId: string): Promise<BrokerStatus> {
  const row = await db().query.brokerConnections.findFirst({ where: eq(brokerConnections.userId, userId) });
  const publisherApiKey = kiteApiKey();
  if (!row) {
    return { status: 'not_connected', kiteUserId: null, userName: null, connectedAt: null, expiresAt: null, publisherApiKey };
  }
  // A session past its 06:00 IST end is expired even if the MCP's sweeper
  // has not flipped the row yet.
  const expired = row.status === 'active' && row.expiresAt !== null && row.expiresAt.getTime() <= Date.now();
  return {
    status: expired ? 'token_expired' : row.status,
    kiteUserId: row.kiteUserId,
    userName: row.userName,
    connectedAt: row.connectedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    publisherApiKey,
  };
}

/** Store a fresh Kite session and re-arm the user's watchers that the broker outage paused. */
export async function storeSession(userId: string, session: KiteSession): Promise<void> {
  const expiresAt = nextTokenExpiry();
  await db()
    .insert(brokerConnections)
    .values({
      userId,
      kiteUserId: session.userId,
      userName: session.userName,
      accessTokenEnc: encryptForMcp(session.accessToken),
      status: 'active',
      connectedAt: new Date(),
      expiresAt,
      tokenMailSentOn: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: brokerConnections.userId,
      set: {
        kiteUserId: session.userId,
        userName: session.userName,
        accessTokenEnc: encryptForMcp(session.accessToken),
        status: 'active',
        connectedAt: new Date(),
        expiresAt,
        tokenMailSentOn: null,
        updatedAt: new Date(),
      },
    });
  // Same statement the MCP's web app ran (watchers is an MCP-owned table).
  await db().execute(sql`
    UPDATE watchers SET status = 'ARMED', paused_by = NULL, status_reason = NULL, error_count = 0,
      updated_at = now()
    WHERE user_id = ${userId} AND status = 'PAUSED' AND paused_by = 'broker' AND expires_at > now()`);
}

export async function disconnect(userId: string): Promise<void> {
  const row = await db().query.brokerConnections.findFirst({ where: eq(brokerConnections.userId, userId) });
  if (row?.status === 'active' && row.accessTokenEnc) {
    await invalidateSession(decryptFromMcp(row.accessTokenEnc));
  }
  await db()
    .update(brokerConnections)
    .set({ status: 'disconnected', accessTokenEnc: null, updatedAt: new Date() })
    .where(eq(brokerConnections.userId, userId));
  await db().execute(sql`
    UPDATE watchers SET status = 'PAUSED', paused_by = 'broker',
      status_reason = ${'Zerodha is disconnected. Log in to Zerodha again, then resume.'}, updated_at = now()
    WHERE user_id = ${userId} AND status = 'ARMED'`);
}
