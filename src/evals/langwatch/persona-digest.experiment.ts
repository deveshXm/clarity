/**
 * Persona-digest experiment — does the "how you come across" digest describe
 * THIS person, or could it have been written about anyone?
 *
 *   quote_fidelity            every quoted example is a real message (objective)
 *   distinctive               a judge shown the digest and TWO corpora picks the right one
 *   trait_groundedness        share of listed traits evidenced by the messages
 *   summary_accurate          summary matches the independently-known truth
 *   not_flattering            a deliberately poor communicator is not praised
 *   thin_corpus_acknowledged  a near-empty corpus is reported as such, not confabulated
 *
 * Distinctiveness is the sharp test: a digest a judge cannot match back to its
 * own author is horoscope text. Quote fidelity is gated hardest — being shown
 * words you never wrote is the one failure a user cannot forgive.
 *
 * Run:  npm run evals:digest
 */
import { analyzeStyleBaseline, type StyleBaselineResult } from '@/lib/ai';
import {
    withRetry,
    judgeJson,
    JUDGE_MODEL,
    quoteAppearsInCorpus,
    CONCURRENCY,
    pad,
    printHeader,
} from '@/lib/evals/harness';
import { PERSONAS, type Persona } from './datasets/style';
import { langwatchClient, SUT, toMessages, ratio, bullet, finish } from './client';

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

interface Scored {
    p: Persona;
    quotesTotal: number;
    quotesReal: number;
    match: MatchVerdict | null;
    grounded: GroundedVerdict;
    thinAcknowledged: boolean | null;
    passed: boolean;
}

function renderBaseline(b: StyleBaselineResult): string {
    return [`Summary: ${b.summary}`, `Traits:\n${bullet(b.traits)}`].join('\n');
}

/** Says-so detection for the thin-corpus honesty requirement. */
function acknowledgesThinCorpus(summary: string): boolean {
    return /\b(too (small|few|little|short)|not enough|limited|sparse|thin|repetitive|insufficient|hard to draw|difficult to draw|little to go on|minimal)\b/i.test(
        summary
    );
}

