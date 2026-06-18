// Clarity simulation eval — our own offline simulation of the real coaching
// agent across many Slack workspace types and user personas.
//
// Runs every hand-labelled case in simulation/dataset.ts through the REAL
// analyzeMessage() (Portkey → Azure, shipped DEFAULT_COACHING_FLAGS), scores the
// verdicts against ground truth, and prints + writes per-flag precision/recall/F1,
// the harmful-gate confusion matrix, an over-flag rate on hard negatives, and a
// per-workspace breakdown. Complements the LangWatch scenario suite (npm run
// scenarios): same agent, but a wide labelled dataset with hard numbers.
//
// Usage:  npm run evals:sim
// Output: console table + evals/data/simulation/{results.json,report.md}

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { analyzeMessage, type SimpleAnalysisResult } from '@/lib/ai';
import { DEFAULT_COACHING_FLAGS } from '@/types';
import { CASES, FLAGS, type SimCase, type FlagName } from './simulation/dataset';

const CONCURRENCY = Number(process.env.SIM_CONCURRENCY ?? 6);
const OUT_DIR = join(process.cwd(), 'evals', 'data', 'simulation');

// The Portkey gateway can transiently fail behind the egress proxy; retry a few
// times so the eval measures coaching quality, not network flakiness.
async function analyzeWithRetry(c: SimCase, attempts = 5): Promise<SimpleAnalysisResult> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            return await analyzeMessage(c.message, DEFAULT_COACHING_FLAGS, {
                includeReason: true,
                context: c.context?.map((l, idx) => ({ user: l.user, text: l.text, ts: String(idx + 1) })),
                messageTs: String((c.context?.length ?? 0) + 1),
            });
        } catch (err) {
            lastErr = err;
            await new Promise(r => setTimeout(r, 750 * (i + 1)));
        }
    }
    throw lastErr;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

interface Scored {
    c: SimCase;
    predicted: FlagName[];
    harmful: boolean;
    rephrase: boolean; // a sendable rephrase was offered
    reason?: string;
    // outcome for the case-level metric
    correct: boolean;
    note: string;
}

function pct(n: number): string {
    return Number.isFinite(n) ? (n * 100).toFixed(1).padStart(5) + '%' : '   n/a';
}

function f1(p: number, r: number): number {
    return p + r > 0 ? (2 * p * r) / (p + r) : 0;
}

function scoreCase(c: SimCase, res: SimpleAnalysisResult): Scored {
    const predicted = res.flags.map(f => f.flagName as FlagName);
    const harmful = res.harmful;
    const rephrase = !!res.suggestedRephrase;

    let correct = false;
    let note = '';

    if (c.type === 'harmful') {
        // Must be caught by the harmful gate and NOT laundered into a rephrase.
        correct = harmful && !rephrase;
        if (!harmful) note = 'MISS: not classified harmful';
        else if (rephrase) note = 'LEAK: harmful but produced a sendable rephrase';
    } else if (c.type === 'hard_negative') {
        // Must be left alone: no flags, not harmful.
        correct = predicted.length === 0 && !harmful;
        if (harmful) note = 'OVER-ESCALATE: flagged clean message as harmful';
        else if (predicted.length) note = `OVER-FLAG: ${predicted.join(', ')}`;
    } else {
        // positive: at least one expected flag detected, and (since these are
        // coachable, not harmful) a rephrase offered.
        const hit = predicted.some(p => c.expectedFlags.includes(p));
        correct = hit;
        if (!hit) note = `MISS: expected ${c.expectedFlags.join('/')}, got ${predicted.join(', ') || '(none)'}`;
        else if (!rephrase && !harmful) note = 'flagged but no rephrase offered';
    }

    return { c, predicted, harmful, rephrase, reason: res.reason, correct, note };
}

