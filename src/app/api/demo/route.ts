// AliceBot — simulated teammate (defensive senior engineer).
// Shares the companion-bot engine; its own Slack app (DEMO_SLACK_* env vars).
import { createCompanionHandler, ALICE_PERSONA } from '@/lib/companion-bot';

const { POST, GET } = createCompanionHandler(() => ({
    name: 'AliceBot',
    botToken: process.env.DEMO_SLACK_BOT_TOKEN,
    signingSecret: process.env.DEMO_SLACK_SIGNING_SECRET,
    persona: ALICE_PERSONA,
    fallback: "Hey. What's up?",
}));

export { POST, GET };
