"""Pipeline orchestrator."""

import asyncio
import sys

from config import (
    DATA_DIR,
    STEP1_OUTPUT,
    STEP2_OUTPUT,
    STEP3_OUTPUT,
    FINAL_OUTPUT,
    EVAL_RESULTS_OUTPUT,
    EVAL_SUMMARY_OUTPUT,
    ensure_data_dir,
)


def print_usage():
    print("Usage: python run_pipeline.py [command] [args]")
    print()
    print("Commands:")
    print("  all        - Generate synthetic data (default)")
    print("  1          - Generate workspaces only")
    print("  2          - Generate scenarios only")
    print("  3          - Generate messages only")
    print("  evaluate   - Run detailed evaluation")
    print("  train [N]  - Train prompt for N epochs (default: 5)")
    print("  clean      - Remove all data files")


def clean():
    files = [
        STEP1_OUTPUT, STEP2_OUTPUT, STEP3_OUTPUT, FINAL_OUTPUT,
        EVAL_RESULTS_OUTPUT, EVAL_SUMMARY_OUTPUT,
        DATA_DIR / "training_log.json",
    ]
    for f in files:
        if f.exists():
            f.unlink()
            print(f"Removed: {f}")
    
    if DATA_DIR.exists():
        for f in DATA_DIR.glob("prompt_epoch_*.txt"):
            f.unlink()
            print(f"Removed: {f}")
    
    print("Done")


async def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    
    if cmd == "all":
        ensure_data_dir()
        from step1_workspaces import main as s1
        from step2_scenarios import main as s2
        from step3_messages import main as s3
        await s1()
        await s2()
        await s3()
        
    elif cmd == "1":
        from step1_workspaces import main as s1
        await s1()
        
    elif cmd == "2":
        from step2_scenarios import main as s2
        await s2()
        
    elif cmd == "3":
        from step3_messages import main as s3
        await s3()
        
    elif cmd in ("evaluate", "eval"):
        from evaluate import main as evaluate
        await evaluate()
        
    elif cmd == "train":
        epochs = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        from train import run
        await run(epochs)
        
    elif cmd == "clean":
        clean()
        
    elif cmd in ("--help", "-h", "help"):
        print_usage()
        
    else:
        print(f"Unknown: {cmd}")
        print_usage()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
