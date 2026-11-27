import { requestOtp, setSession, type SessionUser } from '@/lib/client/settings';

interface VerifiedSession {
  ok: true;
  token: string;
  user: SessionUser;
}

interface RejectedSession {
  ok: false;
  status: number;
  error: string;
}

export function homepageAuth(signedIn: boolean, signInOnLoad: boolean) {
  return {
    signedIn,
    signInOnLoad,
    send: requestOtp,
    async verify(email: string, code: string): Promise<VerifiedSession | RejectedSession> {
      try {
        const response = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, code }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          return { ok: false, status: response.status, error: body?.error ?? 'Could not verify the code.' };
        }
        const { token, user } = (await response.json()) as Omit<VerifiedSession, 'ok'>;
        return { ok: true, token, user };
      } catch {
        return { ok: false, status: 0, error: 'Could not reach /markets. Try again.' };
      }
    },
    saveSession(session: VerifiedSession) {
      setSession(session.token, session.user);
    },
  };
}
