import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { pgConfig } from '../agent/lib/db/client';

/**
 * Apply the /markets Kite MCP's own SQL migrations to this database (plan D15:
 * one database, the MCP owns `public`). Mirrors `zap_kite_mcp/db.py::migrate`
 * exactly — same `schema_migrations` bookkeeping — so running the real MCP
 * against the database afterwards is a no-op. For local dev and CI only; on a
 * shared staging/prod database the MCP itself migrates on boot.
 *
 *   MCP_MIGRATIONS_DIR=../zap-kite-mcp/mcp/src/zap_kite_mcp/migrations npm run db:mcp-init
 */
const dir = resolve(process.env.MCP_MIGRATIONS_DIR ?? '../zap-kite-mcp/mcp/src/zap_kite_mcp/migrations');
const url: string = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '';
if (!url) throw new Error('DATABASE_URL is not set');

async function main() {
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  if (files.length === 0) throw new Error(`no migrations in ${dir}`);
  const c = new pg.Client(pgConfig(url));
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    await c.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    const done = new Set((await c.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const applied: string[] = [];
    for (const name of files) {
      if (done.has(name)) continue;
      await c.query(readFileSync(join(dir, name), 'utf8'));
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      applied.push(name);
    }
    await c.query('COMMIT');
    console.log(applied.length ? `applied MCP migrations: ${applied.join(', ')}` : 'MCP schema already up to date');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error('db:mcp-init failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
