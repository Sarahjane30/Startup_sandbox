"""Sector-specific monthly strategic question bank.

Each sector generates 40 concrete operating questions. A run samples 24
without replacement, so a full 24-month playthrough sees a fresh question
every month while staying sector-specific.
"""

import random


SECTOR_PROFILES = {
    "AI": {
        "buyer": "enterprise ops leader",
        "competitor": "a foundation-model platform",
        "regulator": "AI safety reviewer",
        "angel": "an ex-OpenAI angel",
        "investor": "infrastructure-focused VC",
        "trust": "model reliability",
        "companies": ["OpenAI", "Anthropic", "Perplexity", "Databricks", "Harvey"],
    },
    "Healthcare": {
        "buyer": "hospital innovation director",
        "competitor": "clinical workflow startup",
        "regulator": "FDA policy team",
        "angel": "physician angel operator",
        "investor": "healthtech seed fund",
        "trust": "clinical safety",
        "companies": ["Abridge", "Nabla", "Tempus", "Oscar Health", "Commure"],
    },
    "Fintech": {
        "buyer": "finance operations lead",
        "competitor": "embedded finance platform",
        "regulator": "banking compliance examiner",
        "angel": "former Stripe operator",
        "investor": "fintech specialist fund",
        "trust": "money movement trust",
        "companies": ["Stripe", "Plaid", "Brex", "Ramp", "Wise"],
    },
    "Retail": {
        "buyer": "repeat customer segment",
        "competitor": "well-funded DTC brand",
        "regulator": "consumer protection reviewer",
        "angel": "commerce marketplace angel",
        "investor": "consumer seed fund",
        "trust": "brand promise",
        "companies": ["Shopify", "Glossier", "Warby Parker", "Faire", "Shein"],
    },
    "EdTech": {
        "buyer": "school administrator",
        "competitor": "learning platform",
        "regulator": "student privacy reviewer",
        "angel": "former education founder",
        "investor": "future-of-work fund",
        "trust": "learning outcomes",
        "companies": ["Duolingo", "Coursera", "Quizlet", "Khan Academy", "Outschool"],
    },
    "Pet Care": {
        "buyer": "worried pet owner",
        "competitor": "vet telehealth platform",
        "regulator": "veterinary board reviewer",
        "angel": "pet marketplace angel",
        "investor": "consumer health angel syndicate",
        "trust": "veterinary trust",
        "companies": ["Chewy", "Rover", "Trupanion", "PetDesk", "Dutch"],
    },
    "SaaS": {
        "buyer": "operations manager",
        "competitor": "vertical SaaS incumbent",
        "regulator": "security reviewer",
        "angel": "B2B SaaS angel",
        "investor": "seed SaaS fund",
        "trust": "workflow reliability",
        "companies": ["Salesforce", "HubSpot", "Monday.com", "Notion", "Linear"],
    },
}


THEMES = [
    ("investor", "{investor} wants a sharper proof point before taking another meeting.", "Investor meeting"),
    ("angel", "{angel} offers a small check but wants monthly advisory control.", "Angel offer"),
    ("competitor", "{competitor} launches a similar wedge and starts posting customer logos.", "Competitor move"),
    ("regulatory", "{regulator} signals that {trust} claims will get more scrutiny.", "Regulatory pressure"),
    ("customer", "A {buyer} says the product is useful but not yet urgent enough to buy.", "Customer truth"),
    ("team", "The team is split between shipping faster and reducing hidden debt.", "Team tension"),
    ("pricing", "Users like the product, but the current pricing does not match perceived value.", "Pricing fork"),
    ("distribution", "A channel partner can bring leads, but they want margin and roadmap influence.", "Distribution fork"),
    ("trust", "One public mistake could damage {trust}; one strong proof point could unlock demand.", "Trust decision"),
    ("runway", "Cash is tight and every week spent learning has an opportunity cost.", "Runway squeeze"),
]


