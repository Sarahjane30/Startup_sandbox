"""
xgboost_predictor.py
Continuously recalculates startup success probability using XGBoost.
Falls back to a feature-engineered logistic approximation if XGBoost
model file is not available (so the system always works).
"""

import os
import math
import json
import random
from typing import Dict, List, Tuple, Optional


# ── Feature engineering ────────────────────────────────────────────────────────

FEATURE_NAMES = [
    "runway",
    "cash_to_burn_ratio",
    "revenue_to_burn_ratio",
    "morale_norm",
    "retention_norm",
    "investor_confidence_norm",
    "innovation_norm",
    "product_quality_norm",
    "founder_stress_inv",     # inverted: high stress = low score
    "startup_health_norm",
    "competition_inv",        # inverted
    "tech_debt_inv",          # inverted
    "employee_count_log",
    "month_log",
    "churn_rate_inv",
    "nps_norm",
    "reputation_norm",
    "burnout_risk_inv",
    "market_share_log",
    "sector_risk",
]

SECTOR_RISK_MAP = {
    "SaaS": 0.15,
    "AI": 0.20,
    "EdTech": 0.18,
    "Marketplace": 0.22,
    "Retail": 0.25,
    "Fintech": 0.28,
    "CleanTech": 0.22,
    "Cybersecurity": 0.24,
    "Healthcare": 0.35,
    "Biotech": 0.42,
}

STAGE_SURVIVAL_PRIOR = {
    "Idea Stage": 0.25,
    "MVP": 0.35,
    "Seed": 0.45,
    "Series A": 0.55,
    "Series B": 0.65,
    "Growth": 0.72,
    "Scale": 0.80,
}


def extract_features(state: Dict) -> List[float]:
    """
    Extract and normalise features from startup state for prediction.
    All features scaled approximately to [0, 1].
    """
    runway = state.get("runway", 10)
    cash = state.get("cash", 500_000)
    burn = max(state.get("burn_rate", 50_000), 1)
    revenue = state.get("revenue", 0)
    morale = state.get("morale", 75)
    retention = state.get("retention", 85)
    inv_conf = state.get("investor_confidence", 65)
    innovation = state.get("innovation_score", 60)
    quality = state.get("product_quality", 55)
    stress = state.get("founder_stress", 35)
    health = state.get("startup_health", 70)
    competition = state.get("competition_pressure", 30)
    tech_debt = state.get("tech_debt", 20)
    employees = max(state.get("employees", 5), 1)
    month = max(state.get("current_month", 1), 1)
    churn = state.get("churn_rate", 5)
    nps = state.get("nps", 40)
    reputation = state.get("reputation", 50)
    burnout = state.get("burnout_risk", 20)
    market_share = max(state.get("market_share", 0.1), 0.001)
    sector = state.get("sector", "SaaS")

    features = [
        min(runway / 24.0, 1.0),                        # runway (0-24 months)
        min(cash / burn / 24.0, 1.0),                   # cash-to-burn ratio
        min(revenue / burn, 1.0),                       # revenue coverage
        morale / 100.0,                                 # morale
        retention / 100.0,                              # retention
        inv_conf / 100.0,                               # investor confidence
        innovation / 100.0,                             # innovation
        quality / 100.0,                                # product quality
        1.0 - (stress / 100.0),                        # stress (inverted)
        health / 100.0,                                 # startup health
        1.0 - (competition / 100.0),                   # competition (inverted)
        1.0 - (tech_debt / 100.0),                     # tech debt (inverted)
        min(math.log(employees + 1) / math.log(200), 1.0),  # log employees
        min(math.log(month + 1) / math.log(60), 1.0),       # log months
        1.0 - min(churn / 30.0, 1.0),                  # churn (inverted)
        min((nps + 100) / 200.0, 1.0),                 # NPS normalised
        reputation / 100.0,                             # reputation
        1.0 - (burnout / 100.0),                       # burnout (inverted)
        min(math.log(market_share + 0.1) / math.log(50), 1.0),  # market share
        1.0 - SECTOR_RISK_MAP.get(sector, 0.25),       # sector risk (inverted)
    ]

    return features


# ── XGBoost predictor ──────────────────────────────────────────────────────────

