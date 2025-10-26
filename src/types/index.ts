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

// Communication Scores Schema (stored on Slack user)
export const CommunicationScoreEntrySchema = z.object({
    score: z.number().min(0).max(100),
    reportId: z.string().optional(),
    updatedAt: z.coerce.date(),
});

export const CommunicationScoresSchema = z.object({
    weekly: CommunicationScoreEntrySchema.optional(),
    monthly: CommunicationScoreEntrySchema.optional(),
}).optional();

// Slack User Schema (extends base User)
export const SlackUserSchema = UserSchema.extend({
    slackId: z.string(),
    workspaceId: z.string(),
    displayName: z.string(),
    timezone: z.string().optional(),
    userToken: z.string().optional(), // User's OAuth token for message updating
    isActive: z.boolean().default(true),
    analysisFrequency: z.enum(['weekly', 'monthly']).default('weekly'),
    autoCoachingEnabledChannels: z.array(z.string()).default([]), // Channel IDs where user has enabled auto-coaching
    hasCompletedOnboarding: z.boolean().default(false),
    subscription: SubscriptionSchema.optional(), // Subscription data
    communicationScores: CommunicationScoresSchema, // Latest weekly/monthly scores
});

export const CreateSlackUserSchema = SlackUserSchema.omit({ _id: true, id: true, createdAt: true, updatedAt: true });

// Analysis Instance Schema - Multiple flags per message (Privacy-First: No Message Text)
export const AnalysisInstanceSchema = z.object({
    _id: z.string(),
    userId: z.string(), // MongoDB ObjectId as string
    workspaceId: z.string(),
    channelId: z.string(),
    messageTs: z.string(), // Slack timestamp for deep linking
    flagIds: z.array(z.number().min(1).max(8)), // 🎯 Multiple flags per message
    targetIds: z.array(z.string()).default([]), // 🎯 Multiple target Slack user IDs
    issueDescription: z.string(), // AI-extracted description of what's wrong (no confidential info)
    createdAt: z.coerce.date(),
    aiMetadata: z.object({
        primaryFlagId: z.number().min(1).max(8),
        confidence: z.number().min(0).max(1),
        reasoning: z.string(),
        suggestedTone: z.string().optional(),
    }).optional(),
});

export const CreateAnalysisInstanceSchema = AnalysisInstanceSchema.omit({ _id: true, createdAt: true });

// Report Storage Schema - Optimized with Pre-calculated Metadata
export const ReportSchema = z.object({
    _id: z.string(),
    reportId: z.string(), // 🔐 Long unguessable ID
    userId: z.string(),
    workspaceId: z.string(), // Slack team ID for deep links
    period: z.enum(['weekly', 'monthly']),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),

    // 🎯 Communication scoring (0–10, AI-generated)
    communicationScore: z.number().min(0).max(10),
    previousScore: z.number().min(0).max(10).optional(),
    scoreChange: z.number(),
    scoreTrend: z.enum(['improving', 'declining', 'stable']),

    // 📊 Current period analytics (this week/month only)
    currentPeriod: z.object({
        totalMessages: z.number(),
        flaggedMessages: z.number(),
        flaggedMessageIds: z.array(z.string()), // Store IDs for deep linking

        // 🏷️ Flag breakdown for current period
        flagBreakdown: z.array(z.object({
            flagId: z.number().min(1).max(8),
            count: z.number(),
            percentage: z.number(),
            messageIds: z.array(z.string()), // Specific messages for examples
        })),

        // 🤝 Partner analysis for current period
        partnerAnalysis: z.array(z.object({
            partnerName: z.string(),
            partnerSlackId: z.string(),
            messagesExchanged: z.number(),
            flagsWithPartner: z.number(),
            topIssues: z.array(z.number()), // Flag IDs
            relationshipScore: z.number().min(0).max(100),
        })),
    }),

    // 📈 Pre-calculated chart data (no need to recalculate)
    chartMetadata: z.object({
        flagTrends: z.array(z.object({
            flagId: z.number().min(1).max(8),
            currentCount: z.number(),
            previousCount: z.number(),
            trend: z.enum(['up', 'down', 'stable']),
            changePercent: z.number(),
        })),

        scoreHistory: z.array(z.object({
            period: z.string(), // "2025-W03", "2025-01"
            score: z.number(),
        })),

        partnerTrends: z.array(z.object({
            partnerName: z.string(),
            partnerSlackId: z.string(),
            currentFlags: z.number(),
            previousFlags: z.number(),
            trend: z.enum(['improving', 'declining', 'stable']),
        })),

        instancesTrend: z.object({
            labels: z.array(z.string()),
            current: z.array(z.number()),
            previous: z.array(z.number()),
        }).optional(),
    }),

    // 💬 Message examples (privacy-compliant, limited to current period)
    messageExamples: z.array(z.object({
        messageTs: z.string(),
        channelId: z.string(),
        flagIds: z.array(z.number()),
        summary: z.string(),
        targetName: z.string().optional(),
        improvement: z.string().optional(),
    })),

    // 💡 AI recommendations (based on current vs previous report comparison)
    recommendations: z.array(z.string()),
    keyInsights: z.array(z.string()),

    // 🏆 Achievements and milestones
    achievements: z.array(z.object({
        type: z.string(),
        description: z.string(),
        icon: z.string(),
    })),

    createdAt: z.coerce.date(),
    expiresAt: z.coerce.date(), // 🗑️ Auto-cleanup after 90 days
});

