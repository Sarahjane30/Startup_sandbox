"""Top-level learning engine facade."""

from adaptive_path_engine import AdaptivePathEngine


class LearningEngine:
    def __init__(self):
        self.adaptive = AdaptivePathEngine()

    def get_curriculum(self, state=None):
        return self.adaptive.curriculum(state)

    def get_lesson(self, module_id):
        return self.adaptive.lesson(module_id)

    def submit_quiz(self, state, module_id, selected_index):
        return self.adaptive.submit_attempt(state, module_id, selected_index)

    def analyze_progress(self, state):
        return self.adaptive.analyze(state)
