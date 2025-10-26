import { 
    ExampleTaskInput,
    MessageAnalysisResult,
    ImprovedMessageResult,
    PersonalFeedbackResult,
    ReportResult,
    ComprehensiveAnalysisResult
} from "@/types";
import Portkey from 'portkey-ai';
import { PERSONAL_FEEDBACK_ANALYSIS_PROMPT, BASIC_MESSAGE_IMPROVEMENT_PROMPT, CONTEXTUAL_MESSAGE_IMPROVEMENT_PROMPT, BASIC_REPHRASE_ANALYSIS_PROMPT, CONTEXTUAL_REPHRASE_ANALYSIS_PROMPT, PERSONAL_FEEDBACK_GENERATION_PROMPT, AUTO_COACHING_ANALYSIS_PROMPT } from "@/lib/prompts";

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

const CATEGORY_TO_ID: Record<string, number> = {
    pushiness: 1,
    vagueness: 2,
    nonObjective: 3,
    circular: 4,
    rudeness: 5,
    passiveAggressive: 6,
    fake: 7,
    oneLiner: 8,
};

function parseFlags(raw: unknown) {
    try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return data as { flags: MessageAnalysisResult['flags']; target?: MessageAnalysisResult['target'] };
    } catch {
        return { flags: [] };
    }
}

// quickCheckNeedsCoaching removed - replaced by comprehensiveMessageAnalysis for auto-coaching

export const analyzeMessageForFlags = async (
    message: string,
    context: string[],
): Promise<MessageAnalysisResult> => {
    const categoriesStr = Object.entries(CATEGORY_TO_ID)
        .map(([k, v]) => `${v}: ${k}`)
        .join(', ');
    const systemPrompt = PERSONAL_FEEDBACK_ANALYSIS_PROMPT.replace('{{CATEGORIES}}', categoriesStr);
    const history = context.slice(0, 15).join('\n');
    const userPrompt = `CURRENT MESSAGE TO ANALYZE: "${message.replace(/\n/g, ' ')}"\n\nCONVERSATION HISTORY (for context only):\n${history || 'None.'}`;
    const raw = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ]);
    const { flags, target } = parseFlags(raw);
    return { flags: flags ?? [], target };
};

export const generateImprovedMessage = async (message: string, flagType: string): Promise<ImprovedMessageResult> => {
    const prompt = BASIC_MESSAGE_IMPROVEMENT_PROMPT.replace('{{FLAG}}', flagType);
    const raw = await chatCompletion([
        { role: 'system', content: prompt },
        { role: 'user', content: message },
    ]);
    return JSON.parse(raw) as ImprovedMessageResult;
};

export const generatePersonalFeedback = async (messages: string[]): Promise<PersonalFeedbackResult> => {
    const raw = await chatCompletion([
        { role: 'system', content: PERSONAL_FEEDBACK_GENERATION_PROMPT },
        { role: 'user', content: messages.slice(-50).join('\n') },
    ]);
    return JSON.parse(raw) as PersonalFeedbackResult;
};

// identifyMessageTarget removed - target identification now handled by comprehensiveMessageAnalysis

// generateReport function removed - unused (replaced by generateAICommunicationReport)

// ------------------- Rephrase-specific functions -------------------

export const analyzeMessageForRephraseWithoutContext = async (
    message: string,
): Promise<MessageAnalysisResult> => {
    const categoriesStr = Object.entries(CATEGORY_TO_ID)
        .map(([k, v]) => `${v}: ${k}`)
        .join(', ');
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
): Promise<MessageAnalysisResult> => {
    const categoriesStr = Object.entries(CATEGORY_TO_ID)
        .map(([k, v]) => `${v}: ${k}`)
        .join(', ');
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
    const prompt = CONTEXTUAL_MESSAGE_IMPROVEMENT_PROMPT.replace('{{FLAG}}', flagType);
    const history = context.slice(0, 10).join('\n'); // Last 10 messages for context
    const userPrompt = `MESSAGE TO IMPROVE: "${message}"\n\nCONVERSATION HISTORY (for context):\n${history || 'None.'}`;
    const raw = await chatCompletion([
        { role: 'system', content: prompt },
        { role: 'user', content: userPrompt },
    ]);
    return JSON.parse(raw) as ImprovedMessageResult;
};

// ------------------- Optimized Auto-Coaching (Single AI Call) -------------------

function parseComprehensiveAnalysis(raw: unknown): ComprehensiveAnalysisResult {
    try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return data as ComprehensiveAnalysisResult;
    } catch (error) {
        console.error('Failed to parse comprehensive analysis:', error);
        // Return safe fallback
        return {
            needsCoaching: false,
            flags: [],
            targetIds: [],
            issueDescription: 'Unable to analyze message due to parsing error',
            improvedMessage: null,
            reasoning: {
                whyNeedsCoaching: 'Parse error occurred',
                primaryIssue: 'none',
                contextInfluence: 'Unable to analyze due to parsing error'
            }
        };
    }
}

export const comprehensiveMessageAnalysis = async (
    message: string,
    conversationHistory: string[]
): Promise<ComprehensiveAnalysisResult> => {
    const categoriesStr = Object.entries(CATEGORY_TO_ID)
        .map(([k, v]) => `${v}: ${k}`)
        .join(', ');
    const systemPrompt = AUTO_COACHING_ANALYSIS_PROMPT.replace('{{CATEGORIES}}', categoriesStr);
    const history = conversationHistory.slice(0, 15).join('\n'); // Last 15 messages for context
    const userPrompt = `CURRENT MESSAGE TO ANALYZE: "${message.replace(/\n/g, ' ')}"\n\nCONVERSATION HISTORY (for context only):\n${history || 'None.'}`;
    
    const raw = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ]);
    
    return parseComprehensiveAnalysis(raw);
};

