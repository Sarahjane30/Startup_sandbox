"""
news_engine.py
Fake tech press simulator. Generates startup news headlines and articles
that react to startup state, sector events, and milestone moments.
"""

import random
from typing import Dict, List, Optional


PUBLICATIONS = [
    "TechCrunch", "The Information", "Bloomberg Tech", "Wired", "VentureBeat",
    "Forbes Startups", "Fast Company", "Business Insider", "Axios Pro Rata",
    "The Verge", "Sifted", "TechCo Weekly", "Founder Magazine",
]

HEADLINE_TEMPLATES = {

    "funding_positive": [
        "{name} raises ${amount}M to {mission}",
        "{name} closes ${amount}M {stage} round led by {investor}",
        "Stealth startup {name} emerges from hiding with ${amount}M to {mission}",
        "{name} secures ${amount}M as investors bet on {sector} disruption",
        "{investor} backs {name} with ${amount}M in competitive {stage} round",
    ],

    "funding_hard": [
        "{name} struggles to close its {stage} round amid market downturn",
        "Sources say {name}'s fundraise is taking longer than expected",
        "{name} reportedly in conversations but no term sheet yet",
    ],

    "growth_positive": [
        "{name} hits {milestone} users, doubling in just {months} months",
        "{name} announces {revenue}K MRR milestone",
        "How {name} went from zero to {customers} customers in {months} months",
        "{name} just hit product-market fit — here's what changed",
        "{name}'s NPS score of {nps} is the envy of the {sector} industry",
    ],

    "growth_viral": [
        "Everyone is talking about {name}. Here's why.",
        "{name} breaks the internet — 2M signups in 48 hours",
        "The {name} waitlist is 400K long and growing",
        "TikTok made {name} famous. Now they have to deliver.",
        "Product Hunt crowned {name} #1 today. Can they keep the momentum?",
    ],

    "crisis": [
        "{name} faces questions after {problem}",
        "Sources say {name} has cut staff amid runway concerns",
        "{name}'s {stage} round reportedly stalled as investors get cautious",
        "Inside the leadership crisis at {name}",
        "{name} burns through cash as growth slows",
    ],

    "acquisition": [
        "Exclusive: {name} in acquisition talks with {acquirer}",
        "{acquirer} acquires {name} for reported ${amount}M",
        "{name} finds its exit: acquired by {acquirer}",
        "Sources: {name} turned down ${amount}M offer from {acquirer}",
    ],

    "product_launch": [
        "{name} launches {product} — and it's actually good",
        "{name} ships new feature that {benefit}",
        "First look: {name}'s new {product}",
        "{name} bets big on {product} as competition heats up",
    ],

    "sector_ai": [
        "{name} claims its model outperforms GPT-4 on {benchmark}",
        "How {name} is building AI infrastructure without drowning in GPU costs",
        "{name} launches enterprise AI product targeting {industry}",
        "The AI startup nobody talked about last year: meet {name}",
        "{name} raises questions about AI safety in {use_case}",
    ],

    "sector_healthcare": [
        "{name} receives FDA breakthrough designation",
        "{name} partners with hospital network to expand to {patients}M patients",
        "Clinical results for {name}'s platform show {outcome}% improvement",
        "{name} navigating complex regulatory path as it scales",
    ],

    "sector_fintech": [
        "{name} gets banking license — what does this mean for incumbents?",
        "{name}'s embedded finance product goes live with {customers} partners",
        "The compliance headache at {name} and how they solved it",
        "{name} crosses ${revenue}M in annualised payment volume",
    ],

    "opinion": [
        "Why {name} might be the most important {sector} startup you've never heard of",
        "Is {name} the next unicorn or the next cautionary tale?",
        "{name} is doing what nobody else dared to. Here's what that means.",
        "The {name} playbook: what every startup founder can learn from their growth",
        "Don't sleep on {name}. I mean it.",
    ],
}

ACQUIRERS = ["Google", "Microsoft", "Amazon", "Salesforce", "Oracle", "SAP", "Meta", "Apple", "Stripe", "Databricks"]
BENCHMARKS = ["reasoning tasks", "code generation", "document analysis", "multi-modal evaluation", "latency benchmarks"]
INDUSTRIES = ["legal", "finance", "healthcare", "logistics", "HR", "customer support", "compliance"]
USE_CASES = ["hiring", "content generation", "medical diagnosis", "financial advice", "autonomous agents"]


