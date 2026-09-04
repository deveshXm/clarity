// Rephrase dataset for the LangWatch experiment.
//
// Spread across the five shipped flags and several workplace registers. Each
// case carries the ask/criticism that MUST survive the rewrite — that is what
// `force_retained` is judged against, and writing it out per case is what makes
// the dimension objective rather than taste.
//
// When a user reports a bad rephrase, add it here as a case before fixing it.
import { STYLE_PRESETS } from '@/types';

export interface RephraseCase {
    id: string;
    message: string;
    expectedFlag: string;
    /** The substance the rewrite must still convey. */
    mustRetain: string;
    /** Optional target style — exercises the {{STYLE}} branch of the prompt. */
    styleKey?: string;
    style?: string;
    context?: Array<{ text: string; user: string; ts: string }>;
}

export const REPHRASE_CASES: RephraseCase[] = [
    {
        id: 'disrespectful-code-review',
        message: "This is sloppy — you clearly didn't run the tests before pushing.",
        expectedFlag: 'Disrespectful',
        mustRetain: 'the work has a quality problem and tests were not run before pushing',
    },
    {
        id: 'disrespectful-repeat-offender',
        message: "I'm sick of cleaning up your mess every single time you touch the billing code.",
        expectedFlag: 'Disrespectful',
        mustRetain: 'this is a repeated problem in the billing code and the sender is doing the cleanup',
    },
    {
        id: 'passive-aggressive-last-message',
        message: 'Per my last message, the spec was already attached. Happy to send it a third time!',
        expectedFlag: 'Passive-Aggressive',
        mustRetain: 'the spec was already sent and the sender is pointing that out',
    },
    {
        id: 'passive-aggressive-fake-praise',
        message: 'Wow, great to see the deploy finally happen. Only took three weeks.',
        expectedFlag: 'Passive-Aggressive',
        mustRetain: 'the deploy took three weeks and that is too long',
    },
    {
        id: 'dismissive-shutdown',
        message: "Whatever. Doesn't matter, we're moving on.",
        expectedFlag: 'Dismissive',
        mustRetain: 'the sender wants to stop this discussion and proceed',
        context: [
            { text: 'I still think the retry logic will double-charge on timeout.', user: 'U1', ts: '1' },
        ],
    },
    {
        id: 'unclear-vague-bug',
        message: 'the thing is broken again, can someone look',
        expectedFlag: 'Unclear / Not Actionable',
        mustRetain: 'something is broken and the sender is asking someone to investigate',
    },
    {
        id: 'unclear-vague-ask',
        message: 'we need to fix the onboarding stuff before launch',
        expectedFlag: 'Unclear / Not Actionable',
        mustRetain: 'onboarding needs work before launch',
    },
    {
        id: 'unconstructive-defeatist',
        message: 'This whole architecture is a disaster and honestly why are we even bothering.',
        expectedFlag: 'Unconstructive / Demoralizing',
        mustRetain: 'the sender has serious concerns about the architecture',
    },
    {
        id: 'unconstructive-doomed',
        message: "There's no way we hit this date. This release is going to be a train wreck.",
        expectedFlag: 'Unconstructive / Demoralizing',
        mustRetain: 'the sender believes the release date is not achievable',
    },
    // --- style-conditioned: the same class of message, with a target set ---
    {
        id: 'style-warm-blunt-rejection',
        message: 'No. That approach is wrong and we are not doing it.',
        expectedFlag: 'Dismissive',
        mustRetain: 'the sender is rejecting the proposed approach',
        styleKey: 'warm',
        style: STYLE_PRESETS.warm.description,
    },
    {
        id: 'style-concise-rambling-critique',
        message:
            "So I was looking at this and I guess maybe I sort of feel like possibly the query might not be very good? Like it's kind of slow I think, maybe? Not sure though, could be wrong, just a thought, no worries either way.",
        expectedFlag: 'Unclear / Not Actionable',
        mustRetain: 'the sender thinks the query may be slow and wants it looked at',
        styleKey: 'concise',
        style: STYLE_PRESETS.concise.description,
    },
    {
        id: 'style-analytical-unsupported-claim',
        message: 'The new caching layer is obviously making everything worse. Rip it out.',
        expectedFlag: 'Unconstructive / Demoralizing',
        mustRetain: 'the sender believes the caching layer is causing a regression and wants it removed',
        styleKey: 'analytical',
        style: STYLE_PRESETS.analytical.description,
    },
];
