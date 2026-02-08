import json
import os
import random
import argparse
from openai import OpenAI
from dotenv import load_dotenv

from config.generate import (
    SEED, MODEL, PERSONAS, SCENARIOS,
    MAX_FLAGS_PER_PERSONA, MESSAGES_PER_FLAG_SCENARIO, MULTI_FLAG_PERCENT,
)
from prompts.generate import (
    FLAG_GENERATION_PROMPT, FLAG_DEDUP_PROMPT,
    POSITIVE_MESSAGE_PROMPT, HARD_NEGATIVE_MESSAGE_PROMPT,
)

load_dotenv()
client = OpenAI()
DATA_DIR = "data/generate"


def llm(prompt):
    r = client.chat.completions.create(
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


# ---- Step 1: Generate flags ----

def generate_flags():
    print("=== Step 1: Generating flags ===")

    # Generate flags per persona
    all_flags = []
    for persona in PERSONAS:
        prompt = FLAG_GENERATION_PROMPT.format(persona=persona, max_flags=MAX_FLAGS_PER_PERSONA)
        result = llm(prompt)
        for f in result["flags"]:
            f["persona"] = persona
        all_flags.extend(result["flags"])
        print(f"  {persona}: {len(result['flags'])} flags")

    # Deduplicate across personas
    print(f"  Deduplicating {len(all_flags)} raw flags...")
    result = llm(FLAG_DEDUP_PROMPT.format(flags=json.dumps(all_flags, indent=2)))
    flags = result["flags"]

    save("flags.json", flags)
    print(f"  ✓ Saved {len(flags)} unique flags → {DATA_DIR}/flags.json")
    return flags


# ---- Step 2: Generate messages ----

def generate_messages():
    print("=== Step 2: Generating messages ===")

    with open(f"{DATA_DIR}/flags.json") as f:
        flags = json.load(f)

    random.seed(SEED)
    dataset = []
    id_counter = 1
    total = len(SCENARIOS) * len(flags) * MESSAGES_PER_FLAG_SCENARIO * 2

    for scenario in SCENARIOS:
        for flag in flags:
            for _ in range(MESSAGES_PER_FLAG_SCENARIO):

                # --- Positive (flagged) message ---
                is_multi = random.random() < (MULTI_FLAG_PERCENT / 100) and len(flags) > 1
                if is_multi:
                    others = [f for f in flags if f["name"] != flag["name"]]
                    extra = random.sample(others, min(random.randint(1, 2), len(others)))
                    active_flags = [flag] + extra
                else:
                    active_flags = [flag]

                flag_names = ", ".join(f["name"] for f in active_flags)
                flag_details = "\n".join(f'- {f["name"]}: {f["description"]}' for f in active_flags)

                result = llm(POSITIVE_MESSAGE_PROMPT.format(
                    scenario=scenario,
                    persona=flag["persona"],
                    flag_names=flag_names,
                    flag_details=flag_details,
                ))

                dataset.append({
                    "id": id_counter,
                    "type": "positive",
                    "scenario": scenario,
                    "persona": flag["persona"],
                    "message": result["message"],
                    "ground_truth_flags": [f["name"] for f in active_flags],
                })
                id_counter += 1
                print(f"  [{id_counter - 1}/{total}] positive: {flag_names} × {scenario}")

                # --- Hard negative (clean) message ---
                result = llm(HARD_NEGATIVE_MESSAGE_PROMPT.format(
                    scenario=scenario,
                    persona=flag["persona"],
                    flag_name=flag["name"],
                    flag_description=flag["description"],
                ))

                dataset.append({
                    "id": id_counter,
                    "type": "hard_negative",
                    "scenario": scenario,
                    "persona": flag["persona"],
                    "message": result["message"],
                    "ground_truth_flags": [],
                })
                id_counter += 1
                print(f"  [{id_counter - 1}/{total}] hard_neg: {flag['name']} × {scenario}")

    save("dataset.json", dataset)

    pos = sum(1 for d in dataset if d["type"] == "positive")
    neg = sum(1 for d in dataset if d["type"] == "hard_negative")
    multi = sum(1 for d in dataset if len(d["ground_truth_flags"]) > 1)
    print(f"  ✓ Saved {len(dataset)} messages ({pos} positive, {neg} hard negative, {multi} multi-flag) → {DATA_DIR}/dataset.json")


# ---- CLI ----

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic evaluation dataset")
    parser.add_argument("--step", choices=["flags", "messages", "all"], default="all",
                        help="Which step to run (default: all)")
    args = parser.parse_args()

    if args.step in ("flags", "all"):
        generate_flags()
    if args.step in ("messages", "all"):
        generate_messages()
