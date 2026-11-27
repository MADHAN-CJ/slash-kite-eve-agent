/** Disposable LOCAL Postgres only; every mail request is intercepted in-process. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

const name = `v11_check_${process.pid}_${Date.now()}`;
const admin = new Client({ connectionString: 'postgresql://slashkite:slashkite@127.0.0.1:5439/postgres' });
await admin.connect();
await admin.query(`CREATE DATABASE "${name}"`);
const connectionString = `postgresql://slashkite:slashkite@127.0.0.1:5439/${name}`;
const client = new Client({ connectionString });
process.env.DATABASE_URL = connectionString;
process.env.RESEND_API_KEY = 'mock-not-a-real-key';
process.env.APP_BASE_URL = 'https://app.example.com';
process.env.MCP_SESSION_SECRET = 'local-test-secret-that-is-at-least-32-chars';
process.env.AUTH_JWT_SECRET = 'local-test-secret-that-is-at-least-32-chars';
delete process.env.DEV_LOGIN_EMAIL;
const sent = new Map<string, Record<string, unknown>>();
let calls = 0;
let failAfterAccept = false;
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://api.resend.com/emails', 'Unexpected network request');
  calls++;
  const headers = new Headers(init?.headers);
  const key = headers.get('Idempotency-Key') ?? `otp-${calls}`;
  const body = JSON.parse(String(init?.body));
  if (sent.has(key)) assert.deepEqual(body, sent.get(key), 'Retry must preserve payload');
  sent.set(key, body);
  if (failAfterAccept) { failAfterAccept = false; throw new Error('Simulated response loss after acceptance'); }
  return Response.json({ id: key });
};
try {
  await client.connect();
  await client.query(readFileSync('../zap-kite-mcp/mcp/src/zap_kite_mcp/migrations/0001_init.sql', 'utf8'));
  for (const file of ['0000_eve_schema', '0001_watcher_links', '0002_onboarding', '0003_notifications', '0004_notification_delivery']) {
    await client.query(readFileSync(`drizzle/${file}.sql`, 'utf8'));
  }
  const { deliverNotifications } = await import('../lib/server/notifications/worker');
  const { requestOtp, verifyOtp } = await import('../lib/server/otp');
  const { otpHash } = await import('../lib/server/mcp-crypto');
  const now = new Date('2026-12-01T10:00:00+05:30');
  const id = randomUUID();
  await client.query(`INSERT INTO users(id,email) VALUES ($1,'fixture@example.com')`, [id]);
  assert.equal((await requestOtp('fixture@example.com')).existingAccount, true);
  assert.equal((await requestOtp('new-fixture@example.com')).existingAccount, false);
  const otpBody = [...sent.values()].at(-1)!;
  const code = String(otpBody.subject).slice(0, 6);
  const created = await verifyOtp('new-fixture@example.com', code);
  assert.equal(created.isNewAccount, true);
  await assert.rejects(() => verifyOtp('new-fixture@example.com', code));
  await client.query(`INSERT INTO otps(email,code_hash,expires_at) VALUES ($1,$2,now()+interval '10 minutes')`, ['new-fixture@example.com', otpHash('654321', 'new-fixture@example.com')]);
  assert.equal((await verifyOtp('new-fixture@example.com', '654321')).isNewAccount, false);
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM eve.notification_preferences WHERE user_id=$1 AND enrolled_at IS NOT NULL`, [created.userId])).rows[0].n, 1);
  await client.query(`UPDATE eve.notification_preferences SET growth=false`);
  sent.clear(); calls = 0;
  assert.equal((await deliverNotifications(now)).enabled, false);
  await client.query(`UPDATE eve.notification_control SET enabled=true,enabled_at=now()`);
  await client.query(`INSERT INTO watchers(id,user_id,symbol,label,script,market,check_every_s,status,expires_at)
    VALUES ('watch',$1,'TCS','Above 100','print("condition")','NSE',60,'ARMED','2026-12-20')`, [id]);
  await client.query(`UPDATE watchers SET last_value='99',last_checked_at=now() WHERE id='watch'`);
  await client.query(`INSERT INTO watcher_fires(id,watcher_id,value) VALUES ('fire1','watch','101')`);
  assert.equal((await deliverNotifications(now)).sent, 1);
  assert.equal((await client.query(`SELECT emailed FROM watcher_fires WHERE id='fire1'`)).rows[0].emailed, true);
  assert.equal((await deliverNotifications(now)).sent, 0);
  assert.equal(sent.size, 1);
  const body = sent.get('alert:fire1')!;
  assert.match(String(body.html), /cid:watcher-chart/);
  assert.ok((body.attachments as unknown[]).length === 1);

  // Response lost after provider acceptance: replay uses the same id and immutable payload.
  await client.query(`INSERT INTO watcher_fires(id,watcher_id,value) VALUES ('fire2','watch','102')`);
  failAfterAccept = true;
  assert.equal((await deliverNotifications(now)).failed, 1);
  await client.query(`UPDATE watchers SET last_value='500' WHERE id='watch'`);
  await deliverNotifications(new Date(now.getTime() + 120_000));
  assert.equal(sent.size, 2);
  assert.equal((await client.query(`SELECT state FROM eve.notification_jobs WHERE id='alert:fire2'`)).rows[0].state, 'sent');

  await client.query(`INSERT INTO eve.notification_preferences(user_id,watchers) VALUES ($1,false)`, [id]);
  await client.query(`INSERT INTO watcher_fires(id,watcher_id,value) VALUES ('fire3','watch','103')`);
  assert.equal((await deliverNotifications(now)).suppressed, 1);
  assert.equal(sent.size, 2);
  await client.query(`UPDATE eve.notification_preferences SET watchers=true WHERE user_id=$1`, [id]);
  await client.query(`UPDATE watchers SET status='ERROR',last_error='No data' WHERE id='watch'`);
  assert.equal((await deliverNotifications(now)).sent, 1);
  await client.query(`UPDATE watchers SET status='ARMED' WHERE id='watch'`);
  await client.query(`UPDATE watchers SET status='ERROR',last_error='No data' WHERE id='watch'`);
  assert.equal((await deliverNotifications(now)).sent, 0, 'Same error must not email twice');
  await client.query(`UPDATE watchers SET status='ARMED',last_error=null WHERE id='watch'`);
  await client.query(`UPDATE watchers SET status='ERROR',last_error='Other error' WHERE id='watch'`);
  await client.query(`UPDATE watchers SET status='ARMED' WHERE id='watch'`);
  assert.equal((await deliverNotifications(now)).suppressed, 1, 'Recovered watcher suppresses queued error');

  // Reconnect: once per trading morning, twice per connection episode; no third.
  await client.query(`INSERT INTO broker_connections(user_id,kite_user_id,status,connected_at,expires_at)
    VALUES ($1,'fake','token_expired','2026-11-30T10:00:00+05:30','2026-12-01T06:00:00+05:30')`, [id]);
  await client.query(`UPDATE watchers SET status='PAUSED',paused_by='broker' WHERE id='watch'`);
  await deliverNotifications(now);
  await deliverNotifications(new Date('2026-12-02T08:00:00+05:30'));
  await deliverNotifications(new Date('2026-12-03T08:00:00+05:30'));
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM eve.notification_jobs WHERE kind='kite-reconnect' AND state='sent'`)).rows[0].n, 2);
  console.log('PASS: isolated migrations, returning/new OTP, single-use codes, enrollment, durable alert capture, PNGs, deduplication, ambiguous retries, opt-out, stopped/recovered events and reconnect cap. No real emails sent.');
} finally {
  const globals = globalThis as unknown as { notificationPool?: { end: () => Promise<void> }; __slashKiteDb?: { pool: { end: () => Promise<void> } } };
  await globals.notificationPool?.end();
  await globals.__slashKiteDb?.pool.end();
  await client.end();
  await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
