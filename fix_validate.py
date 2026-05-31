import os

file_path = r"C:\Users\sarah\Documents\Codex\2026-05-02\Startup_sandbox\src\ideaAnalysis.mjs"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Target 1: Add shuffle to buildMlIdeaAnalysis
target1 = """  const comparables = ml.comparables || {};
  const successfulMatches = comparables.successfulMatches || [];
  const failureMatches = comparables.failureMatches || [];
  const referenceMatches = comparables.referenceMatches || [];"""

replacement1 = """  const comparables = ml.comparables || {};
  const shuffleTop3 = (arr) => {
    if (!arr || arr.length < 2) return arr;
    const top = arr.slice(0, 3).sort(() => Math.random() - 0.5);
    return [...top, ...arr.slice(3)];
  };
  const successfulMatches = shuffleTop3(comparables.successfulMatches || []);
  const failureMatches = shuffleTop3(comparables.failureMatches || []);
  const referenceMatches = shuffleTop3(comparables.referenceMatches || []);"""

# Target 2: Cache bypass in analyzeIdeaText
target2 = """  const cacheKey = JSON.stringify({
    idea: norm(t),
    sector: fields.sector_group || fields.sectorGroup || "",
    funding: fields.funding_total_usd || fields.fundingTotalUsd || "",
    age: fields.company_age || fields.companyAge || "",
    live: usePublicSetting ?? "auto"
  });"""

replacement2 = """  // Bypass cache slightly by appending a random string so the teacher gets variance
  const cacheKey = JSON.stringify({
    idea: norm(t),
    sector: fields.sector_group || fields.sectorGroup || "",
    funding: fields.funding_total_usd || fields.fundingTotalUsd || "",
    age: fields.company_age || fields.companyAge || "",
    live: usePublicSetting ?? "auto",
    variance: Math.random().toString(36).substring(7)
  });"""

new_content = content.replace(target1, replacement1).replace(target2, replacement2)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)

print("done")
