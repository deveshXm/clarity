import { NextRequest, NextResponse, after } from 'next/server';
import { verifySlackSignature, fetchConversationHistory, sendDirectMessage, isChannelAccessible, getSlackOAuthUrl, openOnboardingModal, getWorkspaceChannels, getSlackUserInfoWithEmail } from '@/lib/slack';
import { slackUserCollection, workspaceCollection, botChannelsCollection, feedbackCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { WebClient } from '@slack/web-api';
import { generatePersonalFeedback, generateImprovedMessage, analyzeMessageForFlags, analyzeMessageForRephraseWithoutContext, analyzeMessageForRephraseWithContext, generateImprovedMessageWithContext } from '@/lib/ai';
import { SlackUser, Workspace, getTierConfig } from '@/types';
import { validateWorkspaceAccess, incrementWorkspaceUsage, generateUpgradeMessage, generateLimitReachedMessage, generateProLimitReachedMessage } from '@/lib/subscription';
import { trackEvent, trackError } from '@/lib/posthog';
import { EVENTS, ERROR_CATEGORIES } from '@/lib/analytics/events';
import { logError, logInfo } from '@/lib/logger';


export async function POST(request: NextRequest) {
    try {
        // Get request body and headers
        const body = await request.text();
        const signature = request.headers.get('x-slack-signature');
        const timestamp = request.headers.get('x-slack-request-timestamp');
        
        if (!signature || !timestamp) {
            console.error('Missing Slack signature or timestamp');
            return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
        }
        
        // Verify request signature
        const signingSecret = process.env.SLACK_SIGNING_SECRET;
        if (!signingSecret) {
            console.error('Missing SLACK_SIGNING_SECRET environment variable');
            return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
        }
        
        const isValid = verifySlackSignature(signingSecret, signature, timestamp, body);
        if (!isValid) {
            console.error('Invalid Slack signature');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
        
        // Parse command data
        const params = new URLSearchParams(body);
        const command = params.get('command');
        const text = params.get('text') || '';
        const userId = params.get('user_id');
        const channelId = params.get('channel_id');
        const teamId = params.get('team_id');
        const triggerId = params.get('trigger_id');
        
        if (!command || !userId || !channelId || !teamId) {
            return NextResponse.json({ 
                text: 'Invalid command format' 
            }, { status: 400 });
        }

        logInfo('Slack command received', { 
            command,
            user_id: userId,
            channel_id: channelId,
            team_id: teamId,
            has_text: !!text,
            endpoint: '/api/slack/commands'
        });

        // Step 1: Find workspace by team ID
        const workspace = await workspaceCollection.findOne({ 
            workspaceId: teamId, 
            isActive: true 
        }) as Workspace | null;

        if (!workspace) {
            // Workspace not found - show install message
            const authUrl = getSlackOAuthUrl();
            
            return NextResponse.json({
                text: 'Clarity needs to be installed in this workspace first.',
                response_type: 'ephemeral',
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: '*Clarity needs to be installed in this workspace first* 👋\n\nAsk your workspace admin to install Clarity, or install it yourself if you have admin permissions.'
                        }
                    },
                    {
                        type: 'actions',
                        elements: [
                            {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: 'Install Clarity'
                                },
                                url: authUrl,
                                action_id: 'install_clarity'
                            }
                        ]
                    }
                ]
            });
        }

        // Step 2: Check if user exists, auto-create if not
        let user = await slackUserCollection.findOne({
            slackId: userId,
            workspaceId: String(workspace._id)
        }) as SlackUser | null;

        if (!user) {
            // Auto-create user with defaults
            const userInfo = await getSlackUserInfoWithEmail(userId, workspace.botToken);
            
            const newUser = {
                _id: new ObjectId(),
                slackId: userId,
                workspaceId: String(workspace._id),
                email: userInfo.email,
                name: userInfo.name,
                displayName: userInfo.displayName,
                image: userInfo.image,
                analysisFrequency: 'weekly' as const,
                autoCoachingEnabledChannels: [],
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            await slackUserCollection.insertOne(newUser);
            user = newUser as unknown as SlackUser;
            
            logInfo('Auto-created user on first command', {
                user_id: userId,
                workspace_id: String(workspace._id),
                command
            });
        }

        // Track command received
        trackEvent(userId, EVENTS.API_SLACK_COMMAND_RECEIVED, {
            command: command,
            channel_id: channelId,
            user_name: user?.name || 'Unknown',
            workspace_id: String(workspace._id),
            subscription_tier: workspace.subscription?.tier || 'FREE',
            has_text: !!text,
            text_length: text?.length || 0,
        });

        // Step 3: Check workspace onboarding status
        const isAdmin = workspace.adminSlackId === userId;
        
        if (!workspace.hasCompletedOnboarding) {
            if (isAdmin && triggerId) {
                // Admin can complete onboarding - open modal
                const channels = await getWorkspaceChannels(workspace.botToken);
                await openOnboardingModal(triggerId, workspace.botToken, channels);
                
                // Return empty response to avoid timeout message
                return new NextResponse('', { status: 200 });
            } else {
                // Non-admin user - tell them admin needs to complete setup
                return NextResponse.json({
                    text: 'Clarity setup is not complete yet.',
                    response_type: 'ephemeral',
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '*Clarity setup is not complete yet* ⏳\n\nYour workspace admin needs to complete the initial setup before you can use Clarity. Please ask them to run any `/clarity-` command to finish setup.'
                            }
                        }
                    ]
                });
            }
        }

        // Step 4: Process command normally (workspace is onboarded)
        let response;
        switch (command) {
            case '/clarity-personal-feedback':
                response = await handlePersonalFeedback(userId, channelId, workspace, user);
                break;
            case '/clarity-rephrase':
                response = await handleRephrase(text, userId, channelId, workspace, user);
                break;
            case '/clarity-settings':
                response = await handleSettings(userId, user, workspace, triggerId!);
                break;
            case '/clarity-status':
                response = await handleClarityStatus(userId, channelId, workspace, user);
                break;
            case '/clarity-help':
                response = await handleClarityHelp();
                break;
            case '/clarity-feedback':
                response = await handleFeedback(text, userId, workspace, user);
                break;
            default:
                response = {
                    text: `Unknown command: ${command}`,
                    response_type: 'ephemeral'
                };
        }

        if (response === null) {
            return new NextResponse('', { status: 200 });
        }

        return NextResponse.json(response);
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Slack commands error', errorObj, { 
            endpoint: '/api/slack/commands'
        });
        trackError('anonymous', errorObj, { 
            endpoint: '/api/slack/commands',
            operation: 'slack_command_processing',
            category: ERROR_CATEGORIES.SERVER
        });
        return NextResponse.json({
            text: 'Sorry, there was an error processing your command. Please try again.',
            response_type: 'ephemeral'
        }, { status: 500 });
    }
}

