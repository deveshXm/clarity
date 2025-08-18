import posthog from "posthog-js"

// Optimized PostHog client configuration for Next.js
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: '/clarity-ui96',
  ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  autocapture: true,  // ✅ Enable automatic frontend tracking
  capture_pageview: true,  // ✅ Enable automatic pageview tracking
  capture_pageleave: true,  // ✅ Enable session duration tracking
  capture_exceptions: true,
  debug: process.env.NODE_ENV === 'development',
  defaults: '2025-05-24',  // ✅ Enables SPA pageview tracking
  loaded: (posthog) => {
    // Enable debug mode in development
    if (process.env.NODE_ENV === 'development') {
      posthog.debug();
    }
  }
});
