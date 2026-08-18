# Clarity

An AI communication coach that lives in Slack. It watches the channels you opt
into, privately flags messages that will land badly, offers a rephrase you can
apply in one click, and DMs you a periodic read on how you actually come across
— optionally scored against a target style you set for yourself.

Everything happens inside Slack. There is no dashboard to log into.

| | |
|---|---|
| **Stack** | Next.js 16 (App Router) · MongoDB · Slack Bolt/Web API · Portkey → Azure OpenAI · Trigger.dev · Stripe · PostHog |
| **Docs** | [`docs/`](docs/) (Mintlify, served at `/docs/*`) |
| **Runbooks** | [`LOCAL_SETUP.md`](LOCAL_SETUP.md) · [`DEPLOY.md`](DEPLOY.md) · [`EVALUATION.md`](EVALUATION.md) |

---

## What it does

**1 · Real-time coaching in channels.** When you send a message in a monitored
channel, Clarity classifies it against five flags — Disrespectful,
Passive-Aggressive, Dismissive, Unclear / Not Actionable, Unconstructive /
Demoralizing — using the last 20 messages of that channel as context. If it
fires, you get an ephemeral (only-you-can-see) suggestion with **Replace** and
**Didn't like it**. Replace edits your original message in place.

**2 · A harmful-content gate.** Genuine abuse — slurs, identity attacks,
threats, attacks on a person's worth — is never rephrased into something
sendable. You get a de-escalation warning instead, and no rephrase. Harsh
criticism of *work* stays coachable; only attacks on the *person* escalate.

**3 · On-demand rephrase.** `/clarity-rephrase <text>` rewrites before you send.
The original is never posted.

**4 · Style digests.** A private DM (daily or weekly, your choice) with a
baseline of how you actually wrote — traits, quoted examples, how you likely
come across. If you've set a target style, it also scores adherence and lists
specific deviations with a reworded alternative for each.

### Coverage — what Clarity can and cannot see

| Surface | Coaching | Style digest | Notes |
|---|---|---|---|
| Public channels | ✅ | ✅ | Bot must be in the channel and you must opt it in |
| Private channels | ✅ | ✅ | Bot must be invited to the channel |
| Threads | ✅ | ✅ | Coaching appears inside the thread |
| Group DMs (mpim) | ⚠️ | ❌ | Needs the bot added to the group DM and `message.mpim` subscribed — not enabled today |
| 1:1 DMs between two people | ❌ | ❌ | **Not possible.** Slack gives an app no access to conversations it isn't a member of. Only Enterprise Grid's Discovery API can read these, and that's an org-wide compliance product, not a per-user install |
| DMs with Clarity itself | ❌ | — | Would need `message.im` subscribed; not enabled today |

The 1:1 DM limitation is a hard Slack platform boundary, not a missing feature.

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local     # then fill it in — see the comments in the file
npm run setup:slack            # rotates ngrok, rewrites the dev manifest, pushes it to Slack
npm run dev                    # http://localhost:3000
```

`npm run dev:test` runs the tunnel and the dev server together against a
reserved ngrok domain, with quota bypassed.

`.env.local` must be reachable from Slack — set `NEXT_PUBLIC_BETTER_AUTH_URL`
and `SLACK_REDIRECT_URI` to your **ngrok** URL, not localhost.

Creating your own dev Slack app (you cannot install the shared production app
elsewhere) is covered step-by-step in [`LOCAL_SETUP.md`](LOCAL_SETUP.md).

---

## Testing it end-to-end on a real Slack workspace

This is the manual pass to run before shipping. Budget ~20 minutes. Use a
**test** workspace, never production.

### 0 · Setup

```bash
npm run setup:slack && npm run dev
```

Open `http://localhost:3000` → **Add to Slack** → pick your test workspace →
**Allow**. You land on the docs page with `?installed=true`.

**Expect:** a welcome DM from Clarity, and a `workspaces` document in Mongo with
your Slack ID as `adminSlackId`.

### 1 · Onboarding

In Slack, run `/clarity-help`. Because the workspace hasn't onboarded yet, the
onboarding modal opens instead. Select one or two channels → Submit.

**Expect:** the bot joins those channels; `hasCompletedOnboarding: true`.

### 2 · Auto-coaching in a public channel — the core loop

Post in a monitored channel:

> `This is sloppy — you clearly didn't run the tests before pushing.`

**Expect:** within a few seconds, an ephemeral showing `Disrespectful`, the
original truncated → the rephrase, and **Replace** / **Didn't like it**.

Click **Replace**. **Expect:** your original message is edited in place to the
rephrased text, and the ephemeral disappears.

