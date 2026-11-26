# Plan v1 — slash-kite-eve-agent (/markets · Kite edition on eve)

> Drafted 2026-11-23 from the user's answers (memory `zap-kite-eve-agent.md`, D1–D11 + follow-ups).
> Playbook rules: phases with a Verify step, no commits by Claude, stop on ambiguity.
> Repo: `zap/slash-kite-eve-agent/` (seeded from `zap/zap-eve-agent`).

## 1. The product

A **general chat** for a /markets user about their Zerodha account and Indian markets. The agent
(eve chassis) has exactly three capability sources:

1. **The deployed Kite MCP** (`https://mcp.slash.markets`, repo `zap-kite-mcp/mcp/`) as ONE eve
   MCP connection — tools as deployed: `run_python`, `auth_status`, `create_watcher`,
   `list_watchers`, `profile`. The MCP is **not modified**.
2. **Tavily web search** (`web_search` tool, our own `defineTool` overriding eve's provider-run
   default) — restricted to markets/finance topics, results carry citations into the UI.
3. **The `zap-kite-mcp/mcp/SKILL.md`** as an eve skill loaded on demand via `load_skill`, fetched
   at boot from `$KITE_MCP_URL/SKILL.md` (fallback: committed copy), with a short preface that maps
   tool names and states the web-search rules.

