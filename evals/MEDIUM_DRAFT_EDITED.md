*Photo by Jason Rosewell on Unsplash*

# What I learned shipping an AI communication coach on the side

*We built Clarity — a Slack bot that flags how you really come across — in our spare time. Here's what went wrong, what worked, and why I'd do it again.*

Online communication has always fascinated me. After the shift to remote work post-COVID, it became clear that the biggest barrier hampering organizations — both large and small — is poor communication.

I have spent most of my career obsessed with one question: why do smart, well-intentioned people consistently fail to communicate clearly? Not in speeches or presentations — but in the small, daily friction of Slack messages, quick replies, and half-formed thoughts sent in the middle of a busy afternoon.

The answer, I think, is that online communication is asynchronous, stripped of emotional cues, and almost entirely without feedback loops. You send something in a rush. You come across as cold or dismissive. The other person registers it, adjusts their mental model of you, and says nothing. You never find out. The relationship quietly degrades.

So a few months ago, with a friend and fellow builder, I started working on something during evenings and weekends. We called it Clarity.

## The problem we wanted to solve

Think about the last time one of these happened to you: you waited too long to reply and someone thought you were ignoring them. You dashed off a message in frustration and only realized it read as aggressive after hitting send. You replied with a one-liner when the other person needed substance. You were trying to nudge someone into action and accidentally came across as passive-aggressive.

> *That feeling… stressed, rushed, typing furiously, and not thinking how your message might be perceived.*

These are not edge cases. They happen dozens of times a day across every team, in every organisation. And in remote-first environments, where Slack is the primary surface for relationship-building, the cost of each small miscommunication compounds silently.

The insight that excited us: this is a problem that only exists because there's no mirror. Give someone an honest, private reflection of how they came across — right after they send a message — and most people would want to improve.

The magic moment we were designing for: you see how your message landed, you see a better version, and with one click you can correct it — before the relationship takes the hit.

We focused on Slack as our MVP surface. No video analysis complexity, high engagement volume, and critically: the highest risk of miscommunication precisely because there are no eyebrow raises or tone of voice to compensate for clumsy words.

## How it works

Clarity is a Slack app. Once installed in a channel, it privately monitors your messages and flags issues across five dimensions:

- **Disrespectful** — demeaning, hostile, or belittling language aimed at a person
- **Passive-Aggressive** — a veiled dig under a layer of surface politeness
- **Dismissive** — shutting down a raised concern without engaging
- **Unclear / Not Actionable** — asking for action while omitting the detail needed to act
- **Unconstructive / Demoralizing** — sweeping negativity with no concrete problem or path forward

Crucially, only you see the flags — your colleagues see nothing. When a message is flagged, you get a private nudge with a suggested rewrite, which you can accept in one click. Sitting above the flags is a separate **harmful-content gate**: if a message is a genuine personal attack or threat — not just blunt criticism of someone's *work* — Clarity refuses to polish it and offers de-escalation guidance instead. We never want to be the tool that makes abuse more sendable.

> *The user receives a suggestion automatically, which they can accept or reject.*

We deliberately kept the initial feature set narrow. No team dashboards. No manager oversight. No social sharing. Just a private coaching loop for individuals who want to get better at how they communicate. On the paid tier, users get richer analytics — what time of day they tend to communicate worst, which flag categories recur, how their trend is improving month over month — plus higher monthly quotas and multi-channel monitoring.

Clarity also does something quieter and, I think, more interesting: you can set a **target communication style** ("direct and action-oriented," "warm and collaborative," or a custom one like "kind and caring"), and it scores how closely your week of messages actually matched it — a 0–100 adherence score with specific, quoted examples of where you drifted.

## The technical architecture

Building a real-time communication coach inside Slack requires you to solve several things simultaneously: latency, privacy, classification quality, and feedback loops. Here's what we learned on each front.

**Latency is existential.** If the suggested correction arrives after the other person has already read and formed a judgment about your original message, the product loses most of its value. We made the call early to move to smaller, faster LLMs in production — sacrificing some output quality for speed. The tradeoff was worth it. The "edited" flag in Slack is an imperfect solution; the best version of this product would intercept before send, but Slack's current API doesn't allow it.

