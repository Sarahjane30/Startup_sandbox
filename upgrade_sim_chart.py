import os

file_path = r"C:\Users\sarah\Documents\Codex\2026-05-02\Startup_sandbox\public\Simulation.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """  const createChart = (
    instance,
    canvasId,
    label,
    values,
    color
  ) => {
    const canvas = $(canvasId);

    if (!canvas) return null;

    if (instance) {
      instance.destroy();
    }

    return new Chart(canvas.getContext("2d"), {"""

replacement = """  const createChart = (
    instance,
    canvasId,
    label,
    values,
    color
  ) => {
    const canvas = $(canvasId);
    if (!canvas) return null;
    if (instance) instance.destroy();
    
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, color.replace("1)", "0.2)"));
    gradient.addColorStop(1, color.replace("1)", "0)"));

    return new Chart(ctx, {"""

target2 = """            borderColor: color,
            backgroundColor: color,
            fill: false,
            tension: 0.35,
            pointRadius: 3,"""

replacement2 = """            borderColor: color,
            backgroundColor: gradient,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: color,
            pointBorderColor: "#fff",
            borderWidth: 3,"""

target3 = """        animation: {
          duration: 450,
        },"""

replacement3 = """        animation: {
          duration: 1000,
          easing: "easeOutQuart"
        },"""

new_content = content.replace(target, replacement).replace(target2, replacement2).replace(target3, replacement3)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)

print("done")
