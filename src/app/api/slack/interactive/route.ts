import { NextRequest, NextResponse, after } from 'next/server';
import { verifySlackSignature } from '@/lib/slack';
import { slackUserCollection, workspaceCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { WebClient } from '@slack/web-api';
// Define types inline for now
interface SlackInteractivePayload {
  type: string;
  user: { id: string; name: string };
  actions: Array<{ action_id: string; value: string; type: string }>;
  channel: { id: string; name: string };
  message: { ts: string };
  view?: {
    callback_id?: string;
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
        
        console.log('🔄 Interactive component triggered:', {
            type: payload.type,
            action_id: payload.actions?.[0]?.action_id,
            user: payload.user?.id
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
            }
        } else if (payload.type === 'view_submission') {
            // Handle modal form submissions
            if (payload.view?.callback_id === 'settings_modal') {
                return await handleSettingsSubmission(payload);
            }
        }
        
        return NextResponse.json({ text: 'Unknown interaction' });
        
    } catch (error) {
        console.error('Slack interactive components error:', error);
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
                            text: "💡 *Tip: Use `/settings` to adjust coaching preferences*"
                        }
                    ]
                }
            ]
        });
        
    } catch (error) {
        console.error('Error in message replacement:', error);
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
                            text: "💡 *Tip: Use `/personalfeedback` to get your overall communication analysis*"
                        }
                    ]
                }
            ]
        });
        
    } catch (error) {
        console.error('Error sending improved message:', error);
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
                        text: "💡 *Tip: Use `/personalfeedback` to get your overall communication analysis*"
                    }
                ]
            }
        ]
    });
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
        
        // Extract auto rephrase setting from checkbox
        const autoRephraseElement = view.state?.values?.auto_rephrase_selection?.auto_rephrase_checkbox;
        console.log('🔍 Auto rephrase element:', JSON.stringify(autoRephraseElement, null, 2));
        
        // Handle checkbox state - Slack sends selected_options array when checked, undefined/empty when unchecked
        const autoRephraseEnabled = autoRephraseElement?.selected_options && 
            Array.isArray(autoRephraseElement.selected_options) && 
            autoRephraseElement.selected_options.length > 0;
        
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
                await slackUserCollection.updateOne(
                    { slackId: userId },
                    {
                        $set: {
                            analysisFrequency: selectedValue,
                            autoRephraseEnabled: autoRephraseEnabled,
                            updatedAt: new Date(),
                        },
                    },
                );
            } catch (err) {
                console.error('DB update error in settings submission:', err);
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
                            text: '✅ Settings updated'
                        }
                    }
                ]
            }
        });
        
    } catch (error) {
        console.error('Error handling settings submission:', error);
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