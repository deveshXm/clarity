// Local-only: simulates the daily/weekly digest a user would receive after
// sending ~20 messages. Picks 20 messages from ONE persona in the synthetic
// dataset (so the baseline is coherent, like a single real user) and runs them
// through analyzeStyleBaseline + analyzeStyleDeviation.
//
// Usage:
//   npx tsx --env-file=.env.local src/scripts/style-digest-20-msg.ts
//   npx tsx --env-file=.env.local src/scripts/style-digest-20-msg.ts "Direct CTO"
//   npx tsx --env-file=.env.local src/scripts/style-digest-20-msg.ts "Anxious Junior" warm

import * as fs from "node:fs";
import * as path from "node:path";

import { analyzeStyleBaseline, analyzeStyleDeviation } from "@/lib/ai";
import { STYLE_PRESETS } from "@/types";

interface DatasetEntry {
    id: number;
    type: string;
    scenario: string;
    persona: string;
    message: string;
    ground_truth_flags: string[];
}

const PERSONA_LABELS = {
    "anxious junior": "Anxious Junior Developer (afraid to ask for help)",
    "passionate pm": "Passionate Product Manager (tends to over-promise)",
    "direct cto": "Direct CTO (brief, borders on rude)",
} as const;

function resolvePersona(arg: string | undefined): string {
    if (!arg) return PERSONA_LABELS["anxious junior"];
    const lower = arg.toLowerCase();
    for (const [key, full] of Object.entries(PERSONA_LABELS)) {
        if (full.toLowerCase().includes(lower) || key.includes(lower)) return full;
    }
    return PERSONA_LABELS["anxious junior"];
}

function resolveTarget(arg: string | undefined): { label: string; description: string } | null {
    if (!arg) return null;
    if (arg in STYLE_PRESETS) {
        const p = STYLE_PRESETS[arg as keyof typeof STYLE_PRESETS];
        return { label: p.label, description: p.description };
    }
    return { label: "Custom", description: arg };
}

async function main(): Promise<void> {
    const personaArg = process.argv[2];
    const targetArg = process.argv[3];

    const datasetPath = path.resolve("evals/data/generate/dataset.json");
    if (!fs.existsSync(datasetPath)) {
        console.error(`Dataset not found at ${datasetPath}. Run \`npm run evals:generate\` first.`);
        process.exit(1);
    }

    const dataset: DatasetEntry[] = JSON.parse(fs.readFileSync(datasetPath, "utf-8"));
    const persona = resolvePersona(personaArg);
    const target = resolveTarget(targetArg);

    // Take the first 20 messages from this persona to mirror "a real user wrote these".
    const corpus = dataset
        .filter(e => e.persona === persona)
        .slice(0, 20)
        .map((e, i) => ({
            text: e.message,
            ts: String(Math.floor(Date.now() / 1000) - (20 - i)),
            channelName: e.scenario.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30),
        }));

    if (corpus.length < 20) {
        console.warn(`Only ${corpus.length} messages found for persona "${persona}". Continuing.`);
    }

    console.log(`# Simulated digest for: ${persona}\n`);
    console.log(`Corpus: ${corpus.length} messages.\n`);
    console.log(`Target style: ${target ? `"${target.label}"` : "(none — baseline only)"}\n`);
    console.log("---\n");

    console.log("**Sample of the corpus** (showing 3 to give you a feel):");
    for (const m of corpus.slice(0, 3)) {
        console.log(`  > ${m.text.slice(0, 200)}${m.text.length > 200 ? "…" : ""}`);
    }
    console.log("\n---\n");

    console.log("Running baseline analysis...\n");
    const baseline = await analyzeStyleBaseline(corpus);

    console.log("## What the user's DM would say — BASELINE section\n");
    console.log(`**Summary:** ${baseline.summary}\n`);
    if (baseline.traits.length > 0) {
        console.log("**Traits that stood out:**");
        for (const t of baseline.traits) console.log(`  • ${t}`);
        console.log();
    }
    if (baseline.examples.length > 0) {
        console.log("**Quoted examples:**");
        for (const ex of baseline.examples) {
            console.log(`  > ${ex.quote}`);
            console.log(`    _${ex.observation}_`);
        }
        console.log();
    }

    if (target) {
        console.log("---\n");
        console.log(`Running deviation analysis vs "${target.label}"...\n`);
        const deviation = await analyzeStyleDeviation(corpus, target.description);

        console.log(`## DEVIATION section — target: "${target.label}"\n`);
        console.log(`**Adherence score:** ${deviation.adherenceScore} / 100\n`);
        if (deviation.deviations.length > 0) {
            console.log("**Where they drifted:**");
            for (const d of deviation.deviations) {
                console.log(`  > ${d.quote}`);
                console.log(`    *Why:* ${d.why}`);
                console.log(`    *Try:* ${d.suggestion}\n`);
            }
        }
        if (deviation.strengths.length > 0) {
            console.log("**What they nailed:**");
            for (const s of deviation.strengths) console.log(`  • ${s}`);
            console.log();
        }
    } else {
        console.log("**Footer (only shown when no target is set):**");
        console.log("  💡 Set a target style in `/clarity-settings` to see how well you tracked it each week.\n");
    }

    console.log("Done.");
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error("Error:", err);
        process.exit(1);
    }
);
