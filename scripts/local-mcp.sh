#!/usr/bin/env bash
# Run the /markets Kite MCP from the sibling checkout against THIS app's local
# database, trusting this app (plan D15/D16). Reads this repo's .env for the
# shared secrets so both sides agree; the MCP's own ../.env still supplies
# KITE_API_KEY/SECRET (the MCP loads it with override=false, so what we export
# here wins). Listens on http://127.0.0.1:8029 — point KITE_MCP_URL at it.
#
#   bash scripts/local-mcp.sh            foreground
#   MCP_DIR=../zap-kite-mcp/mcp bash scripts/local-mcp.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
MCP_DIR=${MCP_DIR:-../zap-kite-mcp/mcp}
PORT=${LOCAL_MCP_PORT:-8029}
export DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}"
export ZAP_KITE_MCP_PUBLIC_URL="http://127.0.0.1:$PORT"
export ZAP_KITE_MCP_HOST=127.0.0.1
export ZAP_KITE_MCP_PORT="$PORT"
export ZAP_KITE_MCP_APP_URL="${APP_BASE_URL:-http://localhost:3000}"
export ZAP_KITE_MCP_STATE_DIR="$PWD/.eve/local-mcp-state"
export SESSION_SECRET="$MCP_SESSION_SECRET"
export CREDS_ENCRYPTION_KEY="$MCP_CREDS_ENCRYPTION_KEY"
export ZAP_KITE_MCP_TRUSTED_CLIENT_ID="$MCP_TRUSTED_CLIENT_ID"
export ZAP_KITE_MCP_TRUSTED_CLIENT_SECRET="$MCP_TRUSTED_CLIENT_SECRET"
export ZAP_KITE_MCP_ASSERTION_SECRET="$MCP_ASSERTION_SECRET"
export DEV_LOGIN_EMAIL="${DEV_LOGIN_EMAIL:-}" DEV_LOGIN_CODE="${DEV_LOGIN_CODE:-}"
export RESEND_API_KEY="${RESEND_API_KEY:-}"
[ -n "${KITE_API_KEY:-}" ] && export KITE_API_KEY KITE_API_SECRET || unset KITE_API_KEY KITE_API_SECRET
exec uv run --directory "$MCP_DIR" zap-kite-mcp "$@"
