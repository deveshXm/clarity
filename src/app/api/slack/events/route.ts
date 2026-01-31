import { NextRequest, NextResponse, after } from 'next/server';
import { verifySlackSignature, sendEphemeralMessage, isChannelAccessible, getSlackUserInfoWithEmail, sendChannelOptInMessage } from '@/lib/slack';
import { workspaceCollection, slackUserCollection, botChannelsCollection, analysisInstanceCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { SlackEventSchema, Workspace, SlackUser, DEFAULT_COACHING_FLAGS } from '@/types';
import { analyzeMessage } from '@/lib/ai';
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
                after(async () => {
                    try {
                        await handleMessageEvent(event, eventData.team_id);
                    } catch (error) {
                        console.error('[MSG] Background error:', error);
                    }
                });
            }
            
            // Handle app mention - send opt-in prompt if user doesn't have monitoring enabled
            if (event.type === 'app_mention') {
                console.log('📣 App mention event received');
                
                after(async () => {
                    try {
                        await handleAppMention(event, eventData.team_id);
                        console.log('✅ App mention processing completed');
                    } catch (error) {
                        console.error('❌ App mention processing error:', error);
                    }
                });
            }
        }
        
        // Return immediate response to Slack
        return NextResponse.json({ ok: true });
        
    } catch (error) {
        console.error('Slack events error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

async function handleMessageEvent(event: Record<string, unknown>, teamId: string) {
    try {
        console.log('[MSG] Processing:', { user: event.user, channel: event.channel, teamId });
        
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
            console.log('[MSG] Skip: bot/system message');
            return;
        }
        
        // Only process new messages - skip updated/old messages
        const messageTimestamp = parseFloat(event.ts as string) * 1000;
        const currentTime = Date.now();
        const timeDifference = currentTime - messageTimestamp;
        
        if (timeDifference > 10000) {
            console.log('[MSG] Skip: old message', { timeDifference });
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
            console.log('[MSG] Skip: workspace not found');
            return;
        }
        
        // Check if workspace has completed onboarding
        if (!workspace.hasCompletedOnboarding) {
            console.log('[MSG] Skip: onboarding incomplete');
            return;
        }
        
        // Check workspace subscription access
        const accessCheck = await validateWorkspaceAccess(workspace, 'autoCoaching');
        
        if (!accessCheck.allowed) {
            console.log('[MSG] Skip: access denied', { reason: accessCheck.reason });
            trackEvent(validatedEvent.user, EVENTS.API_SLACK_EVENT_PROCESSED, {
                event_type: 'message',
                channel_id: validatedEvent.channel,
                processed: false,
                skip_reason: 'access_denied',
                subscription_tier: workspace.subscription?.tier || 'FREE',
            });
            return;
        }
        
        // Check if bot is active in this channel first
        const isChannelActive = await isChannelAccessible(validatedEvent.channel, String(workspace._id));
        if (!isChannelActive) {
            console.log('[MSG] Skip: bot not in channel');
            return;
        }
        
        // Find user (don't create yet - only create if flagged for discovery)
        let user = await slackUserCollection.findOne({
            slackId: validatedEvent.user,
            workspaceId: String(workspace._id)
        }) as SlackUser | null;
        
        // Track if this is a new user (for discovery flow)
        const isNewUser = !user;
        
        // For existing users, check if they have auto-coaching enabled for this channel
        if (user && !user.autoCoachingEnabledChannels.includes(validatedEvent.channel)) {
            console.log('[MSG] Skip: auto-coaching disabled for channel');
            return;
        }
        
        console.log('[MSG] Proceeding to AI analysis', { isNewUser });
        
        // Simple AI analysis - just message + flags
        console.log('[MSG] Calling analyzeMessage...');
        
        // Get user's coaching flags (or defaults if not set or new user)
        const flags = user?.coachingFlags?.length ? user.coachingFlags : DEFAULT_COACHING_FLAGS;
        
        const analysis = await analyzeMessage(validatedEvent.text, flags);
        
        console.log('[MSG] AI result:', { shouldFlag: analysis.shouldFlag, flagCount: analysis.flags.length });

        // Track AI analysis completion
        trackEvent(validatedEvent.user, EVENTS.API_AI_ANALYSIS_COMPLETED, {
            user_name: user?.name || 'Unknown',
            workspace_id: String(workspace._id),
            channel_id: validatedEvent.channel,
            message_length: validatedEvent.text.length,
            analysis_type: isNewUser ? 'discovery' : 'auto_coaching',
            flags_found: analysis.flags.length,
            needs_coaching: analysis.shouldFlag,
            has_improvement: !!analysis.suggestedRephrase,
            subscription_tier: workspace.subscription?.tier || 'FREE',
            is_new_user: isNewUser,
        });
        
        // If no coaching needed, exit early
        if (!analysis.shouldFlag || analysis.flags.length === 0 || !analysis.suggestedRephrase) {
            return;
        }
        
        // For new users (discovery), create them now that they've been flagged
        if (isNewUser) {
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
            console.log('[MSG] Created discovery user:', validatedEvent.user);
        }
        
        // Truncate original message for compact display
        const maxLen = 50;
        const originalTruncated = validatedEvent.text.length > maxLen 
            ? validatedEvent.text.substring(0, maxLen) + '...' 
            : validatedEvent.text;
        
        // Build compact interactive message
        const blocks: Array<Record<string, unknown>> = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `"${originalTruncated}" → "${analysis.suggestedRephrase}"`
                }
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: analysis.flags.map(f => `*${f.flagName}*`).join(' · ')
                    }
                ]
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Replace"
                        },
                        style: "primary",
                        action_id: "replace_message",
                        value: JSON.stringify({
                            original_ts: validatedEvent.ts,
                            channel: validatedEvent.channel,
                            original_text: validatedEvent.text,
                            improved_text: analysis.suggestedRephrase,
                            user: validatedEvent.user
                        })
                    },
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Didn't like it"
                        },
                        action_id: "dismiss_suggestion",
                        value: JSON.stringify({
                            flag_type: analysis.flags[0]?.flagName,
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
                        text: "Only you can see this"
                    }
                ]
            }
        ];
        
        // For new users, add opt-in section
        if (isNewUser) {
            const docsUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL 
                ? `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs`
                : 'https://clarityapp.io/docs';
            
            blocks.push(
                { type: "divider" },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "Would you like me to monitor this channel for your messages in the future?"
                    }
                },
                {
                    type: "actions",
                    block_id: "discovery_opt_in_actions",
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
                                channel_id: validatedEvent.channel,
                                user_id: validatedEvent.user
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
            );
        }
        
        // Send ephemeral message with interactive components
        const success = await sendEphemeralMessage(
            validatedEvent.channel,
            validatedEvent.user,
            "Clarity",
            workspace.botToken,
            [],
            blocks
        );
        
        if (success) {
            console.log('[MSG] Coaching sent successfully');
            
            // User is guaranteed to exist at this point (either existing or just created)
            const currentUser = user!;
            
            // Save analysis instance
            const instanceData = {
                _id: new ObjectId(),
                userId: currentUser._id,
                workspaceId: String(workspace._id),
                channelId: validatedEvent.channel,
                messageTs: validatedEvent.ts,
                flagIds: analysis.flags.map(f => f.flagIndex),
                originalMessage: validatedEvent.text,
                rephrasedMessage: analysis.suggestedRephrase,
                createdAt: new Date(),
            };
            
            await analysisInstanceCollection.insertOne(instanceData);

            // Track successful auto coaching trigger
            trackEvent(currentUser.slackId, EVENTS.FEATURE_AUTO_COACHING_TRIGGERED, {
                user_name: currentUser.name,
                workspace_id: String(workspace._id),
                channel_id: validatedEvent.channel,
                flags_found: analysis.flags.map(f => f.flagName),
                primary_flag: analysis.flags[0]?.flagName,
                message_length: validatedEvent.text.length,
                subscription_tier: workspace.subscription?.tier || 'FREE',
                is_discovery: isNewUser,
            });

            // Track usage at workspace level
            await incrementWorkspaceUsage(workspace, 'autoCoaching');
        } else {
            console.error('[MSG] Failed to send ephemeral');
        }
        
    } catch (error) {
        console.error('[MSG] Error:', error);
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
        const inviterId = event.inviter as string | undefined;
        
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
            } else {
                console.log(`📝 Channel ${channelName} (${channelId}) already exists in database`);
            }
            
            // Send opt-in message to the person who added the bot (if known)
            if (inviterId) {
                // Check if inviter already has monitoring enabled for this channel
                const inviterUser = await slackUserCollection.findOne({
                    slackId: inviterId,
                    workspaceId: workspace._id.toString()
                });
                
                const hasMonitoringEnabled = inviterUser?.autoCoachingEnabledChannels?.includes(channelId);
                
                if (!hasMonitoringEnabled) {
                    const optInSent = await sendChannelOptInMessage(
                        channelId,
                        inviterId,
                        channelName,
                        workspace.botToken
                    );
                    
                    if (optInSent) {
                        console.log(`✅ Sent opt-in message to inviter ${inviterId} for channel #${channelName}`);
                    } else {
                        console.log(`❌ Failed to send opt-in message to inviter ${inviterId}`);
                    }
                } else {
                    console.log(`📝 Inviter ${inviterId} already has monitoring enabled for this channel`);
                }
            } else {
                console.log('📝 No inviter found for bot join event, skipping opt-in message');
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

async function handleAppMention(event: Record<string, unknown>, teamId: string) {
    try {
        const channelId = event.channel as string;
        const userId = event.user as string;
        
        if (!channelId || !userId || !teamId) {
            console.error('❌ Missing required fields in app mention event');
            return;
        }
        
        // Find the workspace
        const workspace = await workspaceCollection.findOne({ workspaceId: teamId });
        
        if (!workspace) {
            console.log('⚠️ Workspace not found for team:', teamId);
            return;
        }
        
        // Check if user exists and has monitoring enabled for this channel
        const user = await slackUserCollection.findOne({
            slackId: userId,
            workspaceId: workspace._id.toString()
        });
        
        // If user has monitoring enabled, no need to prompt
        if (user?.autoCoachingEnabledChannels?.includes(channelId)) {
            console.log(`📝 User ${userId} already has monitoring enabled for this channel`);
            return;
        }
        
        // Check if bot is active in this channel
        const botChannel = await botChannelsCollection.findOne({
            channelId,
            workspaceId: workspace._id.toString()
        });
        
        if (!botChannel) {
            console.log('⏭️ Bot not active in this channel, skipping opt-in prompt');
            return;
        }
        
        // Get channel name
        const slack = new WebClient(workspace.botToken);
        const channelInfo = await slack.conversations.info({ channel: channelId });
        const channelName = channelInfo.channel?.name || 'this channel';
        
        // Send opt-in message
        const optInSent = await sendChannelOptInMessage(
            channelId,
            userId,
            channelName,
            workspace.botToken
        );
        
        if (optInSent) {
            console.log(`✅ Sent opt-in message to user ${userId} for channel #${channelName}`);
        } else {
            console.log(`❌ Failed to send opt-in message to user ${userId}`);
        }
        
    } catch (error) {
        console.error('Error handling app mention:', error);
    }
}
