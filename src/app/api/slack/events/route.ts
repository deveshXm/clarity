import { NextRequest, NextResponse, after } from 'next/server';
import { verifySlackSignature, fetchConversationHistory, sendEphemeralMessage, isChannelAccessible, getSlackUserInfoWithEmail } from '@/lib/slack';
import { workspaceCollection, slackUserCollection, botChannelsCollection, analysisInstanceCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { SlackEventSchema, Workspace, SlackUser, DEFAULT_COACHING_FLAGS } from '@/types';
import { comprehensiveMessageAnalysis } from '@/lib/ai';
import { validateWorkspaceAccess, incrementWorkspaceUsage } from '@/lib/subscription';
import { trackEvent, trackError } from '@/lib/posthog';
import { EVENTS, ERROR_CATEGORIES } from '@/lib/analytics/events';
import { logError, logSlackEvent } from '@/lib/logger';
import { WebClient } from '@slack/web-api';


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
                
                const teamId = event.team_id || eventData.team_id;
                console.log('🗑️ Extracted team ID:', teamId);
                
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
                
                const teamId = event.team_id || eventData.team_id;
                
                after(async () => {
                    try {
                        await handleAppUninstall(teamId);
                        console.log('✅ Token revocation processing completed');
                    } catch (error) {
                        console.error('❌ Token revocation processing error:', error);
                    }
                });
            }
            
            // Handle bot being added to channels
            if (event.type === 'member_joined_channel') {
                console.log('🤖 Bot joined channel event received');
                
                after(async () => {
                    try {
                        await handleBotJoinedChannel(event);
                        console.log('✅ Bot joined channel processing completed');
                    } catch (error) {
                        console.error('❌ Bot joined channel processing error:', error);
                    }
                });
            }
            
            // Handle bot being removed from channels
            if (event.type === 'channel_left' || event.type === 'group_left') {
                console.log(`🤖 Bot left ${event.type === 'channel_left' ? 'public channel' : 'private channel'} event received`);
                
                after(async () => {
                    try {
                        await handleBotLeftChannel(event, eventData.team_id);
                        console.log('✅ Bot left channel processing completed');
                    } catch (error) {
                        console.error('❌ Bot left channel processing error:', error);
                    }
                });
            }
            
            // Only process message events in channels and groups (not DMs)
            if (event.type === 'message' && (event.channel_type === 'channel' || event.channel_type === 'group')) {
                console.log('🚀 Scheduling background processing for message event');
                
                after(async () => {
                    try {
                        console.log('🔄 Starting background message processing...');
                        await handleMessageEvent(event, eventData.team_id);
                        console.log('✅ Background message processing completed');
                    } catch (error) {
                        console.error('❌ Background message processing error:', error);
                    }
                });
            }
        }
        
        // Return immediate response to Slack
        console.log('⚡ Sending immediate response to Slack');
        return NextResponse.json({ ok: true });
        
    } catch (error) {
        console.error('Slack events error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

async function handleMessageEvent(event: Record<string, unknown>, teamId: string) {
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
        const messageTimestamp = parseFloat(event.ts as string) * 1000;
        const currentTime = Date.now();
        const timeDifference = currentTime - messageTimestamp;
        
        if (timeDifference > 10000) {
            return;
        }

        // Validate event data
        const validatedEvent = SlackEventSchema.parse(event);
        
        // Find workspace first
        const workspace = await workspaceCollection.findOne({ 
            workspaceId: teamId, 
            isActive: true 
        }) as Workspace | null;
        
        if (!workspace) {
            console.log('⏭️ Workspace not found or inactive, skipping');
            return;
        }
        
        // Check if workspace has completed onboarding
        if (!workspace.hasCompletedOnboarding) {
            console.log('⏭️ Workspace has not completed onboarding, skipping auto coaching');
            return;
        }
        
        // Check workspace subscription access
        const accessCheck = await validateWorkspaceAccess(workspace, 'autoCoaching');
        
        if (!accessCheck.allowed) {
            trackEvent(validatedEvent.user, EVENTS.API_SLACK_EVENT_PROCESSED, {
                event_type: 'message',
                channel_id: validatedEvent.channel,
                processed: false,
                skip_reason: 'access_denied',
                subscription_tier: workspace.subscription?.tier || 'FREE',
            });
            return;
        }
        
        // Find or create user
        let user = await slackUserCollection.findOne({
            slackId: validatedEvent.user,
            workspaceId: String(workspace._id)
        }) as SlackUser | null;
        
        // Auto-create user if not exists
        if (!user) {
            const userInfo = await getSlackUserInfoWithEmail(validatedEvent.user, workspace.botToken);
            
            const newUser = {
                _id: new ObjectId(),
                slackId: validatedEvent.user,
                workspaceId: String(workspace._id),
                email: userInfo.email,
                name: userInfo.name,
                displayName: userInfo.displayName,
                image: userInfo.image,
                autoCoachingEnabledChannels: [],
                coachingFlags: [...DEFAULT_COACHING_FLAGS],
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            await slackUserCollection.insertOne(newUser);
            user = newUser as unknown as SlackUser;
            console.log('🆕 Auto-created user on message event:', validatedEvent.user);
        }

        // Check if bot is active in this channel
        const isChannelActive = await isChannelAccessible(validatedEvent.channel, String(workspace._id));
        if (!isChannelActive) {
            console.log('⏭️ Bot not active in this channel, skipping analysis');
            return;
        }
        
        console.log('🤖 Bot is active in channel, checking user preferences...');
        
        // Check if user has auto-coaching enabled for this specific channel
        if (!user.autoCoachingEnabledChannels.includes(validatedEvent.channel)) {
            console.log('⏭️ Auto-coaching not enabled for this channel, skipping analysis');
            return;
        }
        
        console.log('✅ Auto-coaching enabled for this channel, proceeding with analysis');
        
        // Comprehensive AI analysis
        console.log('🔍 Starting comprehensive message analysis...');
        
        const conversationHistory = await fetchConversationHistory(
            validatedEvent.channel,
            workspace.botToken,
            validatedEvent.ts,
            15
        );
        
        console.log('Fetched conversation history:', conversationHistory.length, 'messages');
        
        // Get user's coaching flags (or defaults if not set)
        const flags = user.coachingFlags?.length ? user.coachingFlags : DEFAULT_COACHING_FLAGS;
        
        const analysis = await comprehensiveMessageAnalysis(
            validatedEvent.text,
            conversationHistory,
            flags
        );
        
        console.log('Comprehensive analysis result:', {
            needsCoaching: analysis.needsCoaching,
            flagsFound: analysis.flags.length,
            hasTargets: analysis.targetIds && analysis.targetIds.length > 0,
            issueDescription: analysis.issueDescription,
            targetCount: analysis.targetIds ? analysis.targetIds.length : 0,
            hasImprovement: !!analysis.improvedMessage,
            reasoning: analysis.reasoning.primaryIssue
        });

        // Track AI analysis completion
        trackEvent(validatedEvent.user, EVENTS.API_AI_ANALYSIS_COMPLETED, {
            user_name: user.name,
            workspace_id: String(workspace._id),
            channel_id: validatedEvent.channel,
            message_length: validatedEvent.text.length,
            analysis_type: 'auto_coaching',
            flags_found: analysis.flags.length,
            needs_coaching: analysis.needsCoaching,
            has_targets: analysis.targetIds && analysis.targetIds.length > 0,
            target_count: analysis.targetIds ? analysis.targetIds.length : 0,
            has_improvement: !!analysis.improvedMessage,
            context_messages: conversationHistory.length,
            primary_issue: analysis.reasoning.primaryIssue,
            subscription_tier: workspace.subscription?.tier || 'FREE',
        });
        
        // If no coaching needed, exit early
        if (!analysis.needsCoaching || analysis.flags.length === 0) {
            return;
        }
        
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
                        text: "🔒 *Only you can see this suggestion* • Use `/clarity-settings` to adjust preferences"
                    }
                ]
            }
        ];
        
        // Send ephemeral message with interactive components
        console.log('📤 Sending interactive coaching feedback...');
        const success = await sendEphemeralMessage(
            validatedEvent.channel,
            validatedEvent.user,
            "Clarity",
            workspace.botToken,
            [],
            blocks
        );
        
        if (success) {
            console.log('✅ Ephemeral feedback sent successfully');
            
            // Save analysis instance
            const instanceData = {
                _id: new ObjectId(),
                userId: user._id,
                workspaceId: String(workspace._id),
                channelId: validatedEvent.channel,
                messageTs: validatedEvent.ts,
                flagIds: analysis.flags.map(f => f.typeId),
                targetIds: analysis.targetIds || [],
                issueDescription: analysis.issueDescription,
                createdAt: new Date(),
                aiMetadata: {
                    primaryFlagId: primaryFlag.typeId,
                    confidence: primaryFlag.confidence,
                    reasoning: analysis.reasoning.whyNeedsCoaching,
                    suggestedTone: analysis.reasoning.primaryIssue,
                },
            };
            
            console.log('💾 Storing analysis instance:', {
                issueDescription: instanceData.issueDescription,
                flagIds: instanceData.flagIds,
                targetIds: instanceData.targetIds
            });
            
            await analysisInstanceCollection.insertOne(instanceData);

            // Track successful auto coaching trigger
            trackEvent(user.slackId, EVENTS.FEATURE_AUTO_COACHING_TRIGGERED, {
                user_name: user.name,
                workspace_id: String(workspace._id),
                channel_id: validatedEvent.channel,
                flags_found: analysis.flags.map(f => f.type),
                primary_issue: analysis.reasoning.primaryIssue,
                has_targets: analysis.targetIds && analysis.targetIds.length > 0,
                target_count: analysis.targetIds ? analysis.targetIds.length : 0,
                message_length: validatedEvent.text.length,
                subscription_tier: workspace.subscription?.tier || 'FREE',
            });

            // Track usage at workspace level
            await incrementWorkspaceUsage(workspace, 'autoCoaching');
            console.log('📊 Usage tracked for autoCoaching feature');
        } else {
            console.error('❌ Failed to send ephemeral feedback');
        }
        
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
            return;
        }
        
        // Deactivate all users in this workspace
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
        
        // Clean up botChannels collection
        const channelResult = await botChannelsCollection.deleteMany({
            workspaceId: workspace._id.toString()
        });
        
        console.log(`🔄 Removed ${channelResult.deletedCount} channels from botChannels collection for workspace ${teamId}`);
        
        // Deactivate the workspace
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
        
        // Track app uninstallation event
        trackEvent('anonymous', EVENTS.API_SLACK_APP_UNINSTALLED, {
            workspace_id: workspace._id.toString(),
            workspace_name: workspace.name,
            users_deactivated: result.modifiedCount,
            channels_removed: channelResult.deletedCount,
        });
        
    } catch (error) {
        console.error('Error processing app uninstall:', error);
        trackError('anonymous', error instanceof Error ? error : new Error(String(error)), {
            endpoint: '/api/slack/events',
            operation: 'app_uninstall',
            team_id: teamId,
            category: ERROR_CATEGORIES.SLACK_API
        });
    }
}

