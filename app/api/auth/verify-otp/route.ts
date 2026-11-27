import { errorResponse, signSessionJwt } from '@/lib/server/auth';
import { verifyOtp } from '@/lib/server/otp';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: string; code?: string } | null;
    if (typeof body?.email !== 'string' || !body.email.trim() || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code.trim())) {
      return Response.json({ error: 'Email and code are required.' }, { status: 400 });
    }
    const user = await verifyOtp(body.email, body.code);
    const token = await signSessionJwt({ userId: user.userId, email: user.email });
    return Response.json({ token, isNewAccount: user.isNewAccount, user: { id: user.userId, email: user.email } });
  } catch (e) {
    return errorResponse(e, req);
  }
}
