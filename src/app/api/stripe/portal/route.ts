import { NextRequest, NextResponse } from 'next/server';
import { createPortalSession } from '@/lib/stripe';
import { slackUserCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { trackEvent, trackError } from '@/lib/posthog';
import { EVENTS, ERROR_CATEGORIES } from '@/lib/analytics/events';
import { logError, logInfo } from '@/lib/logger';
import { SlackUser } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user');
    
    if (!userId) {
      return NextResponse.json({ 
        error: 'Missing user parameter' 
      }, { status: 400 });
    }
    
    // Get user with subscription info using MongoDB _id

    const user = await slackUserCollection.findOne({ 
      _id: new ObjectId(userId)
    }) as SlackUser | null;
    
    if (!user?.subscription?.stripeCustomerId) {
      return NextResponse.json({ 
        error: 'No active subscription found' 
      }, { status: 404 });
    }
    
    // Create portal session
    const session = await createPortalSession(
      user.subscription.stripeCustomerId,
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?tab=subscription`
    );
    
    // Track portal access
    trackEvent(user.slackId, EVENTS.API_SUBSCRIPTION_PORTAL_ACCESSED, {
      user_name: user.name,
      workspace_id: user.workspaceId,
      customer_id: user.subscription.stripeCustomerId,
      subscription_tier: user.subscription.tier,
      subscription_status: user.subscription.status,
    });

    logInfo('Stripe portal session created (GET)', { 
      user_id: userId,
      customer_id: user.subscription.stripeCustomerId,
      endpoint: '/api/stripe/portal'
    });

    // Redirect to Stripe Customer Portal
    return NextResponse.redirect(session.url);
    
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const userId = new URL(request.url).searchParams.get('user');
    logError('Stripe portal error (GET)', errorObj, { 
      endpoint: '/api/stripe/portal',
      user_id: userId
    });
    trackError(userId || 'anonymous', errorObj, { 
      endpoint: '/api/stripe/portal',
      operation: 'create_portal_session_get',
      category: ERROR_CATEGORIES.SERVER
    });
    return NextResponse.json({ 
      error: 'Failed to create portal session' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;
    
    if (!userId) {
      return NextResponse.json({ 
        error: 'Missing userId' 
      }, { status: 400 });
    }
    
    // Get user with subscription info using MongoDB _id

    const user = await slackUserCollection.findOne({ 
      _id: new ObjectId(userId)
    }) as SlackUser | null;
    
    if (!user?.subscription?.stripeCustomerId) {
      return NextResponse.json({ 
        error: 'No active subscription found' 
      }, { status: 404 });
    }
    
    // Create portal session
    const session = await createPortalSession(
      user.subscription.stripeCustomerId,
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?tab=subscription`
    );
    
    logInfo('Stripe portal session created (POST)', { 
      user_id: userId,
      customer_id: user.subscription.stripeCustomerId,
      endpoint: '/api/stripe/portal'
    });

    return NextResponse.json({ 
      portalUrl: session.url 
    });
    
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    let userId = 'anonymous';
    try {
      const body = await request.json();
      userId = body.userId || 'anonymous';
    } catch {
      // Body already consumed or invalid
    }
    logError('Stripe portal error (POST)', errorObj, { 
      endpoint: '/api/stripe/portal',
      user_id: userId
    });
    trackError(userId, errorObj, { 
      endpoint: '/api/stripe/portal',
      operation: 'create_portal_session_post'
    });
    return NextResponse.json({ 
      error: 'Failed to create portal session' 
    }, { status: 500 });
  }
}