async function handleBotJoinedChannel(event: Record<string, unknown>) {
    try {
        console.log('🔄 Processing bot joined channel event:', JSON.stringify(event, null, 2));
        
        const channelId = event.channel as string;
        const userId = event.user as string;
        const teamId = event.team as string;
        
        if (!channelId || !userId || !teamId) {
            console.error('❌ Missing required fields in bot joined channel event');
            return;
        }
        
        // Find the workspace by Slack team ID
        const workspace = await workspaceCollection.findOne({ workspaceId: teamId });
        
        if (!workspace) {
            console.log('⚠️ Workspace not found for team:', teamId);
            return;
        }
        
        // Get bot user ID from workspace token to verify this is our bot
        const slack = new WebClient(workspace.botToken);
        
        try {
            const authTest = await slack.auth.test();
            const botUserId = authTest.user_id;
            
            // Only process if the user who joined is our bot
            if (userId !== botUserId) {
                console.log('👤 Member joined channel but it\'s not our bot, skipping');
                return;
            }
            
            // Get channel info to get the channel name
            const channelInfo = await slack.conversations.info({ channel: channelId });
            const channelName = channelInfo.channel?.name || 'Unknown';
            
            // Add channel to database
            const existingChannel = await botChannelsCollection.findOne({
                channelId,
                workspaceId: workspace._id.toString()
            });
            
            if (!existingChannel) {
                await botChannelsCollection.insertOne({
                    _id: new ObjectId(),
                    workspaceId: workspace._id.toString(),
                    channelId,
                    channelName,
                    addedAt: new Date()
                });
                
                console.log(`✅ Added channel ${channelName} (${channelId}) to database for workspace ${teamId}`);
                
                // Send notification to workspace users about the new channel monitoring
                await notifyUsersAboutNewChannelMonitoring(workspace as unknown as Workspace, channelId, channelName);
            } else {
                console.log(`📝 Channel ${channelName} (${channelId}) already exists in database`);
            }
            
        } catch (apiError) {
            console.error('❌ Error verifying bot user or getting channel info:', apiError);
        }
        
    } catch (error) {
        console.error('Error processing bot joined channel event:', error);
    }
}

