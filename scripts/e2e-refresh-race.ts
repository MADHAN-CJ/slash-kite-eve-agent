import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from '#lib/db/client.js';
import { mcpGrants, users } from '#lib/db/schema.js';
import { accessTokenFor } from '#lib/mcp/oauth.js';

/**
 * Cross-process refresh race: forces the grant of MCP_TEST_EMAIL (default
 * DEV_LOGIN_EMAIL) to "about to expire", then has N separate node processes
 * call accessTokenFor at once. The MCP rotates refresh tokens, so without the
 * row lock exactly one would win and the rest would mark the grant expired.
 * Expected: every process gets the SAME fresh token and the grant stays active.
 * Usage: tsx scripts/e2e-refresh-race.ts   (child mode: --child <userId>)
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

async function main() {
  if (process.argv[2] === '--child') return child(process.argv[3]);
  const email = (process.env.MCP_TEST_EMAIL ?? process.env.DEV_LOGIN_EMAIL ?? '').toLowerCase();
  const user = await db().query.users.findFirst({ where: eq(users.email, email) });
  if (!user) throw new Error(`no app user ${email}`);
  const before = await db().query.mcpGrants.findFirst({ where: eq(mcpGrants.userId, user.id) });
  if (!before || before.status !== 'active') throw new Error(`${email} has no active grant — connect /markets in the app first`);
  await db().update(mcpGrants).set({ accessExpiresAt: new Date(Date.now() + 30_000) }).where(eq(mcpGrants.userId, user.id));

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
  const after = await db().query.mcpGrants.findFirst({ where: eq(mcpGrants.userId, user.id) });
  const errors = results.filter((r) => r.startsWith('ERROR') || !r);
  const distinct = new Set(results.filter((r) => !r.startsWith('ERROR')));
  console.log(`${N} processes → ${errors.length} errors, ${distinct.size} distinct token(s), grant status ${after?.status}, expires ${after?.accessExpiresAt.toISOString()}`);
  for (const e of errors) console.log('  ', e);
  const ok = errors.length === 0 && distinct.size === 1 && after?.status === 'active' && after.accessExpiresAt.getTime() > Date.now() + 30 * 60_000;
  console.log(ok ? 'PASS: one refresh, every process got it, grant active' : 'FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
