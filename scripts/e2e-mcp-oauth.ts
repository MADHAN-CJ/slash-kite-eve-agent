import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '#lib/db/client.js';
import { mcpGrants, users } from '#lib/db/schema.js';
import { accessTokenFor } from '#lib/mcp/oauth.js';

/**
 * P2 e2e: drives the real OAuth flow against the MCP named by KITE_MCP_URL
 * through a running app (`npm run dev` on APP_BASE_URL), completing the MCP's
 * own email+OTP login with MCP_TEST_EMAIL / MCP_TEST_CODE (the MCP's dev
 * login on staging). Then forces expiry and checks the refresh path, and
 * checks disconnect. Usage: tsx scripts/e2e-mcp-oauth.ts
 */
const APP = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.DEV_LOGIN_EMAIL ?? 'test@slash.markets';
const CODE = process.env.DEV_LOGIN_CODE ?? '123456';
const MCP_EMAIL = process.env.MCP_TEST_EMAIL ?? EMAIL;
const MCP_CODE = process.env.MCP_TEST_CODE ?? CODE;

let n = 0;
function check(label: string, ok: boolean, detail = ''): void {
  n += 1;
  console.log(`${ok ? '✓' : '✗'} ${n}. ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) {
    console.error('FAILED');
    process.exit(1);
  }
}
const noRedirect = { redirect: 'manual' as const };
const form = (o: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(o),
  ...noRedirect,
});

async function main() {
  // 1. app login
  const v = await fetch(`${APP}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, code: CODE }),
  });
  const { token, user } = (await v.json()) as { token: string; user: { id: string } };
  check('app login', v.ok && Boolean(token));
  const auth = { authorization: `Bearer ${token}` };

  // 2. status before
  let st = (await (await fetch(`${APP}/api/mcp/status`, { headers: auth })).json()) as { connected: boolean; status: string };
  await fetch(`${APP}/api/mcp/disconnect`, { method: 'POST', headers: auth });
  st = (await (await fetch(`${APP}/api/mcp/status`, { headers: auth })).json()) as { connected: boolean; status: string };
  check('status before = none', !st.connected && st.status === 'none', JSON.stringify(st));

  // 3. start → authorize URL
  const s = await fetch(`${APP}/api/mcp/start`, { method: 'POST', headers: auth });
  const { url } = (await s.json()) as { url: string };
  check('start returns authorize URL', s.ok && url.includes('/authorize?'), url.slice(0, 80));
  const authUrl = new URL(url);
  check('PKCE S256 + state present', authUrl.searchParams.get('code_challenge_method') === 'S256' && Boolean(authUrl.searchParams.get('state')));

  // 4. MCP authorize → redirects to its login page with a txn
  const a = await fetch(url, noRedirect);
  const loginLoc = a.headers.get('location') ?? '';
  check('authorize → /login?txn', a.status >= 300 && a.status < 400 && loginLoc.includes('/login?txn='), `${a.status} ${loginLoc.slice(0, 80)}`);
  const txn = new URL(loginLoc, url).searchParams.get('txn') ?? '';
  const mcpOrigin = new URL(loginLoc, url).origin;

  // 5. email step
  const e = await fetch(`${mcpOrigin}/login/email`, form({ txn, email: MCP_EMAIL }));
  const eBody = await e.text();
  check('login/email accepted (otp form shown)', e.ok && /name="code"/.test(eBody), `${e.status}`);

  // 6. otp step → 302 to our callback
  const o = await fetch(`${mcpOrigin}/login/otp`, form({ txn, email: MCP_EMAIL, code: MCP_CODE }));
  const cbLoc = o.headers.get('location') ?? '';
  check('login/otp → redirect to app callback', o.status >= 300 && o.status < 400 && cbLoc.startsWith(`${APP}/api/mcp/callback`), `${o.status} ${cbLoc.slice(0, 90)}`);

  // 7. our callback exchanges the code
  const cb = await fetch(cbLoc, noRedirect);
  const back = cb.headers.get('location') ?? '';
  check('callback → /?mcp=connected', cb.status === 303 && back.includes('mcp=connected'), `${cb.status} ${back}`);

  // 8. replayed callback must fail (state consumed)
  const replay = await fetch(cbLoc, noRedirect);
  check('replayed callback rejected', (replay.headers.get('location') ?? '').includes('mcp=error'), replay.headers.get('location') ?? '');

  // 9. status after
  st = (await (await fetch(`${APP}/api/mcp/status`, { headers: auth })).json()) as { connected: boolean; status: string };
  check('status after = active', st.connected && st.status === 'active', JSON.stringify(st));

  // 10. grant row encrypted (not the raw token)
  const row = await db().query.mcpGrants.findFirst({ where: eq(mcpGrants.userId, user.id) });
  check('grant stored encrypted', Boolean(row) && !/^ey/.test(row!.accessTokenEnc) && row!.accessTokenEnc.startsWith('v1'), row?.accessTokenEnc.slice(0, 12));
  const firstAccess = await accessTokenFor(user.id);
  check('accessTokenFor returns a token without refreshing', firstAccess.length > 20);

  // 11. the token works against the MCP (401 without, not-401 with)
  const probe = (h: Record<string, string>) =>
    fetch(`${row!.issuer}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...h },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } } }),
    });
  const unauth = await probe({});
  const authed = await probe({ authorization: `Bearer ${firstAccess}` });
  check('MCP: 401 without bearer, 200 with', unauth.status === 401 && authed.status === 200, `${unauth.status}/${authed.status}`);

  // 12. force expiry → refresh path (single-flight: two concurrent callers, one refresh)
  await db().update(mcpGrants).set({ accessExpiresAt: new Date(Date.now() + 30_000) }).where(eq(mcpGrants.userId, user.id));
  const [t1, t2] = await Promise.all([accessTokenFor(user.id), accessTokenFor(user.id)]);
  const after = await db().query.mcpGrants.findFirst({ where: eq(mcpGrants.userId, user.id) });
  check('refresh issued a new token, both callers got the same one', t1 === t2 && t1 !== firstAccess && after!.accessExpiresAt.getTime() > Date.now() + 30 * 60_000, `exp ${after?.accessExpiresAt.toISOString()}`);
  const authed2 = await probe({ authorization: `Bearer ${t1}` });
  check('refreshed token works against the MCP', authed2.status === 200, String(authed2.status));

  // 13. logout deletes the grant
  const lo = await fetch(`${APP}/api/auth/logout`, { method: 'POST', headers: auth });
  st = (await (await fetch(`${APP}/api/mcp/status`, { headers: auth })).json()) as { connected: boolean; status: string };
  check('logout → grant gone', lo.ok && !st.connected && st.status === 'none', JSON.stringify(st));
  let threw = '';
  await accessTokenFor(user.id).catch((err: Error) => (threw = err.message));
  check('accessTokenFor fails closed after logout', /not connected/i.test(threw), threw);

  await db().delete(users).where(eq(users.id, user.id));
  console.log(`\nall ${n} checks passed`);
  process.exit(0);
}

main().catch((e) => {
  console.error('e2e failed:', e);
  process.exit(1);
});