async function handleBotLeftChannel(event: Record<string, unknown>, teamId: string) {
    try {
        console.log('🔄 Processing bot left channel event:', JSON.stringify(event, null, 2));
        
        const channelId = event.channel as string;
        
        if (!channelId || !teamId) {
            console.error('❌ Missing required fields in bot left channel event');
            return;
        }
        
        // Find the workspace by Slack team ID
        const workspace = await workspaceCollection.findOne({ workspaceId: teamId });
        
        if (!workspace) {
            console.log('⚠️ Workspace not found for team:', teamId);
            return;
        }
        
        // Remove channel from database
        const result = await botChannelsCollection.deleteOne({
            channelId,
            workspaceId: workspace._id.toString()
        });
        
        if (result.deletedCount > 0) {
            console.log(`✅ Removed channel ${channelId} from database for workspace ${teamId}`);
        } else {
            console.log(`📝 Channel ${channelId} was not in database (already removed or never added)`);
        }
        
    } catch (error) {
        console.error('Error processing bot left channel event:', error);
    }
}

async function notifyUsersAboutNewChannelMonitoring(workspace: Workspace, channelId: string, channelName: string) {
    try {
        // Find all active users in this workspace
        const workspaceUsers = await slackUserCollection.find({
            workspaceId: String(workspace._id),
            isActive: true
        }).toArray();

        if (workspaceUsers.length === 0) {
            console.log(`No active users found for workspace ${workspace.workspaceId}`);
            return;
        }

        // Import the notification function
        const { sendChannelMonitoringNotification } = await import('@/lib/slack');

        // Send notification to each user about the new channel
        for (const user of workspaceUsers) {
            try {
                const channelData = [{ id: channelId, name: channelName }];
                const notificationSent = await sendChannelMonitoringNotification(
                    user as unknown as SlackUser, 
                    workspace.botToken, 
                    channelData
                );

                if (notificationSent) {
                    console.log(`✅ Sent new channel notification to user ${user.slackId} for channel #${channelName}`);
                } else {
                    console.log(`❌ Failed to send new channel notification to user ${user.slackId} for channel #${channelName}`);
                }
            } catch (userError) {
                console.error(`Error sending new channel notification to user ${user.slackId}:`, userError);
            }
        }
    } catch (error) {
        console.error('Error notifying users about new channel monitoring:', error);
    }
}
