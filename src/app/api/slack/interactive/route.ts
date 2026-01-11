import { NextRequest, NextResponse, after } from 'next/server';
import { verifySlackSignature, sendWorkspaceAnnouncementMessage, joinChannel, sendAdminTransferNotification, openAdminTransferModal, resolveSlackUserName, getWorkspaceChannels, openOnboardingModal, sendDirectMessage } from '@/lib/slack';
import { slackUserCollection, workspaceCollection, botChannelsCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { WebClient } from '@slack/web-api';
import { trackEvent, trackError } from '@/lib/posthog';
import { EVENTS, ERROR_CATEGORIES } from '@/lib/analytics/events';
import { logError, logInfo } from '@/lib/logger';
import { Workspace } from '@/types';

// Define types inline for now
interface SlackInteractivePayload {
  type: string;
  user: { id: string; name: string };
  actions: Array<{ action_id: string; value: string; type: string }>;
  channel: { id: string; name: string };
  message: { ts: string };
  trigger_id?: string;
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: {
      values?: {
        [blockId: string]: {
          [actionId: string]: {
            selected_option?: {
              value: string;
            };
            selected_options?: Array<{
              text: { type: string; text: string };
              value: string;
            }>;
            selected_user?: string;
          };
        };
      };
    };
  };
}

interface MessageReplacementData {
  original_ts: string;
  channel: string;
  original_text: string;
  improved_text: string;
  user: string;
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
        
        // Parse interactive payload (Slack sends it as form data)
        const payload = JSON.parse(new URLSearchParams(body).get('payload') || '{}');
        
        logInfo('Interactive component triggered', {
            type: payload.type,
            action_id: payload.actions?.[0]?.action_id,
            user_id: payload.user?.id,
            endpoint: '/api/slack/interactive'
        });

        // Track interactive component received
        trackEvent(payload.user?.id || 'anonymous', EVENTS.API_SLACK_INTERACTIVE_RECEIVED, {
            interaction_type: payload.type,
            action_id: payload.actions?.[0]?.action_id,
            user_name: payload.user?.name || 'Unknown',
        });
        
        // Handle different types of interactions
        if (payload.type === 'block_actions') {
            const action = payload.actions[0];
            
            if (action.action_id === 'replace_message') {
                return await handleMessageReplacement(payload, action);
            } else if (action.action_id === 'keep_original') {
                return await handleKeepOriginal();
            } else if (action.action_id === 'send_improved_message') {
                return await handleSendImprovedMessage(payload, action);
            } else if (action.action_id === 'keep_original_message') {
                return await handleKeepOriginalMessage();
            } else if (action.action_id === 'transfer_admin') {
                return await handleTransferAdminAction(payload);
            } else if (action.action_id === 'complete_onboarding') {
                return await handleCompleteOnboardingAction(payload);
            }
        } else if (payload.type === 'view_submission') {
            // Handle modal form submissions
            if (payload.view?.callback_id === 'settings_modal') {
                return await handleSettingsSubmission(payload);
            } else if (payload.view?.callback_id === 'workspace_onboarding_modal') {
                return await handleOnboardingSubmission(payload);
            } else if (payload.view?.callback_id === 'admin_transfer_modal') {
                return await handleAdminTransferSubmission(payload);
            }
        }
        
        return NextResponse.json({ text: 'Unknown interaction' });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Slack interactive components error', errorObj, { 
            endpoint: '/api/slack/interactive'
        });
        trackError('anonymous', errorObj, { 
            endpoint: '/api/slack/interactive',
            operation: 'interactive_component_processing',
            category: ERROR_CATEGORIES.SERVER
        });
        return NextResponse.json({ 
            text: 'Sorry, there was an error processing your action. Please try again.' 
        }, { status: 500 });
    }
}

