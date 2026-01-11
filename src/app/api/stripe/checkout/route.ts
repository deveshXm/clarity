import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';
import { workspaceCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { Workspace, STRIPE_PRICE_IDS } from '@/types';
import { trackEvent, trackError } from '@/lib/posthog';
import { EVENTS, ERROR_CATEGORIES } from '@/lib/analytics/events';
import { logError, logInfo } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace');
    
    if (!workspaceId) {
      logError('Missing workspace parameter in checkout request');
      return NextResponse.json({ 
        error: 'Missing workspace parameter' 
      }, { status: 400 });
    }
    
    // Get workspace info for customer creation using MongoDB _id
    const workspace = await workspaceCollection.findOne({ 
      _id: new ObjectId(workspaceId)
    }) as Workspace | null;
    
    if (!workspace) {
      logError('Workspace not found for checkout', undefined, { workspace_id: workspaceId });
      return NextResponse.json({ 
        error: 'Workspace not found' 
      }, { status: 404 });
    }
    
    // Check if workspace already has Pro subscription
    if (workspace.subscription?.tier === 'PRO' && workspace.subscription?.status === 'active') {
      logInfo('Workspace already has Pro subscription', { 
        workspace_id: workspace.workspaceId,
        subscription_status: workspace.subscription.status,
        endpoint: '/api/stripe/checkout'
      });
      
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?message=already_subscribed`
      );
    }
    
    // Create checkout session using workspace MongoDB _id as reference
    const session = await createCheckoutSession(
      String(workspace._id),
      STRIPE_PRICE_IDS.PRO_MONTHLY,
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?payment=success&upgraded=true&openSlack=${workspace.workspaceId}`,
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?payment=cancelled`
    );
    
    // Track checkout session creation
    trackEvent(workspace.adminSlackId, EVENTS.API_SUBSCRIPTION_CHECKOUT_CREATED, {
      workspace_id: String(workspace._id),
      workspace_name: workspace.name,
      session_id: session.id,
      price_id: STRIPE_PRICE_IDS.PRO_MONTHLY,
      amount: 499, // $4.99 in cents
      subscription_tier: workspace.subscription?.tier || 'FREE',
    });
    
    logInfo('Stripe checkout session created', { 
      workspace_id: workspace.workspaceId,
      session_id: session.id,
      price_id: STRIPE_PRICE_IDS.PRO_MONTHLY,
      endpoint: '/api/stripe/checkout'
    });
    
    // Redirect to Stripe Checkout
    return NextResponse.redirect(session.url!);
    
  } catch (error) {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace');
    
    logError('Stripe checkout error', error instanceof Error ? error : new Error(String(error)), {
      workspace_id: workspaceId,
      endpoint: '/api/stripe/checkout'
    });
    
    trackError(workspaceId || 'anonymous', error instanceof Error ? error : new Error(String(error)), {
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
    const { workspaceId, priceId } = body;
    
    if (!workspaceId) {
      return NextResponse.json({ 
        error: 'Missing workspaceId' 
      }, { status: 400 });
    }
    
    // Get workspace info using MongoDB _id
    const workspace = await workspaceCollection.findOne({ 
      _id: new ObjectId(workspaceId)
    }) as Workspace | null;
    
    if (!workspace) {
      return NextResponse.json({ 
        error: 'Workspace not found' 
      }, { status: 404 });
    }
    
    // Use provided price ID or default to Pro monthly
    const selectedPriceId = priceId || STRIPE_PRICE_IDS.PRO_MONTHLY;
    
    // Create checkout session using workspace MongoDB _id as reference
    const session = await createCheckoutSession(
      String(workspace._id),
      selectedPriceId,
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?payment=success&upgraded=true&openSlack=${workspace.workspaceId}`,
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?payment=cancelled`
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
