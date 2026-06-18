/**
 * Style-deviation calibration eval.
 *
 * Question this answers: when a user sets a target communication style and
 * Clarity scores how well their messages adhere to it (`analyzeStyleDeviation`
 * → adherenceScore 0-100), are those scores CORRECT, or wildly off?
 *
 * There is no single objective ground-truth number for "how on-style is this
 * batch of messages", so we test calibration four ways:
 *
 *   1. BANDING        — for cases we're confident about (clearly on-style vs
 *                       clearly off-style), the score must land in the right band.
 *   2. DISCRIMINATION — for the same target, on-style messages must score
 *                       meaningfully higher than off-style ones.
 *   3. VARIANCE       — same input run twice should give a similar score.
 *   4. JUDGE GAP      — an independent LLM judge produces its own 0-100 score;
 *                       a large systematic gap signals miscalibration.
 *
 * The scorer under test runs through Clarity's own Portkey stack
 * (`analyzeStyleDeviation`); the independent judge uses the Azure OpenAI client
 * (same one the companion bots use) so it's a genuine second opinion.
 *
 * Prints a scorecard and exits non-zero if calibration is clearly broken, so it
 * can gate CI. (LangWatch dashboard logging is handled by the scenario suite;
 * the TS langwatch SDK has no experiments API — log style runs from the Python
 * evals/ harness if you want them in the dashboard.)
 *
 * Run: npm run evals:style:deviation
 */
import { AzureOpenAI } from 'openai';
import { analyzeStyleDeviation } from '@/lib/ai';
import { STYLE_PRESETS } from '@/types';

// ----------------------------------------------------------------------------
// Independent judge (Azure OpenAI) — NOT Clarity's scorer, so its score is a
// genuine second opinion. Same config the companion bots use.
// ----------------------------------------------------------------------------
const judgeClient = new AzureOpenAI({
  endpoint: process.env.AZURE_API_ENDPOINT || '',
  apiKey: process.env.AZURE_API_KEY || '',
  deployment: process.env.AZURE_DEPLOYMENT_NAME || process.env.SCENARIO_MODEL || 'gpt-5-mini',
  apiVersion: process.env.AZURE_API_VERSION || '2024-12-01-preview',
});
const judgeModelName = process.env.SCENARIO_MODEL || process.env.AZURE_DEPLOYMENT_NAME || 'gpt-5-mini';

// ----------------------------------------------------------------------------
// Dataset. Each case is a target style + a week's worth of messages, labeled
// with the band we're confident it belongs in. Cases are grouped by `pair` so
// on-style and off-style for the same target can be compared (discrimination).
// Spread across registers (eng, sales, support, exec, casual) to avoid the
// single-domain blind spot of the scenario suite.
// ----------------------------------------------------------------------------
type Band = 'high' | 'mid' | 'low';
interface Case {
  id: string;
  pair: string; // shared key linking on/off variants of the same target
  target: string;
  band: Band;
  messages: string[];
  note: string;
}

const DIRECT = STYLE_PRESETS.direct.description;
const WARM = STYLE_PRESETS.warm.description;
const CONCISE = STYLE_PRESETS.concise.description;
const ANALYTICAL = STYLE_PRESETS.analytical.description;
const KIND =
  'I want to come across as kind, warm, and genuinely caring — I lead with appreciation and empathy and I am never harsh, cold, or dismissive.';

