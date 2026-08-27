/**
 * Unit-test environment.
 *
 * `src/lib/db.ts` throws at module scope when MONGODB_URI is unset, and
 * `src/lib/slack.ts` imports it for the channel collection — so importing any
 * Slack helper pulls in that check even when the code under test never touches
 * the database. A placeholder URI satisfies it; the Mongo driver does not
 * connect until a query is actually issued, so nothing here reaches a network.
 *
 * This is a workaround for the coupling, not an endorsement of it. Making the
 * db module lazy would let these tests import the real thing with no
 * environment at all, and would also stop a missing URI from failing `next
 * build`. Worth doing separately.
 */
process.env.MONGODB_URI ||= 'mongodb://placeholder-not-connected:27017';
process.env.MONGODB_DB_NAME ||= 'unit-tests';
process.env.NEXT_PUBLIC_SLACK_CLIENT_ID ||= 'test-client-id';
process.env.SLACK_CLIENT_SECRET ||= 'test-client-secret';
process.env.SLACK_REDIRECT_URI ||= 'https://example.test/api/auth/slack/callback';
process.env.SLACK_SIGNING_SECRET ||= 'test-signing-secret';
