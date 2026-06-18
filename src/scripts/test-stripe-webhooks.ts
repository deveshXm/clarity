/**
 * Integration test for /api/stripe/webhooks against a running dev server.
 *
 * Creates a disposable workspace in Mongo, then POSTs signed synthetic Stripe
 * events (signed with STRIPE_WEBHOOK_SECRET, so the route's signature check
 * runs for real) and asserts the resulting subscription state in the DB.
 *
 * Covers both payload shapes: legacy (pre-2025-03-31 API versions, which the
 * registered webhook endpoints are pinned to) and current (period on
 * subscription items, subscription id on invoice.parent).
 *
 * Usage: dev server on :3000, then  npm run test:stripe:webhooks
 */
import Stripe from 'stripe';
import { MongoClient, ObjectId } from 'mongodb';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const WEBHOOK_URL = `${BASE_URL}/api/stripe/webhooks`;
const secret = process.env.STRIPE_WEBHOOK_SECRET!;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-12-15.clover' });

const mongo = new MongoClient(process.env.MONGODB_URI!);
const db = () => mongo.db(process.env.MONGODB_DB_NAME || 'clarity-dev');

const DAY = 24 * 60 * 60;
const nowSec = Math.floor(Date.now() / 1000);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
    if (cond) {
        passed++;
        console.log(`  ✅ ${name}`);
    } else {
        failed++;
        console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

async function postEvent(type: string, object: Record<string, unknown>): Promise<number> {
    const payload = JSON.stringify({
        id: `evt_test_${Math.random().toString(36).slice(2)}`,
        object: 'event',
        api_version: '2025-02-24.acacia',
        created: nowSec,
        type,
        data: { object },
    });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': signature },
        body: payload,
    });
    return res.status;
}

function subscriptionEvent(opts: {
    customerId: string;
    status?: string;
    periodStartSec: number;
    periodEndSec: number;
    shape: 'legacy' | 'items';
}) {
    const base: Record<string, unknown> = {
        id: 'sub_test_clarity_webhook',
        object: 'subscription',
        customer: opts.customerId,
        status: opts.status ?? 'active',
        items: {
            object: 'list',
            data: [
                {
                    id: 'si_test_clarity',
                    object: 'subscription_item',
                    ...(opts.shape === 'items'
                        ? { current_period_start: opts.periodStartSec, current_period_end: opts.periodEndSec }
                        : {}),
                },
            ],
        },
    };
    if (opts.shape === 'legacy') {
        base.current_period_start = opts.periodStartSec;
        base.current_period_end = opts.periodEndSec;
    }
    return base;
}

async function getWorkspace(id: ObjectId) {
    return db().collection('workspaces').findOne({ _id: id });
}

