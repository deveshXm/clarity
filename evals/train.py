import json
import os
import asyncio
import argparse
import time
from openai import AsyncOpenAI
from dotenv import load_dotenv
import httpx

from config.generate import FLAGS
from config.train import (
    API_URL, CONCURRENCY, MAX_ITERATIONS, JUDGE_MODEL, IMPROVEMENT_THRESHOLD,
)
from prompts.train import JUDGE_PROMPT, TAXONOMY_PROMPT, OPTIMIZER_PROMPT

load_dotenv()
judge_client = AsyncOpenAI()
TRAIN_DIR = "data/train"
judge_semaphore = asyncio.Semaphore(CONCURRENCY)


async def judge_llm(prompt):
    async with judge_semaphore:
        r = await judge_client.chat.completions.create(
            model=JUDGE_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(r.choices[0].message.content)


def save_run(run_num, filename, data):
    run_dir = f"{TRAIN_DIR}/run_{run_num}"
    os.makedirs(run_dir, exist_ok=True)
    path = f"{run_dir}/{filename}"
    if isinstance(data, str):
        with open(path, "w") as f:
            f.write(data)
    else:
        with open(path, "w") as f:
            json.dump(data, f, indent=2)


def format_context_string(context):
    if not context:
        return "(no context)"
    return "\n".join(f'<{m["user"]}>: {m["text"]}' for m in context)


def add_synthetic_timestamps(context):
    """Add ts fields to context messages for the API (ordering matters, not actual time)."""
    base = 1700000000
    return [
        {"text": m["text"], "user": m["user"], "ts": str(base + i)}
        for i, m in enumerate(context)
    ]


# ---- Step 1: Evaluate ----

async def evaluate_single(client, entry, coaching_flags, custom_prompt, semaphore):
    async with semaphore:
        context_with_ts = add_synthetic_timestamps(entry.get("context", []))

        payload = {
            "message": entry["message"],
            "coachingFlags": coaching_flags,
            "context": context_with_ts,
            "includeReason": True,
        }
        if custom_prompt:
            payload["prompt"] = custom_prompt

        resp = await client.post(API_URL, json=payload, timeout=60.0)
        data = resp.json()

        if resp.status_code != 200:
            error_msg = data.get("error", f"HTTP {resp.status_code}")
            return {
                "id": entry["id"],
                "predicted_flags": [],
                "reason": "",
                "error": error_msg,
            }

        return {
            "id": entry["id"],
            "predicted_flags": data.get("flags", []),
            "reason": data.get("reason", ""),
            "error": None,
        }


async def evaluate_all(dataset, coaching_flags, custom_prompt=None):
    semaphore = asyncio.Semaphore(CONCURRENCY)
    async with httpx.AsyncClient() as client:
        tasks = [
            evaluate_single(client, entry, coaching_flags, custom_prompt, semaphore)
            for entry in dataset
        ]
        results = await asyncio.gather(*tasks)
    return {r["id"]: r for r in results}


# ---- Step 2: Score ----

def score(dataset, predictions):
    results = []
    per_flag_tp, per_flag_fp, per_flag_fn = {}, {}, {}
    by_case_type = {}

    for entry in dataset:
        entry_id = entry["id"]
        pred = predictions.get(entry_id, {})
        gt = set(entry.get("ground_truth_flags", []))
        pd_flags = set(pred.get("predicted_flags", []))

        passed = gt == pd_flags
        case_type = entry.get("case_type", "unknown")

        # Track per case type
        if case_type not in by_case_type:
            by_case_type[case_type] = {"total": 0, "passed": 0}
        by_case_type[case_type]["total"] += 1
        if passed:
            by_case_type[case_type]["passed"] += 1

        # Per-flag TP/FP/FN
        for flag in gt & pd_flags:
            per_flag_tp[flag] = per_flag_tp.get(flag, 0) + 1
        for flag in pd_flags - gt:
            per_flag_fp[flag] = per_flag_fp.get(flag, 0) + 1
        for flag in gt - pd_flags:
            per_flag_fn[flag] = per_flag_fn.get(flag, 0) + 1

        results.append({
            "id": entry_id,
            "case_type": case_type,
            "category": entry.get("category", ""),
            "message": entry["message"],
            "ground_truth_flags": list(gt),
            "predicted_flags": list(pd_flags),
            "reason": pred.get("reason", ""),
            "passed": passed,
            "error": pred.get("error"),
        })

    # Compute per-flag precision & recall
    all_flag_names = set(list(per_flag_tp) + list(per_flag_fp) + list(per_flag_fn))
    per_flag_metrics = {}
    for flag in sorted(all_flag_names):
        tp = per_flag_tp.get(flag, 0)
        fp = per_flag_fp.get(flag, 0)
        fn = per_flag_fn.get(flag, 0)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        per_flag_metrics[flag] = {"precision": round(precision, 3), "recall": round(recall, 3), "tp": tp, "fp": fp, "fn": fn}

    # False positive rate on true negatives
    tn_cases = [r for r in results if r["case_type"] == "true_negative"]
    tn_total = len(tn_cases)
    tn_fp = sum(1 for r in tn_cases if not r["passed"])

    total = len(results)
    total_passed = sum(1 for r in results if r["passed"])

    metrics = {
        "total": total,
        "passed": total_passed,
        "overall_pass_rate": round(100 * total_passed / total, 1) if total else 0,
        "by_case_type": {
            ct: {
                "total": v["total"],
                "passed": v["passed"],
                "pass_rate": round(100 * v["passed"] / v["total"], 1) if v["total"] else 0,
            }
            for ct, v in by_case_type.items()
        },
        "per_flag": per_flag_metrics,
        "false_positive_rate_on_negatives": round(100 * tn_fp / tn_total, 1) if tn_total else 0,
    }

    return results, metrics


def print_metrics(metrics, run_num):
    print(f"\n  Overall:        {metrics['passed']}/{metrics['total']} pass ({metrics['overall_pass_rate']}%)")
    for ct, v in metrics["by_case_type"].items():
        label = ct.replace("_", " ").title()
        print(f"  {label:20s} {v['passed']}/{v['total']} pass ({v['pass_rate']}%)")
    print(f"\n  FP rate on negatives: {metrics['false_positive_rate_on_negatives']}%")
    print(f"\n  Per-flag:")
    for flag, m in metrics["per_flag"].items():
        print(f"    {flag:22s} P: {m['precision']:.3f}  R: {m['recall']:.3f}  (TP:{m['tp']} FP:{m['fp']} FN:{m['fn']})")


# ---- Step 3: Judge (async, 20 concurrent) ----

async def judge_single(failure, dataset_by_id):
    entry = dataset_by_id[failure["id"]]
    context_str = format_context_string(entry.get("context", []))

    judgment = await judge_llm(JUDGE_PROMPT.format(
        scenario=entry.get("scenario", ""),
        channel=entry.get("channel", ""),
        context=context_str,
        message=failure["message"],
        ground_truth_flags=json.dumps(failure["ground_truth_flags"]),
        predicted_flags=json.dumps(failure["predicted_flags"]),
        reason=failure["reason"],
    ))
    judgment["id"] = failure["id"]
    judgment["message"] = failure["message"]
    judgment["ground_truth_flags"] = failure["ground_truth_flags"]
    judgment["predicted_flags"] = failure["predicted_flags"]
    return judgment


async def judge_failures(results, dataset_by_id):
    failures = [r for r in results if not r["passed"] and not r.get("error")]
    if not failures:
        return []

    print(f"\n  {len(failures)} failures -> judging ({CONCURRENCY} concurrent)...", end=" ", flush=True)
    tasks = [judge_single(f, dataset_by_id) for f in failures]
    judgments = await asyncio.gather(*tasks)
    print("done")
    return list(judgments)


# ---- Step 4: Taxonomy ----

async def build_taxonomy(judgments):
    if not judgments:
        return {"patterns": []}

    print(f"  Building error taxonomy from {len(judgments)} failures...", end=" ", flush=True)
    result = await judge_llm(TAXONOMY_PROMPT.format(
        failure_count=len(judgments),
        failures_json=json.dumps(judgments, indent=2),
    ))
    print("done")
    return result


def print_taxonomy(taxonomy):
    patterns = taxonomy.get("patterns", [])
    if not patterns:
        print("  No patterns found.")
        return
    print(f"\n  Error taxonomy ({len(patterns)} patterns):")
    for p in patterns:
        print(f"    - \"{p['pattern']}\" ({p['count']} cases)")
        if p.get("fix_direction"):
            print(f"      Fix: {p['fix_direction']}")


# ---- Step 5: Optimize ----

def get_default_prompt():
    """The production prompt with reasoning (used as baseline for run 1)."""
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


async def optimize_prompt(current_prompt, metrics, taxonomy, judgments, dataset_by_id):
    patterns = taxonomy.get("patterns", [])
    if not patterns:
        return current_prompt

    print(f"  Optimizing prompt...", end=" ", flush=True)

    # Build taxonomy summary
    taxonomy_summary = "\n".join(
        f'- "{p["pattern"]}" ({p["count"]} cases) — Fix: {p.get("fix_direction", "N/A")}'
        for p in patterns[:10]
    )

    # Build example failures for top patterns
    example_lines = []
    for p in patterns[:5]:
        for eid in p.get("example_ids", [])[:2]:
            j = next((j for j in judgments if j["id"] == eid), None)
            if j:
                example_lines.append(
                    f'Pattern: "{p["pattern"]}"\n'
                    f'  Message: "{j["message"]}"\n'
                    f'  Expected: {j["ground_truth_flags"]} | Predicted: {j["predicted_flags"]}\n'
                    f'  Why: {j.get("why", "N/A")}'
                )
    example_failures = "\n\n".join(example_lines) if example_lines else "(no examples)"

    # Get per-case-type rates
    ct = metrics.get("by_case_type", {})

    result = await judge_llm(OPTIMIZER_PROMPT.format(
        current_prompt=current_prompt,
        overall_pass_rate=metrics["overall_pass_rate"],
        tp_pass_rate=ct.get("true_positive", {}).get("pass_rate", 0),
        tn_pass_rate=ct.get("true_negative", {}).get("pass_rate", 0),
        ctx_pass_rate=ct.get("context_dependent", {}).get("pass_rate", 0),
        fmt_pass_rate=ct.get("formality_mismatch", {}).get("pass_rate", 0),
        total_failures=len(judgments),
        taxonomy_summary=taxonomy_summary,
        example_failures=example_failures,
    ))

    new_prompt = result.get("prompt", current_prompt)
    analysis = result.get("analysis", "")
    print("done")
    if analysis:
        print(f"  Optimizer analysis: {analysis}")
    return new_prompt


# ---- Main loop ----

def load_dataset():
    with open("data/generate/dataset.json") as f:
        return json.load(f)


def load_hard_set():
    path = "data/generate/hard_set.json"
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


async def run_training(max_iterations=None, evaluate_only=False):
    max_iter = max_iterations or MAX_ITERATIONS
    dataset = load_dataset()
    hard_set = load_hard_set()
    dataset_by_id = {e["id"]: e for e in dataset}

    # All flags enabled for evals
    coaching_flags = [{"name": f["name"], "description": f["description"], "enabled": True} for f in FLAGS]

    current_prompt = None  # None = use default prompt on first run
    prev_pass_rate = 0

    for run_num in range(1, max_iter + 1):
        prompt_label = "default prompt" if current_prompt is None else "optimized prompt"
        print(f"\n{'=' * 60}")
        print(f"=== Run {run_num} ({prompt_label}) ===")
        print(f"{'=' * 60}")

        # Step 1: Evaluate
        print(f"\n  Evaluating {len(dataset)} messages ({CONCURRENCY} concurrent)...", end=" ", flush=True)
        start = time.time()
        predictions = await evaluate_all(dataset, coaching_flags, current_prompt)
        elapsed = time.time() - start
        errored = [p for p in predictions.values() if p.get("error")]
        print(f"done in {elapsed:.0f}s ({len(errored)} errors)")

        if errored:
            print(f"\n  ERROR: {len(errored)} evaluation(s) failed. Aborting.")
            for e in errored[:5]:
                print(f"    id={e['id']}: {e['error']}")
            if len(errored) > 5:
                print(f"    ... and {len(errored) - 5} more")
            break

        # Step 2: Score
        results, metrics = score(dataset, predictions)
        print_metrics(metrics, run_num)

        # Save results and metrics
        save_run(run_num, "results.json", results)
        save_run(run_num, "metrics.json", metrics)
        save_run(run_num, "prompt.txt", current_prompt or get_default_prompt())

        # Score hard set separately (if exists)
        if hard_set:
            print(f"\n  Hard set ({len(hard_set)} cases):")
            hard_predictions = await evaluate_all(hard_set, coaching_flags, current_prompt)
            hard_results, hard_metrics = score(hard_set, hard_predictions)
            print_metrics(hard_metrics, run_num)
            save_run(run_num, "hard_set_results.json", hard_results)
            save_run(run_num, "hard_set_metrics.json", hard_metrics)

        if evaluate_only:
            print("\n  (evaluate-only mode, stopping)")
            break

        # Check improvement
        current_pass_rate = metrics["overall_pass_rate"]
        if run_num > 1 and (current_pass_rate - prev_pass_rate) < IMPROVEMENT_THRESHOLD:
            print(f"\n  Pass rate improvement ({current_pass_rate - prev_pass_rate:.1f}%) below threshold ({IMPROVEMENT_THRESHOLD}%). Stopping.")
            break

        if current_pass_rate == 100:
            print("\n  100% pass rate. Nothing to optimize.")
            break

        prev_pass_rate = current_pass_rate

        # Step 3: Judge failures
        judgments = await judge_failures(results, dataset_by_id)
        save_run(run_num, "failures.json", judgments)

        if not judgments:
            print("  No failures to analyze.")
            break

        # Step 4: Taxonomy
        taxonomy = await build_taxonomy(judgments)
        save_run(run_num, "taxonomy.json", taxonomy)
        print_taxonomy(taxonomy)

        # Step 5: Optimize
        base_prompt = current_prompt or get_default_prompt()
        current_prompt = await optimize_prompt(base_prompt, metrics, taxonomy, judgments, dataset_by_id)

        if run_num == max_iter:
            print(f"\n  Reached max iterations ({max_iter}). Stopping.")

    print(f"\n{'=' * 60}")
    print(f"Training complete. Results in {TRAIN_DIR}/")
    print(f"{'=' * 60}")


# ---- CLI ----

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Training loop: evaluate -> score -> judge -> optimize -> repeat")
    parser.add_argument("--step", choices=["evaluate", "full"], default="full",
                        help="'evaluate' runs one pass without optimization, 'full' runs the loop (default: full)")
    parser.add_argument("--iterations", type=int, default=None,
                        help=f"Max iterations (default: {MAX_ITERATIONS})")
    args = parser.parse_args()

    asyncio.run(run_training(
        max_iterations=args.iterations,
        evaluate_only=(args.step == "evaluate"),
    ))
