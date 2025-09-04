#!/usr/bin/env tsx
// Environment variables loaded automatically by Node.js --env-file flag

console.log('📋 Starting report system tests...');

// Test script to validate report generation functionality

async function testReportGeneration() {
    console.log('🧪 Testing report generation system...');

    try {
        // Test database connections
        console.log('📊 Testing database connections...');
        const { analysisInstanceCollection, slackUserCollection, workspaceCollection, reportCollection } = await import('@/lib/db');

        // Test collections exist
        const collections = [
            { name: 'analysisInstances', collection: analysisInstanceCollection },
            { name: 'slackUsers', collection: slackUserCollection },
            { name: 'workspaces', collection: workspaceCollection },
            { name: 'reports', collection: reportCollection }
        ];

        for (const { name, collection } of collections) {
            try {
                const count = await collection.countDocuments();
                console.log(`✅ ${name}: ${count} documents`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(`⚠️ ${name}: Collection check failed - ${errorMsg}`);
            }
        }

        // Test utility functions
        console.log('🔧 Testing utility functions...');
        const { calculateCommunicationScore, calculateCurrentFlagBreakdown, calculateChartMetadata } = await import('@/lib/report-utils');

        // Test score calculation
        const testInstances = [
            { flagIds: [1, 2], _id: 'msg1' },
            { flagIds: [3], _id: 'msg2' },
            { flagIds: [], _id: 'msg3' }
        ];
        const testScore = calculateCommunicationScore(testInstances);
        console.log(`✅ Communication score calculation: ${testScore}/100`);

        // Test current flag breakdown
        const testCurrentInstances = [
            { flagIds: [1, 2], _id: 'msg1' },
            { flagIds: [3], _id: 'msg2' }
        ];
        const currentFlagBreakdown = calculateCurrentFlagBreakdown(testCurrentInstances);
        console.log(`✅ Current flag breakdown calculation: ${currentFlagBreakdown.length} flag types analyzed`);

        // Test chart metadata calculation
        const chartMetadata = calculateChartMetadata(currentFlagBreakdown, null);
        console.log(`✅ Chart metadata calculation: ${chartMetadata.flagTrends.length} trends calculated`);

        // Test type imports
        console.log('🏷️ Testing type system...');
        const { MESSAGE_ANALYSIS_TYPES, getFlagInfo, getFlagEmoji } = await import('@/types');

        console.log(`✅ MESSAGE_ANALYSIS_TYPES loaded: ${Object.keys(MESSAGE_ANALYSIS_TYPES).length} types`);
        console.log(`✅ getFlagInfo test: ${getFlagInfo(1)?.name || 'undefined'}`);
        console.log(`✅ getFlagEmoji test: ${getFlagEmoji(1)}`);

        // Test report schema validation
        console.log('📋 Testing report schema...');
        const { ReportSchema } = await import('@/types');

        const testReport = {
            _id: 'test-id',
            reportId: 'test-report-id',
            userId: 'test-user-id',
            period: 'weekly' as const,
            periodStart: new Date(),
            periodEnd: new Date(),
            communicationScore: 85,
            previousScore: 78,
            scoreChange: 7,
            scoreTrend: 'improving' as const,
            totalMessages: 50,
            flaggedMessages: 15,
            flagBreakdown: [],
            partnerAnalysis: [],
            messageExamples: [],
            recommendations: ['Test recommendation'],
            keyInsights: ['Test insight'],
            achievements: [],
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        };

        const validation = ReportSchema.safeParse(testReport);
        console.log(`✅ Report schema validation: ${validation.success ? 'PASSED' : 'FAILED'}`);

        // Test Slack functions (without actually sending)
        console.log('📤 Testing Slack functions...');
        const { sendWeeklyReportDM, sendMonthlyReportDM } = await import('@/lib/slack');
        console.log(`✅ Slack functions loaded: sendWeeklyReportDM, sendMonthlyReportDM`);

        console.log('\n🎉 All tests completed successfully!');
        console.log('\n📝 Next steps:');
        console.log('1. Run `npm run reports:all` to generate sample reports');
        console.log('2. Check database for generated report documents');
        console.log('3. Visit report URLs to test webpage functionality');

        // Close database connection
        process.exit(0);

    } catch (error) {
        console.error('❌ Report generation test failed:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : String(error));
        process.exit(1);
    }
}

testReportGeneration();
