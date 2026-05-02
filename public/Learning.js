// =============================================
//  STARTUP SANDBOX — learning.js
//  AI-generated lesson content + quizzes via Gemini.
//  XP, levels, and progress stored in localStorage.
// =============================================

const $ = (id) => document.getElementById(id);

// ─── Curriculum definition ───────────────────────────────────────
// Lessons are defined here; CONTENT is always AI-generated.
const LESSONS = [
  {
    id: "idea-validation",
    icon: "💡",
    title: "Idea Validation",
    desc: "How to know if your idea is worth pursuing before spending a dollar.",
    xp: 20,
    unlockAfter: null,
  },
  {
    id: "customer-discovery",
    icon: "🎯",
    title: "Customer Discovery",
    desc: "Talk to users before you build. Learn what to ask and how to listen.",
    xp: 25,
    unlockAfter: "idea-validation",
  },
  {
    id: "mvp-design",
    icon: "🛠️",
    title: "Building an MVP",
    desc: "What to build, what to cut, and how to launch fast without burning out.",
    xp: 30,
    unlockAfter: "customer-discovery",
  },
  {
    id: "pricing-strategy",
    icon: "💰",
    title: "Pricing Strategy",
    desc: "How to price your product: cost-plus, value-based, and freemium models.",
    xp: 25,
    unlockAfter: "mvp-design",
  },
  {
    id: "go-to-market",
    icon: "🚀",
    title: "Go-To-Market",
    desc: "Your first 100 users: channels, messaging, and growth loops.",
    xp: 30,
    unlockAfter: "pricing-strategy",
  },
  {
    id: "metrics-and-kpis",
    icon: "📊",
    title: "Metrics & KPIs",
    desc: "What to measure, what to ignore, and why retention beats acquisition.",
    xp: 25,
    unlockAfter: "go-to-market",
  },
  {
    id: "fundraising",
    icon: "🏦",
    title: "Fundraising Basics",
    desc: "When to raise, how much, and how to pitch without embarrassing yourself.",
    xp: 35,
    unlockAfter: "metrics-and-kpis",
  },
  {
    id: "competitive-moats",
    icon: "⚔️",
    title: "Competitive Moats",
    desc: "Network effects, switching costs, data moats — how to build a defensible business.",
    xp: 35,
    unlockAfter: "fundraising",
  },
];

// ─── XP / Level system ──────────────────────────────────────────
const LEVELS = [
  { name: "Rookie", min: 0 },
  { name: "Founder", min: 50 },
  { name: "Builder", min: 100 },
  { name: "Operator", min: 175 },
  { name: "Strategist", min: 250 },
  { name: "Investor", min: 350 },
  { name: "Unicorn", min: 500 },
];

function getLevel(xp) {
  let level = LEVELS[0];
  for (const l of LEVELS) { if (xp >= l.min) level = l; else break; }
  return level;
}
function getNextLevel(xp) {
  for (const l of LEVELS) { if (xp < l.min) return l; }
  return null;
}

// ─── Persistence ─────────────────────────────────────────────────
function loadState() {
  try {
    return JSON.parse(localStorage.getItem("sb_learn_state") || "{}");
  } catch { return {}; }
}
function saveState(state) {
  localStorage.setItem("sb_learn_state", JSON.stringify(state));
}

let state = loadState();
if (!state.xp) state.xp = 0;
if (!state.completed) state.completed = [];
if (!state.streak) state.streak = 0;
if (!state.lastDate) state.lastDate = null;

// Update streak
const today = new Date().toDateString();
if (state.lastDate !== today) {
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  state.streak = state.lastDate === yesterday ? state.streak + 1 : 0;
  state.lastDate = today;
  saveState(state);
}

// ─── Render UI state ─────────────────────────────────────────────
function updateUI() {
  const level = getLevel(state.xp);
  const next = getNextLevel(state.xp);
  const pct = next ? Math.round(((state.xp - level.min) / (next.min - level.min)) * 100) : 100;

  $("xpCount").textContent = state.xp;
  $("levelLabel").textContent = level.name;
  $("streakCount").textContent = `${state.streak} day${state.streak !== 1 ? "s" : ""}`;
  $("completedCount").textContent = `${state.completed.length}/${LESSONS.length}`;
  $("xpBarLabel").textContent = `${state.xp} XP`;
  $("xpNextLabel").textContent = next ? `Next: ${next.min} XP (${next.name})` : "MAX LEVEL 🏆";
  $("xpFill").style.width = `${pct}%`;
}

