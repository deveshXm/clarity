import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { updateSubscription, resetMonthlyUsage, needsBillingReset } from '@/lib/subscription';
import { slackUserCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { SlackUser } from '@/types';
import { trackError } from '@/lib/posthog';
import { logError, logInfo } from '@/lib/logger';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  
  if (!signature) {
    console.error('Missing Stripe signature');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }
  
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Missing STRIPE_WEBHOOK_SECRET environment variable');
    return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
  }
  
  try {
    // Verify webhook signature
    const event = stripe.webhooks.constructEvent(
      body, 
      signature, 
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    console.log('🎣 Received Stripe webhook:', event.type);
    
    logInfo('Stripe webhook received', { 
      event_type: event.type,
      event_id: event.id,
      endpoint: '/api/stripe/webhooks'
    });

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
        
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.resumed':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionCancellation(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.updated':
        await handleCustomerUpdated(event.data.object as Stripe.Customer);
        break;
        
      case 'invoice.payment_succeeded':
        await handlePaymentSuccess(event.data.object as Stripe.Invoice);
        break;
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
        
      default:
        console.log('🤷 Unhandled webhook type:', event.type);
    }
    
    return NextResponse.json({ received: true });
    
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logError('Stripe webhook error', errorObj, { 
      endpoint: '/api/stripe/webhooks'
    });
    trackError('anonymous', errorObj, { 
      endpoint: '/api/stripe/webhooks',
      operation: 'webhook_processing'
    });
    return NextResponse.json({ 
      error: 'Webhook processing failed' 
    }, { status: 400 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('✅ Checkout completed for session:', session.id);
  
  const userId = session.client_reference_id || session.metadata?.userId;
  if (!userId) {
    console.error('No user ID found in checkout session');
    return;
  }
  
  const customerId = session.customer as string;
  
  // Update user with Stripe customer ID using MongoDB ObjectId
  await slackUserCollection.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        'subscription.stripeCustomerId': customerId,
        'subscription.updatedAt': new Date(),
      }
    }
  );
  
  console.log('💳 Updated user with Stripe customer ID:', customerId);
  
  // For users with existing subscriptions, we need to fetch and sync their subscription
  // since they might have been redirected to customer portal and no subscription webhook was sent
  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['subscriptions']
    });
    
    const customerData = customer as unknown as Record<string, unknown>;
    const subscriptions = customerData.subscriptions as { data: Stripe.Subscription[] };
    
    if (subscriptions && subscriptions.data && subscriptions.data.length > 0) {
      // Find active subscription
      const activeSubscription = subscriptions.data.find(sub => sub.status === 'active');
      
      if (activeSubscription) {
        console.log('🔄 Found existing active subscription, syncing:', activeSubscription.id);
        await handleSubscriptionUpdate(activeSubscription);
      }
    }
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logError('Error syncing existing subscription', errorObj, { 
      customer_id: customerId,
      operation: 'sync_existing_subscription'
    });
    trackError('anonymous', errorObj, { 
      operation: 'sync_existing_subscription',
      context: 'checkout_session_completed'
    });
    // Don't fail the entire webhook - this is a best-effort sync
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  console.log('🔄 Subscription updated:', subscription.id, 'Status:', subscription.status);
  
  const customerId = subscription.customer as string;
  
  // Find user by Stripe customer ID
  const user = await slackUserCollection.findOne({
    'subscription.stripeCustomerId': customerId
  }) as SlackUser | null;
  
  if (!user) {
    console.error('User not found for customer ID:', customerId);
    return;
  }
  
  // Determine tier based on subscription status
  const tier = subscription.status === 'active' ? 'PRO' : 'FREE';
  
  // Update user subscription
  // Note: current_period_start and current_period_end exist on the subscription object at runtime
  // but may not be in TypeScript definitions. We access them safely.
  const subscriptionData = subscription as unknown as Record<string, unknown>;
  await updateSubscription(user.slackId, {
    tier: tier,
    status: subscription.status as 'active' | 'cancelled' | 'past_due',
    currentPeriodStart: new Date((subscriptionData.current_period_start as number) * 1000),
    currentPeriodEnd: new Date((subscriptionData.current_period_end as number) * 1000),
    stripeSubscriptionId: subscription.id,
    updatedAt: new Date(),
  });
  
  // Reset usage counters if subscription became active
  if (subscription.status === 'active') {
    await resetMonthlyUsage(user.slackId);
    console.log('🔄 Reset usage counters for new billing period');
  }
  
  console.log(`✅ Updated user ${user.slackId} to ${tier} tier`);
}

