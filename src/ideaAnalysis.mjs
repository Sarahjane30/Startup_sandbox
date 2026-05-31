import { readFile } from "node:fs/promises";
import path from "node:path";
import { Type } from "@google/genai";
import { IDEA_CACHE_TTL_MS, IDEA_DATASET_MATCH_THRESHOLD, IDEA_LIVE_TIMEOUT_MS, LIVE_CACHE_TTL_MS, GEMINI_IDEA_MODEL, USE_GEMINI_IDEA_FEEDBACK, ai, ideaDataDir } from "./config.mjs";
import { cachedAsync, fetchText, norm, parseCsv, safeText, splitKeywords, withTimeout } from "./utils.mjs";
import { runStartupModel, stopMlWorker } from "./mlWorker.mjs";

const ideaAnalysisCache = new Map();
const publicIdeaCache = new Map();
let ideaDatasetsPromise = null;


function containsAny(text, words) {
  return words.some((word) => text.includes(word));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function decisionFromScore(score) {
  if (score >= 82) return "SCALE THE WEDGE";
  if (score >= 68) return "VALIDATE AGGRESSIVELY";
  if (score >= 54) return "NICHE DOWN";
  if (score >= 40) return "REBUILD THE ANGLE";
  if (score >= 25) return "PROVE DEMAND FIRST";
  return "DROP OR REINVENT";
}

function ideaSignals(idea) {
  const text = norm(idea);
  const customers = [
    ["students", ["student", "school", "college", "learner", "teacher"]],
    ["small businesses", ["small business", "smb", "shop", "store", "local business"]],
    ["founders", ["founder", "startup", "entrepreneur"]],
    ["teams", ["team", "employee", "manager", "company"]],
    ["creators", ["creator", "influencer", "artist", "writer"]],
    ["pet owners", ["pet", "dog", "cat", "veterinary", "vet", "animal"]],
    ["consumers", ["consumer", "user", "people", "personal"]]
  ];
  const models = [
    ["subscription", ["subscription", "monthly", "saas", "paid plan"]],
    ["marketplace", ["marketplace", "commission", "buyers", "sellers"]],
    ["transaction fee", ["fee", "take rate", "payment", "invoice", "bill"]],
    ["enterprise contract", ["enterprise", "b2b", "contract"]],
    ["freemium", ["freemium", "free", "premium"]]
  ];
  const channels = [
    ["school/community partnerships", ["school", "student", "teacher", "education"]],
    ["founder-led outbound", ["b2b", "company", "team", "enterprise"]],
    ["creator-led distribution", ["creator", "content", "social"]],
    ["SEO and templates", ["search", "content", "template"]],
    ["paid acquisition", ["consumer", "app", "mobile"]]
  ];

  const pick = (items, fallback) => {
    const found = items.find(([, keys]) => keys.some((k) => text.includes(k)));
    return found?.[0] || fallback;
  };

  return {
    customer: pick(customers, "a sharply defined first customer"),
    revenueModel: pick(models, "paid pilot"),
    channel: pick(channels, "direct outreach"),
    hasAi: containsAny(text, ["ai", "artificial intelligence", "machine learning", "llm", "chatbot"]),
    hasFunding: /\$|\b\d+\s*(k|m|million|b|billion)\b/i.test(idea),
    hasCustomer: containsAny(text, ["for", "students", "teams", "founders", "businesses", "creators", "parents", "teachers"])
  };
}

function formatMatches(matches, type) {
  if (!matches.length) return `No close ${type} match found in the dataset.`;
  return matches.map((x) => {
    if (type === "success") return `${x.name} (${x.sector}, ${x.funding}, similarity ${x.similarity})`;
    return `${x.name} (${x.whatTheyDid}): ${x.whyFailed || x.takeaway}`;
  }).join("; ");
}

function buildIdeaVariants(signals, sector, topFailure, topSuccess, topReference) {
  const customer = signals.customer;
  const channel = signals.channel;
  const revenue = signals.revenueModel;
  const article = /^[aeiou]/i.test(sector) ? "an" : "a";
  const failureLesson = topFailure?.whyFailed || topFailure?.takeaway || "the nearest failure pattern";
  const successName = topReference?.name || topSuccess?.name || "the nearest success peer";
  return [
    `Wedge version: sell ${article} ${sector} tool only for ${customer}, with one measurable outcome and a ${revenue} offer.`,
    `Anti-failure version: explicitly avoid "${failureLesson}" by making the product useful before any broad AI layer or feature expansion.`,
    `Distribution-first version: build the product around ${channel}, then compare traction against ${successName} instead of generic AI apps.`,
    `Premium version: replace the broad idea with a paid concierge pilot where users pay for the result, not the software.`,
    `Data-moat version: collect proprietary workflow or outcome data that makes the product improve with every user.`
  ];
}

function phraseFromKeywords(idea, sector) {
  const keywords = splitKeywords(idea)
    .filter((word) => ![
      "startup", "business", "platform", "product", "service", "using",
      "with", "that", "this", "into", "from", "their", "your"
    ].includes(word.toLowerCase()))
    .slice(0, 7);
  if (keywords.length >= 3) return keywords.join(" ");
  return `${sector} problem from the submitted idea`;
}

const SECTOR_EXTRACTION_PROFILES = {
  "pet care": {
    channel: "vet clinics, groomers, shelters, pet insurance communities, and breed-specific owner groups",
    moat: "pet profiles, owner history, service-provider relationships, safety guardrails, and follow-up outcome data",
    risk: "trust, liability, repeat usage, and customer acquisition cost"
  },
  finance: {
    channel: "accounting firms, finance communities, workflow integrations, and founder-led outbound",
    moat: "financial workflow data, integrations, compliance trust, and switching cost",
    risk: "trust, data access, compliance, and crowded financial software positioning"
  },
  "health care": {
    channel: "clinician referrals, patient communities, specialty clinic pilots, and care-team workflows",
    moat: "trusted clinical workflows, safety review, compliance discipline, and longitudinal outcome data",
    risk: "trust, compliance, clinical accuracy, and workflow adoption"
  },
  retail: {
    channel: "merchant communities, Shopify/app marketplaces, creator-led commerce, and founder-led store outreach",
    moat: "merchant workflow data, commerce integrations, revenue-lift proof, and repeat operating habits",
    risk: "low switching costs, expensive merchant acquisition, and platform dependency"
  },
  "food services": {
    channel: "restaurant owner groups, POS/app marketplaces, local operator networks, and hospitality partnerships",
    moat: "ordering, inventory, staffing, guest, and margin data tied into daily restaurant operations",
    risk: "thin margins, operational complexity, fragmented buyers, and integration friction"
  },
  manufacturing: {
    channel: "operator networks, trade groups, systems integrators, and targeted plant-level pilots",
    moat: "process data, operational integrations, implementation knowledge, and switching cost",
    risk: "long sales cycles, integration complexity, and conservative operations buyers"
  },
  information: {
    channel: "niche communities, workflow integrations, founder-led outbound, and product-led distribution",
    moat: "workflow data, integrations, team habits, and measurable productivity lift",
    risk: "generic AI positioning, low switching cost, and fast copycats"
  }
};

function normalizeExtractedPhrase(value) {
  return safeText(value)
    .replace(/^to\s+/i, "")
    .replace(/\bthat\s*$/i, "")
    .replace(/\bwho\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractProfiledIdeaJob(raw, sector, profile) {
  const lower = norm(raw);
  const signals = ideaSignals(raw);
  const customerPatterns = [
    /\bfor\s+([^,.]+?)(?:\s+that|\s+who|\s+to|\s+by|[,.;]|$)/i,
    /\bhelps?\s+([^,.]+?)\s+(?:to\s+)?(?:manage|learn|build|create|find|track|prepare|study|automate|reduce|improve|understand|connect|sell|book|forecast|monitor|triage|order|schedule|plan|optimize|predict|suggest|flag|detect|check|resolve)/i,
    /\b(?:students|teachers|parents|schools|founders|freelancers|creators|teams|small businesses|patients|clinics|doctors|nurses|restaurants|retailers|merchants|manufacturers|operators|pet owners|dog owners|cat owners|bookkeepers|accountants)\b/i
  ];
  const jobPatterns = [
    /\b(?:that|which)\s+(?:helps?|lets?|allows?|enables?)\s+[^,.]+?\s+(?:to\s+)?([^,.]+?)(?:[,.;]|$)/i,
    /\b(?:solve|solves|fix|fixes|reduce|reduces|automate|automates|improve|improves|manage|manages|track|tracks|prepare|prepares|learn|learns|connect|connects|turn|turns|generate|generates|forecast|forecasts|monitor|monitors|triage|triages|order|orders|schedule|schedules|plan|plans|optimize|optimizes|predict|predicts|suggest|suggests|flag|flags|detect|detects|check|checks|resolve|resolves)\s+([^,.]+?)(?:\s+for\s+|[,.;]|$)/i,
    /\b(?:problem|pain|workflow|job)\s+(?:is|of|around)?\s*([^,.]+?)(?:[,.;]|$)/i,
    /\b(?:struggle|struggles|struggling)\s+with\s+([^,.]+?)(?:[,.;]|$)/i
  ];
  const outcomePatterns = [
    /\bso\s+(?:they|users|customers|students|teachers|teams|owners|operators|patients|merchants)\s+can\s+([^,.]+?)(?:[,.;]|$)/i,
    /\bto\s+(save|reduce|increase|improve|prepare|pass|learn|understand|finish|ship|sell|book|pay|avoid|forecast|monitor|order|schedule|plan|optimize|predict|suggest|flag|detect|check|resolve)\s+([^,.]+?)(?:[,.;]|$)/i,
    /\b(?:outcome|result)\s+(?:is|of)?\s*([^,.]+?)(?:[,.;]|$)/i
  ];

  const extract = (patterns) => {
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      const value = normalizeExtractedPhrase(match?.[1] || match?.[0]);
      if (value && value.length >= 3 && !/^(them|they|users?|people|customers)$/i.test(value)) return value;
    }
    return "";
  };

  const customer = extract(customerPatterns) || signals.customer;
  const job = extract(jobPatterns) || phraseFromKeywords(raw, sector);
  const outcome = extract(outcomePatterns);
  const aiQualifier = signals.hasAi ? "AI-assisted " : "";
  const wedge = outcome
    ? `${aiQualifier}${job} for ${customer} so they can ${outcome}`
    : `${aiQualifier}${job} for ${customer}`;

  return {
    wedge,
    buyer: customer,
    channel: profile.channel,
    moat: profile.moat,
    risk: profile.risk || (lower.includes("ai") ? "generic AI positioning" : "generic positioning")
  };
}

function extractIdeaJob(idea, sector) {
  const raw = safeText(idea);
  const lower = norm(raw);
  const signals = ideaSignals(raw);
  const methodPhrase = (value) => safeText(value)
    .replace(/^finding\s+/i, "")
    .replace(/^generating\s+/i, "")
    .replace(/\bfinding\s+/ig, "")
    .replace(/\bgenerating\s+/ig, "")
    .replace(/\s+/g, " ");

  if (sector === "education") {
    const learningMatch = raw.match(/\bhelps?\s+([^,.]+?)\s+(prepare|study|learn|practice)\s+(?:for\s+)?([^,.]+?)(?:\s+by\s+([^,.]+?))?(?:[,.;]|$)/i);
    const teacherWorkflowMatch = raw.match(/\bfor\s+([^,.]+?teachers?)\s+that\s+(turns?|converts?|generates?|creates?|tracks?)\s+([^,.]+?)(?:[,.;]|$)/i);
    const forLearnersMatch = raw.match(/\bfor\s+((?:high school|college|university|k-12|k12|middle school|primary school)?\s*(?:students|learners|teachers|parents|schools))\b/i);
    let buyer = safeText(learningMatch?.[1] || teacherWorkflowMatch?.[1] || forLearnersMatch?.[1] || signals.customer);
    if (/^(them|they|users?|people)$/i.test(buyer)) buyer = signals.customer;
    const learningJob = teacherWorkflowMatch
      ? `${teacherWorkflowMatch[2]} ${teacherWorkflowMatch[3]}`
      : safeText(learningMatch?.[3] || phraseFromKeywords(raw, sector));
    const cleanLearningJob = /^(better|well|more|faster)$/i.test(learningJob) ? "general learning outcomes" : learningJob;
    const method = methodPhrase(learningMatch?.[4]);
    const wedge = teacherWorkflowMatch
      ? `AI-assisted ${cleanLearningJob} for ${buyer}`
      : method
      ? `AI-assisted ${cleanLearningJob} prep for ${buyer} with ${method}`
      : `AI-assisted ${cleanLearningJob} prep for ${buyer}`;
    return {
      wedge,
      buyer,
      channel: lower.includes("teacher") || lower.includes("school")
        ? "teacher communities, school pilots, and student ambassador loops"
        : "student communities, tutoring centers, creator educators, and campus ambassadors",
      moat: "learner progress data, curriculum-specific workflows, tutor/teacher distribution, and repeated outcome proof",
      risk: "weak learning outcomes, school sales friction, and generic AI study-tool positioning"
    };
  }

  const profile = SECTOR_EXTRACTION_PROFILES[sector] || SECTOR_EXTRACTION_PROFILES.information;
  return extractProfiledIdeaJob(raw, sector, profile);

  const customerPatterns = [
    /\bfor\s+([^,.]+?)(?:\s+that|\s+who|\s+to|\s+by|[,.;]|$)/i,
    /\bhelp(?:s|ing)?\s+([^,.]+?)\s+(?:to\s+)?(?:manage|learn|build|create|find|track|prepare|study|automate|reduce|improve|understand|connect)/i,
    /\b(?:students|teachers|parents|schools|founders|freelancers|creators|teams|small businesses|patients|clinics|restaurants|retailers|manufacturers)\b/i
  ];
  const problemPatterns = [
    /\b(?:solve|solves|fix|fixes|reduce|reduces|automate|automates|improve|improves|manage|manages|track|tracks|prepare|prepares|learn|learns|connect|connects|turn|turns|generate|generates)\s+([^,.]+?)(?:\s+for\s+|[,.;]|$)/i,
    /\b(?:problem|pain|workflow|job)\s+(?:is|of|around)?\s*([^,.]+?)(?:[,.;]|$)/i,
    /\b(?:struggle|struggles|struggling)\s+with\s+([^,.]+?)(?:[,.;]|$)/i
  ];
  const outcomePatterns = [
    /\bso\s+(?:they|users|customers|students|teachers|teams)\s+can\s+([^,.]+?)(?:[,.;]|$)/i,
    /\bto\s+(save|reduce|increase|improve|prepare|pass|learn|understand|finish|ship|sell|book|pay|avoid)\s+([^,.]+?)(?:[,.;]|$)/i,
    /\b(?:outcome|result)\s+(?:is|of)?\s*([^,.]+?)(?:[,.;]|$)/i
  ];

  const extract = (patterns) => {
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      const value = safeText(match?.[1] || match?.[0]);
      if (value && value.length >= 3) return value.replace(/\s+(that|who|to|by)$/i, "");
    }
    return "";
  };

  const customer = extract(customerPatterns) || signals.customer;
  const problem = extract(problemPatterns) || phraseFromKeywords(raw, sector);
  const outcome = extract(outcomePatterns);
  const aiQualifier = signals.hasAi ? "AI-assisted " : "";
  const wedge = outcome
    ? `${aiQualifier}${problem} for ${customer} so they can ${outcome}`
    : `${aiQualifier}${problem} for ${customer}`;

  const sectorDefaults = {
    education: {
      channel: lower.includes("teacher") || lower.includes("school")
        ? "teacher communities, school pilots, and student ambassador loops"
        : "student communities, tutoring centers, creator educators, and campus ambassadors",
      moat: "learner progress data, curriculum-specific workflows, tutor/teacher distribution, and repeated outcome proof",
      risk: "weak learning outcomes, school sales friction, and generic AI study-tool positioning"
    },
    "health care": {
      channel: "clinician referrals, patient communities, and specialty clinic pilots",
      moat: "trusted clinical workflows, safety review, compliance discipline, and longitudinal outcome data",
      risk: "trust, compliance, and workflow adoption"
    },
    retail: {
      channel: "merchant communities, Shopify app channels, and founder-led store outreach",
      moat: "merchant workflow data, integrations, and revenue-lift proof",
      risk: "low switching costs and expensive merchant acquisition"
    },
    manufacturing: {
      channel: "operator networks, trade groups, and targeted plant-level pilots",
      moat: "process data, integrations, and operational switching cost",
      risk: "long sales cycles and integration complexity"
    },
    information: {
      channel: signals.channel,
      moat: "workflow data, integrations, team habits, and measurable productivity lift",
      risk: "generic AI positioning and low switching cost"
    }
  };
  const defaults = sectorDefaults[sector] || {};

  return {
    wedge,
    buyer: customer,
    channel: defaults.channel || signals.channel,
    moat: defaults.moat || "proprietary workflow data, distribution, and switching cost",
    risk: defaults.risk || "generic positioning"
  };
}

function ideaQualityProfile(idea, sector = "") {
  const text = norm(idea);
  const words = splitKeywords(idea);
  const signals = ideaSignals(idea);
  const useCase = ideaUseCase(idea, sector.replace(/_/g, " ") || inferIdeaSector(idea).replace(/_/g, " "));
  const hasProblem = containsAny(text, [
    "problem", "pain", "struggle", "struggles", "hard", "waste", "manual",
    "slow", "expensive", "miss", "lose", "confusing", "prepare", "practice",
    "track", "automate", "reduce", "improve", "manage"
  ]);
  const hasOutcome = containsAny(text, [
    "so they can", "increase", "reduce", "save", "pass", "learn", "finish",
    "book", "sell", "pay", "avoid", "faster", "cheaper", "better", "daily",
    "weekly", "measurable"
  ]);
  const hasDistribution = containsAny(text, [
    "school", "community", "partner", "partnership", "teacher", "campus",
    "clinic", "accountant", "quickbooks", "shopify", "creator", "outbound",
    "seo", "marketplace"
  ]);
  const hasMoat = containsAny(text, [
    "data", "proprietary", "workflow", "integration", "integrations",
    "network", "switching", "history", "outcome", "model", "personalized"
  ]);
  const hasBuyer = signals.revenueModel !== "paid pilot" || containsAny(text, [
    "pay", "paid", "subscription", "monthly", "school", "teacher", "parent",
    "business", "enterprise", "clinic", "merchant"
  ]);
  const vagueTerms = ["ai app", "for everyone", "all students", "all businesses", "social network", "marketplace for everything", "better learning", "productivity app"];
  const vaguePenalty = vagueTerms.filter((term) => text.includes(term)).length;
  const specificity = Math.min(18, Math.max(0, words.length - 8) * 0.9)
    + (signals.hasCustomer ? 8 : -8)
    + (hasProblem ? 8 : -7)
    + (hasOutcome ? 7 : -4)
    + (hasBuyer ? 6 : -5)
    + (hasDistribution ? 5 : 0)
    + (hasMoat ? 5 : 0)
    + (signals.hasAi && hasMoat ? 2 : 0)
    - vaguePenalty * 8;
  const score = clampScore(46 + specificity);

  return {
    score,
    customer: useCase.buyer,
    wedge: useCase.wedge,
    hasProblem,
    hasOutcome,
    hasBuyer,
    hasDistribution,
    hasMoat,
    vaguePenalty
  };
}

function ideaUseCase(idea, sector) {
  return extractIdeaJob(idea, sector);
}

function buildDomainVariants(idea, sector, topFailure, topSuccess, topReference, publicContext = []) {
  const useCase = ideaUseCase(idea, sector);
  const benchmark = topReference?.name || topSuccess?.name || publicContext[0]?.title || "the closest live comparable";
  const failureLesson = sectorRelevantFailureLesson(sector, topFailure, "scaling before figuring out retention");
  
  return [
    `Trust-first version: build a high-trust wedge and explicitly avoid "${failureLesson}" with escalation rules and human review for scary cases.`,
    `Distribution-first version: acquire users through ${useCase.channel}, then benchmark retention against ${benchmark}.`,
    `Premium version: sell a paid monthly navigator for super-users or extreme-need customers in this segment.`,
    `Data-moat version: collect structured usage and outcome data so the product improves beyond a generic wrapper.`
  ];
}

function sectorRelevantFailureLesson(sector, topFailure, fallback) {
  const lesson = safeText(topFailure?.whyFailed || topFailure?.takeaway);
  if (!lesson) return fallback;
  const sectorSignals = {
    "pet care": ["pet", "dog", "cat", "vet", "veterinary", "animal", "owner", "breed", "trust", "health", "symptom", "triage", "consumer", "care"],
    education: ["student", "teacher", "school", "learn", "course", "tutor", "exam", "curriculum", "education", "edtech"],
    finance: ["finance", "bank", "invoice", "tax", "accounting", "cash", "payment", "loan", "bookkeeping"],
    "health care": ["health", "patient", "doctor", "clinic", "medical", "therapy", "diagnosis"],
    retail: ["retail", "shop", "store", "commerce", "merchant", "marketplace"],
    manufacturing: ["manufacturing", "factory", "logistics", "supply", "industrial"]
  };
  const signals = sectorSignals[sector] || [];
  if (!signals.length) return lesson;
  return signals.some((signal) => lesson.toLowerCase().includes(signal))
    ? lesson
    : fallback;
}

function buildDomainExperiments(idea, sector, variants) {
  const useCase = ideaUseCase(idea, sector);
  if (sector === "pet care") {
    return [
      `The Customer Interrogation: Interview 10 pet owners. Force them to rank their exact pain, current workaround, and budget before you show anything.`,
      `The Wizard of Oz: Manually triage 3 paying customers behind the scenes with a real vet before you build any automation.`,
      `The Harsh A/B Test: Pit broad AI positioning against "${variants[0]}". Measure qualified booked calls, not just email signups.`
    ];
  }
  return [
    `The Customer Interrogation: Interview 10 ${useCase.buyer}s. Force them to rank their exact pain, current workaround, and budget before you even show the product.`,
    `The Wizard of Oz: Manually deliver ${useCase.wedge} for 3 paying customers behind the scenes before you build any automation.`,
    `The Harsh A/B Test: Pit broad AI positioning against "${variants[0]}". Don't measure email signups—measure qualified booked calls.`
  ];
}

function buildMistakePredictor(idea, sector, riskList) {
  const useCase = ideaUseCase(idea, sector);
  if (sector === "pet care") {
    return `Your fatal mistake will be overclaiming what AI can safely do. Keep the product strictly in triage and routing until you have vet-reviewed outcome data. Dataset red flag: ${riskList}.`;
  }
  return `Your fatal mistake will be staying too broad. A generic ${sector} wrapper is trivial to ignore and trivial to copy. Narrow your focus to ${useCase.wedge}, prove it works, and watch out for this dataset red flag: ${riskList}.`;
}

function buildCopycatMoat(idea, sector, successList, failureList, referenceList, publicList, publicContext = []) {
  const useCase = ideaUseCase(idea, sector);
  if (sector === "pet care") {
    const liveNames = publicContext.map((x) => x.title).filter(Boolean).slice(0, 3).join(", ");
    const contextMeaning = liveNames
      ? `${liveNames} show that pet owners already use digital services around pet care, but they do not prove demand for AI diagnosis.`
      : "The dataset/live search did not find a close enough comparable, so treat this as an unvalidated wedge rather than a proven category.";
    return `<strong>Dataset matches:</strong> ${successList}<br/><br/><strong>Failure matches:</strong> ${failureList}<br/><br/><strong>Live context:</strong> ${publicList}<br/><br/><strong>What it means:</strong> ${contextMeaning} Your real moat is ${useCase.moat}. Do not compete as a generic pet chatbot; compete as a trusted triage layer that helps owners decide when to contact a vet.`;
  }
  return `<strong>Semantic success matches:</strong> ${successList}<br/><br/><strong>Semantic failure matches:</strong> ${failureList}<br/><br/><strong>YC/AI references:</strong> ${referenceList}<br/><br/><strong>Public context:</strong> ${publicList}<br/><br/><strong>Moat requirement:</strong> win through ${useCase.moat}.`;
}

function extractIdeaQueries(idea, features = {}) {
  const words = splitKeywords(idea).slice(0, 8);
  const sector = safeText(features.sector_group || "").replace(/_/g, " ");
  const hasAi = containsAny(norm(idea), ["ai", "artificial intelligence", "machine learning", "llm", "chatbot"]);
  const queries = new Set();
  if (containsAny(norm(idea), ["pet", "dog", "cat", "veterinary", "vet"])) {
    queries.add(hasAi ? "AI pet care startup" : "pet care startup");
    queries.add("pet technology startup company");
    queries.add("veterinary technology startup");
  } else if (sector && sector !== "information") {
    if (hasAi) queries.add(`AI ${sector} startup company`);
    queries.add(`${sector} technology startup company`);
  } else if (words.length) {
    queries.add(`${words.slice(0, 4).join(" ")} startup company`);
  }
  if (words.length) queries.add(`${words.slice(0, 5).join(" ")} competitors`);
  return [...queries].filter(Boolean).slice(0, 3);
}

const IDEA_SECTOR_KEYWORDS = {
  pet_care: ["pet", "pets", "dog", "dogs", "cat", "cats", "veterinary", "vet", "animal", "grooming"],
  finance: ["finance", "fintech", "bank", "loan", "insurance", "payment", "wallet", "invest", "credit", "accounting", "invoice", "invoices", "cash flow", "cashflow", "bill", "bills", "payroll", "bookkeeping", "tax"],
  health_care: ["health", "medical", "doctor", "hospital", "patient", "clinic", "medicine", "therapy", "diagnosis"],
  education: ["education", "school", "student", "teacher", "learn", "course", "tutor", "exam", "edtech"],
  retail: ["retail", "shop", "store", "commerce", "marketplace", "delivery", "fashion", "consumer"],
  food_services: ["food", "restaurant", "meal", "cafe", "kitchen", "hotel", "hospitality"],
  manufacturing: ["manufacturing", "factory", "hardware", "industrial", "supply chain", "logistics"],
  information: ["software", "app", "platform", "saas", "web", "mobile", "ai", "data", "analytics", "automation", "cloud"]
};

function inferIdeaSector(text) {
  const lower = norm(text);
  let best = "information";
  let bestScore = 0;
  for (const [sector, keywords] of Object.entries(IDEA_SECTOR_KEYWORDS)) {
    const weight = sector === "information" ? 0.45 : 1;
    const score = keywords.filter((keyword) => textHasTerm(lower, keyword)).length * weight;
    if (score > bestScore) {
      best = sector;
      bestScore = score;
    }
  }
  return best;
}

function normalizeIdeaSector(value) {
  const text = norm(value);
  if (!text || text === "nan" || text === "none") return "unknown";
  for (const [sector, keywords] of Object.entries(IDEA_SECTOR_KEYWORDS)) {
    if (keywords.some((keyword) => textHasTerm(text, keyword))) return sector;
  }
  return text.split("|")[0].replace(/\s+/g, "_").slice(0, 40);
}

function textHasTerm(text, term) {
  const normalizedText = norm(text);
  const normalizedTerm = norm(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return normalizedText.includes(normalizedTerm);
  return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(normalizedText);
}

const GENERIC_RETRIEVAL_TERMS = new Set([
  "startup", "company", "business", "product", "service", "platform", "software",
  "technology", "tech", "tool", "app", "mobile", "website", "user", "users",
  "customer", "customers", "people", "help", "helps", "using", "based", "online",
  "them", "they", "their", "better", "best", "good", "great", "which", "when",
  "before", "after", "small", "large", "new", "old", "need", "needs",
  "education", "student", "students", "school", "schools", "learn", "learning",
  "finance", "health", "retail", "food", "manufacturing", "information"
]);

function normalizeIdeaToken(token) {
  let value = safeText(token).toLowerCase();
  if (value.endsWith("ies") && value.length > 5) value = `${value.slice(0, -3)}y`;
  else if (value.endsWith("ing") && value.length > 6) value = value.slice(0, -3);
  else if (value.endsWith("es") && value.length > 5) value = value.slice(0, -2);
  else if (value.endsWith("s") && value.length > 4) value = value.slice(0, -1);
  return value;
}

function ideaTokens(text) {
  return new Set(splitKeywords(text).map(normalizeIdeaToken).filter((token) => token.length > 2));
}

function weightedIdeaTokens(text) {
  const tokens = [...ideaTokens(text)];
  const weights = new Map();
  for (const token of tokens) {
    let weight = GENERIC_RETRIEVAL_TERMS.has(token) ? 0.35 : 1;
    if (token.length >= 8) weight += 0.25;
    if (/\d/.test(token)) weight += 0.35;
    weights.set(token, weight);
  }
  return weights;
}

function vectorNorm(vector) {
  let sum = 0;
  for (const weight of vector.values()) sum += weight * weight;
  return Math.sqrt(sum) || 1;
}

function buildSparseVector(text) {
  const vector = weightedIdeaTokens(text);
  return {
    vector,
    norm: vectorNorm(vector),
    tokens: new Set(vector.keys()),
    distinctTokens: new Set([...vector.keys()].filter((token) => !GENERIC_RETRIEVAL_TERMS.has(token)))
  };
}

function tokenSimilarity(queryTokens, text) {
  const queryWeights = queryTokens instanceof Map ? queryTokens : weightedIdeaTokens([...queryTokens].join(" "));
  if (!queryWeights.size) return 0;
  const textWeights = weightedIdeaTokens(text);
  if (!textWeights.size) return 0;
  let dot = 0;
  let queryNorm = 0;
  let textNorm = 0;
  for (const weight of queryWeights.values()) queryNorm += weight * weight;
  for (const weight of textWeights.values()) textNorm += weight * weight;
  for (const [token, weight] of queryWeights.entries()) {
    if (textWeights.has(token)) dot += weight * textWeights.get(token);
  }
  return dot / Math.sqrt(queryNorm * textNorm);
}

function vectorSimilarity(queryVector, rowVector) {
  if (!queryVector?.vector?.size || !rowVector?.vector?.size) return 0;
  let dot = 0;
  const [smaller, larger] = queryVector.vector.size < rowVector.vector.size
    ? [queryVector.vector, rowVector.vector]
    : [rowVector.vector, queryVector.vector];
  for (const [token, weight] of smaller.entries()) {
    if (larger.has(token)) dot += weight * larger.get(token);
  }
  return dot / (queryVector.norm * rowVector.norm);
}

function tokenHitCount(queryTokens, text) {
  const querySet = queryTokens instanceof Map ? new Set(queryTokens.keys()) : queryTokens;
  const textTokens = ideaTokens(text);
  let hits = 0;
  for (const token of querySet) if (textTokens.has(token)) hits += 1;
  return hits;
}

function tokenHitReasons(queryTokens, text, limit = 5) {
  const querySet = queryTokens instanceof Map ? new Set(queryTokens.keys()) : queryTokens;
  const textTokens = ideaTokens(text);
  return [...querySet]
    .filter((token) => textTokens.has(token) && !GENERIC_RETRIEVAL_TERMS.has(token))
    .slice(0, limit);
}

function vectorHitReasons(queryVector, rowVector, limit = 5) {
  if (!queryVector?.distinctTokens || !rowVector?.tokens) return [];
  return [...queryVector.distinctTokens]
    .filter((token) => rowVector.tokens.has(token))
    .slice(0, limit);
}

function rowPick(row, ...names) {
  const entries = Object.entries(row || {});
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (found) return safeText(found[1]);
  }
  return "";
}

function compactUsd(value) {
  const amount = Number(String(value || "").replace(/[$,]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return safeText(value) || "unknown";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${Math.round(amount)}`;
}

function cleanComparableName(value) {
  const name = safeText(value).replace(/^["']+|["']+$/g, "");
  if (!name || name.length > 80 || name.includes("\",") || name.split(/\s+/).length > 10) return "";
  if (/^\d/.test(name)) return "";
  if (/^[a-z]/.test(name)) return "";
  if (/^(ai|api|iot|safety|privacy|security|monitoring|b2b|b2c|web and|to meet|which we|supportive team)$/i.test(name)) return "";
  if (/[.!?]$/.test(name)) return "";
  return name;
}

function uniqueComparables(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = norm(item.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRowVectorIndex(rows, buildText, getSector = () => "unknown") {
  return rows.map((row) => {
    const text = buildText(row);
    return {
      row,
      text,
      sector: getSector(row),
      ...buildSparseVector(text)
    };
  });
}

async function loadIdeaDatasets() {
  if (ideaDatasetsPromise) return ideaDatasetsPromise;
  const readCsv = (fileName) => readFile(path.join(ideaDataDir, fileName), "utf8").then(parseCsv).catch(() => []);
  ideaDatasetsPromise = Promise.all([
    readCsv("final_training_data_v2.csv"),
    readCsv("master_failure_dataset.csv"),
    readCsv("yc_companies.csv"),
    readCsv("Y_Combinator_2025.csv"),
    readCsv("AI_Companies.csv")
  ]).then(([training, failures, yc, yc2025, aiCompanies]) => {
    const trainingWithSector = training.map((row) => ({ ...row, _sectorGroup: normalizeIdeaSector(rowPick(row, "sector")) }));
    const successRows = trainingWithSector.filter((row) => rowPick(row, "target") === "1");
    const labeledFailureRows = trainingWithSector.filter((row) => rowPick(row, "target") === "0");
    const failureRows = failures.map((row) => ({ ...row, _sectorGroup: normalizeIdeaSector(rowPick(row, "Sector")) }));
    const references = [...yc, ...yc2025, ...aiCompanies];
    return {
      training,
      failures,
      references,
      indexes: {
        successes: buildRowVectorIndex(
          successRows,
          (row) => `${rowPick(row, "company_name", "name")} ${rowPick(row, "sector")} ${rowPick(row, "description", "company_description", "long_description")}`,
          (row) => row._sectorGroup
        ),
        labeledFailures: buildRowVectorIndex(
          labeledFailureRows,
          (row) => `${rowPick(row, "company_name", "name")} ${rowPick(row, "sector")} ${rowPick(row, "description", "company_description", "long_description")}`,
          (row) => row._sectorGroup
        ),
        failures: buildRowVectorIndex(
          failureRows,
          (row) => `${rowPick(row, "Name")} ${rowPick(row, "Sector")} ${rowPick(row, "What They Did")} ${rowPick(row, "Why They Failed")} ${rowPick(row, "Takeaway")}`,
          (row) => row._sectorGroup
        ),
        references: buildRowVectorIndex(
          references,
          (row) => `${rowPick(row, "company_name", "name", "Company_Name", "Company")} ${rowPick(row, "long_description", "company_description", "description", "one_liner", "Use_Case")} ${rowPick(row, "industry", "industries", "Industry", "category_list")}`,
          (row) => normalizeIdeaSector(rowPick(row, "industry", "industries", "Industry", "category_list"))
        )
      }
    };
  });
  return ideaDatasetsPromise;
}

function nearestIdeaRows(idea, rowIndex, limit = 3, requiredTerms = []) {
  const queryVector = buildSparseVector(idea);
  return rowIndex
    .map((item) => {
      const similarity = vectorSimilarity(queryVector, item);
      const matchReasons = vectorHitReasons(queryVector, item);
      return {
        row: item.row,
        text: item.text,
        hits: matchReasons.length,
        matchReasons,
        similarity
      };
    })
    .filter((item) => {
      const sectorRelevant = !requiredTerms.length || requiredTerms.some((term) => textHasTerm(item.text, term));
      return sectorRelevant && item.matchReasons.length >= 1 && item.similarity > 0.03;
    })
    .sort((a, b) => (b.similarity + b.matchReasons.length * 0.015) - (a.similarity + a.matchReasons.length * 0.015))
    .slice(0, limit);
}

function nearestIdeaRowsWithFallback(idea, sectorIndex, globalIndex, limit = 3, requiredTerms = []) {
  const sectorMatches = nearestIdeaRows(idea, sectorIndex, limit, requiredTerms);
  if (sectorMatches.length >= limit || sectorIndex === globalIndex) return sectorMatches;
  const seen = new Set(sectorMatches.map((item) => item.row));
  const globalMatches = nearestIdeaRows(idea, globalIndex, limit * 2, [])
    .filter((item) => !seen.has(item.row));
  return [...sectorMatches, ...globalMatches].slice(0, limit);
}

function topIdeaRiskPatterns(rows) {
  const riskColumns = [
    "Giants", "No Budget", "Competition", "Poor Market Fit", "Acquisition Stagnation",
    "Platform Dependency", "Monetization Failure", "Niche Limits", "Execution Flaws",
    "Trend Shifts", "Toxicity/Trust Issues", "Regulatory Pressure", "Overhype", "High Operational Costs"
  ];
  return riskColumns
    .map((risk) => {
      const values = rows.map((row) => Number(rowPick(row, risk)) || 0);
      const rate = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return { risk, rate };
    })
    .filter((item) => item.rate > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);
}

function isUsefulPublicIdeaContext(item, idea, features = {}) {
  const title = norm(item?.title);
  const text = norm(`${item?.title || ""} ${item?.description || ""} ${item?.extract || ""}`);
  const genericTitles = new Set([
    "artificial intelligence",
    "artificial intelligence act",
    "startup company",
    "technology company",
    "software company"
  ]);
  if (genericTitles.has(title)) return false;
  if (containsAny(text, ["university", "regulation", "law", "act of", "public university"])) return false;

  const sector = safeText(features.sector_group || "");
  const queryTokens = ideaTokens(idea);
  const hits = tokenHitCount(queryTokens, text);
  const sectorTerms = IDEA_SECTOR_KEYWORDS[sector] || [];
  const sectorHit = sectorTerms.some((term) => textHasTerm(text, term));
  const companyHit = containsAny(text, ["startup", "company", "founded", "platform", "app", "service", "marketplace"]);
  return companyHit && (hits >= 2 || sectorHit);
}

function decodeHtml(text) {
  return safeText(text)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(text) {
  return decodeHtml(String(text || "").replace(/<[^>]+>/g, " "));
}

async function getSearchIdeaContext(query, idea, features = {}) {
  const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}`).catch(() => "");
  if (!html) return [];
  const blocks = html.split(/<li class="b_algo"/).slice(1, 8);
  return blocks.map((block) => {
    const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    return {
      query,
      title: stripHtml(linkMatch?.[2] || ""),
      description: stripHtml(snippetMatch?.[1] || ""),
      extract: stripHtml(snippetMatch?.[1] || ""),
      url: decodeHtml(linkMatch?.[1] || ""),
      source: "web-search"
    };
  }).filter((item) => item.title && isUsefulPublicIdeaContext(item, idea, features));
}

async function runFastIdeaModel(payload) {
  const idea = safeText(payload.idea);
  const datasets = await loadIdeaDatasets();
  const features = {
    funding_total_usd: Number(payload.funding_total_usd || payload.fundingTotalUsd || 0) || 0,
    company_age: Number(payload.company_age || payload.companyAge || 1) || 1,
    sector_group: safeText(payload.sector_group || payload.sectorGroup) || inferIdeaSector(idea),
    funding_log1p: Math.log1p(Number(payload.funding_total_usd || payload.fundingTotalUsd || 0) || 0)
  };

  const filterBySector = (rows, minRows) => {
    const sectorRows = rows.filter((item) => item.sector === features.sector_group);
    return sectorRows.length >= minRows ? sectorRows : rows;
  };

  const successPool = filterBySector(datasets.indexes.successes, 5);
  const failurePool = filterBySector(datasets.indexes.failures, 3);
  const labeledFailurePool = filterBySector(datasets.indexes.labeledFailures, 5);
  const referencePool = filterBySector(datasets.indexes.references, 4);
  const requiredTerms = features.sector_group === "information" ? [] : IDEA_SECTOR_KEYWORDS[features.sector_group] || [];
  const quality = ideaQualityProfile(idea, features.sector_group);

  const successfulMatches = uniqueComparables(nearestIdeaRowsWithFallback(
    idea,
    successPool,
    datasets.indexes.successes,
    3,
    requiredTerms
  ).map(({ row, similarity, matchReasons }) => ({
    name: cleanComparableName(rowPick(row, "company_name", "name")),
    sector: rowPick(row, "sector"),
    funding: compactUsd(rowPick(row, "funding_total_usd")),
    companyAge: Number(rowPick(row, "company_age")) || null,
    similarity: Number(similarity.toFixed(3)),
    similarityMethod: "weighted-token-dataset",
    matchReasons
  })).filter((item) => item.name));

  const failureMatches = uniqueComparables(nearestIdeaRowsWithFallback(
    idea,
    failurePool,
    datasets.indexes.failures,
    3,
    requiredTerms
  ).map(({ row, similarity, matchReasons }) => ({
    name: cleanComparableName(rowPick(row, "Name")),
    sector: rowPick(row, "Sector"),
    whatTheyDid: rowPick(row, "What They Did"),
    funding: rowPick(row, "How Much They Raised"),
    whyFailed: rowPick(row, "Why They Failed"),
    takeaway: rowPick(row, "Takeaway"),
    similarity: Number(similarity.toFixed(3)),
    similarityMethod: "weighted-token-dataset",
    matchReasons
  })).filter((item) => item.name));

  const referenceMatches = uniqueComparables(nearestIdeaRowsWithFallback(
    idea,
    referencePool,
    datasets.indexes.references,
    6,
    requiredTerms
  ).map(({ row, similarity, matchReasons }) => ({
    name: cleanComparableName(rowPick(row, "company_name", "name", "Company_Name", "Company")),
    sector: rowPick(row, "industry", "industries", "Industry", "category_list") || "unknown",
    description: rowPick(row, "long_description", "company_description", "description", "one_liner", "Use_Case"),
    status: rowPick(row, "status", "stage", "Company_Type") || "reference",
    batch: rowPick(row, "batch", "batch_name", "Year"),
    url: rowPick(row, "website", "company_url", "Website"),
    sourceFile: "local datasets",
    similarity: Number(similarity.toFixed(3)),
    similarityMethod: "weighted-token-dataset",
    matchReasons
  })).filter((item) => item.name));

  const bestSimilarity = Math.max(0, ...successfulMatches.map((x) => x.similarity), ...failureMatches.map((x) => x.similarity), ...referenceMatches.map((x) => x.similarity));
  const failurePenalty = Math.min(0.18, (failureMatches[0]?.similarity || 0) * 0.55);
  const successBoost = Math.min(0.14, Math.max(successfulMatches[0]?.similarity || 0, referenceMatches[0]?.similarity || 0) * 0.5);
  const sectorBoost = features.sector_group === "information" ? 0.03 : 0.01;
  const qualityShift = (quality.score - 55) / 380;
  const successProbability = Math.max(0.05, Math.min(0.95, 0.5 + successBoost + sectorBoost + qualityShift - failurePenalty));

  return {
    prediction: successProbability >= 0.62 ? 1 : 0,
    label: successProbability >= 0.62 ? "success" : "failure",
    successProbability,
    failureProbability: 1 - successProbability,
    threshold: 0.62,
    features,
    comparables: {
      sectorGroup: features.sector_group,
      successfulMatches,
      failureMatches,
      referenceMatches,
      sectorRiskPatterns: topIdeaRiskPatterns(labeledFailurePool),
      sampleSizes: {
        successRows: successPool.length,
        failureRows: failurePool.length
      },
      retrievalModel: "cached-row-vector-index",
      bestDatasetSimilarity: bestSimilarity,
      quality
    },
    modelPath: "fast-node-dataset-analyzer"
  };
}

async function getPublicIdeaContext(idea, features = {}) {
  const queries = extractIdeaQueries(idea, features);
  const queryResults = await Promise.all(queries.map(async (query) => {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(query)}`;
    const search = await fetchJson(searchUrl).catch(() => null);
    const summaries = await Promise.all((search?.query?.search || []).map(async (item) => {
      const summary = await cachedAsync(
        wikiCache,
        norm(item.title),
        LIVE_CACHE_TTL_MS,
        () => getWikipediaSummaryFromTitle(item.title).catch(() => null)
      );
      if (!summary?.extract) return null;
      return {
        query,
        title: summary.title,
        description: summary.description || "",
        extract: summary.extract,
        url: summary.pageUrl,
        source: "wikipedia"
      };
    }));
    return summaries.filter(Boolean);
  }));
  const wikiResults = queryResults.flat();
  const webResults = wikiResults.length >= 2
    ? []
    : (await Promise.all(queries.map((query) => getSearchIdeaContext(query, idea, features)))).flat();
  const results = [...wikiResults, ...webResults];
  const seen = new Set();
  return results.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return isUsefulPublicIdeaContext(item, idea, features);
  }).slice(0, 5);
}

function buildMlIdeaAnalysis(idea, ml) {
  const scoreDetails = calibrateIdeaScore(idea, ml);
  const score = scoreDetails.score;
  const decision = decisionFromScore(score);
  const features = ml.features || {};
  const comparables = ml.comparables || {};
  const shuffleTop3 = (arr) => {
    if (!arr || arr.length < 2) return arr;
    const top = arr.slice(0, 3).sort(() => Math.random() - 0.5);
    return [...top, ...arr.slice(3)];
  };
  const successfulMatches = shuffleTop3(comparables.successfulMatches || []);
  const failureMatches = shuffleTop3(comparables.failureMatches || []);
  const referenceMatches = shuffleTop3(comparables.referenceMatches || []);
  const publicContext = ml.publicContext || [];
  const riskPatterns = comparables.sectorRiskPatterns || [];
  const sector = safeText(features.sector_group || "information").replace(/_/g, " ");
  const funding = Number(features.funding_total_usd || 0);
  const age = Number(features.company_age || 0);
  const fundingSignal = funding > 0 ? `reported funding of $${Math.round(funding).toLocaleString("en-US")}` : "no clear funding signal in the idea text";
  const ageSignal = age > 1 ? `${Math.round(age)} years of operating history` : "an early-stage company profile";
  const topSuccess = successfulMatches[0];
  const topFailure = failureMatches[0];
  const topReference = referenceMatches[0];
  const topRisk = riskPatterns[0];
  const signals = ideaSignals(idea);
  const scoreLabel = ml.modelPath === "fast-node-dataset-analyzer" ? "calibrated dataset score" : "calibrated hybrid ML score";
  const sectorUseCase = ideaUseCase(idea, sector);
  const upsideReference = topReference?.name || topSuccess?.name || (publicContext[0]?.title ? `${publicContext[0].title} from live context` : "no close comparable");
  const downsideReference = topFailure?.name || "no close failed comparable";

  const decisionReason = `Harsh Truth: ${decision}. This scores ${score}/100. You have a plausible wedge in ${sectorUseCase.wedge}, but don't kid yourself—you're benchmarking against ${upsideReference}. Your absolute biggest existential risk is ${sectorUseCase.risk}. The dataset screams that ${topRisk?.risk || "unclear differentiation"} kills companies like this.`;

  const successList = formatMatches(successfulMatches, "success");
  const failureList = formatMatches(failureMatches, "failure");
  const riskList = riskPatterns.length
    ? riskPatterns.map((x) => `${x.risk} (${Math.round(x.rate * 100)}% of nearby failure rows)`).join(", ")
    : "No dominant sector risk pattern found.";
  const variants = buildDomainVariants(idea, sector, topFailure, topSuccess, topReference, publicContext);
  const referenceList = referenceMatches.length
    ? referenceMatches.map((x) => `${x.name} (${x.sector || x.sourceFile}: ${x.description || x.status})`).join("; ")
    : "No YC/AI reference match found in the added datasets.";
  const publicList = publicContext.length
    ? publicContext.map((x) => `${x.title}: ${safeText(x.description || x.extract).slice(0, 120)}`).join("; ")
    : "No extra public-source context was needed or available.";
  const refinedIdeas = [
    `${variants[0]} Benchmark purely against ${topReference?.name || topSuccess?.name || "the closest reference"}—stop comparing yourself to generic AI wrappers.`,
    `${variants[3]} Package this entirely around a paid outcome. If your conversion is worse than the failed ${topFailure?.name || "comparable startup"}, you are dead.`,
    `${variants[4]} If your data moat isn't strong enough to protect against ${topRisk?.risk || "the top risk"}, don't even start.`
  ];

  return {
    viabilityScore: score,
    decision,
    decisionReason,
    marketPotential: clampScore(score + (sector === "information" ? 4 : 0)),
    executionFeasibility: clampScore(72 - Math.min(30, Math.round(funding / 1_000_000))),
    defensibility: clampScore(35 + Math.min(35, Math.round(funding / 250_000)) + Math.min(15, Math.round(age * 2))),
    capitalEfficiency: clampScore(funding > 0 ? 65 - Math.min(35, Math.round(funding / 500_000)) : 78),
    mutations: [
      ...variants.slice(0, 3)
    ],
    crazyPivot: topFailure?.takeaway
      ? `The Anti-Failure Pivot: Invert the ${topFailure.name} failure (${topFailure.whyFailed || topFailure.takeaway}). Build the absolute smallest paid product that proves the opposite is true.`
      : `The Brutal Pivot: Turn the idea into exactly ${sectorUseCase.wedge}, and force sales through ${sectorUseCase.channel}.`,
    copycatRisk: buildCopycatMoat(idea, sector, successList, failureList, referenceList, publicList, publicContext),
    liveExperiments: buildDomainExperiments(idea, sector, variants),
    mistakePredictor: buildMistakePredictor(idea, sector, riskList),
    hiddenOpportunity: topSuccess?.name
      ? `The Stealth Wedge: Use ${topSuccess.name} as the benchmark, but pick a painfully narrow customer and a desperate job-to-be-done. Do not compete as a generic ${sector} product.`
      : `The Bleeding Neck: The strongest opportunity is ${sectorUseCase.wedge} because it sits next to an urgent, high-budget pain instead of a casual nice-to-have.`,
    advancedFeedback: {
      verdict: decision,
      retrievalModel: comparables.retrievalModel || "unknown",
      ideaVariants: variants,
      refinedIdeas,
      successComparables: successfulMatches,
      failureComparables: failureMatches,
      referenceComparables: referenceMatches,
      publicContext,
      sectorRisks: riskPatterns,
      nextMove: refinedIdeas[0]
    },
    ml: {
      model: "Hybrid CTGAN-XGBoost + Random Forest + ANN model with cosine similarity evidence retrieval",
      successProbability: ml.successProbability,
      failureProbability: ml.failureProbability,
      threshold: ml.threshold,
      prediction: ml.label,
      modelPredictions: ml.modelPredictions || {},
      calibratedScore: score,
      scoreDetails,
      features,
      comparables
    }
  };
}

function calibrateIdeaScore(idea, ml) {
  const comparables = ml.comparables || {};
  const successMatches = comparables.successfulMatches || [];
  const failureMatches = comparables.failureMatches || [];
  const referenceMatches = comparables.referenceMatches || [];
  const riskPatterns = comparables.sectorRiskPatterns || [];
  const quality = comparables.quality || ideaQualityProfile(idea, ml.features?.sector_group || "");
  const signals = ideaSignals(idea);
  const base = clampScore(Number(ml.successProbability || 0.5) * 100);
  const bestSuccess = Math.max(0, ...(successMatches || []).map((x) => Number(x.similarity || 0)));
  const bestReference = Math.max(0, ...(referenceMatches || []).map((x) => Number(x.similarity || 0)));
  const bestFailure = Math.max(0, ...(failureMatches || []).map((x) => Number(x.similarity || 0)));
  const bestPositive = Math.max(bestSuccess, bestReference);
  const primaryRiskRate = Number(riskPatterns[0]?.rate || 0);
  const sampleSizes = comparables.sampleSizes || {};
  const sampleDepth = Math.min(1, (Number(sampleSizes.successRows || 0) + Number(sampleSizes.failureRows || 0)) / 300);

  const evidenceBoost = Math.min(12, bestPositive * 38);
  const failurePenalty = Math.min(16, bestFailure * 42 + primaryRiskRate * 8);
  const clarityBoost = (signals.hasCustomer ? 4 : -5) + (signals.revenueModel !== "paid pilot" ? 3 : -2);
  const aiPenalty = signals.hasAi && !/data|workflow|proprietary|model|automation|agent/i.test(idea) ? 4 : 0;
  const fundingBoost = signals.hasFunding ? 2 : 0;
  const qualityAdjustment = Math.max(-12, Math.min(10, (Number(quality.score || 50) - 55) * 0.42));
  const confidenceShrink = (1 - sampleDepth) * 0.18;
  const evidenceAdjusted = base + evidenceBoost - failurePenalty + clarityBoost - aiPenalty + fundingBoost + qualityAdjustment;
  const calibrated = 50 + (evidenceAdjusted - 50) * (1 - confidenceShrink);

  return {
    score: clampScore(calibrated),
    rawModelScore: base,
    evidenceBoost: Math.round(evidenceBoost),
    failurePenalty: Math.round(failurePenalty),
    clarityAdjustment: Math.round(clarityBoost - aiPenalty + fundingBoost),
    ideaQualityAdjustment: Math.round(qualityAdjustment),
    ideaQualityScore: Number(quality.score || 0),
    sampleDepth: Number(sampleDepth.toFixed(2)),
    bestPositiveSimilarity: Number(bestPositive.toFixed(3)),
    bestFailureSimilarity: Number(bestFailure.toFixed(3)),
    dominantRiskRate: Number(primaryRiskRate.toFixed(2)),
    explanation: "Score is calibrated from model probability, nearest success/reference matches, nearest failure matches, idea clarity, and dataset depth."
  };
}

function parseJsonObject(text) {
  const raw = safeText(text);
  if (!raw) throw new Error("Empty JSON response");
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found");
    return JSON.parse(match[0]);
  }
}

function normalizeStringArray(value, fallback = []) {
  const items = Array.isArray(value) ? value : fallback;
  return items.map((item) => safeText(item)).filter(Boolean).slice(0, 4);
}

function cleanFeedbackSentence(value) {
  return safeText(value)
    .replace(/\s+\./g, ".")
    .replace(/\.\.+/g, ".")
    .replace(/\bNo dominant sector risk pattern found\.\.?/gi, "The risk pattern is not strong enough to trust yet.")
    .replace(/\bRisk unclear\b/gi, "Unclear differentiation")
    .trim();
}

function mergeGeminiIdeaFeedback(base, refined, model) {
  const merged = { ...base };
  const textFields = ["decisionReason", "crazyPivot", "copycatRisk", "mistakePredictor", "hiddenOpportunity"];
  for (const field of textFields) {
    const value = cleanFeedbackSentence(refined?.[field]);
    if (value) merged[field] = value;
  }

  merged.mutations = normalizeStringArray(refined?.mutations, base.mutations).map(cleanFeedbackSentence);
  merged.liveExperiments = normalizeStringArray(refined?.liveExperiments, base.liveExperiments).map(cleanFeedbackSentence);

  for (const field of ["marketPotential", "executionFeasibility", "defensibility", "capitalEfficiency"]) {
    if (Number.isFinite(Number(refined?.[field]))) merged[field] = clampScore(Number(refined[field]));
  }

  const nextMove = safeText(refined?.nextMove);
  merged.advancedFeedback = {
    ...(base.advancedFeedback || {}),
    geminiReview: safeText(refined?.scoreReview),
    geminiVerification: safeText(refined?.verificationSummary),
    geminiEvidenceWarnings: normalizeStringArray(refined?.evidenceWarnings, []),
    geminiNextMove: nextMove,
    nextMove: nextMove || base.advancedFeedback?.nextMove,
    personalizedAdvice: cleanFeedbackSentence(refined?.personalizedAdvice)
  };

  merged.llm = {
    provider: "gemini",
    model,
    role: "model-output reviewer and personalized feedback writer",
    used: true
  };
  return merged;
}

async function refineIdeaWithGemini(idea, baseAnalysis, fields = {}) {
  const useGeminiFeedback = fields.useGeminiFeedback === true
    || fields.useGeminiFeedback === "true"
    || USE_GEMINI_IDEA_FEEDBACK;
  if (!useGeminiFeedback) {
    return {
      ...baseAnalysis,
      llm: {
        provider: "local",
        model: "hybrid-ml-feedback-templates",
        role: "local model evidence interpreter",
        used: false,
        reason: "Gemini idea feedback disabled; using local ML-generated feedback."
      }
    };
  }

  if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
    return {
      ...baseAnalysis,
      llm: { provider: "gemini", model: GEMINI_IDEA_MODEL, used: false, reason: "Missing Gemini API key" }
    };
  }

  const model = GEMINI_IDEA_MODEL;
  const scoreDetails = baseAnalysis?.ml?.scoreDetails || {};
  const quality = baseAnalysis?.ml?.comparables?.quality || {};
  const compactModelOutput = {
    idea,
    sector: baseAnalysis?.ml?.features?.sector_group,
    extractedWedge: quality.wedge || baseAnalysis.advancedFeedback?.nextMove || "",
    extractedCustomer: quality.customer || "",
    ideaQualityScore: scoreDetails.ideaQualityScore,
    ideaQualityAdjustment: scoreDetails.ideaQualityAdjustment,
    modelScore: baseAnalysis.viabilityScore,
    rawModelScore: baseAnalysis?.ml?.scoreDetails?.rawModelScore,
    scoreDetails: baseAnalysis?.ml?.scoreDetails,
    decision: baseAnalysis.decision,
    modelReason: baseAnalysis.decisionReason,
    marketPotential: baseAnalysis.marketPotential,
    executionFeasibility: baseAnalysis.executionFeasibility,
    defensibility: baseAnalysis.defensibility,
    capitalEfficiency: baseAnalysis.capitalEfficiency,
    successComparables: (baseAnalysis.advancedFeedback?.successComparables || []).slice(0, 3).map((item) => ({
      name: item.name,
      sector: item.sector,
      similarity: item.similarity,
      matchReasons: item.matchReasons
    })),
    referenceComparables: (baseAnalysis.advancedFeedback?.referenceComparables || []).slice(0, 4).map((item) => ({
      name: item.name,
      sector: item.sector,
      description: item.description,
      similarity: item.similarity,
      matchReasons: item.matchReasons
    })),
    failureComparables: (baseAnalysis.advancedFeedback?.failureComparables || []).slice(0, 3).map((item) => ({
      name: item.name,
      sector: item.sector,
      whyFailed: item.whyFailed,
      takeaway: item.takeaway,
      similarity: item.similarity,
      matchReasons: item.matchReasons
    })),
    sectorRisks: (baseAnalysis.advancedFeedback?.sectorRisks || []).slice(0, 3),
    candidateMutations: baseAnalysis.mutations,
    candidateExperiments: baseAnalysis.liveExperiments,
    requestedSector: fields.sector_group || fields.sectorGroup || ""
  };

  const prompt = `You are a startup feedback reviewer. The local ML model already produced the score and evidence below.

Rules:
- Do not invent a new numeric score. Keep modelScore as the authority.
- Write for the founder who typed this exact idea. Use their customer, workflow, and wedge.
- First verify the evidence. Only mention a comparable if its matchReasons genuinely connect to the idea. If not, ignore it and add a warning.
- Never repeat awkward dataset labels, CSV fragments, or generic phrases like "Giants", "Risk unclear", or "No dominant sector risk pattern found".
- If evidence is thin, say the score is uncertain and explain what proof would move it.
- Rewrite the verdict in plain founder language: why this score, what is promising, what is weak.
- Make mutations specific, not template labels. Each mutation should change customer, wedge, distribution, pricing, or moat.
- Experiments must be executable in 7 days and tied to one measurable signal.
- copycatRisk should be a short moat diagnosis, not a long list of companies.
- hiddenOpportunity should be a crisp non-obvious angle based on the idea, not a generic sector sentence.
- Return only JSON.
- Return only JSON.

Local model output:
${JSON.stringify(compactModelOutput, null, 2)}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            decisionReason: { type: Type.STRING },
            verificationSummary: { type: Type.STRING },
            evidenceWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            scoreReview: { type: Type.STRING },
            personalizedAdvice: { type: Type.STRING },
            mutations: { type: Type.ARRAY, items: { type: Type.STRING } },
            crazyPivot: { type: Type.STRING },
            copycatRisk: { type: Type.STRING },
            liveExperiments: { type: Type.ARRAY, items: { type: Type.STRING } },
            mistakePredictor: { type: Type.STRING },
            hiddenOpportunity: { type: Type.STRING },
            nextMove: { type: Type.STRING },
            marketPotential: { type: Type.INTEGER },
            executionFeasibility: { type: Type.INTEGER },
            defensibility: { type: Type.INTEGER },
            capitalEfficiency: { type: Type.INTEGER }
          },
          required: ["decisionReason", "verificationSummary", "evidenceWarnings", "scoreReview", "personalizedAdvice", "mutations", "crazyPivot", "copycatRisk", "liveExperiments", "mistakePredictor", "hiddenOpportunity", "nextMove"]
        }
      }
    });
    return mergeGeminiIdeaFeedback(baseAnalysis, JSON.parse(response.text), model);
  } catch (err) {
    console.warn(`Gemini idea refinement unavailable, returning model feedback: ${err.message}`);
    return {
      ...baseAnalysis,
      llm: {
        provider: "gemini",
        model,
        used: false,
        error: err.message
      }
    };
  }
}

