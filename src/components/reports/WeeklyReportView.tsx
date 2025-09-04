'use client';

import { useMemo } from 'react';
import { Title, Text, Stack, Row, Container, Button } from '@/components/ui';
import { getFlagInfo, Report } from '@/types';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip, Legend);

interface WeeklyReportViewProps { report: Report }

function formatRange(start: Date | string, end: Date | string) {
	const fmt = (d: Date | string) => {
		const dateObj = typeof d === 'string' ? new Date(d) : d;
		return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	};
	return `${fmt(start)} — ${fmt(end)}`;
}

export function WeeklyReportView({ report }: WeeklyReportViewProps) {
	const flagBarData = useMemo(() => (
		(report.currentPeriod.flagBreakdown || []).map((f) => ({
			id: f.flagId,
			name: getFlagInfo(f.flagId)?.name || 'Unknown',
			count: f.count
		}))
	), [report.currentPeriod.flagBreakdown]);

	return (
		<Container className="mx-auto max-w-4xl px-8 py-16">
			{/* Header */}
			<Stack gap={24} className="mb-16">
				<Stack gap={8}>
					<Title order={1} className="text-5xl font-bold text-gray-900 tracking-tight">
						Weekly Report
					</Title>
					<Text className="text-xl text-gray-600 font-medium">
						{formatRange(report.periodStart, report.periodEnd)}
					</Text>
				</Stack>
			</Stack>

			{/* Messages Analyzed */}
			<Stack gap={16} className="mb-16">
				<Title order={2} className="text-6xl font-black leading-tight tracking-tight">
					<span className="text-8xl text-blue-600">{report.currentPeriod.totalMessages}</span> Messages Analyzed
				</Title>
			</Stack>

			{/* Daily Activity Trend */}
			<Stack gap={16} className="mb-16">
				<Title order={2} className="text-2xl font-bold text-gray-900">
					Daily Activity
				</Title>
				<InstancesTrendChart data={report.chartMetadata?.instancesTrend} />
			</Stack>

			{/* Flag Distribution Overview */}
			{flagBarData && flagBarData.length > 0 && (
				<Stack gap={16} className="mb-16">
					<Title order={2} className="text-2xl font-bold text-gray-900">
						Communication Patterns
					</Title>
					<FlagCountBarChart flags={flagBarData} />
				</Stack>
			)}

			{/* Areas to Focus On */}
			{report.currentPeriod.flagBreakdown && report.currentPeriod.flagBreakdown.length > 0 && (
				<Stack gap={16} className="mb-16">
					<Title order={2} className="text-2xl font-bold text-gray-900">
						Areas to Focus On
					</Title>
					                                  {(() => {
                                          // Merge flag breakdown with trend data from chart metadata
                                          const flagsWithTrends = report.currentPeriod.flagBreakdown.map(flag => {
                                                  const trendData = report.chartMetadata.flagTrends.find(
                                                          (t) => t.flagId === flag.flagId
                                                  );
                                                  return {
                                                          ...flag,
                                                          trend: trendData?.trend || 'stable',
                                                          changePercent: trendData?.changePercent || 0
                                                  };
                                          });
                                          return <AreasToFocusChart flags={flagsWithTrends} />;
                                  })()}
				</Stack>
			)}

			{/* Communication Partners */}
			<Stack gap={16} className="mb-16">
				<PartnerAnalysisSection partners={report.currentPeriod.partnerAnalysis || []} />
			</Stack>

			{/* Messages Needing Attention */}
			{Array.isArray(report.messageExamples) && report.messageExamples.length > 0 && (
				<Stack gap={16} className="mb-16">
					<Title order={2} className="text-2xl font-bold text-gray-900">
						Messages Needing Most Attention
					</Title>
					<MessagesNeedingAttentionChart messages={report.messageExamples.slice(0, 8)} workspaceId={report.workspaceId} />
				</Stack>
			)}

			{/* Recommendations */}
			{Array.isArray(report.recommendations) && report.recommendations.length > 0 && (
				<Stack gap={16} className="mb-16">
					<Title order={2} className="text-2xl font-bold text-gray-900">
						Recommendations
					</Title>
					<Stack gap={8}>
						{report.recommendations.map((rec: string, i: number) => (
							<Row key={i} align="start" gap={16} className="py-6 px-8 bg-blue-50">
								<div className="w-2 h-2 bg-blue-600 mt-3 flex-shrink-0" />
								<Text className="text-lg text-gray-900 leading-relaxed">
									{rec}
								</Text>
							</Row>
						))}
					</Stack>
				</Stack>
			)}

			{/* Achievements */}
			{Array.isArray(report.achievements) && report.achievements.length > 0 && (
				<Stack gap={16} className="mb-16">
					<Title order={2} className="text-2xl font-bold text-gray-900">
						Achievements
					</Title>
					<Stack gap={8}>
						{report.achievements.map((a, i: number) => (
							<Row key={i} align="start" gap={16} className="py-6 px-8 bg-green-50">
								<div className="w-2 h-2 bg-green-600 mt-3 flex-shrink-0" />
								<Text className="text-lg text-gray-900 leading-relaxed">
									{a.description}
								</Text>
							</Row>
						))}
					</Stack>
				</Stack>
			)}

			{/* Footer */}
			<div className="pt-12 mt-16 border-t border-gray-200">
				<Text className="text-base text-gray-500 text-center">
					Generated {new Date(report.createdAt).toLocaleDateString()} • Expires {new Date(report.expiresAt).toLocaleDateString()}
				</Text>
			</div>
		</Container>
	);
}

