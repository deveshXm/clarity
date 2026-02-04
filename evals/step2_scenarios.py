"""Step 2: Generate conversation scenarios for each workspace."""

import asyncio
import json

from pydantic import BaseModel

from config import (
    NUM_SCENARIOS_PER_WORKSPACE,
    STEP2_OUTPUT,
    ensure_data_dir,
    get_client,
    get_random_temperature,
)
from step1_workspaces import Workspace, load_workspaces


class Scenario(BaseModel):
    id: str
    workspace_id: str
    target_user_id: str
    scenario_type: str
    context: str
    recipient_ids: list[str]
    recipient_names: list[str]
    target_flags: list[str]
    emotional_state: str
    urgency_level: str
    additional_constraint: str
    should_flag: bool  # False for ~30% of scenarios (clean messages)


class WorkspaceScenarios(BaseModel):
    workspace_id: str
    workspace_name: str
    target_user_name: str
    scenarios: list[Scenario]


SCENARIO_GENERATION_PROMPT = """You are generating synthetic conversation scenarios for testing a Slack communication coaching app.

WORKSPACE CONTEXT:
- Name: {workspace_name}
- Type: {workspace_type}
- Description: {workspace_description}
- Culture: {workspace_culture}
- Size: {workspace_size}
- Location: {workspace_location}

PEOPLE IN THIS WORKSPACE:
{people_details}

TARGET USER FOR ASSESSMENT:
- Name: {target_user_name}
- Role: {target_user_role}
- Native Language: {target_native_language}
- Personality: {target_user_personality}
- Communication Style: {target_user_communication_style}
- Coaching Flags: {target_user_flags}

Generate {num_scenarios} DIVERSE conversation scenarios where {target_user_name} would send a Slack message.

CRITICAL: EXACTLY 3 scenarios must have should_flag: false
- These represent times when the person communicates WELL (good day, clear thinking, took time to write)
- The other 7 scenarios have should_flag: true (person makes communication mistakes)

SCENARIO TYPE ENFORCEMENT:
- Must cover at least 7 DIFFERENT scenario types from: request for help, status update, announcement, feedback/critique, escalation, question, deadline reminder, apology, delegation, brainstorming, pushback/disagreement, celebration/praise, onboarding question, cross-team coordination, incident response, meeting follow-up
- No more than 2 scenarios can share the same scenario type

EMOTIONAL STATE VARIETY:
- No more than 2 scenarios can share the same emotional state
- Include variety: stressed, confident, frustrated, excited, anxious, tired, impatient, embarrassed, focused, overwhelmed, relieved, uncertain, irritated, cautious, rushed

UNUSUAL CONTEXTS - Include at least 2 of these:
- Time zone challenges (early morning/late night for someone)
- Cultural misunderstanding or cross-cultural communication
- External stakeholder involvement (client, vendor, partner)
- Humor/sarcasm that might not land well
- Post-incident or crisis context
- First week at job / new to team
- Covering for someone else
- Personal life affecting work communication

DO NOT use cliché scenarios like:
- Generic "quick question" or "meeting follow-up"
- Obvious deadline pressure situations
- Standard status update requests

FOR EACH SCENARIO:
1. Scenario Type (from diverse list above)
2. Context - what happened before (1-2 sentences, specific and interesting)
3. Recipients - who will receive this message
4. Target Flags - which 1-3 of the user's coaching flags this will violate (empty if should_flag=false)
5. Emotional State - how the sender feels (varied across scenarios)
6. Urgency Level - low, medium, high, critical
7. Additional Constraint - situational factor affecting communication
8. should_flag - true (violates flags) or false (clean message)

Respond with valid JSON:
{{
  "scenarios": [
    {{
      "scenario_type": "type",
      "context": "specific context",
      "recipient_names": ["Name1"],
      "target_flags": ["Flag Name 1"],
      "emotional_state": "state",
      "urgency_level": "low/medium/high/critical",
      "additional_constraint": "situational factor",
      "should_flag": true
    }}
  ]
}}"""


def format_people_details(workspace: Workspace, target_user_id: str) -> str:
    """Format people details for the prompt."""
    lines = []
    for person in workspace.people:
        marker = " (TARGET USER)" if person.id == target_user_id else ""
        lines.append(f"- {person.name}{marker}: {person.role}")
        lines.append(f"  Native language: {person.native_language}")
        lines.append(f"  Personality: {person.personality}")
    return "\n".join(lines)


def format_target_flags(workspace: Workspace, target_user_id: str) -> str:
    """Format target user's flags for the prompt."""
    target = next(p for p in workspace.people if p.id == target_user_id)
    return "\n".join(
        f"  - {flag.name}: {flag.description}" for flag in target.coaching_flags
    )


