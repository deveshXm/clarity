#!/usr/bin/env tsx
// Environment variables loaded automatically by Node.js --env-file flag

console.log('📋 Starting report generation runner...');

// Simple script to run reports manually for testing

async function runReports() {
    console.log('🚀 Starting report generation...');

    try {
        // Import report generators
        const { generateWeeklyReports } = await import('./generate-weekly-reports');
        const { generateMonthlyReports } = await import('./generate-monthly-reports');

        console.log('📊 Generating weekly reports...');
        await generateWeeklyReports();
        console.log('✅ Weekly reports completed');

        console.log('📈 Generating monthly reports...');
        await generateMonthlyReports();
        console.log('✅ Monthly reports completed');

        console.log('🎉 All reports generated successfully!');
    } catch (error) {
        console.error('❌ Error generating reports:', error);
        process.exit(1);
    }
}

runReports();
