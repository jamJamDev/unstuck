#!/bin/bash
# Serves Unstuck locally for desktop testing and browser use on your phone.
# Note: installing as a PWA on a phone needs HTTPS (or localhost) — for a real
# install, host the folder on a free static host (GitHub Pages / Netlify).
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8010}"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '')"

echo "Unstuck is serving on:"
echo "  Desktop:  http://localhost:${PORT}/"
if [ -n "$LAN_IP" ]; then
	echo "  Phone:    http://${LAN_IP}:${PORT}/   (same Wi-Fi; browser-only, no install over HTTP)"
fi
echo "Press Ctrl+C to stop."
exec python3 -m http.server "$PORT"
