import { eq, sql } from 'drizzle-orm';
import { db } from '@/agent/lib/db/client';
import { onboarding } from '@/agent/lib/db/schema';
import { requireUser, HttpError, errorResponse } from '@/lib/server/auth';
import { isTourMarket } from '@/lib/v2/tour';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { userId } = await requireUser(req);
    const state = await db().query.onboarding.findFirst({ where: eq(onboarding.userId, userId) });
    return Response.json({ pending: state?.completedAt === null, markets: state?.markets.filter(isTourMarket) ?? [] });
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function PUT(req: Request) {
  try {
    const { userId } = await requireUser(req);
    const { markets } = (await req.json().catch(() => null)) ?? {};
    if (!Array.isArray(markets) || markets.length > 4 || !markets.every(isTourMarket)) {
      throw new HttpError(400, 'Choose from NSE stocks, Index, F&O or MCX.');
    }
    const unique = [...new Set(markets)];
    await db().insert(onboarding)
      .values({ userId, markets: unique, completedAt: sql`now()` })
      .onConflictDoUpdate({
        target: onboarding.userId,
        set: { markets: unique, completedAt: sql`coalesce(${onboarding.completedAt}, now())` },
      });
    return Response.json({ pending: false, markets: unique });
  } catch (error) {
    return errorResponse(error, req);
  }
}
