import os
import re

public_dir = r"C:\Users\sarah\Documents\Codex\2026-05-02\Startup_sandbox\public"

# 1. Update HTML Files
html_files = ["index.html", "Simulation.html", "Learning.html"]

old_fonts = '<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">'
new_fonts = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">'

cursor_div = '<div class="cursor-glow" id="cursorGlow"></div>'

for hf in html_files:
    p = os.path.join(public_dir, hf)
    if not os.path.exists(p): continue
    with open(p, "r", encoding="utf-8") as f:
        content = f.read()
    
    # replace fonts
    content = content.replace(old_fonts, new_fonts)
    
    # inject cursor glow if not there
    if 'id="cursorGlow"' not in content:
        content = content.replace('<body>', f'<body>\n  {cursor_div}')
        
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)

# 2. Append CSS Overrides
css_path = os.path.join(public_dir, "styles.css")
with open(css_path, "a", encoding="utf-8") as f:
    f.write("""

/* =========================================
   UI UPGRADE OVERRIDES (Linear/Vercel Vibe)
   ========================================= */
:root {
  --bg: #000000;
  --bg-card: rgba(10, 10, 10, 0.45);
  --bg-card-hover: rgba(20, 20, 20, 0.65);
  --border: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.2);
  --primary: #ffffff;
  --primary-glow: rgba(255, 255, 255, 0.15);
  --accent: #8b5cf6;
  --accent-glow: rgba(139, 92, 246, 0.25);
  
  --font-display: 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  --shadow-card: 0 4px 24px -4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
}

body {
  letter-spacing: -0.01em;
}

/* Ambient Cursor Glow */
.cursor-glow {
  position: fixed;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 60%);
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
  z-index: 0;
  mix-blend-mode: screen;
  transition: opacity 0.3s ease;
  opacity: 0;
}
body:hover .cursor-glow { opacity: 1; }

/* Enhanced Cards */
.card {
  box-shadow: var(--shadow-card);
  transition: transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1), 
              border-color 300ms ease, 
              box-shadow 300ms ease !important;
}
.card:hover {
  transform: translateY(-2px) scale(1.005) !important;
  box-shadow: 0 12px 32px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1) !important;
}

/* Magnetic Buttons */
.s-btn, .idea-submit-btn, .nav-cta {
  background: linear-gradient(135deg, #111 0%, #222 100%) !important;
  border: 1px solid rgba(255,255,255,0.15) !important;
  color: #fff !important;
  box-shadow: 0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1) !important;
  transition: transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1),
              box-shadow 250ms ease, border-color 250ms ease !important;
  position: relative;
  overflow: hidden;
}
.s-btn::before, .idea-submit-btn::before, .nav-cta::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
  transform: translateX(-100%);
  transition: transform 0.5s ease;
}
.s-btn:hover, .idea-submit-btn:hover, .nav-cta:hover {
  transform: translateY(-1px) scale(1.015) !important;
  border-color: rgba(255,255,255,0.3) !important;
  box-shadow: 0 8px 24px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.2) !important;
}
.s-btn:hover::before, .idea-submit-btn:hover::before, .nav-cta:hover::before {
  transform: translateX(100%);
}
.s-btn:active, .idea-submit-btn:active, .nav-cta:active {
  transform: scale(0.97) !important;
}

/* Gradients */
.grad {
  background: linear-gradient(135deg, #fff 0%, #a1a1aa 100%) !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
}

/* Staggered Animations */
@keyframes fluidFadeIn {
  0% { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
}
.stagger-anim {
  animation: fluidFadeIn 350ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  opacity: 0;
}
""")

# 3. Modify JS for Cursor and Chart Gradients
# We will do app.js first
app_js_path = os.path.join(public_dir, "app.js")
with open(app_js_path, "r", encoding="utf-8") as f:
    app_js = f.read()

cursor_code = """
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
"""

if "cursorGlow" not in app_js:
    app_js += cursor_code

# Inject staggered trigger into app.js
if "triggerStaggerAnimations('dash-grid')" not in app_js:
    app_js = app_js.replace("renderDashboard(data);", "renderDashboard(data);\n      triggerStaggerAnimations('analysisResults');")
    app_js = app_js.replace("renderIdea(data);", "renderIdea(data);\n      triggerStaggerAnimations('ideaResults');")

with open(app_js_path, "w", encoding="utf-8") as f:
    f.write(app_js)

print("done")
