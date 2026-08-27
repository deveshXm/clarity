/**
 * Style-deviation SUGGESTION quality eval.
 *
 * Complements `evals:style:deviation`, which asks whether the 0-100 adherence
 * score is calibrated. This asks the other half: when the digest tells you
 * "here's a message that drifted from your target, and here's what would have
 * matched" — is the quote real, and is the suggestion actually better?
 *
 * A miscalibrated score is annoying. A confident, specific, wrong suggestion is
 * worse: the user sends it.
 *
 *   1. QUOTE FIDELITY   — every quoted deviation must trace back to a real
 *                         message in the corpus. Objective.
 *   2. MOVES ON TARGET   — the suggestion is re-scored against the same target
 *                         style and must beat the original it replaces. Uses
 *                         Clarity's own scorer, so this is a self-consistency
 *                         check: the product must agree that its own advice is
 *                         an improvement. Single-message scoring is noisier than
 *                         a full corpus, so this is read as a rate across many
 *                         suggestions, never per-case.
 *   3. PRESERVES INTENT  — an independent judge checks the suggestion still says
 *                         what the original said. Rewriting toward "warm" must
 *                         not quietly delete the objection.
 *   4. STRENGTHS GROUNDED — the prompt demands quote-based strengths, not
 *                         generic praise. Verified against the corpus.
 *
 * Run: npm run evals:style:suggestions
 */
import { analyzeStyleDeviation } from '@/lib/ai';
import { STYLE_PRESETS } from '@/types';
import {
    withRetry,
    mapPool,
    judgeJson,
    quoteAppearsInCorpus,
    CONCURRENCY,
    JUDGE_MODEL,
    pct,
    pad,
    printHeader,
    gate,
} from '@/lib/evals/harness';
import { createReporter, type EvalCaseResult } from '@/lib/evals/reporter';

interface Case {
    id: string;
    target: string;
    messages: string[];
}

const CASES: Case[] = [
    {
        id: 'warm-target-blunt-writer',
        target: STYLE_PRESETS.warm.description,
        messages: [
            'This is wrong. Redo it.',
            "No, that idea doesn't make sense.",
            'You missed the obvious case in checkout.',
            'Just fix the tests and stop debating it.',
            'Why is this still open?',
            'The doc is confusing. Rewrite the rollout section.',
            'Not ready for customers.',
            'Cut the extra scope and ship the patch.',
        ],
    },
    {
        id: 'concise-target-rambler',
        target: STYLE_PRESETS.concise.description,
        messages: [
            "So I was thinking, and I might be totally off base here, but it seems like maybe we could possibly consider revisiting the caching approach at some point when there's time?",
            "Just to give a bit of background before I get to the question — as you probably remember from the meeting a few weeks ago, we had talked about the migration, and I think at the time we said we'd revisit, so anyway, my question is whether we still want to do that.",
            "Hi! Hope your week is going well. Quick thing, no rush whatsoever, whenever you get a chance — could you take a look at the PR?",
            "I wanted to follow up on the thing from earlier, which I know we discussed, though maybe not in detail, about the reporting job and whether it needs changing.",
            "Not sure if this is the right channel for this but I figured I'd ask here anyway and someone can redirect me if needed.",
            "Long story short, and I'll try to keep this brief although there's a lot of context, the deploy didn't go as planned.",
        ],
    },
    {
        id: 'analytical-target-vague-writer',
        target: STYLE_PRESETS.analytical.description,
        messages: [
            'The new release feels way slower.',
            'I think users are probably unhappy about this.',
            'Something is off with the numbers.',
            'That approach seems kind of risky to me.',
            'It looks like the cache is the problem.',
            'Most people probably do it the other way.',
            'This will likely cause issues down the line.',
            'The data seems fine to me.',
        ],
    },
    {
        id: 'direct-target-hedger',
        target: STYLE_PRESETS.direct.description,
        messages: [
            'Sorry, I might be wrong, but maybe we should possibly consider rolling back?',
            "I don't want to hold things up so happy to go with whatever.",
            'Could be nothing, but the error rate might be up a bit? Not sure.',
            'Just a thought, feel free to ignore, but perhaps we could revisit the deadline.',
            'This is probably a silly question but who owns the migration?',
            'Apologies if this was already covered somewhere.',
            'Might just be me but the staging env seems maybe broken?',
            'No rush at all, whenever, but did we decide anything about the retry policy?',
        ],
    },
];

