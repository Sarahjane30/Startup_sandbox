import { Type } from "@google/genai";
import { ai } from "./config.mjs";
import { runSimulationModel } from "./pythonEngines.mjs";
import { norm, safeText } from "./utils.mjs";

function startupSimSchema() {
  const metricObject = {
    type: Type.OBJECT,
    properties: {
      cash: { type: Type.NUMBER },
      runwayMonths: { type: Type.INTEGER },
      users: { type: Type.INTEGER },
      revenue: { type: Type.NUMBER },
      retention: { type: Type.INTEGER },
      equityLeft: { type: Type.INTEGER },
      dilution: { type: Type.INTEGER },
      teamSize: { type: Type.INTEGER },
      growth: { type: Type.INTEGER },
      healthScore: { type: Type.INTEGER },
      founderStress: { type: Type.INTEGER },
      morale: { type: Type.INTEGER },
      investorInterest: { type: Type.INTEGER },
      technicalDebt: { type: Type.INTEGER }
    },
    required: ["cash", "runwayMonths", "users", "revenue", "retention", "equityLeft", "dilution", "teamSize", "growth", "healthScore", "founderStress", "morale", "investorInterest", "technicalDebt"]
  };

  return {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING },
      patternMatch: { type: Type.STRING },
      visible: metricObject,
      hidden: {
        type: Type.OBJECT,
        properties: {
          investorConfidence: { type: Type.INTEGER },
          teamTrust: { type: Type.INTEGER },
          marketHype: { type: Type.INTEGER },
          founderBurnout: { type: Type.INTEGER },
          competition: { type: Type.INTEGER },
          virality: { type: Type.INTEGER },
          productQuality: { type: Type.INTEGER },
          customerPain: { type: Type.INTEGER }
        },
        required: ["investorConfidence", "teamTrust", "marketHype", "founderBurnout", "competition", "virality", "productQuality", "customerPain"]
      },
      round: {
        type: Type.OBJECT,
        properties: {
          month: { type: Type.INTEGER },
          stage: { type: Type.STRING },
          title: { type: Type.STRING },
          narrative: { type: Type.STRING },
          randomEvent: { type: Type.STRING },
          events: { type: Type.ARRAY, items: { type: Type.STRING } },
          choices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["id", "label", "description"]
            }
          }
        },
        required: ["month", "stage", "title", "narrative", "randomEvent", "events", "choices"]
      },
      lesson: {
        type: Type.OBJECT,
        properties: {
          beginnerChoice: { type: Type.STRING },
          smartChoice: { type: Type.STRING },
          why: { type: Type.STRING }
        },
        required: ["beginnerChoice", "smartChoice", "why"]
      },
      chartData: {
        type: Type.OBJECT,
        properties: {
          labels: { type: Type.ARRAY, items: { type: Type.STRING } },
          users: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          revenue: { type: Type.ARRAY, items: { type: Type.NUMBER } }
          ,
          runway: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          health: { type: Type.ARRAY, items: { type: Type.NUMBER } }
        },
        required: ["labels", "users", "revenue", "runway", "health"]
      },
      topMetrics: {
        type: Type.OBJECT,
        properties: {
          survivabilityScore: { type: Type.INTEGER },
          fundingLikelihood: { type: Type.INTEGER },
          marketFitScore: { type: Type.INTEGER },
          burnRunway: { type: Type.STRING }
        }
      },
      timeline: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            period: { type: Type.STRING },
            title: { type: Type.STRING },
            narrative: { type: Type.STRING },
            metrics: {
              type: Type.OBJECT,
              properties: {
                users: { type: Type.STRING },
                revenue: { type: Type.STRING },
                retention: { type: Type.STRING },
                keyEvent: { type: Type.STRING }
              }
            }
          }
        }
      },
      failureTimeline: { type: Type.STRING },
      investorReaction: { type: Type.STRING },
      userReaction: { type: Type.STRING },
      strategicMoves: { type: Type.STRING },
      history: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            month: { type: Type.INTEGER },
            choice: { type: Type.STRING },
            outcome: { type: Type.STRING }
          },
          required: ["month", "choice", "outcome"]
        }
      }
    },
    required: ["summary", "patternMatch", "visible", "hidden", "round", "lesson", "chartData", "history"]
  };
}