function renderLessons() {
  const grid = $("lessonGrid");
  grid.innerHTML = LESSONS.map((lesson, i) => {
    const done = state.completed.includes(lesson.id);
    const locked = lesson.unlockAfter && !state.completed.includes(lesson.unlockAfter);
    let statusClass = "status-available";
    let statusText = "START";
    let cardClass = "";
    if (done) { statusClass = "status-done"; statusText = "✓ COMPLETED"; cardClass = "completed"; }
    if (locked) { statusClass = "status-locked"; statusText = "🔒 LOCKED"; cardClass = "locked"; }

    return `
      <div class="lesson-card ${cardClass}" ${!locked ? `onclick="openLesson('${lesson.id}')"` : ""} data-id="${lesson.id}">
        <div class="lesson-xp">+${lesson.xp} XP</div>
        <div class="lesson-icon">${lesson.icon}</div>
        <div class="lesson-num">MODULE ${String(i + 1).padStart(2, "0")}</div>
        <div class="lesson-title">${lesson.title}</div>
        <p class="lesson-desc">${lesson.desc}</p>
        <span class="lesson-status ${statusClass}">${statusText}</span>
      </div>
    `;
  }).join("");
}

// ─── Gemini: fetch lesson content ────────────────────────────────
async function fetchLessonContent(lesson) {
  const prompt = `
You are an expert startup mentor and educator. Teach the topic: "${lesson.title}" — ${lesson.desc}

Write it like Duolingo meets Paul Graham: short, punchy, practical, with real-world examples.

Return ONLY valid JSON (no markdown) matching this schema:
{
  "keyPoints": [
    "string (one concrete, actionable insight)",
    "string",
    "string",
    "string"
  ],
  "realWorldExample": "string (2-3 sentences: a specific real startup story that illustrates this topic)",
  "commonMistake": "string (1-2 sentences: the #1 mistake founders make on this topic)",
  "proTip": "string (1 sentence: the insider move most founders don't know)",
  "quiz": {
    "question": "string (a practical, scenario-based question about this topic)",
    "options": [
      "string (option A)",
      "string (option B)",
      "string (option C)",
      "string (option D)"
    ],
    "correctIndex": <0-3>,
    "explanation": "string (2-3 sentences explaining why the correct answer is right and why the others are wrong)"
  }
}
`;

  const res = await fetch("/api/lesson", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: lesson.title, desc: lesson.desc })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Lesson generation failed");
  return data;
}

// ─── Modal: open lesson ──────────────────────────────────────────
let currentLesson = null;
let lessonData = null;
let quizAnswered = false;

window.openLesson = async function(id) {
  const lesson = LESSONS.find(l => l.id === id);
  if (!lesson) return;

  const locked = lesson.unlockAfter && !state.completed.includes(lesson.unlockAfter);
  if (locked) return;

  currentLesson = lesson;
  quizAnswered = false;
  lessonData = null;

  $("modalEyebrow").textContent = `// MODULE — ${lesson.icon} ${lesson.title.toUpperCase()}`;
  $("modalTitle").textContent = lesson.title;
  $("lessonModal").style.display = "flex";
  document.body.style.overflow = "hidden";

  $("modalBody").innerHTML = `
    <div class="skeleton" style="width:100%; height:14px; margin-bottom:10px;"></div>
    <div class="skeleton" style="width:88%; height:14px; margin-bottom:10px;"></div>
    <div class="skeleton" style="width:94%; height:14px; margin-bottom:10px;"></div>
    <div class="skeleton" style="width:72%; height:14px; margin-bottom:30px;"></div>
    <div class="skeleton" style="width:60%; height:14px; margin-bottom:10px;"></div>
    <div class="skeleton" style="width:80%; height:14px;"></div>
  `;

  try {
    lessonData = await fetchLessonContent(lesson);
    renderModal(lesson, lessonData);
  } catch (err) {
    $("modalBody").innerHTML = `<p style="color:var(--red);">Failed to load lesson: ${err.message}</p><p style="color:var(--muted); font-size:0.85rem; margin-top:8px;">Check your Gemini API key.</p>`;
  }
};