Zero writes anywhere (no order placement; watchers = e-mail alerts, allowed ungated as on claude.ai).
Threads/history, login, UI chrome and design (`/markets` brand) copied from zap-eve-agent.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | General chat, not position-first. No positions list, no position hub; sidebar = plain thread list (title = first message, rename, unlimited, soft delete). |
| D2 | App identity = own email-OTP → 7-day JWT (zap-eve-agent `auth` routes, `jose`, Resend `Slash Markets <login-link@codeongrass.com>`). Own Postgres (docker :5439 local), never the MCP's DB. |
| D3 | **MCP access per app user via a real OAuth 2.1 flow against mcp.slash.markets** (DCR once per deployment → client_id stored; per login: authorize + PKCE S256 → code → token). Tokens (access 1 h, refresh 30 d) stored AES-256-GCM in `mcp_grants` keyed by app user. Connection `auth.getToken` resolves sessionId → userId → grant, refreshes when < 2 min left, fail-closed (no grant → tool error telling the user to reconnect). |
| D4 | **"Automatic" MCP login = immediately after app OTP login the app redirects into the MCP authorize URL** (user completes the MCP's own email+OTP page once), callback lands on `/api/mcp/callback` → chat. **App logout deletes the grant rows** (the MCP has no revocation endpoint; the refresh token is discarded on our side, the 1 h access token dies on its own). Known friction: one extra OTP per app login; accepted (MCP untouched). |
| D5 | MCP side is single-account today (one Zerodha login); every app user authorizes against it. Zerodha login/reconnect lives on app.slash.markets — `TokenExpired` → the agent sends the user there (URL from `auth_status`). |
| D6 | Tools exposed: all 5 MCP tools, no approval gating (reads + e-mail watchers). Staging vs prod MCP = env `KITE_MCP_URL` (default prod; decided at deploy time). |
| D7 | `web_search`: Tavily `POST https://api.tavily.com/search` (`search_depth` basic/advanced, `topic` general/news, `max_results` ≤ 8). Restriction is prompt-level (tool description + skill: markets/finance/company/macro only); no hard domain filter in v1 so results aren't starved; empty queries rejected. Results → `{results:[{title,url,snippet,published}]}`; UI renders citation cards under the tool call and persists them with the message (parts jsonb). Usage counted in `hooks/usage.ts`. No hard cap in v1. |
| D8 | Skill: packaged `agent/skills/kite-markets/SKILL.md` = preface + upstream SKILL.md body. **Boot sync**: `scripts/sync-skill.ts` (run by `predev`/`prebuild:eve`) fetches `$KITE_SKILL_URL` (the MCP does not serve SKILL.md — found 2026-11-23; default = raw GitHub of the public zap-kite-mcp repo, `prod` branch), falls back to the committed `upstream.md`, rewrites the frontmatter description to eve's routing-hint form. Preface: tools are called `kite__run_python` etc.; charts protocol (D10); web-search rules (D11). |
| D9 | Model: `claude-sonnet-5` default, `AGENT_MODEL` env switch (Opus allowed), `modelContextWindowTokens` per model. eve built-in sandbox tools disabled via sentinels: `bash`, `read_file`, `write_file`, `glob`, `grep`, `web_fetch`, `todo`. Kept: `load_skill`, `connection_search`, our `web_search`. No subagents. |
| D10 | **Charts protocol**: a script may end its output with one line `@@chart {json}` where json = `{"type":"candles","title":"NSE:TCS 15m","rows":[{"time":"…IST","open":…,"high":…,"low":…,"close":…,"volume":…}]}` or `{"type":"option_chain","underlying":"NIFTY","expiry":"…","spot":…,"strikes":[{"strike":…,"ce":{"oi":…,"iv":…,"last_price":…},"pe":{…}}]}`, ≤ 500 rows. The UI strips the line from the shown text and renders lightweight-charts (candles) / SVG (chain). The skill preface documents it. |
| D11 | Web search rules in the skill: USE for news, events, results/earnings dates, corporate actions, policy/macro, "why did X move", anything the sandbox data cannot answer; NEVER for prices, P&L, account data, candles (MCP only); cite sources inline. |
| D12 | Hosting: local only now (`withEve` dev server, docker Postgres `slash-kite-eve` :5439). Vercel two-project deploy = pending phase P8, not now. Hostnames later. |
| D13 | Open-source hygiene: MIT, `.env.example` only, biome + vitest + GitHub Actions CI (typecheck, lint, test, builds), no leftover working comments. |
| D14 | Error semantics: app 401 = "log in again" ONLY. MCP token missing/expired → tool-level error `MCP_NOT_CONNECTED` (UI banner "Reconnect /markets" → re-run authorize). Zerodha expiry comes back inside `run_python` output as `TokenExpired` text → the agent tells the user to reconnect at app.slash.markets. |

## 3. What is copied vs dropped from zap-eve-agent

| Keep (retarget) | Drop |
|---|---|
| Next 16 + `withEve()`, `agent/{agent,channels/eve,hooks/persist,hooks/usage}`, Drizzle `users/otps/threads/messages/session_context`, eve proxy route, auth routes + `lib/server/{auth,otp,emails,threads}`, `login.tsx`, `sidebar.tsx`, `thread-chat.tsx`, `agent-message.tsx`, `history-message.tsx`, `editable-title.tsx`, `workspace.tsx` (simplified), `markets.css`/globals, `components/charts/*`, deploy scripts (parked), docker-compose | Dhan lib + 11 tools, `options` subagent, `broker_connections` + broker routes/modal, positions list / position hub / market-chat / interactive chart / drawings / indicators, watch tables + sweep/email (watchers live in the MCP), token-renew, kickoff/position injection, `mcp/` Python dir, bench scripts |

## 4. New pieces

- `agent/connections/kite.ts` — `defineMcpClientConnection({ url: KITE_MCP_URL, description, auth: (ctx) => ({ getToken: () => resolveMcpToken(ctx) }), tools: { allow: [...5] } })`.
- `agent/lib/mcp/{oauth,grants,token}.ts` — discovery, DCR (`mcp_clients`), PKCE authorize URL, code exchange, single-flight refresh, encrypted `mcp_grants` {userId unique, accessEnc, refreshEnc, accessExpiresAt, scope, status}.
- `app/api/mcp/{start,callback,status,disconnect}` + `POST /api/auth/logout` (deletes grants).
- `agent/tools/web_search.ts` — Tavily; sentinels for `bash,read_file,write_file,glob,grep,web_fetch,todo`.
- `agent/skills/kite-markets/{SKILL.md,upstream.md}` + `scripts/sync-skill.ts`.
- `components/charts/chart-line.ts` — parse/strip the `@@chart` line from `run_python` results.
- `agent/instructions.md` — /markets general analyst identity; read-only; load the skill before any Kite question; denial/expiry semantics.

## 5. Phases

- [x] **P0 Scaffold** *(2026-11-23)* — copied zap-eve-agent (no node_modules/.git/.env/.next/mcp/docs), Drop column removed (Dhan lib + tools, options subagent, broker routes/modal, positions/hub/market-chat/charts-interactive, watch tables/sweep/emails, token-renew, kickoff/selection, bench scripts, old migrations), package `slash-kite-eve-agent`, docker-compose `slash-kite-eve` :5439, `.env.example` rewritten, `git init` (staged, uncommitted). Already retargeted: schema (users/otps/mcp_clients/mcp_grants/session_context/threads/messages — no position columns), mirror/persist/session-context, proxy (no kickoff/position header, no subagent tee), threads REST + client, flat-list Sidebar, general-chat Workspace + ThreadChat, agent.ts (AGENT_MODEL switch), instructions.md draft, 7 `disableTool` sentinels (bash/read_file/write_file/glob/grep/web_fetch/todo), `components/charts/chart-line.ts` (`@@chart` parser) + ToolResultChart retargeted to `*run_python`. **Verified:** `tsc --noEmit` clean, `next build` clean (routes: /, /api/auth/*, /api/eve/v1/[...path], /api/threads*), `eve build` clean (Node 24); `grep -riE 'dhan|watch|kickoff|subagent' agent app lib components scripts` empty.
- [x] **P1 DB + auth** *(2026-11-23)* — migration `drizzle/0000_init.sql` (6 tables) applied to docker `slash-kite-eve-postgres` :5439; `agent/lib/mcp/grants.ts` (save/get/delete/markExpired, AES at rest); `POST /api/auth/logout` deletes the user's grant (D4); dev login moved from the hard-coded zaptrade account to `DEV_LOGIN_EMAIL`/`DEV_LOGIN_CODE` (refused when NODE_ENV=production); client `logout()` calls the route then clears the JWT. `.env` seeded with fresh secrets (ANTHROPIC/TAVILY blank, KITE_MCP_URL=staging). **Verified:** `db:smoke` green; curl 14/14 — dev request-otp ok, bad email 400, wrong code 401, verify → JWT, /api/threads 401 w/o token + `[]` with, logout 401 w/o token, logout deletes a seeded grant row (1→0), real-email OTP logged to console → verify ok → replay rejected, `/api/eve/v1/health` 200; tsc clean.
- [x] **P2 MCP OAuth** *(2026-11-23)* — `agent/lib/mcp/oauth.ts` (RFC 8414 discovery w/ RFC 9728 fallback, cached; DCR once per issuer as a PUBLIC client `token_endpoint_auth_method=none` → `mcp_clients`; PKCE S256 authorize URL w/ `resource`; server-side verifier in new table `mcp_auth_txns` (migration `0001_mcp_auth_txns.sql`, 10-min TTL, deleted on use); code exchange → `saveGrant`; `accessTokenFor` refreshes <2 min before expiry, single-flight per user, marks `expired` + throws on refresh failure; status/disconnect), `agent/lib/mcp/token.ts` (`resolveMcpToken(ctx)` for the connection — fail-closed, `MCP_NOT_CONNECTED:` prefix, `MCP_BENCH_ACCESS_TOKEN` dev-only fallback for direct `eve dev` sends), routes `POST /api/mcp/start` · `GET /api/mcp/callback` (no JWT — the state row names the user; lands on `/?mcp=connected|error&reason=`) · `GET /api/mcp/status` · `POST /api/mcp/disconnect`. The MCP's login is plain HTML forms, so the e2e drives it with fetch (no browser needed). **Verified LIVE against staging-kite-mcp.slash.markets: `npm run e2e:oauth` 17/17** — start URL has PKCE+state, authorize→/login?txn, email+OTP (staging dev login) → 302 to our callback, callback→`?mcp=connected`, replayed callback → `invalid_state`, grant row encrypted (`v1:` prefix), MCP initialize 401 w/o bearer / 200 with, forced near-expiry → ONE refresh for two concurrent callers + new token works, logout → grant gone → `accessTokenFor` throws not-connected. **Finding:** the MCP does NOT serve `/SKILL.md` (404 on staging and prod) → D8 boot fetch source becomes the public repo raw file (`KITE_SKILL_URL`, default `https://raw.githubusercontent.com/MADHAN-CJ/zap-kite-mcp/prod/mcp/SKILL.md`), committed copy as fallback.
- [x] **P3 Agent** *(2026-11-23)* — `agent/connections/kite.ts` (`defineMcpClientConnection`, per-session `auth(ctx).getToken` → `resolveMcpToken`, `tools.allow` = the 5 MCP tools), `agent/tools/web_search.ts` (Tavily `/search`, topic news|general, days, ≤8 results → `{query, topic, results[{title,url,snippet,published,score}]}`, `{error}` envelopes, abort+20 s timeout), skill = `skill-src/preface.md` (prefixed tool names, no local sandbox, web-search rules, `@@chart` protocol, access-error handling) + `skill-src/upstream.md` (committed copy of the MCP SKILL.md) → `scripts/sync-skill.ts` writes gitignored `agent/skills/kite-markets/SKILL.md` on `predev`/`prebuild:eve` (fetches raw GitHub, validates, refreshes the committed copy), `agent/instructions.md`, usage hook now counts tool calls per turn. **Verified:** `/eve/v1/info` → tools = ask_question, load_skill, web_search ONLY (sandbox tools gone); connection `kite` + skill `kite-markets` registered; eve build clean. **`npm run e2e:agent` 10/10 LIVE (staging MCP, real Sonnet 5 + Tavily):** A "How is my portfolio doing" → `load_skill → connection_search → kite__run_python` → correct answer that the Zerodha session on the staging test account is expired, with the app.slash.markets-style reconnect link from the MCP (23 s); B "Why did NIFTY move today" → `web_search ×3` + kite attempt → two sourced reasons with Reuters URL (41 s); both threads persisted with titles. **Usage (usage-log.ndjson):** A = 5 steps, 82k in / 1.9k out (26.6k cache read, 40k cache write); B = 6 steps, 130k in / 2.3k out. Per-step prompt: ~7.3k base → ~16.5k after load_skill → ~27k after connection_search (the MCP's run_python description carries the whole zapkite schema, ≈10k tokens, duplicating much of the skill) → ~53–64k by the end. ⚠️ Optimisation candidate for later: the skill + the MCP tool description overlap; measure a run w/o the skill (tool description alone) before P7. NOTE: user set `KITE_MCP_URL` to PROD in `.env`; the automated run used staging via a shell override because prod has no dev login — prod needs a real OTP (P7).
- [ ] **P4 Proxy + threads REST** — proxy minus position/kickoff; `session_context` stores userId; threads list/rename/delete. *Verify:* curl matrix (401/403/404, fork 409, token injection, stream passthrough).
- [ ] **P5 Frontend** — login → (auto) MCP authorize → chat workspace with sidebar; "Reconnect /markets" banner; citation cards; `@@chart` renderer; sign-out confirm. *Verify:* Playwright smoke.
- [ ] **P6 Docs/env/hygiene** — README, `.env.example`, LICENSE (MIT), biome, vitest unit tests (chart-line parser, refresh single-flight, skill frontmatter rewrite), GitHub Actions CI. *Verify:* lint + test + typecheck + builds green.
- [ ] **P7 Live smoke** — real ANTHROPIC + TAVILY keys, prod MCP, user's Zerodha session: one real conversation (account + market + news question), cost readout from the usage log. **Needs user.**
- [x] **P8 Deploy — Vercel, ONE project (2026-11-25)** — user chose Vercel over the uat box mid-way. Project `slash-kite-eve` (team madhan-cjs-projects, framework Next.js, CLI-deployed from the working copy via `scripts/deploy.sh`; the two-project runtime split + `vercel.{web,runtime}.json` were deleted — withEve serves eve on the same origin, as zap-eve-dev proved, so no `EVE_UPSTREAM_ORIGIN`). `prebuild` runs `skill:sync` so the git-ignored SKILL.md is regenerated on Vercel (committed `skill-src/upstream.md` = fallback). Production env: FRESH secrets (AUTH_JWT_SECRET / CREDS_ENCRYPTION_KEY / CREDS_HASH_PEPPER / EVE_PROXY_SECRET), ANTHROPIC/TAVILY/RESEND keys, `KITE_MCP_URL=https://mcp.slash.markets` (prod MCP — the user's Zerodha account lives there), `APP_BASE_URL=https://slash-kite-eve.vercel.app`, `OTP_FROM_EMAIL`; no DEV_LOGIN. **Database:** reusing zap-eve's Neon was impossible (its env vars are Vercel-"sensitive" → the CLI pulls `[SENSITIVE]`), so a NEW marketplace resource was provisioned non-interactively: `vercel integration add neon --name slash-kite-eve --environment production` → Neon project `gentle-flower-84703649` (us-east-1, **billing plan "Launch" — the only plan the CLI offered; confirm cost**), auto-connected `DATABASE_URL`/`DATABASE_URL_UNPOOLED` (+ PG*/POSTGRES_* aliases) to production; both migrations applied from the laptop (`DATABASE_URL_UNPOOLED=… drizzle-kit migrate` → 8 tables). **Verified live (2026-11-25):** `/` 200 public · `/api/eve/v1/health` → `{"ok":true,"status":"ready"}` · `/api/mcp/status` 401 logged-out · `POST /api/auth/request-otp` 200 → otps row in Neon + Resend mail delivered · wrong code → 401. Still to do by the user: real-OTP login → automatic MCP connect (redirect `…/api/mcp/callback`, registered by DCR on first use) → one live conversation. Gotcha: `vercel link` drops a `.env.local` with `VERCEL_OIDC_TOKEN` that overrides `.env` in Next — delete it.

## 6. Env vars

`DATABASE_URL`, `ANTHROPIC_API_KEY`, `AGENT_MODEL` (default claude-sonnet-5), `TAVILY_API_KEY`,
`KITE_MCP_URL` (default https://mcp.slash.markets), `KITE_SKILL_URL` (raw SKILL.md source), `APP_BASE_URL` (OAuth redirect base),
`AUTH_JWT_SECRET`, `CREDS_ENCRYPTION_KEY`, `CREDS_HASH_PEPPER`, `EVE_PROXY_SECRET`,
`RESEND_API_KEY` + `OTP_FROM_EMAIL`, `EVE_UPSTREAM_ORIGIN` (prod only). Dev-only test login via
`DEV_LOGIN_EMAIL`/`DEV_LOGIN_CODE`.

## 7. Risks / open points

- R1 MCP OAuth adds an OTP step per app login (D4) — fixes would touch the MCP (out of scope).
- R2 `run_python` output is text → charts depend on the model following `@@chart`; measure in P7.
- R3 Tavily restriction is prompt-level, not enforced — accepted.
- R4 `getToken` runs per tool call; refresh must be single-flight per user (MCP rotates pairs).
- R5 Skill fetched at boot: body validated (must contain `run_python`) before replacing the committed copy.

## 8. Indicator test suite + refresh-race fix (2026-11-24)

- **`tests/indicators/*.test.ts`** (vitest, one file per indicator, run in parallel workers): closes, sma, ema, rsi, macd, bollinger, atr, vwap, pct_change, options_math — each sends synthetic data through the REAL MCP `run_python` (`tests/helpers/mcp.ts`: same issuer + a user's stored grant, `MCP_TEST_EMAIL`/`MCP_TEST_ACCESS_TOKEN`) and compares against from-scratch textbook references in `tests/helpers/data.ts`. Files SKIP (never fail) without a live Zerodha session. **Verified live on prod with the user's own grant: 42/42** (10 files in parallel, ~8 s wall).
- **`tests/unit/`**: `chart-line.test.ts` (`@@chart` parser — found + fixed two bugs: a malformed spec used to erase the text line; the 500-row cap was applied before validation), `skill.test.ts` (generated skill documents every indicator/data function, prefixed tool names, web-search rules, `@@chart`, no-sandbox + access-error guidance).
- **Bug found + fixed: cross-process refresh race.** `accessTokenFor` single-flight was per process; 10 vitest workers (and, in prod, several eve runtime instances) refreshed the same grant at once; the MCP rotates refresh tokens so one won and the losers marked the grant `expired` (observed on the test account). Refresh now runs inside a transaction holding `SELECT … FOR UPDATE` on the grant row and re-reads after the lock. `npm run e2e:refresh-race` (6 separate node processes) → one refresh, same token everywhere, grant active.
- New scripts: `e2e:refresh-race`, `mcp:connect` (browser-less connect for the dev user), `test`, `test:unit`, `test:indicators`. Dev deps: vitest 3.2.7, @modelcontextprotocol/sdk 1.32.2.
- The Python twin written in zap-kite-mcp by mistake was removed (user decision 2026-11-24); the agents' library findings (rsi lacks period validation, NaN poisons sma) are logged in the zap-kite-mcp memory.

## 9. Production cutover checklist (drafted 2026-11-26)

Current state = ONE Vercel project `slash-kite-eve` on the **Hobby** team, URL slash-kite-eve.vercel.app,
Neon "Launch" DB in us-east-1, prod MCP as target, sender `login-link@codeongrass.com`, CLI-deployed
from the working copy (no git remote). Treat that project as **staging** and build production beside it.

### A. Decide (user)
- [ ] Production hostname (e.g. `kite.slash.markets` / `ai.slash.markets`). slash.markets DNS lives with the
      Netlify-hosted site (Anil's team) → CNAME to `cname.vercel-dns.com`.
- [ ] Vercel plan: **Hobby forbids commercial use** and caps function duration (eve turns run minutes) →
      Pro team for production, or a dedicated team owned by the company.
- [ ] Region: Vercel function region `bom1` (Mumbai) + Neon `ap-southeast-1` (Singapore) for Indian users,
      or stay us-east-1. Neon region is fixed at project creation — decide before creating the prod DB.
- [ ] Model + spend: `AGENT_MODEL` (sonnet default / opus), Anthropic monthly budget + alert thresholds.
- [ ] MCP reality: mcp.slash.markets is a single-Zerodha-account server (D2). Production users all read
      THAT account until the MCP is multi-user (Zerodha approval). Say so in onboarding copy, or gate sign-ups.

### B. Repo & delivery
- [ ] GitHub repo (user adds the remote) → connect Vercel prod project, production branch `prod`, `dev` →
      staging project (zap-kite-mcp convention). Keep `scripts/deploy.sh` for emergencies only.
- [ ] P6 hygiene lands first: LICENSE (MIT), biome, vitest + typecheck + build in GitHub Actions, required
      check on `prod`.
- [ ] Pin Node: `engines.node` 24.x (eve's floor) and the Vercel project Node setting to match (it chose 26.x).
- [ ] `vercel.json`: consider `"regions": ["bom1"]` and a `functions` maxDuration consistent with the plan.
- [ ] Remove `allowedDevOrigins` ngrok entry from next.config if not needed in prod builds (harmless, dev-only).

### C. Database (production Neon, separate from staging)
- [ ] `vercel integration add neon --name slash-kite-eve-prod --environment production` in the PROD project
      (or Neon console) in the chosen region; plan: Launch (7-day PITR) or Scale per retention needs.
- [ ] Apply migrations: pull prod env → `DATABASE_URL_UNPOOLED=… npm run db:migrate` (8 tables, 2 migrations).
      If prod secrets are marked Sensitive in Vercel, the CLI cannot pull them → run migrations in the build
      command instead (`npm run db:migrate && npm run build`) or copy the direct URL from the Neon console.
- [ ] Staging DB: downgrade the current `slash-kite-eve` Neon resource to Free (it is on paid "Launch"), or
      delete and re-add as free.
- [ ] Backups/retention policy noted; `mcp_grants` holds encrypted OAuth tokens — rotation of
      `CREDS_ENCRYPTION_KEY` invalidates every grant (users just reconnect), never rotate silently.

### D. Email (Resend)
- [ ] Verify sending domain `slash.markets` in Resend: DKIM TXT, MX + SPF TXT for the return-path subdomain,
      DMARC TXT (`p=none` first, tighten later). DNS = same Netlify zone.
- [ ] Create the official sender, e.g. `login@slash.markets` → `OTP_FROM_EMAIL="/markets <login@slash.markets>"`.
- [ ] Production Resend API key (sending-only scope), separate from the one used by codeongrass senders.
- [ ] Keep `login-link@codeongrass.com` on staging until the new domain shows "Verified"; test deliverability
      to Gmail/Outlook/iCloud before cutover.

### E. Production env vars (set on the PROD Vercel project, Production scope only)
| Var | Prod value | Note |
|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | from the prod Neon resource | auto-set by the integration |
| `APP_BASE_URL` | `https://<prod hostname>` | drives the MCP OAuth redirect `…/api/mcp/callback`; the app re-registers its DCR client automatically on change |
| `KITE_MCP_URL` | `https://mcp.slash.markets` | staging project → `https://staging-kite-mcp.slash.markets` |
| `ANTHROPIC_API_KEY` | prod key w/ budget | `AGENT_MODEL` optional (`claude-sonnet-5` default) |
| `TAVILY_API_KEY` | prod key | quota alert |
| `RESEND_API_KEY`, `OTP_FROM_EMAIL` | prod key + official sender | `OTP_COOLDOWN_SECONDS` default 30 |
| `AUTH_JWT_SECRET`, `CREDS_ENCRYPTION_KEY`, `CREDS_HASH_PEPPER`, `EVE_PROXY_SECRET` | `openssl rand -hex 32` each, NEW for prod | never copy from staging; record in the password manager |
| `DEV_LOGIN_EMAIL/CODE` | **absent** | refused in production anyway |
| `EVE_UPSTREAM_ORIGIN` | **absent** | withEve self-serves eve |
Mark every secret "Sensitive" in Vercel after migrations are applied.

### F. Vercel project settings (prod)
- [ ] Domain added + SSL issued; `.vercel.app` URL kept as fallback.
- [ ] Deployment Protection: production public; previews behind Vercel Authentication.
- [ ] Fluid compute on, function max duration raised for `/api/eve/v1/*` (long turns/streams).
- [ ] Log drain or Vercel Observability; alert on 5xx of `/api/eve/v1/*`.
- [ ] Uptime check: `GET /api/eve/v1/health` must return `{"ok":true,"status":"ready"}`.

### G. Cutover order
1. B (repo + CI) → 2. C (DB + migrations) → 3. D (domain verified in Resend) → 4. E (envs) → 5. first prod
deploy → 6. F → 7. smoke: health · request-otp (mail from the official sender) · login · auto MCP connect
on the prod MCP (consent page shows the new redirect) · one live conversation w/ a chart + a web citation ·
logout revokes the grant (`mcp_grants` row gone) → 8. announce.

### H. Ops after go-live
- [ ] Spend dashboards: Anthropic, Tavily, Neon, Vercel; usage hook numbers per turn (~82k input tokens/turn
      today — the skill-less variant measurement, P7, decides whether to trim).
- [ ] MCP refresh tokens live 30 d → users reconnect monthly; banner copy already exists.
- [ ] Disclosure: holdings/market data flow to Anthropic + Tavily (R7) — privacy note on the login page.

## 10. This app REPLACES app.slash.markets (user clarification 2026-11-26) — design, questions open

**Ask (final):** ONE login. The user signs in here with email OTP, sees Kite connected / not connected,
clicks **Login with Kite** in THIS UI, and lands in chat. No separate MCP login page, no hop to
app.slash.markets — this app takes over that domain and role. Ultimate goal: users use our MCP through
our UI. (v2 later = UI/UX only on the same functions.)

**What app.slash.markets is today (zap-kite-mcp repo root, Next 16):** ~1.5k lines UI (login, workspace,
broker-card, watch-card, legal pages, footer) + ~650 lines server libs (auth/otp/crypto byte-compatible
with the Python MCP, kite login/exchange, broker status/store/disconnect, watches list/patch, emails) +
7 API routes (auth request/verify-otp · broker GET/DELETE · broker/kite/login/start · broker/kite/callback
· watches GET · watches/[id] PATCH). It shares the **MCP's Postgres** (`users, otps, broker_connections,
watchers, watcher_fires, oauth_*`) — that is how a web login IS an MCP identity: same `users` row.
Env: DATABASE_URL (MCP db), KITE_API_KEY/SECRET, RESEND_API_KEY, EMAIL_FROM, DEV_LOGIN_*, NEXT_PUBLIC_MCP_URL.

**Design**
- **D15 One database = the MCP's Postgres.** Our app connects to the MCP db like the web app does and
  REUSES its `users`/`otps` (port the web's `lib/server/{auth,otp,crypto}.ts` verbatim — hashing matches
  Python) so our user id == MCP user id. Our own tables (threads, messages, session_context, mcp_grants,
  mcp_clients, mcp_auth_txns) move into the same database under schema `eve`. The separate Neon
  `slash-kite-eve` resource is dropped (staging data is disposable).
- **D16 Silent MCP grant via RFC 7523 JWT-bearer** — the MCP SDK already implements the grant
  (`TokenHandler` → `provider.exchange_identity_assertion`, flag `identity_assertion_enabled`, confidential
  client required). Python change is small: implement `exchange_identity_assertion` in `oauth.py`
  (verify our app's assertion — HS256 w/ a shared secret or our public key; `sub` = user id, `aud` = MCP
  issuer, 60 s TTL, jti single-use) → existing `_issue()`; seed/allow ONE confidential client for this
  app with `grant_types=[jwt-bearer, refresh_token]`. Our `/api/mcp/*` authorize+callback routes and the
  MCP OTP page step disappear; `accessTokenFor(userId)` mints via the assertion when no grant exists and
  refreshes as today. Fallback if the MCP must stay frozen: write `oauth_tokens` rows directly (we share
  the db + crypto) — works, but couples us to the MCP's table format; not recommended.
- **D17 Kite login in-app.** Port `broker/kite/login/start` + `callback` + `broker` GET/DELETE and the
  broker card. Zerodha's redirect for the Kite app stays `app.slash.markets/api/broker/kite/callback`,
  which this app will serve after cutover. ⚠ Staging: a Kite app has ONE redirect URL — our staging host
  must either take over the staging Kite app's redirect (breaks staging-kite-app.slash.markets) or get its
  own Kite app (₹2000/mo). Decide (Q2).
- **D18 Screens:** login → **connect screen** (status card: active w/ name+expiry · expired · not
  connected; Login with Kite button; connected → auto-continue to chat) → chat. Daily Kite expiry
  (~06:00 IST) → non-blocking "Reconnect Zerodha" banner in chat (same button). Watchers list +
  pause/resume/delete + "Trade on Kite" (Kite Publisher) card + /terms /privacy /support ported so nothing
  the old app offered is lost.
- **D19 Cutover:** domain app.slash.markets → this Vercel project; old Next app on zap-kite retired;
  `NEXT_PUBLIC_MCP_URL`/`appUrl` in the MCP's messages keep pointing at app.slash.markets (unchanged).

**Phases (each with Verify):**
- [x] P9.1 DB move (2026-11-26): `agent/lib/db/mcp-schema.ts` mirrors the MCP's `users/otps/broker_connections`
  (never migrated by us; drizzle-kit sees only `agent/lib/db/schema.ts` = schema `eve`, cross-schema FKs hand-written
  in `drizzle/0000_eve_schema.sql`); `lib/server/mcp-crypto.ts` = Python-compatible otp hash + AES-GCM (vitest pins
  the Python vectors, 4/4); `scripts/db-mcp-init.ts` applies the MCP's SQL with its `schema_migrations` bookkeeping.
  Verified: fresh docker db → mcp-init → migrate → `db:smoke` (cross-schema cascade OK); browser login user id ==
  API login user id == `public.users` row.
- [x] P9.2 MCP grant (2026-11-26, zap-kite-mcp working tree, uncommitted): `Settings.trusted_client_id/_secret/
  assertion_secret` (env `ZAP_KITE_MCP_TRUSTED_CLIENT_ID/_SECRET`, `ZAP_KITE_MCP_ASSERTION_SECRET`; all-or-none),
  `OAuthProvider.trusted_client()` (confidential, grant_types=[jwt-bearer]) + `exchange_identity_assertion` (PyJWT HS256,
  iss=client_id, aud=issuer, typ oauth-id-jag+jwt, sub=users.id must exist, lifetime ≤300 s, jti single-use via new
  table `oauth_assertions` — migration 0002), `_issue_access` (1 h, NO refresh token), `AuthSettings(identity_assertion_enabled)`.
  Verified: pytest 40/40 (4 new: metadata advertises the grant; mint → auth_status as that user; 10 rejection cases +
  scope + replay + bad secret; DCR public client refused), ruff + mypy clean. Staging MCP deploy = user (push dev).
- [x] P9.3 App minting (2026-11-26): `agent/lib/mcp/oauth.ts` = discover + `buildAssertion` (jose) + `mintAccessToken` +
  `accessTokenFor` (cache in `eve.mcp_grants`, re-mint under `pg_advisory_xact_lock` when <2 min left); `/api/mcp/*`,
  `mcp_clients`, `mcp_auth_txns`, refresh tokens, `CREDS_HASH_PEPPER` all gone; logout drops the cache. Verified:
  `e2e:mint-race` 6 processes → 1 mint, 1 distinct token (counted in the MCP's `oauth_tokens`).
- [x] P9.4 Login with Kite (2026-11-26): `lib/server/{kite,broker}.ts` ported from the web app (drizzle, MCP-key
  encryption, watchers re-arm/pause statements kept), routes `GET/DELETE /api/broker`, `POST /api/broker/kite/login/start`,
  `GET /api/broker/kite/callback` (→ `<APP_BASE_URL>/?kite=connected|error`), `connect-screen.tsx` + workspace gate
  (skippable per session; banner + header pill otherwise; `brokerStatus` treats a past `expires_at` as expired).
  Verified 2026-11-26: Playwright `scripts/ui-smoke.py` **21/21** against `npm run dev` + `npm run dev:mcp` + its embedded
  fake Zerodha (:4999 — Kite login page 302 + `/session/token` + DELETE): login → connect screen (no MCP login page) →
  Login with Kite → callback stores the session (checksum seen by the fake) → `?kite=connected` → pill green, chat →
  a real model turn answered `broker=active` via `kite__auth_status` on a silently minted token → rename/delete →
  DELETE /api/broker (fake saw the invalidation) → connect screen again → skip → chat + banner → skip remembered →
  sign out. Harness gotchas: `eve` needs Node ≥24 (`~/.nvm/versions/node/v24.*`); the callback redirects to
  `APP_BASE_URL`, so the dev server must run with `APP_BASE_URL=http://localhost:3000` for the smoke; scripts that
  read `.env` must get `KITE_MCP_URL=http://127.0.0.1:8029` or they hit the PROD MCP (which rightly answers
  `invalid_client`).
- [x] P9 verification run 2026-11-26 (local stack: docker pg + `npm run dev:mcp` + `npm run dev` on Node 24):
  unit 14/14 · `db:smoke` OK · `e2e:mint-race` PASS (6 processes → 1 mint) · `ui-smoke.py` 21/21 · `e2e:agent` 10/10
  (the model now tells the user to click Login with Kite in-app and still web-searches a news question while Zerodha
  is disconnected; assertion "text cites a URL" relaxed — sources are citation cards, not prose). `npm run build` clean.
- [ ] P9.5 (PARKED — user: login + chat first) Watchers + Trade on Kite + legal/support pages port.
- [ ] P9.6 Staging deploy (needs the user's inputs, in this order):
  1. **DigitalOcean Postgres URL** (user) → the staging MCP's `DATABASE_URL` points at it FIRST (its migrator creates
     `public`, incl. `0002_oauth_assertions`), then `DATABASE_URL_UNPOOLED=<DO url> npm run db:migrate` for `eve`.
  2. **Staging MCP env** (user pushes `dev` + `npm run deploy`): add `ZAP_KITE_MCP_TRUSTED_CLIENT_ID=slash-kite-eve`,
     `ZAP_KITE_MCP_TRUSTED_CLIENT_SECRET`, `ZAP_KITE_MCP_ASSERTION_SECRET` (fresh `openssl rand -hex 32` each) to the box
     `.env`; note its existing `SESSION_SECRET` / `CREDS_ENCRYPTION_KEY` / `KITE_API_KEY` / `KITE_API_SECRET`.
  3. **Vercel `slash-kite-eve` env** (I can do it): `DATABASE_URL`(+`_UNPOOLED`) = DO · `KITE_MCP_URL=https://staging-kite-mcp.slash.markets`
     · `MCP_TRUSTED_CLIENT_ID/_SECRET`, `MCP_ASSERTION_SECRET` = step 2 · `MCP_SESSION_SECRET`, `MCP_CREDS_ENCRYPTION_KEY`
     = the MCP's SESSION_SECRET / CREDS_ENCRYPTION_KEY · `KITE_API_KEY/SECRET` = the staging Kite app · remove
     `CREDS_HASH_PEPPER`; detach the Neon integration (its DATABASE_URL would override). Redeploy `--prod`.
  4. **Kite Connect app redirect** (user, developers.kite.trade): staging app → `https://slash-kite-eve.vercel.app/api/broker/kite/callback`
     (this breaks Login with Kite on staging-kite-app.slash.markets — accepted, Q2).
  5. Smoke on staging: login → connect screen → Login with Kite (REAL Zerodha) → chat → `auth_status` active → one
     portfolio question → logout/login keeps the Zerodha session.
  Production (plan §9) later repeats 1–4 against prod MCP + app.slash.markets domain.

**Decisions (user, 2026-11-26):** Q1 → **ONE database** (D15 stands). Q2 → staging takes over the staging
Kite app's redirect; the old staging web's Kite login breaks — accepted. Q3 → **login + chat first**;
watchers / Trade on Kite / legal pages = later phase (P9.5 parked). Q4 → **OK to change the Python MCP** for
the JWT-bearer grant. Q5 → **stay in staging** until parity; production cutover later (plan §9).
**Infra (user):** deployment moves to **Netlify**; the database will be **DigitalOcean managed Postgres**
(user provides creds) — see §11 for what that means for the eve runtime.

~~Open questions → user: Q1 one database = the MCP's Postgres (recommended) or keep two? · Q2 staging
Kite app: take over the staging redirect or register a new Kite app? · Q3 watchers + Trade on Kite +
legal pages in scope now (parity) or chat-first? · Q4 OK to change the Python MCP for the JWT-bearer
grant (small, SDK-native)? · Q5 cutover timing relative to production (plan §9) — replace app.slash.markets
at the same time as going live, or staging parity first?

**v2 note (user, 2026-11-26):** **v2 is UI/UX only** — new look and flows on top of the SAME v1 functions.
This §10 work is v1 functionality; v2 restyles it.

## 11. Hosting (2026-11-26) — DECIDED: stay on Vercel (user buys Pro); DB = DigitalOcean managed Postgres (URL from the user). The Netlify analysis below is kept for the record.

**Constraint:** the eve runtime is a durable workflow engine. It runs either on Vercel (Vercel Workflow) or as a
long-running Node process (`eve build && eve start`, state in `.workflow-data` on disk or in Postgres via
`@workflow/world-postgres@5.0.0-beta.48`, which matches eve's bundled `5.0.0-beta` line). It cannot run inside
Netlify Functions. Netlify also caps functions: 10 s sync default (26 s on request), **60 s for streaming
functions** — and a Next.js route handler on Netlify IS a function. Our `/api/eve/v1/session/:id/stream`
NDJSON pass-through lives for a whole turn (minutes), so that route cannot sit on Netlify either.
Sources: Netlify Functions API docs (60 s streaming limit) · Netlify forum "Function timeout issue" / "10s
timeout when using Next.js server routes" / 2026 threads asking for 26 s on Pro.

**Option A — Netlify UI + DigitalOcean runtime host (if Netlify is a must):**
- Netlify: the Next app (pages, auth, threads, Kite login, mcp status). Short requests only.
- DO droplet (same region as the DO Postgres): `eve start` under systemd + the eve PROXY (the same Next app
  started with `next start`, or a trimmed proxy service), nginx + TLS on e.g. `agent.slash.markets`,
  `EVE_UPSTREAM_ORIGIN=http://127.0.0.1:<eve port>`, workflow state in DO Postgres (world-postgres) or local disk.
- Browser: `useEveAgent({ host: NEXT_PUBLIC_EVE_API_ORIGIN + '/api' })` → droplet (CORS allow Netlify origin,
  same /markets JWT); everything else → Netlify. Two deploys, one codebase.
**Option B — everything on the DO droplet (recommended, simplest):** `next start` + `eve start` behind nginx
+ certbot, systemd units, rsync/`update.sh` deploy like slash-python / zap-kite-mcp on the uat box; Netlify
keeps the marketing site only. One deploy, no function timeouts, stream + runtime on one box, Postgres on DO
in the same region (ap-south / blr1).
Either way: DB = the DO managed Postgres the user provides (shared with the MCP — the staging/prod MCP must
point its `DATABASE_URL` there too, and its migrations run first since we reuse its `users`/`otps`).
Netlify proxy-rewrites to the droplet are NOT a fix for the stream (same edge timeouts) — the browser must
reach the droplet directly.

## 12. Production database move: Neon → DigitalOcean — DONE 2026-11-26 09:35 UTC (user's go; runbook below as executed)

**Why:** plan D15 = one database shared by the MCP and this app. The user's DO managed Postgres
(`slash-prod-do-user-999077-0`, PG 18.7, `defaultdb`, currently EMPTY) is the chosen home. The production
MCP today uses Neon (`neondb`, schema `prod`, PG 18.7, ap-southeast-1) with tiny data: 8 users,
4 broker_connections, 27 oauth_clients, 357 oauth_tokens, 4 watchers, 2 watcher_fires, 5 otps.
Neon stays untouched as the rollback (switching the MCP's `DATABASE_URL` back = full rollback).

**Shape on DO:** keep schema **`prod`** for the MCP (its `update-prod.sh` insists on
`options=-csearch_path=prod`), add schema **`eve`** for this app; this app's `DATABASE_URL` also carries
`options=-csearch_path=prod` so its unqualified mirrors (`users`, `otps`, `broker_connections`) resolve to
`prod.*`, and the eve migration's FK target is unqualified for the same reason.

**Steps (≈5 min, MCP down ≈2 min):**
1. `ssh root@168.144.85.144 systemctl stop zap-kite-mcp-prod` (no new tokens/sessions during the copy).
2. From the laptop, `docker run --rm postgres:18-alpine pg_dump "<neon url, no options>" --schema=prod
   --no-owner --no-privileges` | `docker run --rm -i postgres:18-alpine psql "<DO url>" -v ON_ERROR_STOP=1`
   → schema `prod` + 10 tables + rows + sequences land on DO.
3. Verify counts on DO == Neon (per table), `prod.schema_migrations` = 0001 (0002 arrives with the code deploy).
4. Box `.env`: `DATABASE_URL=<DO url>?sslmode=require&options=-csearch_path%3Dprod` (Neon URL kept in a
   comment), `systemctl start zap-kite-mcp-prod`, `curl /health`, one `auth_status` via an existing connector
   token (357 tokens were copied, so existing Claude connectors keep working).
5. This app: `DATABASE_URL_UNPOOLED=<DO url with search_path=prod> npm run db:migrate` → schema `eve`.
6. Code deploy (needs the user's commit+push of `prod` in zap-kite-mcp): `npm run deploy:prod` → migration
   `0002_oauth_assertions` runs on boot, trusted trio (already in the box `.env`) activates the grant.
7. Local test through ngrok: `.env` here already has the prod KITE keys + MCP secrets + trio; the user
   registers the ngrok callback on the Kite app; `npm run dev` (Node 24) → login → Login with Kite → chat.

**Executed 2026-11-26 (MCP down 09:33–09:35 UTC):** `pg_dump` (postgres:18-alpine) of Neon schema `prod` → `psql` into DO
`defaultdb` (schema `prod`, 10 tables, `otps_id_seq` restored at 33); counts identical on every table (users 8,
broker_connections 4, oauth_clients 27, oauth_tokens 357, otps 5, watchers 4, watcher_fires 2, codes/txns 0,
schema_migrations 1). Box `.env`: Neon line kept as a comment + `.env.bak-neon-*`; new `DATABASE_URL` = DO with
`sslmode=require&options=-csearch_path%3Dprod`. `npm run deploy:prod` → commit 4256c43 ("Database changes added")
live, migration 0002 applied on boot, health OK. **Trusted grant verified LIVE:** token minted for `test@slash.markets`
from the DO `prod.users` row → `auth_status` on mcp.slash.markets answered that user (kiteUserId FEU218,
token_expired = normal morning expiry). This app's `eve` schema applied to DO via the new `scripts/db-migrate.ts`
(programmatic drizzle migrator with `pgConfig`; drizzle-kit's CLI exited 1 silently against DO) — FKs resolve to
`prod.users` through search_path. **Known cosmetic gap:** prod metadata `grant_types_supported` does not list
jwt-bearer even though the token endpoint accepts it (settings enabled, SDK 2.3.0 same as local) — see §13.

## 13. Follow-ups after the move (2026-11-26)

- [ ] **Metadata fix pending deploy:** `server.build_asgi` built its ChatGPT-extended metadata with `build_metadata(...)`
  without `supports_identity_assertion`, so prod advertised only code+refresh grants while the token endpoint already
  accepted jwt-bearer. Fixed in the zap-kite-mcp working tree (staged, plus ruff formatting of test_server.py; pytest
  4/4 grant tests, ruff/mypy clean) → user commits+pushes `prod` → `npm run deploy:prod`.
- [x] **Browser flow verified against production pieces (2026-11-26):** local `npm run dev` (Node 24) on `.env` = DO db
  (search_path=prod) + prod MCP + prod Kite keys; ngrok tunnel → dev server answers `/api/eve/v1/health` 200 through
  it. Playwright on localhost: dev login → connect screen "Log in to Zerodha again" (test account FEU218, morning expiry)
  → Login with Kite → Zerodha's REAL login page "Login to Slash Markets" (api_key accepted; redirect = the ngrok callback
  the user registered). Remaining = a human Zerodha login (TOTP) in the browser, then chat.
- [ ] **Vercel `slash-kite-eve` is stale** (old flow, own Neon). To refresh: set `DATABASE_URL` = DO (+search_path=prod),
  `KITE_MCP_URL` prod, `MCP_*` + `KITE_*` from the local `.env`, drop `CREDS_HASH_PEPPER`, detach the Neon integration,
  redeploy; Kite redirect must then point at the Vercel/final domain instead of ngrok.
- [ ] Neon `prod` schema can be dropped once DO has run for a few days (rollback window).

## 14. Fully local stack with a Linux MCP container (2026-11-26)

User has no access to the production Kite app, so the local test must run on their own Kite app and a LOCAL MCP.
The MCP's script runner executes only on Linux + bubblewrap ≥0.8, so the sibling checkout now runs in a container:
`docker/mcp.Dockerfile` (ubuntu 24.04, bubblewrap 0.9, uv-managed CPython 3.12 at /opt/uv-python, venv /opt/venv) +
compose service `mcp` (profile `mcp`, privileged for user namespaces, `../zap-kite-mcp/mcp` bind-mounted read-only at
/src, `uv sync --frozen` at start, Postgres via the compose network, secrets interpolated from this repo's `.env`:
KITE_API_KEY/SECRET, MCP_SESSION_SECRET→SESSION_SECRET, MCP_CREDS_ENCRYPTION_KEY→CREDS_ENCRYPTION_KEY, the trusted trio,
DEV_LOGIN). `npm run dev:mcp` = `docker compose --profile mcp up -d --build mcp`; `scripts/local-mcp.sh` removed.
Verified: container healthy, `bwrap --unshare-user --disable-userns` OK inside, metadata advertises jwt-bearer, token
minted from the local `users` row → `auth_status` answers via the container. App side for this stack:
`DATABASE_URL=<docker> KITE_MCP_URL=http://127.0.0.1:8029 npm run dev` (APP_BASE_URL stays the ngrok URL; Zerodha
must return to `<ngrok>/api/broker/kite/callback`). **Blocked on the user's Kite app:** Zerodha answers
`Invalid api_key` (HTTP 400) for the `…7e3q` key in `.env` — the app is inactive/expired or the key is wrong; the
production key is accepted (302) but belongs to an app the user cannot reconfigure.

## 15. CUTOVER: this app now serves app.slash.markets (2026-11-26 ~10:15 UTC, user's decision)

User has no access to the production Kite app's console, so the test runs on the real redirect instead: this app took
over **app.slash.markets**. Done: local `.env` back on the production Kite key; Vercel `slash-kite-eve` production env
= DO `DATABASE_URL` (search_path=prod), `APP_BASE_URL=https://app.slash.markets`, `KITE_MCP_URL` prod, `MCP_*` secrets
+ trusted trio, `KITE_API_KEY/SECRET` (prod app); the Neon integration resource was disconnected (and removed — see
log); `vercel deploy --prod`; domain `app.slash.markets` moved via API from project `zap-kite` to `slash-kite-eve`
(`staging-kite-app.slash.markets` stays on zap-kite). Verified on app.slash.markets: `/api/eve/v1/health` ready,
`/api/broker` 401 JSON, verify-otp bad code → 401 (DB path OK), login page renders. First prod deploy answered 500 on
DB routes once (cold path) and was fine on the next deploy — a secret-gated `x-debug-errors` detail was added to
`errorResponse` (env `DEBUG_ERRORS_SECRET`; set on Vercel, remove when done). Consequences: the OLD web app's pages
(watchers, /terms, /privacy, /support, Trade on Kite) are no longer served at app.slash.markets until P9.5 ports them;
the Kite redirect `app.slash.markets/api/broker/kite/callback` now lands on this app without any Kite-console change;
the callback bridge in zap-kite-mcp is no longer needed for prod (left staged, inert when its env is unset).
Housekeeping: Vercel refuses non-interactive `env rm` for `CREDS_HASH_PEPPER` (unused; remove in the dashboard).
Next: the user logs in at app.slash.markets with a real email code → Login with Kite → chat.

## 16. P9.5 PARITY BRIEF — port the rest of the old app.slash.markets (for the next session)

**Goal:** everything the old web app (zap-kite-mcp repo root, Next 16, branch `prod`) offered at app.slash.markets
exists here too, restyled into this app's shell, reusing the SAME v1 functions (no new backend features).
Source of truth to port FROM (read, then adapt — same shared database, same `public`/`prod` tables):
- `app/_components/watch-card.tsx` + `app/api/watches/route.ts` (GET list) + `app/api/watches/[id]/route.ts`
  (PATCH `{action: pause|resume|cancel}`) + `lib/server/watches.ts` (`listWatches`, `mutateWatch`; statuses
  ARMED/PAUSED/ERROR/EXPIRED/CANCELLED, `statusReason`, recent `watcher_fires`). Watchers are CREATED only by the MCP
  tool (`create_watcher`) — the web only lists/pauses/resumes/cancels.
- `app/_components/kite-trade-card.tsx` + `lib/client/kite-publisher.ts` + `types/kite-publisher.d.ts`: "Trade on
  Kite" via Zerodha's **Kite Publisher** (`https://kite.trade/publisher.js?v=3`, api_key only — our `/api/broker`
  already returns `publisherApiKey`); deep link `/?trade=1&tradingsymbol=…&exchange=…&transaction_type=…&quantity=…`;
  watcher symbols are quote keys `NSE:GOLDBEES` → split into exchange + tradingsymbol (`splitSymbol`/`tradeFormFor`).
  The ONLY order path in the product — Zerodha's own popup; our server never sees orders (safety invariant).
- `app/terms/page.tsx`, `app/privacy/page.tsx`, `app/support/page.tsx`, `app/_components/legal-page.tsx`,
  `app/_components/site-footer.tsx`, `lib/legal.ts` (Certus Innovations Pvt Ltd placeholders) — static pages; the
  marketing site's footer links to app.slash.markets/{terms,privacy}; the plugin/ChatGPT listings link /support.
- `app/_components/broker-card.tsx` (already superseded by `connect-screen.tsx` + header pill; take only the
  disconnect button + expiry copy if missing).
**Where it goes here:** a **Watchers** view in the sidebar (or a tab beside chats) with the watch cards, pause/resume/
cancel, "Trade on Kite" button per watcher; `/terms`, `/privacy`, `/support` routes + footer on the login page; a
"Trade on Kite" card reachable from chat (the agent's `create_watcher`/positions answers can deep-link to it).
**Rules:** no MCP changes; watchers API = same SQL against the shared db (schema via search_path, like
`lib/server/broker.ts`); drizzle mirrors for `watchers`/`watcher_fires` go in `agent/lib/db/mcp-schema.ts` (never
migrated by us); Kite Publisher only in the browser; keep the UI in this app's shell (brand tokens already here).
**Verify:** vitest for `splitSymbol`/`tradeFormFor` + watch status mapping; Playwright on the local stack (docker pg +
`npm run dev:mcp` container + `npm run dev` with docker DATABASE_URL): seed a watcher row → list → pause → resume →
cancel → Trade on Kite popup reaches `kite.zerodha.com/connect/login?…type=basket`; `/terms`/`/privacy`/`/support`
render; then deploy `--prod` and smoke on app.slash.markets.
