import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';
import { slackUserCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { SlackUser, STRIPE_PRICE_IDS } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user');
    
    if (!userId) {
      return NextResponse.json({ 
        error: 'Missing user parameter' 
      }, { status: 400 });
    }
    
    // Get user info for customer creation using MongoDB _id
    const user = await slackUserCollection.findOne({ 
      _id: new ObjectId(userId)
    }) as SlackUser | null;
    
    if (!user) {
      return NextResponse.json({ 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // Check if user already has Pro subscription
    if (user.subscription?.tier === 'PRO' && user.subscription?.status === 'active') {
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
    
    // Redirect to Stripe Checkout
    return NextResponse.redirect(session.url!);
    
  } catch (error) {
    console.error('Stripe checkout error:', error);
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
