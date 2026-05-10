// =============================================
//  STARTUP SANDBOX — simulation.js
//  Interactive Founder Decision Simulator
// =============================================

const $ = (id) => document.getElementById(id);

let usersChartInst = null;
let revenueChartInst = null;
let runwayChartInst = null;
let equityChartInst = null;
let currentSimState = null;
let countdownTimer = null;
let selectedActorDecision = null;

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────

const ui = {
  simBtn: $("simBtn"),
};

function setStatus(msg) {
  const el = $("simStatus");
  if (el) el.textContent = String(msg || "").replace(/[⏳✓]/g, "").trim();
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function formatMoney(value) {
  return `$${Math.round(Number(value) || 0).toLocaleString()}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EFFECT_WEIGHTS = {
  cash: 0.002,
  funding: 0.0015,
  revenue: 0.006,
  valuation: 0.00002,
  customer_count: 0.55,
  users: 0.55,
  retention: 1.4,
  nps: 1.1,
  morale: 0.95,
  investor_confidence: 1.35,
  product_quality: 1.25,
  innovation_score: 1.05,
  runway: 5,
  burn_rate: -0.015,
  churn_rate: -1.5,
  founder_stress: -1.1,
  burnout_risk: -1.2,
  tech_debt: -0.8,
  competition_pressure: -0.45,
  regulatory_risk: -0.55,
};

function scoreEffects(effects = {}) {
  return Object.entries(effects).reduce((sum, [key, value]) => {
    return sum + (EFFECT_WEIGHTS[key] || 0) * Number(value || 0);
  }, 0);
}

function analyzeChoices(data) {
  const scenarioChoices = data.modelScenario?.choices || [];
  const roundChoices = data.round?.choices || [];
  const byKey = new Map(scenarioChoices.map((choice) => [choice.key, choice]));

  const analyses = roundChoices.map((choice) => {
    const scenarioChoice = byKey.get(choice.key) || scenarioChoices.find((item) => item.label === choice.label) || {};
    const outcomes = scenarioChoice.outcomes || [];
    const expected = outcomes.reduce((sum, outcome) => {
      return sum + Number(outcome.weight || 0) * scoreEffects(outcome.effects || {});
    }, 0);
    const downside = outcomes
      .filter((outcome) => outcome.sentiment === "negative")
      .reduce((sum, outcome) => sum + Number(outcome.weight || 0), 0);
    const upside = outcomes
      .filter((outcome) => outcome.sentiment === "positive")
      .reduce((sum, outcome) => sum + Number(outcome.weight || 0), 0);
    const strategicScore = clamp(50 + expected * 2.4 - downside * 18 + upside * 10);
    const bestOutcome = [...outcomes].sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))[0];
    const worstOutcome = outcomes.find((outcome) => outcome.sentiment === "negative");

    return {
      ...choice,
      scenarioChoice,
      outcomes,
      expected,
      downside,
      upside,
      strategicScore,
      bestOutcome,
      worstOutcome,
    };
  });

  return analyses.sort((a, b) => b.strategicScore - a.strategicScore);
}

function choiceRationale(choice, rank) {
  if (rank === 0) {
    return `Best risk-adjusted move: ${choice.bestOutcome?.narrative || choice.description || "it improves the next decision set without taking reckless downside."}`;
  }
  if (choice.worstOutcome) {
    return `Not first pick because ${choice.worstOutcome.narrative || "its downside can weaken future optionality."}`;
  }
  return `Useful, but lower leverage than the recommendation in this round.`;
}

function collectFounder() {
  return {
    name: "Founder",
    money: Number($("money")?.value || 25000),
    monthlyBurn: Number($("monthlyBurn")?.value || 4000),
    teamSize: Number($("teamSize")?.value || 2),
    technicalCofounder: $("technicalCofounder")?.value || "Yes",
    founderType: $("founderType")?.value || "College student",
    country: $("country")?.value.trim() || "India",
    riskTolerance: $("riskTolerance")?.value || "Medium",
    audience: $("audience")?.value || "No audience",
    industryExperience: $("industryExperience")?.value || "Medium",
    timeCommitment: $("timeCommitment")?.value || "Part-time",
    personality: $("personality")?.value || "Visionary founder",
    simulationMonths: Math.max(1, Math.min(24, Number($("simulationMonths")?.value || 24))),
  };
}

function collectStartup() {
  return {
    idea: $("idea")?.value.trim(),
    startupStage: $("startupStage")?.value || "Idea",
    stage: $("startupStage")?.value || "Idea",
    industry: $("industry")?.value.trim(),
    customerType: $("customerType")?.value || "B2B",
    businessModel: $("businessModel")?.value || "Subscription",
    aiDependency: $("aiDependency")?.value || "Medium",
    productType: $("productType")?.value || "Software",
    revenueModel: $("revenueModel")?.value.trim(),
    simulationMonths: Math.max(1, Math.min(24, Number($("simulationMonths")?.value || 24))),
  };
}

function startSimulation() {
  runSimulation();
}

// ─────────────────────────────────────────────
// RENDER METRICS
// ─────────────────────────────────────────────

function renderMetrics(data) {
  const metricsGrid = $("simMetricsGrid");
  if (!metricsGrid) return;
  const visible = data.visible || {};
  const tm = data.topMetrics || {};

  const survivability =
    tm.survivabilityScore ?? visible.healthScore ?? "--";

  const funding =
    tm.fundingLikelihood ?? visible.investorInterest ?? "--";

  const marketFit =
    tm.marketFitScore ?? visible.growth ?? visible.retention ?? "--";

  const burnRunway =
    tm.burnRunway ||
    (typeof visible.runwayMonths === "number"
      ? `${visible.runwayMonths}${visible.runwayCapped ? "+" : ""} months`
      : "--");

  const formatMetric = (value) =>
    typeof value === "number" ? `${value}/100` : value || "--";

  const metricsHTML = [
    {
      label: "Survivability",
      val: formatMetric(survivability),
      sub: "Failure resistance",
    },
    {
      label: "Funding Likelihood",
      val: formatMetric(funding),
      sub: "Investor readiness",
    },
    {
      label: "Market Fit Score",
      val: formatMetric(marketFit),
      sub: "Customer pull",
    },
    {
      label: "Burn Runway",
      val: burnRunway,
      sub: "Cash survival window",
    },
  ]
    .map(
      ({ label, val, sub }) => `
      <div class="sim-card metric-card">
        <div class="sim-card-title">${label}</div>
        <div class="metric-value">${val}</div>
        <div class="metric-sub">${sub}</div>
      </div>
    `
    )
    .join("");

  metricsGrid.innerHTML = metricsHTML;
  metricsGrid.style.gridTemplateColumns = "repeat(4, 1fr)";
}

// ─────────────────────────────────────────────
// RENDER TIMELINE
// ─────────────────────────────────────────────

function renderTimeline(data) {
  const timelineContainer = $("simTimeline");
  if (!timelineContainer) return;

  const visible = data.visible || {};
  const round = data.round || {};

  let timeline = data.timeline || [];

  if (!timeline.length && round.month) {
    timeline = [
      {
        period: `Month ${round.month}`,
        title: round.title || round.stage || "Current Phase",
        narrative: round.narrative || round.randomEvent || "",
        metrics: {
          users:
            visible.users != null
              ? `${Math.round(
                  Number(visible.users)
                ).toLocaleString()} users`
              : "--",

          revenue:
            visible.revenue != null
              ? `$${Math.round(
                  Number(visible.revenue)
                ).toLocaleString()} MRR`
              : "--",

          retention:
            visible.retention != null
              ? `${visible.retention}%`
              : "--",

          keyEvent: round.randomEvent || "",
        },
      },
    ];
  }

  const periodColors = [
    "var(--primary)",
    "var(--accent)",
    "var(--green)",
  ];

  if (!timeline.length) {
    timelineContainer.innerHTML = "";
    timelineContainer.style.display = "none";
    return;
  }

  timelineContainer.style.display = "flex";
  timelineContainer.innerHTML = timeline
    .map(
      (item, i) => `
      <div class="timeline-item">
        <div class="timeline-dot" style="border-color: ${periodColors[i % 3]}; color: ${periodColors[i % 3]};">
          ${item.period?.replace("Month ", "Mo ") || `P${i + 1}`}
        </div>

        <div class="timeline-content">
          <div class="timeline-title">
            ${item.title || item.period}
          </div>

          <div class="timeline-metrics">
            <div class="tm">
              <div class="tm-label">USERS</div>
              <div class="tm-val" style="color:${periodColors[i % 3]};">
                ${item.metrics?.users || "--"}
              </div>
            </div>

            <div class="tm">
              <div class="tm-label">REVENUE</div>
              <div class="tm-val" style="color:${periodColors[i % 3]};">
                ${item.metrics?.revenue || "--"}
              </div>
            </div>

            <div class="tm">
              <div class="tm-label">RETENTION</div>
              <div class="tm-val" style="color:${periodColors[i % 3]};">
                ${item.metrics?.retention || "--"}
              </div>
            </div>
          </div>

          <p class="card-text" style="margin-bottom:12px;">
            ${item.narrative || ""}
          </p>

          ${
            item.metrics?.keyEvent
              ? `
            <div class="event-note">
              KEY EVENT: ${escapeHtml(item.metrics.keyEvent)}
            </div>
          `
              : ""
          }
        </div>
      </div>
    `
    )
    .join("");
}

// ─────────────────────────────────────────────
// RENDER CHOICES
// ─────────────────────────────────────────────

function renderChoices(data) {
  const round = data.round || {};
  const budget = data.operatingBudget || {};
  const categories = budget.categories || [];
  const visible = data.visible || {};
  const question = data.strategicQuestion || {};
  const questionOptions = question.options || [];
  const actorOffer = data.pendingActorOffer || null;
  if (actorOffer && (!selectedActorDecision || selectedActorDecision.offerId !== actorOffer.id)) {
    selectedActorDecision = { offerId: actorOffer.id || "", action: "decline" };
  }

  const choicesContainer = $("simChoices");

  if (!choicesContainer) return;

  if (data.status === "completed" || !categories.length) {
    choicesContainer.style.display = "none";
    return;
  }

  choicesContainer.style.display = "block";
  const suggestedSpend = Number(budget.suggestedSpend || 0);

  choicesContainer.innerHTML = `
    <div class="section-eyebrow" style="margin-bottom:16px;">
      // MONTH ${round.month || "?"} OPERATING REVIEW / ${data.maxMonths || 24} MONTH RUN
    </div>

    <div class="decision-shell">
      <div class="decision-head">
        <div>
          <div class="card-label primary-label">FOUNDER QUESTION + OPERATING BUDGET</div>
          <h3>${escapeHtml(round.title || "Operating Review")}</h3>
          <p class="card-text">${escapeHtml(round.narrative || "Allocate scarce resources, then let the month resolve.")}</p>
        </div>
        <div class="budget-total">
          <span>Target spend</span>
          <strong id="budgetTarget">${formatMoney(suggestedSpend)}</strong>
          <small>Cash: ${formatMoney(visible.cash)}</small>
        </div>
      </div>

      ${actorOffer ? `
        <section class="actor-offer">
          <div>
            <div class="card-label primary-label">${escapeHtml(actorOffer.title || "Agent notification")}</div>
            <h4>${escapeHtml(actorOffer.from || "Startup network")}</h4>
            <p>${escapeHtml(actorOffer.message || "")}</p>
            ${Number(actorOffer.amount || 0) ? `
              <small>${formatMoney(actorOffer.amount)} for ${escapeHtml(actorOffer.dilution ?? "--")}% dilution</small>
            ` : ""}
          </div>
          <div class="actor-actions" data-offer-id="${escapeHtml(actorOffer.id || "")}">
            <button class="actor-action is-selected" type="button" data-actor-action="decline">${escapeHtml(actorOffer.declineLabel || "Decline")}</button>
            <button class="actor-action" type="button" data-actor-action="accept">${escapeHtml(actorOffer.acceptLabel || "Accept")}</button>
          </div>
        </section>
      ` : ""}

      ${questionOptions.length ? `
        <section class="strategic-question">
          <div class="card-label primary-label">SECTOR QUESTION ${escapeHtml(question.theme || "")}</div>
          <h4>${escapeHtml(question.prompt || "What is the founder move this month?")}</h4>
          <p>${escapeHtml(question.context || "")}</p>
          <div class="question-options">
            ${questionOptions.map((option, index) => `
              <button class="question-option ${index === 0 ? "is-selected" : ""}" type="button" data-answer-id="${escapeHtml(option.id)}">
                <span>${escapeHtml(option.id)}</span>
                <strong>${escapeHtml(option.label)}</strong>
                <small>${escapeHtml(option.description)}</small>
              </button>
            `).join("")}
          </div>
        </section>
      ` : ""}

      <div class="budget-grid">
        ${categories.map((category) => `
          <label class="budget-row">
            <span>${escapeHtml(category.label)}</span>
            <input class="budget-range" data-budget-key="${escapeHtml(category.key)}" type="range" min="0" max="${Math.max(suggestedSpend, 1000)}" step="100" value="${Number(category.amount || 0)}">
            <input class="budget-input" data-budget-key="${escapeHtml(category.key)}" type="number" min="0" step="100" value="${Number(category.amount || 0)}">
          </label>
        `).join("")}
      </div>

      <div class="budget-footer">
        <div>
          <span class="budget-label">Allocated</span>
          <strong id="budgetAllocated">$0</strong>
          <small id="budgetWarning"></small>
        </div>
        <button id="submitBudgetBtn" class="sim-btn" type="button">Run This Month</button>
      </div>

      <div id="monthCountdown" class="countdown-strip" style="display:none;"></div>
    </div>
  `;

  const readAllocation = () => {
    const allocation = {};
    choicesContainer.querySelectorAll(".budget-input").forEach((input) => {
      allocation[input.dataset.budgetKey] = Math.max(0, Number(input.value || 0));
    });
    return allocation;
  };

  const updateTotals = () => {
    const allocation = readAllocation();
    const total = Object.values(allocation).reduce((sum, value) => sum + value, 0);
    const allocated = $("budgetAllocated");
    const warning = $("budgetWarning");
    if (allocated) allocated.textContent = formatMoney(total);
    if (warning) {
      warning.textContent = total > Number(visible.cash || 0)
        ? "Over cash balance; engine will scale it down."
        : total < suggestedSpend * 0.55
          ? "Under-spending may protect cash but slow learning."
          : "";
    }
  };

  choicesContainer.querySelectorAll(".budget-range").forEach((range) => {
    range.addEventListener("input", () => {
      const input = choicesContainer.querySelector(`.budget-input[data-budget-key="${range.dataset.budgetKey}"]`);
      if (input) input.value = range.value;
      updateTotals();
    });
  });

  choicesContainer.querySelectorAll(".budget-input").forEach((input) => {
    input.addEventListener("input", () => {
      const range = choicesContainer.querySelector(`.budget-range[data-budget-key="${input.dataset.budgetKey}"]`);
      if (range) range.value = input.value;
      updateTotals();
    });
  });

  $("submitBudgetBtn")?.addEventListener("click", () => {
    const selected = choicesContainer.querySelector(".question-option.is-selected");
    advanceSimulation(readAllocation(), selected?.dataset.answerId || "A", selectedActorDecision);
  });

  choicesContainer.querySelectorAll(".question-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      choicesContainer.querySelectorAll(".question-option").forEach((item) => item.classList.remove("is-selected"));
      btn.classList.add("is-selected");
    });
  });

  choicesContainer.querySelectorAll(".actor-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      choicesContainer.querySelectorAll(".actor-action").forEach((item) => item.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      selectedActorDecision = {
        offerId: btn.closest(".actor-actions")?.dataset.offerId || "",
        action: btn.dataset.actorAction || "decline",
      };
    });
  });

  updateTotals();
  renderCountdown(data);
}

function renderAgentNotification(data) {
  const panel = $("coachPanel");
  if (!panel) return;
  const offer = data.pendingActorOffer;
  const note = data.actorNote;
  const canResolveOffer = Boolean(offer && data.status !== "completed");
  if (!offer && !note) {
    selectedActorDecision = null;
    panel.style.display = "none";
    panel.innerHTML = "";
    return;
  }
  panel.style.display = "block";
  if (offer && (!selectedActorDecision || selectedActorDecision.offerId !== offer.id)) {
    selectedActorDecision = { offerId: offer.id || "", action: "decline" };
  }
  panel.innerHTML = `
    <section class="agent-notification">
      <div>
        <div class="card-label primary-label">${escapeHtml(offer?.title || "Agent Decision Applied")}</div>
        <h3>${escapeHtml(offer?.from || "Startup network")}</h3>
        <p>${escapeHtml(offer?.message || note || "")}</p>
        ${Number(offer?.amount || 0) ? `
          <small>${formatMoney(offer.amount)} for ${escapeHtml(offer.dilution ?? "--")}% dilution</small>
        ` : ""}
      </div>
      ${canResolveOffer ? `
        <div class="actor-actions" data-offer-id="${escapeHtml(offer.id || "")}">
          <button class="actor-action ${selectedActorDecision?.action !== "accept" ? "is-selected" : ""}" type="button" data-actor-action="decline">${escapeHtml(offer.declineLabel || "Decline")}</button>
          <button class="actor-action ${selectedActorDecision?.action === "accept" ? "is-selected" : ""}" type="button" data-actor-action="accept">${escapeHtml(offer.acceptLabel || "Accept")}</button>
        </div>
      ` : offer ? `
        <div class="agent-final-note">Recorded in final report</div>
      ` : ""}
    </section>
  `;
  panel.querySelectorAll(".actor-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      panel.querySelectorAll(".actor-action").forEach((item) => item.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      selectedActorDecision = {
        offerId: btn.closest(".actor-actions")?.dataset.offerId || "",
        action: btn.dataset.actorAction || "decline",
      };
      document.getElementById("simChoices")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderWorldPanel(data) {
  const panel = $("worldPanel");
  if (!panel) return;
  const news = data.news || [];
  const pet = data.pet || {};
  const petEvents = pet.events || [];
  const marketEvent = data.marketEvent;
  const due = data.dueConsequences || [];
  const actors = data.actors || {};
  if (!news.length && !pet.profile && !marketEvent && !due.length && !actors.investor) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "grid";
  panel.className = "world-grid";
  panel.innerHTML = `
    <section class="sim-card world-card actor-card">
      <div class="sim-card-title">INVESTORS / ANGELS / COMPETITORS</div>
      <div class="actor-list">
        ${["investor", "angel", "competitor"].map((key) => actors[key] ? `
          <div class="actor-item">
            <span>${escapeHtml(key)}</span>
            <strong>${escapeHtml(actors[key].name)}</strong>
            <p>${escapeHtml(actors[key].mood || "")}</p>
            <small>Signal ${escapeHtml(actors[key].signal ?? "--")}/100</small>
          </div>
        ` : "").join("")}
      </div>
    </section>
    <section class="sim-card world-card">
      <div class="sim-card-title">NEWS AGENT</div>
      <div class="news-list">
        ${marketEvent ? `
          <article class="news-item negative">
            <div>
              <span>Breaking event</span>
              <strong>${escapeHtml(marketEvent.title || "Market shock")}</strong>
              <p>${escapeHtml(marketEvent.message || "")}</p>
            </div>
            <small>${escapeHtml(marketEvent.type || "event")}</small>
          </article>
        ` : ""}
        ${due.map((item) => `
          <article class="news-item negative">
            <div>
              <span>Delayed consequence</span>
              <strong>${escapeHtml(item.type || "Risk surfaced")}</strong>
              <p>${escapeHtml(item.message || "")}</p>
            </div>
            <small>debt</small>
          </article>
        `).join("")}
        ${news.map((item) => `
          <article class="news-item ${escapeHtml(item.sentiment || "neutral")}">
            <div>
              <span>${escapeHtml(item.publication || "Startup Wire")}</span>
              <strong>${escapeHtml(item.headline || "")}</strong>
            </div>
            <small>${escapeHtml(item.category || "market")}</small>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="sim-card world-card">
      <div class="sim-card-title">PET ENGINE</div>
      <div class="pet-profile">
        <span>${escapeHtml(pet.profile?.name || "Office pet")}</span>
        <strong>${escapeHtml(pet.profile?.breed || pet.profile?.species || "Culture companion")}</strong>
        <p>${escapeHtml(pet.profile?.personality || pet.status?.message || "Keeping team morale alive.")}</p>
      </div>
      ${petEvents.length ? `
        <div class="pet-events">
          ${petEvents.map((event) => `
            <div class="pet-event">
              <strong>${escapeHtml(event.event || event.pet || "Culture moment")}</strong>
              <p>${escapeHtml(event.narrative || "")}</p>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderCountdown(data) {
  const el = $("monthCountdown");
  if (!el) return;
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (!(data.history || []).length || data.status === "completed") {
    el.style.display = "none";
    return;
  }
  let remaining = Number(data.countdownSeconds || 15);
  el.style.display = "flex";
  const paint = () => {
    el.innerHTML = `
      <span>Next operating month is live</span>
      <strong>${remaining}s pressure window</strong>
      <small>News, team signals, and investor pressure may shift before you submit.</small>
    `;
  };
  paint();
  countdownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      remaining = 0;
    }
    paint();
  }, 1000);
}

function renderDecisionIntelligence(rankedChoices) {
  if (!rankedChoices.length) return "";
  return `
    <div class="decision-intel">
      <div class="intel-main">
        <div class="card-label primary-label">DECISION INTELLIGENCE</div>
        <h4>Best move: Option ${escapeHtml(rankedChoices[0].id)} / ${escapeHtml(rankedChoices[0].label)}</h4>
        <p>${escapeHtml(choiceRationale(rankedChoices[0], 0))}</p>
      </div>
      <div class="intel-list">
        ${rankedChoices.map((choice, index) => `
          <div class="intel-row ${index === 0 ? "is-best" : ""}">
            <span>${escapeHtml(choice.id)}</span>
            <div>
              <strong>${escapeHtml(index === 0 ? "Why pick it" : "Why not first")}</strong>
              <p>${escapeHtml(choiceRationale(choice, index))}</p>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
// RENDER LESSON
// ─────────────────────────────────────────────

function renderLesson(data) {
  const lesson = data.lesson || {};
  const lessonContainer = $("simLesson");

  if (!lessonContainer) return;

  if (
    !lesson.beginnerChoice &&
    !lesson.smartChoice &&
    !lesson.why
  ) {
    lessonContainer.style.display = "none";
    return;
  }

  lessonContainer.style.display = "block";

  lessonContainer.innerHTML = `
    <div class="section-eyebrow" style="margin-bottom:16px;">
      // DECISION DEBRIEF
    </div>

    <div class="debrief-card">
      <div class="debrief-grid">
        <div class="debrief-block danger">
          <div class="card-label">
            BEGINNER INSTINCT
          </div>

          <p class="card-text">
            ${escapeHtml(lesson.beginnerChoice || "--")}
          </p>
        </div>

        <div class="debrief-block success">
          <div class="card-label">
            EXPERIENCED MOVE
          </div>

          <p class="card-text">
            ${escapeHtml(lesson.smartChoice || "--")}
          </p>
        </div>
      </div>

      ${
        lesson.why
          ? `
        <div class="debrief-block accent">
          <div class="card-label">
            WHY IT MATTERS
          </div>

          <p class="card-text">
            ${escapeHtml(lesson.why)}
          </p>
        </div>
      `
          : ""
      }

      ${
        Array.isArray(lesson.tradeoffs) && lesson.tradeoffs.length
          ? `
        <div class="tradeoff-list">
          ${lesson.tradeoffs.map((item) => `
            <div class="tradeoff-item">${escapeHtml(item)}</div>
          `).join("")}
        </div>
      `
          : ""
      }
    </div>
  `;
}

// ─────────────────────────────────────────────
// RENDER HISTORY
// ─────────────────────────────────────────────

function renderHistory(data) {
  const history = data.history || [];
  const historyContainer = $("simHistory");

  if (!historyContainer) return;

  if (!history.length) {
    historyContainer.style.display = "none";
    return;
  }

  historyContainer.style.display = "block";

  historyContainer.innerHTML = `
    <div class="card">
      ${history
        .map(
          (h) => `
        <div style="margin-bottom:16px;">
          <div style="font-weight:700;">
            Month ${h.month}
          </div>

          <div>${h.choice}</div>
          <div style="color:var(--muted);">
            ${h.outcome}
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

// ─────────────────────────────────────────────
// RENDER CHARTS
// ─────────────────────────────────────────────

function renderCharts(data) {
  if (typeof Chart !== "function") return;

  const chartData = data.chartData || {};

  const labels = chartData.labels || [];

  const createChart = (
    instance,
    canvasId,
    label,
    values,
    color
  ) => {
    const canvas = $(canvasId);

    if (!canvas) return null;

    if (instance) {
      instance.destroy();
    }

    return new Chart(canvas.getContext("2d"), {
      type: "line",

      data: {
        labels,
        datasets: [
          {
            label,
            data: values || [],
            borderColor: color,
            backgroundColor: color,
            fill: false,
            tension: 0.35,
            pointRadius: 3,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: Math.max(2, window.devicePixelRatio || 1),
        animation: {
          duration: 450,
        },

        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "rgba(5,10,22,0.96)",
            borderColor: "rgba(125,211,252,0.34)",
            borderWidth: 1,
            titleColor: "#eef2ff",
            bodyColor: "#aab7d2",
            displayColors: false,
          },
        },

        scales: {
          x: {
            grid: {
              color: "rgba(255,255,255,0.055)",
            },
            ticks: {
              color: "#8ea0c2",
              font: { family: "DM Mono", size: 10 },
            },
          },

          y: {
            grid: {
              color: "rgba(255,255,255,0.07)",
            },
            ticks: {
              color: "#8ea0c2",
              font: { family: "DM Mono", size: 10 },
            },
            beginAtZero: true,
          },
        },
        elements: {
          line: {
            borderWidth: 2.5,
          },
          point: {
            radius: 3,
            hoverRadius: 5,
            borderWidth: 2,
          },
        },
      },
    });
  };

  usersChartInst = createChart(
    usersChartInst,
    "usersChart",
    "Users",
    chartData.users,
    "rgba(34,197,94,1)"
  );

  revenueChartInst = createChart(
    revenueChartInst,
    "revenueChart",
    "Revenue",
    chartData.revenue,
    "rgba(249,115,22,1)"
  );

  runwayChartInst = createChart(
    runwayChartInst,
    "runwayChart",
    "Runway",
    chartData.runway,
    "rgba(79,142,255,1)"
  );

  equityChartInst = createChart(
    equityChartInst,
    "equityChart",
    "Equity",
    chartData.equity || chartData.equityLeft || chartData.health,
    "rgba(234,179,8,1)"
  );
}

function renderFinalReport(data) {
  const report = data.finalReport;
  let container = $("finalReport");
  if (!container) {
    container = document.createElement("div");
    container.id = "finalReport";
    container.style.marginTop = "32px";
    $("simHistory")?.after(container);
  }
  if (!report) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";
  const scores = report.scores || {};
  container.innerHTML = `
    <div class="section-eyebrow" style="margin-bottom:16px;">// FOUNDER CLARITY REPORT</div>
    <section class="debrief-card final-report">
      <div class="report-head">
        <div>
          <div class="card-label primary-label">${escapeHtml(report.title || "Simulation Report")}</div>
          <h3>${escapeHtml(report.summary || "")}</h3>
        </div>
        <div class="report-scores">
          <div><span>Clarity</span><strong>${escapeHtml(scores.clarity ?? "--")}/100</strong></div>
          <div><span>Fundraising</span><strong>${escapeHtml(scores.fundraisingReadiness ?? "--")}/100</strong></div>
          <div><span>Discipline</span><strong>${escapeHtml(scores.operatingDiscipline ?? "--")}/100</strong></div>
        </div>
      </div>
      <div class="report-grid">
        <div>
          <h4>Skills to learn next</h4>
          ${(report.skillsToLearn || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
        </div>
        <div>
          <h4>Learning platform modules</h4>
          ${(report.learningModules || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
        </div>
        <div>
          <h4>Companies to analyze</h4>
          ${(report.companiesToAnalyze || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
        </div>
      </div>
    </section>
  `;
}

// ─────────────────────────────────────────────
// RENDER HIDDEN METRICS
// ─────────────────────────────────────────────

function renderHiddenMetrics(data) {
  const visible = data.visible || {};
  const hiddenBar = $("simVisibleStats");

  if (!hiddenBar) return;

  hiddenBar.style.display = "block";

  const stats = [
    {
      label: "Cash",
      val: formatMoney(visible.cash),
    },

    {
      label: "Users",
      val: Math.round(
        Number(visible.users) || 0
      ).toLocaleString(),
    },

    {
      label: "Revenue",
      val: formatMoney(visible.revenue),
    },

    {
      label: "Runway",
      val: `${visible.runwayMonths || 0}${visible.runwayCapped ? "+" : ""} mo`,
    },
  ];

  hiddenBar.innerHTML = `
    <div class="ops-strip">
      ${stats
        .map(
          (s) => `
        <div class="ops-pill">
          <span>${escapeHtml(s.label)}</span>
          <strong>${escapeHtml(s.val)}</strong>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

// ─────────────────────────────────────────────
// MAIN RENDER
// ─────────────────────────────────────────────

function renderSim(data) {
  const results = $("simResults");
  const cta = $("simCta");
  const summary = $("simSummaryText");

  if (results) results.style.display = "block";
  if (cta) cta.style.display = "none";

  if (summary) {
    summary.textContent = data.summary || data.patternMatch || "";
  }

  renderMetrics(data);
  renderHiddenMetrics(data);
  renderAgentNotification(data);
  renderWorldPanel(data);
  renderTimeline(data);
  renderChoices(data);
  renderLesson(data);
  renderHistory(data);
  renderFinalReport(data);
  renderCharts(data);
  renderFounderLog(data);
}

function renderFounderLog(data) {
  const log = $("founderLog");
  if (!log) return;
  const visible = data.visible || {};
  const hidden = data.hidden || {};
  const startup = data.startup || {};
  const sector = data.modelState?.sector || startup.industry || "Startup";
  const rows = [
    ["Startup Agent", data.engine || "python-startup-agent-simulation-model", "Core world model"],
    ["Event Generator", data.modelScenario?.title || data.round?.title || "Strategic Focus", "Monthly scenario"],
    ["Investor Engine", `${visible.investorInterest ?? hidden.investorConfidence ?? "--"}/100`, "Fundraising signal"],
    ["Stress Engine", `${visible.founderStress ?? hidden.founderBurnout ?? "--"}/100`, "Founder load"],
    ["Founder Engine", `${hidden.teamTrust ?? visible.morale ?? "--"}/100`, "Team trust"],
    ["Market Engine", `${visible.riskScore ?? hidden.competition ?? "--"}/100`, "Risk pressure"],
    ["Product Engine", `${hidden.productQuality ?? visible.technicalDebt ?? "--"}/100`, "Build quality"],
    ["News Agent", `${(data.news || []).length} headlines`, "Press simulator"],
    ["Pet Engine", data.pet?.profile?.name || "Active", "Culture simulator"],
    ["Tagline Engine", data.modelState?.tagline || startup.idea || sector, "Company thesis"],
  ];
  log.innerHTML = rows.map(([label, value]) => `
    <div class="log-item">
      <span class="log-month">${escapeHtml(label.slice(0, 2).toUpperCase())}</span>
      <div><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>
    </div>
  `).join("");
}

// ─────────────────────────────────────────────
// ADVANCE SIMULATION
// ─────────────────────────────────────────────

async function advanceSimulation(allocation, strategicAnswer, actorDecision = null) {
  if (!currentSimState) return;

    setStatus("Processing decision...");

  try {
    const res = await fetch("/api/simulate/decision", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        state: currentSimState,
        allocation,
        strategicAnswer,
        actorDecision,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data?.error || `Decision failed`
      );
    }

    currentSimState = data;
    selectedActorDecision = null;

    renderSim(data);

    setStatus(
      `Decision applied — Month ${
        data.round?.month || "?"
      }`
    );
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────
// RUN SIMULATION
// ─────────────────────────────────────────────

async function runSimulation() {
  const idea = $("idea")?.value.trim();

  if (!idea) {
    setStatus("Enter startup idea first.");
    return;
  }

  const founder = collectFounder();
  const startup = collectStartup();

  try {
    setStatus("Running simulation...");

    if (ui.simBtn) {
      ui.simBtn.disabled = true;
    }

    const res = await fetch("/api/simulate", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        founder,
        startup,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data?.error ||
          `Simulation failed: ${res.status}`
      );
    }

    currentSimState = data;
    selectedActorDecision = null;

    renderSim(data);

    setStatus(
      "Simulation started — make your first decision."
    );

    $("simResults").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
  } finally {
    if (ui.simBtn) {
      ui.simBtn.disabled = false;
    }
  }
}

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────

if (ui.simBtn) {
  ui.simBtn.addEventListener(
    "click",
    startSimulation
  );
}

window.addEventListener("DOMContentLoaded", () => {
  if (currentSimState) {
    renderSim(currentSimState);
  }
});
