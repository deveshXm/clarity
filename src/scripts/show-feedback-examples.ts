// Local-only: pick a diverse handful of messages from the eval epochs and run
// them through the live analyzeMessage pipeline (with reasoning enabled) to
// show exactly what the bot's ephemeral coaching DM would have looked like.
//
// Usage:
//   npx tsx --env-file=.env.local src/scripts/show-feedback-examples.ts
//   npx tsx --env-file=.env.local src/scripts/show-feedback-examples.ts epoch_3
//   npx tsx --env-file=.env.local src/scripts/show-feedback-examples.ts epoch_1 8   # take 8 messages

import * as fs from "node:fs";
import * as path from "node:path";

import { analyzeMessage } from "@/lib/ai";
import { DEFAULT_COACHING_FLAGS } from "@/types";

interface EpochResult {
    id: number;
    type: string;
    message: string;
    ground_truth_flags?: string[];
}

function pickDiverseSample(results: EpochResult[], targetCount: number): EpochResult[] {
    // Stable, deterministic sample: walk results and grab the first hit per
    // unique (type, ground_truth_flags) tuple until we hit targetCount.
    const seen = new Set<string>();
    const out: EpochResult[] = [];
    for (const r of results) {
        const key = `${r.type}|${(r.ground_truth_flags ?? []).join(",")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
        if (out.length >= targetCount) break;
    }
    return out;
}

async function main(): Promise<void> {
    const epochArg = process.argv[2] ?? "epoch_1";
    const countArg = parseInt(process.argv[3] ?? "6", 10);

    const epochName = epochArg.endsWith(".json") ? epochArg : `${epochArg}.json`;
    const epochPath = path.resolve("evals/data/evaluate", epochName);
    if (!fs.existsSync(epochPath)) {
        console.error(`Epoch not found: ${epochPath}`);
        process.exit(1);
    }

    const epoch = JSON.parse(fs.readFileSync(epochPath, "utf-8")) as { results: EpochResult[] };
    const sample = pickDiverseSample(epoch.results, countArg);

    console.log(`# Coaching feedback preview (using DEFAULT_COACHING_FLAGS)\n`);
    console.log(`Showing ${sample.length} messages from ${epochName}, running each through the live auto-correct pipeline.\n`);
    console.log(`Default flags: ${DEFAULT_COACHING_FLAGS.map(f => f.name).join(", ")}\n`);
    console.log("---");

    for (const r of sample) {
        const analysis = await analyzeMessage(r.message, DEFAULT_COACHING_FLAGS, { includeReason: true });

        const flags = analysis.flags.map(f => f.flagName);
        const wouldDM = flags.length > 0 && analysis.suggestedRephrase;

        console.log(`\n## #${r.id}  (eval label: ${(r.ground_truth_flags ?? []).join(", ") || "none"})`);
        console.log(`\n**User wrote:**\n> ${r.message.replace(/\n/g, "\n> ")}\n`);

        if (wouldDM) {
            console.log(`**Bot would DM:** flagged for *${flags.join(", ")}*`);
            console.log(`\n**Suggested rephrase:**\n> ${analysis.suggestedRephrase}`);
            if (analysis.reason) {
                console.log(`\n_Reasoning:_ ${analysis.reason}`);
            }
        } else {
            console.log(`**Bot would NOT DM** (no default flag matched).`);
            if (analysis.reason) {
                console.log(`\n_Reasoning:_ ${analysis.reason}`);
            }
        }

        console.log("\n---");
    }

    console.log("\nDone.");
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error("Error:", err);
        process.exit(1);
    }
);