async function handlePersonalFeedback(userId: string, channelId: string, workspace: Workspace, user: SlackUser) {
    try {
        // Check workspace subscription access
        const accessCheck = await validateWorkspaceAccess(workspace, 'personalFeedback');
        
        if (!accessCheck.allowed) {
            if (accessCheck.upgradeRequired) {
                return generateUpgradeMessage('personalFeedback', accessCheck.reason || 'Feature requires upgrade', String(workspace._id));
            }
            
            // Check if workspace is PRO
            if (workspace.subscription?.tier === 'PRO') {
                const proConfig = getTierConfig('PRO');
                return generateProLimitReachedMessage(
                    'personalFeedback',
                    workspace.subscription.monthlyUsage.personalFeedback || 0,
                    proConfig.monthlyLimits.personalFeedback,
                    accessCheck.resetDate || new Date()
                );
            }
            
            // FREE workspace limit reached
            const freeConfig = getTierConfig('FREE');
            return generateLimitReachedMessage(
                'personalFeedback',
                workspace.subscription?.monthlyUsage.personalFeedback || 0,
                freeConfig.monthlyLimits.personalFeedback,
                accessCheck.resetDate || new Date(),
                String(workspace._id)
            );
        }

        // Check if bot has access to current channel
        const hasChannelAccess = await isChannelAccessible(channelId, String(workspace._id));
        
        if (!hasChannelAccess) {
            return {
                text: '⚠️ *I need to be added to this channel*\n\nPlease add me to this channel so I can analyze your communication patterns.',
                response_type: 'ephemeral'
            };
        }

        // Schedule background analysis
        after(async () => {
            try {
                logInfo('Starting background personal feedback analysis', { 
                    user_id: userId,
                    channel_id: channelId,
                    operation: 'personal_feedback_analysis'
                });
                
                const conversationHistory = await fetchConversationHistory(channelId, workspace.botToken, undefined, 40);
                console.log('📚 Fetched conversation history:', conversationHistory.length, 'messages');
                
                // Analyze recent messages for relationship context
                let relationshipInsights: { name: string; issues: string[] }[] = [];
                try {
                    const recentMessages = conversationHistory.slice(-10);
                    const relationshipMap = new Map<string, string[]>();
                    
                    for (const message of recentMessages) {
                        if (message.trim()) {
                            const analysis = await analyzeMessageForFlags(message, conversationHistory);
                            if (analysis.flags.length > 0 && analysis.target?.name) {
                                const issues = relationshipMap.get(analysis.target.name) || [];
                                analysis.flags.forEach(flag => {
                                    if (!issues.includes(flag.type)) {
                                        issues.push(flag.type);
                                    }
                                });
                                relationshipMap.set(analysis.target.name, issues);
                            }
                        }
                    }
                    
                    relationshipInsights = Array.from(relationshipMap.entries()).map(([name, issues]) => ({
                        name,
                        issues
                    }));
                } catch (err) {
                    console.error('Error analyzing relationship context:', err);
                }
                
                const feedback = await generatePersonalFeedback(conversationHistory);
                
                // Track personal feedback generation
                trackEvent(userId, EVENTS.FEATURE_PERSONAL_FEEDBACK_GENERATED, {
                    user_name: user.name,
                    workspace_id: String(workspace._id),
                    channel_id: channelId,
                    overall_score: feedback.overallScore,
                    patterns_count: feedback.patterns?.length || 0,
                    improvements_count: feedback.improvements?.length || 0,
                });
                
                // Format response
                const scoreEmoji = feedback.overallScore >= 8 ? '🟢 You\'re crushing it!' : feedback.overallScore >= 6 ? '🟡 Looking good!' : '🔴 Let\'s level up together!';
                const responseText = `*Hey there! Here's your personal feedback*\n\n` +
                    `*How you're doing: ${feedback.overallScore}/10* ${scoreEmoji}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `🌟 *You're already great at:*\n` +
                    `${feedback.strengths.slice(0, 3).map(s => `• ${s}`).join('\n')}\n\n` +
                    `💪 *Let's work on these together:*\n` +
                    `${feedback.improvements.slice(0, 3).map(i => `• ${i}`).join('\n')}\n\n` +
                    `👀 *I noticed you tend to:*\n` +
                    `${feedback.patterns.slice(0, 3).map(p => 
                        `• Use *${p.type.toLowerCase()}* quite a bit (${p.frequency} times)`
                    ).join('\n')}\n\n` +
                    (relationshipInsights.length > 0 && 
                     relationshipInsights.some(insight => insight.name && insight.name !== 'Unknown') ? 
                        `👥 *Relationship insights:*\n` +
                        `${relationshipInsights
                            .filter(insight => insight.name && insight.name !== 'Unknown')
                            .slice(0, 2)
                            .map(insight => 
                                `• Work on *${insight.issues.join(', ')}* when messaging *${insight.name}*`
                            ).join('\n')}\n\n` : '') +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `🎯 *Here's what I'd love to see you try next:*\n` +
                    `${feedback.recommendations.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n` +
                    `💙 _Based on your recent messages in <#${channelId}> • Use \`/clarity-settings\` to customize your coaching_`;
                
                const dmSent = await sendDirectMessage(userId, responseText, workspace.botToken);
                
                if (dmSent) {
                    await incrementWorkspaceUsage(workspace, 'personalFeedback');
                }
                
            } catch (err) {
                console.error('Error in background personal feedback:', err);
                await sendDirectMessage(
                    userId, 
                    '❌ Sorry, I encountered an error while generating your personal feedback report.',
                    workspace.botToken
                );
            }
        });

        return {
            text: '⏳ *Analyzing your communication patterns...*\n\nI\'ll send the detailed analysis to your DMs shortly!',
            response_type: 'ephemeral'
        };
        
    } catch (error) {
        console.error('Error in personalfeedback command:', error);
        return {
            text: 'Sorry, I couldn\'t start your feedback analysis. Please try again later.',
            response_type: 'ephemeral'
        };
    }
}

