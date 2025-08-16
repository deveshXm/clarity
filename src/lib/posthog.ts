// Simplified PostHog wrapper following best practices
// Direct PostHog usage with minimal abstraction

import posthogClient from '@/app/posthog';

// Environment check for tracking
function shouldTrack(): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';
  const hasDebugFlag = process.env.POSTHOG_DEBUG === 'true';
  
  return isProduction || (isDevelopment && hasDebugFlag);
}

// Server-side event tracking
export function trackEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {}
): void {
  if (!shouldTrack()) return;

  try {
    posthogClient.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        // Add environment context
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Fail silently for analytics - don't break app functionality
    console.error('PostHog tracking error:', error);
  }
}

// Server-side user identification
export function identifyUser(
  distinctId: string,
  properties: Record<string, unknown> = {}
): void {
  if (!shouldTrack()) return;

  try {
    posthogClient.identify({
      distinctId,
      properties: {
        ...properties,
        environment: process.env.NODE_ENV,
        identified_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('PostHog identify error:', error);
  }
}

// Server-side error tracking
export function trackError(
  distinctId: string,
  error: Error,
  context: Record<string, unknown> = {}
): void {
  if (!shouldTrack()) return;

  try {
    posthogClient.capture({
      distinctId,
      event: 'error:server_error',
      properties: {
        error_name: error.name,
        error_message: error.message,
        error_stack: error.stack,
        ...context,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (trackingError) {
    console.error('PostHog error tracking failed:', trackingError);
  }
}

// Graceful shutdown
export async function flushAndShutdown(): Promise<void> {
  try {
    await posthogClient.flush();
    await posthogClient.shutdown();
  } catch (error) {
    console.error('PostHog shutdown error:', error);
  }
}
