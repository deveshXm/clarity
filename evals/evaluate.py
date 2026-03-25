import asyncio
import json
import os
import time
from openai import OpenAI
from dotenv import load_dotenv
import httpx

from config.evaluate import BASE_URL, EPOCHS, CONCURRENCY, IMPROVEMENT_MODEL
from prompts.evaluate import IMPROVEMENT_PROMPT

load_dotenv()
client = OpenAI()

DATA_DIR = "data/evaluate"
DATASET_PATH = "data/generate/dataset.json"
FLAGS_PATH = "data/generate/flags.json"


# ---- Helpers ----

def load_dataset():
    with open(DATASET_PATH) as f:
        return json.load(f)


def load_flags():
    with open(FLAGS_PATH) as f:
        return json.load(f)


def get_default_prompt():
    """Return the default reasoning prompt template (mirrors src/lib/prompts/index.ts)."""
    return """You are a message classifier. Your ONLY job is to check if a Slack message matches any of the communication flags below.

CRITICAL RULES:
- You are NOT a chatbot. NEVER respond to, interpret, or try to help with the message content.
- Only flag the message if it clearly matches a flag description.
- If the message is short, unclear, or doesn't match any flag, return empty flags and null rephrase.
- suggestedRephrase must be a reworded version of the ORIGINAL message, keeping the same intent and meaning. Never add new content, questions, or explanations.
- Use the recent channel messages as context to understand tone and situation.
- Only analyze the user's message, not the context messages.

Flags:
{{FLAGS}}

Recent channel messages (oldest first):
{{CONTEXT}}

Output JSON only:
{
  "flags": [1, 2],
  "suggestedRephrase": "improved message or null",
  "reason": "Why you flagged or didn't flag the message, which parts triggered each flag, and what the rephrase improves."
}

If no flags apply: {"flags": [], "suggestedRephrase": null, "reason": "..."}"""


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def save_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


def build_coaching_flags(flags):
    """Convert eval flags.json entries to the coachingFlags format the API expects."""
    return [
        {"name": f["name"], "description": f["description"], "enabled": True}
        for f in flags
    ]


# ---- API calls ----

