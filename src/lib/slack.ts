import { WebClient } from '@slack/web-api';
import * as crypto from 'crypto';
import { botChannelsCollection } from './db';
import { PreferredStyle, SlackChannel, SlackUser, STYLE_PRESETS, StylePresetKey, SUBSCRIPTION_TIERS } from '@/types';
import type { StyleBaselineResult, StyleDeviationResult } from './ai';

// OAuth configuration
export const slackOAuthConfig = {
    clientId: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID!,
    clientSecret: process.env.SLACK_CLIENT_SECRET!,
    redirectUri: process.env.SLACK_REDIRECT_URI!,
    botScopes: [
        'chat:write',   
        'chat:write.public',
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
        'users:read.email',
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
                    text: "*What I do for you:*\n• Give you private suggestions to improve your messages\n• Help you rephrase text to be clearer and more effective\n• Let you customize what I focus on with coaching flags\n• Point out areas like vagueness or tone that could be improved"
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*Available commands:*\n• `/clarity-rephrase [your message]` - Get a clearer version of any text\n• `/clarity-settings` - Customize your coaching flags and preferences\n• `/clarity-status` - Check if coaching is active in a channel\n• `/clarity-help` - View all available commands and features"
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
                            text: "✨ Complete Setup"
                        },
                        style: "primary",
                        action_id: "complete_onboarding"
                    },
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
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: "👆 Click *Complete Setup* to choose channels and set your preferences"
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
✅ Customize your coaching focus areas
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
                    text: "It only takes 2 minutes to:\n✅ Choose which channels I should help you in\n✅ Customize your coaching focus areas\n✅ Invite teammates who might benefit too"
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

export type WorkspaceChannelEntry = {
    channelId: string;
    channelName: string;
    isMember: boolean;
    isPrivate: boolean;
};

// Live-fetch all non-archived channels in the workspace (public + private the bot
// can see) and reconcile botChannelsCollection against bot-member status. Returns
// the full workspace channel list with membership flags so callers can render
// every channel in pickers (and auto-join when needed) rather than only ones the
// bot already lives in.
//
// Slack's member_joined/left + channel lifecycle events keep the DB cache fresh
// in the steady state; this function is the safety net that heals drift on
// user-facing surfaces (e.g. the Settings modal).
export const reconcileBotChannels = async (
    workspaceId: string,
    botToken: string
): Promise<WorkspaceChannelEntry[]> => {
    const { ObjectId } = await import('mongodb');
    try {
        const slack = new WebClient(botToken);
        const allChannels: WorkspaceChannelEntry[] = [];
        let cursor: string | undefined;

        do {
            const res = await slack.conversations.list({
                types: 'public_channel,private_channel',
                exclude_archived: true,
                limit: 200,
                cursor,
            });
            for (const c of res.channels ?? []) {
                if (c.id && c.name) {
                    allChannels.push({
                        channelId: c.id,
                        channelName: c.name,
                        isMember: c.is_member ?? false,
                        isPrivate: c.is_private ?? false,
                    });
                }
            }
            cursor = res.response_metadata?.next_cursor || undefined;
        } while (cursor);

        // DB cache mirrors only channels the bot is a member of.
        const memberChannels = allChannels.filter(c => c.isMember);
        const memberIds = new Set(memberChannels.map(c => c.channelId));
        const stored = await botChannelsCollection.find({ workspaceId }).toArray();
        const storedById = new Map(stored.map(c => [c.channelId, c]));

        const staleIds = stored.filter(c => !memberIds.has(c.channelId)).map(c => c.channelId);
        if (staleIds.length > 0) {
            await botChannelsCollection.deleteMany({
                workspaceId,
                channelId: { $in: staleIds },
            });
        }

        for (const live of memberChannels) {
            const existing = storedById.get(live.channelId);
            if (!existing) {
                await botChannelsCollection.insertOne({
                    _id: new ObjectId(),
                    workspaceId,
                    channelId: live.channelId,
                    channelName: live.channelName,
                    addedAt: new Date(),
                });
            } else if (existing.channelName !== live.channelName) {
                await botChannelsCollection.updateOne(
                    { workspaceId, channelId: live.channelId },
                    { $set: { channelName: live.channelName } }
                );
            }
        }

        return allChannels;
    } catch (error) {
        console.error('Error reconciling bot channels, falling back to DB cache:', error);
        const stored = await botChannelsCollection.find({ workspaceId }).toArray();
        return stored.map(c => ({
            channelId: c.channelId,
            channelName: c.channelName,
            isMember: true,
            isPrivate: false,
        }));
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

// Send ephemeral opt-in message asking if user wants channel monitoring
export const sendChannelOptInMessage = async (
    channelId: string,
    userId: string,
    channelName: string,
    botToken: string
): Promise<boolean> => {
    try {
        const docsUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL 
            ? `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs`
            : 'https://clarityapp.io/docs';
        
        const blocks = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `Would you like me to monitor your messages in *#${channelName}*?`
                }
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: "I'll give you private suggestions to improve your communication. Only you can see them."
                    }
                ]
            },
            {
                type: "actions",
                block_id: "opt_in_actions",
                elements: [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Yes",
                            emoji: true
                        },
                        style: "primary",
                        action_id: "enable_channel_monitoring",
                        value: JSON.stringify({
                            channel_id: channelId,
                            user_id: userId
                        })
                    },
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Learn about Clarity",
                            emoji: true
                        },
                        action_id: "learn_about_clarity_link",
                        url: docsUrl
                    }
                ]
            }
        ];

        const fallbackText = `Would you like me to monitor your messages in #${channelName}?`;
        return await sendEphemeralMessage(channelId, userId, fallbackText, botToken, [], blocks);
    } catch (error) {
        console.error('Error sending channel opt-in message:', error);
        return false;
    }
};

