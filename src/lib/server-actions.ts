'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { headers } from 'next/headers';

import { 
    userCollection, 
    accountConfigCollection, 
    slackUserCollection, 
    workspaceCollection, 
    invitationCollection,
    botChannelsCollection
} from '@/lib/db';
import { AccountConfigFormData, AccountConfigFormDataSchema, ServerActionResult, CreateBotChannelInput } from '@/types';
import { nowTimestamp } from './utils';
import { trackEvent } from './posthog';
import { EVENTS } from './analytics/events';
import { 
    sendOnboardingReminderMessage
} from './slack';

// Helper function to get current user
export async function getCurrentUser() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user) {
        throw new Error('Unauthorized');
    }

    return session.user;
}

// Helper function to get user by ID from database
export async function getUserById(userId: string) {
    try {
        const user = await userCollection.findOne({
            _id: new ObjectId(userId)
        });

        return user;
    } catch (error) {
        console.error('Error fetching user by ID:', error);
        throw new Error('Failed to fetch user');
    }
}

// Account Config Management
export async function upsertAccountConfig(rawData: AccountConfigFormData): Promise<ServerActionResult> {
    try {
        const user = await getCurrentUser();
        
        const validatedData = AccountConfigFormDataSchema.parse(rawData);

        await accountConfigCollection.replaceOne(
            { userId: user.id },
            {
                ...validatedData,
                userId: user.id,
                createdAt: nowTimestamp(),
                updatedAt: nowTimestamp()
            },
            { upsert: true }
        );

        // Mark user as having completed onboarding
        await userCollection.updateOne(
            { id: user.id },
            { $set: { hasCompletedOnboarding: true } }
        );

        return { success: true };
    } catch (error) {
        console.error('Error upserting account config:', error);
        
        if (error instanceof z.ZodError) {
            const flattenedErrors = error.flatten().fieldErrors;
            const filteredErrors: Record<string, string[]> = {};
            
            for (const [key, value] of Object.entries(flattenedErrors)) {
                if (value) {
                    filteredErrors[key] = value;
                }
            }
            
            return {
                success: false,
                error: 'Validation failed',
                fieldErrors: filteredErrors
            };
        }

        return {
            success: false,
            error: 'Failed to save account configuration'
        };
    }
}

export async function getAccountConfig(): Promise<ServerActionResult<AccountConfigFormData | null>> {
    try {
        const user = await getCurrentUser();
        
        const accountConfig = await accountConfigCollection.findOne({
            userId: user.id
        });

        if (!accountConfig) {
            return { success: true, data: null };
        }

        const serializedConfig: AccountConfigFormData = {
            companyName: accountConfig.companyName,
            websiteUrl: accountConfig.websiteUrl,
        };

        return { success: true, data: serializedConfig };
    } catch (error) {
        console.error('Error fetching account config:', error);
        return {
            success: false,
            error: 'Failed to fetch account configuration'
        };
    }
}

// Slack OAuth URL Generation
export async function getSlackOAuthUrl(state?: string) {
    const { getSlackOAuthUrl } = await import('./slack');
    return getSlackOAuthUrl(state);
}

// Slack User Validation
export async function validateSlackUser(slackId: string, teamId: string) {
    try {
        if (!slackId || !teamId) {
            return { error: 'Missing slackId or teamId parameter' };
        }

        // Find workspace first
        const workspace = await workspaceCollection.findOne({ workspaceId: teamId });
        if (!workspace) {
            return { error: 'Workspace not found' };
        }

        // Find user in that workspace
        const user = await slackUserCollection.findOne({
            slackId: slackId,
            workspaceId: workspace._id.toString()
        });

        if (!user) {
            return { error: 'User not found' };
        }

        // Track user validation
        trackEvent(slackId, EVENTS.ONBOARDING_USER_VALIDATED, {
            user_name: user.name,
            workspace_id: user.workspaceId,
            subscription_tier: user.subscription?.tier || 'FREE',
            has_completed_onboarding: user.hasCompletedOnboarding || false,
        });

        return {
            success: true,
            user: {
                _id: user._id.toString(),
                slackId: user.slackId,
                workspaceId: user.workspaceId,
                name: user.name,
                analysisFrequency: user.analysisFrequency,
                hasCompletedOnboarding: user.hasCompletedOnboarding || false,
                subscription: user.subscription // Include subscription data for onboarding
            }
        };

    } catch (error) {
        console.error('User validation error:', error);
        return { error: 'Internal server error' };
    }
}

