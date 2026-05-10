"""Adaptive learning path orchestrator and CLI JSON endpoint."""

import json
import sys

from achievement_engine import AchievementEngine
from learning_content import all_modules, all_rounds, module_by_id
from quiz_engine import QuizEngine
from recommendation_engine import RecommendationEngine
from sector_affinity import SectorAffinityEngine
from skill_tracker import SkillTracker
from streak_engine import StreakEngine
from weakness_detector import WeaknessDetector
from xp_engine import XPEngine


class AdaptivePathEngine:
    def __init__(self):
        self.quiz = QuizEngine()
        self.skills = SkillTracker()
        self.xp = XPEngine()
        self.streaks = StreakEngine()
        self.achievements = AchievementEngine()
        self.weakness = WeaknessDetector()
        self.recommendations = RecommendationEngine()
        self.sectors = SectorAffinityEngine()

    def curriculum(self, state=None):
        state = state or {}
        completed = set(state.get("completed", []))
        completed_rounds = set(state.get("completedRounds", []))
        modules = all_modules()
        rounds = []
        for round_data in all_rounds():
            locked = self._round_locked(round_data, completed_rounds, state)
            round_modules = []
            for module in round_data["modules"]:
                module_locked = locked or (module["module"] > 1 and round_data["modules"][module["module"] - 2]["id"] not in completed)
                round_modules.append({**module, "locked": module_locked, "completed": module["id"] in completed})
            rounds.append({k: v for k, v in round_data.items() if k != "modules"} | {"locked": locked, "modules": round_modules})
        return {"rounds": rounds, "modules": modules}

    def lesson(self, module_id):
        module = module_by_id(module_id)
        if not module:
            raise ValueError("Unknown module")
        primary = module["skills"][0].replace("_", " ")
        return {
            "module": module,
            "keyPoints": [
                f"Use {module['title']} to create a smaller, testable founder decision.",
                f"Track one metric that proves whether your {primary} assumption is getting stronger.",
                "Prefer direct customer or team evidence over opinions.",
                "After every attempt, write down what changed and what you will test next.",
            ],
            "realWorldExample": f"A focused founder treats {module['title']} as a practical experiment, not a lecture. The goal is to reduce uncertainty before spending more time or money.",
            "commonMistake": "Beginners often confuse activity with learning. A completed task matters only when it changes the next decision.",
            "proTip": "Turn every lesson into a tiny operating habit you can repeat inside a real startup.",
            "quiz": self.quiz.build_quiz(module),
        }

    def submit_attempt(self, state, module_id, selected_index):
        module = module_by_id(module_id)
        if not module:
            raise ValueError("Unknown module")
        state = state or {}
        skill_scores = state.get("skillScores") or self.skills.empty()
        result = self.quiz.score(module, selected_index)
        mistakes = dict(state.get("mistakes", {}))
        if result["mistakeSkill"]:
            mistakes[result["mistakeSkill"]] = mistakes.get(result["mistakeSkill"], 0) + 1

        updated_skills = self.skills.update_from_attempt(skill_scores, module, result["correct"], result["score"])
        completed = list(dict.fromkeys([*(state.get("completed", [])), module_id])) if result["correct"] else state.get("completed", [])
        completed_rounds = self._completed_rounds(completed)
        streak_update = self.streaks.update(state.get("lastActive"), state.get("streak", 0))
        xp_reward = self.xp.award(
            "lesson_complete" if result["correct"] else "quiz_pass",
            module.get("xp", 50),
            result["score"],
            streak_update["streak"],
            result["mistakeSkill"] in {w["id"] for w in self.weakness.detect(updated_skills, mistakes)["weakAreas"]},
        )
        new_state = {
            **state,
            "completed": completed,
            "completedRounds": completed_rounds,
            "skillScores": updated_skills,
            "mistakes": mistakes,
            "streak": streak_update["streak"],
            "lastActive": streak_update["lastActive"],
            "xp": int(state.get("xp", 0)) + (xp_reward["xp"] if result["correct"] else 0),
        }
        achievement_result = self.achievements.evaluate(new_state)
        new_state["achievements"] = achievement_result["all"]
        analysis = self.analyze(new_state)
        return {"result": result, "xpReward": xp_reward, "state": new_state, "newAchievements": achievement_result["new"], **analysis}

    def analyze(self, state):
        state = state or {}
        skill_scores = state.get("skillScores") or self.skills.empty()
        curriculum = self.curriculum(state)
        weak = self.weakness.detect(skill_scores, state.get("mistakes", {}))
        recs = self.recommendations.recommend(
            [m for r in curriculum["rounds"] for m in r["modules"]],
            state.get("completed", []),
            weak["weakAreas"],
            skill_scores,
        )
        return {
            "level": self.xp.level_for(int(state.get("xp", 0))),
            "weakness": weak,
            "recommendations": recs,
            "sectorAffinity": self.sectors.predict(skill_scores, state.get("sectorInterests", {})),
            "curriculum": curriculum,
        }

    def _completed_rounds(self, completed):
        completed = set(completed or [])
        done = []
        for round_data in all_rounds():
            ids = {m["id"] for m in round_data["modules"]}
            if ids and ids.issubset(completed):
                done.append(round_data["id"])
        return done

    def _round_locked(self, round_data, completed_rounds, state):
        unlock = round_data.get("unlock", {})
        if unlock.get("type") == "always":
            return False
        required_round = unlock.get("completed_round")
        if required_round and required_round not in completed_rounds:
            return True
        scores = state.get("skillScores", {})
        if unlock.get("min_finance_score") and scores.get("finance", {}).get("score", 0) < unlock["min_finance_score"]:
            return True
        if unlock.get("min_retention_score") and scores.get("marketing", {}).get("score", 0) < unlock["min_retention_score"]:
            return True
        if unlock.get("min_trust_score") and scores.get("communication", {}).get("score", 0) < unlock["min_trust_score"]:
            return True
        return False


def run_cli():
    payload = json.loads(sys.stdin.read() or "{}")
    engine = AdaptivePathEngine()
    action = payload.get("action", "analyze")
    if action == "curriculum":
        output = engine.curriculum(payload.get("state", {}))
    elif action == "lesson":
        output = engine.lesson(payload.get("moduleId"))
    elif action == "submit":
        output = engine.submit_attempt(payload.get("state", {}), payload.get("moduleId"), int(payload.get("selectedIndex", -1)))
    else:
        output = engine.analyze(payload.get("state", {}))
    print(json.dumps(output))


if __name__ == "__main__":
    run_cli()
