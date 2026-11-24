import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { Cost, MessagePart, Role, Usage } from './types';

/**
 * /markets Kite-edition schema. threads/messages are written by the persist
 * hook + the eve proxy — they are the system of record for DISPLAYING
 * conversations; eve's workflow store remains the system of record for
 * CONTINUING them. The MCP's own database is never touched: mcp_clients and
 * mcp_grants hold only what this app receives from its OAuth server.
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const otps = pgTable(
  'otps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    /** HMAC-SHA256(code:email, CREDS_HASH_PEPPER) — raw codes are never stored. */
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('otps_email_idx').on(t.email)],
);

/**
 * This deployment's dynamic-client registration with the Kite MCP's OAuth
 * server, keyed by the MCP origin so staging and production can coexist.
 */
export const mcpClients = pgTable('mcp_clients', {
  issuer: text('issuer').primaryKey(),
  clientId: text('client_id').notNull(),
  /** AES-256-GCM; null for public clients. */
  clientSecretEnc: text('client_secret_enc'),
  redirectUri: text('redirect_uri').notNull(),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One user's OAuth grant on the Kite MCP (access 1 h, refresh 30 d, pairs
 * rotate on refresh). Deleted on app logout — the MCP has no revocation
 * endpoint, so discarding the refresh token is how access "goes away".
 * Decrypted only in the connection's token resolver and the mcp API routes.
 */
export const mcpGrants = pgTable('mcp_grants', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  issuer: text('issuer').notNull(),
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc'),
  accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
  scope: text('scope'),
  status: text('status').$type<'active' | 'expired'>().notNull().default('active'),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One in-flight authorization against the MCP: the PKCE verifier never leaves
 * the server (a redirect interceptor holding `code`+`state` still cannot
 * exchange it). Rows live 10 minutes and are deleted on use.
 */
export const mcpAuthTxns = pgTable('mcp_auth_txns', {
  state: text('state').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  issuer: text('issuer').notNull(),
  codeVerifier: text('code_verifier').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Which user an eve session belongs to. WRITTEN only by the eve proxy
 * (before forwarding each send); READ by the connection's token resolver
 * and the persist hook's owner backfill. This is how the agent reaches the
 * user's MCP grant WITHOUT any secret ever entering the model context.
 */
export const sessionContext = pgTable('session_context', {
  eveSessionId: text('eve_session_id').primaryKey(),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const threads = pgTable(
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

export const messages = pgTable(
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

export type UserRow = typeof users.$inferSelect;
export type McpClientRow = typeof mcpClients.$inferSelect;
export type McpGrantRow = typeof mcpGrants.$inferSelect;
export type McpAuthTxnRow = typeof mcpAuthTxns.$inferSelect;
export type SessionContextRow = typeof sessionContext.$inferSelect;
export type ThreadRow = typeof threads.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
