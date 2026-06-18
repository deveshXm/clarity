# Testing Clarity end-to-end

One command confirms the whole stack — payments, Slack coaching, and production — is healthy.

```bash
npm run check:e2e
```

It spins up a local dev server, drives the real code paths against MongoDB and
the live classifier, smoke-checks production, tears everything down, and prints
a pass/fail summary. Self-cleaning: every test creates disposable workspaces and
test-mode Stripe customers and deletes them at the end.

## What it checks

| Group | What runs | Proves |
|---|---|---|
| **Stripe webhooks** (21) | Signed synthetic events + a real test-mode subscription POSTed to `/api/stripe/webhooks` | Signature verification, checkout → PRO upgrade, renewal date handling across both Stripe API payload shapes, quota resets only on real upgrades/renewals, payment-failed → past_due, cancel → FREE |
| **Slack events — flow** (7) | Signed `message` events to `/api/slack/events` | Forged signatures 401; flagged messages coach + count usage; clean messages no-op; harmful content warns without consuming quota |
| **Slack events — quota** (5) | Same, at the FREE limit | Blocks at the limit, one notification per billing period, no double-notify, no usage increment when blocked |
| **Production health** (4) | `clarity.rocktangle.com` | Homepage 200; checkout/Slack/webhook routes deployed with their input + signature guards live |

## Variants

```bash
npm run check:e2e            # local pipelines + production health (~1–2 min)
npm run check:e2e -- --evals # also run the 3 eval suites (sim, scenarios, style) — ~3 min more
npm run check:e2e -- --prod  # production health only, no local server (~10 s)
```

Exit code is `0` only if every selected check passes. Per-suite logs land in
`/tmp/clarity-e2e-*.log`.

## Requirements

- `.env.local` present (the suites self-sign with `STRIPE_WEBHOOK_SECRET` and
  `SLACK_SIGNING_SECRET` from it, so the dev server reads the same file — no
  `stripe listen` forwarder needed).
- Outbound network to MongoDB Atlas, Azure/Portkey (classifier), and Stripe
  test mode.

## Individual suites

Each group can also be run on its own against a running dev server:

```bash
npm run dev                  # in one terminal
npm run test:stripe:webhooks # signed Stripe webhook suite
npm run test:slack:events    # Slack event flow suite
QUOTA_MODE=1 npm run test:slack:events   # quota-enforcement suite (needs DISABLE_QUOTA=false)
```

## The one thing this does NOT cover

The **live** payment (a real charge on production with live Stripe keys) is
deliberately out of scope — it needs a real card and live keys on Vercel, so
it's a manual, user-driven step done once after deploy, then cancelled/refunded.
