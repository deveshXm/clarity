# Clarity Evaluate API

Stateless API endpoint for evaluating messages against Clarity's communication coaching AI.

## Endpoint

```
POST /api/evaluate
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
| `history` | `string[]` | No | Conversation history for context (most recent last) |
| `coachingFlags` | `CoachingFlag[]` | No | Custom coaching flags (uses defaults if omitted) |

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
  flagged: boolean;           // Whether the message has communication issues
  flags: Array<{
    type: string;             // Flag type (e.g., "pushiness", "rudeness")
    confidence: number;       // Confidence score (0-1)
    explanation: string;      // Why this flag was triggered
  }>;
  rephrasedMessage: string | null;  // Improved version if flagged, null otherwise
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
  "flags": [
    {
      "type": "pushiness",
      "confidence": 0.95,
      "explanation": "Message uses demanding tone with 'NOW' in all caps"
    }
  ],
  "rephrasedMessage": "I need this done as soon as possible."
}
```

### With Conversation History

```bash
curl -X POST https://clarity.rocktangle.com/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I already asked twice. Just do it!",
    "history": [
      "Can you update the docs?",
      "Hey, any update on the docs?"
    ]
  }'
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
- **Context-aware**: Providing `history` improves analysis accuracy.
- **Conservative**: The AI only flags messages with clear communication issues.
- **Preserves intent**: Rephrased messages maintain the original meaning and tone.

## Flag Types

The `type` field returns the **exact name** from the coaching flags provided (or from defaults). This is deterministic - the AI returns a flag index which is mapped back to the original flag name.

### Default Flag Names

| Name | Description |
|------|-------------|
| `Pushiness` | Overly aggressive or demanding tone |
| `Vagueness` | Unclear or imprecise requests |
| `Non-Objective` | Subjective or biased communication |
| `Circular` | Repetitive or circular reasoning |
| `Rudeness` | Impolite or discourteous communication |
| `Passive-Aggressive` | Indirect expression of negative feelings |
| `Fake` | Insincere or inauthentic communication |
| `One-Liner` | Overly brief or dismissive responses |

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

Response will use `"type": "Being Mean"` (your exact name).
