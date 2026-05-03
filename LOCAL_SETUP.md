# Local Setup

How to run Clarity locally and install the bot into your own dev Slack workspace.

## Workspace conventions

| Workspace | Purpose |
|---|---|
| **Test** | Default dev workspace for non-Devesh contributors. **Use this one.** |
| **Clarity-Test-Devesh** | Devesh's personal dev workspace — don't install your dev app here. |
| **Commbot** | Production (hosted Clarity app). Never install a dev app here. |

When creating your dev Slack app below, pick **Test** as the workspace unless you're Devesh.

## Prerequisites

- Node.js (matches `package.json` engines)
- [ngrok](https://ngrok.com/download) installed and authenticated (`ngrok config add-authtoken …`)
- Admin access to the **Test** Slack workspace
- A populated `.env.local` (ask another dev for the shared base file — it has Mongo URI, Azure key, etc.)

## One-time setup: create your personal dev Slack app

The shared production app (in `manifest-prod.json`) is non-distributed and locked to its origin workspace, so you can't install it elsewhere — you'll get `invalid_team_for_non_distributed_app`. Each dev creates their own.

1. **Restore the manifest template** (it was removed in commit `bda2b44`):
   ```bash
   git show bda2b44^:manifest-dev.json > manifest-dev.json
   ```
   Edit `name` and `display_name` in `manifest-dev.json` to something unique like `Clarity-<yourname>`.

2. **Create the Slack app**: go to https://api.slack.com/apps → **Create New App** → **From a manifest** → pick your dev workspace → paste the contents of `manifest-dev.json`. The ngrok URLs in the manifest will be overwritten on first run; the placeholder values are fine.

3. **Grab credentials** from your new app:
   - **Basic Information** → App ID, Client ID, Client Secret, Signing Secret

4. **Generate a Configuration Refresh Token** (this is *not* the same as the bot/access token):
   - https://api.slack.com/apps (the app **list** page, not your app's page)
   - Scroll to **Your App Configuration Tokens** at the bottom
   - **Generate Token** → pick your workspace → copy the **Refresh Token** (`xoxe-…`)
   - This token lets `scripts/setup-app.sh` push manifest updates via API.

5. **Populate `.env.local`** with the new values:
   ```
   SLACK_APP_ID=A0…
   NEXT_PUBLIC_SLACK_CLIENT_ID=…
   SLACK_CLIENT_SECRET=…
   SLACK_SIGNING_SECRET=…
   SLACK_CONFIG_REFRESH_TOKEN=xoxe-…
   SLACK_REDIRECT_URI=  # auto-filled by setup script
   ```

## Each dev session

```bash
npm run setup:slack   # rotates ngrok, rewrites manifest-dev.json + .env.local, pushes manifest to Slack
npm run dev           # starts Next.js on localhost:3000
```

`npm run setup:slack` reuses an already-running ngrok tunnel if one exists, otherwise starts a new one. It also rotates `SLACK_CONFIG_REFRESH_TOKEN` in-place — refresh tokens are single-use.

Then: open http://localhost:3000 → **Add to Slack** → pick your dev workspace → install.

## Common issues

**`invalid_team_for_non_distributed_app`** — your `.env.local` is pointing at the prod app's `NEXT_PUBLIC_SLACK_CLIENT_ID`. Replace it with your dev app's client ID (see step 3 above).

**ngrok "You are about to visit" interstitial** — free-tier behavior, shown once per browser session. Just click **Visit Site**; the OAuth `code` query param carries through to `/api/auth/slack/callback`. Slack's own requests to your endpoints aren't affected.

**Refresh token error: `invalid_refresh_token`** — tokens expire; regenerate at https://api.slack.com/apps → bottom of the page → **Generate Token**. Replace the value in `.env.local`.

**`404` after install on `/docs/getting-started`** — fixed in `next.config.ts` via a rewrite to the Mintlify docs site. If you still see it, restart `next dev` so the new rewrites load.

**ngrok URL changed since last run but Slack is still hitting the old one** — re-run `npm run setup:slack`. The script diffs the URL in `manifest-dev.json` and only updates if it changed.

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server with Turbopack |
| `npm run setup:slack` | Provision/refresh ngrok + dev Slack manifest |
| `npm run reports:weekly:dev` | Generate weekly user reports (dev DB) |
| `npm run reports:monthly:dev` | Monthly reports (dev DB) |
| `npm run evals:run` | Run evaluation suite against local server |
| `npm run evals:run:prod` | Run evals against prod (`clarity.rocktangle.com`) |
| `npm run test:evaluate:dev` | Smoke-test the `/api/evaluate` endpoint locally |

## Testing the weekly style digest

The digest is a Trigger.dev cron task (Mondays 09:00 UTC), but you don't want to wait until Monday to test changes. Two options:

**One-off invocation against your own Slack user (preferred for dev):**

```bash
# Replace with your Slack user ID (Slack profile → "Copy member ID").
# Defaults to weekly (7-day lookback). Pass 'daily' for the 1-day path.
npx tsx --env-file=.env.local -e "import('./src/trigger/weeklyStyleDigest').then(m => m.runForUser('U0A81H9LZ0S', 'weekly')).then(r => { console.log('result:', r); process.exit(0); })"
```

This bypasses Trigger.dev entirely, runs the full digest pipeline (Slack history fetch → LLM baseline → optional deviation → DM), and exits. The DM lands in your Slack from the bot.

Prerequisites for a useful result:
- You've installed Clarity-Dhruv (or whatever your dev app is called) into the Test workspace.
- `digestCadence` is set to `weekly` on your `slackUsers` doc, OR you're testing the helper directly (it ignores that flag).
- You've sent at least ~10 messages in `autoCoachingEnabledChannels` over the last 7 days (the task short-circuits with a "not enough activity" DM otherwise).

**Triggering the actual cron handler in dev:**

```bash
npx trigger.dev@latest dev
```

Then trigger from the Trigger.dev dashboard. Useful for verifying schedule wiring; less useful for iterating on the LLM prompt or block layout.

## File map

- `manifest-prod.json` — production Slack app manifest. Don't touch unless you know what you're doing.
- `manifest-dev.json` — your personal dev app manifest (gitignored).
- `scripts/setup-app.sh` — the manifest-rotation script behind `npm run setup:slack`.
- `next.config.ts` — includes rewrites for `/docs/*` → Mintlify and `/clarity-ui96/*` → PostHog.
