import { getSessionContext } from '../db/session-context';
import { accessTokenFor, McpOAuthError } from './oauth';

/**
 * Bearer token for the `kite` connection, resolved per tool call from the
 * eve session: session_context → user → cached/minted MCP token.
 *
 * Fail-closed in every ambiguous case: a session with no owner row, a lookup
 * error, or a minting failure all throw, so no call can ever run as another
 * user. The thrown message is what the model sees as the tool error, so it is
 * written for the user. Note the distinction the model is taught: an
 * `MCP_UNAVAILABLE` error is OUR side (retry later); a Zerodha/Kite problem
 * arrives inside a successful tool result and means "log in to Zerodha".
 */
export async function resolveMcpToken(ctx: { session: { id: string } }): Promise<string> {
  const owner = await getSessionContext(ctx.session.id);
  if (owner.status === 'error') {
    throw new Error('MCP_UNAVAILABLE: could not resolve the conversation owner — try again in a moment.');
  }
  if (owner.status === 'none') {
    // No proxy wrote the owner: a direct `eve dev` send. Local bench only.
    const bench = process.env.MCP_BENCH_ACCESS_TOKEN;
    if (bench && process.env.NODE_ENV !== 'production') return bench;
    throw new Error('MCP_UNAVAILABLE: this conversation has no signed-in owner.');
  }
  try {
    return await accessTokenFor(owner.userId);
  } catch (e) {
    if (e instanceof McpOAuthError) throw new Error(`MCP_UNAVAILABLE: ${e.message}`);
    throw e;
  }
}
