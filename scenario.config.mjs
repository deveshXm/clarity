// LangWatch Scenario config — defines the model used by the user-simulator and
// judge agents (NOT the agent under test; Clarity's coaching agent runs through
// its own Portkey client). We reuse the same Azure OpenAI resource the app and
// companion bots already use, so no new provider/key is needed.
import dotenv from 'dotenv';
import { defineConfig } from '@langwatch/scenario';
import { createAzure } from '@ai-sdk/azure';

dotenv.config({ path: '.env.local' });

// Derive the Azure resource name (e.g. "deveshai3038897120") from the endpoint
// unless explicitly overridden.
const resourceName =
  process.env.AZURE_RESOURCE_NAME ||
  (process.env.AZURE_API_ENDPOINT
    ? new URL(process.env.AZURE_API_ENDPOINT).hostname.split('.')[0]
    : undefined);

const azure = createAzure({
  resourceName,
  apiKey: process.env.AZURE_API_KEY,
  apiVersion: process.env.AZURE_API_VERSION || '2024-12-01-preview',
});

// Deployment used to power the simulated teammate + judge. gpt-5-mini is the
// deployment the companion bots already use successfully on this resource.
export default defineConfig({
  defaultModel: {
    // .chat() forces the chat-completions API; the default callable routes to
    // the Responses API which this resource's api-version rejects.
    model: azure.chat(process.env.SCENARIO_MODEL || 'gpt-5-mini'),
  },
});
