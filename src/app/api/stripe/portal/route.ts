import { NextRequest, NextResponse } from 'next/server';
import { createPortalSession } from '@/lib/stripe';
import { workspaceCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { trackEvent, trackError } from '@/lib/posthog';
import { EVENTS, ERROR_CATEGORIES } from '@/lib/analytics/events';
import { logError, logInfo } from '@/lib/logger';
import { Workspace } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace');
    
    if (!workspaceId) {
      return NextResponse.json({ 
        error: 'Missing workspace parameter' 
      }, { status: 400 });
    }
    
    // Get workspace with subscription info using MongoDB _id
    const workspace = await workspaceCollection.findOne({ 
      _id: new ObjectId(workspaceId)
    }) as Workspace | null;
    
    if (!workspace?.subscription?.stripeCustomerId) {
      return NextResponse.json({ 
        error: 'No active subscription found' 
      }, { status: 404 });
    }
    
    // Create portal session
    const session = await createPortalSession(
      workspace.subscription.stripeCustomerId,
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?tab=subscription`
    );
    
    // Track portal access
    trackEvent(workspace.adminSlackId, EVENTS.API_SUBSCRIPTION_PORTAL_ACCESSED, {
      workspace_id: String(workspace._id),
      workspace_name: workspace.name,
      customer_id: workspace.subscription.stripeCustomerId,
      subscription_tier: workspace.subscription.tier,
      subscription_status: workspace.subscription.status,
    });

    logInfo('Stripe portal session created (GET)', { 
      workspace_id: workspaceId,
      customer_id: workspace.subscription.stripeCustomerId,
      endpoint: '/api/stripe/portal'
    });

    // Redirect to Stripe Customer Portal
    return NextResponse.redirect(session.url);
    
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const workspaceId = new URL(request.url).searchParams.get('workspace');
    logError('Stripe portal error (GET)', errorObj, { 
      endpoint: '/api/stripe/portal',
      workspace_id: workspaceId
    });
    trackError(workspaceId || 'anonymous', errorObj, { 
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
    const { workspaceId } = body;
    
    if (!workspaceId) {
      return NextResponse.json({ 
        error: 'Missing workspaceId' 
      }, { status: 400 });
    }
    
    // Get workspace with subscription info using MongoDB _id
    const workspace = await workspaceCollection.findOne({ 
      _id: new ObjectId(workspaceId)
    }) as Workspace | null;
    
    if (!workspace?.subscription?.stripeCustomerId) {
      return NextResponse.json({ 
        error: 'No active subscription found' 
      }, { status: 404 });
    }
    
    // Create portal session
    const session = await createPortalSession(
      workspace.subscription.stripeCustomerId,
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?tab=subscription`
    );
    
    logInfo('Stripe portal session created (POST)', { 
      workspace_id: workspaceId,
      customer_id: workspace.subscription.stripeCustomerId,
      endpoint: '/api/stripe/portal'
    });

    return NextResponse.json({ 
      portalUrl: session.url 
    });
    
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    let workspaceId = 'anonymous';
    try {
      const body = await request.json();
      workspaceId = body.workspaceId || 'anonymous';
    } catch {
      // Body already consumed or invalid
    }
    logError('Stripe portal error (POST)', errorObj, { 
      endpoint: '/api/stripe/portal',
      workspace_id: workspaceId
    });
    trackError(workspaceId, errorObj, { 
      endpoint: '/api/stripe/portal',
      operation: 'create_portal_session_post'
    });
    return NextResponse.json({ 
      error: 'Failed to create portal session' 
    }, { status: 500 });
  }
}
