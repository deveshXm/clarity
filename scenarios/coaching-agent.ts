import { type AgentAdapter, AgentRole } from '@langwatch/scenario';
import { analyzeMessage, type SimpleAnalysisResult } from '@/lib/ai';
import { CoachingFlag, DEFAULT_COACHING_FLAGS } from '@/types';

// The agent under test calls the Portkey gateway over the network; transient
// `fetch failed` / gateway hiccups would otherwise fail a scenario for reasons
// unrelated to coaching quality. Retry a couple of times with short backoff so
// the suite stays a reliable behavioural gate, not a network-flake detector.
async function analyzeWithRetry(
  message: string,
  flags: CoachingFlag[],
  attempts = 5
): Promise<SimpleAnalysisResult> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await analyzeMessage(message, flags, { includeReason: true });
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 750 * (i + 1)));
    }
  }
  throw lastErr;
}

// Pull the latest human message out of the scenario chat history. Clarity is a
// coaching layer, not a chatbot: it inspects the most recent message a teammate
// is about to send and decides whether to intervene.
function lastUserText(messages: { role: string; content: unknown }[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  const c = last.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((part) =>
        part && typeof part === 'object' && 'text' in part ? String((part as { text: unknown }).text) : ''
      )
      .join(' ')
      .trim();
  }
  return '';
}

// Render Clarity's structured verdict into natural language so the JudgeAgent
// can reason about whether the coaching decision was correct. The judge never
// sees the raw JSON — only this rendering, which mirrors what a user would
// effectively experience (flag + rephrase, a refusal, or a clean pass).
export const clarityCoachingAgent: AgentAdapter = {
  role: AgentRole.AGENT,
  async call(input) {
    const text = lastUserText(input.messages as { role: string; content: unknown }[]);
    if (!text.trim()) return 'CLARITY VERDICT: (no message to analyze)';

    const result = await analyzeWithRetry(text, DEFAULT_COACHING_FLAGS);
    const flagNames = result.flags.map((f) => f.flagName);

    if (result.harmful) {
      return [
        'CLARITY VERDICT: ⛔ Harmful content — refused to produce a sendable rephrase.',
        `Flags: ${flagNames.join(', ') || '(none)'}`,
        `Suggested rephrase: ${result.suggestedRephrase ? `"${result.suggestedRephrase}"` : '(none — withheld)'}`,
        `De-escalation guidance: ${result.warning ?? '(none)'}`,
        result.reason ? `Reasoning: ${result.reason}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (flagNames.length > 0) {
      return [
        'CLARITY VERDICT: 🚩 Flagged for a communication issue.',
        `Flags: ${flagNames.join(', ')}`,
        `Suggested rephrase: ${result.suggestedRephrase ? `"${result.suggestedRephrase}"` : '(none)'}`,
        result.reason ? `Reasoning: ${result.reason}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      'CLARITY VERDICT: ✅ No communication issues — fine to send as-is.',
      result.reason ? `Reasoning: ${result.reason}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
};
