import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { db } from '#lib/db/client.js';
import { users } from '#lib/db/mcp-schema.js';
import { mcpGrants } from '#lib/db/schema.js';
import { accessTokenFor } from '#lib/mcp/oauth.js';

/**
 * Cross-process minting race (plan D16): drops the cached MCP token of
 * MCP_TEST_EMAIL (default DEV_LOGIN_EMAIL), then has N separate node processes
 * call accessTokenFor at once against a running MCP. Expected: every process
 * gets the SAME token and the MCP issued exactly ONE new access token (we
 * share its database, so we can count `oauth_tokens` rows for the subject).
 * Usage: tsx scripts/e2e-mint-race.ts   (child mode: --child <userId>)
 */
const N = Number(process.env.RACE_PROCESSES ?? 6);

async function child(userId: string) {
  try {
    process.stdout.write(`${await accessTokenFor(userId)}\n`);
    process.exit(0);
  } catch (e) {
    process.stdout.write(`ERROR ${e instanceof Error ? e.message : e}\n`);
    process.exit(1);
  }
}

async function issuedTokens(userId: string): Promise<number> {
  const r = await db().execute(
    sql`select count(*)::int as n from oauth_tokens where kind = 'access' and data->>'subject' = ${userId}`,
  );
  return (r.rows[0] as { n: number }).n;
}

async function main() {
  if (process.argv[2] === '--child') return child(process.argv[3]);
  const email = (process.env.MCP_TEST_EMAIL ?? process.env.DEV_LOGIN_EMAIL ?? '').toLowerCase();
  const user = await db().query.users.findFirst({ where: eq(users.email, email) });
  if (!user) throw new Error(`no user ${email} — log into the app once first`);
  await db().delete(mcpGrants).where(eq(mcpGrants.userId, user.id));
  const before = await issuedTokens(user.id);

  const self = fileURLToPath(import.meta.url);
  const runs = Array.from({ length: N }, () =>
    new Promise<string>((resolve) => {
      const p = spawn(process.execPath, ['--import', 'tsx', self, '--child', user.id], { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      p.stdout.on('data', (d: Buffer) => (out += d.toString()));
      p.on('close', () => resolve(out.trim()));
    }),
  );
  const results = await Promise.all(runs);
  const after = await issuedTokens(user.id);
  const grant = await db().query.mcpGrants.findFirst({ where: eq(mcpGrants.userId, user.id) });
  const errors = results.filter((r) => r.startsWith('ERROR') || !r);
  const distinct = new Set(results.filter((r) => !r.startsWith('ERROR')));
  console.log(`${N} processes → ${errors.length} errors, ${distinct.size} distinct token(s), MCP issued ${after - before}, cache expires ${grant?.accessExpiresAt.toISOString()}`);
  for (const e of errors) console.log('  ', e);
  const ok = errors.length === 0 && distinct.size === 1 && after - before === 1 && Boolean(grant);
  console.log(ok ? 'PASS: one mint, every process got it' : 'FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
