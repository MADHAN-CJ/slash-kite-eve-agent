import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as mcpSchema from './mcp-schema';
import * as ownSchema from './schema';

const schema = { ...mcpSchema, ...ownSchema };

/**
 * Lazy singleton Postgres client. Cached on globalThis so Next.js dev HMR and
 * the eve runtime (which may load this module through a separate bundle) don't
 * leak connection pools. Callers that must never crash the agent loop (the
 * persist hook) catch errors themselves; API routes let a missing DATABASE_URL
 * surface as a 500 with a clear message.
 */

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __slashKiteDb?: { pool: Pool; db: Db };
};

/**
 * Managed Postgres (DigitalOcean, Neon, …) requires TLS but presents a
 * provider CA the Node trust store does not know, which `pg` rejects as
 * "self-signed certificate in chain". `sslmode=require` in the URL means
 * "encrypt, don't verify the chain" (libpq semantics); `verify-full`,
 * `verify-ca` or an `sslrootcert` keep full verification. `pg` applies the
 * URL's sslmode on top of any `ssl` option, so the mode is stripped from the
 * string we hand it and expressed as the `ssl` option instead.
 */
export function pgConfig(url: string): { connectionString: string; ssl: false | { rejectUnauthorized: boolean } } {
  const u = new URL(url);
  const mode = u.searchParams.get('sslmode');
  const rootCert = u.searchParams.get('sslrootcert');
  u.searchParams.delete('sslmode');
  if (!mode || mode === 'disable') return { connectionString: u.toString(), ssl: false };
  const verify = mode === 'verify-full' || mode === 'verify-ca' || Boolean(rootCert);
  return { connectionString: u.toString(), ssl: { rejectUnauthorized: verify } };
}

export function db(): Db {
  if (globalForDb.__slashKiteDb) return globalForDb.__slashKiteDb.db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set — chat persistence is unavailable.');
  }

  const pool = new Pool({ ...pgConfig(url), max: 10 });
  const client = drizzle(pool, { schema });
  globalForDb.__slashKiteDb = { pool, db: client };
  return client;
}
