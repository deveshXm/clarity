/**
 * Shared plumbing for the eval suites: retries, bounded concurrency, an
 * independent LLM judge, and the scorecard/gate conventions.
 *
 * The judge deliberately does NOT go through Portkey. Clarity's own analysis
 * runs on Portkey → Azure; if the judge used the same path, a gateway-level
 * regression (routing, caching, a model swap) would move the system under test
 * and its grader together and the eval would report green. Using the Azure
 * client directly keeps the second opinion genuinely independent.
 */
import { AzureOpenAI } from 'openai';

// ---------------------------------------------------------------------------
// Retry / concurrency
// ---------------------------------------------------------------------------

/** Retry with exponential backoff. LLM calls fail transiently often enough that
 *  an un-retried suite reports noise as regressions. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (i < attempts - 1) {
                await new Promise(r => setTimeout(r, 500 * 2 ** i));
            }
        }
    }
    throw lastErr;
}

/** Map with a concurrency ceiling, preserving input order in the output. */
export async function mapPool<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;

    async function worker() {
        while (cursor < items.length) {
            const i = cursor++;
            results[i] = await fn(items[i], i);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

export const CONCURRENCY = Number(process.env.SIM_CONCURRENCY || 4);

// ---------------------------------------------------------------------------
// Independent judge
// ---------------------------------------------------------------------------

let judgeClient: AzureOpenAI | null = null;

function getJudge(): AzureOpenAI {
    if (!judgeClient) {
        judgeClient = new AzureOpenAI({
            endpoint: process.env.AZURE_API_ENDPOINT || '',
            apiKey: process.env.AZURE_API_KEY || '',
            deployment: process.env.AZURE_DEPLOYMENT_NAME || process.env.SCENARIO_MODEL || 'gpt-5-mini',
            apiVersion: process.env.AZURE_API_VERSION || '2024-12-01-preview',
        });
    }
    return judgeClient;
}

export const JUDGE_MODEL =
    process.env.SCENARIO_MODEL || process.env.AZURE_DEPLOYMENT_NAME || 'gpt-5-mini';

/**
 * Ask the judge for a JSON verdict. `schemaHint` should spell out the exact
 * keys wanted; the model is pinned to JSON output.
 */
export async function judgeJson<T>(system: string, user: string): Promise<T> {
    const res = await getJudge().chat.completions.create({
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        model: JUDGE_MODEL,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
    });
    const raw = res.choices[0]?.message?.content ?? '{}';
    return JSON.parse(raw) as T;
}

// ---------------------------------------------------------------------------
// Groundedness — objective checks that need no judge at all
// ---------------------------------------------------------------------------

/** Normalize for quote matching: models routinely re-punctuate or re-case a
 *  quote they are otherwise reproducing faithfully, and we don't want to fail
 *  those. Anything beyond this is a genuine fabrication. */
function normalizeForQuote(s: string): string {
    return s
        // The digest prompts render each message as "text [#channel]"; a model
        // that quotes the tag along with the text is not inventing anything.
        .replace(/\s*\[#[^\]]+\]\s*$/, '')
        .toLowerCase()
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[^a-z0-9'" ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * True when `quote` actually appears in the corpus. This catches the failure
 * mode that most damages trust in a communication digest: being shown a
 * "quote" from yourself that you never wrote.
 */
export function quoteAppearsInCorpus(quote: string, corpus: string[]): boolean {
    const needle = normalizeForQuote(quote);
    if (needle.length < 3) return false;
    return corpus.some(m => normalizeForQuote(m).includes(needle));
}

// ---------------------------------------------------------------------------
// Output formatting + gating
// ---------------------------------------------------------------------------

export function pct(n: number): string {
    return `${(n * 100).toFixed(1)}%`;
}

export function pad(s: string | number, n: number): string {
    return String(s).padEnd(n);
}

export function printHeader(title: string, subtitle?: string): void {
    console.log(`\n=== ${title} ===\n`);
    if (subtitle) console.log(`${subtitle}\n`);
}

/**
 * Print the verdict and set the exit code. `thresholds` maps a metric name to
 * the minimum acceptable value; anything below trips the gate.
 *
 * Gates are deliberately loose. These suites run against a live model, so a
 * tight gate turns ordinary sampling noise into a red build and the team
 * learns to ignore it. Set them to catch "clearly broken", and read the
 * scorecard for the rest.
 */
export function gate(
    metrics: Record<string, number>,
    thresholds: Record<string, number>
): boolean {
    const failures: string[] = [];
    for (const [name, min] of Object.entries(thresholds)) {
        const actual = metrics[name];
        if (actual === undefined || Number.isNaN(actual)) {
            failures.push(`${name}: not measured`);
        } else if (actual < min) {
            failures.push(`${name}: ${actual.toFixed(2)} < ${min}`);
        }
    }

    console.log('');
    if (failures.length) {
        console.log('❌ Gate failed:');
        for (const f of failures) console.log(`   ${f}`);
        process.exitCode = 1;
        return false;
    }
    console.log('✅ All gates passed.');
    return true;
}
