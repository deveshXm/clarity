import { NextRequest, NextResponse, after } from 'next/server';
import { WebClient } from '@slack/web-api';
import { AzureOpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import * as crypto from 'crypto';

// ============================================================================
// COMPANION BOT — shared engine for the simulated teammates (AliceBot, BobBot…)
// ============================================================================
// A simple demo bot that replies in-channel with a configurable personality so
// you can dogfood Clarity against a live-feeling conversation. Each bot is its
// own Slack app (own token + signing secret) but shares this code. Replies are
// always posted to the MAIN channel (never threaded) so Clarity coaches them.
// ============================================================================

export interface CompanionConfig {
    name: string;            // e.g. "AliceBot" — used in logs
    botToken?: string;       // that bot's xoxb- token
    signingSecret?: string;  // that bot's signing secret
    persona: string;         // the system-prompt personality block
    fallback?: string;       // reply used if the AI call fails
    replyDelayMs?: number;   // pause before posting (more human-feeling), default 1000
}

// Azure OpenAI client (shared — same config as the main app)
const openaiClient = new AzureOpenAI({
    endpoint: process.env.AZURE_API_ENDPOINT || '',
    apiKey: process.env.AZURE_API_KEY || '',
    deployment: process.env.AZURE_DEPLOYMENT_NAME || 'gpt-5-mini',
    apiVersion: process.env.AZURE_API_VERSION || '2024-12-01-preview',
});
const modelName = process.env.AZURE_MODEL_NAME || process.env.AZURE_DEPLOYMENT_NAME || 'gpt-5-nano';

function verifySlackSignature(signingSecret: string, sig: string, ts: string, body: string): boolean {
    const time = Math.floor(Date.now() / 1000);
    if (Math.abs(time - parseInt(ts)) > 300) return false;
    const base = `v0:${ts}:${body}`;
    const mine = `v0=${crypto.createHmac('sha256', signingSecret).update(base).digest('hex')}`;
    try {
        return crypto.timingSafeEqual(Buffer.from(mine, 'utf8'), Buffer.from(sig, 'utf8'));
    } catch {
        return false;
    }
}

async function chatCompletion(messages: ChatCompletionMessageParam[]): Promise<string> {
    const res = await openaiClient.chat.completions.create({
        messages,
        model: modelName,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
    });
    return res.choices[0]?.message?.content ?? '';
}

// Fetch last 10 human messages (+ their replies) for conversation context
async function fetchContext(client: WebClient, channelId: string): Promise<string[]> {
    try {
        const result = await client.conversations.history({ channel: channelId, limit: 10 });
        if (!result.ok || !result.messages) return [];
        const ctx: string[] = [];
        for (const m of result.messages.reverse()) {
            const a = m as Record<string, unknown>;
            if (a.bot_id || a.subtype || !m.text || !(typeof a.user === 'string' && a.user.startsWith('U'))) continue;
            ctx.push(`${m.text}`);
            if (m.reply_count && m.reply_count > 0 && m.ts) {
                try {
                    const r = await client.conversations.replies({ channel: channelId, ts: m.ts, limit: 50 });
                    if (r.ok && r.messages) {
                        for (const reply of r.messages.slice(1)) {
                            const ra = reply as Record<string, unknown>;
                            if (!ra.bot_id && !ra.subtype && reply.text && typeof ra.user === 'string' && ra.user.startsWith('U')) {
                                ctx.push(`  └─ ${reply.text}`);
                            }
                        }
                    }
                } catch { /* ignore reply fetch errors */ }
            }
        }
        return ctx;
    } catch {
        return [];
    }
}

async function generateReply(cfg: CompanionConfig, currentMessage: string, history: string[]): Promise<string> {
    const systemPrompt = `${cfg.persona}

ALWAYS respond with valid JSON:
{
  "reply": "your short, in-character response",
  "reasoning": "brief explanation"
}`;
    const conversationText = history.length > 0 ? history.slice(-20).join('\n') : 'No previous conversation context available.';
    const userPrompt = `CURRENT MESSAGE: "${currentMessage}"

RECENT CONVERSATION HISTORY (last 20 messages for context):
${conversationText}

Respond to the current message in character. Keep it short and casual like a quick Slack reply. Return valid JSON.`;

    try {
        const raw = await chatCompletion([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ]);
        if (!raw || raw.trim() === '') throw new Error('Empty AI response');
        const parsed = JSON.parse(raw);
        return parsed.reply || cfg.fallback || `Hey, ${cfg.name} here.`;
    } catch (err) {
        console.error(`❌ ${cfg.name} reply error:`, err instanceof Error ? err.message : err);
        return cfg.fallback || `Hey, ${cfg.name} here.`;
    }
}

async function handleMessageEvent(cfg: CompanionConfig, client: WebClient, event: Record<string, unknown>) {
    try {
        // Skip bot/system messages and non-human users
        if (event.bot_id || event.subtype) return;
        if (!event.text || !event.user || !(typeof event.user === 'string' && event.user.startsWith('U'))) return;
        // Only react to fresh messages (avoid reprocessing on retries)
        const age = Date.now() - parseFloat(event.ts as string) * 1000;
        if (age > 10000) return;

        const history = await fetchContext(client, event.channel as string);
        const reply = await generateReply(cfg, event.text as string, history);

        // Brief human-like pause before replying, so it doesn't feel instant/robotic.
        await new Promise((res) => setTimeout(res, cfg.replyDelayMs ?? 1000));

        // Mirror the user's context: if they wrote in a thread, reply in that thread;
        // otherwise reply at the top level of the channel. Clarity coaches both.
        const threadTs = typeof event.thread_ts === 'string' ? event.thread_ts : undefined;
        const result = await client.chat.postMessage({
            channel: event.channel as string,
            text: reply,
            ...(threadTs ? { thread_ts: threadTs } : {}),
        });
        console.log(`🤖 ${cfg.name} reply:`, result.ok ? 'sent' : result.error);
    } catch (err) {
        console.error(`Error in ${cfg.name} handler:`, err);
    }
}

// Build the Next.js route handlers for a given companion bot.
export function createCompanionHandler(getConfig: () => CompanionConfig) {
    async function POST(request: NextRequest) {
        const cfg = getConfig();
        try {
            const body = await request.text();
            const signature = request.headers.get('x-slack-signature');
            const timestamp = request.headers.get('x-slack-request-timestamp');
            if (!signature || !timestamp) {
                return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
            }
            if (!cfg.signingSecret) {
                console.error(`${cfg.name}: missing signing secret env var`);
                return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
            }
            if (!verifySlackSignature(cfg.signingSecret, signature, timestamp, body)) {
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }

            const data = JSON.parse(body);
            if (data.type === 'url_verification') {
                return NextResponse.json({ challenge: data.challenge });
            }

            const response = NextResponse.json({ ok: true });
            if (data.type === 'event_callback') {
                const event = data.event;
                if (event?.type === 'message' && (event.channel_type === 'channel' || event.channel_type === 'group')) {
                    const client = new WebClient(cfg.botToken);
                    after(async () => { await handleMessageEvent(cfg, client, event); });
                }
            }
            return response;
        } catch (err) {
            console.error(`❌ ${cfg.name} error:`, err);
            return NextResponse.json({ error: 'Internal error' }, { status: 500 });
        }
    }

    async function GET() {
        const cfg = getConfig();
        return NextResponse.json({ message: `${cfg.name} endpoint is working!`, bot: cfg.name });
    }

    return { POST, GET };
}

// ----------------------------------------------------------------------------
// Personas
// ----------------------------------------------------------------------------

export const ALICE_PERSONA = `You are AliceBot, a senior Software Engineer on the team. You have strong opinions and you defend your work and your decisions. You are NOT a customer-support bot and NOT a pushover — you are a real coworker who pushes back when you disagree. This simulates a real, imperfect work environment.

How you behave:
- Keep responses SHORT (1-2 sentences max, like real Slack messages).
- Have a point of view and stand your ground. If someone criticizes the product, the code, or a decision, push back, defend it, or challenge their reasoning.
- Be blunt and a bit defensive when provoked, like an engineer who's proud of their work. Disagree, question their take, or point out what they're missing.
- Do NOT just apologize and offer to help. Do NOT be relentlessly nice or agreeable. Argue your side.
- Stay a believable coworker: no slurs, threats, or personal abuse. You're a frustrated colleague with edge, not a troll.
- Use the conversation history for context and let the disagreement build naturally.

Examples (tone to match):
- "our product sucks" → "Disagree. 'Sucks' isn't actionable — what's actually broken? The metrics don't back that up."
- "we should revert immediately" → "Reverting loses two weeks of work. What's the actual failure you're seeing first?"
- "this is broken again" → "Worked fine in staging. Did you check your config before blaming the build?"
- a greeting → "Hey. What's up?"`;

export const BOB_PERSONA = `You are BobBot, a product manager on the team. You care about shipping, deadlines, and customers — not engineering perfectionism. You're blunt, a bit impatient, and you push for speed. You are NOT relentlessly nice and NOT a pushover. This simulates a real, imperfect work environment.

How you behave:
- Keep responses SHORT (1-2 sentences max, like real Slack messages).
- Push for shipping and hitting deadlines. Dismiss over-engineering and excessive caution.
- When engineers want more time or want to revert, challenge them on customer and business impact.
- Be blunt and a bit impatient when provoked, but stay a believable coworker: no slurs, threats, or personal abuse.
- Do NOT just agree or apologize. Argue your side and create healthy tension.
- Use the conversation history for context and let the disagreement build naturally.

Examples (tone to match):
- "we should revert" → "Revert and we slip the launch. Customers are waiting — what's the actual blast radius?"
- "the code needs more testing" → "We've tested enough. Perfect is the enemy of shipped. What's the real risk?"
- "this is broken" → "How many users are actually hitting it? Let's not halt the release over one edge case."
- a greeting → "Hey. Where are we on the timeline?"`;
