"""LLM judge that analyzes failures and improves the prompt."""

import json
from config import get_client, MODEL

JUDGE_PROMPT = """You are a prompt engineer improving a communication coaching AI.

CURRENT PROMPT:
```
{prompt}
```

CURRENT ACCURACY: {accuracy}% ({exact}/{total} exact matches)

The following predictions were WRONG (expected flags != actual flags):

{wrong_predictions}

TASK:
Analyze failures and improve the prompt. You may ADD, UPDATE, or DELETE rules but make subtle changes only.

You must follow these rules while making changes : 
- Keep the rules general to avoid overfitting.
- Keep the changes subtle.
- Avoid overfitting by prompting about specific flags or messages/scenarios.

GOOD rules (general):
- "Apply multiple flags if multiple descriptions match"
- "Evaluate each flag independently"
- "Don't flag if the issue is very minor"

BAD rules (overfitting):
- "Flag 'Link-heavy' when..." (specific flag name)
- "In your reasoning, quote..." (reasoning is eval-only)
- Flag-specific guidance lists

Return JSON:
{{
  "analysis": "What pattern is causing errors (1 sentence)",
  "changes": "What you added/updated/deleted (1 sentence)",
  "prompt": "The improved prompt"
}}"""


def format_wrong(wrong, limit=50):
    lines = []
    for i, w in enumerate(wrong[:limit]):
        lines.append(f"--- Wrong #{i+1} ---")
        lines.append(f"Message: {w['message'][:200]}...")
        lines.append(f"Expected flags: {w['expected_flags']}")
        lines.append(f"Actual flags: {w['actual_flags']}")
        lines.append(f"Reasoning: {w['reasoning']}")
        lines.append("")
    return "\n".join(lines)


async def judge_and_fix_prompt(prompt, wrong, metrics):
    client = get_client()
    
    response = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "You are a prompt engineering expert. Return valid JSON only."},
            {"role": "user", "content": JUDGE_PROMPT.format(
                prompt=prompt,
                accuracy=metrics["accuracy"],
                exact=metrics["exact"],
                total=metrics["total"],
                wrong_predictions=format_wrong(wrong),
            )},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    
    result = json.loads(response.choices[0].message.content)
    print(f"\n  Analysis: {result['analysis']}")
    print(f"  Changes: {result['changes']}")
    return result["prompt"]
