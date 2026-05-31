#!/usr/bin/env bash
#
# One command to run Clarity locally for testing on the Test Slack workspace.
# Starts the ngrok tunnel (reserved domain) + Next dev server together, and
# keeps them tied: Ctrl-C stops both. If ngrok is already running, it's reused.
#
# Usage:  npm run dev:test
#
set -uo pipefail

PORT=3000
# Reserved ngrok domain — must match SLACK_REDIRECT_URI in .env.local.
NGROK_DOMAIN="$(grep -E '^SLACK_REDIRECT_URI=' .env.local 2>/dev/null | sed -E 's#.*https://([^/]+)/.*#\1#')"
NGROK_DOMAIN="${NGROK_DOMAIN:-jacquelyn-uncapering-barry.ngrok-free.dev}"

STARTED_NGROK=0

cleanup() {
  # Only kill ngrok if THIS script started it.
  if [ "$STARTED_NGROK" = "1" ]; then
    echo ""
    echo "→ stopping ngrok"
    pkill -f "ngrok http $PORT" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# 1. Tunnel
if pgrep -f "ngrok http" >/dev/null; then
  echo "✓ ngrok already running — reusing it"
else
  echo "→ starting ngrok on https://$NGROK_DOMAIN"
  ngrok http "$PORT" --url="$NGROK_DOMAIN" --log=stdout > /tmp/clarity-ngrok.log 2>&1 &
  STARTED_NGROK=1
  # Wait for the tunnel to be ready
  for i in $(seq 1 15); do
    if curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -q "$NGROK_DOMAIN"; then break; fi
    sleep 1
  done
fi

# 2. Friendly banner with the Test install link
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Clarity — local test mode"
echo "  Local:        http://localhost:$PORT"
echo "  Public:       https://$NGROK_DOMAIN"
echo "  Install on Test workspace: open http://localhost:$PORT and"
echo "  click 'Add to Slack' (pinned to Test via SLACK_PINNED_TEAM_ID)."
echo "  Quota is bypassed for testing (DISABLE_QUOTA=true)."
echo "  ngrok logs: /tmp/clarity-ngrok.log"
echo "════════════════════════════════════════════════════════════════"
echo ""

# 3. Next dev server in the foreground (Ctrl-C stops everything)
next dev --turbopack
