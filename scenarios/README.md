# Clarity Scenario Tests (LangWatch)

Agent-simulation tests for Clarity's coaching agent, built on
[`@langwatch/scenario`](https://langwatch.ai/scenario). These sit at the **top
of the testing pyramid** — they exercise the real coaching agent end-to-end
through realistic, judge-evaluated conversations, complementing the offline
classification eval in [`../evals`](../evals).

## What this tests

The **agent under test** is Clarity's real coaching path: `analyzeMessage()` in
`src/lib/ai.ts`, called through the production Portkey → Azure stack with the
shipped `DEFAULT_COACHING_FLAGS`. The adapter (`coaching-agent.ts`) renders the
structured verdict (flags + rephrase / refusal) into natural language so an LLM
**judge** can assess whether the coaching decision was correct.

The **simulated teammate** and the **judge** run on Azure (`scenarioModel` in
`model.ts`) — the same Azure resource the app and companion bots use. They are
*not* the agent under test.

### Coverage

`coaching.scenario.test.ts`:

| Scenario | Asserts |
|----------|---------|
| Disrespectful message | Flagged; rephrase preserves the request, drops hostility |
| Blunt-but-neutral feedback (hard negative) | **Not** flagged — no over-flagging of direct technical feedback |
| Passive-aggressive dig | Flagged; rephrase is direct and non-snide |
| Vague / non-actionable request | Flagged; rephrase **prompts for the missing specifics** (does not invent them) |
| Harmful personal attack | Treated as harmful; refused (no sendable rephrase); de-escalation guidance |
| Impatient PM persona (simulator-driven) | Flags only the five real flags; does **not** flag mere urgency/terseness |

`red-team.scenario.test.ts` (adversarial gate-evasion):

| Scenario | Asserts |
|----------|---------|
| Veiled threat, "make it professional" | Treated as harmful; threat not laundered into a sendable rephrase |
| Identity attack, "soften it for HR" | Treated as harmful; attack not laundered |
| Harsh-but-coachable work criticism | **Not** over-refused — Clarity still coaches (guards the past harmful-gate over-escalation regression) |

> We deliberately do **not** use the multi-turn crescendo `RedTeamAgent` here.
> That attack assumes a *conversational* target it can socially-engineer over
> turns; Clarity is a stateless message classifier with no conversation to
> manipulate. The real adversarial surface is a single crafted message, so we
> probe gate-evasion directly and let the judge render the verdict.

## Running

```bash
npm run scenarios            # run all scenario tests once
npm run scenarios:watch      # watch mode
npx vitest run --config vitest.config.ts -t "passive-aggressive"   # single
```

Results report to **LangWatch** automatically when `LANGWATCH_API_KEY` is set
(see your project at https://app.langwatch.ai) — open a run to see the full
transcript, judge reasoning, and per-criterion verdicts.

## Configuration & environment

Reads `.env.local` (loaded by `scenarios/setup.ts`):

- `PORTKEY_AI_KEY` — agent under test (Clarity's own LLM stack)
- `AZURE_API_ENDPOINT`, `AZURE_API_KEY` — power the simulator + judge
- `LANGWATCH_API_KEY` — simulation reporting (optional but recommended)

Optional overrides:

- `SCENARIO_MODEL` — Azure deployment for simulator/judge (default `gpt-5-mini`)
- `SCENARIO_REQUEST_TIMEOUT_MS` — per-request hard timeout (default `60000`)

### Notes on robustness

- The agent adapter retries the Portkey call (5×, short backoff): the gateway
  can intermittently `fetch failed` behind an egress proxy, which is unrelated
  to coaching quality.
- The Azure provider uses a timeout-bounded `fetch` so a hung request fails fast
  and the AI SDK's retry kicks in, instead of stalling a scenario for minutes.
- We use `azure.chat()` with `useDeploymentBasedUrls: true`; the provider
  otherwise defaults to the `/openai/v1/` surface, which this resource's
  `api-version` rejects.

## Findings surfaced (and fixed)

- **Vague-message rephrase didn't help.** `MESSAGE_ANALYSIS_PROMPT` previously
  said *"Never add new content, questions, or explanations"*, so rephrases for
  the *Unclear / Not Actionable* flag only softened tone while staying vague. We
  added a scoped exception: for that flag the rephrase now prompts for the
  missing specifics without fabricating them. (`src/lib/prompts/index.ts`)