// Get workspace channels for onboarding
export async function getWorkspaceChannels(teamId: string) {
    try {
        // Get workspace bot token from database using Slack team ID
        const workspace = await workspaceCollection.findOne({ 
            workspaceId: teamId 
        });
        
        if (!workspace || !workspace.botToken) {
            console.error('Workspace not found or missing bot token:', teamId);
            return {
                success: false,
                error: 'Workspace not found or missing bot token',
                channels: []
            };
        }
        
        const { getWorkspaceChannels } = await import('./slack');
        const channels = await getWorkspaceChannels(workspace.botToken);
        
        return {
            success: true,
            channels
        };
    } catch (error) {
        console.error('Error fetching workspace channels:', error);
        return {
            success: false,
            error: 'Failed to fetch workspace channels',
            channels: []
        };
    }
}

// Save bot channels and join them
export async function saveBotChannels(
    userWorkspaceId: string,
    teamId: string,
    selectedChannels: Array<{ id: string; name: string }>
) {
    try {
        // Get workspace bot token from database using Slack team ID
        const workspace = await workspaceCollection.findOne({ 
            workspaceId: teamId 
        });
        
        if (!workspace || !workspace.botToken) {
            console.error('Workspace not found or missing bot token:', teamId);
            return {
                success: false,
                error: 'Workspace not found or missing bot token'
            };
        }
        
        const { joinChannel } = await import('./slack');
        
        // Join each selected channel and save to database
        const savedChannels: CreateBotChannelInput[] = [];
        
        for (const channel of selectedChannels) {
            // Try to join the channel with workspace-specific bot token
            const joinSuccess = await joinChannel(channel.id, workspace.botToken);
            
            if (joinSuccess) {
                savedChannels.push({
                    workspaceId: userWorkspaceId, // Use user's workspaceId (ObjectId) for database consistency
                    channelId: channel.id,
                    channelName: channel.name
                });
            } else {
                console.warn(`Failed to join channel: ${channel.name} (${channel.id})`);
            }
        }
        
        // Save successfully joined channels to database
        if (savedChannels.length > 0) {
            const channelsWithTimestamp = savedChannels.map(channel => ({
                ...channel,
                _id: new ObjectId(),
                addedAt: new Date()
            }));
            
            await botChannelsCollection.insertMany(channelsWithTimestamp);
            console.log(`Saved ${savedChannels.length} channels for workspace ${userWorkspaceId}`);

            // Track channels saved
            const user = await slackUserCollection.findOne({ workspaceId: userWorkspaceId });
            if (user) {
                trackEvent(user.slackId, EVENTS.ONBOARDING_CHANNELS_SAVED, {
                    user_name: user.name,
                    workspace_id: userWorkspaceId,
                    channels_joined: savedChannels.length,
                    channels_requested: selectedChannels.length,
                    success_rate: (savedChannels.length / selectedChannels.length) * 100,
                    channel_names: savedChannels.map(c => c.channelName),
                });
            }
        }
        
        return {
            success: true,
            joinedCount: savedChannels.length,
            totalCount: selectedChannels.length
        };
        
    } catch (error) {
        console.error('Error saving bot channels:', error);
        return {
            success: false,
            error: 'Failed to join and save channels'
        };
    }
}