async function handleMessageReplacement(payload: SlackInteractivePayload, action: SlackInteractivePayload['actions'][0]) {
    try {
        const data: MessageReplacementData = JSON.parse(action.value);
        const { original_ts, channel, original_text, improved_text, user } = data;
        
        console.log('🔄 Updating message:', {
            original: original_text.substring(0, 50) + '...',
            improved: improved_text.substring(0, 50) + '...',
            user,
            channel
        });
        
        // Verify user has installed the app and get user token
        const appUser = await slackUserCollection.findOne({
            slackId: user,
            isActive: true
        });
        
        if (!appUser) {
            return NextResponse.json({
                text: 'Error: User not found or app not installed.'
            });
        }
        
        // Check if user has provided user token (required for message updating)
        if (!appUser.userToken) {
            return NextResponse.json({
                text: '❌ Please reinstall the app to enable message editing functionality.'
            });
        }
        
        // Create user-specific WebClient to update their own message
        const userSlack = new WebClient(appUser.userToken);
        
        // Update the original message with improved text
        console.log('📝 Updating message with improved text...');
        const updateResult = await userSlack.chat.update({
            channel: channel,
            ts: original_ts,
            text: improved_text
        });
        
        if (!updateResult.ok) {
            console.error('Failed to update message:', updateResult.error);
            return NextResponse.json({
                text: `❌ Could not update the message: ${updateResult.error}. Please try again.`
            });
        }
        
        console.log('✅ Message update successful');
        
        // Track successful message replacement
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(appUser.workspaceId) });
        trackEvent(user, EVENTS.API_MESSAGE_REPLACED, {
            user_name: appUser.name || 'Unknown',
            workspace_id: appUser.workspaceId || 'Unknown',
            channel_id: channel,
            original_length: original_text.length,
            improved_length: improved_text.length,
            subscription_tier: workspace?.subscription?.tier || 'FREE',
        });
        
        // Update the ephemeral message to show success
        return NextResponse.json({
            replace_original: true,
            text: "✅ Message updated successfully!",
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "✅ *Message updated successfully!*\n\nYour message has been improved. Keep up the great communication!"
                    }
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: "💡 *Tip: Use `/clarity-settings` to adjust coaching preferences*"
                        }
                    ]
                }
            ]
        });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error in message replacement', errorObj, { 
            operation: 'message_replacement'
        });
        trackError(payload.user?.id || 'anonymous', errorObj, { 
            operation: 'message_replacement',
            context: 'interactive_action'
        });
        return NextResponse.json({
            text: '❌ An error occurred while updating the message. Please try again.'
        });
    }
}

async function handleKeepOriginal() {
    return NextResponse.json({
        text: '👍 Message kept as original.'
    });
}

async function handleSendImprovedMessage(payload: SlackInteractivePayload, action: SlackInteractivePayload['actions'][0]) {
    try {
        const data = JSON.parse(action.value);
        const { improvedMessage, channelId, userId } = data;
        
        console.log('📤 Sending improved message:', {
            improved: improvedMessage.substring(0, 50) + '...',
            user: userId,
            channel: channelId
        });
        
        // Verify user has installed the app and get workspace bot token
        const appUser = await slackUserCollection.findOne({
            slackId: userId,
            isActive: true
        });
        
        if (!appUser) {
            return NextResponse.json({
                replace_original: true,
                text: 'Error: User not found or app not installed.'
            });
        }
        
        // Get workspace bot token
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(appUser.workspaceId) });
        if (!workspace || !workspace.botToken) {
            console.error('❌ Workspace not found or missing bot token for user:', userId);
            return NextResponse.json({
                replace_original: true,
                text: 'Error: Workspace configuration not found.'
            });
        }
        
        // Create workspace-specific WebClient
        const workspaceSlack = new WebClient(workspace.botToken);
        
        // Post the improved message as the user (using bot with custom username)
        console.log('📝 Posting improved message...');
        const postResult = await workspaceSlack.chat.postMessage({
            channel: channelId,
            text: improvedMessage,
            username: appUser.displayName || appUser.name, // Try to match user's display name
            icon_url: appUser.image || undefined // Use user's profile image if available
        });
        
        if (!postResult.ok) {
            console.error('Failed to post improved message:', postResult.error);
            return NextResponse.json({
                replace_original: true,
                text: '❌ Could not post the improved message. Please try again.'
            });
        }
        
        console.log('✅ Improved message posted successfully');
        
        // Update the ephemeral message to show success
        return NextResponse.json({
            replace_original: true,
            text: "✅ Message sent successfully!",
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "✅ *Message sent successfully!*\n\nYour improved message has been posted. Keep up the great communication!"
                    }
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: "🔒 *This coaching is private to you* • Use `/clarity-personal-feedback` for more insights"
                        }
                    ]
                }
            ]
        });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error sending improved message', errorObj, { 
            operation: 'send_improved_message'
        });
        trackError(payload.user?.id || 'anonymous', errorObj, { 
            operation: 'send_improved_message',
            context: 'interactive_action'
        });
        return NextResponse.json({
            replace_original: true,
            text: '❌ An error occurred while sending the message. Please try again.'
        });
    }
}

