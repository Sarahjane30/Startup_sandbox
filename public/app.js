// =============================================
//  STARTUP SANDBOX — app.js
//  All AI outputs come from Gemini API calls.
//  Browser code calls local backend API routes only.
// =============================================

// ─── DOM helpers ───────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const ui = {
  companyInput: $("companyInput"),
  runBtn: $("runBtn"),
  ideaInput: $("ideaInput"),
  ideaBtn: $("ideaBtn"),
  status: $("status"),
  businessModel: $("businessModel"),
  marketing: $("marketing"),
  moat: $("moat"),
  swot: $("swot"),
  insight: $("insight"),
  confidenceVal: $("confidenceVal"),
  clarityVal: $("clarityVal"),
  depthVal: $("depthVal"),
  confidenceBar: $("confidenceBar"),
  clarityBar: $("clarityBar"),
  depthBar: $("depthBar"),
  ratingExplain: $("ratingExplain"),
  meta: $("meta"),
  dashCompany: $("dashCompany"),
  swotS: $("swotS"),
  swotW: $("swotW"),
  swotO: $("swotO"),
  swotT: $("swotT"),
  analysisResults: $("analysisResults"),
  ideaResults: $("ideaResults"),
  ideaScoreVal: $("ideaScoreVal"),
  ideaTitle: $("ideaTitle"),
  ideaDesc: $("ideaDesc"),
  ideaMutations: $("ideaMutations"),
  ideaCopycat: $("ideaCopycat"),
  ideaExperiments: $("ideaExperiments"),
  ideaMistakes: $("ideaMistakes"),
  ideaOpportunity: $("ideaOpportunity"),
  chartCard: $("chartCard"),
};

function setStatus(msg) { if (ui.status) ui.status.textContent = msg; }

function setMetric(name, value) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  if (ui[`${name}Val`]) ui[`${name}Val`].textContent = `${v}%`;
  if (ui[`${name}Bar`]) ui[`${name}Bar`].style.width = `${v}%`;
}

// ─── Gemini API call ────────────────────────────────────────────
async function callGemini(prompt) {
  throw new Error("Direct Gemini calls have moved to the backend.");
}

// ─── Company Analysis ───────────────────────────────────────────
async function analyzeCompany(company) {
  if (false) {
  const prompt = `
You are a senior business analyst and startup investor. Analyze the company or product: "${company}".

Return ONLY valid JSON (no markdown, no explanation) matching this exact schema:
{
  "company": "string",
  "perspectives": {
    "businessModel": "string (2-4 sentences describing how they make money, pricing model, customer segments)",
    "marketingIntelligence": "string (2-4 sentences on their go-to-market strategy, acquisition channels, brand positioning)",
    "competitiveMoat": "string (2-4 sentences on what makes them defensible — network effects, switching costs, IP, etc.)",
    "swot": {
      "strengths": "string (2-3 key strengths)",
      "weaknesses": "string (2-3 key weaknesses)",
      "opportunities": "string (2-3 growth opportunities)",
      "threats": "string (2-3 real threats)"
    },
    "hiddenInsight": "string (1 non-obvious, contrarian, or surprising business insight about this company)",
    "businessMetrics": {
      "confidence": <number 0-100, how confident you are in this analysis given public info>,
      "clarity": <number 0-100, how clear and well-defined their business model is>,
      "dataDepth": <number 0-100, how much public data exists for this company>
    }
  },
  "rating": {
    "termScores": {
      "businessModel": { "score": <0-100>, "justification": "string" },
      "marketingIntelligence": { "score": <0-100>, "justification": "string" },
      "competitiveMoat": { "score": <0-100>, "justification": "string" },
      "swotAnalysis": { "score": <0-100>, "justification": "string" },
      "dataReliability": { "score": <0-100>, "justification": "string" },
      "hiddenInsight": { "score": <0-100>, "justification": "string" }
    }
  }
}
`;
  return await callGemini(prompt);
  }
  const res = await fetch(`/api/analyze?company=${encodeURIComponent(company)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Analysis failed: ${res.status}`);
  return data;
}