def _options(theme, profile):
    common = {
        "investor": [
            ("A", "Show traction dashboard", "Lead with usage, retention, and revenue signal.", {"investor_confidence": 7, "founder_stress": 2}, "fundraising"),
            ("B", "Ask for advice, not money", "Use the meeting to learn investor objections.", {"founder_credibility": 4, "investor_confidence": 3}, "investor discovery"),
            ("C", "Delay until proof improves", "Protect narrative quality but risk losing momentum.", {"product_quality": 3, "investor_confidence": -2}, "timing"),
            ("D", "Push for a bridge now", "Try to extend runway before metrics are ready.", {"cash": 50000, "dilution": 3, "investor_confidence": -5}, "fundraising"),
        ],
        "angel": [
            ("A", "Take the angel money", "Extend runway and accept advisory pressure.", {"cash": 25000, "dilution": 1.5, "investor_confidence": 2}, "cap table"),
            ("B", "Negotiate for operator help", "Trade a smaller check for specific weekly support.", {"cash": 12000, "founder_credibility": 5, "morale": 2}, "advisory leverage"),
            ("C", "Decline and stay focused", "Avoid distraction but keep runway thin.", {"founder_stress": 4, "product_quality": 2}, "focus"),
            ("D", "Convert them into customer intros", "Ask for distribution instead of capital.", {"customer_count": 6, "revenue": 1800, "investor_confidence": 2}, "network sales"),
        ],
        "competitor": [
            ("A", "Narrow the wedge", "Win one painful niche instead of fighting the whole market.", {"retention": 7, "competition_pressure": -4}, "positioning"),
            ("B", "Publish a comparison page", "Make the difference explicit and risky.", {"press_coverage": 5, "competition_pressure": 3}, "competitive messaging"),
            ("C", "Outship them this month", "Increase speed, but add team strain.", {"product_quality": 5, "founder_stress": 7, "tech_debt": 4}, "execution speed"),
            ("D", "Ignore the noise", "Protect focus but let the market narrative drift.", {"product_quality": 2, "investor_confidence": -3}, "focus"),
        ],
        "regulatory": [
            ("A", "Build the audit trail", "Make trust verifiable before buyers demand it.", {"regulatory_risk": -9, "product_quality": 3}, "compliance"),
            ("B", "Hire a specialist contractor", "Buy expertise without permanent headcount.", {"regulatory_risk": -6, "burn_rate": 0.04}, "expert hiring"),
            ("C", "Limit claims in-market", "Reduce legal risk but weaken the pitch.", {"regulatory_risk": -5, "press_coverage": -2}, "risk framing"),
            ("D", "Wait for clearer rules", "Save money now and risk delayed blockage.", {"cash": 2000, "regulatory_risk": 8}, "regulatory timing"),
        ],
        "customer": [
            ("A", "Interview lost users", "Learn why interest is not converting.", {"retention": 5, "nps": 5, "founder_stress": -2}, "customer discovery"),
            ("B", "Concierge the workflow", "Do manual work to learn the real job.", {"revenue": 2500, "retention": 6, "founder_stress": 5}, "manual MVP"),
            ("C", "Add the requested feature", "Move fast on demand, maybe too literally.", {"product_quality": 4, "tech_debt": 3}, "product judgment"),
            ("D", "Change the ICP", "Stop selling to weak-fit buyers.", {"customer_count": -4, "retention": 8}, "segmentation"),
        ],
        "team": [
            ("A", "Cut scope this month", "Protect quality and morale over roadmap theatre.", {"morale": 6, "tech_debt": -4, "press_coverage": -1}, "scope control"),
            ("B", "Run a focused sprint", "Push for one visible win.", {"product_quality": 5, "founder_stress": 5}, "sprint planning"),
            ("C", "Hire contractor help", "Add capacity at cash cost.", {"product_quality": 4, "burn_rate": 0.06, "morale": 3}, "capacity planning"),
            ("D", "Keep pressure high", "Maybe ship, but morale takes hidden damage.", {"product_quality": 4, "morale": -7, "burnout_risk": 6}, "people risk"),
        ],
        "pricing": [
            ("A", "Raise prices for new buyers", "Test willingness to pay without shocking old users.", {"revenue": 3500, "investor_confidence": 3}, "pricing"),
            ("B", "Create usage tiers", "Match value to heavier customers.", {"revenue": 2200, "product_quality": 2}, "packaging"),
            ("C", "Offer annual discount", "Pull cash forward with commitment risk.", {"cash": 12000, "revenue": 1200}, "cash conversion"),
            ("D", "Stay cheap for growth", "Grow logos but weaken seriousness.", {"customer_count": 8, "revenue": 400, "investor_confidence": -2}, "growth pricing"),
        ],
        "distribution": [
            ("A", "Pilot the channel", "Test partner leads with strict boundaries.", {"customer_count": 8, "revenue": 2500}, "partnerships"),
            ("B", "Demand exclusivity limits", "Protect future optionality.", {"investor_confidence": 3, "founder_stress": 2}, "deal design"),
            ("C", "Build direct sales instead", "Slower but cleaner learning.", {"customer_count": 3, "retention": 4}, "sales motion"),
            ("D", "Give them roadmap input", "Win distribution by sacrificing product control.", {"customer_count": 12, "tech_debt": 5}, "partner tradeoffs"),
        ],
        "trust": [
            ("A", "Publish proof and limits", "Earn trust by being explicit about what works.", {"reputation": 7, "regulatory_risk": -3}, "trust building"),
            ("B", "Add human review", "Increase safety with operational drag.", {"retention": 6, "burn_rate": 0.05}, "quality ops"),
            ("C", "Collect case studies", "Turn outcomes into credibility.", {"press_coverage": 4, "investor_confidence": 4}, "proof marketing"),
            ("D", "Keep claims aggressive", "Growth may rise, but trust risk compounds.", {"customer_count": 7, "regulatory_risk": 6}, "ethical marketing"),
        ],
        "runway": [
            ("A", "Reduce burn now", "Extend survival but slow momentum.", {"burn_rate": -0.10, "morale": -3}, "cash discipline"),
            ("B", "Chase paid pilots", "Turn urgency into revenue learning.", {"revenue": 5000, "founder_stress": 5}, "sales urgency"),
            ("C", "Pause non-core work", "Protect focus and quality.", {"product_quality": 4, "tech_debt": -3}, "prioritization"),
            ("D", "Fundraise under pressure", "Try for oxygen while the story is fragile.", {"cash": 35000, "dilution": 2.5, "investor_confidence": -4}, "fundraising timing"),
        ],
    }
    return [
        {
            "id": opt_id,
            "label": label,
            "description": desc,
            "effects": effects,
            "skill": skill,
            "why": f"In {profile['trust']} markets, this changes both visible metrics and hidden risk.",
        }
        for opt_id, label, desc, effects, skill in common[theme]
    ]


