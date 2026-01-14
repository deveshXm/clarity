import { NextRequest, NextResponse, after } from 'next/server';
import { verifySlackSignature, sendWorkspaceAnnouncementMessage, joinChannel, sendAdminTransferNotification, openAdminTransferModal, resolveSlackUserName, getWorkspaceChannels, openOnboardingModal, sendDirectMessage } from '@/lib/slack';
import { slackUserCollection, workspaceCollection, botChannelsCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { WebClient } from '@slack/web-api';
import { trackEvent, trackError } from '@/lib/posthog';
import { EVENTS, ERROR_CATEGORIES } from '@/lib/analytics/events';
import { logError, logInfo } from '@/lib/logger';
import { Workspace, CoachingFlag, DEFAULT_COACHING_FLAGS, MAX_COACHING_FLAGS } from '@/types';

// Define types inline for now
interface SlackInteractivePayload {
  type: string;
  user: { id: string; name: string };
  actions: Array<{ action_id: string; value: string; type: string }>;
  channel: { id: string; name: string };
  message: { ts: string };
  trigger_id?: string;
  response_url?: string;
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: {
      values?: {
        [blockId: string]: {
          [actionId: string]: {
            value?: string; // For plain_text_input
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
                return await handleKeepOriginal(payload);
            } else if (action.action_id === 'send_improved_message') {
                return await handleSendImprovedMessage(payload, action);
            } else if (action.action_id === 'keep_original_message') {
                return await handleKeepOriginalMessage(payload);
            } else if (action.action_id === 'transfer_admin') {
                return await handleTransferAdminAction(payload);
            } else if (action.action_id === 'complete_onboarding') {
                return await handleCompleteOnboardingAction(payload);
            } else if (action.action_id === 'add_custom_flag') {
                return await handleAddCustomFlagAction(payload);
            } else if (action.action_id === 'manage_flags_button') {
                return await handleManageFlagsButton(payload);
            } else if (action.action_id === 'manage_flags_overflow') {
                return await handleManageFlagsOverflowAction(payload, action);
            } else if (action.action_id.startsWith('flag_overflow_')) {
                return await handleFlagOverflowAction(payload, action);
            } else if (action.action_id === 'dismiss_suggestion') {
                return await handleDismissSuggestion(payload);
            } else if (action.action_id === 'enable_channel_monitoring') {
                return await handleEnableChannelMonitoring(payload, action);
            }
        } else if (payload.type === 'view_submission') {
            // Handle modal form submissions
            if (payload.view?.callback_id === 'settings_modal') {
                return await handleSettingsSubmission(payload);
            } else if (payload.view?.callback_id === 'workspace_onboarding_modal') {
                return await handleOnboardingSubmission(payload);
            } else if (payload.view?.callback_id === 'admin_transfer_modal') {
                return await handleAdminTransferSubmission(payload);
            } else if (payload.view?.callback_id === 'create_flag_modal') {
                return await handleCreateFlagSubmission(payload);
            } else if (payload.view?.callback_id === 'edit_flag_modal') {
                return await handleEditFlagSubmission(payload);
            } else if (payload.view?.callback_id === 'delete_flag_modal') {
                return await handleDeleteFlagSubmission(payload);
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
    const responseUrl = payload.response_url;
    
    // Helper to delete ephemeral message
    const deleteEphemeral = async () => {
        if (responseUrl) {
            await fetch(responseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delete_original: 'true' })
            });
        }
    };
    
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
            await deleteEphemeral();
            return NextResponse.json({ ok: true });
        }
        
        // Check if user has provided user token (required for message updating)
        if (!appUser.userToken) {
            await deleteEphemeral();
            return NextResponse.json({ ok: true });
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
            await deleteEphemeral();
            return NextResponse.json({ ok: true });
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
        
        // Delete the ephemeral message
        await deleteEphemeral();
        return NextResponse.json({ ok: true });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error in message replacement', errorObj, { 
            operation: 'message_replacement'
        });
        trackError(payload.user?.id || 'anonymous', errorObj, { 
            operation: 'message_replacement',
            context: 'interactive_action'
        });
        await deleteEphemeral();
        return NextResponse.json({ ok: true });
    }
}

