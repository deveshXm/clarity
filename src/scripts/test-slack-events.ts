/**
 * E2E QA of the auto-coaching pipeline via signed Slack events.
 *
 * POSTs HMAC-signed `message` events to /api/slack/events on a running dev
 * server, exactly as Slack would, and asserts the resulting behaviour:
 * classifier verdicts, usage increments, quota notifications (one per billing
 * period), and DB side effects. Ephemerals land in the real Test workspace
 * channel, so the run doubles as visible dogfooding evidence.
 *
 * Restores all mutated workspace/user state at the end.
 *
 * Usage: dev server on :3000, then  npm run test:slack:events
 *   QUOTA_MODE=1  — additionally test quota blocking (requires the dev server
 *                   to run with DISABLE_QUOTA=false)
 */
import crypto from 'crypto';
import { MongoClient, ObjectId } from 'mongodb';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;
const TEAM_ID = 'T08HU2MKRK2'; // Test workspace
const CHANNEL = 'C08HU2N1Y7J'; // #all-test
const USER = 'U08KR2LFMC3'; // Dhruv
const QUOTA_MODE = process.env.QUOTA_MODE === '1';

const mongo = new MongoClient(process.env.MONGODB_URI!);
const db = () => mongo.db(process.env.MONGODB_DB_NAME || 'clarity-dev');

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

async function postMessageEvent(text: string): Promise<number> {
    const ts = (Date.now() / 1000).toFixed(6);
    const body = JSON.stringify({
        type: 'event_callback',
        team_id: TEAM_ID,
        event: {
            type: 'message',
            channel_type: 'channel',
            user: USER,
            text,
            ts,
            channel: CHANNEL,
            event_ts: ts,
        },
    });
    const reqTs = Math.floor(Date.now() / 1000).toString();
    const sig = 'v0=' + crypto.createHmac('sha256', SIGNING_SECRET).update(`v0:${reqTs}:${body}`).digest('hex');
    const res = await fetch(`${BASE_URL}/api/slack/events`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-slack-signature': sig,
            'x-slack-request-timestamp': reqTs,
        },
        body,
    });
    return res.status;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getState() {
    const ws = await db().collection('workspaces').findOne({ workspaceId: TEAM_ID });
    const user = await db().collection('slackUsers').findOne({ slackId: USER, workspaceId: String(ws!._id) });
    return { ws: ws!, user: user! };
}

async function main() {
    await mongo.connect();
    const before = await getState();
    const wsId = before.ws._id as ObjectId;
    const savedUsage = before.ws.subscription.monthlyUsage;
    const savedNotifiedAt = before.user.autoCoachingQuotaNotifiedAt ?? null;
    console.log(`\nTest workspace usage before: ${JSON.stringify(savedUsage)}; quota mode: ${QUOTA_MODE}\n`);

    try {
        if (!QUOTA_MODE) {
            // 1. Unsigned request is rejected.
            const badRes = await fetch(`${BASE_URL}/api/slack/events`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-slack-signature': 'v0=deadbeef',
                    'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
                },
                body: '{}',
            });
            check('rejects forged signature with 401', badRes.status === 401, `got ${badRes.status}`);

            // 2. Flaggable (disrespectful) message → coaching ephemeral + usage increment.
            await db().collection('workspaces').updateOne(
                { _id: wsId },
                { $set: { 'subscription.monthlyUsage.autoCoaching': 0 } }
            );
            let status = await postMessageEvent(
                'Did you even read my last message? The answer is literally right there if you bothered to look.'
            );
            check('flaggable message event accepted (200)', status === 200, `got ${status}`);
            await wait(15000); // analysis runs in `after()` — give the model time
            let st = await getState();
            check(
                'usage incremented after coaching',
                st.ws.subscription.monthlyUsage.autoCoaching === 1,
                `got ${st.ws.subscription.monthlyUsage.autoCoaching}`
            );

            // 3. Clean message → no coaching, no increment.
            status = await postMessageEvent(
                'Thanks for the update! The new dashboard looks great — let me know if you need help with the rollout on Thursday.'
            );
            check('clean message event accepted (200)', status === 200, `got ${status}`);
            await wait(15000);
            st = await getState();
            check(
                'clean message does not increment usage',
                st.ws.subscription.monthlyUsage.autoCoaching === 1,
                `got ${st.ws.subscription.monthlyUsage.autoCoaching}`
            );

            // 4. Harmful message → warning (no rephrase), and NOT counted against quota.
            status = await postMessageEvent(
                "You're a pathetic excuse for an engineer. Everyone here thinks you're worthless and we'd all be better off if you just quit."
            );
            check('harmful message event accepted (200)', status === 200, `got ${status}`);
            await wait(15000);
            st = await getState();
            check(
                'harmful warning does not consume quota',
                st.ws.subscription.monthlyUsage.autoCoaching === 1,
                `got ${st.ws.subscription.monthlyUsage.autoCoaching}`
            );
        } else {
            // QUOTA MODE (dev server must run DISABLE_QUOTA=false)
            // 5. At the FREE limit, a flagged message triggers ONE quota notification.
            await db().collection('workspaces').updateOne(
                { _id: wsId },
                { $set: { 'subscription.monthlyUsage.autoCoaching': 999 } }
            );
            await db().collection('slackUsers').updateOne(
                { slackId: USER, workspaceId: String(wsId) },
                { $unset: { autoCoachingQuotaNotifiedAt: '' } }
            );
            let status = await postMessageEvent(
                'This is a terrible plan and frankly your whole approach has been useless from day one.'
            );
            check('over-quota flagged message accepted (200)', status === 200, `got ${status}`);
            await wait(15000);
            let st = await getState();
            check(
                'quota notification timestamp set',
                !!st.user.autoCoachingQuotaNotifiedAt,
                'autoCoachingQuotaNotifiedAt not set'
            );
            check(
                'usage not incremented when blocked',
                st.ws.subscription.monthlyUsage.autoCoaching === 999,
                `got ${st.ws.subscription.monthlyUsage.autoCoaching}`
            );

            // 6. Second over-quota flagged message must NOT re-notify (once per period).
            const firstNotifiedAt = st.user.autoCoachingQuotaNotifiedAt;
            status = await postMessageEvent(
                "Honestly this work is sloppy and I'm tired of fixing it — do it again and don't waste my time."
            );
            check('second over-quota message accepted (200)', status === 200, `got ${status}`);
            await wait(15000);
            st = await getState();
            check(
                'no duplicate quota notification',
                String(st.user.autoCoachingQuotaNotifiedAt) === String(firstNotifiedAt),
                `timestamp changed: ${st.user.autoCoachingQuotaNotifiedAt}`
            );
        }
    } finally {
        // Restore original state.
        await db().collection('workspaces').updateOne(
            { _id: wsId },
            { $set: { 'subscription.monthlyUsage': savedUsage } }
        );
        if (savedNotifiedAt) {
            await db().collection('slackUsers').updateOne(
                { slackId: USER, workspaceId: String(wsId) },
                { $set: { autoCoachingQuotaNotifiedAt: savedNotifiedAt } }
            );
        } else {
            await db().collection('slackUsers').updateOne(
                { slackId: USER, workspaceId: String(wsId) },
                { $unset: { autoCoachingQuotaNotifiedAt: '' } }
            );
        }
        console.log('\nRestored workspace usage + user notification state.');
        await mongo.close();
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
