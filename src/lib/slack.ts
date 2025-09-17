import { WebClient } from '@slack/web-api';
import * as crypto from 'crypto';
import { botChannelsCollection } from './db';
import { SlackChannel, SlackUser, SUBSCRIPTION_TIERS, Report } from '@/types';

// OAuth configuration
export const slackOAuthConfig = {
    clientId: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID!,
    clientSecret: process.env.SLACK_CLIENT_SECRET!,
    redirectUri: process.env.SLACK_REDIRECT_URI!,
    botScopes: [
        'chat:write',   
        'chat:write.public',
        'chat:write.customize',
        'commands',
        'channels:history',
        'groups:history',
        'im:history',
        'mpim:history',
        'channels:read',
        'channels:join',
        'groups:read',
        'im:read',
        'mpim:read',
        'im:write',
        'users:read',
        'app_mentions:read'
    ],
    userScopes: [
        'chat:write'
    ]
};

// Generate OAuth URL for Slack installation
export const getSlackOAuthUrl = (state?: string) => {
    const params = new URLSearchParams({
        client_id: slackOAuthConfig.clientId,
        scope: slackOAuthConfig.botScopes.join(','),
        user_scope: slackOAuthConfig.userScopes.join(','),
        redirect_uri: slackOAuthConfig.redirectUri,
        response_type: 'code',
        ...(state && { state })
    });
    
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
};

// Exchange OAuth code for access token
export const exchangeOAuthCode = async (code: string) => {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: slackOAuthConfig.clientId,
            client_secret: slackOAuthConfig.clientSecret,
            code,
            redirect_uri: slackOAuthConfig.redirectUri
        })
    });

    const data = await response.json();
    return data;
};

// Verify Slack request signature
export const verifySlackSignature = (
    signingSecret: string,
    requestSignature: string,
    requestTimestamp: string,
    requestBody: string
): boolean => {
    const time = Math.floor(new Date().getTime() / 1000);
    
    // Request timestamp should be within 5 minutes
    if (Math.abs(time - parseInt(requestTimestamp)) > 300) {
        return false;
    }
    
    const sigBaseString = `v0:${requestTimestamp}:${requestBody}`;
    const mySignature = `v0=${crypto
        .createHmac('sha256', signingSecret)
        .update(sigBaseString)
        .digest('hex')}`;
    
    return crypto.timingSafeEqual(
        Buffer.from(mySignature, 'utf8'),
        Buffer.from(requestSignature, 'utf8')
    );
};

// Get user info from Slack API
export const getSlackUserInfo = async (accessToken: string) => {
    const userClient = new WebClient(accessToken);
    const userInfo = await userClient.auth.test();
    
    if (!userInfo.ok) {
        throw new Error('Failed to get user info from Slack');
    }
    
    return userInfo;
};

// Resolve single Slack user ID to display name using workspace bot token
export const resolveSlackUserName = async (
    userId: string,
    botToken: string
): Promise<string> => {
    try {
        const workspaceSlack = new WebClient(botToken);
        const userInfo = await workspaceSlack.users.info({ user: userId });
        
        if (!userInfo.ok || !userInfo.user) {
            console.warn(`Failed to resolve user ${userId}:`, userInfo.error);
            return `User ${userId}`;
        }
        
        // Prefer display name, fall back to real name, then username
        return userInfo.user.profile?.display_name || 
               userInfo.user.real_name || 
               userInfo.user.name || 
               `User ${userId}`;
    } catch (error) {
        console.error(`Error resolving user ${userId}:`, error);
        return `User ${userId}`;
    }
};

