import { 
    ExampleTaskInput,
    MessageAnalysisResult,
    ImprovedMessageResult,
    PersonalFeedbackResult,
    ReportResult
} from "@/types";
import { AzureOpenAI } from "openai";
import { QUICK_CHECK_PROMPT, ANALYSIS_PROMPT_TEMPLATE, IMPROVEMENT_PROMPT_TEMPLATE, IMPROVEMENT_WITH_CONTEXT_PROMPT_TEMPLATE, REPHRASE_ANALYSIS_PROMPT_TEMPLATE, REPHRASE_WITH_CONTEXT_ANALYSIS_PROMPT_TEMPLATE, PERSONAL_FEEDBACK_PROMPT, IDENTIFY_TARGET_PROMPT, REPORT_PROMPT_TEMPLATE } from "@/lib/prompts";

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

// ------------- Azure OpenAI client setup ---------------

const openaiClient = new AzureOpenAI({
    endpoint: process.env.AZURE_API_ENDPOINT || '',
    apiKey: process.env.AZURE_API_KEY || '',
    deployment: process.env.AZURE_DEPLOYMENT_NAME || 'gpt-4.1-mini',
    apiVersion: process.env.AZURE_API_VERSION || '2024-12-01-preview',
});

const modelName = process.env.AZURE_MODEL_NAME || process.env.AZURE_DEPLOYMENT_NAME || 'gpt-4.1-mini';

async function chatCompletion(messages: any[], temperature = 0): Promise<string> {
    const response = await openaiClient.chat.completions.create({
        messages,
        model: modelName,
        temperature,
        max_tokens: 512,
        response_format: { type: 'json_object' },
    });
    return response.choices[0]?.message?.content ?? '';
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

export const quickCheckNeedsCoaching = async (message: string): Promise<boolean> => {
    const raw = await chatCompletion([
        { role: 'system', content: QUICK_CHECK_PROMPT },
        { role: 'user', content: `Message: "${message.replace(/\n/g, ' ')}"` },
    ]);
    try {
        const parsed = JSON.parse(raw) as { needsCoaching: 'yes' | 'no' };
        return parsed.needsCoaching === 'yes';
    } catch {
        return true;
    }
};

export const analyzeMessageForFlags = async (
    message: string,
    context: string[],
): Promise<MessageAnalysisResult> => {
    const categoriesStr = Object.entries(CATEGORY_TO_ID)
        .map(([k, v]) => `${v}: ${k}`)
        .join(', ');
    const systemPrompt = ANALYSIS_PROMPT_TEMPLATE.replace('{{CATEGORIES}}', categoriesStr);
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
    const prompt = IMPROVEMENT_PROMPT_TEMPLATE.replace('{{FLAG}}', flagType);
    const raw = await chatCompletion([
        { role: 'system', content: prompt },
        { role: 'user', content: message },
    ], 0.5);
    return JSON.parse(raw) as ImprovedMessageResult;
};

export const generatePersonalFeedback = async (messages: string[]): Promise<PersonalFeedbackResult> => {
    const raw = await chatCompletion([
        { role: 'system', content: PERSONAL_FEEDBACK_PROMPT },
        { role: 'user', content: messages.slice(-50).join('\n') },
    ], 0.3);
    return JSON.parse(raw) as PersonalFeedbackResult;
};

export const identifyMessageTarget = async (message: string, context: string[]) => {
    const raw = await chatCompletion([
        { role: 'system', content: IDENTIFY_TARGET_PROMPT },
        { role: 'user', content: `Message: ${message}\nContext:\n${context.slice(-15).join('\n')}` },
    ]);
    return JSON.parse(raw);
};

export const generateReport = async (
    flaggedInstances: unknown[],
    period: 'weekly' | 'monthly',
): Promise<ReportResult> => {
    const prompt = REPORT_PROMPT_TEMPLATE.replace('{{PERIOD}}', period);
    const raw = await chatCompletion([
        { role: 'system', content: prompt },
        { role: 'user', content: JSON.stringify({ period, flaggedInstances }).slice(0, 6000) },
    ], 0.2);
    return JSON.parse(raw) as ReportResult;
};

// ------------------- Rephrase-specific functions -------------------

export const analyzeMessageForRephraseWithoutContext = async (
    message: string,
): Promise<MessageAnalysisResult> => {
    const categoriesStr = Object.entries(CATEGORY_TO_ID)
        .map(([k, v]) => `${v}: ${k}`)
        .join(', ');
    const systemPrompt = REPHRASE_ANALYSIS_PROMPT_TEMPLATE.replace('{{CATEGORIES}}', categoriesStr);
    const userPrompt = `Message to analyze: "${message.replace(/\n/g, ' ')}"`;
    const raw = await chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ]);
    const { flags, target } = parseFlags(raw);
    return { flags: flags ?? [], target: undefined }; // No target identification without context
};

export const analyzeMessageForRephraseWithContext = async (
    message: string,
    context: string[],
): Promise<MessageAnalysisResult> => {
    const categoriesStr = Object.entries(CATEGORY_TO_ID)
        .map(([k, v]) => `${v}: ${k}`)
        .join(', ');
    const systemPrompt = REPHRASE_WITH_CONTEXT_ANALYSIS_PROMPT_TEMPLATE.replace('{{CATEGORIES}}', categoriesStr);
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
    ], 0.5);
    return JSON.parse(raw) as ImprovedMessageResult;
};