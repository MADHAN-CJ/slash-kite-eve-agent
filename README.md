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
