import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';
import { slackUserCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { SlackUser, STRIPE_PRICE_IDS } from '@/types';
import { trackEvent, trackError } from '@/lib/posthog';
import { EVENTS, ERROR_CATEGORIES } from '@/lib/analytics/events';
import { logError, logInfo } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user');
    
    if (!userId) {
      logError('Missing user parameter in checkout request');
      return NextResponse.json({ 
        error: 'Missing user parameter' 
      }, { status: 400 });
    }
    
    // Get user info for customer creation using MongoDB _id
    const user = await slackUserCollection.findOne({ 
      _id: new ObjectId(userId)
    }) as SlackUser | null;
    
    if (!user) {
      logError('User not found for checkout', undefined, { user_id: userId });
      return NextResponse.json({ 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // Note: Upgrade tracking handled by checkout session creation event
    
    // Check if user already has Pro subscription
    if (user.subscription?.tier === 'PRO' && user.subscription?.status === 'active') {
      logInfo('User already has Pro subscription', { 
        user_id: user.slackId,
        subscription_status: user.subscription.status,
        endpoint: '/api/stripe/checkout'
      });
      
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/app/help?message=already_subscribed`
      );
    }
    
    // Create checkout session using MongoDB _id as reference (convert to string)
    const session = await createCheckoutSession(
      user._id.toString(),
      STRIPE_PRICE_IDS.PRO_MONTHLY,
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/app/help?payment=success&upgraded=true`,
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/app/help?payment=cancelled`
    );
    
    // Track checkout session creation
    trackEvent(user.slackId, EVENTS.API_SUBSCRIPTION_CHECKOUT_CREATED, {
      user_name: user.name,
      workspace_id: user.workspaceId,
      session_id: session.id,
      price_id: STRIPE_PRICE_IDS.PRO_MONTHLY,
      amount: 1000, // $10.00 in cents
      subscription_tier: user.subscription?.tier || 'FREE',
    });
    
    logInfo('Stripe checkout session created', { 
      user_id: user.slackId,
      session_id: session.id,
      price_id: STRIPE_PRICE_IDS.PRO_MONTHLY,
      endpoint: '/api/stripe/checkout'
    });
    
    // Redirect to Stripe Checkout
    return NextResponse.redirect(session.url!);
    
  } catch (error) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user');
    
    logError('Stripe checkout error', error instanceof Error ? error : new Error(String(error)), {
      user_id: userId,
      endpoint: '/api/stripe/checkout'
    });
    
    trackError(userId || 'anonymous', error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/stripe/checkout',
      category: ERROR_CATEGORIES.SERVER,
    });
    
    return NextResponse.json({ 
      error: 'Failed to create checkout session' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, priceId } = body;
    
    if (!userId) {
      return NextResponse.json({ 
        error: 'Missing userId' 
      }, { status: 400 });
    }
    
    // Get user info using MongoDB _id
    const user = await slackUserCollection.findOne({ 
      _id: new ObjectId(userId)
    }) as SlackUser | null;
    
    if (!user) {
      return NextResponse.json({ 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // Use provided price ID or default to Pro monthly
    const selectedPriceId = priceId || STRIPE_PRICE_IDS.PRO_MONTHLY;
    
    // Create checkout session using MongoDB _id as reference (convert to string)
    const session = await createCheckoutSession(
      user._id.toString(),
      selectedPriceId,
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/app/help?payment=success&upgraded=true`,
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/app/help?payment=cancelled`
    );
    
    return NextResponse.json({ 
      checkoutUrl: session.url 
    });
    
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json({ 
      error: 'Failed to create checkout session' 
    }, { status: 500 });
  }
}
