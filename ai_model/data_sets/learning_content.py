"""
Shared curriculum and skill metadata for the Startup Sandbox learning system.
"""

UNIVERSAL_ROUNDS = [
    {
        "id": "round-1-startup-foundations",
        "title": "Startup Foundations",
        "category": "universal",
        "unlock": {"type": "always"},
        "modules": [
            ("what-is-a-startup", "What is a Startup?", ["startup_strategy"], ["technical"]),
            ("solving-real-problems", "Solving Real Problems", ["startup_strategy", "customer_research"], ["technical"]),
            ("idea-validation", "Idea Validation", ["customer_research", "product_management"], ["technical"]),
            ("understanding-customers", "Understanding Customers", ["customer_research", "communication"], ["technical", "soft"]),
            ("mvp-basics", "MVP Basics", ["product_management"], ["technical"]),
            ("startup-mindset", "Startup Mindset", ["resilience", "decision_making"], ["soft"]),
            ("business-models", "Introduction to Business Models", ["startup_strategy", "finance"], ["technical"]),
            ("team-building-basics", "Team Building Basics", ["leadership", "team_handling"], ["soft"]),
            ("startup-failures", "Startup Failures", ["decision_making", "analytics"], ["technical", "soft"]),
            ("founder-psychology", "Founder Psychology", ["resilience", "emotional_intelligence"], ["soft"]),
        ],
    },
    {
        "id": "round-2-finance-revenue",
        "title": "Finance & Revenue",
        "category": "universal",
        "unlock": {"completed_round": "round-1-startup-foundations"},
        "modules": [
            ("burn-rate", "Burn Rate", ["finance"], ["technical"]),
            ("revenue-models", "Revenue Models", ["finance", "startup_strategy"], ["technical"]),
            ("profit-vs-growth", "Profit vs Growth", ["finance", "decision_making"], ["technical", "soft"]),
            ("runway-calculation", "Runway Calculation", ["finance", "analytics"], ["technical"]),
            ("pricing-strategies", "Pricing Strategies", ["finance", "marketing"], ["technical"]),
            ("unit-economics", "Unit Economics", ["finance", "analytics"], ["technical"]),
            ("investor-basics", "Investor Basics", ["fundraising", "communication"], ["technical", "soft"]),
            ("funding-stages", "Funding Stages", ["fundraising"], ["technical"]),
            ("financial-planning", "Financial Planning", ["finance", "operations"], ["technical"]),
            ("cash-flow-management", "Cash Flow Management", ["finance", "operations"], ["technical"]),
        ],
    },
    {
        "id": "round-3-branding-marketing",
        "title": "Branding & Marketing",
        "category": "universal",
        "unlock": {"completed_round": "round-2-finance-revenue"},
        "modules": [
            ("branding-basics", "Branding Basics", ["branding"], ["technical"]),
            ("customer-psychology", "Customer Psychology", ["marketing", "customer_research"], ["technical"]),
            ("marketing-funnels", "Marketing Funnels", ["marketing", "analytics"], ["technical"]),
            ("social-media-growth", "Social Media Growth", ["marketing", "branding"], ["technical"]),
            ("virality", "Virality", ["marketing", "analytics"], ["technical"]),
            ("customer-retention", "Customer Retention", ["marketing", "product_management"], ["technical"]),
            ("content-strategy", "Content Strategy", ["marketing", "branding"], ["technical"]),
            ("community-building", "Community Building", ["networking", "communication"], ["soft"]),
            ("conversion-optimization", "Conversion Optimization", ["marketing", "analytics"], ["technical"]),
            ("growth-metrics", "Growth Metrics", ["analytics", "scaling"], ["technical"]),
        ],
    },
    {
        "id": "round-4-product-scaling",
        "title": "Product & Scaling",
        "category": "universal",
        "unlock": {"completed_round": "round-3-branding-marketing"},
        "modules": [
            ("product-market-fit", "Product Market Fit", ["product_management", "startup_strategy"], ["technical"]),
            ("feedback-loops", "User Feedback Loops", ["product_management", "communication"], ["technical", "soft"]),
            ("scaling-teams", "Scaling Teams", ["scaling", "team_handling"], ["technical", "soft"]),
            ("operations", "Operations", ["operations"], ["technical"]),
            ("product-roadmaps", "Product Roadmaps", ["product_management"], ["technical"]),
            ("startup-culture", "Startup Culture", ["leadership", "team_handling"], ["soft"]),
            ("automation", "Automation", ["operations", "analytics"], ["technical"]),
            ("data-decisions", "Data-Driven Decisions", ["analytics", "decision_making"], ["technical", "soft"]),
            ("scaling-mistakes", "Scaling Mistakes", ["scaling", "decision_making"], ["technical", "soft"]),
            ("expansion-strategies", "Expansion Strategies", ["scaling", "startup_strategy"], ["technical"]),
        ],
    },
    {
        "id": "round-5-leadership-soft-skills",
        "title": "Leadership & Soft Skills",
        "category": "universal",
        "unlock": {"completed_round": "round-4-product-scaling"},
        "modules": [
            ("leadership-basics", "Leadership Basics", ["leadership"], ["soft"]),
            ("communication-skills", "Communication Skills", ["communication"], ["soft"]),
            ("negotiation", "Negotiation", ["negotiation"], ["soft"]),
            ("public-speaking", "Public Speaking", ["public_speaking"], ["soft"]),
            ("emotional-intelligence", "Emotional Intelligence", ["emotional_intelligence"], ["soft"]),
            ("crisis-management", "Crisis Management", ["crisis_management"], ["soft"]),
            ("team-motivation", "Team Motivation", ["leadership", "team_handling"], ["soft"]),
            ("decision-making", "Decision Making", ["decision_making"], ["soft"]),
            ("networking", "Networking", ["networking"], ["soft"]),
            ("founder-resilience", "Founder Resilience", ["resilience"], ["soft"]),
        ],
    },
]

