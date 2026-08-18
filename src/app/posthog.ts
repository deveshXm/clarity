// Optimized PostHog server client with proper batching
import { PostHog } from 'posthog-node'

// Constructed lazily, and only when a project key is actually configured.
//
// `new PostHog(undefined)` throws. At module scope that turns a missing
// analytics key into a hard failure of every route that transitively imports
// this file — including `next build`, which evaluates route modules while
// collecting page data. Analytics is best-effort telemetry and must never be
// able to take down a request handler or a deploy, so when no key is present we
// hand back a no-op with the same surface instead.
type PostHogSurface = Pick<PostHog, 'capture' | 'captureException' | 'identify' | 'flush' | 'shutdown'>;

let client: PostHogSurface | null = null;

const noopClient: PostHogSurface = {
  capture: () => {},
  captureException: () => {},
  identify: () => {},
  flush: async () => {},
  shutdown: async () => {},
};

function getClient(): PostHogSurface {
  if (client) return client;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    client = noopClient;
    return client;
  }

  client = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 20,        // Batch 20 events before flushing (PostHog recommended)
    flushInterval: 10000, // Flush every 10 seconds (PostHog recommended)
    requestTimeout: 10000, // 10 second timeout
  });
  return client;
}

// Same call sites as before (`posthogClient.capture(...)`), but each call
// resolves the underlying client at call time rather than at import time.
const posthogClient: PostHogSurface = {
  capture: (...args) => getClient().capture(...args),
  captureException: (...args) => getClient().captureException(...args),
  identify: (...args) => getClient().identify(...args),
  flush: (...args) => getClient().flush(...args),
  shutdown: (...args) => getClient().shutdown(...args),
};

export default posthogClient;
