"""
investor_engine.py
Investor personalities, funding behaviour, confidence modelling,
and investor relationship tracking. Investors remember everything.
"""

import random
from typing import Dict, List, Optional


INVESTOR_PERSONAS = {
    "Tiger": {
        "name": "Marcus Venti / Tiger Capital",
        "style": "Aggressive growth investor. Moves fast, cuts fast.",
        "confidence_threshold": 55,
        "check_size_range": (500_000, 3_000_000),
        "patience": 0.3,         # low = impatient
        "risk_tolerance": 0.8,
        "red_flags": ["burn_rate_high", "morale_collapse", "slow_growth"],
        "green_flags": ["viral_growth", "strong_revenue", "media_attention"],
        "email_tone": "aggressive",
    },
    "Thoughtful": {
        "name": "Dr. Priya Mehta / Horizon Ventures",
        "style": "Patient, metrics-driven. Wants to see unit economics.",
        "confidence_threshold": 65,
        "check_size_range": (250_000, 1_500_000),
        "patience": 0.8,
        "risk_tolerance": 0.4,
        "red_flags": ["tech_debt_high", "no_revenue", "regulatory_risk"],
        "green_flags": ["product_quality", "strong_nps", "profitability"],
        "email_tone": "analytical",
    },
    "FOMO": {
        "name": "Jake Russo / Momentum Fund",
        "style": "Chases hype. First in if there's buzz. First out if there isn't.",
        "confidence_threshold": 45,
        "check_size_range": (100_000, 2_000_000),
        "patience": 0.2,
        "risk_tolerance": 0.9,
        "red_flags": ["no_press_coverage", "low_innovation"],
        "green_flags": ["viral_moment", "media_feature", "product_launch"],
        "email_tone": "excited",
    },
    "Angel": {
        "name": "Sofia Chen / Independent Angel",
        "style": "Bets on founders, not metrics. High conviction, small checks.",
        "confidence_threshold": 50,
        "check_size_range": (25_000, 250_000),
        "patience": 0.9,
        "risk_tolerance": 0.6,
        "red_flags": ["founder_burnout", "cofounder_conflict"],
        "green_flags": ["founder_vision", "resilience", "team_quality"],
        "email_tone": "warm",
    },
    "Corporate": {
        "name": "Nexus Ventures (CVC arm)",
        "style": "Strategic investor. Wants synergies. Slow process.",
        "confidence_threshold": 70,
        "check_size_range": (1_000_000, 10_000_000),
        "patience": 0.6,
        "risk_tolerance": 0.3,
        "red_flags": ["regulatory_risk", "no_enterprise_customers", "pivot"],
        "green_flags": ["b2b_revenue", "partnerships", "stable_team"],
        "email_tone": "corporate",
    },
}

EMAIL_TEMPLATES = {
    "aggressive": {
        "positive": [
            "The metrics look strong. Let's talk term sheet this week.",
            "We're in if you can close by end of month. No games.",
            "Growth rate is what we need. We want to lead this round.",
        ],
        "concerned": [
            "Burn is concerning. We need to see a path to efficiency before we commit.",
            "Revenue growth needs to inflect. Call me when it does.",
            "We're watching closely. Don't waste this window.",
        ],
        "negative": [
            "We're going to pass for now. The unit economics don't work for us.",
            "Runway is too tight. Come back post-bridge.",
        ],
    },
    "analytical": {
        "positive": [
            "The cohort retention data is encouraging. We'd like to do a deeper dive.",
            "Unit economics are moving in the right direction. Let's schedule a follow-up.",
            "NPS above 50 is meaningful. We'd like to understand the product roadmap.",
        ],
        "concerned": [
            "We're seeing some churn signals that need explanation.",
            "Tech debt at this stage is a yellow flag for us. What's the plan?",
            "Revenue growth is solid but CAC needs to come down.",
        ],
        "negative": [
            "After careful analysis, the LTV/CAC ratio doesn't support our return thesis.",
            "We'll monitor and reconnect in Q2.",
        ],
    },
    "excited": {
        "positive": [
            "Saw the Product Hunt launch — incredible! We want to be part of this.",
            "The Twitter buzz is real. Can we jump on a call TODAY?",
            "Everyone in our portfolio is talking about you. We want in.",
        ],
        "concerned": [
            "Hype seems to be cooling a bit — what's the plan to reignite?",
            "Coverage has dropped off. What's the next big moment?",
        ],
        "negative": [
            "The momentum seems to have stalled. We'll check back when things pick up.",
            "We're going to sit this one out.",
        ],
    },
    "warm": {
        "positive": [
            "I believe in you and the team. Let's talk numbers this week.",
            "Watching your resilience has been inspiring. I want to support this.",
            "The founder-market fit here is obvious. I'm in.",
        ],
        "concerned": [
            "Are you okay? The stress is showing and I want to make sure you're good.",
            "The team morale piece worries me. Good founders take care of their people.",
        ],
        "negative": [
            "This isn't the right time for me, but I'm rooting for you.",
        ],
    },
    "corporate": {
        "positive": [
            "There are interesting synergies with our portfolio. Forwarding to our investment committee.",
            "The enterprise pipeline looks aligned with our thesis. Progressing to due diligence.",
        ],
        "concerned": [
            "Compliance documentation needs to be in order before we can proceed.",
            "The regulatory exposure is a concern for our LP base.",
        ],
        "negative": [
            "After committee review, this doesn't align with our current mandate.",
            "We'll revisit in 12-18 months.",
        ],
    },
}


