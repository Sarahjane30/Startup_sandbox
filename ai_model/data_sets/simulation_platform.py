"""JSON adapter for the Startup Sandbox simulation model.

This file connects the browser/server API to the local simulation model:
StartupAgent + SimulationEngine + ScenarioEngine + ProbabilityEngine.
"""

import json
import random
import sys

from simulation_engine import SimulationEngine
from startup_agent import StartupAgent
from investor_engine import InvestorEngine
from news_engine import NewsEngine
from pet_engine import PetEngine
from sector_questions import SECTOR_DECISION_BANK
from sector_question_bank import build_question_deck, question_for_month, resolve_question, final_report


OPERATING_CATEGORIES = [
    ("rnd", "R&D"),
    ("marketing", "Marketing"),
    ("compliance", "Compliance"),
    ("clinical_ops", "Clinical Ops"),
    ("hiring", "Hiring"),
    ("cloud", "Cloud Costs"),
    ("founder_salary", "Founder Salary"),
]


def safe_text(value, fallback=""):
    text = str(value or "").strip()
    return text if text else fallback


def number(value, fallback=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def clamp(value, low=0, high=100):
    return max(low, min(high, round(number(value), 2)))


def clamp_int(value, low=1, high=24):
    return int(max(low, min(high, round(number(value), 0))))


def infer_sector(startup):
    text = " ".join(str(startup.get(k, "")) for k in ["idea", "industry", "productType", "aiDependency"]).lower()
    if any(word in text for word in ["pet", "dog", "cat", "vet", "veterinary", "animal"]):
        return "Pet Care"
    if any(word in text for word in ["health", "medical", "patient", "clinic"]):
        return "Healthcare"
    if any(word in text for word in ["fintech", "bank", "payment", "finance", "insurance"]):
        return "Fintech"
    if any(word in text for word in ["ecommerce", "commerce", "retail", "marketplace", "shop"]):
        return "Retail"
    if any(word in text for word in ["education", "student", "school", "learning", "edtech"]):
        return "EdTech"
    if any(word in text for word in ["ai", "ml", "machine learning", "agent"]):
        return "AI"
    return safe_text(startup.get("industry"), "SaaS").title()


def founder_archetype(founder):
    raw = safe_text(founder.get("personality") or founder.get("founderType"), "Visionary").lower()
    if "technical" in raw:
        return "Engineer"
    if "marketer" in raw:
        return "Hustler"
    if "repeat" in raw:
        return "Serial"
    if "perfectionist" in raw:
        return "Cautious"
    return "Visionary"


def build_agent(founder, startup):
    cash = number(founder.get("money"), 25000)
    burn = max(500, number(founder.get("monthlyBurn"), 4000))
    team = max(1, int(number(founder.get("teamSize"), 2)))
    has_tech = safe_text(founder.get("technicalCofounder"), "Yes").lower() == "yes"
    stage = safe_text(startup.get("startupStage") or startup.get("stage"), "Idea")
    audience = safe_text(founder.get("audience"), "No audience").lower()
    experience = safe_text(founder.get("industryExperience"), "Medium").lower()
    risk = safe_text(founder.get("riskTolerance"), "Medium").lower()

    audience_boost = 20 if "large" in audience else 9 if "small" in audience else 0
    experience_boost = 12 if "high" in experience else -8 if "low" in experience else 0
    risk_boost = 8 if "high" in risk else -5 if "low" in risk else 0
    stage_revenue = 0
    customers = 20 + audience_boost + max(0, experience_boost)
    if "revenue" in stage.lower():
        stage_revenue = 2500
        customers += 30
    elif "launched" in stage.lower():
        customers += 18
    elif "mvp" in stage.lower():
        customers += 8

    agent = StartupAgent(
        name=safe_text(startup.get("name"), "Sandbox Startup"),
        sector=infer_sector(startup),
        stage=stage,
        tagline=safe_text(startup.get("idea"), "A new startup experiment")[:140],
        founder_name=safe_text(founder.get("name"), "Founder"),
        founder_archetype=founder_archetype(founder),
        cash=cash,
        funding=max(0, cash - 5000),
        burn_rate=burn,
        employees=team,
        revenue=stage_revenue,
        customer_count=max(0, int(customers)),
        mrr_growth=8 + audience_boost / 4 + max(0, experience_boost / 3),
        morale=clamp(58 + (8 if has_tech else -8) + risk_boost),
        retention=clamp(35 + experience_boost + (6 if has_tech else -5)),
        investor_confidence=clamp(28 + audience_boost + experience_boost),
        founder_stress=clamp(60 - min(cash / burn, 10) * 2 + (8 if "part" in safe_text(founder.get("timeCommitment")).lower() else 0)),
        innovation_score=clamp(55 + (10 if "ai" in safe_text(startup.get("aiDependency")).lower() else 0)),
        product_quality=clamp(42 + (12 if has_tech else -8) + max(0, experience_boost / 2)),
        tech_debt=clamp(30 + (18 if not has_tech else -8)),
        competition_pressure=clamp(38 + (8 if agent_sector_is_hot(infer_sector(startup)) else 0)),
    )
    agent.current_month = 0
    agent.recompute_derived()
    return agent


def simulation_month_limit(startup):
    return clamp_int((startup or {}).get("simulationMonths"), 1, 24)


def agent_sector_is_hot(sector):
    return sector in {"AI", "Fintech", "Healthcare", "Pet Care"}


def visible_from_agent(agent, risk_score=None, survival_probability=None):
    health = clamp(agent.startup_health)
    survival = round((survival_probability or 0) * 100) if survival_probability is not None else health
    raw_runway = round(agent.runway, 1)
    display_runway = min(raw_runway, 24)
    return {
        "cash": round(agent.cash),
        "runwayMonths": display_runway,
        "rawRunwayMonths": raw_runway,
        "runwayCapped": raw_runway > 24,
        "users": int(agent.customer_count),
        "revenue": round(agent.revenue),
        "retention": round(agent.retention),
        "equityLeft": round(max(0, 100 - getattr(agent, "dilution", 0))),
        "dilution": round(max(0, 100 - max(0, 100 - getattr(agent, "dilution", 0)))),
        "teamSize": int(agent.employees),
        "growth": clamp(agent.mrr_growth * 4, 0, 100),
        "healthScore": health,
        "founderStress": round(agent.founder_stress),
        "morale": round(agent.morale),
        "investorInterest": round(agent.investor_confidence),
        "technicalDebt": round(agent.tech_debt),
        "survivalProbability": survival,
        "riskScore": round(risk_score or 0),
    }


def hidden_from_agent(agent):
    return {
        "investorConfidence": round(agent.investor_confidence),
        "teamTrust": round(agent.morale),
        "marketHype": round(agent.press_coverage),
        "founderBurnout": round(agent.burnout_risk or agent.founder_stress),
        "competition": round(agent.competition_pressure),
        "virality": round(agent.mrr_growth * 3),
        "productQuality": round(agent.product_quality),
        "customerPain": round((agent.retention + agent.nps) / 2),
    }


def default_operating_budget(agent):
    available = max(0, min(agent.cash, max(agent.burn_rate * 1.2, 1000)))
    sector = agent.sector
    weights = {
        "rnd": 0.22,
        "marketing": 0.18,
        "compliance": 0.12,
        "clinical_ops": 0.10,
        "hiring": 0.14,
        "cloud": 0.14,
        "founder_salary": 0.10,
    }
    if sector == "Healthcare":
        weights.update({"compliance": 0.18, "clinical_ops": 0.17, "marketing": 0.11})
    elif sector == "AI":
        weights.update({"rnd": 0.28, "cloud": 0.20, "compliance": 0.08})
    elif sector == "Fintech":
        weights.update({"compliance": 0.22, "marketing": 0.14, "cloud": 0.12})
    elif sector == "Retail":
        weights.update({"marketing": 0.26, "clinical_ops": 0.04, "cloud": 0.08})

    total_weight = sum(weights.values()) or 1
    allocations = {key: round(available * weights[key] / total_weight) for key, _ in OPERATING_CATEGORIES}
    return {
        "cashAvailable": round(agent.cash),
        "suggestedSpend": round(available),
        "categories": [{"key": key, "label": label, "amount": allocations[key]} for key, label in OPERATING_CATEGORIES],
    }


def question_deck_for_state(agent, startup, previous_world=None):
    previous_world = previous_world or {}
    existing = previous_world.get("questionDeck")
    if existing:
        return existing
    return build_question_deck(agent.sector, agent.startup_id, simulation_month_limit(startup))


def actors_for_state(agent, previous_world=None):
    previous_world = previous_world or {}
    if previous_world.get("actors"):
        return previous_world["actors"]
    pools = {
        "AI": ("Northstar Ventures", "Maya Chen", "VectorPilot"),
        "Healthcare": ("Cedar Health Fund", "Dr. Rhea Kapoor", "Synapse Health"),
        "Fintech": ("Ledger Seed Partners", "Arjun Mehta", "FlowPay"),
        "Retail": ("MarketLoop Capital", "Nina Alvarez", "BrightCart"),
        "EdTech": ("Future Skills Fund", "Omar Reed", "LearnStack"),
        "Pet Care": ("Companion Angels", "Priya Nair", "Vetly"),
        "SaaS": ("Operator Seed Fund", "Samir Cole", "WorkGrid"),
    }
    investor, angel, competitor = pools.get(agent.sector, pools["SaaS"])
    return {
        "investor": {"name": investor, "mood": "watching traction", "signal": round(agent.investor_confidence)},
        "angel": {"name": angel, "mood": "open to helping", "signal": round(agent.founder_credibility)},
        "competitor": {"name": competitor, "mood": "moving loudly", "signal": round(agent.competition_pressure)},
    }


def sanitize_allocation(allocation, agent):
    raw = {key: max(0, number((allocation or {}).get(key), 0)) for key, _ in OPERATING_CATEGORIES}
    total = sum(raw.values())
    if total > agent.cash and total > 0:
        scale = agent.cash / total
        raw = {key: round(value * scale, 2) for key, value in raw.items()}
    return raw


def ratio(amount, total):
    if total <= 0:
        return 0
    return amount / total


def allocation_effects(agent, allocation):
    total = sum(allocation.values())
    spend = max(total, 1)
    founder_share = ratio(allocation["founder_salary"], spend)
    rnd_share = ratio(allocation["rnd"], spend)
    marketing_share = ratio(allocation["marketing"], spend)
    build_share = rnd_share + marketing_share + ratio(allocation["clinical_ops"], spend) + ratio(allocation["cloud"], spend)
    effects = {}
    effects["product_quality"] = rnd_share * 18 - 3
    effects["tech_debt"] = -rnd_share * 10 + (5 if allocation["rnd"] < spend * 0.12 else 0)
    effects["customer_count"] = int(marketing_share * max(4, agent.customer_count * 0.35 + 12))
    effects["competition_pressure"] = marketing_share * 4
    effects["regulatory_risk"] = -ratio(allocation["compliance"], spend) * 16 + (6 if allocation["compliance"] < spend * 0.08 else 0)
    effects["investor_confidence"] = ratio(allocation["compliance"], spend) * 8 + marketing_share * 3
    effects["retention"] = ratio(allocation["clinical_ops"], spend) * 12 + ratio(allocation["cloud"], spend) * 4
    effects["revenue"] = allocation["marketing"] * 0.35 + allocation["clinical_ops"] * 0.45
    effects["morale"] = ratio(allocation["hiring"], spend) * 8 + founder_share * 4 - (3 if total > agent.burn_rate * 1.4 else 0)
    effects["founder_stress"] = -founder_share * 10 + (6 if allocation["founder_salary"] < spend * 0.05 else 0)
    if allocation["cloud"] < spend * 0.08:
        effects["product_quality"] -= 5
        effects["retention"] -= 4
    if founder_share > 0.35:
        excess = founder_share - 0.35
        effects["product_quality"] -= 10 + excess * 28
        effects["tech_debt"] += 8 + excess * 25
        effects["customer_count"] -= int(max(2, agent.customer_count * (0.08 + excess * 0.18)))
        effects["retention"] -= 5 + excess * 16
        effects["investor_confidence"] -= 10 + excess * 26
        effects["morale"] -= 7 + excess * 18
        effects["reputation"] = effects.get("reputation", 0) - (3 + excess * 10)
        effects["founder_stress"] += 4 + excess * 8
        effects["revenue"] -= min(agent.revenue * (0.15 + excess), total * excess * 0.35)
    if build_share < 0.35:
        gap = 0.35 - build_share
        effects["product_quality"] -= gap * 18
        effects["tech_debt"] += gap * 20
        effects["investor_confidence"] -= gap * 16
        effects["retention"] -= gap * 12
    agent.burn_rate = max(500, total)
    return effects


def allocation_warnings(allocation):
    total = sum(allocation.values()) or 1
    founder_share = ratio(allocation.get("founder_salary", 0), total)
    productive_share = sum(allocation.get(k, 0) for k in ["rnd", "marketing", "clinical_ops", "cloud"]) / total
    warnings = []
    if founder_share > 0.35:
        warnings.append("Founder salary dominated the budget. Investors read that as poor operating discipline, and product/growth loops lost oxygen.")
    if productive_share < 0.35:
        warnings.append("Too little went into product, growth, customer learning, or infrastructure. The company preserved comfort while starving traction.")
    if ratio(allocation.get("rnd", 0), total) < 0.10:
        warnings.append("R&D was underfunded, so product quality and technical debt worsened.")
    if ratio(allocation.get("marketing", 0), total) < 0.08:
        warnings.append("Marketing was underfunded, so customer growth slowed and the fundraising story weakened.")
    return warnings


def random_market_event(agent, allocation):
    events = [
        {
            "type": "competitor",
            "title": "Competitor Funding",
            "message": f"A rival in {agent.sector} announces a fresh round and starts courting your best prospects.",
            "effects": {"competition_pressure": 8, "investor_confidence": -4},
            "trigger": True,
        },
        {
            "type": "regulatory",
            "title": "Regulatory Draft Guidance",
            "message": "New guidance increases audit expectations for products in your category.",
            "effects": {"regulatory_risk": 7 if allocation.get("compliance", 0) < sum(allocation.values()) * 0.12 else -5, "investor_confidence": -2},
            "trigger": agent.sector in {"Healthcare", "Fintech", "AI"},
        },
        {
            "type": "team",
            "title": "Team Burnout Signal",
            "message": "A senior teammate admits the last few crunch weeks are starting to hurt.",
            "effects": {"morale": -7, "founder_stress": 6},
            "trigger": allocation.get("hiring", 0) < sum(allocation.values()) * 0.10 or agent.founder_stress > 70,
        },
        {
            "type": "governance",
            "title": "Investor Salary Concern",
            "message": "An investor notices founder pay is absorbing the operating budget while product and growth are thin.",
            "effects": {"investor_confidence": -10, "founder_credibility": -7, "reputation": -3},
            "trigger": allocation.get("founder_salary", 0) > sum(allocation.values()) * 0.40,
        },
        {
            "type": "user",
            "title": "Organic User Praise",
            "message": "A customer posts publicly that the product saved them real time this week.",
            "effects": {"customer_count": 8, "press_coverage": 6, "investor_confidence": 3},
            "trigger": agent.product_quality > 50,
        },
        {
            "type": "product",
            "title": "Reliability Incident",
            "message": "A messy edge case makes users question whether the product is ready for serious deployment.",
            "effects": {"retention": -6, "reputation": -5, "founder_stress": 5},
            "trigger": allocation.get("cloud", 0) < sum(allocation.values()) * 0.09 or agent.tech_debt > 55,
        },
    ]
    pool = [event for event in events if event["trigger"]]
    if not pool or random.random() > 0.82:
        return None
    event = random.choice(pool)
    apply_micro_effects(agent, event["effects"])
    return {k: v for k, v in event.items() if k != "trigger"}


def pending_from_allocation(agent, allocation, previous_pending=None):
    pending = [item for item in (previous_pending or []) if item.get("dueMonth", 0) > agent.current_month]
    total = sum(allocation.values()) or 1
    if ratio(allocation["compliance"], total) < 0.08:
        pending.append({
            "dueMonth": agent.current_month + random.randint(2, 4),
            "type": "compliance_debt",
            "message": "A buyer legal review blocks deployment because compliance work was delayed earlier.",
            "effects": {"regulatory_risk": 12, "investor_confidence": -8, "revenue": -2500},
        })
    if ratio(allocation["cloud"], total) < 0.08:
        pending.append({
            "dueMonth": agent.current_month + random.randint(1, 3),
            "type": "infra_debt",
            "message": "Underfunded infrastructure causes a reliability week right when usage picks up.",
            "effects": {"retention": -8, "product_quality": -6, "founder_stress": 7},
        })
    if ratio(allocation["marketing"], total) > 0.32 and ratio(allocation["rnd"], total) < 0.16:
        pending.append({
            "dueMonth": agent.current_month + random.randint(2, 3),
            "type": "leaky_growth",
            "message": "The marketing spike exposes weak onboarding. New users arrive, then drift away.",
            "effects": {"retention": -10, "churn_rate": 5, "reputation": -4},
        })
    if ratio(allocation["founder_salary"], total) > 0.35:
        pending.append({
            "dueMonth": agent.current_month + random.randint(1, 2),
            "type": "salary_overhang",
            "message": "The team and investors question why founder salary outran company-building spend.",
            "effects": {"morale": -10, "investor_confidence": -12, "founder_credibility": -8, "product_quality": -5},
        })
    return pending[-6:]


def generate_actor_offer(agent, previous_world=None):
    previous_world = previous_world or {}
    existing = previous_world.get("pendingActorOffer")
    if existing and not existing.get("resolved"):
        return existing

    investor_engine = InvestorEngine()
    confidence = agent.investor_confidence
    runway = agent.runway
    health = agent.startup_health
    salary_red_flag = (
        agent.founder_credibility < 45
        or agent.morale < 35
        or (agent.investor_confidence < 20 and agent.product_quality < 35 and agent.tech_debt > 45)
    )

    if salary_red_flag:
        return {
            "id": f"warning-{agent.current_month}-{random.randint(100, 999)}",
            "type": "warning",
            "from": "Advisor",
            "title": "Governance Warning",
            "message": "The budget pattern looks founder-first, not company-first. Fix it or funding conversations will get colder.",
            "amount": 0,
            "dilution": 0,
            "acceptLabel": "Commit to leaner founder pay",
            "declineLabel": "Ignore warning",
        }

    if confidence >= 52 and health >= 45 and random.random() < 0.34:
        round_result = investor_engine.simulate_funding_round(agent.__dict__, max(0.25, agent.founder_credibility / 100))
        if round_result.get("success"):
            amount = max(25000, round_result.get("amount", 0))
            dilution = min(22, max(4, round(amount / max(agent.valuation, 250000) * 100, 1)))
            return {
                "id": f"offer-{agent.current_month}-{random.randint(100, 999)}",
                "type": "investment",
                "from": round_result.get("investor_name") or "Seed investor",
                "title": "Investment Offer",
                "message": round_result.get("investor_email", {}).get("body") or round_result.get("narrative"),
                "amount": round(amount),
                "dilution": dilution,
                "acceptLabel": f"Accept ${round(amount):,}",
                "declineLabel": "Decline terms",
            }

    if runway < 4 and random.random() < 0.42:
        amount = max(10000, round(min(agent.burn_rate * 2.5, 150000) / 5000) * 5000)
        dilution = min(30, max(8, round(amount / max(agent.valuation * 0.65, 100000) * 100, 1)))
        return {
            "id": f"bridge-{agent.current_month}-{random.randint(100, 999)}",
            "type": "bridge",
            "from": "Emergency Angel",
            "title": "Bridge Money Offer",
            "message": "I can wire a small bridge, but the terms are expensive because runway is tight.",
            "amount": amount,
            "dilution": dilution,
            "acceptLabel": f"Accept bridge",
            "declineLabel": "Stay independent",
        }

    return None


def apply_actor_decision(agent, offer, decision):
    if not offer or not decision:
        return None
    action = safe_text(decision.get("action")).lower()
    if action not in {"accept", "decline"}:
        return None
    if offer.get("type") in {"investment", "bridge"}:
        if action == "accept":
            apply_micro_effects(agent, {
                "cash": number(offer.get("amount"), 0),
                "funding": number(offer.get("amount"), 0),
                "dilution": number(offer.get("dilution"), 0),
                "investor_confidence": 8,
                "founder_stress": -6,
            })
            return f"Accepted {offer.get('title', 'offer')} from {offer.get('from')}: +${round(number(offer.get('amount'), 0)):,}, {offer.get('dilution')}% dilution."
        apply_micro_effects(agent, {"investor_confidence": -3, "founder_credibility": 2, "founder_stress": 3})
        return f"Declined {offer.get('title', 'offer')} from {offer.get('from')}. You kept equity but added runway pressure."
    if offer.get("type") == "warning":
        if action == "accept":
            apply_micro_effects(agent, {"founder_credibility": 8, "investor_confidence": 5, "founder_stress": 4})
            return "Accepted the governance warning. Investors regained some trust, but the founder feels the constraint."
        apply_micro_effects(agent, {"founder_credibility": -8, "investor_confidence": -8, "morale": -5})
        return "Ignored the governance warning. The agent network now treats founder discipline as a risk."
    return None


def apply_due_consequences(agent, pending):
    due = []
    remaining = []
    for item in pending or []:
        if item.get("dueMonth", 0) <= agent.current_month:
            due.append(item)
            apply_micro_effects(agent, item.get("effects") or {})
        else:
            remaining.append(item)
    return due, remaining


def operating_analysis(allocation, market_event=None, due=None):
    total = sum(allocation.values()) or 1
    high = max(allocation.items(), key=lambda item: item[1])[0]
    low = min(allocation.items(), key=lambda item: item[1])[0]
    labels = dict(OPERATING_CATEGORIES)
    positives = {
        "rnd": "Product quality and long-term retention got oxygen.",
        "marketing": "Acquisition pressure increased and the market heard from you.",
        "compliance": "Trust, procurement readiness, and regulatory resilience improved.",
        "clinical_ops": "Customer workflow learning and retention improved.",
        "hiring": "Team capacity improved and morale had more support.",
        "cloud": "Reliability and user experience were protected.",
        "founder_salary": "Founder burnout risk was treated as an operating risk.",
    }
    sacrifices = {
        "rnd": "Less R&D can create hidden product and technical debt.",
        "marketing": "Less marketing can slow the fundraising story even if the product improves.",
        "compliance": "Less compliance can become a delayed procurement or regulatory block.",
        "clinical_ops": "Less customer ops can make churn look random until it is too late.",
        "hiring": "Less hiring keeps burn lean but can silently damage morale.",
        "cloud": "Less infrastructure spend can turn growth into reliability pain.",
        "founder_salary": "Less founder pay extends cash but raises burnout risk.",
    }
    tradeoffs = [
        f"Highest allocation: {labels.get(high, high)} at {round(ratio(allocation[high], total) * 100)}%. {positives[high]}",
        f"Lowest allocation: {labels.get(low, low)} at {round(ratio(allocation[low], total) * 100)}%. {sacrifices[low]}",
    ]
    if market_event:
        tradeoffs.append(f"External shock: {market_event['title']}. {market_event['message']}")
    for item in due or []:
        tradeoffs.append(f"Delayed consequence: {item.get('message')}")
    return {
        "beginnerChoice": "Beginner founders optimize one visible metric and miss the constraints moving underneath it.",
        "smartChoice": "Experienced founders manage tradeoff loops: growth, trust, quality, runway, and team capacity.",
        "why": "This month was resolved from resource allocation, external shocks, hidden variables, and delayed consequences.",
        "tradeoffs": tradeoffs,
    }


def operating_analysis_with_question(allocation, question_result=None, market_event=None, due=None):
    lesson = operating_analysis(allocation, market_event, due)
    if question_result:
        lesson["tradeoffs"].insert(
            0,
            f"Strategic answer: {question_result.get('label')}. {question_result.get('description')} Skill tested: {question_result.get('skill')}."
        )
        lesson["why"] = f"{lesson['why']} The strategic question added sector-specific judgment on {question_result.get('skill')}."
    return lesson


def apply_micro_effects(agent, effects):
    if not effects:
        return
    engine = SimulationEngine(agent)
    engine._apply_effects(effects)
    agent.recompute_derived()


def enrich_world(agent, previous=None):
    previous = previous or {}
    news_engine = NewsEngine()
    pet_engine = PetEngine()
    previous_pet = previous.get("pet") or {}
    profile = previous_pet.get("profile")
    if profile:
        pet_engine.adopt_pet(profile.get("name"))
    else:
        profile = pet_engine.adopt_pet()
        apply_micro_effects(agent, {"morale": profile.get("morale_bonus", 0)})

    pet_event = pet_engine.monthly_pet_event(agent.__dict__)
    culture_event = pet_engine.monthly_culture_event(agent.__dict__)
    for event in [pet_event, culture_event]:
        if event:
            apply_micro_effects(agent, event.get("effects") or {})

    news_feed = news_engine.generate_news_feed(agent.__dict__, count=3)
    return {
        "news": news_feed,
        "pet": {
            "profile": profile,
            "status": pet_engine.pet_status(),
            "events": [event for event in [pet_event, culture_event] if event],
        },
    }


def normalize_choices(scenario):
    choices = playable_choices(scenario)
    ids = ["A", "B", "C", "D"]
    normalized = []
    for index, choice in enumerate(choices[:4]):
        normalized.append({
            "id": ids[index],
            "key": choice.get("key", ids[index]),
            "label": choice.get("label", f"Option {ids[index]}"),
            "description": describe_choice(choice),
            "type": choice.get("type", "decision"),
        })
    return normalized


def playable_choices(scenario):
    choices = list(scenario.get("choices") or [])
    sector = scenario.get("sector") or "AI"
    bank = SECTOR_DECISION_BANK.get(sector) or SECTOR_DECISION_BANK["AI"]
    fallback_templates = bank["choices"]
    existing = {choice.get("key") for choice in choices}
    for key, label, choice_type, good_effects, drag_effects, good_text, drag_text in fallback_templates:
        if len(choices) >= 4:
            break
        if key in existing:
            continue
        choices.append({
            "key": key,
            "label": label,
            "type": choice_type,
            "outcomes": [
                {
                    "label": "Signal improves",
                    "weight": 0.56,
                    "sentiment": "positive",
                    "effects": good_effects,
                    "narrative": good_text,
                },
                {
                    "label": "Tradeoff appears",
                    "weight": 0.44,
                    "sentiment": "neutral",
                    "effects": drag_effects,
                    "narrative": drag_text,
                },
            ],
        })
    return choices[:4]


def playable_scenario(scenario):
    return {**(scenario or {}), "choices": playable_choices(scenario or {})}


def describe_choice(choice):
    outcomes = choice.get("outcomes") or []
    positive = next((o for o in outcomes if o.get("sentiment") == "positive"), None)
    if positive:
        return positive.get("narrative", "")[:150]
    return safe_text(choice.get("description"), f"A {choice.get('type', 'strategic')} decision with probabilistic consequences.")


def scenario_to_round(scenario, agent):
    return {
        "month": agent.current_month,
        "stage": agent.stage,
        "title": scenario.get("title", "Founder Decision"),
        "narrative": scenario.get("narrative", "The next move changes your runway, team, and market signal."),
        "randomEvent": scenario.get("sector_note") or scenario.get("triggered_by", ""),
        "events": [scenario.get("narrative", ""), scenario.get("sector_note", "")],
        "choices": normalize_choices(scenario),
    }


def chart_point(label, visible, previous=None):
    previous = previous or {}
    labels = list(previous.get("labels") or [])
    users = list(previous.get("users") or [])
    revenue = list(previous.get("revenue") or [])
    runway = list(previous.get("runway") or [])
    health = list(previous.get("health") or [])
    equity = list(previous.get("equity") or [])
    point = {
        "users": visible["users"],
        "revenue": visible["revenue"],
        "runway": visible["runwayMonths"] if visible["runwayMonths"] < 900 else 24,
        "health": visible["healthScore"],
        "equity": visible["equityLeft"],
    }
    if labels and labels[-1] == label:
        users[-1] = point["users"]
        revenue[-1] = point["revenue"]
        runway[-1] = point["runway"]
        health[-1] = point["health"]
        equity[-1] = point["equity"]
    else:
        labels.append(label)
        users.append(point["users"])
        revenue.append(point["revenue"])
        runway.append(point["runway"])
        health.append(point["health"])
        equity.append(point["equity"])
    return {
        "labels": labels[-10:],
        "users": users[-10:],
        "revenue": revenue[-10:],
        "runway": runway[-10:],
        "health": health[-10:],
        "equity": equity[-10:],
    }


def lesson_from_outcome(outcome=None):
    if not outcome:
        return {
            "beginnerChoice": "Beginner founders often chase visible progress before the hard signal is proven.",
            "smartChoice": "Experienced founders watch the system: runway, team trust, customer pain, and investor confidence.",
            "why": "The model updates all of those variables together, so a decision can help one metric while quietly hurting another.",
        }
    if outcome.get("lesson"):
        return outcome["lesson"]
    return {
        "beginnerChoice": "Beginner founders judge the choice only by the immediate outcome.",
        "smartChoice": "Experienced founders ask what the choice did to future optionality.",
        "why": outcome.get("narrative", "Every decision changes the state of the company, not just the current month."),
    }


def package_output(agent, scenario, founder, startup, history=None, previous_chart=None, outcome=None, status="alive", previous_world=None, pending=None, market_event=None, due_consequences=None, actor_note=None, force_actor_offer=False):
    engine = SimulationEngine(agent)
    scenario = playable_scenario(scenario or {})
    world = enrich_world(agent, previous_world)
    question_deck = question_deck_for_state(agent, startup, previous_world)
    strategic_question = question_for_month(question_deck, max(agent.current_month, 1))
    actors = actors_for_state(agent, previous_world)
    risk = engine.prob.compute_risk_score(agent.__dict__)
    survival = engine.prob.survival_probability(agent.__dict__)
    visible = visible_from_agent(agent, risk, survival)
    round_data = scenario_to_round(scenario or {}, agent)
    if status == "completed":
        round_data["choices"] = []
        round_data["title"] = "Simulation Complete"
        round_data["narrative"] = f"You reached Month {agent.current_month}. This run is capped at {simulation_month_limit(startup)} months."
    chart = chart_point(f"Month {agent.current_month}", visible, previous_chart)
    summary = build_summary(agent, visible, outcome, status)
    actor_offer = None if actor_note else generate_actor_offer(agent, previous_world)
    if status == "completed" and not force_actor_offer:
        actor_offer = None
    return {
        "summary": summary,
        "patternMatch": pattern_match(agent, visible),
        "founder": founder,
        "startup": startup,
        "visible": visible,
        "hidden": hidden_from_agent(agent),
        "topMetrics": {
            "survivabilityScore": visible["survivalProbability"],
            "fundingLikelihood": visible["investorInterest"],
            "marketFitScore": round((visible["retention"] + visible["growth"]) / 2),
            "burnRunway": "24+ months" if visible.get("runwayCapped") else f"{visible['runwayMonths']} months",
        },
        "round": round_data,
        "lesson": lesson_from_outcome(outcome),
        "chartData": chart,
        "history": history or [],
        "timeline": [{
            "period": f"Month {agent.current_month}",
            "title": round_data["title"],
            "narrative": round_data["narrative"],
            "metrics": {
                "users": f"{visible['users']:,} users",
                "revenue": f"${visible['revenue']:,}",
                "retention": f"{visible['retention']}%",
                "keyEvent": round_data.get("randomEvent", ""),
            },
        }],
        "modelState": agent.to_dict(),
        "modelScenario": scenario,
        "operatingBudget": default_operating_budget(agent),
        "strategicQuestion": None if status == "completed" else strategic_question,
        "questionDeck": question_deck,
        "actors": actors,
        "pendingConsequences": pending if pending is not None else (previous_world or {}).get("pendingConsequences", []),
        "marketEvent": market_event,
        "dueConsequences": due_consequences or [],
        "pendingActorOffer": actor_offer,
        "actorNote": actor_note,
        "countdownSeconds": 15,
        "news": world["news"],
        "pet": world["pet"],
        "maxMonths": simulation_month_limit(startup),
        "engine": "python-startup-agent-simulation-model",
        "status": status,
        "finalReport": final_report(agent, history or [], startup, question_deck) if status == "completed" else None,
    }


def build_summary(agent, visible, outcome, status):
    if status != "alive":
        if status == "completed":
            return f"Simulation complete at Month {agent.current_month}. You stayed inside the selected run length and ended with ${visible['cash']:,}, {visible['runwayMonths']}{'+' if visible.get('runwayCapped') else ''} months runway, and {visible['users']:,} users."
        return f"The model marked this startup as {status.replace('_', ' ')}. Cash, morale, and stress pushed the company past a failure condition."
    if outcome:
        return f"{outcome.get('narrative', outcome.get('label', 'Decision applied'))} You now have ${visible['cash']:,}, {visible['runwayMonths']}{'+' if visible.get('runwayCapped') else ''} months runway, and {visible['users']:,} users."
    return f"Your {agent.sector} startup begins with ${visible['cash']:,}, {visible['runwayMonths']}{'+' if visible.get('runwayCapped') else ''} months runway, {visible['users']:,} early users, and {visible['healthScore']}/100 health."


def pattern_match(agent, visible):
    if visible["runwayMonths"] <= 3:
        return "Your path currently resembles cash-constrained startups that must learn faster than they spend."
    if visible["technicalDebt"] > 60:
        return "Your path currently resembles product-led teams that gained users before the system was stable."
    if visible["investorInterest"] > 65:
        return "Your path currently resembles startups where narrative and traction are beginning to reinforce each other."
    return "Your path currently resembles early founder-led validation: small signal, fragile runway, and a need for sharper customer proof."


def start(payload):
    founder = payload.get("founder") or {}
    startup = payload.get("startup") or {}
    agent = build_agent(founder, startup)
    engine = SimulationEngine(agent)
    agent.current_month = 1
    scenario = engine.scenario_eng.pick_scenario(agent)
    return package_output(agent, scenario, founder, startup, status="alive")


def decision(payload):
    state = payload.get("state") or {}
    choice_id = safe_text(payload.get("choiceId"))
    allocation_payload = payload.get("allocation") or {}
    strategic_answer = safe_text(payload.get("strategicAnswer"))
    actor_decision = payload.get("actorDecision") or {}
    agent = StartupAgent.from_dict(state.get("modelState") or {})
    scenario = state.get("modelScenario") or {}
    scenario = playable_scenario(scenario)
    engine = SimulationEngine(agent)
    requested_total = sum(max(0, number((allocation_payload or {}).get(key), 0)) for key, _ in OPERATING_CATEGORIES)
    allocation = sanitize_allocation(allocation_payload, agent)
    if not any(allocation.values()):
        allocation = {item["key"]: item["amount"] for item in default_operating_budget(agent)["categories"]}

    effects = allocation_effects(agent, allocation)
    apply_micro_effects(agent, effects)
    question_result = resolve_question(state.get("strategicQuestion"), strategic_answer)
    if question_result:
        apply_micro_effects(agent, question_result.get("effects") or {})
    actor_note = apply_actor_decision(agent, state.get("pendingActorOffer"), actor_decision)
    due, remaining_pending = apply_due_consequences(agent, state.get("pendingConsequences") or [])
    market_event = random_market_event(agent, allocation)
    pending = pending_from_allocation(agent, allocation, remaining_pending)
    total_spend = round(sum(allocation.values()))
    resolved = {
        "status": "resolved",
        "choice_made": "operating_budget",
        "outcome_label": "Operating budget submitted",
        "narrative": f"You allocated ${total_spend:,} across the company. The month now resolves through burn, growth loops, hidden debt, and market pressure.",
        "effects_applied": effects,
        "lesson": operating_analysis_with_question(allocation, question_result, market_event, due),
    }
    warnings = allocation_warnings(allocation)
    if requested_total > total_spend:
        warnings.insert(0, f"Requested spend was ${round(requested_total):,}, but only ${total_spend:,} could be used because cash was limited.")
    if warnings:
        resolved["lesson"]["tradeoffs"] = warnings + resolved["lesson"].get("tradeoffs", [])
        resolved["narrative"] = f"{resolved['narrative']} {warnings[0]}"
    if actor_note:
        resolved["lesson"]["tradeoffs"].insert(0, actor_note)
    history = list(state.get("history") or [])
    history.append({
        "month": agent.current_month,
        "choice": f"{question_result.get('label') if question_result else 'Operating budget'} + ${total_spend:,}",
        "outcome": resolved.get("narrative", resolved.get("outcome_label", "")),
        "question": (state.get("strategicQuestion") or {}).get("prompt", ""),
        "skill": question_result.get("skill") if question_result else "",
        "marketEvent": market_event.get("title") if market_event else "",
        "actorNote": actor_note or "",
    })
    max_months = simulation_month_limit(state.get("startup") or {})
    completed_run = len(history) >= max_months
    if completed_run:
        return package_output(
            agent,
            {},
            state.get("founder") or {},
            state.get("startup") or {},
            history=history[-8:],
            previous_chart=state.get("chartData") or {},
            outcome=resolved,
            status="completed",
            previous_world=state,
            pending=pending,
            market_event=market_event,
            due_consequences=due,
            actor_note=actor_note,
            force_actor_offer=True,
        )
    tick = engine.tick()
    next_scenario = tick.get("scenario") or resolved.get("cascade") or {}
    status = tick.get("status", "alive")
    return package_output(
        agent,
        next_scenario,
        state.get("founder") or {},
        state.get("startup") or {},
        history=history[-8:],
        previous_chart=state.get("chartData") or {},
        outcome=resolved,
        status=status,
        previous_world=state,
        pending=pending,
        market_event=market_event,
        due_consequences=due,
        actor_note=actor_note,
    )


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    action = payload.get("action", "start")
    output = decision(payload) if action == "decision" else start(payload)
    print(json.dumps(output))


if __name__ == "__main__":
    main()
