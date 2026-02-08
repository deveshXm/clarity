# Clarity Evaluate API

Stateless API endpoint for evaluating messages against Clarity's communication coaching AI.

## Base URL

```
https://clarity.rocktangle.com
```

## Endpoint

```
POST https://clarity.rocktangle.com/api/evaluate
```

## Request

### Headers

```
Content-Type: application/json
```

### Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | `string` | Yes | The message to analyze |
| `coachingFlags` | `CoachingFlag[]` | No | Custom coaching flags (uses defaults if omitted) |
| `includeReasoning` | `boolean` | No | If true, includes reasoning in response (default: false) |
| `prompt` | `string` | No | Custom system prompt (must contain `{{FLAGS}}` placeholder) |

### CoachingFlag Object

```typescript
{
  name: string;        // Flag name (e.g., "Pushiness")
  description: string; // What this flag detects
  enabled: boolean;    // Whether to check for this issue
}
```

### Default Coaching Flags

If `coachingFlags` is not provided, these defaults are used:

| Name | Description | Enabled |
|------|-------------|---------|
| Pushiness | Overly aggressive or demanding tone | ✅ |
| Vagueness | Unclear or imprecise requests | ✅ |
| Non-Objective | Subjective or biased communication | ✅ |
| Circular | Repetitive or circular reasoning | ✅ |
| Rudeness | Impolite or discourteous communication | ✅ |
| Passive-Aggressive | Indirect expression of negative feelings | ✅ |
| Fake | Insincere or inauthentic communication | ❌ |
| One-Liner | Overly brief or dismissive responses | ❌ |

## Response

### Success (200)

```typescript
{
  flagged: boolean;              // Whether the message has communication issues
  flags: string[];               // Flag names that were triggered (e.g., ["Pushiness", "Rudeness"])
  rephrasedMessage: string | null;  // Improved version if flagged, null otherwise
  reasoning?: string;            // Why the AI made its decision (only when includeReasoning is true)
}
```

### Error (400/500)

```typescript
{
  error: string;  // Error message
}
```

## Examples

### Basic Request

```bash
curl -X POST https://clarity.rocktangle.com/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I need this done NOW!"
  }'
```

**Response:**
```json
{
  "flagged": true,
  "flags": ["Pushiness"],
  "rephrasedMessage": "I need this done as soon as possible."
}
```

### With Reasoning (for evals)

```bash
curl -X POST https://clarity.rocktangle.com/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I already asked twice. Just do it!",
    "includeReasoning": true
  }'
```

**Response:**
```json
{
  "flagged": true,
  "flags": ["Pushiness", "Rudeness"],
  "rephrasedMessage": "I mentioned this a couple of times already — could you take a look when you get a chance?",
  "reasoning": "The message uses a demanding tone with 'Just do it!' and implies frustration with 'I already asked twice', which triggers Pushiness and Rudeness flags."
}
```

### With Custom Flags

```bash
curl -X POST https://clarity.rocktangle.com/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Fix this ASAP",
    "coachingFlags": [
      { "name": "Pushiness", "description": "Demanding tone", "enabled": true },
      { "name": "Rudeness", "description": "Impolite communication", "enabled": false }
    ]
  }'
```

### With Custom Prompt

```bash
curl -X POST https://clarity.rocktangle.com/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Fix this ASAP",
    "prompt": "You are a communication coach. Analyze the message.\n\nFlags:\n{{FLAGS}}\n\nOutput JSON:\n{\"shouldFlag\": true/false, \"flags\": [1, 2], \"suggestedRephrase\": \"improved\" or null}"
  }'
```

### Non-Flagged Message

```bash
curl -X POST https://clarity.rocktangle.com/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "When you have a moment, could you review the PR?"
  }'
```

**Response:**
```json
{
  "flagged": false,
  "flags": [],
  "rephrasedMessage": null
}
```

## Notes

- **Stateless**: No data is persisted. Each request is independent.
- **Conservative**: The AI only flags messages with clear communication issues.
- **Preserves intent**: Rephrased messages maintain the original meaning and tone.
- **Custom prompts**: The `prompt` field must include `{{FLAGS}}` which gets replaced with the enabled flags list.
- **Reasoning**: Use `includeReasoning: true` for debugging or evaluation pipelines.

## Flag Behavior

The `flags` array returns the **exact names** from the coaching flags provided (or from defaults). The AI returns flag indices internally, which are mapped back to the original flag names.

### Custom Flags

When you provide custom `coachingFlags`, the response will use your exact flag names:

```bash
curl -X POST https://clarity.rocktangle.com/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "This is terrible!",
    "coachingFlags": [
      {"name": "Being Mean", "description": "Harsh communication", "enabled": true}
    ]
  }'
```

Response will include `"flags": ["Being Mean"]` (your exact name).
