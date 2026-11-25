#!/usr/bin/env bash
# Deploy to Vercel: ONE project (slash-kite-eve) — the Next app serves the eve
# runtime itself via withEve, so no separate runtime project and no
# EVE_UPSTREAM_ORIGIN. The repo is linked once (`vercel link --project
# slash-kite-eve`; .vercel/ is git-ignored); env vars live on the project.
#
#   bash scripts/deploy.sh            preview deployment (build check)
#   bash scripts/deploy.sh --prod     production
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .vercel/project.json ] || npx vercel link --yes --project slash-kite-eve
npx vercel deploy "$@"
