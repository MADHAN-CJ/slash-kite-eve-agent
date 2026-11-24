import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '#lib/db/client.js';
import { users } from '#lib/db/schema.js';

/**
 * P3 e2e: with `npm run dev` running, logs in, connects the MCP (staging dev
 * login), then drives two real agent sessions through the app proxy and
 * inspects the NDJSON stream: an account question must load the skill and
 * call kite__run_python; a news question must call web_search. Prints the
 * tool sequence and the final text of each. Costs real tokens.
 */
const APP = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.DEV_LOGIN_EMAIL ?? 'test@slash.markets';
const CODE = process.env.DEV_LOGIN_CODE ?? '123456';

let n = 0;
function check(label: string, ok: boolean, detail = ''): void {
  n += 1;
  console.log(`${ok ? '✓' : '✗'} ${n}. ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) {
    console.error('FAILED');
    process.exit(1);
  }
}
const form = (o: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(o),
  redirect: 'manual' as const,
});

async function connectMcp(auth: Record<string, string>) {
  const { url } = (await (await fetch(`${APP}/api/mcp/start`, { method: 'POST', headers: auth })).json()) as { url: string };
  const a = await fetch(url, { redirect: 'manual' });
  const loginLoc = new URL(a.headers.get('location') ?? '', url);
  const txn = loginLoc.searchParams.get('txn') ?? '';
  await fetch(`${loginLoc.origin}/login/email`, form({ txn, email: EMAIL }));
  const o = await fetch(`${loginLoc.origin}/login/otp`, form({ txn, email: EMAIL, code: CODE }));
  const cb = await fetch(o.headers.get('location') ?? '', { redirect: 'manual' });
  return (cb.headers.get('location') ?? '').includes('mcp=connected');
}

interface Ev {
  type: string;
  data?: Record<string, unknown>;
}

async function runSession(auth: Record<string, string>, message: string, maxMs = 180_000) {
  const create = await fetch(`${APP}/api/eve/v1/session`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const { sessionId } = (await create.json()) as { sessionId?: string };
  if (!create.ok || !sessionId) throw new Error(`session create failed: ${create.status}`);
  const tools: string[] = [];
  const texts: string[] = [];
  const errors: string[] = [];
  const started = Date.now();
  let idx = 0;
  let done = false;
  while (!done && Date.now() - started < maxMs) {
    const res = await fetch(`${APP}/api/eve/v1/session/${sessionId}/stream?startIndex=${idx}`, {
      headers: { ...auth, accept: 'application/x-ndjson' },
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (!res?.body) continue;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done: eof } = await reader.read();
        if (eof) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          idx += 1;
          let ev: Ev;
          try {
            ev = JSON.parse(line) as Ev;
          } catch {
            continue;
          }
          if (ev.type === 'actions.requested') {
            for (const a of (ev.data?.actions as { toolName?: string }[] | undefined) ?? []) if (a.toolName) tools.push(a.toolName);
          } else if (ev.type === 'action.result') {
            const d = ev.data as { status?: string; error?: { message?: string }; result?: { toolName?: string } };
            if (d.status !== 'completed') errors.push(`${d.result?.toolName}: ${d.error?.message ?? d.status}`);
          } else if (ev.type === 'message.completed') {
            const m = (ev.data as { message?: string | null }).message;
            if (m) texts.push(m);
          } else if (ev.type === 'session.waiting' || ev.type === 'session.completed' || ev.type === 'session.failed' || ev.type === 'turn.failed') {
            done = true;
          }
        }
        if (done) break;
      }
    } catch {
      /* stream hiccup: reconnect from idx */
    }
  }
  return { sessionId, tools, texts, errors, ms: Date.now() - started };
}

async function main() {
  const v = await fetch(`${APP}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, code: CODE }),
  });
  const { token, user } = (await v.json()) as { token: string; user: { id: string } };
  check('app login', v.ok && Boolean(token));
  const auth = { authorization: `Bearer ${token}` };

  const info = (await (await fetch(`${APP}/api/eve/v1/health`)).text()).slice(0, 60);
  check('eve health via proxy', info.length > 0, info);

  check('MCP connected via OAuth', await connectMcp(auth));

  console.log('\n— session A: account question');
  const a = await runSession(auth, 'How is my portfolio doing today? One short paragraph.');
  console.log('  tools:', a.tools.join(' → ') || '(none)');
  console.log('  errors:', a.errors.length ? a.errors.join(' | ').slice(0, 400) : '(none)');
  console.log('  text:', a.texts.join('\n').slice(0, 600));
  check('A: skill loaded', a.tools.includes('load_skill'));
  check('A: kite__run_python or kite__auth_status called', a.tools.some((t) => t.startsWith('kite__')));
  check('A: no sandbox tools used', !a.tools.some((t) => ['bash', 'read_file', 'write_file', 'glob', 'grep', 'web_fetch'].includes(t)));
  check('A: final text present', a.texts.join('').trim().length > 20, `${a.ms} ms`);

  console.log('\n— session B: news question');
  const b = await runSession(auth, 'Why did NIFTY move today? Give me the top 2 reasons from the news with sources.');
  console.log('  tools:', b.tools.join(' → ') || '(none)');
  console.log('  errors:', b.errors.length ? b.errors.join(' | ').slice(0, 400) : '(none)');
  console.log('  text:', b.texts.join('\n').slice(0, 800));
  check('B: web_search called', b.tools.includes('web_search'));
  check('B: final text cites a URL', /https?:\/\//.test(b.texts.join('')), `${b.ms} ms`);

  const list = (await (await fetch(`${APP}/api/threads`, { headers: auth })).json()) as { threads: { eveSessionId: string; title: string | null }[] };
  check('threads persisted with titles', list.threads.filter((t) => [a.sessionId, b.sessionId].includes(t.eveSessionId) && t.title).length === 2, JSON.stringify(list.threads.map((t) => t.title)));

  await fetch(`${APP}/api/auth/logout`, { method: 'POST', headers: auth });
  await db().delete(users).where(eq(users.id, user.id));
  console.log(`\nall ${n} checks passed`);
  process.exit(0);
}

main().catch((e) => {
  console.error('e2e failed:', e);
  process.exit(1);
});
