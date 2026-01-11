// Event definitions for backend API tracking only
// Frontend events handled automatically by PostHog autocapture
// Using category:object_action format as recommended by PostHog

export const EVENTS = {
  // === BACKEND API EVENTS ===
  API_SLACK_COMMAND_RECEIVED: 'api:slack_command_received',
  API_SLACK_EVENT_PROCESSED: 'api:slack_event_processed',
  API_SLACK_INTERACTIVE_RECEIVED: 'api:slack_interactive_received',
  API_SLACK_APP_UNINSTALLED: 'api:slack_app_uninstalled',
  API_AI_ANALYSIS_COMPLETED: 'api:ai_analysis_completed',
  API_MESSAGE_REPLACED: 'api:message_replaced',
  API_SUBSCRIPTION_CHECKOUT_CREATED: 'api:subscription_checkout_created',
  API_SUBSCRIPTION_PORTAL_ACCESSED: 'api:subscription_portal_accessed',
  API_STRIPE_WEBHOOK_PROCESSED: 'api:stripe_webhook_processed',
  
  // === AUTHENTICATION & ONBOARDING ===
  AUTH_SLACK_OAUTH_STARTED: 'auth:slack_oauth_started',
  AUTH_SLACK_OAUTH_COMPLETED: 'auth:slack_oauth_completed',
  AUTH_SLACK_OAUTH_FAILED: 'auth:slack_oauth_failed',
  ONBOARDING_USER_VALIDATED: 'onboarding:user_validated',
  ONBOARDING_CHANNELS_SAVED: 'onboarding:channels_saved',
  ONBOARDING_COMPLETED: 'onboarding:completed',
  
  // === FEATURE USAGE (Backend) ===
  FEATURE_AUTO_COACHING_TRIGGERED: 'feature:auto_coaching_triggered',
  FEATURE_MESSAGE_REPLACED: 'feature:message_replaced',
  FEATURE_PERSONAL_FEEDBACK_GENERATED: 'feature:personal_feedback_generated',
  FEATURE_SETTINGS_UPDATED: 'feature:settings_updated',
  FEATURE_FEEDBACK_SUBMITTED: 'feature:feedback_submitted',
  FEATURE_ADMIN_TRANSFERRED: 'feature:admin_transferred',
  
  // === USAGE LIMITS ===
  LIMITS_USAGE_LIMIT_REACHED: 'limits:usage_limit_reached',
  LIMITS_UPGRADE_PROMPT_SHOWN: 'limits:upgrade_prompt_shown',
  LIMITS_FEATURE_ACCESS_DENIED: 'limits:feature_access_denied',
  LIMITS_ONBOARDING_REQUIRED: 'limits:onboarding_required',

  // === REPORTS ===
  REPORT_VIEWED: 'report:viewed',
  
  // === ERRORS (Simplified) ===
  ERROR_SERVER: 'error:server_error',
  ERROR_SLACK_API: 'error:slack_api_error',
  ERROR_AI_FAILURE: 'error:ai_failure',
  ERROR_STRIPE_WEBHOOK: 'error:stripe_webhook_failed',
} as const;

export const ONBOARDING_STEPS = {
  FREQUENCY: 'frequency',
  CHANNELS: 'channels', 
  PAYMENT: 'payment',
} as const;

export const SLASH_COMMANDS = {
  PERSONAL_FEEDBACK: '/personalfeedback',
  REPHRASE: '/rephrase',
  SETTINGS: '/settings',
  HELP: '/clarity-help',
} as const;

export const SUBSCRIPTION_TIERS = {
  FREE: 'FREE',
  PRO: 'PRO',
} as const;

export const ERROR_CATEGORIES = {
  SERVER: 'server_error',
  SLACK_API: 'slack_api_error', 
  AI_FAILURE: 'ai_failure',
  STRIPE_WEBHOOK: 'stripe_webhook_failed',
} as const;

export const FEATURES = {
  AUTO_COACHING: 'autoCoaching',
  MANUAL_REPHRASE: 'manualRephrase',
  PERSONAL_FEEDBACK: 'personalFeedback',
} as const;
