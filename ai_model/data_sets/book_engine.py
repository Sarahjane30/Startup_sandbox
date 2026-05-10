"""
book_engine.py
Startup and business book recommendations, contextually matched to
the founder's current situation. The right book at the right moment.
"""

import random
from typing import Dict, List, Optional


BOOK_LIBRARY = [
    {
        "title": "The Hard Thing About Hard Things",
        "author": "Ben Horowitz",
        "tags": ["crisis", "leadership", "burnout", "morale_low", "layoffs"],
        "summary": "No BS advice on running a startup when everything is going wrong.",
        "relevance_triggers": {"founder_stress": 60, "morale": (0, 45), "runway": (0, 4)},
        "quote": "There's no recipe for really hard decisions. The only way to get better is to make them.",
    },
    {
        "title": "Zero to One",
        "author": "Peter Thiel",
        "tags": ["early_stage", "vision", "competition", "innovation"],
        "summary": "Build a monopoly. Don't compete — create.",
        "relevance_triggers": {"innovation_score": (0, 50), "current_month": (0, 6)},
        "quote": "Competition is for losers.",
    },
    {
        "title": "The Lean Startup",
        "author": "Eric Ries",
        "tags": ["product", "pivot", "mvp", "early_stage"],
        "summary": "Build, measure, learn. Stop wasting time on things nobody wants.",
        "relevance_triggers": {"product_quality": (0, 55), "pivots_taken": 0},
        "quote": "The only way to win is to learn faster than anyone else.",
    },
    {
        "title": "Blitzscaling",
        "author": "Reid Hoffman",
        "tags": ["growth", "scaling", "hiring", "fundraising"],
        "summary": "When to prioritise speed over efficiency — and why it might save you.",
        "relevance_triggers": {"growth_opportunity": True, "revenue": 50000},
        "quote": "The key to blitzscaling is accepting chaos and making it productive.",
    },
    {
        "title": "Founders at Work",
        "author": "Jessica Livingston",
        "tags": ["inspiration", "early_stage", "founder", "resilience"],
        "summary": "Real stories from founders in the earliest, hardest days.",
        "relevance_triggers": {"current_month": (0, 12)},
        "quote": "The most common trait among successful founders is persistence, not genius.",
    },
    {
        "title": "Good to Great",
        "author": "Jim Collins",
        "tags": ["leadership", "team", "long_term", "culture"],
        "summary": "Why some companies make the leap to greatness and most don't.",
        "relevance_triggers": {"morale": (60, 100), "current_month": 24},
        "quote": "Good is the enemy of great.",
    },
    {
        "title": "Measure What Matters",
        "author": "John Doerr",
        "tags": ["metrics", "okrs", "scaling", "focus"],
        "summary": "OKRs: the framework that took Google from startup to empire.",
        "relevance_triggers": {"employees": 10, "startup_health": (55, 100)},
        "quote": "Ideas are easy. Execution is everything.",
    },
    {
        "title": "Lost and Founder",
        "author": "Rand Fishkin",
        "tags": ["honesty", "burnout", "founder", "vc", "realism"],
        "summary": "What startup books don't tell you — the honest version.",
        "relevance_triggers": {"founder_stress": 65, "investor_confidence": (0, 55)},
        "quote": "VC funding is not an indicator of success. It's an indicator of investor optimism.",
    },
    {
        "title": "Crossing the Chasm",
        "author": "Geoffrey Moore",
        "tags": ["go_to_market", "growth", "product_market_fit", "enterprise"],
        "summary": "The gap between early adopters and the mainstream market — and how to cross it.",
        "relevance_triggers": {"customer_count": 100, "revenue": 20000},
        "quote": "The chasm is the make-or-break moment for any technology company.",
    },
    {
        "title": "Sprint",
        "author": "Jake Knapp",
        "tags": ["product", "speed", "design", "mvp"],
        "summary": "Solve big problems and test ideas in just five days.",
        "relevance_triggers": {"tech_debt": 50, "product_quality": (0, 60)},
        "quote": "You can solve your biggest problems faster than you think.",
    },
    {
        "title": "No Rules Rules",
        "author": "Reed Hastings & Erin Meyer",
        "tags": ["culture", "hiring", "team", "talent"],
        "summary": "How Netflix built a culture of radical freedom and responsibility.",
        "relevance_triggers": {"morale": (0, 55), "retention": (0, 75)},
        "quote": "Adequate performance gets a generous severance package.",
    },
    {
        "title": "The Mom Test",
        "author": "Rob Fitzpatrick",
        "tags": ["customer_discovery", "product", "mvp", "early_stage"],
        "summary": "How to talk to customers and learn whether your business is a good idea.",
        "relevance_triggers": {"customer_count": (0, 20), "nps": (0, 40)},
        "quote": "Stop asking people if they like your idea and start asking what their life is really like.",
    },
    {
        "title": "Venture Deals",
        "author": "Brad Feld & Jason Mendelson",
        "tags": ["fundraising", "investors", "term_sheet", "dilution"],
        "summary": "The definitive guide to venture capital term sheets and fundraising.",
        "relevance_triggers": {"fundraising_difficulty": 50, "last_raise_month": 0},
        "quote": "Understand the term sheet. Never sign what you don't understand.",
        },
    {
        "title": "High Output Management",
        "author": "Andy Grove",
        "tags": ["management", "team", "scaling", "operations"],
        "summary": "The Intel CEO's masterclass on managing people, output, and decisions.",
        "relevance_triggers": {"employees": 15, "productivity": (0, 70)},
        "quote": "The output of a manager is the output of the organizational units under her supervision.",
    },
    {
        "title": "Atomic Habits",
        "author": "James Clear",
        "tags": ["burnout", "founder", "productivity", "resilience"],
        "summary": "Tiny changes, remarkable results. For founders who've lost their edge.",
        "relevance_triggers": {"founder_stress": 55, "productivity": (0, 65)},
        "quote": "You don't rise to the level of your goals. You fall to the level of your systems.",
    },
]


