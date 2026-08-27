/**
 * Integration check for /api/slack/interactive.
 *
 * Covers the button paths added when the Replace flow was fixed. These are
 * awkward to verify by hand in Slack — the Replace-without-a-user-token case
 * needs a second Slack account that has never authorized Clarity, and the
 * link-only button case only shows up as a message mysteriously being replaced
 * by error text. Both are cheap to assert over HTTP.
 *
 * The trick that makes this possible without Slack: the route reports back by
 * POSTing to the `response_url` carried in the interaction payload. We stand up
 * a throwaway local server, put ITS url in the payload, and read what the route
 * tried to say to the user.
 *
 * What's covered:
 *   1. Forged signatures are rejected.
 *   2. Replace by a user with no stored userToken → connect-and-copy fallback,
 *      not a silent no-op. (This is the path most real users hit first.)
 *   3. That fallback contains the rephrase, so the message isn't lost.
 *   4. Link-only buttons get a bare 200 and post nothing — returning a body
 *      would make Slack overwrite the message the button sits in.
 *   5. Unknown action ids still fall through as before (guards the dispatch
 *      chain edit).
 *   6. With MONGODB_URI set, the same fallback for a user who EXISTS but has no
 *      userToken — the discovery-mode teammate.
 *
 * Usage: dev server on :3000, then  npm run test:slack:interactive
 */
import crypto from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import { MongoClient, ObjectId } from 'mongodb';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;
const TEAM_ID = process.env.TEST_TEAM_ID || 'T08HU2MKRK2'; // Test workspace
const CHANNEL = process.env.TEST_CHANNEL_ID || 'C08HU2N1Y7J';
const REPHRASE = 'Could you take another look at the tests before this merges?';

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

// --- response_url sink -----------------------------------------------------

interface Sink {
    url: string;
    received: Array<Record<string, unknown>>;
    close: () => Promise<void>;
}

