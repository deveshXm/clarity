import { NextRequest, NextResponse } from 'next/server';
import { createPortalSession } from '@/lib/stripe';
import { slackUserCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
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
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/app/help?tab=subscription`
    );
    
    // Redirect to Stripe Customer Portal
    return NextResponse.redirect(session.url);
    
  } catch (error) {
    console.error('Stripe portal error:', error);
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
      `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/app/help?tab=subscription`
    );
    
    return NextResponse.json({ 
      portalUrl: session.url 
    });
    
  } catch (error) {
    console.error('Stripe portal error:', error);
    return NextResponse.json({ 
      error: 'Failed to create portal session' 
    }, { status: 500 });
  }
}