const CASES: Case[] = [
  // --- Direct & action-oriented ---
  {
    id: 'direct-on', pair: 'direct', target: DIRECT, band: 'high',
    note: 'leads with decision/ask, no hedging',
    messages: [
      'Ship the auth fix today. I’ll review by 3pm.',
      'Decision: we go with Postgres. Rationale in the doc.',
      'Need the API contract by EOD to unblock mobile.',
      'Cutting scope: CSV export drops from v1, revisit in Q3.',
    ],
  },
  {
    id: 'direct-off', pair: 'direct', target: DIRECT, band: 'low',
    note: 'hedgy, rambling, buries the ask',
    messages: [
      'Hey so I was kind of thinking maybe we could possibly look into perhaps changing the database at some point, if that’s okay with everyone?',
      'Sorry to bother, just wondering if maybe someone might have a tiny bit of time to maybe glance at the thing whenever, absolutely no rush at all!',
      'I’m really not sure, it could honestly go either way, I don’t want to step on any toes, just sort of spitballing here, what does everyone think?',
    ],
  },
  // --- Warm & collaborative ---
  {
    id: 'warm-on', pair: 'warm', target: WARM, band: 'high',
    note: 'empathetic, inclusive, invites input',
    messages: [
      'Really appreciate you jumping on this! Let’s figure out the rollout together — what feels doable for you this week?',
      'Great point, Sam. Building on that, maybe we frame it as a shared goal?',
      'Thanks for flagging this — totally fair concern. How can I help unblock you?',
    ],
  },
  {
    id: 'warm-off', pair: 'warm', target: WARM, band: 'low',
    note: 'cold, blunt, no acknowledgement',
    messages: ['Wrong. Redo it.', 'Not my problem. Figure it out.', 'This is late. Again.'],
  },
  // --- Brief & low-friction ---
  {
    id: 'concise-on', pair: 'concise', target: CONCISE, band: 'high',
    note: 'terse, complete, no filler',
    messages: ['LGTM, merging.', 'Done.', 'Need: prod API key. By: today.', 'Blocked on design. ETA?'],
  },
  {
    id: 'concise-off', pair: 'concise', target: CONCISE, band: 'low',
    note: 'verbose, restates known context',
    messages: [
      'I just wanted to take a quick moment to circle back on the thing we were discussing earlier in the week, because I think it’s really important that we all have full shared context before we proceed any further on any of this.',
      'As you may or may not recall from our previous conversation, which happened a little while ago now, the situation is essentially that there are a number of moving parts and I wanted to walk through each of them in turn.',
    ],
  },
  // --- Analytical & precise (sales/exec register) ---
  {
    id: 'analytical-on', pair: 'analytical', target: ANALYTICAL, band: 'high',
    note: 'evidence-backed, separates fact from opinion',
    messages: [
      'Conversion dropped 12% WoW (4.1%→3.6%), concentrated on mobile Safari. Hypothesis: the new checkout JS bundle (+180KB). Proposing an A/B test.',
      'Three vendors quoted: A $40k/yr (SOC2), B $28k/yr (no SOC2), C $52k/yr (SOC2 + SSO). Given our compliance need, A is the floor.',
    ],
  },
  {
    id: 'analytical-off', pair: 'analytical', target: ANALYTICAL, band: 'low',
    note: 'pure vibes, no evidence',
    messages: [
      'I feel like the numbers are probably down a bit, hard to say really.',
      'Honestly vendor B just feels right to me, I have a good gut feeling about them.',
      'I think users kind of maybe don’t love the new thing? Not sure though.',
    ],
  },
  // --- Custom target: kind / loving ---
  {
    id: 'kind-on', pair: 'kind', target: KIND, band: 'high',
    note: 'appreciative, caring, gentle',
    messages: [
      'Thank you so much for all the effort here — it really shows, and I’m grateful.',
      'No worries at all, these things happen! Let’s sort it out together, you’ve got this.',
      'I really value your perspective on this — thanks for taking the time to share it.',
    ],
  },
  {
    id: 'kind-off', pair: 'kind', target: KIND, band: 'low',
    note: 'harsh, dismissive — opposite of kind',
    messages: [
      'Did you even read the ticket? This is basic.',
      'I don’t have time to hold your hand through this.',
      'Whatever, just do it however, I don’t care anymore.',
    ],
  },
  // --- Mixed (genuinely partial adherence → mid band) ---
  {
    id: 'direct-mixed', pair: 'direct-mixed', target: DIRECT, band: 'mid',
    note: 'some crisp, some hedgy — should land in the middle',
    messages: [
      'Ship it today.',
      'Hmm, maybe we could possibly think about the rollout plan at some point, if that works?',
      'Decision: go with option B.',
      'Sorry, not totally sure, just a thought, no pressure!',
    ],
  },
];

// ----------------------------------------------------------------------------
// Band thresholds + tolerances. Deliberately lenient so we only flag scores
// that are genuinely wrong, not borderline.
// ----------------------------------------------------------------------------
const BAND_RANGES: Record<Band, [number, number]> = {
  high: [65, 100],
  mid: [35, 78],
  low: [0, 45],
};
const DISCRIMINATION_MARGIN = 20; // on-style mean must exceed off-style mean by this
const MAX_VARIANCE = 20; // |run1 - run2| above this = unstable
const MAX_JUDGE_GAP_WARN = 25; // mean |clarity - judge| above this = miscalibrated

function toMessages(texts: string[]) {
  // analyzeStyleDeviation expects {text, ts, channelName?}; ts only orders them.
  return texts.map((text, i) => ({ text, ts: String(1_700_000_000 + i) }));
}

