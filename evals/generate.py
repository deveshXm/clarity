import json
import os
import random
import argparse
import asyncio
import itertools
from openai import AsyncOpenAI
from dotenv import load_dotenv

from config.generate import (
    SEED, MODEL, FLAGS, WORKSPACE_TYPES, CHANNELS, PARTICIPANT_TEMPLATES,
    CASE_TYPES, TOTAL_MESSAGES, SCENARIOS_COUNT, CONTEXT_MESSAGES_PER_ENTRY,
    CONCURRENCY,
)
from prompts.generate import (
    SCENARIO_PROMPT, TRUE_POSITIVE_PROMPT, TRUE_NEGATIVE_PROMPT,
    CONTEXT_DEPENDENT_PROMPT, FORMALITY_MISMATCH_PROMPT,
)

load_dotenv()
client = AsyncOpenAI()
DATA_DIR = "data/generate"
semaphore = asyncio.Semaphore(CONCURRENCY)


async def llm(prompt):
    async with semaphore:
        r = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            seed=SEED,
        )
        return json.loads(r.choices[0].message.content)


def save(filename, data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(f"{DATA_DIR}/{filename}", "w") as f:
        json.dump(data, f, indent=2)


def flag_details_string():
    return "\n".join(f'- {f["name"]}: {f["description"]}' for f in FLAGS)


# ---- Step 1: Generate scenarios ----

async def generate_single_scenario(i, ws, ch, pt):
    result = await llm(SCENARIO_PROMPT.format(
        workspace_type=ws, channel=ch, participants=pt,
    ))
    print(f"  [{i + 1}/{SCENARIOS_COUNT}] {ch} — {pt[:50]}")
    return {
        "id": i + 1,
        "scenario": result["scenario"],
        "workspace_type": ws,
        "channel": ch,
        "participants": pt,
    }


async def generate_scenarios():
    print(f"=== Step 1: Generating {SCENARIOS_COUNT} scenarios ===")
    random.seed(SEED)

    tasks = []
    for i in range(SCENARIOS_COUNT):
        ws = random.choice(WORKSPACE_TYPES)
        ch = random.choice(CHANNELS)
        pt = random.choice(PARTICIPANT_TEMPLATES)
        tasks.append(generate_single_scenario(i, ws, ch, pt))

    scenarios = await asyncio.gather(*tasks)
    scenarios = sorted(scenarios, key=lambda s: s["id"])

    save("scenarios.json", scenarios)
    print(f"  Done: {len(scenarios)} scenarios -> {DATA_DIR}/scenarios.json")
    return scenarios


# ---- Step 2: Generate messages ----

def compute_distribution():
    dist = {}
    for case_type, cfg in CASE_TYPES.items():
        count = round(TOTAL_MESSAGES * cfg["percent"] / 100)
        dist[case_type] = count
    diff = TOTAL_MESSAGES - sum(dist.values())
    if diff != 0:
        dist["true_positive"] += diff
    return dist


def build_unique_pairs(scenarios, categories, count):
    """Build unique (scenario, category) pairs, shuffle, take first `count`."""
    all_pairs = list(itertools.product(scenarios, categories))
    random.shuffle(all_pairs)
    if count > len(all_pairs):
        # If we need more than unique combos, allow repeats with different seeds
        repeats = (count // len(all_pairs)) + 1
        all_pairs = all_pairs * repeats
    return all_pairs[:count]


async def generate_single_tp(scenario, category, flag_details):
    result = await llm(TRUE_POSITIVE_PROMPT.format(
        scenario=scenario["scenario"],
        channel=scenario["channel"],
        category=category,
        flag_details=flag_details,
        context_count=CONTEXT_MESSAGES_PER_ENTRY,
    ))
    return {
        "case_type": "true_positive",
        "category": category,
        "message": result["message"],
        "user": result.get("user", "unknown"),
        "context": result.get("context", []),
        "ground_truth_flags": result.get("ground_truth_flags", []),
        "scenario": scenario["scenario"],
        "channel": scenario["channel"],
    }


async def generate_single_tn(scenario, category, flag_details):
    result = await llm(TRUE_NEGATIVE_PROMPT.format(
        scenario=scenario["scenario"],
        channel=scenario["channel"],
        category=category,
        flag_details=flag_details,
        context_count=CONTEXT_MESSAGES_PER_ENTRY,
    ))
    return {
        "case_type": "true_negative",
        "category": category,
        "message": result["message"],
        "user": result.get("user", "unknown"),
        "context": result.get("context", []),
        "ground_truth_flags": [],
        "scenario": scenario["scenario"],
        "channel": scenario["channel"],
    }


async def generate_single_ctx(scenario, flag_details):
    result = await llm(CONTEXT_DEPENDENT_PROMPT.format(
        scenario=scenario["scenario"],
        channel=scenario["channel"],
        flag_details=flag_details,
        context_count=CONTEXT_MESSAGES_PER_ENTRY,
    ))
    pos = {
        "case_type": "context_dependent",
        "category": "context-positive",
        "message": result["message"],
        "user": result.get("user", "unknown"),
        "context": result["positive_context"]["context"],
        "ground_truth_flags": result["positive_context"]["ground_truth_flags"],
        "scenario": scenario["scenario"],
        "channel": scenario["channel"],
    }
    neg = {
        "case_type": "context_dependent",
        "category": "context-negative",
        "message": result["message"],
        "user": result.get("user", "unknown"),
        "context": result["negative_context"]["context"],
        "ground_truth_flags": [],
        "scenario": scenario["scenario"],
        "channel": scenario["channel"],
    }
    return pos, neg


async def generate_single_fmt(scenario, casual_ch, formal_ch, flag_details):
    result = await llm(FORMALITY_MISMATCH_PROMPT.format(
        scenario=scenario["scenario"],
        casual_channel=casual_ch,
        formal_channel=formal_ch,
        flag_details=flag_details,
        context_count=CONTEXT_MESSAGES_PER_ENTRY,
    ))
    casual = {
        "case_type": "formality_mismatch",
        "category": "formality-casual",
        "channel": casual_ch,
        "message": result["message"],
        "user": result.get("user", "unknown"),
        "context": result["casual"]["context"],
        "ground_truth_flags": [],
        "scenario": scenario["scenario"],
    }
    formal = {
        "case_type": "formality_mismatch",
        "category": "formality-formal",
        "channel": formal_ch,
        "message": result["message"],
        "user": result.get("user", "unknown"),
        "context": result["formal"]["context"],
        "ground_truth_flags": result["formal"]["ground_truth_flags"],
        "scenario": scenario["scenario"],
    }
    return casual, formal


async def generate_messages():
    print("=== Step 2: Generating messages ===")

    with open(f"{DATA_DIR}/scenarios.json") as f:
        scenarios = json.load(f)

    random.seed(SEED + 1)
    flag_details = flag_details_string()
    dist = compute_distribution()
    print(f"  Target: {dist}")
    print(f"  Concurrency: {CONCURRENCY}")

    dataset = []
    id_counter = 1

    # --- True positives: unique (scenario, category) pairs ---
    tp_categories = CASE_TYPES["true_positive"]["categories"]
    tp_pairs = build_unique_pairs(scenarios, tp_categories, dist["true_positive"])
    print(f"  Generating {len(tp_pairs)} true positives...")

    tp_tasks = [generate_single_tp(s, c, flag_details) for s, c in tp_pairs]
    tp_results = await asyncio.gather(*tp_tasks)
    for entry in tp_results:
        entry["id"] = id_counter
        dataset.append(entry)
        id_counter += 1
    print(f"    Done: {len(tp_results)} true positives")

    # --- True negatives: unique (scenario, category) pairs ---
    tn_categories = CASE_TYPES["true_negative"]["categories"]
    tn_pairs = build_unique_pairs(scenarios, tn_categories, dist["true_negative"])
    print(f"  Generating {len(tn_pairs)} true negatives...")

    tn_tasks = [generate_single_tn(s, c, flag_details) for s, c in tn_pairs]
    tn_results = await asyncio.gather(*tn_tasks)
    for entry in tn_results:
        entry["id"] = id_counter
        dataset.append(entry)
        id_counter += 1
    print(f"    Done: {len(tn_results)} true negatives")

    # --- Context-dependent: unique scenarios, each produces 2 entries ---
    ctx_calls = dist["context_dependent"] // 2
    ctx_scenarios = random.sample(scenarios, min(ctx_calls, len(scenarios)))
    # If we need more calls than unique scenarios, extend with repeats
    while len(ctx_scenarios) < ctx_calls:
        ctx_scenarios.extend(random.sample(scenarios, min(ctx_calls - len(ctx_scenarios), len(scenarios))))
    ctx_scenarios = ctx_scenarios[:ctx_calls]
    print(f"  Generating {ctx_calls} context-dependent pairs...")

    ctx_tasks = [generate_single_ctx(s, flag_details) for s in ctx_scenarios]
    ctx_results = await asyncio.gather(*ctx_tasks)
    for pos, neg in ctx_results:
        pos["id"] = id_counter
        dataset.append(pos)
        id_counter += 1
        neg["id"] = id_counter
        dataset.append(neg)
        id_counter += 1
    print(f"    Done: {len(ctx_results) * 2} context-dependent entries")

    # --- Formality mismatches: unique (scenario, casual, formal) combos ---
    casual_channels = ["#random", "#general", "DM"]
    formal_channels = ["#client-updates", "#cross-functional", "#engineering"]
    fmt_calls = dist["formality_mismatch"] // 2
    fmt_combos = list(itertools.product(scenarios, casual_channels, formal_channels))
    random.shuffle(fmt_combos)
    fmt_combos = fmt_combos[:fmt_calls]
    print(f"  Generating {fmt_calls} formality mismatch pairs...")

    fmt_tasks = [generate_single_fmt(s, cc, fc, flag_details) for s, cc, fc in fmt_combos]
    fmt_results = await asyncio.gather(*fmt_tasks)
    for casual, formal in fmt_results:
        casual["id"] = id_counter
        dataset.append(casual)
        id_counter += 1
        formal["id"] = id_counter
        dataset.append(formal)
        id_counter += 1
    print(f"    Done: {len(fmt_results) * 2} formality mismatch entries")

    save("dataset.json", dataset)

    # Print summary
    by_type = {}
    for d in dataset:
        by_type[d["case_type"]] = by_type.get(d["case_type"], 0) + 1
    flagged = sum(1 for d in dataset if d["ground_truth_flags"])
    clean = sum(1 for d in dataset if not d["ground_truth_flags"])

    print(f"\n  Done: {len(dataset)} messages ({flagged} flagged, {clean} clean)")
    for ct, count in by_type.items():
        print(f"    {ct}: {count}")
    print(f"  -> {DATA_DIR}/dataset.json")


# ---- Save hardcoded flags for reference ----

def save_flags():
    save("flags.json", FLAGS)
    print(f"  Saved {len(FLAGS)} flags -> {DATA_DIR}/flags.json")


# ---- CLI ----

async def main():
    parser = argparse.ArgumentParser(description="Generate synthetic evaluation dataset")
    parser.add_argument("--step", choices=["scenarios", "messages", "all"], default="all",
                        help="Which step to run (default: all)")
    args = parser.parse_args()

    save_flags()

    if args.step in ("scenarios", "all"):
        await generate_scenarios()
    if args.step in ("messages", "all"):
        await generate_messages()


if __name__ == "__main__":
    asyncio.run(main())
