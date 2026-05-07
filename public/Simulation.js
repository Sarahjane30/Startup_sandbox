// =============================================
//  STARTUP SANDBOX — simulation.js
//  Controls the Founder Decision Simulator page.
// =============================================

const $ = (id) => document.getElementById(id);

const ui = {
  simBtn: $('simBtn'),
  simStatus: $('simStatus'),
  simResults: $('simResults'),
  simSummaryText: $('simSummaryText'),
  startupPattern: $('startupPattern'),
  simMetricsGrid: $('simMetricsGrid'),
  healthMeters: $('healthMeters'),
  decisionRound: $('decisionRound'),
  monthlyTimeline: $('monthlyTimeline'),
  coachPanel: $('coachPanel'),
  founderLog: $('founderLog'),
};

const chartInstances = {};
let currentSimState = null;

function setStatus(message) {
  if (ui.simStatus) ui.simStatus.textContent = message || '';
}

function getValue(id) {
  const el = $(id);
  return el ? el.value.trim() : '';
}

function getNumber(id, fallback = 0) {
  const value = Number(getValue(id));
  return Number.isFinite(value) ? value : fallback;
}

function collectFounder() {
  return {
    money: getNumber('money', 25000),
    monthlyBurn: getNumber('monthlyBurn', 4000),
    teamSize: getNumber('teamSize', 2),
    technicalCofounder: getValue('technicalCofounder'),
    founderType: getValue('founderType'),
    country: getValue('country'),
    riskTolerance: getValue('riskTolerance'),
    startupStage: getValue('startupStage'),
    audience: getValue('audience'),
    industryExperience: getValue('industryExperience'),
    timeCommitment: getValue('timeCommitment'),
    personality: getValue('personality'),
  };
}

function collectStartup() {
  return {
    idea: getValue('idea'),
    industry: getValue('industry'),
    customerType: getValue('customerType'),
    businessModel: getValue('businessModel'),
    aiDependency: getValue('aiDependency'),
    productType: getValue('productType'),
    revenueModel: getValue('revenueModel'),
  };
}

function formatNumber(value, suffix = '') {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `${Math.round(value).toLocaleString()}${suffix}`;
}

function formatPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `${Math.round(value)}%`;
}

function renderMetrics(visible = {}) {
  if (!ui.simMetricsGrid) return;
  const cards = [
    { label: 'Cash', value: formatNumber(visible.cash, ' USD') },
    { label: 'Runway', value: `${visible.runwayMonths ?? '--'} months` },
    { label: 'Users', value: formatNumber(visible.users) },
    { label: 'Growth', value: formatPercent(visible.growth) },
    { label: 'Retention', value: formatPercent(visible.retention) },
    { label: 'Investor interest', value: formatPercent(visible.investorInterest) },
    { label: 'Morale', value: formatPercent(visible.morale) },
    { label: 'Health', value: formatPercent(visible.healthScore) },
    { label: 'Dilution', value: formatPercent(visible.dilution) },
  ];

  ui.simMetricsGrid.innerHTML = cards
    .map(({ label, value }) => `
      <div class="sim-card">
        <div class="sim-card-title">${label}</div>
        <div class="sim-card-value">${value}</div>
      </div>
    `)
    .join('');
}

function renderHealthMeters(visible = {}) {
  if (!ui.healthMeters) return;
  const items = [
    { label: 'Runway', value: visible.runwayMonths ?? 0, max: 24 },
    { label: 'Health', value: visible.healthScore ?? 0, max: 100 },
    { label: 'Stress', value: visible.founderStress ?? 0, max: 100, invert: true },
  ];

  ui.healthMeters.innerHTML = items
    .map(({ label, value, max, invert }) => {
      const normalized = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
      const width = invert ? 100 - normalized : normalized;
      return `
        <div class="meter-row">
          <div class="meter-label">${label}</div>
          <div class="meter-bar"><div class="meter-fill" style="width:${width}%"></div></div>
        </div>
      `;
    })
    .join('');
}

function renderDecisionRound(round = {}) {
  if (!ui.decisionRound) return;
  const title = round.title || `Month ${round.month || 1}`;
  const description = round.summary || round.prompt || round.description || '';
  const choices = Array.isArray(round.choices) ? round.choices : [];

  ui.decisionRound.innerHTML = `
    <div class="sim-card-title">${title}</div>
    <p class="card-text">${description}</p>
    <div class="decision-actions"></div>
  `;

  const actions = ui.decisionRound.querySelector('.decision-actions');
  if (!actions) return;

  if (!choices.length) {
    actions.innerHTML = '<div class="muted-init">No choices found for this round.</div>';
    return;
  }

  choices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sim-choice-btn';
    const label = choice.label || choice.title || '';
    btn.innerHTML = `
      <span>${choice.id}: ${label}</span>
      <span aria-hidden="true">→</span>
    `;
    btn.addEventListener('click', async () => {
      await submitDecision(choice.id);
    });
    actions.appendChild(btn);
  });
}

