import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { pgConfig } from '../agent/lib/db/client';

/**
 * Apply ./drizzle to the database (schema `eve` only — plan D15). Uses the same
 * connection rules as the app (pgConfig: provider TLS, `options=…search_path`
 * preserved), which drizzle-kit's CLI does not honour reliably against managed
 * Postgres. Prefers the direct (unpooled) URL when one is configured.
 */
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '';
if (!url) throw new Error('DATABASE_URL is not set');

const pool = new Pool({ ...pgConfig(url), max: 1 });
try {
  const before = await pool.query<{ count: string }>(
    `select count(*)::text as count from information_schema.tables where table_schema = 'eve'`,
  );
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  const after = await pool.query<{ count: string }>(
    `select count(*)::text as count from information_schema.tables where table_schema = 'eve'`,
  );
  const host = new URL(url).host;
  console.log(`migrations applied on ${host}: eve tables ${before.rows[0].count} → ${after.rows[0].count}`);
} finally {
  await pool.end();
}
