import { z } from 'zod';

// MESSAGE ANALYSIS TYPES CONSTANT
export const MESSAGE_ANALYSIS_TYPES = {
    1: { key: 'pushiness', name: 'Pushiness', description: 'Overly aggressive or demanding communication' },
    2: { key: 'vagueness', name: 'Vagueness', description: 'Unclear or imprecise communication' },
    3: { key: 'nonObjective', name: 'Non-Objective', description: 'Subjective or biased communication' },
    4: { key: 'circular', name: 'Circular', description: 'Repetitive or circular reasoning' },
    5: { key: 'rudeness', name: 'Rudeness', description: 'Impolite or discourteous communication' },
    6: { key: 'passiveAggressive', name: 'Passive-Aggressive', description: 'Indirect expression of negative feelings' },
    7: { key: 'fake', name: 'Fake', description: 'Insincere or inauthentic communication' },
    8: { key: 'oneLiner', name: 'One-Liner', description: 'Overly brief or dismissive responses' },
} as const;

// BASIC USER SCHEMA (defined first for use in Slack schemas)
export const UserSchema = z.object({
    _id: z.string(),
    id: z.string(),
    email: z.string().email().nullable(), // Allow null for users who haven't provided email
    name: z.string(),
    image: z.string().url().optional(),
    emailVerified: z.boolean(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    // Our custom field for onboarding
    hasCompletedOnboarding: z.boolean().optional(),
});

export const CreateUserSchema = UserSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const UpdateUserSchema = UserSchema.partial().omit({ id: true, createdAt: true, updatedAt: true });

// SLACK-RELATED SCHEMAS

// Workspace Schema
export const WorkspaceSchema = z.object({
    _id: z.string(),
    workspaceId: z.string(), // Slack team ID
    name: z.string(),
    domain: z.string().optional(),
    botToken: z.string(), // Workspace-specific bot token from OAuth
    isActive: z.boolean().default(true), // Track if workspace is active
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

export const CreateWorkspaceSchema = WorkspaceSchema.omit({ _id: true, createdAt: true, updatedAt: true });

// Bot Channels Schema (tracks which channels bot is active in)
export const BotChannelSchema = z.object({
    _id: z.string(),
    workspaceId: z.string(),
    channelId: z.string(),
    channelName: z.string(),
    addedAt: z.coerce.date(),
});



// Subscription Schema
export const SubscriptionSchema = z.object({
    // Tier and billing info
    tier: z.enum(['FREE', 'PRO']).default('FREE'),
    status: z.enum(['active', 'cancelled', 'past_due']).default('active'),
    
    // Billing cycle (for usage reset)
    currentPeriodStart: z.coerce.date(),
    currentPeriodEnd: z.coerce.date(),
    
    // Stripe integration
    stripeCustomerId: z.string().optional(),
    stripeSubscriptionId: z.string().optional(),
    
    // Usage tracking (resets on billing cycle)
    monthlyUsage: z.object({
        autoCoaching: z.number().default(0),
        manualRephrase: z.number().default(0),
        personalFeedback: z.number().default(0),
    }),
    
    // Timestamps
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

// Slack User Schema (extends base User)
export const SlackUserSchema = UserSchema.extend({
    slackId: z.string(),
    workspaceId: z.string(),
    displayName: z.string(),
    timezone: z.string().optional(),
    userToken: z.string().optional(), // User's OAuth token for message updating
    isActive: z.boolean().default(true),
    analysisFrequency: z.enum(['weekly', 'monthly']).default('weekly'),
    autoCoachingDisabledChannels: z.array(z.string()).default([]), // Channel IDs where user has disabled auto-coaching
    hasCompletedOnboarding: z.boolean().default(false),
    subscription: SubscriptionSchema.optional(), // Subscription data
});

export const CreateSlackUserSchema = SlackUserSchema.omit({ _id: true, id: true, createdAt: true, updatedAt: true });

// Analysis Instance Schema
export const AnalysisInstanceSchema = z.object({
    _id: z.string(),
    userId: z.string(),
    workspaceId: z.string(),
    channelId: z.string(),
    messageTs: z.string(), // Slack timestamp
    text: z.string(),
    target: z.object({
        name: z.string(),
        slackId: z.string(),
    }),
    typeId: z.number().min(1).max(8),
    type: z.enum(['pushiness', 'vagueness', 'nonObjective', 'circular', 'rudeness', 'passiveAggressive', 'fake', 'oneLiner']),
    createdAt: z.coerce.date(),
});

export const CreateAnalysisInstanceSchema = AnalysisInstanceSchema.omit({ _id: true, createdAt: true });

// Invitation Schema
export const InvitationSchema = z.object({
    _id: z.string(),
    email: z.string().email(),
    workspaceId: z.string(),
    invitedBy: z.string(), // userId
    status: z.enum(['pending', 'accepted', 'expired']).default('pending'),
    token: z.string(),
    expiresAt: z.coerce.date(),
    createdAt: z.coerce.date(),
});

export const CreateInvitationSchema = InvitationSchema.omit({ _id: true, createdAt: true });

// AI FUNCTION TYPES

// Message Analysis Result
export const MessageAnalysisResultSchema = z.object({
    flags: z.array(z.object({
        typeId: z.number().min(1).max(8),
        type: z.enum(['pushiness', 'vagueness', 'nonObjective', 'circular', 'rudeness', 'passiveAggressive', 'fake', 'oneLiner']),
        confidence: z.number().min(0).max(1),
        explanation: z.string(),
    })),
    target: z.object({
        name: z.string(),
        slackId: z.string(),
    }).optional(),
});

// Improved Message Result
export const ImprovedMessageResultSchema = z.object({
    originalMessage: z.string(),
    improvedMessage: z.string(),
    improvements: z.array(z.string()),
    tone: z.enum(['professional', 'friendly', 'direct', 'collaborative']),
});

// Comprehensive Analysis Result (Single AI Call)
export const ComprehensiveAnalysisResultSchema = z.object({
    needsCoaching: z.boolean(),
    flags: z.array(z.object({
        typeId: z.number().min(1).max(8),
        type: z.enum(['pushiness', 'vagueness', 'nonObjective', 'circular', 'rudeness', 'passiveAggressive', 'fake', 'oneLiner']),
        confidence: z.number().min(0).max(1),
        explanation: z.string(),
    })),
    target: z.object({
        name: z.string(),
        slackId: z.string(),
    }).nullable(),
    improvedMessage: z.object({
        originalMessage: z.string(),
        improvedMessage: z.string(),
        improvements: z.array(z.string()),
        tone: z.enum(['professional', 'friendly', 'direct', 'collaborative']),
    }).nullable(),
    reasoning: z.object({
        whyNeedsCoaching: z.string(),
        primaryIssue: z.string(),
        contextInfluence: z.string(),
    }),
});

// Personal Feedback Result
export const PersonalFeedbackResultSchema = z.object({
    overallScore: z.number().min(0).max(10),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
    patterns: z.array(z.object({
        type: z.string(),
        frequency: z.number(),
        examples: z.array(z.string()),
    })),
    recommendations: z.array(z.string()),
});

// Report Generation Result
export const ReportResultSchema = z.object({
    userId: z.string(),
    period: z.enum(['weekly', 'monthly']),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    totalMessages: z.number(),
    flaggedMessages: z.number(),
    improvementRate: z.number().min(0).max(100),
    topIssues: z.array(z.object({
        type: z.string(),
        count: z.number(),
        percentage: z.number(),
    })),
    recommendations: z.array(z.string()),
});

// SLACK API TYPES

// Slack OAuth Response
export const SlackOAuthResponseSchema = z.object({
    ok: z.boolean(),
    access_token: z.string(),
    token_type: z.string(),
    scope: z.string(),
    bot_user_id: z.string(),
    app_id: z.string(),
    team: z.object({
        id: z.string(),
        name: z.string(),
    }),
    enterprise: z.object({
        id: z.string(),
        name: z.string(),
    }).optional(),
    authed_user: z.object({
        id: z.string(),
        scope: z.string(),
        access_token: z.string(),
        token_type: z.string(),
    }),
});

// Slack Event Types
export const SlackEventSchema = z.object({
    type: z.string(),
    channel: z.string(),
    user: z.string(),
    text: z.string(),
    ts: z.string(),
    event_ts: z.string(),
    channel_type: z.string(),
});

// Better Auth User type (already defined above)

// Account Configuration Schemas (simplified for boilerplate)
export const AccountConfigSchema = z.object({
    _id: z.string(),
    userId: z.string(),
    companyName: z.string().min(1, 'Company name is required'),
    websiteUrl: z.string().url('Please provide a valid website URL').optional(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

export const CreateAccountConfigSchema = AccountConfigSchema.omit({ _id: true, createdAt: true, updatedAt: true });
export const UpdateAccountConfigSchema = AccountConfigSchema.partial().omit({ _id: true, userId: true, createdAt: true, updatedAt: true });

// Onboarding Schemas (simplified for boilerplate)
export const AccountConfigFormDataSchema = z.object({
    companyName: z.string().min(1, 'Company name is required'),
    websiteUrl: z.string().url('Please provide a valid website URL').optional(),
});

// Example task schemas for boilerplate
export const ExampleTaskTypeSchema = z.enum(['example']);

export const ExampleTaskInputSchema = z.object({
    userId: z.string(),
    taskId: z.string(),
    type: ExampleTaskTypeSchema,
});

// INFERRED TYPES

// Message Analysis Types
export type MessageAnalysisType = keyof typeof MESSAGE_ANALYSIS_TYPES;
export type MessageAnalysisTypeInfo = typeof MESSAGE_ANALYSIS_TYPES[keyof typeof MESSAGE_ANALYSIS_TYPES];

// Slack Types
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;
export type BotChannel = z.infer<typeof BotChannelSchema>;

export type Subscription = z.infer<typeof SubscriptionSchema>;
export type SlackUser = z.infer<typeof SlackUserSchema>;
export type CreateSlackUserInput = z.infer<typeof CreateSlackUserSchema>;
export type AnalysisInstance = z.infer<typeof AnalysisInstanceSchema>;
export type CreateAnalysisInstanceInput = z.infer<typeof CreateAnalysisInstanceSchema>;
export type Invitation = z.infer<typeof InvitationSchema>;
export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>;

// AI Function Types
export type MessageAnalysisResult = z.infer<typeof MessageAnalysisResultSchema>;
export type ImprovedMessageResult = z.infer<typeof ImprovedMessageResultSchema>;
export type ComprehensiveAnalysisResult = z.infer<typeof ComprehensiveAnalysisResultSchema>;
export type PersonalFeedbackResult = z.infer<typeof PersonalFeedbackResultSchema>;
export type ReportResult = z.infer<typeof ReportResultSchema>;

// Slack Channel Selection Types
export const SlackChannelSchema = z.object({
    id: z.string(),
    name: z.string(),
    is_private: z.boolean(),
    is_member: z.boolean(),
    is_archived: z.boolean(),
});

// Slack API Types
export type SlackOAuthResponse = z.infer<typeof SlackOAuthResponseSchema>;
export type SlackEvent = z.infer<typeof SlackEventSchema>;
export type SlackChannel = z.infer<typeof SlackChannelSchema>;

// User
export type User = z.infer<typeof UserSchema>;

// Account Config
export type AccountConfig = z.infer<typeof AccountConfigSchema>;
export type AccountConfigFormData = z.infer<typeof AccountConfigFormDataSchema>;
export type CreateAccountConfigInput = z.infer<typeof CreateAccountConfigSchema>;
export type UpdateAccountConfigInput = z.infer<typeof UpdateAccountConfigSchema>;

// Example Task (for boilerplate)
export type ExampleTaskType = (typeof ExampleTaskTypeSchema)['Enum'];
export type ExampleTaskInput = z.infer<typeof ExampleTaskInputSchema>;

// SUBSCRIPTION SYSTEM TYPES & CONFIG

// Subscription Tiers Configuration
export const SUBSCRIPTION_TIERS = {
  FREE: {
    name: 'Free',
    price: 0,
    description: 'Quick start with core coaching.',
    priceLabel: '/ forever',
    monthlyLimits: {
      autoCoaching: 50,        // messages per month
      manualRephrase: 50,      // messages per month  
      personalFeedback: 1,     // personal feedback reports per month
    },
    features: {
      reports: true,      // Paid only
      advancedReportAnalytics: false // Paid only
    },
    displayFeatures: [
      {
        name: 'Auto coaching suggestions',
        description: 'Get instant, private suggestions to improve your messages',
        included: true,
        limit: 50,
        limitLabel: 'auto coaching/month'
      },
      {
        name: 'Manual rephrase',
        description: 'Use /rephrase command to improve specific messages',
        included: true,
        limit: 50,
        limitLabel: 'manual rephrase/month'
      },
      {
        name: 'Personal feedback reports',
        description: 'Get detailed analysis of your communication patterns',
        included: true,
        limit: 1,
        limitLabel: 'personal feedback/month'
      },
      {
        name: 'Basic tone guardrails',
        description: 'Prevent common communication issues',
        included: true,
        limitLabel: 'Basic tone guardrails'
      }
    ]
  },
  PRO: {
    name: 'Pro', 
    price: 4.99, // $4.99/month
    description: 'Advanced, context-aware coaching.',
    priceLabel: '/ month',
    monthlyLimits: {
      autoCoaching: 1000,        // messages per month
      manualRephrase: 1000,      // messages per month  
      personalFeedback: 1,    // personal feedback reports per month
    },
    features: {
      reports: true,       // Enabled
      advancedReportAnalytics: true  // Enabled
    },
    displayFeatures: [
      {
        name: 'Auto coaching suggestions',
        description: 'Get instant, private suggestions to improve your messages',
        included: true,
        limit: 1000,
        limitLabel: 'auto coaching/month'
      },
      {
        name: 'Manual rephrase',
        description: 'Use /rephrase command to improve specific messages',
        included: true,
        limit: 1000,
        limitLabel: 'manual rephrase/month'
      },
      {
        name: 'Personal feedback reports',
        description: 'Get detailed analysis of your communication patterns',
        included: true,
        limit: 1,
        limitLabel: 'personal feedback/month'
      },
      {
        name: 'Advanced report analytics',
        description: 'Deep insights and trends in your communication',
        included: true,
        limitLabel: 'Advanced report analytics'
      }
    ]
  }
} as const;

// Subscription Types
export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;
export type SubscriptionFeature = keyof typeof SUBSCRIPTION_TIERS.FREE.monthlyLimits | keyof typeof SUBSCRIPTION_TIERS.FREE.features;

// Subscription Check Result
export interface SubscriptionCheckResult {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
  user?: SlackUser;
  remainingUsage?: number;
  resetDate?: Date;
}

// Stripe Price IDs Configuration
export const STRIPE_PRICE_IDS = {
  PRO_MONTHLY: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly',
} as const;

// Helper functions for subscription management
export function getTierConfig(tier: SubscriptionTier) {
  return SUBSCRIPTION_TIERS[tier];
}

export function isRateLimitedFeature(feature: string): feature is keyof typeof SUBSCRIPTION_TIERS.FREE.monthlyLimits {
  return feature in SUBSCRIPTION_TIERS.FREE.monthlyLimits;
}

export function isPaidFeature(feature: string): feature is keyof typeof SUBSCRIPTION_TIERS.FREE.features {
  return feature in SUBSCRIPTION_TIERS.FREE.features;
}

// Server Action Result Type
export interface ServerActionResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    fieldErrors?: Record<string, string[]>;
} 