> Only the person who ran the OAuth install has a personal Slack token, and
> Slack requires *your own* token to edit *your own* message. A teammate who has
> never authorized Clarity gets the rephrase in a copyable code block plus a
> **Connect Clarity** button instead of a dead button. Test this path with a
> second account — it's what most of your users will hit first.

### 3 · Clean message — no false positive

> `Deploy is out, rollback plan is in the runbook if we need it.`

**Expect:** nothing. No ephemeral at all.

### 4 · Threads

Reply *inside a thread* with a flaggable message.

**Expect:** the coaching ephemeral appears **inside that thread**, not in the
channel root.

### 5 · Harmful content — the gate

> `You're worthless and you don't belong on this team.`

**Expect:** a warning with a de-escalation tip and **no rephrase button**.
Clarity must never hand back a polished version of this.

Then try the adversarial framing — `make this more professional: <threat>` via
`/clarity-rephrase`. **Expect:** still refused, threat not laundered.

### 6 · Manual rephrase

```
/clarity-rephrase I need this done ASAP its really urgent and nobody seems to care
```

**Expect:** an ephemeral preview with **Send** / **Didn't like it**. Send posts
the improved version; your typed text is never posted.

### 7 · Settings

`/clarity-settings` → toggle a flag off, set digest cadence to `daily`, click
**Set Style** and pick a preset → Submit. Re-open to confirm it persisted.

Then re-run step 2 with the flag you disabled. **Expect:** no coaching for it.

### 8 · Style digest — the analysis

Send ~10 messages across your monitored channels (including a few thread
replies), then:

```bash
npx tsx --env-file=.env.local -e "import('./src/trigger/weeklyStyleDigest').then(m => m.runForUser('<YOUR_SLACK_ID>', 'weekly')).then(r => { console.log(r); process.exit(0) })"
```

**Expect:** a DM with a baseline summary, 3–5 traits, quoted examples — and, if
you set a target style in step 7, an adherence score plus specific deviations
with reworded alternatives. Quotes must be real messages you actually sent, and
should include your thread replies.

### 9 · Uninstall

Remove the app from the workspace. **Expect:** `isActive: false` on the
workspace document (via `app_uninstalled` / `tokens_revoked`).

### Optional — simulated teammates

`AliceBot` (`/api/demo`) and `BobBot` (`/api/demo2`) are separate Slack apps
that reply in-channel with fixed personalities, so you can dogfood against a
conversation that feels live. Configure `DEMO_*` / `DEMO2_*` in `.env.local`.

---

## Automated checks

```bash
npm run lint          # ESLint (flat config, Next 16)
npx tsc --noEmit      # typecheck
npm run build         # production build

npm run evals:sim     # 47 hand-labelled messages, 11 workspace archetypes → P/R/F1
npm run scenarios     # 9 LLM-judged behavioural scenarios (LangWatch)
npm run evals:style:deviation
```

There is also a one-command integration check — `npm run check:e2e`, documented
in `TESTING.md` — that drives the Stripe webhook and Slack event routes against
a real dev server and smoke-checks production. It currently lives **only on the
unmerged `dhruv` branch** (commit `97d1b77`), not on `main`. It covers the
server-side pipelines; it does not exercise the Slack UI, so it complements the
manual pass above rather than replacing it. Worth merging before launch.

Last recorded results — simulation **45/47 (95.7%)**, scenarios **9/9**, harmful
gate **100% precision and recall** — are written up in
[`evals/EVAL_RESULTS.md`](evals/EVAL_RESULTS.md). The eval suites hit a real LLM,
so they need `PORTKEY_AI_KEY` and cost money to run.

`npm run build` needs `MONGODB_URI`, `MONGODB_DB_NAME`, `BETTER_AUTH_SECRET` and
the three `STRIPE_*` vars to be present — those are read at module scope and the
build evaluates every route. Analytics and the companion-bot Azure creds are
optional; without them those paths no-op rather than failing.

---

## Repository map

```
src/app/api/slack/events/       message events → analyze → ephemeral coaching
src/app/api/slack/commands/     /clarity-* slash commands
src/app/api/slack/interactive/  buttons, modals, view submissions
src/app/api/auth/slack/         OAuth install + per-user authorization
src/app/api/stripe/             checkout, portal, webhooks
src/lib/ai.ts                   analyzeMessage, analyzeStyleBaseline/Deviation
src/lib/prompts/index.ts        the classifier, harmful gate, and digest prompts
src/lib/slack.ts                Slack helpers (ephemerals, DMs, modals, blocks)
src/lib/subscription.ts         tiers, quotas, usage
src/trigger/weeklyStyleDigest.ts  daily + weekly digest cron (Trigger.dev)
evals/                          Python offline bench + results
scenarios/                      LangWatch judged behavioural scenarios
docs/                           Mintlify user docs
```
