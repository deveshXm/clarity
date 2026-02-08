import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeMessage } from '@/lib/ai';
import { CoachingFlagSchema, DEFAULT_COACHING_FLAGS, CoachingFlag } from '@/types';
import { logInfo, logDebug, logWarn, logError } from '@/lib/logger';

// Request schema
const EvaluateRequestSchema = z.object({
    message: z.string().min(1, 'Message is required'),
    coachingFlags: z.array(CoachingFlagSchema).optional(),
    includeReason: z.boolean().optional().default(false),
    prompt: z.string().optional(),  // Custom prompt for evals
});

// Response type
interface EvaluateResponse {
    flagged: boolean;
    flags: string[];
    rephrasedMessage: string | null;
    reason?: string;
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
        
        const { message, coachingFlags, includeReason, prompt: customPrompt } = parseResult.data;
        
        // Use provided flags or defaults
        const flags: CoachingFlag[] = coachingFlags || DEFAULT_COACHING_FLAGS;
        const enabledFlags = flags.filter(f => f.enabled);
        
        logInfo('[Evaluate API] Starting analysis', {
            requestId,
            messageLength: message.length,
            enabledFlagsCount: enabledFlags.length,
            enabledFlags: enabledFlags.map(f => f.name),
            includeReason,
            hasCustomPrompt: !!customPrompt,
        });
        
        // Run AI analysis
        const startTime = Date.now();
        const analysisResult = await analyzeMessage(message, flags, { 
            includeReason, 
            customPrompt 
        });
        const duration = Date.now() - startTime;
        
        logInfo('[Evaluate API] Analysis complete', {
            requestId,
            duration: `${duration}ms`,
            flagged: analysisResult.flags.length > 0,
            flagsFound: analysisResult.flags.length,
            flagNames: analysisResult.flags.map(f => f.flagName),
        });
        
        // Build response
        const response: EvaluateResponse = {
            flagged: analysisResult.flags.length > 0,
            flags: analysisResult.flags.map(f => f.flagName),
            rephrasedMessage: analysisResult.suggestedRephrase,
        };
        
        // Include reason only when requested (for evals)
        if (includeReason && analysisResult.reason) {
            response.reason = analysisResult.reason;
        }
        
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
