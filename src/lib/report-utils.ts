import { getFlagInfo, AnalysisInstance, Report } from '@/types';

// Type definitions for report utilities
interface FlagBreakdownItem {
	flagId: number;
	count: number;
	percentage: number;
	messageIds: string[];
}

interface PartnerAnalysisItem {
	partnerName: string;
	partnerSlackId: string;
	messagesExchanged: number;
	flagsWithPartner: number;
	topIssues: number[];
	relationshipScore: number;
}

interface FlagTrendItem {
	flagId: number;
	currentCount: number;
	previousCount: number;
	trend: 'up' | 'down' | 'stable';
	changePercent: number;
}

interface ScoreHistoryItem {
	period: string;
	score: number;
}

interface PartnerTrendItem {
	partnerName: string;
	partnerSlackId: string;
	currentFlags: number;
	previousFlags: number;
	trend: 'improving' | 'declining' | 'stable';
}

interface ChartMetadata {
	flagTrends: FlagTrendItem[];
	scoreHistory: ScoreHistoryItem[];
	partnerTrends: PartnerTrendItem[];
}

interface MessageExample {
	messageTs: string;
	channelId: string;
	flagIds: number[];
	summary: string;
	targetNames: string[] | null;
	improvement?: string;
}

interface Achievement {
	type: string;
	description: string;
	icon: string;
}

interface PartnerStats {
	partnerName: string;
	partnerSlackId: string;
	messagesExchanged: number;
	flagsWithPartner: number;
	topIssues: number[];
}

// 🎯 Communication Score Calculation
export function calculateCommunicationScore(instances: AnalysisInstance[]): number {
    if (instances.length === 0) return 100;

    const totalFlags = instances.reduce((sum, instance) => sum + instance.flagIds.length, 0);
    const flaggingRate = (totalFlags / instances.length) * 100;

    // Base score from flagging rate
    const baseScore = Math.max(0, 100 - flaggingRate);

    // Adjust for flag severity
    const severityWeights = {
        1: -3, // pushiness
        2: -1, // vagueness
        3: -2, // nonObjective
        4: -1, // circular
        5: -5, // rudeness
        6: -4, // passiveAggressive
        7: -3, // fake
        8: -2, // oneLiner
    };

    let severityPenalty = 0;
    instances.forEach(instance => {
        instance.flagIds.forEach((flagId: number) => {
            severityPenalty += Math.abs(severityWeights[flagId as keyof typeof severityWeights] || -2);
        });
    });

    return Math.max(0, Math.min(100, baseScore - severityPenalty));
}

// 🏷️ Flag Analysis for Current Period (No Trends - Calculated Later)
export function calculateCurrentFlagBreakdown(currentInstances: AnalysisInstance[]): FlagBreakdownItem[] {
    const flagCounts: Record<number, { count: number; messageIds: string[] }> = {};

    // Count current flags and store message IDs
    currentInstances.forEach(instance => {
        instance.flagIds.forEach((flagId: number) => {
            if (!flagCounts[flagId]) {
                flagCounts[flagId] = { count: 0, messageIds: [] };
            }
            flagCounts[flagId].count += 1;
            flagCounts[flagId].messageIds.push(instance._id.toString());
        });
    });

    return Object.entries(flagCounts).map(([flagId, data]) => ({
        flagId: Number(flagId),
        count: data.count,
        percentage: currentInstances.length > 0 ? (data.count / currentInstances.length) * 100 : 0,
        messageIds: data.messageIds.slice(0, 3), // Keep max 3 for examples
    }));
}

// 📈 Calculate Chart Metadata by Comparing with Previous Report
export function calculateChartMetadata(currentFlagBreakdown: FlagBreakdownItem[], previousReport: Report | null): ChartMetadata {
    const flagTrends = currentFlagBreakdown.map(current => {
        let previousCount = 0;
        if (previousReport?.chartMetadata?.flagTrends) {
            const previousFlag = previousReport.chartMetadata.flagTrends.find(
                (f: FlagTrendItem) => f.flagId === current.flagId
            );
            previousCount = previousFlag?.currentCount || 0;
        }

        const change = current.count - previousCount;
        const changePercent = previousCount > 0 ? ((change / previousCount) * 100) : (current.count > 0 ? 100 : 0);

        let trend: 'up' | 'down' | 'stable';
        if (changePercent > 10) trend = 'up';
        else if (changePercent < -10) trend = 'down';
        else trend = 'stable';

        return {
            flagId: current.flagId,
            currentCount: current.count,
            previousCount,
            trend,
            changePercent: Math.round(changePercent),
        };
    });

    // Add score to history
    const scoreHistory = previousReport?.chartMetadata?.scoreHistory || [];
    const currentPeriod = new Date().toISOString().slice(0, 7); // "2025-01"
    
    return {
        flagTrends,
        scoreHistory: [...scoreHistory.slice(-5), { // Keep last 6 periods
            period: currentPeriod,
            score: 0, // Will be filled by calling function
        }],
        partnerTrends: [], // Will be calculated if needed
    };
}

