import { describe, it, expect } from 'vitest';
import { quoteAppearsInCorpus } from '@/lib/evals/harness';

/**
 * `quoteAppearsInCorpus` is what makes the digest evals objective: it decides
 * whether a quote the product attributed to a user is real. It has to tolerate
 * the model re-casing or re-punctuating a quote it is otherwise reproducing
 * faithfully, while still catching an actually invented one — so both
 * directions are worth pinning down.
 */
const corpus = [
    'Ship the auth patch today. No more bikeshedding.',
    "I'm not sure the migration is safe — can someone check the indexes?",
    'ok',
];

describe('quoteAppearsInCorpus', () => {
    it('matches an exact quote', () => {
        expect(quoteAppearsInCorpus('Ship the auth patch today.', corpus)).toBe(true);
    });

    it('matches despite case and punctuation drift', () => {
        expect(quoteAppearsInCorpus('ship the auth patch today', corpus)).toBe(true);
    });

    it('matches across smart-quote substitution', () => {
        expect(quoteAppearsInCorpus('I’m not sure the migration is safe', corpus)).toBe(true);
    });

    it('ignores a trailing channel tag the digest prompt appends', () => {
        expect(quoteAppearsInCorpus('Ship the auth patch today. No more bikeshedding. [#eng]', corpus)).toBe(true);
    });

    it('matches a partial phrase drawn from a real message', () => {
        expect(quoteAppearsInCorpus('no more bikeshedding', corpus)).toBe(true);
    });

    it('rejects a fabricated quote — the failure this check exists for', () => {
        expect(quoteAppearsInCorpus('We should rewrite the whole service in Rust', corpus)).toBe(false);
    });

    it('rejects a quote that recombines words from different messages', () => {
        expect(quoteAppearsInCorpus('Ship the migration today', corpus)).toBe(false);
    });

    it('rejects an empty or near-empty quote instead of trivially passing it', () => {
        expect(quoteAppearsInCorpus('', corpus)).toBe(false);
        expect(quoteAppearsInCorpus('  ', corpus)).toBe(false);
    });

    it('returns false against an empty corpus', () => {
        expect(quoteAppearsInCorpus('anything', [])).toBe(false);
    });
});
