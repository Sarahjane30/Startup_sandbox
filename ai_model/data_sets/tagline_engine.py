"""
tagline_engine.py
Generates startup taglines that are sector-aware, stage-aware, and occasionally brilliant.
Produces name + tagline combos on demand.
"""

import random
from typing import Dict, List, Optional


SECTOR_TAGLINE_TEMPLATES = {
    "AI": [
        "The AI layer for {problem}.",
        "{action} at machine speed.",
        "Turning {input} into {output} with AI.",
        "The intelligent {noun} platform.",
        "AI-native {noun} for the modern {user}.",
        "{verb} smarter. Not harder.",
    ],
    "Healthcare": [
        "Making {outcome} accessible to everyone.",
        "{noun} that saves time, saves lives.",
        "The future of {healthcare_noun} is here.",
        "Personalised {healthcare_noun} at scale.",
        "{action} — before the crisis, not after.",
        "Healthcare shouldn't be a guessing game.",
    ],
    "Fintech": [
        "Money that works as hard as you do.",
        "{action} without the bank.",
        "The {financial_noun} built for the {user}.",
        "Financial freedom, finally within reach.",
        "Your money. Your rules.",
        "{noun} for the unbanked and underbanked.",
    ],
    "Retail": [
        "The {noun} that remembers what you love.",
        "{action} shopping, redefined.",
        "Every customer is your best customer.",
        "The smart {noun} for modern retail.",
        "Personalisation at the speed of checkout.",
    ],
    "EdTech": [
        "Learn anything. From anyone. Anywhere.",
        "The {noun} that teaches at your pace.",
        "{action} education for the next billion.",
        "Skills that outlast the classroom.",
        "Where curiosity becomes competency.",
        "The future of learning ships today.",
    ],
    "CleanTech": [
        "Sustainability that scales.",
        "{action} the planet, one {unit} at a time.",
        "Green {noun} for a warming world.",
        "The clean {noun} the industry didn't know it needed.",
        "Where doing good and doing well are the same thing.",
    ],
    "SaaS": [
        "{verb} your workflow. Not just automate it.",
        "The {noun} your team will actually use.",
        "Software built for the job, not the demo.",
        "Stop managing {problem}. Start solving it.",
        "{action}, without the complexity.",
        "The platform that grows with you.",
    ],
    "Marketplace": [
        "The marketplace where {buyer} meets {seller}.",
        "{noun}. On demand. Without the middleman.",
        "Where supply finally meets demand.",
        "Access over ownership. Finally.",
        "The trusted marketplace for {noun}.",
    ],
    "Biotech": [
        "Biology, engineered.",
        "{action} at the molecular level.",
        "Where code meets biology.",
        "The next frontier of {healthcare_noun} begins here.",
        "Nature's algorithms, optimised.",
    ],
    "Cybersecurity": [
        "Security that thinks like an attacker.",
        "{action} before the breach, not after.",
        "Zero trust. Zero compromises.",
        "The {noun} that stands between you and the threat.",
        "Invisible protection. Visible results.",
    ],
}

FILL_WORDS = {
    "problem":          ["compliance", "hiring", "logistics", "procurement", "invoicing", "scheduling", "reporting"],
    "action":           ["Automate", "Simplify", "Accelerate", "Transform", "Reimagine", "Rebuild", "Redefine"],
    "input":            ["data", "documents", "conversations", "workflows", "signals"],
    "output":           ["decisions", "insights", "revenue", "efficiency", "clarity"],
    "noun":             ["platform", "layer", "engine", "OS", "infrastructure", "stack", "copilot"],
    "user":             ["enterprise", "SMB", "startup", "team", "developer", "operator", "founder"],
    "verb":             ["Work", "Build", "Ship", "Grow", "Operate", "Scale", "Execute"],
    "healthcare_noun":  ["diagnostics", "care", "monitoring", "therapy", "triage", "records", "outcomes"],
    "financial_noun":   ["bank", "payment rail", "portfolio", "ledger", "credit layer"],
    "buyer":            ["buyers", "enterprises", "freelancers", "brands", "operators"],
    "seller":           ["suppliers", "creators", "agencies", "talent", "makers"],
    "unit":             ["kilowatt", "ton of CO2", "transaction", "delivery"],
}

STARTUP_NAME_PARTS = {
    "prefix": ["Nova", "Apex", "Flux", "Kira", "Aeon", "Nexus", "Lumen", "Orba", "Zeta", "Prism",
               "Velo", "Forma", "Lyra", "Volta", "Helix", "Mira", "Onyx", "Sora", "Coda", "Plex"],
    "suffix": ["AI", "HQ", "Labs", "IO", "Hub", "Base", "Core", "Works", "Flow", "Sync",
               "Tech", "OS", "Pro", "Net", "Link", "Ops", "Pad", "Forge", "Desk", "Stack"],
    "standalone": ["Kaizen", "Lumina", "Solva", "Trove", "Versa", "Nexio", "Uplift", "Atmos",
                   "Grovi", "Quanta", "Spexa", "Plyth", "Dexta", "Motiv", "Clarix", "Synapse"],
}


class TaglineEngine:

    def generate_tagline(self, sector: str, startup_name: Optional[str] = None) -> str:
        """Generate a sector-appropriate startup tagline."""
        templates = SECTOR_TAGLINE_TEMPLATES.get(sector, SECTOR_TAGLINE_TEMPLATES["SaaS"])
        template = random.choice(templates)

        # Fill template variables
        try:
            filled = template.format(**{
                k: random.choice(v) for k, v in FILL_WORDS.items()
            })
        except KeyError:
            filled = template  # fallback if variable missing

        return filled

    def generate_name(self) -> str:
        """Generate a startup name."""
        style = random.choice(["compound", "compound", "standalone"])
        if style == "compound":
            prefix = random.choice(STARTUP_NAME_PARTS["prefix"])
            suffix = random.choice(STARTUP_NAME_PARTS["suffix"])
            return f"{prefix}{suffix}"
        else:
            return random.choice(STARTUP_NAME_PARTS["standalone"])

    def generate_brand_package(self, sector: str) -> Dict:
        """Return a full branding starter kit: name + tagline + positioning."""
        name = self.generate_name()
        tagline = self.generate_tagline(sector, name)

        positioning = self._sector_positioning(sector)

        return {
            "name": name,
            "tagline": tagline,
            "sector": sector,
            "positioning": positioning,
            "domain_suggestion": f"{name.lower()}.io",
        }

    def regenerate_tagline(self, sector: str, existing_tagline: str, attempts: int = 5) -> str:
        """Generate a tagline that doesn't match the existing one."""
        for _ in range(attempts):
            new = self.generate_tagline(sector)
            if new != existing_tagline:
                return new
        return self.generate_tagline(sector)

    def _sector_positioning(self, sector: str) -> str:
        positioning_map = {
            "AI": "AI infrastructure or intelligent automation layer",
            "Healthcare": "digital health or care delivery innovation",
            "Fintech": "financial services disruption or embedded finance",
            "Retail": "commerce intelligence or retail operations",
            "EdTech": "learning technology or skill development",
            "CleanTech": "sustainable technology or climate solutions",
            "SaaS": "workflow automation or business software",
            "Marketplace": "two-sided marketplace or platform economics",
            "Biotech": "biological engineering or therapeutic innovation",
            "Cybersecurity": "security intelligence or threat prevention",
        }
        return positioning_map.get(sector, "technology innovation")