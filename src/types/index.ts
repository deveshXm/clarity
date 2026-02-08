import { z } from 'zod';

// COACHING FLAGS SCHEMA & DEFAULTS
export const CoachingFlagSchema = z.object({
    name: z.string().max(50),
    description: z.string().max(200),
    enabled: z.boolean(),
});

export type CoachingFlag = z.infer<typeof CoachingFlagSchema>;

export const DEFAULT_COACHING_FLAGS: CoachingFlag[] = [
    { name: 'Pushiness', description: 'Overly aggressive or demanding tone', enabled: true },
    { name: 'Vagueness', description: 'Unclear or imprecise requests', enabled: true },
    { name: 'Non-Objective', description: 'Subjective or biased communication', enabled: true },
    { name: 'Circular', description: 'Repetitive or circular reasoning', enabled: true },
    { name: 'Rudeness', description: 'Impolite or discourteous communication', enabled: true },
    { name: 'Passive-Aggressive', description: 'Indirect expression of negative feelings', enabled: true },
    { name: 'Fake', description: 'Insincere or inauthentic communication', enabled: false },
    { name: 'One-Liner', description: 'Overly brief or dismissive responses', enabled: false },
];

export const MAX_COACHING_FLAGS = 15;

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

// Subscription Schema (defined first for use in Workspace)
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

    // Usage tracking (resets on billing cycle) - workspace-wide shared limits
    monthlyUsage: z.object({
        autoCoaching: z.number().default(0),
        manualRephrase: z.number().default(0),
    }),

    // Timestamps
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

