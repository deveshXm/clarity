import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { comprehensiveMessageAnalysis } from '@/lib/ai';
import { CoachingFlagSchema, DEFAULT_COACHING_FLAGS, CoachingFlag } from '@/types';
import { logInfo, logDebug, logWarn, logError } from '@/lib/logger';

// Request schema
const EvaluateRequestSchema = z.object({
    message: z.string().min(1, 'Message is required'),
    history: z.array(z.string()).optional().default([]),
    coachingFlags: z.array(CoachingFlagSchema).optional(),
});

// Response type
interface EvaluateResponse {
    flagged: boolean;
    flags: Array<{
        type: string;
        confidence: number;
        explanation: string;
    }>;
    rephrasedMessage: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse<EvaluateResponse | { error: string }>> {
    const requestId = crypto.randomUUID().slice(0, 8);
    
    logInfo('[Evaluate API] Request received', { requestId });
    
    try {
        // Parse request body
        const body = await request.json();
        logDebug('[Evaluate API] Request body', { requestId, body });
        
        // Validate request
        const parseResult = EvaluateRequestSchema.safeParse(body);
        if (!parseResult.success) {
            const errorMessage = parseResult.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
            logWarn('[Evaluate API] Validation failed', { requestId, errors: errorMessage });
            return NextResponse.json({ error: errorMessage }, { status: 400 });
        }
        
        const { message, history, coachingFlags } = parseResult.data;
        
        // Use provided flags or defaults
        const flags: CoachingFlag[] = coachingFlags || DEFAULT_COACHING_FLAGS;
        const enabledFlags = flags.filter(f => f.enabled);
        
        logInfo('[Evaluate API] Starting analysis', {
            requestId,
            messageLength: message.length,
            historyLength: history.length,
            enabledFlagsCount: enabledFlags.length,
            enabledFlags: enabledFlags.map(f => f.name),
        });
        
        // Run AI analysis
        const startTime = Date.now();
        const analysisResult = await comprehensiveMessageAnalysis(message, history, flags);
        const duration = Date.now() - startTime;
        
        logInfo('[Evaluate API] Analysis complete', {
            requestId,
            duration: `${duration}ms`,
            needsCoaching: analysisResult.needsCoaching,
            flagsFound: analysisResult.flags.length,
            flagTypes: analysisResult.flags.map(f => f.type),
        });
        
        // Build response (flag names already mapped in comprehensiveMessageAnalysis)
        const response: EvaluateResponse = {
            flagged: analysisResult.needsCoaching,
            flags: analysisResult.flags.map(f => ({
                type: f.type,
                confidence: f.confidence,
                explanation: f.explanation,
            })),
            rephrasedMessage: analysisResult.improvedMessage?.improvedMessage || null,
        };
        
        logDebug('[Evaluate API] Response', { requestId, response });
        
        return NextResponse.json(response);
        
    } catch (error) {
        logError('[Evaluate API] Error', error instanceof Error ? error : undefined, {
            requestId,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
