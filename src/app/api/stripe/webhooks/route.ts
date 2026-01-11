import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { updateWorkspaceSubscription, resetWorkspaceMonthlyUsage, workspaceNeedsBillingReset } from '@/lib/subscription';
import { workspaceCollection, slackUserCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { Workspace, SlackUser } from '@/types';
import { trackEvent, trackError } from '@/lib/posthog';
import { EVENTS, ERROR_CATEGORIES } from '@/lib/analytics/events';
import { logError, logInfo } from '@/lib/logger';
import { sendProSubscriptionNotification, sendSubscriptionCancellationNotification } from '@/lib/slack';
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

    // Track webhook processing
    trackEvent('system', EVENTS.API_STRIPE_WEBHOOK_PROCESSED, {
      event_type: event.type,
      event_id: event.id,
      created: new Date(event.created * 1000).toISOString(),
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
      operation: 'webhook_processing',
      category: ERROR_CATEGORIES.STRIPE_WEBHOOK
    });
    return NextResponse.json({ 
      error: 'Webhook processing failed' 
    }, { status: 400 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('✅ Checkout completed for session:', session.id);
  
  // client_reference_id is the workspace MongoDB _id
  const workspaceId = session.client_reference_id || session.metadata?.workspaceId;
  if (!workspaceId) {
    console.error('No workspace ID found in checkout session');
    return;
  }
  
  const customerId = session.customer as string;
  
  // Update workspace with Stripe customer ID using MongoDB ObjectId
  await workspaceCollection.updateOne(
    { _id: new ObjectId(workspaceId) },
    {
      $set: {
        'subscription.stripeCustomerId': customerId,
        'subscription.updatedAt': new Date(),
      }
    }
  );
  
  console.log('💳 Updated workspace with Stripe customer ID:', customerId);
  
  // For workspaces with existing subscriptions, sync their subscription
  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['subscriptions']
    });
    
    const customerData = customer as unknown as Record<string, unknown>;
    const subscriptions = customerData.subscriptions as { data: Stripe.Subscription[] };
    
    if (subscriptions && subscriptions.data && subscriptions.data.length > 0) {
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
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  console.log('🔄 Subscription updated:', subscription.id, 'Status:', subscription.status);
  
  const customerId = subscription.customer as string;
  
  // Find workspace by Stripe customer ID
  const workspace = await workspaceCollection.findOne({
    'subscription.stripeCustomerId': customerId
  }) as Workspace | null;
  
  if (!workspace) {
    console.error('Workspace not found for customer ID:', customerId);
    return;
  }
  
  // Determine tier based on subscription status
  const tier = subscription.status === 'active' ? 'PRO' : 'FREE';
  const previousTier = workspace.subscription?.tier || 'FREE';
  
  // Update workspace subscription
  const subscriptionData = subscription as unknown as Record<string, unknown>;
  await updateWorkspaceSubscription(String(workspace._id), {
    tier: tier,
    status: subscription.status as 'active' | 'cancelled' | 'past_due',
    currentPeriodStart: new Date((subscriptionData.current_period_start as number) * 1000),
    currentPeriodEnd: new Date((subscriptionData.current_period_end as number) * 1000),
    stripeSubscriptionId: subscription.id,
    updatedAt: new Date(),
  });
  
  // Reset usage counters if subscription became active
  if (subscription.status === 'active') {
    await resetWorkspaceMonthlyUsage(String(workspace._id));
    console.log('🔄 Reset usage counters for new billing period');
    
    // Send Pro subscription welcome message only for new upgrades
    if (tier === 'PRO' && previousTier === 'FREE') {
      // Find admin user to send notification
      const adminUser = await slackUserCollection.findOne({
        slackId: workspace.adminSlackId,
        workspaceId: String(workspace._id)
      }) as SlackUser | null;
      
      if (adminUser && workspace.botToken) {
        await sendProSubscriptionNotification(adminUser, workspace.botToken);
        
        logInfo('Pro subscription notification sent', { 
          workspace_id: String(workspace._id),
          admin_id: workspace.adminSlackId,
          operation: 'pro_subscription_notification'
        });
      }
    }
  }
  
  console.log(`✅ Updated workspace ${workspace.name} to ${tier} tier`);
}

async function handleSubscriptionCancellation(subscription: Stripe.Subscription) {
  console.log('❌ Subscription cancelled:', subscription.id);
  
  const customerId = subscription.customer as string;
  
  // Find workspace by Stripe customer ID
  const workspace = await workspaceCollection.findOne({
    'subscription.stripeCustomerId': customerId
  }) as Workspace | null;
  
  if (!workspace) {
    console.error('Workspace not found for customer ID:', customerId);
    return;
  }
  
  // Downgrade workspace to FREE tier
  await updateWorkspaceSubscription(String(workspace._id), {
    tier: 'FREE',
    status: 'cancelled',
    updatedAt: new Date(),
  });
  
  // Find admin user to send notification
  const adminUser = await slackUserCollection.findOne({
    slackId: workspace.adminSlackId,
    workspaceId: String(workspace._id)
  }) as SlackUser | null;
  
  if (adminUser && workspace.botToken) {
    await sendSubscriptionCancellationNotification(adminUser, workspace.botToken);
    
    logInfo('Subscription cancellation notification sent', { 
      workspace_id: String(workspace._id),
      admin_id: workspace.adminSlackId,
      operation: 'subscription_cancellation_notification'
    });
  }
  
  console.log(`✅ Downgraded workspace ${workspace.name} to FREE tier`);
}

async function handleCustomerUpdated(customer: Stripe.Customer) {
  console.log('👤 Customer updated:', customer.id);
  
  // Find workspace by Stripe customer ID
  const workspace = await workspaceCollection.findOne({
    'subscription.stripeCustomerId': customer.id
  }) as Workspace | null;
  
  if (!workspace) {
    console.log('Workspace not found for customer ID:', customer.id);
    return;
  }
  
  // Sync active subscription
  try {
    const customerWithSubs = await stripe.customers.retrieve(customer.id, {
      expand: ['subscriptions']
    });
    
    const customerData = customerWithSubs as unknown as Record<string, unknown>;
    const subscriptions = customerData.subscriptions as { data: Stripe.Subscription[] };
    
    if (subscriptions && subscriptions.data && subscriptions.data.length > 0) {
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
  }
}

async function handlePaymentSuccess(invoice: Stripe.Invoice) {
  console.log('💰 Payment succeeded for invoice:', invoice.id);
  
  const invoiceData = invoice as unknown as Record<string, unknown>;
  const subscriptionId = invoiceData.subscription as string;
  if (!subscriptionId) {
    return; // Not a subscription payment
  }
  
  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = subscription.customer as string;
  
  // Find workspace by Stripe customer ID
  const workspace = await workspaceCollection.findOne({
    'subscription.stripeCustomerId': customerId
  }) as Workspace | null;
  
  if (!workspace) {
    console.error('Workspace not found for customer ID:', customerId);
    return;
  }
  
  // Update billing period and reset usage if it's a new period
  const needsReset = await workspaceNeedsBillingReset(String(workspace._id));
  
  const subscriptionData = subscription as unknown as Record<string, unknown>;
  await updateWorkspaceSubscription(String(workspace._id), {
    currentPeriodStart: new Date((subscriptionData.current_period_start as number) * 1000),
    currentPeriodEnd: new Date((subscriptionData.current_period_end as number) * 1000),
    status: 'active',
    updatedAt: new Date(),
  });
  
  if (needsReset) {
    await resetWorkspaceMonthlyUsage(String(workspace._id));
    console.log('🔄 Reset usage counters for new billing period');
  }
  
  console.log(`✅ Payment processed for workspace ${workspace.name}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  console.log('💸 Payment failed for invoice:', invoice.id);
  
  const invoiceData = invoice as unknown as Record<string, unknown>;
  const subscriptionId = invoiceData.subscription as string;
  if (!subscriptionId) {
    return; // Not a subscription payment
  }
  
  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = subscription.customer as string;
  
  // Find workspace by Stripe customer ID
  const workspace = await workspaceCollection.findOne({
    'subscription.stripeCustomerId': customerId
  }) as Workspace | null;
  
  if (!workspace) {
    console.error('Workspace not found for customer ID:', customerId);
    return;
  }
  
  // Update subscription status
  await updateWorkspaceSubscription(String(workspace._id), {
    status: 'past_due',
    updatedAt: new Date(),
  });
  
  console.log(`⚠️ Marked workspace ${workspace.name} subscription as past_due`);
}
