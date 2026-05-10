"""Random Forest style weak-skill detector.

The app needs instant local inference, so this uses a compact forest of
hand-tuned decision trees instead of importing a heavy training stack at request
time. Each tree votes on mastery risk from score, attempts, correctness, and
repeated mistakes.
"""


class WeaknessDetector:
    def __init__(self):
        self.trees = [
            lambda score, attempts, correct, repeated: score < 58 or repeated >= 2,
            lambda score, attempts, correct, repeated: attempts >= 3 and correct / max(1, attempts) < 0.55,
            lambda score, attempts, correct, repeated: score < 45 or (score < 68 and repeated >= 1),
            lambda score, attempts, correct, repeated: attempts < 2 and score < 35,
            lambda score, attempts, correct, repeated: repeated >= 3 or (score < 62 and attempts >= 4),
        ]

    def detect(self, skill_scores, mistakes=None):
        mistakes = mistakes or {}
        weak = []
        strong = []
        for skill, record in (skill_scores or {}).items():
            score = int(record.get("score", 0))
            attempts = int(record.get("attempts", 0))
            correct = int(record.get("correct", 0))
            repeated = int(mistakes.get(skill, 0))
            votes = [tree(score, attempts, correct, repeated) for tree in self.trees]
            probability = sum(1 for vote in votes if vote) / len(votes)
            is_weak = probability >= 0.4
            item = {
                "id": skill,
                "label": record.get("label", skill.replace("_", " ").title()),
                "score": score,
                "confidence": round(probability, 2),
                "repeatedMistakes": repeated,
            }
            if is_weak:
                weak.append(item)
            elif score >= 70:
                strong.append(item)
        return {
            "weakAreas": sorted(weak, key=lambda x: (-x["confidence"], x["score"]))[:6],
            "strongAreas": sorted(strong, key=lambda x: -x["score"])[:6],
        }
