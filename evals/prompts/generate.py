FLAG_GENERATION_PROMPT = """You are designing coaching flags for a Slack communication coaching tool.

Persona: {persona}

This persona types messages in workplace Slack channels. Identify exactly {max_flags} distinct communication anti-patterns this persona tends to exhibit.

For each flag:
- "name": 1-2 word label (e.g., "Pushiness", "Self-Deprecation")
- "description": Plain English explanation of what to look for in text. Max 500 chars. Write like a human explaining to a coworker.
- "examples": 3 realistic Slack messages that clearly show this pattern

Requirements:
- Flags must be mutually exclusive — if two flags would catch the same message, merge or cut one
- Flags must be observable in text alone — no assumptions about intent or context
- Each flag should be specific enough that a person could reliably label messages

Return JSON:
{{"flags": [{{"name": "...", "description": "...", "examples": ["...", "...", "..."]}}]}}"""


FLAG_DEDUP_PROMPT = """Below are communication coaching flags generated from different workplace personas. Deduplicate them.

Two flags are duplicates if they would catch the same types of messages:
- "Rudeness" and "Impoliteness" → duplicates (merge)
- "Pushiness" and "Urgency" → likely duplicates (merge)
- "Vagueness" and "Self-Deprecation" → NOT duplicates (keep both)

Flags:
{flags}

Instructions:
1. Group semantically overlapping flags
2. For each group, keep ONE version with the best name, clearest description, and best examples
3. Keep the "persona" field from the best version
4. Do not modify flags that have no duplicates

Return JSON:
{{"flags": [{{"name": "...", "description": "...", "examples": ["...", "...", "..."], "persona": "..."}}]}}"""


POSITIVE_MESSAGE_PROMPT = """Generate a realistic Slack message for a synthetic test dataset.

Scenario: {scenario}
Persona: {persona}
This message MUST clearly violate these flags: {flag_names}

Flag details:
{flag_details}

Rules:
- Write exactly as this persona would type in Slack — casual, realistic
- The message MUST clearly exhibit the listed flag violations — a human reviewer should agree
- 1-3 sentences, natural Slack style (not formal email)
- Be realistic, not cartoonishly bad — the kind of thing someone might actually type at work
- Do not mention the flag names in the message

Return JSON: {{"message": "..."}}"""


HARD_NEGATIVE_MESSAGE_PROMPT = """Generate a HARD NEGATIVE Slack message for a synthetic test dataset.

Scenario: {scenario}
Persona: {persona}
This message must NOT violate the flag "{flag_name}" — but it should look like it might at first glance.

Flag definition: {flag_description}

Rules:
- Write as this persona would type in Slack
- The message should be about the scenario and might SEEM like it could trigger "{flag_name}"
- But on careful reading, it must be clean, professional, and contextually appropriate
- This tests whether an AI can distinguish real violations from legitimate communication
- 1-3 sentences, natural Slack style
- Do not mention the flag name in the message

Return JSON: {{"message": "..."}}"""
