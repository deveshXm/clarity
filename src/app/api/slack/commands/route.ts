import { NextRequest, NextResponse, after } from 'next/server';
import { verifySlackSignature, fetchConversationHistory, sendDirectMessage, isChannelAccessible } from '@/lib/slack';
import { slackUserCollection } from '@/lib/db';
import { generatePersonalFeedback, generateImprovedMessage, analyzeMessageForFlags, analyzeMessageForRephraseWithoutContext, analyzeMessageForRephraseWithContext, generateImprovedMessageWithContext } from '@/lib/ai';

interface SlackUser {
    analysisFrequency: string;
    slackId: string;
    workspaceId: string;
    name: string;
    displayName: string;
}

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
        
        // Verify user has installed the app
        const user = await slackUserCollection.findOne({
            slackId: userId,
            isActive: true
        });
        
        if (!user) {
            return NextResponse.json({
                text: 'You need to install the Personal AI Coach app first. Please contact your admin.'
            });
        }
        
        // Route to appropriate command handler
        let response;
        switch (command) {
            case '/personalfeedback':
                response = await handlePersonalFeedback(userId, channelId);
                break;
            case '/rephrase':
                response = await handleRephrase(text, userId, channelId);
                break;
            case '/settings':
                response = await handleSettings(text, userId, user as unknown as SlackUser, triggerId!); // Pass triggerId
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
        console.error('Slack commands error:', error);
        return NextResponse.json({
            text: 'Sorry, there was an error processing your command. Please try again.',
            response_type: 'ephemeral'
        }, { status: 500 });
    }
}

async function handlePersonalFeedback(userId: string, channelId: string) {
    try {
        // Get user and workspace information for bot token
        const user = await slackUserCollection.findOne({
            slackId: userId,
            isActive: true
        });

        if (!user) {
            throw new Error('User not found or inactive');
        }

        // Get workspace-specific bot token
        const { workspaceCollection } = await import('@/lib/db');
        const { ObjectId } = await import('mongodb');
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        
        if (!workspace || !workspace.botToken) {
            throw new Error('Workspace not found or missing bot token');
        }

        // Check if bot has access to current channel first
        const hasChannelAccess = await isChannelAccessible(channelId, user.workspaceId);
        
        if (!hasChannelAccess) {
            return {
                text: '⚠️ *I need to be added to this channel*\n\nPlease add me to this channel so I can analyze your communication patterns. You can add me by mentioning @Personal AI Coach or by inviting me to the channel.',
                response_type: 'ephemeral'
            };
        }

        // Schedule background analysis using after()
        after(async () => {
            try {
                console.log('📊 Starting background personal feedback analysis for user:', userId);
                
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
                    console.error('Error analyzing relationship context:', error);
                }
                
                // Generate personal feedback
                const feedback = await generatePersonalFeedback(conversationHistory);
                console.log('🤖 Generated feedback with score:', feedback.overallScore);
                
                // Format response for DM with friendly coaching tone
                const scoreEmoji = feedback.overallScore >= 8 ? '🟢 You\'re crushing it!' : feedback.overallScore >= 6 ? '🟡 Looking good!' : '🔴 Let\'s level up together!';
                const responseText = `🤖 *Hey there! Here\'s your personal feedback*\n\n` +
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
                } else {
                    console.error('❌ Failed to send personal feedback report via DM to user:', userId);
                }
                
            } catch (error) {
                console.error('❌ Error in background personal feedback analysis:', error);
                
                // Send error message via DM if possible
                try {
                    await sendDirectMessage(
                        userId, 
                        '❌ Sorry, I encountered an error while generating your personal feedback report. Please try again later or contact support if the issue persists.',
                        workspace.botToken
                    );
                } catch (dmError) {
                    console.error('❌ Failed to send error message via DM:', dmError);
                }
            }
        });

        // Immediately return processing message to avoid timeout
        return {
            text: '⏳ *Analyzing your communication patterns...*\n\nI\'m reviewing your recent messages to generate your personal feedback report. This may take a few moments.\n\n📬 I\'ll send the detailed analysis to your DMs shortly!',
            response_type: 'ephemeral'
        };
        
    } catch (error) {
        console.error('Error in personalfeedback command:', error);
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

        // Get user and workspace information for bot token
        const user = await slackUserCollection.findOne({
            slackId: userId,
            isActive: true
        });

        if (!user) {
            throw new Error('User not found or inactive');
        }

        // Get workspace-specific bot token
        const { workspaceCollection } = await import('@/lib/db');
        const { ObjectId } = await import('mongodb');
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
                const { WebClient } = await import('@slack/web-api');
                const workspaceSlack = new WebClient(workspace.botToken);
                
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
                
            } catch (error) {
                console.error('❌ Error in background rephrase analysis:', error);
                
                // Send error message as ephemeral if possible
                try {
                    const { WebClient } = await import('@slack/web-api');
                    const workspaceSlack = new WebClient(workspace.botToken);
                    
                    await workspaceSlack.chat.postEphemeral({
                        channel: channelId,
                        user: userId,
                        text: '❌ Sorry, I encountered an error while rephrasing your message. Please try again later or contact support if the issue persists.'
                    });
                } catch (ephemeralError) {
                    console.error('❌ Failed to send error message as ephemeral:', ephemeralError);
                }
            }
        });

        // Immediately return processing message to avoid timeout
        return {
            text: '⏳ *Analyzing and rephrasing your message...*\n\nI\'ll show you the improved version with an option to send it shortly!',
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

async function handleSettings(text: string, userId: string, user: SlackUser, triggerId: string) {
    try {
        // Get workspace bot token for this user
        const { workspaceCollection } = await import('@/lib/db');
        const { ObjectId } = await import('mongodb');
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        
        if (!workspace || !workspace.botToken) {
            return {
                text: 'Error: Workspace configuration not found.',
                response_type: 'ephemeral'
            };
        }

        // Create workspace-specific WebClient
        const { WebClient } = await import('@slack/web-api');
        const workspaceSlack = new WebClient(workspace.botToken);

        // Create modal view with radio buttons
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
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Current setting:* ${user.analysisFrequency === 'weekly' ? 'Weekly' : 'Monthly'}`
                    }
                },
                {
                    type: 'divider'
                },
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
                }
            ]
        };

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
        console.error('Error in settings command:', error);
        return {
            text: 'Sorry, I couldn\'t process your settings request. Please try again.',
            response_type: 'ephemeral'
        };
    }
} 