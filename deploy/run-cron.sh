#!/usr/bin/env bash
# Calls one CRON_SECRET-protected cron route on the local app container.
# Usage: deploy/run-cron.sh /api/accounting/reminders/generate
#
# Reads CRON_SECRET from the .env.production next to docker-compose.yml at
# run time, so the secret never has to be pasted into the crontab or git.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROUTE="${1:?usage: run-cron.sh /api/path}"

CRON_SECRET="$(grep -E '^CRON_SECRET=' "$APP_DIR/.env.production" | tail -n1 | cut -d= -f2- | sed -E 's/^["'\'']|["'\'']$//g' || true)"
if [ -z "$CRON_SECRET" ]; then
  echo "$(date -u +%FT%TZ) $ROUTE: CRON_SECRET missing from $APP_DIR/.env.production" >&2
  exit 1
fi

# The app container is bound to 127.0.0.1:3000 (see docker-compose.yml) —
# call it directly rather than going back out through Nginx/TLS.
out="$(mktemp)"
trap 'rm -f "$out"' EXIT
status="$(curl -sS -o "$out" -w '%{http_code}' --max-time 330 \
  -H "Authorization: Bearer $CRON_SECRET" "http://127.0.0.1:3000$ROUTE")" || status="curl-error"

echo "$(date -u +%FT%TZ) $ROUTE -> $status $(head -c 300 "$out" 2>/dev/null)"
[ "$status" = "200" ]
