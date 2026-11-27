import { authHeaders } from './settings';
import { handle } from './broker';
import { normalizedSymbol, type TradeContext, type TradeMarket } from '@/lib/v2/trade';

export async function fetchTradeMarket(context: TradeContext, signal: AbortSignal): Promise<TradeMarket> {
  const { symbol, exchange } = normalizedSymbol(context);
  const params = new URLSearchParams({ symbol });
  if (exchange) params.set('exchange', exchange);
  return handle<TradeMarket>(
    await fetch(`/api/trade/market?${params}`, { headers: authHeaders(), cache: 'no-store', signal }),
  );
}