// Inline charts and partner analysis for this page

export interface InstancesTrendData { labels: string[]; current: number[]; previous: number[] }

function InstancesTrendChart({ data }: { data?: InstancesTrendData }) {
    if (!data || data.labels.length === 0) {
        return (
            <Stack align="center" justify="center" className="py-16 px-8 bg-gray-50 rounded-3xl">
                <Text className="text-lg text-gray-500">No daily data for this period</Text>
            </Stack>
        );
    }

    const chartData = {
        labels: data.labels,
        datasets: [
            {
                label: 'This Week',
                data: data.current.map(v => Math.max(0, v || 0)),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointBackgroundColor: '#2563eb',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 3,
                borderWidth: 4,
            },
            {
                label: 'Previous Week',
                data: data.previous.map(v => Math.max(0, v || 0)),
                borderColor: '#94a3b8',
                backgroundColor: 'rgba(148, 163, 184, 0.05)',
                borderDash: [8, 6],
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#94a3b8',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                borderWidth: 3,
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'top' as const,
                align: 'start' as const,
                labels: { 
                    boxWidth: 16, 
                    boxHeight: 16,
                    padding: 24,
                    font: {
                        size: 16,
                        weight: 'bold',
                    },
                    color: '#374151',
                    usePointStyle: true,
                    pointStyle: 'circle',
                }
            },
            tooltip: { 
                intersect: false, 
                mode: 'index' as const,
                backgroundColor: '#1f2937',
                titleColor: '#ffffff',
                bodyColor: '#ffffff',
                cornerRadius: 12,
                padding: 16,
                titleFont: {
                    size: 16,
                    weight: 'bold',
                },
                bodyFont: {
                    size: 14,
                },
            }
        },
        scales: {
            x: { 
                grid: { display: false },
                border: { display: false },
                ticks: {
                    color: '#6b7280',
                    font: {
                        size: 14,
                        weight: 'normal',
                    },
                    padding: 12,
                }
            },
            y: { 
                grid: { 
                    display: true,
                    color: 'rgba(156, 163, 175, 0.2)',
                    drawBorder: false,
                },
                border: { display: false },
                ticks: {
                    color: '#6b7280',
                    font: {
                        size: 14,
                        weight: 'normal',
                    },
                    padding: 12,
                }
            }
        },
        layout: { padding: 12 },
        interaction: {
            intersect: false,
            mode: 'index' as const,
        },
    } as const;

    return (
        <div className="relative h-[500px] bg-white rounded-3xl p-4">
            <Line data={chartData} options={options} />
        </div>
    );
}

const MODERN_PALETTE = [
    '#2563eb', '#16a34a', '#ea580c', '#dc2626', '#7c3aed', '#0891b2', '#059669', '#9333ea', '#c2410c', '#475569'
];

