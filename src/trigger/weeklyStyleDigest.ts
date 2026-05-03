import { logger, schedules } from "@trigger.dev/sdk/v3";
import { WebClient } from "@slack/web-api";
import { ObjectId } from "mongodb";
import { slackUserCollection, workspaceCollection, botChannelsCollection } from "@/lib/db";
import { analyzeStyleBaseline, analyzeStyleDeviation } from "@/lib/ai";
import { sendDirectMessage, formatDigestBlocks } from "@/lib/slack";
import type { SlackUser, Workspace } from "@/types";

type Cadence = "daily" | "weekly";

const CADENCE_LOOKBACK_DAYS: Record<Cadence, number> = {
  daily: 1,
  weekly: 7,
};

// Weekly fan-out — runs every Monday 09:00 UTC.
export const weeklyStyleDigestTask = schedules.task({
  id: "weekly-style-digest",
  cron: "0 9 * * 1",
  maxDuration: 1800,
  run: async () => fanOut("weekly"),
});

// Daily fan-out — runs every morning 09:00 UTC.
export const dailyStyleDigestTask = schedules.task({
  id: "daily-style-digest",
  cron: "0 9 * * *",
  maxDuration: 1800,
  run: async () => fanOut("daily"),
});

async function fanOut(cadence: Cadence) {
  logger.log(`[digest] Starting ${cadence} fan-out`);

  const users = await slackUserCollection
    .find({ isActive: true, digestCadence: cadence })
    .toArray();

  logger.log(`[digest] ${users.length} ${cadence} opted-in users`);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      const result = await runForUserDoc(user as unknown as SlackUser, cadence);
      if (result === "sent") sent++;
      else if (result === "skipped") skipped++;
    } catch (err) {
      failed++;
      logger.error("[digest] Per-user failure", {
        slackId: user.slackId,
        cadence,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.log(`[digest] ${cadence} fan-out complete`, { sent, skipped, failed });
  return { sent, skipped, failed };
}

type RunResult = "sent" | "skipped";

async function runForUserDoc(user: SlackUser, cadence: Cadence): Promise<RunResult> {
  if (!user.workspaceId) return "skipped";

  const workspace = (await workspaceCollection.findOne({
    _id: new ObjectId(user.workspaceId),
  })) as Workspace | null;

  if (!workspace || !workspace.isActive || !workspace.botToken) {
    logger.warn("[digest] No active workspace for user", { slackId: user.slackId });
    return "skipped";
  }

  const slack = new WebClient(workspace.botToken);

  // Pull last N days of messages from each opted-in channel and keep only this user's.
  const lookbackDays = CADENCE_LOOKBACK_DAYS[cadence];
  const oldest = String(Math.floor((Date.now() - lookbackDays * 24 * 60 * 60 * 1000) / 1000));
  const collected: Array<{ text: string; ts: string; channelName?: string }> = [];

  const channelDocs = await botChannelsCollection
    .find({ workspaceId: String(workspace._id) })
    .toArray();
  const channelNameById = new Map(channelDocs.map(c => [c.channelId, c.channelName]));

  const channelIds = user.autoCoachingEnabledChannels ?? [];
  for (const channelId of channelIds) {
    try {
      const res = await slack.conversations.history({
        channel: channelId,
        oldest,
        limit: 200,
      });
      for (const m of res.messages ?? []) {
        if (m.user === user.slackId && typeof m.text === "string" && m.text.trim().length > 0 && typeof m.ts === "string") {
          collected.push({
            text: m.text,
            ts: m.ts,
            channelName: channelNameById.get(channelId),
          });
        }
      }
    } catch (err) {
      logger.warn("[digest] history fetch failed", {
        channelId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  collected.sort((a, b) => Number(b.ts) - Number(a.ts));
  const corpus = collected.slice(0, 200);

  // Daily uses a lower floor — same-day chats may not produce 10 messages but
  // a 3-message snapshot can still be useful.
  const minMessages = cadence === "daily" ? 3 : 10;
  if (corpus.length < minMessages) {
    await sendDirectMessage(
      user.slackId,
      cadence === "daily"
        ? "Not enough activity today to summarize. I'll try again tomorrow."
        : "Not enough activity this week to summarize. Send a few more messages in your tracked channels and I'll try again next week.",
      workspace.botToken
    );
    await markSent(user.slackId);
    return "sent";
  }

  const baseline = await analyzeStyleBaseline(corpus);

  const target = user.preferredStyle?.description?.trim();
  const deviation = target ? await analyzeStyleDeviation(corpus, target) : null;

  const blocks = formatDigestBlocks(baseline, deviation);
  const fallbackText = `Your ${cadence} style digest: ${baseline.summary || "(see blocks)"}`;

  const ok = await sendDirectMessage(user.slackId, fallbackText, workspace.botToken, blocks);
  if (!ok) {
    logger.error("[digest] DM failed", { slackId: user.slackId });
    return "skipped";
  }

  await markSent(user.slackId);
  logger.log("[digest] Delivered", {
    slackId: user.slackId,
    cadence,
    messageCount: corpus.length,
    hasTarget: !!target,
  });
  return "sent";
}

async function markSent(slackId: string): Promise<void> {
  await slackUserCollection.updateOne(
    { slackId },
    { $set: { lastDigestSentAt: new Date(), updatedAt: new Date() } }
  );
}

// Convenience helper for local dev — defaults to weekly lookback (7 days) so a
// just-installed dev account with limited daily traffic still has enough to
// summarize. Pass `'daily'` to test the daily path explicitly.
export async function runForUser(slackId: string, cadence: Cadence = "weekly"): Promise<RunResult> {
  const user = (await slackUserCollection.findOne({
    slackId,
    isActive: true,
  })) as SlackUser | null;
  if (!user) {
    console.error(`[digest] User not found: ${slackId}`);
    return "skipped";
  }
  return runForUserDoc(user, cadence);
}
