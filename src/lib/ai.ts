import { CoachingFlag } from "@/types";
import Portkey from 'portkey-ai';
import { MESSAGE_ANALYSIS_PROMPT, MESSAGE_ANALYSIS_PROMPT_WITH_REASONING } from "@/lib/prompts";

// ------------- Portkey client setup ---------------

const portkey = new Portkey({
    apiKey: process.env.PORTKEY_AI_KEY || '',
});

const modelName = '@azure-openai/gpt-oss-120b';

async function chatCompletion(messages: Array<{role: string; content: string}>): Promise<string> {
    const response = await portkey.chat.completions.create({
        messages,
        model: modelName,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
    });
    return String(response.choices[0]?.message?.content ?? '');
}

// ------------- Simple Message Analysis Result ---------------

export interface SimpleAnalysisResult {
    shouldFlag: boolean;
    flags: Array<{
        flagIndex: number;
        flagName: string;
    }>;
    suggestedRephrase: string | null;
    reasoning?: string;
}

// ------------- Single Analysis Function ---------------

function buildFlagsString(flags: CoachingFlag[]): string {
    const enabledFlags = flags.filter(f => f.enabled);
    return enabledFlags
        .map((f, i) => `${i + 1}: ${f.name} - ${f.description}`)
        .join('\n');
}

function parseAnalysisResult(raw: unknown, enabledFlags: CoachingFlag[], includeReasoning: boolean): SimpleAnalysisResult {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
        
        // Flags are now just an array of indices [1, 2, 3]
        const flagIndices: number[] = Array.isArray(data.flags) ? data.flags : [];
        const mappedFlags = flagIndices
            .filter((idx: number) => idx >= 1 && idx <= enabledFlags.length)
            .map((idx: number) => ({
                flagIndex: idx,
                flagName: enabledFlags[idx - 1].name,
            }));
        
        const result: SimpleAnalysisResult = {
            shouldFlag: data.shouldFlag ?? false,
            flags: mappedFlags,
            suggestedRephrase: data.suggestedRephrase || null,
        };
        
        if (includeReasoning && data.reasoning) {
            result.reasoning = data.reasoning;
        }
        
        return result;
    } catch (error) {
        console.error('Failed to parse analysis:', error);
        return {
            shouldFlag: false,
            flags: [],
            suggestedRephrase: null,
        };
    }
}

export interface AnalyzeMessageOptions {
    includeReasoning?: boolean;
    customPrompt?: string;  // For evals - override default prompt
}

/**
 * Analyzes a message for communication issues based on user's coaching flags.
 * Returns whether it should be flagged, which flags apply, and a suggested rephrase.
 * @param message - The message to analyze
 * @param coachingFlags - The coaching flags to check against
 * @param options.includeReasoning - If true, includes reasoning in the response (for evals)
 * @param options.customPrompt - If provided, uses this prompt instead of default
 */
export async function analyzeMessage(
    message: string,
    coachingFlags: CoachingFlag[],
    options: AnalyzeMessageOptions = {}
): Promise<SimpleAnalysisResult> {
    const { includeReasoning = false, customPrompt } = options;
    const enabledFlags = coachingFlags.filter(f => f.enabled);
    
    if (enabledFlags.length === 0) {
        return { shouldFlag: false, flags: [], suggestedRephrase: null };
    }
    
    const flagsString = buildFlagsString(coachingFlags);
    
    // Use custom prompt if provided, otherwise use default
    let promptTemplate: string;
    if (customPrompt) {
        promptTemplate = customPrompt;
    } else {
        promptTemplate = includeReasoning 
            ? MESSAGE_ANALYSIS_PROMPT_WITH_REASONING 
            : MESSAGE_ANALYSIS_PROMPT;
    }
    const systemPrompt = promptTemplate.replace('{{FLAGS}}', flagsString);
    
    console.log('systemPrompt', systemPrompt);
    const raw = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message.replace(/"/g, '\\"') },
    ]);
    
    return parseAnalysisResult(raw, enabledFlags, includeReasoning);
}