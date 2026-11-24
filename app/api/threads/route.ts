import { NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/server/auth';
import { listThreads } from '@/lib/server/threads';

export const dynamic = 'force-dynamic';

/** GET /api/threads → the user's chat history (newest first). */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ threads: await listThreads(user.userId) });
  } catch (e) {
    return errorResponse(e);
  }
}
