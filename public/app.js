// =============================================
//  STARTUP SANDBOX — app.js
//  Browser code calls local backend API routes only.
//  Idea validation is scored by local XGBoost, Random Forest, ANN, and similarity models.
// =============================================

// ─── DOM helpers ───────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const ui = {
  companyInput: $("companyInput"),
  runBtn: $("runBtn"),
  ideaInput: $("ideaInput"),
  ideaSector: $("ideaSector"),
  ideaBtn: $("ideaBtn"),
  ideaStatus: $("ideaStatus"),
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
  phGrid: $("phGrid"),
  phStatus: $("phStatus"),
  phRefreshBtn: $("phRefreshBtn"),
};

function setStatus(msg) { if (ui.status) ui.status.textContent = msg; }

function setIdeaStatus(msg, type = "") {
  if (!ui.ideaStatus) {
    setStatus(msg);
    return;
  }
  ui.ideaStatus.textContent = msg;
  ui.ideaStatus.classList.toggle("is-error", type === "error");
  ui.ideaStatus.classList.toggle("is-success", type === "success");
}

function apiUrl(path) {
  const base = window.API_BASE_URL || (window.location.protocol === "file:" ? "http://localhost:3000" : "");
  return `${base}${path}`;
}

async function apiFetch(path, options) {
  return fetch(apiUrl(path), options);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setMetric(name, value) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  if (ui[`${name}Val`]) ui[`${name}Val`].textContent = `${v}%`;
  if (ui[`${name}Bar`]) ui[`${name}Bar`].style.width = `${v}%`;
}

// ─── Legacy Gemini API call placeholder ─────────────────────────
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
  const res = await apiFetch(`/api/analyze?company=${encodeURIComponent(company)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Analysis failed: ${res.status}`);
  return data;
}

async function fetchProductHuntLaunches() {
  const res = await apiFetch("/api/product-hunt");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Launch feed failed: ${res.status}`);
  return data;
}

function renderProductHunt(data) {
  const launches = Array.isArray(data?.launches) ? data.launches : [];
  if (!ui.phGrid) return;

  if (!launches.length) {
    ui.phGrid.innerHTML = `<article class="launch-empty">No Product Hunt launches found right now.</article>`;
    return;
  }

  ui.phGrid.innerHTML = launches.map((item) => {
    const categories = (item.categories || [])
      .map((cat) => `<span>${escapeHtml(cat)}</span>`)
      .join("");
    const initials = escapeHtml((item.name || "PH").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase());
    const hasUpvotes = item.upvotes !== null && item.upvotes !== undefined && Number.isFinite(Number(item.upvotes));
    const hasComments = item.comments !== null && item.comments !== undefined && Number.isFinite(Number(item.comments));
    const sourceLabel = escapeHtml(item.sourceLabel || (item.categories || [])[0] || "Live");
    const upvotes = hasUpvotes ? `${Number(item.upvotes).toLocaleString()} upvotes` : sourceLabel;
    const comments = hasComments ? `${Number(item.comments).toLocaleString()} comments` : item.author ? `by ${escapeHtml(item.author)}` : "latest feed";
    return `<article class="launch-card">
      <div class="launch-rank">#${Number(item.rank) || ""}</div>
      <div class="launch-main">
        <div class="launch-icon">${initials}</div>
        <div>
          <a class="launch-title" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>
          <p class="launch-tagline">${escapeHtml(item.tagline || "Fresh launch from Product Hunt.")}</p>
        </div>
      </div>
      <div class="launch-tags">${categories || "<span>Product Hunt</span>"}</div>
      <div class="launch-stats">
        <span>${upvotes}</span>
        <span>${comments}</span>
      </div>
    </article>`;
  }).join("");

  if (ui.phStatus) {
    const fetched = data.fetchedAt ? new Date(data.fetchedAt).toLocaleString() : "just now";
    const googleCount = Number(data.sourceBreakdown?.googleNews || 0);
    const phCount = Number(data.sourceBreakdown?.productHunt || launches.length);
    const source = data.source?.includes("google-news")
      ? `Live Product Hunt + Google News signals (${phCount} PH, ${googleCount} Google)`
      : data.source === "product-hunt-feed"
        ? "Product Hunt feed fallback"
        : "Live scrape from Product Hunt";
    ui.phStatus.textContent = `${source}, updated ${fetched}`;
  }
}

async function loadProductHunt() {
  if (!ui.phGrid) return;
  if (ui.phRefreshBtn) ui.phRefreshBtn.disabled = true;
  if (ui.phStatus) ui.phStatus.textContent = "Scraping Product Hunt and Google launch signals...";
  ui.phGrid.innerHTML = `<article class="launch-card launch-skeleton"></article><article class="launch-card launch-skeleton"></article><article class="launch-card launch-skeleton"></article>`;

  try {
    const data = await fetchProductHuntLaunches();
    renderProductHunt(data);
  } catch (err) {
    if (ui.phStatus) ui.phStatus.textContent = `Launch sources unavailable: ${err.message}`;
    ui.phGrid.innerHTML = `<article class="launch-empty">Could not load live launches right now. Try refresh in a minute.</article>`;
    console.error(err);
  } finally {
    if (ui.phRefreshBtn) ui.phRefreshBtn.disabled = false;
  }
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
    ui.meta.innerHTML = `<strong>Open-data analysis</strong> — Analysis for <strong>${data.company || company}</strong> generated at ${new Date().toLocaleString()}`;
  }

  // Remove muted-init class from all card-text
  document.querySelectorAll(".muted-init").forEach(el => el.classList.remove("muted-init"));
}

// ─── Idea Analysis ──────────────────────────────────────────────
async function analyzeIdea(idea, sectorGroup = "") {
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
  const res = await apiFetch("/api/analyze-idea", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, sector_group: sectorGroup })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Idea analysis failed: ${res.status}`);
  return data;
}

