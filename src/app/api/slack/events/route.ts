import { NextRequest, NextResponse, after } from 'next/server';
import { verifySlackSignature, fetchConversationHistory, sendEphemeralMessage, isChannelAccessible } from '@/lib/slack';
import { SlackEventSchema } from '@/types';
import { slackUserCollection } from '@/lib/db';
import { analyzeMessageForFlags, identifyMessageTarget, generateImprovedMessage, quickCheckNeedsCoaching } from '@/lib/ai';

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
        
        // Parse event data
        const eventData = JSON.parse(body);
        
        // Handle URL verification challenge
        if (eventData.type === 'url_verification') {
            return NextResponse.json({ challenge: eventData.challenge });
        }
        
        // Handle event callbacks
        if (eventData.type === 'event_callback') {
            const event = eventData.event;
            
            // Only process message events in channels and groups (not DMs)
            if (event.type === 'message' && (event.channel_type === 'channel' || event.channel_type === 'group')) {
                console.log('🚀 Scheduling background processing for message event');
                
                // Process message event in background to prevent Slack timeout and duplicate events
                after(async () => {
                    try {
                        console.log('🔄 Starting background message processing...');
                        
                        await handleMessageEvent(event);
                        console.log('✅ Background message processing completed');
                    } catch (error) {
                        console.error('❌ Background message processing error:', error);
                        // Don't throw - we've already responded to Slack
                    }
                });
            }
        }
        
        // Return immediate response to Slack to prevent timeouts and duplicate events
        console.log('⚡ Sending immediate response to Slack');
        return NextResponse.json({ ok: true });
        
    } catch (error) {
        console.error('Slack events error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

async function handleMessageEvent(event: Record<string, unknown>) {
    try {
        console.log('📨 Received message event:', {
            user: event.user,
            text: typeof event.text === 'string' ? event.text.substring(0, 100) + '...' : '',
            channel: event.channel,
            channel_type: event.channel_type,
            bot_id: event.bot_id,
            subtype: event.subtype
        });
        
        // Skip bot messages and system messages
        if (event.bot_id || event.subtype) {
            console.log('⏭️ Skipping bot/system message');
            return;
        }
        
        // Only process new messages - skip updated/old messages
        const messageTimestamp = parseFloat(event.ts as string) * 1000; // Convert to milliseconds
        const currentTime = Date.now();
        const timeDifference = currentTime - messageTimestamp;
        
        // If message is older than 10 seconds, it's likely an updated message or old event
        if (timeDifference > 10000) {
            console.log('⏭️ Skipping old/updated message, age:', Math.round(timeDifference / 1000), 'seconds');
            return;
        }
        
        console.log('✅ Processing new message, age:', Math.round(timeDifference / 1000), 'seconds');

        // Validate event data
        const validatedEvent = SlackEventSchema.parse(event);
        
        // Check if the user who sent the message has installed our app
        const user = await slackUserCollection.findOne({
            slackId: validatedEvent.user,
            isActive: true
        });
        
        if (!user) {
            console.log('❌ User not found or inactive:', validatedEvent.user);
            return;
        }
        
        console.log('✅ Processing message from user:', user.displayName);
        console.log('📝 Message text:', validatedEvent.text);
        console.log('📍 Channel:', validatedEvent.channel);
        
        // Check if bot is active in this channel
        const isChannelActive = await isChannelAccessible(validatedEvent.channel, user.workspaceId);
        if (!isChannelActive) {
            console.log('⏭️ Bot not active in this channel, skipping analysis');
            return;
        }
        
        console.log('🤖 Bot is active in channel, checking user preferences...');
        
        // Check if user has auto rephrase enabled
        if (user.autoRephraseEnabled === false) {
            console.log('⏭️ Auto rephrase disabled for user, skipping analysis');
            return;
        }
        
        console.log('✅ Auto rephrase enabled, proceeding with analysis');
        
        // Get workspace bot token for API calls
        const { workspaceCollection } = await import('@/lib/db');
        const { ObjectId } = await import('mongodb');
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        if (!workspace || !workspace.botToken) {
            console.error('❌ Workspace not found or missing bot token for user:', user.slackId);
            return;
        }
        
        // STEP 1: Quick check if message might need coaching (no context needed)
        console.log('🔍 Step 1: Quick coaching check...');
        const needsCoaching = await quickCheckNeedsCoaching(validatedEvent.text);
        
        if (!needsCoaching) {
            console.log('✅ Quick check: No coaching needed');
            return;
        }
        
        console.log('⚠️ Quick check: Message may need coaching, proceeding to detailed analysis');
        
        // STEP 2: Fetch conversation context only when needed
        console.log('📚 Fetching conversation history for context...');
        const conversationHistory = await fetchConversationHistory(
            validatedEvent.channel,
            workspace.botToken,
            validatedEvent.ts,
            15
        );
        
        console.log('Fetched conversation history:', conversationHistory.length, 'messages');
        
        // STEP 3: Detailed analysis with conversation context
        console.log('🔍 Step 2: Detailed analysis with context...');
        const analysisResult = await analyzeMessageForFlags(
            validatedEvent.text,
            conversationHistory
        );
        
        console.log('Analysis result:', analysisResult);
        
        // If no flags were found, no need to send feedback
        if (analysisResult.flags.length === 0) {
            console.log('✅ No communication issues detected');
            return;
        }
        
        console.log('🚩 Communication issues found:', analysisResult.flags.map(f => f.type));
        
        // Generate improved message for the primary issue
        const primaryFlag = analysisResult.flags[0];
        console.log('🎯 Generating improved message for:', primaryFlag.type);
        
        const improvedMessage = await generateImprovedMessage(validatedEvent.text, primaryFlag.type);
        
        // Identify message target (who the message is directed to) - for future use
        await identifyMessageTarget(
            validatedEvent.text,
            conversationHistory
        );
        
        // Build interactive message with Block Kit
        const blocks = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `I noticed your message could be improved for *${primaryFlag.type}*:\n\n*${primaryFlag.explanation}*`
                }
            },
            {
                type: "divider"
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*📝 Original:*\n"${validatedEvent.text}"`
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*✨ Improved:*\n"${improvedMessage.improvedMessage}"`
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*💡 Key improvements:*\n${improvedMessage.improvements.map((improvement: string) => `• ${improvement}`).join('\n')}`
                }
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "🔄 Replace Message"
                        },
                        style: "primary",
                        action_id: "replace_message",
                        value: JSON.stringify({
                            original_ts: validatedEvent.ts,
                            channel: validatedEvent.channel,
                            original_text: validatedEvent.text,
                            improved_text: improvedMessage.improvedMessage,
                            user: validatedEvent.user
                        })
                    }
                ]
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: "💡 *Tip: Use `/settings` to adjust coaching preferences*"
                    }
                ]
            }
        ];
        
        // Send ephemeral message with interactive components
        console.log('📤 Sending interactive coaching feedback...');
        const success = await sendEphemeralMessage(
            validatedEvent.channel,
            validatedEvent.user,
            "🤖 AI Communication Coach", // Fallback text
            workspace.botToken, // Workspace-specific bot token
            [], // Legacy attachments (empty)
            blocks // Block Kit blocks
        );
        
        if (success) {
            console.log('✅ Ephemeral feedback sent successfully');
        } else {
            console.error('❌ Failed to send ephemeral feedback');
        }
        
        // TODO: Phase 5 - Store analysis instance in database
        // TODO: Phase 6 - Update user's communication patterns for reporting
        
    } catch (error) {
        console.error('Error handling message event:', error);
    }
} 