// Open workspace onboarding modal for admin
export const openOnboardingModal = async (
    triggerId: string,
    botToken: string,
    channels: SlackChannel[]
): Promise<boolean> => {
    try {
        const workspaceSlack = new WebClient(botToken);
        const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://clarity.rocktangle.com';
        
        // Filter to public channels only (bots can auto-join these)
        const publicChannels = channels.filter(ch => !ch.is_private && !ch.is_archived);
        
        const modal = {
            type: 'modal' as const,
            callback_id: 'workspace_onboarding_modal',
            title: {
                type: 'plain_text' as const,
                text: 'Setup Clarity'
            },
            submit: {
                type: 'plain_text' as const,
                text: 'Complete Setup'
            },
            close: {
                type: 'plain_text' as const,
                text: 'Cancel'
            },
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '*Welcome to Clarity!* 🎉\n\nLet\'s get your workspace set up. All settings below are optional.'
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'input',
                    block_id: 'channels_selection',
                    optional: true,
                    label: {
                        type: 'plain_text',
                        text: 'Enable Clarity in channels'
                    },
                    hint: {
                        type: 'plain_text',
                        text: 'Select channels where Clarity will provide auto-coaching. Users can customize their own channels later.'
                    },
                    element: {
                        type: 'multi_static_select',
                        action_id: 'selected_channels',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Select channels...'
                        },
                        options: publicChannels.slice(0, 100).map(channel => ({
                            text: {
                                type: 'plain_text',
                                text: `#${channel.name}`
                            },
                            value: JSON.stringify({ id: channel.id, name: channel.name })
                        }))
                    }
                },
                {
                    type: 'input',
                    block_id: 'announcement_channel',
                    optional: true,
                    label: {
                        type: 'plain_text',
                        text: 'Announce Clarity to your team'
                    },
                    hint: {
                        type: 'plain_text',
                        text: 'We\'ll post a short message introducing Clarity. Leave empty to skip.'
                    },
                    element: {
                        type: 'static_select',
                        action_id: 'announcement_channel_select',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Select a channel...'
                        },
                        options: publicChannels.slice(0, 100).map(channel => ({
                            text: {
                                type: 'plain_text',
                                text: `#${channel.name}`
                            },
                            value: JSON.stringify({ id: channel.id, name: channel.name })
                        }))
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'input',
                    block_id: 'digest_opt_in_block',
                    optional: true,
                    label: { type: 'plain_text', text: 'Weekly style digest' },
                    hint: { type: 'plain_text', text: 'A private DM each Monday summarizing how you came across.' },
                    element: {
                        type: 'checkboxes',
                        action_id: 'digest_opt_in_checkbox',
                        options: [{
                            text: { type: 'plain_text', text: 'Send me the weekly digest' },
                            value: 'weekly',
                        }],
                    },
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '*Choose your plan*'
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Free Plan* - $0/month\n${SUBSCRIPTION_TIERS.FREE.description}\n• ${SUBSCRIPTION_TIERS.FREE.monthlyLimits.autoCoaching} auto-coaching/mo\n• ${SUBSCRIPTION_TIERS.FREE.monthlyLimits.manualRephrase} manual rephrase/mo`
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Pro Plan* - $${SUBSCRIPTION_TIERS.PRO.price}/month\n${SUBSCRIPTION_TIERS.PRO.description}\n• ${SUBSCRIPTION_TIERS.PRO.monthlyLimits.autoCoaching} auto-coaching/mo\n• ${SUBSCRIPTION_TIERS.PRO.monthlyLimits.manualRephrase} manual rephrase/mo\n• Custom coaching flags`
                    },
                    accessory: {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'Upgrade to Pro',
                            emoji: true
                        },
                        style: 'primary',
                        url: `${baseUrl}/api/stripe/checkout?workspace=pending`,
                        action_id: 'upgrade_to_pro'
                    }
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: '💡 You can upgrade anytime using `/clarity-settings`'
                        }
                    ]
                }
            ]
        };

        await workspaceSlack.views.open({
            trigger_id: triggerId,
            view: modal as Parameters<typeof workspaceSlack.views.open>[0]['view']
        });

        return true;
    } catch (error) {
        console.error('Error opening onboarding modal:', error);
        return false;
    }
};

