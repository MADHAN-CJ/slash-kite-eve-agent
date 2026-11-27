import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { accessTokenFor, mcpIssuer } from '@/agent/lib/mcp/oauth';
import { stdoutOf } from '@/components/charts/chart-line';
import { EXCHANGES } from '@/lib/client/kite-publisher';
import type { TradeMarket } from '@/lib/v2/trade';
import { HttpError } from './auth';
import { brokerStatus } from './broker';

export const marketInput = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9 &.\-]+$/),
  exchange: z.enum(EXCHANGES).optional(),
});

const marketSchema = z.object({
  selectedKey: z.string().nullable(),
  instruments: z
    .array(
      z.object({
        key: z.string(),
        symbol: z.string(),
        exchange: z.enum(EXCHANGES),
        kind: z.enum(['equity', 'future', 'option']),
        lotSize: z.number().int().positive(),
        tickSize: z.number().nonnegative(),
        expiry: z.string().nullable(),
        lastPrice: z.number().finite().nonnegative().nullable(),
        asOf: z.string().nullable(),
      }),
    )
    .max(20),
});

/** Fixed, read-only SDK script. User input is JSON data, never Python source.
 * It runs next to the data through the MCP's existing per-app limiter. */
export function tradeMarketScript(input: z.infer<typeof marketInput>): string {
  const literal = JSON.stringify(JSON.stringify(input));
  return `# Get the instrument, lot size and last quote for the Trade on Kite ticket
import json
import zapkite as z
p = json.loads(${literal})
symbol, exchange = p['symbol'].upper(), p.get('exchange')
r = z.resolve_symbol(symbol, exchange=exchange)
def tradable(row):
    return row and row.get('kind') != 'index' and row.get('segment') != 'INDICES' and row.get('exchange') in ['NSE','BSE','NFO','BFO','CDS','MCX'] and ' ' not in row.get('tradingsymbol','')
exact = r if tradable(r) and r.get('tradingsymbol') == symbol else None
if exact:
    rows = [exact]
elif not r or not tradable(r):
    rows = z.futures_list(symbol, exchange=exchange if exchange not in ['NSE','BSE'] else None)[:20]
    if not rows:
        rows = z.search_instruments(symbol, exchange=exchange, limit=20)
else:
    rows = z.search_instruments(symbol, exchange=exchange, limit=20)
rows = [row for row in rows if tradable(row)][:20]
quotes = z.quote([row['key'] for row in rows]) if rows else {}
out = []
for row in rows:
    q = quotes.get(row['key'], {})
    kind = row.get('kind', '')
    itype = row.get('instrument_type', '')
    derivative = itype in ['FUT','CE','PE'] or kind in ['future','option'] or bool(row.get('expiry'))
    lot = row.get('lot_size') if derivative else 1
    if derivative and (not lot or int(lot) < 1):
        continue
    out.append({'key': row['key'], 'symbol': row['tradingsymbol'], 'exchange': row['exchange'],
      'kind': 'future' if itype == 'FUT' or kind == 'future' else 'option' if derivative else 'equity',
      'lotSize': int(lot) if derivative else 1, 'tickSize': float(row.get('tick_size') or 0),
      'expiry': row.get('expiry') or None, 'lastPrice': q.get('last_price'),
      'asOf': str(q.get('last_trade_time') or q.get('timestamp') or '') or None})
print(json.dumps({'instruments': out, 'selectedKey': exact['key'] if exact and any(x['key'] == exact['key'] for x in out) else None}, default=str))`;
}

export async function tradeMarket(userId: string, input: z.infer<typeof marketInput>): Promise<TradeMarket> {
  if ((await brokerStatus(userId)).status !== 'active')
    throw new HttpError(409, 'Reconnect Kite to load the instrument and last price.', 'KITE_REQUIRED');
  const client = new Client({ name: 'markets-trade-ticket', version: '1' });
  try {
    const token = await accessTokenFor(userId);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${mcpIssuer()}/`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    const result = await client.callTool(
      { name: 'run_python', arguments: { code: tradeMarketScript(input), timeout_seconds: 30 } },
      undefined,
      { timeout: 45_000 },
    );
    const raw = (result.content as { type: string; text?: string }[])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');
    if (result.isError) {
      if (/TokenExpired|TokenException|not connected/i.test(raw))
        throw new HttpError(409, 'Reconnect Kite to load the instrument and last price.', 'KITE_REQUIRED');
      throw new HttpError(502, 'Could not load this instrument from /markets. Try again.');
    }
    const parsed = marketSchema.safeParse(JSON.parse(stdoutOf(raw).trim()));
    if (!parsed.success) throw new HttpError(502, 'The instrument data was incomplete. Try again.');
    return parsed.data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Could not load this instrument from /markets. Try again.');
  } finally {
    await client.close().catch(() => {});
  }
}
