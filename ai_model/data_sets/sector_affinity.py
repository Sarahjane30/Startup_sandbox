"""Random Forest style sector affinity prediction."""

SECTORS = ["ai_ml", "healthcare", "ecommerce", "fintech"]


class SectorAffinityEngine:
    def __init__(self):
        self.trees = [
            lambda f: max(range(4), key=lambda i: f[i]),
            lambda f: 0 if f[0] + f[4] > max(f[1], f[2], f[3]) + 25 else max(range(4), key=lambda i: f[i]),
            lambda f: 3 if f[3] > 55 and f[4] > 45 else max(range(4), key=lambda i: f[i]),
            lambda f: 2 if f[2] > f[0] and f[2] > f[3] else max(range(4), key=lambda i: f[i]),
            lambda f: 1 if f[1] > 60 else max(range(4), key=lambda i: f[i]),
        ]

    def predict(self, skill_scores, interests=None):
        interests = interests or {}
        features = [
            skill_scores.get("analytics", {}).get("score", 0) + interests.get("ai_ml", 0),
            skill_scores.get("operations", {}).get("score", 0) + interests.get("healthcare", 0),
            skill_scores.get("marketing", {}).get("score", 0) + interests.get("ecommerce", 0),
            skill_scores.get("finance", {}).get("score", 0) + interests.get("fintech", 0),
            skill_scores.get("decision_making", {}).get("score", 0),
        ]
        if sum(features[:4]) == 0:
            return {"topSector": {"sector": "ai_ml", "confidence": 0.25}, "ranked": [{"sector": sector, "confidence": 0.25} for sector in SECTORS]}
        votes = [tree(features) for tree in self.trees]
        base_total = sum(max(1, v) for v in features[:4])
        probabilities = []
        for index in range(4):
            vote_score = votes.count(index) / len(votes)
            signal_score = max(1, features[index]) / base_total
            probabilities.append((vote_score * 0.65) + (signal_score * 0.35))
        total = sum(probabilities) or 1
        probabilities = [p / total for p in probabilities]
        ranked = sorted(
            [{"sector": sector, "confidence": round(float(probabilities[i]), 2)} for i, sector in enumerate(SECTORS)],
            key=lambda x: -x["confidence"],
        )
        return {"topSector": ranked[0], "ranked": ranked}
