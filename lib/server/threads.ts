import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/agent/lib/db/client';
import { watchers } from '@/agent/lib/db/mcp-schema';
import { messages, threads, watcherLinks } from '@/agent/lib/db/schema';
import { carryOver, type ChatLimit, chatLimit } from './limits';
import type { Cost, MessagePart, Role, Usage } from '@/agent/lib/db/types';
import { HttpError } from './auth';

/**
 * Server-side thread service. Every entry point takes the authenticated
 * USER ID (from the session JWT — never a client-supplied id) and only ever
 * returns rows that user owns.
 */

export interface ThreadSummary {
  id: string;
  title: string | null;
  eveSessionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiMessage {
  id: string;
  role: Role;
  content: string;
  parts: MessagePart[];
  usage: Usage | null;
  cost: Cost | null;
  createdAt: string;
}

export interface ThreadDetail extends ThreadSummary {
  /**
   * Resume cursor: the client opens the event stream here on its next send, so
   * history (already rendered from `messages`) never replays into the live
   * view. The continuation token is NOT exposed — the proxy injects it.
   */
  streamIndex: number;
  messages: ApiMessage[];
  /** V10: `long` = soft note, `full` = the box is replaced and the proxy refuses more turns. */
  limit: ChatLimit;
  /** V10: what a new chat carries over when this one is full (shown, not sent). */
  carry: string;
}

type ThreadRowShape = typeof threads.$inferSelect;

function summarize(r: ThreadRowShape): ThreadSummary {
  return {
    id: r.id,
    title: r.title,
    eveSessionId: r.eveSessionId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listThreads(userId: string): Promise<ThreadSummary[]> {
  const rows = await db()
    .select()
    .from(threads)
    .where(and(eq(threads.userId, userId), isNull(threads.deletedAt)))
    .orderBy(desc(threads.updatedAt));
  return rows.map(summarize);
}

const TITLE_MAX = 80;

export async function renameThread(userId: string, threadId: string, title: string): Promise<ThreadSummary> {
  await ownedThread(userId, threadId); // throws 404/403
  const trimmed = title.trim().slice(0, TITLE_MAX);
  if (!trimmed) throw new HttpError(400, 'Title cannot be empty.');
  const [row] = await db()
    .update(threads)
    .set({ title: trimmed })
    .where(eq(threads.id, threadId))
    .returning();
  return summarize(row);
}

/** The owned, live thread row or a typed 404/403. */
async function ownedThread(userId: string, threadId: string) {
  const row = await db().query.threads.findFirst({ where: eq(threads.id, threadId) });
  if (!row || row.deletedAt) throw new HttpError(404, 'Conversation not found.');
  if (row.userId !== userId) throw new HttpError(403, 'This conversation belongs to a different account.');
  return row;
}

/**
 * Approval semantics put an approved tool's result in the NEXT turn's message:
 * message N ends with a `tool_call`, message N+1 starts with the matching
 * `tool_result`. Move each message's LEADING orphan result parts onto the
 * earlier message that holds the matching call, so the UI renders one
 * resolved tool panel. (No approvals in this read-only product, but the
 * stitch is harmless and keeps the chassis intact.)
 */
function stitchOrphanResults(msgs: ApiMessage[]): ApiMessage[] {
  const callSites = new Map<string, ApiMessage>();
  for (const msg of msgs) {
    let leading = true;
    const kept: MessagePart[] = [];
    for (const part of msg.parts) {
      if (part.type === 'tool_call') {
        callSites.set(part.toolCallId, msg);
        leading = false;
        kept.push(part);
        continue;
      }
      const owner = leading ? callSites.get(part.toolCallId) : undefined;
      if (owner && owner !== msg) {
        owner.parts.push(part);
      } else {
        kept.push(part);
      }
    }
    msg.parts = kept;
  }
  return msgs;
}

export async function getThread(userId: string, threadId: string): Promise<ThreadDetail> {
  const thread = await ownedThread(userId, threadId);
  const rows = await db()
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(messages.turnSequence, desc(messages.role), messages.createdAt);
  const shaped: ApiMessage[] = rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    parts: m.parts,
    usage: m.usage ?? null,
    cost: m.cost ?? null,
    createdAt: m.createdAt.toISOString(),
  }));
  const stitched = stitchOrphanResults(shaped);
  const limit = chatLimit(stitched);
  return {
    ...summarize(thread),
    streamIndex: thread.streamIndex,
    messages: stitched,
    limit,
    carry: limit === 'full' ? carryOver(thread.title, stitched, await watcherLabelsOf(threadId)) : '',
  };
}

/** Labels of the watchers started from this chat (eve.watcher_links → public.watchers). */
async function watcherLabelsOf(threadId: string): Promise<string[]> {
  const links = await db().select({ id: watcherLinks.watcherId }).from(watcherLinks).where(eq(watcherLinks.threadId, threadId));
  if (!links.length) return [];
  const rows = await db()
    .select({ label: watchers.label })
    .from(watchers)
    .where(inArray(watchers.id, links.map((l) => l.id)));
  return rows.map((r) => r.label).filter(Boolean);
}

/** The limit of a thread for the proxy's gate (same rule as getThread). */
export async function threadLimit(threadId: string): Promise<ChatLimit> {
  const rows = await db()
    .select({ role: messages.role, content: messages.content, usage: messages.usage })
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(messages.turnSequence, messages.createdAt);
  return chatLimit(rows.map((r) => ({ role: r.role, content: r.content, usage: r.usage ?? null })));
}

export async function deleteThread(userId: string, threadId: string): Promise<void> {
  await ownedThread(userId, threadId); // throws 404/403
  await db().update(threads).set({ deletedAt: new Date() }).where(eq(threads.id, threadId));
}
