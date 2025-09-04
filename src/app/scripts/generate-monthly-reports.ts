#!/usr/bin/env tsx
// Environment variables loaded automatically by Node.js --env-file flag

console.log('📋 Starting monthly report generation...');
import { ObjectId } from 'mongodb';
import { analysisInstanceCollection, slackUserCollection, workspaceCollection, reportCollection } from '@/lib/db';
import { sendMonthlyReportDM, resolveSlackUserNames } from '@/lib/slack';
import { generateAICommunicationReport } from '@/lib/ai';
import { randomBytes } from 'crypto';
import { saveCommunicationScore } from '@/lib/server-actions';
import { MESSAGE_ANALYSIS_TYPES } from '@/types';
import { calculateCurrentFlagBreakdown, calculateChartMetadata, analyzeCommunicationPartners } from '@/lib/report-utils';

export async function generateMonthlyReports() {
    // Get proper monthly boundary - 1st of current month at 00:00:00
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    firstOfMonth.setHours(0, 0, 0, 0);
    
    console.log(`📅 Monthly period: from ${firstOfMonth.toISOString()} to now`);

    // 👥 Get users with monthly frequency
    const users = await slackUserCollection.find({
        isActive: true,
        hasCompletedOnboarding: true,
        analysisFrequency: 'monthly'
    }).toArray();

    console.log(`📊 Generating monthly reports for ${users.length} users`);

    for (const user of users) {
        console.log(`📋 Processing user: ${user.slackId}`);

        // 🔍 Get ONLY current month instances (optimization!)
        const currentMonthInstances = await analysisInstanceCollection.find({
            userId: new ObjectId(user._id),
            createdAt: { $gte: firstOfMonth }
        }).toArray();

        console.log(`📈 User ${user.name}: ${currentMonthInstances.length} messages this month`);

        // Skip if no data this month
        if (currentMonthInstances.length === 0) {
            console.log(`⏭️ Skipping ${user.name} - no communication data this month`);
            continue;
        }

        // 🔍 Get previous report for comparison (provide previousScore to AI)
        const previousReport = await reportCollection.findOne({
            userId: user._id.toString(),
            period: 'monthly'
        }, { sort: { createdAt: -1 } });
        const previousTwo = await reportCollection.find({
            userId: user._id.toString(),
            period: 'monthly'
        }).sort({ createdAt: -1 }).limit(2).toArray();

        console.log(`📋 Previous report found: ${previousReport ? 'Yes' : 'No'}`);

        // 🤖 AI-generated report (no local algorithms)
        const instancesForAi = currentMonthInstances.map((i, idx) => ({
            index: idx,
            messageTs: i.messageTs,
            channelId: i.channelId,
            text: i.text,
            flagIds: i.flagIds,
            targetIds: i.targetIds || []
        }));

        // Resolve partner names for targetIds
        const targetIdSet = new Set<string>();
        currentMonthInstances.forEach(i => (i.targetIds || []).forEach((id: string) => id && targetIdSet.add(id)));
        const workspaceForNames = await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });
        let partnerNames: Record<string, string> = {};
        if (workspaceForNames?.botToken && targetIdSet.size > 0) {
            partnerNames = await resolveSlackUserNames(Array.from(targetIdSet), workspaceForNames.botToken);
        }

        const aiReport = await generateAICommunicationReport(
            instancesForAi,
            'monthly',
            {
                previousScore: previousReport?.communicationScore,
                coverage: { messagesAnalyzed: instancesForAi.length, channels: new Set(instancesForAi.map(i => i.channelId)).size },
                partnerNames,
                messageAnalysisTypes: MESSAGE_ANALYSIS_TYPES as unknown as Record<number, { key: string; name: string; description: string }>,
                previousScores: previousTwo.map(r => r.communicationScore),
                previousFlagBreakdowns: previousTwo.map(r => (r.currentPeriod?.flagBreakdown || []).map((f: any) => ({ flagId: f.flagId, count: f.count }))),
                severityWeights: { 5: 1.0, 6: 0.8, 1: 0.7, 2: 0.6, 3: 0.5, 4: 0.5, 7: 0.4, 8: 0.3 }
            }
        );

        // Normalize AI output to ensure required fields exist for DM rendering
        // Local deterministic chart data fallback
        const localFlagBreakdown = calculateCurrentFlagBreakdown(currentMonthInstances);
        const localChart = calculateChartMetadata(localFlagBreakdown, previousReport);

        const localPartnerAnalysis = await analyzeCommunicationPartners(currentMonthInstances, partnerNames);

        const normalizedReport = {
            communicationScore: typeof (aiReport as any)?.communicationScore === 'number' ? (aiReport as any).communicationScore : 0,
            previousScore: typeof previousReport?.communicationScore === 'number' ? previousReport.communicationScore : (typeof (aiReport as any)?.previousScore === 'number' ? (aiReport as any).previousScore : 0),
            scoreChange: typeof (aiReport as any)?.scoreChange === 'number' ? (aiReport as any).scoreChange : ((typeof (aiReport as any)?.communicationScore === 'number' ? (aiReport as any).communicationScore : 0) - (typeof previousReport?.communicationScore === 'number' ? previousReport.communicationScore : 0)),
            scoreTrend: (aiReport as any)?.scoreTrend || 'stable',
            currentPeriod: {
                totalMessages: (aiReport as any)?.currentPeriod?.totalMessages ?? instancesForAi.length,
                flaggedMessages: (aiReport as any)?.currentPeriod?.flaggedMessages ?? instancesForAi.filter(i => i.flagIds.length > 0).length,
                flaggedMessageIds: Array.isArray((aiReport as any)?.currentPeriod?.flaggedMessageIds) ? (aiReport as any).currentPeriod.flaggedMessageIds : [],
                flagBreakdown: Array.isArray((aiReport as any)?.currentPeriod?.flagBreakdown) && (aiReport as any).currentPeriod.flagBreakdown.length > 0
                    ? (aiReport as any).currentPeriod.flagBreakdown
                    : localFlagBreakdown,
                partnerAnalysis: localPartnerAnalysis,
            },
            chartMetadata: {
                flagTrends: Array.isArray((aiReport as any)?.chartMetadata?.flagTrends) && (aiReport as any).chartMetadata.flagTrends.length > 0
                    ? (aiReport as any).chartMetadata.flagTrends
                    : localChart.flagTrends,
                scoreHistory: Array.isArray((aiReport as any)?.chartMetadata?.scoreHistory) ? (aiReport as any).chartMetadata.scoreHistory : [],
                partnerTrends: Array.isArray((aiReport as any)?.chartMetadata?.partnerTrends) ? (aiReport as any).chartMetadata.partnerTrends : [],
            },
            messageExamples: Array.isArray((aiReport as any)?.messageExamples) ? (aiReport as any).messageExamples : [],
            recommendations: Array.isArray((aiReport as any)?.recommendations) ? (aiReport as any).recommendations : [],
            keyInsights: Array.isArray((aiReport as any)?.keyInsights) ? (aiReport as any).keyInsights : [],
            achievements: Array.isArray((aiReport as any)?.achievements) ? (aiReport as any).achievements : [],
            partnerAnalysis: Array.isArray((aiReport as any)?.currentPeriod?.partnerAnalysis) ? (aiReport as any).currentPeriod.partnerAnalysis : [],
        };

        // Build examples list using AI-selected indexes or fallback deterministic selection
        const focusIdx: number[] = Array.isArray((aiReport as any)?.focusExampleIndexes) ? (aiReport as any).focusExampleIndexes.slice(0, 10) : [];
        const severityWeights: Record<number, number> = { 5: 1.0, 6: 0.8, 1: 0.7, 2: 0.6, 3: 0.5, 4: 0.5, 7: 0.4, 8: 0.3 };
        const safeTruncate = (s: string, n: number) => (s || '').slice(0, n) + ((s || '').length > n ? '…' : '');

        let exampleInstances = focusIdx
            .map((idx) => currentMonthInstances[idx])
            .filter((i) => !!i);

        if (exampleInstances.length === 0) {
            exampleInstances = currentMonthInstances
                .slice()
                .sort((a, b) => {
                    const score = (inst: any) => (inst.flagIds || []).reduce((acc: number, id: number) => acc + (severityWeights[id] || 0), 0);
                    const sb = score(b) - score(a);
                    if (sb !== 0) return sb;
                    return (b.flagIds?.length || 0) - (a.flagIds?.length || 0);
                })
                .slice(0, Math.min(10, currentMonthInstances.length));
        }

        const examples = exampleInstances.slice(0, 10).map((inst: any) => ({
            messageTs: inst.messageTs,
            channelId: inst.channelId,
            flagIds: inst.flagIds || [],
            summary: safeTruncate(inst.text || '', 80)
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
            period: 'monthly' as const,
            periodStart: firstOfMonth,
            periodEnd: new Date(),
            ...normalizedReport,
            chartMetadata: {
                ...normalizedReport.chartMetadata,
                instancesTrend: buildMonthlyInstancesTrend(currentMonthInstances, firstOfMonth)
            },
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        };

        await reportCollection.insertOne(report);
        console.log(`💾 Saved monthly report for user ${user.slackId}`);

        // 💾 Persist latest monthly score on user document (best-effort)
        try {
            await saveCommunicationScore(user._id.toString(), 'monthly', normalizedReport.communicationScore, { reportId });
            console.log(`🔖 Saved monthly score ${normalizedReport.communicationScore} for user ${user.slackId}`);
        } catch (e) {
            console.warn('Failed to save monthly score on user document:', e);
        }

        // Get workspace for Slack delivery (reuse fetched one if available)
        const workspace = workspaceForNames || await workspaceCollection.findOne({ _id: new ObjectId(user.workspaceId) });

        if (workspace?.botToken) {
            // 📤 Send Slack DM
            try {
                const sent = await sendMonthlyReportDM(user, report, workspace.botToken);
                if (sent) {
                    console.log(`✅ Sent monthly report to user: ${user.slackId}`);
                } else {
                    console.error(`❌ Slack API did not accept the monthly report DM for user ${user.slackId}`);
                }
            } catch (error) {
                console.error(`❌ Failed to send monthly report to user ${user.slackId}:`, error);
            }
        } else {
            console.log(`⚠️ No workspace token found for user ${user.slackId}`);
        }
    }

    console.log('🎉 Monthly report generation completed');
    
    // Close database connection when running directly
    if (require.main === module) {
        process.exit(0);
    }
}

