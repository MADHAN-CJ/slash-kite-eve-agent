import { completeAuthorization, McpOAuthError } from '@/agent/lib/mcp/oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mcp/callback?code&state — the MCP's authorization server sends the
 * browser here. The state row (not the browser) identifies the user, so this
 * route needs no JWT. Lands back on the app with `?mcp=connected` or
 * `?mcp=error&reason=…`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = (process.env.APP_BASE_URL ?? url.origin).replace(/\/$/, '');
  const back = (q: Record<string, string>) => Response.redirect(`${base}/?${new URLSearchParams(q)}`, 303);

  const error = url.searchParams.get('error');
  if (error) return back({ mcp: 'error', reason: error });
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return back({ mcp: 'error', reason: 'missing_code' });
  try {
    await completeAuthorization(state, code);
    return back({ mcp: 'connected' });
  } catch (e) {
    const reason = e instanceof McpOAuthError ? e.code : 'unknown';
    console.error('[mcp/callback] failed:', e instanceof Error ? e.message : e);
    return back({ mcp: 'error', reason });
  }
}
