import { ANALYSIS_CACHE_TTL_MS, LIVE_CACHE_TTL_MS, STRICT_LIVE_DATA } from "./config.mjs";
import { cachedAsync, norm, safeText, splitKeywords, topKeywords } from "./utils.mjs";
import { getDatasetMatch, getWikidata, getWikidataFromWikipediaTitle, getWikipediaSummary, getYahooByCompany, getYahooFinance, loadOpenDatasets, scoreAnalysis, wikiCache, wikidataCache, yahooCache } from "./liveData.mjs";

const analysisCache = new Map();
function escapeHtml(value) {
  return safeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sentenceFragments(text, limit = 3) {
  return safeText(text)
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.replace(/[.!?]+$/, "").trim())
    .filter((s) => s.length > 24)
    .slice(0, limit);
}

function formatBullets(items) {
  const unique = [];
  const seen = new Set();
  for (const item of items.map(safeText).filter(Boolean)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return `<ul style="padding-left:16px; margin:0;">${unique.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function compactMarketValue(value) {
  const amount = Number(value || 0);
  if (!amount) return "";
  if (amount >= 1_000_000_000_000) return `$${(amount / 1_000_000_000_000).toFixed(1)}T`;
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function describeCompanyContext(company, wiki, wd, ds) {
  const desc = wiki?.description || wd?.description || ds?.sector || "a defined market";
  const sector = ds?.sector || desc;
  const firstSentence = sentenceFragments(wiki?.extract, 1)[0] || desc;
  return {
    desc,
    sector,
    firstSentence,
    companyName: ds?.companyName || wiki?.title || company
  };
}

function cleanCompanySentence(sentence, companyName) {
  const escapedName = safeText(companyName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safeText(sentence)
    .replace(new RegExp(`^${escapedName}\\s+`, "i"), "")
    .replace(/^(is|are|was|were)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function strategyKeywords(company, score) {
  const companyParts = splitKeywords(company);
  const generic = new Set([
    ...companyParts,
    "american", "irish-american", "multinational", "company", "companies", "business",
    "headquartered", "california", "united", "states", "services", "service", "based",
    "financial", "technology", "software", "swedish", "provider", "million"
  ]);
  return (score?.keywords || []).filter((word) => !generic.has(String(word).toLowerCase()));
}

function concisePhrase(phrase, maxLength = 86) {
  const text = safeText(phrase)
    .replace(/\s+and\s+application programming interfaces/i, " and APIs")
    .replace(/application programming interfaces/ig, "APIs")
    .replace(/\bsoftware as a service\b/ig, "SaaS")
    .replace(/\s+founded\s+.+$/i, "")
    .replace(/\s+dual-headquartered\s+.+$/i, "")
    .replace(/\s+/g, " ");
  if (text.length <= maxLength) return text;
  const shortened = text
    .replace(/\s+for\s+.+$/i, "")
    .replace(/\s+with\s+.+$/i, "")
    .replace(/\s+in\s+.+$/i, "");
  if (shortened.length > 24 && shortened.length <= maxLength) return shortened;
  return `${text.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}...`;
}

function marketPhrases(company, wiki, wd, ds, score) {
  const context = describeCompanyContext(company, wiki, wd, ds);
  const text = `${wiki?.extract || ""} ${wiki?.description || ""} ${wd?.description || ""}`;
  const phrases = [];
  const patterns = [
    /known for ([^.]+)/i,
    /primarily offers ([^.]+)/i,
    /offers ([^.]+)/i,
    /provides ([^.]+)/i,
    /operates ([^.]+)/i,
    /platform for ([^.]+)/i,
    /specializes in ([^.]+)/i,
    /largest providers? of ([^,.;]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) phrases.push(cleanCompanySentence(match[1], context.companyName));
  }

  if (context.desc) phrases.push(context.desc);
  const cleanedFirst = cleanCompanySentence(context.firstSentence, context.companyName);
  if (cleanedFirst && !/headquartered|founded by|founded in/i.test(cleanedFirst)) phrases.push(cleanedFirst);
  phrases.push(...strategyKeywords(company, score).slice(0, 4));

  const seen = new Set();
  return phrases
    .map((phrase) => safeText(phrase).replace(/\s+and\s+$/, "").replace(/\s*,\s*$/, ""))
    .map((phrase) => concisePhrase(phrase))
    .filter((phrase) => phrase.length > 3)
    .filter((phrase) => {
      const key = phrase.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function publicCompanySignal(wiki, ds, yf) {
  const text = `${wiki?.extract || ""} ${wiki?.description || ""} ${ds?.stage || ""}`.toLowerCase();
  return yf?.status === "ok"
    || text.includes("listed on")
    || text.includes("public company")
    || text.includes("stock exchange")
    || text.includes("nasdaq")
    || text.includes("nyse")
    || text.includes("new york stock exchange");
}

function tractionSignal(wiki) {
  const text = safeText(wiki?.extract || "");
  const patterns = [
    /over\s+[0-9][^.,;]*(?:users|customers|subscribers|monthly active users|paying subscribers)/i,
    /[0-9][0-9,.\s]*(?:million|billion)\s+(?:users|customers|subscribers|monthly active users|paying subscribers)/i,
    /[0-9][0-9,.\s]*(?:stores|locations|employees|merchants|developers)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return concisePhrase(match[0], 96);
  }
  return "";
}

function buildSwot(company, wiki, wd, ds, yf, score) {
  const context = describeCompanyContext(company, wiki, wd, ds);
  const phrases = marketPhrases(company, wiki, wd, ds, score);
  const keywords = strategyKeywords(company, score);
  const primaryOffer = phrases[0] || context.desc;
  const secondaryOffer = phrases.find((phrase) => phrase !== primaryOffer && phrase.length < 90) || keywords[0] || context.sector;
  const marketCap = compactMarketValue(yf?.marketCap);
  const priceMove = Number(yf?.regularMarketChangePercent);
  const stage = ds?.stage ? `${ds.stage} stage` : "";
  const funding = compactMarketValue(ds?.totalFundingUsd);
  const founded = ds?.foundedYear ? `founded in ${ds.foundedYear}` : "";
  const employeeSignal = ds?.employees ? `${Number(ds.employees).toLocaleString("en-US")} reported employees` : "";
  const traction = tractionSignal(wiki);
  const publicValidation = yf?.status === "ok"
    ? `${yf.ticker} public-market signal${marketCap ? ` with ${marketCap} market cap` : ""}`
    : "";
  const categoryText = `${context.desc} ${context.firstSentence}`.toLowerCase();
  const isPublic = publicCompanySignal(wiki, ds, yf);
  const isPrivate = !isPublic;

  const strengths = [
    `${context.companyName} is anchored in ${primaryOffer}`,
    secondaryOffer && secondaryOffer !== primaryOffer ? `Public sources also point to ${secondaryOffer}` : "",
    traction ? `Visible scale signal: ${traction}` : "",
    publicValidation || funding ? `${publicValidation || `${funding} disclosed funding`} gives outside validation beyond the product description` : "",
    employeeSignal || stage || founded
  ];

  const weaknesses = [
    isPrivate ? "Limited public operating data makes traction, retention, and margins hard to verify" : "",
    !ds?.status || ds.status !== "ok" ? "Local startup datasets do not add company-specific funding, stage, or headcount context" : "",
    keywords.length < 3 ? `The public description is thin, so ${company} needs sharper proof points than category claims` : "",
    categoryText.includes("streaming") ? "Streaming economics can pressure margins through royalties, bandwidth, and content acquisition costs" : "",
    categoryText.includes("ai") || categoryText.includes("artificial intelligence") ? "AI positioning can blur quickly unless the product shows proprietary workflow or data advantages" : "",
    categoryText.includes("payment") || categoryText.includes("financial") || categoryText.includes("fintech") ? "Financial infrastructure buyers will expect hard proof on reliability, compliance, and integration cost" : "",
    isPublic && Number.isFinite(priceMove) ? `Public sentiment is visible day to day; latest quote move is ${priceMove.toFixed(2)}%` : ""
  ];

  const opportunities = [
    `Package pricing, onboarding, and integrations around ${primaryOffer}`,
    keywords[0] ? `Use ${keywords[0].toUpperCase() === "SAAS" ? "SaaS" : keywords[0]} as a focused wedge for campaigns, partnerships, or product packaging` : "",
    secondaryOffer ? `Turn ${secondaryOffer} into a sharper buyer-facing proof point` : "",
    isPublic ? "Use public-company visibility to cross-sell into adjacent customer segments and geographies" : "Publish fresher traction proof so buyers and investors can separate momentum from category noise"
  ];

  const threats = [
    categoryText.includes("streaming") ? "Large platforms can bundle discovery, distribution, and payments into the same user relationship" : "",
    categoryText.includes("audio") || categoryText.includes("music") ? "Label, creator, and platform power can squeeze take rate and differentiation" : "",
    categoryText.includes("ai") || categoryText.includes("artificial intelligence") ? "Model/platform shifts can commoditize features that are not tied to proprietary data or distribution" : "",
    categoryText.includes("payment") || categoryText.includes("financial") || categoryText.includes("fintech") ? "Banks, processors, and platform incumbents can compete on trust, distribution, and bundled economics" : "",
    `Comparable companies can copy broad ${context.desc} messaging, so differentiation has to be visible in customer outcomes`,
    isPrivate ? "Because current private-company data is sparse, a competitor with better disclosed traction may look safer to buyers" : "Public-market expectations can punish slower growth or margin compression quickly"
  ];

  return {
    strengths: formatBullets(strengths),
    weaknesses: formatBullets(weaknesses),
    opportunities: formatBullets(opportunities),
    threats: formatBullets(threats)
  };
}

function buildPerspectives(company, wiki, ds, yf, score) {
  const desc = wiki.description || ds?.sector || "a defined niche";
  const sentences = sentenceFragments(wiki.extract, 3);
  const facts = sentences.map(s => `<li>${escapeHtml(s)}</li>`).join("");
  const swot = buildSwot(company, wiki, null, ds, yf, score);
  
  return {
    businessModel: `<strong>Primary Operation:</strong> ${escapeHtml(desc)}<br/><br/><strong>Core Facts:</strong><ul style="margin-top:8px; padding-left:16px;">${facts || "<li>Business model signals extracted from public data</li>"}</ul>`,
    marketingIntelligence: `<strong>Market Position:</strong> Based on public signals, ${escapeHtml(company)} targets ${escapeHtml(desc)}.<br/><br/><strong>Key Focus Areas:</strong><ul style="margin-top:8px; padding-left:16px;"><li>${escapeHtml(score.keywords[0] || "Customer acquisition")}</li><li>${escapeHtml(score.keywords[1] || "Distribution")}</li><li>${escapeHtml(score.keywords[2] || "Growth")}</li></ul>`,
    competitiveMoat: `<strong>Defensibility Signals:</strong><br/><br/>${escapeHtml(sentences[0] || `Moat levers likely include execution speed and distribution.`)}<br/><br/><em>Public Market Validation:</em> ${yf?.status === "ok" ? `${escapeHtml(yf.ticker)} ${compactMarketValue(yf.marketCap) ? `at ${escapeHtml(compactMarketValue(yf.marketCap))} market cap` : "has a live public quote"}` : "Private / Unknown"}`,
    swot,
    businessMetrics: score,
    hiddenInsight: `Based on the data depth (${score.dataDepth}%), ${escapeHtml(company)} operates in ${escapeHtml(desc)} with the strongest visible signals around ${escapeHtml((score.keywords || []).slice(0, 3).join(", ") || "category focus")}. The moat depends on proving those signals with fresher traction data, not just public profile text.`
  };
}

function clampScore(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function computeTermScores(company, wiki, wd, ds, yf, score) {
  const evidenceCount = [wiki?.extract, wiki?.description, wiki?.pageUrl, wd?.description, ds?.sector, ds?.stage, ds?.foundedYear, ds?.employees, ds?.totalFundingUsd, yf?.marketCap].filter(Boolean).length;
  const descText = `${wiki?.description || ""} ${wiki?.extract || ""}`.toLowerCase();
  const reputationSignals = ["multinational", "global", "largest", "leading", "public company", "fortune"];
  const reputationBoost = reputationSignals.some((x) => descText.includes(x)) ? 12 : 0;
  const datasetBoost = ds?.status === "ok" ? 10 : 0;
  const publicStageBoost = String(ds?.stage || "").toLowerCase() === "public" ? 8 : 0;
  const marketBoost = yf?.status === "ok" ? 12 : 0;
  const employeesNum = Number(ds?.employees || 0) || 0;
  const scaleBoost = employeesNum >= 10000 ? 8 : employeesNum >= 1000 ? 4 : 0;

  const clarityBase = score.clarity;
  const depthBase = score.dataDepth;

  const businessModel = clampScore(45 + clarityBase * 0.28 + depthBase * 0.14 + datasetBoost + reputationBoost * 0.4);
  const marketingIntelligence = clampScore(42 + clarityBase * 0.34 + reputationBoost * 0.5);
  const competitiveMoat = clampScore(38 + depthBase * 0.2 + reputationBoost + publicStageBoost + marketBoost * 0.4 + scaleBoost);
  const swotQuality = clampScore(40 + clarityBase * 0.2 + depthBase * 0.2 + evidenceCount * 1.5);
  const dataReliability = clampScore(35 + depthBase * 0.32 + datasetBoost + marketBoost + (wiki?.pageUrl ? 8 : 0));
  const hiddenInsight = clampScore(46 + clarityBase * 0.3 + (evidenceCount >= 4 ? 8 : 2));

  const termScores = {
    businessModel: {
      score: businessModel,
      justification: businessModel >= 75 ? "Strong model signal." : "Model signal is moderate."
    },
    marketingIntelligence: {
      score: marketingIntelligence,
      justification: marketingIntelligence >= 75 ? "Clear message territory." : "Message fit needs refinement."
    },
    competitiveMoat: {
      score: competitiveMoat,
      justification: competitiveMoat >= 75 ? "Moat indicators are strong." : "Moat indicators are partial."
    },
    swotAnalysis: {
      score: swotQuality,
      justification: swotQuality >= 75 ? "SWOT is decision-usable." : "SWOT is directional only."
    },
    dataReliability: {
      score: dataReliability,
      justification: dataReliability >= 75 ? "Evidence quality is strong." : "Evidence quality is limited."
    },
    hiddenInsight: {
      score: hiddenInsight,
      justification: hiddenInsight >= 75 ? "Insight is high-confidence." : "Insight is medium-confidence."
    }
  };

  const weighted = (
    termScores.businessModel.score * 0.2
    + termScores.marketingIntelligence.score * 0.17
    + termScores.competitiveMoat.score * 0.2
    + termScores.swotAnalysis.score * 0.14
    + termScores.dataReliability.score * 0.14
    + termScores.hiddenInsight.score * 0.15
  );

  const overallScore = clampScore(Math.max(55, weighted));
  return { overallScore, termScores };
}

function sentenceCount(text) {
  return safeText(text).split(/[.!?]+/).filter(Boolean).length;
}

function containsAny(text, words) {
  return words.some((w) => text.includes(w));
}

export async function analyze(company) {
  return cachedAsync(analysisCache, norm(company), ANALYSIS_CACHE_TTL_MS, async () => {
  const [wiki, datasets] = await Promise.all([
    cachedAsync(wikiCache, norm(company), LIVE_CACHE_TTL_MS, () => getWikipediaSummary(company).catch(() => null)),
    loadOpenDatasets()
  ]);
  const ds = getDatasetMatch(company, datasets);
  const wdPromise = cachedAsync(
    wikidataCache,
    norm(wiki?.title || company),
    LIVE_CACHE_TTL_MS,
    async () => await getWikidataFromWikipediaTitle(wiki?.title || company).catch(() => null)
      || await getWikidata(company).catch(() => null)
  );
  const yfPromise = cachedAsync(
    yahooCache,
    norm(ds?.ticker || company),
    LIVE_CACHE_TTL_MS,
    () => ds?.ticker ? getYahooFinance(ds.ticker) : getYahooByCompany(company)
  );
  const [wd, yf] = await Promise.all([wdPromise, yfPromise]);

  if (STRICT_LIVE_DATA) {
    const liveOk = [
      Boolean(wiki?.extract && wiki?.description),
      Boolean(wd?.description),
      yf?.status === "ok"
    ].filter(Boolean).length;

    if (liveOk < 2) {
      throw new Error("Need at least 2 live sources (Wikipedia, Wikidata, Yahoo) to score.");
    }
  }

  const score = scoreAnalysis(wiki, wd, ds, yf);
  const perspectives = buildPerspectives(company, wiki, ds, yf, score);
  const rating = computeTermScores(company, wiki, wd, ds, yf, score);

  return {
    product: "Startup Sandbox",
    company,
    generatedAt: new Date().toISOString(),
    rating,
    score,
    perspectives,
    sources: {
      wikipedia: wiki,
      wikidata: wd,
      openDatasets: ds,
      yahooFinance: yf
    }
  };
  });
}
