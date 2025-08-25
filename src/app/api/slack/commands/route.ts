import { NextRequest, NextResponse, after } from 'next/server';
import { verifySlackSignature, fetchConversationHistory, sendDirectMessage, isChannelAccessible, getSlackOAuthUrl, sendOnboardingPromptMessage } from '@/lib/slack';
import { slackUserCollection, workspaceCollection, botChannelsCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { WebClient } from '@slack/web-api';
import { generatePersonalFeedback, generateImprovedMessage, analyzeMessageForFlags, analyzeMessageForRephraseWithoutContext, analyzeMessageForRephraseWithContext, generateImprovedMessageWithContext } from '@/lib/ai';
import { SlackUser, getTierConfig } from '@/types';
import { validateUserAccess, incrementUsage, generateUpgradeMessage, generateLimitReachedMessage, generateProLimitReachedMessage } from '@/lib/subscription';
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
        const triggerId = params.get('trigger_id'); // Added trigger_id
        
        if (!command || !userId || !channelId) {
            return NextResponse.json({ 
                text: 'Invalid command format' 
            }, { status: 400 });
        }

        logInfo('Slack command received', { 
            command,
            user_id: userId,
            channel_id: channelId,
            has_text: !!text,
            endpoint: '/api/slack/commands'
        });

        // Check if user exists in database (installed via website)
        const appUser = await slackUserCollection.findOne({
            slackId: userId,
            isActive: true
        });

        // Track command received
        trackEvent(userId, EVENTS.API_SLACK_COMMAND_RECEIVED, {
            command: command,
            channel_id: channelId,
            user_name: appUser?.name || 'Unknown',
            workspace_id: appUser?.workspaceId || 'Unknown',
            subscription_tier: appUser?.subscription?.tier || 'FREE',
            has_text: !!text,
            text_length: text?.length || 0,
        });

        if (!appUser) {
            // User not in database - show authorization message with Slack installation URL
            const authUrl = getSlackOAuthUrl();
            
            return NextResponse.json({
                text: 'Hey there! I\'m Clarity, your communication assistant. To get started, please authorize me through our website.',
                response_type: 'ephemeral',
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: '*Hey there! I\'m Clarity* 👋\n\nI\'m your communication assistant, ready to help you write clearer, kinder messages. To get started, please authorize me through our website.'
                        }
                    },
                    {
                        type: 'actions',
                        elements: [
                            {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: 'Authorize Me'
                                },
                                url: authUrl,
                                action_id: 'authorize_website'
                            }
                        ]
                    }
                ]
            });
        }

        console.log('✅ Authenticated user for command:', command, 'User:', userId);

        // Check onboarding status for feature commands
        const requiresOnboarding = ['/clarity-personal-feedback', '/clarity-rephrase', '/clarity-settings'].includes(command);
        if (requiresOnboarding && !appUser.hasCompletedOnboarding) {
            // Track onboarding required event
            trackEvent(userId, EVENTS.LIMITS_ONBOARDING_REQUIRED, {
                command: command,
                channel_id: channelId,
                user_name: appUser.name,
                workspace_id: appUser.workspaceId,
                subscription_tier: appUser.subscription?.tier || 'FREE',
            });

            // Get workspace bot token for onboarding prompt
            const workspace = await workspaceCollection.findOne({ _id: new ObjectId(appUser.workspaceId) });

            if (workspace && workspace.botToken) {
                // Send onboarding prompt in background
                after(async () => {
                    try {
                        await sendOnboardingPromptMessage(userId, workspace.workspaceId, workspace.botToken);
                        console.log(`✅ Sent onboarding prompt to user ${userId}`);
                    } catch (error) {
                        console.error('❌ Failed to send onboarding prompt:', error);
                    }
                });

                // Return immediate ephemeral response
                return NextResponse.json({
                    text: 'Please complete onboarding to access Clarity features.',
                    response_type: 'ephemeral',
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: 'Please complete onboarding to access Clarity features.'
                            },
                            accessory: {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: 'Complete Onboarding'
                                },
                                url: `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://yourapp.com'}/app/onboarding?user=${userId}&team=${workspace.workspaceId}`,
                                action_id: 'complete_onboarding_prompt'
                            }
                        }
                    ]
                });
            }
        }

        // Route to appropriate command handler
        let response;
        switch (command) {
            case '/clarity-personal-feedback':
                response = await handlePersonalFeedback(userId, channelId);
                break;
            case '/clarity-rephrase':
                response = await handleRephrase(text, userId, channelId);
                break;
            case '/clarity-settings':
                response = await handleSettings(text, userId, appUser as unknown as SlackUser, triggerId!); // Pass triggerId
                break;
            case '/clarity-status':
                response = await handleClarityStatus(userId, channelId, appUser as unknown as SlackUser);
                break;
            case '/clarity-help':
                response = await handleClarityHelp();
                break;
            default:
                response = {
                    text: `Unknown command: ${command}`,
                    response_type: 'ephemeral'
                };
        }

        if (response === null) {
            // Send empty 200 response to suppress Slack ephemeral message
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

async function handlePersonalFeedback(userId: string, channelId: string) {
    try {
        // Check subscription access and get user in one call
        const accessCheck = await validateUserAccess(userId, 'personalFeedback');
        
        if (!accessCheck.allowed) {
            if (accessCheck.upgradeRequired) {
                return generateUpgradeMessage('personalFeedback', accessCheck.reason || 'Feature requires upgrade', accessCheck.user?._id);
            }
            
            // Check if user is PRO (no upgrade needed, show contact us instead)
            if (accessCheck.user?.subscription?.tier === 'PRO') {

                const proConfig = getTierConfig('PRO');
                return generateProLimitReachedMessage(
                    'personalFeedback',
                    accessCheck.user.subscription.monthlyUsage.personalFeedback || 0,
                    proConfig.monthlyLimits.personalFeedback,
                    accessCheck.resetDate || new Date()
                );
            }
            
            // FREE user limit reached
            const freeConfig = getTierConfig('FREE');
            return generateLimitReachedMessage(
                'personalFeedback',
                accessCheck.user?.subscription?.monthlyUsage.personalFeedback || 0,
                freeConfig.monthlyLimits.personalFeedback,
                accessCheck.resetDate || new Date(),
                accessCheck.user?._id
            );
        }

        const user = accessCheck.user!; // We know it exists from validation

        // Get workspace-specific bot token

        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        
        if (!workspace || !workspace.botToken) {
            throw new Error('Workspace not found or missing bot token');
        }

        // Check if bot has access to current channel first
        const hasChannelAccess = await isChannelAccessible(channelId, user.workspaceId);
        
        if (!hasChannelAccess) {
            return {
                text: '⚠️ *I need to be added to this channel*\n\nPlease add me to this channel so I can analyze your communication patterns. You can add me by mentioning @Clarity or by inviting me to the channel. If the app is already present, try re-inviting me to the channel.',
                response_type: 'ephemeral'
            };
        }

        // Schedule background analysis using after()
        after(async () => {
            try {
                logInfo('Starting background personal feedback analysis', { 
                    user_id: userId,
                    channel_id: channelId,
                    operation: 'personal_feedback_analysis'
                });
                
                // Get user's last 40 messages from conversation history using workspace-specific token
                const conversationHistory = await fetchConversationHistory(channelId, workspace.botToken, undefined, 40);
                console.log('📚 Fetched conversation history:', conversationHistory.length, 'messages');
                
                // Analyze recent messages for relationship context
                let relationshipInsights: { name: string; issues: string[] }[] = [];
                try {
                    const recentMessages = conversationHistory.slice(-10); // Analyze last 10 messages for targets
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
                    
                    console.log('🎯 Relationship insights found:', relationshipInsights.length);
                } catch (error) {
                    const errorObj = error instanceof Error ? error : new Error(String(error));
                    logError('Error analyzing relationship context', errorObj, { 
                        user_id: userId,
                        operation: 'relationship_analysis'
                    });
                    trackError(userId, errorObj, { 
                        operation: 'relationship_analysis',
                        context: 'personal_feedback'
                    });
                }
                
                // Generate personal feedback
                const feedback = await generatePersonalFeedback(conversationHistory);
                logInfo('Generated personal feedback', { 
                    user_id: userId,
                    overall_score: feedback.overallScore,
                    patterns_count: feedback.patterns?.length || 0,
                    improvements_count: feedback.improvements?.length || 0,
                    operation: 'personal_feedback_generation'
                });

                // Track personal feedback generation
                trackEvent(userId, EVENTS.FEATURE_PERSONAL_FEEDBACK_GENERATED, {
                    user_name: user.name,
                    workspace_id: user.workspaceId,
                    channel_id: channelId,
                    overall_score: feedback.overallScore,
                    patterns_count: feedback.patterns?.length || 0,
                    improvements_count: feedback.improvements?.length || 0,
                    strengths_count: feedback.strengths?.length || 0,
                    recommendations_count: feedback.recommendations?.length || 0,
                    relationship_insights_count: relationshipInsights.length,
                    conversation_messages_analyzed: conversationHistory.length,
                });
                
                // Format response for DM with friendly coaching tone
                const scoreEmoji = feedback.overallScore >= 8 ? '🟢 You\'re crushing it!' : feedback.overallScore >= 6 ? '🟡 Looking good!' : '🔴 Let\'s level up together!';
                const responseText = `*Hey there! Here\'s your personal feedback*\n\n` +
                    `*How you\'re doing: ${feedback.overallScore}/10* ${scoreEmoji}\n\n` +
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
                     relationshipInsights.some(insight => insight.name && insight.name !== 'Unknown' && insight.name.trim() !== '') ? 
                        `👥 *Relationship insights:*\n` +
                        `${relationshipInsights
                            .filter(insight => insight.name && insight.name !== 'Unknown' && insight.name.trim() !== '')
                            .slice(0, 2)
                            .map(insight => 
                                `• Work on *${insight.issues.join(', ')}* when messaging *${insight.name}*`
                            ).join('\n')}\n\n` : '') +
                    
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    
                    `🎯 *Here's what I'd love to see you try next:*\n` +
                    `${feedback.recommendations.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n` +
                    
                    `💙 _Based on your recent messages in <#${channelId}> • Use \`/settings\` to customize your coaching_`;
                
                // Send results via DM
                const dmSent = await sendDirectMessage(userId, responseText, workspace.botToken);
                
                if (dmSent) {
                    console.log('✅ Personal feedback report sent via DM to user:', userId);
                    
                    // Track usage after successful processing
                    await incrementUsage(userId, 'personalFeedback');
                    console.log('📊 Usage tracked for personalFeedback feature');
                } else {
                    console.error('❌ Failed to send personal feedback report via DM to user:', userId);
                }
                
            } catch (error) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                logError('Error in background personal feedback analysis', errorObj, { 
                    user_id: userId,
                    channel_id: channelId,
                    operation: 'personal_feedback_analysis'
                });
                trackError(userId, errorObj, { 
                    operation: 'personal_feedback_analysis',
                    context: 'background_processing'
                });
                
                // Send error message via DM if possible
                try {
                    await sendDirectMessage(
                        userId, 
                        '❌ Sorry, I encountered an error while generating your personal feedback report. Please try again later or contact support if the issue persists.',
                        workspace.botToken
                    );
                } catch (dmError) {
                    const dmErrorObj = dmError instanceof Error ? dmError : new Error(String(dmError));
                    logError('Failed to send error message via DM', dmErrorObj, { 
                        user_id: userId,
                        operation: 'send_error_dm'
                    });
                    trackError(userId, dmErrorObj, { 
                        operation: 'send_error_dm',
                        context: 'personal_feedback_error'
                    });
                }
            }
        });

        // Immediately return processing message to avoid timeout
        return {
            text: '⏳ *Analyzing your communication patterns...*\n\nI\'m reviewing your recent messages to generate your personal feedback report. This may take a few moments.\n\n📬 I\'ll send the detailed analysis to your DMs shortly!',
            response_type: 'ephemeral'
        };
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error in personalfeedback command', errorObj, { 
            user_id: userId,
            channel_id: channelId,
            operation: 'personalfeedback_command'
        });
        trackError(userId, errorObj, { 
            operation: 'personalfeedback_command',
            context: 'command_initialization'
        });
        return {
            text: 'Sorry, I couldn&apos;t start your feedback analysis. Please try again later.',
            response_type: 'ephemeral'
        };
    }
}

