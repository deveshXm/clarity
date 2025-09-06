import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { reportCollection } from '@/lib/db';
import { MonthlyReportView } from '@/components/reports/MonthlyReportView';
import { trackEvent } from '@/lib/posthog';
import { EVENTS } from '@/lib/analytics/events';

interface Props {
    params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: '📈 Monthly Communication Report',
        description: 'Your detailed monthly communication analytics and trends',
    };
}

export default async function MonthlyReportPage({ params }: Props) {
    const { id } = await params;
    
    // 🔍 Fetch report data
    const report = await reportCollection.findOne({ reportId: id });

    if (!report) {
        notFound();
    }

    // ⏰ Check if report is expired
    if (new Date() > report.expiresAt) {
        notFound();
    }

    // 📊 Track report view
    trackEvent(report.userId, EVENTS.REPORT_VIEWED, {
        report_id: report.reportId,
        period: report.period,
        workspace_id: report.workspaceId,
        communication_score: report.communicationScore,
        score_trend: report.scoreTrend,
    });

    // Convert MongoDB document to plain object and serialize all data
    const serializedReport = JSON.parse(JSON.stringify(report, (key, value) => {
        // Convert ObjectIds to strings
        if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'ObjectId') {
            return value.toString();
        }
        // Convert Dates to ISO strings
        if (value instanceof Date) {
            return value.toISOString();
        }
        return value;
    }));

    return <MonthlyReportView report={serializedReport} />;
}