function renderTimeline(chartData = {}) {
  if (!ui.monthlyTimeline) return;
  const labels = Array.isArray(chartData.labels) ? chartData.labels : [];
  const runway = Array.isArray(chartData.runway) ? chartData.runway : [];
  const users = Array.isArray(chartData.users) ? chartData.users : [];

  if (!labels.length) {
    ui.monthlyTimeline.innerHTML = '<div class="muted-init">Timeline will appear after your first decision.</div>';
    return;
  }

  ui.monthlyTimeline.innerHTML = `
    <div class="timeline-grid">
      ${labels
        .map((label, index) => `
          <div class="timeline-step">
            <div class="timeline-month">${label}</div>
            <div class="timeline-value"><strong>Users:</strong> ${formatNumber(users[index])}</div>
            <div class="timeline-value"><strong>Runway:</strong> ${runway[index] ?? '--'}m</div>
          </div>
        `)
        .join('')}
    </div>
  `;
}

function renderCoachPanel(lesson = {}, round = {}) {
  if (!ui.coachPanel) return;
  const advice = lesson?.why || lesson?.smartChoice || lesson?.beginnerChoice || 'Watch how your decisions affect runway, equity, and momentum.';
  ui.coachPanel.innerHTML = `
    <div class="sim-card">
      <div class="sim-card-title">Founder Coach</div>
      <p class="card-text">${advice}</p>
      ${round.randomEvent ? `<p class="card-text"><strong>Random event:</strong> ${round.randomEvent}</p>` : ''}
    </div>
  `;
}

function renderFounderLog(history = []) {
  if (!ui.founderLog) return;
  ui.founderLog.innerHTML = history.length
    ? history
        .map(
          (entry) => `
            <div class="log-entry">
              <div class="log-month">Month ${entry.month || ''} — ${entry.choice || ''}</div>
              <div class="log-text">${entry.outcome || entry.summary || entry.note || ''}</div>
            </div>
          `
        )
        .join('')
    : '<div class="muted-init">Your founder log will appear here as you make decisions.</div>';
}

function renderCharts(chartData = {}) {
  if (typeof Chart !== 'function') return;

  const chartConfig = (label, data, color = 'rgba(79,142,255,0.9)') => ({
    type: 'line',
    data: {
      labels: chartData.labels || [],
      datasets: [
        {
          label,
          data: data || [],
          fill: false,
          borderColor: color,
          backgroundColor: color,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: color,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#fff' }, grid: { display: false } },
        y: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.08)' } }
      }
    }
  });

  const chartMap = [
    { id: 'runwayChart', label: 'Runway', data: chartData.runway, color: 'rgba(79,142,255,1)' },
    { id: 'usersChart', label: 'Users', data: chartData.users, color: 'rgba(34,197,94,1)' },
    { id: 'revenueChart', label: 'Revenue', data: chartData.revenue, color: 'rgba(249,115,22,1)' },
    { id: 'equityChart', label: 'Equity Left', data: chartData.equity || (Array.isArray(chartData.dilution) ? chartData.dilution.map((v) => 100 - v) : []), color: 'rgba(234,179,8,1)' },
  ];

  chartMap.forEach(({ id, label, data, color }) => {
    const canvas = $(id);
    if (!canvas) return;
    if (chartInstances[id]) {
      chartInstances[id].destroy();
      chartInstances[id] = null;
    }
    try {
      chartInstances[id] = new Chart(canvas.getContext('2d'), chartConfig(label, data, color));
    } catch (error) {
      console.warn('Chart render failed for', id, error);
    }
  });
}

async function submitDecision(choiceId) {
  if (!currentSimState) return;
  setStatus(`Processing decision ${choiceId}...`);
  disableChoices(true);

  try {
    const response = await fetch('/api/simulate/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: currentSimState, choiceId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Decision failed');
    currentSimState = result;
    renderSimulation(result);
    setStatus(`Decision ${choiceId} applied. Continue the simulation.`);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    console.error(err);
  } finally {
    disableChoices(false);
  }
}

function disableChoices(disabled) {
  if (!ui.decisionRound) return;
  ui.decisionRound.querySelectorAll('button').forEach((button) => {
    button.disabled = disabled;
  });
}

function renderSimulation(state) {
  if (!state) return;
  if (ui.simResults) ui.simResults.style.display = 'block';
  if (ui.simSummaryText) ui.simSummaryText.textContent = state.summary || state.startup?.idea || 'Startup simulation in progress.';
  if (ui.startupPattern) ui.startupPattern.textContent = state.patternMatch || state.pattern || '';

  // Show fallback warning if needed
  if (state._fallback) {
    setStatus('⚠️ Running with fallback simulation (AI model unavailable). Retrying...');
  }

  renderMetrics(state.visible || {});
  renderHealthMeters(state.visible || {});
  renderDecisionRound(state.round || {});
  renderTimeline(state.chartData || {});
  renderCoachPanel(state.lesson || {}, state.round || {});
  renderFounderLog(state.history || []);
  renderCharts(state.chartData || {});
}

async function startSimulation() {
  setStatus('Launching simulation...');
  if (ui.simBtn) {
    ui.simBtn.disabled = true;
    ui.simBtn.textContent = 'LOADING...';
  }

  const founder = collectFounder();
  const startup = collectStartup();

  try {
    const response = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ founder, startup }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Simulation initialization failed.');
    currentSimState = result;
    renderSimulation(result);
    setStatus('Simulation ready. Make your first decision.');
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    console.error(err);
  } finally {
    if (ui.simBtn) {
      ui.simBtn.disabled = false;
      ui.simBtn.textContent = 'START DECISION SIM';
    }
  }
}

if (ui.simBtn) {
  ui.simBtn.addEventListener('click', startSimulation);
}

window.addEventListener('DOMContentLoaded', () => {
  if (currentSimState) {
    renderSimulation(currentSimState);
  }
});