async function handleKeepOriginal(payload: SlackInteractivePayload) {
    const responseUrl = payload.response_url;
    if (responseUrl) {
        await fetch(responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delete_original: 'true' })
        });
    }
    return NextResponse.json({ ok: true });
}

async function handleSendImprovedMessage(payload: SlackInteractivePayload, action: SlackInteractivePayload['actions'][0]) {
    const responseUrl = payload.response_url;
    
    const deleteEphemeral = async () => {
        if (responseUrl) {
            await fetch(responseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delete_original: 'true' })
            });
        }
    };
    
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
            await deleteEphemeral();
            return NextResponse.json({ ok: true });
        }
        
        // Get workspace bot token
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(appUser.workspaceId) });
        if (!workspace || !workspace.botToken) {
            console.error('❌ Workspace not found or missing bot token for user:', userId);
            await deleteEphemeral();
            return NextResponse.json({ ok: true });
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
            await deleteEphemeral();
            return NextResponse.json({ ok: true });
        }
        
        console.log('✅ Improved message posted successfully');
        
        // Delete the ephemeral message
        await deleteEphemeral();
        return NextResponse.json({ ok: true });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error sending improved message', errorObj, { 
            operation: 'send_improved_message'
        });
        trackError(payload.user?.id || 'anonymous', errorObj, { 
            operation: 'send_improved_message',
            context: 'interactive_action'
        });
        await deleteEphemeral();
        return NextResponse.json({ ok: true });
    }
}

async function handleKeepOriginalMessage(payload: SlackInteractivePayload) {
    const responseUrl = payload.response_url;
    if (responseUrl) {
        await fetch(responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delete_original: 'true' })
        });
    }
    return NextResponse.json({ ok: true });
}

async function handleDismissSuggestion(payload: SlackInteractivePayload) {
    const responseUrl = payload.response_url;
    if (responseUrl) {
        await fetch(responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delete_original: 'true' })
        });
    }
    return NextResponse.json({ ok: true });
}