// ─── Render idea results ─────────────────────────────────────────
function stripTags(value) {
  const div = document.createElement("div");
  div.innerHTML = String(value || "");
  return div.textContent || div.innerText || "";
}

function cleanIdeaLine(value) {
  return stripTags(value)
    .replace(/^(Wedge version|Anti-failure version|Distribution-first version|Premium version|Data-moat version|WILD PIVOT):\s*/i, "")
    .trim();
}

function renderActionCards(items, options = {}) {
  return `<div class="idea-action-list">${items.filter(Boolean).map((item, index) => `
    <div class="idea-action-item">
      <div class="idea-action-index">${options.labels?.[index] || String(index + 1).padStart(2, "0")}</div>
      <p>${escapeHtml(cleanIdeaLine(item))}</p>
    </div>
  `).join("")}</div>`;
}

function renderEvidence(a) {
  const advanced = a.advancedFeedback || {};
  const refs = advanced.referenceComparables || [];
  const risks = advanced.sectorRisks || [];
  const nextMove = advanced.nextMove || (a.mutations || [])[0] || "";
  const referenceHtml = refs.length
    ? refs.slice(0, 3).map((item) => `
      <div class="evidence-row">
        <div>
          <strong>${escapeHtml(item.name || "Comparable")}</strong>
          <em>${escapeHtml((item.matchReasons || []).slice(0, 4).join(", ") || "semantic overlap")}</em>
        </div>
        <span>${escapeHtml(item.sector || item.status || "Reference")}</span>
      </div>
    `).join("")
    : `<div class="evidence-empty">No close comparable found. Treat this as unproven until users pay or commit.</div>`;
  const riskHtml = risks.length
    ? `<div class="risk-chip-row">${risks.slice(0, 4).map((risk) => `<span>${escapeHtml(risk.risk)} ${Math.round(Number(risk.rate || 0) * 100)}%</span>`).join("")}</div>`
    : `<div class="risk-chip-row"><span>Risk unclear</span></div>`;

  return `
    <div class="evidence-block">
      <div class="evidence-subhead">Closest References</div>
      ${referenceHtml}
      <div class="evidence-subhead">Failure Patterns</div>
      ${riskHtml}
      <div class="evidence-subhead">Moat To Build</div>
      <p>${escapeHtml(cleanIdeaLine(nextMove || a.copycatRisk || "Build proof that is specific to this customer and hard to copy."))}</p>
    </div>`;
}

