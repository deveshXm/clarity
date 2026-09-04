/**
 * Style-deviation experiment — persona corpus × target style.
 *
 * Each row is a corpus of messages from one kind of writer scored against a
 * target style. Two questions, both about the product's own output:
 *
 * 1. Is the 0-100 adherence score honest?
 *    adherence_score    the score itself (mean of two runs), labelled by band
 *    band_correct       lands inside the expected high / mid / low band
 *    run_spread         |run1 − run2| — the scorer must be stable
 *    judge_gap          |clarity − independent judge| — calibration check
 *    discrimination     (suite-level) on-style mean − off-style mean per target
 *
 * 2. Is the advice any good?
 *    deviation_quote_fidelity      quoted deviations trace back to real messages
 *    suggestion_moves_on_target    the rewrite re-scores higher against the same target
 *    suggestion_preserves_intent   the rewrite still says what the original said
 *    strengths_grounded            strengths quote the corpus, not generic praise
 *
 * Run:  npm run evals:style
 */
import { analyzeStyleDeviation } from '@/lib/ai';
import {
    withRetry,
    judgeJson,
    JUDGE_MODEL,
    quoteAppearsInCorpus,
    mapPool,
    pad,
    printHeader,
} from '@/lib/evals/harness';
import { STYLE_CASES, BAND_RANGES, type StyleCase } from './datasets/style';
import { langwatchClient, SUT, toMessages, ratio, mean, bullet, finish } from './client';

const MAX_SPREAD = 20;
const MAX_JUDGE_GAP = 25;
const DISCRIMINATION_MARGIN = 20;
const MAX_SUGGESTIONS = 3;
const CONC = Math.min(Number(process.env.SIM_CONCURRENCY || 4), 3);

const CALIBRATION_SYSTEM =
    'You are calibrating a communication-style scorer. Given a TARGET style and a batch of workplace messages, output ONLY JSON: {"adherenceScore": <0-100 integer>, "reason": "<one sentence>"}. adherenceScore = how well the messages match the target style (100 = perfectly on-style, 0 = the opposite).';

const INTENT_SYSTEM = `You check whether a rewritten workplace message still says what the original said.

The rewrite was produced to better match a target communication style. Restyling is expected and fine. What is NOT fine is dropping the substance: an objection that disappears, a question that becomes a statement, a request that loses its ask, or a concern that is softened out of existence.

Return JSON only: {"preserved": true|false, "note": "one sentence"}`;

interface Suggestion {
    quote: string;
    suggestion: string;
    quoteReal: boolean;
    before: number;
    after: number;
    improved: boolean;
    intentPreserved: boolean;
    intentNote: string;
}