function toMessages(texts: string[]) {
    const now = Math.floor(Date.now() / 1000);
    return texts.map((text, i) => ({ text, ts: String(now - (texts.length - i) * 60), channelName: 'eng' }));
}

const INTENT_SYSTEM = `You check whether a rewritten workplace message still says what the original said.

The rewrite was produced to better match a target communication style. Restyling is expected and fine. What is NOT fine is dropping the substance: an objection that disappears, a question that becomes a statement, a request that loses its ask, or a concern that is softened out of existence.

Return JSON only: {"preserved": true|false, "note": "one sentence"}`;

interface IntentVerdict { preserved: boolean; note: string }

interface SuggestionScore {
    quote: string;
    suggestion: string;
    quoteReal: boolean;
    originalScore: number;
    suggestionScore: number;
    improved: boolean;
    intent: IntentVerdict | null;
}

interface Scored {
    c: Case;
    adherence: number;
    suggestions: SuggestionScore[];
    strengthsTotal: number;
    strengthsGrounded: number;
    notes: string[];
}

/** Score a single message against a target, via Clarity's own scorer. */
async function scoreOne(text: string, target: string): Promise<number> {
    const res = await withRetry(() => analyzeStyleDeviation(toMessages([text]), target));
    return res.adherenceScore;
}

async function runCase(c: Case): Promise<Scored> {
    const result = await withRetry(() => analyzeStyleDeviation(toMessages(c.messages), c.target));
    const notes: string[] = [];

    const suggestions = await mapPool(result.deviations.slice(0, 4), 2, async d => {
        const quoteReal = quoteAppearsInCorpus(d.quote, c.messages);
        if (!quoteReal) notes.push(`fabricated quote: ${JSON.stringify(d.quote)}`);

        const [originalScore, suggestionScore] = await Promise.all([
            scoreOne(d.quote, c.target),
            scoreOne(d.suggestion, c.target),
        ]);
        const improved = suggestionScore > originalScore;
        if (!improved) {
            notes.push(`suggestion scored no better (${originalScore} → ${suggestionScore}): ${JSON.stringify(d.suggestion)}`);
        }

        const intent = await withRetry(() =>
            judgeJson<IntentVerdict>(
                INTENT_SYSTEM,
                `TARGET STYLE: ${c.target}\n\nORIGINAL: ${d.quote}\n\nREWRITE: ${d.suggestion}`
            )
        );
        if (!intent.preserved) notes.push(`suggestion changed the meaning: ${intent.note}`);

        return { quote: d.quote, suggestion: d.suggestion, quoteReal, originalScore, suggestionScore, improved, intent };
    });

    // Strengths must be quote-based per the prompt, not generic praise.
    const strengths = result.strengths.filter(s => s.trim().length > 0);
    const strengthsGrounded = strengths.filter(s =>
        c.messages.some(m => quoteAppearsInCorpus(m, [s]) || quoteAppearsInCorpus(s, [m]))
    ).length;

    return {
        c,
        adherence: result.adherenceScore,
        suggestions,
        strengthsTotal: strengths.length,
        strengthsGrounded,
        notes,
    };
}