// ------------------- AI-Generated Full Communication Report -------------------

export interface AiReportInstanceInput {
    index?: number; // enumerated index for referencing examples
    messageTs: string;
    channelId: string;
    issueDescription: string; // AI-extracted issue description (no confidential content)
    flagIds: number[];
    targetIds: string[];
}

export interface AiGeneratedReportData {
    communicationScore: number; // 0–10
    previousScore?: number;
    scoreChange: number;
    scoreTrend: 'improving' | 'declining' | 'stable';
    currentPeriod: {
        totalMessages: number;
        flaggedMessages: number;
        flaggedMessageIds: string[];
        flagBreakdown: Array<{ flagId: number; count: number; percentage: number; messageIds: string[] }>;
        partnerAnalysis: Array<{ partnerName: string; partnerSlackId: string; messagesExchanged: number; flagsWithPartner: number; topIssues: number[]; relationshipScore: number }>
    };
    chartMetadata: {
        flagTrends: Array<{ flagId: number; currentCount: number; previousCount: number; trend: 'up' | 'down' | 'stable'; changePercent: number }>;
        scoreHistory: Array<{ period: string; score: number }>;
        partnerTrends: Array<{ partnerName: string; partnerSlackId: string; currentFlags: number; previousFlags: number; trend: 'improving' | 'declining' | 'stable' }>
    };
    messageExamples: Array<{ messageTs: string; channelId: string; flagIds: number[]; summary: string; targetName?: string; improvement?: string }>;
    focusExampleIndexes?: number[];
    recommendations: string[];
    keyInsights: string[];
    achievements: Array<{ type: string; description: string; icon: string }>;
}

export const generateAICommunicationReport = async (
    instances: AiReportInstanceInput[],
    period: 'weekly' | 'monthly',
    options?: {
        previousScore?: number;
        periodLabel?: string;
        coverage?: { messagesAnalyzed: number; channels: number };
        partnerNames?: Record<string, string>; // map Slack userId -> display name
        messageAnalysisTypes?: Record<number, { key: string; name: string; description: string }>; // id -> info
        previousScores?: number[]; // last two scores, most recent first
        previousFlagBreakdowns?: Array<Array<{ flagId: number; count: number }>>; // last two periods
        severityWeights?: Record<number, number>; // flagId -> weight
    }
): Promise<AiGeneratedReportData> => {
    const system = `You are an expert communication coach generating a ${period} report.
Rules:
- Use ONLY the provided instances and metadata. Do not fabricate content.
- Compute totals and breakdowns from instances (counts, percentages, top flags).
- If instances.length > 0 then:
  • currentPeriod.totalMessages = instances.length
  • currentPeriod.flaggedMessages = number of instances with flagIds length > 0
  • currentPeriod.flaggedMessageIds = messageTs of those flagged
  • currentPeriod.flagBreakdown = aggregate by flagId with count and percentage = round((count / flaggedMessages)*100)
  • currentPeriod.partnerAnalysis = group by targetIds; use partnerNames map to label names; relationshipScore 0-100; include ONLY partners with messagesExchanged > 0; DO NOT create placeholders like "Unspecified" or "Group"
- Scoring: communicationScore MUST be 0–10 (one decimal allowed), higher = better. Calibrate even if only flagged messages are present by considering severityWeights, previousScores & previousFlagBreakdowns (trend over last two reports), and partner concentration. If previousScore is null, set previousScore to 0 and derive scoreChange & scoreTrend from 0.
- Always return ALL fields required by the schema. No undefined. Empty arrays when no data.
- keyInsights must contain at least one helpful sentence when data exists.
- recommendations must contain at least one actionable tip when data exists.
 - For examples: Do NOT include original message text. Return up to 2 indices of the most concerning messages as focusExampleIndexes referencing the provided instance indices.
Return STRICT JSON only.`;

    const userPayload = {
        period,
        previousScore: options?.previousScore ?? null,
        periodLabel: options?.periodLabel ?? null,
        coverage: options?.coverage ?? null,
        instances,
        partnerNames: options?.partnerNames ?? {},
        messageAnalysisTypes: options?.messageAnalysisTypes ?? {},
        previousScores: options?.previousScores ?? [],
        previousFlagBreakdowns: options?.previousFlagBreakdowns ?? [],
        severityWeights: options?.severityWeights ?? {}
    };

    const raw = await chatCompletion([
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(userPayload).slice(0, 12000) }
    ]);

    try {
        const parsed = JSON.parse(raw) as AiGeneratedReportData;
        return parsed;
    } catch (e) {
        console.error('Failed to parse AI report JSON:', e, raw);
        // Safe fallback minimal structure
        return {
            communicationScore: 0,
            previousScore: options?.previousScore,
            scoreChange: 0,
            scoreTrend: 'stable',
            currentPeriod: {
                totalMessages: instances.length,
                flaggedMessages: instances.filter(i => i.flagIds.length > 0).length,
                flaggedMessageIds: instances.filter(i => i.flagIds.length > 0).map(i => i.messageTs),
                flagBreakdown: [],
                partnerAnalysis: []
            },
            chartMetadata: {
                flagTrends: [],
                scoreHistory: [],
                partnerTrends: []
            },
            messageExamples: [],
            recommendations: [],
            keyInsights: [],
            achievements: []
        };
    }
};