async def generate_scenarios_for_workspace(
    client, workspace: Workspace
) -> WorkspaceScenarios:
    """Generate scenarios for a single workspace."""
    target = next(p for p in workspace.people if p.id == workspace.target_user_id)
    
    prompt = SCENARIO_GENERATION_PROMPT.format(
        workspace_name=workspace.name,
        workspace_type=workspace.type,
        workspace_description=workspace.description,
        workspace_culture=workspace.culture,
        workspace_size=workspace.company_size,
        workspace_location=workspace.location_context,
        people_details=format_people_details(workspace, workspace.target_user_id),
        target_user_name=target.name,
        target_user_role=target.role,
        target_native_language=target.native_language,
        target_user_personality=target.personality,
        target_user_communication_style=target.communication_style,
        target_user_flags=format_target_flags(workspace, workspace.target_user_id),
        num_scenarios=NUM_SCENARIOS_PER_WORKSPACE,
    )
    
    response = await client.chat.completions.create(
        model="gpt-5.2",
        messages=[
            {
                "role": "system",
                "content": "You are a synthetic data generator creating diverse, realistic workplace scenarios. Always respond with valid JSON only. Be creative and avoid clichés. Ensure exactly 3 scenarios have should_flag: false.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=get_random_temperature(),
        response_format={"type": "json_object"},
    )
    
    data = json.loads(response.choices[0].message.content)
    
    # Build recipient ID mapping
    name_to_id = {p.name: p.id for p in workspace.people}
    
    scenarios = []
    for i, scenario_data in enumerate(data["scenarios"]):
        # Map recipient names to IDs
        recipient_ids = []
        for name in scenario_data["recipient_names"]:
            if name.lower() == "channel":
                recipient_ids.append("channel")
            elif name in name_to_id:
                recipient_ids.append(name_to_id[name])
            else:
                fallback = next(
                    (p.id for p in workspace.people if p.id != workspace.target_user_id),
                    "channel",
                )
                recipient_ids.append(fallback)
        
        # For should_flag=false scenarios, target_flags should be empty
        should_flag = scenario_data.get("should_flag", True)
        target_flags = scenario_data.get("target_flags", []) if should_flag else []
        
        scenarios.append(
            Scenario(
                id=f"{workspace.id}_sc_{i:02d}",
                workspace_id=workspace.id,
                target_user_id=workspace.target_user_id,
                scenario_type=scenario_data["scenario_type"],
                context=scenario_data["context"],
                recipient_ids=recipient_ids,
                recipient_names=scenario_data["recipient_names"],
                target_flags=target_flags,
                emotional_state=scenario_data["emotional_state"],
                urgency_level=scenario_data["urgency_level"],
                additional_constraint=scenario_data["additional_constraint"],
                should_flag=should_flag,
            )
        )
    
    return WorkspaceScenarios(
        workspace_id=workspace.id,
        workspace_name=workspace.name,
        target_user_name=target.name,
        scenarios=scenarios,
    )


async def generate_all_scenarios(
    workspaces: list[Workspace],
) -> list[WorkspaceScenarios]:
    """Generate scenarios for all workspaces concurrently."""
    client = get_client()
    
    tasks = [generate_scenarios_for_workspace(client, ws) for ws in workspaces]
    results = await asyncio.gather(*tasks)
    
    return list(results)


def save_scenarios(all_scenarios: list[WorkspaceScenarios]):
    """Save scenarios to JSON file."""
    ensure_data_dir()
    
    data = [ws.model_dump() for ws in all_scenarios]
    
    with open(STEP2_OUTPUT, "w") as f:
        json.dump(data, f, indent=2)
    
    # Count flagged vs clean
    total_flagged = sum(
        1 for ws in all_scenarios for sc in ws.scenarios if sc.should_flag
    )
    total_clean = sum(
        1 for ws in all_scenarios for sc in ws.scenarios if not sc.should_flag
    )
    
    print(f"Saved scenarios for {len(all_scenarios)} workspaces to {STEP2_OUTPUT}")
    print(f"  Flagged scenarios: {total_flagged}")
    print(f"  Clean scenarios: {total_clean}")


def load_scenarios() -> list[WorkspaceScenarios]:
    """Load scenarios from JSON file."""
    with open(STEP2_OUTPUT) as f:
        data = json.load(f)
    return [WorkspaceScenarios(**ws) for ws in data]


async def main():
    """Run step 2: Generate scenarios."""
    print("Step 2: Generating scenarios for each workspace...")
    
    workspaces = load_workspaces()
    print(f"Loaded {len(workspaces)} workspaces")
    
    all_scenarios = await generate_all_scenarios(workspaces)
    save_scenarios(all_scenarios)
    
    # Print summary
    for ws_scenarios in all_scenarios:
        flagged = sum(1 for sc in ws_scenarios.scenarios if sc.should_flag)
        clean = sum(1 for sc in ws_scenarios.scenarios if not sc.should_flag)
        print(f"\n{ws_scenarios.workspace_id}: {ws_scenarios.workspace_name}")
        print(f"  Target: {ws_scenarios.target_user_name}")
        print(f"  Scenarios: {flagged} flagged, {clean} clean")


if __name__ == "__main__":
    asyncio.run(main())
