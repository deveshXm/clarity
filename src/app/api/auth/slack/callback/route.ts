import { NextRequest, NextResponse } from 'next/server';
import { exchangeOAuthCode, sendWelcomeMessage } from '@/lib/slack';
import { workspaceCollection, slackUserCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { WebClient } from '@slack/web-api';
import { trackEvent, identifyUser, trackError } from '@/lib/posthog';
import { EVENTS } from '@/lib/analytics/events';
import { logError, logInfo } from '@/lib/logger';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    logInfo('OAuth callback received', { 
        has_code: !!code,
        has_error: !!error,
        state,
        endpoint: '/api/auth/slack/callback'
    });



    // Track OAuth start (server-side for reliability)
    trackEvent('anonymous', EVENTS.AUTH_SLACK_OAUTH_STARTED, {
        has_code: !!code,
        has_error: !!error,
        state,
    });

    // Handle OAuth error
    if (error) {
        logError('Slack OAuth error', new Error(error), { state });
        trackError('anonymous', new Error(`OAuth error: ${error}`), { oauth_error: error, state });
        return NextResponse.redirect(new URL('/?error=oauth_error', request.url));
    }

    // Handle missing code
    if (!code) {
        logError('No authorization code received', undefined, { state });
        trackError('anonymous', new Error('Missing authorization code'), { state });
        return NextResponse.redirect(new URL('/?error=missing_code', request.url));
    }

    try {
        // Exchange authorization code for access token
        const oauthResponse = await exchangeOAuthCode(code);
        console.log('OAuth response:', JSON.stringify(oauthResponse, null, 2));
        
        // Basic validation without Zod
        if (!oauthResponse.ok) {
            console.error('Slack OAuth failed:', oauthResponse);
            return NextResponse.redirect(new URL('/?error=oauth_failed', request.url));
        }

        // Check if we have the required fields
        if (!oauthResponse.team || !oauthResponse.authed_user) {
            console.error('Missing required OAuth fields:', oauthResponse);
            return NextResponse.redirect(new URL('/?error=invalid_oauth_response', request.url));
        }

        // Extract workspace and user information
        const { team, authed_user } = oauthResponse;
        
        // Create or update workspace (store bot token)
        const workspaceData = {
            workspaceId: team.id,
            name: team.name,
            domain: team.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
            botToken: oauthResponse.access_token, // Store workspace-specific bot token
            isActive: true // Reactivate workspace on install
        };

        const existingWorkspace = await workspaceCollection.findOne({ workspaceId: team.id });
        let workspaceObjectId: ObjectId;

        if (existingWorkspace) {
            // Update existing workspace
            await workspaceCollection.updateOne(
                { workspaceId: team.id },
                { 
                    $set: { 
                        ...workspaceData, 
                        updatedAt: new Date() 
                    } 
                }
            );
            workspaceObjectId = existingWorkspace._id;
        } else {
            // Create new workspace
            const workspaceResult = await workspaceCollection.insertOne({
                _id: new ObjectId(),
                ...workspaceData,
                isActive: true, // Ensure new workspaces are active
                createdAt: new Date(),
                updatedAt: new Date()
            });
            workspaceObjectId = workspaceResult.insertedId;
        }

        // Get actual user information using bot token (no identity scopes needed)
        let actualUserName = 'Slack User';
        let actualDisplayName = 'Slack User';
        let userImage = undefined;
        
        try {

            const botClient = new WebClient(oauthResponse.access_token);
            const userInfo = await botClient.users.info({ user: authed_user.id });
            
            if (userInfo.ok && userInfo.user) {
                actualUserName = userInfo.user.real_name || userInfo.user.name || 'Slack User';
                actualDisplayName = userInfo.user.profile?.display_name || userInfo.user.real_name || userInfo.user.name || 'Slack User';
                userImage = userInfo.user.profile?.image_72; // Profile image
            }
        } catch (error) {
            console.log('Could not fetch user info, using defaults:', error);
            // Fall back to placeholder values - don't fail the OAuth flow
        }

        // Initialize default subscription for new users
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        
        const defaultSubscription = {
            tier: 'FREE' as const,
            status: 'active' as const,
            currentPeriodStart: now,
            currentPeriodEnd: nextMonth,
            monthlyUsage: {
                autoCoaching: 0,
                manualRephrase: 0,
                personalFeedback: 0,
            },
            createdAt: now,
            updatedAt: now,
        };

        // Check if user already exists
        const existingUser = await slackUserCollection.findOne({ 
            slackId: authed_user.id, 
            workspaceId: workspaceObjectId.toString() 
        });

        let isNewUser = false;
        
        if (existingUser) {
            // User exists - just reactivate them and update basic info (preserve subscription and usage)
            logInfo('Reactivating existing user', { 
                slack_user_id: authed_user.id,
                workspace_id: workspaceObjectId.toString()
            });
            
            await slackUserCollection.updateOne(
                { slackId: authed_user.id, workspaceId: workspaceObjectId.toString() },
                { 
                    $set: { 
                        isActive: true, // Reactivate user
                        name: actualUserName,
                        displayName: actualDisplayName,
                        image: userImage,
                        userToken: authed_user.access_token, // Update user token
                        updatedAt: new Date()
                        // Don't reset subscription, usage, or onboarding status
                    }
                }
            );
            
            // Identify returning user - simplified identification
            identifyUser(authed_user.id, {
                name: actualUserName,
                slack_user_id: authed_user.id,
                mongodb_id: existingUser._id.toString(),
                workspace_id: workspaceObjectId.toString(),
                workspace_name: team.name,
                is_returning_user: true,
                subscription_tier: ((existingUser as Record<string, unknown>)?.subscription as Record<string, unknown>)?.tier || 'FREE',
            });
            
        } else {
            // New user - create with default subscription
            isNewUser = true;
            logInfo('Creating new user', { 
                slack_user_id: authed_user.id,
                workspace_id: workspaceObjectId.toString(),
                workspace_name: team.name
            });
            
            const newUserData = {
                _id: new ObjectId(),
                id: new ObjectId().toString(),
                slackId: authed_user.id,
                workspaceId: workspaceObjectId.toString(),
                email: `${authed_user.id}@slack.local`, // Slack ID as email placeholder
                name: actualUserName,
                displayName: actualDisplayName,
                image: userImage,
                emailVerified: true,
                timezone: 'America/New_York', // Default timezone
                isActive: true,
                analysisFrequency: 'weekly',
                autoRephraseEnabled: true, // Default to enabled for new users
                hasCompletedOnboarding: false,
                userToken: authed_user.access_token,
                subscription: defaultSubscription,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await slackUserCollection.insertOne(newUserData);
            
            // Identify new user - simplified identification
            identifyUser(authed_user.id, {
                name: actualUserName,
                slack_user_id: authed_user.id,
                mongodb_id: newUserData._id.toString(),
                workspace_id: workspaceObjectId.toString(),
                workspace_name: team.name,
                is_new_user: true,
                subscription_tier: 'FREE',
            });
        }

        // Send welcome message to the user
        try {
            const welcomeMessageSent = await sendWelcomeMessage(
                authed_user.id,
                team.id,
                oauthResponse.access_token
            );
            
            if (welcomeMessageSent) {
                logInfo('Welcome message sent successfully', { slack_user_id: authed_user.id });
            } else {
                logError('Failed to send welcome message', undefined, { slack_user_id: authed_user.id });
            }
        } catch (error) {
            logError('Error sending welcome message', error instanceof Error ? error : new Error(String(error)), {
                slack_user_id: authed_user.id
            });
            // Don't fail the OAuth flow if welcome message fails - just log it
        }

        // Track successful OAuth completion (server-side for reliability)
        trackEvent(authed_user.id, EVENTS.AUTH_SLACK_OAUTH_COMPLETED, {
            workspace_id: workspaceObjectId.toString(),
            workspace_name: team.name,
            is_new_user: isNewUser,
            is_new_workspace: !existingWorkspace,
        });

        // Simply redirect to onboarding with user context - no session needed
        logInfo('OAuth callback successful', { 
            slack_user_id: authed_user.id,
            workspace_id: workspaceObjectId.toString(),
            is_new_user: isNewUser,
            workspace_name: team.name
        });
        
        const onboardingUrl = new URL(process.env.NEXT_PUBLIC_BETTER_AUTH_URL! + '/app/onboarding', request.url);
        onboardingUrl.searchParams.set('user', authed_user.id);
        onboardingUrl.searchParams.set('team', team.id);
        return NextResponse.redirect(onboardingUrl);

    } catch (error) {
        logError('Slack OAuth callback error', error instanceof Error ? error : new Error(String(error)), {
            code: code?.substring(0, 20),
            state
        });
        
        trackError('anonymous', error instanceof Error ? error : new Error(String(error)), {
            endpoint: '/api/auth/slack/callback',
            code: code?.substring(0, 20),
            state
        });
        
        return NextResponse.redirect(new URL('/?error=callback_error', request.url));
    }
} 