// Optimized PostHog server client with proper batching
import { PostHog } from 'posthog-node'

// Single PostHog instance following best practices
const posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 20,        // Batch 20 events before flushing (PostHog recommended)
  flushInterval: 10000, // Flush every 10 seconds (PostHog recommended)
  requestTimeout: 10000, // 10 second timeout
});

export default posthogClient;