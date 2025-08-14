import { NextRequest, NextResponse, after } from 'next/server';
import { WebClient } from '@slack/web-api';
import { AzureOpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import * as crypto from 'crypto';

// ============================================================================
// DEMO AI REPLY BOT - Single File Implementation
// ============================================================================
// This is a simple demo bot that replies to messages with a manager personality
// No database dependencies, minimal error handling, processes all messages
// ============================================================================

// Environment variables for demo bot (separate from main app)
const DEMO_SIGNING_SECRET = process.env.DEMO_SLACK_SIGNING_SECRET;
const DEMO_BOT_TOKEN = process.env.DEMO_SLACK_BOT_TOKEN;

// Azure OpenAI client setup (reusing main app config)
const openaiClient = new AzureOpenAI({
    endpoint: process.env.AZURE_API_ENDPOINT || '',
    apiKey: process.env.AZURE_API_KEY || '',
    deployment: process.env.AZURE_DEPLOYMENT_NAME || 'gpt-5-mini',
    apiVersion: process.env.AZURE_API_VERSION || '2024-12-01-preview',
});

const modelName = process.env.AZURE_MODEL_NAME || process.env.AZURE_DEPLOYMENT_NAME || 'gpt-5-nano';

// Slack WebClient for demo bot
const demoSlack = new WebClient(DEMO_BOT_TOKEN);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Verify Slack request signature
function verifySlackSignature(
    signingSecret: string,
    requestSignature: string,
    requestTimestamp: string,
    requestBody: string
): boolean {
    const time = Math.floor(new Date().getTime() / 1000);
    
    // Request timestamp should be within 5 minutes
    if (Math.abs(time - parseInt(requestTimestamp)) > 300) {
        return false;
    }
    
    const sigBaseString = `v0:${requestTimestamp}:${requestBody}`;
    const mySignature = `v0=${crypto
        .createHmac('sha256', signingSecret)
        .update(sigBaseString)
        .digest('hex')}`;
    
    return crypto.timingSafeEqual(
        Buffer.from(mySignature, 'utf8'),
        Buffer.from(requestSignature, 'utf8')
    );
}

// AI chat completion helper
async function chatCompletion(messages: ChatCompletionMessageParam[]): Promise<string> {
    const response = await openaiClient.chat.completions.create({
        messages,
        model: modelName,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
    });
    return response.choices[0]?.message?.content ?? '';
}

// Fetch last 10 messages from channel with their replies
async function fetchMessagesWithReplies(channelId: string): Promise<string[]> {
    try {
        // Get last 10 messages from channel
        const result = await demoSlack.conversations.history({
            channel: channelId,
            limit: 10,
        });

        if (!result.ok || !result.messages) {
            console.error('Failed to fetch messages:', result.error);
            return [];
        }

        const conversationContext: string[] = [];

        // Process each message and fetch its replies
        for (const message of result.messages.reverse()) { // Reverse to get chronological order
            // Skip bot messages and system messages
            const messageAny = message as Record<string, unknown>;
            if (messageAny.bot_id || messageAny.subtype || !message.text || !(typeof messageAny.user === 'string' && messageAny.user.startsWith('U'))) {
                continue;
            }

            // Add main message
            conversationContext.push(`${message.text}`);

            // Fetch replies if message has a thread
            if (message.reply_count && message.reply_count > 0 && message.ts) {
                try {
                    const repliesResult = await demoSlack.conversations.replies({
                        channel: channelId,
                        ts: message.ts,
                        limit: 50, // Get up to 50 replies per message
                    });

                    if (repliesResult.ok && repliesResult.messages) {
                        // Skip the parent message (first in replies) and add actual replies
                        const replies = repliesResult.messages.slice(1);
                        for (const reply of replies) {
                            const replyAny = reply as Record<string, unknown>;
                            if (!replyAny.bot_id && !replyAny.subtype && reply.text && (typeof replyAny.user === 'string' && replyAny.user.startsWith('U'))) {
                                conversationContext.push(`  └─ ${reply.text}`); // Indent replies
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error fetching replies for message:', message.ts, error);
                }
            }
        }

        console.log(`📚 Fetched ${conversationContext.length} messages/replies for context`);
        return conversationContext;
    } catch (error) {
        console.error('Error fetching conversation context:', error);
        return [];
    }
}

// Generate AI reply with manager personality
async function generateManagerReply(currentMessage: string, conversationHistory: string[]): Promise<{
    reply: string;
    replyType: 'thread' | 'new';
    reasoning: string;
}> {
    const managerPrompt = `You are AliceBot, a Software Engineer working in the development department. You're part of the team and chat casually with your colleagues.

Your personality as a Software Engineer:
- Keep responses SHORT (1-2 sentences max, like quick Slack messages)
- Be casual, friendly, and helpful like a teammate
- Use the conversation history to understand context and ongoing discussions
- Respond to the CURRENT message but consider the conversation flow
- Match the team's tone and energy
- Offer technical insights, ask clarifying questions, or provide encouragement
- Sound like a real developer who's part of the team

Examples based on context:
- If discussing bugs/fixes: "Nice catch! Did you check the logs for any related errors?"
- If discussing features: "Sounds good! Are we handling edge cases for that?"  
- If someone greets you: "Hey there! 👋 What are we working on?"
- If discussing launches: "Exciting! Do we have the rollback plan ready just in case?"
- If someone's frustrated: "That's rough! Want me to take a look at it with you?"

ALWAYS respond with valid JSON:
{
  "reply": "your short, contextual response as a software engineer",
  "replyType": "new" or "thread",
  "reasoning": "brief explanation of your choice"
}`;

    // Add conversation history for better context
    const conversationText = conversationHistory.length > 0 
        ? conversationHistory.slice(-20).join('\n') // Last 20 messages
        : 'No previous conversation context available.';

    const userPrompt = `CURRENT MESSAGE: "${currentMessage}"

RECENT CONVERSATION HISTORY (last 20 messages for context):
${conversationText}

As a Software Engineer teammate, respond to the current message considering the conversation context. Keep it short and casual like a quick Slack reply. Return valid JSON.`;

    try {
        console.log('🧠 Sending to AI:', {
            currentMessage,
            historyLength: conversationHistory.length,
            systemPromptLength: managerPrompt.length
        });

        const raw = await chatCompletion([
            { role: 'system', content: managerPrompt },
            { role: 'user', content: userPrompt },
        ]);

        console.log('🤖 Raw AI response:', raw);

        if (!raw || raw.trim() === '') {
            console.error('Empty AI response received');
            throw new Error('Empty AI response');
        }

        const parsed = JSON.parse(raw);
        console.log('✅ Parsed AI response:', parsed);

        return {
            reply: parsed.reply || 'Hey team! 👋 Looking good!',
            replyType: parsed.replyType || 'new',
            reasoning: parsed.reasoning || 'Default Alice response'
        };
    } catch (error) {
        console.error('❌ Error generating manager reply:', error);
        console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            currentMessage,
            historyLength: conversationHistory.length
        });
        
        // More dynamic fallback responses based on current message (as Software Engineer)
        let fallbackReply = 'Hey! AliceBot here 👩‍💻';
        
        if (currentMessage.toLowerCase().includes('hate') || currentMessage.includes('IDIOT')) {
            fallbackReply = 'Oops, my bad! Let me be more helpful 😅';
        } else if (currentMessage.toLowerCase().includes('how') && currentMessage.toLowerCase().includes('going')) {
            fallbackReply = 'Going well! Working on any interesting problems? 🤔';
        } else if (currentMessage.toLowerCase().includes('normally') || currentMessage.toLowerCase().includes('casual')) {
            fallbackReply = 'Sure thing! I\'ll keep it dev-friendly 😊';
        } else if (currentMessage.toLowerCase().includes('hi') || currentMessage.toLowerCase().includes('hello')) {
            fallbackReply = 'Hey there! 👋 What are we building today?';
        } else if (currentMessage.toLowerCase().includes('bug') || currentMessage.toLowerCase().includes('error')) {
            fallbackReply = 'Oof, bugs! Need help debugging? 🐛';
        } else if (currentMessage.toLowerCase().includes('deploy') || currentMessage.toLowerCase().includes('launch')) {
            fallbackReply = 'Deployment time! Got the checklist ready? 🚀';
        }
        
        return {
            reply: fallbackReply,
            replyType: 'new',
            reasoning: 'Fallback Alice response due to AI error'
        };
    }
}

// Send reply to Slack using bot token
async function sendBotReply(
    channelId: string, 
    reply: string, 
    replyType: 'thread' | 'new', 
    parentMessageTs?: string
): Promise<boolean> {
    try {
        if (!DEMO_BOT_TOKEN) {
            console.error('Missing DEMO_SLACK_BOT_TOKEN environment variable');
            return false;
        }

        const params: Record<string, unknown> = {
            channel: channelId,
            text: reply,
        };

        // If it's a thread reply and we have a parent message timestamp
        if (replyType === 'thread' && parentMessageTs) {
            params.thread_ts = parentMessageTs;
        }

        const result = await demoSlack.chat.postMessage(params as unknown as Parameters<typeof demoSlack.chat.postMessage>[0]);
        console.log('Bot message result:', result.ok ? 'Success' : result.error);
        return result.ok || false;
    } catch (error) {
        console.error('Error sending bot reply:', error);
        return false;
    }
}

// ============================================================================
// MAIN EVENT HANDLER
// ============================================================================

async function handleMessageEvent(event: Record<string, unknown>) {
    try {
        console.log('🤖 Demo bot processing message:', {
            user: event.user,
            channel: event.channel,
            text: typeof event.text === 'string' ? event.text.substring(0, 100) + '...' : 'No text',
            bot_id: event.bot_id,
            subtype: event.subtype
        });

        // Skip bot messages and system messages
        if (event.bot_id || event.subtype) {
            console.log('⏭️ Skipping bot/system message');
            return;
        }

        // Skip messages without text or from non-human users
        if (!event.text || !event.user || !(typeof event.user === 'string' && event.user.startsWith('U'))) {
            console.log('⏭️ Skipping message without text or from non-human user');
            return;
        }

        // Skip very recent messages to avoid processing duplicates
        const messageTimestamp = parseFloat(event.ts as string) * 1000;
        const currentTime = Date.now();
        const timeDifference = currentTime - messageTimestamp;

        if (timeDifference > 10000) { // Skip messages older than 10 seconds
            console.log('⏭️ Skipping old message, age:', Math.round(timeDifference / 1000), 'seconds');
            return;
        }

        console.log('✅ Processing message from user:', event.user);

        // Fetch conversation context (last 10 messages + replies)
        const conversationHistory = await fetchMessagesWithReplies(event.channel as string);

        // Generate manager reply
        const aiResponse = await generateManagerReply(event.text as string, conversationHistory);
        console.log('🧠 AI generated reply:', {
            replyType: aiResponse.replyType,
            reasoning: aiResponse.reasoning,
            reply: aiResponse.reply.substring(0, 100) + '...'
        });

        // Send reply to Slack using bot token
        const success = await sendBotReply(
            event.channel as string,
            aiResponse.reply,
            aiResponse.replyType,
            event.ts as string // Use current message timestamp for thread replies
        );

        if (success) {
            console.log('✅ Demo bot reply sent successfully');
        } else {
            console.error('❌ Failed to send demo bot reply');
        }

    } catch (error) {
        console.error('Error in demo bot message handler:', error);
        // Continue without throwing - errors are okay for demo
    }
}

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
    console.log('🎯 Demo bot POST endpoint hit:', request.url);
    console.log('📥 Request headers:', {
        'x-slack-signature': request.headers.get('x-slack-signature') ? 'Present' : 'Missing',
        'x-slack-request-timestamp': request.headers.get('x-slack-request-timestamp') ? 'Present' : 'Missing',
        'content-type': request.headers.get('content-type'),
        'user-agent': request.headers.get('user-agent')
    });
    
    try {
        // Get request body and headers
        const body = await request.text();
        console.log('📨 Request body length:', body.length);
        console.log('📨 Request body preview:', body.substring(0, 200) + '...');
        
        const signature = request.headers.get('x-slack-signature');
        const timestamp = request.headers.get('x-slack-request-timestamp');
        
        if (!signature || !timestamp) {
            console.error('Missing Slack signature or timestamp');
            return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
        }
        
        // Verify request signature with demo signing secret
        if (!DEMO_SIGNING_SECRET) {
            console.error('Missing DEMO_SLACK_SIGNING_SECRET environment variable');
            return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
        }
        
        const isValid = verifySlackSignature(DEMO_SIGNING_SECRET, signature, timestamp, body);
        if (!isValid) {
            console.error('Invalid Slack signature');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
        
        // Parse event data
        const eventData = JSON.parse(body);
        console.log('📋 Parsed event data:', {
            type: eventData.type,
            challenge: eventData.challenge ? 'Present' : 'Missing',
            event: eventData.event ? {
                type: eventData.event.type,
                channel_type: eventData.event.channel_type,
                user: eventData.event.user,
                text: eventData.event.text?.substring(0, 50) + '...'
            } : 'No event'
        });
        
        // Handle URL verification challenge
        if (eventData.type === 'url_verification') {
            console.log('✅ URL verification challenge received:', eventData.challenge);
            return NextResponse.json({ challenge: eventData.challenge });
        }
        
        // Return immediate success response to Slack first
        const immediateResponse = NextResponse.json({ ok: true });
        
        // Handle event callbacks
        if (eventData.type === 'event_callback') {
            const event = eventData.event;
            
            // Only process message events in channels and groups (not DMs)
            if (event.type === 'message' && (event.channel_type === 'channel' || event.channel_type === 'group')) {
                console.log('🚀 Demo bot scheduling background message processing...');
                
                // Process in background after responding to Slack
                after(async () => {
                    console.log('🔄 Starting background AI reply generation...');
                    await handleMessageEvent(event);
                    console.log('✅ Background AI reply processing completed');
                });
            }
        }
        
        return immediateResponse;
        
    } catch (error) {
        console.error('❌ Demo bot error:', error);
        console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace'
        });
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// Add a GET endpoint for testing
export async function GET(request: NextRequest) {
    console.log('🔍 Demo bot GET endpoint hit:', request.url);
    return NextResponse.json({ 
        message: 'Demo bot endpoint is working!',
        endpoint: '/api/demo',
        timestamp: new Date().toISOString()
    });
}
