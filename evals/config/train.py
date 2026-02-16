API_URL = "http://localhost:3000/api/evaluate"
CONCURRENCY = 20
MAX_ITERATIONS = 5
IMPROVEMENT_THRESHOLD = 1.0  # Stop if pass rate improves less than this % between runs

# Use a different model for judging than the flagger (avoids shared biases)
JUDGE_MODEL = "gpt-5.2"
