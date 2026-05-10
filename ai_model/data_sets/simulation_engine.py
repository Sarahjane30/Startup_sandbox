"""
simulation_engine.py
Master orchestrator. Advances simulation time, applies decisions,
coordinates all engines, and maintains the evolving startup state.
"""

import json
import copy
import random
from typing import Dict, Any, Optional, List

from startup_agent import StartupAgent
from probability_engine import ProbabilityEngine
from scenario_engine import ScenarioEngine
from founder_engine import FounderEngine
from investor_engine import InvestorEngine
from stress_engine import StressEngine


class SimulationEngine:

    def __init__(self, agent: StartupAgent):
        self.agent = agent
        self.prob = ProbabilityEngine()
        self.scenario_eng = ScenarioEngine()
        self.founder_eng = FounderEngine(agent.founder_archetype, agent.founder_name)
        self.investor_eng = InvestorEngine()
        self.stress_eng = StressEngine()

    # ── Monthly tick ──────────────────────────────────────────

    def tick(self) -> Dict:
        """
        Advance one simulation month.
        Returns full state snapshot + generated scenario + any cascades.
        """
        agent = self.agent
        agent.current_month += 1

        # 1. Apply passive monthly dynamics
        self._apply_passive_dynamics()

        # 2. Investor reactions
        investor_update = self.investor_eng.monthly_update(agent.__dict__)
        self._merge_effects(investor_update)

        # 3. Stress system update
        stress_update = self.stress_eng.monthly_tick(agent.__dict__)
        self._merge_effects(stress_update)

        # 4. Recompute derived values
        agent.recompute_derived()

        # 5. Check death / win conditions
        outcome = self._check_conditions()
        if outcome:
            return {"status": outcome, "state": agent.to_dict()}

        # 6. Generate next scenario
        scenario = self.scenario_eng.pick_scenario(agent)

        return {
            "status": "alive",
            "month": agent.current_month,
            "state": agent.to_dict(),
            "scenario": scenario,
            "risk_score": self.prob.compute_risk_score(agent.__dict__),
            "survival_probability": self.prob.survival_probability(agent.__dict__),
        }

    # ── Decision resolution ───────────────────────────────────

    def resolve_decision(self, scenario_id: str, choice_key: str, choices: List[Dict]) -> Dict:
        """
        Player submits a choice. Resolve probabilistically.
        Apply effects. Possibly trigger cascade event.
        Returns updated state + narrative + cascade if any.
        """
        agent = self.agent

        # Find chosen option
        chosen_choice = next((c for c in choices if c["key"] == choice_key), None)
        if not chosen_choice:
            return {"error": "Invalid choice key"}

        # Record decision memory
        agent.record_decision(scenario_id, choice_key)

        # Resolve outcome
        resolved = self.prob.resolve_choice(chosen_choice, agent.__dict__)

        # Apply founder archetype modifiers
        modified_effects = self.founder_eng.apply_archetype_modifiers(resolved.get("effects", {}))

        # Apply stress from choice type
        choice_type = chosen_choice.get("type", "")
        new_stress = self.stress_eng.stress_from_choice(
            choice_type, agent.founder_stress, resolved.get("sentiment", "neutral")
        )
        modified_effects["founder_stress"] = new_stress - agent.founder_stress

        # Apply all effects to agent
        self._apply_effects(modified_effects)

        # Recompute after effects
        agent.recompute_derived()

        # Check for cascade events
        cascade = self.prob.cascade_trigger(scenario_id, agent.__dict__)
        cascade_scenario = None
        if cascade:
            cascade_scenario = self.scenario_eng._fallback_scenario(agent)
            cascade_scenario["title"] = f"Cascade: {cascade.replace('_', ' ').title()}"

        return {
            "status": "resolved",
            "choice_made": choice_key,
            "outcome_label": resolved.get("label", ""),
            "narrative": resolved.get("narrative", ""),
            "sentiment": resolved.get("sentiment", "neutral"),
            "effects_applied": modified_effects,
            "cascade": cascade_scenario,
            "state": agent.to_dict(),
            "risk_score": self.prob.compute_risk_score(agent.__dict__),
            "survival_probability": self.prob.survival_probability(agent.__dict__),
        }

    # ── Passive monthly dynamics ──────────────────────────────

    def _apply_passive_dynamics(self):
        """
        Natural drift that happens every month regardless of choices.
        Markets move, churn happens, competition grows.
        """
        a = self.agent

        # Revenue: organic growth + churn drag
        growth_factor = 1 + (a.mrr_growth / 100) * random.uniform(0.7, 1.3)
        churn_drag = 1 - (a.churn_rate / 100)
        a.revenue = max(0, a.revenue * growth_factor * churn_drag)

        # Cash: subtract burn, add revenue
        net = a.revenue - a.burn_rate
        a.cash = max(0, a.cash + net)

        # Customers: natural churn + organic signups
        organic_signups = int(a.customer_count * (a.mrr_growth / 100) * random.uniform(0.5, 1.5))
        churned = int(a.customer_count * (a.churn_rate / 100))
        a.customer_count = max(0, a.customer_count + organic_signups - churned)

        # Market: competition pressure drifts up over time
        a.competition_pressure = min(100, a.competition_pressure + random.uniform(-1, 2.5))

        # Tech debt accumulates slowly without dedicated sprints
        if a.tech_debt < 80:
            a.tech_debt = min(100, a.tech_debt + random.uniform(0.5, 2.0))

        # Innovation score decays without R&D
        a.innovation_score = max(10, a.innovation_score - random.uniform(0.3, 1.5))

        # Morale: small random drift
        a.morale = max(5, min(100, a.morale + random.gauss(0, 2.5)))

        # Reputation: slow drift toward 50 (mean-reversion)
        a.reputation += (50 - a.reputation) * 0.02 + random.gauss(0, 1.5)
        a.reputation = max(0, min(100, a.reputation))

        # Valuation: tracks revenue * multiple with lag
        if a.revenue > 0:
            target_valuation = a.revenue * 12 * random.uniform(5, 15)
            a.valuation = a.valuation * 0.85 + target_valuation * 0.15

    # ── Effect application ────────────────────────────────────

    def _apply_effects(self, effects: Dict):
        """Apply a dict of effects to the agent. Handles both absolute and relative changes."""
        a = self.agent
        CLAMP_0_100 = {
            "morale", "retention", "investor_confidence", "founder_stress",
            "innovation_score", "product_quality", "tech_debt", "reputation",
            "startup_health", "press_coverage", "regulatory_risk",
            "competition_pressure", "founder_vision", "founder_credibility",
            "burnout_risk", "productivity", "fundraising_difficulty",
            "dilution",
        }

        for key, value in effects.items():
            if not hasattr(a, key):
                continue
            current = getattr(a, key)

            if isinstance(value, float) and abs(value) < 2.0 and key in {"burn_rate", "revenue", "valuation"}:
                # Treat as relative multiplier for large financial values
                new_val = current * (1 + value)
            elif isinstance(value, bool):
                new_val = value
            else:
                new_val = current + value

            if key in CLAMP_0_100:
                new_val = max(0.0, min(100.0, float(new_val)))
            elif key in {"cash", "funding", "revenue", "valuation", "customer_count", "employees", "burn_rate"}:
                new_val = max(0.0, float(new_val))

            setattr(a, key, new_val)

    def _merge_effects(self, effect_dict: Dict):
        """Same as _apply_effects but from engine update dicts."""
        self._apply_effects(effect_dict)

    # ── Win / loss conditions ─────────────────────────────────

    def _check_conditions(self) -> Optional[str]:
        a = self.agent

        if a.cash <= 0 and a.revenue < a.burn_rate * 0.1:
            a.is_alive = False
            a.log_milestone(a.current_month, "Startup died — ran out of money")
            return "dead_cash"

        if a.morale < 8 and a.employees < 2:
            a.is_alive = False
            a.log_milestone(a.current_month, "Startup died — team dissolved")
            return "dead_morale"

        if a.founder_stress >= 99:
            a.is_alive = False
            a.log_milestone(a.current_month, "Founder burned out — startup abandoned")
            return "dead_burnout"

        if a.acquisition_offer > 0 and not a.is_alive:
            return "acquired"

        if a.revenue > a.burn_rate * 2 and a.current_month > 36:
            a.log_milestone(a.current_month, "Reached profitability milestone")
            if a.startup_health > 80:
                a.ipo_ready = True
                return "ipo_candidate"

        return None

    # ── State persistence ─────────────────────────────────────

    def save_state(self, filepath: str):
        with open(filepath, "w") as f:
            json.dump(self.agent.to_dict(), f, indent=2, default=str)

    @classmethod
    def load_state(cls, filepath: str) -> "SimulationEngine":
        with open(filepath) as f:
            data = json.load(f)
        agent = StartupAgent.from_dict(data)
        return cls(agent)

    def get_summary(self) -> Dict:
        """Return a rich summary snapshot for the frontend dashboard."""
        a = self.agent
        return {
            "name": a.name,
            "sector": a.sector,
            "stage": a.stage,
            "month": a.current_month,
            "health": round(a.startup_health, 1),
            "runway": round(a.runway, 1),
            "cash": round(a.cash, 0),
            "burn_rate": round(a.burn_rate, 0),
            "revenue": round(a.revenue, 0),
            "valuation": round(a.valuation, 0),
            "morale": round(a.morale, 1),
            "founder_stress": round(a.founder_stress, 1),
            "investor_confidence": round(a.investor_confidence, 1),
            "innovation_score": round(a.innovation_score, 1),
            "survival_probability": self.prob.survival_probability(a.__dict__),
            "risk_score": self.prob.compute_risk_score(a.__dict__),
            "milestone_log": a.milestone_log[-5:],
            "decisions_count": len(a.decisions_made),
        }