class InvestorEngine:
    def __init__(self):
        self.personas = INVESTOR_PERSONAS

    def monthly_update(self, state: Dict) -> Dict:
        """
        Passive monthly investor confidence drift based on startup metrics.
        Returns effect dict.
        """
        effects = {}

        # Revenue growth boosts confidence
        revenue = state.get("revenue", 0)
        burn = state.get("burn_rate", 50000)
        morale = state.get("morale", 75)
        runway = state.get("runway", 10)
        innovation = state.get("innovation_score", 60)
        current_conf = state.get("investor_confidence", 65)

        delta = 0.0

        # Revenue efficiency signal
        if revenue > burn:
            delta += 2.5
        elif revenue < burn * 0.3:
            delta -= 1.5

        # Runway comfort
        if runway < 3:
            delta -= 4.0
        elif runway > 12:
            delta += 1.0

        # Team health signals
        if morale < 40:
            delta -= 2.0
        elif morale > 80:
            delta += 1.0

        # Innovation premium
        if innovation > 75:
            delta += 1.5

        # Random sentiment noise
        delta += random.gauss(0, 1.0)

        effects["investor_confidence"] = max(-20, min(20, delta))
        return effects

    def generate_investor_email(self, state: Dict, investor_key: Optional[str] = None) -> Dict:
        """
        Generate a contextual investor email based on current startup state.
        """
        investor_key = investor_key or random.choice(list(self.personas.keys()))
        persona = self.personas[investor_key]
        tone = persona["email_tone"]
        templates = EMAIL_TEMPLATES.get(tone, EMAIL_TEMPLATES["warm"])

        confidence = state.get("investor_confidence", 65)
        runway = state.get("runway", 10)

        if confidence > 70 and runway > 6:
            sentiment = "positive"
        elif confidence < 45 or runway < 3:
            sentiment = "negative"
        else:
            sentiment = "concerned"

        body = random.choice(templates[sentiment])

        return {
            "from": persona["name"],
            "style": persona["style"],
            "sentiment": sentiment,
            "body": body,
            "investor_type": investor_key,
        }

    def simulate_funding_round(self, state: Dict, founder_effectiveness: float) -> Dict:
        """
        Simulate a funding round attempt.
        Returns outcome dict with amount raised and confidence change.
        """
        stage = state.get("stage", "Seed")
        confidence = state.get("investor_confidence", 65)
        runway = state.get("runway", 10)
        health = state.get("startup_health", 70)

        # Pick best-fit investor
        eligible_investors = []
        for key, persona in self.personas.items():
            threshold = persona["confidence_threshold"]
            if confidence >= threshold:
                eligible_investors.append((key, persona))

        if not eligible_investors:
            return {
                "success": False,
                "amount": 0,
                "narrative": "No investors willing to commit at current confidence levels.",
                "investor_email": self.generate_investor_email(state),
                "confidence_change": -8,
            }

        # Pick random eligible investor
        investor_key, investor = random.choice(eligible_investors)

        # Compute raise success probability
        base_prob = founder_effectiveness * 0.5 + (confidence / 100) * 0.3 + (health / 100) * 0.2
        if runway < 3:
            base_prob *= 0.5  # desperation discount

        success = random.random() < base_prob
        if success:
            lo, hi = investor["check_size_range"]
            amount = random.uniform(lo * 0.7, hi * 1.1)
            amount = round(amount / 50_000) * 50_000  # round to nearest 50k

            # Dilution / terms modifier
            if runway < 3:
                terms_penalty = -15  # desperate raise = bad terms = lower effective confidence
            else:
                terms_penalty = 0

            narrative = f"{investor['name']} leads the round. ${amount:,.0f} raised."
            return {
                "success": True,
                "amount": amount,
                "investor": investor_key,
                "investor_name": investor["name"],
                "narrative": narrative,
                "investor_email": self.generate_investor_email(state, investor_key),
                "confidence_change": 12 + terms_penalty,
                "cash_delta": amount,
            }
        else:
            return {
                "success": False,
                "amount": 0,
                "investor": investor_key,
                "investor_name": investor["name"],
                "narrative": f"{investor['name']} passes after due diligence.",
                "investor_email": self.generate_investor_email(state, investor_key),
                "confidence_change": -5,
            }

    def investor_panic_check(self, state: Dict) -> Optional[Dict]:
        """
        Random check — do investors panic this month?
        Returns an event if panic triggered.
        """
        confidence = state.get("investor_confidence", 65)
        runway = state.get("runway", 10)

        panic_prob = 0.0
        if confidence < 40:
            panic_prob += 0.30
        if runway < 2:
            panic_prob += 0.40
        if state.get("morale", 75) < 25:
            panic_prob += 0.20

        if random.random() < panic_prob:
            investor_key = random.choice(list(self.personas.keys()))
            persona = self.personas[investor_key]
            return {
                "type": "investor_panic",
                "investor": persona["name"],
                "message": random.choice(EMAIL_TEMPLATES[persona["email_tone"]]["negative"]),
                "effects": {"investor_confidence": -12, "morale": -8, "founder_stress": 15},
            }
        return None