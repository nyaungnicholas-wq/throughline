#!/usr/bin/env bash
# Deploy Throughline to Vercel on free tiers, at throughline.nicholasnyaung.com.
#
# Prerequisite (the one step that needs a browser): create a free Postgres database
# and copy its pooled connection string.
#   Neon      -> https://neon.tech  (free tier, no card)
#   or Vercel -> Dashboard > Storage > Create Database > Neon
#
# Then:
#   ./scripts/deploy.sh 'postgresql://user:pass@host/db?sslmode=require'
#
# Everything else — secret generation, env vars, blob storage, the custom domain —
# is handled here. Safe to re-run; it only sets what is missing.

set -euo pipefail

DB_URL="${1:-}"
DOMAIN="${DOMAIN:-throughline.nicholasnyaung.com}"

if [[ -z "$DB_URL" ]]; then
  echo "usage: ./scripts/deploy.sh '<postgres-connection-string>'" >&2
  echo "see the header of this file for where to get one (free, no card)" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "==> installing the Vercel Blob client (attachments need it in production)"
if ! node -e 'require.resolve("@vercel/blob")' 2>/dev/null; then
  npm install --save @vercel/blob
else
  echo "    already installed"
fi

echo "==> linking the Vercel project"
npx vercel link --yes >/dev/null

set_env() { # name, value — replaces any existing production value
  printf '%s' "$2" | npx vercel env add "$1" production --force >/dev/null 2>&1 \
    && echo "    set $1" || echo "    could not set $1 (set it in the dashboard)"
}

echo "==> configuring production environment"
set_env DATABASE_URL "$DB_URL"
set_env APP_SECRET   "$(openssl rand -hex 32)"
set_env APP_URL      "https://${DOMAIN}"
set_env CRON_SECRET  "$(openssl rand -hex 32)"

echo "==> deploying"
npx vercel --prod --yes

echo "==> attaching ${DOMAIN}"
npx vercel domains add "$DOMAIN" 2>&1 | tail -2 || true

cat <<EOF

Done. Remaining optional steps, none of which block the demo:

  BLOB_READ_WRITE_TOKEN  Vercel dashboard > Storage > Blob. Without it, file
                         attachments fall back to the local filesystem, which on
                         Vercel means uploads do not persist between requests.
  RESEND_API_KEY         Magic-link login emails. Without it sending is a silent
                         no-op, so use the seeded demo accounts instead.
  GEMINI_API_KEY         AI features. Without it they return deterministic mocks.

Live at: https://${DOMAIN}
EOF