// ─── Render company analysis ────────────────────────────────────
function render(data, company) {
  const p = data.perspectives;
  if (!p) return;

  if (ui.dashCompany) ui.dashCompany.textContent = (data.company || company).toUpperCase();
  if (ui.businessModel) ui.businessModel.innerHTML = p.businessModel || "";
  if (ui.marketing) ui.marketing.innerHTML = p.marketingIntelligence || "";
  if (ui.moat) ui.moat.innerHTML = p.competitiveMoat || "";

  if (ui.swotS) {
    ui.swotS.innerHTML = p.swot?.strengths || "";
    ui.swotW.innerHTML = p.swot?.weaknesses || "";
    ui.swotO.innerHTML = p.swot?.opportunities || "";
    ui.swotT.innerHTML = p.swot?.threats || "";
  }
  if (ui.insight) ui.insight.innerHTML = p.hiddenInsight || "";

  setMetric("confidence", p.businessMetrics?.confidence);
  setMetric("clarity", p.businessMetrics?.clarity);
  setMetric("depth", p.businessMetrics?.dataDepth);

  // Score rows
  const terms = data.rating?.termScores || {};
  const rows = [
    ["Business Model", terms.businessModel],
    ["Marketing Intelligence", terms.marketingIntelligence],
    ["Competitive Moat", terms.competitiveMoat],
    ["SWOT Analysis", terms.swotAnalysis],
    ["Data Reliability", terms.dataReliability],
    ["Hidden Insight", terms.hiddenInsight],
  ]
    .filter(([, v]) => v)
    .map(([label, v]) => {
      const cls = v.score >= 75 ? "chip-high" : v.score >= 55 ? "chip-mid" : "chip-low";
      return `<div class="score-row">
        <div class="score-head">
          <span class="score-label">${label}</span>
          <span class="score-chip ${cls}">${v.score}/100</span>
        </div>
        <div class="score-note">${v.justification}</div>
      </div>`;
    });
  if (ui.ratingExplain) ui.ratingExplain.innerHTML = rows.join("");

  if (ui.meta) {
    ui.meta.innerHTML = `<strong>Powered by Gemini AI</strong> — Analysis for <strong>${data.company || company}</strong> generated at ${new Date().toLocaleString()}`;
  }

  // Remove muted-init class from all card-text
  document.querySelectorAll(".muted-init").forEach(el => el.classList.remove("muted-init"));
}

