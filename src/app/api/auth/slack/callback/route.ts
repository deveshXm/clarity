import { NextRequest, NextResponse } from 'next/server';
import { exchangeOAuthCode, sendWelcomeMessage } from '@/lib/slack';
import { workspaceCollection, slackUserCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    console.log('OAuth callback received:', { code: code?.substring(0, 20) + '...', error, state });

    // Handle OAuth error
    if (error) {
        console.error('Slack OAuth error:', error);
        return NextResponse.redirect(new URL('/?error=oauth_error', request.url));
    }

    // Handle missing code
    if (!code) {
        console.error('No authorization code received');
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
            botToken: oauthResponse.access_token // Store workspace-specific bot token
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
            const { WebClient } = await import('@slack/web-api');
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

        // Create or update user with actual OAuth data
        const userData = {
            slackId: authed_user.id,
            workspaceId: workspaceObjectId.toString(),
            email: authed_user.id, // Using Slack ID as identifier (we don't need actual email)
            name: actualUserName,
            displayName: actualDisplayName,
            image: userImage,
            emailVerified: true,
            timezone: 'America/New_York', // Default timezone
            isActive: true,
            analysisFrequency: 'weekly',
            hasCompletedOnboarding: false,
            userToken: authed_user.access_token // Store user token for message updating
        };

        const existingUser = await slackUserCollection.findOne({ 
            slackId: authed_user.id, 
            workspaceId: workspaceObjectId.toString() 
        });

        if (existingUser) {
            // Update existing user
            await slackUserCollection.updateOne(
                { slackId: authed_user.id, workspaceId: workspaceObjectId.toString() },
                { 
                    $set: { 
                        ...userData, 
                        updatedAt: new Date() 
                    } 
                }
            );
        } else {
            // Create new user
            await slackUserCollection.insertOne({
                _id: new ObjectId(),
                id: new ObjectId().toString(),
                ...userData,
                createdAt: new Date(),
                updatedAt: new Date()
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
                console.log('✅ Welcome message sent to user:', authed_user.id);
            } else {
                console.error('❌ Failed to send welcome message to user:', authed_user.id);
            }
        } catch (error) {
            console.error('Error sending welcome message:', error);
            // Don't fail the OAuth flow if welcome message fails - just log it
        }

        // Simply redirect to onboarding with user context - no session needed
        console.log('OAuth callback successful, app installed for user:', authed_user.id);
        const onboardingUrl = new URL(process.env.NEXT_PUBLIC_BETTER_AUTH_URL! + '/app/onboarding', request.url);
        onboardingUrl.searchParams.set('user', authed_user.id);
        onboardingUrl.searchParams.set('team', team.id);
        return NextResponse.redirect(onboardingUrl);

    } catch (error) {
        console.error('Slack OAuth callback error:', error);
        return NextResponse.redirect(new URL('/?error=callback_error', request.url));
    }
} 