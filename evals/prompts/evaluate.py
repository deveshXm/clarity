IMPROVEMENT_PROMPT = """You are an expert prompt engineer improving a message-classification system prompt.

## Current System Prompt
{current_prompt}

## Flag Definitions Being Tested
{flag_definitions}

## Current Scores
- Precision: {precision:.3f}
- Recall: {recall:.3f}
- F1: {f1:.3f}

## False Positives (flagged when it shouldn't have been)
These are hard-negative messages that the classifier incorrectly flagged.
{false_positives}

## False Negatives (missed flags that should have been caught)
These are positive messages where the classifier failed to detect the ground-truth flags.
{false_negatives}

## Instructions
1. Analyze the failure patterns — what is the classifier getting confused about?
2. Rewrite the system prompt to fix these failures WITHOUT breaking what already works.
3. Keep the same overall structure: the prompt must use {{{{FLAGS}}}} and {{{{CONTEXT}}}} placeholders.
4. The output JSON format must remain: {{"flags": [1, 2], "suggestedRephrase": "...", "reason": "..."}}
5. Focus on adding clarity around edge cases that caused the failures.
6. Do NOT make the prompt excessively long — concise improvements are better.

Return JSON:
{{"analysis": "Brief analysis of failure patterns", "prompt": "The complete rewritten system prompt"}}"""
