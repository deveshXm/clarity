import Stripe from 'stripe';
import { STRIPE_PRICE_IDS } from '@/types';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-12-15.clover',
  typescript: true,
});

// Re-export for convenience
export { STRIPE_PRICE_IDS };

// Helper function to create checkout session
export async function createCheckoutSession(
  userId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    client_reference_id: userId, // Store user ID for webhook processing
    metadata: {
      userId: userId,
    },
    subscription_data: {
      metadata: {
        userId: userId,
      },
    },
  };

  // Stripe requires success_url - use provided URL or default to help page
  sessionConfig.success_url = successUrl || `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?payment=success`;

  // Always set cancel_url for back button functionality
  sessionConfig.cancel_url = cancelUrl || `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?payment=cancelled`;

  return await stripe.checkout.sessions.create(sessionConfig);
}

// Helper function to create customer portal session
export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  return await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

// Helper function to get customer by user ID
export async function findCustomerByUserId(userId: string): Promise<Stripe.Customer | null> {
  const customers = await stripe.customers.search({
    query: `metadata['userId']:'${userId}'`,
    limit: 1,
  });
  
  return customers.data[0] || null;
}

// Helper function to create or get customer
export async function getOrCreateCustomer(
  userId: string,
  email?: string,
  name?: string
): Promise<Stripe.Customer> {
  // Try to find existing customer
  const existingCustomer = await findCustomerByUserId(userId);
  if (existingCustomer) {
    return existingCustomer;
  }
  
  // Create new customer
  return await stripe.customers.create({
    email,
    name,
    metadata: {
      userId: userId,
    },
  });
}