async function handleKeepOriginalMessage() {
    return NextResponse.json({
        replace_original: true,
        text: '👍 *Keeping original message*\n\nNo changes made. Your original message is fine as is!',
        blocks: [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "👍 *Keeping original message*\n\nNo changes made. Your original message is fine as is!"
                }
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: "💡 *Tip: Use `/clarity-personal-feedback` to get your overall communication analysis*"
                    }
                ]
            }
        ]
    });
}

async function handleTransferAdminAction(payload: SlackInteractivePayload) {
    try {
        const userId = payload.user?.id;
        const triggerId = payload.trigger_id;
        
        if (!userId || !triggerId) {
            return NextResponse.json({ text: 'Missing required data' });
        }
        
        // Get user's workspace
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        if (!user) {
            return NextResponse.json({ text: 'User not found' });
        }
        
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) }) as Workspace | null;
        if (!workspace) {
            return NextResponse.json({ text: 'Workspace not found' });
        }
        
        // Verify user is admin
        if (workspace.adminSlackId !== userId) {
            return NextResponse.json({ text: 'Only the workspace admin can transfer admin rights.' });
        }
        
        // Open admin transfer modal
        await openAdminTransferModal(triggerId, workspace.botToken, userId);
        
        // Return empty response to close the current interaction
        return new NextResponse('', { status: 200 });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error handling transfer admin action', errorObj, {
            user_id: payload.user?.id
        });
        return NextResponse.json({ text: 'Error opening admin transfer modal' });
    }
}

async function handleCompleteOnboardingAction(payload: SlackInteractivePayload) {
    try {
        const userId = payload.user?.id;
        const triggerId = payload.trigger_id;
        
        if (!userId || !triggerId) {
            return NextResponse.json({ text: 'Missing required data' });
        }
        
        // Get user's workspace
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        if (!user) {
            return NextResponse.json({ text: 'User not found. Please try again.' });
        }
        
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) }) as Workspace | null;
        if (!workspace) {
            return NextResponse.json({ text: 'Workspace not found' });
        }
        
        // Verify user is admin
        if (workspace.adminSlackId !== userId) {
            // Send helpful message to non-admin
            await sendDirectMessage(
                userId,
                `Only the workspace admin can complete the setup. Please ask <@${workspace.adminSlackId}> to complete the Clarity setup first.`,
                workspace.botToken
            );
            return new NextResponse('', { status: 200 });
        }
        
        // Check if already onboarded
        if (workspace.hasCompletedOnboarding) {
            await sendDirectMessage(
                userId,
                'Setup has already been completed! Use `/clarity-settings` to change your preferences.',
                workspace.botToken
            );
            return new NextResponse('', { status: 200 });
        }
        
        // Fetch channels and open onboarding modal
        const channels = await getWorkspaceChannels(workspace.botToken);
        await openOnboardingModal(triggerId, workspace.botToken, channels);
        
        logInfo('Onboarding modal opened from welcome message', {
            user_id: userId,
            workspace_id: String(workspace._id)
        });
        
        return new NextResponse('', { status: 200 });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error handling complete onboarding action', errorObj, {
            user_id: payload.user?.id
        });
        trackError(payload.user?.id || 'anonymous', errorObj, {
            endpoint: '/api/slack/interactive',
            operation: 'complete_onboarding',
            category: ERROR_CATEGORIES.SERVER
        });
        return NextResponse.json({ text: 'Error opening setup modal. Please try `/clarity-settings` instead.' });
    }
}

