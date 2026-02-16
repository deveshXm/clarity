JUDGE_PROMPT = """You are an expert evaluator analyzing why a communication flagging AI made an incorrect prediction.

Scenario: {scenario}
Channel: {channel}

Conversation context (preceding messages):
{context}

Target message: "{message}"

Expected flags: {ground_truth_flags}
Predicted flags: {predicted_flags}
Model's reasoning: {reason}

Analyze this failure:
1. What specifically went wrong? (missed a flag, flagged incorrectly, or both)
2. WHY did the model make this mistake? (was the violation subtle? was context ignored? was a legitimate style misclassified?)
3. Categorize the failure into one pattern label, e.g.:
   - "overflagging-direct-communication"
   - "missing-subtle-passive-aggression"
   - "ignoring-channel-context"
   - "cultural-style-misclassified"
   - "context-not-considered"
   - "formality-mismatch-missed"
   - or create a new descriptive label

Return JSON:
{{
    "what_went_wrong": "Concise description of the error",
    "why": "Root cause analysis — what the model missed or misunderstood",
    "failure_pattern": "descriptive-kebab-case-label",
    "severity": "minor|major|critical"
}}"""


TAXONOMY_PROMPT = """You are analyzing a batch of failure cases from a communication flagging AI to identify systematic patterns.

Below are {failure_count} individual failure analyses from a judge. Your job is to cluster them into higher-level patterns and count how many failures fall into each pattern.

Failures:
{failures_json}

Instructions:
1. Group failures that share the same root cause into clusters
2. Name each cluster with a clear, actionable description
3. Rank clusters by count (most frequent first)
4. For each cluster, pick up to 3 representative example IDs
5. Suggest a general direction for fixing each pattern

Return JSON:
{{
    "patterns": [
        {{
            "pattern": "Human-readable description of the failure pattern",
            "count": 23,
            "example_ids": [12, 45, 67],
            "fix_direction": "What kind of prompt change would address this"
        }}
    ]
}}"""


OPTIMIZER_PROMPT = """You are an expert prompt engineer. Your job is to improve a communication flagging prompt based on systematic failure analysis.

Current prompt being used by the flagger:
---
{current_prompt}
---

Current metrics:
- Overall pass rate: {overall_pass_rate}%
- True positive pass rate: {tp_pass_rate}%
- True negative pass rate: {tn_pass_rate}%
- Context-dependent pass rate: {ctx_pass_rate}%
- Formality mismatch pass rate: {fmt_pass_rate}%

Top failure patterns (from analyzing {total_failures} failures):
{taxonomy_summary}

Example failures for each top pattern:
{example_failures}

CRITICAL — template variable rules:
- {{{{FLAGS}}}} and {{{{CONTEXT}}}} are template variables that get REPLACED with full content at runtime.
- {{{{FLAGS}}}} expands to the complete list of flag definitions (hundreds of chars).
- {{{{CONTEXT}}}} expands to the full recent channel message history (could be thousands of chars).
- Each variable MUST appear EXACTLY ONCE in the prompt — in its designated section only.
- NEVER reference {{{{FLAGS}}}} or {{{{CONTEXT}}}} inline in rules or instructions. Instead say "the context" or "the flags above" in plain English.

Instructions:
1. Analyze the failure patterns and identify what the current prompt is missing or getting wrong
2. Write a REVISED version of the flagger prompt that addresses the top failure patterns
3. Make SUBTLE, targeted edits — refine wording, add 1-2 clarifying rules, or adjust existing ones. Do NOT rewrite the prompt from scratch.
4. Do NOT overfit to these specific failures. Your changes should generalize — if a rule would help on these examples but hurt on other reasonable messages, don't add it.
5. The revised prompt MUST be under 5000 characters total. If the current prompt is already near the limit, tighten existing rules instead of adding new ones.
6. Keep the same output format (JSON with flags array and suggestedRephrase)
7. {{{{FLAGS}}}} must appear exactly once (in the Flags section). {{{{CONTEXT}}}} must appear exactly once (in the Recent channel messages section). No other occurrences.
8. Don't remove rules that are working well (true positives and true negatives that pass)
9. Prefer adjusting thresholds and edge-case guidance over adding entirely new rules

Return JSON:
{{
    "analysis": "Brief summary of what you changed and why (1-2 sentences)",
    "prompt": "The complete revised prompt text with {{{{FLAGS}}}} and {{{{CONTEXT}}}} placeholders (must be under 5000 chars)"
}}"""
