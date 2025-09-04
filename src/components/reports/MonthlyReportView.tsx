'use client';

import { useMemo } from 'react';
import { Title, Text, Stack, Row, Container, Link } from '@/components/ui';
import { getFlagInfo, getFlagEmoji } from '@/types';
import { InstancesTrendChart, FlagCountBarChart } from './FlagTrendChart';
import { PartnerAnalysis } from './PartnerAnalysis';

interface MonthlyReportViewProps {
    report: any;
}

export function MonthlyReportView({ report }: MonthlyReportViewProps) {
    const flagBarData = useMemo(() => {
        return report.currentPeriod.flagBreakdown.map((f: any) => ({
            name: getFlagInfo(f.flagId)?.name || 'Unknown',
            count: f.count
        }));
    }, [report.currentPeriod.flagBreakdown]);

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long'
        });
    };

    // Separate improving and concerning flags
    const improvingFlags = report.currentPeriod.flagBreakdown.filter((f: any) => f.trend === 'down');
    const concerningFlags = report.currentPeriod.flagBreakdown.filter((f: any) => f.trend === 'up');
    const stableFlags = report.currentPeriod.flagBreakdown.filter((f: any) => f.trend === 'stable');

    return (
        <Container className="mx-auto max-w-[820px] px-6 py-12 space-y-8 bg-white min-h-screen">
            {/* Header */}
            <div className="mb-2 text-sm font-medium text-neutral-500">Monthly report</div>
            <Stack className="mb-6">
                <Title order={1} className="text-3xl font-bold leading-tight tracking-tight text-neutral-900">
                    Monthly communication report
                </Title>
                <Text className="text-sm leading-loose text-[#3e3e3f]">
                    {formatDate(report.periodStart)} – {formatDate(report.periodEnd)}
                </Text>
            </Stack>

            {/* Monthly Stats (compact grid, no cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center">
                    <Text className="text-sm text-neutral-500">Messages analyzed</Text>
                    <Text className="text-xl font-semibold text-neutral-900">{report.currentPeriod.totalMessages}</Text>
                </div>
                <div className="text-center">
                    <Text className="text-sm text-neutral-500">Improvements made</Text>
                    <Text className="text-xl font-semibold text-neutral-900">{report.currentPeriod.flaggedMessages}</Text>
                </div>
                <div className="text-center">
                    <Text className="text-sm text-neutral-500">Improvement rate</Text>
                    <Text className="text-xl font-semibold text-neutral-900">
                        {report.currentPeriod.totalMessages > 0 ? Math.round((report.currentPeriod.flaggedMessages / report.currentPeriod.totalMessages) * 100) : 0}%
                    </Text>
                </div>
            </div>

            {/* Daily instances trend (line) */}
            <div>
                <Title order={3} className="mb-3 text-base font-semibold text-neutral-900">Daily instances trend</Title>
                <InstancesTrendChart data={report.chartMetadata?.instancesTrend} />
            </div>

            {/* Flag counts (bar) */}
            <div>
                <Title order={3} className="mb-3 text-base font-semibold text-neutral-900">Flag counts by type</Title>
                <FlagCountBarChart flags={flagBarData} />
            </div>

            {/* Flag Analysis Sections */}
            <Row wrap="wrap" gap={24} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Improving Areas */}
                {improvingFlags.length > 0 && (
                    <Stack className="bg-green-50 border-green-200 rounded p-4">
                        <Title order={4} className="mb-4 text-base font-semibold text-neutral-900">Areas showing improvement</Title>
                        <Stack>
                            {improvingFlags.map((flag: any) => {
                                const flagInfo = getFlagInfo(flag.flagId);
                                return (
                                    <Row key={flag.flagId} justify="space-between" className="p-3 bg-white rounded">
                                        <Row gap={8}>
                                            <Text size="sm">{flagInfo?.name}</Text>
                                        </Row>
                                        <Text size="sm" className="text-green-700">-{Math.abs(flag.changePercent)}%</Text>
                                    </Row>
                                );
                            })}
                        </Stack>
                    </Stack>
                )}

                {/* Areas Needing Attention */}
                {concerningFlags.length > 0 && (
                    <Stack className="bg-red-50 border-red-200 rounded p-4">
                        <Title order={4} className="mb-4 text-base font-semibold text-neutral-900">Areas needing attention</Title>
                        <Stack>
                            {concerningFlags.map((flag: any) => {
                                const flagInfo = getFlagInfo(flag.flagId);
                                return (
                                    <Row key={flag.flagId} justify="space-between" className="p-3 bg-white rounded">
                                        <Row gap={8}>
                                            <Text size="sm">{flagInfo?.name}</Text>
                                        </Row>
                                        <Text size="sm" className="text-red-700">+{flag.changePercent}%</Text>
                                    </Row>
                                );
                            })}
                        </Stack>
                    </Stack>
                )}

                {/* Stable Areas */}
                {stableFlags.length > 0 && (
                    <Stack className="bg-yellow-50 border-yellow-200 rounded p-4">
                        <Title order={4} className="mb-4 text-base font-semibold text-neutral-900">Stable performance</Title>
                        <Stack>
                            {stableFlags.map((flag: any) => {
                                const flagInfo = getFlagInfo(flag.flagId);
                                return (
                                    <Row key={flag.flagId} justify="space-between" className="p-3 bg-white rounded">
                                        <Row gap={8}>
                                            <Text size="sm">{flagInfo?.name}</Text>
                                        </Row>
                                        <Text size="sm" className="text-yellow-700">0%</Text>
                                    </Row>
                                );
                            })}
                        </Stack>
                    </Stack>
                )}
            </Row>

            {/* Communication Partners */}
            <PartnerAnalysis partners={report.currentPeriod.partnerAnalysis} totalFlaggedCount={report.currentPeriod.flaggedMessages} />

            {/* Top flagged messages */}
            {Array.isArray(report.messageExamples) && report.messageExamples.length > 0 && (
                <div>
                    <Title order={3} className="mb-3 text-xl">Top flagged messages</Title>
                    <div className="space-y-3">
                        {report.messageExamples.slice(0, 10).map((ex: any, idx: number) => {
                            const link = `https://slack.com/app_redirect?channel=${encodeURIComponent(ex.channelId)}&message_ts=${encodeURIComponent(ex.messageTs)}`;
                            return (
                                <Row key={idx} justify="space-between" className="p-3 border border-gray-200 rounded">
                                    <Stack className="min-w-0">
                                        <Text size="sm" c="dimmed">{ex.summary}</Text>
                                        {Array.isArray(ex.flagIds) && ex.flagIds.length > 0 && (
                                            <Text size="xs" c="dimmed">Flags: {ex.flagIds.join(', ')}</Text>
                                        )}
                                    </Stack>
                                    <Link href={link} target="_blank">Open</Link>
                                </Row>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Key Insights */}
            <Stack className="bg-white rounded border border-gray-200 p-6">
                <Title order={3} className="mb-6 text-xl">Key insights</Title>
                <Stack>
                    {report.keyInsights.map((insight: string, index: number) => (
                        <Row key={index} gap={12} className="p-4 bg-blue-50 rounded-lg">
                            <Text className="min-w-0">{insight}</Text>
                        </Row>
                    ))}
                </Stack>
            </Stack>

            {/* Recommendations - readable bullets */}
            <div>
                <Title order={3} className="mb-3 text-xl">Recommendations</Title>
                <ul className="list-disc pl-6 space-y-2">
                    {report.recommendations.map((rec: string, index: number) => (
                        <li key={index} className="text-sm text-gray-800">{rec}</li>
                    ))}
                </ul>
            </div>

            {/* Achievements */}
            {report.achievements.length > 0 && (
                <Stack className="bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200 rounded p-6">
                    <Title order={3} className="mb-6 text-xl text-yellow-800">Monthly achievements</Title>
                    <Stack>
                        {report.achievements.map((achievement: any, index: number) => (
                            <Row key={index} gap={12} className="p-4 bg-white rounded-lg shadow-sm">
                                <Text className="text-yellow-800 font-medium">{achievement.description}</Text>
                            </Row>
                        ))}
                    </Stack>
                </Stack>
            )}

            {/* Footer */}
            <Stack className="text-center py-8 border-t border-gray-200">
                <Text c="dimmed" size="sm">
                    Monthly report generated on {new Date(report.createdAt).toLocaleDateString()} • Expires on {new Date(report.expiresAt).toLocaleDateString()}
                </Text>
                <Text c="dimmed" size="xs">
                    Based on {report.currentPeriod.flaggedMessages} improvements from {report.currentPeriod.totalMessages} analyzed messages
                </Text>
            </Stack>
        </Container>
    );
}
