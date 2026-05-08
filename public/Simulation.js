// =============================================
//  STARTUP SANDBOX — simulation.js
//  Interactive Founder Decision Simulator
// =============================================

const $ = (id) => document.getElementById(id);

let usersChartInst = null;
let revenueChartInst = null;
let currentSimState = null;

// ─── Render top metrics ──────────────────────────────────────────
function renderMetrics(data) {
  const visible = data.visible || {};
  const tm = data.topMetrics || {};

  const survivability = tm.survivabilityScore ?? visible.healthScore ?? "--";
  const funding = tm.fundingLikelihood ?? visible.investorInterest ?? "--";
  const marketFit = tm.marketFitScore ?? visible.growth ?? visible.retention ?? "--";
  const burnRunway = tm.burnRunway
    || (typeof visible.runwayMonths === "number" ? `${visible.runwayMonths} months` : "--");

  const formatMetric = (value) => typeof value === "number" ? `${value}/100` : value || "--";

  const metricsHTML = [
    { label: "Survivability",      val: formatMetric(survivability), icon: "🛡️" },
    { label: "Funding Likelihood", val: formatMetric(funding),       icon: "💰" },
    { label: "Market Fit Score",   val: formatMetric(marketFit),     icon: "🎯" },
    { label: "Burn Runway",        val: burnRunway || "--",          icon: "🔥" },
  ].map(({ label, val, icon }) => `
    <div class="sim-card" style="display:flex; flex-direction:column; align-items:center; text-align:center; padding:28px;">
      <div style="font-size:2rem; margin-bottom:12px;">${icon}</div>
      <div class="sim-card-title">${label}</div>
      <div style="font-family: var(--font-display); font-weight:800; font-size:2rem; color:var(--primary); line-height:1;">${val}</div>
    </div>
  `).join("");

  $("simMetricsGrid").innerHTML = metricsHTML;
  $("simMetricsGrid").style.gridTemplateColumns = "repeat(4, 1fr)";
}

// ─── Render timeline ─────────────────────────────────────────────
function renderTimeline(data) {
  const visible = data.visible || {};
  const round = data.round || {};

  // Build timeline from either the timeline array or from round + visible
  let timeline = data.timeline || [];
  if (!timeline.length && round.month) {
    timeline = [{
      period: `Month ${round.month}`,
      title: round.title || round.stage || "Current Phase",
      narrative: round.narrative || round.randomEvent || "",
      metrics: {
        users: visible.users != null ? `${Math.round(Number(visible.users)).toLocaleString()} users` : "--",
        revenue: visible.revenue != null ? `$${Math.round(Number(visible.revenue)).toLocaleString()} MRR` : "--",
        retention: visible.retention != null ? `${visible.retention}%` : "--",
        keyEvent: round.randomEvent || ""
      }
    }];
  }

  const periodColors = ["var(--primary)", "var(--accent)", "var(--green)"];
  $("simTimeline").innerHTML = timeline.map((item, i) => `
    <div class="timeline-item">
      <div class="timeline-dot" style="border-color: ${periodColors[i % 3]}; color: ${periodColors[i % 3]};">
        ${item.period?.replace("Month ", "Mo\n") || `P${i + 1}`}
      </div>
      <div class="timeline-content">
        <div class="timeline-title">${item.title || item.period}</div>
        <div class="timeline-metrics">
          <div class="tm"><div class="tm-label">USERS</div><div class="tm-val" style="color:${periodColors[i % 3]};">${item.metrics?.users || "--"}</div></div>
          <div class="tm"><div class="tm-label">REVENUE</div><div class="tm-val" style="color:${periodColors[i % 3]};">${item.metrics?.revenue || "--"}</div></div>
          <div class="tm"><div class="tm-label">RETENTION</div><div class="tm-val" style="color:${periodColors[i % 3]};">${item.metrics?.retention || "--"}</div></div>
        </div>
        <p class="card-text" style="margin-bottom:12px;">${item.narrative || ""}</p>
        ${item.metrics?.keyEvent ? `
        <div style="font-family:var(--font-mono); font-size:0.78rem; color:var(--muted); background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:6px; padding:10px 14px;">
          🔑 KEY EVENT: ${item.metrics.keyEvent}
        </div>` : ""}
      </div>
    </div>
  `).join("");
}