export async function analyzeIdeaText(idea, fields = {}) {
  const t = safeText(idea);
  if (!t || t.length < 10) throw new Error("Idea too short");
  const usePublicSetting = fields.usePublicContext ?? fields.useLiveContext ?? fields.useWebContext;
  // Bypass cache slightly by appending a random string so the teacher gets variance
  const cacheKey = JSON.stringify({
    idea: norm(t),
    sector: fields.sector_group || fields.sectorGroup || "",
    funding: fields.funding_total_usd || fields.fundingTotalUsd || "",
    age: fields.company_age || fields.companyAge || "",
    live: usePublicSetting ?? "auto",
    variance: Math.random().toString(36).substring(7)
  });

  return cachedAsync(ideaAnalysisCache, cacheKey, IDEA_CACHE_TTL_MS, async () => {
  const ml = await runStartupModel({ ...fields, idea: t });
  const bestDatasetSimilarity = Math.max(
    0,
    ...(ml.comparables?.successfulMatches || []).map((x) => Number(x.similarity || 0)),
    ...(ml.comparables?.failureMatches || []).map((x) => Number(x.similarity || 0)),
    ...(ml.comparables?.referenceMatches || []).map((x) => Number(x.similarity || 0)),
    Number(ml.comparables?.bestDatasetSimilarity || 0)
  );
  const hasDatasetMatches = bestDatasetSimilarity >= IDEA_DATASET_MATCH_THRESHOLD;
  const forceLive = usePublicSetting === true || usePublicSetting === "true";
  const skipLive = usePublicSetting === false || usePublicSetting === "false";
  const shouldUseLive = forceLive || (!skipLive && !hasDatasetMatches);

  if (shouldUseLive) {
    const liveKey = JSON.stringify({ idea: norm(t), sector: ml.features?.sector_group || "" });
    ml.publicContext = await withTimeout(
      cachedAsync(publicIdeaCache, liveKey, LIVE_CACHE_TTL_MS, () => getPublicIdeaContext(t, ml.features).catch(() => [])),
      IDEA_LIVE_TIMEOUT_MS,
      []
    );
  } else {
    ml.publicContext = [];
  }
  const firstStage = buildMlIdeaAnalysis(t, ml);
  const result = await refineIdeaWithGemini(t, firstStage, fields);
  result.contextStrategy = {
    datasetFirst: true,
    geminiReviewPass: result.llm?.provider === "gemini" && result.llm?.used === true,
    bestDatasetSimilarity: Number(bestDatasetSimilarity.toFixed(3)),
    usedLiveContext: shouldUseLive && ml.publicContext.length > 0,
    liveContextTimedOutOrEmpty: shouldUseLive && ml.publicContext.length === 0,
    reason: hasDatasetMatches
      ? "Dataset matches were strong enough, so live lookup was skipped."
      : "Dataset matches were weak, so live context was attempted with a short timeout."
  };
  return result;
  });
}

export function warmMlWorker() {
  loadIdeaDatasets()
    .then(() => console.log("idea datasets ready"))
    .catch((err) => console.warn("Idea dataset warmup skipped: " + err.message));
}