// Helper functions using MESSAGE_ANALYSIS_TYPES
export function getFlagInfo(flagId: number) {
    return MESSAGE_ANALYSIS_TYPES[flagId as keyof typeof MESSAGE_ANALYSIS_TYPES];
}

export function getFlagEmoji(flagId: number): string {
    const emojiMap = {
        1: '🚀', // pushiness - aggressive
        2: '❓', // vagueness - unclear
        3: '⚖️', // non-objective - biased
        4: '🔄', // circular - repetitive
        5: '😠', // rudeness - angry
        6: '🎭', // passive-aggressive - masked
        7: '🎪', // fake - artificial
        8: '💬', // one-liner - brief
    };
    return emojiMap[flagId as keyof typeof emojiMap] || '🏷️';
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
    targetIds: z.array(z.string()).default([]), // 🎯 Multiple target Slack user IDs
    issueDescription: z.string(), // Brief description of what's wrong (no confidential content)
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

// Report Types
export type Report = z.infer<typeof ReportSchema>;

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
            autoCoaching: 20,        // messages per month
            manualRephrase: 50,      // messages per month  
            personalFeedback: 12,     // personal feedback reports per month
        },
        features: {
            reports: false,      // Paid only
            advancedReportAnalytics: false // Paid only
        },
        displayFeatures: [
            {
                name: 'Auto coaching suggestions',
                description: 'Get instant, private suggestions to improve your messages',
                included: true,
                limit: 50,
                limitLabel: 'Limited auto coaching'
            },
            {
                name: 'Manual rephrase',
                description: 'Use /rephrase command to improve specific messages',
                included: true,
                limit: 50,
                limitLabel: 'Limited manual rephrase'
            },
            {
                name: 'Personal feedback reports',
                description: 'Get detailed analysis of your communication patterns',
                included: true,
                limit: 5,
                limitLabel: 'Fewer personal feedback reports'
            },
            {
                name: 'Basic tone guardrails',
                description: 'Prevent common communication issues',
                included: true,
                limitLabel: 'Limited basic tone guardrails'
            },

            {
                name: 'Free model',
                description: 'Get free analysis of your communication',
                included: false,
                limitLabel: 'Access to free model'
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
            personalFeedback: 40,    // personal feedback reports per month
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
                limitLabel: 'Expanded auto coaching'
            },
            {
                name: 'Manual rephrase',
                description: 'Use /rephrase command to improve specific messages',
                included: true,
                limit: 1000,
                limitLabel: 'Expanded manual rephrase'
            },
            {
                name: 'Personal feedback reports',
                description: 'Get detailed analysis of your communication patterns',
                included: true,
                limit: 500,
                limitLabel: 'Many personal feedback reports'
            },
            {
                name: 'Advanced report analytics',
                description: 'Deep insights and trends in your communication',
                included: true,
                limitLabel: 'Access to weekly & monthly reports'
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