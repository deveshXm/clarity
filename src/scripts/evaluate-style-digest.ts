// Local style/digest eval scaffold. This intentionally stays small: it checks
// that baseline and target-style deviation outputs are structured, grounded in
// quotes, and useful enough for a human/LLM judge pass or LangWatch scenario
// import later.
//
// Usage:
//   npm run evals:style

import { analyzeStyleBaseline, analyzeStyleDeviation } from "@/lib/ai";
import { STYLE_PRESETS } from "@/types";

type DigestMessage = { text: string; ts: string; channelName?: string };

type Scenario = {
    name: string;
    targetStyle?: string;
    messages: DigestMessage[];
};

type CheckResult = {
    scenario: string;
    passed: boolean;
    checks: Record<string, boolean>;
    notes: string[];
};

const now = Math.floor(Date.now() / 1000);

function msg(text: string, index: number, channelName = "evals"): DigestMessage {
    return { text, ts: String(now - (100 - index)), channelName };
}

const scenarios: Scenario[] = [
    {
        name: "baseline-direct-and-abrupt",
        messages: [
            "Ship the auth patch today. No more bikeshedding.",
            "This PR is too noisy. Cut the migration and send a smaller diff.",
            "Need status by 3pm: owner, blocker, ETA.",
            "No, we are not expanding scope in this release.",
            "This is good enough. Merge once tests pass.",
            "Add logs to the billing webhook and ping me when deployed.",
            "The rollout plan is unclear. Who owns rollback?",
            "Stop changing the UI until the API contract is stable.",
            "Send the customer note after legal signs off.",
            "We can discuss polish later. Fix the bug first.",
        ].map((text, i) => msg(text, i, "launch")),
    },
    {
        name: "deviation-warm-target",
        targetStyle: STYLE_PRESETS.warm.description,
        messages: [
            "This is wrong. Redo it.",
            "No, that idea doesn't make sense.",
            "You missed the obvious case in checkout.",
            "Just fix the tests and stop debating it.",
            "Why is this still open?",
            "The doc is confusing. Rewrite the rollout section.",
            "I don't want another meeting. Post the answer here.",
            "This is not ready for customers.",
            "Cut the extra scope and ship the patch.",
            "We should not tell sales this is done yet.",
        ].map((text, i) => msg(text, i, "feedback")),
    },
];

function hasNonEmptyStrings(values: string[], min: number): boolean {
    return values.filter(value => value.trim().length > 0).length >= min;
}

async function runScenario(scenario: Scenario): Promise<CheckResult> {
    const notes: string[] = [];
    const baseline = await analyzeStyleBaseline(scenario.messages);
    const checks: Record<string, boolean> = {
        baseline_summary_present: baseline.summary.trim().length >= 40,
        baseline_traits_present: hasNonEmptyStrings(baseline.traits, 2),
        baseline_examples_grounded: baseline.examples.length > 0 && baseline.examples.every(example =>
            example.quote.trim().length > 0 &&
            scenario.messages.some(message => message.text.includes(example.quote.trim()))
        ),
    };

    if (!checks.baseline_examples_grounded) {
        notes.push("Baseline examples should quote exact substrings from the source messages.");
    }

    if (scenario.targetStyle) {
        const deviation = await analyzeStyleDeviation(scenario.messages, scenario.targetStyle);
        checks.deviation_score_valid = deviation.adherenceScore >= 0 && deviation.adherenceScore <= 100;
        checks.deviation_items_present = deviation.deviations.length >= 1;
        checks.deviation_examples_grounded = deviation.deviations.every(deviationItem =>
            deviationItem.quote.trim().length > 0 &&
            scenario.messages.some(message => message.text.includes(deviationItem.quote.trim()))
        );
        checks.deviation_suggestions_present = deviation.deviations.every(deviationItem =>
            deviationItem.suggestion.trim().length >= 20
        );

        if (!checks.deviation_examples_grounded) {
            notes.push("Deviation examples should quote exact substrings from the source messages.");
        }
    }

    return {
        scenario: scenario.name,
        passed: Object.values(checks).every(Boolean),
        checks,
        notes,
    };
}

async function main(): Promise<void> {
    const results: CheckResult[] = [];

    for (const scenario of scenarios) {
        console.log(`Running style/digest eval: ${scenario.name}`);
        results.push(await runScenario(scenario));
    }

    console.log("\nSTYLE/DIGEST EVAL SUMMARY");
    console.log("=========================");
    for (const result of results) {
        console.log(`${result.passed ? "PASS" : "FAIL"} ${result.scenario}`);
        for (const [name, passed] of Object.entries(result.checks)) {
            console.log(`  ${passed ? "[ok]" : "[fail]"} ${name}`);
        }
        for (const note of result.notes) {
            console.log(`  note: ${note}`);
        }
    }

    if (results.some(result => !result.passed)) {
        process.exit(1);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
