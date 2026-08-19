/**
 * Rephrase-quality eval.
 *
 * Question this answers: when Clarity flags a message and offers a rewrite,
 * is that rewrite actually good? Until now nothing measured this. The
 * simulation eval scores *whether* a rephrase was produced, not whether it was
 * worth sending, and the scenario suite judges intent-preservation on a handful
 * of cases. This closes that gap with a dedicated dataset and five dimensions.
 *
 * A rephrase can fail in five distinct ways, and they trade off against each
 * other — which is why they're measured separately rather than rolled into one
 * "quality" number:
 *
 *   1. FLAG CLEARED     — the rewrite still trips the flag it was meant to fix.
 *                         Measured objectively by re-running the classifier on
 *                         the rephrase. No judge involved, so it can't drift.
 *   2. INTENT PRESERVED — the rewrite says something different from what the
 *                         user meant. The failure users notice fastest.
 *   3. NO FABRICATION   — the rewrite invents a fact, deadline, or commitment
 *                         the user never made. The failure that gets someone in
 *                         actual trouble at work.
 *   4. FORCE RETAINED   — the rewrite is so softened that the criticism or the
 *                         ask evaporates. "This is broken, fix it today" must
 *                         not become "no rush, whenever you get a chance!".
 *                         This is the dimension a naive politeness-optimizing
 *                         rewriter fails, and it's invisible if you only
 *                         measure niceness.
 *   5. STYLE ADHERENCE  — when the user has set a preferred style, the rewrite
 *                         should move toward it.
 *
 * 2-5 use an independent judge (Azure direct, not Clarity's Portkey path) so a
 * gateway-level regression can't move the system and its grader together.
 *
 * Run: npm run evals:rephrase
 */
import { analyzeMessage } from '@/lib/ai';
import { DEFAULT_COACHING_FLAGS, STYLE_PRESETS } from '@/types';
import {
    withRetry,
    mapPool,
    judgeJson,
    CONCURRENCY,
    JUDGE_MODEL,
    pct,
    pad,
    printHeader,
    gate,
} from '@/lib/evals/harness';
import { createReporter, type EvalCaseResult } from '@/lib/evals/reporter';

// ---------------------------------------------------------------------------
// Dataset
//
// Spread across the five shipped flags and several workplace registers. Each
// case carries the ask/criticism that MUST survive the rewrite — that's what
// `forceRetained` is judged against, and writing it out per case is what makes
// the dimension objective rather than vibes.
// ---------------------------------------------------------------------------

interface RephraseCase {
    id: string;
    message: string;
    expectedFlag: string;
    /** The substance the rewrite must still convey. */
    mustRetain: string;
    /** Optional target style — exercises the {{STYLE}} branch of the prompt. */
    style?: string;
    context?: Array<{ text: string; user: string; ts: string }>;
}

const CASES: RephraseCase[] = [
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
        message: "the thing is broken again, can someone look",
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
        message: "This whole architecture is a disaster and honestly why are we even bothering.",
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
        style: STYLE_PRESETS.warm.description,
    },
    {
        id: 'style-concise-rambling-critique',
        message:
            "So I was looking at this and I guess maybe I sort of feel like possibly the query might not be very good? Like it's kind of slow I think, maybe? Not sure though, could be wrong, just a thought, no worries either way.",
        expectedFlag: 'Unclear / Not Actionable',
        mustRetain: 'the sender thinks the query may be slow and wants it looked at',
        style: STYLE_PRESETS.concise.description,
    },
    {
        id: 'style-analytical-unsupported-claim',
        message: "The new caching layer is obviously making everything worse. Rip it out.",
        expectedFlag: 'Unconstructive / Demoralizing',
        mustRetain: 'the sender believes the caching layer is causing a regression and wants it removed',
        style: STYLE_PRESETS.analytical.description,
    },
];

// ---------------------------------------------------------------------------
// Judge
// ---------------------------------------------------------------------------

const JUDGE_SYSTEM = `You grade rewrites of workplace Slack messages. A coaching tool took an ORIGINAL message that had a communication problem and produced a REPHRASE meant to be sent instead.

Grade strictly and independently on each axis. Do not reward the rephrase for being polite — politeness that destroys the message's substance is a FAILURE, not a success.

Return JSON only:
{
  "intentPreserved": true|false,
  "intentNote": "one sentence",
  "noFabrication": true|false,
  "fabricationNote": "one sentence — name any invented fact, deadline, name, metric, or commitment that is not in the original",
  "forceRetained": true|false,
  "forceNote": "one sentence — does the rephrase still convey the REQUIRED SUBSTANCE with comparable seriousness and urgency? If it has been softened into a vague pleasantry, or the criticism/ask is no longer recognizable, this is false",
  "styleAdherence": 0-100
}

"styleAdherence" scores how well the rephrase matches the TARGET STYLE. If no target style is given, return 50.`;

