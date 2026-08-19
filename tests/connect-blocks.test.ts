import { describe, it, expect, beforeAll } from 'vitest';
import { buildConnectToReplaceBlocks } from '@/lib/slack';

/**
 * The fallback shown when Clarity has no user token and therefore cannot edit
 * the message itself. This is the entire experience for every teammate who
 * hasn't personally authorized Clarity — which, in any workspace, is everyone
 * except the person who ran the install. Before the fix this path rendered
 * nothing at all and the button appeared broken.
 */
beforeAll(() => {
    // getSlackOAuthUrl reads these at call time.
    process.env.NEXT_PUBLIC_SLACK_CLIENT_ID ||= 'test-client-id';
    process.env.SLACK_REDIRECT_URI ||= 'https://example.test/api/auth/slack/callback';
});

describe('buildConnectToReplaceBlocks', () => {
    const rephrase = 'Could you take another look at the tests before this merges?';
    const blocks = () => buildConnectToReplaceBlocks(rephrase);

    it('shows the rephrase so it can still be copied', () => {
        const text = JSON.stringify(blocks());
        expect(text).toContain(rephrase);
    });

    it('puts the rephrase in a code block, so copying it does not pick up prose', () => {
        const section = blocks()[0] as { text: { text: string } };
        expect(section.text.text).toContain('```' + rephrase + '```');
    });

    it('offers exactly one action, and it is the authorize link', () => {
        const actions = blocks().find(b => b.type === 'actions') as {
            elements: Array<{ action_id: string; url?: string }>;
        };
        expect(actions.elements).toHaveLength(1);
        expect(actions.elements[0].action_id).toBe('connect_clarity_user_token');
        expect(actions.elements[0].url).toMatch(/^https:\/\/slack\.com\/oauth\/v2\/authorize\?/);
    });

    it('requests the per-user chat:write scope — without it the button changes nothing', () => {
        const actions = blocks().find(b => b.type === 'actions') as {
            elements: Array<{ url: string }>;
        };
        const url = new URL(actions.elements[0].url);
        expect(url.searchParams.get('user_scope')).toContain('chat:write');
    });

    it('explains why the button did not just work', () => {
        const text = JSON.stringify(blocks()).toLowerCase();
        expect(text).toContain('authorize');
    });

    it('still marks the message as private to the recipient', () => {
        expect(JSON.stringify(blocks())).toContain('Only you can see this');
    });
});
