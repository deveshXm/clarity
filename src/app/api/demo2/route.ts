// BobBot — simulated teammate (impatient, ship-it product manager).
// Shares the companion-bot engine; its own Slack app (DEMO2_SLACK_* env vars).
import { createCompanionHandler, BOB_PERSONA } from '@/lib/companion-bot';

const { POST, GET } = createCompanionHandler(() => ({
    name: 'BobBot',
    botToken: process.env.DEMO2_SLACK_BOT_TOKEN,
    signingSecret: process.env.DEMO2_SLACK_SIGNING_SECRET,
    persona: BOB_PERSONA,
    fallback: 'Hey. Where are we on the timeline?',
}));

export { POST, GET };