async function handleSubscriptionCancellation(subscription: Stripe.Subscription) {
  console.log('❌ Subscription cancelled:', subscription.id);
  
  const customerId = subscription.customer as string;
  
  // Find user by Stripe customer ID
  const user = await slackUserCollection.findOne({
    'subscription.stripeCustomerId': customerId
  }) as SlackUser | null;
  
  if (!user) {
    console.error('User not found for customer ID:', customerId);
    return;
  }
  
  // Downgrade user to FREE tier
  await updateSubscription(user.slackId, {
    tier: 'FREE',
    status: 'cancelled',
    updatedAt: new Date(),
  });
  
  console.log(`✅ Downgraded user ${user.slackId} to FREE tier`);
}

async function handleCustomerUpdated(customer: Stripe.Customer) {
  console.log('👤 Customer updated:', customer.id);
  
  // Find user by Stripe customer ID
  const user = await slackUserCollection.findOne({
    'subscription.stripeCustomerId': customer.id
  }) as SlackUser | null;
  
  if (!user) {
    console.log('User not found for customer ID:', customer.id);
    return;
  }
  
  // This event might be triggered when user accesses customer portal
  // We should check if they have an active subscription and sync it
  try {
    const customerWithSubs = await stripe.customers.retrieve(customer.id, {
      expand: ['subscriptions']
    });
    
    const customerData = customerWithSubs as unknown as Record<string, unknown>;
    const subscriptions = customerData.subscriptions as { data: Stripe.Subscription[] };
    
    if (subscriptions && subscriptions.data && subscriptions.data.length > 0) {
      // Find active subscription
      const activeSubscription = subscriptions.data.find(sub => sub.status === 'active');
      
      if (activeSubscription) {
        console.log('🔄 Customer updated - syncing active subscription:', activeSubscription.id);
        await handleSubscriptionUpdate(activeSubscription);
      }
    }
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logError('Error syncing subscription after customer update', errorObj, { 
      customer_id: customer.id,
      operation: 'sync_subscription_customer_update'
    });
    trackError('anonymous', errorObj, { 
      operation: 'sync_subscription_customer_update',
      context: 'customer_updated'
    });
  }
}

async function handlePaymentSuccess(invoice: Stripe.Invoice) {
  console.log('💰 Payment succeeded for invoice:', invoice.id);
  
  // Access subscription property safely - it exists at runtime
  const invoiceData = invoice as unknown as Record<string, unknown>;
  const subscriptionId = invoiceData.subscription as string;
  if (!subscriptionId) {
    return; // Not a subscription payment
  }
  
  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = subscription.customer as string;
  
  // Find user by Stripe customer ID
  const user = await slackUserCollection.findOne({
    'subscription.stripeCustomerId': customerId
  }) as SlackUser | null;
  
  if (!user) {
    console.error('User not found for customer ID:', customerId);
    return;
  }
  
  // Update billing period and reset usage if it's a new period
  const needsReset = await needsBillingReset(user.slackId);
  
  const subscriptionData = subscription as unknown as Record<string, unknown>;
  await updateSubscription(user.slackId, {
    currentPeriodStart: new Date((subscriptionData.current_period_start as number) * 1000),
    currentPeriodEnd: new Date((subscriptionData.current_period_end as number) * 1000),
    status: 'active',
    updatedAt: new Date(),
  });
  
  if (needsReset) {
    await resetMonthlyUsage(user.slackId);
    console.log('🔄 Reset usage counters for new billing period');
  }
  
  console.log(`✅ Payment processed for user ${user.slackId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  console.log('💸 Payment failed for invoice:', invoice.id);
  
  // Access subscription property safely - it exists at runtime
  const invoiceData = invoice as unknown as Record<string, unknown>;
  const subscriptionId = invoiceData.subscription as string;
  if (!subscriptionId) {
    return; // Not a subscription payment
  }
  
  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = subscription.customer as string;
  
  // Find user by Stripe customer ID
  const user = await slackUserCollection.findOne({
    'subscription.stripeCustomerId': customerId
  }) as SlackUser | null;
  
  if (!user) {
    console.error('User not found for customer ID:', customerId);
    return;
  }
  
  // Update subscription status
  await updateSubscription(user.slackId, {
    status: 'past_due',
    updatedAt: new Date(),
  });
  
  console.log(`⚠️ Marked user ${user.slackId} subscription as past_due`);
}
