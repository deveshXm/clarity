# Testing, evals, and observability

How we know Clarity is working — and specifically, how we know the three things
users actually judge it on are working:

1. **Rephrases** — when we flag a message and offer a rewrite, is the rewrite
   worth sending?
2. **Assessments** — does the weekly digest describe how you actually come
   across, or could it have been written about anyone?
3. **Assessments vs. your target** — when you set a style goal, is the adherence
   score honest and is the suggested rewrite actually closer to the goal?

---

## The layers

Four layers, ordered by how fast and how cheap they are. Each catches something
the layer below it structurally cannot.

| Layer | Command | Needs | Runtime | Cost |
|---|---|---|---|---|
| **Unit** | `npm run test:unit` | nothing | ~1s | free |
| **Integration** | `npm run test:slack:events`, `test:slack:interactive`, `test:stripe:webhooks` | dev server + `.env.local` | ~1–2 min | pennies |
| **Evals** | `npm run evals:quality`, `evals:sim`, `scenarios` | LLM keys | ~3–8 min | real money |
| **Production** | PostHog | shipped users | continuous | free |

### Unit — runs on every commit

No network, no model, no database, no credentials. This is the only layer fast
and deterministic enough to gate every push, so anything that *can* live here
should. Currently pins the behaviours behind the launch-blocker fixes: workspace
admin retention, thread-scoped ephemerals, the connect-to-replace fallback, and
the quote-matching primitive the digest evals depend on.

When something breaks in production, the question to ask is "could this have
been a unit test?" — and if extracting a pure function would have made it one,
extract it.

### Integration — runs before merge

Drives the real HTTP routes with real signed Slack payloads against a real
database. No Slack workspace needed: requests are HMAC-signed exactly as Slack
signs them, and `test-slack-interactive.ts` stands up a throwaway local server
to capture what the route posts back to `response_url`.

This is how the button paths get tested at all — a Replace click by a teammate
with no user token is nearly impossible to exercise by hand, because it needs a
second Slack account that has never authorized Clarity.

### Evals — runs before release, and on any prompt change

These hit a live model, so they cost money and they are not deterministic. Treat
them as instruments, not as pass/fail tests: read the scorecard, and let the gate
catch only "clearly broken."

Every gate is deliberately loose. A gate tight enough to catch every borderline
case goes red on sampling noise, and a suite that cries wolf gets ignored — at
which point it is worse than no suite, because it provides false assurance.

### Production — the only layer measuring reality

Every offline eval is a proxy. The real signal is already being collected:
**Replace clicked vs. "Didn't like it" clicked** is direct human judgment on
rephrase quality, at a volume no eval set will ever reach.

Wiring that acceptance rate into a dashboard and watching it per flag is the
highest-value observability work available, and it costs nothing new to collect.
It also validates the evals themselves: if `evals:rephrase` improves and the
accept rate doesn't move, the eval is measuring the wrong thing.

---

## What each eval measures

### `evals:rephrase` — rephrase quality

A rephrase fails in five distinct ways, and they trade off against each other,
so they are scored separately rather than as one number:

| Dimension | How | Why it's separate |
|---|---|---|
| **Flag cleared** | Re-run the classifier on the rewrite | Objective, no judge — cannot drift with judge prompts |
| **Intent preserved** | Independent judge | The failure users notice fastest |
| **No fabrication** | Independent judge | The failure that gets someone in real trouble at work |
| **Force retained** | Independent judge, against a per-case "required substance" | The one a politeness-optimizer fails |
| **Style adherence** | Independent judge | Only meaningful when a target is set |

**Force retained is the dimension that matters most and is easiest to miss.**
A rewriter that turns *"This is broken, fix it today"* into *"No rush, whenever
you get a chance!"* scores beautifully on politeness and has destroyed the
message. If you only measure niceness, you optimize straight into this failure.

### `evals:style:baseline` — "how you come across"

| Dimension | How |
|---|---|
| **Quote fidelity** | Every quote is matched back to a real message. Objective. |
| **Distinctive** | A judge is given one assessment and *two* corpora and must say which it describes |
| **Trait groundedness** | Judge, against the messages |
| **Not flattering** | Run against a deliberately poor communicator |
| **Thin-corpus honesty** | A near-empty corpus must be reported as such, not confabulated |

**Distinctiveness is the sharpest test here.** A digest that a judge cannot match
back to its own author is horoscope text — fluent, agreeable, and worthless.
That failure is invisible to any metric that only reads one output at a time,
which is why the test needs two corpora.

