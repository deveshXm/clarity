import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { reportCollection } from '@/lib/db';
import { WeeklyReportView } from '@/components/reports/WeeklyReportView';

interface Props {
    params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return {
        title: '📊 Weekly Communication Report',
        description: 'Your personalized weekly communication analytics and insights',
    };
}

export default async function WeeklyReportPage({ params }: Props) {
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

    return <WeeklyReportView report={serializedReport} />;
}