// Resolve multiple Slack user IDs to display names with caching
export const resolveSlackUserNames = async (
    userIds: string[],
    botToken: string
): Promise<Record<string, string>> => {
    const resolvedNames: Record<string, string> = {};
    
    if (userIds.length === 0) {
        return resolvedNames;
    }
    
    try {
        const workspaceSlack = new WebClient(botToken);
        
        // Resolve users in parallel for better performance
        const promises = userIds.map(async (userId) => {
            try {
                const userInfo = await workspaceSlack.users.info({ user: userId });
                
                if (userInfo.ok && userInfo.user) {
                    return {
                        userId,
                        name: userInfo.user.profile?.display_name || 
                              userInfo.user.real_name || 
                              userInfo.user.name || 
                              `User ${userId}`
                    };
                } else {
                    console.warn(`Failed to resolve user ${userId}:`, userInfo.error);
                    return { userId, name: `User ${userId}` };
                }
            } catch (error) {
                console.error(`Error resolving user ${userId}:`, error);
                return { userId, name: `User ${userId}` };
            }
        });
        
        const results = await Promise.all(promises);
        
        // Build the resolved names record
        results.forEach(({ userId, name }) => {
            resolvedNames[userId] = name;
        });
        
        console.log(`✅ Resolved ${Object.keys(resolvedNames).length} user names`);
        return resolvedNames;
        
    } catch (error) {
        console.error('Error in bulk user resolution:', error);
        // Return fallback names for all users
        userIds.forEach(userId => {
            resolvedNames[userId] = `User ${userId}`;
        });
        return resolvedNames;
    }
};

// Fetch conversation history for context analysis
export const fetchConversationHistory = async (
    channelId: string,
    botToken: string,
    messageTs?: string,
    limit: number = 10
): Promise<string[]> => {
    try {
        // Create workspace-specific WebClient with the bot token
        const workspaceSlack = new WebClient(botToken);
        
        // Build the request parameters
        const params: {
            channel: string;
            limit: number;
            latest?: string;
            inclusive?: boolean;
        } = {
            channel: channelId,
            limit: limit + 1, // +1 to include the current message
        };
        
        // Only add latest/inclusive if we have a messageTs
        if (messageTs) {
            params.latest = messageTs;
            params.inclusive = false; // Don't include the current message
        }
        
        const result = await workspaceSlack.conversations.history(params);
        
        if (!result.ok || !result.messages) {
            console.error('Failed to fetch conversation history:', result.error);
            return [];
        }

        console.log(`📚 Fetched ${result.messages.length} total messages from Slack API`);
        
        // Extract text from messages and reverse to get chronological order
        // Comprehensive filtering for human messages only
        const messages = result.messages
            .filter(msg => {
                // Must have text content
                if (!msg.text || msg.text.trim() === '') return false;
                
                // Filter out all bot messages
                if (msg.bot_id) return false;
                
                // Filter out system and automated messages by subtype
                if (msg.subtype && [
                    'bot_message',
                    'channel_join', 
                    'channel_leave',
                    'channel_topic',
                    'channel_purpose',
                    'channel_name',
                    'channel_archive',
                    'channel_unarchive',
                    'pinned_item',
                    'unpinned_item',
                    'file_share',
                    'thread_broadcast',
                    'reminder_add',
                    'slackbot_response'
                ].includes(msg.subtype)) return false;
                
                // Filter out app messages
                if (msg.app_id) return false;
                
                // Must have a human user ID (starts with 'U')
                if (!msg.user || typeof msg.user !== 'string' || !msg.user.startsWith('U')) return false;
                
                // Filter out messages that are just mentions or commands
                const text = msg.text.trim();
                if (text.startsWith('/') || text.match(/^<@[UW][A-Z0-9]+>$/)) return false;
                
                return true;
            })
            .map(msg => msg.text || '')
            .reverse(); // Reverse to get chronological order (oldest first)
        
        console.log(`✅ Filtered to ${messages.length} human messages for analysis`);
        return messages;
    } catch (error) {
        console.error('Error fetching conversation history:', error);
        return [];
    }
};

// Send ephemeral message to user
export const sendEphemeralMessage = async (
    channelId: string,
    userId: string,
    text: string,
    botToken: string,
    attachments?: unknown[],
    blocks?: unknown[]
): Promise<boolean> => {
    try {
        // Create workspace-specific WebClient with the bot token
        const workspaceSlack = new WebClient(botToken);
        
        const result = await workspaceSlack.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text,
            ...(attachments && { attachments }),
            ...(blocks && { blocks })
        });
        
        return result.ok || false;
    } catch (error) {
        console.error('Error sending ephemeral message:', error);
        return false;
    }
};

