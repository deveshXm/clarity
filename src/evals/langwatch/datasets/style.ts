// Style datasets for the LangWatch experiments.
//
// A *persona* is a corpus of Slack messages with an independently-known truth
// about how that person writes. The same corpora feed two experiments:
//
//   persona-digest    → does analyzeStyleBaseline describe THIS person, with
//                       real quotes, without flattering or confabulating?
//   style-deviation   → when a persona is scored against a target style, does
//                       the 0-100 adherence land in the right band, and are the
//                       suggested rewrites real, on-target and meaning-safe?
//
// Hand-written, not generated: the labels are the ground truth.
import { STYLE_PRESETS } from '@/types';

// ---------------------------------------------------------------------------
// Personas (digest experiment)
// ---------------------------------------------------------------------------

export interface Persona {
    id: string;
    /** Plain-language description of the real style, handed to the judge. */
    truth: string;
    /** True when this corpus is genuinely poor communication (flattery check). */
    poor?: boolean;
    /** True when the corpus is deliberately thin/repetitive (honesty check). */
    thin?: boolean;
    messages: string[];
}

export const PERSONAS: Persona[] = [
    {
        id: 'hedging-ic',
        truth: 'Hedges constantly, buries the ask at the end, apologizes for taking up space, rarely states a position outright.',
        messages: [
            "Sorry to bother — I might be wrong about this, but I think maybe the migration could possibly break the reporting job?",
            "Not sure if this is helpful, just a thought, feel free to ignore.",
            "I could be misreading it but it sort of seems like the index isn't being used? Maybe worth a look if you have time.",
            "Sorry, one more thing — no rush at all — did we decide on the retry policy?",
            "This is probably a silly question but what does the `pending` state actually mean here?",
            "I don't want to hold anything up, so happy to go with whatever you all think is best.",
            "Might just be me, but the docs seem a little out of date? Could be wrong.",
            "Apologies for the delay! I was a bit unsure how to approach it.",
            "Just wondering, and totally fine if not, whether we could maybe revisit the timeline?",
            "Hopefully that makes sense, sorry if it's confusing.",
        ],
    },
    {
        id: 'terse-exec',
        truth: 'Extremely short, leads with the decision, assigns an owner and a date, no pleasantries, no explanation.',
        messages: [
            'Approved. Ship it.',
            'No. Revisit in Q3.',
            'Priya owns this. Friday.',
            'Numbers by EOD.',
            'Cut scope. Ship the core.',
            'Who is blocked and on what.',
            'Do it.',
            'Not now.',
            'Move the review to Tuesday.',
            'Send me the one-pager.',
        ],
    },
    {
        id: 'structured-engineer',
        truth: 'Writes long structured handoffs with numbered steps, states assumptions explicitly, separates fact from opinion, cites evidence.',
        messages: [
            "Rollout plan: 1) migrate read path behind flag, 2) backfill overnight, 3) flip writes Thursday, 4) drop the old table after a week of clean metrics.",
            "Fact: p99 went from 180ms to 410ms after the deploy. Opinion: it's the N+1 in the serializer, not the cache.",
            "Assumption I'm making: every tenant has at most one active subscription. If that's wrong, the dedupe logic breaks — can someone confirm?",
            "Three options, with tradeoffs. (a) REST, simplest, more round trips. (b) GraphQL, one round trip, new infra to run. (c) batch endpoint, middle ground. I lean (c).",
            "Evidence for the regression: flamegraph attached, 62% of wall time in `serializeInvoice`.",
            "To reproduce: seed with `fixtures/multi-tenant.json`, run the worker, watch for duplicate charge rows.",
            "Blocked on: schema review. Not blocked on: the client work, which I'll keep going on.",
            "Summary for anyone joining late: we found a double-charge path, it's behind a flag, no customers affected.",
            "I checked the last 30 days of logs — zero occurrences outside staging.",
            "Next steps and owners: I'll do the backfill script, Sam reviews the migration, we decide Thursday.",
        ],
    },
    {
        id: 'poor-communicator',
        poor: true,
        truth: 'Vague, dismissive, and demoralizing. Gives no detail, shuts down discussion, and disparages the work.',
        messages: [
            'this is broken again',
            'nope',
            "doesn't matter, moving on",
            'whatever, do what you want',
            'this whole thing is a mess',
            'why do we even bother',
            'wrong',
            'no idea, ask someone else',
            'still broken',
            "told you it wouldn't work",
        ],
    },
    {
        id: 'thin-corpus',
        thin: true,
        truth: 'Almost no signal — a handful of near-identical one-word acknowledgements.',
        messages: ['ok', 'ok', 'sounds good', 'ok', 'yep', 'ok', 'sure', 'ok', 'yep', 'ok'],
    },
];

