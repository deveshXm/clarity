// Event definitions following PostHog best practices
// Using category:object_action format as recommended by PostHog

export const EVENTS = {
  // === MARKETING & CONVERSION ===
  MARKETING_LANDING_PAGE_VIEWED: 'marketing:landing_page_viewed',
  MARKETING_INSTALL_SLACK_CLICKED: 'marketing:install_slack_clicked',
  
  // === AUTHENTICATION ===
  AUTH_SLACK_OAUTH_STARTED: 'auth:slack_oauth_started',
  AUTH_SLACK_OAUTH_COMPLETED: 'auth:slack_oauth_completed',
  AUTH_SLACK_OAUTH_FAILED: 'auth:slack_oauth_failed',
  
  // === ONBOARDING ===
  ONBOARDING_STARTED: 'onboarding:started',
  ONBOARDING_STEP_COMPLETED: 'onboarding:step_completed',
  ONBOARDING_COMPLETED: 'onboarding:completed',
  
  // === SUBSCRIPTION ===
  SUBSCRIPTION_UPGRADE_CLICKED: 'subscription:upgrade_clicked',
  SUBSCRIPTION_CHECKOUT_STARTED: 'subscription:checkout_started',
  SUBSCRIPTION_CHECKOUT_COMPLETED: 'subscription:checkout_completed',
  SUBSCRIPTION_ACTIVATED: 'subscription:activated',
  SUBSCRIPTION_CANCELLED: 'subscription:cancelled',
  SUBSCRIPTION_BILLING_PORTAL_ACCESSED: 'subscription:billing_portal_accessed',
  
  // === FEATURE USAGE ===
  FEATURE_AUTO_COACHING_TRIGGERED: 'feature:auto_coaching_triggered',
  FEATURE_MESSAGE_REPLACED: 'feature:message_replaced',
  FEATURE_MESSAGE_KEPT_ORIGINAL: 'feature:message_kept_original',
  FEATURE_SLASH_COMMAND_USED: 'feature:slash_command_used',
  FEATURE_PERSONAL_FEEDBACK_REQUESTED: 'feature:personal_feedback_requested',
  
  // === USER SETTINGS ===
  SETTINGS_OPENED: 'settings:opened',
  SETTINGS_UPDATED: 'settings:updated',
  
  // === USAGE LIMITS ===
  LIMITS_USAGE_LIMIT_REACHED: 'limits:usage_limit_reached',
  LIMITS_UPGRADE_PROMPT_SHOWN: 'limits:upgrade_prompt_shown',
  LIMITS_FEATURE_ACCESS_DENIED: 'limits:feature_access_denied',
  
  // === ERRORS ===
  ERROR_API_ERROR: 'error:api_error',
  ERROR_AI_ANALYSIS_FAILED: 'error:ai_analysis_failed',
  ERROR_STRIPE_WEBHOOK_FAILED: 'error:stripe_webhook_failed',
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

export const FEATURES = {
  AUTO_COACHING: 'autoCoaching',
  MANUAL_REPHRASE: 'manualRephrase',
  PERSONAL_FEEDBACK: 'personalFeedback',
} as const;