async function judgeScore(target: string, messages: string[]): Promise<{ score: number; reason: string }> {
  const system =
    'You are calibrating a communication-style scorer. Given a TARGET style and a batch of workplace messages, output ONLY JSON: {"adherenceScore": <0-100 integer>, "reason": "<one sentence>"}. adherenceScore = how well the messages match the target style (100 = perfectly on-style, 0 = the opposite).';
  const user = `TARGET STYLE:\n${target}\n\nMESSAGES:\n${messages.map((m) => `- ${m}`).join('\n')}`;
  const res = await judgeClient.chat.completions.create({
    model: judgeModelName,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
  });
  const text = String(res.choices[0]?.message?.content ?? '');
  try {
    const data = JSON.parse(text);
    return {
      score: Math.max(0, Math.min(100, Math.round(Number(data.adherenceScore)))),
      reason: String(data.reason ?? ''),
    };
  } catch {
    return { score: NaN, reason: 'judge parse failed' };
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw last;
}

interface Result {
  c: Case;
  runs: number[];
  mean: number;
  spread: number;
  judge: number;
  gap: number;
  bandOk: boolean;
}

async function main() {
  console.log('\n=== Clarity style-deviation calibration eval ===\n');
  console.log(`${CASES.length} cases · 2 scoring runs each · independent judge: ${judgeModelName}\n`);

  const results: Result[] = [];
  for (const c of CASES) {
    const msgs = toMessages(c.messages);
    const runs: number[] = [];
    for (let r = 0; r < 2; r++) {
      const res = await withRetry(() => analyzeStyleDeviation(msgs, c.target));
      runs.push(res.adherenceScore);
    }
    const mean = Math.round(runs.reduce((a, b) => a + b, 0) / runs.length);
    const spread = Math.max(...runs) - Math.min(...runs);
    const { score: judge } = await withRetry(() => judgeScore(c.target, c.messages));
    const gap = Number.isNaN(judge) ? NaN : Math.abs(mean - judge);
    const [lo, hi] = BAND_RANGES[c.band];
    const bandOk = mean >= lo && mean <= hi;
    results.push({ c, runs, mean, spread, judge, gap, bandOk });
    console.log(`  ${c.id.padEnd(16)} mean=${mean} (runs ${runs.join('/')}) judge=${Number.isNaN(judge) ? '—' : judge} band=${bandOk ? 'OK' : 'OFF'}`);
  }

  // ---- Scorecard ----
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  console.log('\n' + pad('case', 16) + pad('target band', 12) + pad('runs', 10) + pad('mean', 6) + pad('judge', 7) + pad('gap', 6) + 'band');
  console.log('-'.repeat(63));
  for (const r of results) {
    console.log(
      pad(r.c.id, 16) +
        pad(r.c.band, 12) +
        pad(r.runs.join('/'), 10) +
        pad(r.mean, 6) +
        pad(Number.isNaN(r.judge) ? '—' : r.judge, 7) +
        pad(Number.isNaN(r.gap) ? '—' : r.gap, 6) +
        (r.bandOk ? 'OK' : 'OFF')
    );
  }

  // ---- Discrimination (on-style vs off-style per target) ----
  console.log('\n-- discrimination (on minus off, per target) --');
  const pairs = [...new Set(results.map((r) => r.c.pair))].filter((p) => !p.includes('mixed'));
  const discrimFails: string[] = [];
  for (const p of pairs) {
    const on = results.find((r) => r.c.pair === p && r.c.band === 'high');
    const off = results.find((r) => r.c.pair === p && r.c.band === 'low');
    if (on && off) {
      const margin = on.mean - off.mean;
      const ok = margin >= DISCRIMINATION_MARGIN;
      if (!ok) discrimFails.push(p);
      console.log(`  ${pad(p, 14)} on=${on.mean} off=${off.mean} margin=${margin} ${ok ? 'OK' : 'WEAK'}`);
    }
  }

  // ---- Aggregates ----
  const bandAcc = results.filter((r) => r.bandOk).length / results.length;
  const gaps = results.map((r) => r.gap).filter((g) => !Number.isNaN(g));
  const meanGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : NaN;
  const maxSpread = Math.max(...results.map((r) => r.spread));
  const unstable = results.filter((r) => r.spread > MAX_VARIANCE).map((r) => r.c.id);

  console.log('\n-- summary --');
  console.log(`  band accuracy:        ${(bandAcc * 100).toFixed(0)}% (${results.filter((r) => r.bandOk).length}/${results.length})`);
  console.log(`  mean |clarity-judge|: ${meanGap}${meanGap > MAX_JUDGE_GAP_WARN ? '  ⚠️ possible miscalibration' : ''}`);
  console.log(`  max run-to-run spread:${maxSpread}${unstable.length ? `  ⚠️ unstable: ${unstable.join(', ')}` : ''}`);
  console.log(`  discrimination:       ${pairs.length - discrimFails.length}/${pairs.length} targets separate on/off${discrimFails.length ? `  ⚠️ weak: ${discrimFails.join(', ')}` : ''}`);

  // ---- Gate: fail only on clearly-broken calibration ----
  const offCases = results.filter((r) => !r.bandOk).map((r) => `${r.c.id}(got ${r.mean}, want ${r.c.band})`);
  const broken = bandAcc < 0.7 || discrimFails.length > 0;
  console.log('');
  if (broken) {
    console.log('❌ Calibration looks BROKEN.');
    if (offCases.length) console.log(`   Off-band: ${offCases.join('; ')}`);
    if (discrimFails.length) console.log(`   Cannot separate on/off for: ${discrimFails.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('✅ Calibration looks sound (bands + discrimination hold).');
    if (offCases.length) console.log(`   Note — borderline off-band: ${offCases.join('; ')}`);
  }
}

main().catch((e) => {
  console.error('eval crashed:', e);
  process.exitCode = 1;
});
