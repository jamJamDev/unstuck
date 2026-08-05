#!/bin/bash
# Runs the Unstuck test suites.
#   ./test.sh              unit tests for the decision core (fast, no browser)
#   ./test.sh --browser    also serves and opens the in-browser DOM suite
set -euo pipefail
cd "$(dirname "$0")"

node --test "tests/*.test.js"

if [ "${1:-}" = "--browser" ]; then
  PORT="${PORT:-8011}"
  python3 -m http.server "$PORT" >/dev/null 2>&1 &
  SERVER=$!
  trap 'kill "$SERVER" 2>/dev/null || true' EXIT
  sleep 1
  URL="http://localhost:${PORT}/tests/dom.test.html"
  echo
  echo "Browser suite: ${URL}"
  command -v open >/dev/null && open "$URL"
  echo "Press Ctrl+C when you have read the results."
  wait "$SERVER"
fi
