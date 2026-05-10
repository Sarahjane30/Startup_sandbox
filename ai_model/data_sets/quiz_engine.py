"""Deterministic quiz generation and scoring."""

from learning_content import skill_label


class QuizEngine:
    def build_quiz(self, module):
        skills = module.get("skills", ["startup_strategy"])
        primary = skill_label(skills[0])
        title = module.get("title", "Founder Skill")
        is_soft = "soft" in module.get("skillTypes", [])
        if is_soft:
            question = f"A founder faces a tense {title.lower()} situation. What is the strongest first move?"
            options = [
                "Clarify the real concern, make the tradeoff explicit, and choose a next action.",
                "Avoid the conversation until the team has moved on.",
                "Copy what a larger company would do even if the context is different.",
                "Make the fastest decision without explaining the reasoning.",
            ]
        else:
            question = f"You are applying {title}. Which action creates the best learning signal?"
            options = [
                f"Define one measurable assumption and test it with real users or data.",
                "Build a complete version before talking to customers.",
                "Optimize the visual brand before the problem is proven.",
                "Ignore metrics until the product feels finished.",
            ]
        return {
            "question": question,
            "options": options,
            "correctIndex": 0,
            "explanation": f"The best answer creates a tight feedback loop around {primary}. It gives the founder evidence instead of motion.",
            "skills": skills,
            "type": "scenario" if is_soft else "technical",
        }

    def score(self, module, selected_index):
        correct = selected_index == 0
        return {
            "correct": correct,
            "score": 100 if correct else 35,
            "mistakeSkill": None if correct else module.get("skills", ["startup_strategy"])[0],
        }
