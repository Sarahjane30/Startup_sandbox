"""
probability_engine.py
Weighted probabilistic outcome resolution.
Nothing is certain. Everything is a roll.
"""

import random
import math
from typing import List, Dict, Any, Tuple, Optional


class ProbabilityEngine:
    """
    Core randomness engine. Handles weighted draws, risk scoring,
    variance injection, and outcome resolution.
    """

    def __init__(self, seed: Optional[int] = None):
        self.rng = random.Random(seed)

    # ── Core weighted draw ────────────────────────────────────

    def weighted_choice(self, outcomes: List[Dict]) -> Dict:
        """
        outcomes: list of dicts with keys:
            - 'label': str
            - 'weight': float (relative probability)
            - 'effects': dict of state changes
            - 'narrative': str
        Returns the chosen outcome dict.
        """
        weights = [max(o.get("weight", 1.0), 0.001) for o in outcomes]
        total = sum(weights)
        r = self.rng.uniform(0, total)
        cumulative = 0.0
        for outcome, w in zip(outcomes, weights):
            cumulative += w
            if r <= cumulative:
                return outcome
        return outcomes[-1]

    def roll(self, probability: float) -> bool:
        """Simple boolean roll. probability in [0,1]."""
        return self.rng.random() < probability

    def gaussian_noise(self, value: float, std_pct: float = 0.1) -> float:
        """Add Gaussian noise to a value. std_pct is fraction of value."""
        std = abs(value) * std_pct
        return value + self.rng.gauss(0, std)

    def clamp(self, value: float, lo: float = 0.0, hi: float = 100.0) -> float:
        return max(lo, min(hi, value))

    # ── Risk scoring ──────────────────────────────────────────

    def compute_risk_score(self, state: Dict) -> float:
        """
        Returns a 0-100 composite risk score from startup state.
        Higher = more dangerous.
        """
        risk = 0.0

        runway = state.get("runway", 10)
        if runway < 3:
            risk += 40
        elif runway < 6:
            risk += 20
        elif runway < 12:
            risk += 10

        morale = state.get("morale", 75)
        risk += (100 - morale) * 0.15

        investor_conf = state.get("investor_confidence", 65)
        risk += (100 - investor_conf) * 0.15

        burn = state.get("burn_rate", 50000)
        revenue = state.get("revenue", 0)
        if burn > 0:
            burn_coverage = revenue / burn
            if burn_coverage < 0.3:
                risk += 15
            elif burn_coverage < 0.7:
                risk += 7

        competition = state.get("competition_pressure", 30)
        risk += competition * 0.10

        founder_stress = state.get("founder_stress", 35)
        risk += founder_stress * 0.10

        return self.clamp(risk, 0, 100)

    # ── Choice outcome resolution ──────────────────────────────

    def resolve_choice(self, choice: Dict, state: Dict) -> Dict:
        """
        Given a choice dict with probabilistic outcomes,
        resolve using weighted draw and state modifiers.
        Returns resolved outcome with applied effects.
        """
        outcomes = choice.get("outcomes", [])
        if not outcomes:
            return {"label": "No effect", "effects": {}, "narrative": "Nothing happened."}

        # Modify weights by startup state context
        risk = self.compute_risk_score(state)
        adjusted = []
        for o in outcomes:
            w = o.get("weight", 1.0)
            sentiment = o.get("sentiment", "neutral")
            if sentiment == "negative" and risk > 60:
                w *= 1.4   # bad things more likely in high-risk startups
            elif sentiment == "positive" and risk < 30:
                w *= 1.3   # good things more likely in healthy startups
            adjusted.append({**o, "weight": w})

        chosen = self.weighted_choice(adjusted)

        # Apply Gaussian noise to numeric effects
        effects = {}
        for k, v in chosen.get("effects", {}).items():
            if isinstance(v, (int, float)):
                effects[k] = self.gaussian_noise(v, std_pct=0.08)
            else:
                effects[k] = v

        return {**chosen, "effects": effects}

    # ── Event probability modifiers ───────────────────────────

    def sector_risk_modifier(self, sector: str) -> float:
        """
        Returns a multiplier for risk events based on sector.
        """
        modifiers = {
            "AI": 0.9,
            "Healthcare": 1.3,
            "Fintech": 1.2,
            "Retail": 1.1,
            "EdTech": 0.95,
            "CleanTech": 1.0,
            "SaaS": 0.85,
            "Marketplace": 1.05,
            "Biotech": 1.4,
            "Cybersecurity": 1.1,
        }
        return modifiers.get(sector, 1.0)

    def founder_archetype_modifier(self, archetype: str, choice_type: str) -> float:
        """
        Certain archetypes are better at certain choices.
        Returns a weight boost for positive outcomes.
        """
        boosts = {
            "Visionary":    {"raise_funding": 1.3, "pivot": 1.2},
            "Operator":     {"reduce_costs": 1.4, "hire": 1.2},
            "Hustler":      {"increase_sales": 1.4, "marketing": 1.3},
            "Engineer":     {"improve_product": 1.4, "reduce_tech_debt": 1.3},
            "Academic":     {"research": 1.4, "regulatory": 1.3},
            "Serial":       {"raise_funding": 1.2, "pivot": 1.3, "acquire": 1.4},
            "Cautious":     {"reduce_costs": 1.3, "reduce_risk": 1.4},
        }
        archetype_map = boosts.get(archetype, {})
        return archetype_map.get(choice_type, 1.0)

    # ── Cascade probability ────────────────────────────────────

    def cascade_trigger(self, event_type: str, state: Dict) -> Optional[str]:
        """
        After a primary event resolves, determine if a cascade event triggers.
        Returns cascade event type string or None.
        """
        cascades = {
            "runway_crisis": [("investor_panic", 0.6), ("layoffs", 0.4)],
            "viral_growth":  [("hiring_surge", 0.5), ("burn_spike", 0.3)],
            "key_hire_left": [("morale_crash", 0.55), ("productivity_dip", 0.45)],
            "funding_round": [("media_attention", 0.4), ("competition_response", 0.3)],
            "product_launch":  [("customer_surge", 0.45), ("bug_crisis", 0.35)],
            "bad_press":     [("investor_concern", 0.5), ("churn_spike", 0.4)],
        }
        risk = self.compute_risk_score(state)
        if event_type not in cascades:
            return None
        options = cascades[event_type]
        for cascade_type, base_prob in options:
            adjusted_prob = base_prob * (1 + risk / 200)
            if self.roll(min(adjusted_prob, 0.95)):
                return cascade_type
        return None

    # ── Survival probability ───────────────────────────────────

    def survival_probability(self, state: Dict) -> float:
        """
        Returns 0-1 probability of startup surviving next 3 months.
        Used as a quick heuristic alongside XGBoost.
        """
        risk = self.compute_risk_score(state)
        runway = state.get("runway", 10)
        morale = state.get("morale", 75)

        base = 1 - (risk / 100)
        runway_factor = math.tanh(runway / 6)
        morale_factor = morale / 100

        prob = base * 0.5 + runway_factor * 0.3 + morale_factor * 0.2
        return round(self.clamp(prob, 0.02, 0.98), 4)