"""
pet_engine.py
Office pets, culture moments, and team morale micro-events.
Because the best startups know the dog in the office matters.
"""

import random
from typing import Dict, List, Optional


PETS = [
    {
        "name": "Byte",
        "species": "Dog",
        "breed": "Golden Retriever",
        "personality": "endlessly optimistic, crashes standups",
        "morale_bonus": 8,
        "special_event_probability": 0.3,
        "special_events": [
            "Byte ate someone's lunch. Morale paradoxically went up.",
            "Byte crashed the investor demo by sitting on the laptop. The investor loved it.",
            "Byte greeted every new hire at the door. Retention is up.",
            "Byte fell asleep during the all-hands. Nobody could be stressed anymore.",
        ],
    },
    {
        "name": "Kernel",
        "species": "Cat",
        "breed": "Maine Coon",
        "personality": "judges everyone's code, sits on keyboards",
        "morale_bonus": 6,
        "special_event_probability": 0.25,
        "special_events": [
            "Kernel walked across the keyboard and accidentally pushed to prod. It was fine.",
            "Kernel is staring at the lead engineer. He finds it unsettling.",
            "Kernel sat on the pitch deck printout. The team took it as a sign.",
            "Kernel chose to sit on the founder's laptop during the board call. Nobody commented.",
        ],
    },
    {
        "name": "Pivot",
        "species": "Dog",
        "breed": "Border Collie",
        "personality": "herds engineers toward deadlines, mysteriously aligned with company mission",
        "morale_bonus": 7,
        "special_event_probability": 0.28,
        "special_events": [
            "Pivot herded the product team into the standup without being asked. Leadership noticed.",
            "Pivot has been staring at the roadmap whiteboard for 20 minutes. No one knows why.",
            "Pivot ran laps during the sprint planning session. It set the energy.",
            "Pivot is clearly unhappy with the sprint velocity. She keeps sighing.",
        ],
    },
    {
        "name": "Sigma",
        "species": "Cat",
        "breed": "Scottish Fold",
        "personality": "deceptively wise, occasionally knocks mugs off desks",
        "morale_bonus": 5,
        "special_event_probability": 0.20,
        "special_events": [
            "Sigma knocked over the CEO's coffee onto the burn rate spreadsheet. A new one was made. It looked better.",
            "Sigma sat in the middle of the war room during the crisis. Surprisingly calming.",
            "Sigma has been ignoring the VP of Engineering all week. The team finds this relatable.",
        ],
    },
    {
        "name": "Sprout",
        "species": "Rabbit",
        "breed": "Holland Lop",
        "personality": "unexpectedly calming, beloved by the design team",
        "morale_bonus": 9,
        "special_event_probability": 0.22,
        "special_events": [
            "The design team built a tiny enclosure for Sprout. Morale in that team is now legendary.",
            "Sprout escaped and was found napping on the CFO's chair. The CFO let her stay.",
            "Sprout's social media account has more followers than the company's. Marketing is okay with it.",
        ],
    },
    {
        "name": "Deploy",
        "species": "Dog",
        "breed": "Corgi",
        "personality": "low to the ground but ambitious, attends all standups",
        "morale_bonus": 8,
        "special_event_probability": 0.32,
        "special_events": [
            "Deploy attended the standup. Deploy is the standup now.",
            "Deploy tried to herd the sales team. Sales team needed it.",
            "Deploy fell asleep under the engineering desk. The team works better with him there.",
            "Deploy barked once during the board call. The board laughed. Tension broke.",
        ],
    },
]