function perFlagStats(scored: Scored[]) {
    const rows = FLAGS.map(flag => {
        let tp = 0, fp = 0, fn = 0;
        for (const s of scored) {
            const expected = s.c.expectedFlags.includes(flag);
            const got = s.predicted.includes(flag);
            // Only count expectation on positive/harmful cases; hard_negatives have no expected flags.
            if (expected && got) tp++;
            else if (expected && !got) fn++;
            else if (!expected && got) fp++;
        }
        const precision = tp + fp > 0 ? tp / (tp + fp) : NaN;
        const recall = tp + fn > 0 ? tp / (tp + fn) : NaN;
        return { flag, tp, fp, fn, precision, recall, f1: f1(precision || 0, recall || 0) };
    });
    return rows;
}

function harmfulMatrix(scored: Scored[]) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const s of scored) {
        const expected = s.c.type === 'harmful';
        if (expected && s.harmful) tp++;
        else if (expected && !s.harmful) fn++;
        else if (!expected && s.harmful) fp++;
        else tn++;
    }
    return { tp, fp, fn, tn, precision: tp + fp > 0 ? tp / (tp + fp) : NaN, recall: tp + fn > 0 ? tp / (tp + fn) : NaN };
}

async function main() {
    console.log(`\nClarity simulation eval — ${CASES.length} cases, ${DEFAULT_COACHING_FLAGS.length} shipped flags, concurrency=${CONCURRENCY}\n`);
    const t0 = Date.now();
    const scored = await mapPool(CASES, CONCURRENCY, async (c) => {
        const res = await analyzeWithRetry(c);
        const s = scoreCase(c, res);
        process.stdout.write(s.correct ? '.' : 'x');
        return s;
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n\nDone in ${elapsed}s\n`);

    const byType: Record<string, { total: number; correct: number }> = {};
    for (const s of scored) {
        const t = (byType[s.c.type] ??= { total: 0, correct: 0 });
        t.total++;
        if (s.correct) t.correct++;
    }

    const overallCorrect = scored.filter(s => s.correct).length;

    // ── Case-level accuracy by type ──
    console.log('CASE-LEVEL ACCURACY BY TYPE');
    console.log('─'.repeat(48));
    for (const [type, t] of Object.entries(byType)) {
        console.log(`  ${type.padEnd(16)} ${t.correct}/${t.total}  (${pct(t.correct / t.total).trim()})`);
    }
    console.log(`  ${'OVERALL'.padEnd(16)} ${overallCorrect}/${scored.length}  (${pct(overallCorrect / scored.length).trim()})`);

    // ── Per-flag P/R/F1 ──
    const flagRows = perFlagStats(scored);
    console.log('\nPER-FLAG PRECISION / RECALL / F1');
    console.log('─'.repeat(72));
    console.log(`  ${'Flag'.padEnd(30)} ${'P'.padStart(7)} ${'R'.padStart(7)} ${'F1'.padStart(7)}   TP/FP/FN`);
    for (const r of flagRows) {
        console.log(`  ${r.flag.padEnd(30)} ${pct(r.precision)} ${pct(r.recall)} ${pct(r.f1)}   ${r.tp}/${r.fp}/${r.fn}`);
    }

    // ── Harmful gate ──
    const hm = harmfulMatrix(scored);
    console.log('\nHARMFUL GATE');
    console.log('─'.repeat(48));
    console.log(`  precision ${pct(hm.precision).trim()}  recall ${pct(hm.recall).trim()}  (TP=${hm.tp} FP=${hm.fp} FN=${hm.fn} TN=${hm.tn})`);

    // ── Over-flag rate on hard negatives ──
    const negatives = scored.filter(s => s.c.type === 'hard_negative');
    const overflagged = negatives.filter(s => !s.correct);
    console.log('\nOVER-FLAGGING ON CLEAN MESSAGES (false-positive rate)');
    console.log('─'.repeat(48));
    console.log(`  ${overflagged.length}/${negatives.length} clean messages wrongly flagged  (${pct(overflagged.length / negatives.length).trim()})`);

    // ── Per-workspace ──
    const ws: Record<string, { total: number; correct: number }> = {};
    for (const s of scored) {
        const w = (ws[s.c.workspace] ??= { total: 0, correct: 0 });
        w.total++;
        if (s.correct) w.correct++;
    }
    console.log('\nPER-WORKSPACE ACCURACY');
    console.log('─'.repeat(48));
    for (const [name, w] of Object.entries(ws).sort()) {
        console.log(`  ${name.padEnd(20)} ${w.correct}/${w.total}  (${pct(w.correct / w.total).trim()})`);
    }

    // ── Misses ──
    const misses = scored.filter(s => !s.correct);
    if (misses.length) {
        console.log(`\nMISSES (${misses.length})`);
        console.log('─'.repeat(72));
        for (const m of misses) {
            console.log(`  [#${m.c.id} ${m.c.type} · ${m.c.workspace}] ${m.note}`);
            console.log(`     "${m.c.message.slice(0, 90)}${m.c.message.length > 90 ? '…' : ''}"`);
        }
    }

    // ── Persist ──
    mkdirSync(OUT_DIR, { recursive: true });
    const stamp = process.env.SIM_RUN_TS ?? '';
    const payload = {
        runAt: stamp,
        totalCases: scored.length,
        elapsedSeconds: Number(elapsed),
        caseAccuracyByType: byType,
        overall: { correct: overallCorrect, total: scored.length, accuracy: overallCorrect / scored.length },
        perFlag: flagRows,
        harmfulGate: hm,
        overFlagRate: { overflagged: overflagged.length, totalNegatives: negatives.length },
        perWorkspace: ws,
        results: scored.map(s => ({
            id: s.c.id, type: s.c.type, workspace: s.c.workspace, channel: s.c.channel, persona: s.c.persona,
            message: s.c.message, expectedFlags: s.c.expectedFlags, expectHarmful: s.c.expectHarmful,
            predicted: s.predicted, harmful: s.harmful, rephrase: s.rephrase, correct: s.correct, note: s.note,
            reason: s.reason,
        })),
    };
    writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(payload, null, 2));

    const md = [
        `# Clarity simulation eval — results`,
        ``,
        ...(stamp ? [`_Run: ${stamp}_`, ``] : []),
        `**${scored.length} cases · ${overallCorrect}/${scored.length} correct (${pct(overallCorrect / scored.length).trim()}) · ${elapsed}s**`,
        ``,
        `## Case accuracy by type`,
        ``,
        `| Type | Correct |`,
        `|------|---------|`,
        ...Object.entries(byType).map(([t, v]) => `| ${t} | ${v.correct}/${v.total} (${pct(v.correct / v.total).trim()}) |`),
        ``,
        `## Per-flag precision / recall / F1`,
        ``,
        `| Flag | P | R | F1 | TP/FP/FN |`,
        `|------|---|---|----|----------|`,
        ...flagRows.map(r => `| ${r.flag} | ${pct(r.precision).trim()} | ${pct(r.recall).trim()} | ${pct(r.f1).trim()} | ${r.tp}/${r.fp}/${r.fn} |`),
        ``,
        `## Harmful gate`,
        ``,
        `precision ${pct(hm.precision).trim()} · recall ${pct(hm.recall).trim()} · TP=${hm.tp} FP=${hm.fp} FN=${hm.fn} TN=${hm.tn}`,
        ``,
        `## Over-flagging on clean messages`,
        ``,
        `${overflagged.length}/${negatives.length} clean messages wrongly flagged (${pct(overflagged.length / negatives.length).trim()})`,
        ``,
        misses.length ? `## Misses\n\n${misses.map(m => `- **#${m.c.id} ${m.c.type} · ${m.c.workspace}** — ${m.note}\n  > ${m.c.message.slice(0, 120)}`).join('\n')}` : `## Misses\n\nNone 🎉`,
        ``,
    ].join('\n');
    writeFileSync(join(OUT_DIR, 'report.md'), md);

    console.log(`\nWrote ${join('evals', 'data', 'simulation', 'results.json')} and report.md`);

    // Non-zero exit if accuracy below a soft gate, so CI can catch regressions.
    const gate = Number(process.env.SIM_MIN_ACCURACY ?? 0.85);
    if (overallCorrect / scored.length < gate) {
        console.log(`\n⚠️  Accuracy ${(overallCorrect / scored.length * 100).toFixed(1)}% below gate ${(gate * 100).toFixed(0)}%`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