async function generateFounderSimulation(prompt) {
  const maxRetries = 3;
  const baseDelay = 1000;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: startupSimSchema()
        }
      });
      return JSON.parse(response.text);
    } catch (err) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isRetryable = err?.status === 503 || err?.status === 429;
      
      if (!isRetryable || isLastAttempt) {
        throw err;
      }
      
      const delayMs = baseDelay * Math.pow(2, attempt);
      console.log(`Gemini API attempt ${attempt + 1} failed (${err?.status}). Retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function customizedDeckSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      tagline: { type: Type.STRING },
      questionDeck: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            sector: { type: Type.STRING },
            theme: { type: Type.STRING },
            title: { type: Type.STRING },
            prompt: { type: Type.STRING },
            context: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ["id", "label", "description"]
              }
            }
          },
          required: ["id", "sector", "theme", "title", "prompt", "context", "options"]
        }
      }
    },
    required: ["tagline", "questionDeck"]
  };
}

function pregeneratedScenariosSchema() {
  return {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        narrative: { type: Type.STRING },
        randomEvent: { type: Type.STRING }
      },
      required: ["title", "narrative", "randomEvent"]
    }
  };
}

async function generateTaglineAndCustomDeck(startup, founder, questionDeck) {
  const startupName = startup.name || "Unnamed Startup";
  const startupIdea = startup.idea || "a new startup";
  const startupIndustry = startup.industry || "AI";
  const customerType = startup.customerType || "B2B";

  const prompt = `You are a professional startup advisor and game designer.
The user is running a startup simulation for their company:
Name: ${startupName}
Idea: ${startupIdea}
Industry: ${startupIndustry}
Customer Type: ${customerType}

Please perform two tasks:
1. Generate a single, highly professional, creative, and punchy tagline (under 10 words) for this specific startup. Avoid generic templates.
2. Customize the following deck of strategic questions to make them highly specific to this company's product, technology, and customers instead of generic industry scenarios.

Original Question Deck (JSON):
${JSON.stringify(questionDeck || [], null, 2)}

Rules for customizing questions:
1. Return a valid JSON object matching the requested schema.
2. Do NOT change the question 'id', 'sector', 'theme', or 'title'. These must remain exactly as is.
3. Do NOT change the options' 'id' (e.g., A, B, C, D). These must remain exactly as is.
4. Rewrite the 'prompt' of each question to describe a concrete situation or crisis that specifically fits ${startupName}'s idea ("${startupIdea}"). For example, if the theme is "competitor", name a realistic competitor type or specific feature copycat. If the theme is "regulatory", describe a specific compliance or legal headache relevant to "${startupIdea}".
5. Rewrite the 'context' to show the concrete stakeholder pressure and product risk (e.g. naming specific stakeholders or technical components).
6. For each option, rewrite its 'label' and 'description' to be the concrete action the founder would take and its immediate consequence for this company (e.g. reference the company's product features, marketing channels, or specific customer reactions). Keep the same choices philosophy (A, B, C, D have specific underlying strategic themes).
7. Ensure all generated text is realistic, punchy, professional, and fits well into a business game.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: customizedDeckSchema()
      }
    });
    const parsed = JSON.parse(response.text);

    // Merge the original options' effects, skill, and why back into the rewritten questions
    const rewrittenDeck = (parsed.questionDeck || []).map((rewrittenQuestion) => {
      const originalQuestion = (questionDeck || []).find((q) => q.id === rewrittenQuestion.id);
      if (!originalQuestion) return rewrittenQuestion;

      const rewrittenOptions = Array.isArray(rewrittenQuestion.options) ? rewrittenQuestion.options : [];
      const mergedOptions = rewrittenOptions.map((rewrittenOption) => {
        const originalOption = originalQuestion.options.find((o) => o.id === rewrittenOption.id);
        if (!originalOption) return rewrittenOption;
        return {
          ...rewrittenOption,
          effects: originalOption.effects,
          skill: originalOption.skill,
          why: originalOption.why
        };
      });

      return {
        ...rewrittenQuestion,
        options: mergedOptions,
        companies: originalQuestion.companies
      };
    });

    return {
      tagline: parsed.tagline || startupIdea,
      questionDeck: rewrittenDeck
    };
  } catch (err) {
    console.error("Gemini Deck Customization Error, falling back to original:", err);
    return {
      tagline: startupIdea,
      questionDeck: questionDeck || []
    };
  }
}

