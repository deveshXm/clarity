/**
 * Style-baseline quality eval — "how you come across" assessments.
 *
 * Question this answers: is the weekly baseline digest actually about the
 * person it was generated for, or is it plausible-sounding boilerplate that
 * would fit anyone? The existing evals cover the target-style score
 * (`evals:style:deviation`) and the output's structure (`evals:style`), but
 * nothing checked whether the *content* of the assessment is true.
 *
 * Four failure modes, each measured separately:
 *
 *   1. QUOTE FIDELITY  — the digest quotes a message the user never wrote.
 *                        Objective: every quote is matched back against the
 *                        input corpus. This is the failure that destroys trust
 *                        instantly and irrecoverably — being shown words
 *                        attributed to you that you never said.
 *   2. DISCRIMINATION  — the assessment is generic. Tested by handing a judge
 *                        one assessment and TWO different corpora and asking
 *                        which one it describes. A digest that can't be matched
 *                        back to its own author is horoscope text, however
 *                        well-written. This is the sharpest signal in the suite.
 *   3. GROUNDEDNESS    — individual traits aren't supported by the messages.
 *   4. FLATTERY        — the prompt says "do not flatter". A corpus of genuinely
 *                        poor communication must not come back complimentary,
 *                        or the product is useless for the people who need it
 *                        most.
 *
 * Plus a corpus-honesty check: given a thin, repetitive corpus, the summary is
 * required by the prompt to say so rather than confabulate depth.
 *
 * Run: npm run evals:style:baseline
 */
import { analyzeStyleBaseline, type StyleBaselineResult } from '@/lib/ai';
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

// ---------------------------------------------------------------------------
// Personas. Deliberately distinct from one another so DISCRIMINATION means
// something: if the model can't tell the hedging IC from the terse exec, the
// digest isn't reading the person.
// ---------------------------------------------------------------------------

interface Persona {
    id: string;
    /** Plain-language description of the real style, for judging groundedness. */
    truth: string;
    /** True when this corpus is genuinely poor communication (flattery check). */
    poor?: boolean;
    /** True when the corpus is deliberately thin/repetitive (honesty check). */
    thin?: boolean;
    messages: string[];
}

const PERSONAS: Persona[] = [
    {
        id: 'hedging-ic',
        truth: 'Hedges constantly, buries the ask at the end, apologizes for taking up space, rarely states a position outright.',
        messages: [
            "Sorry to bother — I might be wrong about this, but I think maybe the migration could possibly break the reporting job?",
            "Not sure if this is helpful, just a thought, feel free to ignore.",
            "I could be misreading it but it sort of seems like the index isn't being used? Maybe worth a look if you have time.",
            "Sorry, one more thing — no rush at all — did we decide on the retry policy?",
            "This is probably a silly question but what does the `pending` state actually mean here?",
            "I don't want to hold anything up, so happy to go with whatever you all think is best.",
            "Might just be me, but the docs seem a little out of date? Could be wrong.",
            "Apologies for the delay! I was a bit unsure how to approach it.",
            "Just wondering, and totally fine if not, whether we could maybe revisit the timeline?",
            "Hopefully that makes sense, sorry if it's confusing.",
        ],
    },
    {
        id: 'terse-exec',
        truth: 'Extremely short, leads with the decision, assigns an owner and a date, no pleasantries, no explanation.',
        messages: [
            'Approved. Ship it.',
            'No. Revisit in Q3.',
            'Priya owns this. Friday.',
            'Numbers by EOD.',
            'Cut scope. Ship the core.',
            'Who is blocked and on what.',
            'Do it.',
            'Not now.',
            'Move the review to Tuesday.',
            'Send me the one-pager.',
        ],
    },
    {
        id: 'structured-engineer',
        truth: 'Writes long structured handoffs with numbered steps, states assumptions explicitly, separates fact from opinion, cites evidence.',
        messages: [
            "Rollout plan: 1) migrate read path behind flag, 2) backfill overnight, 3) flip writes Thursday, 4) drop the old table after a week of clean metrics.",
            "Fact: p99 went from 180ms to 410ms after the deploy. Opinion: it's the N+1 in the serializer, not the cache.",
            "Assumption I'm making: every tenant has at most one active subscription. If that's wrong, the dedupe logic breaks — can someone confirm?",
            "Three options, with tradeoffs. (a) REST, simplest, more round trips. (b) GraphQL, one round trip, new infra to run. (c) batch endpoint, middle ground. I lean (c).",
            "Evidence for the regression: flamegraph attached, 62% of wall time in `serializeInvoice`.",
            "To reproduce: seed with `fixtures/multi-tenant.json`, run the worker, watch for duplicate charge rows.",
            "Blocked on: schema review. Not blocked on: the client work, which I'll keep going on.",
            "Summary for anyone joining late: we found a double-charge path, it's behind a flag, no customers affected.",
            "I checked the last 30 days of logs — zero occurrences outside staging.",
            "Next steps and owners: I'll do the backfill script, Sam reviews the migration, we decide Thursday.",
        ],
    },
    {
        id: 'poor-communicator',
        poor: true,
        truth: 'Vague, dismissive, and demoralizing. Gives no detail, shuts down discussion, and disparages the work.',
        messages: [
            'this is broken again',
            'nope',
            "doesn't matter, moving on",
            'whatever, do what you want',
            'this whole thing is a mess',
            'why do we even bother',
            'wrong',
            'no idea, ask someone else',
            'still broken',
            'told you it wouldn\'t work',
        ],
    },
    {
        id: 'thin-corpus',
        thin: true,
        truth: 'Almost no signal — a handful of near-identical one-word acknowledgements.',
        messages: ['ok', 'ok', 'sounds good', 'ok', 'yep', 'ok', 'sure', 'ok', 'yep', 'ok'],
    },
];