// ---------------------------------------------------------------------------
// Persona × target style (deviation experiment)
// ---------------------------------------------------------------------------

export type Band = 'high' | 'mid' | 'low';

/** Deliberately lenient: only scores that are genuinely wrong fall outside. */
export const BAND_RANGES: Record<Band, [number, number]> = {
    high: [65, 100],
    mid: [35, 78],
    low: [0, 45],
};

export interface StyleCase {
    id: string;
    /**
     * Links the on-style and off-style corpus for the same target so the
     * experiment can check the scorer *separates* them (discrimination).
     * Null for corpora that only exercise suggestions.
     */
    pair: string | null;
    /** Preset key, or 'custom' for a free-text target. */
    targetKey: string;
    target: string;
    band: Band;
    note: string;
    messages: string[];
}

const DIRECT = STYLE_PRESETS.direct.description;
const WARM = STYLE_PRESETS.warm.description;
const CONCISE = STYLE_PRESETS.concise.description;
const ANALYTICAL = STYLE_PRESETS.analytical.description;
const KIND =
    'I want to come across as kind, warm, and genuinely caring — I lead with appreciation and empathy and I am never harsh, cold, or dismissive.';

export const STYLE_CASES: StyleCase[] = [
    // --- Direct & action-oriented ---
    {
        id: 'direct-on', pair: 'direct', targetKey: 'direct', target: DIRECT, band: 'high',
        note: 'leads with decision/ask, no hedging',
        messages: [
            'Ship the auth fix today. I’ll review by 3pm.',
            'Decision: we go with Postgres. Rationale in the doc.',
            'Need the API contract by EOD to unblock mobile.',
            'Cutting scope: CSV export drops from v1, revisit in Q3.',
        ],
    },
    {
        id: 'direct-off', pair: 'direct', targetKey: 'direct', target: DIRECT, band: 'low',
        note: 'hedgy, rambling, buries the ask',
        messages: [
            'Hey so I was kind of thinking maybe we could possibly look into perhaps changing the database at some point, if that’s okay with everyone?',
            'Sorry to bother, just wondering if maybe someone might have a tiny bit of time to maybe glance at the thing whenever, absolutely no rush at all!',
            'I’m really not sure, it could honestly go either way, I don’t want to step on any toes, just sort of spitballing here, what does everyone think?',
        ],
    },
    // --- Warm & collaborative ---
    {
        id: 'warm-on', pair: 'warm', targetKey: 'warm', target: WARM, band: 'high',
        note: 'empathetic, inclusive, invites input',
        messages: [
            'Really appreciate you jumping on this! Let’s figure out the rollout together — what feels doable for you this week?',
            'Great point, Sam. Building on that, maybe we frame it as a shared goal?',
            'Thanks for flagging this — totally fair concern. How can I help unblock you?',
        ],
    },
    {
        id: 'warm-off', pair: 'warm', targetKey: 'warm', target: WARM, band: 'low',
        note: 'cold, blunt, no acknowledgement',
        messages: ['Wrong. Redo it.', 'Not my problem. Figure it out.', 'This is late. Again.'],
    },
    // --- Brief & low-friction ---
    {
        id: 'concise-on', pair: 'concise', targetKey: 'concise', target: CONCISE, band: 'high',
        note: 'terse, complete, no filler',
        messages: ['LGTM, merging.', 'Done.', 'Need: prod API key. By: today.', 'Blocked on design. ETA?'],
    },
    {
        id: 'concise-off', pair: 'concise', targetKey: 'concise', target: CONCISE, band: 'low',
        note: 'verbose, restates known context',
        messages: [
            'I just wanted to take a quick moment to circle back on the thing we were discussing earlier in the week, because I think it’s really important that we all have full shared context before we proceed any further on any of this.',
            'As you may or may not recall from our previous conversation, which happened a little while ago now, the situation is essentially that there are a number of moving parts and I wanted to walk through each of them in turn.',
        ],
    },
    // --- Analytical & precise ---
    {
        id: 'analytical-on', pair: 'analytical', targetKey: 'analytical', target: ANALYTICAL, band: 'high',
        note: 'evidence-backed, separates fact from opinion',
        messages: [
            'Conversion dropped 12% WoW (4.1%→3.6%), concentrated on mobile Safari. Hypothesis: the new checkout JS bundle (+180KB). Proposing an A/B test.',
            'Three vendors quoted: A $40k/yr (SOC2), B $28k/yr (no SOC2), C $52k/yr (SOC2 + SSO). Given our compliance need, A is the floor.',
        ],
    },
    {
        id: 'analytical-off', pair: 'analytical', targetKey: 'analytical', target: ANALYTICAL, band: 'low',
        note: 'pure vibes, no evidence',
        messages: [
            'I feel like the numbers are probably down a bit, hard to say really.',
            'Honestly vendor B just feels right to me, I have a good gut feeling about them.',
            'I think users kind of maybe don’t love the new thing? Not sure though.',
        ],
    },
    // --- Custom target: kind ---
    {
        id: 'kind-on', pair: 'kind', targetKey: 'custom', target: KIND, band: 'high',
        note: 'appreciative, caring, gentle',
        messages: [
            'Thank you so much for all the effort here — it really shows, and I’m grateful.',
            'No worries at all, these things happen! Let’s sort it out together, you’ve got this.',
            'I really value your perspective on this — thanks for taking the time to share it.',
        ],
    },
    {
        id: 'kind-off', pair: 'kind', targetKey: 'custom', target: KIND, band: 'low',
        note: 'harsh, dismissive — opposite of kind',
        messages: [
            'Did you even read the ticket? This is basic.',
            'I don’t have time to hold your hand through this.',
            'Whatever, just do it however, I don’t care anymore.',
        ],
    },
    // --- Mixed: genuinely partial adherence → mid band ---
    {
        id: 'direct-mixed', pair: null, targetKey: 'direct', target: DIRECT, band: 'mid',
        note: 'some crisp, some hedgy — should land in the middle',
        messages: [
            'Ship it today.',
            'Hmm, maybe we could possibly think about the rollout plan at some point, if that works?',
            'Decision: go with option B.',
            'Sorry, not totally sure, just a thought, no pressure!',
        ],
    },
    // --- Off-style writers with a bigger corpus: exercise the suggestions ---
    {
        id: 'warm-target-blunt-writer', pair: null, targetKey: 'warm', target: WARM, band: 'low',
        note: 'blunt writer who wants to come across warm — every message deviates',
        messages: [
            'This is wrong. Redo it.',
            "No, that idea doesn't make sense.",
            'You missed the obvious case in checkout.',
            'Just fix the tests and stop debating it.',
            'Why is this still open?',
            'The doc is confusing. Rewrite the rollout section.',
            'Not ready for customers.',
            'Cut the extra scope and ship the patch.',
        ],
    },
    {
        id: 'concise-target-rambler', pair: null, targetKey: 'concise', target: CONCISE, band: 'low',
        note: 'rambler who wants to be concise',
        messages: [
            "So I was thinking, and I might be totally off base here, but it seems like maybe we could possibly consider revisiting the caching approach at some point when there's time?",
            "Just to give a bit of background before I get to the question — as you probably remember from the meeting a few weeks ago, we had talked about the migration, and I think at the time we said we'd revisit, so anyway, my question is whether we still want to do that.",
            "Hi! Hope your week is going well. Quick thing, no rush whatsoever, whenever you get a chance — could you take a look at the PR?",
            "I wanted to follow up on the thing from earlier, which I know we discussed, though maybe not in detail, about the reporting job and whether it needs changing.",
            "Not sure if this is the right channel for this but I figured I'd ask here anyway and someone can redirect me if needed.",
            "Long story short, and I'll try to keep this brief although there's a lot of context, the deploy didn't go as planned.",
        ],
    },
    {
        id: 'analytical-target-vague-writer', pair: null, targetKey: 'analytical', target: ANALYTICAL, band: 'low',
        note: 'vibes-only writer who wants to be analytical',
        messages: [
            'The new release feels way slower.',
            'I think users are probably unhappy about this.',
            'Something is off with the numbers.',
            'That approach seems kind of risky to me.',
            'It looks like the cache is the problem.',
            'Most people probably do it the other way.',
            'This will likely cause issues down the line.',
            'The data seems fine to me.',
        ],
    },
    {
        id: 'direct-target-hedger', pair: null, targetKey: 'direct', target: DIRECT, band: 'low',
        note: 'hedger who wants to be direct',
        messages: [
            'Sorry, I might be wrong, but maybe we should possibly consider rolling back?',
            "I don't want to hold things up so happy to go with whatever.",
            'Could be nothing, but the error rate might be up a bit? Not sure.',
            'Just a thought, feel free to ignore, but perhaps we could revisit the deadline.',
            'This is probably a silly question but who owns the migration?',
            'Apologies if this was already covered somewhere.',
            'Might just be me but the staging env seems maybe broken?',
            'No rush at all, whenever, but did we decide anything about the retry policy?',
        ],
    },
];
