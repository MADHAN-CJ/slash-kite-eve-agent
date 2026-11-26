# /markets · Kite edition on eve

**An AI analyst for your Zerodha account and the Indian markets, inside a chat.**

Repo `slash-kite-eve-agent`. The agent runs on Vercel's [eve](https://eve.dev) and has
exactly three capability sources: the `/markets` Kite MCP (`https://mcp.slash.markets`,
connected over OAuth 2.1 as the signed-in user), Tavily web search for the news behind a
move, and the Kite MCP's own `SKILL.md` loaded on demand. It never places, modifies or
cancels an order — you trade in Zerodha's Kite yourself.

`Next.js 16` · `React 19` · `eve` · `claude-sonnet-5` · `Postgres + Drizzle`

Plan, decisions and build status: [`docs/plan-v1.md`](docs/plan-v1.md).

## Local development

```bash
nvm use 24
npm install
docker compose up -d           # Postgres on :5439
cp .env.example .env           # fill the keys and secrets
npm run db:migrate
npm run dev                    # Next + eve on http://localhost:3000
```

`npm run typecheck` · `npm run build` · `npm run build:eve` · `npm run db:smoke`.

## Tests

```bash
npm test                 # unit (chart-line parser, skill contract) + indicator suite
npm run test:unit        # offline only
npm run test:indicators  # every zapkite indicator and the options math, each file in
                         # its own worker, run THROUGH the MCP's run_python with
                         # synthetic data and hand-computed expectations
```

The indicator files need an app user with a live /markets grant whose Zerodha
session is active: log into the app, let it connect /markets, then run with
`MCP_TEST_EMAIL=<that email>` (default `DEV_LOGIN_EMAIL`), or pass an MCP access
token directly as `MCP_TEST_ACCESS_TOKEN`. Without one they are reported as
skipped, never failed.

Other scripts: `npm run e2e:oauth` (OAuth flow against the MCP), `npm run
e2e:agent` (two real agent turns), `npm run e2e:refresh-race` (cross-process
token refresh), `npm run mcp:connect` (connect the dev user without a browser),
`python3 scripts/ui-smoke.py` (Playwright browser smoke).

## Deploy (Vercel)

One Vercel project (`slash-kite-eve`): the Next app serves the eve runtime itself
through `withEve`, so there is no separate runtime project and `EVE_UPSTREAM_ORIGIN`
stays unset. `npm run build` first syncs the Kite skill (`prebuild`), so the
git-ignored `agent/skills/kite-markets/SKILL.md` is regenerated on every build.

1. `npx vercel link --project slash-kite-eve` once (`.vercel/` is git-ignored).
2. Set the production env vars from `.env.example` on the project — fresh secrets
   per environment, a Neon `DATABASE_URL` (+ `DATABASE_URL_UNPOOLED`), and
   `APP_BASE_URL` = the public URL (the MCP OAuth redirect is derived from it).
3. `DATABASE_URL_UNPOOLED=<direct url> npm run db:migrate` to apply `drizzle/`.
4. `bash scripts/deploy.sh --prod` (without `--prod` for a preview build check).
5. Smoke: `GET /api/eve/v1/health` → `{"ok":true,"status":"ready"}`, then log in
   with a real email code and let the app connect you to /markets.

## How the MCP connection works (plan §10)

This app IS the /markets web app: it shares ONE Postgres with the Kite MCP. The MCP owns
schema `public` (`users`, `otps`, `broker_connections`, `watchers`, `oauth_*`); this app owns
schema `eve` (threads, messages, session context, a per-user MCP token cache).

- **Login = MCP login.** The email code upserts the MCP's own `users` row (hashes and
  encryption are byte-compatible with the Python MCP — `lib/server/mcp-crypto.ts`).
- **No second login for the agent.** The server mints the user's MCP access token with the
  RFC 7523 JWT-bearer grant: a 60 s assertion signed with `MCP_ASSERTION_SECRET`, presented by
  the confidential client `MCP_TRUSTED_CLIENT_ID`/`_SECRET`. The MCP must be configured with
  the same three values (`ZAP_KITE_MCP_TRUSTED_CLIENT_*`, `ZAP_KITE_MCP_ASSERTION_SECRET`).
- **Login with Kite happens here.** `/api/broker/kite/login/start` sends the browser to
  Zerodha; Zerodha returns to `<APP_BASE_URL>/api/broker/kite/callback` (the redirect URL
  registered on the Kite Connect app), which stores the session in the MCP's table. Until the
  session is `active` the chat is gated by the connect screen (skippable; a banner remains).

### Local stack

```sh
docker compose up -d                 # Postgres :5439
npm run db:mcp-init                  # the MCP's migrations (public schema)
npm run db:migrate                   # ours (eve schema)
npm run dev:mcp                      # the sibling MCP on :8029, trusting this app
KITE_MCP_URL=http://127.0.0.1:8029 npm run dev
```

Checks: `npm run test:unit` · `npm run db:smoke` · `KITE_MCP_URL=http://127.0.0.1:8029 npm run
e2e:mint-race` (one mint across 6 processes) · `npm run e2e:agent` (real model turns) ·
`/usr/bin/python3 scripts/ui-smoke.py` (Playwright + an embedded fake Zerodha; start the dev
server with the `KITE_*` overrides printed at the top of that script).