// ─── Render decision choices (interactive) ───────────────────────
function renderChoices(data) {
  const round = data.round || {};
  const choices = round.choices || [];
  const choicesContainer = $("simChoices");
  if (!choicesContainer) return;

  if (!choices.length) {
    choicesContainer.style.display = "none";
    return;
  }

  choicesContainer.style.display = "block";
  const events = round.events || [];

  choicesContainer.innerHTML = `
    <div class="section-eyebrow" style="margin-bottom: 16px;">// DECISION ROUND — MONTH ${round.month || "?"}</div>
    ${events.length ? `
    <div class="card" style="margin-bottom: 20px; border-color: rgba(251,191,36,0.3); background: linear-gradient(145deg, rgba(251,191,36,0.06), var(--bg-card));">
      <div class="card-label" style="color: var(--yellow);">⚡ EVENTS THIS ROUND</div>
      <ul style="list-style: none; padding: 0; margin: 0;">
        ${events.map(e => `<li class="card-text" style="margin-bottom: 6px; padding-left: 16px; position: relative;">
          <span style="position:absolute; left:0; color:var(--yellow);">→</span> ${e}
        </li>`).join("")}
      </ul>
    </div>` : ""}
    <div class="card" style="margin-bottom: 20px;">
      <div class="card-label primary-label">🤔 WHAT WILL YOU DO?</div>
      <p class="card-text" style="margin-bottom: 16px; color: var(--muted);">Choose your next strategic move. Each decision has real consequences on your metrics, runway, and team.</p>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
        ${choices.map(c => `
          <button class="choice-btn" data-choice-id="${c.id}" style="
            background: var(--bg-card); border: 2px solid var(--border); border-radius: var(--radius);
            padding: 20px; cursor: pointer; text-align: left; transition: all 0.25s; position: relative;
          ">
            <div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--primary); letter-spacing: 1.5px; margin-bottom: 8px;">OPTION ${c.id}</div>
            <div style="font-family: var(--font-display); font-weight: 700; font-size: 1rem; color: var(--text); margin-bottom: 8px;">${c.label}</div>
            <div style="font-size: 0.88rem; color: var(--muted); line-height: 1.6;">${c.description}</div>
          </button>
        `).join("")}
      </div>
    </div>
  `;

  // Add hover effects and click handlers
  choicesContainer.querySelectorAll(".choice-btn").forEach(btn => {
    btn.addEventListener("mouseenter", () => {
      btn.style.borderColor = "var(--primary)";
      btn.style.transform = "translateY(-3px)";
      btn.style.boxShadow = "0 12px 32px rgba(0,0,0,0.25)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.borderColor = "var(--border)";
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow = "none";
    });
    btn.addEventListener("click", () => advanceSimulation(btn.dataset.choiceId));
  });
}

// ─── Render lesson card ──────────────────────────────────────────
function renderLesson(data) {
  const lesson = data.lesson || {};
  const lessonContainer = $("simLesson");
  if (!lessonContainer) return;
  if (!lesson.beginnerChoice && !lesson.smartChoice && !lesson.why) {
    lessonContainer.style.display = "none";
    return;
  }

  lessonContainer.style.display = "block";
  lessonContainer.innerHTML = `
    <div class="section-eyebrow" style="margin-bottom: 16px;">// FOUNDER LESSON</div>
    <div class="card" style="border-color: rgba(167,139,250,0.3); background: linear-gradient(145deg, rgba(167,139,250,0.06), var(--bg-card));">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 16px;">
        <div>
          <div class="card-label" style="color: var(--red);">🐣 BEGINNER INSTINCT</div>
          <p class="card-text" style="font-size: 0.92rem;">${lesson.beginnerChoice || "--"}</p>
        </div>
        <div>
          <div class="card-label" style="color: var(--green);">🧠 EXPERIENCED MOVE</div>
          <p class="card-text" style="font-size: 0.92rem;">${lesson.smartChoice || "--"}</p>
        </div>
      </div>
      ${lesson.why ? `
      <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 6px; padding: 14px;">
        <div class="card-label" style="color: var(--accent);">💡 WHY IT MATTERS</div>
        <p class="card-text" style="font-size: 0.92rem; color: var(--muted);">${lesson.why}</p>
      </div>` : ""}
    </div>
  `;
}

