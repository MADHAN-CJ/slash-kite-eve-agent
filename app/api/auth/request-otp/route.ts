import { errorResponse } from '@/lib/server/auth';
import { requestOtp } from '@/lib/server/otp';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: string } | null;
    if (typeof body?.email !== 'string' || !body.email.trim()) return Response.json({ error: 'Email is required.' }, { status: 400 });
    const result = await requestOtp(body.email, req.headers.get('user-agent') ?? '');
    return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
