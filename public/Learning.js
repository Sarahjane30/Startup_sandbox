// Startup Sandbox learning platform.
// Local progression + Python Random Forest / Decision Tree personalization.

const $ = (id) => document.getElementById(id);

const STORE_KEY = "sb_learning_platform_state_v1";

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveState(nextState) {
  localStorage.setItem(STORE_KEY, JSON.stringify(nextState));
}

let state = {
  xp: 0,
  completed: [],
  completedRounds: [],
  skillScores: {},
  mistakes: {},
  streak: 0,
  achievements: [],
  sectorInterests: {},
  ...loadState(),
};

let platform = null;
let currentLesson = null;
let selectedAnswer = null;

async function callLearning(action, payload = {}) {
  const res = await fetch("/api/learning", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, state, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Learning engine failed");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pct(value, max) {
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function updateHeader() {
  const level = platform?.level?.current || { name: "Rookie", minXp: 0 };
  const next = platform?.level?.next;
  const nextXp = next ? next.minXp : Math.max(state.xp, 1);
  const baseXp = level.minXp || 0;
  const xpProgress = next ? pct(state.xp - baseXp, next.minXp - baseXp) : 100;
  const completedTotal = state.completed?.length || 0;
  const totalModules = platform?.curriculum?.modules?.length || 90;

  $("xpCount").textContent = state.xp || 0;
  $("levelLabel").textContent = level.name;
  $("streakCount").textContent = `${state.streak || 0} day${state.streak === 1 ? "" : "s"}`;
  $("completedCount").textContent = `${completedTotal}/${totalModules}`;
  $("xpBarLabel").textContent = `${state.xp || 0} XP`;
  $("xpNextLabel").textContent = next ? `Next: ${next.minXp} XP (${next.name})` : "Max level";
  $("xpFill").style.width = `${xpProgress}%`;
}

function renderInsights() {
  const weak = platform?.weakness?.weakAreas || [];
  const strong = platform?.weakness?.strongAreas || [];
  const recs = platform?.recommendations || [];
  const sectors = platform?.sectorAffinity?.ranked || [];
  const achievements = state.achievements || [];

  $("weakSkillList").innerHTML = weak.length ? weak.map((item) => `
    <div class="insight-row">
      <span>${escapeHtml(item.label)}</span>
      <strong>${item.score}/100</strong>
    </div>
  `).join("") : `<div class="empty-note">Weak skills will appear after quiz attempts.</div>`;

  $("strongSkillList").innerHTML = strong.length ? strong.map((item) => `
    <div class="insight-row">
      <span>${escapeHtml(item.label)}</span>
      <strong>${item.score}/100</strong>
    </div>
  `).join("") : `<div class="empty-note">Strengths unlock as your scores climb.</div>`;

  $("recommendationList").innerHTML = recs.length ? recs.map((item) => `
    <button class="rec-row" onclick="openLesson('${item.moduleId}')">
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.reason)}</small>
      </span>
      <span class="rec-arrow">Open</span>
    </button>
  `).join("") : `<div class="empty-note">Complete a quiz to get adaptive recommendations.</div>`;

  $("sectorAffinityList").innerHTML = sectors.map((item) => `
    <div class="sector-meter">
      <span>${escapeHtml(formatSector(item.sector))}</span>
      <div class="sector-track"><div style="width:${pct(item.confidence, 1)}%"></div></div>
      <strong>${Math.round(item.confidence * 100)}%</strong>
    </div>
  `).join("");

  $("achievementList").innerHTML = achievements.length ? achievements.map((id) => `
    <span class="achievement-chip">${escapeHtml(id.replaceAll("_", " "))}</span>
  `).join("") : `<span class="achievement-chip muted">No achievements yet</span>`;
}

function renderRounds() {
  const rounds = platform?.curriculum?.rounds || [];
  $("lessonGrid").innerHTML = rounds.map((round) => {
    const isSector = round.category === "sector";
    const status = round.locked ? "Locked" : isSector ? "Sector Path" : `Round ${round.round}`;
    return `
      <article class="round-panel ${round.locked ? "locked" : ""}">
        <div class="round-head">
          <div>
            <div class="lesson-num">${escapeHtml(status)}</div>
            <h3>${escapeHtml(round.title)}</h3>
          </div>
          <span class="round-count">${round.modules.filter((m) => m.completed).length}/10</span>
        </div>
        ${round.locked ? `<p class="unlock-note">${escapeHtml(unlockText(round.unlock))}</p>` : ""}
        <div class="module-list">
          ${round.modules.map(renderModule).join("")}
        </div>
      </article>
    `;
  }).join("");
}

function renderModule(module) {
  const status = module.completed ? "Done" : module.locked ? "Locked" : "Start";
  const skills = module.skills.map((s) => s.replaceAll("_", " ")).slice(0, 2).join(" + ");
  return `
    <button class="module-row ${module.completed ? "completed" : ""}" ${module.locked ? "disabled" : `onclick="openLesson('${module.id}')"`}>
      <span class="module-index">${String(module.module).padStart(2, "0")}</span>
      <span class="module-main">
        <strong>${escapeHtml(module.title)}</strong>
        <small>${escapeHtml(skills)}</small>
      </span>
      <span class="module-xp">+${module.xp}</span>
      <span class="module-status">${status}</span>
    </button>
  `;
}

function unlockText(unlock = {}) {
  if (unlock.completed_round) return `Requires ${unlock.completed_round.replaceAll("-", " ")} completed.`;
  return "Complete earlier founder rounds to unlock.";
}

function formatSector(sector) {
  return {
    ai_ml: "AI/ML",
    healthcare: "Healthcare",
    ecommerce: "Ecommerce",
    fintech: "Fintech",
  }[sector] || sector;
}

window.openLesson = async function openLesson(moduleId) {
  selectedAnswer = null;
  $("lessonModal").style.display = "flex";
  document.body.style.overflow = "hidden";
  $("modalEyebrow").textContent = "// LOADING MODULE";
  $("modalTitle").textContent = "Loading...";
  $("modalBody").innerHTML = skeletonHtml();

  try {
    currentLesson = await callLearning("lesson", { moduleId });
    renderModal(currentLesson);
  } catch (err) {
    $("modalBody").innerHTML = `<p class="error-text">${escapeHtml(err.message)}</p>`;
  }
};

function renderModal(lessonPayload) {
  const lesson = lessonPayload.module;
  const quiz = lessonPayload.quiz;
  $("modalEyebrow").textContent = `// ${lesson.roundTitle.toUpperCase()} - MODULE ${String(lesson.module).padStart(2, "0")}`;
  $("modalTitle").textContent = lesson.title;
  $("modalBody").innerHTML = `
    <div class="modal-content">
      <div class="lesson-tags">
        ${lesson.skillTypes.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}
        ${lesson.skills.map((s) => `<span>${escapeHtml(s.replaceAll("_", " "))}</span>`).join("")}
      </div>
      <div class="lesson-block">
        <p class="modal-label">// KEY CONCEPTS</p>
        ${lessonPayload.keyPoints.map((point) => `<div class="key-point"><span>+</span><p>${escapeHtml(point)}</p></div>`).join("")}
      </div>
      <div class="lesson-callout">
        <p class="modal-label">// FOUNDER EXAMPLE</p>
        <p>${escapeHtml(lessonPayload.realWorldExample)}</p>
      </div>
      <div class="lesson-warning">
        <p class="modal-label">// COMMON MISTAKE</p>
        <p>${escapeHtml(lessonPayload.commonMistake)}</p>
      </div>
      <div class="lesson-callout blue">
        <p class="modal-label">// PRO TIP</p>
        <p>${escapeHtml(lessonPayload.proTip)}</p>
      </div>
    </div>
    <div class="quiz-section">
      <div class="quiz-q">${escapeHtml(quiz.question)}</div>
      <div class="quiz-options">
        ${quiz.options.map((option, index) => `
          <button class="quiz-opt" onclick="selectAnswer(${index})">${escapeHtml(option)}</button>
        `).join("")}
      </div>
      <div id="quizFeedback"></div>
    </div>
    <button class="modal-next-btn" id="modalNextBtn" onclick="submitQuiz()" disabled>Submit Answer</button>
  `;
}

window.selectAnswer = function selectAnswer(index) {
  selectedAnswer = index;
  document.querySelectorAll(".quiz-opt").forEach((button, i) => {
    button.classList.toggle("selected", i === index);
  });
  $("modalNextBtn").disabled = false;
};

window.submitQuiz = async function submitQuiz() {
  if (!currentLesson || selectedAnswer === null) return;
  $("modalNextBtn").disabled = true;
  $("modalNextBtn").textContent = "Scoring...";
  try {
    const payload = await callLearning("submit", {
      moduleId: currentLesson.module.id,
      selectedIndex: selectedAnswer,
    });
    state = payload.state;
    saveState(state);
    platform = payload;
    showQuizResult(payload);
    updateHeader();
    renderInsights();
    renderRounds();
  } catch (err) {
    $("quizFeedback").innerHTML = `<div class="quiz-feedback feedback-wrong">${escapeHtml(err.message)}</div>`;
  } finally {
    $("modalNextBtn").textContent = "Close";
    $("modalNextBtn").disabled = false;
    $("modalNextBtn").onclick = closeModal;
  }
};

function showQuizResult(payload) {
  const correct = payload.result.correct;
  document.querySelectorAll(".quiz-opt").forEach((button, i) => {
    button.disabled = true;
    if (i === 0) button.classList.add("correct");
    if (!correct && i === selectedAnswer) button.classList.add("wrong");
  });
  const achievementText = payload.newAchievements?.length
    ? `<p class="mini-reward">${payload.newAchievements.map((a) => escapeHtml(a.title)).join(" + ")}</p>`
    : "";
  $("quizFeedback").innerHTML = `
    <div class="quiz-feedback ${correct ? "feedback-correct" : "feedback-wrong"}">
      <strong>${correct ? "Correct." : "Not quite."}</strong>
      ${correct ? ` +${payload.xpReward.xp} XP added.` : " Review the scenario and try the next module."}
      ${achievementText}
    </div>
  `;
}

function skeletonHtml() {
  return `
    <div class="skeleton" style="width:100%; height:14px;"></div>
    <div class="skeleton" style="width:88%; height:14px;"></div>
    <div class="skeleton" style="width:94%; height:14px;"></div>
    <div class="skeleton" style="width:70%; height:14px;"></div>
  `;
}

function closeModal() {
  $("lessonModal").style.display = "none";
  document.body.style.overflow = "";
  currentLesson = null;
  selectedAnswer = null;
}

$("modalClose")?.addEventListener("click", closeModal);
$("lessonModal")?.addEventListener("click", (event) => {
  if (event.target === $("lessonModal")) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

async function boot() {
  $("lessonGrid").innerHTML = `<div class="loading-panel">${skeletonHtml()}</div>`;
  try {
    platform = await callLearning("analyze");
    updateHeader();
    renderInsights();
    renderRounds();
  } catch (err) {
    $("lessonGrid").innerHTML = `<div class="error-text">${escapeHtml(err.message)}</div>`;
  }
}

boot();