function toMessages(texts: string[]) {
    const now = Math.floor(Date.now() / 1000);
    return texts.map((text, i) => ({ text, ts: String(now - (texts.length - i) * 60), channelName: 'eng' }));
}

// ---------------------------------------------------------------------------
// Judges
// ---------------------------------------------------------------------------

const MATCH_SYSTEM = `You are given a description of how someone communicates at work, and TWO sets of Slack messages from two different people. Decide which set the description was written about.

Answer honestly. If the description is so generic that it fits both sets equally well, say "neither" — that is a meaningful answer, not a failure to decide.

Return JSON only: {"choice": "A"|"B"|"neither", "why": "one sentence"}`;

const GROUNDED_SYSTEM = `You check whether an assessment of someone's communication style is supported by their actual messages.

Return JSON only:
{
  "groundedTraits": <how many of the listed traits are clearly evidenced by the messages>,
  "totalTraits": <how many traits were listed>,
  "accurate": true|false,
  "note": "one sentence — does the overall summary match the real style described?",
  "flattering": true|false,
  "flatteryNote": "one sentence — is this assessment complimentary in a way the messages do not justify?"
}`;

interface MatchVerdict { choice: 'A' | 'B' | 'neither'; why: string }
interface GroundedVerdict {
    groundedTraits: number;
    totalTraits: number;
    accurate: boolean;
    note: string;
    flattering: boolean;
    flatteryNote: string;
}

