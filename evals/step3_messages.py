"""Step 3: Generate messages for each scenario (flagged or clean)."""

import asyncio
import json

from pydantic import BaseModel

from config import (
    STEP3_OUTPUT,
    FINAL_OUTPUT,
    ensure_data_dir,
    get_client,
    get_random_temperature,
)
from step1_workspaces import Workspace, Person, load_workspaces
from step2_scenarios import Scenario, WorkspaceScenarios, load_scenarios


class GeneratedMessage(BaseModel):
    id: str
    workspace_id: str
    workspace_name: str
    workspace_type: str
    scenario_id: str
    scenario_type: str
    sender_id: str
    sender_name: str
    sender_role: str
    recipient_names: list[str]
    message: str
    expected_rephrase: str | None
    expected_flags: list[str]
    flag_descriptions: dict[str, str]
    context: str
    emotional_state: str
    urgency_level: str
    is_flagged: bool


# Prompt for messages that SHOULD be flagged (have communication issues)
FLAGGED_MESSAGE_PROMPT = """You are generating a synthetic Slack message for testing a communication coaching app.

WORKSPACE: {workspace_name} ({workspace_type})
Culture: {workspace_culture}
Location: {workspace_location}

SENDER:
- Name: {sender_name}
- Role: {sender_role}
- Native Language: {sender_native_language}
- Personality: {sender_personality}
- Communication Style: {sender_communication_style}

SCENARIO:
- Type: {scenario_type}
- Context: {context}
- Recipients: {recipients}
- Emotional State: {emotional_state}
- Urgency: {urgency_level}
- Situational Factor: {additional_constraint}

FLAGS THIS MESSAGE MUST VIOLATE:
{target_flags_detail}

Write ONE realistic Slack message that {sender_name} would send.

CRITICAL REQUIREMENTS:
1. The message MUST naturally violate the listed flags, but SUBTLY
2. A colleague might not notice the issues, but a communication coach would
3. Make it authentic to this person's voice, native language influence, and style
4. Don't make it obviously terrible - real people don't know they're making mistakes

MESSAGE FORMAT VARIATION (pick what fits this scenario):
- With or without emojis (based on person's style)
- With or without @mentions
- With or without code/logs/links (if technical)
- With or without bullet points
- With or without greeting

LENGTH DISTRIBUTION:
- 50% of messages: SHORT (1-3 sentences)
- 40% of messages: MEDIUM (1-2 short paragraphs)
- 10% of messages: LONG (wall of text)
Pick length based on scenario urgency and person's communication style.

REALISTIC IMPERFECTIONS (add 1-2 if appropriate):
- Typos (especially if rushing, on phone, or non-native speaker)
- Incomplete thoughts or mid-sentence corrections
- Missing punctuation or capitalization
- Autocorrect errors
- Starting typing then changing direction ("wait actually...")

NON-NATIVE SPEAKER PATTERNS (if applicable):
- Occasional grammar quirks from native language
- Missing articles (a/the) or wrong prepositions
- Slightly formal phrasing

EXPECTED REPHRASE:
Also generate an ideal improved version of this message that:
- Fixes ALL the flagged communication issues listed above
- Maintains the sender's voice, personality, and cultural communication patterns
- Keeps the same intent, information, and level of detail
- Sounds like the same person on a "good communication day"
- Does NOT over-correct into robotic corporate-speak

Respond with valid JSON:
{{
  "message": "The actual Slack message text with communication issues",
  "expected_rephrase": "The ideal improved version fixing all flags"
}}"""


# Prompt for CLEAN messages (no communication issues)
CLEAN_MESSAGE_PROMPT = """You are generating a synthetic Slack message for testing a communication coaching app.

WORKSPACE: {workspace_name} ({workspace_type})
Culture: {workspace_culture}
Location: {workspace_location}

SENDER:
- Name: {sender_name}
- Role: {sender_role}
- Native Language: {sender_native_language}
- Personality: {sender_personality}
- Communication Style: {sender_communication_style}

SCENARIO:
- Type: {scenario_type}
- Context: {context}
- Recipients: {recipients}
- Emotional State: {emotional_state}
- Urgency: {urgency_level}
- Situational Factor: {additional_constraint}

Write ONE realistic Slack message that {sender_name} would send on a GOOD COMMUNICATION DAY.

THIS IS A CLEAN MESSAGE - NO FLAGS SHOULD BE VIOLATED:
- Clear and well-structured
- Appropriate tone for the audience
- Action items are explicit (if applicable)
- Right level of detail - not too much, not too little
- Respectful and professional while matching workplace culture

The person is having a good day, took time to think before writing, or the situation naturally brings out their best communication.

MESSAGE FORMAT VARIATION (pick what fits):
- With or without emojis
- With or without @mentions
- With or without bullet points
- With or without greeting

LENGTH: Keep it appropriately concise - most clean messages are SHORT to MEDIUM.

STILL BE AUTHENTIC:
- Match their personality and communication style
- Non-native speakers still sound like themselves (just clearer)
- Don't make it robotic or overly formal unless that's their style

Respond with valid JSON:
{{
  "message": "The actual Slack message text"
}}"""