interface Scored {
    c: StyleCase;
    mean: number;
    spread: number;
    judge: number;
    gap: number;
    bandOk: boolean;
    suggestions: Suggestion[];
    strengthsTotal: number;
    strengthsGrounded: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

/** Score a single message against a target through Clarity's own scorer. */
async function scoreOne(text: string, target: string): Promise<number> {
    const r = await withRetry(() => analyzeStyleDeviation(toMessages([text]), target));
    return r.adherenceScore;
}

async function main() {
    printHeader(
        'Clarity style-deviation experiment',
        `${STYLE_CASES.length} persona × target rows · 2 scoring runs each · judge: ${JUDGE_MODEL} (independent of Portkey) · concurrency=${CONC}`
    );
    const lw = langwatchClient();
    const experiment = await lw.experiments.init('clarity-style-deviation');
    const scored: Scored[] = new Array(STYLE_CASES.length);

    await experiment.run(
        STYLE_CASES,
        async ({ item: c, index }) => {
            const msgs = toMessages(c.messages);
            const { result: first } = await experiment.withTarget(SUT.name, SUT.metadata, () =>
                withRetry(() => analyzeStyleDeviation(msgs, c.target))
            );
            const second = await withRetry(() => analyzeStyleDeviation(msgs, c.target));
            const runs = [first.adherenceScore, second.adherenceScore];
            const m = Math.round(mean(runs));
            const spread = Math.max(...runs) - Math.min(...runs);

            const judge = await withRetry(() =>
                judgeJson<{ adherenceScore: number; reason: string }>(
                    CALIBRATION_SYSTEM,
                    `TARGET STYLE:\n${c.target}\n\nMESSAGES:\n${bullet(c.messages)}`
                )
            );
            const judgeScore = clamp(judge.adherenceScore);
            const gap = Math.abs(m - judgeScore);
            const [lo, hi] = BAND_RANGES[c.band];
            const bandOk = m >= lo && m <= hi;
            const base = { index, target: SUT.name };

            experiment.log('adherence_score', {
                ...base,
                score: m,
                passed: bandOk,
                label: c.band,
                details: `runs ${runs.join('/')} · expected ${c.band} [${lo}-${hi}] · judge ${judgeScore}: ${judge.reason}`,
                data: {
                    target: c.targetKey,
                    target_description: c.target,
                    persona_note: c.note,
                    messages: c.messages,
                    expected_band: c.band,
                    deviations: first.deviations,
                    strengths: first.strengths,
                },
            });
            experiment.log('band_correct', { ...base, passed: bandOk, label: c.band, details: `${m} vs [${lo}-${hi}]` });
            experiment.log('run_spread', { ...base, score: spread, passed: spread <= MAX_SPREAD, details: `runs ${runs.join('/')}` });
            experiment.log('judge_gap', { ...base, score: gap, passed: gap <= MAX_JUDGE_GAP, details: `clarity ${m} · judge ${judgeScore}` });

            // ---- suggestions: real quote, moves toward target, keeps meaning ----
            const suggestions = await mapPool(first.deviations.slice(0, MAX_SUGGESTIONS), 2, async d => {
                const quoteReal = quoteAppearsInCorpus(d.quote, c.messages);
                const [before, after] = await Promise.all([scoreOne(d.quote, c.target), scoreOne(d.suggestion, c.target)]);
                const intent = await withRetry(() =>
                    judgeJson<{ preserved: boolean; note: string }>(
                        INTENT_SYSTEM,
                        `TARGET STYLE: ${c.target}\n\nORIGINAL: ${d.quote}\n\nREWRITE: ${d.suggestion}`
                    )
                );
                return {
                    quote: d.quote,
                    suggestion: d.suggestion,
                    quoteReal,
                    before,
                    after,
                    improved: after > before,
                    intentPreserved: !!intent.preserved,
                    intentNote: intent.note,
                } satisfies Suggestion;
            });

            if (suggestions.length) {
                const fake = suggestions.filter(s => !s.quoteReal);
                experiment.log('deviation_quote_fidelity', {
                    ...base,
                    score: ratio(suggestions.length - fake.length, suggestions.length),
                    passed: fake.length === 0,
                    details: fake.length ? `fabricated: ${fake.map(s => JSON.stringify(s.quote)).join(', ')}` : `${suggestions.length} quotes verified`,
                });
                const notImproved = suggestions.filter(s => !s.improved);
                experiment.log('suggestion_moves_on_target', {
                    ...base,
                    score: ratio(suggestions.length - notImproved.length, suggestions.length),
                    passed: notImproved.length === 0,
                    details: suggestions.map(s => `${s.before}→${s.after}`).join(', '),
                });
                const changed = suggestions.filter(s => !s.intentPreserved);
                experiment.log('suggestion_preserves_intent', {
                    ...base,
                    score: ratio(suggestions.length - changed.length, suggestions.length),
                    passed: changed.length === 0,
                    details: changed.length ? changed.map(s => s.intentNote).join(' · ') : 'meaning kept',
                });
            } else {
                for (const name of ['deviation_quote_fidelity', 'suggestion_moves_on_target', 'suggestion_preserves_intent']) {
                    experiment.log(name, { ...base, status: 'skipped', details: 'no deviations reported' });
                }
            }

            const strengths = first.strengths.filter(s => s.trim().length > 0);
            const grounded = strengths.filter(s =>
                c.messages.some(mm => quoteAppearsInCorpus(mm, [s]) || quoteAppearsInCorpus(s, [mm]))
            ).length;
            if (strengths.length) {
                experiment.log('strengths_grounded', {
                    ...base,
                    score: ratio(grounded, strengths.length),
                    passed: grounded === strengths.length,
                    details: `${grounded}/${strengths.length} strengths quote the corpus`,
                });
            }

            scored[index] = {
                c, mean: m, spread, judge: judgeScore, gap, bandOk, suggestions,
                strengthsTotal: strengths.length, strengthsGrounded: grounded,
            };
            const okSug = suggestions.filter(s => s.quoteReal && s.improved && s.intentPreserved).length;
            console.log(
                `  ${bandOk ? '✅' : '❌'} ${pad(c.id, 32)}score=${pad(m, 4)}(${runs.join('/')}) judge=${pad(judgeScore, 4)}band=${pad(c.band, 5)} suggestions ok ${okSug}/${suggestions.length}`
            );
        },
        { concurrency: CONC }
    );

    // ---- aggregates ---------------------------------------------------------
    console.log('\n-- discrimination (on minus off, per target) --');
    const pairs = [...new Set(scored.map(s => s.c.pair).filter((p): p is string => !!p))];
    let pairsOk = 0;
    for (const p of pairs) {
        const on = scored.find(s => s.c.pair === p && s.c.band === 'high');
        const off = scored.find(s => s.c.pair === p && s.c.band === 'low');
        if (!on || !off) continue;
        const margin = on.mean - off.mean;
        const ok = margin >= DISCRIMINATION_MARGIN;
        if (ok) pairsOk++;
        console.log(`  ${pad(p, 12)}on=${pad(on.mean, 4)}off=${pad(off.mean, 4)}margin=${pad(margin, 4)}${ok ? 'OK' : 'TOO CLOSE'}`);
    }

    const allSug = scored.flatMap(s => s.suggestions);
    const lifts = allSug.map(s => s.after - s.before);
    const strengthsTotal = scored.reduce((a, s) => a + s.strengthsTotal, 0);
    const strengthsGrounded = scored.reduce((a, s) => a + s.strengthsGrounded, 0);
    const pts = (n: number) => `${n.toFixed(0)} pts`;

    console.log('\n-- issues --');
    const issues: string[] = [];
    for (const s of scored) {
        if (!s.bandOk) issues.push(`${s.c.id}: score ${s.mean} outside ${s.c.band} band`);
        if (s.spread > MAX_SPREAD) issues.push(`${s.c.id}: unstable, run spread ${s.spread}`);
        if (s.gap > MAX_JUDGE_GAP) issues.push(`${s.c.id}: ${s.gap} points from judge`);
        for (const x of s.suggestions) {
            if (!x.quoteReal) issues.push(`${s.c.id}: fabricated quote ${JSON.stringify(x.quote)}`);
            if (!x.improved) issues.push(`${s.c.id}: suggestion scored no better (${x.before}→${x.after}): ${JSON.stringify(x.suggestion)}`);
            if (!x.intentPreserved) issues.push(`${s.c.id}: suggestion changed the meaning: ${x.intentNote}`);
        }
    }
    if (!issues.length) console.log('  none');
    for (const i of issues) console.log(`  · ${i}`);

    const ok = finish(
        experiment,
        {
            band_accuracy: ratio(scored.filter(s => s.bandOk).length, scored.length),
            discrimination: ratio(pairsOk, pairs.length),
            mean_judge_gap: mean(scored.map(s => s.gap)),
            max_run_spread: Math.max(...scored.map(s => s.spread)),
            deviation_quote_fidelity: ratio(allSug.filter(s => s.quoteReal).length, allSug.length),
            suggestion_moves_on_target: ratio(allSug.filter(s => s.improved).length, allSug.length),
            suggestion_preserves_intent: ratio(allSug.filter(s => s.intentPreserved).length, allSug.length),
            mean_suggestion_lift: mean(lifts),
            strengths_grounded: ratio(strengthsGrounded, strengthsTotal),
        },
        {
            band_accuracy: 0.7,
            discrimination: 1.0,
            deviation_quote_fidelity: 0.9,
            suggestion_moves_on_target: 0.7,
            suggestion_preserves_intent: 0.85,
        },
        { mean_judge_gap: pts, max_run_spread: pts, mean_suggestion_lift: pts }
    );
    if (!ok) process.exitCode = 1;
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
