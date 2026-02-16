SCENARIO_PROMPT = """Generate a rich workplace scenario for testing a Slack communication coaching AI.

Build a scenario using these seeds:
- Workspace type: {workspace_type}
- Channel: {channel}
- Participants: {participants}

Write a 2-4 sentence story-format description that includes:
- The company size, culture, and communication norms
- The channel context and what's being discussed
- The participants' roles, seniority, and relationship dynamics
- Any situational tension or stakes (deadlines, conflicts, incidents)

Make it specific and vivid — someone reading this should immediately understand the social dynamics at play.

Return JSON:
{{"scenario": "..."}}"""


TRUE_POSITIVE_PROMPT = """Generate a Slack message that violates one or more communication flags, along with realistic preceding conversation context.

Scenario: {scenario}
Channel: {channel}
Category of violation: {category}

These are ALL the communication flags. The message MUST violate one or more of them:
{flag_details}

Rules:
- Write exactly as a real person would type in Slack — casual, realistic, not cartoonishly bad
- The message MUST clearly exhibit the "{category}" pattern
- Generate {context_count} preceding messages from other participants that build a natural conversation leading to this message
- Context messages should be clean and professional — only the target message violates flags
- Use realistic first names for users (e.g., "alex", "jordan", "priya", "marcus")
- 1-3 sentences for the target message, natural Slack style
- Do not mention flag names in any message
- ground_truth_flags must ONLY contain names from the flags listed above

Return JSON:
{{
    "message": "the message being evaluated",
    "user": "name of the person writing the target message",
    "context": [
        {{"text": "preceding message 1", "user": "name1"}},
        {{"text": "preceding message 2", "user": "name2"}}
    ],
    "ground_truth_flags": ["FlagName1", "FlagName2"]
}}"""


TRUE_NEGATIVE_PROMPT = """Generate a TRICKY TRUE NEGATIVE Slack message — one that looks like it might violate communication flags but is actually fine — along with realistic preceding conversation context.

Scenario: {scenario}
Channel: {channel}
Category of tricky negative: {category}

These are the communication flags. The message must NOT violate any of them, but should look like it might at first glance:
{flag_details}

Category guidance:
- "direct-but-not-rude": Blunt, efficient communication that's appropriate for the context
- "dry-humor": Deadpan or witty remarks that could be misread as hostility
- "cultural-idiom": Expressions from different cultures that might seem off but are normal
- "blunt-but-fine-feedback": Honest critical feedback delivered appropriately
- "neurodivergent-communication": Literal, terse, or atypical phrasing that's not rude
- "non-native-english-pattern": Grammar or phrasing patterns from non-native speakers that might seem curt

Rules:
- The message should test whether an AI can distinguish real violations from legitimate communication styles
- Generate {context_count} preceding messages that provide context making it clear the message is appropriate
- Use realistic first names for users
- 1-3 sentences, natural Slack style
- On careful reading with context, this message must be clean and professional

Return JSON:
{{
    "message": "the message being evaluated",
    "user": "name of the person writing the target message",
    "context": [
        {{"text": "preceding message 1", "user": "name1"}},
        {{"text": "preceding message 2", "user": "name2"}}
    ],
    "ground_truth_flags": []
}}"""


CONTEXT_DEPENDENT_PROMPT = """Generate a CONTEXT-DEPENDENT test case — the SAME message text appears twice with different conversation contexts, leading to different ground truth labels.

Scenario: {scenario}
Channel: {channel}

These are the communication flags:
{flag_details}

Generate ONE ambiguous message that could be either genuine or problematic depending on context. Then provide two different conversation threads:

1. "positive_context": A conversation where the message IS a violation (e.g., passive-aggressive, sarcastic)
2. "negative_context": A conversation where the SAME message is genuinely fine (e.g., sincere gratitude, honest question)

Classic examples of ambiguous messages:
- "Thanks for finally doing that" (genuine relief vs. passive-aggressive dig)
- "Interesting approach" (genuine curiosity vs. condescending dismissal)
- "Sure, whatever works" (flexible agreement vs. dismissive disengagement)

Rules:
- The message text must be IDENTICAL in both cases — only the context differs
- Each context should have {context_count} preceding messages
- Use realistic first names for users
- The positive version must clearly violate at least one flag
- The negative version must clearly NOT violate any flags
- ground_truth_flags for positive must ONLY contain names from the flags listed above

Return JSON:
{{
    "message": "the ambiguous message (same in both)",
    "user": "name of the person writing the message",
    "positive_context": {{
        "context": [{{"text": "...", "user": "..."}}],
        "ground_truth_flags": ["FlagName"]
    }},
    "negative_context": {{
        "context": [{{"text": "...", "user": "..."}}],
        "ground_truth_flags": []
    }}
}}"""


FORMALITY_MISMATCH_PROMPT = """Generate a FORMALITY MISMATCH test case — a message that's fine in a casual channel but inappropriate in a formal one.

Casual channel: {casual_channel}
Formal channel: {formal_channel}
Scenario: {scenario}

These are the communication flags:
{flag_details}

Generate a message that:
- Would be totally normal and acceptable in {casual_channel} (casual banter, informal tone)
- Would violate one or more flags in {formal_channel} (where clients, leadership, or external stakeholders are present)

Provide conversation context for BOTH channel settings.

Rules:
- Same message text in both contexts
- Each context should have {context_count} preceding messages matching the channel's typical tone
- The casual context should make the message feel natural and fine
- The formal context should make the same message feel inappropriate
- Use realistic first names for users
- ground_truth_flags for formal must ONLY contain names from the flags listed above

Return JSON:
{{
    "message": "the message (same in both)",
    "user": "name of the person writing the message",
    "casual": {{
        "channel": "{casual_channel}",
        "context": [{{"text": "...", "user": "..."}}],
        "ground_truth_flags": []
    }},
    "formal": {{
        "channel": "{formal_channel}",
        "context": [{{"text": "...", "user": "..."}}],
        "ground_truth_flags": ["FlagName"]
    }}
}}"""
