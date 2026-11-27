import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { Cost, MessagePart, Role, Usage } from './types';

/**
 * Everything THIS app owns lives in schema `eve` (plan D15): the database is
 * shared with the /markets Kite MCP, which owns `public` (see mcp-schema.ts).
 * drizzle-kit manages only this file. threads/messages are written by the
 * persist hook + the eve proxy — the system of record for DISPLAYING
 * conversations; eve's workflow store remains the system of record for
 * CONTINUING them. User ids point at `public.users` (the MCP's table); the
 * foreign keys are added by hand in the migration because drizzle-kit must
 * not learn about `public` (it would try to create those tables).
 */

export const eve = pgSchema('eve');

/**
 * Cached MCP access token per user, minted silently with the trusted-app
 * (RFC 7523 JWT-bearer) grant — plan D16. Deleted on app logout; re-minted on
 * demand, so a missing row is never an error state. Decrypted only in the
 * connection's token resolver.
 */
export const mcpGrants = eve.table('mcp_grants', {
  /** → public.users.id (FK in the migration). */
  userId: uuid('user_id').primaryKey(),
  issuer: text('issuer').notNull(),
  accessTokenEnc: text('access_token_enc').notNull(),
  accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
  scope: text('scope'),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Which user an eve session belongs to. WRITTEN only by the eve proxy
 * (before forwarding each send); READ by the connection's token resolver
 * and the persist hook's owner backfill. This is how the agent reaches the
 * user's MCP token WITHOUT any secret ever entering the model context.
 */
export const sessionContext = eve.table('session_context', {
  eveSessionId: text('eve_session_id').primaryKey(),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const threads = eve.table(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eveSessionId: text('eve_session_id').notNull().unique(),
    /**
     * Owning user. Nullable ONLY during the first turn: the persist hook may
     * create the thread before the proxy has stored the session context; the
     * hook backfills it from session_context as soon as the row exists.
     * Rows with a null owner are never listed.
     */
    userId: uuid('user_id'),
    /** Latest eve resume handle; rotates every turn (stored on session.waiting). */
    continuationToken: text('continuation_token'),
    /** Set on turn.started, cleared when the turn/session ends. Stale (>10 min) = idle. */
    busySince: timestamp('busy_since', { withTimezone: true }),
    /** Resume cursor for useEveAgent (count of mirrored stream events). */
    streamIndex: integer('stream_index').notNull().default(0),
    /** First user message (40 chars) until the user renames it. */
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete — the list and the proxy treat these rows as gone. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('threads_user_idx').on(t.userId)],
);

export const messages = eve.table(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    turnSequence: integer('turn_sequence').notNull(),
    role: text('role').$type<Role>().notNull(),
    /** Final text (assistant: concatenated text blocks of the turn). */
    content: text('content').notNull().default(''),
    /** Ordered tool activity for the turn; mirrors the UI's MessagePart shape. */
    parts: jsonb('parts').$type<MessagePart[]>().notNull().default([]),
    usage: jsonb('usage').$type<Usage>(),
    /** Computed server-side from usage × price table; null when model unpriced. */
    cost: jsonb('cost').$type<Cost>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_thread_created_idx').on(t.threadId, t.createdAt),
    /**
     * One assistant row per turn — upserted as the turn's fragments stream in,
     * so a crash mid-turn loses at most the unflushed fragment. User rows are
     * exempt: eve may fold multiple queued deliveries into one turn.
     */
    uniqueIndex('messages_assistant_turn_uidx')
      .on(t.threadId, t.turnSequence)
      .where(sql`${t.role} = 'assistant'`),
  ],
);

/**
 * Which chat a watcher came from (plan-v2 D9 — additive). The watcher itself
 * lives in the MCP's `public.watchers`; this row is written by the persist
 * hook when a `create_watcher` call made in THIS app succeeds, so the
 * Watchers screen can offer "Open in chat". Watchers created elsewhere
 * (Claude, ChatGPT) simply have no row.
 */
export const watcherLinks = eve.table(
  'watcher_links',
  {
    /** → public.watchers.id (no FK: the MCP owns and may delete that table's rows). */
    watcherId: text('watcher_id').primaryKey(),
    userId: uuid('user_id').notNull(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('watcher_links_user_idx').on(t.userId)],
);

export type McpGrantRow = typeof mcpGrants.$inferSelect;
export type WatcherLinkRow = typeof watcherLinks.$inferSelect;
export type SessionContextRow = typeof sessionContext.$inferSelect;
export type ThreadRow = typeof threads.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

/** App onboarding state and the markets selected by the account owner. */
export const onboarding = eve.table('onboarding', {
  userId: uuid('user_id').primaryKey(),
  markets: text('markets').array().notNull().default(sql`ARRAY[]::text[]`),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
