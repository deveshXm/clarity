import posthog from "posthog-js"

// Optimized PostHog client configuration for Next.js
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: '/clarity-ui96',
  autocapture: false,  // Manual control in Next.js (PostHog recommended)
  capture_pageview: false,  // Manual control for better tracking
  capture_exceptions: true,
  debug: process.env.NODE_ENV === 'development',
  defaults: '2025-05-24',
  loaded: (posthog) => {
    // Enable debug mode in development
    if (process.env.NODE_ENV === 'development') {
      posthog.debug();
    }
  }
});