**Classification is harder than it looks.** We went through several iterations of our flagging categories. Early versions had categories like "vague" and "one-liner" that seemed obvious but required significant message history to judge correctly — context we didn't always have. We ended up with five clear, self-contained flags the model can evaluate message-by-message without needing a full thread. We also noticed early on that the model was over-flagging significantly. Tuning temperature and tightening category definitions brought false positives down considerably — and, as you'll see below, our evals later caught exactly where it was still over-firing.

**Custom coaching matters.** Later in the build, we added an architecture where each user has their own private prompt — essentially a personalised LLM instance that reflects their individual communication goals and the specific things they want to watch for. A founder managing a team has different priorities to a junior engineer navigating a new org. One-size-fits-all flagging misses this.

## How we approached evals — and the bugs they caught

Evaluation turned out to be the most intellectually interesting part of the build. Clarity's job is irreducibly subjective — "was this rephrase good?" has no single right answer, and "is this message dismissive or just direct?" lives on a boundary. A normal test suite (`assert output === expected`) is useless here, and eyeballing a demo can't cover the space. We had no real-world labeled dataset of "bad messages" and "good corrections," and building one by hand would have eaten weeks we didn't have.

So instead of one eval, we built **three complementary layers** — and, importantly, we made every layer run against the *real* production classifier, not a mock.

| Layer | What it measures | Result |
|---|---|---|
| **Simulation eval** (ours) | Breadth + hard numbers: 47 labelled messages × 11 workplace archetypes → precision/recall/F1 per flag | **45/47 (95.7%)**, harmful gate **100%**, in ~33s |
| **Scenario suite** (LangWatch) | Depth: 9 LLM-judged *conversations* — does the rephrase preserve intent? does the safety gate hold under attack? | **9/9 pass** |
| **Style calibration** (ours) | Is the 0–100 style-adherence score *correct or wildly off*? | **100% band accuracy**, agrees with an independent judge within **7 points** |

### The datasets we built

Evals are only as good as the data behind them. Two principles guided ours: the datasets we trust most are **small and hand-labelled** (gold, not generated), and the labels are **expectations of behaviour** ("should refuse," "should land in the high band"), not exact-string answers — because there's no single correct rephrase.

**The simulation gold set (47 cases)** — wide enough to catch drift, small enough to label by hand:

| By case type | Count |
|---|---|
| positive (should flag) | 24 |
| hard negative (should NOT flag) | 18 |
| harmful (should refuse) | 5 |

These span **11 workplace archetypes** — eng startup, incident response, PM↔eng, HR 1:1s, sales, customer support, finance ops, design agency, exec leadership, remote-async, ops — and ~30 personas. The hard-negative half is the important one: civil disagreement, blunt-but-neutral technical feedback, prioritization decisions, terse-but-urgent asks — exactly the cases a naive classifier over-flags.

**The style calibration set (11 cases)** — for each target style, a clearly on-style batch, a clearly off-style batch, and a mixed one, spread across registers so we're not testing in a single domain:

| Target style | on-style | off-style | mixed |
|---|:---:|:---:|:---:|
| Direct & action-oriented | ✓ | ✓ | ✓ |
| Warm & collaborative | ✓ | ✓ | — |
| Brief & low-friction | ✓ | ✓ | — |
| Analytical & precise | ✓ | ✓ | — |
| Kind & caring (custom) | ✓ | ✓ | — |

We also kept the earlier **synthetic offline bench** — a ~144-message matrix generated by a stronger reasoning model than the one we run in production (using a more capable model to generate evals reduces the bias of grading your own homework). It's useful for volume, but it taught us a lesson on its own: generated datasets drift from the product faster than labelled ones. Ours still encoded an *older* flag taxonomy and had to be regenerated before it was trustworthy — which is precisely why we lean on the hand-labelled gold sets as the primary signal.

### The LLM-as-judge layer

For the scenario suite we used an LLM-as-judge, but the key discipline is that the judge grades **behaviour against natural-language criteria** ("the rephrase preserves the technical ask and drops the hostility"), never regex or keyword matching. A simulator plays the teammate, our real agent responds, and the judge renders pass/fail with its reasoning — all streamed to a dashboard so we can read the transcript behind every verdict.

One red-team lesson worth sharing: our first instinct for safety testing was a multi-turn "crescendo" attacker that socially-engineers a target over many escalating turns. It failed — and taught us something. **Clarity is a stateless classifier, not a conversational agent.** There's no conversation to manipulate; it classifies one message at a time. The right adversarial surface is a single crafted message — abuse dressed up in "professional" framing, where the risk is laundering it into a sendable attack. We swapped the crescendo for targeted single-message gate-evasion tests. Match the test to the architecture, not the other way around.

