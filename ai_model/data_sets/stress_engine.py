"""
stress_engine.py
Founder stress, burnout trajectory, and team morale dynamics.
Stress compounds. Burnout is a slow death. Recovery takes longer than the fall.
"""

import random
import math
from typing import Dict, Optional


BURNOUT_STAGES = [
    {"threshold": 0,  "label": "Energised",     "description": "You're in the zone. Clear thinking, high output."},
    {"threshold": 30, "label": "Stretched",      "description": "Long days, but still functioning. Watch the signs."},
    {"threshold": 55, "label": "Strained",       "description": "Decision quality dropping. Sleep is optional, apparently."},
    {"threshold": 72, "label": "Burned",         "description": "Operating on fumes. Things are slipping through the cracks."},
    {"threshold": 88, "label": "Critical",       "description": "The startup is suffering from you being in this state."},
    {"threshold": 97, "label": "Collapse",       "description": "You can't function. Everything stops."},
]

RELIEF_ACTIVITIES = {
    "meditation":     {"stress_delta": -8,  "cost": 0,      "narrative": "An hour of silence. You forgot what quiet felt like."},
    "co_founder_chat":{"stress_delta": -6,  "cost": 0,      "narrative": "Real talk with your cofounder. Not about the startup."},
    "investor_win":   {"stress_delta": -12, "cost": 0,      "narrative": "A round closing feels like oxygen."},
    "holiday":        {"stress_delta": -18, "cost": 2000,   "narrative": "Four days off. You remember what you're building this for."},
    "therapy":        {"stress_delta": -10, "cost": 500,    "narrative": "Talking helps more than you expected."},
    "product_win":    {"stress_delta": -9,  "cost": 0,      "narrative": "Seeing users love what you built resets something."},
    "team_party":     {"stress_delta": -7,  "cost": 3000,   "narrative": "A night off together. The team laughs. You do too."},
    "exercise":       {"stress_delta": -5,  "cost": 0,      "narrative": "An hour running. Problems are smaller after."},
}

STRESS_AMPLIFIERS = {
    "runway_crisis":       15,
    "investor_rejection":  10,
    "key_hire_resigned":   12,
    "cofounder_conflict":  18,
    "product_failure":     8,
    "bad_press":           7,
    "regulatory_setback":  10,
    "churn_spike":         6,
    "board_pressure":      9,
}

STRESS_RELIEVERS = {
    "successful_launch":   -10,
    "funding_closed":      -12,
    "revenue_milestone":   -9,
    "team_win":            -6,
    "acquisition_inquiry": -7,
    "good_press":          -5,
}


