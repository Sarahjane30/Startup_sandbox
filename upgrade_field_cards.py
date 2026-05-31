import os

css_path = r"C:\Users\sarah\Documents\Codex\2026-05-02\Startup_sandbox\public\styles.css"

with open(css_path, "a", encoding="utf-8") as f:
    f.write("""

/* =========================================
   FIELD CARD OVERRIDES (Vibe Match)
   ========================================= */
.field-card {
  background: rgba(10, 10, 10, 0.4) !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
}

.field-card:focus-within {
  border-color: rgba(139, 92, 246, 0.4) !important;
  background: rgba(15, 15, 15, 0.6) !important;
  box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.15) !important;
}

.field-card span {
  color: #a1a1aa !important;
}

.field-card input,
.field-card select {
  background: rgba(0, 0, 0, 0.5) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: #fff !important;
}

.field-card input:focus,
.field-card select:focus {
  border-color: rgba(255, 255, 255, 0.15) !important;
}
""")

print("done")
