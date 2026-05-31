import os

file_path = r"C:\Users\sarah\Documents\Codex\2026-05-02\Startup_sandbox\src\ideaAnalysis.mjs"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """  return signals.some((signal) => lesson.toLowerCase().includes(signal))
    ? lesson
    : fallback;
}
    if (hasAi) queries.add(`AI ${sector} startup company`);"""

replacement = """  return signals.some((signal) => lesson.toLowerCase().includes(signal))
    ? lesson
    : fallback;
}

function buildDomainExperiments(idea, sector, variants) {
  const useCase = ideaUseCase(idea, sector);
  if (sector === "pet care") {
    return [
      `The Customer Interrogation: Interview 10 pet owners. Force them to rank their exact pain, current workaround, and budget before you show anything.`,
      `The Wizard of Oz: Manually triage 3 paying customers behind the scenes with a real vet before you build any automation.`,
      `The Harsh A/B Test: Pit broad AI positioning against "${variants[0]}". Measure qualified booked calls, not just email signups.`
    ];
  }
  return [
    `The Customer Interrogation: Interview 10 ${useCase.buyer}s. Force them to rank their exact pain, current workaround, and budget before you even show the product.`,
    `The Wizard of Oz: Manually deliver ${useCase.wedge} for 3 paying customers behind the scenes before you build any automation.`,
    `The Harsh A/B Test: Pit broad AI positioning against "${variants[0]}". Don't measure email signups—measure qualified booked calls.`
  ];
}

function buildMistakePredictor(idea, sector, riskList) {
  const useCase = ideaUseCase(idea, sector);
  if (sector === "pet care") {
    return `Your fatal mistake will be overclaiming what AI can safely do. Keep the product strictly in triage and routing until you have vet-reviewed outcome data. Dataset red flag: ${riskList}.`;
  }
  return `Your fatal mistake will be staying too broad. A generic ${sector} wrapper is trivial to ignore and trivial to copy. Narrow your focus to ${useCase.wedge}, prove it works, and watch out for this dataset red flag: ${riskList}.`;
}

function buildCopycatMoat(idea, sector, successList, failureList, referenceList, publicList, publicContext = []) {
  const useCase = ideaUseCase(idea, sector);
  if (sector === "pet care") {
    const liveNames = publicContext.map((x) => x.title).filter(Boolean).slice(0, 3).join(", ");
    const contextMeaning = liveNames
      ? `${liveNames} show that pet owners already use digital services around pet care, but they do not prove demand for AI diagnosis.`
      : "The dataset/live search did not find a close enough comparable, so treat this as an unvalidated wedge rather than a proven category.";
    return `<strong>Dataset matches:</strong> ${successList}<br/><br/><strong>Failure matches:</strong> ${failureList}<br/><br/><strong>Live context:</strong> ${publicList}<br/><br/><strong>What it means:</strong> ${contextMeaning} Your real moat is ${useCase.moat}. Do not compete as a generic pet chatbot; compete as a trusted triage layer that helps owners decide when to contact a vet.`;
  }
  return `<strong>Semantic success matches:</strong> ${successList}<br/><br/><strong>Semantic failure matches:</strong> ${failureList}<br/><br/><strong>YC/AI references:</strong> ${referenceList}<br/><br/><strong>Public context:</strong> ${publicList}<br/><br/><strong>Moat requirement:</strong> win through ${useCase.moat}.`;
}

function extractIdeaQueries(idea, features = {}) {
  const words = splitKeywords(idea).slice(0, 8);
  const sector = safeText(features.sector_group || "").replace(/_/g, " ");
  const hasAi = containsAny(norm(idea), ["ai", "artificial intelligence", "machine learning", "llm", "chatbot"]);
  const queries = new Set();
  if (containsAny(norm(idea), ["pet", "dog", "cat", "veterinary", "vet"])) {
    queries.add(hasAi ? "AI pet care startup" : "pet care startup");
    queries.add("pet technology startup company");
    queries.add("veterinary technology startup");
  } else if (sector && sector !== "information") {
    if (hasAi) queries.add(`AI ${sector} startup company`);"""

new_content = content.replace(target, replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)

print("done")