async function pregenerateAllScenariosWithGemini(startup, tagline, count) {
  const startupName = startup.name || "Unnamed Startup";
  const startupIdea = startup.idea || "a new startup";
  const startupIndustry = startup.industry || "AI";

  const prompt = `You are a professional startup advisor and game designer.
Generate exactly ${count} monthly scenarios for the following company's startup simulation game:
Startup Name: ${startupName}
Idea: ${startupIdea}
Industry: ${startupIndustry}
Company Tagline: ${tagline}

Rules:
1. Return a valid JSON array matching the requested schema.
2. Provide exactly ${count} scenarios in order from Month 1 to Month ${count}.
3. The 'title' should describe the theme of the month for ${startupName}.
4. The 'narrative' should describe a concrete situation, milestone, or challenge for ${startupName}'s product and customers.
5. The 'randomEvent' should be a realistic, specific incident for this company (e.g. competitor action, server issue, viral post).
6. Keep descriptions punchy, professional, and fitting for a business game.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: pregeneratedScenariosSchema()
      }
    });
    return JSON.parse(response.text) || [];
  } catch (err) {
    console.error("Gemini Pre-generation Error, falling back to original:", err);
    return [];
  }
}

function compactSimState(state) {
  return {
    summary: safeText(state?.summary),
    patternMatch: safeText(state?.patternMatch),
    founder: state?.founder || {},
    startup: state?.startup || {},
    visible: state?.visible || {},
    hidden: state?.hidden || {},
    round: state?.round || {},
    lesson: state?.lesson || {},
    chartData: state?.chartData || {},
    history: Array.isArray(state?.history) ? state.history.slice(-8) : []
  };
}

function normalizeStartupIndustry(startup = {}) {
  const raw = safeText(startup.industry);
  const text = norm(raw || startup.idea || "");
  if (/(education|edtech|student|school|teacher|tutor|learning|course|exam)/.test(text)) return "Education";
  if (/(health|healthcare|medical|patient|clinic|doctor|nurse|therapy)/.test(text)) return "Healthcare";
  if (/(fintech|finance|bank|payment|invoice|accounting|tax|insurance|loan)/.test(text)) return "Fintech";
  if (/(retail|commerce|shop|store|marketplace|merchant)/.test(text)) return "Retail";
  if (/(food|restaurant|meal|kitchen|hospitality|cafe)/.test(text)) return "Food Services";
  if (/(manufacturing|factory|industrial|logistics|supply chain|hardware)/.test(text)) return "Manufacturing";
  if (/(pet|dog|cat|vet|veterinary|animal)/.test(text)) return "Pet Care";
  if (/(ai|artificial intelligence|machine learning|ml|llm|model|agent|automation|data)/.test(text)) return "AI";
  if (/(software|saas|platform|app)/.test(text)) return "SaaS";
  return raw || "Startup";
}

function enforceStartupContext(sim, startup = {}) {
  const industry = normalizeStartupIndustry(startup);
  const safeStartup = { ...startup, tagline: sim.modelState?.tagline || startup.tagline, industry };
  const modelState = { ...(sim.modelState || {}), sector: industry };
  const modelScenario = sim.modelScenario ? { ...sim.modelScenario, sector: industry } : sim.modelScenario;
  const summary = safeText(sim.summary).replace(/^Your\s+.+?\s+startup begins with/i, `Your ${industry} startup begins with`);

  return {
    ...sim,
    startup: safeStartup,
    modelState,
    modelScenario,
    summary: summary || sim.summary
  };
}

function enrichSimulationData(sim) {
  const visible = sim.visible || {};
  const lesson = sim.lesson || {};
  const round = sim.round || {};

  const topMetrics = sim.topMetrics || {
    survivabilityScore: sim.topMetrics?.survivabilityScore ?? Math.round((simNumber(visible.healthScore) + simNumber(visible.retention) + simNumber(visible.growth)) / 3),
    fundingLikelihood: sim.topMetrics?.fundingLikelihood ?? simNumber(visible.investorInterest || visible.investorConfidence),
    marketFitScore: sim.topMetrics?.marketFitScore ?? simNumber(visible.growth || visible.retention),
    burnRunway: sim.topMetrics?.burnRunway ?? (typeof visible.runwayMonths === "number" ? `${visible.runwayMonths} months` : "--")
  };

  const timeline = sim.timeline || (round ? [
    {
      period: `Month ${round.month || 1}`,
      title: round.title || round.stage || "Current phase",
      narrative: round.narrative || round.randomEvent || "",
      metrics: {
        users: visible.users != null ? `${Math.round(visible.users).toLocaleString("en-US")} users` : "--",
        revenue: visible.revenue != null ? `$${Math.round(visible.revenue).toLocaleString("en-US")}` : "--",
        retention: visible.retention != null ? `${visible.retention}%` : "--",
        keyEvent: round.randomEvent || ""
      }
    }
  ] : []);

  return {
    ...sim,
    topMetrics,
    timeline,
    failureTimeline: sim.failureTimeline || sim.patternMatch || "",
    investorReaction: sim.investorReaction || (typeof visible.investorInterest === "number" ? `Investor interest is around ${visible.investorInterest}/100.` : ""),
    userReaction: sim.userReaction || (typeof visible.retention === "number" ? `Early user retention is around ${visible.retention}%.` : ""),
    strategicMoves: sim.strategicMoves || [lesson.beginnerChoice, lesson.smartChoice].filter(Boolean).join("\n")
  };
}

function simNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function simClamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(simNumber(value))));
}

function fallbackChart(label, users, revenue, previous = null) {
  const labels = Array.isArray(previous?.labels) ? [...previous.labels, label] : [label];
  const userData = Array.isArray(previous?.users) ? [...previous.users, users] : [users];
  const revenueData = Array.isArray(previous?.revenue) ? [...previous.revenue, revenue] : [revenue];
  const runwayData = Array.isArray(previous?.runway) ? [...previous.runway, 0] : [0];
  const healthData = Array.isArray(previous?.health) ? [...previous.health, 0] : [0];
  return { labels: labels.slice(-8), users: userData.slice(-8), revenue: revenueData.slice(-8), runway: runwayData.slice(-8), health: healthData.slice(-8) };
}

function fallbackChartPoint(label, visible, previous = null) {
  const labels = Array.isArray(previous?.labels) ? [...previous.labels, label] : [label];
  const users = Array.isArray(previous?.users) ? [...previous.users, Math.round(simNumber(visible.users))] : [Math.round(simNumber(visible.users))];
  const revenue = Array.isArray(previous?.revenue) ? [...previous.revenue, Math.round(simNumber(visible.revenue))] : [Math.round(simNumber(visible.revenue))];
  const runway = Array.isArray(previous?.runway) ? [...previous.runway, Math.round(simNumber(visible.runwayMonths))] : [Math.round(simNumber(visible.runwayMonths))];
  const health = Array.isArray(previous?.health) ? [...previous.health, Math.round(simNumber(visible.healthScore))] : [Math.round(simNumber(visible.healthScore))];
  return { labels: labels.slice(-8), users: users.slice(-8), revenue: revenue.slice(-8), runway: runway.slice(-8), health: health.slice(-8) };
}

function chooseRandomEvent(visible, startup, month) {
  const events = [
    {
      name: "Investor rejection",
      text: "A seed investor likes the market but passes because retention is still too weak.",
      apply() {
        visible.investorInterest = simClamp(visible.investorInterest - 8);
        visible.founderStress = simClamp(visible.founderStress + 7);
      }
    },
    {
      name: "Server crash",
      text: "A server crash hits during a small usage spike and exposes brittle infrastructure.",
      apply() {
        visible.technicalDebt = simClamp(visible.technicalDebt + 10);
        visible.morale = simClamp(visible.morale - 5);
        visible.retention = simClamp(visible.retention - 3);
      }
    },
    {
      name: "Viral growth",
      text: "A post unexpectedly goes viral and sends a rush of curious but low-intent users.",
      apply() {
        visible.users = Math.round(simNumber(visible.users) * 1.55 + 40);
        visible.growth = simClamp(visible.growth + 18);
        visible.technicalDebt = simClamp(visible.technicalDebt + 5);
      }
    },
    {
      name: "Cofounder tension",
      text: "A cofounder starts questioning the direction after weeks of fuzzy customer feedback.",
      apply() {
        visible.morale = simClamp(visible.morale - 10);
        visible.founderStress = simClamp(visible.founderStress + 8);
      }
    },
    {
      name: "Competitor noise",
      text: "A competitor announces funding and makes your market feel louder overnight.",
      apply() {
        visible.investorInterest = simClamp(visible.investorInterest + 4);
        visible.founderStress = simClamp(visible.founderStress + 5);
      }
    }
  ];
  const indexSeed = month + safeText(startup?.industry).length + Math.round(simNumber(visible.users));
  const event = events[indexSeed % events.length];
  event.apply();
  return event.text;
}

function fallbackRound(month, visible, startup, lastOutcome = "") {
  const pressure = visible.runwayMonths <= 3 ? "Runway pressure" : safeText(startup?.startupStage) || "Early traction";
  const randomEvent = chooseRandomEvent(visible, startup, month);
  return {
    month,
    stage: pressure,
    title: visible.runwayMonths <= 3 ? "The Runway Squeeze" : "The First Traction Test",
    narrative: lastOutcome || `You are at month ${month}. The product has a small signal, but the next move decides whether this becomes learning velocity or expensive motion.`,
    randomEvent,
    events: [
      randomEvent,
      visible.runwayMonths <= 3 ? "cash runway is tightening" : "new users are curious but not committed",
      startup?.customerType === "B2B" ? "a warm enterprise lead asks for custom features" : "users ask for a cheaper plan",
      "one competitor starts posting loudly on social"
    ],
    choices: [
      { id: "A", label: "Talk to 20 users", description: "Pause feature work and run focused problem interviews before changing the product." },
      { id: "B", label: "Ship more features", description: "Try to make the product feel bigger and more complete before selling harder." },
      { id: "C", label: "Raise money now", description: "Pitch investors with the current story and try to extend runway quickly." },
      { id: "D", label: "Narrow the wedge", description: "Cut scope to one painful use case and sell it manually to a sharper segment." }
    ]
  };
}

function buildStartupNarrative(founder, startup, visible) {
  const founderType = norm(founder?.founderType) || "founder";
  const industry = safeText(startup?.industry) || "your space";
  const stage = safeText(startup?.startupStage) || "early";
  const isBB = norm(startup?.customerType).includes("b2b");
  
  const narratives = {
    "College student": `You launched from campus with ${moneyText(visible.cash)} in savings. The energy is high, but time is your constraint.`,
    "Working professional": `You left your job with ${moneyText(visible.cash)} and some severance. The pressure to prove this works is real.`,
    "Full-time founder": `You are betting your entire focus on this. With ${moneyText(visible.cash)}, every decision compounds.`,
    "Repeat founder": `You have been here before. This time, with ${moneyText(visible.cash)}, you are moving faster and trusting your instincts more.`,
  };
  
  const openingLine = narratives[founderType] || `You are starting this ${industry} venture with ${moneyText(visible.cash)}.`;
  const stageContext = stage.includes("Idea") ? "Your MVP is a rough sketch."
    : stage.includes("MVP") ? "Your MVP works, but only you know how it works."
    : stage.includes("pre-revenue") ? "You have product-market fit signals but no paying customers yet."
    : "You have early revenue, but the path to scale is not clear yet.";
  
  const customerContext = isBB
    ? `You are targeting ${safeText(startup?.customerType)} customers. Enterprise cycles are long, but the deals are bigger.`
    : `You are targeting ${safeText(startup?.customerType)} users. Virality is possible, but retention is fragile.`;
  
  return `${openingLine} ${stageContext} ${customerContext} The simulation will test whether you can find verified demand before runway becomes your only decision maker.`;
}

function fallbackInitialSimulation(founder, startup) {
  const cash = simNumber(founder?.money, 25000);
  const burn = Math.max(1, simNumber(founder?.monthlyBurn, 4000));
  const hasTech = norm(founder?.technicalCofounder) === "yes";
  const audienceBoost = norm(founder?.audience).includes("large") ? 18 : norm(founder?.audience).includes("small") ? 8 : 0;
  const knowledgeBoost = norm(founder?.industryKnowledge).includes("high") ? 12 : norm(founder?.industryKnowledge).includes("low") ? -8 : 0;
  const runwayMonths = Math.max(1, Math.floor(cash / burn));
  const users = Math.max(8, 35 + audienceBoost + knowledgeBoost);
  const revenue = norm(startup?.customerType).includes("b2b") ? 0 : Math.max(0, users * 1.5);
  const healthScore = simClamp(42 + audienceBoost + knowledgeBoost + (hasTech ? 8 : -10) + Math.min(runwayMonths, 10));
  const visible = {
    cash,
    runwayMonths,
    users,
    revenue,
    retention: simClamp(24 + knowledgeBoost + (hasTech ? 6 : -4)),
    equityLeft: 100,
    dilution: 0,
    teamSize: Math.max(1, simNumber(founder?.teamSize, 1)),
    growth: simClamp(20 + audienceBoost + knowledgeBoost),
    healthScore,
    founderStress: simClamp(65 - runwayMonths * 3 + (norm(founder?.personality).includes("perfectionist") ? 12 : 0)),
    morale: simClamp(58 + (hasTech ? 8 : -8)),
    investorInterest: simClamp(24 + audienceBoost + knowledgeBoost),
    technicalDebt: simClamp(hasTech ? 22 : 45)
  };
  
  const patterns = [
    "Your path currently resembles early Airbnb-style manual learning, with a possible Quibi-style risk if you overbuild before proving demand.",
    "Your path currently resembles a disciplined early-stage team trading vanity metrics for verified demand signals.",
    "Your path currently resembles the pivot risk that hit many first-time founders: building in isolation before customer contact."
  ];
  const patternIndex = (safeText(startup?.industry).length + safeText(founder?.founderType).length) % patterns.length;

  return enrichSimulationData({
    summary: `You are starting with ${moneyText(cash)} in cash and about ${runwayMonths} months of runway. The simulation will reward evidence from customers over theatrical momentum.`,
    patternMatch: "Your path currently resembles early Airbnb-style manual learning, with a possible Quibi-style risk if you overbuild before proving demand.",
    founder,
    startup,
    visible,
    hidden: {
      investorConfidence: visible.investorInterest,
      teamTrust: visible.morale,
      marketHype: simClamp(35 + audienceBoost),
      founderBurnout: visible.founderStress,
      competition: 42,
      virality: simClamp(18 + audienceBoost),
      productQuality: simClamp(hasTech ? 50 : 32),
      customerPain: simClamp(45 + knowledgeBoost)
    },
    round: fallbackRound(1, visible, startup),
    lesson: {
      beginnerChoice: "Beginner founders often try to look bigger: more features, more decks, more vague growth talk.",
      smartChoice: "Experienced founders force contact with reality: narrower user segment, painful problem, faster learning loop.",
      why: "At this stage, the scarcest resource is not code or pitch polish. It is verified demand before runway disappears."
    },
    chartData: fallbackChartPoint("Month 1", visible),
    history: []
  });
}

function moneyText(value) {
  return `$${Math.round(simNumber(value)).toLocaleString("en-US")}`;
}

function fallbackAdvanceSimulation(state, choiceId) {
  const compact = compactSimState(state);
  const visible = { ...compact.visible };
  const hidden = { ...compact.hidden };
  const month = simNumber(compact.round?.month, 1) + 2;
  const burn = Math.max(1, simNumber(compact.founder?.monthlyBurn, Math.max(2000, visible.cash / 6)));
  const choice = (compact.round?.choices || []).find((c) => c.id === choiceId) || { id: choiceId, label: "Unknown choice" };
  let outcome = "";

  visible.cash = simNumber(visible.cash) - burn * 2 + simNumber(visible.revenue) * 2;

  if (choiceId === "A") {
    visible.users = simNumber(visible.users) + 35;
    visible.growth = simClamp(visible.growth + 8);
    visible.retention = simClamp(visible.retention + 10);
    visible.revenue = simNumber(visible.revenue) + 300;
    visible.founderStress = simClamp(visible.founderStress - 5);
    visible.morale = simClamp(visible.morale + 8);
    hidden.customerPain = simClamp(hidden.customerPain + 12);
    outcome = "The interviews are uncomfortable but useful. Two assumptions break, one painful segment becomes obvious, and the product gets sharper.";
  } else if (choiceId === "B") {
    visible.users = simNumber(visible.users) + 20;
    visible.growth = simClamp(visible.growth + 2);
    visible.retention = simClamp(visible.retention - 4);
    visible.technicalDebt = simClamp(visible.technicalDebt + 16);
    visible.founderStress = simClamp(visible.founderStress + 10);
    hidden.productQuality = simClamp(hidden.productQuality - 4);
    outcome = "The product looks busier, but the new features do not explain why people should return. Technical debt starts taxing every small change.";
  } else if (choiceId === "C") {
    const weakTerms = visible.investorInterest < 45;
    visible.cash += weakTerms ? 75000 : 150000;
    visible.equityLeft = simClamp(visible.equityLeft - (weakTerms ? 18 : 8), 0, 100);
    visible.dilution = 100 - visible.equityLeft;
    visible.investorInterest = simClamp(visible.investorInterest + 10);
    visible.founderStress = simClamp(visible.founderStress - 8);
    hidden.investorConfidence = simClamp(hidden.investorConfidence + 10);
    outcome = weakTerms
      ? "You get money, but the terms are expensive because traction is thin. The company survives, while ownership takes an early hit."
      : "The raise extends runway without wrecking the cap table. Investors respond to the focused narrative more than the raw numbers.";
  } else {
    visible.users = simNumber(visible.users) + 55;
    visible.growth = simClamp(visible.growth + 12);
    visible.revenue = simNumber(visible.revenue) + 900;
    visible.retention = simClamp(visible.retention + 7);
    visible.morale = simClamp(visible.morale + 4);
    visible.founderStress = simClamp(visible.founderStress + 3);
    hidden.customerPain = simClamp(hidden.customerPain + 8);
    outcome = "The narrower wedge reduces ego but improves signal. Fewer people care, yet the ones who care are more willing to pay.";
  }

  visible.runwayMonths = Math.max(0, Math.floor(simNumber(visible.cash) / burn));
  visible.healthScore = simClamp((visible.retention * 0.35) + (visible.morale * 0.2) + (visible.investorInterest * 0.15) + Math.min(visible.runwayMonths * 5, 30) - (visible.technicalDebt * 0.15));
  visible.dilution = 100 - simClamp(visible.equityLeft);
  hidden.founderBurnout = visible.founderStress;
  hidden.teamTrust = visible.morale;

  return {
    ...compact,
    summary: `${outcome} You now have ${moneyText(visible.cash)} left, ${visible.runwayMonths} months of runway, and ${Math.round(visible.users).toLocaleString("en-US")} users.`,
    patternMatch: visible.equityLeft < 85
      ? "Your path currently resembles founder-friendly cautionary tales around early dilution."
      : "Your path currently resembles disciplined early-stage teams that trade vanity progress for validated demand.",
    visible,
    hidden,
    round: fallbackRound(month, visible, compact.startup, outcome),
    lesson: {
      beginnerChoice: choiceId === "B" ? "Beginner founders often add features when traction is weak." : "Beginner founders often optimize for relief from anxiety.",
      smartChoice: "Experienced founders protect runway, cap table, and learning velocity at the same time.",
      why: "A startup decision is rarely just tactical. It changes psychology, negotiating leverage, and the next set of available moves."
    },
    chartData: fallbackChartPoint(`Month ${month}`, visible, compact.chartData),
    history: [
      ...(compact.history || []),
      { month: simNumber(compact.round?.month, 1), choice: choice.label || choiceId, outcome }
    ].slice(-8)
  };
}

export async function simulateStartup(founder, startup) {
  const inferredIdea = [
    safeText(startup?.industry) && `${safeText(startup.industry)} startup`,
    safeText(startup?.customerType) && `for ${safeText(startup.customerType)} customers`,
    safeText(startup?.productType) && `delivered as ${safeText(startup.productType)}`,
    safeText(startup?.businessModel) && `with a ${safeText(startup.businessModel)} model`,
    safeText(startup?.revenueModel) && `charging ${safeText(startup.revenueModel)}`,
    safeText(startup?.aiDependency) && `with ${safeText(startup.aiDependency)} AI dependency`
  ].filter(Boolean).join(" ");
  const idea = safeText(startup?.idea).length >= 10 ? safeText(startup.idea) : inferredIdea;
  if (!idea || idea.length < 10) throw new Error("Idea too short");
  
  // Assign a unique ID per simulation run so the Python engine randomizes the question deck
  startup = { ...startup, idea, id: `run_${Date.now()}_${Math.random().toString(36).slice(2)}` };

  try {
    const modelResult = await runSimulationModel({ action: "start", founder, startup });
    
    if (modelResult) {
      try {
        const customized = await generateTaglineAndCustomDeck(startup, founder, modelResult.questionDeck);
        
        // Update tagline
        if (modelResult.modelState) {
          modelResult.modelState.tagline = customized.tagline;
        }
        modelResult.startup = { ...modelResult.startup, tagline: customized.tagline };

        // Update question deck
        modelResult.questionDeck = customized.questionDeck;

        // Update Month 1's strategic question
        if (modelResult.strategicQuestion) {
          const updatedQ = customized.questionDeck.find(q => q.id === modelResult.strategicQuestion.id);
          if (updatedQ) {
            modelResult.strategicQuestion = updatedQ;
          }
        }

        // Pre-generate all month scenarios
        const simLength = modelResult.questionDeck ? modelResult.questionDeck.length : 12;
        const pregeneratedScenarios = await pregenerateAllScenariosWithGemini(
          startup,
          customized.tagline,
          simLength
        );
        modelResult.pregeneratedScenarios = pregeneratedScenarios;
        
        // Customize Month 1 round scenario
        if (modelResult.round && pregeneratedScenarios.length > 0) {
          const customizedScenario = pregeneratedScenarios[0];
          modelResult.round.title = customizedScenario.title || modelResult.round.title;
          modelResult.round.narrative = customizedScenario.narrative || modelResult.round.narrative;
          modelResult.round.randomEvent = customizedScenario.randomEvent || modelResult.round.randomEvent;
          modelResult.round.events = [modelResult.round.narrative, modelResult.round.randomEvent].filter(Boolean);
        }
      } catch (geminiErr) {
        console.error("Failed to customize simulation with Gemini:", geminiErr);
      }
    }

    return enrichSimulationData(enforceStartupContext(modelResult, startup));
  } catch (err) {
    console.error("Python simulation model error:", err?.message || err);
  }

  const prompt = `You are a realistic Founder Decision Simulator: YC partner, startup operator, behavioral coach, and business game designer.

Create the starting world for an interactive startup simulation. The user is the founder.

Founder setup:
${JSON.stringify(founder || {}, null, 2)}

Startup setup:
${JSON.stringify(startup || {}, null, 2)}

Rules:
- This is not a prediction report. It is a decision round game.
- Track visible variables and hidden variables. Hidden variables must affect the visible world, but do not reveal them in the narrative.
- Make numbers plausible for a very early startup.
- The first round should be Month 1 or Month 2 and present exactly 4 choices with ids A, B, C, D.
- Include realistic founder psychology, market pressure, user feedback, investor behavior, runway risk, and at least one random event.
- visible.growth is a 0-100 traction momentum score. visible.dilution is 100 - founder equity left.
- chartData must include labels, users, revenue, runway, and health arrays.
- The lesson must compare beginner-founder instinct vs experienced-founder decision making.
- patternMatch should say "Your path currently resembles ..." and reference a real startup pattern or failure pattern.
- chartData should start with current history only, not a 12-month forecast.

Return only JSON in the required schema.`;

  try {
    const result = await generateFounderSimulation(prompt);
    return enrichSimulationData(enforceStartupContext({
      ...result,
      founder,
      startup,
      history: Array.isArray(result.history) ? result.history : []
    }, startup));
  } catch (err) {
    console.error("Simulation LLM Error:", err?.message || err);
    console.log("Falling back to deterministic simulation...");
    return enrichSimulationData(enforceStartupContext(fallbackInitialSimulation(founder, startup), startup));
  }
}

export async function advanceSimulation(state, choiceId, allocation, strategicAnswer, actorDecision = null) {
  const compactState = compactSimState(state);
  const chosen = (compactState.round?.choices || []).find((c) => c.id === choiceId) || { id: "BUDGET", label: "Operating budget", allocation };

  if (state?.modelState && state?.modelScenario) {
    try {
      const modelResult = await runSimulationModel({ action: "decision", state, choiceId, allocation, strategicAnswer, actorDecision });
      
      if (modelResult) {
        const tagline = state.modelState?.tagline || compactState.startup?.tagline || "";
        
        // Use pre-generated scenarios instead of calling Gemini per click
        const pregeneratedScenarios = state.pregeneratedScenarios || [];
        const roundIndex = (modelResult.round?.month || 1) - 1;
        
        if (modelResult.round && pregeneratedScenarios[roundIndex]) {
          const customized = pregeneratedScenarios[roundIndex];
          modelResult.round.title = customized.title || modelResult.round.title;
          modelResult.round.narrative = customized.narrative || modelResult.round.narrative;
          modelResult.round.randomEvent = customized.randomEvent || modelResult.round.randomEvent;
          modelResult.round.events = [modelResult.round.narrative, modelResult.round.randomEvent].filter(Boolean);
        }
        
        // Carry forward the pregenerated scenarios to the new state
        modelResult.pregeneratedScenarios = pregeneratedScenarios;
      }

      return enrichSimulationData(enforceStartupContext(modelResult, compactState.startup));
    } catch (err) {
      console.error("Python simulation decision error:", err?.message || err);
    }
  }

  const prompt = `Continue this Founder Decision Simulator by one decision round.

Current state:
${JSON.stringify(compactState, null, 2)}

The founder chose:
${JSON.stringify(chosen, null, 2)}

Rules:
- Apply realistic consequences to visible and hidden variables. Do not make every choice good.
- Cash must move based on burn, revenue, fundraising, hiring, pivots, and random events.
- Equity can fall if the decision involves fundraising or selling ownership.
- Maintain visible.dilution as 100 - visible.equityLeft and update visible.growth as traction momentum.
- Include a new randomEvent in the next round, such as cofounder quits, server crash, viral growth, or investor rejection.
- Founder personality should create strengths and liabilities in the outcome.
- Add one history item for the chosen decision and its consequence.
- Then generate the next monthly decision round with exactly 4 choices A-D.
- The next round month should move forward by 1 to 3 months.
- The lesson should explain what beginner founders usually do in this situation vs what experienced founders do.
- chartData should append the new month and keep prior values.
- chartData must include labels, users, revenue, runway, and health arrays.
- Keep narrative sharp, specific, and game-like.

Return only JSON in the required schema.`;

  try {
    const result = await generateFounderSimulation(prompt);
    return enrichSimulationData(enforceStartupContext({
      ...result,
      founder: compactState.founder,
      startup: compactState.startup
    }, compactState.startup));
  } catch (err) {
    console.error("Decision LLM Error:", err);
    return enrichSimulationData(enforceStartupContext(fallbackAdvanceSimulation(state, choiceId), compactState.startup));
  }
}
