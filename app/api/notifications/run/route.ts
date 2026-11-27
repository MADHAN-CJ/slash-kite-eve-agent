import { timingSafeEqual } from 'node:crypto';
import { deliverNotifications } from '@/lib/server/notifications/worker';
import { errorResponse } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ''}`);
  const provided = Buffer.from(req.headers.get('authorization') ?? '');
  if (!secret || secret.length < 32 || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try { return Response.json(await deliverNotifications(), { headers: { 'cache-control': 'no-store' } }); }
  catch (error) { return errorResponse(error, req); } // detail only with the x-debug-errors header (DEBUG_ERRORS_SECRET)
}
export const POST = GET;