// Send DM to user
export const sendDirectMessage = async (
    userId: string,
    text: string,
    botToken: string,
    blocks?: unknown[]
): Promise<boolean> => {
    try {
        // Create workspace-specific WebClient with the bot token
        const workspaceSlack = new WebClient(botToken);
        
        // Open DM channel
        const dmResult = await workspaceSlack.conversations.open({
            users: userId
        });
        
        if (!dmResult.ok || !dmResult.channel) {
            console.error('Failed to open DM channel:', dmResult.error);
            return false;
        }
        
        // Send message
        const result = await workspaceSlack.chat.postMessage({
            channel: dmResult.channel.id!,
            text: text && text.trim().length > 0 ? text : 'Message contains rich content. Please view the blocks.',
            ...(blocks && { blocks })
        });
        
        if (!result.ok) {
            console.error('chat.postMessage failed:', (result as { error?: string }).error);
        } else {
            console.log('DM sent', { channel: dmResult.channel.id, ts: (result as { ts?: string }).ts });
        }
        return result.ok || false;
    } catch (error) {
        console.error('Error sending DM:', error);
        return false;
    }
};

// Send welcome message to new user
export const sendWelcomeMessage = async (
    userId: string,
    teamId: string,
    botToken: string
): Promise<boolean> => {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://clarity.rocktangle.com';
        const helpUrl = `${baseUrl}/docs`;
        const contactUrl = `${baseUrl}/contact-us`;

        const blocks = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*Hey there! I'm Clarity*\n\nThanks for installing me as your private communication coach. I help you write better messages by giving you personal suggestions that only you can see."
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*What I do for you:*\n• Give you private suggestions to improve your messages\n• Help you rephrase text to be clearer and more effective\n• Send you personal weekly or monthly communication insights\n• Point out areas like vagueness or tone that could be improved"
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*Available commands:*\n• `/clarity-personal-feedback` - Get insights on your recent messages\n• `/clarity-rephrase [your message]` - Get a clearer version of any text\n• `/clarity-settings` - Customize your preferences and billing\n• `/clarity-help` - View all available commands and features"
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*How I work:*\nI watch the channels you choose and give you private suggestions when I spot ways to improve your messages. Your teammates never see any of my coaching - it's completely private and just for you."
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*Your privacy:*\nEverything I do is private to you. I don't save your messages and your teammates can't see any of my suggestions or feedback."
                }
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Documentation"
                        },
                        url: helpUrl,
                        action_id: "documentation"
                    },
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Contact Us"
                        },
                        url: contactUrl,
                        action_id: "contact_support"
                    }
                ]
            }
        ];

        return await sendDirectMessage(userId,'', botToken, blocks);
    } catch (error) {
        console.error('Error sending welcome message:', error);
        return false;
    }
};

// Send onboarding reminder message to user who hasn't completed setup
export const sendOnboardingReminderMessage = async (
    userId: string,
    teamId: string,
    botToken: string
): Promise<boolean> => {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://yourapp.com';
        const onboardingUrl = `${baseUrl}/app/onboarding?user=${userId}&team=${teamId}`;

        const reminderText = `👋 *Hey there!*

I noticed you haven't finished setting up your communication coaching yet.

It only takes 2 minutes to:
✅ Choose which channels I should help you in
✅ Set your feedback frequency (weekly or monthly reports)
✅ Invite teammates who might benefit too

Your future self will thank you! 💪`;

        const blocks = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "👋 *Hey there!*\n\nI noticed you haven't finished setting up your communication coaching yet."
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "It only takes 2 minutes to:\n✅ Choose which channels I should help you in\n✅ Set your feedback frequency (weekly or monthly reports)\n✅ Invite teammates who might benefit too"
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "Your future self will thank you! 💪"
                },
                accessory: {
                    type: "button",
                    text: {
                        type: "plain_text",
                        text: "Complete Setup Now",
                        emoji: true
                    },
                    url: onboardingUrl,
                    action_id: "complete_onboarding_reminder"
                }
            }
        ];

        return await sendDirectMessage(userId, reminderText, botToken, blocks);
    } catch (error) {
        console.error('Error sending onboarding reminder:', error);
        return false;
    }
};

// Send onboarding prompt message for users who haven't completed onboarding
export const sendOnboardingPromptMessage = async (
    userId: string,
    teamId: string,
    botToken: string
): Promise<boolean> => {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://yourapp.com';
        const onboardingUrl = `${baseUrl}/app/onboarding?user=${userId}&team=${teamId}`;

        const blocks = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "Please complete onboarding to access Clarity features."
                },
                accessory: {
                    type: "button",
                    text: {
                        type: "plain_text",
                        text: "Complete Onboarding"
                    },
                    url: onboardingUrl,
                    action_id: "complete_onboarding_prompt"
                }
            }
        ];

        return await sendDirectMessage(userId, '', botToken, blocks);
    } catch (error) {
        console.error('Error sending onboarding prompt:', error);
        return false;
    }
};

