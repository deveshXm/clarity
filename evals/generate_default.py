"""Generate a synthetic eval dataset using the 4 default app flags.

This is the "Option A" alignment: the eval directly measures the experience a
fresh-install user (the vast majority) gets, instead of a 9-flag persona-derived
set that no end-user actually sees.

DEFAULT_FLAGS below is synced from `src/types/index.ts` → `DEFAULT_COACHING_FLAGS`.
If you update the app's default flags, update this list in the same commit.

Usage:
    cd evals
    poetry run python generate_default.py
"""
from __future__ import annotations

import json
import os
import random

from openai import OpenAI
from dotenv import load_dotenv

from config.generate import (
    SEED, MODEL, PERSONAS, SCENARIOS,
    MESSAGES_PER_FLAG_SCENARIO, MULTI_FLAG_PERCENT,
)
from prompts.generate import POSITIVE_MESSAGE_PROMPT, HARD_NEGATIVE_MESSAGE_PROMPT

load_dotenv()
client = OpenAI()
DATA_DIR = "data/generate"


# Synced from src/types/index.ts → DEFAULT_COACHING_FLAGS.
# Keep names + descriptions byte-identical to the TS source.
DEFAULT_FLAGS: list[dict[str, str]] = [
    {
        "name": "Disrespectful",
        "description": (
            "Directly demeaning, insulting, hostile, or belittling language aimed at a "
            "person or group. Flag only when: there is a clear target ('you', 'they', "
            "named person), the language would reasonably be interpreted as insulting "
            "in isolation, and the tone is explicitly hostile. Do NOT flag blunt but "
            "neutral technical feedback, disagreements, or constructive criticism "
            "without hostility."
        ),
    },
    {
        "name": "Passive-Aggressive",
        "description": (
            "Indirect expressions of frustration or criticism masked by politeness, "
            "fake enthusiasm, or veiled digs. Flag when: there is a detectable mismatch "
            "between surface politeness and implied criticism, known snide patterns "
            "('per my last message', 'thanks for finally...'), or exaggerated praise "
            "that clearly contradicts context. Do NOT flag normal gratitude, genuine "
            "praise, or neutral reminders. This category requires high contextual "
            "confidence."
        ),
    },
    {
        "name": "Dismissive",
        "description": (
            "Responses that reject or shut down discussion without engaging with the "
            "substance. Flag when: a concern or question was raised, the reply "
            "dismisses it without reasoning, and the reply reduces engagement or "
            "signals refusal to consider. Do NOT flag concise but sufficient answers, "
            "boundary setting ('Let's take this offline'), or prioritization decisions "
            "('We'll address this next sprint')."
        ),
    },
    {
        "name": "Unclear / Not Actionable",
        "description": (
            "Messages that request action or raise issues but omit essential details "
            "needed to act, including vague requests and unsupported claims. Flag only "
            "when: the message asks for action, decision, or change AND lacks key "
            "information (who/what/where/when/impact) AND no clarifying detail exists "
            "in thread context. Do NOT flag casual updates, early brainstorming, "
            "high-level opinions, or normal technical judgment in engineering debate."
        ),
    },
]


def llm(prompt: str) -> dict:
    r = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        seed=SEED,
    )
    return json.loads(r.choices[0].message.content)


def save(filename: str, data) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(f"{DATA_DIR}/{filename}", "w") as f:
        json.dump(data, f, indent=2)


def write_flags() -> list[dict]:
    """Persist the 4 default flags in the same shape evaluate.py reads.

    The existing pipeline includes a `persona` field per flag; we set it to
    'general' since these flags are voice-agnostic. The messages step picks a
    persona per message, not per flag.
    """
    flags = [
        {**f, "examples": [], "persona": "general"}
        for f in DEFAULT_FLAGS
    ]
    save("flags.json", flags)
    print(f"  ✓ Wrote {len(flags)} default flags → {DATA_DIR}/flags.json")
    for f in flags:
        print(f"    • {f['name']}")
    return flags


def generate_messages(flags: list[dict]) -> None:
    print("=== Generating messages ===")

    random.seed(SEED)
    dataset: list[dict] = []
    id_counter = 1

    # 4 flags × 4 scenarios × 3 personas × MESSAGES_PER × 2 (pos+neg)
    total = len(flags) * len(SCENARIOS) * len(PERSONAS) * MESSAGES_PER_FLAG_SCENARIO * 2

    for scenario in SCENARIOS:
        for flag in flags:
            for persona in PERSONAS:
                for _ in range(MESSAGES_PER_FLAG_SCENARIO):
                    # --- Positive (flagged) ---
                    is_multi = random.random() < (MULTI_FLAG_PERCENT / 100) and len(flags) > 1
                    if is_multi:
                        others = [f for f in flags if f["name"] != flag["name"]]
                        # Cap extras at 1 since we only have 4 flags total
                        extra = random.sample(others, 1)
                        active_flags = [flag] + extra
                    else:
                        active_flags = [flag]

                    flag_names = ", ".join(f["name"] for f in active_flags)
                    flag_details = "\n".join(
                        f'- {f["name"]}: {f["description"]}' for f in active_flags
                    )

                    result = llm(POSITIVE_MESSAGE_PROMPT.format(
                        scenario=scenario,
                        persona=persona,
                        flag_names=flag_names,
                        flag_details=flag_details,
                    ))

                    dataset.append({
                        "id": id_counter,
                        "type": "positive",
                        "scenario": scenario,
                        "persona": persona,
                        "message": result["message"],
                        "ground_truth_flags": [f["name"] for f in active_flags],
                    })
                    id_counter += 1
                    print(f"  [{id_counter - 1}/{total}] positive: {flag_names} × {scenario} × {persona[:30]}…")

                    # --- Hard negative (clean) ---
                    result = llm(HARD_NEGATIVE_MESSAGE_PROMPT.format(
                        scenario=scenario,
                        persona=persona,
                        flag_name=flag["name"],
                        flag_description=flag["description"],
                    ))

                    dataset.append({
                        "id": id_counter,
                        "type": "hard_negative",
                        "scenario": scenario,
                        "persona": persona,
                        "message": result["message"],
                        "ground_truth_flags": [],
                    })
                    id_counter += 1
                    print(f"  [{id_counter - 1}/{total}] hard_neg: {flag['name']} × {scenario} × {persona[:30]}…")

    save("dataset.json", dataset)
    pos = sum(1 for d in dataset if d["type"] == "positive")
    neg = sum(1 for d in dataset if d["type"] == "hard_negative")
    multi = sum(1 for d in dataset if len(d["ground_truth_flags"]) > 1)
    print(
        f"  ✓ Saved {len(dataset)} messages "
        f"({pos} positive, {neg} hard negative, {multi} multi-flag) → {DATA_DIR}/dataset.json"
    )


if __name__ == "__main__":
    flags = write_flags()
    generate_messages(flags)
