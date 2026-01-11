'use server';

import { ObjectId } from 'mongodb';

import {
    slackUserCollection,
    workspaceCollection,
    botChannelsCollection
} from '@/lib/db';
import { ServerActionResult, Workspace } from '@/types';
import { trackEvent } from './posthog';
import { EVENTS } from './analytics/events';
import {
    joinChannel,
    getWorkspaceChannels as getWorkspaceChannelsFromSlack,
} from './slack';

// Slack OAuth URL Generation
export async function getSlackOAuthUrl(state?: string) {
    const { getSlackOAuthUrl: getSlackOAuthUrlFromLib } = await import('@/lib/slack');
    return getSlackOAuthUrlFromLib(state);
}

// Get workspace channels for onboarding/settings
export async function getWorkspaceChannels(workspaceId: string) {
    try {
        // Get workspace bot token from database using MongoDB ObjectId
        const workspace = await workspaceCollection.findOne({
            _id: new ObjectId(workspaceId)
        }) as Workspace | null;

        if (!workspace || !workspace.botToken) {
            console.error('Workspace not found or missing bot token:', workspaceId);
            return {
                success: false,
                error: 'Workspace not found or missing bot token',
                channels: []
            };
        }

        const channels = await getWorkspaceChannelsFromSlack(workspace.botToken);

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

// Join bot to selected channels
export async function joinBotToChannels(
    workspaceId: string,
    selectedChannels: Array<{ id: string; name: string }>
) {
    try {
        // Get workspace bot token from database
        const workspace = await workspaceCollection.findOne({
            _id: new ObjectId(workspaceId)
        }) as Workspace | null;

        if (!workspace || !workspace.botToken) {
            console.error('Workspace not found or missing bot token:', workspaceId);
            return {
                success: false,
                error: 'Workspace not found or missing bot token'
            };
        }

        // Join each selected channel
        const joinedChannels: string[] = [];

        for (const channel of selectedChannels) {
            const joinSuccess = await joinChannel(channel.id, workspace.botToken);

            if (joinSuccess) {
                joinedChannels.push(channel.name);
                console.log(`✅ Bot joined channel: ${channel.name} (${channel.id})`);

                // Add to database if not exists
                const existingChannel = await botChannelsCollection.findOne({
                    channelId: channel.id,
                    workspaceId: workspaceId
                });

                if (!existingChannel) {
                    await botChannelsCollection.insertOne({
                        _id: new ObjectId(),
                        workspaceId: workspaceId,
                        channelId: channel.id,
                        channelName: channel.name,
                        addedAt: new Date()
                    });

                    console.log(`✅ Added channel ${channel.name} to database`);
                }
            } else {
                console.warn(`❌ Failed to join channel: ${channel.name} (${channel.id})`);
            }
        }

        // Track channels joined
        if (joinedChannels.length > 0) {
            trackEvent(workspace.adminSlackId, EVENTS.ONBOARDING_CHANNELS_SAVED, {
                workspace_id: workspaceId,
                workspace_name: workspace.name,
                channels_joined: joinedChannels.length,
                channels_requested: selectedChannels.length,
                success_rate: (joinedChannels.length / selectedChannels.length) * 100,
                channel_names: joinedChannels,
            });
        }

        return {
            success: true,
            joinedCount: joinedChannels.length,
            totalCount: selectedChannels.length
        };

    } catch (error) {
        console.error('Error joining bot to channels:', error);
        return {
            success: false,
            error: 'Failed to join channels'
        };
    }
}

// Get channels where bot is active for a specific workspace
export async function getWorkspaceActiveChannels(workspaceId: string) {
    try {
        const workspace = await workspaceCollection.findOne({ 
            _id: new ObjectId(workspaceId) 
        }) as Workspace | null;
        
        if (!workspace || !workspace.botToken) {
            return {
                success: false,
                error: 'Workspace not found or missing bot token',
                channels: []
            };
        }

        // Get channels where bot is active
        const botChannels = await botChannelsCollection.find({
            workspaceId: workspaceId
        }).toArray();

        // Format channels
        const channels = botChannels.map(channel => ({
            id: channel.channelId,
            name: channel.channelName
        }));

        return {
            success: true,
            channels
        };
    } catch (error) {
        console.error('Error fetching workspace active channels:', error);
        return {
            success: false,
            error: 'Failed to fetch active channels',
            channels: []
        };
    }
}

// Save latest communication score on Slack user
export async function saveCommunicationScore(
    userId: string,
    period: 'weekly' | 'monthly',
    score: number,
    meta?: { reportId?: string }
): Promise<ServerActionResult<{ weekly?: { score: number; reportId?: string; updatedAt: Date }, monthly?: { score: number; reportId?: string; updatedAt: Date } }>> {
    try {
        if (!userId) {
            return { success: false, error: 'Missing userId' };
        }

        if (period !== 'weekly' && period !== 'monthly') {
            return { success: false, error: 'Invalid period' };
        }

        if (typeof score !== 'number' || score < 0 || score > 100) {
            return { success: false, error: 'Invalid score' };
        }

        const _id = new ObjectId(userId);

        const updatedAt = new Date();
        const fieldPath = `communicationScores.${period}` as const;

        const update: Record<string, unknown> = {};
        update[fieldPath] = {
            score,
            reportId: meta?.reportId,
            updatedAt
        };

        const result = await slackUserCollection.findOneAndUpdate(
            { _id },
            { $set: update },
            { returnDocument: 'after' }
        );

        const scores = (result?.communicationScores || {}) as { weekly?: { score: number; reportId?: string; updatedAt: Date }, monthly?: { score: number; reportId?: string; updatedAt: Date } };

        return { success: true, data: scores };
    } catch (error) {
        console.error('Error saving communication score:', error);
        return { success: false, error: 'Failed to save communication score' };
    }
}

// Get workspace by team ID (for Slack commands)
export async function getWorkspaceByTeamId(teamId: string) {
    try {
        const workspace = await workspaceCollection.findOne({ 
            workspaceId: teamId,
            isActive: true 
        }) as Workspace | null;
        
        if (!workspace) {
            return { success: false, error: 'Workspace not found' };
        }
        
        return { 
            success: true, 
            workspace: {
                _id: String(workspace._id),
                workspaceId: workspace.workspaceId,
                name: workspace.name,
                adminSlackId: workspace.adminSlackId,
                hasCompletedOnboarding: workspace.hasCompletedOnboarding,
                subscription: workspace.subscription
            }
        };
    } catch (error) {
        console.error('Error fetching workspace by team ID:', error);
        return { success: false, error: 'Failed to fetch workspace' };
    }
}