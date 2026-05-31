// On-demand style-digest test against YOUR real Slack messages.
// Runs the same pipeline as the daily/weekly cron (analyzeStyleBaseline +
// analyzeStyleDeviation vs your set target style), prints the report, and DMs
// it to you in Slack — without waiting for the scheduled job.
//
// Usage:
//   npm run digest:me                       # Test workspace default user, daily + weekly
//   npx tsx --env-file=.env.local src/scripts/digest-me.ts U08KR2LFMC3 daily
//
// Configure the defaults with env vars DIGEST_TEST_TEAM_ID / DIGEST_TEST_SLACK_ID.

import { WebClient } from "@slack/web-api";
import { slackUserCollection, workspaceCollection } from "@/lib/db";
import { analyzeStyleBaseline, analyzeStyleDeviation } from "@/lib/ai";
import { sendDirectMessage, formatDigestBlocks } from "@/lib/slack";

const TEAM_ID = process.env.DIGEST_TEST_TEAM_ID || "T08HU2MKRK2"; // Test
const SLACK_ID = process.argv[2] || process.env.DIGEST_TEST_SLACK_ID || "U08KR2LFMC3";
const CADENCES: Array<["daily" | "weekly", number]> =
    process.argv[3] === "daily" ? [["daily", 1]]
    : process.argv[3] === "weekly" ? [["weekly", 7]]
    : [["daily", 1], ["weekly", 7]];

async function main(): Promise<void> {
    const ws = await workspaceCollection.findOne({ workspaceId: TEAM_ID });
    if (!ws) throw new Error(`Workspace not found: ${TEAM_ID}`);
    const user = (await slackUserCollection.findOne({ slackId: SLACK_ID, workspaceId: ws._id.toString() })) as
        | (Record<string, unknown> & { autoCoachingEnabledChannels?: string[]; preferredStyle?: { description?: string } })
        | null;
    if (!user) throw new Error(`User not found: ${SLACK_ID} in ${TEAM_ID}`);

    const slack = new WebClient(ws.botToken as string);
    const target = user.preferredStyle?.description?.trim();
    console.log("TARGET STYLE:", target ? JSON.stringify(target) : "(none set)");

    for (const [cadence, days] of CADENCES) {
        const oldest = String(Math.floor((Date.now() - days * 86400 * 1000) / 1000));
        const corpus: Array<{ text: string; ts: string }> = [];
        for (const ch of user.autoCoachingEnabledChannels ?? []) {
            const r = await slack.conversations.history({ channel: ch, oldest, limit: 200 });
            for (const m of r.messages ?? []) {
                if (m.user === SLACK_ID && typeof m.text === "string" && m.text.trim() && typeof m.ts === "string") {
                    corpus.push({ text: m.text, ts: m.ts });
                }
            }
        }
        corpus.sort((a, b) => Number(b.ts) - Number(a.ts));
        const limited = corpus.slice(0, 200);
        const min = cadence === "daily" ? 3 : 10;

        console.log(`\n████ ${cadence.toUpperCase()} (${limited.length} messages, need ${min}) ████`);
        if (limited.length < min) {
            console.log("  Not enough activity to summarize.");
            continue;
        }

        const baseline = await analyzeStyleBaseline(limited);
        const deviation = target ? await analyzeStyleDeviation(limited, target) : null;

        console.log("\n— HOW YOU ACTUALLY WRITE —");
        console.log("  " + baseline.summary);
        (baseline.traits || []).forEach((t) => console.log("   • " + t));
        if (deviation) {
            console.log(`\n— VS YOUR GOAL —  adherence: ${deviation.adherenceScore}/100`);
            (deviation.deviations || []).forEach((d) =>
                console.log(`   ✗ "${d.quote}"\n      why: ${d.why}\n      try: ${d.suggestion}`));
            (deviation.strengths || []).forEach((s) => console.log(`   ✓ ${s}`));
        }

        const blocks = formatDigestBlocks(baseline, deviation);
        const ok = await sendDirectMessage(SLACK_ID, `Your ${cadence} style digest`, ws.botToken as string, blocks);
        console.log(`\n  → DM delivered to Slack: ${ok}`);
    }
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