async function calculateMonthlyAnalytics(user: any, currentInstances: any[], previousReport: any | null) {
    // Deprecated: local analytics removed in favor of AI-generated reports
    return {} as any;
}

function buildMonthlyInstancesTrend(instances: any[], firstOfMonth: Date) {
    const labels: string[] = [];
    const current: number[] = [];
    const previous: number[] = [];

    const start = new Date(firstOfMonth);
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();

    for (let i = 1; i <= daysInMonth; i++) {
        labels.push(i.toString());
        current.push(0);
        previous.push(0);
    }

    // Count current month
    instances.forEach((i) => {
        const d = new Date(i.createdAt);
        if (d.getMonth() === start.getMonth() && d.getFullYear() === start.getFullYear()) {
            const idx = d.getDate() - 1;
            if (idx >= 0 && idx < daysInMonth) current[idx] += 1;
        }
    });

    // Previous month range
    const prevMonthStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    const prevDays = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth() + 1, 0).getDate();
    const prevMonthEnd = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), prevDays);

    instances.forEach((i) => {
        const d = new Date(i.createdAt);
        if (d.getMonth() === prevMonthStart.getMonth() && d.getFullYear() === prevMonthStart.getFullYear()) {
            const idx = d.getDate() - 1;
            if (idx >= 0 && idx < daysInMonth) previous[idx] += 1; // align lengths; extra days ignored
        }
    });

    return { labels, current, previous };
}

// Only run if this file is executed directly
if (require.main === module) {
    generateMonthlyReports().catch((error) => {
        console.error('❌ Monthly report generation failed:', error);
        process.exit(1);
    });
}