// Workspace Schema - Enhanced with admin and subscription (workspace-wide)
export const WorkspaceSchema = z.object({
    _id: z.string(),
    workspaceId: z.string(), // Slack team ID
    name: z.string(),
    domain: z.string().optional(),
    botToken: z.string(), // Workspace-specific bot token from OAuth
    botUserId: z.string().optional(), // Bot's Slack user ID (for DM deep links)
    
    // Admin & Onboarding
    adminSlackId: z.string(), // Slack ID of workspace admin (installer)
    hasCompletedOnboarding: z.boolean().default(false), // Workspace-level onboarding
    
    // Workspace-level subscription (shared by all users)
    subscription: SubscriptionSchema.optional(),
    
    isActive: z.boolean().default(true), // Track if workspace is active
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

export const CreateWorkspaceSchema = WorkspaceSchema.omit({ _id: true, createdAt: true, updatedAt: true });

// Context message stored per channel (FIFO queue of 20)
export const ContextMessageSchema = z.object({
    text: z.string(),
    user: z.string(),
    ts: z.string(),
});

// Bot Channels Schema (tracks which channels bot is active in)
export const BotChannelSchema = z.object({
    _id: z.string(),
    workspaceId: z.string(),
    channelId: z.string(),
    channelName: z.string(),
    context: z.array(ContextMessageSchema).default([]),
    addedAt: z.coerce.date(),
});

// Slack User Schema - Simplified for personal preferences only
// Subscription and onboarding status are now workspace-level
export const SlackUserSchema = z.object({
    _id: z.string(),
    slackId: z.string(),
    workspaceId: z.string(), // References workspace._id
    email: z.string().email().nullable().optional(), // Fetched from Slack API
    name: z.string(),
    displayName: z.string(),
    image: z.string().url().optional(),
    userToken: z.string().optional(), // User's OAuth token for message updating
    
    // Personal preferences
    autoCoachingEnabledChannels: z.array(z.string()).default([]), // Channel IDs where user has enabled auto-coaching
    coachingFlags: z.array(CoachingFlagSchema).default([]), // User's coaching flags (seeded from defaults)
    
    isActive: z.boolean().default(true),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

export const CreateSlackUserSchema = SlackUserSchema.omit({ _id: true, createdAt: true, updatedAt: true });

// Analysis Instance Schema - Multiple flags per message
export const AnalysisInstanceSchema = z.object({
    _id: z.string(),
    userId: z.string(), // MongoDB ObjectId as string
    workspaceId: z.string(),
    channelId: z.string(),
    messageTs: z.string(), // Slack timestamp for deep linking
    flagIds: z.array(z.number().min(1).max(15)), // Multiple flags per message (up to 15 custom flags)
    originalMessage: z.string(), // Original message text that was analyzed
    rephrasedMessage: z.string(), // AI-generated improved message
    createdAt: z.coerce.date(),
});

export const CreateAnalysisInstanceSchema = AnalysisInstanceSchema.omit({ _id: true, createdAt: true });

// Helper function for coaching flags
export function getEnabledFlags(flags: CoachingFlag[]): CoachingFlag[] {
    return flags.filter(f => f.enabled);
}

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

// Slack Types
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;
export type BotChannel = z.infer<typeof BotChannelSchema>;
export type ContextMessage = z.infer<typeof ContextMessageSchema>;

export type Subscription = z.infer<typeof SubscriptionSchema>;
export type SlackUser = z.infer<typeof SlackUserSchema>;
export type CreateSlackUserInput = z.infer<typeof CreateSlackUserSchema>;
export type AnalysisInstance = z.infer<typeof AnalysisInstanceSchema>;
export type CreateAnalysisInstanceInput = z.infer<typeof CreateAnalysisInstanceSchema>;
export type Invitation = z.infer<typeof InvitationSchema>;
export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>;

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
export type ExampleTaskType = z.infer<typeof ExampleTaskTypeSchema>;
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
            autoCoaching: 20,        // messages per month
            manualRephrase: 50,      // messages per month  
        },
        features: {
            customFlags: false,      // Paid only - custom coaching flags
        },
        displayFeatures: [
            {
                name: 'Auto coaching suggestions',
                description: 'Get instant, private suggestions to improve your messages',
                included: true,
                limit: 500,
                limitLabel: '50 auto coaching suggestions. Only counts when message is flagged.'
            },
            {
                name: 'Manual rephrase',
                description: 'Use /rephrase command to improve specific messages',
                included: true,
                limit: 500,
                limitLabel: '50 manual rephrase uses'
            },
            {
                name: 'Default coaching flags',
                description: 'Use pre-defined coaching focus areas',
                included: true,
                limitLabel: 'Default flags only'
            },
        ]
    },
    PRO: {
        name: 'Pro',
        price: 4.99, // $4.99/month
        description: 'Advanced, context-aware coaching.',
        priceLabel: '/ month',
        monthlyLimits: {
            autoCoaching: 200,        // messages per month
            manualRephrase: 200,      // messages per month  
        },
        features: {
            customFlags: true,       // Enabled - custom coaching flags
        },
        displayFeatures: [
            {
                name: 'Auto coaching suggestions',
                description: 'Get instant, private suggestions to improve your messages',
                included: true,
                limit: 500,
                limitLabel: '50 auto coaching suggestions'
            },
            {
                name: 'Manual rephrase',
                description: 'Use /rephrase command to improve specific messages',
                included: true,
                limit: 500,
                limitLabel: '50 manual rephrase uses'
            },
            {
                name: 'Custom coaching flags',
                description: 'Create and customize your own coaching focus areas',
                included: true,
                limitLabel: 'Up to 15 custom flags'
            },
            {
                name: 'Advanced reasoning model',
                description: 'Get more accurate analysis of your communication',
                included: true,
                limitLabel: 'Access to advanced reasoning model'
            }
        ]
    }
} as const;

// Subscription Types
export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;
export type SubscriptionFeature = keyof typeof SUBSCRIPTION_TIERS.FREE.monthlyLimits | keyof typeof SUBSCRIPTION_TIERS.FREE.features;

// Subscription Check Result - Now based on workspace subscription
export interface SubscriptionCheckResult {
    allowed: boolean;
    reason?: string;
    upgradeRequired?: boolean;
    workspace?: Workspace;
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