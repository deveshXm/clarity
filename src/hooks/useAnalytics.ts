// Simplified client-side PostHog hook
// Direct posthog-js usage following best practices

'use client';

import { useCallback } from 'react';
import posthog from 'posthog-js';

export interface UsePostHogReturn {
  track: (eventName: string, properties?: Record<string, unknown>) => void;
  identify: (userId: string, properties?: Record<string, unknown>) => void;
  trackError: (error: Error, context?: Record<string, unknown>) => void;
  isEnabled: boolean;
}

export function usePostHog(): UsePostHogReturn {
  // Simple environment check
  const isEnabled = typeof window !== 'undefined' && posthog.__loaded;

  const track = useCallback((
    eventName: string, 
    properties: Record<string, unknown> = {}
  ) => {
    if (!isEnabled) return;

    try {
      posthog.capture(eventName, {
        ...properties,
        // PostHog automatically adds common properties
        source: 'client',
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 PostHog event:', eventName, properties);
      }
    } catch (error) {
      console.error('PostHog tracking error:', error);
    }
  }, [isEnabled]);

  const identify = useCallback((
    userId: string, 
    properties: Record<string, unknown> = {}
  ) => {
    if (!isEnabled) return;

    try {
      posthog.identify(userId, properties);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('👤 PostHog identify:', userId, properties);
      }
    } catch (error) {
      console.error('PostHog identify error:', error);
    }
  }, [isEnabled]);

  const trackError = useCallback((
    error: Error, 
    context: Record<string, unknown> = {}
  ) => {
    if (!isEnabled) return;

    try {
      posthog.capture('error:client_error', {
        error_name: error.name,
        error_message: error.message,
        error_stack: error.stack,
        source: 'client',
        ...context,
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🚨 PostHog error:', error.message, context);
      }
    } catch (trackingError) {
      console.error('PostHog error tracking failed:', trackingError);
    }
  }, [isEnabled]);

  return {
    track,
    identify,
    trackError,
    isEnabled,
  };
}