// 🤝 Communication Partner Analysis (Current Period Only)
export async function analyzeCommunicationPartners(
    currentInstances: AnalysisInstance[],
    resolvedUserNames: Record<string, string>
): Promise<PartnerAnalysisItem[]> {
    const partnerStats: Record<string, PartnerStats> = {};

    // Analyze current instances with new targetIds structure
    currentInstances.forEach(instance => {
        // Use targetIds array (legacy target object support removed)
        const targetIds = instance.targetIds;
        
        targetIds.forEach((partnerId: string) => {
            if (!partnerStats[partnerId]) {
                partnerStats[partnerId] = {
                    partnerName: resolvedUserNames[partnerId] || `User ${partnerId}`,
                    partnerSlackId: partnerId,
                    messagesExchanged: 0,
                    flagsWithPartner: 0,
                    topIssues: [],
                };
            }
            partnerStats[partnerId].messagesExchanged += 1;
            partnerStats[partnerId].flagsWithPartner += instance.flagIds.length;
            partnerStats[partnerId].topIssues.push(...instance.flagIds);
        });
    });

    return Object.values(partnerStats).map((partner: PartnerStats) => {
        const flagCounts: Record<number, number> = {};
        partner.topIssues.forEach((flagId: number) => {
            flagCounts[flagId] = (flagCounts[flagId] || 0) + 1;
        });

        const topIssues = Object.entries(flagCounts)
            .sort(([,a], [,b]) => (b as number) - (a as number))
            .slice(0, 2)
            .map(([flagId]) => Number(flagId));

        const relationshipScore = calculateRelationshipScore(partner);

        return {
            partnerName: partner.partnerName,
            partnerSlackId: partner.partnerSlackId,
            messagesExchanged: partner.messagesExchanged,
            flagsWithPartner: partner.flagsWithPartner,
            topIssues,
            relationshipScore,
        };
    });
}

// 💬 Message Examples (Privacy-Compliant)
export function getMessageExamples(
    instances: AnalysisInstance[],
    resolvedUserNames: Record<string, string>
): MessageExample[] {
    // Filter to only instances that have issue descriptions (new format)
    const instancesWithDescriptions = instances.filter(instance => 
        instance.issueDescription && instance.issueDescription.trim().length > 0
    );
    
    return instancesWithDescriptions.slice(0, 3).map(instance => {
        // Use targetIds array (legacy target object support removed)
        const targetIds = instance.targetIds;
        const targetNames = targetIds.map((id: string) => 
            resolvedUserNames[id] || `User ${id}`
        );
        
        return {
            messageTs: instance.messageTs,
            channelId: instance.channelId,
            flagIds: instance.flagIds,
            summary: instance.issueDescription, // Use AI-extracted issue description only
            targetNames: targetNames.length > 0 ? targetNames : null,
            improvement: instance.aiMetadata?.suggestedTone,
        };
    });
}

// 🎯 Score Trend Analysis
export function getScoreTrend(currentScore: number, previousScore: number | null): 'improving' | 'declining' | 'stable' {
    if (!previousScore) return 'stable';
    const change = currentScore - previousScore;
    if (change > 5) return 'improving';
    if (change < -5) return 'declining';
    return 'stable';
}

// 💡 Recommendation Generation
export function generateRecommendations(flagBreakdown: FlagBreakdownItem[], partnerAnalysis: PartnerAnalysisItem[]): string[] {
    const recommendations: string[] = [];

    // Flag-based recommendations
    const topFlags = flagBreakdown
        .filter(f => f.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 2);

    topFlags.forEach(flag => {
        const flagInfo = getFlagInfo(flag.flagId);
        switch (flag.flagId) {
            case 1: // pushiness
                recommendations.push("Try using more collaborative language like 'Could we...' instead of 'You need to...'");
                break;
            case 2: // vagueness
                recommendations.push("Add specific details and context to make your messages clearer");
                break;
            case 5: // rudeness
                recommendations.push("Focus on constructive feedback and avoid negative language");
                break;
            default:
                recommendations.push(`Work on reducing ${flagInfo?.name.toLowerCase()} in your communication`);
        }
    });

    // Partner-based recommendations
    const strugglingPartners = partnerAnalysis.filter(p => p.flagsWithPartner > 3);
    if (strugglingPartners.length > 0) {
        recommendations.push(`Focus on improving communication with ${strugglingPartners[0].partnerName}`);
    }

    return recommendations.slice(0, 3);
}

// 🏆 Achievement Calculation
export function calculateAchievements(currentScore: number, previousScore: number | null): Achievement[] {
    const achievements: Achievement[] = [];

    if (currentScore >= 90) {
        achievements.push({
            type: 'score_master',
            description: 'Communication Excellence - Score 90+!',
            icon: '🏆'
        });
    }

    if (previousScore && currentScore > previousScore + 10) {
        achievements.push({
            type: 'improvement',
            description: 'Major Improvement - 10+ point increase!',
            icon: '🚀'
        });
    }

    return achievements;
}

// 🔍 Key Insights Generation
export function generateKeyInsights(flagBreakdown: FlagBreakdownItem[], partnerAnalysis: PartnerAnalysisItem[]): string[] {
    const insights: string[] = [];

    const topFlag = flagBreakdown.sort((a, b) => b.count - a.count)[0];
    if (topFlag) {
        const flagInfo = getFlagInfo(topFlag.flagId);
        insights.push(`Your most common communication pattern is ${flagInfo?.name.toLowerCase() || 'unknown'}`);
    }

    const topPartner = partnerAnalysis.sort((a, b) => b.messagesExchanged - a.messagesExchanged)[0];
    if (topPartner) {
        insights.push(`You communicate most with ${topPartner.partnerName}`);
    }

    return insights;
}

// 🔗 Helper Functions
function calculateRelationshipScore(partner: PartnerStats): number {
    const baseScore = 100;
    const flagPenalty = partner.flagsWithPartner * 2;
    const messageBonus = Math.min(partner.messagesExchanged * 0.5, 20);

    return Math.max(0, Math.min(100, baseScore - flagPenalty + messageBonus));
}

