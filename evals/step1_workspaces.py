"""Step 1: Generate all workspaces with personas and custom coaching flags in a single call."""

import asyncio
import json
import random

from pydantic import BaseModel

from config import (
    NUM_WORKSPACES,
    NUM_PEOPLE_MIN,
    NUM_PEOPLE_MAX,
    STEP1_OUTPUT,
    ensure_data_dir,
    get_client,
    get_random_temperature,
)


class CoachingFlag(BaseModel):
    name: str
    description: str


class Person(BaseModel):
    id: str
    name: str
    role: str
    ethnicity: str
    native_language: str
    personality: str
    communication_style: str
    coaching_flags: list[CoachingFlag]
    flag_rationale: str


class Workspace(BaseModel):
    id: str
    name: str
    type: str
    description: str
    culture: str
    company_size: str
    location_context: str
    people: list[Person]
    target_user_id: str


WORKSPACE_GENERATION_PROMPT = """You are generating synthetic data for testing a Slack communication coaching app.

Generate {num_workspaces} UNIQUE Slack workspaces. Each workspace must be distinctly different.

CRITICAL UNIQUENESS REQUIREMENTS:
- Every person across ALL workspaces must have a GLOBALLY UNIQUE name (no name can appear twice)
- Every workspace must have a DIFFERENT industry/type (maximize diversity, no repeats)
- Avoid cliché combinations (e.g., stressed startup engineer, generic tech PM)

FORCED DIVERSITY - The {num_workspaces} workspaces MUST include:
- At least 2 non-US cultural/geographic contexts (e.g., European, Asian, Latin American, African companies)
- At least 1 non-corporate setting (academia, government agency, creative studio, NGO)
- At least 3 different company sizes: startup (<50), mid-size (50-500), enterprise (500+)
- Mix of: remote-first, hybrid, and in-office cultures
- Industries should span: tech, healthcare, finance, education, creative, manufacturing, retail, legal, etc.

FOR EACH WORKSPACE:
1. Company/org name (realistic, not generic)
2. Type/industry (unique across all workspaces)
3. Brief description of what they do
4. Workplace culture (communication norms, pace, formality)
5. Company size: "startup", "mid-size", or "enterprise"
6. Location context: primary country/region and remote policy

FOR EACH PERSON ({num_people_min}-{num_people_max} per workspace):
1. Full name - culturally appropriate to their background, GLOBALLY UNIQUE
2. Job role in this organization
3. Ethnicity/cultural background (diverse within each workspace)
4. Native language (not everyone's first language is English)
5. Personality traits (2-3 sentences - work style, quirks, NOT stereotypes)
6. Communication style - how they write Slack messages:
   - Include native language tendencies for non-native English speakers
   - Note if they use emojis, formal/casual tone, verbose/terse
7. 3-5 CUSTOM coaching flags specific to THIS person:
   - Based on their personality + role + cultural background
   - Examples: "Overuse of Hedging Language", "Missing Context in Requests", 
     "Passive-Aggressive Tone", "Grammar: Subject-Verb Agreement", 
     "Wall of Text Without Structure", "Excessive Jargon", "Unclear Action Items"
   - Each flag needs a clear description
8. Flag rationale: Why this person specifically needs these flags

PERSONA DEPTH VARIATION - Not everyone is a senior employee:
- Include some: new hires, contractors, part-time staff, interns
- Vary English fluency levels for non-native speakers
- Some people are introverts who write minimally, others are verbose

Respond with valid JSON:
{{
  "workspaces": [
    {{
      "name": "Company Name",
      "type": "unique industry type",
      "description": "what the org does",
      "culture": "workplace culture description",
      "company_size": "startup|mid-size|enterprise",
      "location_context": "Country/region, remote policy",
      "people": [
        {{
          "name": "Globally Unique Full Name",
          "role": "Job Title",
          "ethnicity": "Cultural Background",
          "native_language": "Their first language",
          "personality": "Detailed personality description",
          "communication_style": "How they write messages + native language influence",
          "coaching_flags": [
            {{"name": "Flag Name", "description": "What this flag means"}}
          ],
          "flag_rationale": "Why this person needs these flags"
        }}
      ]
    }}
  ]
}}"""


async def generate_all_workspaces() -> list[Workspace]:
    """Generate all workspaces in a single LLM call."""
    client = get_client()
    
    prompt = WORKSPACE_GENERATION_PROMPT.format(
        num_workspaces=NUM_WORKSPACES,
        num_people_min=NUM_PEOPLE_MIN,
        num_people_max=NUM_PEOPLE_MAX,
    )
    
    response = await client.chat.completions.create(
        model="gpt-5.2",
        messages=[
            {
                "role": "system",
                "content": "You are a synthetic data generator creating diverse, realistic workplace scenarios. Always respond with valid JSON only, no markdown or explanation. Be creative and avoid clichés.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=get_random_temperature(),
        response_format={"type": "json_object"},
    )
    
    data = json.loads(response.choices[0].message.content)
    
    workspaces = []
    for ws_idx, ws_data in enumerate(data["workspaces"]):
        workspace_id = f"ws_{ws_idx + 1:03d}"
        
        # Add IDs to people
        for p_idx, person in enumerate(ws_data["people"]):
            person["id"] = f"{workspace_id}_p_{p_idx:02d}"
        
        # Randomly select target user
        target_user_id = random.choice(ws_data["people"])["id"]
        
        workspaces.append(
            Workspace(
                id=workspace_id,
                name=ws_data["name"],
                type=ws_data["type"],
                description=ws_data["description"],
                culture=ws_data["culture"],
                company_size=ws_data.get("company_size", "mid-size"),
                location_context=ws_data.get("location_context", "US, hybrid"),
                people=[
                    Person(
                        id=p["id"],
                        name=p["name"],
                        role=p["role"],
                        ethnicity=p["ethnicity"],
                        native_language=p.get("native_language", "English"),
                        personality=p["personality"],
                        communication_style=p["communication_style"],
                        coaching_flags=[CoachingFlag(**f) for f in p["coaching_flags"]],
                        flag_rationale=p["flag_rationale"],
                    )
                    for p in ws_data["people"]
                ],
                target_user_id=target_user_id,
            )
        )
    
    return workspaces


def save_workspaces(workspaces: list[Workspace]):
    """Save workspaces to JSON file."""
    ensure_data_dir()
    
    data = [w.model_dump() for w in workspaces]
    
    with open(STEP1_OUTPUT, "w") as f:
        json.dump(data, f, indent=2)
    
    print(f"Saved {len(workspaces)} workspaces to {STEP1_OUTPUT}")


def load_workspaces() -> list[Workspace]:
    """Load workspaces from JSON file."""
    with open(STEP1_OUTPUT) as f:
        data = json.load(f)
    return [Workspace(**w) for w in data]


async def main():
    """Run step 1: Generate workspaces."""
    print("Step 1: Generating all workspaces with personas (single call)...")
    workspaces = await generate_all_workspaces()
    save_workspaces(workspaces)
    
    # Print summary
    print(f"\nGenerated {len(workspaces)} workspaces:")
    for ws in workspaces:
        target = next(p for p in ws.people if p.id == ws.target_user_id)
        print(f"\n{ws.id}: {ws.name}")
        print(f"  Type: {ws.type} | Size: {ws.company_size} | Location: {ws.location_context}")
        print(f"  Target user: {target.name} ({target.native_language}) - {target.role}")
        print(f"  Flags: {[f.name for f in target.coaching_flags]}")


if __name__ == "__main__":
    asyncio.run(main())
