"""XP, level, and reward calculations for learning progress."""

LEVELS = [
    {"level": 1, "name": "Rookie", "minXp": 0},
    {"level": 2, "name": "Founder", "minXp": 250},
    {"level": 3, "name": "Builder", "minXp": 600},
    {"level": 4, "name": "Operator", "minXp": 1100},
    {"level": 5, "name": "Strategist", "minXp": 1800},
    {"level": 6, "name": "Venture Ready", "minXp": 2800},
    {"level": 7, "name": "Unicorn Mindset", "minXp": 4200},
]


class XPEngine:
    def level_for(self, xp):
        current = LEVELS[0]
        for level in LEVELS:
            if xp >= level["minXp"]:
                current = level
        next_level = next((level for level in LEVELS if level["minXp"] > xp), None)
        return {"current": current, "next": next_level}

    def award(self, event, base_xp=0, quiz_score=0, streak=0, weak_skill_bonus=False):
        event_bonus = {
            "lesson_complete": base_xp or 50,
            "quiz_pass": 25,
            "challenge_complete": base_xp or 75,
            "weak_skill_improved": 100,
            "sector_unlock": 150,
        }.get(event, base_xp)
        score_bonus = 20 if quiz_score >= 90 else 10 if quiz_score >= 75 else 0
        streak_bonus = min(40, streak * 5)
        weak_bonus = 30 if weak_skill_bonus else 0
        return {
            "event": event,
            "xp": int(event_bonus + score_bonus + streak_bonus + weak_bonus),
            "breakdown": {
                "event": event_bonus,
                "quiz": score_bonus,
                "streak": streak_bonus,
                "weakSkill": weak_bonus,
            },
        }
