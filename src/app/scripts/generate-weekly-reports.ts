#!/usr/bin/env tsx
// Environment variables loaded automatically by Node.js --env-file flag

console.log('📋 Starting weekly report generation...');
import { ObjectId } from 'mongodb';
import { analysisInstanceCollection, slackUserCollection, workspaceCollection, reportCollection } from '@/lib/db';
import { sendWeeklyReportDM, resolveSlackUserNames } from '@/lib/slack';
import { generateAICommunicationReport, AiGeneratedReportData } from '@/lib/ai';
import { randomBytes } from 'crypto';
import { saveCommunicationScore } from '@/lib/server-actions';
import { MESSAGE_ANALYSIS_TYPES, AnalysisInstance, Report, SlackUser } from '@/types';
import { calculateCurrentFlagBreakdown, calculateChartMetadata, analyzeCommunicationPartners } from '@/lib/report-utils';

export async function generateWeeklyReports() {
    // Get proper weekly boundary - last Monday at 00:00:00
    const now = new Date();
    const lastMonday = new Date(now);
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days; otherwise go back to Monday
    lastMonday.setDate(now.getDate() - daysToSubtract);
    lastMonday.setHours(0, 0, 0, 0);
    
    console.log(`📅 Weekly period: from ${lastMonday.toISOString()} to now`);

    // 👥 Get users with weekly frequency
    const users = await slackUserCollection.find({
        isActive: true,
        hasCompletedOnboarding: true,
        analysisFrequency: 'weekly'
    }).toArray();

    console.log(`📊 Generating weekly reports for ${users.length} users`);

    for (const user of users) {
        console.log(`📋 Processing user: ${user.slackId}`);

        // 🔍 Get ONLY current week instances (optimization!)
        const currentWeekInstances = await analysisInstanceCollection.find({
            userId: new ObjectId(user._id),
            createdAt: { $gte: lastMonday }
        }).toArray();

        console.log(`📈 User ${user.name}: ${currentWeekInstances.length} messages this week`);

        // Skip if no data this week
        if (currentWeekInstances.length === 0) {
            console.log(`⏭️ Skipping ${user.name} - no communication data this week`);
            continue;
        }

        // 🔍 Get previous report for comparison (provide previousScore to AI)
        const previousReport = await reportCollection.findOne({
            userId: user._id.toString(),
            period: 'weekly'
        }, { sort: { createdAt: -1 } });
        const previousTwo = await reportCollection.find({
            userId: user._id.toString(),
            period: 'weekly'
        }).sort({ createdAt: -1 }).limit(2).toArray();

        console.log(`📋 Previous report found: ${previousReport ? 'Yes' : 'No'}`);

        // 🤖 AI-generated report (no local algorithms)
        const instancesForAi = (currentWeekInstances as unknown as AnalysisInstance[]).map((i, idx) => ({
            index: idx,
            messageTs: i.messageTs,
            channelId: i.channelId,
            issueDescription: i.issueDescription,
            flagIds: i.flagIds,
            targetIds: i.targetIds || []
        }));

        // Resolve partner names for targetIds
        const targetIdSet = new Set<string>();
        currentWeekInstances.forEach(i => (i.targetIds || []).forEach((id: string) => id && targetIdSet.add(id)));

        const workspaceForNames = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        let partnerNames: Record<string, string> = {};
        if (workspaceForNames?.botToken && targetIdSet.size > 0) {
            partnerNames = await resolveSlackUserNames(Array.from(targetIdSet), workspaceForNames.botToken);
        }

        const aiReport = await generateAICommunicationReport(
            instancesForAi,
            'weekly',
            {
                previousScore: previousReport?.communicationScore,
                coverage: { messagesAnalyzed: instancesForAi.length, channels: new Set(instancesForAi.map(i => i.channelId)).size },
                partnerNames,
                messageAnalysisTypes: MESSAGE_ANALYSIS_TYPES as unknown as Record<number, { key: string; name: string; description: string }>,
                previousScores: previousTwo.map(r => r.communicationScore),
                previousFlagBreakdowns: previousTwo.map(r => (r.currentPeriod?.flagBreakdown || []).map((f: { flagId: number; count: number; percentage: number; messageIds: string[] }) => ({ flagId: f.flagId, count: f.count }))),
                severityWeights: { 5: 1.0, 6: 0.8, 1: 0.7, 2: 0.6, 3: 0.5, 4: 0.5, 7: 0.4, 8: 0.3 }
            }
        );

        // Normalize AI output to ensure required fields exist for DM rendering
        // Build local deterministic chart data (ensures UI has data even if AI omits it)
        const localFlagBreakdown = calculateCurrentFlagBreakdown(currentWeekInstances as unknown as AnalysisInstance[]);
        const localChart = calculateChartMetadata(localFlagBreakdown, previousReport as unknown as Report | null);

        // Local deterministic partner analysis as fallback
        const localPartnerAnalysis = await analyzeCommunicationPartners(currentWeekInstances as unknown as AnalysisInstance[], partnerNames);

        const normalizedReport: AiGeneratedReportData = {
            communicationScore: typeof aiReport.communicationScore === 'number' ? aiReport.communicationScore : 0,
            previousScore: typeof previousReport?.communicationScore === 'number' ? previousReport.communicationScore : (typeof aiReport.previousScore === 'number' ? aiReport.previousScore : 0),
            scoreChange: typeof aiReport.scoreChange === 'number' ? aiReport.scoreChange : ((typeof aiReport.communicationScore === 'number' ? aiReport.communicationScore : 0) - (typeof previousReport?.communicationScore === 'number' ? previousReport.communicationScore : 0)),
            scoreTrend: aiReport.scoreTrend || 'stable',
            currentPeriod: {
                totalMessages: aiReport.currentPeriod?.totalMessages ?? instancesForAi.length,
                flaggedMessages: aiReport.currentPeriod?.flaggedMessages ?? instancesForAi.filter(i => i.flagIds.length > 0).length,
                flaggedMessageIds: Array.isArray(aiReport.currentPeriod?.flaggedMessageIds) ? aiReport.currentPeriod.flaggedMessageIds : [],
                flagBreakdown: Array.isArray(aiReport.currentPeriod?.flagBreakdown) && aiReport.currentPeriod.flagBreakdown.length > 0
                    ? aiReport.currentPeriod.flagBreakdown
                    : localFlagBreakdown,
                partnerAnalysis: localPartnerAnalysis,
            },
            chartMetadata: {
                flagTrends: Array.isArray(aiReport.chartMetadata?.flagTrends) && aiReport.chartMetadata.flagTrends.length > 0
                    ? aiReport.chartMetadata.flagTrends
                    : localChart.flagTrends,
                scoreHistory: Array.isArray(aiReport.chartMetadata?.scoreHistory) ? aiReport.chartMetadata.scoreHistory : [],
                partnerTrends: Array.isArray(aiReport.chartMetadata?.partnerTrends) ? aiReport.chartMetadata.partnerTrends : [],
            },
            messageExamples: Array.isArray(aiReport.messageExamples) ? aiReport.messageExamples : [],
            recommendations: Array.isArray(aiReport.recommendations) ? aiReport.recommendations : [],
            keyInsights: Array.isArray(aiReport.keyInsights) ? aiReport.keyInsights : [],
            achievements: Array.isArray(aiReport.achievements) ? aiReport.achievements : [],
        };

        // Build examples list using AI-selected indexes or fallback deterministic selection
        const focusIdx: number[] = Array.isArray(aiReport.focusExampleIndexes) ? aiReport.focusExampleIndexes.slice(0, 10) : [];
        const severityWeights: Record<number, number> = { 5: 1.0, 6: 0.8, 1: 0.7, 2: 0.6, 3: 0.5, 4: 0.5, 7: 0.4, 8: 0.3 };

        let exampleInstances = focusIdx
            .map((idx) => currentWeekInstances[idx])
            .filter((i) => !!i);

        if (exampleInstances.length === 0) {
            // Fallback: pick up to 2 worst by weighted severity then by number of flags
            exampleInstances = currentWeekInstances
                .slice()
                .sort((a, b) => {
                    const score = (inst: AnalysisInstance) => (inst.flagIds || []).reduce((acc: number, id: number) => acc + (severityWeights[id] || 0), 0);
                    const sb = score(b as unknown as AnalysisInstance) - score(a as unknown as AnalysisInstance);
                    if (sb !== 0) return sb;
                    return ((b as unknown as AnalysisInstance).flagIds?.length || 0) - ((a as unknown as AnalysisInstance).flagIds?.length || 0);
                })
                .slice(0, Math.min(10, currentWeekInstances.length));
        }

        const examples = (exampleInstances as unknown as AnalysisInstance[]).slice(0, 10).map((inst) => ({
            messageTs: inst.messageTs,
            channelId: inst.channelId,
            flagIds: inst.flagIds || [],
            summary: inst.issueDescription || 'Communication issue detected'
        }));

        if (examples.length > 0) {
            normalizedReport.messageExamples = examples;
        }

        // 🔐 Generate unguessable report ID
        const reportId = randomBytes(32).toString('hex');

        // 💾 Save report to database
        const report = {
            _id: new ObjectId(),
            reportId,
            userId: user._id.toString(),
            workspaceId: workspaceForNames?.workspaceId || 'unknown',
            period: 'weekly' as const,
            periodStart: lastMonday,
            periodEnd: new Date(),
            ...normalizedReport,
            // Add instances trend for UI (dates within current week)
            chartMetadata: {
                ...normalizedReport.chartMetadata,
                instancesTrend: buildInstancesTrendSeries(currentWeekInstances as unknown as AnalysisInstance[], lastMonday)
            },
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        };

        await reportCollection.insertOne(report);
        console.log(`💾 Saved weekly report for user ${user.slackId}`);

        // 💾 Persist latest weekly score on user document (best-effort)
        try {
            await saveCommunicationScore(user._id.toString(), 'weekly', normalizedReport.communicationScore, { reportId });
            console.log(`🔖 Saved weekly score ${normalizedReport.communicationScore} for user ${user.slackId}`);
        } catch (e) {
            console.warn('Failed to save weekly score on user document:', e);
        }

        // Get workspace for Slack delivery (reuse fetched one if available)
        const workspace = workspaceForNames || await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });

        if (workspace?.botToken) {
            // 📤 Send Slack DM
            try {
                // Serialize report to convert ObjectIds to strings
                const serializedReport = JSON.parse(JSON.stringify(report, (key, value) => {
                    if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'ObjectId') {
                        return value.toString();
                    }
                    if (value instanceof Date) {
                        return value.toISOString();
                    }
                    return value;
                })) as Report;

                const sent = await sendWeeklyReportDM(user as unknown as SlackUser, serializedReport, workspace.botToken);
                if (sent) {
                    console.log(`✅ Sent weekly report to user: ${user.slackId}`);
                } else {
                    console.error(`❌ Slack API did not accept the weekly report DM for user ${user.slackId}`);
                }
            } catch (error) {
                console.error(`❌ Failed to send weekly report to user ${user.slackId}:`, error);
            }
        } else {
            console.log(`⚠️ No workspace token found for user ${user.slackId}`);
        }
    }

    console.log('🎉 Weekly report generation completed');
    
    // Close database connection when running directly
    if (require.main === module) {
        process.exit(0);
    }
}


function buildInstancesTrendSeries(instances: AnalysisInstance[], periodStart: Date) {
    // 7-day range starting at Monday
    const labels: string[] = [];
    const current: number[] = [];
    const previous: number[] = [];

    const start = new Date(periodStart);
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        current.push(0);
        previous.push(0);
    }

    // Count current week
    instances.forEach((i) => {
        const idx = Math.floor((new Date(i.createdAt).getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
        if (idx >= 0 && idx < 7) current[idx] += 1;
    });

    // Count previous week for comparison
    const prevStart = new Date(start);
    prevStart.setDate(start.getDate() - 7);
    const prevEnd = new Date(start);
    instances.forEach((i) => {
        const t = new Date(i.createdAt).getTime();
        if (t >= prevStart.getTime() && t < prevEnd.getTime()) {
            const idx = Math.floor((t - prevStart.getTime()) / (24 * 60 * 60 * 1000));
            if (idx >= 0 && idx < 7) previous[idx] += 1;
        }
    });

    return { labels, current, previous };
}

// Only run if this file is executed directly
if (require.main === module) {
    generateWeeklyReports().catch((error) => {
        console.error('❌ Weekly report generation failed:', error);
        process.exit(1);
    });
}
