import os

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")
EPOCHS = int(os.environ.get("EPOCHS", "5"))
CONCURRENCY = int(os.environ.get("CONCURRENCY", "10"))
IMPROVEMENT_MODEL = os.environ.get("IMPROVEMENT_MODEL", "gpt-5.4-mini")