function renderIdea(data) {
  if (ui.ideaResults) ui.ideaResults.style.display = "block";
  const a = data.analysis || {};
  [
    [ui.ideaMutations, "Focus Wedges"],
    [ui.ideaCopycat, "Evidence, Risk & Moat"],
    [ui.ideaExperiments, "Next Tests"],
    [ui.ideaMistakes, "Likely Failure Mode"],
    [ui.ideaOpportunity, "Hidden Opportunity"]
  ].forEach(([el, label]) => {
    const labelEl = el?.closest(".card")?.querySelector(".card-label");
    if (labelEl) labelEl.textContent = label;
  });

  if (ui.ideaScoreVal) ui.ideaScoreVal.textContent = a.viabilityScore ?? "--";
  if (ui.ideaTitle) {
    ui.ideaTitle.textContent = `[ ${a.decision || "UNKNOWN"} ]`;
    const colorMap = {
      "SCALE THE WEDGE": "#34d399",
      "VALIDATE AGGRESSIVELY": "#60a5fa",
      "NICHE DOWN": "#fbbf24",
      "REBUILD THE ANGLE": "#fb923c",
      "PROVE DEMAND FIRST": "#f87171",
      "DROP OR REINVENT": "#f87171"
    };
    ui.ideaTitle.style.color = colorMap[a.decision] || "var(--text)";
  }
  if (ui.ideaDesc) {
    const verification = a.advancedFeedback?.geminiVerification;
    ui.ideaDesc.textContent = [a.decisionReason, verification ? `Gemini check: ${verification}` : ""]
      .filter(Boolean)
      .join(" ");
  }

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
  if (ui.ideaMutations) {
    ui.ideaMutations.innerHTML = renderActionCards([...(a.mutations || []), a.crazyPivot], {
      labels: ["WEDGE", "AVOID", "CHANNEL", "PIVOT"]
    });
  }
  if (ui.ideaCopycat) ui.ideaCopycat.innerHTML = renderEvidence(a);
  if (ui.ideaExperiments) ui.ideaExperiments.innerHTML = renderActionCards(a.liveExperiments || []);
  if (ui.ideaMistakes) ui.ideaMistakes.innerHTML = `<p>${escapeHtml(cleanIdeaLine(a.mistakePredictor || ""))}</p>`;
  if (ui.ideaOpportunity) {
    const advice = a.advancedFeedback?.personalizedAdvice;
    ui.ideaOpportunity.textContent = cleanIdeaLine(advice || a.hiddenOpportunity || "");
  }

  // Radar chart
  if (ui.chartCard && window.Chart) {
    ui.chartCard.style.display = "block";
    const canvas = $("ideaChart");
    if (window.ideaChartInstance) window.ideaChartInstance.destroy();
    
    const ctx = canvas.getContext("2d");
    const strokeGrad = ctx.createLinearGradient(0, 0, 0, 300);
    strokeGrad.addColorStop(0, "rgba(139, 92, 246, 1)");
    strokeGrad.addColorStop(1, "rgba(79, 142, 255, 1)");
    
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 300);
    bgGrad.addColorStop(0, "rgba(139, 92, 246, 0.3)");
    bgGrad.addColorStop(1, "rgba(79, 142, 255, 0.05)");

    window.ideaChartInstance = new Chart(ctx, {
      type: "radar",
      data: {
        labels: ["Market Potential", "Execution Feasibility", "Defensibility", "Capital Efficiency"],
        datasets: [{
          label: "Score",
          data: [a.marketPotential||0, a.executionFeasibility||0, a.defensibility||0, a.capitalEfficiency||0],
          backgroundColor: bgGrad,
          borderColor: strokeGrad,
          pointBackgroundColor: strokeGrad,
          pointBorderColor: "#fff",
          borderWidth: 3,
          tension: 0.3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: {
          duration: 1200,
          easing: 'easeOutQuart'
        },
        scales: {
          r: {
            angleLines: { color: "rgba(255,255,255,0.04)" },
            grid: { color: "rgba(255,255,255,0.04)" },
            pointLabels: { color: "rgba(255,255,255,0.8)", font: { family: "Inter", size: 12, weight: 500 } },
            ticks: { display: false, min: 0, max: 100 }
          }
        },
        plugins: { 
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(10, 10, 10, 0.9)",
            titleFont: { family: "Inter", size: 13 },
            bodyFont: { family: "Inter", size: 14, weight: 'bold' },
            padding: 12,
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: 1
          }
        }
      }
    });
  }

  if (ui.meta) {
    const refinedByGemini = a.llm?.provider === "gemini" && a.llm?.used;
    const engine = refinedByGemini
      ? `Hybrid ML model, reviewed by Gemini (${a.llm.model || "Gemini"})`
      : data.engine === "local-hybrid-startup-ml"
        ? "Hybrid XGBoost + Random Forest + ANN + cosine similarity model"
        : "Idea Evaluation";
    ui.meta.innerHTML = `<strong>${engine}</strong> — Score: <strong>${a.viabilityScore ?? "--"}/100</strong>`;
  }
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
async function runIdea() {
  const idea = ui.ideaInput?.value.trim();
  const sectorGroup = ui.ideaSector?.value || "";
  if (!idea) {
    setIdeaStatus("Paste your startup idea first.", "error");
    return setStatus("Paste your startup idea first.");
  }
  if (idea.length < 10) {
    setIdeaStatus("Add a little more detail before validating.", "error");
    return setStatus("Idea is too short. Add at least 10 characters.");
  }

  setStatus("Evaluating with the startup model...");
  setIdeaStatus("Evaluating with the startup model...");
  if (ui.ideaBtn) {
    ui.ideaBtn.disabled = true;
    ui.ideaBtn.textContent = "ANALYZING...";
  }

  try {
    const data = await analyzeIdea(idea, sectorGroup);
    renderIdea(data);
      triggerStaggerAnimations('ideaResults');
    const score = data.analysis?.viabilityScore ?? "--";
    setStatus(`Idea scored ${score}/100`);
    setIdeaStatus(`Idea scored ${score}/100`, "success");
    $("ideaResults")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    const message = err?.message || "Idea analysis failed.";
    setStatus(`Error: ${message}`);
    setIdeaStatus(`Error: ${message}`, "error");
    console.error(err);
  } finally {
    if (ui.ideaBtn) {
      ui.ideaBtn.disabled = false;
      ui.ideaBtn.textContent = "VALIDATE IDEA ->";
    }
  }
}

ui.runBtn?.addEventListener("click", run);
ui.companyInput?.addEventListener("keydown", e => { if (e.key === "Enter") run(); });
ui.phRefreshBtn?.addEventListener("click", loadProductHunt);
ui.ideaBtn?.addEventListener("click", runIdea);
ui.ideaInput?.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runIdea();
});