// ─── Render history ──────────────────────────────────────────────
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
    <div class="section-eyebrow" style="margin-bottom: 16px;">// YOUR JOURNEY SO FAR</div>
    <div class="card">
      ${history.map((h, i) => `
        <div style="display: flex; gap: 16px; align-items: flex-start; ${i < history.length - 1 ? "margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border);" : ""}">
          <div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--primary); background: var(--primary-glow); padding: 4px 10px; border-radius: 99px; white-space: nowrap;">Mo ${h.month}</div>
          <div>
            <div style="font-family: var(--font-display); font-weight: 600; font-size: 0.95rem; margin-bottom: 4px; color: var(--text);">${h.choice}</div>
            <div style="font-size: 0.88rem; color: var(--muted); line-height: 1.6;">${h.outcome}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// ─── Render charts ───────────────────────────────────────────────
function renderCharts(data) {
  const cd = data.chartData || {};
  const labels = cd.labels || [];
  if (!labels.length) return;

  const chartDefaults = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: { color: "rgba(255,255,255,0.4)", font: { family: "DM Mono", size: 11 } }
      },
      y: {
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: { color: "rgba(255,255,255,0.4)", font: { family: "DM Mono", size: 11 } }
      }
    }
  };

  if (usersChartInst) usersChartInst.destroy();
  usersChartInst = new Chart($("usersChart").getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: cd.users || [],
        borderColor: "rgba(79,142,255,1)",
        backgroundColor: "rgba(79,142,255,0.1)",
        fill: true, tension: 0.4, pointRadius: 4,
        pointBackgroundColor: "rgba(79,142,255,1)",
      }]
    },
    options: { ...chartDefaults }
  });

  if (revenueChartInst) revenueChartInst.destroy();
  revenueChartInst = new Chart($("revenueChart").getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: cd.revenue || [],
        borderColor: "rgba(167,139,250,1)",
        backgroundColor: "rgba(167,139,250,0.1)",
        fill: true, tension: 0.4, pointRadius: 4,
        pointBackgroundColor: "rgba(167,139,250,1)",
      }]
    },
    options: { ...chartDefaults }
  });
}

// ─── Render bottom insight cards ─────────────────────────────────
function renderInsightCards(data) {
  const visible = data.visible || {};
  const lesson = data.lesson || {};

  $("simFailure").innerHTML = data.failureTimeline || data.patternMatch || "";
  $("simInvestor").innerHTML = data.investorReaction
    || (visible.investorInterest != null ? `Investor interest is around ${visible.investorInterest}/100.` : "");
  $("simUser").innerHTML = data.userReaction
    || (visible.retention != null ? `Early user retention is around ${visible.retention}%.` : "");

  if ($("simMoves")) {
    const moves = data.strategicMoves
      || [lesson.beginnerChoice, lesson.smartChoice].filter(Boolean).join("\n");
    $("simMoves").innerHTML = moves
      ? moves.split(/\n|\.\s+/).filter(s => s.trim().length > 5)
          .map(s => `<p style="margin-bottom:10px;">→ ${s.trim().replace(/^\d+\.\s*/, "")}</p>`).join("")
      : "";
  }
}

// ─── Render hidden metrics bar ───────────────────────────────────
function renderHiddenMetrics(data) {
  const visible = data.visible || {};
  const hiddenBar = $("simVisibleStats");
  if (!hiddenBar) return;

  hiddenBar.style.display = "block";
  const stats = [
    { label: "Cash",           val: `$${Math.round(Number(visible.cash) || 0).toLocaleString()}`, color: "var(--green)" },
    { label: "Users",          val: Math.round(Number(visible.users) || 0).toLocaleString(),       color: "var(--primary)" },
    { label: "Revenue",        val: `$${Math.round(Number(visible.revenue) || 0).toLocaleString()}`, color: "var(--accent)" },
    { label: "Runway",         val: `${visible.runwayMonths || 0} mo`,                              color: "var(--yellow)" },
    { label: "Team",           val: visible.teamSize || 1,                                          color: "var(--blue)" },
    { label: "Equity Left",    val: `${visible.equityLeft || 100}%`,                                color: "var(--green)" },
    { label: "Morale",         val: `${visible.morale || 0}/100`,                                   color: "var(--primary)" },
    { label: "Stress",         val: `${visible.founderStress || 0}/100`,                             color: "var(--red)" },
    { label: "Tech Debt",      val: `${visible.technicalDebt || 0}/100`,                             color: "var(--yellow)" },
  ];

  hiddenBar.innerHTML = `
    <div class="section-eyebrow" style="margin-bottom: 16px;">// LIVE DASHBOARD</div>
    <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 32px;">
      ${stats.map(s => `
        <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 99px; padding: 8px 18px; display: flex; align-items: center; gap: 8px;">
          <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--muted); letter-spacing: 0.5px;">${s.label}</span>
          <span style="font-family: var(--font-display); font-weight: 700; font-size: 0.95rem; color: ${s.color};">${s.val}</span>
        </div>
      `).join("")}
    </div>
  `;
}

// ─── Main render ─────────────────────────────────────────────────
function renderSim(data) {
  $("simResults").style.display = "block";
  $("simCta").style.display = "none";

  // Summary
  $("simSummaryText").textContent = data.summary || data.patternMatch || "";

  // Pattern match subtitle
  const patternEl = $("simPatternMatch");
  if (patternEl && data.patternMatch) {
    patternEl.textContent = data.patternMatch;
    patternEl.style.display = "block";
  }

  renderMetrics(data);
  renderHiddenMetrics(data);
  renderTimeline(data);
  renderChoices(data);
  renderLesson(data);
  renderHistory(data);
  renderCharts(data);
  renderInsightCards(data);
}

// ─── Advance simulation (decision) ──────────────────────────────
async function advanceSimulation(choiceId) {
  if (!currentSimState) return;

  $("simStatus").textContent = "⏳ Processing your decision...";

  // Disable choice buttons
  document.querySelectorAll(".choice-btn").forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
  });

  try {
    const res = await fetch("/api/simulate/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: currentSimState, choiceId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Decision failed: ${res.status}`);

    currentSimState = data;
    renderSim(data);
    $("simStatus").textContent = `✓ Decision applied — Month ${data.round?.month || "?"}`;
    $("simResults").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    $("simStatus").textContent = `Error: ${err.message}`;
    console.error(err);
    // Re-enable buttons
    document.querySelectorAll(".choice-btn").forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    });
  }
}

// ─── Main run simulation ─────────────────────────────────────────
async function runSimulation() {
  const idea = $("simInput")?.value.trim();
  const stage = $("simStage")?.value || "idea";
  if (!idea) return ($("simStatus").textContent = "Enter your startup idea first.");

  $("simStatus").textContent = "⏳ Running simulation with Gemini AI...";
  $("simBtn").disabled = true;
  $("simBtn").textContent = "SIMULATING...";
  $("simResults").style.display = "none";

  try {
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, stage })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Simulation failed: ${res.status}`);

    currentSimState = data;
    renderSim(data);
    $("simStatus").textContent = "✓ Simulation started — Make your first decision below!";
    $("simResults").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    $("simStatus").textContent = `Error: ${err.message}`;
    console.error(err);
  } finally {
    $("simBtn").disabled = false;
    $("simBtn").textContent = "RUN SIMULATION →";
  }
}

$("simBtn")?.addEventListener("click", runSimulation);
$("simInput")?.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.ctrlKey) runSimulation();
});