async function handleSettingsSubmission(payload: SlackInteractivePayload) {
    try {
        const userId = payload.user?.id;
        const view = payload.view;
        
        if (!userId || !view) {
            return NextResponse.json({
                response_action: 'update',
                view: {
                    type: 'modal',
                    callback_id: 'settings_modal',
                    title: {
                        type: 'plain_text',
                        text: 'Settings'
                    },
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '❌ Something went wrong'
                            }
                        }
                    ]
                }
            });
        }

        // Extract selected frequency from the modal form
        const selectedValue = view.state?.values?.frequency_selection?.frequency_radio?.selected_option?.value;
        
        // Extract selected channels from checkboxes (now using accessory instead of input)
        const channelsElement = view.state?.values?.auto_coaching_channels_section?.channel_checkboxes;
        console.log('🔍 Channel checkboxes element:', JSON.stringify(channelsElement, null, 2));
        
        // Handle checkbox state - Slack sends selected_options array with channel IDs
        // Direct logic: selected = enabled, unselected = disabled
        const enabledChannelIds = channelsElement?.selected_options?.map((option: { value: string }) => option.value) || [];
        
        // Get user first to access their workspace
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        if (!user) {
            console.error('User not found:', userId);
            return NextResponse.json({
                response_action: 'update',
                view: {
                    type: 'modal',
                    callback_id: 'settings_modal',
                    title: { type: 'plain_text', text: 'Settings' },
                    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ User not found' } }]
                }
            });
        }
        
        // Get workspace
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        if (!workspace) {
            console.error('Workspace not found for user:', userId);
            return NextResponse.json({
                response_action: 'update',
                view: {
                    type: 'modal',
                    callback_id: 'settings_modal',
                    title: { type: 'plain_text', text: 'Settings' },
                    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Workspace not found' } }]
                }
            });
        }
        
        console.log('✅ Settings updated:', {
            frequency: selectedValue,
            enabledChannels: enabledChannelIds.length,
            channelIds: enabledChannelIds
        });
        
        if (!selectedValue || !['weekly', 'monthly'].includes(selectedValue)) {
            return NextResponse.json({
                response_action: 'update',
                view: {
                    type: 'modal',
                    callback_id: 'settings_modal',
                    title: {
                        type: 'plain_text',
                        text: 'Settings'
                    },
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '❌ Something went wrong'
                            }
                        }
                    ]
                }
            });
        }

        // Update user's preferences in the database
        after(async () => {
            try {
                const userDoc = await slackUserCollection.findOneAndUpdate(
                    { slackId: userId },
                    {
                        $set: {
                            analysisFrequency: selectedValue,
                            autoCoachingEnabledChannels: enabledChannelIds,
                            updatedAt: new Date(),
                        },
                    },
                    { returnDocument: 'after' }
                );

                // Track settings update
                if (userDoc) {
                    trackEvent(userId, EVENTS.FEATURE_SETTINGS_UPDATED, {
                        user_name: userDoc.name || 'Unknown',
                        workspace_id: userDoc.workspaceId,
                        analysis_frequency: selectedValue,
                        auto_coaching_enabled_channels_count: enabledChannelIds.length,
                        subscription_tier: workspace?.subscription?.tier || 'FREE',
                    });
                }
            } catch (err) {
                const errorObj = err instanceof Error ? err : new Error(String(err));
                logError('DB update error in settings submission', errorObj, { 
                    user_id: userId,
                    operation: 'settings_db_update'
                });
                trackError(userId, errorObj, { 
                    operation: 'settings_db_update',
                    context: 'background_processing'
                });
            }
        });

        // Update modal to show success message
        return NextResponse.json({
            response_action: 'update',
            view: {
                type: 'modal',
                callback_id: 'settings_modal',
                title: {
                    type: 'plain_text',
                    text: 'Settings'
                },
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: '✅ *Settings updated successfully*\n\nYour private coaching preferences have been saved.'
                        }
                    },
                    {
                        type: 'context',
                        elements: [
                            {
                                type: 'mrkdwn',
                                text: '🔒 Remember: All coaching is completely private to you'
                            }
                        ]
                    }
                ]
            }
        });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error handling settings submission', errorObj, { 
            user_id: payload.user?.id,
            operation: 'settings_submission'
        });
        trackError(payload.user?.id || 'anonymous', errorObj, { 
            operation: 'settings_submission',
            context: 'interactive_action'
        });
        return NextResponse.json({
            response_action: 'update',
            view: {
                type: 'modal',
                callback_id: 'settings_modal',
                title: {
                    type: 'plain_text',
                    text: 'Settings'
                },
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: '❌ Something went wrong'
                        }
                    }
                ]
            }
        });
    }
}

