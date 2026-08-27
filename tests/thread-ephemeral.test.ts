import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression net for thread coverage.
 *
 * Slack renders an ephemeral without `thread_ts` in the channel root. A user
 * who is replying inside a thread is looking at the thread pane, so coaching
 * delivered to the root is effectively invisible — the feature looked like it
 * simply didn't fire in threads.
 *
 * These assert the argument actually reaches chat.postEphemeral, which is the
 * part a live smoke test can't easily observe: ephemerals never appear in
 * conversations.history, so there's no API read-back to check.
 */
type EphemeralArgs = Record<string, unknown>;
const postEphemeral =
    vi.fn<(args: EphemeralArgs) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));

vi.mock('@slack/web-api', () => ({
    WebClient: class {
        chat = { postEphemeral };
    },
}));

const { sendEphemeralMessage } = await import('@/lib/slack');

beforeEach(() => {
    postEphemeral.mockClear();
});

describe('sendEphemeralMessage thread handling', () => {
    it('scopes the ephemeral to the thread when coaching a thread reply', async () => {
        await sendEphemeralMessage('C123', 'U123', 'text', 'xoxb-test', [], [], '1700000000.000100');

        expect(postEphemeral).toHaveBeenCalledTimes(1);
        expect(postEphemeral.mock.calls[0][0]).toMatchObject({
            channel: 'C123',
            user: 'U123',
            thread_ts: '1700000000.000100',
        });
    });

    it('omits thread_ts entirely for a top-level channel message', async () => {
        await sendEphemeralMessage('C123', 'U123', 'text', 'xoxb-test');

        const arg = postEphemeral.mock.calls[0][0];
        // Present-but-undefined would be sent as a null field by some clients;
        // the key must be absent.
        expect('thread_ts' in arg).toBe(false);
    });

    it('omits thread_ts when passed an empty string rather than sending a blank', async () => {
        await sendEphemeralMessage('C123', 'U123', 'text', 'xoxb-test', [], [], '');

        const arg = postEphemeral.mock.calls[0][0];
        expect('thread_ts' in arg).toBe(false);
    });

    it('still carries blocks through alongside the thread scoping', async () => {
        const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'hi' } }];
        await sendEphemeralMessage('C1', 'U1', 'text', 'xoxb-test', [], blocks, '1700000000.000200');

        expect(postEphemeral.mock.calls[0][0]).toMatchObject({
            blocks,
            thread_ts: '1700000000.000200',
        });
    });

    it('reports failure rather than throwing when Slack rejects the call', async () => {
        postEphemeral.mockRejectedValueOnce(new Error('channel_not_found'));
        const ok = await sendEphemeralMessage('C1', 'U1', 'text', 'xoxb-test');
        expect(ok).toBe(false);
    });
});
