import { createAzure } from '@ai-sdk/azure';

// Model that powers the simulated teammate + judge agents. This is NOT the
// agent under test — Clarity's coaching agent runs through its own Portkey
// client (see src/lib/ai.ts). We reuse the same Azure OpenAI resource the app
// and companion bots already use. Passed directly to each agent so it works
// regardless of scenario.config.mjs auto-discovery under the vitest runner.
const resourceName =
  process.env.AZURE_RESOURCE_NAME ||
  (process.env.AZURE_API_ENDPOINT
    ? new URL(process.env.AZURE_API_ENDPOINT).hostname.split('.')[0]
    : undefined);

// Fetch wrapper that aborts a request after a hard timeout. Some environments
// sit behind an egress-auth proxy that can hang outbound HTTPS indefinitely; a
// hung judge/simulator call would otherwise stall a scenario for many minutes.
// Aborting lets the AI SDK's bounded retry kick in instead.
const REQUEST_TIMEOUT_MS = Number(process.env.SCENARIO_REQUEST_TIMEOUT_MS || 60_000);
const timeoutFetch: typeof fetch = async (input, init) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};

const azure = createAzure({
  resourceName,
  apiKey: process.env.AZURE_API_KEY,
  apiVersion: process.env.AZURE_API_VERSION || '2024-12-01-preview',
  // Use classic /openai/deployments/{model}/... URLs. The provider otherwise
  // defaults to the newer /openai/v1/ surface, which this resource's
  // api-version rejects with "API version not supported".
  useDeploymentBasedUrls: true,
  fetch: timeoutFetch,
});

// Use .chat() (chat-completions API) rather than the default callable, which
// routes to the Responses API (/openai/v1/responses) — unsupported on this
// resource's api-version. Chat completions is the path the companion bots use.
export const scenarioModel = azure.chat(process.env.SCENARIO_MODEL || 'gpt-5-mini');