function renderBaseline(b: StyleBaselineResult): string {
    return [
        `Summary: ${b.summary}`,
        `Traits: ${b.traits.map(t => `- ${t}`).join('\n')}`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Per-persona run
// ---------------------------------------------------------------------------

interface Scored {
    p: Persona;
    baseline: StyleBaselineResult;
    quotesTotal: number;
    quotesReal: number;
    match: MatchVerdict | null;
    grounded: GroundedVerdict | null;
    thinAcknowledged: boolean | null;
    passed: boolean;
    notes: string[];
}

/** Says-so detection for the thin-corpus honesty requirement. */
function acknowledgesThinCorpus(summary: string): boolean {
    return /\b(too (small|few|little|short)|not enough|limited|sparse|thin|repetitive|insufficient|hard to draw|difficult to draw|little to go on|minimal)\b/i.test(
        summary
    );
}

async function runPersona(p: Persona, all: Persona[]): Promise<Scored> {
    const baseline = await withRetry(() => analyzeStyleBaseline(toMessages(p.messages)));
    const notes: string[] = [];

    // 1 — quote fidelity (objective)
    const quotes = baseline.examples.map(e => e.quote).filter(q => q && q.trim().length > 0);
    const real = quotes.filter(q => quoteAppearsInCorpus(q, p.messages));
    if (real.length < quotes.length) {
        const bogus = quotes.filter(q => !quoteAppearsInCorpus(q, p.messages));
        notes.push(`fabricated quote(s): ${bogus.map(q => JSON.stringify(q)).join(', ')}`);
    }

    // 2 — discrimination. Paired against the most different persona available,
    // so a "neither" verdict really does mean the text was generic.
    let match: MatchVerdict | null = null;
    const other = all.find(o => o.id !== p.id && !o.thin && o.id !== 'poor-communicator') ?? all.find(o => o.id !== p.id);
    if (other && !p.thin) {
        match = await withRetry(() =>
            judgeJson<MatchVerdict>(
                MATCH_SYSTEM,
                [
                    `DESCRIPTION:\n${renderBaseline(baseline)}`,
                    `SET A:\n${p.messages.map(m => `- ${m}`).join('\n')}`,
                    `SET B:\n${other.messages.map(m => `- ${m}`).join('\n')}`,
                ].join('\n\n')
            )
        );
        if (match.choice !== 'A') {
            notes.push(`not distinctive — judge picked "${match.choice}" (${match.why})`);
        }
    }

    // 3 + 4 — groundedness and flattery
    const grounded = await withRetry(() =>
        judgeJson<GroundedVerdict>(
            GROUNDED_SYSTEM,
            [
                `ASSESSMENT:\n${renderBaseline(baseline)}`,
                `THEIR ACTUAL MESSAGES:\n${p.messages.map(m => `- ${m}`).join('\n')}`,
                `INDEPENDENTLY-KNOWN TRUTH ABOUT THIS PERSON: ${p.truth}`,
            ].join('\n\n')
        )
    );
    if (!grounded.accurate) notes.push(`inaccurate summary: ${grounded.note}`);
    if (p.poor && grounded.flattering) notes.push(`flattered a poor communicator: ${grounded.flatteryNote}`);

    // 5 — thin-corpus honesty
    let thinAcknowledged: boolean | null = null;
    if (p.thin) {
        thinAcknowledged = acknowledgesThinCorpus(baseline.summary);
        if (!thinAcknowledged) {
            notes.push(`thin corpus not acknowledged — summary reads: "${baseline.summary}"`);
        }
    }

    const groundedRatio = grounded.totalTraits ? grounded.groundedTraits / grounded.totalTraits : 0;
    const passed =
        real.length === quotes.length &&
        (match === null || match.choice === 'A') &&
        grounded.accurate &&
        groundedRatio >= 0.6 &&
        (!p.poor || !grounded.flattering) &&
        (thinAcknowledged === null || thinAcknowledged);

    return {
        p, baseline,
        quotesTotal: quotes.length, quotesReal: real.length,
        match, grounded, thinAcknowledged, passed, notes,
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    printHeader(
        'Clarity style-baseline quality eval',
        `${PERSONAS.length} personas · judge: ${JUDGE_MODEL} (independent of Portkey) · concurrency=${CONCURRENCY}`
    );

    const reporter = createReporter();
    await reporter.startRun('style-baseline', { personas: PERSONAS.length, judge: JUDGE_MODEL });

    const scored = await mapPool(PERSONAS, CONCURRENCY, async p => {
        const s = await runPersona(p, PERSONAS);
        console.log(`  ${s.passed ? '✅' : '❌'} ${pad(p.id, 22)}quotes ${s.quotesReal}/${s.quotesTotal}`);
        const result: EvalCaseResult = {
            caseId: p.id,
            input: { messages: p.messages, truth: p.truth },
            output: s.baseline,
            scores: {
                quote_fidelity: s.quotesTotal ? s.quotesReal / s.quotesTotal : 1,
                distinctive: s.match ? (s.match.choice === 'A' ? 1 : 0) : 1,
                trait_groundedness: s.grounded?.totalTraits
                    ? s.grounded.groundedTraits / s.grounded.totalTraits
                    : 0,
                accurate: s.grounded?.accurate ? 1 : 0,
                not_flattering: s.grounded?.flattering ? 0 : 1,
            },
            passed: s.passed,
            notes: s.notes,
            metadata: { poor: !!p.poor, thin: !!p.thin },
        };
        await reporter.record(result);
        return s;
    });

    // ---- Scorecard ----
    console.log('\n' + pad('persona', 22) + pad('quotes', 9) + pad('distinct', 10) + pad('grounded', 10) + pad('accurate', 10) + 'flattering');
    console.log('-'.repeat(72));
    for (const s of scored) {
        const g = s.grounded;
        console.log(
            pad(s.p.id, 22) +
                pad(`${s.quotesReal}/${s.quotesTotal}`, 9) +
                pad(s.match ? s.match.choice : 'n/a', 10) +
                pad(g ? `${g.groundedTraits}/${g.totalTraits}` : '—', 10) +
                pad(g ? (g.accurate ? 'yes' : 'NO') : '—', 10) +
                (g ? (g.flattering ? 'YES' : 'no') : '—')
        );
    }

    // ---- Aggregates ----
    const quotesTotal = scored.reduce((a, s) => a + s.quotesTotal, 0);
    const quotesReal = scored.reduce((a, s) => a + s.quotesReal, 0);
    const discriminable = scored.filter(s => s.match);
    const poor = scored.filter(s => s.p.poor);

    const metrics = {
        quote_fidelity: quotesTotal ? quotesReal / quotesTotal : 1,
        distinctive: discriminable.length
            ? discriminable.filter(s => s.match?.choice === 'A').length / discriminable.length
            : 1,
        trait_groundedness: scored.length
            ? scored.reduce(
                  (a, s) => a + (s.grounded?.totalTraits ? s.grounded.groundedTraits / s.grounded.totalTraits : 0),
                  0
              ) / scored.length
            : 0,
        accurate: scored.length ? scored.filter(s => s.grounded?.accurate).length / scored.length : 0,
        not_flattering: poor.length ? poor.filter(s => !s.grounded?.flattering).length / poor.length : 1,
        overall_pass: scored.length ? scored.filter(s => s.passed).length / scored.length : 0,
    };

    console.log('\n-- summary --');
    console.log(`  quote fidelity:      ${pct(metrics.quote_fidelity)} (${quotesReal}/${quotesTotal} quotes traced to a real message)`);
    console.log(`  distinctive:         ${pct(metrics.distinctive)} (judge matched the digest back to its own author)`);
    console.log(`  trait groundedness:  ${pct(metrics.trait_groundedness)}`);
    console.log(`  summary accurate:    ${pct(metrics.accurate)}`);
    console.log(`  not flattering:      ${pct(metrics.not_flattering)} (on deliberately poor communicators)`);
    console.log(`  OVERALL pass:        ${pct(metrics.overall_pass)}`);

    const failures = scored.filter(s => !s.passed);
    if (failures.length) {
        console.log('\n-- failures --');
        for (const f of failures) {
            console.log(`  ${f.p.id}`);
            console.log(`    summary: ${f.baseline.summary}`);
            for (const n of f.notes) console.log(`    · ${n}`);
        }
    }

    // Quote fidelity is gated hardest: a fabricated quote is the one failure
    // here that is indefensible to a user, and it's measured objectively so
    // there's no judge noise to excuse it.
    const ok = gate(metrics, {
        quote_fidelity: 0.95,
        distinctive: 0.75,
        trait_groundedness: 0.6,
        accurate: 0.8,
        not_flattering: 1,
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
