import { bigserial, boolean, date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Tables OWNED BY THE /markets KITE MCP (plan D15: one database, shared). They
 * mirror `zap-kite-mcp/mcp/src/zap_kite_mcp/migrations/0001_init.sql` and are
 * created by the MCP's own migrator — this file is deliberately NOT part of
 * drizzle-kit's schema path, so `db:generate` never touches `public`. A user
 * here IS the MCP user: the same `users` row the MCP's tools resolve the
 * bearer token to, which is what makes "log in to this app" equal "log in to
 * the MCP" (plan §10).
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Login codes, hashed with the MCP's `otp_hash` (see lib/server/mcp-crypto.ts). */
export const otps = pgTable('otps', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BrokerConnectionStatus = 'active' | 'token_expired' | 'disconnected';

/**
 * The user's Zerodha (Kite) session. Written by this app's Kite login
 * callback (token encrypted with the MCP's key), READ by the MCP's `run_python`
 * gateway. `expires_at` = the next ~06:00 IST, when Kite ends every session.
 */
export const brokerConnections = pgTable('broker_connections', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  kiteUserId: text('kite_user_id').notNull(),
  userName: text('user_name'),
  accessTokenEnc: text('access_token_enc'),
  status: text('status').$type<BrokerConnectionStatus>().notNull(),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  tokenMailSentOn: date('token_mail_sent_on'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WatcherStatus = 'ARMED' | 'PAUSED' | 'ERROR' | 'EXPIRED' | 'CANCELLED';
export type WatcherPausedBy = 'user' | 'broker';

/**
 * Watchers: condition scripts the MCP's sweeper runs during market hours.
 * CREATED only by the MCP's `create_watcher` tool; this app lists them and
 * flips `status` (pause / resume / cancel) — it never writes a script.
 */
export const watchers = pgTable('watchers', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  symbol: text('symbol').notNull(),
  label: text('label').notNull(),
  script: text('script').notNull(),
  market: text('market').notNull(),
  checkEveryS: integer('check_every_s').notNull(),
  status: text('status').$type<WatcherStatus>().notNull(),
  statusReason: text('status_reason'),
  pausedBy: text('paused_by').$type<WatcherPausedBy>(),
  baselineDone: boolean('baseline_done').notNull().default(false),
  latched: boolean('latched').notNull().default(false),
  lastMet: boolean('last_met'),
  lastValue: text('last_value'),
  lastDetail: text('last_detail'),
  lastError: text('last_error'),
  errorCount: integer('error_count').notNull().default(0),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
  firedCount: integer('fired_count').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One row per alert a watcher raised (written by the MCP's sweeper). */
export const watcherFires = pgTable('watcher_fires', {
  id: text('id').primaryKey(),
  watcherId: text('watcher_id')
    .notNull()
    .references(() => watchers.id, { onDelete: 'cascade' }),
  firedAt: timestamp('fired_at', { withTimezone: true }).notNull().defaultNow(),
  value: text('value'),
  detail: text('detail'),
  emailed: boolean('emailed').notNull().default(false),
});

export type UserRow = typeof users.$inferSelect;
export type BrokerConnectionRow = typeof brokerConnections.$inferSelect;
export type WatcherRow = typeof watchers.$inferSelect;
export type WatcherFireRow = typeof watcherFires.$inferSelect;
