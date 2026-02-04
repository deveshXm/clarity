"""Configuration and OpenAI client setup."""

import os
import random
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI

# Load environment variables
load_dotenv(Path(__file__).parent.parent / ".env.local")

# OpenAI Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = "gpt-5.2"

# Temperature range for randomness
TEMPERATURE_MIN = 0.7
TEMPERATURE_MAX = 1.0

# Generation counts
NUM_WORKSPACES = 10
NUM_SCENARIOS_PER_WORKSPACE = 10
NUM_PEOPLE_MIN = 2
NUM_PEOPLE_MAX = 3

# Output paths
DATA_DIR = Path(__file__).parent / "data"
STEP1_OUTPUT = DATA_DIR / "step1_workspaces.json"
STEP2_OUTPUT = DATA_DIR / "step2_scenarios.json"
STEP3_OUTPUT = DATA_DIR / "step3_messages.json"
FINAL_OUTPUT = DATA_DIR / "final_output.json"

# Evaluation outputs
EVAL_RESULTS_OUTPUT = DATA_DIR / "eval_results.json"
EVAL_SUMMARY_OUTPUT = DATA_DIR / "eval_summary.json"


def get_client() -> AsyncOpenAI:
    """Get async OpenAI client."""
    return AsyncOpenAI(api_key=OPENAI_API_KEY)


def get_random_temperature() -> float:
    """Get random temperature between min and max."""
    return random.uniform(TEMPERATURE_MIN, TEMPERATURE_MAX)


def ensure_data_dir():
    """Create data directory if it doesn't exist."""
    DATA_DIR.mkdir(exist_ok=True)
