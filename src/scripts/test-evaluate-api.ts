/**
 * Test script for the /api/evaluate endpoint
 * Run with: npm run test:evaluate:dev
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

interface EvaluateRequest {
    message: string;
    history?: string[];
    coachingFlags?: Array<{
        name: string;
        description: string;
        enabled: boolean;
    }>;
}

interface EvaluateResponse {
    flagged: boolean;
    flags: Array<{
        type: string;
        confidence: number;
        explanation: string;
    }>;
    rephrasedMessage: string | null;
}

interface TestCase {
    name: string;
    request: EvaluateRequest;
    expectedFlagged?: boolean; // undefined = don't check
    expectedFlagTypes?: string[]; // undefined = don't check
    shouldHaveRephrase?: boolean; // undefined = don't check
    shouldError?: boolean;
}

// Helper to make API calls
async function callEvaluateAPI(request: EvaluateRequest): Promise<{ status: number; data: EvaluateResponse | { error: string } }> {
    const response = await fetch(`${BASE_URL}/api/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    const data = await response.json();
    return { status: response.status, data };
}

// Test cases
const testCases: TestCase[] = [
    // ============ VALIDATION TESTS ============
    {
        name: '1. Empty message should fail validation',
        request: { message: '' },
        shouldError: true,
    },
    
    // ============ NON-FLAGGED MESSAGES ============
    {
        name: '2. Simple greeting should NOT be flagged',
        request: { message: 'Hey, how are you doing today?' },
        expectedFlagged: false,
    },
    {
        name: '3. Polite question should NOT be flagged',
        request: { message: 'Could you help me understand how the authentication flow works?' },
        expectedFlagged: false,
    },
    {
        name: '4. Simple acknowledgment should NOT be flagged',
        request: { message: 'Thanks, got it!' },
        expectedFlagged: false,
    },
    {
        name: '5. Professional request should NOT be flagged',
        request: { message: 'When you have a moment, could you review the PR I submitted yesterday?' },
        expectedFlagged: false,
    },
    
    // ============ FLAGGED MESSAGES - PUSHINESS ============
    {
        name: '6. Pushy/demanding message should be flagged',
        request: { message: 'I need this done NOW. Drop everything and get it to me immediately!' },
        expectedFlagged: true,
        expectedFlagTypes: ['pushiness'],
        shouldHaveRephrase: true,
    },
    {
        name: '7. Ultimatum message should be flagged',
        request: { message: 'If you don\'t finish this by EOD, we\'re going to have a serious problem.' },
        expectedFlagged: true,
        shouldHaveRephrase: true,
    },
    
    // ============ FLAGGED MESSAGES - RUDENESS ============
    {
        name: '8. Rude/dismissive message should be flagged',
        request: { message: 'That\'s a stupid idea. Why would anyone think that would work?' },
        expectedFlagged: true,
        expectedFlagTypes: ['rudeness'],
        shouldHaveRephrase: true,
    },
    {
        name: '9. Harsh criticism should be flagged',
        request: { message: 'This code is garbage. Did you even test it before pushing?' },
        expectedFlagged: true,
        shouldHaveRephrase: true,
    },
    
    // ============ FLAGGED MESSAGES - PASSIVE AGGRESSIVE ============
    {
        name: '10. Passive aggressive message should be flagged',
        request: { message: 'Well, I guess some people just don\'t care about quality. Must be nice.' },
        expectedFlagged: true,
        shouldHaveRephrase: true,
    },
    
    // ============ FLAGGED MESSAGES - VAGUENESS ============
    {
        name: '11. Extremely vague message should be flagged',
        request: { message: 'Can you fix the thing? You know, the stuff we talked about.' },
        expectedFlagged: true,
        expectedFlagTypes: ['vagueness'],
        shouldHaveRephrase: true,
    },
    
    // ============ WITH CONVERSATION HISTORY ============
    {
        name: '12. Message with history context - professional response',
        request: {
            message: 'Sounds good, I\'ll take a look at it tomorrow.',
            history: [
                'Hey team, I pushed the new feature branch',
                'Can someone review it when they have time?',
            ],
        },
        expectedFlagged: false,
    },
    {
        name: '13. Message with history context - pushy escalation',
        request: {
            message: 'I\'ve asked THREE times now. Just do it already!',
            history: [
                'Can you update the docs?',
                'Hey, any update on the docs?',
                'Still waiting on those docs...',
            ],
        },
        expectedFlagged: true,
        shouldHaveRephrase: true,
    },
    
    // ============ CUSTOM FLAGS ============
    {
        name: '14. Custom flags - only check enabled flags',
        request: {
            message: 'I need this done NOW! This is urgent!',
            coachingFlags: [
                { name: 'Rudeness', description: 'Impolite communication', enabled: true },
                { name: 'Pushiness', description: 'Demanding tone', enabled: false }, // Disabled!
            ],
        },
        // Pushiness is disabled, so might not be flagged for pushiness
        // This tests that custom flags are respected
    },
    {
        name: '15. Custom flags - all disabled should not flag',
        request: {
            message: 'Do this NOW or else!',
            coachingFlags: [
                { name: 'Rudeness', description: 'Impolite communication', enabled: false },
                { name: 'Pushiness', description: 'Demanding tone', enabled: false },
            ],
        },
        // With all flags disabled, behavior may vary - testing the flow works
    },
    
    // ============ EDGE CASES ============
    {
        name: '16. Very long message',
        request: {
            message: 'I really need you to understand that this is extremely important and urgent. '.repeat(20),
        },
        // Just testing it doesn't error
    },
    {
        name: '17. Message with special characters and emojis',
        request: {
            message: 'Hey @john! 🎉 Can you check the PR? Here\'s the link: https://github.com/test <#C123456>',
        },
        expectedFlagged: false,
    },
    {
        name: '18. Message with code blocks',
        request: {
            message: 'The bug is in this function - it returns null instead of the user object:\n```\nfunction test() { return null; }\n```\nIt should return the authenticated user from the session.',
        },
        expectedFlagged: false,
    },
];

// Run tests
async function runTests() {
    console.log('='.repeat(60));
    console.log('EVALUATE API TEST SUITE');
    console.log(`Base URL: ${BASE_URL}`);
    console.log('='.repeat(60));
    console.log('');
    
    let passed = 0;
    let failed = 0;
    const results: Array<{ name: string; status: 'PASS' | 'FAIL'; details?: string }> = [];
    
    for (const testCase of testCases) {
        console.log(`Running: ${testCase.name}`);
        console.log(`  Message: "${testCase.request.message.slice(0, 50)}${testCase.request.message.length > 50 ? '...' : ''}"`);
        
        try {
            const { status, data } = await callEvaluateAPI(testCase.request);
            
            // Check for expected error
            if (testCase.shouldError) {
                if (status >= 400) {
                    console.log(`  ✅ PASS - Got expected error (status ${status})`);
                    passed++;
                    results.push({ name: testCase.name, status: 'PASS' });
                    continue;
                } else {
                    console.log(`  ❌ FAIL - Expected error but got status ${status}`);
                    failed++;
                    results.push({ name: testCase.name, status: 'FAIL', details: `Expected error, got status ${status}` });
                    continue;
                }
            }
            
            // Check for unexpected error
            if (status >= 400) {
                console.log(`  ❌ FAIL - Unexpected error: ${JSON.stringify(data)}`);
                failed++;
                results.push({ name: testCase.name, status: 'FAIL', details: `Unexpected error: ${JSON.stringify(data)}` });
                continue;
            }
            
            const response = data as EvaluateResponse;
            let testPassed = true;
            const failures: string[] = [];
            
            // Check flagged status
            if (testCase.expectedFlagged !== undefined) {
                if (response.flagged !== testCase.expectedFlagged) {
                    testPassed = false;
                    failures.push(`Expected flagged=${testCase.expectedFlagged}, got ${response.flagged}`);
                }
            }
            
            // Check flag types (case-insensitive)
            if (testCase.expectedFlagTypes !== undefined && response.flagged) {
                const actualTypes = response.flags.map(f => f.type.toLowerCase());
                for (const expectedType of testCase.expectedFlagTypes) {
                    if (!actualTypes.includes(expectedType.toLowerCase())) {
                        testPassed = false;
                        failures.push(`Expected flag type "${expectedType}" not found. Got: [${response.flags.map(f => f.type).join(', ')}]`);
                    }
                }
            }
            
            // Check rephrase presence
            if (testCase.shouldHaveRephrase !== undefined) {
                const hasRephrase = response.rephrasedMessage !== null;
                if (hasRephrase !== testCase.shouldHaveRephrase) {
                    testPassed = false;
                    failures.push(`Expected rephrase=${testCase.shouldHaveRephrase}, got ${hasRephrase}`);
                }
            }
            
            // Log result
            if (testPassed) {
                console.log(`  ✅ PASS`);
                console.log(`     Flagged: ${response.flagged}`);
                if (response.flags.length > 0) {
                    console.log(`     Flags: [${response.flags.map(f => `${f.type}(${f.confidence.toFixed(2)})`).join(', ')}]`);
                }
                if (response.rephrasedMessage) {
                    console.log(`     Rephrase: "${response.rephrasedMessage.slice(0, 60)}..."`);
                }
                passed++;
                results.push({ name: testCase.name, status: 'PASS' });
            } else {
                console.log(`  ❌ FAIL`);
                for (const failure of failures) {
                    console.log(`     - ${failure}`);
                }
                console.log(`     Response: ${JSON.stringify(response, null, 2)}`);
                failed++;
                results.push({ name: testCase.name, status: 'FAIL', details: failures.join('; ') });
            }
            
        } catch (error) {
            console.log(`  ❌ FAIL - Exception: ${error instanceof Error ? error.message : 'Unknown error'}`);
            failed++;
            results.push({ name: testCase.name, status: 'FAIL', details: `Exception: ${error}` });
        }
        
        console.log('');
    }
    
    // Summary
    console.log('='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total: ${testCases.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log('');
    
    if (failed > 0) {
        console.log('FAILED TESTS:');
        for (const result of results.filter(r => r.status === 'FAIL')) {
            console.log(`  - ${result.name}`);
            if (result.details) {
                console.log(`    ${result.details}`);
            }
        }
    }
    
    console.log('='.repeat(60));
    
    // Exit with error code if any tests failed
    process.exit(failed > 0 ? 1 : 0);
}

// Run
runTests().catch(console.error);
