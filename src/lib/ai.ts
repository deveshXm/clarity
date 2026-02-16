import { CoachingFlag, ContextMessage } from "@/types";
import Portkey from 'portkey-ai';
import { MESSAGE_ANALYSIS_PROMPT, MESSAGE_ANALYSIS_PROMPT_WITH_REASONING } from "@/lib/prompts";

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

// ------------- Simple Message Analysis Result ---------------

export interface SimpleAnalysisResult {
    flags: Array<{
        flagIndex: number;
        flagName: string;
    }>;
    suggestedRephrase: string | null;
    reason?: string;
}

// ------------- Single Analysis Function ---------------

function buildFlagsString(flags: CoachingFlag[]): string {
    const enabledFlags = flags.filter(f => f.enabled);
    return enabledFlags
        .map((f, i) => `${i + 1}: ${f.name} - ${f.description}`)
        .join('\n');
}

function formatContext(context: ContextMessage[], currentTs: string): string {
    const messages = currentTs
        ? context.filter(m => m.ts < currentTs)
        : context;
    const sorted = messages.sort((a, b) => a.ts.localeCompare(b.ts));
    
    if (sorted.length === 0) return '(no recent messages)';
    
    return sorted.map(m => `<${m.user}>: ${m.text}`).join('\n');
}

function parseAnalysisResult(raw: unknown, enabledFlags: CoachingFlag[], includeReason: boolean): SimpleAnalysisResult {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
        
        // Flags are just an array of indices [1, 2, 3]
        const flagIndices: number[] = Array.isArray(data.flags) ? data.flags : [];
        const mappedFlags = flagIndices
            .filter((idx: number) => idx >= 1 && idx <= enabledFlags.length)
            .map((idx: number) => ({
                flagIndex: idx,
                flagName: enabledFlags[idx - 1].name,
            }));
        
        const result: SimpleAnalysisResult = {
            flags: mappedFlags,
            suggestedRephrase: data.suggestedRephrase || null,
        };
        
        if (includeReason && data.reason) {
            result.reason = data.reason;
        }
        
        return result;
    } catch (error) {
        console.error('Failed to parse analysis:', error);
        return {
            flags: [],
            suggestedRephrase: null,
        };
    }
}

export interface AnalyzeMessageOptions {
    includeReason?: boolean;    // For evals - include reason in response
    customPrompt?: string;      // For evals - override default prompt
    context?: ContextMessage[];  // Recent channel messages for context
    messageTs?: string;          // Timestamp of current message (to filter context)
}

/** Analyzes a message for communication issues based on coaching flags. */
export async function analyzeMessage(
    message: string,
    coachingFlags: CoachingFlag[],
    options: AnalyzeMessageOptions = {}
): Promise<SimpleAnalysisResult> {
    const { includeReason = false, customPrompt, context = [], messageTs = '' } = options;
    const enabledFlags = coachingFlags.filter(f => f.enabled);
    
    if (enabledFlags.length === 0) {
        return { flags: [], suggestedRephrase: null };
    }
    
    const flagsString = buildFlagsString(coachingFlags);
    const contextString = formatContext(context, messageTs);
    
    // Use custom prompt if provided, otherwise use default
    let promptTemplate: string;
    if (customPrompt) {
        promptTemplate = customPrompt;
    } else {
        promptTemplate = includeReason 
            ? MESSAGE_ANALYSIS_PROMPT_WITH_REASONING 
            : MESSAGE_ANALYSIS_PROMPT;
    }
    const systemPrompt = promptTemplate
        .replace('{{FLAGS}}', flagsString)
        .replace('{{CONTEXT}}', contextString);
    
    console.log('systemPrompt', systemPrompt);
    const raw = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message.replace(/"/g, '\\"') },
    ]);
    
    return parseAnalysisResult(raw, enabledFlags, includeReason);
}