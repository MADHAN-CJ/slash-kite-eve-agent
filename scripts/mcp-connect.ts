import 'dotenv/config';

/**
 * Dev helper: connect an app user to the MCP without a browser, driving the
 * MCP's HTML login with a fixed code (the MCP's DEV_LOGIN on staging, or an
 * account whose code you can read). Needs `npm run dev` running.
 * Env: DEV_LOGIN_EMAIL/DEV_LOGIN_CODE (app login), MCP_TEST_EMAIL/MCP_TEST_CODE (MCP login; default same).
 */
const APP = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.DEV_LOGIN_EMAIL ?? 'test@slash.markets';
const CODE = process.env.DEV_LOGIN_CODE ?? '123456';
const MCP_EMAIL = process.env.MCP_TEST_EMAIL ?? EMAIL;
const MCP_CODE = process.env.MCP_TEST_CODE ?? CODE;
const form = (o: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(o),
  redirect: 'manual' as const,
});

async function main() {
  const v = await fetch(`${APP}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, code: CODE }),
  });
  if (!v.ok) throw new Error(`app login failed: ${v.status}`);
  const { token } = (await v.json()) as { token: string };
  const auth = { authorization: `Bearer ${token}` };
  const { url } = (await (await fetch(`${APP}/api/mcp/start`, { method: 'POST', headers: auth })).json()) as { url: string };
  const a = await fetch(url, { redirect: 'manual' });
  const loginLoc = new URL(a.headers.get('location') ?? '', url);
  const txn = loginLoc.searchParams.get('txn') ?? '';
  await fetch(`${loginLoc.origin}/login/email`, form({ txn, email: MCP_EMAIL }));
  const o = await fetch(`${loginLoc.origin}/login/otp`, form({ txn, email: MCP_EMAIL, code: MCP_CODE }));
  const cbLoc = o.headers.get('location') ?? '';
  if (!cbLoc.includes('/api/mcp/callback')) throw new Error(`MCP login did not redirect back (status ${o.status}) — wrong code, or no dev login on ${loginLoc.origin}`);
  const cb = await fetch(cbLoc, { redirect: 'manual' });
  const back = cb.headers.get('location') ?? '';
  console.log(back.includes('mcp=connected') ? `connected ${EMAIL} → ${loginLoc.origin}` : `failed: ${back}`);
  process.exit(back.includes('mcp=connected') ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
