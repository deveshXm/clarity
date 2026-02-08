#!/bin/bash
set -e

ENV_FILE=".env.local"
MANIFEST_FILE="manifest-dev.json"

# --- Load env vars ---
load_env() {
  while IFS= read -r line; do
    [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
    export "$line"
  done < "$ENV_FILE"
}
load_env

# --- Validate required vars ---
for var in SLACK_APP_ID SLACK_CONFIG_REFRESH_TOKEN; do
  if [ -z "${!var}" ]; then
    echo "Error: $var is not set in $ENV_FILE"
    echo ""
    echo "Add these to your $ENV_FILE:"
    echo "  SLACK_APP_ID=<your-app-id>                        # From https://api.slack.com/apps → Basic Information"
    echo "  SLACK_CONFIG_REFRESH_TOKEN=<your-refresh-token>   # From https://api.slack.com/apps → scroll to 'Your App Configuration Tokens' → Generate Token"
    exit 1
  fi
done

# --- Rotate config token to get fresh access token ---
echo "Refreshing Slack config token..."
TOKEN_RESPONSE=$(curl -s -X POST "https://slack.com/api/tooling.tokens.rotate" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "refresh_token=$SLACK_CONFIG_REFRESH_TOKEN")

CONFIG_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('token', ''))")
NEW_REFRESH_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('refresh_token', ''))")

if [ -z "$CONFIG_TOKEN" ] || [ "$CONFIG_TOKEN" = "None" ]; then
  ERROR=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('error', 'unknown'))")
  echo "Error refreshing config token: $ERROR"
  echo "Regenerate your refresh token at: https://api.slack.com/apps → Your App Configuration Tokens → Generate Token"
  exit 1
fi

# Update refresh token in .env.local for next run
sed -i '' "s|SLACK_CONFIG_REFRESH_TOKEN=.*|SLACK_CONFIG_REFRESH_TOKEN=$NEW_REFRESH_TOKEN|" "$ENV_FILE"
echo "Config token refreshed"

# --- Extract old ngrok URL from manifest ---
OLD_URL=$(python3 -c "
import json, re
with open('$MANIFEST_FILE') as f:
    match = re.search(r'https://[a-z0-9-]+\.ngrok-free\.app', f.read())
    print(match.group(0) if match else '')
")

if [ -z "$OLD_URL" ]; then
  echo "Error: Could not find existing ngrok URL in $MANIFEST_FILE"
  exit 1
fi
echo "Old URL: $OLD_URL"

# --- Get or start ngrok ---
NEW_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "
import sys, json
try:
    tunnels = json.load(sys.stdin)['tunnels']
    print(next(t['public_url'] for t in tunnels if t['public_url'].startswith('https')))
except: pass
" 2>/dev/null)

if [ -n "$NEW_URL" ]; then
  echo "Using already running ngrok"
else
  pkill -f "ngrok http" 2>/dev/null && sleep 1 || true
  echo "Starting ngrok on port 3000..."
  ngrok http 3000 > /dev/null 2>&1 &
  NGROK_PID=$!

  for i in {1..10}; do
    sleep 1
    NEW_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "
import sys, json
try:
    tunnels = json.load(sys.stdin)['tunnels']
    print(next(t['public_url'] for t in tunnels if t['public_url'].startswith('https')))
except: pass
" 2>/dev/null)
    [ -n "$NEW_URL" ] && break
  done

  if [ -z "$NEW_URL" ]; then
    echo "Error: ngrok failed to start. Is ngrok installed?"
    kill $NGROK_PID 2>/dev/null
    exit 1
  fi
fi
echo "New URL: $NEW_URL"

# --- Skip if URL unchanged ---
if [ "$OLD_URL" = "$NEW_URL" ]; then
  echo "URL unchanged, skipping file updates"
else
  sed -i '' "s|$OLD_URL|$NEW_URL|g" "$MANIFEST_FILE"
  sed -i '' "s|$OLD_URL|$NEW_URL|g" "$ENV_FILE"
  echo "Updated $MANIFEST_FILE and $ENV_FILE"
fi

# --- Update Slack app manifest ---
echo "Updating Slack app manifest..."
PAYLOAD=$(python3 -c "
import json, sys
manifest = json.load(open(sys.argv[1]))
print(json.dumps({'app_id': sys.argv[2], 'manifest': manifest}))
" "$MANIFEST_FILE" "$SLACK_APP_ID")

RESPONSE=$(curl -s -X POST "https://slack.com/api/apps.manifest.update" \
  -H "Authorization: Bearer $CONFIG_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

OK=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('ok', False))")
if [ "$OK" = "True" ]; then
  echo "Slack app manifest updated!"
else
  ERROR=$(echo "$RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('error', 'unknown'))")
  echo "Error updating Slack manifest: $ERROR"
  echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

echo ""
echo "Setup complete! URL: $NEW_URL"
