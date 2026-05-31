import os

css_path = r"C:\Users\sarah\Documents\Codex\2026-05-02\Startup_sandbox\public\styles.css"

with open(css_path, "a", encoding="utf-8") as f:
    f.write("""

/* =========================================
   SIMULATION UI OVERRIDES (Vibe Match)
   ========================================= */
.sim-btn {
  background: linear-gradient(135deg, #111 0%, #222 100%) !important;
  border: 1px solid rgba(255,255,255,0.15) !important;
  color: #fff !important;
  box-shadow: 0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1) !important;
  transition: transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1),
              box-shadow 250ms ease, border-color 250ms ease !important;
  position: relative;
  overflow: hidden;
}

.sim-btn::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
  transform: translateX(-100%);
  transition: transform 0.5s ease;
}

.sim-btn:hover {
  transform: translateY(-1px) scale(1.015) !important;
  border-color: rgba(255,255,255,0.3) !important;
  box-shadow: 0 8px 24px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.2) !important;
  filter: none !important;
}

.sim-btn:hover::before {
  transform: translateX(100%);
}

.sim-btn:active {
  transform: scale(0.97) !important;
}

.sim-input, .sim-select, .sim-textarea {
  background: rgba(0,0,0,0.4) !important;
  border: 1px solid var(--border) !important;
  color: #fff !important;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s !important;
}

.sim-input:focus, .sim-select:focus, .sim-textarea:focus {
  border-color: rgba(139, 92, 246, 0.6) !important;
  background: rgba(10, 10, 10, 0.6) !important;
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.15) !important;
}

.sim-card {
  background: var(--bg-card) !important;
  border: 1px solid var(--border) !important;
  box-shadow: var(--shadow-card) !important;
}
""")

print("done")
