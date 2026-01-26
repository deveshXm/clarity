import { 
    ExampleTaskInput,
    MessageAnalysisResult,
    ImprovedMessageResult,
    ComprehensiveAnalysisResult,
    CoachingFlag
} from "@/types";
import Portkey from 'portkey-ai';
import { IMPROVEMENT_PROMPT_TEMPLATE, IMPROVEMENT_WITH_CONTEXT_PROMPT_TEMPLATE, BASIC_REPHRASE_ANALYSIS_PROMPT, CONTEXTUAL_REPHRASE_ANALYSIS_PROMPT, AUTO_COACHING_ANALYSIS_PROMPT } from "@/lib/prompts";

export const exampleTask = async (payload: ExampleTaskInput) => {
    console.log('Example task called with payload:', payload);
    
    // Example implementation
    return {
        success: true,
        message: "Example task completed successfully",
        data: {
            taskId: payload.taskId,
            status: "completed"
        }
    };
};

// ------------- Portkey client setup ---------------

const portkey = new Portkey({
    apiKey: process.env.PORTKEY_AI_KEY || '',
});

const modelName = '@azure-openai/gpt-5-mini';

async function chatCompletion(messages: Array<{role: string; content: string}>): Promise<string> {
    const response = await portkey.chat.completions.create({
        messages,
        model: modelName,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
    });
    return String(response.choices[0]?.message?.content ?? '');
}

// ------------------- Auto-coaching logic -------------------

function parseFlags(raw: unknown) {
    try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return data as { flags: MessageAnalysisResult['flags']; target?: MessageAnalysisResult['target'] };
    } catch {
        return { flags: [] };
    }
}

export const generateImprovedMessage = async (message: string, flagType: string): Promise<ImprovedMessageResult> => {
    const prompt = IMPROVEMENT_PROMPT_TEMPLATE.replace('{{FLAG}}', flagType);
    const raw = await chatCompletion([
        { role: 'system', content: prompt },
        { role: 'user', content: message },
    ]);
    return JSON.parse(raw) as ImprovedMessageResult;
};

// ------------------- Rephrase-specific functions -------------------

// Helper to build categories string from coaching flags
function buildCategoriesString(flags: CoachingFlag[]): string {
    const enabledFlags = flags.filter(f => f.enabled);
    return enabledFlags
        .map((f, i) => `${i + 1}: ${f.name} - ${f.description}`)
        .join(', ');
}

export const analyzeMessageForRephraseWithoutContext = async (
    message: string,
    coachingFlags: CoachingFlag[],
): Promise<MessageAnalysisResult> => {
    const categoriesStr = buildCategoriesString(coachingFlags);
    const systemPrompt = BASIC_REPHRASE_ANALYSIS_PROMPT.replace('{{CATEGORIES}}', categoriesStr);
    const userPrompt = `Message to analyze: "${message.replace(/\n/g, ' ')}"`;
    const raw = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ]);
    const { flags } = parseFlags(raw);
    return { flags: flags ?? [], target: undefined }; // No target identification without context
};

export const analyzeMessageForRephraseWithContext = async (
    message: string,
    context: string[],
    coachingFlags: CoachingFlag[],
): Promise<MessageAnalysisResult> => {
    const categoriesStr = buildCategoriesString(coachingFlags);
    const systemPrompt = CONTEXTUAL_REPHRASE_ANALYSIS_PROMPT.replace('{{CATEGORIES}}', categoriesStr);
    const history = context.slice(0, 10).join('\n'); // Last 10 messages for context
    const userPrompt = `CURRENT MESSAGE TO ANALYZE: "${message.replace(/\n/g, ' ')}"\n\nCONVERSATION HISTORY (for context only):\n${history || 'None.'}`;
    const raw = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ]);
    const { flags, target } = parseFlags(raw);
    return { flags: flags ?? [], target };
};

export const generateImprovedMessageWithContext = async (
    message: string, 
    flagType: string, 
    context: string[]
): Promise<ImprovedMessageResult> => {
    const prompt = IMPROVEMENT_WITH_CONTEXT_PROMPT_TEMPLATE.replace('{{FLAG}}', flagType);
    const history = context.slice(0, 10).join('\n'); // Last 10 messages for context
    const userPrompt = `MESSAGE TO IMPROVE: "${message}"\n\nCONVERSATION HISTORY (for context):\n${history || 'None.'}`;
    const raw = await chatCompletion([
        { role: 'system', content: prompt },
        { role: 'user', content: userPrompt },
    ]);
    return JSON.parse(raw) as ImprovedMessageResult;
};

// ------------------- Optimized Auto-Coaching (Single AI Call) -------------------

function parseComprehensiveAnalysis(raw: unknown, enabledFlags: CoachingFlag[]): ComprehensiveAnalysisResult {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
        
        // Map flagIndex (1-based) back to actual flag names from input
        const mappedFlags = (data.flags || [])
            .filter((f: { flagIndex: number }) => f.flagIndex >= 1 && f.flagIndex <= enabledFlags.length)
            .map((f: { flagIndex: number; confidence: number; explanation: string }) => ({
                typeId: f.flagIndex,
                type: enabledFlags[f.flagIndex - 1].name,
                confidence: f.confidence,
                explanation: f.explanation,
            }));
        
        return {
            needsCoaching: data.needsCoaching ?? false,
            flags: mappedFlags,
            targetIds: data.targetIds || [],
            improvedMessage: data.improvedMessage || null,
            reasoning: data.reasoning || { whyNeedsCoaching: '', primaryIssue: 'none', contextInfluence: '' }
        };
    } catch (error) {
        console.error('Failed to parse comprehensive analysis:', error);
        return {
            needsCoaching: false,
            flags: [],
            targetIds: [],
            improvedMessage: null,
            reasoning: { whyNeedsCoaching: 'Parse error', primaryIssue: 'none', contextInfluence: '' }
        };
    }
}

export const comprehensiveMessageAnalysis = async (
    message: string,
    conversationHistory: string[],
    coachingFlags: CoachingFlag[]
): Promise<ComprehensiveAnalysisResult> => {
    const enabledFlags = coachingFlags.filter(f => f.enabled);
    const categoriesStr = buildCategoriesString(coachingFlags);
    const systemPrompt = AUTO_COACHING_ANALYSIS_PROMPT.replace('{{CATEGORIES}}', categoriesStr);
    const history = conversationHistory.slice(0, 15).join('\n'); // Last 15 messages for context
    const userPrompt = `CURRENT MESSAGE TO ANALYZE: "${message.replace(/\n/g, ' ')}"\n\nCONVERSATION HISTORY (for context only):\n${history || 'None.'}`;
    
    const raw = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ]);
    
    return parseComprehensiveAnalysis(raw, enabledFlags);
};