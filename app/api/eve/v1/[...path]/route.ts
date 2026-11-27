import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/agent/lib/db/client';
import { threads } from '@/agent/lib/db/schema';
import { upsertSessionContext } from '@/agent/lib/db/session-context';
import { errorResponse, requireUser, type SessionUser } from '@/lib/server/auth';
import { creditsNow } from '@/lib/server/limits';
import { threadLimit } from '@/lib/server/threads';

/**
 * App-owned proxy in front of eve's session routes. The browser points
 * `useEveAgent({ host: "/api" })` here with the Zap JWT; the proxy:
 *
 *  1. authenticates the Zap session (401 = "log in again", nothing else);
 *  2. enforces thread ownership on every session-scoped call (403/404);
 *  3. on create, records the owner in session_context (how the MCP
 *     connection resolves the user's grant via ctx.session.id — no secret
 *     ever enters the model);
 *  4. injects the DB-stored continuation token on follow-ups. Client tokens
 *     are ignored: eve routes by token (a stale/foreign one silently FORKS a
 *     new session), so the server stays the source of truth.
 *
 * Only the three session routes are exposed; everything else 404s.
 */

export const dynamic = 'force-dynamic';

const SESSION_ID = /^wrun_[A-Z0-9]+$/;

type Params = { params: Promise<{ path: string[] }> };

/**
 * Where the eve runtime lives. Locally it's mounted on the same origin (the
 * withEve dev server); in production it's a separate Vercel project, named by
 * EVE_UPSTREAM_ORIGIN.
 */
function upstreamUrl(req: Request, path: string[]): URL {
  const url = new URL(req.url);
  const origin = process.env.EVE_UPSTREAM_ORIGIN?.replace(/\/$/, '') || url.origin;
  return new URL(`/eve/v1/${path.join('/')}${url.search}`, origin);
}

function upstreamHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const secret = process.env.EVE_PROXY_SECRET;
  return { ...(secret ? { 'x-eve-proxy-secret': secret } : {}), ...extra };
}

/** The live, owned thread row for a session id (typed failure otherwise). */
async function ownedThread(user: SessionUser, eveSessionId: string) {
  const row = await db().query.threads.findFirst({
    where: and(eq(threads.eveSessionId, eveSessionId), isNull(threads.deletedAt)),
  });
  if (!row) return { error: NextResponse.json({ error: 'Conversation not found.' }, { status: 404 }) };
  if (row.userId && row.userId !== user.userId) {
    return { error: NextResponse.json({ error: 'This conversation belongs to a different account.' }, { status: 403 }) };
  }
  return { row };
}

/** V10 / D6: no credits left this month → 402, the UI shows the credits card. */
async function creditsOut(user: SessionUser): Promise<NextResponse | null> {
  const c = await creditsNow(user.userId);
  if (!c.out) return null;
  return NextResponse.json({ error: 'You’ve used this month’s credits.', code: 'CREDITS_OUT', resetsOn: c.resetsOn }, { status: 402 });
}

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const path = (await params).path;

    // --- POST session → create a new chat ---
    if (path.length === 1 && path[0] === 'session') {
      const body = (await req.json().catch(() => null)) as { message?: string } | null;
      if (!body || typeof body.message !== 'string' || !body.message.trim()) {
        return NextResponse.json({ error: 'A message is required.' }, { status: 400 });
      }
      const outOfCredits = await creditsOut(user);
      if (outOfCredits) return outOfCredits;
      const upstream = await fetch(upstreamUrl(req, path), {
        method: 'POST',
        headers: upstreamHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ message: body.message.trim() }),
      });
      const payload = (await upstream.json().catch(() => null)) as
        | { sessionId?: string; continuationToken?: string }
        | null;
      if (!upstream.ok || !payload?.sessionId) {
        return NextResponse.json({ error: 'Could not start the conversation.' }, { status: 502 });
      }

      // Own the session + thread from the first instant (the connection resolves
      // the grant through session_context; the persist hook backfills if it raced us).
      await upsertSessionContext(payload.sessionId, user.userId);
      await db()
        .insert(threads)
        .values({
          eveSessionId: payload.sessionId,
          userId: user.userId,
          // Title is filled by the persist hook from the first user message.
          continuationToken: payload.continuationToken ?? null,
        })
        .onConflictDoNothing({ target: threads.eveSessionId });
      // The browser never sees the real continuation token — the proxy injects the stored one on every
      // follow-up. It gets a placeholder instead: eve's client refuses an approval-only send (the
      // watcher confirm card's Start) unless it holds SOME token, as resumed threads already do.
      return NextResponse.json({ ...payload, continuationToken: 'proxy-managed' }, { status: upstream.status });
    }

    // --- POST session/<id> → follow-up message ---
    if (path.length === 2 && path[0] === 'session' && SESSION_ID.test(path[1])) {
      const sessionId = path[1];
      const found = await ownedThread(user, sessionId);
      if ('error' in found) return found.error;
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
      }
      const token = found.row.continuationToken;
      if (!token) return NextResponse.json({ error: 'This conversation cannot be resumed.' }, { status: 409 });
      // V10 gates: a message (not an approval reply) needs credits and a chat that is not full.
      if (typeof (body as { message?: unknown }).message === 'string') {
        const outOfCredits = await creditsOut(user);
        if (outOfCredits) return outOfCredits;
        if ((await threadLimit(found.row.id)) === 'full') {
          return NextResponse.json({ error: 'This chat is full. Start a new one.', code: 'CHAT_FULL' }, { status: 409 });
        }
      }

      // Refresh ownership context for the connection on every send.
      await upsertSessionContext(sessionId, user.userId);
      const upstream = await fetch(upstreamUrl(req, path), {
        method: 'POST',
        headers: upstreamHeaders({ 'content-type': 'application/json' }),
        // Server-stored token wins — client tokens can silently fork.
        body: JSON.stringify({ ...(body as object), continuationToken: token }),
      });
      const payload = (await upstream.json().catch(() => null)) as { sessionId?: string } | null;
      if (payload?.sessionId && payload.sessionId !== sessionId) {
        // Fork signal: eve routed the token to a different session. Fail loudly.
        console.error(`[api/eve] continuation fork: sent to ${sessionId}, eve answered ${payload.sessionId}`);
        return NextResponse.json({ error: 'The conversation is out of sync — reload and try again.' }, { status: 409 });
      }
      return NextResponse.json(payload ?? { ok: upstream.ok }, { status: upstream.status });
    }

    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: Request, { params }: Params) {
  try {
    const path = (await params).path;

    // Liveness probe — no data, no auth (the client may check it pre-send).
    if (path.length === 1 && path[0] === 'health') {
      const upstream = await fetch(upstreamUrl(req, path), { headers: upstreamHeaders() });
      return new Response(upstream.body, { status: upstream.status });
    }

    const user = await requireUser(req);

    // --- GET session/<id>/stream → NDJSON event stream (pass-through) ---
    if (path.length === 3 && path[0] === 'session' && SESSION_ID.test(path[1]) && path[2] === 'stream') {
      const found = await ownedThread(user, path[1]);
      if ('error' in found) return found.error;
      const upstream = await fetch(upstreamUrl(req, path), {
        headers: upstreamHeaders({ accept: req.headers.get('accept') ?? 'application/x-ndjson' }),
        signal: req.signal,
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'content-type': upstream.headers.get('content-type') ?? 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  } catch (e) {
    return errorResponse(e);
  }
}