CULTURE_EVENTS = [
    {
        "event": "Bring Your Pet to Work Day",
        "effects": {"morale": 12, "productivity": -5, "retention": 5},
        "narrative": "Chaos. Absolute beautiful chaos. Morale is through the roof.",
        "probability": 0.15,
    },
    {
        "event": "Team Lunch Tradition",
        "effects": {"morale": 7, "burn_rate": 0.01},
        "narrative": "Every Thursday, the team eats together. It's a small thing that compounds into culture.",
        "probability": 0.25,
    },
    {
        "event": "Office DJ",
        "effects": {"morale": 5, "productivity": 3},
        "narrative": "Someone started a playlist. Everyone contributes. Codebase productivity mysteriously up 12%.",
        "probability": 0.20,
    },
    {
        "event": "Game Night",
        "effects": {"morale": 10, "burn_rate": 0.01, "retention": 3},
        "narrative": "Friday night Settlers of Catan. The founders lost. Morale remains high.",
        "probability": 0.18,
    },
    {
        "event": "Hackathon Day",
        "effects": {"innovation_score": 8, "morale": 10, "product_quality": 3},
        "narrative": "24-hour hackathon. Two features shipped. One wild idea that might become the next product.",
        "probability": 0.12,
    },
    {
        "event": "Meditation Mondays",
        "effects": {"founder_stress": -5, "morale": 4, "productivity": 3},
        "narrative": "10-minute guided meditation before standup. Ridiculous until it wasn't.",
        "probability": 0.15,
    },
    {
        "event": "Wall of Wins",
        "effects": {"morale": 8, "retention": 4},
        "narrative": "Someone put up a wall of customer love letters. Engineers keep stopping to read them.",
        "probability": 0.20,
    },
    {
        "event": "Friday Demos",
        "effects": {"morale": 9, "innovation_score": 5, "product_quality": 4},
        "narrative": "Weekly demo culture started. Engineers are shipping to impress. The bar is rising.",
        "probability": 0.22,
    },
    {
        "event": "Quiet Hours",
        "effects": {"productivity": 10, "morale": 5},
        "narrative": "10am-12pm: no meetings, no Slack, no interruptions. Output doubled.",
        "probability": 0.18,
    },
]


class PetEngine:

    def __init__(self):
        self._active_pet: Optional[Dict] = None

    def adopt_pet(self, pet_name: Optional[str] = None) -> Dict:
        """Adopt an office pet. Returns the pet profile."""
        if pet_name:
            pet = next((p for p in PETS if p["name"] == pet_name), None)
        else:
            pet = random.choice(PETS)

        self._active_pet = pet
        return {
            "name": pet["name"],
            "species": pet["species"],
            "breed": pet["breed"],
            "personality": pet["personality"],
            "morale_bonus": pet["morale_bonus"],
            "message": f"{pet['name']} the {pet['breed']} has joined the team. Morale is already up.",
        }

    def monthly_pet_event(self, state: Dict) -> Optional[Dict]:
        """
        Maybe the office pet does something this month.
        Returns an event dict or None.
        """
        if not self._active_pet:
            return None

        pet = self._active_pet
        if random.random() < pet["special_event_probability"]:
            event_text = random.choice(pet["special_events"])
            morale_boost = random.uniform(pet["morale_bonus"] * 0.5, pet["morale_bonus"] * 1.5)
            return {
                "type": "pet_event",
                "pet": pet["name"],
                "narrative": event_text,
                "effects": {"morale": morale_boost, "founder_stress": -2},
            }
        return None

    def monthly_culture_event(self, state: Dict) -> Optional[Dict]:
        """Randomly trigger a culture event this month."""
        morale = state.get("morale", 75)

        # More likely to trigger culture events if morale is low (team tries harder)
        morale_adjustment = 1.2 if morale < 50 else 1.0

        for event in CULTURE_EVENTS:
            prob = event["probability"] * morale_adjustment
            if random.random() < prob:
                return {
                    "type": "culture_event",
                    "event": event["event"],
                    "narrative": event["narrative"],
                    "effects": event["effects"],
                }
        return None

    def get_available_pets(self) -> List[Dict]:
        """List all adoptable pets."""
        return [{"name": p["name"], "species": p["species"],
                 "breed": p["breed"], "personality": p["personality"]} for p in PETS]

    def pet_status(self) -> Optional[Dict]:
        """Return current pet status."""
        if not self._active_pet:
            return None
        return {
            "name": self._active_pet["name"],
            "species": self._active_pet["species"],
            "message": f"{self._active_pet['name']} is doing great. The team loves them.",
        }