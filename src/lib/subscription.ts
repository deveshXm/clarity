import { workspaceCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { 
  Workspace,
  Subscription, 
  SubscriptionFeature, 
  SubscriptionCheckResult,
  getTierConfig, 
  isRateLimitedFeature, 
  isPaidFeature 
} from '@/types';

/**
 * Comprehensive workspace subscription validation
 * This is the main method to use in command handlers
 */
export async function validateWorkspaceAccess(
  workspace: Workspace, 
  feature: SubscriptionFeature
): Promise<SubscriptionCheckResult> {
  'use server';
  try {
    // Initialize subscription if missing
    if (!workspace.subscription) {
      const subscription = await initializeWorkspaceSubscription(String(workspace._id));
      workspace.subscription = subscription;
    }
    
    const subscription = workspace.subscription!;
    const tierConfig = getTierConfig(subscription.tier);
    
    // Check if it's a paid-only feature
    if (isPaidFeature(feature)) {
      if (!tierConfig.features[feature]) {
        return {
          allowed: false,
          reason: `Feature requires Pro subscription`,
          upgradeRequired: true,
          workspace
        };
      }
    }
    
    // Check rate limits for usage-based features
    if (isRateLimitedFeature(feature)) {
      const limit = tierConfig.monthlyLimits[feature];
      const currentUsage = subscription.monthlyUsage[feature] || 0;
      if (currentUsage >= limit) {
        return {
          allowed: false,
          reason: `Monthly limit reached (${currentUsage}/${limit})`,
          upgradeRequired: subscription.tier === 'FREE', // Only FREE workspaces need upgrade
          workspace,
          remainingUsage: 0,
          resetDate: subscription.currentPeriodEnd
        };
      }
      
      return {
        allowed: true,
        workspace,
        remainingUsage: limit - currentUsage,
        resetDate: subscription.currentPeriodEnd
      };
    }
    
    return { 
      allowed: true, 
      workspace,
      remainingUsage: -1 // Unlimited
    };
    
  } catch (error) {
    console.error('Subscription validation error:', error);
    return { 
      allowed: false, 
      reason: 'Subscription validation failed' 
    };
  }
}

/**
 * Initialize subscription for workspace (migration helper)
 */
export async function initializeWorkspaceSubscription(workspaceId: string): Promise<Subscription> {
  'use server';
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  
  const subscription: Subscription = {
    tier: 'FREE',
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: nextMonth,
    monthlyUsage: {
      autoCoaching: 0,
      manualRephrase: 0,
      personalFeedback: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
  
  // Update workspace with subscription
  await workspaceCollection.updateOne(
    { _id: new ObjectId(workspaceId) },
    {
      $set: {
        subscription,
        updatedAt: now
      }
    }
  );
  
  return subscription;
}

/**
 * Increment workspace usage counter after successful feature use
 */
export async function incrementWorkspaceUsage(workspace: Workspace, feature: SubscriptionFeature): Promise<void> {
  'use server';
  if (!isRateLimitedFeature(feature)) {
    return; // No tracking needed for unlimited features
  }
  
  await workspaceCollection.updateOne(
    { _id: new ObjectId(String(workspace._id)) },
    { 
      $inc: { [`subscription.monthlyUsage.${feature}`]: 1 },
      $set: { 'subscription.updatedAt': new Date() }
    }
  );
}

/**
 * Reset workspace monthly usage (called by billing cycle webhook)
 */
export async function resetWorkspaceMonthlyUsage(workspaceId: string): Promise<void> {
  'use server';
  await workspaceCollection.updateOne(
    { _id: new ObjectId(workspaceId) },
    {
      $set: {
        'subscription.monthlyUsage': {
          autoCoaching: 0,
          manualRephrase: 0,
          personalFeedback: 0,
        },
        'subscription.updatedAt': new Date()
      }
    }
  );
}

/**
 * Update workspace subscription (called by Stripe webhooks)
 */
export async function updateWorkspaceSubscription(
  workspaceId: string,
  updates: Partial<Subscription>
): Promise<void> {
  'use server';
  const updateData: Record<string, unknown> = {};
  
  Object.entries(updates).forEach(([key, value]) => {
    updateData[`subscription.${key}`] = value;
  });
  
  updateData['subscription.updatedAt'] = new Date();
  
  await workspaceCollection.updateOne(
    { _id: new ObjectId(workspaceId) },
    { $set: updateData }
  );
}

/**
 * Get workspace's current subscription status and usage
 */
export async function getWorkspaceSubscriptionStatus(workspaceId: string): Promise<{
  subscription: Subscription | null;
  usage: Record<string, { current: number; limit: number; remaining: number }>;
} | null> {
  'use server';
  const workspace = await workspaceCollection.findOne({ 
    _id: new ObjectId(workspaceId), 
    isActive: true 
  }) as Workspace | null;
  
  if (!workspace?.subscription) {
    return null;
  }
  
  const tierConfig = getTierConfig(workspace.subscription.tier);
  const usage: Record<string, { current: number; limit: number; remaining: number }> = {};
  
  // Calculate usage stats for rate-limited features
  Object.entries(tierConfig.monthlyLimits).forEach(([feature, limit]) => {
    const current = workspace.subscription!.monthlyUsage[feature as keyof typeof workspace.subscription.monthlyUsage] || 0;
    usage[feature] = {
      current,
      limit: limit,
      remaining: Math.max(0, limit - current)
    };
  });
  
  return {
    subscription: workspace.subscription,
    usage
  };
}

/**
 * Check if workspace needs billing period reset (helper for webhooks)
 */
export async function workspaceNeedsBillingReset(workspaceId: string): Promise<boolean> {
  'use server';
  const workspace = await workspaceCollection.findOne({ 
    _id: new ObjectId(workspaceId) 
  }) as Workspace | null;
  
  if (!workspace?.subscription) {
    return false;
  }
  
  const now = new Date();
  return now >= workspace.subscription.currentPeriodEnd;
}

// Helper functions for generating user-friendly messages

export function generateUpgradeMessage(feature: SubscriptionFeature, reason: string, workspaceId?: string): object {
  const featureNames: Record<SubscriptionFeature, string> = {
    autoCoaching: 'Auto Coaching',
    manualRephrase: 'Manual Rephrase',
    personalFeedback: 'Personal Feedback',
    reports: 'Reports',
    advancedReportAnalytics: 'Advanced Report Analytics'
  };
  
  const featureName = featureNames[feature] || feature;
  const checkoutUrl = workspaceId 
    ? `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/api/stripe/checkout?workspace=${encodeURIComponent(workspaceId)}`
    : `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?tab=pricing`;
  
  const proConfig = getTierConfig('PRO');
  
  return {
    text: `🚀 *Upgrade to Pro Required*`,
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚀 *Upgrade to Pro Required*\n\n${featureName} requires a Pro subscription.\n\n_${reason}_`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: `Upgrade to Pro - $${proConfig.price}/month`,
              emoji: true
            },
            style: 'primary',
            url: checkoutUrl,
            action_id: 'upgrade_to_pro'
          }
        ]
      }
    ]
  };
}

export function generateLimitReachedMessage(
  feature: SubscriptionFeature, 
  currentUsage: number, 
  limit: number, 
  resetDate: Date,
  workspaceId?: string
): object {
  const featureNames: Record<SubscriptionFeature, string> = {
    autoCoaching: 'Auto Coaching',
    manualRephrase: 'Manual Rephrase', 
    personalFeedback: 'Personal Feedback',
    reports: 'Reports',
    advancedReportAnalytics: 'Advanced Report Analytics'
  };
  
  const featureName = featureNames[feature] || feature;
  const resetDateStr = resetDate.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
  
  const checkoutUrl = workspaceId 
    ? `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/api/stripe/checkout?workspace=${encodeURIComponent(workspaceId)}`
    : `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/docs?tab=pricing`;
  
  return {
    text: `📊 *Monthly Limit Reached*`,
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📊 *Monthly Limit Reached*\n\nYour workspace has used all ${limit} ${featureName} requests this month.\n\n*Usage resets:* ${resetDateStr}`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: `Upgrade to Pro - $${(() => {
                const proConfig = getTierConfig('PRO');
                return proConfig.price;
              })()}/month`,
              emoji: true
            },
            style: 'primary',
            url: checkoutUrl,
            action_id: 'upgrade_unlimited'
          }
        ]
      }
    ]
  };
}

export function generateProLimitReachedMessage(
  feature: SubscriptionFeature, 
  currentUsage: number, 
  limit: number, 
  resetDate: Date
): object {
  const featureNames: Record<SubscriptionFeature, string> = {
    autoCoaching: 'Auto Coaching',
    manualRephrase: 'Manual Rephrase', 
    personalFeedback: 'Personal Feedback',
    reports: 'Reports',
    advancedReportAnalytics: 'Advanced Report Analytics'
  };
  
  const featureName = featureNames[feature] || feature;
  const resetDateStr = resetDate.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
  
  const contactUrl = `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/contact-us`;
  
  return {
    text: `📊 *Monthly Limit Reached*`,
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📊 *Pro Monthly Limit Reached*\n\nYour workspace has used all ${limit} ${featureName} requests this month.\n\n*Usage resets:* ${resetDateStr}\n\nNeed more? We offer custom pricing for high-volume usage.`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Contact Us for Custom Pricing',
              emoji: true
            },
            style: 'primary',
            url: contactUrl,
            action_id: 'contact_custom_pricing'
          }
        ]
      }
    ]
  };
}