async function handleOnboardingSubmission(payload: SlackInteractivePayload) {
    try {
        const userId = payload.user?.id;
        const view = payload.view;
        
        if (!userId || !view) {
            return NextResponse.json({
                response_action: 'errors',
                errors: { channels_selection: 'Missing required data' }
            });
        }
        
        // Get user's workspace
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        
        // Find workspace by admin
        const workspace = await workspaceCollection.findOne({ 
            adminSlackId: userId, 
            isActive: true 
        }) as Workspace | null;
        
        if (!workspace) {
            return NextResponse.json({
                response_action: 'update',
                view: {
                    type: 'modal',
                    callback_id: 'workspace_onboarding_modal',
                    title: { type: 'plain_text', text: 'Setup Clarity' },
                    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Workspace not found or you are not the admin.' } }]
                }
            });
        }
        
        // Extract selected channels
        const channelsValue = view.state?.values?.channels_selection?.selected_channels?.selected_options;
        const selectedChannels: Array<{ id: string; name: string }> = channelsValue 
            ? channelsValue.map((opt: { value: string }) => JSON.parse(opt.value))
            : [];
        
        // Extract announcement channel
        const announcementValue = view.state?.values?.announcement_channel?.announcement_channel_select?.selected_option?.value;
        const announcementChannel = announcementValue ? JSON.parse(announcementValue) : null;
        
        logInfo('Workspace onboarding submission', {
            admin_user_id: userId,
            workspace_id: String(workspace._id),
            selected_channels: selectedChannels.length,
            announcement_channel: announcementChannel?.name || null
        });
        
        // Process in background
        after(async () => {
            try {
                // Join bot to selected channels
                for (const channel of selectedChannels) {
                    const joined = await joinChannel(channel.id, workspace.botToken);
                    if (joined) {
                        // Add to botChannelsCollection
                        const existingChannel = await botChannelsCollection.findOne({
                            workspaceId: String(workspace._id),
                            channelId: channel.id
                        });
                        
                        if (!existingChannel) {
                            await botChannelsCollection.insertOne({
                                _id: new ObjectId(),
                                workspaceId: String(workspace._id),
                                channelId: channel.id,
                                channelName: channel.name,
                                addedAt: new Date()
                            });
                        }
                    }
                }
                
                // Mark workspace as onboarded
                await workspaceCollection.updateOne(
                    { _id: new ObjectId(String(workspace._id)) },
                    { 
                        $set: { 
                            hasCompletedOnboarding: true,
                            updatedAt: new Date()
                        } 
                    }
                );
                
                // If user doesn't exist yet, create them
                if (!user) {
                    await slackUserCollection.insertOne({
                        _id: new ObjectId(),
                        slackId: userId,
                        workspaceId: String(workspace._id),
                        name: payload.user.name,
                        displayName: payload.user.name,
                        analysisFrequency: 'weekly',
                        autoCoachingEnabledChannels: selectedChannels.map(c => c.id),
                        isActive: true,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });
                } else {
                    // Update admin's auto-coaching channels
                    await slackUserCollection.updateOne(
                        { slackId: userId },
                        { 
                            $set: { 
                                autoCoachingEnabledChannels: selectedChannels.map(c => c.id),
                                updatedAt: new Date()
                            } 
                        }
                    );
                }
                
                // Send announcement message if channel selected
                if (announcementChannel) {
                    await sendWorkspaceAnnouncementMessage(announcementChannel.id, workspace.botToken);
                }
                
                // Track onboarding completion
                trackEvent(userId, EVENTS.ONBOARDING_COMPLETED, {
                    workspace_id: String(workspace._id),
                    channels_selected: selectedChannels.length,
                    announcement_sent: !!announcementChannel,
                    subscription_tier: workspace.subscription?.tier || 'FREE'
                });
                
            } catch (err) {
                const errorObj = err instanceof Error ? err : new Error(String(err));
                logError('Error in onboarding background processing', errorObj, {
                    user_id: userId,
                    workspace_id: String(workspace._id)
                });
            }
        });
        
        // Return success view
        return NextResponse.json({
            response_action: 'update',
            view: {
                type: 'modal',
                callback_id: 'workspace_onboarding_modal',
                title: { type: 'plain_text', text: 'Setup Complete!' },
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: '🎉 *Clarity is now set up for your workspace!*\n\nEveryone in your workspace can now use Clarity commands.'
                        }
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: '*Getting started:*\n• `/clarity-help` - See all commands\n• `/clarity-rephrase [text]` - Improve any message\n• `/clarity-settings` - Customize preferences'
                        }
                    },
                    {
                        type: 'context',
                        elements: [
                            {
                                type: 'mrkdwn',
                                text: '💡 Tip: Share `/clarity-help` with your team to get everyone started!'
                            }
                        ]
                    }
                ]
            }
        });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error handling onboarding submission', errorObj, {
            user_id: payload.user?.id
        });
        return NextResponse.json({
            response_action: 'update',
            view: {
                type: 'modal',
                callback_id: 'workspace_onboarding_modal',
                title: { type: 'plain_text', text: 'Setup Clarity' },
                blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Something went wrong. Please try again.' } }]
            }
        });
    }
}