def get_sender_by_id(workspaces: list[Workspace], workspace_id: str, user_id: str) -> Person:
    """Get a person by workspace and user ID."""
    workspace = next(ws for ws in workspaces if ws.id == workspace_id)
    return next(p for p in workspace.people if p.id == user_id)


def get_workspace_by_id(workspaces: list[Workspace], workspace_id: str) -> Workspace:
    """Get workspace by ID."""
    return next(ws for ws in workspaces if ws.id == workspace_id)


def format_target_flags_detail(sender: Person, target_flag_names: list[str]) -> str:
    """Format the target flags with descriptions."""
    if not target_flag_names:
        return "(No flags - this is a clean message)"
    
    lines = []
    for flag_name in target_flag_names:
        matching_flag = next(
            (f for f in sender.coaching_flags if f.name == flag_name), None
        )
        if matching_flag:
            lines.append(f"- {matching_flag.name}: {matching_flag.description}")
        else:
            lines.append(f"- {flag_name}: (violate this communication pattern)")
    return "\n".join(lines)


async def generate_message_for_scenario(
    client,
    workspace: Workspace,
    sender: Person,
    scenario: Scenario,
) -> GeneratedMessage:
    """Generate a message for a single scenario."""
    
    # Choose prompt based on whether this should be flagged
    if scenario.should_flag:
        prompt_template = FLAGGED_MESSAGE_PROMPT
    else:
        prompt_template = CLEAN_MESSAGE_PROMPT
    
    prompt = prompt_template.format(
        workspace_name=workspace.name,
        workspace_type=workspace.type,
        workspace_culture=workspace.culture,
        workspace_location=workspace.location_context,
        sender_name=sender.name,
        sender_role=sender.role,
        sender_native_language=sender.native_language,
        sender_personality=sender.personality,
        sender_communication_style=sender.communication_style,
        scenario_type=scenario.scenario_type,
        context=scenario.context,
        recipients=", ".join(scenario.recipient_names),
        emotional_state=scenario.emotional_state,
        urgency_level=scenario.urgency_level,
        additional_constraint=scenario.additional_constraint,
        target_flags_detail=format_target_flags_detail(sender, scenario.target_flags),
    )
    
    response = await client.chat.completions.create(
        model="gpt-5.2",
        messages=[
            {
                "role": "system",
                "content": "You are writing realistic Slack messages. For flagged messages, include subtle communication issues. For clean messages, write clear and effective communication. Respond with valid JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=get_random_temperature(),
        response_format={"type": "json_object"},
    )
    
    data = json.loads(response.choices[0].message.content)
    
    # Build flag descriptions dict (empty for clean messages)
    flag_descriptions = {}
    if scenario.should_flag:
        for flag_name in scenario.target_flags:
            matching = next((f for f in sender.coaching_flags if f.name == flag_name), None)
            flag_descriptions[flag_name] = matching.description if matching else ""
    
    # Extract expected_rephrase (only for flagged messages)
    expected_rephrase = data.get("expected_rephrase") if scenario.should_flag else None
    
    return GeneratedMessage(
        id=f"{scenario.id}_msg",
        workspace_id=workspace.id,
        workspace_name=workspace.name,
        workspace_type=workspace.type,
        scenario_id=scenario.id,
        scenario_type=scenario.scenario_type,
        sender_id=sender.id,
        sender_name=sender.name,
        sender_role=sender.role,
        recipient_names=scenario.recipient_names,
        message=data["message"],
        expected_rephrase=expected_rephrase,
        expected_flags=scenario.target_flags if scenario.should_flag else [],
        flag_descriptions=flag_descriptions,
        context=scenario.context,
        emotional_state=scenario.emotional_state,
        urgency_level=scenario.urgency_level,
        is_flagged=scenario.should_flag,
    )


async def generate_messages_for_workspace(
    client,
    workspace: Workspace,
    ws_scenarios: WorkspaceScenarios,
) -> list[GeneratedMessage]:
    """Generate messages for all scenarios in a workspace."""
    sender = get_sender_by_id([workspace], workspace.id, workspace.target_user_id)
    
    tasks = [
        generate_message_for_scenario(client, workspace, sender, scenario)
        for scenario in ws_scenarios.scenarios
    ]
    
    messages = await asyncio.gather(*tasks)
    return list(messages)


async def generate_all_messages(
    workspaces: list[Workspace],
    all_scenarios: list[WorkspaceScenarios],
) -> list[GeneratedMessage]:
    """Generate messages for all workspaces."""
    client = get_client()
    
    ws_lookup = {ws.id: ws for ws in workspaces}
    
    tasks = [
        generate_messages_for_workspace(client, ws_lookup[ws_sc.workspace_id], ws_sc)
        for ws_sc in all_scenarios
    ]
    
    results = await asyncio.gather(*tasks)
    
    all_messages = []
    for workspace_messages in results:
        all_messages.extend(workspace_messages)
    
    return all_messages


def save_messages(messages: list[GeneratedMessage]):
    """Save messages to JSON file."""
    ensure_data_dir()
    
    data = [m.model_dump() for m in messages]
    
    with open(STEP3_OUTPUT, "w") as f:
        json.dump(data, f, indent=2)
    
    flagged_count = sum(1 for m in messages if m.is_flagged)
    clean_count = sum(1 for m in messages if not m.is_flagged)
    
    print(f"Saved {len(messages)} messages to {STEP3_OUTPUT}")
    print(f"  Flagged: {flagged_count}")
    print(f"  Clean: {clean_count}")


def save_final_output(messages: list[GeneratedMessage]):
    """Save final output with the essential fields for evaluation."""
    ensure_data_dir()
    
    final_data = []
    for msg in messages:
        final_data.append({
            "id": msg.id,
            "workspace": {
                "id": msg.workspace_id,
                "name": msg.workspace_name,
                "type": msg.workspace_type,
            },
            "sender": {
                "id": msg.sender_id,
                "name": msg.sender_name,
                "role": msg.sender_role,
            },
            "scenario": {
                "id": msg.scenario_id,
                "type": msg.scenario_type,
                "context": msg.context,
            },
            "message": msg.message,
            "expected_rephrase_message": msg.expected_rephrase,
            "expected_flags": msg.expected_flags,
            "flag_definitions": msg.flag_descriptions,
            "isFlagged": msg.is_flagged,
        })
    
    with open(FINAL_OUTPUT, "w") as f:
        json.dump(final_data, f, indent=2)
    
    flagged_count = sum(1 for m in final_data if m["isFlagged"])
    clean_count = sum(1 for m in final_data if not m["isFlagged"])
    
    print(f"Saved final output with {len(final_data)} entries to {FINAL_OUTPUT}")
    print(f"  Flagged: {flagged_count} ({flagged_count/len(final_data)*100:.0f}%)")
    print(f"  Clean: {clean_count} ({clean_count/len(final_data)*100:.0f}%)")


def load_messages() -> list[GeneratedMessage]:
    """Load messages from JSON file."""
    with open(STEP3_OUTPUT) as f:
        data = json.load(f)
    return [GeneratedMessage(**m) for m in data]


async def main():
    """Run step 3: Generate messages."""
    print("Step 3: Generating messages for each scenario...")
    
    workspaces = load_workspaces()
    print(f"Loaded {len(workspaces)} workspaces")
    
    all_scenarios = load_scenarios()
    total_scenarios = sum(len(ws.scenarios) for ws in all_scenarios)
    print(f"Loaded {total_scenarios} scenarios")
    
    messages = await generate_all_messages(workspaces, all_scenarios)
    save_messages(messages)
    save_final_output(messages)
    
    # Print summary
    print(f"\nGenerated {len(messages)} messages")
    
    # Show sample of each type
    flagged_samples = [m for m in messages if m.is_flagged][:2]
    clean_samples = [m for m in messages if not m.is_flagged][:2]
    
    print("\n--- Sample FLAGGED messages ---")
    for msg in flagged_samples:
        print(f"\n{msg.id} ({msg.sender_name}):")
        print(f"  Flags: {msg.expected_flags}")
        print(f"  Message: {msg.message[:150]}...")
    
    print("\n--- Sample CLEAN messages ---")
    for msg in clean_samples:
        print(f"\n{msg.id} ({msg.sender_name}):")
        print(f"  Message: {msg.message[:150]}...")


if __name__ == "__main__":
    asyncio.run(main())