async function main() {
    await mongo.connect();

    // Disposable workspace, clearly labelled, cleaned up at the end.
    const workspaces = db().collection('workspaces');
    const inserted = await workspaces.insertOne({
        workspaceId: 'T_STRIPE_WEBHOOK_TEST',
        name: 'ZZ stripe-webhook-test (disposable)',
        adminSlackId: 'U_STRIPE_WEBHOOK_TEST',
        isActive: false,
        subscription: {
            tier: 'FREE',
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * DAY * 1000),
            monthlyUsage: { autoCoaching: 3, manualRephrase: 2 },
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    const wsId = inserted.insertedId;
    const customerId = `cus_test_${wsId.toHexString().slice(-8)}`;
    console.log(`\nDisposable workspace: ${wsId} (customer ${customerId})\n`);

    try {
        // 0. Signature check must reject unsigned garbage.
        const badRes = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
            body: '{}',
        });
        check('rejects invalid signature with 400', badRes.status === 400, `got ${badRes.status}`);

        // 1. checkout.session.completed stores the customer id.
        let status = await postEvent('checkout.session.completed', {
            id: 'cs_test_clarity',
            object: 'checkout.session',
            client_reference_id: wsId.toHexString(),
            customer: customerId,
        });
        let ws = await getWorkspace(wsId);
        check('checkout.completed → 200', status === 200, `got ${status}`);
        check(
            'stores stripeCustomerId',
            ws?.subscription?.stripeCustomerId === customerId,
            `got ${ws?.subscription?.stripeCustomerId}`
        );

        // 2. subscription.created (items shape) upgrades FREE → PRO, resets usage, sets valid dates.
        const p1Start = nowSec - DAY;
        const p1End = nowSec + 29 * DAY;
        status = await postEvent(
            'customer.subscription.created',
            subscriptionEvent({ customerId, periodStartSec: p1Start, periodEndSec: p1End, shape: 'items' })
        );
        ws = await getWorkspace(wsId);
        check('subscription.created (items shape) → 200', status === 200, `got ${status}`);
        check('tier upgraded to PRO', ws?.subscription?.tier === 'PRO', `got ${ws?.subscription?.tier}`);
        check(
            'usage reset on upgrade',
            ws?.subscription?.monthlyUsage?.autoCoaching === 0,
            `got ${ws?.subscription?.monthlyUsage?.autoCoaching}`
        );
        const storedEnd = ws?.subscription?.currentPeriodEnd ? new Date(ws.subscription.currentPeriodEnd) : null;
        check(
            'period end is a valid date matching payload',
            !!storedEnd && !isNaN(storedEnd.getTime()) && Math.abs(storedEnd.getTime() / 1000 - p1End) < 2,
            `got ${storedEnd}`
        );

        // 3. Same-period subscription.updated must NOT reset usage.
        await workspaces.updateOne(
            { _id: wsId },
            { $set: { 'subscription.monthlyUsage.autoCoaching': 7 } }
        );
        status = await postEvent(
            'customer.subscription.updated',
            subscriptionEvent({ customerId, periodStartSec: p1Start, periodEndSec: p1End, shape: 'items' })
        );
        ws = await getWorkspace(wsId);
        check('same-period update → 200', status === 200, `got ${status}`);
        check(
            'usage NOT reset on same-period update',
            ws?.subscription?.monthlyUsage?.autoCoaching === 7,
            `got ${ws?.subscription?.monthlyUsage?.autoCoaching}`
        );

        // 4. Advanced-period subscription.updated (legacy shape) resets usage.
        const p2Start = p1End;
        const p2End = p2Start + 30 * DAY;
        status = await postEvent(
            'customer.subscription.updated',
            subscriptionEvent({ customerId, periodStartSec: p2Start, periodEndSec: p2End, shape: 'legacy' })
        );
        ws = await getWorkspace(wsId);
        check('new-period update (legacy shape) → 200', status === 200, `got ${status}`);
        check(
            'usage reset on new billing period',
            ws?.subscription?.monthlyUsage?.autoCoaching === 0,
            `got ${ws?.subscription?.monthlyUsage?.autoCoaching}`
        );
        const storedEnd2 = ws?.subscription?.currentPeriodEnd ? new Date(ws.subscription.currentPeriodEnd) : null;
        check(
            'legacy-shape period end stored correctly',
            !!storedEnd2 && Math.abs(storedEnd2.getTime() / 1000 - p2End) < 2,
            `got ${storedEnd2}`
        );

        // 5. invoice.payment_succeeded with a REAL trialing subscription (so the
        // handler's stripe.subscriptions.retrieve() works) — both id shapes.
        console.log('\nCreating real test-mode customer + trialing subscription…');
        const realCustomer = await stripe.customers.create({
            name: 'ZZ clarity webhook test (disposable)',
            metadata: { purpose: 'clarity-webhook-integration-test' },
        });
        const realSub = await stripe.subscriptions.create({
            customer: realCustomer.id,
            items: [{ price: process.env.STRIPE_PRO_MONTHLY_PRICE_ID! }],
            trial_period_days: 1,
        });
        try {
            await workspaces.updateOne(
                { _id: wsId },
                {
                    $set: {
                        'subscription.stripeCustomerId': realCustomer.id,
                        'subscription.monthlyUsage.autoCoaching': 9,
                        // Force the "needs billing reset" path: stored period already over.
                        'subscription.currentPeriodEnd': new Date(Date.now() - 1000),
                    },
                }
            );

            // New shape: subscription id under invoice.parent.subscription_details.
            status = await postEvent('invoice.payment_succeeded', {
                id: 'in_test_clarity_parent',
                object: 'invoice',
                customer: realCustomer.id,
                parent: {
                    type: 'subscription_details',
                    subscription_details: { subscription: realSub.id, metadata: null },
                    quote_details: null,
                },
            });
            ws = await getWorkspace(wsId);
            check('invoice.payment_succeeded (parent shape) → 200', status === 200, `got ${status}`);
            check(
                'renewal resets usage when period lapsed',
                ws?.subscription?.monthlyUsage?.autoCoaching === 0,
                `got ${ws?.subscription?.monthlyUsage?.autoCoaching}`
            );
            const renewalEnd = ws?.subscription?.currentPeriodEnd
                ? new Date(ws.subscription.currentPeriodEnd)
                : null;
            check(
                'renewal stores valid period dates from retrieved subscription',
                !!renewalEnd && !isNaN(renewalEnd.getTime()) && renewalEnd.getTime() > Date.now(),
                `got ${renewalEnd}`
            );

            // Legacy shape: invoice.subscription at top level.
            status = await postEvent('invoice.payment_succeeded', {
                id: 'in_test_clarity_legacy',
                object: 'invoice',
                customer: realCustomer.id,
                subscription: realSub.id,
            });
            check('invoice.payment_succeeded (legacy shape) → 200', status === 200, `got ${status}`);

            // 6. invoice.payment_failed marks past_due.
            status = await postEvent('invoice.payment_failed', {
                id: 'in_test_clarity_failed',
                object: 'invoice',
                customer: realCustomer.id,
                parent: {
                    type: 'subscription_details',
                    subscription_details: { subscription: realSub.id, metadata: null },
                    quote_details: null,
                },
            });
            ws = await getWorkspace(wsId);
            check('invoice.payment_failed → 200', status === 200, `got ${status}`);
            check('status marked past_due', ws?.subscription?.status === 'past_due', `got ${ws?.subscription?.status}`);
        } finally {
            await stripe.subscriptions.cancel(realSub.id).catch(() => {});
            await stripe.customers.del(realCustomer.id).catch(() => {});
            console.log('Cleaned up real test customer + subscription.');
        }

        // 7. subscription.deleted downgrades to FREE.
        status = await postEvent('customer.subscription.deleted', {
            id: 'sub_test_clarity_webhook',
            object: 'subscription',
            customer: realCustomer.id,
            status: 'canceled',
        });
        ws = await getWorkspace(wsId);
        check('subscription.deleted → 200', status === 200, `got ${status}`);
        check('tier downgraded to FREE', ws?.subscription?.tier === 'FREE', `got ${ws?.subscription?.tier}`);
        check('status cancelled', ws?.subscription?.status === 'cancelled', `got ${ws?.subscription?.status}`);
    } finally {
        await workspaces.deleteOne({ _id: wsId });
        console.log('\nDeleted disposable workspace.');
        await mongo.close();
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
