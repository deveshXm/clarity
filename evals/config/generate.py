SEED = 77
MODEL = "gpt-5.2"

# ---- 7 coaching flags (hardcoded, all enabled for evals) ----

FLAGS = [
    {
        "name": "Vagueness",
        "description": "Requests or statements that lack specific details, making it hard for others to act. Look for missing context like what, when, who, or why — e.g., 'Can someone help?', 'This needs fixing', 'Let's improve it'.",
        "enabled": True,
    },
    {
        "name": "Non-Objective",
        "description": "Statements that present personal opinions, assumptions, or emotions as facts without evidence. Look for unqualified judgments like 'This is terrible', 'Nobody likes this', 'That approach is wrong' with no data or reasoning.",
        "enabled": True,
    },
    {
        "name": "Circular",
        "description": "Messages that repeat the same point in different words without adding new information or moving the conversation forward. The person restates their position without addressing counterpoints or providing new evidence.",
        "enabled": True,
    },
    {
        "name": "Rudeness",
        "description": "Messages with openly hostile, disrespectful, or demeaning language directed at people. Look for insults, name-calling, profanity aimed at someone, or commands that treat colleagues as subordinates — e.g., 'That's stupid', 'Are you serious right now?'.",
        "enabled": True,
    },
    {
        "name": "Passive-Aggressive",
        "description": "Messages that express negativity indirectly through sarcasm, backhanded compliments, or veiled digs while maintaining surface-level politeness. Look for patterns like 'Thanks for finally...', 'Must be nice to...', 'Per my last message...', 'As I already said...'.",
        "enabled": True,
    },
    {
        "name": "Fake",
        "description": "Insincere or performative communication where the tone doesn't match the intent. Look for hollow praise ('Great job!!' on mediocre work), false enthusiasm, or agreement that clearly masks disagreement — the message feels like a script, not a genuine response.",
        "enabled": True,
    },
    {
        "name": "One-Liner",
        "description": "Responses so brief they shut down conversation or fail to engage with what was asked. Look for replies like 'OK', 'Fine', 'Sure', 'Noted', 'Whatever' to messages that clearly warranted a substantive response, especially in professional discussions.",
        "enabled": True,
    },
]

# ---- Scenario-building axes ----

WORKSPACE_TYPES = [
    "early-stage startup (10-20 people, fast-paced, informal)",
    "enterprise (500+ people, process-heavy, formal)",
    "remote-first company (distributed across timezones)",
    "digital agency (client-facing, deadline-driven)",
    "scale-up (50-150 people, transitioning from startup culture)",
]

CHANNELS = [
    "#engineering",
    "#sales",
    "#general",
    "DM",
    "#cross-functional",
    "#client-updates",
    "#random",
]

PARTICIPANT_TEMPLATES = [
    "Senior engineer reviewing junior's PR",
    "PM pushing engineering for a deadline",
    "CTO addressing team after production incident",
    "Cross-functional sync between design and engineering",
    "Sales rep escalating a customer issue to engineering",
    "New hire asking questions in their first week",
    "Manager giving performance feedback in DM",
    "Two peers disagreeing on technical approach",
    "Engineering lead delegating urgent work",
    "QA flagging a regression to the dev who wrote it",
    "Designer pushing back on scope cuts from PM",
    "Remote employee feeling excluded from decisions",
]

# ---- Case type distribution ----

CASE_TYPES = {
    "true_positive": {
        "categories": [
            "passive-aggressive",
            "condescending",
            "dismissive",
            "sarcastic",
            "microaggressive",
            "vague-request",
            "circular-argument",
            "insincere-praise",
            "overly-blunt",
        ],
        "percent": 40,
    },
    "true_negative": {
        "categories": [
            "direct-but-not-rude",
            "dry-humor",
            "cultural-idiom",
            "blunt-but-fine-feedback",
            "neurodivergent-communication",
            "non-native-english-pattern",
        ],
        "percent": 30,
    },
    "context_dependent": {
        "percent": 20,
    },
    "formality_mismatch": {
        "percent": 10,
    },
}

# ---- Generation settings ----

TOTAL_MESSAGES = 500
SCENARIOS_COUNT = 100
CONTEXT_MESSAGES_PER_ENTRY = 5
CONCURRENCY = 20