function FlagCountBarChart({ flags }: { flags: Array<{ id: number; name: string; count: number }> }) {
    if (!flags || flags.length === 0) {
        return (
            <Stack align="center" justify="center" className="py-16">
                <Text className="text-lg text-gray-500">No communication patterns for this period</Text>
            </Stack>
        );
    }

    const total = Math.max(1, flags.reduce((sum, f) => sum + (f.count || 0), 0));
    
    return (
        <Stack gap={20}>
            {/* Stacked Bar */}
            <div className="flex h-16 w-full overflow-hidden bg-gray-100">
                {flags.map((flag, i) => {
                    const percentage = ((flag.count || 0) / total) * 100;
                    return (
                        <div
                            key={flag.id}
                            className="h-full hover:brightness-110 transition-all duration-200"
                            style={{ 
                                width: `${percentage}%`, 
                                backgroundColor: MODERN_PALETTE[i % MODERN_PALETTE.length] 
                            }}
                            title={`${flag.name}: ${flag.count} issues (${percentage.toFixed(1)}%)`}
                        />
                    );
                })}
            </div>

            {/* Legend */}
            <Stack gap={12}>
                {flags.map((flag, i) => {
                    const percentage = ((flag.count || 0) / total) * 100;
                    return (
                        <Row key={flag.id} align="center" gap={16}>
                            <div 
                                className="w-6 h-6 flex-shrink-0"
                                style={{ backgroundColor: MODERN_PALETTE[i % MODERN_PALETTE.length] }}
                            />
                            <Row justify="space-between" className="flex-1">
                                <Text className="text-lg font-medium text-gray-900">
                                    {flag.name}
                                </Text>
                                <Text className="text-lg text-gray-700">
                                    {flag.count} issues ({percentage.toFixed(1)}%)
                                </Text>
                            </Row>
                        </Row>
                    );
                })}
            </Stack>
        </Stack>
    );
}

function AreasToFocusChart({ flags }: { flags: Array<{ flagId: number; count: number; percentage: number; trend: string; changePercent: number }> }) {
    if (!flags || flags.length === 0) {
        return (
            <Stack align="center" justify="center" className="py-16">
                <Text className="text-lg text-gray-500">No areas to focus on for this period</Text>
            </Stack>
        );
    }

    const total = Math.max(1, flags.reduce((sum, f) => sum + (f.count || 0), 0));
    
    return (
        <Stack gap={20}>
            {/* Stacked Bar */}
            <div className="flex h-16 w-full overflow-hidden bg-gray-100">
                {flags.map((flag, i) => {
                    const info = getFlagInfo(flag.flagId);
                    const percentage = ((flag.count || 0) / total) * 100;
                    return (
                        <div
                            key={flag.flagId}
                            className="h-full hover:brightness-110 transition-all duration-200"
                            style={{ 
                                width: `${percentage}%`, 
                                backgroundColor: MODERN_PALETTE[i % MODERN_PALETTE.length] 
                            }}
                            title={`${info?.name || 'Unknown'}: ${flag.count} issues (${flag.percentage.toFixed(1)}%)`}
                        />
                    );
                })}
            </div>

            {/* Legend */}
            <Stack gap={12}>
                {flags.map((flag, i) => {
                    const info = getFlagInfo(flag.flagId);
                    const isImproving = flag.trend === 'down';
                    const isWorsening = flag.trend === 'up';
                    
                    return (
                        <Row key={flag.flagId} align="center" gap={16}>
                            <div 
                                className="w-6 h-6 flex-shrink-0"
                                style={{ backgroundColor: MODERN_PALETTE[i % MODERN_PALETTE.length] }}
                            />
                            <Row justify="space-between" className="flex-1">
                                <Text className="text-lg font-medium text-gray-900">
                                    {info?.name || 'Unknown'}
                                </Text>
                                <Row align="center" gap={16}>
                                    <Text className="text-lg text-gray-700">
                                        {flag.count} issues ({flag.percentage.toFixed(1)}%)
                                    </Text>
                                    <div className={`px-3 py-1 text-sm font-semibold ${
                                        isImproving 
                                            ? 'bg-green-100 text-green-800' 
                                            : isWorsening 
                                            ? 'bg-red-100 text-red-800' 
                                            : 'bg-gray-100 text-gray-700'
                                    }`}>
                                        {flag.changePercent > 0 ? '+' : ''}{flag.changePercent}%
                                    </div>
                                </Row>
                            </Row>
                        </Row>
                    );
                })}
            </Stack>
        </Stack>
    );
}

