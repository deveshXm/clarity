// Local-only: feeds the eval epoch messages through the style-digest pipeline
// (analyzeStyleBaseline + analyzeStyleDeviation) and prints what the user
// would receive in their Slack DM. No network calls to Slack.
//
// Usage:
//   npx tsx --env-file=.env.local src/scripts/test-style-digest.ts                # uses epoch_1.json, no target style
//   npx tsx --env-file=.env.local src/scripts/test-style-digest.ts epoch_3        # uses epoch_3.json, no target
//   npx tsx --env-file=.env.local src/scripts/test-style-digest.ts epoch_1 direct # also runs deviation against the "direct" preset
//   npx tsx --env-file=.env.local src/scripts/test-style-digest.ts epoch_1 "<custom style description>"

import * as fs from "node:fs";
import * as path from "node:path";

import { analyzeStyleBaseline, analyzeStyleDeviation } from "@/lib/ai";
import { STYLE_PRESETS } from "@/types";

interface EpochResult {
    id: number;
    type: string;
    message: string;
}

interface EpochFile {
    epoch: number;
    results: EpochResult[];
}

function resolveTargetStyle(arg: string | undefined): { label: string; description: string } | null {
    if (!arg) return null;
    if (arg in STYLE_PRESETS) {
        const preset = STYLE_PRESETS[arg as keyof typeof STYLE_PRESETS];
        return { label: preset.label, description: preset.description };
    }
    return { label: "Custom", description: arg };
}

function formatPreviewBlocks(label: string, lines: string[]): string {
    return `\n=== ${label} ===\n${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
    const epochArg = process.argv[2] ?? "epoch_1";
    const styleArg = process.argv[3];

    const epochName = epochArg.endsWith(".json") ? epochArg : `${epochArg}.json`;
    const epochPath = path.resolve("evals/data/evaluate", epochName);

    if (!fs.existsSync(epochPath)) {
        console.error(`Epoch file not found: ${epochPath}`);
        process.exit(1);
    }

    const epoch: EpochFile = JSON.parse(fs.readFileSync(epochPath, "utf-8"));
    console.log(`Loaded ${epochName}: epoch=${epoch.epoch}, ${epoch.results.length} messages`);

    // Treat each eval message as if it were one of the user's Slack messages.
    // The pipeline expects { text, ts, channelName? }.
    const baseTs = Math.floor(Date.now() / 1000);
    const corpus = epoch.results.map((r, i) => ({
        text: r.message,
        ts: String(baseTs - (epoch.results.length - i)), // deterministic, in time order
        channelName: "evals",
    }));

    // Soft cap mirrors the live digest task to keep cost predictable.
    const limited = corpus.slice(0, 200);
    console.log(`Running baseline analysis on ${limited.length} messages...`);

    const baseline = await analyzeStyleBaseline(limited);

    const baselineLines: string[] = [];
    baselineLines.push(`Summary: ${baseline.summary || "(empty)"}`);
    if (baseline.traits.length > 0) {
        baselineLines.push("");
        baselineLines.push("Traits:");
        for (const t of baseline.traits) baselineLines.push(`  • ${t}`);
    }
    if (baseline.examples.length > 0) {
        baselineLines.push("");
        baselineLines.push("Examples:");
        for (const ex of baseline.examples) {
            baselineLines.push(`  > ${ex.quote}`);
            baselineLines.push(`    ${ex.observation}`);
        }
    }
    console.log(formatPreviewBlocks("BASELINE (always sent)", baselineLines));

    const target = resolveTargetStyle(styleArg);
    if (target) {
        console.log(`Running deviation analysis against target: "${target.label}"`);
        const deviation = await analyzeStyleDeviation(limited, target.description);

        const devLines: string[] = [];
        devLines.push(`Adherence score: ${deviation.adherenceScore} / 100`);
        if (deviation.deviations.length > 0) {
            devLines.push("");
            devLines.push("Deviations:");
            for (const d of deviation.deviations) {
                devLines.push(`  > ${d.quote}`);
                devLines.push(`    Why: ${d.why}`);
                devLines.push(`    Try: ${d.suggestion}`);
            }
        } else {
            devLines.push("  (none)");
        }
        if (deviation.strengths.length > 0) {
            devLines.push("");
            devLines.push("Strengths:");
            for (const s of deviation.strengths) devLines.push(`  • ${s}`);
        }
        console.log(formatPreviewBlocks(`DEVIATION (target: ${target.label})`, devLines));
    } else {
        console.log("(No target style provided — skipping deviation section. Pass a 2nd arg to test it.)");
    }
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error("Error:", err);
        process.exit(1);
    }
);
