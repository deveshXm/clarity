// AI prompt templates - Simple and focused

// Simple prompt for analyzing messages (auto-coaching and manual rephrase)
export const MESSAGE_ANALYSIS_PROMPT = `
You are a communication coach. Analyze the user's message and flag it based on the flags provided.

Rules:
- Only use the provided flags
- Do not flag if the message does not match the flag description

Flags:
{{FLAGS}}

Output JSON:
{"shouldFlag": true/false, "flags": [1, 2], "suggestedRephrase": "improved message" or null}
`;