async function handleEnableChannelMonitoring(payload: SlackInteractivePayload, action: SlackInteractivePayload['actions'][0]) {
    try {
        const userId = payload.user?.id;
        const responseUrl = payload.response_url;
        
        if (!userId) {
            return NextResponse.json({ text: 'Missing user data' });
        }
        
        const data = JSON.parse(action.value);
        const channelId = data.channel_id;
        
        if (!channelId) {
            return NextResponse.json({ text: 'Missing channel data' });
        }
        
        // Find user
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        
        if (!user) {
            return NextResponse.json({ ok: true });
        }
        
        // Check if already enabled - just delete the message
        if (user.autoCoachingEnabledChannels?.includes(channelId)) {
            if (responseUrl) {
                await fetch(responseUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ delete_original: 'true' })
                });
            }
            return NextResponse.json({ ok: true });
        }
        
        // Add channel to user's monitoring list
        await slackUserCollection.updateOne(
            { slackId: userId },
            { 
                $addToSet: { autoCoachingEnabledChannels: channelId },
                $set: { updatedAt: new Date() }
            }
        );
        
        console.log(`✅ Enabled channel monitoring for user ${userId} in channel ${channelId}`);
        
        // Track event
        trackEvent(userId, EVENTS.FEATURE_SETTINGS_UPDATED, {
            action: 'channel_monitoring_enabled',
            channel_id: channelId,
            source: 'opt_in_prompt'
        });
        
        // Delete the ephemeral message using response_url
        if (responseUrl) {
            await fetch(responseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delete_original: 'true' })
            });
        }
        
        return NextResponse.json({ ok: true });
        
    } catch (error) {
        console.error('Error enabling channel monitoring:', error);
        return NextResponse.json({ ok: true });
    }
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
                    title: { type: 'plain_text', text: 'Settings' },
                    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Something went wrong' } }]
                }
            });
        }
        
        // Extract selected channels from checkboxes
        const channelsElement = view.state?.values?.auto_coaching_channels_section?.channel_checkboxes;
        const enabledChannelIds = channelsElement?.selected_options?.map((option: { value: string }) => option.value) || [];
        
        // Get coaching flags from private_metadata and update enabled state from checkboxes
        const metadata = view.private_metadata ? JSON.parse(view.private_metadata) : {};
        const baseFlags: CoachingFlag[] = metadata.coachingFlags || DEFAULT_COACHING_FLAGS;
        
        // Get selected flags from checkboxes (values are indices)
        const flagsElement = view.state?.values?.coaching_flags_block?.coaching_flags_checkboxes;
        const enabledFlagIndices = new Set(
            flagsElement?.selected_options?.map((option: { value: string }) => parseInt(option.value, 10)) || []
        );
        
        // Update flags enabled state based on checkbox selection
        const flags: CoachingFlag[] = baseFlags.map((flag, index) => ({
            ...flag,
            enabled: enabledFlagIndices.has(index)
        }));
        
        // Ensure at least one flag is enabled
        if (!flags.some(f => f.enabled) && flags.length > 0) {
            flags[0].enabled = true;
        }
        
        // Get user
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        if (!user) {
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
        
        // Update user's preferences in the database
        after(async () => {
            try {
                const userDoc = await slackUserCollection.findOneAndUpdate(
                    { slackId: userId },
                    {
                        $set: {
                            autoCoachingEnabledChannels: enabledChannelIds,
                            coachingFlags: flags,
                            updatedAt: new Date(),
                        },
                    },
                    { returnDocument: 'after' }
                );

                if (userDoc) {
                    trackEvent(userId, EVENTS.FEATURE_SETTINGS_UPDATED, {
                        user_name: userDoc.name || 'Unknown',
                        workspace_id: userDoc.workspaceId,
                        auto_coaching_enabled_channels_count: enabledChannelIds.length,
                        coaching_flags_count: flags.length,
                        enabled_flags_count: flags.filter((f: CoachingFlag) => f.enabled).length,
                        subscription_tier: workspace?.subscription?.tier || 'FREE',
                    });
                }
            } catch (err) {
                const errorObj = err instanceof Error ? err : new Error(String(err));
                logError('DB update error in settings submission', errorObj, { user_id: userId });
                trackError(userId, errorObj, { operation: 'settings_db_update' });
            }
        });

        return NextResponse.json({
            response_action: 'update',
            view: {
                type: 'modal',
                callback_id: 'settings_modal',
                title: { type: 'plain_text', text: 'Settings' },
                blocks: [
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: '✅ *Settings updated successfully*\n\nYour coaching preferences have been saved.' }
                    },
                    {
                        type: 'context',
                        elements: [{ type: 'mrkdwn', text: '🔒 Remember: All coaching is completely private to you' }]
                    }
                ]
            }
        });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error handling settings submission', errorObj, { user_id: payload.user?.id });
        trackError(payload.user?.id || 'anonymous', errorObj, { operation: 'settings_submission' });
        return NextResponse.json({
            response_action: 'update',
            view: {
                type: 'modal',
                callback_id: 'settings_modal',
                title: { type: 'plain_text', text: 'Settings' },
                blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Something went wrong' } }]
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
                        autoCoachingEnabledChannels: selectedChannels.map(c => c.id),
                        coachingFlags: [...DEFAULT_COACHING_FLAGS],
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

// ===================== Coaching Flag Handlers =====================

async function handleAddCustomFlagAction(payload: SlackInteractivePayload) {
    try {
        const userId = payload.user?.id;
        const triggerId = payload.trigger_id;
        
        if (!userId || !triggerId) {
            return NextResponse.json({ text: 'Missing required data' });
        }
        
        // Get user to check flag count
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        if (!user) {
            return NextResponse.json({ text: 'User not found' });
        }
        
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        if (!workspace) {
            return NextResponse.json({ text: 'Workspace not found' });
        }
        
        const currentFlagsCount = user.coachingFlags?.length || DEFAULT_COACHING_FLAGS.length;
        if (currentFlagsCount >= MAX_COACHING_FLAGS) {
            return NextResponse.json({ text: `Maximum of ${MAX_COACHING_FLAGS} flags reached.` });
        }
        
        const workspaceSlack = new WebClient(workspace.botToken);
        
        await workspaceSlack.views.push({
            trigger_id: triggerId,
            view: {
                type: 'modal',
                callback_id: 'create_flag_modal',
                title: { type: 'plain_text', text: 'Create Custom Flag' },
                submit: { type: 'plain_text', text: 'Create' },
                blocks: [
                    {
                        type: 'input',
                        block_id: 'flag_name',
                        label: { type: 'plain_text', text: 'Name' },
                        element: {
                            type: 'plain_text_input',
                            action_id: 'name_input',
                            placeholder: { type: 'plain_text', text: 'e.g., Too many exclamation marks' },
                            max_length: 50
                        }
                    },
                    {
                        type: 'input',
                        block_id: 'flag_description',
                        label: { type: 'plain_text', text: 'What should I look for?' },
                        element: {
                            type: 'plain_text_input',
                            action_id: 'description_input',
                            placeholder: { type: 'plain_text', text: 'e.g., Messages with excessive exclamation marks' },
                            max_length: 200,
                            multiline: true
                        }
                    },
                    {
                        type: 'context',
                        elements: [{ type: 'mrkdwn', text: '💡 Be specific - this helps me coach better' }]
                    }
                ]
            }
        });
        
        return new NextResponse('', { status: 200 });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error handling add custom flag action', errorObj);
        return NextResponse.json({ text: 'Error opening flag creation modal' });
    }
}

async function handleManageFlagsButton(payload: SlackInteractivePayload) {
    try {
        const userId = payload.user?.id;
        const triggerId = payload.trigger_id;
        
        if (!userId || !triggerId) {
            return NextResponse.json({ text: 'Missing required data' });
        }
        
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        if (!user) return NextResponse.json({ text: 'User not found' });
        
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        if (!workspace) return NextResponse.json({ text: 'Workspace not found' });
        
        const flags: CoachingFlag[] = user.coachingFlags?.length ? user.coachingFlags : [...DEFAULT_COACHING_FLAGS];
        const workspaceSlack = new WebClient(workspace.botToken);
        
        // Build flag blocks with overflow menus for each flag
        const flagBlocks = flags.map((flag, index) => ({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*${flag.name}*\n${flag.description}`
            },
            accessory: {
                type: 'overflow',
                action_id: `flag_overflow_${index}`,
                options: [
                    { text: { type: 'plain_text', text: '✏️ Edit' }, value: `edit_${index}` },
                    { text: { type: 'plain_text', text: '🗑️ Delete' }, value: `delete_${index}` }
                ]
            }
        }));
        
        await workspaceSlack.views.push({
            trigger_id: triggerId,
            view: {
                type: 'modal',
                callback_id: 'manage_flags_modal',
                title: { type: 'plain_text', text: 'Edit Flags' },
                close: { type: 'plain_text', text: 'Back' },
                blocks: [
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: `*${flags.length}/${MAX_COACHING_FLAGS} flags*` },
                        accessory: flags.length < MAX_COACHING_FLAGS ? {
                            type: 'button',
                            action_id: 'add_custom_flag',
                            text: { type: 'plain_text', text: '➕ Add Flag', emoji: true }
                        } : undefined
                    },
                    { type: 'divider' },
                    ...flagBlocks
                ]
            }
        });
        
        return new NextResponse('', { status: 200 });
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error opening manage flags modal', errorObj);
        return NextResponse.json({ text: 'Error opening flags manager' });
    }
}

async function handleManageFlagsOverflowAction(payload: SlackInteractivePayload, action: SlackInteractivePayload['actions'][0]) {
    try {
        const userId = payload.user?.id;
        const triggerId = payload.trigger_id;
        const selectedValue = action.value || (action as unknown as { selected_option?: { value: string } }).selected_option?.value;
        
        if (!userId || !triggerId || !selectedValue) {
            return NextResponse.json({ text: 'Missing required data' });
        }
        
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        if (!user) return NextResponse.json({ text: 'User not found' });
        
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        if (!workspace) return NextResponse.json({ text: 'Workspace not found' });
        
        const flags: CoachingFlag[] = user.coachingFlags?.length ? user.coachingFlags : [...DEFAULT_COACHING_FLAGS];
        const workspaceSlack = new WebClient(workspace.botToken);
        
        if (selectedValue === 'add_flag') {
            // Open create flag modal
            await workspaceSlack.views.push({
                trigger_id: triggerId,
                view: {
                    type: 'modal',
                    callback_id: 'create_flag_modal',
                    title: { type: 'plain_text', text: 'Add Flag' },
                    submit: { type: 'plain_text', text: 'Create' },
                    blocks: [
                        {
                            type: 'input',
                            block_id: 'flag_name',
                            label: { type: 'plain_text', text: 'Name' },
                            element: {
                                type: 'plain_text_input',
                                action_id: 'name_input',
                                placeholder: { type: 'plain_text', text: 'e.g., Passive voice' },
                                max_length: 50
                            }
                        },
                        {
                            type: 'input',
                            block_id: 'flag_description',
                            label: { type: 'plain_text', text: 'What should I look for?' },
                            element: {
                                type: 'plain_text_input',
                                action_id: 'description_input',
                                placeholder: { type: 'plain_text', text: 'e.g., Flag messages written in passive voice' },
                                max_length: 200,
                                multiline: true
                            }
                        }
                    ]
                }
            });
            return new NextResponse('', { status: 200 });
        }
        
        // Parse edit_X or delete_X actions
        const [actionType, indexStr] = selectedValue.split('_');
        const flagIndex = parseInt(indexStr, 10);
        
        if (isNaN(flagIndex) || flagIndex < 0 || flagIndex >= flags.length) {
            return NextResponse.json({ text: 'Flag not found' });
        }
        
        if (actionType === 'edit') {
            const flag = flags[flagIndex];
            await workspaceSlack.views.push({
                trigger_id: triggerId,
                view: {
                    type: 'modal',
                    callback_id: 'edit_flag_modal',
                    private_metadata: JSON.stringify({ flagIndex }),
                    title: { type: 'plain_text', text: 'Edit Flag' },
                    submit: { type: 'plain_text', text: 'Save' },
                    blocks: [
                        {
                            type: 'input',
                            block_id: 'flag_name',
                            label: { type: 'plain_text', text: 'Name' },
                            element: {
                                type: 'plain_text_input',
                                action_id: 'name_input',
                                initial_value: flag.name,
                                max_length: 50
                            }
                        },
                        {
                            type: 'input',
                            block_id: 'flag_description',
                            label: { type: 'plain_text', text: 'What should I look for?' },
                            element: {
                                type: 'plain_text_input',
                                action_id: 'description_input',
                                initial_value: flag.description,
                                max_length: 200,
                                multiline: true
                            }
                        }
                    ]
                }
            });
            return new NextResponse('', { status: 200 });
        }
        
        if (actionType === 'delete') {
            const flag = flags[flagIndex];
            await workspaceSlack.views.push({
                trigger_id: triggerId,
                view: {
                    type: 'modal',
                    callback_id: 'delete_flag_modal',
                    private_metadata: JSON.stringify({ flagIndex }),
                    title: { type: 'plain_text', text: 'Delete Flag' },
                    submit: { type: 'plain_text', text: 'Delete' },
                    close: { type: 'plain_text', text: 'Cancel' },
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `Are you sure you want to delete *${flag.name}*?\n\n_${flag.description}_`
                            }
                        }
                    ]
                }
            });
            return new NextResponse('', { status: 200 });
        }
        
        return NextResponse.json({ text: 'Unknown action' });
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error handling manage flags overflow', errorObj);
        return NextResponse.json({ text: 'Error managing flags' });
    }
}

async function handleFlagOverflowAction(payload: SlackInteractivePayload, action: SlackInteractivePayload['actions'][0]) {
    try {
        const userId = payload.user?.id;
        const triggerId = payload.trigger_id;
        const selectedValue = action.value || (action as unknown as { selected_option?: { value: string } }).selected_option?.value;
        
        if (!userId || !triggerId || !selectedValue) {
            return NextResponse.json({ text: 'Missing required data' });
        }
        
        // Parse action: toggle_index, edit_index, or delete_index
        const [actionType, indexStr] = selectedValue.split('_');
        const flagIndex = parseInt(indexStr, 10);
        
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        if (!user) return NextResponse.json({ text: 'User not found' });
        
        const workspace = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        if (!workspace) return NextResponse.json({ text: 'Workspace not found' });
        
        const flags: CoachingFlag[] = user.coachingFlags?.length ? user.coachingFlags : [...DEFAULT_COACHING_FLAGS];
        
        if (isNaN(flagIndex) || flagIndex < 0 || flagIndex >= flags.length) {
            return NextResponse.json({ text: 'Flag not found' });
        }
        
        const workspaceSlack = new WebClient(workspace.botToken);
        
        if (actionType === 'toggle') {
            // Toggle flag enabled state
            const enabledCount = flags.filter(f => f.enabled).length;
            const targetFlag = flags[flagIndex];
            
            // Prevent disabling last enabled flag
            if (targetFlag.enabled && enabledCount <= 1) {
                return NextResponse.json({ text: 'At least one flag must be enabled.' });
            }
            
            flags[flagIndex].enabled = !flags[flagIndex].enabled;
            
            await slackUserCollection.updateOne(
                { slackId: userId },
                { $set: { coachingFlags: flags, updatedAt: new Date() } }
            );
            
            // Send ephemeral confirmation
            return NextResponse.json({ 
                text: `${flags[flagIndex].enabled ? '✅' : '⬜'} ${flags[flagIndex].name} ${flags[flagIndex].enabled ? 'enabled' : 'disabled'}` 
            });
            
        } else if (actionType === 'edit') {
            const flag = flags[flagIndex];
            
            await workspaceSlack.views.push({
                trigger_id: triggerId,
                view: {
                    type: 'modal',
                    callback_id: 'edit_flag_modal',
                    private_metadata: JSON.stringify({ flagIndex }),
                    title: { type: 'plain_text', text: 'Edit Flag' },
                    submit: { type: 'plain_text', text: 'Save' },
                    blocks: [
                        {
                            type: 'input',
                            block_id: 'flag_name',
                            label: { type: 'plain_text', text: 'Name' },
                            element: {
                                type: 'plain_text_input',
                                action_id: 'name_input',
                                initial_value: flag.name,
                                max_length: 50
                            }
                        },
                        {
                            type: 'input',
                            block_id: 'flag_description',
                            label: { type: 'plain_text', text: 'What should I look for?' },
                            element: {
                                type: 'plain_text_input',
                                action_id: 'description_input',
                                initial_value: flag.description,
                                max_length: 200,
                                multiline: true
                            }
                        }
                    ]
                }
            });
            
            return new NextResponse('', { status: 200 });
            
        } else if (actionType === 'delete') {
            const flag = flags[flagIndex];
            
            await workspaceSlack.views.push({
                trigger_id: triggerId,
                view: {
                    type: 'modal',
                    callback_id: 'delete_flag_modal',
                    private_metadata: JSON.stringify({ flagIndex }),
                    title: { type: 'plain_text', text: 'Delete Flag?' },
                    submit: { type: 'plain_text', text: 'Delete' },
                    close: { type: 'plain_text', text: 'Cancel' },
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `Are you sure you want to delete *${flag.name}*?\n\nThis cannot be undone.`
                            }
                        }
                    ]
                }
            });
            
            return new NextResponse('', { status: 200 });
        }
        
        return NextResponse.json({ text: 'Unknown action' });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error handling flag overflow action', errorObj);
        return NextResponse.json({ text: 'Error processing flag action' });
    }
}

async function handleCreateFlagSubmission(payload: SlackInteractivePayload) {
    try {
        const userId = payload.user?.id;
        const view = payload.view;
        
        if (!userId || !view) {
            return NextResponse.json({
                response_action: 'errors',
                errors: { flag_name: 'Missing required data' }
            });
        }
        
        const name = view.state?.values?.flag_name?.name_input?.value?.trim();
        const description = view.state?.values?.flag_description?.description_input?.value?.trim();
        
        if (!name || !description) {
            return NextResponse.json({
                response_action: 'errors',
                errors: { 
                    ...(name ? {} : { flag_name: 'Name is required' }),
                    ...(description ? {} : { flag_description: 'Description is required' })
                }
            });
        }
        
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        if (!user) {
            return NextResponse.json({
                response_action: 'errors',
                errors: { flag_name: 'User not found' }
            });
        }
        
        const flags: CoachingFlag[] = user.coachingFlags?.length ? user.coachingFlags : [...DEFAULT_COACHING_FLAGS];
        
        if (flags.length >= MAX_COACHING_FLAGS) {
            return NextResponse.json({
                response_action: 'errors',
                errors: { flag_name: `Maximum of ${MAX_COACHING_FLAGS} flags reached` }
            });
        }
        
        // Create new flag
        const newFlag: CoachingFlag = {
            name,
            description,
            enabled: true
        };
        
        flags.push(newFlag);
        
        await slackUserCollection.updateOne(
            { slackId: userId },
            { $set: { coachingFlags: flags, updatedAt: new Date() } }
        );
        
        trackEvent(userId, EVENTS.FEATURE_COACHING_FLAGS_UPDATED, {
            action: 'create',
            flag_name: name,
            total_flags: flags.length
        });
        
        return NextResponse.json({
            response_action: 'update',
            view: {
                type: 'modal',
                callback_id: 'create_flag_modal',
                title: { type: 'plain_text', text: 'Flag Created!' },
                blocks: [
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: `✅ *${name}* has been created and enabled.\n\nUse \`/clarity-settings\` to manage your flags.` }
                    }
                ]
            }
        });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error creating flag', errorObj);
        return NextResponse.json({
            response_action: 'errors',
            errors: { flag_name: 'Error creating flag' }
        });
    }
}