async function startSink(): Promise<Sink> {
    const received: Array<Record<string, unknown>> = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => (body += c));
        req.on('end', () => {
            try {
                received.push(JSON.parse(body));
            } catch {
                received.push({ _unparsed: body });
            }
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{"ok":true}');
        });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}/response`,
        received,
        close: () => new Promise<void>(resolve => server.close(() => resolve())),
    };
}

// --- signed POST helper ----------------------------------------------------

async function postInteraction(payload: unknown): Promise<{ status: number; text: string }> {
    // Slack sends interactions form-encoded, as `payload=<json>`.
    const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
    const reqTs = Math.floor(Date.now() / 1000).toString();
    const sig =
        'v0=' + crypto.createHmac('sha256', SIGNING_SECRET).update(`v0:${reqTs}:${body}`).digest('hex');

    const res = await fetch(`${BASE_URL}/api/slack/interactive`, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-slack-signature': sig,
            'x-slack-request-timestamp': reqTs,
        },
        body,
    });
    return { status: res.status, text: await res.text() };
}

function blockActions(actionId: string, value: unknown, responseUrl: string, userId: string) {
    return {
        type: 'block_actions',
        team: { id: TEAM_ID },
        user: { id: userId, name: 'tester' },
        channel: { id: CHANNEL, name: 'test' },
        message: { ts: '1700000000.000100' },
        response_url: responseUrl,
        actions: [{ action_id: actionId, type: 'button', value: typeof value === 'string' ? value : JSON.stringify(value) }],
    };
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Wait for the route's async POST back to the sink, rather than a fixed sleep. */
async function waitForSink(sink: Sink, n = 1, timeoutMs = 8000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (sink.received.length >= n) return true;
        await wait(150);
    }
    return false;
}

// --- main ------------------------------------------------------------------

async function main() {
    if (!SIGNING_SECRET) {
        console.error('SLACK_SIGNING_SECRET is required (loaded from .env.local).');
        process.exit(1);
    }
    console.log(`\n=== /api/slack/interactive integration check ===`);
    console.log(`  target: ${BASE_URL}\n`);

    const sink = await startSink();
    const mongoUri = process.env.MONGODB_URI;
    const mongo = mongoUri ? new MongoClient(mongoUri) : null;
    let seededUserId: string | null = null;
    let workspaceObjectId: ObjectId | null = null;

    try {
        // 1 — forged signature
        const forged = await fetch(`${BASE_URL}/api/slack/interactive`, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'x-slack-signature': 'v0=deadbeef',
                'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
            },
            body: 'payload=%7B%7D',
        });
        check('rejects forged signature with 401', forged.status === 401, `got ${forged.status}`);

        // 2 — Replace by an unknown user → connect-and-copy fallback
        sink.received.length = 0;
        const unknownUser = 'U_DOES_NOT_EXIST_' + Math.random().toString(36).slice(2, 8).toUpperCase();
        const res2 = await postInteraction(
            blockActions(
                'replace_message',
                {
                    original_ts: '1700000000.000100',
                    channel: CHANNEL,
                    original_text: 'this is sloppy, you did not run the tests',
                    improved_text: REPHRASE,
                    user: unknownUser,
                },
                sink.url,
                unknownUser
            )
        );
        check('replace accepted (200)', res2.status === 200, `got ${res2.status}`);
        const got2 = await waitForSink(sink, 1);
        check('replace without a user token responds instead of silently doing nothing', got2);

        if (got2) {
            const body = sink.received[0];
            const asText = JSON.stringify(body);
            check(
                'fallback replaces the ephemeral rather than deleting it',
                body.replace_original === 'true' || body.replace_original === true,
                `got ${JSON.stringify(body.replace_original)}`
            );
            check('fallback still shows the rephrase so it can be copied', asText.includes(REPHRASE));
            check('fallback offers the authorize link', asText.includes('connect_clarity_user_token'));
            check(
                'authorize link requests the per-user chat:write scope',
                /user_scope=[^"&]*chat(%3A|:)write/.test(asText),
                'user_scope missing from the OAuth url'
            );
        }

        // 3 — link-only buttons must return a bare 200 with no body
        for (const actionId of ['learn_about_clarity_link', 'connect_clarity_user_token', 'install_clarity']) {
            sink.received.length = 0;
            const res = await postInteraction(blockActions(actionId, '{}', sink.url, 'U_LINK_TESTER'));
            check(`${actionId}: 200`, res.status === 200, `got ${res.status}`);
            check(
                `${actionId}: empty body (a body would overwrite the user's message)`,
                res.text.trim() === '',
                `got ${JSON.stringify(res.text.slice(0, 80))}`
            );
        }

        // 4 — unknown actions keep their previous behaviour
        const res4 = await postInteraction(blockActions('some_unknown_action', '{}', sink.url, 'U_LINK_TESTER'));
        check('unknown action still handled (200)', res4.status === 200, `got ${res4.status}`);

        // 5 — seeded user that exists but has no userToken (discovery-mode teammate)
        if (mongo) {
            await mongo.connect();
            const db = mongo.db(process.env.MONGODB_DB_NAME || 'clarity-dev');
            const ws = await db.collection('workspaces').findOne({ workspaceId: TEAM_ID });
            if (!ws) {
                console.log('  ⏭  skipping seeded-user case — no workspace for the test team in this DB');
            } else {
                workspaceObjectId = ws._id as ObjectId;
                seededUserId = 'U_SEED_' + Math.random().toString(36).slice(2, 8).toUpperCase();
                await db.collection('slackUsers').insertOne({
                    _id: new ObjectId(),
                    slackId: seededUserId,
                    workspaceId: String(workspaceObjectId),
                    name: 'Seeded Tester',
                    autoCoachingEnabledChannels: [],
                    coachingFlags: [],
                    isActive: true,
                    // deliberately no userToken
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

                sink.received.length = 0;
                await postInteraction(
                    blockActions(
                        'replace_message',
                        {
                            original_ts: '1700000000.000100',
                            channel: CHANNEL,
                            original_text: 'whatever, moving on',
                            improved_text: REPHRASE,
                            user: seededUserId,
                        },
                        sink.url,
                        seededUserId
                    )
                );
                const got5 = await waitForSink(sink, 1);
                check('existing user without a user token also gets the fallback', got5);
                if (got5) {
                    check(
                        'seeded-user fallback carries the rephrase',
                        JSON.stringify(sink.received[0]).includes(REPHRASE)
                    );
                }
            }
        } else {
            console.log('  ⏭  skipping seeded-user case — MONGODB_URI not set');
        }
    } finally {
        if (mongo && seededUserId && workspaceObjectId) {
            await mongo
                .db(process.env.MONGODB_DB_NAME || 'clarity-dev')
                .collection('slackUsers')
                .deleteOne({ slackId: seededUserId, workspaceId: String(workspaceObjectId) });
        }
        if (mongo) await mongo.close();
        await sink.close();
    }

    console.log(`\n  ${passed} passed, ${failed} failed\n`);
    process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(e => {
    console.error('check crashed:', e);
    process.exitCode = 1;
});