// ─── Idea Analysis ──────────────────────────────────────────────
async function analyzeIdea(idea) {
  if (false) {
  const prompt = `
You are a Y Combinator partner, serial entrepreneur, and ruthless startup evaluator.
Analyze this startup idea: "${idea}"

Return ONLY valid JSON (no markdown, no explanation) matching this exact schema:
{
  "analysis": {
    "viabilityScore": <number 0-100>,
    "decision": "KILL" | "PIVOT" | "DOUBLE DOWN",
    "decisionReason": "string (1-2 sentences explaining your verdict)",
    "mutations": ["string", "string", "string"],
    "crazyPivot": "string (one wild, unexpected pivot idea)",
    "copycatRisk": "string (2-3 sentences on how easily this can be copied and what moat exists)",
    "liveExperiments": ["string", "string", "string"],
    "mistakePredictor": "string (2-3 sentences on the most likely mistakes this founder will make)",
    "hiddenOpportunity": "string (1 sentence — the non-obvious gold mine in this idea)",
    "marketPotential": <number 0-100>,
    "executionFeasibility": <number 0-100>,
    "defensibility": <number 0-100>,
    "capitalEfficiency": <number 0-100>
  }
}
`;
  return await callGemini(prompt);
  }
  const res = await fetch("/api/analyze-idea", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Idea analysis failed: ${res.status}`);
  return data;
}

// ─── Render idea results ─────────────────────────────────────────
function renderIdea(data) {
  if (ui.ideaResults) ui.ideaResults.style.display = "block";
  const a = data.analysis || {};

  if (ui.ideaScoreVal) ui.ideaScoreVal.textContent = a.viabilityScore ?? "--";
  if (ui.ideaTitle) {
    ui.ideaTitle.textContent = `[ ${a.decision || "UNKNOWN"} ]`;
    const colorMap = { "KILL": "#f87171", "PIVOT": "#fbbf24", "DOUBLE DOWN": "#34d399" };
    ui.ideaTitle.style.color = colorMap[a.decision] || "var(--text)";
  }
  if (ui.ideaDesc) ui.ideaDesc.textContent = a.decisionReason || "";

  if (ui.ideaMutations) {
    const items = (a.mutations || []).map(m => `<li style="margin-bottom:8px;">${m}</li>`).join("");
    const wild = a.crazyPivot ? `<li style="margin-bottom:8px; color:var(--primary); font-weight:600;">🔥 WILD PIVOT: ${a.crazyPivot}</li>` : "";
    ui.ideaMutations.innerHTML = `<ul style="margin:0; padding-left:20px;">${items}${wild}</ul>`;
  }

  if (ui.ideaCopycat) ui.ideaCopycat.innerHTML = a.copycatRisk || "";

  if (ui.ideaExperiments) {
    const items = (a.liveExperiments || []).map(b => `<li style="margin-bottom:8px;">${b}</li>`).join("");
    ui.ideaExperiments.innerHTML = `<ul style="margin:0; padding-left:20px;">${items}</ul>`;
  }
  if (ui.ideaMistakes) ui.ideaMistakes.innerHTML = a.mistakePredictor || "";
  if (ui.ideaOpportunity) ui.ideaOpportunity.textContent = a.hiddenOpportunity || "";

  // Radar chart
  if (ui.chartCard && window.Chart) {
    ui.chartCard.style.display = "block";
    const canvas = $("ideaChart");
    if (window.ideaChartInstance) window.ideaChartInstance.destroy();
    window.ideaChartInstance = new Chart(canvas.getContext("2d"), {
      type: "radar",
      data: {
        labels: ["Market Potential", "Execution Feasibility", "Defensibility", "Capital Efficiency"],
        datasets: [{
          label: "Score",
          data: [a.marketPotential||0, a.executionFeasibility||0, a.defensibility||0, a.capitalEfficiency||0],
          backgroundColor: "rgba(79,142,255,0.15)",
          borderColor: "rgba(79,142,255,1)",
          pointBackgroundColor: "rgba(79,142,255,1)",
          pointBorderColor: "#fff",
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: { color: "rgba(255,255,255,0.08)" },
            grid: { color: "rgba(255,255,255,0.08)" },
            pointLabels: { color: "rgba(255,255,255,0.6)", font: { family: "DM Sans", size: 12 } },
            ticks: { display: false, min: 0, max: 100 }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  if (ui.meta) ui.meta.innerHTML = `<strong>Idea Evaluation</strong> — Score: <strong>${a.viabilityScore ?? "--"}/100</strong>`;
}

// ─── Run company analysis ───────────────────────────────────────
async function run() {
  const company = ui.companyInput?.value.trim();
  if (!company) return setStatus("Enter a company name first.");
  setStatus("⏳ Analyzing...");
  if (ui.runBtn) ui.runBtn.disabled = true;
  showSkeletons();

  try {
    const data = await analyzeCompany(company);
    render(data, company);
    setStatus(`✓ Analysis complete for ${company}`);
    $("analysisResults")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    console.error(err);
  } finally {
    if (ui.runBtn) ui.runBtn.disabled = false;
  }
}

function showSkeletons() {
  const skeletonHTML = `<div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:75%"></div><div class="skeleton" style="width:80%"></div>`;
  ["businessModel","marketing","moat","swotS","swotW","swotO","swotT","insight"].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = skeletonHTML;
  });
}

// ─── Quick pill shortcut ─────────────────────────────────────────
window.quickRun = function(company) {
  if (ui.companyInput) ui.companyInput.value = company;
  run();
};

// ─── Event listeners ─────────────────────────────────────────────
ui.runBtn?.addEventListener("click", run);
ui.companyInput?.addEventListener("keydown", e => { if (e.key === "Enter") run(); });

ui.ideaBtn?.addEventListener("click", async () => {
  const idea = ui.ideaInput?.value.trim();
  if (!idea) return setStatus("Paste your startup idea first.");
  setStatus("⏳ Evaluating idea...");
  if (ui.ideaBtn) {
    ui.ideaBtn.disabled = true;
    ui.ideaBtn.textContent = "ANALYZING...";
  }
  try {
    const data = await analyzeIdea(idea);
    renderIdea(data);
    setStatus(`✓ Idea scored ${data.analysis?.viabilityScore ?? "--"}/100`);
    $("ideaResults")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    console.error(err);
  } finally {
    if (ui.ideaBtn) {
      ui.ideaBtn.disabled = false;
      ui.ideaBtn.textContent = "VALIDATE IDEA →";
    }
  }
});
