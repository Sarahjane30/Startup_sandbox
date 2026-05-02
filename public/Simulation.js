// =============================================
//  STARTUP SANDBOX — simulation.js
//  All projections come from Gemini API.
// =============================================

const $ = (id) => document.getElementById(id);

let usersChartInst = null;
let revenueChartInst = null;

// ─── Gemini helper ──────────────────────────────────────────────
async function callGemini(prompt) {
  throw new Error("Direct Gemini calls have moved to the backend.");
}

// ─── Build simulation prompt ─────────────────────────────────────
function buildPrompt(idea, stage) {
  return `
You are a Y Combinator partner, experienced venture capitalist, and startup data scientist.
Simulate the realistic future of this startup idea.

Startup idea: "${idea}"
Current stage: "${stage}"

Return ONLY valid JSON (no markdown, no explanation) matching this exact schema:

{
  "summary": "string (2-3 sentence executive summary of the startup's trajectory)",
  "topMetrics": {
    "survivabilityScore": <number 0-100>,
    "fundingLikelihood": <number 0-100>,
    "marketFitScore": <number 0-100>,
    "burnRunway": "string (e.g. '8 months at lean burn')"
  },
  "timeline": [
    {
      "period": "Month 1-3",
      "title": "string (phase name, e.g. 'Building the Foundation')",
      "narrative": "string (2-3 sentences of what happens in this phase)",
      "metrics": {
        "users": "string (e.g. '0 → 200 users')",
        "revenue": "string (e.g. '$0 → $800 MRR')",
        "retention": "string (e.g. '~45% week-1 retention')",
        "keyEvent": "string (the defining moment of this phase)"
      }
    },
    {
      "period": "Month 4-6",
      "title": "string",
      "narrative": "string (2-3 sentences)",
      "metrics": {
        "users": "string",
        "revenue": "string",
        "retention": "string",
        "keyEvent": "string"
      }
    },
    {
      "period": "Month 7-12",
      "title": "string",
      "narrative": "string (2-3 sentences)",
      "metrics": {
        "users": "string",
        "revenue": "string",
        "retention": "string",
        "keyEvent": "string"
      }
    }
  ],
  "chartData": {
    "labels": ["Month 1", "Month 2", "Month 3", "Month 4", "Month 5", "Month 6", "Month 9", "Month 12"],
    "users": [<number>, <number>, <number>, <number>, <number>, <number>, <number>, <number>],
    "revenue": [<number>, <number>, <number>, <number>, <number>, <number>, <number>, <number>]
  },
  "failureTimeline": "string (3-4 sentences describing the most likely path to failure and when it would happen)",
  "investorReaction": "string (2-3 sentences on what a seed-stage VC would say about this opportunity)",
  "userReaction": "string (2-3 sentences on what early users would say — positive and negative)",
  "strategicMoves": "string (3-4 concrete, specific actions this founder should take in the next 90 days)"
}
`;
}

// ─── Render results ──────────────────────────────────────────────
function renderSim(data) {
  $("simResults").style.display = "block";
  $("simCta").style.display = "none";

  // Summary
  $("simSummaryText").textContent = data.summary || "";

  // Top metrics
  const tm = data.topMetrics || {};
  const metricsHTML = [
    { label: "Survivability", val: `${tm.survivabilityScore ?? "--"}/100`, icon: "🛡️" },
    { label: "Funding Likelihood", val: `${tm.fundingLikelihood ?? "--"}/100`, icon: "💰" },
    { label: "Market Fit Score", val: `${tm.marketFitScore ?? "--"}/100`, icon: "🎯" },
    { label: "Burn Runway", val: tm.burnRunway || "--", icon: "🔥" },
  ].map(({ label, val, icon }) => `
    <div class="sim-card" style="display:flex; flex-direction:column; align-items:center; text-align:center; padding:28px;">
      <div style="font-size:2rem; margin-bottom:12px;">${icon}</div>
      <div class="sim-card-title">${label}</div>
      <div style="font-family: var(--font-display); font-weight:800; font-size:2rem; color:var(--primary); line-height:1;">${val}</div>
    </div>
  `).join("");
  $("simMetricsGrid").innerHTML = metricsHTML;
  $("simMetricsGrid").style.gridTemplateColumns = "repeat(4, 1fr)";

  // Timeline
  const timeline = data.timeline || [];
  const periodColors = ["var(--primary)", "var(--accent)", "var(--green)"];
  $("simTimeline").innerHTML = timeline.map((item, i) => `
    <div class="timeline-item">
      <div class="timeline-dot" style="border-color: ${periodColors[i] || "var(--primary)"}; color: ${periodColors[i] || "var(--primary)"};">
        ${item.period?.replace("Month ", "Mo\n") || `P${i+1}`}
      </div>
      <div class="timeline-content">
        <div class="timeline-title">${item.title || item.period}</div>
        <div class="timeline-metrics">
          <div class="tm"><div class="tm-label">USERS</div><div class="tm-val" style="color:${periodColors[i] || "var(--primary)"};">${item.metrics?.users || "--"}</div></div>
          <div class="tm"><div class="tm-label">REVENUE</div><div class="tm-val" style="color:${periodColors[i] || "var(--primary)"};">${item.metrics?.revenue || "--"}</div></div>
          <div class="tm"><div class="tm-label">RETENTION</div><div class="tm-val" style="color:${periodColors[i] || "var(--primary)"};">${item.metrics?.retention || "--"}</div></div>
        </div>
        <p class="card-text" style="margin-bottom:12px;">${item.narrative || ""}</p>
        <div style="font-family:var(--font-mono); font-size:0.78rem; color:var(--muted); background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:6px; padding:10px 14px;">
          🔑 KEY EVENT: ${item.metrics?.keyEvent || ""}
        </div>
      </div>
    </div>
  `).join("");

  // Charts
  const cd = data.chartData || {};
  const labels = cd.labels || [];
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

  // Bottom cards
  $("simFailure").innerHTML = data.failureTimeline || "";
  $("simInvestor").innerHTML = data.investorReaction || "";
  $("simUser").innerHTML = data.userReaction || "";
  if ($("simMoves")) {
    $("simMoves").innerHTML = data.strategicMoves
      ? data.strategicMoves.split(/\n|\. /).filter(s => s.trim().length > 5)
          .map(s => `<p style="margin-bottom:10px;">→ ${s.trim().replace(/^\d+\.\s*/, "")}</p>`).join("")
      : "";
  }
}

// ─── Main run ───────────────────────────────────────────────────
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
    renderSim(data);
    $("simStatus").textContent = "✓ Simulation complete";
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
