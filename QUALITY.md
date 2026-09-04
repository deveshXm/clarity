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
| **Evals** | `npm run evals:all` (flagging, rephrase, style, digest), `scenarios` | LLM keys + `LANGWATCH_API_KEY` | ~10 min | real money |
| **Production** | PostHog + LangWatch traces | shipped users | continuous | free |

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

Every suite is a **LangWatch experiment**: one run per invocation, one row per
gold case, every metric logged per row so the UI can show which case moved and
why. The gold datasets live in `src/evals/langwatch/datasets/` (the source of
truth — `npm run evals:datasets` mirrors them to LangWatch so they can be
browsed, annotated, and grown from real traces). The suites themselves are in
`src/evals/langwatch/*.experiment.ts`.

Two kinds of metric, kept deliberately separate:

- **Objective** — computed in code, no judge: re-run the classifier on a rewrite,
  match a quote back to the corpus, re-score a suggestion through the product's
  own scorer. These cannot drift with a judge prompt.
- **Judged** — an independent Azure model (`src/lib/evals/harness.ts`) that
  bypasses Portkey on purpose, so a gateway-level regression cannot move the
  system under test and its grader together.

### `evals:flagging` — does Clarity make the right call?

47 hand-labelled Slack messages across 11 workspace archetypes: 24 that should
be flagged, 18 hard negatives (blunt, urgent, terse — but fine), 5 that must trip
the harmful gate. No judge at all.

| Metric | Rows | What it pins |
|---|---|---|
| `case_correct` | all | The headline: right decision for this case type |
| `harmful_gate_correct` | all | harmful ⇔ expected harmful — the safety property |
| `expected_flag_hit` | positives, harmful | At least one expected flag fired |
| `clean_message_untouched` | hard negatives | No flag, not harmful — the over-flagging rate |
| `rephrase_offered` | positives | A rewrite was produced |
| `harmful_blocks_rephrase` | harmful | No rewrite was produced |
| `flag_precision` | rows with flags | Share of fired flags that were expected |

The terminal also prints per-flag precision/recall/F1 and per-workspace accuracy.
Gates: overall accuracy ≥ `SIM_MIN_ACCURACY` (0.85), harmful recall = 100%.

### `evals:rephrase` — is the rewrite worth sending?

12 flagged messages, each with a `mustRetain` line spelling out the substance
the rewrite has to keep. That line is what turns "force retained" from taste
into a checkable claim.

| Metric | How | Why it's separate |
|---|---|---|
| `flag_cleared` | Re-run the classifier on the rewrite | Objective — cannot drift with judge prompts |
| `intent_preserved` | Independent judge | The failure users notice fastest |
| `no_fabrication` | Independent judge | The failure that gets someone in trouble at work |
| `force_retained` | Judge, against `mustRetain` | The one a politeness-optimizer fails |
| `style_adherence` | Judge, 0-100 | Only meaningful when a target style is set |
| `length_ratio` | rewrite ÷ original | A 4x rewrite is not a Slack message |

**Force retained is the dimension that matters most and is easiest to miss.**
A rewriter that turns *"This is broken, fix it today"* into *"No rush, whenever
you get a chance!"* scores beautifully on politeness and has destroyed the
message.

### `evals:style` — persona × target: is the score honest, is the advice good?

15 rows. Each is a corpus from one kind of writer (a hedger, a terse exec, a
vibes-only analyst…) scored against a target style, with the band the 0-100
adherence score must land in. On/off pairs for the same target let the suite
check the scorer *separates* them, not just that it agrees with a judge.

| Metric | What it pins |
|---|---|
| `adherence_score` | The score itself (mean of two runs), labelled by expected band |
| `band_correct` | Inside the expected high / mid / low range |
| `run_spread` | Two runs on the same corpus must agree within 20 points |
| `judge_gap` | Within 25 points of an independent judge |
| `discrimination` (suite) | On-style mean minus off-style mean ≥ 20 per target |
| `deviation_quote_fidelity` | Quoted deviations trace back to a real message |
| `suggestion_moves_on_target` | The rewrite re-scores higher against the same target — the product must agree its own advice is an improvement |
| `suggestion_preserves_intent` | Judge: restyling toward "warm" must not quietly delete the objection |
| `strengths_grounded` | Strengths quote the corpus, not generic praise |

