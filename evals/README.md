# Clarity Evals — Dataset Generation & Training Loop

Generates synthetic Slack messages and runs them through Clarity's AI to measure and improve flag accuracy.

## Architecture

```
generate.py                         train.py
┌──────────────────────┐            ┌──────────────────────────────────┐
│ Step 1: Scenarios     │            │ Step 1: Evaluate (20 concurrent) │
│   100 rich stories    │            │   POST /api/evaluate per message │
│                       │            │                                  │
│ Step 2: Messages      │     ──►    │ Step 2: Score (math metrics)     │
│   500 messages with   │            │   Precision, recall, pass rates  │
│   context + ground    │            │                                  │
│   truth flags         │            │ Step 3: LLM Judge (failures)     │
└──────────────────────┘            │ Step 4: Error Taxonomy            │
                                    │ Step 5: Prompt Optimizer          │
                                    │ Step 6: Loop with new prompt      │
                                    └──────────────────────────────────┘
```

## Quick Start

### 1. Setup

```bash
cd evals
poetry install
```

Create `.env` in the `evals/` folder:

```
OPENAI_API_KEY=sk-your-key-here
```

### 2. Generate Data

```bash
# Generate everything (scenarios first, then messages)
poetry run python generate.py --step all

# Or run steps individually:
poetry run python generate.py --step scenarios   # Generate 100 scenarios
poetry run python generate.py --step messages    # Generate 500 messages (needs scenarios)
```

### 3. Run Training Loop

**Requires the Next.js dev server running** (`npm run dev` in the project root).

```bash
# Single evaluation pass (no optimization)
poetry run python train.py --step evaluate

# Full training loop (evaluate → judge → optimize → repeat)
poetry run python train.py --step full

# Set max iterations
poetry run python train.py --iterations 3
```

## Data Format

### Scenarios (`data/generate/scenarios.json`)

```json
{
    "id": 1,
    "scenario": "A 15-person remote-first SaaS startup. In #engineering, a senior backend engineer is reviewing a PR from a junior developer...",
    "workspace_type": "remote-first company",
    "channel": "#engineering",
    "participants": "Senior engineer reviewing junior's PR"
}
```

### Dataset (`data/generate/dataset.json`)

```json
{
    "id": 1,
    "scenario": "A 15-person remote-first SaaS startup...",
    "channel": "#engineering",
    "case_type": "true_positive",
    "category": "passive-aggressive",
    "message": "Thanks for finally doing that",
    "user": "jordan",
    "context": [
        {"text": "Can someone review my PR?", "user": "alex"},
        {"text": "I'll take a look after standup", "user": "jordan"}
    ],
    "ground_truth_flags": ["Passive-Aggressive"]
}
```

### Case Types

| Type | % | Description |
|------|---|-------------|
| `true_positive` | 40% | Messages that violate flags (passive-aggressive, condescending, dismissive, etc.) |
| `true_negative` | 30% | Tricky clean messages (direct-but-not-rude, dry-humor, cultural-idiom, etc.) |
| `context_dependent` | 20% | Same message text, different context = different label |
| `formality_mismatch` | 10% | Same message, casual channel = fine, formal channel = flagged |

### 7 Coaching Flags

| Flag | Description |
|------|-------------|
| Vagueness | Unclear or imprecise requests lacking specific details |
| Non-Objective | Personal opinions presented as facts without evidence |
| Circular | Repeating the same point without adding new information |
| Rudeness | Openly hostile, disrespectful, or demeaning language |
| Passive-Aggressive | Indirect negativity through sarcasm or veiled digs |
| Fake | Insincere or performative communication |
| One-Liner | Responses too brief to engage with what was asked |

## Training Output

Each run saves to `data/train/run_N/`:

| File | Contents |
|------|----------|
| `results.json` | Per-message predictions with pass/fail |
| `metrics.json` | Aggregate pass rates, per-flag precision/recall, FP rate |
| `failures.json` | LLM judge analysis of each failure |
| `taxonomy.json` | Clustered error patterns with counts and fix directions |
| `prompt.txt` | The prompt used (default on run 1, optimized on run 2+) |

## Config

All config in `config/generate.py` and `config/train.py`.

| Variable | Default | Description |
|----------|---------|-------------|
| `SEED` | `77` | Change for different data |
| `MODEL` | `gpt-5.2` | Model for data generation |
| `TOTAL_MESSAGES` | `500` | Total messages to generate |
| `SCENARIOS_COUNT` | `100` | Number of scenarios to generate |
| `API_URL` | `localhost:3000` | Evaluate API endpoint |
| `CONCURRENCY` | `20` | Parallel requests to API |
| `MAX_ITERATIONS` | `5` | Max training loop iterations |
| `JUDGE_MODEL` | `gpt-5.2` | Model for judging (different from flagger) |

## Hold-Out Hard Set

Place hand-curated cases in `data/generate/hard_set.json` (same format as `dataset.json`). These are scored separately and never used for prompt optimization — they anchor your evaluation to human judgment.
