import os

css_path = r"C:\Users\sarah\Documents\Codex\2026-05-02\Startup_sandbox\public\styles.css"

with open(css_path, "a", encoding="utf-8") as f:
    f.write("""

/* =========================================
   LEARNING UI OVERRIDES (Vibe Match)
   ========================================= */
.lesson-card {
  background: var(--bg-card) !important;
  border-color: var(--border) !important;
}

.lesson-card:hover {
  background: rgba(20, 20, 20, 0.8) !important;
  border-color: rgba(255, 255, 255, 0.15) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
}

.lesson-card.locked:hover {
  background: var(--bg-card) !important;
  border-color: var(--border) !important;
}

.modal {
  background: #0a0a0a !important;
  border-color: var(--border) !important;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
}

.modal-overlay {
  background: rgba(0, 0, 0, 0.85) !important;
}

.loading-panel, .error-text {
  background: var(--bg-card) !important;
}

.modal-next-btn {
  background: linear-gradient(135deg, #111 0%, #222 100%) !important;
  border: 1px solid rgba(255,255,255,0.15) !important;
  color: #fff !important;
  box-shadow: 0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1) !important;
  transition: transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1),
              box-shadow 250ms ease, border-color 250ms ease !important;
}

.modal-next-btn:hover {
  transform: translateY(-1px) scale(1.015) !important;
  border-color: rgba(255,255,255,0.3) !important;
  box-shadow: 0 8px 24px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.2) !important;
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%) !important;
}

.modal-next-btn:active {
  transform: scale(0.97) !important;
}
""")

print("done")