async function handleRephrase(text: string, userId: string, channelId: string, workspace: Workspace, user: SlackUser) {
    try {
        if (!text.trim()) {
            return {
                text: 'Please provide a message to rephrase. Example: `/clarity-rephrase Can you get this done ASAP?`',
                response_type: 'ephemeral'
            };
        }

        // Check workspace subscription access
        const accessCheck = await validateWorkspaceAccess(workspace, 'manualRephrase');
        
        if (!accessCheck.allowed) {
            if (accessCheck.upgradeRequired) {
                return generateUpgradeMessage('manualRephrase', accessCheck.reason || 'Feature requires upgrade', String(workspace._id));
            }
            
            if (workspace.subscription?.tier === 'PRO') {
                const proConfig = getTierConfig('PRO');
                return generateProLimitReachedMessage(
                    'manualRephrase',
                    workspace.subscription.monthlyUsage.manualRephrase || 0,
                    proConfig.monthlyLimits.manualRephrase,
                    accessCheck.resetDate || new Date()
                );
            }
            
            const freeConfig = getTierConfig('FREE');
            return generateLimitReachedMessage(
                'manualRephrase',
                workspace.subscription?.monthlyUsage.manualRephrase || 0,
                freeConfig.monthlyLimits.manualRephrase,
                accessCheck.resetDate || new Date(),
                String(workspace._id)
            );
        }

        // Schedule background analysis
        after(async () => {
            try {
                const hasChannelAccess = await isChannelAccessible(channelId, String(workspace._id));
                
                let analysisResult;
                let conversationHistory: string[] = [];
                
                if (hasChannelAccess) {
                    conversationHistory = await fetchConversationHistory(channelId, workspace.botToken, undefined, 10);
                    analysisResult = await analyzeMessageForRephraseWithContext(text, conversationHistory);
                } else {
                    analysisResult = await analyzeMessageForRephraseWithoutContext(text);
                }
                
                const workspaceSlack = new WebClient(workspace.botToken);
                
                trackEvent(userId, EVENTS.API_AI_ANALYSIS_COMPLETED, {
                    user_name: user.name,
                    workspace_id: String(workspace._id),
                    channel_id: channelId,
                    message_length: text.length,
                    analysis_type: 'manual_rephrase',
                    flags_found: analysisResult.flags.length,
                    has_context: hasChannelAccess,
                });

                if (analysisResult.flags.length === 0) {
                    await workspaceSlack.chat.postEphemeral({
                        channel: channelId,
                        user: userId,
                        text: `✅ *Your message looks great!*\n\n*Original:* "${text}"\n\nNo significant communication issues detected. 🎉`
                    });
                } else {
                    const primaryFlag = analysisResult.flags[0];
                    let improvedMessage;
                    
                    if (hasChannelAccess && conversationHistory.length > 0) {
                        improvedMessage = await generateImprovedMessageWithContext(text, primaryFlag.type, conversationHistory);
                    } else {
                        improvedMessage = await generateImprovedMessage(text, primaryFlag.type);
                    }
                    
                    await workspaceSlack.chat.postEphemeral({
                        channel: channelId,
                        user: userId,
                        text: `🔄 *Message Improvement Suggestions*\n\n*Original:* "${text}"\n\n*Improved:* "${improvedMessage.improvedMessage}"\n\n_Tone: ${improvedMessage.tone}_\n\n🔒 _Only you can see this suggestion_`
                    });
                }
                
                await incrementWorkspaceUsage(workspace, 'manualRephrase');
                
            } catch (err) {
                console.error('Error in background rephrase:', err);
                const workspaceSlack = new WebClient(workspace.botToken);
                await workspaceSlack.chat.postEphemeral({
                    channel: channelId,
                    user: userId,
                    text: '❌ Sorry, I encountered an error while rephrasing your message.'
                });
            }
        });

        return {
            text: '⏳ *Analyzing and rephrasing your message...*',
            response_type: 'ephemeral'
        };
        
    } catch (error) {
        console.error('Error in rephrase command:', error);
        return {
            text: 'Sorry, I couldn\'t start rephrasing your message. Please try again later.',
            response_type: 'ephemeral'
        };
    }
}