class StressEngine:

    def monthly_tick(self, state: Dict) -> Dict:
        """
        Passive monthly stress drift based on startup conditions.
        Returns effects dict with updates to founder_stress, morale, burnout_risk.
        """
        effects = {}
        stress = state.get("founder_stress", 35)
        morale = state.get("morale", 75)
        runway = state.get("runway", 10)
        revenue = state.get("revenue", 0)
        burn = state.get("burn_rate", 50000)

        stress_delta = 0.0

        # Financial pressure
        if runway < 3:
            stress_delta += random.uniform(5, 12)
        elif runway < 6:
            stress_delta += random.uniform(2, 5)
        elif runway > 12:
            stress_delta -= random.uniform(1, 3)

        # Team pressure
        if morale < 40:
            stress_delta += random.uniform(4, 8)
        elif morale > 80:
            stress_delta -= random.uniform(1, 3)

        # Revenue relief
        if revenue > burn:
            stress_delta -= random.uniform(2, 5)
        elif revenue < burn * 0.2:
            stress_delta += random.uniform(2, 4)

        # Natural random fluctuation
        stress_delta += random.gauss(0, 2.0)

        new_stress = max(0, min(100, stress + stress_delta))
        burnout_risk = self._compute_burnout_risk(new_stress, state.get("burnout_risk", 20))
        morale_delta = self._stress_morale_contagion(new_stress, morale)

        effects["founder_stress"] = stress_delta
        effects["burnout_risk"] = burnout_risk - state.get("burnout_risk", 20)
        effects["morale"] = morale_delta
        effects["productivity"] = self._stress_productivity_impact(new_stress)

        return effects

    def stress_from_choice(self, choice_type: str, current_stress: float, sentiment: str) -> float:
        """
        Compute new absolute stress value after a decision resolves.
        """
        base_delta = 0.0

        type_stress_map = {
            "raise_funding":   5,
            "reduce_costs":    8,
            "restructure":     10,
            "pivot":           12,
            "culture_invest":  -3,
            "improve_product": 2,
            "increase_sales":  6,
            "marketing":       4,
            "hire":            3,
            "regulatory":      9,
        }

        base_delta += type_stress_map.get(choice_type, 3)

        # Outcome sentiment adjusts
        if sentiment == "negative":
            base_delta += random.uniform(5, 12)
        elif sentiment == "positive":
            base_delta -= random.uniform(3, 8)

        new_stress = max(0, min(100, current_stress + base_delta))
        return new_stress

    def get_burnout_stage(self, stress: float) -> Dict:
        """Return the current burnout stage label and description."""
        stage = BURNOUT_STAGES[0]
        for s in BURNOUT_STAGES:
            if stress >= s["threshold"]:
                stage = s
        return stage

    def relief_event(self, activity: str, current_stress: float) -> Dict:
        """
        Apply a stress relief activity.
        Returns new stress, narrative, and cost.
        """
        activity_data = RELIEF_ACTIVITIES.get(activity, RELIEF_ACTIVITIES["exercise"])
        delta = activity_data["stress_delta"] * random.uniform(0.8, 1.2)
        new_stress = max(0, min(100, current_stress + delta))
        return {
            "activity": activity,
            "stress_before": current_stress,
            "stress_after": new_stress,
            "delta": delta,
            "cost": activity_data["cost"],
            "narrative": activity_data["narrative"],
        }

    def trigger_stress_event(self, event_type: str, current_stress: float) -> float:
        """Apply a named stress event. Returns new stress value."""
        delta = STRESS_AMPLIFIERS.get(event_type, 5) * random.uniform(0.8, 1.4)
        return max(0, min(100, current_stress + delta))

    def trigger_relief_event(self, event_type: str, current_stress: float) -> float:
        """Apply a named relief event. Returns new stress value."""
        delta = STRESS_RELIEVERS.get(event_type, -5) * random.uniform(0.8, 1.3)
        return max(0, min(100, current_stress + delta))

    def generate_burnout_warning(self, stress: float) -> Optional[str]:
        """Return a warning message if stress is dangerously high."""
        if stress >= 97:
            return "You've collapsed. You can't run a startup from this state. Something has to give."
        if stress >= 88:
            return "You're running on empty. Your decisions are suffering. The team can see it."
        if stress >= 72:
            return "Burnout is no longer a risk — it's your current state. When did you last sleep properly?"
        if stress >= 55:
            return "You're stretched thin. Small cracks are appearing in your judgment."
        return None

    # ── Internal helpers ───────────────────────────────────────

    def _compute_burnout_risk(self, stress: float, current_risk: float) -> float:
        """Burnout risk accumulates with sustained high stress."""
        if stress > 70:
            risk_delta = (stress - 70) * 0.3
        elif stress < 40:
            risk_delta = -2.0
        else:
            risk_delta = 0.2

        new_risk = current_risk + risk_delta + random.gauss(0, 0.5)
        return max(0, min(100, new_risk))

    def _stress_morale_contagion(self, founder_stress: float, team_morale: float) -> float:
        """
        High founder stress spreads to the team.
        Returns a morale delta.
        """
        if founder_stress > 75:
            contagion = -random.uniform(2, 5)
        elif founder_stress > 55:
            contagion = -random.uniform(0.5, 2)
        elif founder_stress < 30:
            contagion = random.uniform(0.5, 1.5)
        else:
            contagion = random.gauss(0, 0.5)
        return contagion

    def _stress_productivity_impact(self, stress: float) -> float:
        """
        Compute productivity delta from stress level.
        Moderate stress slightly helps. High stress destroys.
        """
        if stress < 30:
            return random.uniform(1, 3)      # calm = slightly productive
        elif stress < 55:
            return random.uniform(-1, 2)     # mild stress = neutral
        elif stress < 72:
            return random.uniform(-5, -1)    # strained
        elif stress < 88:
            return random.uniform(-10, -5)   # burned
        else:
            return random.uniform(-20, -12)  # collapse
        