# Clarity Evaluation - Synthetic Dataset Generator

Generates a synthetic dataset of Slack messages to test Clarity's communication coaching AI.

## How It Works
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                STEP 2: Generate Messages                  │
│                (--step messages)                          │
│                                                          │
│   Build matrix: every Scenario × every Flag              │
│   (e.g. "Code Review" × "Pushiness")                    │
│                 │                                        │
│                 ▼                                        │
│   For each pair, generate:                               │
│     • Positive — bad message that SHOULD be flagged      │
│     • Hard Negative — tricky clean message that          │
│       looks bad but should NOT be flagged                │
│                 │                                        │
│                 ▼                                        │
│   20% of positive messages get 2-3 flags instead of 1   │
│                 │                                        │
│                 ▼                                        │
│        Save dataset.json (~144 messages)                 │
└─────────────────────────────────────────────────────────┘
```
## Quick Start

### 1. Setup (one time)

```bash
cd evals
poetry install
```

Create a `.env` file in the `evals/` folder:

```
OPENAI_API_KEY=sk-your-key-here
```

### 2. Run

Two flag sources are supported:

```bash
# Option A — eval the default flags shipped to fresh-install users (4 flags).
# Synced from src/types/index.ts → DEFAULT_COACHING_FLAGS.
# This is what you usually want.
poetry run python generate_default.py

# Option B — derive flags from personas (9 flags).
# Useful as a research bench for discovering new flag candidates.
poetry run python generate.py --step all

# Or run the persona pipeline step by step:
poetry run python generate.py --step flags      # Only generate flags
poetry run python generate.py --step messages    # Only generate messages (needs flags first)
```

Both write to the same files (`data/generate/flags.json`, `data/generate/dataset.json`),
so `evaluate.py` works on whichever was generated last. Re-run the generator
when you want to switch flag sources.

For the style coach and digest feature, run the lightweight structural checks
from the repo root:

```bash
npm run evals:style
```

These checks are intentionally not a replacement for LangWatch scenario evals.
Use them as a fast local gate, then run the judge-evaluated scenario suite for
the coaching agent: see [`../scenarios`](../scenarios) (`npm run scenarios`).
That suite drives the real agent through realistic, LLM-judged conversations
(correct flagging, intent-preserving rephrases, harmful-content refusal, and
adversarial gate-evasion) and reports to LangWatch.

### Style-deviation calibration

The **style digest** (`analyzeStyleBaseline` / `analyzeStyleDeviation`) is batch,
not conversational, so it's evaluated as a calibration test rather than a
scenario:

```bash
npm run evals:style:deviation
```

`src/scripts/evaluate-style-deviation.ts` checks whether the adherence score
(0-100) is *correct or wildly off* across multiple target styles and workplace
registers, via four signals: **banding** (clearly on-style → high, off-style →
low), **discrimination** (on-style must outscore off-style per target),
**variance** (same input run twice → similar score), and **judge gap** (vs an
independent Azure LLM judge). Prints a scorecard, exits non-zero if calibration
is broken. The independent judge uses the Azure OpenAI client (same one the
companion bots use); the scorer under test runs through Clarity's Portkey stack.

Verified run (2026-05-31, 11 cases, gpt-5-mini judge): **band accuracy 100%
(11/11)**, mean |clarity − judge| = **7 pts**, max run-to-run spread **10**,
and **5/5 target styles cleanly separate on-style from off-style** (margins
69–89). On-style batches scored 84–97, off-style 8–20, mixed 65. Conclusion:
the deviation scores are well-calibrated, not wildly off.

### 3. Output

Results are saved in `data/generate/`:

| File | What's inside |
|------|--------------|
| `flags.json` | The coaching flags (e.g., "Pushiness", "Self-Deprecation") |
| `dataset.json` | The final dataset of test messages |

## Config Variables

All config lives in `config/generate.py`. Here's what each variable does:

| Variable | Default | What it controls |
|----------|---------|-----------------|
| `SEED` | `42` | Change this number to get a completely different dataset. Same number = same results. |
| `MODEL` | `gpt-5.2` | Which AI model generates the data |
| `PERSONAS` | 3 personas | Fictional workplace personalities used to brainstorm flags. Add more to get more diverse flags. |
| `SCENARIOS` | 4 scenarios | Workplace situations (e.g., "Code Review Dispute"). Messages are generated in these contexts. |
| `MAX_FLAGS_PER_PERSONA` | `3` | How many flags the AI creates per persona (before deduplication) |
| `MESSAGES_PER_FLAG_SCENARIO` | `2` | For each (Flag × Scenario) pair, generate this many positive + this many hard negatives |
| `MULTI_FLAG_PERCENT` | `20` | What % of positive messages should have 2-3 flags instead of 1 |

### How many messages will I get?

```
Total = Scenarios × Flags × MESSAGES_PER_FLAG_SCENARIO × 2

With defaults:  4 scenarios × ~9 flags × 2 per pair × 2 (positive + negative) = ~144 messages
```

## What's in the Dataset?

Each entry looks like this:

```json
{
  "id": 101,
  "type": "positive",
  "scenario": "Friday 5PM Deployment",
  "persona": "Direct CTO",
  "message": "Just ship it. I don't care about the tests.",
  "ground_truth_flags": ["Recklessness", "Dismissiveness"]
}
```

| Field | Meaning |
|-------|---------|
| `id` | Unique number for each test case |
| `type` | `"positive"` = bad message (SHOULD be flagged), `"hard_negative"` = tricky clean message (should NOT be flagged) |
| `scenario` | The workplace situation the message was written in |
| `persona` | The fictional personality who "wrote" the message |
| `message` | The actual Slack message to test |
| `ground_truth_flags` | The correct answer — which flags should be triggered (empty `[]` for clean messages) |

## Re-running

- **Want different data?** Change `SEED` in `config/generate.py` to any other number.
- **Want more variety?** Add more personas or scenarios to the config.
- **Want a bigger dataset?** Increase `MESSAGES_PER_FLAG_SCENARIO`.
- **Want to regenerate just flags?** Run `--step flags`. Then re-run `--step messages` to get messages based on the new flags.