// Send workspace announcement message
export const sendWorkspaceAnnouncementMessage = async (
    channelId: string,
    botToken: string
): Promise<boolean> => {
    try {
        const workspaceSlack = new WebClient(botToken);
        const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://clarity.rocktangle.com';

        const blocks = [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Hi team!* 👋\n\nClarity is now available in this workspace. I\'m your private communication coach - I help you write clearer, more effective messages.'
                }
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*What I can do:*\n• Give you private suggestions to improve your messages\n• Help you rephrase text to be clearer\n• Send you personal communication insights'
                }
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Get started:*\n• Type `/clarity-help` to see all commands\n• Use `/clarity-rephrase [your message]` to improve any text\n• Use `/clarity-settings` to customize your preferences'
                }
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `🔒 All coaching is private - only you can see my suggestions | <${baseUrl}/docs|Documentation>`
                    }
                ]
            }
        ];

        // First join the channel if not already a member
        await joinChannel(channelId, botToken);

        const result = await workspaceSlack.chat.postMessage({
            channel: channelId,
            text: 'Hi team! Clarity is now available in this workspace.',
            blocks
        });

        return result.ok || false;
    } catch (error) {
        console.error('Error sending workspace announcement:', error);
        return false;
    }
};

// Get user info with email from Slack API
export const getSlackUserInfoWithEmail = async (
    userId: string,
    botToken: string
): Promise<{
    name: string;
    displayName: string;
    email: string | null;
    image: string | undefined;
}> => {
    try {
        const workspaceSlack = new WebClient(botToken);
        const userInfo = await workspaceSlack.users.info({ user: userId });
        
        if (!userInfo.ok || !userInfo.user) {
            return {
                name: 'Slack User',
                displayName: 'Slack User',
                email: null,
                image: undefined
            };
        }
        
        return {
            name: userInfo.user.real_name || userInfo.user.name || 'Slack User',
            displayName: userInfo.user.profile?.display_name || userInfo.user.real_name || userInfo.user.name || 'Slack User',
            email: userInfo.user.profile?.email || null,
            image: userInfo.user.profile?.image_72
        };
    } catch (error) {
        console.error('Error fetching user info with email:', error);
        return {
            name: 'Slack User',
            displayName: 'Slack User',
            email: null,
            image: undefined
        };
    }
};