class BookEngine:

    def recommend(self, state: Dict, count: int = 2) -> List[Dict]:
        """Return the most contextually relevant book recommendations."""
        scored = []

        for book in BOOK_LIBRARY:
            score = self._score_book(book, state)
            if score > 0:
                scored.append((score, book))

        scored.sort(reverse=True, key=lambda x: x[0])

        # Add some randomness — don't always return the same books
        top = scored[:max(count * 2, 4)]
        random.shuffle(top)
        selected = [book for _, book in top[:count]]

        return [self._format_book(b) for b in selected]

    def recommend_for_situation(self, situation: str, count: int = 1) -> List[Dict]:
        """Recommend books by situation tag."""
        matching = [b for b in BOOK_LIBRARY if situation in b.get("tags", [])]
        random.shuffle(matching)
        return [self._format_book(b) for b in matching[:count]]

    def random_book(self) -> Dict:
        """Return a completely random book recommendation."""
        return self._format_book(random.choice(BOOK_LIBRARY))

    # ── Internal ───────────────────────────────────────────────

    def _score_book(self, book: Dict, state: Dict) -> float:
        score = 0.1  # baseline
        triggers = book.get("relevance_triggers", {})

        for key, threshold in triggers.items():
            val = state.get(key, None)
            if val is None:
                continue

            if isinstance(threshold, tuple):
                lo, hi = threshold
                if lo <= val <= hi:
                    score += 2.0
            elif isinstance(threshold, bool):
                # Abstract flag — give moderate score
                score += 1.0
            elif isinstance(threshold, (int, float)):
                if isinstance(val, (int, float)) and val >= threshold:
                    score += 2.0
                elif isinstance(val, (int, float)) and val < threshold:
                    score += 0.5

        # Bonus for matching sector tags
        sector = state.get("sector", "").lower()
        tags = book.get("tags", [])
        if sector in tags:
            score += 1.5

        # Small random jitter for variety
        import random
        score += random.uniform(0, 0.5)

        return score

    def _format_book(self, book: Dict) -> Dict:
        return {
            "title": book["title"],
            "author": book["author"],
            "summary": book["summary"],
            "quote": book.get("quote", ""),
            "tags": book.get("tags", []),
        }