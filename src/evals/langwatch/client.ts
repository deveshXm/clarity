/**
 * Shared plumbing for the Clarity eval experiments on LangWatch.
 *
 * Every suite is a LangWatch *experiment*: one run per invocation, one row per
 * dataset case, metrics logged per row with `experiment.log`. Objective checks
 * (re-classification, quote matching, self-rescoring) are computed in code;
 * subjective ones come from the independent Azure judge in
 * `@/lib/evals/harness`, which deliberately bypasses Portkey so a gateway
 * regression cannot move the system under test and its grader together.
 *
 * Nothing here is vendor-neutral on purpose: LangWatch is the eval platform.
 */
import { LangWatch, type Experiment } from 'langwatch';
import { gate, pct } from '@/lib/evals/harness';

export function langwatchClient(): LangWatch {
    if (!process.env.LANGWATCH_API_KEY) {
        throw new Error(
            'LANGWATCH_API_KEY is not set. Add it to .env.local (see `langwatch login --help`).'
        );
    }
    return new LangWatch();
}

/**
 * The system under test as LangWatch sees it. The model name mirrors the
 * hardcoded value in src/lib/ai.ts; keep them in sync when the model changes so
 * run-over-run comparisons in the UI stay honest.
 */
export const SUT = {
    name: 'clarity',
    metadata: {
        model: '@azure-openai/gpt-oss-120b',
        gateway: 'portkey',
        reasoning_effort: 'low',
    } as Record<string, string>,
};

/** The digest functions expect `{ text, ts, channelName? }`; ts only orders them. */
export function toMessages(texts: string[], channelName = 'eng') {
    const now = Math.floor(Date.now() / 1000);
    return texts.map((text, i) => ({
        text,
        ts: String(now - (texts.length - i) * 60),
        channelName,
    }));
}

export function ratio(num: number, den: number): number {
    return den ? num / den : 0;
}

export function mean(xs: number[]): number {
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function bullet(items: string[]): string {
    return items.map(m => `- ${m}`).join('\n');
}

/**
 * Print the suite scorecard, flush the run to LangWatch, then apply the gates.
 * `formats` lets a metric print on its own scale (points, ratios) instead of %.
 */
export function finish(
    experiment: Experiment,
    metrics: Record<string, number>,
    thresholds: Record<string, number>,
    formats: Record<string, (n: number) => string> = {}
): boolean {
    console.log('\n-- summary --');
    const width = Math.max(...Object.keys(metrics).map(k => k.length)) + 2;
    for (const [k, v] of Object.entries(metrics)) {
        const shown = formats[k] ? formats[k](v) : pct(v);
        const min = thresholds[k];
        console.log(`  ${k.padEnd(width)}${shown}${min !== undefined ? `   (gate ≥ ${formats[k] ? formats[k](min) : pct(min)})` : ''}`);
    }
    experiment.printSummary(false);
    return gate(metrics, thresholds);
}