function renderModal(lesson, data) {
  const alreadyDone = state.completed.includes(lesson.id);

  const keyPoints = (data.keyPoints || []).map(pt => `
    <div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:12px;">
      <span style="color:var(--primary); font-weight:700; flex-shrink:0;">→</span>
      <span>${pt}</span>
    </div>
  `).join("");

  $("modalBody").innerHTML = `
    <div class="modal-content">
      <div style="margin-bottom:24px;">
        <p style="font-family:var(--font-mono); font-size:0.72px; color:var(--primary); letter-spacing:1.5px; margin-bottom:12px; font-size:0.72rem;">// KEY CONCEPTS</p>
        ${keyPoints}
      </div>

      <div style="background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:8px; padding:18px; margin-bottom:20px;">
        <p style="font-family:var(--font-mono); font-size:0.72rem; color:var(--accent); letter-spacing:1.5px; margin-bottom:10px;">// REAL WORLD EXAMPLE</p>
        <p style="color:var(--muted); font-size:0.92rem; line-height:1.7;">${data.realWorldExample || ""}</p>
      </div>

      <div style="background:rgba(248,113,113,0.06); border:1px solid rgba(248,113,113,0.2); border-radius:8px; padding:18px; margin-bottom:20px;">
        <p style="font-family:var(--font-mono); font-size:0.72rem; color:var(--red); letter-spacing:1.5px; margin-bottom:10px;">// COMMON MISTAKE</p>
        <p style="color:var(--muted); font-size:0.92rem; line-height:1.7;">${data.commonMistake || ""}</p>
      </div>

      <div style="background:rgba(79,142,255,0.08); border:1px solid rgba(79,142,255,0.25); border-radius:8px; padding:18px; margin-bottom:28px;">
        <p style="font-family:var(--font-mono); font-size:0.72rem; color:var(--primary); letter-spacing:1.5px; margin-bottom:10px;">// PRO TIP</p>
        <p style="color:var(--text); font-size:0.95rem; line-height:1.7; font-style:italic;">${data.proTip || ""}</p>
      </div>
    </div>

    <!-- QUIZ -->
    <div class="quiz-section" id="quizSection">
      <div class="quiz-q">🧠 Quick Check: ${data.quiz?.question || ""}</div>
      <div class="quiz-options" id="quizOptions">
        ${(data.quiz?.options || []).map((opt, i) => `
          <button class="quiz-opt" onclick="answerQuiz(${i})">${opt}</button>
        `).join("")}
      </div>
      <div id="quizFeedback"></div>
    </div>

    <button class="modal-next-btn" id="modalNextBtn" style="display:none;" onclick="completeLesson()">
      ${alreadyDone ? "✓ Already Completed — Close" : `Claim +${lesson.xp} XP & Continue →`}
    </button>

    ${alreadyDone ? `<p style="text-align:center; font-family:var(--font-mono); font-size:0.78rem; color:var(--green); margin-top:16px;">✓ You've already completed this module</p>` : ""}
  `;
}

window.answerQuiz = function(index) {
  if (quizAnswered || !lessonData?.quiz) return;
  quizAnswered = true;

  const correct = lessonData.quiz.correctIndex;
  const opts = document.querySelectorAll(".quiz-opt");
  opts.forEach((opt, i) => {
    opt.disabled = true;
    if (i === correct) opt.classList.add("correct");
    else if (i === index) opt.classList.add("wrong");
  });

  const isCorrect = index === correct;
  $("quizFeedback").innerHTML = `
    <div class="quiz-feedback ${isCorrect ? "feedback-correct" : "feedback-wrong"}">
      ${isCorrect ? "🎉 Correct! " : "❌ Not quite. "}${lessonData.quiz.explanation || ""}
    </div>
  `;

  $("modalNextBtn").style.display = "block";
};

window.completeLesson = function() {
  if (!currentLesson) return;
  const alreadyDone = state.completed.includes(currentLesson.id);
  if (!alreadyDone) {
    state.xp += currentLesson.xp;
    state.completed.push(currentLesson.id);
    saveState(state);
  }
  closeModal();
  updateUI();
  renderLessons();

  if (!alreadyDone) {
    showToast(`+${currentLesson.xp} XP earned! 🎉`);
  }
};

function closeModal() {
  $("lessonModal").style.display = "none";
  document.body.style.overflow = "";
  currentLesson = null;
  lessonData = null;
  quizAnswered = false;
}

$("modalClose")?.addEventListener("click", closeModal);
$("lessonModal")?.addEventListener("click", e => {
  if (e.target === $("lessonModal")) closeModal();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});

// ─── Toast notification ──────────────────────────────────────────
function showToast(msg) {
  const toast = document.createElement("div");
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: "fixed", bottom: "32px", left: "50%", transform: "translateX(-50%) translateY(20px)",
    background: "var(--primary)", color: "#fff",
    fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "0.95rem",
    padding: "14px 28px", borderRadius: "99px",
    boxShadow: "0 8px 32px rgba(79,142,255,0.4)",
    zIndex: "999", opacity: "0",
    transition: "all 0.3s ease",
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(20px)";
    setTimeout(() => toast.remove(), 400);
  }, 2800);
}

// ─── Boot ────────────────────────────────────────────────────────
updateUI();
renderLessons();