// Open admin transfer modal (push onto existing modal stack)
export const openAdminTransferModal = async (
    triggerId: string,
    botToken: string,
    currentAdminId: string
): Promise<boolean> => {
    try {
        const workspaceSlack = new WebClient(botToken);
        
        const modal = {
            type: 'modal' as const,
            callback_id: 'admin_transfer_modal',
            title: {
                type: 'plain_text' as const,
                text: 'Transfer Admin'
            },
            submit: {
                type: 'plain_text' as const,
                text: 'Transfer'
            },
            close: {
                type: 'plain_text' as const,
                text: 'Back'
            },
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '*Transfer workspace admin to another user*\n\n⚠️ Once you transfer admin rights, you will no longer be able to manage billing or change the admin.'
                    }
                },
                {
                    type: 'input',
                    block_id: 'new_admin_selection',
                    label: {
                        type: 'plain_text',
                        text: 'Select new admin'
                    },
                    element: {
                        type: 'users_select',
                        action_id: 'new_admin_user',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Select a user...'
                        }
                    }
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: '💡 The new admin will be notified and will have access to billing and workspace settings.'
                        }
                    ]
                }
            ],
            private_metadata: JSON.stringify({ currentAdminId })
        };

        // Use views.push since we're opening from within another modal (settings)
        await workspaceSlack.views.push({
            trigger_id: triggerId,
            view: modal as Parameters<typeof workspaceSlack.views.push>[0]['view']
        });

        return true;
    } catch (error) {
        console.error('Error opening admin transfer modal:', error);
        return false;
    }
};

