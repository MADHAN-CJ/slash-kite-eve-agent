import { date, pgTable, text, timestamp, uuid, bigserial } from 'drizzle-orm/pg-core';

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

export type UserRow = typeof users.$inferSelect;
export type BrokerConnectionRow = typeof brokerConnections.$inferSelect;