async function handleAdminTransferSubmission(payload: SlackInteractivePayload) {
    try {
        const userId = payload.user?.id;
        const view = payload.view;
        
        if (!userId || !view) {
            return NextResponse.json({
                response_action: 'errors',
                errors: { new_admin_selection: 'Missing required data' }
            });
        }
        
        // Parse private metadata to get current admin
        const metadata = view.private_metadata ? JSON.parse(view.private_metadata) : {};
        const currentAdminId = metadata.currentAdminId;
        
        // Get new admin from selection
        const newAdminId = view.state?.values?.new_admin_selection?.new_admin_user?.selected_user;
        
        if (!newAdminId) {
            return NextResponse.json({
                response_action: 'errors',
                errors: { new_admin_selection: 'Please select a user' }
            });
        }
        
        if (newAdminId === currentAdminId) {
            return NextResponse.json({
                response_action: 'errors',
                errors: { new_admin_selection: 'New admin must be different from current admin' }
            });
        }
        
        // Find workspace where current user is admin
        const workspace = await workspaceCollection.findOne({ 
            adminSlackId: userId, 
            isActive: true 
        }) as Workspace | null;
        
        if (!workspace) {
            return NextResponse.json({
                response_action: 'update',
                view: {
                    type: 'modal',
                    callback_id: 'admin_transfer_modal',
                    title: { type: 'plain_text', text: 'Transfer Admin' },
                    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ You are not the admin of this workspace.' } }]
                }
            });
        }
        
        // Update workspace admin
        await workspaceCollection.updateOne(
            { _id: new ObjectId(String(workspace._id)) },
            { 
                $set: { 
                    adminSlackId: newAdminId,
                    updatedAt: new Date()
                } 
            }
        );
        
        // Send notification to new admin in background
        after(async () => {
            try {
                // Get previous admin's name
                const previousAdminName = await resolveSlackUserName(userId, workspace.botToken);
                
                await sendAdminTransferNotification(
                    newAdminId,
                    previousAdminName,
                    workspace.name,
                    workspace.botToken
                );
                
                trackEvent(userId, EVENTS.FEATURE_ADMIN_TRANSFERRED, {
                    workspace_id: String(workspace._id),
                    new_admin_id: newAdminId,
                    previous_admin_id: userId
                });
            } catch (err) {
                const errorObj = err instanceof Error ? err : new Error(String(err));
                logError('Error sending admin transfer notification', errorObj);
            }
        });
        
        logInfo('Admin transferred', {
            workspace_id: String(workspace._id),
            previous_admin: userId,
            new_admin: newAdminId
        });
        
        // Return success view
        return NextResponse.json({
            response_action: 'update',
            view: {
                type: 'modal',
                callback_id: 'admin_transfer_modal',
                title: { type: 'plain_text', text: 'Transfer Complete' },
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: '✅ *Admin rights transferred successfully!*\n\nThe new admin has been notified and now has access to billing and workspace settings.\n\nYou no longer have admin access.'
                        }
                    }
                ]
            }
        });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error handling admin transfer submission', errorObj, {
            user_id: payload.user?.id
        });
        return NextResponse.json({
            response_action: 'update',
            view: {
                type: 'modal',
                callback_id: 'admin_transfer_modal',
                title: { type: 'plain_text', text: 'Transfer Admin' },
                blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Something went wrong. Please try again.' } }]
            }
        });
    }
}
