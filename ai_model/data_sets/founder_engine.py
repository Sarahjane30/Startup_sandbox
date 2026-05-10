"""
founder_engine.py
Founder personality archetypes, trait systems, and decision modifiers.
Different founders play differently. Same decision, different consequences.
"""

import random
from typing import Dict, List, Any, Optional


ARCHETYPES = {
    "Visionary": {
        "description": "Dreams big, sells the future, sometimes ignores the present.",
        "traits": {"risk_tolerance": 0.8, "fundraising_bonus": 0.25, "ops_penalty": -0.15, "pivot_bonus": 0.2},
        "stress_triggers": ["low_innovation", "copycat_competitor"],
        "stress_relief": ["big_vision_moment", "media_feature"],
        "quotes": [
            "We're not building a product, we're building the future.",
            "The market doesn't know it needs this yet. That's our advantage.",
            "Every empire started with a crazy idea.",
        ],
        "weaknesses": ["ignores burn rate", "over-promises to investors"],
    },
    "Operator": {
        "description": "Runs a tight ship. Numbers-driven. Process-obsessed.",
        "traits": {"risk_tolerance": 0.4, "ops_bonus": 0.3, "fundraising_penalty": -0.1, "efficiency_bonus": 0.25},
        "stress_triggers": ["chaotic_growth", "bad_metrics"],
        "stress_relief": ["process_win", "cost_reduction"],
        "quotes": [
            "Culture eats strategy for breakfast, but metrics eat culture.",
            "If you can't measure it, you can't manage it.",
            "Slow is smooth, smooth is fast.",
        ],
        "weaknesses": ["moves too slowly", "under-invests in vision"],
    },
    "Hustler": {
        "description": "Never stops selling. Relationships are currency.",
        "traits": {"risk_tolerance": 0.65, "sales_bonus": 0.35, "product_penalty": -0.15, "network_bonus": 0.3},
        "stress_triggers": ["slow_sales", "losing_deal"],
        "stress_relief": ["big_deal_closed", "new_partnership"],
        "quotes": [
            "Deals don't close themselves.",
            "Every no is just a not yet.",
            "I'd sell sand in a desert and ice in Antarctica.",
        ],
        "weaknesses": ["over-promises features", "neglects product quality"],
    },
    "Engineer": {
        "description": "Builds perfect products. Perfectionism can be a bug.",
        "traits": {"risk_tolerance": 0.45, "product_bonus": 0.35, "sales_penalty": -0.2, "tech_debt_resistance": 0.3},
        "stress_triggers": ["tech_debt_spike", "rushed_launch"],
        "stress_relief": ["clean_code_moment", "product_milestone"],
        "quotes": [
            "We ship when it's ready, not when investors want it.",
            "Technical debt is just future regret.",
            "Good code is its own documentation.",
        ],
        "weaknesses": ["slow to market", "dismisses non-technical concerns"],
    },
    "Academic": {
        "description": "Research-first. Deep expertise. Slow but thorough.",
        "traits": {"risk_tolerance": 0.35, "innovation_bonus": 0.3, "speed_penalty": -0.25, "credibility_bonus": 0.25},
        "stress_triggers": ["pressure_to_ship", "competitor_wins"],
        "stress_relief": ["patent_filed", "research_validation"],
        "quotes": [
            "The literature on this is clear. We are years ahead.",
            "We need more data before we decide.",
            "Peer review isn't just for science.",
        ],
        "weaknesses": ["analysis paralysis", "poor product intuition"],
    },
    "Serial": {
        "description": "Been here before. Pattern-matches quickly. Connected.",
        "traits": {"risk_tolerance": 0.7, "fundraising_bonus": 0.35, "pivot_bonus": 0.3, "network_bonus": 0.4},
        "stress_triggers": ["repeating_past_mistakes"],
        "stress_relief": ["exit_signal", "mentoring_moment"],
        "quotes": [
            "I've seen this pattern before. Here's what happens next.",
            "My last company died at this exact runway. Not this time.",
            "The second startup is never the same as the first.",
        ],
        "weaknesses": ["overconfident", "may phone it in"],
    },
    "Cautious": {
        "description": "Risk-averse. Capital-efficient. Slower growth but longer runway.",
        "traits": {"risk_tolerance": 0.25, "burn_reduction": 0.2, "growth_penalty": -0.15, "survival_bonus": 0.3},
        "stress_triggers": ["forced_risk", "competitor_speed"],
        "stress_relief": ["long_runway", "profitable_month"],
        "quotes": [
            "Default alive. Always.",
            "I'd rather grow 20% slower and still be here in 3 years.",
            "Cash is oxygen. Never forget it.",
        ],
        "weaknesses": ["under-invests in growth", "loses to aggressive competitors"],
    },
}