async function handleEditFlagSubmission(payload: SlackInteractivePayload) {
    try {
        const userId = payload.user?.id;
        const view = payload.view;
        
        if (!userId || !view) {
            return NextResponse.json({
                response_action: 'errors',
                errors: { flag_name: 'Missing required data' }
            });
        }
        
        const metadata = view.private_metadata ? JSON.parse(view.private_metadata) : {};
        const flagIndex = metadata.flagIndex;
        
        const name = view.state?.values?.flag_name?.name_input?.value?.trim();
        const description = view.state?.values?.flag_description?.description_input?.value?.trim();
        
        if (!name || !description) {
            return NextResponse.json({
                response_action: 'errors',
                errors: { 
                    ...(name ? {} : { flag_name: 'Name is required' }),
                    ...(description ? {} : { flag_description: 'Description is required' })
                }
            });
        }
        
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        if (!user) {
            return NextResponse.json({
                response_action: 'errors',
                errors: { flag_name: 'User not found' }
            });
        }
        
        const flags: CoachingFlag[] = user.coachingFlags?.length ? user.coachingFlags : [...DEFAULT_COACHING_FLAGS];
        
        if (typeof flagIndex !== 'number' || flagIndex < 0 || flagIndex >= flags.length) {
            return NextResponse.json({
                response_action: 'errors',
                errors: { flag_name: 'Flag not found' }
            });
        }
        
        flags[flagIndex].name = name;
        flags[flagIndex].description = description;
        
        await slackUserCollection.updateOne(
            { slackId: userId },
            { $set: { coachingFlags: flags, updatedAt: new Date() } }
        );
        
        trackEvent(userId, EVENTS.FEATURE_COACHING_FLAGS_UPDATED, {
            action: 'edit',
            flag_index: flagIndex,
            flag_name: name
        });
        
        return NextResponse.json({
            response_action: 'update',
            view: {
                type: 'modal',
                callback_id: 'edit_flag_modal',
                title: { type: 'plain_text', text: 'Flag Updated!' },
                blocks: [
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: `✅ *${name}* has been updated.\n\nUse \`/clarity-settings\` to manage your flags.` }
                    }
                ]
            }
        });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error editing flag', errorObj);
        return NextResponse.json({
            response_action: 'errors',
            errors: { flag_name: 'Error updating flag' }
        });
    }
}

