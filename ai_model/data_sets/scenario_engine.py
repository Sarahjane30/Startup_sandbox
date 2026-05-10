"""
scenario_engine.py
Dynamically generates startup scenarios based on current state.
Adapts to sector, stage, health, and memory of past events.
Never repeats the same scenario within a session if it can help it.
"""

import random
import hashlib
from typing import List, Dict, Any, Optional
from startup_agent import StartupAgent
from sector_questions import sector_fallback


# ── Scenario Templates by trigger condition ───────────────────────────────────
# Each scenario has: id, title, narrative, trigger conditions, choices

SCENARIO_LIBRARY = {

    # ── FINANCIAL CRISIS ──────────────────────────────────────
    "runway_crisis": {
        "id": "runway_crisis",
        "title": "Runway Alarm",
        "trigger": lambda s: s.runway < 4,
        "narrative_templates": [
            "Your CFO drops a spreadsheet on your desk. At current burn, you have {runway:.1f} months left. Investors are watching.",
            "The bank balance hit a number that made your stomach drop. {runway:.1f} months. The team doesn't know yet.",
            "Three months of runway. Your lead investor just asked for a board update. You stare at the ceiling at 2am.",
        ],
        "choices": [
            {
                "key": "emergency_cuts",
                "label": "Emergency layoffs — cut burn by 40%",
                "type": "reduce_costs",
                "outcomes": [
                    {"label": "Morale survives", "weight": 0.45, "sentiment": "neutral",
                     "effects": {"burn_rate": -0.40, "morale": -12, "employees": -2, "founder_stress": 8},
                     "narrative": "The cuts hurt. But the team understands. Runway extends. You survive to fight."},
                    {"label": "Mass resignation follows", "weight": 0.30, "sentiment": "negative",
                     "effects": {"burn_rate": -0.25, "morale": -30, "employees": -4, "retention": -20, "founder_stress": 20},
                     "narrative": "Two senior engineers quit within a week. The culture cracked."},
                    {"label": "Clean exit", "weight": 0.25, "sentiment": "positive",
                     "effects": {"burn_rate": -0.42, "morale": -8, "investor_confidence": 5, "founder_stress": 5},
                     "narrative": "You executed the cuts cleanly. Investors actually gain confidence from the discipline."},
                ],
            },
            {
                "key": "bridge_raise",
                "label": "Emergency bridge round — buy 6 months",
                "type": "raise_funding",
                "outcomes": [
                    {"label": "Bridge closes", "weight": 0.40, "sentiment": "positive",
                     "effects": {"cash": 300_000, "investor_confidence": -10, "founder_credibility": -5, "founder_stress": -5},
                     "narrative": "The bridge closes but at punishing terms. You bought time. Use it."},
                    {"label": "Investors pass", "weight": 0.35, "sentiment": "negative",
                     "effects": {"investor_confidence": -20, "founder_stress": 25, "morale": -10},
                     "narrative": "Every investor you call already knows. The term sheets don't come."},
                    {"label": "Angel saves you", "weight": 0.25, "sentiment": "positive",
                     "effects": {"cash": 200_000, "investor_confidence": 5, "founder_stress": -8},
                     "narrative": "An old contact wires money overnight. No term sheet. Just a handshake."},
                ],
            },
            {
                "key": "revenue_sprint",
                "label": "Aggressive revenue sprint — close anything",
                "type": "increase_sales",
                "outcomes": [
                    {"label": "Customers close", "weight": 0.35, "sentiment": "positive",
                     "effects": {"revenue": 30_000, "morale": 8, "founder_stress": 10, "customer_count": 3},
                     "narrative": "Three enterprise deals close under pressure. MRR moves. Runway extends."},
                    {"label": "Bad deals bite back", "weight": 0.40, "sentiment": "negative",
                     "effects": {"revenue": 15_000, "churn_rate": 8, "reputation": -8, "founder_stress": 15},
                     "narrative": "You close bad-fit customers. They churn in 60 days. You bought time, not growth."},
                    {"label": "Pipeline collapses", "weight": 0.25, "sentiment": "negative",
                     "effects": {"founder_stress": 20, "morale": -15, "investor_confidence": -12},
                     "narrative": "The sprint burns the team. Deals slip. Nothing closes."},
                ],
            },
        ],
        "sector_variants": {
            "AI": "GPU bills are eating your runway alive. $80k/month in compute alone.",
            "Healthcare": "The FDA review is burning cash faster than anticipated.",
            "Fintech": "Compliance costs and banking licenses are decimating your runway.",
        },
    },

    # ── HIGH BURN RATE ──────────────────────────────────────
    "burn_spike": {
        "id": "burn_spike",
        "title": "Burn Rate Shock",
        "trigger": lambda s: s.burn_rate > s.revenue * 3 and s.runway < 8,
        "narrative_templates": [
            "Your burn rate jumped 40% this month. You're spending $1 for every $0.30 you earn. The board noticed.",
            "Monthly expenses hit a new high. The infrastructure costs alone are terrifying. Revenue hasn't caught up.",
        ],
        "choices": [
            {
                "key": "reduce_hiring",
                "label": "Freeze all hiring immediately",
                "type": "reduce_costs",
                "outcomes": [
                    {"label": "Burn stabilizes", "weight": 0.55, "sentiment": "positive",
                     "effects": {"burn_rate": -0.15, "morale": -5, "investor_confidence": 8},
                     "narrative": "Hiring freeze slows the bleeding. Investors respect the discipline."},
                    {"label": "Team frustration", "weight": 0.45, "sentiment": "negative",
                     "effects": {"burn_rate": -0.12, "morale": -18, "retention": -10},
                     "narrative": "Promised hires don't happen. Three people who were waiting leave."},
                ],
            },
            {
                "key": "raise_prices",
                "label": "Increase prices on existing customers",
                "type": "increase_revenue",
                "outcomes": [
                    {"label": "Revenue jump", "weight": 0.40, "sentiment": "positive",
                     "effects": {"revenue": 0.25, "churn_rate": 3, "nps": -8},
                     "narrative": "Most customers accept the increase. Revenue climbs. Churn ticks up."},
                    {"label": "Churn wave", "weight": 0.35, "sentiment": "negative",
                     "effects": {"revenue": -0.10, "churn_rate": 15, "reputation": -12},
                     "narrative": "Six customers cancel immediately. The move backfired."},
                    {"label": "Mixed signals", "weight": 0.25, "sentiment": "neutral",
                     "effects": {"revenue": 0.08, "churn_rate": 6, "nps": -5},
                     "narrative": "A messy outcome. Some stay, some leave. You break even on the move."},
                ],
            },
        ],
    },

    # ── MORALE COLLAPSE ────────────────────────────────────────
    "morale_crash": {
        "id": "morale_crash",
        "title": "Culture Fracture",
        "trigger": lambda s: s.morale < 40,
        "narrative_templates": [
            "The office is quiet in a bad way. Slack messages go unanswered for hours. Two engineers have already updated their LinkedIn.",
            "Your best engineer pulls you aside. 'People are looking around,' she says. You already knew.",
        ],
        "choices": [
            {
                "key": "offsites_bonuses",
                "label": "Company offsite + spot bonuses",
                "type": "culture_invest",
                "outcomes": [
                    {"label": "Culture rebounds", "weight": 0.50, "sentiment": "positive",
                     "effects": {"morale": 20, "retention": 10, "burn_rate": 0.05, "founder_stress": -5},
                     "narrative": "Three days off-site and real conversations. The team remembers why they joined."},
                    {"label": "Temporary sugar", "weight": 0.35, "sentiment": "neutral",
                     "effects": {"morale": 8, "burn_rate": 0.05},
                     "narrative": "Good vibes last two weeks. Morale ticks up but the root problem remains."},
                    {"label": "Seen through", "weight": 0.15, "sentiment": "negative",
                     "effects": {"morale": -5, "retention": -10, "burn_rate": 0.05},
                     "narrative": "The team sees through it. 'They took us to Cabo before they fire us.' Two people resign."},
                ],
            },
            {
                "key": "address_root_cause",
                "label": "Hold a brutal all-hands — radical transparency",
                "type": "culture_invest",
                "outcomes": [
                    {"label": "Team rallies", "weight": 0.45, "sentiment": "positive",
                     "effects": {"morale": 25, "founder_credibility": 10, "retention": 8},
                     "narrative": "Real talk. People cry. People clap. The founder's credibility skyrockets."},
                    {"label": "Too much truth", "weight": 0.30, "sentiment": "negative",
                     "effects": {"morale": 5, "retention": -15, "investor_confidence": -10},
                     "narrative": "The transparency spooked three senior engineers. They had options. They left."},
                    {"label": "Polarising", "weight": 0.25, "sentiment": "neutral",
                     "effects": {"morale": 12, "retention": -5, "founder_credibility": 5},
                     "narrative": "Half the team is reinvigorated. Half quietly update their CVs."},
                ],
            },
        ],
    },

    # ── HIGH INNOVATION REWARD ─────────────────────────────────
    "viral_growth": {
        "id": "viral_growth",
        "title": "Viral Moment",
        "trigger": lambda s: s.innovation_score > 75 and s.press_coverage > 40,
        "narrative_templates": [
            "A tweet thread about your product has 4 million impressions overnight. Sign-ups are crashing your servers.",
            "TechCrunch just published: '{name} is the startup nobody knew they needed.' Your inbox is on fire.",
        ],
        "choices": [
            {
                "key": "scale_infra",
                "label": "Emergency infrastructure scaling — don't drop a user",
                "type": "improve_product",
                "outcomes": [
                    {"label": "Flawless scaling", "weight": 0.45, "sentiment": "positive",
                     "effects": {"customer_count": 500, "burn_rate": 0.20, "reputation": 15, "investor_confidence": 15},
                     "narrative": "Site stays up. Users stream in. You're on the right side of a viral moment."},
                    {"label": "Partial outage", "weight": 0.35, "sentiment": "neutral",
                     "effects": {"customer_count": 200, "reputation": -5, "burn_rate": 0.15},
                     "narrative": "30 minutes of downtime during peak traffic. You capture 40% of what you could have."},
                    {"label": "Site collapses", "weight": 0.20, "sentiment": "negative",
                     "effects": {"reputation": -20, "nps": -15, "morale": -10},
                     "narrative": "Server dies. The moment passes. Screenshots of error pages go viral instead."},
                ],
            },
            {
                "key": "fundraise_now",
                "label": "Use the momentum to close a round immediately",
                "type": "raise_funding",
                "outcomes": [
                    {"label": "Hot round", "weight": 0.55, "sentiment": "positive",
                     "effects": {"cash": 2_000_000, "valuation": 1.5, "investor_confidence": 20, "morale": 15},
                     "narrative": "You close a round in 10 days. Oversubscribed. Best terms you've ever seen."},
                    {"label": "FOMO doesn't convert", "weight": 0.45, "sentiment": "neutral",
                     "effects": {"cash": 500_000, "investor_confidence": 5},
                     "narrative": "Investors are interested but cautious. A small bridge closes. Not the big round you hoped."},
                ],
            },
        ],
    },

    # ── COFOUNDER CONFLICT ──────────────────────────────────────
    "cofounder_conflict": {
        "id": "cofounder_conflict",
        "title": "Cofounder War",
        "trigger": lambda s: s.morale < 50 and s.founder_stress > 60,
        "narrative_templates": [
            "Your cofounder wants to pivot. You don't. The WhatsApp thread has 140 messages. None of them are polite.",
            "The disagreement about strategy has been building for months. Today it exploded in a board call.",
        ],
        "choices": [
            {
                "key": "buyout",
                "label": "Buy out the cofounder — go solo",
                "type": "restructure",
                "outcomes": [
                    {"label": "Clean break", "weight": 0.40, "sentiment": "neutral",
                     "effects": {"cash": -150_000, "morale": 10, "founder_stress": -10, "investor_confidence": -8},
                     "narrative": "The buyout is painful but clean. You own the vision now. Investors have questions."},
                    {"label": "PR disaster", "weight": 0.35, "sentiment": "negative",
                     "effects": {"reputation": -20, "investor_confidence": -20, "morale": -15, "founder_stress": 20},
                     "narrative": "The cofounder tweets. Vaguely. But everyone knows. It's not good."},
                    {"label": "Energising", "weight": 0.25, "sentiment": "positive",
                     "effects": {"morale": 15, "founder_vision": 10, "productivity": 10, "founder_stress": -15},
                     "narrative": "The team exhales. The tension was poisoning everything. You move fast alone."},
                ],
            },
            {
                "key": "mediation",
                "label": "Hire a startup therapist / board mediator",
                "type": "restructure",
                "outcomes": [
                    {"label": "Alignment found", "weight": 0.45, "sentiment": "positive",
                     "effects": {"morale": 12, "founder_stress": -12, "productivity": 8},
                     "narrative": "Three sessions. Brutal honesty. You find a workable equilibrium."},
                    {"label": "Irreconcilable", "weight": 0.35, "sentiment": "negative",
                     "effects": {"founder_stress": 15, "morale": -10, "productivity": -15},
                     "narrative": "The mediator makes it worse. You both dig in harder."},
                    {"label": "Superficial fix", "weight": 0.20, "sentiment": "neutral",
                     "effects": {"founder_stress": -5, "morale": 5},
                     "narrative": "You agree to disagree. The problem festers quietly."},
                ],
            },
        ],
    },

    # ── SECTOR: AI ──────────────────────────────────────────────
    "gpu_shortage": {
        "id": "gpu_shortage",
        "title": "GPU Famine",
        "trigger": lambda s: s.sector == "AI" and s.burn_rate > 30_000,
        "narrative_templates": [
            "Your cloud compute bill tripled. There's a global GPU shortage and your training jobs are queued behind Fortune 500 companies.",
        ],
        "choices": [
            {
                "key": "optimize_model",
                "label": "Invest in model compression and optimization",
                "type": "improve_product",
                "outcomes": [
                    {"label": "Efficiency win", "weight": 0.50, "sentiment": "positive",
                     "effects": {"burn_rate": -0.25, "innovation_score": 8, "tech_debt": 5},
                     "narrative": "Your team ships a 3x faster model. Compute costs crater. Competitors notice."},
                    {"label": "Marginal gains", "weight": 0.35, "sentiment": "neutral",
                     "effects": {"burn_rate": -0.10, "tech_debt": 3},
                     "narrative": "Some optimizations work. Costs drop 10%. Not the moonshot you needed."},
                    {"label": "Wasted sprint", "weight": 0.15, "sentiment": "negative",
                     "effects": {"burn_rate": 0.05, "morale": -10, "tech_debt": 10},
                     "narrative": "Three weeks of work, negligible gains, and growing technical debt."},
                ],
            },
            {
                "key": "switch_provider",
                "label": "Migrate to alternative cloud provider",
                "type": "reduce_costs",
                "outcomes": [
                    {"label": "Smooth migration", "weight": 0.35, "sentiment": "positive",
                     "effects": {"burn_rate": -0.20, "morale": 5},
                     "narrative": "Migration completes in two weeks. Costs drop significantly."},
                    {"label": "Migration nightmare", "weight": 0.40, "sentiment": "negative",
                     "effects": {"burn_rate": 0.15, "tech_debt": 15, "morale": -12, "founder_stress": 15},
                     "narrative": "Two weeks becomes eight. Compatibility issues everywhere. Bills pile up."},
                    {"label": "Locked in worse", "weight": 0.25, "sentiment": "negative",
                     "effects": {"burn_rate": 0.05, "fundraising_difficulty": 5},
                     "narrative": "New provider seemed cheaper. Hidden fees emerge month two."},
                ],
            },
        ],
    },

    # ── SECTOR: HEALTHCARE ─────────────────────────────────────
    "fda_review": {
        "id": "fda_review",
        "title": "Regulatory Storm",
        "trigger": lambda s: s.sector == "Healthcare" and s.regulatory_risk > 30,
        "narrative_templates": [
            "The FDA has formally requested additional documentation on your clinical data. Your legal bill just doubled.",
        ],
        "choices": [
            {
                "key": "full_compliance",
                "label": "Full compliance push — hire regulatory specialist",
                "type": "regulatory",
                "outcomes": [
                    {"label": "Cleared", "weight": 0.50, "sentiment": "positive",
                     "effects": {"regulatory_risk": -20, "cash": -80_000, "reputation": 15, "investor_confidence": 10},
                     "narrative": "Eighteen months of work validates. The clearance opens enterprise healthcare deals."},
                    {"label": "More questions", "weight": 0.30, "sentiment": "neutral",
                     "effects": {"regulatory_risk": -5, "cash": -80_000, "burn_rate": 0.10},
                     "narrative": "Compliance cleared some flags. New ones appeared. The process continues."},
                    {"label": "Rejected", "weight": 0.20, "sentiment": "negative",
                     "effects": {"regulatory_risk": 20, "reputation": -25, "investor_confidence": -20},
                     "narrative": "Rejection. Catastrophic for trust. The press coverage is damaging."},
                ],
            },
            {
                "key": "pivot_b2b",
                "label": "Pivot to B2B software to avoid direct FDA scrutiny",
                "type": "pivot",
                "outcomes": [
                    {"label": "Smart escape", "weight": 0.45, "sentiment": "positive",
                     "effects": {"regulatory_risk": -25, "revenue": 15_000, "pivots_taken": 1, "morale": -5},
                     "narrative": "You restructure as a data analytics platform. Regulatory pressure drops."},
                    {"label": "Market doesn't buy it", "weight": 0.35, "sentiment": "negative",
                     "effects": {"customer_count": -5, "revenue": -10_000, "pivots_taken": 1, "morale": -15},
                     "narrative": "The pivot confuses everyone. Your healthcare customers leave. B2B isn't convinced."},
                ],
            },
        ],
    },

    # ── INVESTOR OPPORTUNITY ───────────────────────────────────
    "acquisition_offer": {
        "id": "acquisition_offer",
        "title": "The Offer",
        "trigger": lambda s: s.startup_health > 65 and s.current_month > 18,
        "narrative_templates": [
            "A BigCo's M&A team emails. Subject: 'Exploratory conversation.' You know what this means.",
            "An offer arrives. ${valuation}M. Cash. Your investors are very interested.",
        ],
        "choices": [
            {
                "key": "accept",
                "label": "Accept the acquisition",
                "type": "acquire",
                "outcomes": [
                    {"label": "Clean exit", "weight": 0.70, "sentiment": "positive",
                     "effects": {"acquisition_offer": 1.0, "is_alive": False},
                     "narrative": "You sign. Founders get life-changing money. Some team members get to keep building inside a bigger machine."},
                    {"label": "Deal falls apart", "weight": 0.30, "sentiment": "negative",
                     "effects": {"investor_confidence": -15, "morale": -10, "reputation": -5},
                     "narrative": "Due diligence reveals something they don't like. The deal collapses in week six."},
                ],
            },
            {
                "key": "decline",
                "label": "Decline — hold out for more",
                "type": "fundraising",
                "outcomes": [
                    {"label": "Better offer comes", "weight": 0.30, "sentiment": "positive",
                     "effects": {"valuation": 1.4, "investor_confidence": 15, "founder_credibility": 10},
                     "narrative": "Word gets out you turned down an offer. Two more companies call within a month."},
                    {"label": "Offer was the peak", "weight": 0.45, "sentiment": "negative",
                     "effects": {"investor_confidence": -10, "morale": -8},
                     "narrative": "Nothing else comes. You told yourself you'd get more. The window closed."},
                    {"label": "Neutral — keep building", "weight": 0.25, "sentiment": "neutral",
                     "effects": {"morale": 5, "founder_vision": 8},
                     "narrative": "You decline and get back to work. The team respects it."},
                ],
            },
        ],
    },

    # ── KEY HIRE OPPORTUNITY ───────────────────────────────────
    "star_hire": {
        "id": "star_hire",
        "title": "The Dream Hire",
        "trigger": lambda s: s.revenue > 50_000 and s.employees < 20,
        "narrative_templates": [
            "A VP of Engineering from a FAANG company just DMed you. She's open to joining. Her current package is $380k.",
        ],
        "choices": [
            {
                "key": "hire_equity",
                "label": "Offer equity-heavy package — stretch the salary",
                "type": "hire",
                "outcomes": [
                    {"label": "She joins", "weight": 0.50, "sentiment": "positive",
                     "effects": {"innovation_score": 15, "product_quality": 12, "burn_rate": 0.12, "morale": 10, "employees": 1},
                     "narrative": "She joins. Within 60 days the engineering culture transforms. Worth every dollar."},
                    {"label": "Counteroffer accepted", "weight": 0.30, "sentiment": "neutral",
                     "effects": {"morale": -5, "founder_stress": 5},
                     "narrative": "Her employer matched. She apologizes. You respect it."},
                    {"label": "Toxic fit", "weight": 0.20, "sentiment": "negative",
                     "effects": {"morale": -15, "burn_rate": 0.12, "employees": 1, "retention": -8},
                     "narrative": "She joins, but her FAANG habits clash with startup speed. Team tension rises."},
                ],
            },
            {
                "key": "pass",
                "label": "Can't afford it — pass",
                "type": "reduce_costs",
                "outcomes": [
                    {"label": "Good decision", "weight": 0.55, "sentiment": "neutral",
                     "effects": {"founder_stress": 3},
                     "narrative": "You pass. Hard call. The right one for now."},
                    {"label": "She joins a competitor", "weight": 0.45, "sentiment": "negative",
                     "effects": {"competition_pressure": 12, "morale": -5},
                     "narrative": "She joins your biggest competitor. In six months you feel it in the product."},
                ],
            },
        ],
    },

    # ── GENERAL: PRODUCT LAUNCH ─────────────────────────────────
    "product_launch": {
        "id": "product_launch",
        "title": "Launch Day",
        "trigger": lambda s: s.product_quality > 60 and s.current_month % 6 == 0,
        "narrative_templates": [
            "After months of building, your new feature is ready. The team is exhausted but proud. Launch day.",
        ],
        "choices": [
            {
                "key": "big_launch",
                "label": "Go big — PR, Product Hunt, influencer push",
                "type": "marketing",
                "outcomes": [
                    {"label": "Viral launch", "weight": 0.30, "sentiment": "positive",
                     "effects": {"customer_count": 300, "press_coverage": 20, "burn_rate": 0.10, "morale": 15},
                     "narrative": "#1 on Product Hunt. 300 signups in 24 hours. The team is buzzing."},
                    {"label": "Solid launch", "weight": 0.45, "sentiment": "positive",
                     "effects": {"customer_count": 80, "press_coverage": 8, "burn_rate": 0.07},
                     "narrative": "Good coverage, solid signups. Not viral but meaningful growth."},
                    {"label": "Whimper", "weight": 0.25, "sentiment": "negative",
                     "effects": {"morale": -12, "burn_rate": 0.08, "founder_stress": 10},
                     "narrative": "The launch lands quietly. The team put everything in. The market shrugged."},
                ],
            },
            {
                "key": "soft_launch",
                "label": "Soft launch — test with existing customers first",
                "type": "improve_product",
                "outcomes": [
                    {"label": "Great feedback", "weight": 0.55, "sentiment": "positive",
                     "effects": {"product_quality": 8, "nps": 10, "customer_count": 20},
                     "narrative": "Feedback is gold. You ship three improvements before the public launch."},
                    {"label": "Muted response", "weight": 0.45, "sentiment": "neutral",
                     "effects": {"product_quality": 3, "nps": 2},
                     "narrative": "Customers are okay with it. Nothing to write home about."},
                ],
            },
        ],
    },
}