A miscalibrated score is annoying. A confident, specific, wrong suggestion is
worse, because the user sends it.

### `evals:digest` — does "how you come across" describe *this* person?

5 personas with an independently-known truth, including a deliberately poor
communicator (flattery check) and a near-empty corpus (honesty check).

| Metric | How |
|---|---|
| `quote_fidelity` | Every quoted example matched back to a real message. Objective. Gated hardest (95%). |
| `distinctive` | Judge is given the digest and *two* corpora and must say which it describes |
| `trait_groundedness` | Judge, against the messages |
| `summary_accurate` | Judge, against the known truth |
| `not_flattering` | Only on the poor communicator; gated at 100% |
| `thin_corpus_acknowledged` | A near-empty corpus must be reported as such, not confabulated |

**Distinctiveness is the sharpest test.** A digest a judge cannot match back to
its own author is horoscope text — fluent, agreeable, and worthless. That
failure is invisible to any metric that reads one output at a time.

### Reading a run

Each script prints a scorecard and the link to the run in LangWatch, then applies
its gates and sets the exit code. Two different verdicts, on purpose:

- **LangWatch's run status** is FAILED if *any* row failed *any* metric. Use it to
  find the rows to look at.
- **The gate** (exit code) is the release decision: loose thresholds that only
  trip on "clearly broken", because a gate tight enough to catch every borderline
  case goes red on sampling noise and gets ignored.

Triage a red run with the CLI: `langwatch experiment results clarity-rephrase --filter failed -o json`.

---

## Observability: where the results go

**LangWatch, and only LangWatch.** Experiments (the suites above), scenarios
(`npm run scenarios`), and datasets all live in the same project, so a prompt
change can be read as "this metric moved on these rows" instead of a number
scrolling past in a terminal. Set `LANGWATCH_API_KEY` in `.env.local`; without it
the suites refuse to start rather than silently running blind.

The judge runs on your own Azure deployment. LangWatch's built-in LLM evaluators
(`langevals/llm_boolean` and friends) would need a model provider configured on
the platform (`langwatch model-provider set azure`) — a reasonable next step once
you want judges editable in the UI, not a requirement.

**Don't skip production.** Every offline eval is a proxy. The real signal is
already being collected: **Replace clicked vs. "Didn't like it" clicked** is
direct human judgment on rephrase quality at a volume no eval set will reach.
Wiring that acceptance rate into a dashboard, per flag, is the highest-value
observability work available. It also validates the evals: if `flag_cleared`
improves and the accept rate doesn't move, the eval is measuring the wrong thing.

---

## Suggested cadence

| When | Run |
|---|---|
| Every commit / CI | `npm run test:unit`, `npm run lint`, `npx tsc --noEmit` |
| Every PR | the above + `npm run build` |
| Before merge to `main` | integration checks against a dev server (`check:e2e` once merged) |
| Any prompt or model change | `npm run evals:all` + `scenarios` — **non-negotiable**; this is the only thing standing between a prompt tweak and a silent quality regression |
| Weekly | full suite; compare runs in LangWatch and watch the trend rather than the absolute number |
| Continuously | rephrase accept rate in PostHog |

---

## Adding a case

Every eval reads from a typed dataset in `src/evals/langwatch/datasets/` — no
fixtures to hunt for. Edit it, then `npm run evals:datasets` to mirror it to LangWatch. When a user reports a bad rephrase or a wrong digest, **add it as a
case before fixing it.** That's what turns a one-off bug report into a permanent
regression net, and it's how the datasets should grow: from reality, not from
imagination.

For `evals:rephrase`, the `mustRetain` field is the important one. Write down
the substance the rewrite has to preserve, in plain language. That's what makes
"force retained" objective instead of a matter of taste.
