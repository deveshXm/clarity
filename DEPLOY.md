# Clarity — Production Deploy Runbook

Goal: get **your own** always-on Clarity off ngrok and onto Vercel, owned by you (not Devesh).

The app code is the easy part. The work is that Clarity depends on ~8 external
services that are all currently Devesh's. This runbook gets you to a **free
public beta** with the minimum set you must own, and defers the rest.

---

## The dependency map (what the app needs)

| Service | Used for | Beta status | Cost |
|---|---|---|---|
| **Vercel** | Hosting the app (stable HTTPS URL, replaces ngrok) | **Own now** | Free |
| **Slack app** | The bot itself (OAuth, commands, events) | **Own now** | Free |
| **MongoDB Atlas** | Database (workspaces, users, settings) | **Own now** | Free (M0) |
| **LLM key** (Azure OpenAI via Portkey) | The actual coaching AI | **Own now** | Pay-per-use |
| **Trigger.dev** | Daily/weekly digest cron | **Own now** | Free tier |
| **Better Auth secret** | Session signing | **Own now** | Free (random string) |
| Stripe | Paid Pro plan billing | **Defer** — only when you charge | Free until live |
| PostHog | Product analytics | **Defer** — optional | Free tier |
| Resend | Transactional email | **Defer** — optional | Free tier |
| Google OAuth | Web login (if used) | **Defer** | Free |
| Vercel Blob | File storage | **Defer** — verify if core flow needs it | Free tier |

**Reality check:** "own now" = 6 accounts to create. None are hard, but the LLM
key is the one with a real decision (see step 4). Budget ~2 hours.

---

## Phase 1 — Get off ngrok onto stable hosting (free beta)

Do these in order. Steps marked 👤 need YOU (account creation / interactive login);
steps marked 🤖 I can do in the repo.

### 1. 👤 Own the code
- Create a GitHub account if you don't have one (you likely do: `ghulatid`).
- Fork `github.com/deveshXm/clarity` to your account, OR ask Devesh to transfer it.
- Clone your fork locally (or re-point this repo's `origin` to your fork).

### 2. 👤 MongoDB Atlas (database)
- Create a free account → free **M0** cluster.
- Create a DB user + password, allow network access from anywhere (`0.0.0.0/0`).
- Copy the connection string → this becomes `MONGODB_URI`.
- Pick a DB name (e.g. `clarity`) → `MONGODB_DB_NAME`.
- The app creates collections automatically on first use.

### 3. 👤 Trigger.dev (cron for digests)
- Create a free account, new project.
- Copy the secret key → `TRIGGER_SECRET_KEY`.

### 4. 👤 LLM key — DECISION NEEDED
The code calls Azure OpenAI through Portkey. You have two options:
- **(a) Azure OpenAI** — matches the code exactly, but requires an approved Azure
  subscription with OpenAI access (approval can take days). Needs
  `AZURE_API_KEY`, `AZURE_API_ENDPOINT`, `AZURE_API_VERSION`, deployment/model names.
- **(b) Switch to a simpler provider** (recommended for solo/non-technical) —
  Portkey can route to OpenAI or Anthropic directly with one API key. This is a
  small code change I can make so you only need one key (e.g. an Anthropic or
  OpenAI key) instead of a full Azure setup.
> Tell me which and I'll wire it up.

### 5. 👤 Create YOUR Slack app
- https://api.slack.com/apps → **Create New App** → **From manifest**.
- I'll generate a production manifest pointing at your Vercel URL (after step 6).
- Copy: `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, client ID
  (`NEXT_PUBLIC_SLACK_CLIENT_ID`), app ID.

### 6. 👤 Deploy to Vercel
- Create a free Vercel account, **Import** your GitHub fork.
- It auto-detects Next.js. First deploy gives you `clarity-<you>.vercel.app`.
- That URL becomes `NEXT_PUBLIC_BETTER_AUTH_URL` and the base for
  `SLACK_REDIRECT_URI` (`https://clarity-<you>.vercel.app/api/auth/slack/callback`).

### 7. 👤 Set env vars in Vercel
Add every "own now" key from the table (I'll give you the exact list as a
`.env.production.example`). Generate `BETTER_AUTH_SECRET` with
`openssl rand -base64 32`. **Do NOT set `DISABLE_QUOTA` or `SLACK_PINNED_TEAM_ID`
in production** — those are dev-only.

### 8. 🤖 Point Slack at the Vercel URL
Update the Slack app manifest's Redirect URL, slash command URLs, and Event
Subscription URL to your `vercel.app` domain. Re-push the manifest.

### 9. 👤 Smoke test
- Visit `clarity-<you>.vercel.app`, click Add to Slack, install on a test workspace.
- Post a flagged message → confirm coaching DM arrives.
- No ngrok anywhere. Laptop can be closed. It's live.

---

## Phase 2 — Productionize (later, when you have users)

- **Stripe**: create account, products/prices, webhook → enables paid Pro.
- **Custom domain**: buy one, point it at Vercel (replaces the `.vercel.app` URL).
- **PostHog / Resend / Google login**: add if/when you want analytics, email, web login.
- **Docs**: replace the Mintlify proxy (currently shows "Mint Starter Kit") with
  in-app docs so there's no external dependency. (I can do this as a code change.)
- **Rotate every secret** so none of Devesh's keys remain in your deploy.

---

## What I (Claude) can do for you in the repo right now
- ✅ Fixed: landing page Free-tier number (was wrongly "20", now "5").
- Generate `.env.production.example` (exact var list for Vercel).
- Generate the production Slack manifest (once you have the Vercel URL).
- Switch the LLM provider to a single-key setup (step 4b) if you choose it.
- Convert docs from the Mintlify proxy to in-app pages (fixes the branding).
- Fix doc domain references once you know your final URL.

The account-creation steps (👤) need your logins — I can't do those for you, but
I'll walk you through each one when you're ready.