class ScenarioEngine:
    def __init__(self):
        self.library = SCENARIO_LIBRARY

    def get_eligible_scenarios(self, agent: StartupAgent, max_count: int = 4) -> List[Dict]:
        """
        Filter and rank scenarios by:
        1. Trigger condition matches current state
        2. Not recently seen
        3. Sector match prioritised
        """
        state = agent.__dict__
        eligible = []

        for sid, scenario in self.library.items():
            trigger_fn = scenario.get("trigger")
            try:
                if trigger_fn and not trigger_fn(agent):
                    continue
            except Exception:
                continue

            # Avoid repeating recent scenarios
            recent_seen = agent.scenarios_seen[-6:]
            if sid in recent_seen:
                continue

            score = self._relevance_score(agent, scenario)
            eligible.append((score, sid, scenario))

        eligible.sort(reverse=True, key=lambda x: x[0])
        return [s for _, _, s in eligible[:max_count]]

    def pick_scenario(self, agent: StartupAgent) -> Optional[Dict]:
        """Pick the single most relevant scenario right now."""
        eligible = self.get_eligible_scenarios(agent, max_count=5)
        if not eligible:
            return self._fallback_scenario(agent)

        # Weighted random among top eligible
        weights = list(range(len(eligible), 0, -1))
        total = sum(weights)
        r = random.uniform(0, total)
        cumulative = 0
        for w, scenario in zip(weights, eligible):
            cumulative += w
            if r <= cumulative:
                agent.scenarios_seen.append(scenario["id"])
                return self._render_scenario(scenario, agent)

        agent.scenarios_seen.append(eligible[0]["id"])
        return self._render_scenario(eligible[0], agent)

    def _render_scenario(self, scenario: Dict, agent: StartupAgent) -> Dict:
        """Fill narrative templates with real state values."""
        templates = scenario.get("narrative_templates", ["Something happened."])
        template = random.choice(templates)

        # Fill template variables
        try:
            narrative = template.format(
                name=agent.name,
                runway=agent.runway,
                valuation=f"{agent.valuation / 1_000_000:.1f}",
                sector=agent.sector,
                stage=agent.stage,
                burn=f"{agent.burn_rate:,.0f}",
                cash=f"{agent.cash:,.0f}",
            )
        except Exception:
            narrative = template

        # Inject sector-specific flavour
        sector_extra = scenario.get("sector_variants", {}).get(agent.sector, "")
        if sector_extra:
            narrative = f"{narrative} {sector_extra}"

        return {
            "id": scenario["id"],
            "title": scenario["title"],
            "narrative": narrative,
            "choices": scenario["choices"],
            "sector": agent.sector,
            "month": agent.current_month,
        }

    def _relevance_score(self, agent: StartupAgent, scenario: Dict) -> float:
        """Score how relevant a scenario is right now."""
        score = random.uniform(0.1, 1.0)  # base randomness

        sid = scenario["id"]

        # Amplify by urgency
        if "crisis" in sid and agent.runway < 4:
            score += 3.0
        if "morale" in sid and agent.morale < 40:
            score += 2.5
        if "burn" in sid and agent.burn_rate > agent.revenue * 2:
            score += 2.0
        if "viral" in sid and agent.innovation_score > 80:
            score += 2.0
        if "acquisition" in sid and agent.startup_health > 70:
            score += 1.5

        # Sector bonus
        sector_map = {
            "gpu_shortage": "AI",
            "fda_review": "Healthcare",
        }
        if sector_map.get(sid) == agent.sector:
            score += 2.0

        return score

    def _fallback_scenario(self, agent: StartupAgent) -> Dict:
        """Generic scenario when nothing else fits."""
        return sector_fallback(agent)
