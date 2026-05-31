import os

css_path = r"C:\Users\sarah\Documents\Codex\2026-05-02\Startup_sandbox\public\styles.css"

with open(css_path, "a", encoding="utf-8") as f:
    f.write("""
/* =========================================
   VERDICT HEADER LAYOUT FIX
   ========================================= */
.idea-verdict-header {
  display: grid !important;
  grid-template-columns: minmax(auto, 300px) 1fr !important;
  gap: 40px !important;
  align-items: stretch !important;
  border-bottom: none !important;
  padding-bottom: 32px !important;
}

.verdict-score-wrap {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: center !important;
  background: var(--bg-card) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius) !important;
  padding: 32px !important;
  box-shadow: var(--shadow-card) !important;
  width: 100% !important;
  height: 100% !important;
}

.verdict-score {
  line-height: 0.9 !important;
  text-align: center !important;
}

.verdict-slash {
  margin-top: 4px !important;
  font-size: 1.2rem !important;
}

.verdict-text {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
}

@media (max-width: 768px) {
  .idea-verdict-header {
    grid-template-columns: 1fr !important;
  }
}
""")

print("done")
