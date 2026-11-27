import { eq } from 'drizzle-orm';
import { db } from '@/agent/lib/db/client';
import { notificationPreferences } from '@/agent/lib/db/schema';
import { requireUser, errorResponse } from '@/lib/server/auth';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const p = await db().query.notificationPreferences.findFirst({ where: eq(notificationPreferences.userId, user.userId) });
    return Response.json({ watchers: p?.watchers ?? true, growth: p?.growth ?? true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
export async function PUT(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => null) as { watchers?: unknown; growth?: unknown } | null;
    if (!body || typeof body.watchers !== 'boolean' || typeof body.growth !== 'boolean') {
      return Response.json({ error: 'Choose both email preferences.' }, { status: 400 });
    }
    await db().insert(notificationPreferences).values({ userId: user.userId, watchers: body.watchers, growth: body.growth })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: { watchers: body.watchers, growth: body.growth, updatedAt: new Date() } });
    return Response.json({ watchers: body.watchers, growth: body.growth });
  } catch (error) { return errorResponse(error); }
}
