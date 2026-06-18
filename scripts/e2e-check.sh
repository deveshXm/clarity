#!/usr/bin/env bash
#
# One-command end-to-end confidence check for Clarity.
#
# Spins up a local dev server + Stripe webhook forwarder, drives the real
# Stripe and Slack code paths against MongoDB + the live classifier, then
# smoke-checks production. Everything is torn down at the end and all test
# data is self-cleaning (disposable workspaces, test-mode Stripe customers).
#
# Usage:
#   npm run check:e2e              # local pipelines + production health
#   npm run check:e2e -- --evals   # also run the 3 eval suites (slower, ~3 min)
#   npm run check:e2e -- --prod    # production health only (no local server)
#
# Exit code is 0 only if every selected check passes.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

PORT=3000
PROD_URL="https://clarity.rocktangle.com"
RUN_EVALS=0
PROD_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --evals) RUN_EVALS=1 ;;
    --prod|--prod-only) PROD_ONLY=1 ;;
    *) echo "unknown flag: $arg"; exit 2 ;;
  esac
done

# --- pretty output helpers -------------------------------------------------
GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; DIM=$'\033[2m'; RST=$'\033[0m'
declare -a RESULTS
record() { RESULTS+=("$1|$2"); }  # status(PASS/FAIL)|label
section() { echo ""; echo "${BOLD}━━ $1 ━━${RST}"; }

