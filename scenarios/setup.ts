// Load local secrets (PORTKEY_AI_KEY, AZURE_*, LANGWATCH_API_KEY) before any
// test module imports the agent code, since src/lib/ai.ts constructs its
// Portkey client at import time from process.env.
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
