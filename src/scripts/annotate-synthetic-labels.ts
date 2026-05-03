/* eslint-disable no-console */
// Hand-label a stratified sample of the synthetic eval dataset to find out
// whether the LLM-assigned labels in dataset.json actually match what a human
// reviewer would say.
//
// Why: today every score in evals/data/evaluate/epoch_*.json is "how well does
// the production classifier agree with gpt-5.2's labels". If gpt-5.2's labels
// are noisy, every downstream number is suspect. This script measures the
// noise floor.
//
// Workflow:
//   1. Pick a stratified sample (default: 25 positives + 25 hard_negatives).
//   2. For each message, show synthetic label, ask "agree? y/n/?/q".
//   3. Save annotations after every keypress so you can quit and resume.
//   4. At the end, compute TPR/TNR-equivalents and a short interpretation.
//
// Usage:
//   npx tsx --env-file=.env.local src/scripts/annotate-synthetic-labels.ts
//   npx tsx --env-file=.env.local src/scripts/annotate-synthetic-labels.ts --positives 30 --negatives 20
//   npx tsx --env-file=.env.local src/scripts/annotate-synthetic-labels.ts --report-only
//
// Annotations are saved to evals/data/human-annotations/annotations.json.

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

interface DatasetEntry {
    id: number;
    type: "positive" | "hard_negative";
    scenario: string;
    persona: string;
    message: string;
    ground_truth_flags: string[];
}

interface FlagDef {
    name: string;
    description: string;
}

type Verdict = "agree" | "disagree" | "skip";

interface Annotation {
    id: number;
    type: "positive" | "hard_negative";
    synthetic_flags: string[];
    verdict: Verdict;
    note?: string;
    annotated_at: string;
}

interface AnnotationFile {
    sampled_ids: number[];
    annotations: Record<number, Annotation>;
}

const DATASET_PATH = path.resolve("evals/data/generate/dataset.json");
const FLAGS_PATH = path.resolve("evals/data/generate/flags.json");
const ANNOTATIONS_DIR = path.resolve("evals/data/human-annotations");
const ANNOTATIONS_PATH = path.join(ANNOTATIONS_DIR, "annotations.json");

const ARGS: Record<string, string | true> = {};
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--")) {
        const key = a.slice(2);
        const next = process.argv[i + 1];
        if (next && !next.startsWith("--")) {
            ARGS[key] = next;
            i++;
        } else {
            ARGS[key] = true;
        }
    }
}

const POSITIVE_TARGET = parseInt((ARGS.positives as string) ?? "25", 10);
const NEGATIVE_TARGET = parseInt((ARGS.negatives as string) ?? "25", 10);
const REPORT_ONLY = ARGS["report-only"] === true;

