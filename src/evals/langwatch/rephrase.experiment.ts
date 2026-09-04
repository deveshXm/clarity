/**
 * Rephrase experiment — when Clarity flags a message and offers a rewrite, is
 * the rewrite worth sending?
 *
 * A rephrase fails in five distinct ways that trade off against each other, so
 * they are scored separately rather than as one number:
 *
 *   rephrase_produced   a flagged message got a rewrite at all
 *   flag_cleared        re-run the classifier on the rewrite: its own flag is gone (objective)
 *   intent_preserved    judge: still says what the original said
 *   no_fabrication      judge: no invented fact, deadline, name, metric, or commitment
 *   force_retained      judge, against a per-case "required substance": the ask or
 *                       criticism survived — the one a politeness-optimizer fails
 *   style_adherence     judge, 0-100, only when a target style is set
 *   length_ratio        rewrite length ÷ original length (a 4x rewrite is not a Slack message)
 *
 * Run:  npm run evals:rephrase
 */
import { analyzeMessage } from '@/lib/ai';
import { DEFAULT_COACHING_FLAGS } from '@/types';
import { withRetry, judgeJson, JUDGE_MODEL, CONCURRENCY, pad, printHeader } from '@/lib/evals/harness';
import { REPHRASE_CASES, type RephraseCase } from './datasets/rephrase';
import { langwatchClient, SUT, ratio, mean, finish } from './client';

const MAX_LENGTH_RATIO = 3;

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

interface Scored {
    c: RephraseCase;
    rephrase: string | null;
    flagCleared: boolean;
    residual: string[];
    verdict: JudgeVerdict | null;
    lengthRatio: number;
    passed: boolean;
    notes: string[];
}