// Get workspace channels for onboarding selection
export const getWorkspaceChannels = async (botToken: string): Promise<SlackChannel[]> => {
    try {
        // Create workspace-specific WebClient with the bot token
        const workspaceSlack = new WebClient(botToken);
        
        const result = await workspaceSlack.conversations.list({
            types: 'public_channel,private_channel',
            exclude_archived: true,
            limit: 100
        });
        
        if (!result.ok || !result.channels) {
            console.error('Failed to fetch channels:', result.error);
            return [];
        }
        
        // Filter and format channels
        const channels: SlackChannel[] = result.channels
            .filter(channel => channel.id && channel.name)
            .map(channel => ({
                id: channel.id!,
                name: channel.name!,
                is_private: channel.is_private || false,
                is_member: channel.is_member || false,
                is_archived: channel.is_archived || false
            }));
        
        return channels;
    } catch (error) {
        console.error('Error fetching workspace channels:', error);
        return [];
    }
};

// Join bot to a specific channel
export const joinChannel = async (channelId: string, botToken: string): Promise<boolean> => {
    try {
        // Create workspace-specific WebClient with the bot token
        const workspaceSlack = new WebClient(botToken);
        
        const result = await workspaceSlack.conversations.join({
            channel: channelId
        });
        
        if (!result.ok) {
            // Handle specific error for private channels gracefully
            if (result.error === 'method_not_supported_for_channel_type') {
                console.log(`⚠️ Cannot join private channel ${channelId} via API (user must manually invite bot)`);
                return false;
            }
            console.error('Failed to join channel:', channelId, result.error);
            return false;
        }
        
        console.log('✅ Bot joined channel:', channelId);
        return true;
    } catch (error) {
        console.error('Error joining channel:', channelId, error);
        return false;
    }
};

// Check if channel is accessible to bot (exists in botChannelsCollection)
// Database is kept in sync via member_joined_channel and member_left_channel events
export const isChannelAccessible = async (channelId: string, workspaceId: string): Promise<boolean> => {
    try {
        const channel = await botChannelsCollection.findOne({
            channelId,
            workspaceId
        });
        
        return !!channel;
    } catch (error) {
        console.error('Error checking channel accessibility:', error);
        return false;
    }
};

// Send Pro subscription welcome notification
export const sendProSubscriptionNotification = async (
    user: SlackUser,
    botToken: string
): Promise<boolean> => {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://clarity.rocktangle.com';
        const docsUrl = `${baseUrl}/docs`;
        const contactUrl = `${baseUrl}/contact-us`;
        
        // Get Pro tier data from types
        const proTier = SUBSCRIPTION_TIERS.PRO;
        const proFeatures = proTier.displayFeatures.filter(f => f.included);

        const blocks = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `🎉 *Welcome to Clarity ${proTier.name}!*\n\nHey ${user.name}! You're now upgraded to ${proTier.name} and have access to enhanced features and higher limits.`
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*What's new for you:*\n${proFeatures.map(feature => `• ${feature.name} - ${feature.limitLabel || 'Available'}`).join('\n')}`
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*Ready to level up your communication?*\nThanks for upgrading! I'm excited to help you communicate even more effectively. 🚀"
                }
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Documentation"
                        },
                        url: docsUrl,
                        action_id: "pro_documentation"
                    },
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Contact Support"
                        },
                        url: contactUrl,
                        action_id: "pro_contact_support"
                    }
                ]
            }
        ];

        return await sendDirectMessage(user.slackId, '', botToken, blocks);
    } catch (error) {
        console.error('Error sending Pro subscription notification:', error);
        return false;
    }
};