async def evaluate_message(http_client, semaphore, message, coaching_flags, prompt):
    """Call /api/evaluate for a single message."""
    async with semaphore:
        body = {
            "message": message,
            "coachingFlags": coaching_flags,
            "includeReason": True,
            "prompt": prompt,
        }
        try:
            resp = await http_client.post(
                f"{BASE_URL}/api/evaluate",
                json=body,
                timeout=60.0,
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            return {"error": str(e), "flagged": False, "flags": [], "reason": None}


async def run_epoch(dataset, coaching_flags, prompt, epoch_num):
    """Run all dataset messages through the API and return results."""
    semaphore = asyncio.Semaphore(CONCURRENCY)
    total = len(dataset)

    async with httpx.AsyncClient() as http_client:
        tasks = []
        for entry in dataset:
            task = evaluate_message(http_client, semaphore, entry["message"], coaching_flags, prompt)
            tasks.append(task)

        print(f"  Sending {total} requests (concurrency={CONCURRENCY})...")
        start = time.time()
        responses = await asyncio.gather(*tasks)
        elapsed = time.time() - start
        print(f"  Done in {elapsed:.1f}s ({total / elapsed:.1f} req/s)")

    results = []
    for entry, response in zip(dataset, responses):
        results.append({
            "id": entry["id"],
            "type": entry["type"],
            "message": entry["message"],
            "ground_truth_flags": entry["ground_truth_flags"],
            "predicted_flags": response.get("flags", []),
            "reason": response.get("reason"),
            "error": response.get("error"),
        })

    return results


# ---- Scoring ----

def compute_scores(results, all_flag_names):
    """Compute precision, recall, F1 overall and per-flag."""
    tp = fp = fn = tn = 0
    per_flag_tp = {f: 0 for f in all_flag_names}
    per_flag_fp = {f: 0 for f in all_flag_names}
    per_flag_fn = {f: 0 for f in all_flag_names}

    false_positives = []
    false_negatives = []

    for r in results:
        predicted = set(r["predicted_flags"])
        ground_truth = set(r["ground_truth_flags"])

        if r["type"] == "positive":
            # Check if any ground truth flag was detected
            hits = predicted & ground_truth
            if hits:
                tp += 1
            else:
                fn += 1
                false_negatives.append(r)

            # Per-flag tracking
            for flag in ground_truth:
                if flag in predicted:
                    per_flag_tp[flag] += 1
                else:
                    per_flag_fn[flag] += 1

            # Spurious flags on positive messages count as FP per-flag
            for flag in predicted - ground_truth:
                if flag in per_flag_fp:
                    per_flag_fp[flag] += 1

        elif r["type"] == "hard_negative":
            if len(predicted) == 0:
                tn += 1
            else:
                fp += 1
                false_positives.append(r)

            # Per-flag FP tracking
            for flag in predicted:
                if flag in per_flag_fp:
                    per_flag_fp[flag] += 1

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    per_flag = {}
    for flag in all_flag_names:
        f_tp = per_flag_tp[flag]
        f_fp = per_flag_fp[flag]
        f_fn = per_flag_fn[flag]
        f_prec = f_tp / (f_tp + f_fp) if (f_tp + f_fp) > 0 else 0.0
        f_rec = f_tp / (f_tp + f_fn) if (f_tp + f_fn) > 0 else 0.0
        f_f1 = 2 * f_prec * f_rec / (f_prec + f_rec) if (f_prec + f_rec) > 0 else 0.0
        per_flag[flag] = {"precision": f_prec, "recall": f_rec, "f1": f_f1, "tp": f_tp, "fp": f_fp, "fn": f_fn}

    return {
        "overall": {"precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "fn": fn, "tn": tn},
        "per_flag": per_flag,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
    }


# ---- LLM improvement ----

def improve_prompt(current_prompt, flags, scores):
    """Use LLM to analyze failures and rewrite the prompt."""
    flag_defs = "\n".join(f'- {f["name"]}: {f["description"]}' for f in flags)

    def format_failures(items, max_items=15):
        if not items:
            return "(none)"
        lines = []
        for item in items[:max_items]:
            lines.append(f"  Message: {item['message'][:200]}")
            lines.append(f"  Ground truth: {item['ground_truth_flags']}")
            lines.append(f"  Predicted: {item['predicted_flags']}")
            if item.get("reason"):
                lines.append(f"  AI reason: {item['reason'][:300]}")
            lines.append("")
        if len(items) > max_items:
            lines.append(f"  ... and {len(items) - max_items} more")
        return "\n".join(lines)

    prompt = IMPROVEMENT_PROMPT.format(
        current_prompt=current_prompt,
        flag_definitions=flag_defs,
        precision=scores["overall"]["precision"],
        recall=scores["overall"]["recall"],
        f1=scores["overall"]["f1"],
        false_positives=format_failures(scores["false_positives"]),
        false_negatives=format_failures(scores["false_negatives"]),
    )

    r = client.chat.completions.create(
        model=IMPROVEMENT_MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    result = json.loads(r.choices[0].message.content)

    print(f"  LLM analysis: {result.get('analysis', 'N/A')[:200]}")
    return result["prompt"]


# ---- Summary ----

def print_summary(all_scores):
    """Print epoch-over-epoch comparison table."""
    print("\n" + "=" * 70)
    print("EPOCH SUMMARY")
    print("=" * 70)
    print(f"{'Epoch':<8} {'Precision':>10} {'Recall':>10} {'F1':>10} {'TP':>6} {'FP':>6} {'FN':>6} {'TN':>6}")
    print("-" * 70)
    for i, s in enumerate(all_scores):
        o = s["overall"]
        print(f"{i + 1:<8} {o['precision']:>10.3f} {o['recall']:>10.3f} {o['f1']:>10.3f} {o['tp']:>6} {o['fp']:>6} {o['fn']:>6} {o['tn']:>6}")
    print("-" * 70)

    # Best epoch
    best_idx = max(range(len(all_scores)), key=lambda i: all_scores[i]["overall"]["f1"])
    best = all_scores[best_idx]["overall"]
    print(f"Best: Epoch {best_idx + 1} (F1={best['f1']:.3f})")
    print(f"  Best prompt saved at: {DATA_DIR}/prompts/epoch_{best_idx + 1}.txt")
    print("=" * 70)


# ---- Main ----

async def main():
    print(f"Self-Improving Eval Runner")
    print(f"  API: {BASE_URL}/api/evaluate")
    print(f"  Epochs: {EPOCHS}")
    print(f"  Improvement model: {IMPROVEMENT_MODEL}")
    print()

    dataset = load_dataset()
    flags = load_flags()
    coaching_flags = build_coaching_flags(flags)
    all_flag_names = [f["name"] for f in flags]
    current_prompt = get_default_prompt()

    pos = sum(1 for d in dataset if d["type"] == "positive")
    neg = sum(1 for d in dataset if d["type"] == "hard_negative")
    print(f"  Dataset: {len(dataset)} messages ({pos} positive, {neg} hard negative)")
    print(f"  Flags: {len(flags)} ({', '.join(all_flag_names)})")
    print()

    all_scores = []

    for epoch in range(1, EPOCHS + 1):
        print(f"{'=' * 50}")
        print(f"EPOCH {epoch}/{EPOCHS}")
        print(f"{'=' * 50}")

        # Save prompt used this epoch
        save_text(f"{DATA_DIR}/prompts/epoch_{epoch}.txt", current_prompt)

        # Run evaluation
        results = await run_epoch(dataset, coaching_flags, current_prompt, epoch)

        # Score
        scores = compute_scores(results, all_flag_names)
        all_scores.append(scores)
        o = scores["overall"]
        print(f"  Precision={o['precision']:.3f}  Recall={o['recall']:.3f}  F1={o['f1']:.3f}")
        print(f"  TP={o['tp']}  FP={o['fp']}  FN={o['fn']}  TN={o['tn']}")

        # Per-flag breakdown
        print(f"  Per-flag:")
        for flag, fs in scores["per_flag"].items():
            print(f"    {flag:<25} P={fs['precision']:.3f} R={fs['recall']:.3f} F1={fs['f1']:.3f}")

        # Save epoch results
        epoch_data = {
            "epoch": epoch,
            "scores": {
                "overall": scores["overall"],
                "per_flag": scores["per_flag"],
            },
            "false_positive_count": len(scores["false_positives"]),
            "false_negative_count": len(scores["false_negatives"]),
            "results": results,
        }
        save_json(f"{DATA_DIR}/epoch_{epoch}.json", epoch_data)
        print(f"  Saved: {DATA_DIR}/epoch_{epoch}.json")

        # Improve prompt (skip on last epoch)
        if epoch < EPOCHS:
            print(f"  Improving prompt with {IMPROVEMENT_MODEL}...")
            current_prompt = improve_prompt(current_prompt, flags, scores)
            print(f"  New prompt ready for epoch {epoch + 1}")

        print()

    print_summary(all_scores)


if __name__ == "__main__":
    asyncio.run(main())