// Send admin transfer notification to new admin
export const sendAdminTransferNotification = async (
    newAdminId: string,
    previousAdminName: string,
    workspaceName: string,
    botToken: string
): Promise<boolean> => {
    try {
        const blocks = [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*You are now the Clarity admin for ${workspaceName}!* 🎉\n\n${previousAdminName} has transferred admin rights to you.`
                }
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*As the workspace admin, you can:*\n• Manage billing and subscription\n• Transfer admin rights to someone else\n• Configure workspace-wide settings'
                }
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: '💡 Use `/clarity-settings` to access admin options'
                    }
                ]
            }
        ];

        return await sendDirectMessage(newAdminId, '', botToken, blocks);
    } catch (error) {
        console.error('Error sending admin transfer notification:', error);
        return false;
    }
};

// ===== Communication-Style Coach helpers =====

// Open the style-editor sub-modal from inside the Settings modal. Slack requires
// views.push (not views.open) when stacking on top of an existing modal.
export const openStyleEditModal = async (
    triggerId: string,
    botToken: string,
    currentStyle: PreferredStyle | undefined
): Promise<boolean> => {
    try {
        const workspaceSlack = new WebClient(botToken);

        const presetOptions = (Object.keys(STYLE_PRESETS) as Array<keyof typeof STYLE_PRESETS>).map(key => ({
            text: { type: 'plain_text' as const, text: STYLE_PRESETS[key].label },
            value: key,
        }));
        presetOptions.push({
            text: { type: 'plain_text' as const, text: 'Custom (write your own)' },
            value: 'custom',
        });

        const currentPreset: StylePresetKey = currentStyle?.preset ?? 'custom';
        const currentDescription = currentStyle?.description ?? '';
        const seedFromPreset = currentPreset !== 'custom' ? STYLE_PRESETS[currentPreset]?.description ?? '' : '';
        const initialValue = currentDescription || seedFromPreset;

        // Build the input block. If both description and preset-seed are empty
        // (very first open with no preset), omit `initial_value` — Slack rejects
        // an empty string here, leaving the textarea blank as desired.
        const descriptionElement: Record<string, unknown> = {
            type: 'plain_text_input',
            action_id: 'style_description_input',
            multiline: true,
            max_length: 1000,
            placeholder: {
                type: 'plain_text',
                text: 'e.g. I want to come across as direct and warm. I lead with the ask, but I always acknowledge what the other person did before critiquing.',
            },
        };
        if (initialValue.length > 0) {
            descriptionElement.initial_value = initialValue;
        }

        await workspaceSlack.views.push({
            trigger_id: triggerId,
            view: {
                type: 'modal',
                callback_id: 'style_modal',
                title: { type: 'plain_text', text: 'Target style' },
                submit: { type: 'plain_text', text: 'Save' },
                close: { type: 'plain_text', text: 'Cancel' },
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: '*How do you want to come across?*\nDescribe the person you want to read as in your messages — in plain English, like you\'d explain it to a coach.',
                        },
                    },
                    {
                        type: 'context',
                        elements: [{
                            type: 'mrkdwn',
                            text: '💡 *Tips for writing yours:*\n• Use first person ("I", "my").\n• Be specific — name habits ("I lead with the ask", "I avoid hedging like \'kind of\'").\n• Mention what you want to *avoid* too ("I don\'t want to sound passive-aggressive").\n• Up to 1000 characters. The more concrete, the better the digest.',
                        }],
                    },
                    {
                        type: 'context',
                        elements: [{
                            type: 'mrkdwn',
                            text: '*Example:* "I want to come across as a thoughtful senior engineer. I lead with the conclusion, then 2–3 supporting reasons. I push back firmly when I disagree but I always quote what I\'m responding to. I avoid hedging (\'maybe\', \'I think\') and corporate filler (\'circle back\', \'reach out\'). With more junior teammates I\'m warmer and ask more questions."',
                        }],
                    },
                    {
                        type: 'input',
                        block_id: 'style_preset_block',
                        optional: true,
                        label: { type: 'plain_text', text: 'Starting point (optional)' },
                        hint: { type: 'plain_text', text: 'Pick one to seed the textarea, then edit on top. Or just write your own.' },
                        element: {
                            type: 'static_select',
                            action_id: 'style_preset_select',
                            placeholder: { type: 'plain_text', text: 'Pick a preset…' },
                            options: presetOptions,
                            initial_option: presetOptions.find(o => o.value === currentPreset) ?? presetOptions[presetOptions.length - 1],
                        },
                    },
                    {
                        type: 'input',
                        block_id: 'style_description_block',
                        optional: true,
                        label: { type: 'plain_text', text: 'Your style description' },
                        hint: { type: 'plain_text', text: 'Leave blank to clear your target style and go back to baseline-only digests.' },
                        element: descriptionElement,
                    },
                ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
        });

        return true;
    } catch (error) {
        console.error('Error opening style edit modal:', error);
        return false;
    }
};

// Render the weekly digest as Slack blocks. baseline is required; deviation is
// optional and only included when the user has set a preferredStyle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const formatDigestBlocks = (baseline: StyleBaselineResult, deviation: StyleDeviationResult | null): any[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = [
        {
            type: 'header',
            text: { type: 'plain_text', text: 'Your weekly communication digest', emoji: true },
        },
        {
            type: 'section',
            text: { type: 'mrkdwn', text: `*How you came across this week*\n${baseline.summary || '_No summary available._'}` },
        },
    ];

    if (baseline.traits.length > 0) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: '*What stood out*\n' + baseline.traits.map(t => `• ${t}`).join('\n') },
        });
    }

    for (const ex of baseline.examples.slice(0, 2)) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `> ${ex.quote}\n_${ex.observation}_` },
        });
    }

    if (deviation) {
        blocks.push({ type: 'divider' });
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*Alignment with your target style*  ·  *${deviation.adherenceScore}/100*` },
        });

        if (deviation.deviations.length > 0) {
            blocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: '*Where you drifted*' },
            });
            for (const d of deviation.deviations.slice(0, 3)) {
                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `> ${d.quote}\n*Why:* ${d.why}\n*Try:* ${d.suggestion}`,
                    },
                });
            }
        }

        if (deviation.strengths.length > 0) {
            blocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: '*What you nailed*\n' + deviation.strengths.map(s => `• ${s}`).join('\n') },
            });
        }
    } else {
        blocks.push({
            type: 'context',
            elements: [{
                type: 'mrkdwn',
                text: '💡 Set a target style in `/clarity-settings` to see how well you tracked it each week.',
            }],
        });
    }

    blocks.push({
        type: 'context',
        elements: [{
            type: 'mrkdwn',
            text: '🔒 This digest is private. Adjust delivery in `/clarity-settings`.',
        }],
    });

    return blocks;
};