async function handleRephrase(text: string, userId: string, channelId: string) {
    try {
        if (!text.trim()) {
            return {
                text: 'Please provide a message to rephrase. Example: `/rephrase Can you get this done ASAP?`',
                response_type: 'ephemeral'
            };
        }

        // Check subscription access and get user in one call
        const accessCheck = await validateUserAccess(userId, 'manualRephrase');
        
        if (!accessCheck.allowed) {
            if (accessCheck.upgradeRequired) {
                return generateUpgradeMessage('manualRephrase', accessCheck.reason || 'Feature requires upgrade', accessCheck.user?._id);
            }
            
            // Check if user is PRO (no upgrade needed, show contact us instead)
            if (accessCheck.user?.subscription?.tier === 'PRO') {
                const proConfig = getTierConfig('PRO');
                return generateProLimitReachedMessage(
                    'manualRephrase',
                    accessCheck.user.subscription.monthlyUsage.manualRephrase || 0,
                    proConfig.monthlyLimits.manualRephrase,
                    accessCheck.resetDate || new Date()
                );
            }
            
            // FREE user limit reached
            const freeConfig = getTierConfig('FREE');
            return generateLimitReachedMessage(
                'manualRephrase',
                accessCheck.user?.subscription?.monthlyUsage.manualRephrase || 0,
                freeConfig.monthlyLimits.manualRephrase,
                accessCheck.resetDate || new Date(),
                accessCheck.user?._id
            );
        }

        const user = accessCheck.user!; // We know it exists from validation

        // Get workspace-specific bot token

        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        
        if (!workspace || !workspace.botToken) {
            throw new Error('Workspace not found or missing bot token');
        }

        // Schedule background analysis using after()
        after(async () => {
            try {
                console.log('🔄 Starting background rephrase analysis for user:', userId);
                
                // Check if bot has access to the channel for context
                const hasChannelAccess = await isChannelAccessible(channelId, user.workspaceId);
                console.log('📋 Bot channel access:', hasChannelAccess);
                
                let analysisResult;
                let conversationHistory: string[] = [];
                
                if (hasChannelAccess) {
                    // Bot is in channel - fetch context and use context-aware analysis
                    console.log('📚 Fetching conversation history for context...');
                    conversationHistory = await fetchConversationHistory(channelId, workspace.botToken, undefined, 10);
                    analysisResult = await analyzeMessageForRephraseWithContext(text, conversationHistory);
                    console.log('📝 Context-aware analysis complete, found', analysisResult.flags.length, 'issues');
                } else {
                    // Bot not in channel - analyze without context
                    analysisResult = await analyzeMessageForRephraseWithoutContext(text);
                    console.log('📝 Context-free analysis complete, found', analysisResult.flags.length, 'issues');
                }
                
                // Create workspace-specific WebClient

                const workspaceSlack = new WebClient(workspace.botToken);
                
                // Track AI analysis completion
                trackEvent(userId, EVENTS.API_AI_ANALYSIS_COMPLETED, {
                    user_name: user.name,
                    workspace_id: user.workspaceId,
                    channel_id: channelId,
                    message_length: text.length,
                    analysis_type: 'manual_rephrase',
                    flags_found: analysisResult.flags.length,
                    has_context: hasChannelAccess,
                    context_messages: conversationHistory.length,
                });

                if (analysisResult.flags.length === 0) {
                    // Send ephemeral message for messages that don't need improvement
                    await workspaceSlack.chat.postEphemeral({
                        channel: channelId,
                        user: userId,
                        text: `✅ *Your message looks great!*\n\n*Original:* "${text}"\n\nNo significant communication issues detected. Your message is clear and professional! 🎉`
                    });
                } else {
                    // Generate improved version for the first flag found
                    const primaryFlag = analysisResult.flags[0];
                    let improvedMessage;
                    
                    if (hasChannelAccess && conversationHistory.length > 0) {
                        // Use context-aware improvement
                        improvedMessage = await generateImprovedMessageWithContext(text, primaryFlag.type, conversationHistory);
                        console.log('💡 Generated context-aware improved message');
                    } else {
                        // Use context-free improvement
                        improvedMessage = await generateImprovedMessage(text, primaryFlag.type);
                        console.log('💡 Generated context-free improved message');
                    }
                    
                    // Send ephemeral message with improved suggestion
                    await workspaceSlack.chat.postEphemeral({
                        channel: channelId,
                        user: userId,
                        text: `🔄 *Message Improvement Suggestions*\n\n*Original:* "${text}"\n\n*Improved:* "${improvedMessage.improvedMessage}"\n\n_Tone: ${improvedMessage.tone}_`
                    });
                }
                
                console.log('✅ Rephrase results sent as ephemeral message to user:', userId);
                
                // Track usage after successful processing
                await incrementUsage(userId, 'manualRephrase');
                console.log('📊 Usage tracked for manualRephrase feature');
                
            } catch (error) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                logError('Error in background rephrase analysis', errorObj, { 
                    user_id: userId,
                    channel_id: channelId,
                    operation: 'rephrase_analysis'
                });
                trackError(userId, errorObj, { 
                    operation: 'rephrase_analysis',
                    context: 'background_processing'
                });
                
                // Send error message as ephemeral if possible
                try {
                    const workspaceSlack = new WebClient(workspace.botToken);
                    
                    await workspaceSlack.chat.postEphemeral({
                        channel: channelId,
                        user: userId,
                        text: '❌ Sorry, I encountered an error while rephrasing your message. Please try again later or contact support if the issue persists.'
                    });
                } catch (ephemeralError) {
                    const ephemeralErrorObj = ephemeralError instanceof Error ? ephemeralError : new Error(String(ephemeralError));
                    logError('Failed to send error message as ephemeral', ephemeralErrorObj, { 
                        user_id: userId,
                        channel_id: channelId,
                        operation: 'send_ephemeral_error'
                    });
                    trackError(userId, ephemeralErrorObj, { 
                        operation: 'send_ephemeral_error',
                        context: 'rephrase_error'
                    });
                }
            }
        });

        // Immediately return processing message to avoid timeout
        return {
            text: '⏳ *Analyzing and rephrasing your message...*\n\nI\'ll show you the improved version with an option to send it shortly!',
            response_type: 'ephemeral'
        };
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error in rephrase command', errorObj, { 
            user_id: userId,
            channel_id: channelId,
            operation: 'rephrase_command'
        });
        trackError(userId, errorObj, { 
            operation: 'rephrase_command',
            context: 'command_initialization'
        });
        return {
            text: 'Sorry, I couldn\'t start rephrasing your message. Please try again later.',
            response_type: 'ephemeral'
        };
    }
}

