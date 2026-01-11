'use client';

import { Text, Stack } from '@/components/ui';
import {
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	BarElement,
	PointElement,
	LineElement,
	Filler,
	Tooltip,
	Legend,
	TooltipItem
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip, Legend);

export interface InstancesTrendData { labels: string[]; current: number[]; previous: number[] }

export function InstancesTrendChart({ data }: { data?: InstancesTrendData }) {
	if (!data || data.labels.length === 0) {
		return (
			<Stack className="items-center justify-center py-6">
				<Text size="sm" c="dimmed">No daily data for this period.</Text>
			</Stack>
		);
	}

	const chartData = {
		labels: data.labels,
		datasets: [
			{
				label: 'This period',
				data: data.current.map(v => Math.max(0, v || 0)),
				borderColor: 'rgba(59, 130, 246, 1)', // blue-500
				backgroundColor: 'rgba(59, 130, 246, 0.15)',
				fill: true,
				tension: 0.35,
				pointRadius: 2,
			},
			{
				label: 'Previous period',
				data: data.previous.map(v => Math.max(0, v || 0)),
				borderColor: 'rgba(156, 163, 175, 1)', // neutral-400
				backgroundColor: 'rgba(156, 163, 175, 0.1)',
				borderDash: [4, 3],
				fill: true,
				tension: 0.35,
				pointRadius: 2,
			}
		]
	};

	const options = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { position: 'bottom' as const, labels: { boxWidth: 10, boxHeight: 10 } },
			tooltip: { intersect: false, mode: 'index' as const }
		},
		scales: {
			x: { grid: { display: false, drawBorder: false } },
			y: { grid: { display: false, drawBorder: false }, ticks: { display: false } }
		},
		layout: { padding: 0 },
	};

	return (
		<div className="relative h-60">
			<Line data={chartData} options={options} />
		</div>
	);
}

// Muted palette for stacked segments
const PALETTE = [
	'#2563eb', // blue-600
	'#059669', // emerald-600
	'#f59e0b', // amber-500
	'#ef4444', // red-500
	'#7c3aed', // violet-600
	'#0ea5e9', // sky-500
	'#14b8a6', // teal-500
	'#a855f7', // purple-500
	'#f97316', // orange-500
	'#64748b', // slate-500
];

export function FlagCountBarChart({ flags }: { flags: Array<{ id: number; name: string; count: number }> }) {
	if (!flags || flags.length === 0) {
		return (
			<Stack className="items-center justify-center py-6">
				<Text size="sm" c="dimmed">No flag data for this period.</Text>
			</Stack>
		);
	}

	const total = Math.max(1, flags.reduce((sum, f) => sum + (f.count || 0), 0));
	const datasets = flags.map((f, i) => ({
		label: f.name,
		data: [((f.count || 0) / total) * 100],
		backgroundColor: PALETTE[i % PALETTE.length],
		borderWidth: 0,
		stack: 'flags'
	}));

	const chartData = { labels: [''] as string[], datasets };

	const options = {
		indexAxis: 'y' as const,
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { position: 'bottom' as const, labels: { boxWidth: 10, boxHeight: 10 } },
			tooltip: {
				callbacks: {
					label: (ctx: TooltipItem<'bar'>) => `${ctx.dataset.label}: ${(ctx.parsed.x ?? 0).toFixed(1)}%`
				}
			}
		},
		scales: {
			x: { stacked: true, display: false, grid: { display: false, drawBorder: false } },
			y: { stacked: true, display: false, grid: { display: false, drawBorder: false } }
		},
		layout: { padding: 0 }
	};

	return (
		<div className="relative h-8">
			<Bar data={chartData} options={options} />
		</div>
	);
}
