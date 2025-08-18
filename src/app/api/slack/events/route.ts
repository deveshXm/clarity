import { NextRequest, NextResponse, after } from 'next/server';
import { verifySlackSignature, fetchConversationHistory, sendEphemeralMessage, isChannelAccessible } from '@/lib/slack';
import { workspaceCollection, slackUserCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { SlackEventSchema } from '@/types';
import { comprehensiveMessageAnalysis } from '@/lib/ai';
import { validateUserAccess, incrementUsage } from '@/lib/subscription';
import { trackEvent, trackError } from '@/lib/posthog';
import { EVENTS, ERROR_CATEGORIES } from '@/lib/analytics/events';
import { logError, logSlackEvent } from '@/lib/logger';

export async function POST(request: NextRequest) {
    try {
        // Get request body and headers
        const body = await request.text();
        const signature = request.headers.get('x-slack-signature');
        const timestamp = request.headers.get('x-slack-request-timestamp');
        
        if (!signature || !timestamp) {
            logError('Missing Slack signature or timestamp');
            return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
        }
        
        // Verify request signature
        const signingSecret = process.env.SLACK_SIGNING_SECRET;
        if (!signingSecret) {
            logError('Missing SLACK_SIGNING_SECRET environment variable');
            return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
        }
        
        const isValid = verifySlackSignature(signingSecret, signature, timestamp, body);
        if (!isValid) {
            logError('Invalid Slack signature');
            trackError('anonymous', new Error('Invalid Slack signature'), { 
                endpoint: '/api/slack/events',
                category: ERROR_CATEGORIES.SLACK_API
            });
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
            
            // Handle app uninstall event
            if (event.type === 'app_uninstalled') {
                console.log('🗑️ App uninstall event received:', JSON.stringify(event, null, 2));
                console.log('🗑️ Full event data:', JSON.stringify(eventData, null, 2));
                
                // The team ID might be in the event itself or in the parent eventData
                const teamId = event.team_id || eventData.team_id;
                console.log('🗑️ Extracted team ID:', teamId);
                
                // Process uninstall in background
                after(async () => {
                    try {
                        await handleAppUninstall(teamId);
                        console.log('✅ App uninstall processing completed');
                    } catch (error) {
                        console.error('❌ App uninstall processing error:', error);
                    }
                });
            }
            
            // Handle tokens revoked event (fallback for app uninstall)
            if (event.type === 'tokens_revoked') {
                console.log('🔑 Tokens revoked event received:', JSON.stringify(event, null, 2));
                console.log('🔑 Full event data:', JSON.stringify(eventData, null, 2));
                
                // The team ID might be in the event itself or in the parent eventData
                const teamId = event.team_id || eventData.team_id;
                console.log('🔑 Extracted team ID:', teamId);
                
                // Process token revocation (same as uninstall) in background
                after(async () => {
                    try {
                        await handleAppUninstall(teamId);
                        console.log('✅ Token revocation processing completed');
                    } catch (error) {
                        console.error('❌ Token revocation processing error:', error);
                    }
                });
            }
            
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
        logSlackEvent('message_received', {
            user: event.user,
            text: typeof event.text === 'string' ? event.text.substring(0, 100) + '...' : '',
            channel: event.channel,
            channel_type: event.channel_type,
            bot_id: event.bot_id,
            subtype: event.subtype
        });
        
        // Skip bot messages and system messages
        if (event.bot_id || event.subtype) {

            return;
        }
        
        // Only process new messages - skip updated/old messages
        const messageTimestamp = parseFloat(event.ts as string) * 1000; // Convert to milliseconds
        const currentTime = Date.now();
        const timeDifference = currentTime - messageTimestamp;
        
        // If message is older than 10 seconds, it's likely an updated message or old event
        if (timeDifference > 10000) {

            return;
        }
        


        // Validate event data
        const validatedEvent = SlackEventSchema.parse(event);
        
        // Check subscription access and get user in one call
        const accessCheck = await validateUserAccess(validatedEvent.user, 'autoCoaching');
        
        if (!accessCheck.allowed) {
            // Track event processed but skipped
            trackEvent(validatedEvent.user, EVENTS.API_SLACK_EVENT_PROCESSED, {
                event_type: 'message',
                channel_id: validatedEvent.channel,
                processed: false,
                skip_reason: 'access_denied',
                subscription_tier: accessCheck.user?.subscription?.tier || 'FREE',
            });
            return;
        }
        
        const user = accessCheck.user!; // We know it exists from validation
        

        
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
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        if (!workspace || !workspace.botToken) {
            console.error('❌ Workspace not found or missing bot token for user:', user.slackId);
            return;
        }
        
        // OPTIMIZED: Single comprehensive AI analysis (replaces 4 separate AI calls)
        console.log('🔍 Starting comprehensive message analysis...');
        
        // Always fetch conversation history for better context
        console.log('📚 Fetching conversation history for context...');
        const conversationHistory = await fetchConversationHistory(
            validatedEvent.channel,
            workspace.botToken,
            validatedEvent.ts,
            15
        );
        
        console.log('Fetched conversation history:', conversationHistory.length, 'messages');
        
        // Single AI call for all analysis steps
        const analysis = await comprehensiveMessageAnalysis(
            validatedEvent.text,
            conversationHistory
        );
        
        console.log('Comprehensive analysis result:', {
            needsCoaching: analysis.needsCoaching,
            flagsFound: analysis.flags.length,
            hasTarget: !!analysis.target,
            hasImprovement: !!analysis.improvedMessage,
            reasoning: analysis.reasoning.primaryIssue
        });

        // Track AI analysis completion
        trackEvent(validatedEvent.user, EVENTS.API_AI_ANALYSIS_COMPLETED, {
            user_name: user.name,
            workspace_id: user.workspaceId,
            channel_id: validatedEvent.channel,
            message_length: validatedEvent.text.length,
            analysis_type: 'auto_coaching',
            flags_found: analysis.flags.length,
            needs_coaching: analysis.needsCoaching,
            has_target: !!analysis.target,
            has_improvement: !!analysis.improvedMessage,
            context_messages: conversationHistory.length,
            primary_issue: analysis.reasoning.primaryIssue,
        });
        
        // If no coaching needed, exit early
        if (!analysis.needsCoaching || analysis.flags.length === 0) {
            return;
        }
        

        
        // Use the improved message from comprehensive analysis
        if (!analysis.improvedMessage) {
            console.log('❌ No improved message generated, skipping feedback');
            return;
        }
        
        const primaryFlag = analysis.flags[0];
        const improvedMessage = analysis.improvedMessage;
        
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
            
            // Track successful auto coaching trigger (only when message is actually sent)
            trackEvent(user.slackId, EVENTS.FEATURE_AUTO_COACHING_TRIGGERED, {
                user_name: user.name,
                workspace_id: user.workspaceId,
                channel_id: validatedEvent.channel,
                flags_found: analysis.flags.map(f => f.type),
                primary_issue: analysis.reasoning.primaryIssue,
                has_target: !!analysis.target,
                message_length: validatedEvent.text.length,
                subscription_tier: user.subscription?.tier || 'FREE',
                target_name: analysis.target?.name || null,
            });
            
            // Track usage after successful auto-coaching
            await incrementUsage(validatedEvent.user, 'autoCoaching');
            console.log('📊 Usage tracked for autoCoaching feature');
        } else {
            console.error('❌ Failed to send ephemeral feedback');
        }
        
        // TODO: Phase 5 - Store analysis instance in database
        // TODO: Phase 6 - Update user's communication patterns for reporting
        
    } catch (error) {
        console.error('Error handling message event:', error);
    }
}

async function handleAppUninstall(teamId: string) {
    try {
        console.log('🔄 Processing app uninstall for team:', teamId);
        
        if (!teamId) {
            console.error('❌ No team ID provided for app uninstall');
            return;
        }
        
        // Find the workspace by Slack team ID
        const workspace = await workspaceCollection.findOne({ workspaceId: teamId });
        
        if (!workspace) {
            console.log('⚠️ Workspace not found for team:', teamId);
            console.log('🔍 Searching all workspaces to debug...');
            
            // Debug: List all workspaces to see what we have
            const allWorkspaces = await workspaceCollection.find({}).toArray();
            console.log('📋 All workspaces:', allWorkspaces.map(w => ({ 
                id: w._id, 
                workspaceId: w.workspaceId, 
                name: w.name 
            })));
            return;
        }
        
        // Deactivate all users in this workspace instead of deleting them
        // This preserves their subscription, usage history, and settings
        const result = await slackUserCollection.updateMany(
            { workspaceId: workspace._id.toString() },
            { 
                $set: { 
                    isActive: false,
                    updatedAt: new Date()
                }
            }
        );
        
        console.log(`🔄 Deactivated ${result.modifiedCount} users from workspace ${teamId}`);
        
        // Optionally deactivate the workspace as well (but keep the record)
        await workspaceCollection.updateOne(
            { workspaceId: teamId },
            { 
                $set: { 
                    isActive: false,
                    updatedAt: new Date()
                }
            }
        );
        
        console.log(`✅ Successfully processed app uninstall for workspace ${teamId}`);
        
    } catch (error) {
        console.error('Error processing app uninstall:', error);
    }
} 