async function main() {
    printHeader(
        'Clarity rephrase experiment',
        `${REPHRASE_CASES.length} flagged messages · judge: ${JUDGE_MODEL} (independent of Portkey) · concurrency=${CONCURRENCY}`
    );
    const lw = langwatchClient();
    const experiment = await lw.experiments.init('clarity-rephrase');
    const scored: Scored[] = new Array(REPHRASE_CASES.length);

    await experiment.run(
        REPHRASE_CASES,
        async ({ item: c, index }) => {
            const opts = { context: c.context ?? [], messageTs: '9999999999', preferredStyle: c.style };
            const { result: analysis } = await experiment.withTarget(SUT.name, SUT.metadata, () =>
                withRetry(() => analyzeMessage(c.message, DEFAULT_COACHING_FLAGS, opts))
            );
            const base = { index, target: SUT.name };
            const rephrase = analysis.suggestedRephrase;
            const notes: string[] = [];
            const data = {
                message: c.message,
                expected_flag: c.expectedFlag,
                must_retain: c.mustRetain,
                target_style: c.styleKey ?? null,
                context: c.context ?? [],
                flags: analysis.flags.map(f => f.flagName),
                harmful: analysis.harmful,
                rephrase,
            };

            if (!rephrase) {
                notes.push(
                    analysis.harmful
                        ? 'no rephrase — classified harmful (right for abuse, wrong for this case)'
                        : `no rephrase produced (flags: ${analysis.flags.map(f => f.flagName).join(', ') || 'none'})`
                );
                experiment.log('rephrase_produced', { ...base, passed: false, details: notes[0], data });
                for (const name of ['flag_cleared', 'intent_preserved', 'no_fabrication', 'force_retained', 'style_adherence', 'length_ratio']) {
                    experiment.log(name, { ...base, status: 'skipped', details: 'no rephrase to grade' });
                }
                scored[index] = { c, rephrase: null, flagCleared: false, residual: [], verdict: null, lengthRatio: 0, passed: false, notes };
                console.log(`  ❌ ${pad(c.id, 36)}no rephrase`);
                return;
            }
            experiment.log('rephrase_produced', { ...base, passed: true, data });

            // Objective self-consistency: feed the rewrite back through the
            // classifier. If it still trips the flag it was meant to fix, the
            // rewrite did not do its job — no judge opinion required.
            const recheck = await withRetry(() => analyzeMessage(rephrase, DEFAULT_COACHING_FLAGS, opts));
            const residual = recheck.flags.map(f => f.flagName);
            const flagCleared = !residual.includes(c.expectedFlag) && !recheck.harmful;
            if (!flagCleared) notes.push(`rephrase still flags as ${residual.join(', ') || 'harmful'}`);
            else if (residual.length) notes.push(`own flag cleared but now trips ${residual.join(', ')}`);
            experiment.log('flag_cleared', {
                ...base,
                passed: flagCleared,
                details: residual.length ? `re-classified as: ${residual.join(', ')}` : 'clean on re-classification',
            });

            const verdict = await withRetry(() =>
                judgeJson<JudgeVerdict>(
                    JUDGE_SYSTEM,
                    [
                        `ORIGINAL: ${c.message}`,
                        `REPHRASE: ${rephrase}`,
                        `REQUIRED SUBSTANCE (the rephrase must still convey this): ${c.mustRetain}`,
                        c.style ? `TARGET STYLE: ${c.style}` : 'TARGET STYLE: (none)',
                    ].join('\n\n')
                )
            );
            if (!verdict.intentPreserved) notes.push(`intent lost: ${verdict.intentNote}`);
            if (!verdict.noFabrication) notes.push(`fabricated: ${verdict.fabricationNote}`);
            if (!verdict.forceRetained) notes.push(`force lost: ${verdict.forceNote}`);
            experiment.log('intent_preserved', { ...base, passed: !!verdict.intentPreserved, details: verdict.intentNote });
            experiment.log('no_fabrication', { ...base, passed: !!verdict.noFabrication, details: verdict.fabricationNote });
            experiment.log('force_retained', { ...base, passed: !!verdict.forceRetained, details: verdict.forceNote });
            if (c.style) {
                const adherence = Number(verdict.styleAdherence) || 0;
                experiment.log('style_adherence', { ...base, score: adherence, passed: adherence >= 60, label: c.styleKey });
            } else {
                experiment.log('style_adherence', { ...base, status: 'skipped', details: 'no target style set' });
            }

            const lengthRatio = rephrase.length / Math.max(1, c.message.length);
            if (lengthRatio > MAX_LENGTH_RATIO) notes.push(`rephrase is ${lengthRatio.toFixed(1)}x the original length`);
            experiment.log('length_ratio', {
                ...base,
                score: Number(lengthRatio.toFixed(2)),
                passed: lengthRatio <= MAX_LENGTH_RATIO,
                details: `${c.message.length} → ${rephrase.length} chars`,
            });

            const passed = flagCleared && !!verdict.intentPreserved && !!verdict.noFabrication && !!verdict.forceRetained;
            scored[index] = { c, rephrase, flagCleared, residual, verdict, lengthRatio, passed, notes };
            console.log(
                `  ${passed ? '✅' : '❌'} ${pad(c.id, 36)}cleared=${pad(flagCleared ? 'yes' : 'NO', 4)} intent=${pad(verdict.intentPreserved ? 'yes' : 'NO', 4)} nofab=${pad(verdict.noFabrication ? 'yes' : 'NO', 4)} force=${pad(verdict.forceRetained ? 'yes' : 'NO', 4)} ${lengthRatio.toFixed(1)}x`
            );
        },
        { concurrency: CONCURRENCY }
    );

    // ---- aggregates ---------------------------------------------------------
    const produced = scored.filter(s => s.rephrase);
    const styled = produced.filter(s => s.c.style && s.verdict);

    console.log('\n-- failures --');
    const failed = scored.filter(s => !s.passed);
    if (!failed.length) console.log('  none');
    for (const s of failed) {
        console.log(`  ${s.c.id}\n    original: ${s.c.message}\n    rephrase: ${s.rephrase ?? '(none)'}`);
        for (const n of s.notes) console.log(`    · ${n}`);
    }

    const ok = finish(
        experiment,
        {
            rephrase_produced: ratio(produced.length, scored.length),
            flag_cleared: ratio(produced.filter(s => s.flagCleared).length, produced.length),
            intent_preserved: ratio(produced.filter(s => s.verdict?.intentPreserved).length, produced.length),
            no_fabrication: ratio(produced.filter(s => s.verdict?.noFabrication).length, produced.length),
            force_retained: ratio(produced.filter(s => s.verdict?.forceRetained).length, produced.length),
            style_adherence: mean(styled.map(s => Number(s.verdict!.styleAdherence) || 0)),
            mean_length_ratio: mean(produced.map(s => s.lengthRatio)),
            overall_pass: ratio(scored.filter(s => s.passed).length, scored.length),
        },
        {
            rephrase_produced: 0.85,
            flag_cleared: 0.7,
            intent_preserved: 0.85,
            no_fabrication: 0.9,
            force_retained: 0.75,
        },
        { style_adherence: n => `${n.toFixed(0)}/100`, mean_length_ratio: n => `${n.toFixed(1)}x` }
    );
    if (!ok) process.exitCode = 1;
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