Quote fidelity is gated hardest (95%). Being shown words attributed to you that
you never wrote is the one failure a user cannot forgive, and it is measured
objectively, so there is no judge noise to excuse it.

### `evals:style:suggestions` — assessments vs. your target

Complements `evals:style:deviation` (which asks whether the 0–100 score is
calibrated) by asking whether the advice is any good:

- quoted deviations trace back to real messages
- the suggested rewrite **re-scores higher against the same target** — the
  product must agree its own advice is an improvement
- the rewrite still says what the original said. Restyling toward "warm" must
  not quietly delete the objection.

A miscalibrated score is annoying. A confident, specific, wrong suggestion is
worse, because the user sends it.

---

## Observability: where the results go

Suites never import a vendor SDK. They emit a run/case/summary shape to
`src/lib/evals/reporter.ts`, which fans out to whatever is configured. Adding or
swapping a platform is a change in that one file.

**JSONL is always on** — `evals/data/runs/<suite>-<timestamp>.jsonl`, no
credentials required, so CI and a laptop with no keys still produce a diffable
artifact and a history you own.

### Recommendation

**Langfuse as the eval and trace store.** Two reasons that actually matter here:

- **Self-hostable.** Eval inputs are real workplace messages. Every other option
  means shipping that content to a third party, which is a materially harder
  conversation with a security-conscious customer than "it runs in our VPC."
- **It has the API we're missing.** The comment in
  `evaluate-style-deviation.ts` notes the LangWatch TS SDK has no experiments
  API, which is why style runs never made it to a dashboard. Langfuse's TS SDK
  has datasets, runs, and scores, so results get a home instead of scrolling
  past in a terminal.

Enable by setting `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, and optionally
`LANGFUSE_BASEURL`. Absent those, nothing changes and JSONL keeps working.

There's a third benefit worth taking: **Langfuse prompt management would fix a
real bug class.** `MESSAGE_ANALYSIS_PROMPT` currently exists twice — in
`src/lib/prompts/index.ts` and mirrored "byte-identical" into
`evals/generate_default.py`. Byte-identical-by-convention is a drift bug waiting
to happen, and when it drifts the eval silently starts grading a prompt that
isn't shipping. Versioned prompts fetched by both would remove the duplication
entirely.

### The others, honestly

| Platform | Keep it for | Why not as the primary |
|---|---|---|
| **LangWatch** | The scenario suite — its simulation framing is genuinely good and already working | TS SDK has no experiments API, so the numeric suites can't report to it |
| **Portkey** | Already the gateway; gives request-level logs, caching, and fallbacks for free | Strong at request tracing, not an eval-experiment store |
| **PostHog** | Already there; the right home for the accept/dismiss rate, which is the best quality signal that exists | Product analytics, not a trace or eval store |
| **Braintrust** | — | Best pure eval DX, TS-first, excellent run diffing. SaaS-only, which is the dealbreaker given the data |

Nothing needs to be ripped out. Each tool sits where it is strongest: Portkey on
the request path, LangWatch for scenarios, Langfuse for eval runs and traces,
PostHog for what real users do.

**Don't skip the last one.** It's tempting to invest in offline evals because
they're controllable, but the accept rate is the only number that reflects
whether any of this works for a real person.

---

## Suggested cadence

| When | Run |
|---|---|
| Every commit / CI | `npm run test:unit`, `npm run lint`, `npx tsc --noEmit` |
| Every PR | the above + `npm run build` |
| Before merge to `main` | integration checks against a dev server (`check:e2e` once merged) |
| Any prompt or model change | `npm run evals:quality` + `evals:sim` + `scenarios` — **non-negotiable**; this is the only thing standing between a prompt tweak and a silent quality regression |
| Weekly | full suite, record results, watch the trend rather than the absolute number |
| Continuously | rephrase accept rate in PostHog |

---

## Adding a case

Every eval reads from an inline dataset at the top of its script — no fixtures
to hunt for. When a user reports a bad rephrase or a wrong digest, **add it as a
case before fixing it.** That's what turns a one-off bug report into a permanent
regression net, and it's how the datasets should grow: from reality, not from
imagination.

For `evals:rephrase`, the `mustRetain` field is the important one. Write down
the substance the rewrite has to preserve, in plain language. That's what makes
"force retained" objective instead of a matter of taste.