// Send subscription cancellation notification
export const sendSubscriptionCancellationNotification = async (
    user: SlackUser,
    botToken: string
): Promise<boolean> => {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://clarity.rocktangle.com';
        const contactUrl = `${baseUrl}/contact-us`;
        
        // Get tier data from types
        const proTier = SUBSCRIPTION_TIERS.PRO;
        const freeTier = SUBSCRIPTION_TIERS.FREE;
        const freeAutoCoachingLimit = freeTier.displayFeatures.find(f => f.name === 'Auto coaching suggestions')?.limit || 50;

        const blocks = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `👋 *Your Clarity ${proTier.name} subscription has been cancelled*\n\nHey ${user.name}, just confirming that your ${proTier.name} subscription has been cancelled successfully.`
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*What happens next:*\n• You'll keep ${proTier.name} access until your billing period ends\n• After that, you'll automatically switch to our ${freeTier.name} plan\n• Your ${freeTier.name} plan includes ${freeAutoCoachingLimit} coaching suggestions per month`
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*Change your mind?*\nYou can reactivate your subscription anytime from your Slack settings using `/clarity-settings`.\n\nThanks for being part of the Clarity community! 💙"
                }
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Contact Us"
                        },
                        url: contactUrl,
                        action_id: "cancellation_contact_support"
                    }
                ]
            }
        ];

        return await sendDirectMessage(user.slackId, '', botToken, blocks);
    } catch (error) {
        console.error('Error sending subscription cancellation notification:', error);
        return false;
    }
};

// Send DM notification when bot is added to channels during onboarding
export const sendChannelMonitoringNotification = async (
    user: SlackUser,
    botToken: string,
    enabledChannels: Array<{ id: string; name: string }>
): Promise<boolean> => {
    try {
        if (!enabledChannels.length) {
            console.log('No channels enabled for monitoring, skipping notification');
            return true;
        }

        const channelList = enabledChannels
            .map(channel => `• *#${channel.name}*`)
            .join('\n');

        const blocks = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Clarity is now giving you private coaching in:*\n\n${channelList}`    
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `💡 *How it works:*\n• I'll give you private suggestions to improve your messages\n• Only you can see my coaching - your teammates can't see anything\n• Use */clarity-settings* to control which channels I help you in`
                }
            },
            {
                type: "divider"
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `🚀 *Ready to get started?* Just start chatting in these channels and I'll help you privately!`
                }
            }
        ];

        return await sendDirectMessage(user.slackId, '', botToken, blocks);
    } catch (error) {
        console.error('Error sending channel monitoring notification:', error);
        return false;
    }
};

// 🔔 NEW: Weekly report DM delivery
export const sendWeeklyReportDM = async (
    user: SlackUser,
    report: Report,
    botToken: string
): Promise<boolean> => {
    const { getFlagInfo, getFlagEmoji } = await import('@/types');

    const blocks: unknown[] = [
        {
            type: "header",
            text: { type: "plain_text", text: "📊 Your Weekly Communication Report" }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Communication Score: ${report.communicationScore}/10* ${
                    report.scoreChange > 0 ? '📈' :
                    report.scoreChange < 0 ? '📉' : '➡️'
                }\n*${Math.abs(report.scoreChange)} points ${
                    report.scoreChange > 0 ? 'improvement' :
                    report.scoreChange < 0 ? 'decline' : 'change'
                } from last week*`
            }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*This week:* ${report.currentPeriod.flaggedMessages} improvements from ${report.currentPeriod.totalMessages} messages\n\n*Top areas to focus on:*\n${
                    (report.currentPeriod.flagBreakdown || []).slice(0, 3).map((flag) => {
                        const flagInfo = getFlagInfo(flag.flagId);
                        return `• ${getFlagEmoji(flag.flagId)} ${flagInfo?.name || 'Unknown'} (${flag.count ?? 0} times)`;
                    }).join('\n') || '• None'
                }`
            }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*💡 Key Insight*\n${(report.keyInsights && report.keyInsights[0]) || 'Keep up the great work!'}\n\n*🤝 Communication Partners:*\n${
                    (report.currentPeriod.partnerAnalysis || [])
                        .filter((p) => (p.messagesExchanged ?? 0) > 0)
                        .slice()
                        .sort((a, b) => (b.messagesExchanged ?? 0) - (a.messagesExchanged ?? 0))
                        .slice(0, 3)
                        .map((partner) => `• ${partner.partnerName} (${partner.messagesExchanged} instances)`)
                        .join('\n') || '• None'
                }`
            }
        }
    ];

    // Add achievements if any
    if (report.achievements.length > 0) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*🏆 Achievements:*\n${report.achievements.map((achievement) =>
                    `${achievement.icon} ${achievement.description}`
                ).join('\n')}`
            }
        });
    }

    // Top flagged messages (examples) as its own section before action buttons
    if (Array.isArray(report.messageExamples) && report.messageExamples.length > 0) {
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: "*Top flagged messages*" }
        });

        const top = report.messageExamples.slice(0, 2);
        top.forEach((ex, idx) => {
            const summaryText = ex.summary && ex.summary.trim() 
                ? ex.summary.slice(0, 120)
                : 'Communication issue detected';
                
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `• ${summaryText}`
                },
                accessory: {
                    type: "button",
                    text: { type: "plain_text", text: "Open" },
                    url: `slack://channel?team=T123456&id=${ex.channelId}&message=${ex.messageTs}`,
                    action_id: `open_example_${idx}`
                }
            } as unknown as { type: string; text: { type: string; text: string }; accessory?: unknown });
        });
    }

    // Action buttons
    const actionBlock = {
        type: "actions",
        elements: [
            {
                type: "button",
                text: { type: "plain_text", text: "📈 View Detailed Report" },
                style: "primary",
                url: `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://localhost:3000'}/reports/weekly/${report.reportId}`
            }
        ]
    };

    // (Examples now appear in a dedicated section above; no extra buttons here)

    blocks.push(actionBlock);

    return await sendDirectMessage(user.slackId, '', botToken, blocks);
};

