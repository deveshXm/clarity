"""Detailed evaluation with match type breakdown."""

import asyncio
import json
from datetime import datetime

from config import FINAL_OUTPUT, EVAL_RESULTS_OUTPUT, EVAL_SUMMARY_OUTPUT, ensure_data_dir
from evaluator import Evaluator

PROMPT_FILE = EVAL_RESULTS_OUTPUT.parent / "prompt.txt"


def get_match_type(r):
    """Classify prediction result."""
    expected_flagged = r["expected_is_flagged"]
    actual_flagged = r["actual_is_flagged"]
    expected = set(r["expected_flags"])
    actual = set(r["actual_flags"])
    
    if not expected_flagged and not actual_flagged:
        return "true_negative"
    if not expected_flagged and actual_flagged:
        return "false_positive"
    if expected_flagged and not actual_flagged:
        return "missed"
    
    # Both flagged
    if expected == actual:
        return "exact"
    if expected & actual:
        return "partial"
    return "no_overlap"


def calculate_summary(results):
    total = len(results)
    by_type = {}
    for r in results:
        t = get_match_type(r)
        by_type[t] = by_type.get(t, 0) + 1
    
    tp = by_type.get("exact", 0) + by_type.get("partial", 0) + by_type.get("no_overlap", 0)
    tn = by_type.get("true_negative", 0)
    
    return {
        "total": total,
        "detection_accuracy": round((tp + tn) / total * 100, 2) if total else 0,
        "true_positives": tp,
        "true_negatives": tn,
        "false_positives": by_type.get("false_positive", 0),
        "missed": by_type.get("missed", 0),
        "exact": by_type.get("exact", 0),
        "partial": by_type.get("partial", 0),
        "no_overlap": by_type.get("no_overlap", 0),
        "timestamp": datetime.now().isoformat(),
    }


async def main():
    ensure_data_dir()
    
    with open(FINAL_OUTPUT) as f:
        messages = json.load(f)
    
    flagged = sum(1 for m in messages if m["isFlagged"])
    print(f"Loaded {len(messages)} messages ({flagged} flagged, {len(messages)-flagged} clean)")
    
    # Load prompt if exists, otherwise use None (API will use default)
    prompt = None
    if PROMPT_FILE.exists():
        with open(PROMPT_FILE) as f:
            prompt = f.read()
    
    evaluator = Evaluator(prompt)
    results = await evaluator.run(messages)
    
    # Add match type to each result
    for r in results:
        r["match_type"] = get_match_type(r)
    
    summary = calculate_summary(results)
    
    # Print
    print(f"\nDetection Accuracy: {summary['detection_accuracy']}%")
    print(f"  True Positives: {summary['true_positives']}")
    print(f"  True Negatives: {summary['true_negatives']}")
    print(f"  False Positives: {summary['false_positives']}")
    print(f"  Missed: {summary['missed']}")
    print(f"\nFlag Accuracy (when both flagged):")
    print(f"  Exact: {summary['exact']}")
    print(f"  Partial: {summary['partial']}")
    print(f"  No overlap: {summary['no_overlap']}")
    
    # Save
    with open(EVAL_RESULTS_OUTPUT, "w") as f:
        json.dump(results, f, indent=2)
    with open(EVAL_SUMMARY_OUTPUT, "w") as f:
        json.dump(summary, f, indent=2)
    
    print(f"\nSaved to {EVAL_RESULTS_OUTPUT}")


if __name__ == "__main__":
    asyncio.run(main())
