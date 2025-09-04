'use client';

import { Title, Text } from '@/components/ui';

interface PartnerAnalysisProps {
	partners: Array<{
		partnerName: string;
		partnerSlackId: string;
		messagesExchanged: number;
		flagsWithPartner: number;
		topIssues: number[];
		relationshipScore: number;
		trend: 'improving' | 'declining' | 'stable';
	}>;
	totalFlaggedCount?: number;
}

export function PartnerAnalysis({ partners, totalFlaggedCount = 0 }: PartnerAnalysisProps) {
	const total = Math.max(1, totalFlaggedCount || partners.reduce((s, p) => s + (p.flagsWithPartner || 0), 0));
	const segments = partners
		.filter(p => (p.messagesExchanged || 0) > 0 && (p.flagsWithPartner || 0) > 0)
		.sort((a, b) => (b.flagsWithPartner - a.flagsWithPartner))
		.slice(0, 8);

	return (
		<div className="space-y-2">
			<Title order={3} className="text-base font-semibold text-neutral-900">Communication partners</Title>
			{segments.length === 0 ? (
				<Text className="text-sm text-neutral-500 py-3">No partner data for this period.</Text>
			) : (
				<div className="space-y-2">
					{/* Stacked bar */}
					<div className="border border-gray-200 rounded-md p-3">
						<div className="flex h-3 w-full overflow-hidden rounded-sm">
							{segments.map((p, i) => (
								<div
									key={p.partnerSlackId || i}
									className="h-full"
									style={{ width: `${Math.max(0, Math.round(((p.flagsWithPartner || 0) / total) * 100))}%`, backgroundColor: COLORS[i % COLORS.length] }}
									title={`${p.partnerName}: ${Math.round(((p.flagsWithPartner || 0) / total) * 100)}%`}
								/>
							))}
						</div>
					</div>

					{/* Legend */}
					<div className="flex flex-wrap gap-3 text-xs text-neutral-700">
						{segments.map((p, i) => (
							<div key={`${p.partnerSlackId}-legend`} className="flex items-center gap-2">
								<span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
								<span className="truncate max-w-[160px]">{p.partnerName}</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

const COLORS = [
	'#2563eb', '#059669', '#f59e0b', '#ef4444', '#7c3aed', '#0ea5e9', '#14b8a6', '#a855f7', '#f97316', '#64748b'
];