class XGBoostPredictor:
    """
    Startup success probability predictor.
    Uses XGBoost model if available, otherwise falls back to a
    calibrated feature-weighted logistic model.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model = None
        self.model_path = model_path or os.path.join(
            os.path.dirname(__file__), "models", "startup_xgb_model.json"
        )
        self._try_load_model()

        # Feature weights for fallback model (learned empirically)
        self._fallback_weights = [
            0.18,   # runway
            0.12,   # cash_to_burn_ratio
            0.15,   # revenue_to_burn_ratio
            0.08,   # morale
            0.06,   # retention
            0.10,   # investor_confidence
            0.05,   # innovation
            0.06,   # product_quality
            0.07,   # founder_stress_inv
            0.10,   # startup_health
            0.04,   # competition_inv
            0.03,   # tech_debt_inv
            0.02,   # employee_count_log
            0.01,   # month_log
            0.05,   # churn_rate_inv
            0.03,   # nps_norm
            0.03,   # reputation_norm
            0.05,   # burnout_risk_inv
            0.02,   # market_share_log
            0.04,   # sector_risk
        ]
        # Normalise weights
        total = sum(self._fallback_weights)
        self._fallback_weights = [w / total for w in self._fallback_weights]

    def _try_load_model(self):
        """Attempt to load XGBoost model file."""
        try:
            import xgboost as xgb
            if os.path.exists(self.model_path):
                self.model = xgb.Booster()
                self.model.load_model(self.model_path)
                print(f"[XGBoostPredictor] Model loaded from {self.model_path}")
        except ImportError:
            print("[XGBoostPredictor] XGBoost not installed — using fallback model.")
        except Exception as e:
            print(f"[XGBoostPredictor] Model load failed: {e} — using fallback model.")

    def predict(self, state: Dict) -> Dict:
        """
        Predict startup success probability.
        Returns probability, confidence band, and feature importances.
        """
        features = extract_features(state)

        if self.model is not None:
            prob = self._xgb_predict(features)
        else:
            prob = self._fallback_predict(features, state)

        # Apply stage prior as Bayesian regularisation
        stage = state.get("stage", "Seed")
        stage_prior = STAGE_SURVIVAL_PRIOR.get(stage, 0.45)
        adjusted_prob = prob * 0.75 + stage_prior * 0.25

        # Confidence band
        sigma = self._compute_uncertainty(state)
        lo = max(0.01, adjusted_prob - sigma)
        hi = min(0.99, adjusted_prob + sigma)

        # Feature importances (for UI display)
        importances = self._compute_importances(features)

        return {
            "success_probability": round(adjusted_prob, 4),
            "confidence_low": round(lo, 4),
            "confidence_high": round(hi, 4),
            "uncertainty": round(sigma, 4),
            "top_risk_factors": self._top_risk_factors(state),
            "top_strengths": self._top_strengths(state),
            "feature_importances": importances,
            "model_type": "xgboost" if self.model else "fallback_logistic",
        }

    def predict_trajectory(self, state: Dict, months: int = 6) -> List[Dict]:
        """
        Predict success probability over the next N months assuming
        current trends hold. Does NOT apply decisions — pure extrapolation.
        """
        trajectory = []
        sim_state = dict(state)

        for m in range(1, months + 1):
            # Simple drift model
            runway = sim_state.get("runway", 10) - 1
            revenue = sim_state.get("revenue", 0) * (1 + sim_state.get("mrr_growth", 0.05) / 100)
            burn = sim_state.get("burn_rate", 50_000)
            cash = sim_state.get("cash", 0) + revenue - burn
            morale = max(0, sim_state.get("morale", 75) + random.gauss(0, 2))

            sim_state.update({
                "runway": max(0, runway),
                "cash": max(0, cash),
                "revenue": revenue,
                "morale": morale,
                "current_month": state.get("current_month", 1) + m,
            })

            pred = self.predict(sim_state)
            trajectory.append({
                "month": state.get("current_month", 1) + m,
                "success_probability": pred["success_probability"],
            })

        return trajectory

    # ── Internal ───────────────────────────────────────────────

    def _xgb_predict(self, features: List[float]) -> float:
        try:
            import xgboost as xgb
            import numpy as np
            dmatrix = xgb.DMatrix(np.array([features]), feature_names=FEATURE_NAMES)
            score = self.model.predict(dmatrix)[0]
            return float(max(0.01, min(0.99, score)))
        except Exception as e:
            print(f"[XGBoostPredictor] Prediction error: {e} — falling back.")
            return self._fallback_predict(features, {})

    def _fallback_predict(self, features: List[float], state: Dict) -> float:
        """Weighted logistic regression fallback."""
        weighted_sum = sum(f * w for f, w in zip(features, self._fallback_weights))
        # Logistic function centred at 0.5
        logit = 8 * (weighted_sum - 0.5)
        prob = 1 / (1 + math.exp(-logit))
        return max(0.02, min(0.97, prob))

    def _compute_uncertainty(self, state: Dict) -> float:
        """Higher uncertainty in early stages or volatile states."""
        month = state.get("current_month", 1)
        runway = state.get("runway", 10)
        morale = state.get("morale", 75)

        base_sigma = 0.08
        if month < 6:
            base_sigma += 0.06   # early = uncertain
        if runway < 3:
            base_sigma += 0.05   # cliff edge = uncertain
        if morale < 40:
            base_sigma += 0.03

        return min(0.25, base_sigma)

    def _compute_importances(self, features: List[float]) -> Dict[str, float]:
        """Return top feature contributions as a dict."""
        contributions = {
            name: round(feat * weight, 4)
            for name, feat, weight in zip(FEATURE_NAMES, features, self._fallback_weights)
        }
        sorted_imp = dict(sorted(contributions.items(), key=lambda x: x[1], reverse=True))
        return sorted_imp

    def _top_risk_factors(self, state: Dict) -> List[str]:
        """Return human-readable top risks."""
        risks = []
        if state.get("runway", 10) < 3:
            risks.append("Critical runway — under 3 months")
        if state.get("morale", 75) < 40:
            risks.append("Team morale collapse")
        if state.get("investor_confidence", 65) < 40:
            risks.append("Low investor confidence")
        if state.get("founder_stress", 35) > 75:
            risks.append("Founder burnout risk")
        if state.get("churn_rate", 5) > 15:
            risks.append("High customer churn")
        if state.get("tech_debt", 20) > 70:
            risks.append("Tech debt accumulation")
        if state.get("burn_rate", 50000) > state.get("revenue", 0) * 4:
            risks.append("Burn rate far exceeds revenue")
        return risks[:3]

    def _top_strengths(self, state: Dict) -> List[str]:
        """Return human-readable top strengths."""
        strengths = []
        if state.get("runway", 10) > 18:
            strengths.append("Strong runway")
        if state.get("morale", 75) > 80:
            strengths.append("High team morale")
        if state.get("investor_confidence", 65) > 75:
            strengths.append("Strong investor confidence")
        if state.get("innovation_score", 60) > 75:
            strengths.append("High innovation score")
        if state.get("nps", 40) > 60:
            strengths.append("Excellent NPS")
        if state.get("revenue", 0) > state.get("burn_rate", 50000):
            strengths.append("Revenue exceeds burn")
        return strengths[:3]