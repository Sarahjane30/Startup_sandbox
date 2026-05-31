import os

public_dir = r"C:\Users\sarah\Documents\Codex\2026-05-02\Startup_sandbox\public"
css_path = os.path.join(public_dir, "styles.css")

with open(css_path, "a", encoding="utf-8") as f:
    f.write("""

/* =========================================
   LAUNCH RADAR OVERRIDES (Vibe Match)
   ========================================= */
.launch-card, .launch-empty {
  background: var(--bg-card) !important;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border) !important;
}

.launch-card:hover {
  transform: translateY(-2px) scale(1.005) !important;
  border-color: var(--border-hover) !important;
  box-shadow: 0 12px 32px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1) !important;
}

.launch-icon {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(79, 142, 255, 0.15)) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: #fff !important;
}

.launch-title {
  font-family: var(--font-display) !important;
  color: #fff !important;
}

.launch-title:hover {
  color: #8b5cf6 !important;
}

.launch-rank {
  color: #8b5cf6 !important;
}

.launch-tags span {
  background: rgba(255,255,255,0.03) !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  color: #a1a1aa !important;
}

.launches-meta {
  color: #a1a1aa !important;
}

.section-eyebrow, .hero-eyebrow {
  color: #a1a1aa !important;
}

.section-h2, .hero-h1 {
  font-family: var(--font-display) !important;
}
""")

print("done")
