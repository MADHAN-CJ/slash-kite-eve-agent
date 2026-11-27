import { defineMcpClientConnection } from 'eve/connections';
import { resolveMcpToken } from '#lib/mcp/token.js';

/**
 * The /markets Kite MCP (zap-kite-mcp) — the agent's ONLY source of account
 * and market data (plan D4–D6). Discovered by the model via
 * `connection_search`; tools surface as `kite__<name>`. The bearer is the
 * signed-in user's own OAuth grant, resolved per call from the eve session
 * and refreshed by agent/lib/mcp/oauth.ts; it never enters the model
 * context. Nothing here can place an order — the MCP is read-only by
 * construction and watchers only send e-mail.
 */
const MCP_URL = `${(process.env.KITE_MCP_URL ?? 'https://mcp.slash.markets').replace(/\/$/, '')}/`;

export const KITE_TOOLS = ['run_python', 'auth_status', 'create_watcher', 'list_watchers', 'profile'] as const;

export default defineMcpClientConnection({
  url: MCP_URL,
  description:
    "The user's Zerodha (Kite) account and Indian market data, read-only: run_python executes a " +
    'zapkite Python script server-side (positions, holdings, funds, orders, trades, mutual funds, GTTs; ' +
    'NSE/BSE/NFO/BFO/MCX/CDS prices, depth, candles, indicators, option chains with greeks, expiries, ' +
    'continuous futures); auth_status reports whether Zerodha access is usable; create_watcher/list_watchers ' +
    'arm e-mail alerts; profile shows the signed-in user.',
  auth: (ctx) => ({
    getToken: async () => ({ token: await resolveMcpToken(ctx) }),
  }),
  tools: { allow: [...KITE_TOOLS] },
  // Plan-v2 D8: in THIS app a watcher starts only after the user taps "Start
  // watching" on the confirm card, so create_watcher parks for approval. The
  // same MCP used directly from Claude / ChatGPT still creates at once.
  approval: ({ toolName }) => (toolName.endsWith('create_watcher') ? 'user-approval' : 'not-applicable'),
});
