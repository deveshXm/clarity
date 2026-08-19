import { describe, it, expect } from 'vitest';
import { resolveWorkspaceAdmin } from '@/lib/slack';

/**
 * Regression net for the admin-hijack bug.
 *
 * Before the fix, every OAuth completion set `adminSlackId` to whoever had just
 * authorized. Because re-running OAuth is exactly how an ordinary teammate
 * grants their own `chat:write` scope, the normal onboarding path silently
 * transferred workspace settings, billing, and onboarding to the most recent
 * clicker.
 */
describe('resolveWorkspaceAdmin', () => {
    it('makes the first installer the admin when the workspace has none', () => {
        const r = resolveWorkspaceAdmin(undefined, 'U_INSTALLER');
        expect(r.adminSlackId).toBe('U_INSTALLER');
        expect(r.installerIsAdmin).toBe(true);
    });

    it('keeps the original admin when a teammate re-authorizes', () => {
        const r = resolveWorkspaceAdmin('U_OWNER', 'U_TEAMMATE');
        expect(r.adminSlackId).toBe('U_OWNER');
        expect(r.installerIsAdmin).toBe(false);
    });

    it('keeps the original admin when the owner themselves re-authorizes', () => {
        const r = resolveWorkspaceAdmin('U_OWNER', 'U_OWNER');
        expect(r.adminSlackId).toBe('U_OWNER');
        expect(r.installerIsAdmin).toBe(true);
    });

    it('treats an empty stored admin as no admin rather than as a valid id', () => {
        const r = resolveWorkspaceAdmin('', 'U_INSTALLER');
        expect(r.adminSlackId).toBe('U_INSTALLER');
        expect(r.installerIsAdmin).toBe(true);
    });

    it('never returns an empty admin id', () => {
        for (const existing of [undefined, null, '', 'U_OWNER']) {
            expect(resolveWorkspaceAdmin(existing, 'U_X').adminSlackId).toBeTruthy();
        }
    });
});
