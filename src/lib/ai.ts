import { CoachingFlag } from "@/types";
import Portkey from 'portkey-ai';
import { MESSAGE_ANALYSIS_PROMPT } from "@/lib/prompts";

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
}

// ------------- Single Analysis Function ---------------

function buildFlagsString(flags: CoachingFlag[]): string {
    const enabledFlags = flags.filter(f => f.enabled);
    return enabledFlags
        .map((f, i) => `${i + 1}: ${f.name} - ${f.description}`)
        .join('\n');
}

function parseAnalysisResult(raw: unknown, enabledFlags: CoachingFlag[]): SimpleAnalysisResult {
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
        
        return {
            shouldFlag: data.shouldFlag ?? false,
            flags: mappedFlags,
            suggestedRephrase: data.suggestedRephrase || null,
        };
    } catch (error) {
        console.error('Failed to parse analysis:', error);
        return {
            shouldFlag: false,
            flags: [],
            suggestedRephrase: null,
        };
    }
}

/**
 * Analyzes a message for communication issues based on user's coaching flags.
 * Returns whether it should be flagged, which flags apply, and a suggested rephrase.
 */
export async function analyzeMessage(
    message: string,
    coachingFlags: CoachingFlag[]
): Promise<SimpleAnalysisResult> {
    const enabledFlags = coachingFlags.filter(f => f.enabled);
    
    if (enabledFlags.length === 0) {
        return { shouldFlag: false, flags: [], suggestedRephrase: null };
    }
    
    const flagsString = buildFlagsString(coachingFlags);

    const systemPrompt = MESSAGE_ANALYSIS_PROMPT.replace('{{FLAGS}}', flagsString);
    
    console.log('systemPrompt', systemPrompt);
    const raw = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message.replace(/"/g, '\\"') },
    ]);
    
    return parseAnalysisResult(raw, enabledFlags);
}