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
        
        // Basic validation
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
        const botClient = new WebClient(oauthResponse.access_token);
        
        // Get actual user information (name, email)
        let adminUserName = 'Slack User';
        let adminEmail: string | null = null;
        
        try {
            const userInfo = await botClient.users.info({ user: authed_user.id });
            
            if (userInfo.ok && userInfo.user) {
                adminUserName = userInfo.user.real_name || userInfo.user.name || 'Slack User';
                // Get email from Slack (requires users:read.email scope)
                adminEmail = userInfo.user.profile?.email || null;
            }
        } catch (err) {
            console.log('Could not fetch user info, using defaults:', err);
        }

        // Initialize default subscription for workspace (FREE tier)
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        
        const defaultSubscription = {
            tier: 'FREE' as const,
            status: 'active' as const,
            currentPeriodStart: now,
            currentPeriodEnd: nextMonth,
            stripeCustomerId: undefined as string | undefined,
            stripeSubscriptionId: undefined as string | undefined,
            monthlyUsage: {
                autoCoaching: 0,
                manualRephrase: 0,
            },
            createdAt: now,
            updatedAt: now,
        };

        // Check if workspace already exists
        const existingWorkspace = await workspaceCollection.findOne({ workspaceId: team.id });
        let workspaceObjectId: ObjectId;
        let isNewWorkspace = false;

        if (existingWorkspace) {
            // Update existing workspace - preserve subscription if exists
            const existingSubscription = existingWorkspace.subscription as typeof defaultSubscription | undefined;
            const preservedUsage = existingSubscription?.monthlyUsage || defaultSubscription.monthlyUsage;
            
            const updatedSubscription = {
                ...defaultSubscription,
                monthlyUsage: preservedUsage,
                tier: existingSubscription?.tier || 'FREE',
                status: existingSubscription?.status || 'active',
                stripeCustomerId: existingSubscription?.stripeCustomerId,
                stripeSubscriptionId: existingSubscription?.stripeSubscriptionId,
                currentPeriodStart: existingSubscription?.currentPeriodStart || now,
                currentPeriodEnd: existingSubscription?.currentPeriodEnd || nextMonth,
            };
            
            await workspaceCollection.updateOne(
                { workspaceId: team.id },
                { 
                    $set: { 
                        name: team.name,
                        domain: team.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
                        botToken: oauthResponse.access_token,
                        botUserId: oauthResponse.bot_user_id,
                        adminSlackId: authed_user.id, // Update admin to current installer
                        hasCompletedOnboarding: existingWorkspace.hasCompletedOnboarding || false, // Preserve if already completed
                        subscription: updatedSubscription,
                        isActive: true,
                        updatedAt: new Date()
                    } 
                }
            );
            workspaceObjectId = existingWorkspace._id as ObjectId;
            
            logInfo('Updated existing workspace', { 
                workspace_id: team.id,
                admin_slack_id: authed_user.id
            });
        } else {
            // Create new workspace with admin and subscription
            isNewWorkspace = true;
            const workspaceResult = await workspaceCollection.insertOne({
                _id: new ObjectId(),
                workspaceId: team.id,
                name: team.name,
                domain: team.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
                botToken: oauthResponse.access_token,
                botUserId: oauthResponse.bot_user_id,
                adminSlackId: authed_user.id, // Installer becomes admin
                hasCompletedOnboarding: false, // Workspace needs onboarding
                subscription: defaultSubscription,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            workspaceObjectId = workspaceResult.insertedId;
            
            logInfo('Created new workspace', { 
                workspace_id: team.id,
                admin_slack_id: authed_user.id,
                admin_name: adminUserName
            });
        }

        // Create or update admin user in slackUserCollection
        const existingUser = await slackUserCollection.findOne({
            slackId: authed_user.id,
            workspaceId: workspaceObjectId.toString()
        });

        if (!existingUser) {
            // Import DEFAULT_COACHING_FLAGS inline to avoid circular deps
            const { DEFAULT_COACHING_FLAGS } = await import('@/types');
            
            // Create admin user
            await slackUserCollection.insertOne({
                _id: new ObjectId(),
                slackId: authed_user.id,
                workspaceId: workspaceObjectId.toString(),
                email: adminEmail,
                name: adminUserName,
                displayName: adminUserName,
                autoCoachingEnabledChannels: [],
                coachingFlags: [...DEFAULT_COACHING_FLAGS],
                isAdmin: true,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
            logInfo('Created admin user', {
                slack_id: authed_user.id,
                workspace_id: workspaceObjectId.toString(),
                name: adminUserName
            });
        } else {
            // Update existing user to ensure admin status
            await slackUserCollection.updateOne(
                { slackId: authed_user.id, workspaceId: workspaceObjectId.toString() },
                { 
                    $set: { 
                        isAdmin: true,
                        isActive: true,
                        updatedAt: new Date()
                    } 
                }
            );
            
            logInfo('Updated existing user as admin', {
                slack_id: authed_user.id,
                workspace_id: workspaceObjectId.toString()
            });
        }

        // Identify admin user in analytics
        identifyUser(authed_user.id, {
            name: adminUserName,
            email: adminEmail,
            slack_user_id: authed_user.id,
            workspace_id: workspaceObjectId.toString(),
            workspace_name: team.name,
            is_workspace_admin: true,
            is_new_workspace: isNewWorkspace,
        });

        // Send welcome message to the admin
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
        } catch (err) {
            logError('Error sending welcome message', err instanceof Error ? err : new Error(String(err)), {
                slack_user_id: authed_user.id
            });
        }

        // Track successful OAuth completion
        trackEvent(authed_user.id, EVENTS.AUTH_SLACK_OAUTH_COMPLETED, {
            workspace_id: workspaceObjectId.toString(),
            workspace_name: team.name,
            is_new_workspace: isNewWorkspace,
            is_workspace_admin: true,
            admin_email: adminEmail,
        });

        // Redirect to docs page instead of onboarding webpage
        // Admin will complete onboarding via Slack modal when they try a command
        logInfo('OAuth callback successful - redirecting to docs', { 
            slack_user_id: authed_user.id,
            workspace_id: workspaceObjectId.toString(),
            is_new_workspace: isNewWorkspace,
            workspace_name: team.name
        });
        
        const docsUrl = new URL(process.env.NEXT_PUBLIC_BETTER_AUTH_URL! + '/docs/getting-started', request.url);
        docsUrl.searchParams.set('installed', 'true');
        docsUrl.searchParams.set('openSlack', team.id);
        docsUrl.searchParams.set('botId', oauthResponse.bot_user_id);
        return NextResponse.redirect(docsUrl);

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