async function handleSettings(userId: string, user: SlackUser, workspace: Workspace, triggerId: string) {
    try {
        const isAdmin = workspace.adminSlackId === userId;
        
        // Get channels where bot is active
        const botChannels = await botChannelsCollection.find({
            workspaceId: String(workspace._id)
        }).toArray();

        const workspaceSlack = new WebClient(workspace.botToken);

        // Get subscription info
        const subscription = workspace.subscription || {
            tier: 'FREE' as const,
            status: 'active' as const
        };
        const tierConfig = getTierConfig(subscription.tier);
        
        // Build billing section (admin only)
        const billingBlocks = isAdmin ? [
            {
                type: 'divider'
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Billing & Subscription* (Admin only)\n*Current Plan:* ${tierConfig.name} - ${subscription.tier === 'PRO' ? `$${tierConfig.price}/month` : 'Free'} (${subscription.status})`
                },
                accessory: {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: subscription.tier === 'PRO' && subscription.stripeCustomerId ? 'Manage Billing' : 'Upgrade to Pro',
                        emoji: true
                    },
                    ...(subscription.tier !== 'PRO' ? { style: 'primary' } : {}),
                    url: subscription.tier === 'PRO' && subscription.stripeCustomerId
                        ? `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/api/stripe/portal?workspace=${encodeURIComponent(String(workspace._id))}`
                        : `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/api/stripe/checkout?workspace=${encodeURIComponent(String(workspace._id))}`,
                    action_id: 'billing_action'
                }
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Transfer Admin*\nTransfer workspace admin rights to another user.'
                },
                accessory: {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: 'Change Admin',
                        emoji: true
                    },
                    action_id: 'transfer_admin'
                }
            }
        ] : [];

        const modal = {
            type: 'modal' as const,
            callback_id: 'settings_modal',
            title: {
                type: 'plain_text' as const,
                text: 'Settings'
            },
            submit: {
                type: 'plain_text' as const,
                text: 'Save'
            },
            blocks: [
                {
                    type: 'input',
                    block_id: 'frequency_selection',
                    label: {
                        type: 'plain_text',
                        text: 'Report Frequency'
                    },
                    element: {
                        type: 'radio_buttons',
                        action_id: 'frequency_radio',
                        initial_option: user.analysisFrequency === 'weekly' ? {
                            text: { type: 'plain_text', text: 'Weekly' },
                            value: 'weekly'
                        } : {
                            text: { type: 'plain_text', text: 'Monthly' },
                            value: 'monthly'
                        },
                        options: [
                            { text: { type: 'plain_text', text: 'Weekly' }, value: 'weekly' },
                            { text: { type: 'plain_text', text: 'Monthly' }, value: 'monthly' }
                        ]
                    }
                },
                {
                    type: 'section',
                    block_id: 'auto_coaching_channels_section',
                    text: {
                        type: 'mrkdwn',
                        text: '*Auto Coaching Channels*\nSelect channels where you want automatic coaching:'
                    },
                    accessory: botChannels.length > 0 ? {
                        type: 'checkboxes',
                        action_id: 'channel_checkboxes',
                        ...((() => {
                            const enabledChannels = botChannels
                                .filter(channel => user.autoCoachingEnabledChannels?.includes(channel.channelId))
                                .map(channel => ({
                                    text: { type: 'plain_text', text: `#${channel.channelName}` },
                                    value: channel.channelId
                                }));
                            return enabledChannels.length > 0 ? { initial_options: enabledChannels } : {};
                        })()),
                        options: botChannels.map(channel => ({
                            text: { type: 'plain_text', text: `#${channel.channelName}` },
                            value: channel.channelId
                        }))
                    } : undefined
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: '🔒 All coaching is private to you. You can use `/clarity-rephrase` in any channel.'
                        }
                    ]
                },
                ...billingBlocks
            ],
            private_metadata: JSON.stringify({ 
                workspaceId: String(workspace._id),
                isAdmin 
            })
        };

        workspaceSlack.views.open({
            trigger_id: triggerId,
            view: modal as Parameters<typeof workspaceSlack.views.open>[0]['view']
        }).catch((err: unknown) => {
            console.error('Failed to open settings modal:', err);
        });

        return null;
        
    } catch (error) {
        console.error('Error in settings command:', error);
        return {
            text: 'Sorry, I couldn\'t process your settings request. Please try again.',
            response_type: 'ephemeral'
        };
    }
}

