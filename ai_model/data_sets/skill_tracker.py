"""Skill mastery tracker for technical and soft founder skills."""

from learning_content import SKILLS, skill_label


class SkillTracker:
    def empty(self):
        return {skill: {"score": 0, "attempts": 0, "correct": 0, "label": skill_label(skill)} for skill in SKILLS}

    def update_from_attempt(self, skills_state, module, is_correct, quiz_score):
        state = {**self.empty(), **(skills_state or {})}
        delta = 8 if is_correct else -3
        if quiz_score >= 90:
            delta += 4
        for skill in module.get("skills", []):
            record = {**state.get(skill, {"score": 0, "attempts": 0, "correct": 0, "label": skill_label(skill)})}
            record["attempts"] += 1
            record["correct"] += 1 if is_correct else 0
            record["score"] = max(0, min(100, int(record.get("score", 0) + delta)))
            record["label"] = skill_label(skill)
            state[skill] = record
        return state

    def summarize(self, skills_state):
        records = list((skills_state or self.empty()).items())
        ranked = sorted(records, key=lambda x: x[1].get("score", 0))
        weak = [{"id": k, **v} for k, v in ranked[:5] if v.get("score", 0) < 60]
        strong = [{"id": k, **v} for k, v in ranked[-5:] if v.get("score", 0) >= 70]
        return {"weak": weak, "strong": list(reversed(strong))}