def get_archetype(name: str) -> Dict:
    return ARCHETYPES.get(name, ARCHETYPES["Visionary"])


def random_archetype() -> str:
    return random.choice(list(ARCHETYPES.keys()))


class FounderEngine:
    def __init__(self, archetype: str = "Visionary", founder_name: str = "Alex"):
        self.archetype_name = archetype
        self.archetype = get_archetype(archetype)
        self.founder_name = founder_name

    def get_trait_modifier(self, trait_key: str) -> float:
        """Return a trait multiplier for a given action type."""
        return self.archetype["traits"].get(trait_key, 0.0)

    def apply_archetype_modifiers(self, base_effects: Dict[str, float]) -> Dict[str, float]:
        """
        Adjust outcome magnitudes based on founder archetype.
        A Hustler's marketing decisions hit harder. An Operator's cost cuts go deeper.
        """
        traits = self.archetype["traits"]
        modified = dict(base_effects)

        # Revenue / sales effects
        if "revenue" in modified:
            modified["revenue"] *= (1 + traits.get("sales_bonus", 0))

        # Burn / efficiency effects
        if "burn_rate" in modified and modified["burn_rate"] < 0:
            modified["burn_rate"] *= (1 - traits.get("burn_reduction", 0))

        # Innovation / product
        if "innovation_score" in modified:
            modified["innovation_score"] *= (1 + traits.get("product_bonus", 0) + traits.get("innovation_bonus", 0))

        # Investor confidence
        if "investor_confidence" in modified:
            modified["investor_confidence"] *= (1 + traits.get("fundraising_bonus", 0))

        # Stress amplification for weak spots
        if "founder_stress" in modified:
            risk_tol = traits.get("risk_tolerance", 0.5)
            stress_multiplier = 1 + (0.5 - risk_tol)  # low tolerance → more stress
            if modified["founder_stress"] > 0:
                modified["founder_stress"] *= max(0.5, stress_multiplier)

        return modified

    def stress_event(self, event_type: str, current_stress: float) -> float:
        """
        Return updated stress level after an event.
        Stress triggers amplify; stress relievers dampen.
        """
        triggers = self.archetype.get("stress_triggers", [])
        relief = self.archetype.get("stress_relief", [])

        if event_type in triggers:
            delta = random.uniform(8, 18)
        elif event_type in relief:
            delta = -random.uniform(6, 14)
        else:
            delta = random.uniform(-3, 5)

        return max(0.0, min(100.0, current_stress + delta))

    def get_quote(self) -> str:
        """Return a random archetype quote."""
        quotes = self.archetype.get("quotes", ["Keep going."])
        return random.choice(quotes)

    def describe_weakness(self) -> str:
        weaknesses = self.archetype.get("weaknesses", [])
        return random.choice(weaknesses) if weaknesses else "No identified weakness."

    def generate_founder_profile(self) -> Dict:
        return {
            "name": self.founder_name,
            "archetype": self.archetype_name,
            "description": self.archetype["description"],
            "traits": self.archetype["traits"],
            "current_quote": self.get_quote(),
            "weakness": self.describe_weakness(),
        }

    def pivot_willingness(self, morale: float, runway: float) -> float:
        """
        How willing is this founder to pivot given current state?
        Returns 0-1 probability.
        """
        base = self.archetype["traits"].get("pivot_bonus", 0.0) + 0.3
        urgency = max(0, (6 - runway) / 6)    # runway pressure
        morale_factor = (100 - morale) / 100  # low morale → more desperate
        return min(0.95, base + urgency * 0.3 + morale_factor * 0.2)

    def fundraising_effectiveness(self, investor_confidence: float, stage: str) -> float:
        """
        Returns a 0-1 score for how effective a fundraise attempt will be.
        """
        stage_difficulty = {
            "Idea Stage": 0.3, "MVP": 0.45, "Seed": 0.55,
            "Series A": 0.6, "Series B": 0.65, "Growth": 0.7,
        }
        base = stage_difficulty.get(stage, 0.5)
        conf_factor = investor_confidence / 100
        archetype_bonus = self.archetype["traits"].get("fundraising_bonus", 0.0)
        return min(0.95, base * 0.4 + conf_factor * 0.4 + archetype_bonus * 0.2)