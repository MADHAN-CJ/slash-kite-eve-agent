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
