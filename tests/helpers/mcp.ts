import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq } from 'drizzle-orm';
import { db } from '@/agent/lib/db/client';
import { users } from '@/agent/lib/db/mcp-schema';
import { accessTokenFor, mcpIssuer } from '@/agent/lib/mcp/oauth';
import { stdoutOf } from '@/components/charts/chart-line';

/**
 * Test-side access to the Kite MCP, exactly as the agent reaches it: the same
 * issuer (KITE_MCP_URL) and a user's stored OAuth grant. Token sources, in
 * order: MCP_TEST_ACCESS_TOKEN, else the grant of MCP_TEST_EMAIL (default
 * DEV_LOGIN_EMAIL) in this app's database — i.e. log into the app once, let it
 * connect /markets, then run the suite.
 *
 * run_python only executes when that MCP account has a LIVE Zerodha session,
 * so `requireLiveKite()` skips a file (never fails it) when it does not.
 */

export class McpUnavailable extends Error {}

let tokenPromise: Promise<string> | null = null;

export function mcpToken(): Promise<string> {
  tokenPromise ??= (async () => {
    const direct = process.env.MCP_TEST_ACCESS_TOKEN?.trim();
    if (direct) return direct;
    const email = (process.env.MCP_TEST_EMAIL ?? process.env.DEV_LOGIN_EMAIL ?? '').trim().toLowerCase();
    if (!email) throw new McpUnavailable('Set MCP_TEST_ACCESS_TOKEN or MCP_TEST_EMAIL/DEV_LOGIN_EMAIL.');
    const row = await db().query.users.findFirst({ where: eq(users.email, email) });
    if (!row) throw new McpUnavailable(`No app user ${email} — log into the app first.`);
    try {
      return await accessTokenFor(row.id);
    } catch (e) {
      throw new McpUnavailable(`${email} has no usable /markets grant: ${e instanceof Error ? e.message : e}`);
    }
  })();
  return tokenPromise;
}

export async function mcpClient(): Promise<Client> {
  const token = await mcpToken();
  const client = new Client({ name: 'slash-kite-eve-agent-tests', version: '0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${mcpIssuer()}/`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

function textOf(result: unknown): string {
  const content = (result as { content?: { type?: string; text?: string }[] }).content ?? [];
  return content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n');
}

export interface RunResult {
  stdout: string;
  raw: string;
  isError: boolean;
}

/** `run_python(code)` → stdout (the `--- stdout ---` block) + the raw tool text. */
export async function runPython(client: Client, code: string, timeoutSeconds = 60): Promise<RunResult> {
  const result = await client.callTool({ name: 'run_python', arguments: { code, timeout_seconds: timeoutSeconds } });
  const raw = textOf(result);
  const isError = Boolean((result as { isError?: boolean }).isError);
  return { stdout: stdoutOf(raw).trim(), raw, isError };
}

/** Run a script that prints ONE JSON document and parse it. Throws with the raw text on failure. */
export async function runJson<T>(client: Client, code: string): Promise<T> {
  const r = await runPython(client, code);
  if (r.isError) throw new Error(`run_python failed:\n${r.raw}`);
  try {
    return JSON.parse(r.stdout) as T;
  } catch {
    throw new Error(`run_python printed non-JSON:\n${r.raw}`);
  }
}

export interface AuthStatus {
  signedIn: boolean;
  broker?: string;
  kiteUserId?: string | null;
  appUrl?: string;
  message?: string | null;
}

export async function authStatus(client: Client): Promise<AuthStatus> {
  const result = await client.callTool({ name: 'auth_status', arguments: {} });
  return JSON.parse(textOf(result)) as AuthStatus;
}

/**
 * Connect, and resolve to a client only when Zerodha access is live; otherwise
 * resolve to `{ skip: reason }` so the calling file can `describe.skipIf`.
 */
export async function requireLiveKite(): Promise<{ client: Client; skip?: undefined } | { client?: undefined; skip: string }> {
  let client: Client;
  try {
    client = await mcpClient();
  } catch (e) {
    return { skip: e instanceof Error ? e.message : String(e) };
  }
  const st = await authStatus(client);
  if (!st.signedIn) return { skip: 'MCP token is not signed in.' };
  if (st.broker !== 'active') {
    return { skip: `Zerodha session is ${st.broker ?? 'unknown'} on the MCP account (${st.message ?? 'reconnect at ' + st.appUrl}).` };
  }
  return { client };
}