// Complete Slack User Onboarding
export async function completeSlackOnboarding(
    slackId: string, 
    userWorkspaceId: string, 
    analysisFrequency: 'weekly' | 'monthly',
    selectedChannels?: Array<{ id: string; name: string }>,
    invitationEmails?: string[]
) {
    try {
        if (!slackId || !userWorkspaceId) {
            return { error: 'Missing required fields' };
        }

        // Update user preferences and mark onboarding complete
        const updateResult = await slackUserCollection.updateOne(
            { slackId, workspaceId: userWorkspaceId },
            {
                $set: {
                    analysisFrequency: analysisFrequency || 'weekly',
                    hasCompletedOnboarding: true,
                    updatedAt: new Date()
                }
            }
        );

        if (updateResult.matchedCount === 0) {
            return { error: 'User not found' };
        }

        // Save bot channels if any were selected
        if (selectedChannels && selectedChannels.length > 0) {
            // Get the actual Slack team ID for workspace lookup
            const workspace = await workspaceCollection.findOne({ 
                _id: new ObjectId(userWorkspaceId) 
            });
            
            if (!workspace) {
                console.error('Workspace not found for user workspace ID:', userWorkspaceId);
                return { error: 'Workspace not found' };
            }
            
            const channelResult = await saveBotChannels(userWorkspaceId, workspace.workspaceId, selectedChannels);
            if (!channelResult.success) {
                console.warn('Failed to save some channels, but continuing with onboarding');
            }
        }

        // Store invitation emails if any were provided
        if (invitationEmails && invitationEmails.length > 0) {
            const user = await slackUserCollection.findOne({ slackId, workspaceId: userWorkspaceId });
            
            if (user) {
                const invitations = invitationEmails.map((email: string) => ({
                    _id: new ObjectId(),
                    userId: user._id,
                    email: email,
                    sentAt: new Date(),
                    status: 'sent'
                }));

                await invitationCollection.insertMany(invitations);
                console.log(`Stored ${invitations.length} invitation emails for user ${slackId}`);
            }
        }

        console.log(`Onboarding completed for user ${slackId} with frequency ${analysisFrequency}`);

        // Track onboarding completion
        const user = await slackUserCollection.findOne({ slackId, workspaceId: userWorkspaceId });
        if (user) {
            trackEvent(slackId, EVENTS.ONBOARDING_COMPLETED, {
                user_name: user.name,
                workspace_id: userWorkspaceId,
                analysis_frequency: analysisFrequency,
                channels_selected: selectedChannels?.length || 0,
                invitations_sent: invitationEmails?.length || 0,
                subscription_tier: user.subscription?.tier || 'FREE',
            });
        }

        return {
            success: true,
            message: 'Onboarding completed successfully'
        };

    } catch (error) {
        console.error('Complete onboarding error:', error);
        return { error: 'Internal server error' };
    }
}

// Send onboarding reminders to users who haven't completed setup
export async function sendOnboardingReminders(): Promise<{ sent: number; errors: number }> {
    try {
        // Find users who haven't completed onboarding and were created more than 24 hours ago
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const incompleteUsers = await slackUserCollection.find({
            hasCompletedOnboarding: false,
            createdAt: { $lt: twentyFourHoursAgo }
        }).toArray();

        let sentCount = 0;
        let errorCount = 0;

        for (const user of incompleteUsers) {
            try {
                // Get workspace to get bot token
                const workspace = await workspaceCollection.findOne({ 
                    _id: new ObjectId(user.workspaceId) 
                });

                if (!workspace) {
                    console.error('Workspace not found for user:', user.slackId);
                    errorCount++;
                    continue;
                }

                const reminderSent = await sendOnboardingReminderMessage(
                    user.slackId,
                    workspace.workspaceId,
                    workspace.botToken
                );

                if (reminderSent) {
                    sentCount++;
                    console.log('✅ Onboarding reminder sent to user:', user.slackId);
                } else {
                    errorCount++;
                    console.error('❌ Failed to send reminder to user:', user.slackId);
                }
            } catch (error) {
                errorCount++;
                console.error('Error sending reminder to user:', user.slackId, error);
            }
        }

        console.log(`📊 Onboarding reminders complete: ${sentCount} sent, ${errorCount} errors`);
        return { sent: sentCount, errors: errorCount };

    } catch (error) {
        console.error('Error in sendOnboardingReminders:', error);
        throw new Error('Failed to send onboarding reminders');
    }
}


