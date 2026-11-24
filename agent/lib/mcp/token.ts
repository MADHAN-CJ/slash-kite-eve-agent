import { getSessionContext } from '../db/session-context';
import { accessTokenFor, McpOAuthError } from './oauth';

/**
 * Bearer token for the `kite` connection, resolved per tool call from the
 * eve session: session_context → user → grant (refreshed if needed).
 *
 * Fail-closed in every ambiguous case: a session with no owner row, a lookup
 * error, or a missing/expired grant all throw, so no call can ever run on
 * another user's grant or on a stale token. The thrown message is what the
 * model sees as the tool error, so it is written for the user.
 */
export async function resolveMcpToken(ctx: { session: { id: string } }): Promise<string> {
  const owner = await getSessionContext(ctx.session.id);
  if (owner.status === 'error') {
    throw new Error('Could not resolve the conversation owner — try again in a moment.');
  }
  if (owner.status === 'none') {
    // No proxy wrote the owner: a direct `eve dev` send. Local bench only.
    const bench = process.env.MCP_BENCH_ACCESS_TOKEN;
    if (bench && process.env.NODE_ENV !== 'production') return bench;
    throw new Error('MCP_NOT_CONNECTED: this conversation has no signed-in owner.');
  }
  try {
    return await accessTokenFor(owner.userId);
  } catch (e) {
    if (e instanceof McpOAuthError) throw new Error(`MCP_NOT_CONNECTED: ${e.message}`);
    throw e;
  }
}