class NewsEngine:

    def generate_headline(self, state: Dict) -> Dict:
        """Generate a single contextually relevant headline for current startup state."""
        category = self._infer_category(state)
        templates = HEADLINE_TEMPLATES.get(category, HEADLINE_TEMPLATES["opinion"])
        template = random.choice(templates)

        filled = self._fill_template(template, state)
        publication = random.choice(PUBLICATIONS)

        return {
            "headline": filled,
            "publication": publication,
            "category": category,
            "sentiment": self._category_sentiment(category),
            "month": state.get("current_month", 1),
        }

    def generate_news_feed(self, state: Dict, count: int = 3) -> List[Dict]:
        """Generate multiple news items for a news feed."""
        categories_used = set()
        feed = []

        for _ in range(count * 3):  # generate extras to avoid repeats
            if len(feed) >= count:
                break
            category = self._infer_category(state, randomise=True)
            if category in categories_used:
                continue
            categories_used.add(category)

            templates = HEADLINE_TEMPLATES.get(category, HEADLINE_TEMPLATES["opinion"])
            template = random.choice(templates)
            headline = self._fill_template(template, state)

            feed.append({
                "headline": headline,
                "publication": random.choice(PUBLICATIONS),
                "category": category,
                "sentiment": self._category_sentiment(category),
            })

        return feed[:count]

    def generate_press_release(self, state: Dict, event: str = "funding") -> Dict:
        """Generate a mini press release for a major startup event."""
        name = state.get("name", "the startup")
        sector = state.get("sector", "tech")
        stage = state.get("stage", "Seed")
        cash = state.get("cash", 0)
        month = state.get("current_month", 1)

        if event == "funding":
            amount = round(cash / 1_000_000, 1)
            headline = f"{name} Announces ${amount}M {stage} Round"
            body = (
                f"{name}, the {sector} startup redefining its category, today announced a "
                f"${amount}M {stage} funding round. The company plans to use the capital to "
                f"accelerate product development and expand its go-to-market strategy."
            )
        elif event == "milestone":
            headline = f"{name} Reaches Key Growth Milestone in Month {month}"
            body = (
                f"{name} announced today that it has reached a significant milestone in its "
                f"growth journey, a signal the company sees as validation of its core thesis. "
                f"Founder and CEO says: 'We're just getting started.'"
            )
        else:
            headline = f"{name} Makes Strategic Announcement"
            body = f"{name} today made a strategic announcement expected to accelerate its position in {sector}."

        return {
            "headline": headline,
            "body": body,
            "publication": "PR Newswire",
            "type": "press_release",
        }

    # ── Internal helpers ───────────────────────────────────────

    def _fill_template(self, template: str, state: Dict) -> str:
        cash = state.get("cash", 500000)
        revenue = state.get("revenue", 0)
        investor_conf = state.get("investor_confidence", 65)

        fill_vars = {
            "name": state.get("name", "the startup"),
            "sector": state.get("sector", "tech"),
            "stage": state.get("stage", "Seed"),
            "amount": round(random.uniform(1, 30), 1),
            "investor": random.choice(["Tiger Global", "Sequoia", "a16z", "Accel", "Benchmark", "Bessemer"]),
            "milestone": random.choice(["100K", "500K", "1M", "5M"]),
            "months": random.randint(6, 18),
            "customers": random.randint(50, 5000),
            "revenue": int(revenue / 1000) if revenue > 0 else random.randint(50, 500),
            "nps": random.randint(50, 78),
            "problem": random.choice(["leadership changes", "slowing growth", "burn concerns", "product delays"]),
            "acquirer": random.choice(ACQUIRERS),
            "product": random.choice(["AI assistant", "mobile app", "API", "enterprise dashboard", "platform v2"]),
            "benefit": random.choice(["saves users 3 hours a week", "doubles conversion rates", "cuts costs by 40%"]),
            "mission": random.choice(["disrupt enterprise software", "rebuild the category", "expand globally"]),
            "benchmark": random.choice(BENCHMARKS),
            "industry": random.choice(INDUSTRIES),
            "use_case": random.choice(USE_CASES),
            "outcome": random.randint(22, 47),
            "patients": random.randint(1, 20),
        }

        try:
            return template.format(**fill_vars)
        except KeyError:
            return template

    def _infer_category(self, state: Dict, randomise: bool = False) -> str:
        runway = state.get("runway", 10)
        press = state.get("press_coverage", 10)
        sector = state.get("sector", "SaaS")
        health = state.get("startup_health", 70)
        revenue = state.get("revenue", 0)
        inv_conf = state.get("investor_confidence", 65)

        if randomise:
            # Allow more variety in feeds
            options = list(HEADLINE_TEMPLATES.keys())
            weights = [1.0] * len(options)
            sector_key = {"AI": "sector_ai", "Healthcare": "sector_healthcare", "Fintech": "sector_fintech"}.get(sector)
            if sector_key:
                for idx, opt in enumerate(options):
                    if opt.startswith("sector_") and opt != sector_key:
                        weights[idx] = 0.15
                weights[options.index(sector_key)] = 3.0
            if runway < 4:
                weights[options.index("crisis")] = 4.0
            if press > 50:
                weights[options.index("growth_viral")] = 3.0
            total = sum(weights)
            r = random.uniform(0, total)
            c = 0
            for opt, w in zip(options, weights):
                c += w
                if r <= c:
                    return opt
            return "opinion"

        if runway < 3 or health < 30:
            return "crisis"
        if press > 60:
            return "growth_viral"
        if revenue > 50_000:
            return "growth_positive"
        if inv_conf > 70:
            return "funding_positive"
        if sector == "AI":
            return "sector_ai"
        if sector == "Healthcare":
            return "sector_healthcare"
        if sector == "Fintech":
            return "sector_fintech"
        return "opinion"

    def _category_sentiment(self, category: str) -> str:
        positive = {"funding_positive", "growth_positive", "growth_viral", "product_launch",
                    "sector_ai", "sector_healthcare", "sector_fintech", "acquisition"}
        negative = {"crisis", "funding_hard"}
        if category in positive:
            return "positive"
        if category in negative:
            return "negative"
        return "neutral"
