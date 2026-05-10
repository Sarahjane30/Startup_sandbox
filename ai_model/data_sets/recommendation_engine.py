"""Decision Tree powered module recommendation engine."""


class RecommendationEngine:
    def __init__(self):
        self.max_depth = 4

    def recommend(self, modules, completed, weak_areas, skill_scores):
        completed = set(completed or [])
        weak_ids = {w["id"] for w in weak_areas or []}
        candidates = []
        for module in modules:
            if module["id"] in completed:
                continue
            overlap = len(weak_ids.intersection(module.get("skills", [])))
            avg_skill = self._avg_skill(module, skill_scores)
            locked = module.get("locked", False)
            priority = self._decision_tree_priority(avg_skill, overlap, locked)
            candidates.append({
                "moduleId": module["id"],
                "title": module["title"],
                "roundTitle": module.get("roundTitle", ""),
                "priority": priority,
                "reason": self._reason(overlap, avg_skill, locked),
            })
        unlocked = [candidate for candidate in candidates if "unlock" not in candidate["reason"].lower()]
        pool = unlocked if unlocked else candidates
        return sorted(pool, key=lambda x: (x["priority"], x["title"]))[:5]

    def _avg_skill(self, module, skill_scores):
        values = [skill_scores.get(s, {}).get("score", 0) for s in module.get("skills", [])]
        return int(sum(values) / len(values)) if values else 0

    def _decision_tree_priority(self, avg_skill, overlap, locked):
        if locked:
            return 2
        if overlap >= 1:
            return 0
        if avg_skill < 45:
            return 0
        if avg_skill < 70:
            return 1
        return 1

    def _reason(self, overlap, avg_skill, locked):
        if locked:
            return "Finish earlier requirements to unlock this path."
        if overlap:
            return "Targets a weak skill detected from quiz attempts."
        if avg_skill < 50:
            return "Good next step for building founder fundamentals."
        return "Keeps progression moving toward advanced paths."