async function legacyIdeaHandler() {
  const idea = ui.ideaInput?.value.trim();
  const sectorGroup = ui.ideaSector?.value || "";
  if (!idea) return setStatus("Paste your startup idea first.");
  setStatus("⏳ Evaluating with the startup model, then asking Gemini to review the model output...");
  if (ui.ideaBtn) {
    ui.ideaBtn.disabled = true;
    ui.ideaBtn.textContent = "ANALYZING...";
  }
  try {
    const data = await analyzeIdea(idea, sectorGroup);
    renderIdea(data);
      triggerStaggerAnimations('ideaResults');
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
}

loadProductHunt();

// Cursor tracking
document.addEventListener('mousemove', (e) => {
  const glow = document.getElementById('cursorGlow');
  if (glow) {
    // using requestAnimationFrame for smooth movement
    requestAnimationFrame(() => {
      glow.style.left = e.clientX + 'px';
      glow.style.top = e.clientY + 'px';
    });
  }
});

// Staggered animation helper
function triggerStaggerAnimations(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const cards = container.querySelectorAll('.card');
  cards.forEach((card, i) => {
    card.classList.remove('stagger-anim');
    void card.offsetWidth; // trigger reflow
    card.classList.add('stagger-anim');
    card.style.animationDelay = `${i * 40}ms`;
  });
}
