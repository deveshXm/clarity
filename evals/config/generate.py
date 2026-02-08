SEED = 42 # Change this to get different results
MODEL = "gpt-5.2"

PERSONAS = [
    "Anxious Junior Developer (afraid to ask for help)",
    "Passionate Product Manager (tends to over-promise)",
    "Direct CTO (brief, borders on rude)",
]

SCENARIOS = [
    "Code Review Dispute",
    "Friday 5PM Deployment",
    "Salary Negotiation",
    "Incident Response",
]

MAX_FLAGS_PER_PERSONA = 3
MESSAGES_PER_FLAG_SCENARIO = 2  # N positive + N hard_negative per (flag, scenario) pair
MULTI_FLAG_PERCENT = 20  # % of positive messages that get 2-3 flags