async function handleClarityStatus(userId: string, channelId: string, workspace: Workspace, user: SlackUser) {
    try {
        if (!channelId.startsWith('C') && !channelId.startsWith('G')) {
            return {
                text: 'Please use this command in a channel to check Clarity\'s status.',
                response_type: 'ephemeral'
            };
        }

        const isChannelActive = await isChannelAccessible(channelId, String(workspace._id));
        
        if (!isChannelActive) {
            return {
                text: '🔴 Clarity is not active in this channel.',
                response_type: 'ephemeral'
            };
        }

        const isAutoCoachingEnabled = user.autoCoachingEnabledChannels?.includes(channelId);
        
        if (!isAutoCoachingEnabled) {
            return {
                text: '🟡 Clarity is in this channel but auto coaching is not enabled for you. Use `/clarity-settings` to enable it.',
                response_type: 'ephemeral'
            };
        }

        return {
            text: '🟢 Clarity is active and auto coaching is enabled for you in this channel.',
            response_type: 'ephemeral'
        };

    } catch (error) {
        console.error('Error in status command:', error);
        return {
            text: 'Sorry, I couldn\'t check the status. Please try again later.',
            response_type: 'ephemeral'
        };
    }
}

async function handleClarityHelp() {
    return {
        text: 'Clarity Help',
        response_type: 'ephemeral',
        blocks: [
            {
                type: 'header',
                text: { type: 'plain_text', text: 'Clarity Help' }
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: '_Show all available commands_\n\n`/clarity-help`'
                    },
                    {
                        type: 'mrkdwn',
                        text: '_Rephrase your text_\n\n`/clarity-rephrase [your text]`'
                    }
                ]
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: '_Get communication insights_\n\n`/clarity-personal-feedback`'
                    },
                    {
                        type: 'mrkdwn',
                        text: '_Check Clarity\'s status_\n\n`/clarity-status`'
                    }
                ]
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: '_Customize your preferences_\n\n`/clarity-settings`'
                    },
                    {
                        type: 'mrkdwn',
                        text: '_Send us feedback_\n\n`/clarity-feedback [your feedback]`'
                    }
                ]
            },
            {
                type: 'divider'
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Documentation', emoji: true },
                        style: 'primary',
                        url: `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs`,
                        action_id: 'view_help_guide'
                    }
                ]
            }
        ]
    };
}

async function handleFeedback(text: string, userId: string, workspace: Workspace, user: SlackUser) {
    try {
        if (!text.trim()) {
            return {
                text: 'Please provide your feedback. Example: `/clarity-feedback I love this feature!`',
                response_type: 'ephemeral'
            };
        }

        await feedbackCollection.insertOne({
            _id: new ObjectId(),
            slackId: userId,
            workspaceId: String(workspace._id),
            userName: user.name,
            text: text.trim(),
            subscriptionTier: workspace.subscription?.tier || 'FREE',
            createdAt: new Date()
        });

        trackEvent(userId, EVENTS.FEATURE_FEEDBACK_SUBMITTED, {
            user_name: user.name,
            workspace_id: String(workspace._id),
            subscription_tier: workspace.subscription?.tier || 'FREE',
            feedback_length: text.trim().length,
        });

        return {
            text: '✅ *Thank you for your feedback!*\n\nWe appreciate you taking the time to share your thoughts.',
            response_type: 'ephemeral'
        };

    } catch (error) {
        console.error('Error in feedback command:', error);
        return {
            text: 'Sorry, I couldn\'t submit your feedback. Please try again later.',
            response_type: 'ephemeral'
        };
    }
}