def build_sector_questions(sector):
    profile = SECTOR_PROFILES.get(sector) or SECTOR_PROFILES["SaaS"]
    questions = []
    for theme, context_template, title in THEMES:
        for variant in range(1, 5):
            context = context_template.format(**profile)
            questions.append({
                "id": f"{sector.lower().replace(' ', '_')}_{theme}_{variant}",
                "sector": sector,
                "theme": theme,
                "title": f"{title} {variant}",
                "prompt": context,
                "context": f"{profile['buyer']} pressure meets {profile['trust']} risk.",
                "options": _options(theme, profile),
                "companies": profile["companies"],
            })
    return questions


def build_question_deck(sector, seed, months=24):
    questions = build_sector_questions(sector)
    rng = random.Random(str(seed))
    rng.shuffle(questions)
    return questions[: max(1, min(months, 24))]


def question_for_month(deck, month):
    if not deck:
        return None
    index = max(0, min(len(deck) - 1, month - 1))
    return deck[index]


def resolve_question(question, answer_id):
    if not question:
        return None
    options = question.get("options") or []
    selected = next((option for option in options if option.get("id") == answer_id), None)
    if not selected:
        selected = options[0] if options else None
    if not selected:
        return None
    return {
        "questionId": question.get("id"),
        "answerId": selected.get("id"),
        "label": selected.get("label"),
        "description": selected.get("description"),
        "effects": selected.get("effects") or {},
        "skill": selected.get("skill"),
        "why": selected.get("why"),
    }


def final_report(agent, history, startup, deck):
    sector = agent.sector
    profile = SECTOR_PROFILES.get(sector) or SECTOR_PROFILES["SaaS"]
    skills = []
    if agent.investor_confidence < 45:
        skills.append("Fundraising narrative and investor objection handling")
    if agent.retention < 55:
        skills.append("Customer discovery, segmentation, and retention loops")
    if agent.regulatory_risk > 35:
        skills.append("Compliance strategy and trust-building")
    if agent.tech_debt > 45:
        skills.append("Technical debt control and product quality systems")
    if agent.founder_stress > 65:
        skills.append("Founder operating cadence and delegation")
    if not skills:
        skills.append("Scaling repeatable go-to-market without losing quality")
    return {
        "title": f"{sector} Founder Clarity Report",
        "summary": f"You completed {agent.current_month} months in a {sector} simulation. The report maps your operating habits to skill gaps and next analyses.",
        "scores": {
            "clarity": round((agent.retention + agent.product_quality + max(0, 100 - agent.regulatory_risk)) / 3),
            "fundraisingReadiness": round(agent.investor_confidence),
            "operatingDiscipline": round(max(0, 100 - agent.founder_stress / 2 - agent.tech_debt / 3)),
        },
        "skillsToLearn": skills[:5],
        "learningModules": [
            "Validation and customer discovery",
            "Pricing and monetization",
            "Fundraising readiness",
            "Moats and competitive positioning",
            "Startup finance and runway control",
        ],
        "companiesToAnalyze": profile["companies"],
        "questionCoverage": len(deck or []),
        "historyCount": len(history or []),
    }
