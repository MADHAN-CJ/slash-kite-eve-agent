import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '#lib/db/client.js';
import { users } from '#lib/db/mcp-schema.js';
import { mcpGrants, messages, sessionContext, threads } from '#lib/db/schema.js';
import { decryptSecret, encryptSecret } from '#lib/db/crypto.js';

/**
 * Round-trip smoke test for the shared schema + crypto (run: npm run db:smoke).
 * Creates an MCP user (public.users) → cached MCP token (eve.mcp_grants,
 * encrypted) → thread + message + session_context, reads everything back,
 * then deletes the user (the cross-schema FKs cascade).
 */
async function main() {
  const email = `smoke-${randomUUID().slice(0, 8)}@example.com`;

  const [user] = await db().insert(users).values({ email }).returning();
  console.log('user:', user.id, user.email);

  await db().insert(mcpGrants).values({
    userId: user.id,
    issuer: 'https://mcp.example.test',
    accessTokenEnc: encryptSecret('smoke-access'),
    accessExpiresAt: new Date(Date.now() + 3600_000),
  });
  const grant = await db().query.mcpGrants.findFirst({ where: eq(mcpGrants.userId, user.id) });
  if (!grant || decryptSecret(grant.accessTokenEnc) !== 'smoke-access') throw new Error('grant round-trip failed');
  console.log('mcp token cache: encrypted round-trip OK');

  const eveSessionId = `wrun_SMOKE${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  await db().insert(sessionContext).values({ eveSessionId, userId: user.id });
  const [thread] = await db()
    .insert(threads)
    .values({ eveSessionId, userId: user.id, title: 'Smoke' })
    .returning();
  await db()
    .insert(messages)
    .values({ threadId: thread.id, turnSequence: 0, role: 'user', content: 'How is my portfolio?' });
  const msgs = await db().select().from(messages).where(eq(messages.threadId, thread.id));
  console.log('thread:', thread.id, '→', msgs.length, 'message(s)');

  await db().delete(sessionContext).where(eq(sessionContext.eveSessionId, eveSessionId));
  await db().delete(users).where(eq(users.id, user.id)); // cascades grant/thread/message across schemas
  const left = await db().query.threads.findFirst({ where: eq(threads.id, thread.id) });
  if (left) throw new Error('cross-schema cascade did not remove the thread');
  console.log('cleanup OK — schema smoke passed');
  process.exit(0);
}

main().catch((e) => {
  console.error('db-smoke failed:', e);
  process.exit(1);
});