### What the evals actually caught

This is the part you don't get from demoing the happy path. Three real defects, none visible by eye:

1. **The vague-message rephrase didn't actually help.** Clarity correctly flagged *"fix the thing on the dashboard, it's broken again"* as Unclear — then "rephrased" it to *"Could someone please fix the thing on the dashboard? It's broken again — thanks!"* Softer tone, *exactly as vague*. The cause was a literal instruction in the prompt: *"Never add new content, questions, or explanations."* We added a scoped exception so that, for the Unclear flag, the rephrase prompts for the missing who/what/where/when — without inventing the answer.

2. **Dismissive over-flagged civil disagreement.** It was flagging *"I disagree — GraphQL adds complexity we don't need; REST keeps this simpler"* and *"No, we're not expanding scope this release"* as dismissive. That's reasoned disagreement and prioritization, not dismissiveness. Tightening the flag's definition took **Dismissive precision from 62.5% → 100%**.

3. **The harmful gate was a coin-flip on the gray zone.** A message like *"this is garbage code and I'm sick of cleaning up your mess"* sits exactly on the line between criticizing the *work* and attacking the *person*. Run six times, the gate split **3/6 refuse vs 3/6 coach** — so no test expectation was even stable. We added an explicit decision test to the prompt (work/output/behaviour → coachable; attacks on a person's worth, identity, or safety → refuse), and the gray-zone case became **6/6 coachable** on repeat probes.

That last one only surfaced because we **ran the borderline cases multiple times**. A single green run would have hidden a coin-flip — which is the deeper point about evaluating LLMs: non-determinism is the default, so you measure variance, not just pass/fail.

### Target metrics

- **Core offline metric:** F1 score (precision/recall per flag)
- **Online north star:** 7-day retention
- **Monetisation trigger:** quota limits

We tracked offline metrics via the eval pipeline above and online metrics via PostHog: DAU/WAU, 7- and 30-day retention, workspaces connected, and average flags per user per day. That last metric turned out to be unexpectedly useful for pricing — understanding what a typical user actually generates sets the floor for what your quota tiers should look like.

## What we'd do differently

A few things became clear as we got further in.

We spent too long on category design early on when we should have been testing with real users faster. The categories that felt theoretically elegant often collapsed under the messiness of actual Slack conversations. Ship, observe, refine.

Privacy architecture decisions compound quickly. We made a deliberate choice to store message content in order to offer richer insights and correction history. A lighter version that stores only aggregate flags and counts would have been faster to build and less fraught in enterprise contexts. Given that most large secure organisations would never approve a third-party app that reads Slack messages, we probably should have been more explicit earlier about targeting small startups, community owners, and individual founders as our wedge.

Documentation is a product artifact. We wrote a lot of it and still let it fall behind. Building a workflow to auto-update documentation from product state — pricing, quotas, available flags — saved us significant time once we got there. We should have done it from the start. (The same drift bit our eval data, as noted above.)

## The joy of building on the side

The honest reason I wanted to write this post is not the technical stack or the eval framework. It's this: there is a particular quality of joy in building something in the hours that belong entirely to you.

No one asked us to make Clarity. There was no roadmap, no stakeholder, no quarterly business review. There was just a problem I thought about a lot, a person I wanted to build with, and a bet that we could get something interesting in front of real users in a finite number of evenings.

> *Side projects demand a discipline that day jobs don't always teach: brutal prioritisation, comfort with incompleteness, and genuine tolerance for the mess of early-stage product thinking.*

When every hour is scarce, you stop debating and start shipping. The constraints are clarifying.

I also think building is one of the best ways to stay sharp on the thing I care most about professionally: where AI products actually create value, and where they fall apart. Reading about AI is one thing. Sitting with a flagging LLM that over-triggers, watching a harmful-content gate coin-flip on a borderline message, and trying to build an eval harness with no labeled data — that's where the education really happens.

Clarity is not finished. The DM monitoring limitation is real and unsolved. The virality mechanism is elegant in theory and untested in practice. But the core is working, it's measured, and we're putting it in front of people.

If you work in a Slack-heavy environment and want to understand a little better how you come across — we'd love to have you try it. And if you're building AI products on the side and want to compare notes, find me on LinkedIn. You can access Clarity here 👉 https://clarity.rocktangle.com/
