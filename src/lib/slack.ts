import { WebClient } from '@slack/web-api';
import * as crypto from 'crypto';
import { botChannelsCollection } from './db';
import { SlackChannel } from '@/types';

// Initialize Slack Web API client
export const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

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
        'identity.basic',
        'identity.email',
        'identity.team'
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
            text,
            ...(blocks && { blocks })
        });
        
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
        const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://yourapp.com';
        const onboardingUrl = `${baseUrl}/app/onboarding?user=${userId}&team=${teamId}`;
        const helpUrl = `${baseUrl}/app/help`;
        
        const welcomeText = `🎉 *Welcome to Your Personal AI Communication Coach!*

Hi there! I'm thrilled you've decided to level up your communication skills. I'm here to help you become a more effective, confident communicator in your workplace.

*What I can do for you:*
• 🔍 Analyze your messages in real-time and suggest improvements
• 📝 Help you rephrase messages to be clearer and more professional  
• 📊 Provide weekly/monthly insights on your communication patterns
• 🎯 Identify areas like clarity, tone, and effectiveness in your writing

*Your next steps:*
1. *Complete your setup* → <${onboardingUrl}|Finish Onboarding> (takes 2 minutes)
2. *Try these commands:*
   • \`/personalfeedback\` - Get insights on your recent messages
   • \`/rephrase [your message]\` - Get a better version of any text
   • \`/settings\` - Customize your coaching preferences

*How it works:*
I'll quietly monitor the channels you've selected and provide private suggestions when I notice opportunities to improve your communication. Only you can see my feedback - your teammates won't know I'm helping! 

*Need help?* Check out our <${helpUrl}|Help Center> for examples and best practices.

Ready to become a communication superstar? Let's get started! 🚀`;

        const blocks = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "🎉 *Welcome to Your Personal AI Communication Coach!*\n\nHi there! I'm thrilled you've decided to level up your communication skills. I'm here to help you become a more effective, confident communicator in your workplace."
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*What I can do for you:*\n• 🔍 Analyze your messages in real-time and suggest improvements\n• 📝 Help you rephrase messages to be clearer and more professional\n• 📊 Provide weekly/monthly insights on your communication patterns\n• 🎯 Identify areas like clarity, tone, and effectiveness in your writing"
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*Your next steps:*"
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "1. *Complete your setup* → Takes just 2 minutes!\n2. *Try these commands:*\n   • `/personalfeedback` - Get insights on your recent messages\n   • `/rephrase [your message]` - Get a better version of any text\n   • `/settings` - Customize your coaching preferences"
                },
                accessory: {
                    type: "button",
                    text: {
                        type: "plain_text",
                        text: "Complete Setup",
                        emoji: true
                    },
                    url: onboardingUrl,
                    action_id: "complete_onboarding"
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*How it works:*\nI'll quietly monitor the channels you've selected and provide private suggestions when I notice opportunities to improve your communication. Only you can see my feedback - your teammates won't know I'm helping!"
                }
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Help Center",
                            emoji: true
                        },
                        url: helpUrl,
                        action_id: "help_center"
                    }
                ]
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: "Ready to become a communication superstar? Let's get started! 🚀"
                    }
                ]
            }
        ];

        return await sendDirectMessage(userId, welcomeText, botToken, blocks);
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