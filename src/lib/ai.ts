import { CoachingFlag, ContextMessage } from "@/types";
import Portkey from 'portkey-ai';
import { MESSAGE_ANALYSIS_PROMPT, MESSAGE_ANALYSIS_PROMPT_WITH_REASONING, STYLE_BASELINE_PROMPT, STYLE_DEVIATION_PROMPT } from "@/lib/prompts";

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
    const past = context
        .filter(m => m.ts < currentTs)
        .sort((a, b) => a.ts.localeCompare(b.ts));
    
    if (past.length === 0) return '(no recent messages)';
    
    return past.map(m => `<${m.user}>: ${m.text}`).join('\n');
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
    preferredStyle?: string;     // User's target style — flavors the rephrase only, not the flag decision
}

/** Analyzes a message for communication issues based on coaching flags. */
export async function analyzeMessage(
    message: string,
    coachingFlags: CoachingFlag[],
    options: AnalyzeMessageOptions = {}
): Promise<SimpleAnalysisResult> {
    const { includeReason = false, customPrompt, context = [], messageTs = '', preferredStyle = '' } = options;
    const enabledFlags = coachingFlags.filter(f => f.enabled);

    if (enabledFlags.length === 0) {
        return { flags: [], suggestedRephrase: null };
    }

    const flagsString = buildFlagsString(coachingFlags);
    const contextString = formatContext(context, messageTs);
    const styleString = preferredStyle.trim() || '(none — use a neutral, clear rephrase)';

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
        .replace('{{CONTEXT}}', contextString)
        .replace('{{STYLE}}', styleString);

    console.log('systemPrompt', systemPrompt);
    const raw = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message.replace(/"/g, '\\"') },
    ]);

    return parseAnalysisResult(raw, enabledFlags, includeReason);
}

// ------------- Style Digest Analysis ---------------

export interface StyleBaselineResult {
    summary: string;
    traits: string[];
    examples: Array<{ quote: string; observation: string }>;
}

export interface StyleDeviationResult {
    adherenceScore: number;
    deviations: Array<{ quote: string; why: string; suggestion: string }>;
    strengths: string[];
}

/** Format messages for inclusion in a style-digest prompt. */
function formatMessagesForDigest(messages: Array<{ text: string; ts: string; channelName?: string }>): string {
    if (messages.length === 0) return '(no messages)';
    return messages
        .map(m => {
            const where = m.channelName ? ` [#${m.channelName}]` : '';
            return `- ${m.text}${where}`;
        })
        .join('\n');
}

/** Describe how the user has actually been writing this week. Always runs. */
export async function analyzeStyleBaseline(
    messages: Array<{ text: string; ts: string; channelName?: string }>
): Promise<StyleBaselineResult> {
    const messagesString = formatMessagesForDigest(messages);
    const systemPrompt = STYLE_BASELINE_PROMPT.replace('{{MESSAGES}}', messagesString);

    const raw = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Produce the JSON output now.' },
    ]);

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return {
            summary: typeof data.summary === 'string' ? data.summary : '',
            traits: Array.isArray(data.traits) ? data.traits.filter((t: unknown) => typeof t === 'string') : [],
            examples: Array.isArray(data.examples)
                ? data.examples
                    .filter((e: unknown): e is { quote: string; observation: string } =>
                        typeof e === 'object' && e !== null && 'quote' in e && 'observation' in e)
                    .slice(0, 3)
                : [],
        };
    } catch (error) {
        console.error('Failed to parse baseline result:', error);
        return { summary: '', traits: [], examples: [] };
    }
}

/** Compare actual messages to the user's target style. Only runs if target is set. */
export async function analyzeStyleDeviation(
    messages: Array<{ text: string; ts: string; channelName?: string }>,
    targetStyle: string
): Promise<StyleDeviationResult> {
    const messagesString = formatMessagesForDigest(messages);
    const systemPrompt = STYLE_DEVIATION_PROMPT
        .replace('{{MESSAGES}}', messagesString)
        .replace('{{TARGET_STYLE}}', targetStyle.trim());

    const raw = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Produce the JSON output now.' },
    ]);

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const score = typeof data.adherenceScore === 'number' ? Math.max(0, Math.min(100, Math.round(data.adherenceScore))) : 0;
        return {
            adherenceScore: score,
            deviations: Array.isArray(data.deviations)
                ? data.deviations
                    .filter((d: unknown): d is { quote: string; why: string; suggestion: string } =>
                        typeof d === 'object' && d !== null && 'quote' in d && 'why' in d && 'suggestion' in d)
                    .slice(0, 5)
                : [],
            strengths: Array.isArray(data.strengths) ? data.strengths.filter((s: unknown) => typeof s === 'string').slice(0, 3) : [],
        };
    } catch (error) {
        console.error('Failed to parse deviation result:', error);
        return { adherenceScore: 0, deviations: [], strengths: [] };
    }
}