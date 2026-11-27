import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  broker: vi.fn(),
  connect: vi.fn(),
  call: vi.fn(),
  close: vi.fn(),
}));
vi.mock('@/agent/lib/mcp/oauth', () => ({
  accessTokenFor: mocks.token,
  mcpIssuer: () => 'http://localhost:8030',
}));
vi.mock('@/lib/server/broker', () => ({ brokerStatus: mocks.broker }));
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    connect = mocks.connect;
    callTool = mocks.call;
    close = mocks.close;
  },
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {},
}));

import { marketInput, tradeMarket, tradeMarketScript } from '@/lib/server/trade-market';
import { GET } from '@/app/api/trade/market/route';
import { signSessionJwt } from '@/lib/server/auth';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.broker.mockResolvedValue({ status: 'active' });
  mocks.token.mockResolvedValue('test-only-mcp-token');
  mocks.connect.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
});

describe('ticket market reads', () => {
  it('authenticates before reading and preserves the requesting user identity', async () => {
    expect((await GET(new Request('http://localhost/api/trade/market?symbol=NIFTY'))).status).toBe(401);
    expect(mocks.broker).not.toHaveBeenCalled();
    const before = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = 'test-signing-secret-for-v6-only';
    try {
      const token = await signSessionJwt({ userId: 'user-a', email: 'a@example.com' });
      mocks.call.mockResolvedValue({
        content: [
          { type: 'text', text: '--- stdout ---\n{"instruments":[],"selectedKey":null}\n--- stderr ---' },
        ],
      });
      const res = await GET(
        new Request('http://localhost/api/trade/market?symbol=NIFTY', {
          headers: { authorization: `Bearer ${token}` },
        }),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(mocks.broker).toHaveBeenCalledWith('user-a');
      expect(mocks.token).toHaveBeenCalledWith('user-a');
      expect(mocks.call.mock.calls[0][0].name).toBe('run_python');
      expect(await res.json()).not.toHaveProperty('token');
    } finally {
      if (before === undefined) delete process.env.AUTH_JWT_SECRET;
      else process.env.AUTH_JWT_SECRET = before;
    }
  });
  it('distinguishes a Kite reconnect from an app-session expiry and closes transports on errors', async () => {
    mocks.broker.mockResolvedValueOnce({ status: 'token_expired' });
    await expect(tradeMarket('u', { symbol: 'RELIANCE' })).rejects.toMatchObject({
      status: 409,
      code: 'KITE_REQUIRED',
    });
    expect(mocks.call).not.toHaveBeenCalled();
    mocks.call.mockResolvedValueOnce({ isError: true, content: [{ type: 'text', text: 'TokenExpired' }] });
    await expect(tradeMarket('u', { symbol: 'RELIANCE' })).rejects.toMatchObject({ status: 409 });
    expect(mocks.close).toHaveBeenCalled();
    mocks.call.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not JSON' }] });
    await expect(tradeMarket('u', { symbol: 'RELIANCE' })).rejects.toMatchObject({ status: 502 });
  });
  it('rejects executable or oversized query inputs', () => {
    for (const symbol of ['x\");print(1)#', 'x\nprint(1)', 'x'.repeat(81), ''])
      expect(marketInput.safeParse({ symbol }).success).toBe(false);
    expect(marketInput.safeParse({ symbol: 'NIFTY', exchange: 'unknown' }).success).toBe(false);
  });
  it('executes the fixed Python script against SDK-shaped data: exact equity vs an index needing a contract', () => {
    const setup = `import sys, types\nz = types.ModuleType('zapkite')\nsys.modules['zapkite'] = z\nstock = {'key':'NSE:RELIANCE','tradingsymbol':'RELIANCE','exchange':'NSE','kind':'stock','lot_size':1}\nfuture = {'key':'NFO:NIFTY26DECFUT','tradingsymbol':'NIFTY26DECFUT','exchange':'NFO','kind':'future','instrument_type':'FUT','lot_size':65,'expiry':'2026-12-29'}\nz.resolve_symbol = lambda s, exchange=None: stock if s == 'RELIANCE' else {'kind':'index','tradingsymbol':'NIFTY 50','exchange':'NSE'}\nz.futures_list = lambda s, exchange=None: [future]\nz.search_instruments = lambda *args, **kwargs: []\nz.quote = lambda keys: {k:{'last_price':2948.4,'timestamp':'2026-11-27 14:32:00'} for k in keys}\n`;
    const run = (symbol: string) =>
      JSON.parse(
        execFileSync('python3', ['-c', setup + tradeMarketScript({ symbol })], { encoding: 'utf8' }),
      );
    const stock = run('RELIANCE');
    expect(stock.selectedKey).toBe('NSE:RELIANCE');
    expect(stock.instruments[0]).toMatchObject({ lotSize: 1, lastPrice: 2948.4, kind: 'equity' });
    const index = run('NIFTY');
    expect(index.selectedKey).toBeNull();
    expect(index.instruments[0]).toMatchObject({ lotSize: 65, symbol: 'NIFTY26DECFUT', kind: 'future' });
    const missingLot = JSON.parse(
      execFileSync('python3', ['-c', setup.replace("'lot_size':65,", '') + tradeMarketScript({ symbol: 'NIFTY' })], { encoding: 'utf8' }),
    );
    expect(missingLot.instruments).toEqual([]);
  });
});