// 🔔 NEW: Monthly report DM delivery
export const sendMonthlyReportDM = async (
    user: SlackUser,
    report: Report,
    botToken: string
): Promise<boolean> => {
    const { getFlagInfo, getFlagEmoji } = await import('@/types');

    const improvingFlags = report.chartMetadata.flagTrends.filter((f) => f.trend === 'down').slice(0, 2);
    const concerningFlags = report.chartMetadata.flagTrends.filter((f) => f.trend === 'up').slice(0, 2);

    const blocks: unknown[] = [
        {
            type: "header",
            text: { type: "plain_text", text: "📈 Your Monthly Communication Report" }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Communication Score: ${report.communicationScore}/100* ${
                    report.scoreChange > 0 ? '🚀' :
                    report.scoreChange < 0 ? '⚠️' : '➡️'
                }\n*${Math.abs(report.scoreChange)} points ${
                    report.scoreChange > 0 ? 'improvement' :
                    report.scoreChange < 0 ? 'change' : 'change'
                } from last month*`
            }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*This month:* ${report.currentPeriod.flaggedMessages} improvements from ${report.currentPeriod.totalMessages} messages\n\n${
                    improvingFlags.length > 0 ?
                    `*🟢 Areas showing improvement:*\n${improvingFlags.map((flag) => {
                        const flagInfo = getFlagInfo(flag.flagId);
                        return `• ${getFlagEmoji(flag.flagId)} ${flagInfo?.name} (-${Math.abs(flag.changePercent)}%)`;
                    }).join('\n')}\n\n` : ''
                }${
                    concerningFlags.length > 0 ?
                    `*🔴 Areas needing attention:*\n${concerningFlags.map((flag) => {
                        const flagInfo = getFlagInfo(flag.flagId);
                        return `• ${getFlagEmoji(flag.flagId)} ${flagInfo?.name} (+${flag.changePercent}%)`;
                    }).join('\n')}` : ''
                }`
            }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*🤝 Communication Partners:*\n${
                    (report.currentPeriod.partnerAnalysis || [])
                        .slice()
                        .sort((a, b) => (b.messagesExchanged ?? 0) - (a.messagesExchanged ?? 0))
                        .slice(0, 3)
                        .map((partner) => `${partner.partnerName} (${partner.messagesExchanged ?? 0} instances)`)
                        .join(' • ') || 'None'
                }\n\n*💡 Monthly Insight:* ${report.recommendations[0] || 'Keep practicing your improved communication habits!'}`
            }
        },
        {
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: { type: "plain_text", text: "📊 View Full Analytics" },
                    style: "primary",
                    url: `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://localhost:3000'}/reports/monthly/${report.reportId}`
                }
            ]
        }
    ];

    return await sendDirectMessage(user.slackId, '', botToken, blocks);
};

 