SECTOR_PATHS = [
    {
        "id": "ai-ml-entrepreneurship",
        "title": "AI/ML Entrepreneurship",
        "category": "sector",
        "sector": "ai_ml",
        "unlock": {"completed_round": "round-5-leadership-soft-skills", "min_retention_score": 70},
        "modules": ["AI Startup Ecosystem", "AI Business Models", "SaaS vs AI Products", "GPU Costs & Scaling", "AI Ethics", "AI Monetization", "Building AI Teams", "AI Product Strategy", "Data Flywheels", "AI Startup Case Studies"],
    },
    {
        "id": "healthcare-startup",
        "title": "Healthcare Startup",
        "category": "sector",
        "sector": "healthcare",
        "unlock": {"completed_round": "round-5-leadership-soft-skills", "min_trust_score": 70},
        "modules": ["Healthcare Startup Basics", "Medical Regulations", "Patient Trust", "Healthcare Operations", "Medical Data Privacy", "Compliance Systems", "Healthcare Product Validation", "Scaling Healthcare Services", "Healthcare Funding", "Healthcare Case Studies"],
    },
    {
        "id": "ecommerce-startup",
        "title": "Ecommerce Startup",
        "category": "sector",
        "sector": "ecommerce",
        "unlock": {"completed_round": "round-5-leadership-soft-skills"},
        "modules": ["Ecommerce Foundations", "Conversion Funnels", "Retention Loops", "Influencer Marketing", "Customer Lifetime Value", "Logistics Management", "Inventory Scaling", "Marketplace Psychology", "Ecommerce Branding", "Ecommerce Case Studies"],
    },
    {
        "id": "fintech-startup",
        "title": "Fintech Startup",
        "category": "sector",
        "sector": "fintech",
        "unlock": {"completed_round": "round-5-leadership-soft-skills", "min_finance_score": 70},
        "modules": ["Fintech Basics", "Banking Systems", "Fraud Prevention", "Compliance & Regulations", "Investor Trust", "Payment Systems", "Risk Management", "Financial Product Design", "Scaling Fintech", "Fintech Case Studies"],
    },
]

SKILLS = [
    "finance", "startup_strategy", "marketing", "branding", "product_management",
    "scaling", "operations", "fundraising", "analytics", "leadership",
    "communication", "negotiation", "emotional_intelligence", "networking",
    "public_speaking", "crisis_management", "confidence", "decision_making",
    "resilience", "team_handling", "customer_research",
]

SKILL_LABELS = {
    "ai_ml": "AI/ML",
    "customer_research": "Customer Research",
    "emotional_intelligence": "Emotional Intelligence",
}


def slugify(text):
    return text.lower().replace("&", "and").replace("/", "-").replace(" ", "-").replace("?", "").replace(",", "")


def all_rounds():
    rounds = []
    for round_index, round_data in enumerate(UNIVERSAL_ROUNDS, start=1):
        modules = []
        for module_index, item in enumerate(round_data["modules"], start=1):
            module_id, title, skills, skill_types = item
            modules.append({
                "id": module_id,
                "title": title,
                "roundId": round_data["id"],
                "roundTitle": round_data["title"],
                "category": "universal",
                "round": round_index,
                "module": module_index,
                "skills": skills,
                "skillTypes": skill_types,
                "xp": 50 + (round_index * 5),
                "challengeXp": 25,
            })
        rounds.append({**round_data, "round": round_index, "modules": modules})

    sector_round_start = len(rounds) + 1
    for path_index, path in enumerate(SECTOR_PATHS, start=sector_round_start):
        modules = []
        for module_index, title in enumerate(path["modules"], start=1):
            modules.append({
                "id": f"{path['sector']}-{slugify(title)}",
                "title": title,
                "roundId": path["id"],
                "roundTitle": path["title"],
                "category": "sector",
                "sector": path["sector"],
                "round": path_index,
                "module": module_index,
                "skills": _sector_skills(path["sector"], title),
                "skillTypes": ["technical"] if "Trust" not in title and "Teams" not in title else ["technical", "soft"],
                "xp": 90,
                "challengeXp": 40,
            })
        rounds.append({**path, "round": path_index, "modules": modules})
    return rounds


def all_modules():
    return [module for round_data in all_rounds() for module in round_data["modules"]]


def module_by_id(module_id):
    return next((m for m in all_modules() if m["id"] == module_id), None)


def skill_label(skill):
    return SKILL_LABELS.get(skill, skill.replace("_", " ").title())


def _sector_skills(sector, title):
    base = {
        "ai_ml": ["product_management", "analytics", "scaling"],
        "healthcare": ["operations", "customer_research", "fundraising"],
        "ecommerce": ["marketing", "branding", "operations"],
        "fintech": ["finance", "operations", "fundraising"],
    }.get(sector, ["startup_strategy"])
    if "Compliance" in title or "Regulations" in title:
        return [base[0], "decision_making", "operations"]
    if "Trust" in title or "Teams" in title:
        return [base[0], "leadership", "communication"]
    return base[:2]