async function handleDeleteFlagSubmission(payload: SlackInteractivePayload) {
    try {
        const userId = payload.user?.id;
        const view = payload.view;
        
        if (!userId || !view) {
            return NextResponse.json({
                response_action: 'update',
                view: {
                    type: 'modal',
                    callback_id: 'delete_flag_modal',
                    title: { type: 'plain_text', text: 'Error' },
                    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Missing required data' } }]
                }
            });
        }
        
        const metadata = view.private_metadata ? JSON.parse(view.private_metadata) : {};
        const flagIndex = metadata.flagIndex;
        
        const user = await slackUserCollection.findOne({ slackId: userId, isActive: true });
        if (!user) {
            return NextResponse.json({
                response_action: 'update',
                view: {
                    type: 'modal',
                    callback_id: 'delete_flag_modal',
                    title: { type: 'plain_text', text: 'Error' },
                    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ User not found' } }]
                }
            });
        }
        
        const flags: CoachingFlag[] = user.coachingFlags?.length ? user.coachingFlags : [...DEFAULT_COACHING_FLAGS];
        
        if (typeof flagIndex !== 'number' || flagIndex < 0 || flagIndex >= flags.length) {
            return NextResponse.json({
                response_action: 'update',
                view: {
                    type: 'modal',
                    callback_id: 'delete_flag_modal',
                    title: { type: 'plain_text', text: 'Error' },
                    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Flag not found' } }]
                }
            });
        }
        
        const deletedFlag = flags[flagIndex];
        
        // Prevent deleting last enabled flag
        const enabledCount = flags.filter(f => f.enabled).length;
        if (deletedFlag.enabled && enabledCount <= 1) {
            return NextResponse.json({
                response_action: 'update',
                view: {
                    type: 'modal',
                    callback_id: 'delete_flag_modal',
                    title: { type: 'plain_text', text: 'Cannot Delete' },
                    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Cannot delete the last enabled flag. Please enable another flag first.' } }]
                }
            });
        }
        
        flags.splice(flagIndex, 1);
        
        await slackUserCollection.updateOne(
            { slackId: userId },
            { $set: { coachingFlags: flags, updatedAt: new Date() } }
        );
        
        trackEvent(userId, EVENTS.FEATURE_COACHING_FLAGS_UPDATED, {
            action: 'delete',
            flag_index: flagIndex,
            flag_name: deletedFlag.name,
            remaining_flags: flags.length
        });
        
        return NextResponse.json({
            response_action: 'update',
            view: {
                type: 'modal',
                callback_id: 'delete_flag_modal',
                title: { type: 'plain_text', text: 'Flag Deleted' },
                blocks: [
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: `✅ *${deletedFlag.name}* has been deleted.\n\nUse \`/clarity-settings\` to manage your flags.` }
                    }
                ]
            }
        });
        
    } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logError('Error deleting flag', errorObj);
        return NextResponse.json({
            response_action: 'update',
            view: {
                type: 'modal',
                callback_id: 'delete_flag_modal',
                title: { type: 'plain_text', text: 'Error' },
                blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Error deleting flag' } }]
            }
        });
    }
}