async function handleSettings(text: string, userId: string, user: SlackUser, triggerId: string) {
    try {
        // Get workspace bot token for this user

        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        
        if (!workspace || !workspace.botToken) {
            return {
                text: 'Error: Workspace configuration not found.',
                response_type: 'ephemeral'
            };
        }

        // Get channels where bot is active for this workspace
        const botChannels = await botChannelsCollection.find({
            workspaceId: user.workspaceId
        }).toArray();

        // Create workspace-specific WebClient
        const workspaceSlack = new WebClient(workspace.botToken);

        // Get subscription info for billing section
        const subscription = user.subscription || {
            tier: 'FREE' as const,
            status: 'active' as const
        };
        const tierConfig = getTierConfig(subscription.tier);
        
        // Determine billing section content
        const isPaidUser = subscription.tier === 'PRO' && subscription.stripeCustomerId;
        const billingUrl = isPaidUser 
            ? `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/api/stripe/portal?user=${encodeURIComponent(user._id)}`
            : `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/api/stripe/checkout?user=${encodeURIComponent(user._id)}`;
        
        const billingButtonText = isPaidUser ? 'Manage Billing' : 'Upgrade to Pro';
        const subscriptionStatusText = isPaidUser 
            ? `*Current Plan:* ${tierConfig.name} - $${tierConfig.price}/month (${subscription.status})`
            : `*Current Plan:* ${tierConfig.name} (${subscription.status})`;

        // Create modal view with radio buttons, toggle, and billing section
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
                            text: {
                                type: 'plain_text',
                                text: 'Weekly'
                            },
                            value: 'weekly'
                        } : {
                            text: {
                                type: 'plain_text', 
                                text: 'Monthly'
                            },
                            value: 'monthly'
                        },
                        options: [
                            {
                                text: {
                                    type: 'plain_text',
                                    text: 'Weekly'
                                },
                                value: 'weekly'
                            },
                            {
                                text: {
                                    type: 'plain_text',
                                    text: 'Monthly'
                                },
                                value: 'monthly'
                            }
                        ]
                    }
                },
                {
                    type: 'section',
                    block_id: 'auto_coaching_channels_section',
                    text: {
                        type: 'mrkdwn',
                        text: '*Auto Coaching Channels*\nCheck channels where you want to enable automatic coaching:'
                    },
                    accessory: {
                        type: 'checkboxes',
                        action_id: 'channel_checkboxes',
                        ...((() => {
                            const enabledChannels = botChannels
                                .filter(channel => user.autoCoachingEnabledChannels.includes(channel.channelId))
                                .map(channel => ({
                                    text: {
                                        type: 'plain_text',
                                        text: `#${channel.channelName}`
                                    },
                                    value: channel.channelId
                                }));
                            
                            // Only include initial_options if there are enabled channels
                            return enabledChannels.length > 0 ? { initial_options: enabledChannels } : {};
                        })()),
                        options: botChannels.map(channel => ({
                            text: {
                                type: 'plain_text',
                                text: `#${channel.channelName}`
                            },
                            value: channel.channelId
                        }))
                    }
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: 'You can still use `/rephrase [your message]` manually in any channel.'
                        }
                    ]
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Billing & Subscription*\n${subscriptionStatusText}`
                    },
                    accessory: {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: billingButtonText,
                            emoji: true
                        },
                        ...(isPaidUser ? {} : { style: 'primary' }),
                        url: billingUrl,
                        action_id: 'billing_action'
                    }
                }
            ]
        };

        // Track settings modal opened
        trackEvent(userId, EVENTS.API_SLACK_INTERACTIVE_RECEIVED, {
            user_name: user.name,
            workspace_id: user.workspaceId,
            interaction_type: 'settings_modal_opened',
            subscription_tier: subscription.tier,
        });

        // Open the modal
        workspaceSlack.views.open({
            trigger_id: triggerId,
            view: modal as Parameters<typeof workspaceSlack.views.open>[0]['view']
        }).catch((err: unknown) => {
            console.error('Failed to open settings modal:', err);
        });

        // Respond immediately to Slack to avoid operation_timeout
        return null;
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error in settings command', errorObj, { 
            user_id: userId,
            operation: 'settings_command'
        });
        trackError(userId, errorObj, { 
            operation: 'settings_command',
            context: 'command_processing'
        });
        return {
            text: 'Sorry, I couldn\'t process your settings request. Please try again.',
            response_type: 'ephemeral'
        };
    }
}

async function handleClarityStatus(userId: string, channelId: string, user: SlackUser) {
    try {
        // Check if command was invoked in a channel (C for public, G for private) vs DM (D)
        if (!channelId.startsWith('C') && !channelId.startsWith('G')) {
            return {
                text: 'Please use this command in a channel to check Clarity\'s status.',
                response_type: 'ephemeral'
            };
        }

        // Check if bot is installed in this channel
        const isChannelActive = await isChannelAccessible(channelId, user.workspaceId);
        
        if (!isChannelActive) {
            return {
                text: '🔴 Clarity is not installed in this channel.',
                response_type: 'ephemeral'
            };
        }

        // Check if auto coaching is enabled for this channel
        const isAutoCoachingEnabled = user.autoCoachingEnabledChannels.includes(channelId);
        
        if (!isAutoCoachingEnabled) {
            return {
                text: '🟡 Clarity is installed but auto coaching is not enabled in this channel.',
                response_type: 'ephemeral'
            };
        }

        // Bot is installed and auto coaching is enabled
        return {
            text: '🟢 Clarity is installed and monitoring this channel for auto coaching.',
            response_type: 'ephemeral'
        };

    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error in status command', errorObj, { 
            user_id: userId,
            channel_id: channelId,
            operation: 'status_command'
        });
        trackError(userId, errorObj, { 
            operation: 'status_command',
            context: 'command_processing'
        });
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
                text: {
                    type: 'plain_text',
                    text: 'Clarity Help'
                }
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: '_Show all available Clarity commands and features_\n\n`/clarity-help`'
                    },
                    {
                        type: 'mrkdwn',
                        text: '_Rephrase your original text for clarity or variation_\n\n`/rephrase your_original_text`'
                    }
                ]
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: '_Get analysis of your recent communication patterns_\n\n`/personalfeedback`'
                    },
                    {
                        type: 'mrkdwn',
                        text: '_Check Clarity\'s status in current channel_\n\n`/status`'
                    }
                ]
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: '_Configure your AI coach preferences_\n\n`/settings`'
                    },
                    {
                        type: 'mrkdwn',
                        text: ''
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
                        text: {
                            type: 'plain_text',
                            text: 'Need more help?',
                            emoji: true
                        },
                        style: 'primary',
                        url: `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs`,
                        action_id: 'view_help_guide'
                    }
                ]
            }
        ]
    };
} 