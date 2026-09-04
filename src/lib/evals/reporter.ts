/**
 * Vendor-neutral eval reporting.
 *
 * Every eval suite emits the same shape — a run, N case results, a summary —
 * and this module fans that out to whichever backends are configured. The point
 * is that the suites themselves never import a vendor SDK, so swapping or
 * adding an observability platform is a change here and nowhere else.
 *
 * Active backends are chosen from the environment:
 *
 *   always            JSONL on disk (evals/data/runs/) — zero credentials, so
 *                     CI and a laptop with no keys still produce a diffable
 *                     artifact and a machine-readable history.
 *   LANGFUSE_*        Langfuse. Self-hostable, which matters here: eval inputs
 *                     are real workplace messages. Set LANGFUSE_SECRET_KEY,
 *                     LANGFUSE_PUBLIC_KEY, and LANGFUSE_BASEURL (defaults to
 *                     cloud) to enable.
 *
 * The Langfuse SDK is imported dynamically. A missing install or an unreachable
 * host degrades to JSONL-only with a warning — an eval suite must never fail
 * because its telemetry sink is down.
 */
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export interface EvalCaseResult {
    /** Stable identifier — keep it stable across runs so cases can be diffed. */
    caseId: string;
    /** What went into the system under test. */
    input: unknown;
    /** What came out. */
    output: unknown;
    /**
     * Named scores. Use 0..1 for pass-rate-style metrics so they aggregate
     * sensibly; raw scales (e.g. a 0-100 adherence score) are fine too as long
     * as the name makes the scale obvious.
     */
    scores: Record<string, number>;
    /** Whether this case counts as a pass for the suite's gate. */
    passed: boolean;
    /** Human-readable reasons, especially for failures. */
    notes?: string[];
    metadata?: Record<string, unknown>;
}

export interface EvalRunSummary {
    total: number;
    passed: number;
    failed: number;
    /** Suite-level aggregates, e.g. { intentPreserved: 0.94 }. */
    aggregates?: Record<string, number>;
    /** False when the suite's gate tripped — mirrors the process exit code. */
    ok: boolean;
}

export interface EvalReporter {
    readonly name: string;
    startRun(suite: string, metadata?: Record<string, unknown>): Promise<void>;
    record(result: EvalCaseResult): Promise<void>;
    finishRun(summary: EvalRunSummary): Promise<void>;
}

// ---------------------------------------------------------------------------
// JSONL — the always-on backend.
// ---------------------------------------------------------------------------

class JsonlReporter implements EvalReporter {
    readonly name = 'jsonl';
    private path = '';

    async startRun(suite: string, metadata: Record<string, unknown> = {}): Promise<void> {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.path = join(process.cwd(), 'evals', 'data', 'runs', `${suite}-${stamp}.jsonl`);
        mkdirSync(dirname(this.path), { recursive: true });
        this.write({ type: 'run_start', suite, metadata, at: new Date().toISOString() });
        console.log(`  → recording to ${this.path}`);
    }

    async record(result: EvalCaseResult): Promise<void> {
        this.write({ type: 'case', ...result });
    }

    async finishRun(summary: EvalRunSummary): Promise<void> {
        this.write({ type: 'run_end', ...summary, at: new Date().toISOString() });
    }

    private write(row: unknown): void {
        if (!this.path) return;
        appendFileSync(this.path, JSON.stringify(row) + '\n', 'utf8');
    }
}

// ---------------------------------------------------------------------------
// Langfuse.
//
// One trace per case, scores attached to that trace, so the Langfuse UI can
// group by run and chart a metric's movement release over release. `sessionId`
// ties every case in a run together.
// ---------------------------------------------------------------------------

class LangfuseReporter implements EvalReporter {
    readonly name = 'langfuse';
    // The SDK is loaded dynamically; typing it as `unknown` here and narrowing
    // at the call sites keeps the app's typecheck independent of the package.
    private client: { trace: (a: unknown) => { score: (a: unknown) => void }; flushAsync: () => Promise<unknown> } | null = null;
    private suite = '';
    private runId = '';

    async startRun(suite: string, metadata: Record<string, unknown> = {}): Promise<void> {
        this.suite = suite;
        this.runId = `${suite}-${new Date().toISOString()}`;
        try {
            const { Langfuse } = await import('langfuse');
            this.client = new Langfuse({
                secretKey: process.env.LANGFUSE_SECRET_KEY,
                publicKey: process.env.LANGFUSE_PUBLIC_KEY,
                baseUrl: process.env.LANGFUSE_BASEURL,
            }) as unknown as LangfuseReporter['client'];
            console.log(`  → reporting to Langfuse (run ${this.runId})`);
            void metadata;
        } catch (err) {
            console.warn(`  ⚠️  Langfuse disabled: ${err instanceof Error ? err.message : String(err)}`);
            this.client = null;
        }
    }

    async record(result: EvalCaseResult): Promise<void> {
        if (!this.client) return;
        try {
            const trace = this.client.trace({
                name: `${this.suite}:${result.caseId}`,
                sessionId: this.runId,
                input: result.input,
                output: result.output,
                tags: [this.suite, result.passed ? 'pass' : 'fail'],
                metadata: { ...result.metadata, notes: result.notes },
            });
            for (const [name, value] of Object.entries(result.scores)) {
                trace.score({ name, value, comment: result.notes?.join(' · ') });
            }
        } catch (err) {
            console.warn(`  ⚠️  Langfuse record failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    async finishRun(summary: EvalRunSummary): Promise<void> {
        if (!this.client) return;
        try {
            const trace = this.client.trace({
                name: `${this.suite}:summary`,
                sessionId: this.runId,
                output: summary,
                tags: [this.suite, 'summary'],
            });
            for (const [name, value] of Object.entries(summary.aggregates ?? {})) {
                trace.score({ name, value });
            }
            trace.score({ name: 'pass_rate', value: summary.total ? summary.passed / summary.total : 0 });
            await this.client.flushAsync();
        } catch (err) {
            console.warn(`  ⚠️  Langfuse flush failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Fan-out
// ---------------------------------------------------------------------------

class MultiReporter implements EvalReporter {
    readonly name: string;
    constructor(private readonly reporters: EvalReporter[]) {
        this.name = reporters.map(r => r.name).join('+');
    }
    async startRun(suite: string, metadata?: Record<string, unknown>) {
        for (const r of this.reporters) await r.startRun(suite, metadata);
    }
    async record(result: EvalCaseResult) {
        for (const r of this.reporters) await r.record(result);
    }
    async finishRun(summary: EvalRunSummary) {
        for (const r of this.reporters) await r.finishRun(summary);
    }
}

/**
 * Build the reporter for this process. JSONL is unconditional; Langfuse joins
 * when its keys are present.
 */
export function createReporter(): EvalReporter {
    const reporters: EvalReporter[] = [new JsonlReporter()];
    if (process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY) {
        reporters.push(new LangfuseReporter());
    }
    return new MultiReporter(reporters);
}
