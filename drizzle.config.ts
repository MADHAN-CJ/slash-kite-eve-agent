import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit manages ONLY schema `eve` (plan D15). The `public` schema belongs
 * to the /markets Kite MCP, whose own migrator creates users/otps/
 * broker_connections/watchers/oauth_* — run the MCP (or `npm run db:mcp-init`)
 * against a fresh database BEFORE `db:migrate`, since `eve.*` references
 * `public.users`.
 */
function pgCredentials(url: string): { url: string; ssl?: { rejectUnauthorized: boolean } } {
  if (!url) return { url };
  const u = new URL(url);
  const mode = u.searchParams.get('sslmode');
  u.searchParams.delete('sslmode');
  if (!mode || mode === 'disable') return { url: u.toString() };
  const verify = mode === 'verify-full' || mode === 'verify-ca' || u.searchParams.has('sslrootcert');
  return { url: u.toString(), ssl: { rejectUnauthorized: verify } };
}

export default defineConfig({
  schema: './agent/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['eve'],
  dbCredentials: {
    // Migrations prefer a direct (unpooled) connection when the provider has a pooler.
    // Managed Postgres presents a provider CA: `sslmode=require` = encrypt without chain
    // verification (same rule as agent/lib/db/client.ts pgConfig()).
    ...pgCredentials(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? ''),
  },
});