// Deterministic shuffle (seeded) so the same invocation always picks the same
// sample. Don't bring in a dep; small mulberry32 inline.
function seededShuffle<T>(arr: T[], seed: number): T[] {
    const a = [...arr];
    let s = seed >>> 0;
    const rng = () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function stratifiedSample(dataset: DatasetEntry[], posTarget: number, negTarget: number): DatasetEntry[] {
    const positives = dataset.filter(d => d.type === "positive");
    const negatives = dataset.filter(d => d.type === "hard_negative");

    // Stratify positives across (persona, primary flag) so we don't over-sample one slice.
    const groupedPos = new Map<string, DatasetEntry[]>();
    for (const p of positives) {
        const primary = p.ground_truth_flags[0] ?? "?";
        const key = `${p.persona}::${primary}`;
        if (!groupedPos.has(key)) groupedPos.set(key, []);
        groupedPos.get(key)!.push(p);
    }
    // Round-robin pick from each group until we hit the target.
    const groups = [...groupedPos.values()].map(g => seededShuffle(g, 42));
    const pickedPos: DatasetEntry[] = [];
    let i = 0;
    while (pickedPos.length < posTarget && groups.some(g => g.length > 0)) {
        const group = groups[i % groups.length];
        if (group.length > 0) pickedPos.push(group.shift()!);
        i++;
    }

    // Negatives: stratify by persona only (they have no flags).
    const groupedNeg = new Map<string, DatasetEntry[]>();
    for (const n of negatives) {
        if (!groupedNeg.has(n.persona)) groupedNeg.set(n.persona, []);
        groupedNeg.get(n.persona)!.push(n);
    }
    const negGroups = [...groupedNeg.values()].map(g => seededShuffle(g, 43));
    const pickedNeg: DatasetEntry[] = [];
    i = 0;
    while (pickedNeg.length < negTarget && negGroups.some(g => g.length > 0)) {
        const group = negGroups[i % negGroups.length];
        if (group.length > 0) pickedNeg.push(group.shift()!);
        i++;
    }

    return [...pickedPos, ...pickedNeg];
}

function loadAnnotations(): AnnotationFile {
    if (!fs.existsSync(ANNOTATIONS_PATH)) {
        return { sampled_ids: [], annotations: {} };
    }
    return JSON.parse(fs.readFileSync(ANNOTATIONS_PATH, "utf-8"));
}

function saveAnnotations(file: AnnotationFile): void {
    fs.mkdirSync(ANNOTATIONS_DIR, { recursive: true });
    fs.writeFileSync(ANNOTATIONS_PATH, JSON.stringify(file, null, 2));
}

function flagDescriptions(flags: FlagDef[], names: string[]): string {
    return names
        .map(n => {
            const def = flags.find(f => f.name === n);
            return def ? `    ${n}: ${def.description}` : `    ${n}: (no definition)`;
        })
        .join("\n");
}

function ask(rl: readline.Interface, prompt: string): Promise<string> {
    return new Promise(resolve => rl.question(prompt, answer => resolve(answer.trim())));
}

function reportAndExit(file: AnnotationFile, dataset: DatasetEntry[]): void {
    const annotations = Object.values(file.annotations);
    const positives = annotations.filter(a => a.type === "positive" && a.verdict !== "skip");
    const negatives = annotations.filter(a => a.type === "hard_negative" && a.verdict !== "skip");
    const skipped = annotations.filter(a => a.verdict === "skip");

    const posAgree = positives.filter(a => a.verdict === "agree").length;
    const negAgree = negatives.filter(a => a.verdict === "agree").length;

    console.log("\n" + "=".repeat(70));
    console.log("HUMAN-VS-SYNTHETIC-LABEL ALIGNMENT REPORT");
    console.log("=".repeat(70));
    console.log(`Sample size: ${file.sampled_ids.length}`);
    console.log(`Annotated:   ${annotations.length}  (${positives.length} positives, ${negatives.length} negatives, ${skipped.length} skipped)`);

    if (positives.length > 0) {
        const rate = (posAgree / positives.length) * 100;
        console.log(`\nPositives — synthetic label correctness (≈ TPR of the labeler):`);
        console.log(`  Agreed: ${posAgree}/${positives.length}  (${rate.toFixed(1)}%)`);
    }
    if (negatives.length > 0) {
        const rate = (negAgree / negatives.length) * 100;
        console.log(`\nHard negatives — synthetic 'no-flag' correctness (≈ TNR of the labeler):`);
        console.log(`  Agreed: ${negAgree}/${negatives.length}  (${rate.toFixed(1)}%)`);
    }

    // Show disagreements so the user can spot patterns.
    const disagreements = annotations.filter(a => a.verdict === "disagree");
    if (disagreements.length > 0) {
        console.log(`\n${disagreements.length} disagreements:`);
        for (const d of disagreements.slice(0, 10)) {
            const entry = dataset.find(e => e.id === d.id);
            const snippet = entry?.message.slice(0, 120).replace(/\n/g, " ") ?? "?";
            console.log(`  • #${d.id} (${d.type}, synth=${d.synthetic_flags.join(",") || "none"}): ${snippet}…`);
            if (d.note) console.log(`    note: ${d.note}`);
        }
        if (disagreements.length > 10) console.log(`  … and ${disagreements.length - 10} more`);
    }

    // Interpretation
    const total = positives.length + negatives.length;
    if (total >= 20) {
        const overall = (posAgree + negAgree) / total;
        console.log("\n" + "-".repeat(70));
        console.log("Interpretation:");
        if (overall >= 0.9) {
            console.log(`  Synthetic labels look reliable (${(overall * 100).toFixed(1)}% agreement).`);
            console.log(`  The eval scores in epoch_*.json are likely meaningful.`);
        } else if (overall >= 0.75) {
            console.log(`  Synthetic labels are noisy but usable (${(overall * 100).toFixed(1)}% agreement).`);
            console.log(`  Treat the existing F1 numbers as ±5–10pp band, not point estimates.`);
        } else {
            console.log(`  Synthetic labels are unreliable (${(overall * 100).toFixed(1)}% agreement).`);
            console.log(`  The eval is measuring agreement-with-gpt-5.2 more than classifier quality.`);
            console.log(`  Recommend: invest in human-curated labels before adding more eval epochs.`);
        }
    } else {
        console.log("\n(Annotate at least 20 messages for a confident interpretation.)");
    }
    console.log("=".repeat(70));
    console.log(`\nFull annotations saved at: ${ANNOTATIONS_PATH}`);
}

async function main(): Promise<void> {
    if (!fs.existsSync(DATASET_PATH)) {
        console.error(`Dataset not found at ${DATASET_PATH}.`);
        process.exit(1);
    }
    const dataset: DatasetEntry[] = JSON.parse(fs.readFileSync(DATASET_PATH, "utf-8"));
    const flags: FlagDef[] = fs.existsSync(FLAGS_PATH) ? JSON.parse(fs.readFileSync(FLAGS_PATH, "utf-8")) : [];

    let file = loadAnnotations();

    if (REPORT_ONLY) {
        reportAndExit(file, dataset);
        return;
    }

    // First run — pick the sample and persist it. Subsequent runs reuse the same IDs.
    if (file.sampled_ids.length === 0) {
        const sample = stratifiedSample(dataset, POSITIVE_TARGET, NEGATIVE_TARGET);
        file.sampled_ids = sample.map(s => s.id);
        saveAnnotations(file);
        console.log(`Picked stratified sample: ${sample.filter(s => s.type === "positive").length} positives + ${sample.filter(s => s.type === "hard_negative").length} negatives`);
    } else {
        const remaining = file.sampled_ids.filter(id => !(id in file.annotations));
        console.log(`Resuming previous session. ${Object.keys(file.annotations).length} done, ${remaining.length} remaining.`);
    }

    const datasetById = new Map(dataset.map(d => [d.id, d]));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("\nKeys: y = agree with synthetic label, n = disagree, ? = skip, q = quit & save report\n");

    for (let idx = 0; idx < file.sampled_ids.length; idx++) {
        const id = file.sampled_ids[idx];
        if (id in file.annotations) continue;

        const entry = datasetById.get(id);
        if (!entry) {
            console.warn(`(Skipping #${id} — not in dataset)`);
            continue;
        }

        console.log("\n" + "─".repeat(70));
        console.log(`#${id}  [${idx + 1}/${file.sampled_ids.length}]   type=${entry.type}   persona=${entry.persona}`);
        console.log(`scenario: ${entry.scenario}`);
        if (entry.type === "positive") {
            console.log(`synthetic flags: ${entry.ground_truth_flags.join(", ")}`);
            console.log(flagDescriptions(flags, entry.ground_truth_flags));
        } else {
            console.log(`synthetic label: NO FLAGS (clean message that the dataset says should NOT be flagged)`);
        }
        console.log("\nMESSAGE:");
        console.log(entry.message.split("\n").map(l => "  " + l).join("\n"));
        console.log();

        const promptText = entry.type === "positive"
            ? `Agree the message is genuinely [${entry.ground_truth_flags.join(", ")}]?  [y/n/?/q] `
            : `Agree the message is genuinely clean (no flag)?  [y/n/?/q] `;

        const answer = (await ask(rl, promptText)).toLowerCase();

        if (answer === "q") {
            console.log("Quitting and saving report…");
            break;
        }

        let verdict: Verdict;
        if (answer === "y") verdict = "agree";
        else if (answer === "n") verdict = "disagree";
        else if (answer === "?" || answer === "s") verdict = "skip";
        else {
            console.log(`(Unrecognized input "${answer}" — recording as skip)`);
            verdict = "skip";
        }

        let note: string | undefined;
        if (verdict === "disagree") {
            const noteAnswer = await ask(rl, "  Optional one-line note (press enter to skip): ");
            if (noteAnswer.length > 0) note = noteAnswer;
        }

        file.annotations[id] = {
            id,
            type: entry.type,
            synthetic_flags: entry.ground_truth_flags,
            verdict,
            note,
            annotated_at: new Date().toISOString(),
        };
        saveAnnotations(file);
    }

    rl.close();
    reportAndExit(file, dataset);
}

main().then(() => process.exit(0), err => {
    console.error("Error:", err);
    process.exit(1);
});