async function main() {
    printHeader(
        'Clarity style-suggestion quality eval',
        `${CASES.length} targets · judge: ${JUDGE_MODEL} (independent of Portkey) · concurrency=${CONCURRENCY}`
    );

    const reporter = createReporter();
    await reporter.startRun('style-suggestions', { cases: CASES.length, judge: JUDGE_MODEL });

    const scored = await mapPool(CASES, Math.min(CONCURRENCY, 2), async c => {
        const s = await runCase(c);
        const ok = s.suggestions.filter(x => x.quoteReal && x.improved && x.intent?.preserved).length;
        console.log(`  ${ok === s.suggestions.length ? '✅' : '⚠️ '} ${pad(c.id, 30)}adherence=${s.adherence} suggestions ok ${ok}/${s.suggestions.length}`);
        const result: EvalCaseResult = {
            caseId: c.id,
            input: { target: c.target, messages: c.messages },
            output: { adherence: s.adherence, suggestions: s.suggestions },
            scores: {
                quote_fidelity: s.suggestions.length
                    ? s.suggestions.filter(x => x.quoteReal).length / s.suggestions.length
                    : 1,
                moves_on_target: s.suggestions.length
                    ? s.suggestions.filter(x => x.improved).length / s.suggestions.length
                    : 0,
                preserves_intent: s.suggestions.length
                    ? s.suggestions.filter(x => x.intent?.preserved).length / s.suggestions.length
                    : 0,
                adherence_score: s.adherence,
            },
            passed: s.notes.length === 0,
            notes: s.notes,
        };
        await reporter.record(result);
        return s;
    });

    // ---- Scorecard ----
    const all = scored.flatMap(s => s.suggestions);
    console.log('\n' + pad('case', 30) + pad('adher', 7) + pad('quotes', 9) + pad('improved', 10) + 'intent');
    console.log('-'.repeat(64));
    for (const s of scored) {
        const n = s.suggestions.length;
        console.log(
            pad(s.c.id, 30) +
                pad(s.adherence, 7) +
                pad(`${s.suggestions.filter(x => x.quoteReal).length}/${n}`, 9) +
                pad(`${s.suggestions.filter(x => x.improved).length}/${n}`, 10) +
                `${s.suggestions.filter(x => x.intent?.preserved).length}/${n}`
        );
    }

    const metrics = {
        quote_fidelity: all.length ? all.filter(x => x.quoteReal).length / all.length : 1,
        moves_on_target: all.length ? all.filter(x => x.improved).length / all.length : 0,
        preserves_intent: all.length ? all.filter(x => x.intent?.preserved).length / all.length : 0,
        strengths_grounded: (() => {
            const t = scored.reduce((a, s) => a + s.strengthsTotal, 0);
            return t ? scored.reduce((a, s) => a + s.strengthsGrounded, 0) / t : 1;
        })(),
        mean_lift: all.length
            ? all.reduce((a, x) => a + (x.suggestionScore - x.originalScore), 0) / all.length
            : 0,
    };

    console.log('\n-- summary --');
    console.log(`  suggestions checked: ${all.length}`);
    console.log(`  quote fidelity:      ${pct(metrics.quote_fidelity)}`);
    console.log(`  moves on target:     ${pct(metrics.moves_on_target)} (mean lift ${metrics.mean_lift.toFixed(1)} points)`);
    console.log(`  preserves intent:    ${pct(metrics.preserves_intent)}`);
    console.log(`  strengths grounded:  ${pct(metrics.strengths_grounded)}`);

    const problems = scored.flatMap(s => s.notes.map(n => `${s.c.id}: ${n}`));
    if (problems.length) {
        console.log('\n-- issues --');
        for (const p of problems) console.log(`  · ${p}`);
    }

    // `moves_on_target` is gated loosely: single-message re-scoring is a noisy
    // instrument, and the meaningful signal is the rate, not any one case.
    const ok = gate(metrics, {
        quote_fidelity: 0.9,
        moves_on_target: 0.7,
        preserves_intent: 0.85,
    });

    await reporter.finishRun({
        total: all.length,
        passed: all.filter(x => x.quoteReal && x.improved && x.intent?.preserved).length,
        failed: all.filter(x => !(x.quoteReal && x.improved && x.intent?.preserved)).length,
        aggregates: metrics,
        ok,
    });
}

main().catch(e => {
    console.error('eval crashed:', e);
    process.exitCode = 1;
});