interface JudgeVerdict {
    intentPreserved: boolean;
    intentNote: string;
    noFabrication: boolean;
    fabricationNote: string;
    forceRetained: boolean;
    forceNote: string;
    styleAdherence: number;
}

async function judgeRephrase(c: RephraseCase, rephrase: string): Promise<JudgeVerdict> {
    const user = [
        `ORIGINAL: ${c.message}`,
        `REPHRASE: ${rephrase}`,
        `REQUIRED SUBSTANCE (the rephrase must still convey this): ${c.mustRetain}`,
        c.style ? `TARGET STYLE: ${c.style}` : 'TARGET STYLE: (none)',
    ].join('\n\n');
    return judgeJson<JudgeVerdict>(JUDGE_SYSTEM, user);
}

// ---------------------------------------------------------------------------
// Per-case run
// ---------------------------------------------------------------------------

interface Scored {
    c: RephraseCase;
    rephrase: string | null;
    produced: boolean;
    flagCleared: boolean;
    residualFlags: string[];
    verdict: JudgeVerdict | null;
    lengthRatio: number;
    passed: boolean;
    notes: string[];
}

async function runCase(c: RephraseCase): Promise<Scored> {
    const analysis = await withRetry(() =>
        analyzeMessage(c.message, DEFAULT_COACHING_FLAGS, {
            context: c.context ?? [],
            messageTs: '9999999999',
            preferredStyle: c.style,
        })
    );

    const notes: string[] = [];
    const rephrase = analysis.suggestedRephrase;

    if (!rephrase) {
        notes.push(
            analysis.harmful
                ? 'no rephrase — classified harmful (correct behaviour for abuse, but unexpected for this case)'
                : `no rephrase produced (flags: ${analysis.flags.map(f => f.flagName).join(', ') || 'none'})`
        );
        return {
            c, rephrase: null, produced: false, flagCleared: false, residualFlags: [],
            verdict: null, lengthRatio: 0, passed: false, notes,
        };
    }

    // Objective self-consistency: feed the rewrite back through the classifier.
    // If it still trips the flag it was meant to fix, the rewrite did not do its
    // job — no judge required, and this check cannot drift with judge prompts.
    const recheck = await withRetry(() =>
        analyzeMessage(rephrase, DEFAULT_COACHING_FLAGS, { messageTs: '9999999999' })
    );
    const residualFlags = recheck.flags.map(f => f.flagName);
    const flagCleared = !residualFlags.includes(c.expectedFlag);
    if (!flagCleared) notes.push(`rephrase still flags as ${c.expectedFlag}`);

    const verdict = await withRetry(() => judgeRephrase(c, rephrase));
    if (!verdict.intentPreserved) notes.push(`intent: ${verdict.intentNote}`);
    if (!verdict.noFabrication) notes.push(`fabrication: ${verdict.fabricationNote}`);
    if (!verdict.forceRetained) notes.push(`force lost: ${verdict.forceNote}`);

    const lengthRatio = rephrase.length / Math.max(c.message.length, 1);
    if (lengthRatio > 3) notes.push(`rephrase is ${lengthRatio.toFixed(1)}x the original length`);

    // A case passes only if the rewrite is sendable on every axis that matters:
    // it fixed the problem, and it did so without changing, inventing, or
    // defanging the message.
    const passed =
        flagCleared && verdict.intentPreserved && verdict.noFabrication && verdict.forceRetained;

    return { c, rephrase, produced: true, flagCleared, residualFlags, verdict, lengthRatio, passed, notes };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    printHeader(
        'Clarity rephrase-quality eval',
        `${CASES.length} cases · judge: ${JUDGE_MODEL} (independent of Portkey) · concurrency=${CONCURRENCY}`
    );

    const reporter = createReporter();
    await reporter.startRun('rephrase-quality', { cases: CASES.length, judge: JUDGE_MODEL });

    const scored = await mapPool(CASES, CONCURRENCY, async c => {
        const s = await runCase(c);
        console.log(`  ${s.passed ? '✅' : '❌'} ${pad(c.id, 34)}${s.rephrase ? '' : ' (no rephrase)'}`);
        const result: EvalCaseResult = {
            caseId: c.id,
            input: { message: c.message, expectedFlag: c.expectedFlag, style: c.style ?? null },
            output: { rephrase: s.rephrase, residualFlags: s.residualFlags },
            scores: {
                flag_cleared: s.flagCleared ? 1 : 0,
                intent_preserved: s.verdict?.intentPreserved ? 1 : 0,
                no_fabrication: s.verdict?.noFabrication ? 1 : 0,
                force_retained: s.verdict?.forceRetained ? 1 : 0,
                style_adherence: s.verdict?.styleAdherence ?? 0,
                length_ratio: Number(s.lengthRatio.toFixed(2)),
            },
            passed: s.passed,
            notes: s.notes,
            metadata: { expectedFlag: c.expectedFlag, hasStyle: !!c.style },
        };
        await reporter.record(result);
        return s;
    });

    // ---- Scorecard ----
    console.log(
        '\n' + pad('case', 34) + pad('cleared', 9) + pad('intent', 8) + pad('no-fab', 8) + pad('force', 7) + pad('style', 7) + 'len'
    );
    console.log('-'.repeat(80));
    for (const s of scored) {
        const v = s.verdict;
        console.log(
            pad(s.c.id, 34) +
                pad(s.flagCleared ? 'yes' : 'NO', 9) +
                pad(v ? (v.intentPreserved ? 'yes' : 'NO') : '—', 8) +
                pad(v ? (v.noFabrication ? 'yes' : 'NO') : '—', 8) +
                pad(v ? (v.forceRetained ? 'yes' : 'NO') : '—', 7) +
                pad(v && s.c.style ? v.styleAdherence : '—', 7) +
                (s.produced ? `${s.lengthRatio.toFixed(1)}x` : '—')
        );
    }

    // ---- Aggregates ----
    const withRephrase = scored.filter(s => s.produced);
    const rate = (f: (s: Scored) => boolean) =>
        withRephrase.length ? withRephrase.filter(f).length / withRephrase.length : 0;

    const styled = withRephrase.filter(s => s.c.style && s.verdict);
    const metrics = {
        produced: scored.length ? withRephrase.length / scored.length : 0,
        flag_cleared: rate(s => s.flagCleared),
        intent_preserved: rate(s => !!s.verdict?.intentPreserved),
        no_fabrication: rate(s => !!s.verdict?.noFabrication),
        force_retained: rate(s => !!s.verdict?.forceRetained),
        overall_pass: scored.length ? scored.filter(s => s.passed).length / scored.length : 0,
        style_adherence_mean: styled.length
            ? styled.reduce((a, s) => a + (s.verdict?.styleAdherence ?? 0), 0) / styled.length / 100
            : NaN,
    };

    console.log('\n-- summary --');
    console.log(`  rephrase produced:   ${pct(metrics.produced)} (${withRephrase.length}/${scored.length})`);
    console.log(`  flag cleared:        ${pct(metrics.flag_cleared)}   (rewrite no longer trips its own flag)`);
    console.log(`  intent preserved:    ${pct(metrics.intent_preserved)}`);
    console.log(`  no fabrication:      ${pct(metrics.no_fabrication)}`);
    console.log(`  force retained:      ${pct(metrics.force_retained)}   (criticism/ask survived the rewrite)`);
    console.log(`  style adherence:     ${Number.isNaN(metrics.style_adherence_mean) ? '—' : pct(metrics.style_adherence_mean)} (${styled.length} styled cases)`);
    console.log(`  OVERALL pass:        ${pct(metrics.overall_pass)}`);

    const failures = scored.filter(s => !s.passed);
    if (failures.length) {
        console.log('\n-- failures --');
        for (const f of failures) {
            console.log(`  ${f.c.id}`);
            console.log(`    original: ${f.c.message}`);
            if (f.rephrase) console.log(`    rephrase: ${f.rephrase}`);
            for (const n of f.notes) console.log(`    · ${n}`);
        }
    }

    // Loose on purpose — these run against a live model, and a gate tight
    // enough to catch every borderline case would go red on sampling noise and
    // get ignored. Fabrication is held highest because it's the failure that
    // can actually harm a user.
    const ok = gate(metrics, {
        produced: 0.85,
        flag_cleared: 0.7,
        intent_preserved: 0.85,
        no_fabrication: 0.9,
        force_retained: 0.75,
    });

    await reporter.finishRun({
        total: scored.length,
        passed: scored.filter(s => s.passed).length,
        failed: failures.length,
        aggregates: metrics,
        ok,
    });
}

main().catch(e => {
    console.error('eval crashed:', e);
    process.exitCode = 1;
});
