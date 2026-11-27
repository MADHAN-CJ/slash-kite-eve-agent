import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db, type Db } from '@/agent/lib/db/client';
import { onboarding } from '@/agent/lib/db/schema';
import { otps, users } from '@/agent/lib/db/mcp-schema';
import { otpHash } from './mcp-crypto';
import { HttpError } from './auth';
import { EMAIL_FROM, loginCodeEmail } from './emails';

/**
 * Email OTP login (/markets semantics): 6-digit code, 10-minute life, single
 * use, cooldown between sends. Codes live in the MCP's `otps` table, hashed
 * exactly as the MCP hashes them, and a verified login upserts the MCP's
 * `users` row — logging in here IS logging in to the MCP (plan D15). Without a
 * RESEND_API_KEY the code is logged to the server console (dev only).
 * Dev login: when DEV_LOGIN_EMAIL + DEV_LOGIN_CODE are set (and NODE_ENV is
 * not production) that address accepts that fixed code and is never emailed.
 */

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = Number(process.env.OTP_COOLDOWN_SECONDS ?? 30) * 1000;

function devLogin(): { email: string; code: string } | null {
  if (process.env.NODE_ENV === 'production') return null;
  const email = process.env.DEV_LOGIN_EMAIL?.trim().toLowerCase();
  const code = process.env.DEV_LOGIN_CODE?.trim();
  return email && code ? { email, code } : null;
}

const normalize = (email: string) => email.trim().toLowerCase();

export async function requestOtp(rawEmail: string): Promise<void> {
  const email = normalize(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (devLogin()?.email === email) return; // fixed code, nothing to send

  const recent = await db().query.otps.findFirst({
    where: and(eq(otps.email, email), gt(otps.createdAt, new Date(Date.now() - OTP_COOLDOWN_MS))),
  });
  if (recent) throw new HttpError(429, 'A code was just sent — wait a moment before requesting another.');

  const code = String(randomInt(100000, 1000000));
  const [issued] = await db()
    .insert(otps)
    .values({ email, codeHash: otpHash(code, email), expiresAt: new Date(Date.now() + OTP_TTL_MS) })
    .returning({ id: otps.id });
  try {
    await sendOtpEmail(email, code);
  } catch (error) {
    await db().delete(otps).where(eq(otps.id, issued.id));
    throw error;
  }
}

export async function verifyOtp(rawEmail: string, code: string): Promise<{ userId: string; email: string }> {
  const email = normalize(rawEmail);
  const trimmed = code.trim();
  const dev = devLogin();
  return db().transaction(async (tx) => {
    const valid = dev && dev.email === email ? trimmed === dev.code : await consumeStoredOtp(tx, email, trimmed);
    if (!valid) throw new HttpError(401, 'Invalid or expired code.');

    const [created] = await tx
      .insert(users)
      .values({ email })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email });
    if (created) {
      await tx.insert(onboarding).values({ userId: created.id });
      return { userId: created.id, email: created.email };
    }

    const existing = await tx.query.users.findFirst({ where: eq(users.email, email) });
    if (!existing) throw new HttpError(409, 'Your account changed. Request another code.');
    return { userId: existing.id, email: existing.email };
  });
}

type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

async function consumeStoredOtp(tx: Transaction, email: string, code: string): Promise<boolean> {
  // A resend supersedes earlier codes even if they have time left.
  const latest = tx
    .select({ id: otps.id })
    .from(otps)
    .where(eq(otps.email, email))
    .orderBy(desc(otps.id))
    .limit(1);
  const updated = await tx
    .update(otps)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(otps.id, latest),
        eq(otps.codeHash, otpHash(code, email)),
        isNull(otps.consumedAt),
        gt(otps.expiresAt, sql`now()`),
      ),
    )
    .returning({ id: otps.id });
  return updated.length > 0;
}

async function sendOtpEmail(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production')
      throw new HttpError(503, 'Email delivery is unavailable. Try again later.');
    console.warn(`[otp] RESEND_API_KEY unset — login code for ${email}: ${code}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Sender must be on the Resend-verified domain (codeongrass.com).
      from: EMAIL_FROM,
      to: [email],
      ...loginCodeEmail(code),
    }),
  });
  if (!res.ok) {
    console.error('[otp] Resend send failed:', res.status, await res.text().catch(() => ''));
    throw new HttpError(502, 'Could not send the login code — try again.');
  }
}
