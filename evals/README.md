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

```bash
# Generate everything (flags first, then messages)
poetry run python generate.py --step all

# Or run steps individually:
poetry run python generate.py --step flags      # Only generate flags
poetry run python generate.py --step messages    # Only generate messages (needs flags first)
```

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