async function main() {
    printHeader(
        'Clarity persona-digest experiment',
        `${PERSONAS.length} personas · judge: ${JUDGE_MODEL} (independent of Portkey) · concurrency=${CONCURRENCY}`
    );
    const lw = langwatchClient();
    const experiment = await lw.experiments.init('clarity-persona-digest');
    const scored: Scored[] = new Array(PERSONAS.length);

    await experiment.run(
        PERSONAS,
        async ({ item: p, index }) => {
            const { result: baseline } = await experiment.withTarget(SUT.name, SUT.metadata, () =>
                withRetry(() => analyzeStyleBaseline(toMessages(p.messages)))
            );
            const base = { index, target: SUT.name };

            // 1 — quote fidelity (objective)
            const quotes = baseline.examples.map(e => e.quote).filter(q => q && q.trim().length > 0);
            const bogus = quotes.filter(q => !quoteAppearsInCorpus(q, p.messages));
            experiment.log('quote_fidelity', {
                ...base,
                score: ratio(quotes.length - bogus.length, quotes.length || 1),
                passed: bogus.length === 0,
                details: bogus.length ? `fabricated: ${bogus.map(q => JSON.stringify(q)).join(', ')}` : `${quotes.length}/${quotes.length} quotes real`,
                data: { messages: p.messages, truth: p.truth, summary: baseline.summary, traits: baseline.traits, examples: baseline.examples },
            });

            // 2 — distinctiveness, paired against the most different persona
            let match: MatchVerdict | null = null;
            const other =
                PERSONAS.find(o => o.id !== p.id && !o.thin && !o.poor) ?? PERSONAS.find(o => o.id !== p.id);
            if (other && !p.thin) {
                match = await withRetry(() =>
                    judgeJson<MatchVerdict>(
                        MATCH_SYSTEM,
                        [
                            `DESCRIPTION:\n${renderBaseline(baseline)}`,
                            `SET A:\n${bullet(p.messages)}`,
                            `SET B:\n${bullet(other.messages)}`,
                        ].join('\n\n')
                    )
                );
                experiment.log('distinctive', {
                    ...base,
                    passed: match.choice === 'A',
                    label: match.choice,
                    details: `vs ${other.id}: ${match.why}`,
                });
            } else {
                experiment.log('distinctive', { ...base, status: 'skipped', details: 'thin corpus — nothing to be distinctive about' });
            }

            // 3 + 4 — groundedness, accuracy, flattery
            const grounded = await withRetry(() =>
                judgeJson<GroundedVerdict>(
                    GROUNDED_SYSTEM,
                    [
                        `ASSESSMENT:\n${renderBaseline(baseline)}`,
                        `THEIR ACTUAL MESSAGES:\n${bullet(p.messages)}`,
                        `INDEPENDENTLY-KNOWN TRUTH ABOUT THIS PERSON: ${p.truth}`,
                    ].join('\n\n')
                )
            );
            const groundedRatio = ratio(grounded.groundedTraits, grounded.totalTraits);
            experiment.log('trait_groundedness', {
                ...base,
                score: groundedRatio,
                passed: groundedRatio >= 0.6,
                details: `${grounded.groundedTraits}/${grounded.totalTraits} traits evidenced`,
            });
            experiment.log('summary_accurate', { ...base, passed: !!grounded.accurate, details: grounded.note });
            if (p.poor) {
                experiment.log('not_flattering', { ...base, passed: !grounded.flattering, details: grounded.flatteryNote });
            }

            // 5 — thin-corpus honesty
            let thinAcknowledged: boolean | null = null;
            if (p.thin) {
                thinAcknowledged = acknowledgesThinCorpus(baseline.summary);
                experiment.log('thin_corpus_acknowledged', {
                    ...base,
                    passed: thinAcknowledged,
                    details: thinAcknowledged ? 'summary admits the corpus is thin' : `confabulated: "${baseline.summary}"`,
                });
            }

            const passed =
                bogus.length === 0 &&
                (match === null || match.choice === 'A') &&
                !!grounded.accurate &&
                groundedRatio >= 0.6 &&
                (!p.poor || !grounded.flattering) &&
                (thinAcknowledged === null || thinAcknowledged);

            scored[index] = { p, quotesTotal: quotes.length, quotesReal: quotes.length - bogus.length, match, grounded, thinAcknowledged, passed };
            console.log(`  ${passed ? '✅' : '❌'} ${pad(p.id, 22)}quotes ${quotes.length - bogus.length}/${quotes.length}  distinct=${match?.choice ?? 'n/a'}  grounded=${grounded.groundedTraits}/${grounded.totalTraits}`);
        },
        { concurrency: CONCURRENCY }
    );

    // ---- aggregates ---------------------------------------------------------
    const judged = scored.filter(s => s.match);
    const poor = scored.filter(s => s.p.poor);
    const thin = scored.filter(s => s.p.thin);
    const quotesTotal = scored.reduce((a, s) => a + s.quotesTotal, 0);
    const quotesReal = scored.reduce((a, s) => a + s.quotesReal, 0);

    console.log('\n-- failures --');
    const failed = scored.filter(s => !s.passed);
    if (!failed.length) console.log('  none');
    for (const s of failed) {
        console.log(`  ${s.p.id}`);
        if (s.quotesReal < s.quotesTotal) console.log(`    · fabricated quote(s)`);
        if (s.match && s.match.choice !== 'A') console.log(`    · not distinctive — judge picked "${s.match.choice}" (${s.match.why})`);
        if (!s.grounded.accurate) console.log(`    · inaccurate summary: ${s.grounded.note}`);
        if (s.p.poor && s.grounded.flattering) console.log(`    · flattered a poor communicator: ${s.grounded.flatteryNote}`);
        if (s.thinAcknowledged === false) console.log(`    · thin corpus not acknowledged`);
    }

    const ok = finish(
        experiment,
        {
            quote_fidelity: ratio(quotesReal, quotesTotal),
            distinctive: ratio(judged.filter(s => s.match!.choice === 'A').length, judged.length),
            trait_groundedness: ratio(
                scored.reduce((a, s) => a + s.grounded.groundedTraits, 0),
                scored.reduce((a, s) => a + s.grounded.totalTraits, 0)
            ),
            summary_accurate: ratio(scored.filter(s => s.grounded.accurate).length, scored.length),
            not_flattering: ratio(poor.filter(s => !s.grounded.flattering).length, poor.length),
            thin_corpus_acknowledged: ratio(thin.filter(s => s.thinAcknowledged).length, thin.length),
            persona_pass_rate: ratio(scored.filter(s => s.passed).length, scored.length),
        },
        {
            quote_fidelity: 0.95,
            distinctive: 0.75,
            trait_groundedness: 0.6,
            summary_accurate: 0.8,
            not_flattering: 1.0,
        }
    );
    if (!ok) process.exitCode = 1;
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
