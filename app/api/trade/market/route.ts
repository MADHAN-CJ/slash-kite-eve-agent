import { errorResponse, HttpError, requireUser } from '@/lib/server/auth';
import { marketInput, tradeMarket } from '@/lib/server/trade-market';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Instrument metadata only. Order details never go to this server. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const params = new URL(req.url).searchParams;
    const input = marketInput.safeParse({
      symbol: params.get('symbol'),
      exchange: params.get('exchange') ?? undefined,
    });
    if (!input.success) throw new HttpError(400, 'Enter a valid trading symbol and exchange.');
    return Response.json(await tradeMarket(user.userId, input.data), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return errorResponse(error, req);
  }
}