function PartnerAnalysisSection({ partners }: { partners: Array<{ partnerName: string; partnerSlackId: string; messagesExchanged: number; flagsWithPartner: number }> }) {
    const segments = partners
        .filter(p => (p.messagesExchanged || 0) > 0 && (p.flagsWithPartner || 0) > 0)
        .sort((a, b) => (b.flagsWithPartner - a.flagsWithPartner))
        .slice(0, 6);

    if (segments.length === 0) {
        return null; // Don't render section if no data
    }

    // Calculate percentage among partners only, not all messages
    const partnerTotal = Math.max(1, segments.reduce((s, p) => s + (p.flagsWithPartner || 0), 0));

    return (
        <>
            <Title order={2} className="text-2xl font-bold text-gray-900">
                Communication Partners
            </Title>
            <Stack gap={20}>
                {/* Stacked Bar */}
                <div className="flex h-16 w-full overflow-hidden bg-gray-100">
                    {segments.map((partner, i) => {
                        const percentage = ((partner.flagsWithPartner || 0) / partnerTotal) * 100;
                        return (
                            <div
                                key={partner.partnerSlackId || i}
                                className="h-full hover:brightness-110 transition-all duration-200"
                                style={{ 
                                    width: `${percentage}%`, 
                                    backgroundColor: MODERN_PALETTE[i % MODERN_PALETTE.length] 
                                }}
                                title={`${partner.partnerName}: ${partner.flagsWithPartner} issues (${percentage.toFixed(1)}%) • ${partner.messagesExchanged} messages`}
                            />
                        );
                    })}
                </div>

                {/* Legend */}
                <Stack gap={12}>
                    {segments.map((partner, i) => {
                        const percentage = ((partner.flagsWithPartner || 0) / partnerTotal) * 100;
                        
                        return (
                            <Row key={partner.partnerSlackId || i} align="center" gap={16}>
                                <div 
                                    className="w-6 h-6 flex-shrink-0"
                                    style={{ backgroundColor: MODERN_PALETTE[i % MODERN_PALETTE.length] }}
                                />
                                <Row justify="space-between" className="flex-1">
                                    <Text className="text-lg font-medium text-gray-900">
                                        {partner.partnerName}
                                    </Text>
                                    <Text className="text-lg text-gray-700">
                                        {partner.flagsWithPartner} issues ({percentage.toFixed(1)}%) • {partner.messagesExchanged} messages
                                    </Text>
                                </Row>
                            </Row>
                        );
                    })}
                </Stack>
            </Stack>
        </>
    );
}

function MessagesNeedingAttentionChart({ messages, workspaceId }: { messages: Array<{ channelId: string; messageTs: string; summary: string; flagIds: number[] }>; workspaceId: string }) {
    if (!messages || messages.length === 0) {
        return (
            <Stack align="center" justify="center" className="py-16">
                <Text className="text-lg text-gray-500">No flagged messages for this period</Text>
            </Stack>
        );
    }

    return (
        <Stack gap={8}>
            {messages.map((msg, idx) => {
                // Use Slack protocol for better app integration
                const link = `slack://channel?team=${workspaceId}&id=${msg.channelId}&message=${msg.messageTs}`;
                const flagNames = Array.isArray(msg.flagIds) 
                    ? msg.flagIds.map((id: number) => getFlagInfo(id)?.name || `#${id}`).join(', ') 
                    : '';
                
                return (
                    <Row key={idx} justify="space-between" align="center" className="py-6 px-8 bg-gray-50 hover:bg-gray-100 transition-colors">
                        <Stack gap={4} className="flex-1 min-w-0">
                            <Text className="text-lg text-gray-900 leading-relaxed">
                                {msg.summary || 'Communication issue detected'}
                            </Text>
                            {flagNames && (
                                <Text className="text-base text-gray-600">
                                    {flagNames}
                                </Text>
                            )}
                        </Stack>
                        <Button 
                            size="sm" 
                            onClick={() => window.open(link, '_blank')}
                            className="ml-6 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 font-medium"
                        >
                            View
                        </Button>
                    </Row>
                );
            })}
        </Stack>
    );
}
