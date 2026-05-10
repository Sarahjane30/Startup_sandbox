"""
startup_agent.py
Core evolving agent representing a startup's full state.
Every variable is a living value that shifts with each decision and month.
"""

import uuid
from dataclasses import dataclass, field
from typing import List, Dict, Any


@dataclass
class StartupAgent:
    # ── Identity ──────────────────────────────────────────────
    startup_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "Unnamed Startup"
    sector: str = "AI"
    stage: str = "Seed"
    tagline: str = ""
    founded_month: int = 1
    current_month: int = 1

    # ── Financials ────────────────────────────────────────────
    funding: float = 500_000.0        # total raised
    cash: float = 500_000.0           # cash in bank
    burn_rate: float = 50_000.0       # monthly burn
    revenue: float = 0.0              # monthly revenue
    mrr_growth: float = 0.0           # month-over-month revenue growth %
    valuation: float = 2_000_000.0
    runway: float = 10.0              # months remaining
    dilution: float = 0.0             # % founder equity sold

    # ── Team ──────────────────────────────────────────────────
    employees: int = 5
    morale: float = 75.0              # 0-100
    retention: float = 85.0           # 0-100
    productivity: float = 70.0        # 0-100

    # ── Market ────────────────────────────────────────────────
    market_share: float = 0.1         # %
    customer_count: int = 0
    churn_rate: float = 5.0           # % per month
    nps: float = 40.0
    competition_pressure: float = 30.0  # 0-100

    # ── Product ───────────────────────────────────────────────
    innovation_score: float = 60.0    # 0-100
    product_quality: float = 55.0     # 0-100
    tech_debt: float = 20.0           # 0-100

    # ── Investor Relations ────────────────────────────────────
    investor_confidence: float = 65.0  # 0-100
    fundraising_difficulty: float = 40.0
    last_raise_month: int = 0

    # ── Founder ───────────────────────────────────────────────
    founder_name: str = "Alex"
    founder_archetype: str = "Visionary"
    founder_stress: float = 35.0      # 0-100
    founder_vision: float = 80.0      # 0-100
    founder_credibility: float = 60.0  # 0-100
    burnout_risk: float = 20.0        # 0-100

    # ── Reputation & Health ───────────────────────────────────
    reputation: float = 50.0          # 0-100
    startup_health: float = 70.0      # 0-100 composite
    press_coverage: float = 10.0      # 0-100
    regulatory_risk: float = 10.0     # 0-100

    # ── Memory System ─────────────────────────────────────────
    decisions_made: List[str] = field(default_factory=list)
    scenarios_seen: List[str] = field(default_factory=list)
    crises_survived: List[str] = field(default_factory=list)
    crises_failed: List[str] = field(default_factory=list)
    investors_met: List[str] = field(default_factory=list)
    pivots_taken: int = 0
    repeated_mistakes: Dict[str, int] = field(default_factory=dict)
    milestone_log: List[Dict] = field(default_factory=list)

    # ── Flags ─────────────────────────────────────────────────
    is_alive: bool = True
    acquisition_offer: float = 0.0
    ipo_ready: bool = False

    def recompute_derived(self):
        """Recalculate derived values after any state change."""
        net_monthly = self.revenue - self.burn_rate
        if net_monthly < 0 and self.burn_rate > 0:
            self.runway = round(self.cash / self.burn_rate, 2)
        elif net_monthly >= 0:
            self.runway = 999.0  # profitable
        else:
            self.runway = 0.0

        self.startup_health = round(
            self.morale * 0.15
            + self.investor_confidence * 0.20
            + self.innovation_score * 0.15
            + self.product_quality * 0.15
            + min(self.runway * 4, 100) * 0.20
            + self.reputation * 0.15,
            2,
        )
        self.startup_health = max(0.0, min(100.0, self.startup_health))

    def record_decision(self, scenario_id: str, choice_key: str):
        entry = f"{scenario_id}:{choice_key}"
        self.decisions_made.append(entry)
        if choice_key in self.repeated_mistakes:
            self.repeated_mistakes[choice_key] += 1
        else:
            self.repeated_mistakes[choice_key] = 1

    def log_milestone(self, month: int, event: str):
        self.milestone_log.append({"month": month, "event": event})

    def advance_stage(self):
        stage_order = ["Idea Stage", "MVP", "Seed", "Series A", "Series B", "Growth", "Scale"]
        if self.stage in stage_order:
            idx = stage_order.index(self.stage)
            if idx < len(stage_order) - 1:
                self.stage = stage_order[idx + 1]
                self.log_milestone(self.current_month, f"Advanced to {self.stage}")

    def to_dict(self) -> Dict[str, Any]:
        import dataclasses
        return dataclasses.asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "StartupAgent":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
