import os

file_path = r"C:\Users\sarah\Documents\Codex\2026-05-02\Startup_sandbox\src\ideaAnalysis.mjs"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target1 = """  const decisionReason = `${decision}: this scores ${score}/100 because the idea has a plausible ${sector} wedge around ${sectorUseCase.wedge}. Benchmark against ${upsideReference}. The biggest risk is ${sectorUseCase.risk}; the dataset also flags ${topRisk?.risk || "unclear differentiation"} as a common failure pattern.`;"""
replacement1 = """  const decisionReason = `Harsh Truth: ${decision}. This scores ${score}/100. You have a plausible wedge in ${sectorUseCase.wedge}, but don't kid yourself—you're benchmarking against ${upsideReference}. Your absolute biggest existential risk is ${sectorUseCase.risk}. The dataset screams that ${topRisk?.risk || "unclear differentiation"} kills companies like this.`;"""

target2 = """  const refinedIdeas = [
    `${variants[0]} Use ${topReference?.name || topSuccess?.name || "the closest dataset reference"} as the benchmark, not a generic AI app.`,
    `${variants[3]} Package it around a paid outcome and compare conversion against the nearest failure: ${topFailure?.name || "the closest failed startup"}.`,
    `${variants[4]} The dataset-backed moat must be stronger than ${topRisk?.risk || "the top retrieved risk"}.`
  ];"""
replacement2 = """  const refinedIdeas = [
    `${variants[0]} Benchmark purely against ${topReference?.name || topSuccess?.name || "the closest reference"}—stop comparing yourself to generic AI wrappers.`,
    `${variants[3]} Package this entirely around a paid outcome. If your conversion is worse than the failed ${topFailure?.name || "comparable startup"}, you are dead.`,
    `${variants[4]} If your data moat isn't strong enough to protect against ${topRisk?.risk || "the top risk"}, don't even start.`
  ];"""

target3 = """    crazyPivot: topFailure?.takeaway
      ? `Invert the ${topFailure.name} failure: ${topFailure.whyFailed || topFailure.takeaway}. Build the smallest paid product that proves the opposite.`
      : `Turn the idea into ${sectorUseCase.wedge}, sold through ${sectorUseCase.channel}.`,"""
replacement3 = """    crazyPivot: topFailure?.takeaway
      ? `The Anti-Failure Pivot: Invert the ${topFailure.name} failure (${topFailure.whyFailed || topFailure.takeaway}). Build the absolute smallest paid product that proves the opposite is true.`
      : `The Brutal Pivot: Turn the idea into exactly ${sectorUseCase.wedge}, and force sales through ${sectorUseCase.channel}.`,"""

target4 = """    hiddenOpportunity: topSuccess?.name
      ? `Use ${topSuccess.name} as the success reference, but choose a narrower customer and a more painful job-to-be-done so you are not competing as a generic ${sector} product.`
      : `The strongest opportunity is ${sectorUseCase.wedge}, because it sits next to an urgent paid behavior instead of a casual wellness feature.`,"""
replacement4 = """    hiddenOpportunity: topSuccess?.name
      ? `The Stealth Wedge: Use ${topSuccess.name} as the benchmark, but pick a painfully narrow customer and a desperate job-to-be-done. Do not compete as a generic ${sector} product.`
      : `The Bleeding Neck: The strongest opportunity is ${sectorUseCase.wedge} because it sits next to an urgent, high-budget pain instead of a casual nice-to-have.`,"""

new_content = content.replace(target1, replacement1).replace(target2, replacement2).replace(target3, replacement3).replace(target4, replacement4)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)

print("done")