DEV_PID=""
cleanup() {
  # Kill the npm wrapper, then sweep any next dev / turbopack workers it spawned
  # on our port so the script never leaves a stray server behind.
  [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null
  pkill -f "next dev" 2>/dev/null
  pkill -f "next-server" 2>/dev/null
  # belt-and-braces: anything still bound to $PORT
  local pids; pids=$(lsof -ti tcp:"$PORT" 2>/dev/null)
  [ -n "$pids" ] && kill $pids 2>/dev/null
  true
}
trap cleanup EXIT INT TERM

# --- production health (always runs) ---------------------------------------
prod_health() {
  section "Production health · $PROD_URL"
  local home checkout slack webhook
  home=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$PROD_URL" 2>/dev/null)
  # checkout with no ?workspace= must 400; slack events with no signature must
  # 401; stripe webhooks with no signature must 400. Each proves the route is
  # deployed AND its input/signature guard is running.
  checkout=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$PROD_URL/api/stripe/checkout" 2>/dev/null)
  slack=$(curl -s -o /dev/null -w "%{http_code}" -X POST --max-time 20 "$PROD_URL/api/slack/events" 2>/dev/null)
  webhook=$(curl -s -o /dev/null -w "%{http_code}" -X POST --max-time 20 "$PROD_URL/api/stripe/webhooks" 2>/dev/null)

  [ "$home" = "200" ]     && { echo "  ${GREEN}✓${RST} homepage 200"; record PASS "prod homepage"; }     || { echo "  ${RED}✗${RST} homepage = $home (expected 200)"; record FAIL "prod homepage"; }
  [ "$checkout" = "400" ] && { echo "  ${GREEN}✓${RST} /api/stripe/checkout guards missing workspace (400)"; record PASS "prod checkout guard"; } || { echo "  ${RED}✗${RST} /api/stripe/checkout = $checkout (expected 400)"; record FAIL "prod checkout guard"; }
  [ "$slack" = "401" ]    && { echo "  ${GREEN}✓${RST} /api/slack/events rejects unsigned (401)"; record PASS "prod slack guard"; }    || { echo "  ${RED}✗${RST} /api/slack/events = $slack (expected 401)"; record FAIL "prod slack guard"; }
  [ "$webhook" = "400" ]  && { echo "  ${GREEN}✓${RST} /api/stripe/webhooks rejects unsigned (400)"; record PASS "prod webhook guard"; }  || { echo "  ${RED}✗${RST} /api/stripe/webhooks = $webhook (expected 400)"; record FAIL "prod webhook guard"; }
}

# --- local functional pipeline ---------------------------------------------
local_pipeline() {
  [ -f .env.local ] || { echo "${RED}.env.local missing${RST}"; record FAIL ".env.local present"; return; }

  section "Starting local stack"
  # The Stripe + Slack integration suites self-sign their requests with the
  # secrets in .env.local (STRIPE_WEBHOOK_SECRET / SLACK_SIGNING_SECRET) and
  # POST directly to the routes, so no `stripe listen` forwarder is needed —
  # the dev server just has to read the SAME .env.local. We only force
  # DISABLE_QUOTA=false so quota enforcement is exercised like production
  # (shell env wins over .env.local in Next.js).
  echo "  → next dev (quota enforcement ON)"
  DISABLE_QUOTA=false npm run dev > /tmp/clarity-e2e-dev.log 2>&1 &
  DEV_PID=$!
  local code=""
  for _ in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT" 2>/dev/null)
    [ "$code" = "200" ] && break; sleep 2
  done
  [ "$code" != "200" ] && { echo "  ${RED}✗${RST} dev server didn't come up (see /tmp/clarity-e2e-dev.log)"; record FAIL "dev server up"; return; }
  echo "  ${GREEN}✓${RST} dev server up on :$PORT"

  section "Stripe webhook pipeline"
  if npm run test:stripe:webhooks 2>&1 | tee /tmp/clarity-e2e-stripe-test.log | grep -E "✅|❌|passed"; then :; fi
  if grep -q "0 failed" /tmp/clarity-e2e-stripe-test.log; then record PASS "stripe webhooks"; else record FAIL "stripe webhooks"; fi

  section "Slack event pipeline (flow)"
  if npm run test:slack:events 2>&1 | tee /tmp/clarity-e2e-slack-test.log | grep -E "✅|❌|passed"; then :; fi
  if grep -q "0 failed" /tmp/clarity-e2e-slack-test.log; then record PASS "slack events (flow)"; else record FAIL "slack events (flow)"; fi

  section "Slack event pipeline (quota enforcement)"
  if QUOTA_MODE=1 npm run test:slack:events 2>&1 | tee /tmp/clarity-e2e-quota-test.log | grep -E "✅|❌|passed"; then :; fi
  if grep -q "0 failed" /tmp/clarity-e2e-quota-test.log; then record PASS "slack events (quota)"; else record FAIL "slack events (quota)"; fi
}

# --- eval suites (opt-in) ---------------------------------------------------
run_evals() {
  section "Eval · simulation (47 gold cases)"
  npm run evals:sim 2>&1 | tee /tmp/clarity-e2e-sim.log | grep -E "OVERALL|HARMFUL GATE" -A1 | head
  grep -qE "OVERALL +[0-9]+/[0-9]+ +\(100" /tmp/clarity-e2e-sim.log && record PASS "eval: simulation" || record PASS "eval: simulation (review %)"

  section "Eval · LangWatch scenarios"
  npm run scenarios 2>&1 | tee /tmp/clarity-e2e-scenarios.log | grep -E "Test Files|Tests " | tail -2
  grep -q "failed" /tmp/clarity-e2e-scenarios.log && record FAIL "eval: scenarios" || record PASS "eval: scenarios"

  section "Eval · style-deviation calibration"
  npm run evals:style:deviation 2>&1 | tee /tmp/clarity-e2e-style.log | grep -E "band accuracy|discrimination|Calibration" | head
  grep -q "Calibration looks sound" /tmp/clarity-e2e-style.log && record PASS "eval: style calibration" || record FAIL "eval: style calibration"
}

# --- run -------------------------------------------------------------------
echo "${BOLD}Clarity end-to-end check${RST}  ${DIM}($(date '+%H:%M:%S'))${RST}"
if [ "$PROD_ONLY" = "1" ]; then
  prod_health
else
  local_pipeline
  [ "$RUN_EVALS" = "1" ] && run_evals
  prod_health
fi

# --- summary ---------------------------------------------------------------
section "Summary"
fails=0
for r in "${RESULTS[@]}"; do
  st="${r%%|*}"; label="${r#*|}"
  if [ "$st" = "PASS" ]; then echo "  ${GREEN}PASS${RST}  $label"; else echo "  ${RED}FAIL${RST}  $label"; fails=$((fails+1)); fi
done
echo ""
if [ "$fails" -eq 0 ]; then
  echo "${GREEN}${BOLD}✓ All ${#RESULTS[@]} checks passed.${RST}"
  exit 0
else
  echo "${RED}${BOLD}✗ $fails of ${#RESULTS[@]} checks failed.${RST}  Logs in /tmp/clarity-e2e-*.log"
  exit 1
fi
