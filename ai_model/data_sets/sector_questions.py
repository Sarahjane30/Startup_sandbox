"""Sector-specific decision banks for the simulation fallback rounds."""

import random

SECTOR_DECISION_BANK = {
    "AI": {
        "narratives": [
            "Usage is growing, but inference cost and model quality are pulling against each other. What do you optimize this month?",
            "A bigger competitor ships a similar AI feature. Your advantage has to become sharper than 'we use AI'.",
        ],
        "choices": [
            ("ai_eval_harness", "Build an evaluation harness", "improve_product", {"product_quality": 9, "retention": 6, "tech_debt": -3}, {"founder_stress": 5, "innovation_score": -2}, "The team can finally see where the model fails. Quality improves instead of just sounding impressive.", "The eval work is useful, but it slows visible shipping this month."),
            ("ai_cost_controls", "Cut inference cost per user", "reduce_costs", {"burn_rate": -0.12, "tech_debt": -2, "investor_confidence": 5}, {"product_quality": -7, "retention": -4}, "Routing, caching, and smaller models lower cost without hurting the core workflow.", "The cheaper stack creates edge-case failures that customers notice."),
            ("ai_enterprise_pilot", "Run one paid enterprise pilot", "increase_sales", {"revenue": 12000, "customer_count": 1, "investor_confidence": 8}, {"founder_stress": 8, "revenue": 1000}, "A narrow enterprise pilot creates real budget signal and a credible case study.", "Procurement likes the idea, then sends a security questionnaire that eats the month."),
            ("ai_data_moat", "Collect proprietary workflow data", "research", {"innovation_score": 8, "product_quality": 4, "retention": 4}, {"tech_debt": 4, "founder_stress": 4}, "The product starts learning from customer-specific workflows competitors cannot copy quickly.", "The data is valuable, but cleaning it is slower than the roadmap assumed."),
        ],
    },
    "Healthcare": {
        "narratives": [
            "Clinicians like the promise, but trust, evidence, and workflow fit matter more than a flashy demo.",
            "A pilot site is interested. The question is whether you optimize for safety proof, adoption, or speed.",
        ],
        "choices": [
            ("clinical_advisory_board", "Recruit clinical advisors", "research", {"reputation": 8, "product_quality": 5, "investor_confidence": 5}, {"founder_stress": 6, "innovation_score": -2}, "Clinician feedback turns vague value into safer workflow decisions.", "The advisors disagree, and the team has to choose a narrower clinical path."),
            ("compliance_sprint", "Run a compliance sprint", "reduce_risk", {"regulatory_risk": -10, "investor_confidence": 6, "tech_debt": -2}, {"product_quality": 1, "founder_stress": 5}, "Documentation, audit trails, and privacy reviews make the next buyer conversation easier.", "The compliance work matters, but it does not create visible customer excitement yet."),
            ("hospital_pilot", "Push for a hospital pilot", "increase_sales", {"customer_count": 2, "revenue": 9000, "reputation": 7}, {"founder_stress": 7, "burn_rate": 0.03}, "A real care team agrees to test the product under controlled conditions.", "The champion is excited, but procurement and legal turn momentum into waiting."),
            ("patient_safety_scope", "Narrow the safety scope", "pivot", {"retention": 6, "regulatory_risk": -8, "product_quality": 4}, {"investor_confidence": -3, "founder_stress": 3}, "A narrower use case reduces liability and makes adoption easier to explain.", "The wedge is safer, but the pitch loses some of its original drama."),
        ],
    },
    "Fintech": {
        "narratives": [
            "Users want money movement to feel instant. Regulators and banking partners want it to feel boring.",
            "A partner bank asks for more proof. Growth is possible, but trust is the product now.",
        ],
        "choices": [
            ("fintech_compliance_pack", "Tighten compliance controls", "reduce_risk", {"regulatory_risk": -9, "investor_confidence": 6, "reputation": 5}, {"founder_stress": 5, "product_quality": 1}, "Clear controls make banks and investors less nervous about the operating model.", "The product gets safer, but releases move more slowly."),
            ("fintech_partner_distribution", "Win a channel partner", "increase_sales", {"customer_count": 22, "revenue": 7000, "investor_confidence": 7}, {"revenue": 2500, "burn_rate": 0.02}, "A partner brings users you could not acquire efficiently alone.", "The partner wants economics that make the deal less clean than it first looked."),
            ("fraud_detection", "Invest in fraud detection", "improve_product", {"product_quality": 7, "reputation": 6, "regulatory_risk": -5}, {"retention": -5, "nps": -7}, "Better monitoring catches risky behavior before it becomes a public problem.", "The controls work, but legitimate users get blocked at the worst moments."),
            ("cashflow_wedge", "Narrow to one cash-flow pain", "pivot", {"retention": 7, "revenue": 4500, "product_quality": 3}, {"customer_count": -4, "morale": -2}, "The product becomes easier to sell because the buyer recognizes the pain immediately.", "The narrower focus loses casual users but clarifies who the company is for."),
        ],
    },
    "Retail": {
        "narratives": [
            "The storefront is getting attention, but repeat purchase and margin decide whether this is a business.",
            "Customers are browsing. The month turns on conversion, fulfillment, and whether the unit economics hold.",
        ],
        "choices": [
            ("retail_repeat_purchase", "Launch a repeat-purchase loop", "increase_sales", {"retention": 8, "revenue": 6000, "customer_count": 10}, {"revenue": 1500, "nps": -3}, "Bundles, reminders, and post-purchase offers turn one-time buyers into recurring demand.", "The campaign moves product, but customers start waiting for discounts."),
            ("retail_supplier_terms", "Renegotiate supplier terms", "reduce_costs", {"burn_rate": -0.08, "revenue": 2000, "investor_confidence": 4}, {"founder_stress": 6, "product_quality": -2}, "Better terms give the business more breathing room without changing the customer promise.", "The supplier refuses concessions unless you commit to more volume."),
            ("retail_fulfillment_quality", "Fix fulfillment quality", "improve_product", {"nps": 8, "retention": 5, "product_quality": 6}, {"founder_stress": 5, "burn_rate": 0.02}, "Fewer late orders and cleaner packaging make customers trust the brand.", "The operations cleanup is necessary, but it steals time from growth experiments."),
            ("retail_creator_channel", "Test creator-led acquisition", "marketing", {"customer_count": 18, "press_coverage": 6, "revenue": 5000}, {"burn_rate": 0.03, "customer_count": 3}, "A focused creator partnership brings buyers with better intent than paid ads.", "The content performs, but the audience is not quite the buyer."),
        ],
    },
    "EdTech": {
        "narratives": [
            "Learners show interest, but completion and outcomes decide whether the product earns trust.",
            "A school or cohort wants proof. You need to choose between content, distribution, and measurable learning gains.",
        ],
        "choices": [
            ("edtech_completion_loop", "Improve course completion", "improve_product", {"retention": 8, "nps": 7, "product_quality": 5}, {"tech_debt": 3, "founder_stress": 4}, "Shorter lessons, nudges, and better pacing help learners finish instead of merely signing up.", "The learning loop improves, but old content now needs cleanup."),
            ("edtech_outcome_proof", "Measure learner outcomes", "research", {"reputation": 7, "investor_confidence": 5, "retention": 4}, {"founder_stress": 5, "product_quality": 2}, "Before-and-after evidence makes the product easier to sell to serious buyers.", "The measurement exposes gaps the team had been smoothing over."),
            ("edtech_institution_pilot", "Pitch an institution pilot", "increase_sales", {"revenue": 8000, "customer_count": 1, "reputation": 5}, {"founder_stress": 7, "revenue": 1000}, "A small institutional pilot creates a stronger sales proof point.", "The buyer likes it, then disappears into committee review."),
            ("edtech_community_cohort", "Run a live cohort", "marketing", {"retention": 7, "customer_count": 12, "morale": 5}, {"founder_stress": 8, "burn_rate": 0.02}, "Learners help each other, and the product feels less lonely.", "The cohort works, but it depends too much on founder energy."),
        ],
    },
    "Pet Care": {
        "narratives": [
            "Pet owners want reassurance fast, but trust depends on safe triage and veterinary boundaries.",
            "A veterinary partner is interested. The month turns on owner trust, clinical review, and repeat use.",
        ],
        "choices": [
            ("pet_vet_review", "Add vet-reviewed triage", "reduce_risk", {"regulatory_risk": -8, "reputation": 8, "retention": 5}, {"burn_rate": 0.04, "founder_stress": 4}, "Veterinary review makes the product safer and easier to trust.", "Clinical review slows response time and costs more than a simple chatbot."),
            ("pet_owner_cases", "Collect 50 owner cases", "research", {"product_quality": 6, "retention": 5, "nps": 5}, {"founder_stress": 4, "tech_debt": 2}, "Real owner cases expose the difference between panic, routine care, and true urgency.", "The cases are messy, emotional, and harder to label than expected."),
            ("pet_clinic_partner", "Pilot with two local clinics", "increase_sales", {"customer_count": 8, "revenue": 3500, "reputation": 5}, {"founder_stress": 6, "burn_rate": 0.03}, "Clinics create trust and distribution that generic pet apps lack.", "Clinic staff want workflow changes before they promote it."),
            ("pet_narrow_wedge", "Focus on senior pets first", "pivot", {"retention": 7, "revenue": 2200, "product_quality": 3}, {"customer_count": -3, "investor_confidence": -2}, "Senior pet owners have urgent recurring needs and clearer willingness to pay.", "The narrower wedge makes the market story feel smaller at first."),
        ],
    },
}


def sector_fallback(agent):
    bank = SECTOR_DECISION_BANK.get(agent.sector) or SECTOR_DECISION_BANK.get("AI")
    choices = []
    for key, label, choice_type, good_effects, drag_effects, good_text, drag_text in bank["choices"]:
        choices.append({
            "key": key,
            "label": label,
            "type": choice_type,
            "outcomes": [
                {"label": "Signal improves", "weight": 0.56, "sentiment": "positive", "effects": good_effects, "narrative": good_text},
                {"label": "Tradeoff appears", "weight": 0.44, "sentiment": "neutral", "effects": drag_effects, "narrative": drag_text},
            ],
        })
    return {
        "id": f"{agent.sector.lower()}_monthly_focus",
        "title": f"{agent.sector} Operating Choice",
        "narrative": random.choice(bank["narratives"]),
        "choices": choices,
        "month": agent.current_month,
    }
