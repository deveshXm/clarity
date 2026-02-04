"""Training loop for prompt improvement."""

import asyncio
import json
from datetime import datetime

from config import DATA_DIR, FINAL_OUTPUT, ensure_data_dir
from evaluator import Evaluator
from judge import judge_and_fix_prompt

PROMPT_FILE = DATA_DIR / "prompt.txt"
TRAINING_LOG = DATA_DIR / "training_log.json"


def load_prompt():
    with open(PROMPT_FILE) as f:
        return f.read()


def save_prompt(prompt, epoch=None):
    with open(PROMPT_FILE, "w") as f:
        f.write(prompt)
    if epoch is not None:
        with open(DATA_DIR / f"prompt_epoch_{epoch}.txt", "w") as f:
            f.write(prompt)


def load_log():
    if TRAINING_LOG.exists():
        with open(TRAINING_LOG) as f:
            return json.load(f)
    return []


def save_log(log):
    with open(TRAINING_LOG, "w") as f:
        json.dump(log, f, indent=2)


async def run(epochs=5):
    """Run training loop for N epochs."""
    ensure_data_dir()
    
    with open(FINAL_OUTPUT) as f:
        messages = json.load(f)
    print(f"Loaded {len(messages)} messages")
    
    log = load_log()
    start = len(log)
    
    print(f"\n{'='*60}")
    print(f"TRAINING: {epochs} epochs (starting from {start})")
    print(f"{'='*60}")
    
    for epoch in range(start, start + epochs):
        print(f"\n--- EPOCH {epoch} ---")
        
        prompt = load_prompt()
        print(f"Prompt: {len(prompt)} chars")
        
        evaluator = Evaluator(prompt)
        results = await evaluator.run(messages)
        metrics = evaluator.get_metrics(results)
        wrong = evaluator.get_wrong(results)
        
        print(f"Accuracy: {metrics['accuracy']}% ({metrics['exact']}/{metrics['total']})")
        print(f"Wrong: {len(wrong)}")
        
        log.append({
            "epoch": epoch,
            "accuracy": metrics["accuracy"],
            "exact": metrics["exact"],
            "total": metrics["total"],
            "wrong": len(wrong),
            "timestamp": datetime.now().isoformat(),
        })
        save_log(log)
        
        if len(wrong) == 0:
            print("Perfect accuracy!")
            break
        
        print("Fixing prompt...")
        new_prompt = await judge_and_fix_prompt(prompt, wrong, metrics)
        save_prompt(new_prompt, epoch)
    
    print(f"\n{'='*60}")
    print("TRAINING COMPLETE")
    print(f"{'='*60}")
    for entry in log:
        print(f"  Epoch {entry['epoch']}: {entry['accuracy']}%")


async def main():
    await run()


if __name__ == "__main__":
    asyncio.run(main())
