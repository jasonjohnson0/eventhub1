#!/usr/bin/env bash
# Runs the whole suite against a real Postgres and a real browser.
#
#   tests/run.sh          everything
#   tests/run.sh lint     correctness lint only (2 seconds, no deps)
#   tests/run.sh unit     pure-function logic only (no DB, no browser)
#   tests/run.sh db       schema, RLS, grants and the billing rules only
#   tests/run.sh browser  the rendered pages and HTTP endpoints only
#
# Nothing here touches the live database. The db suites boot a throwaway
# Postgres and replay supabase/migrations into it; the browser suites run the
# app against a stub that speaks just enough PostgREST and GoTrue.
set -uo pipefail
cd "$(dirname "$0")/.."

WHICH="${1:-all}"
MOCK_PORT=54199  # dashboard.mjs derives the supabase storage key from this host
APP_PORT=5199
fails=0

run() { # name, command...
  local name="$1"; shift
  echo; echo "=============== $name ==============="
  if "$@"; then echo "--- $name OK"; else echo "--- $name FAILED"; fails=$((fails+1)); fi
}

# ---------------------------------------------------------------------------
# Correctness lint. Deliberately not the full `npm run lint`: 1084 of its 1166
# findings are prettier formatting, and a gate that shouts about whitespace is a
# gate people learn to skip. These are the rules that cause outages -- the
# rules-of-hooks error that made /events/$id/manage crash for every visitor was
# sitting in `npm run lint` output nobody read, because until this was fixed
# `eslint .` ran for over eight minutes and never returned.
# ---------------------------------------------------------------------------
if [ "$WHICH" = "all" ] || [ "$WHICH" = "lint" ]; then
  run "lint (correctness rules)" npx eslint . \
    --rule '{"prettier/prettier":"off","@typescript-eslint/no-explicit-any":"off"}' \
    --max-warnings 20
fi

if [ "$WHICH" = "all" ] || [ "$WHICH" = "unit" ]; then
  for f in tests/unit/*.mjs; do run "unit/$(basename "$f")" node "$f"; done
fi

if [ "$WHICH" = "all" ] || [ "$WHICH" = "db" ]; then
  # pgserver boots an embedded Postgres; no server needs to be installed.
  python3 -c "import pgserver" 2>/dev/null || {
    echo "SKIP db suites: pip install pgserver"; }
  if python3 -c "import pgserver" 2>/dev/null; then
    for f in tests/db/*.py; do run "db/$(basename "$f")" python3 "$f"; done
  fi
fi

if [ "$WHICH" = "all" ] || [ "$WHICH" = "browser" ]; then
  node -e "require.resolve('playwright-core')" 2>/dev/null || {
    echo "SKIP browser suites: npm i -D playwright-core"; exit "$fails"; }

  node tests/support/mock-supabase.mjs "$MOCK_PORT" >/tmp/eh-mock.log 2>&1 &
  mock_pid=$!
  VITE_SUPABASE_URL="http://127.0.0.1:$MOCK_PORT" SUPABASE_URL="http://127.0.0.1:$MOCK_PORT" \
  VITE_SUPABASE_ANON_KEY=test SUPABASE_ANON_KEY=test SUPABASE_SERVICE_ROLE_KEY=test-service-key \
  PUBLIC_SITE_URL=https://events.example AD_STATS_SALT=test-salt \
  PLATFORM_CONFIG_ENC_KEY=test-platform-config-enc-key CRON_SECRET=test-cron-secret \
    npx vite dev --port "$APP_PORT" --host 127.0.0.1 >/tmp/eh-dev.log 2>&1 &
  app_pid=$!
  trap 'kill $mock_pid $app_pid 2>/dev/null' EXIT

  for _ in $(seq 1 60); do
    curl -sf "http://127.0.0.1:$APP_PORT/" -o /dev/null && break; sleep 1
  done

  export APP_URL="http://127.0.0.1:$APP_PORT" MOCK_URL="http://127.0.0.1:$MOCK_PORT"
  for f in tests/browser/*.mjs; do run "browser/$(basename "$f")" node "$f"; done

  # The WordPress plugin fetches the embed over HTTP, so it needs the app up too.
  command -v php >/dev/null && \
    run "wordpress-plugin" php wordpress-plugin/eventhub-calendar/test-wp-plugin.php "http://127.0.0.1:$APP_PORT"
fi

echo; echo "==================================="
[ "$fails" -eq 0 ] && echo "ALL SUITES PASSED" || echo "$fails SUITE(S) FAILED"
exit "$fails"
