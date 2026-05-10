"""Unlockable achievements for the learning platform."""


class AchievementEngine:
    RULES = [
        ("first_module", "First Module Complete", lambda s: len(s.get("completed", [])) >= 1),
        ("ten_modules", "10 Modules Complete", lambda s: len(s.get("completed", [])) >= 10),
        ("finance_unlocked", "Finance Level Unlocked", lambda s: s.get("skillScores", {}).get("finance", {}).get("score", 0) >= 60),
        ("leadership_lift", "Leadership Skill Increased", lambda s: s.get("skillScores", {}).get("leadership", {}).get("score", 0) >= 60),
        ("streak_3", "3-Day Learning Streak", lambda s: s.get("streak", 0) >= 3),
        ("sector_ready", "Sector Paths Unlocked", lambda s: len(s.get("completedRounds", [])) >= 5),
        ("weakness_slayer", "Weak Skill Improved", lambda s: s.get("weakSkillImproved", False)),
    ]

    def evaluate(self, state):
        unlocked = set(state.get("achievements", []))
        new = []
        for achievement_id, title, predicate in self.RULES:
            if achievement_id not in unlocked and predicate(state):
                unlocked.add(achievement_id)
                new.append({"id": achievement_id, "title": title})
        return {"all": sorted(unlocked), "new": new}
