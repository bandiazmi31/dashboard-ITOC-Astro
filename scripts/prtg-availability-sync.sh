#!/bin/bash
# Daily PRTG availability sync for the office machine (run by launchd, see com.itoc.prtg-availability-sync.plist).
# PRTG is only reachable from the office network, so this runs here and not on Vercel.
# Starts the local dev server if it is not running, then rewrites yesterday and today (WIB) from PRTG.
# Reads SYNC_SECRET from .env without printing it.

set -u

REPO="/Users/ben/vibeCode/dashboard-ITOC-Astro"
PORT=4321
DAYS=2
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"

cd "$REPO" || exit 1

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

SECRET=$(grep '^SYNC_SECRET=' .env | cut -d= -f2- | tr -d '\r')
if [ -z "$SECRET" ]; then
  log "SYNC_SECRET is missing from .env; nothing synced"
  exit 1
fi

if ! curl -s -o /dev/null --max-time 5 "http://localhost:$PORT/login"; then
  log "dev server not answering; starting it"
  npx astro dev --background >/dev/null 2>&1
  # Give Astro time to bind the port before the first request
  for _ in $(seq 1 30); do
    curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/login" && break
    sleep 2
  done
fi

RESPONSE=$(curl -s --max-time 280 -X POST "http://localhost:$PORT/api/noc/sync-availability" \
  -H "x-sync-secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d "{\"days\":$DAYS}" \
  -w '\nHTTP=%{http_code}')

log "availability sync days=$DAYS: $RESPONSE"
