import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";

const ai = new GoogleGenAI({});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const PORT = Number(process.env.PORT || 3000);
const STRICT_LIVE_DATA = true;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8"
};

const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "this", "that", "into", "your", "their", "company", "business", "profile", "public"]);
const COMPANY_HINTS = ["company", "corporation", "software", "technology", "platform", "startup", "organization", "enterprise", "brand", "service"];
const NON_COMPANY_HINTS = ["fruit", "myth", "album", "song", "film", "novel", "village", "given name", "surname"];

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function safeText(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function splitKeywords(text) {
  return safeText(text).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

function topKeywords(text, n = 6) {
  const counts = new Map();
  for (const w of splitKeywords(text)) counts.set(w, (counts.get(w) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

function normalizeTitle(input) {
  return encodeURIComponent(input.trim().replace(/\s+/g, "_"));
}

function norm(s) {
  return safeText(s).toLowerCase();
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] || "";
    });
    return row;
  });
}

async function fetchJson(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": "startup-sandbox/0.3", ...headers } });
  if (!r.ok) throw new Error(`Fetch failed (${r.status})`);
  return r.json();
}

function isLikelyCompanyProfile(summary) {
  const text = `${summary?.description || ""} ${summary?.extract || ""}`.toLowerCase();
  const hitCompany = COMPANY_HINTS.some((h) => text.includes(h));
  const hitNonCompany = NON_COMPANY_HINTS.some((h) => text.includes(h));
  return hitCompany && !hitNonCompany;
}

function rankWikipediaCandidate(title, snippet) {
  const text = `${title} ${snippet}`.toLowerCase();
  let score = 0;
  for (const h of COMPANY_HINTS) if (text.includes(h)) score += 2;
  for (const h of NON_COMPANY_HINTS) if (text.includes(h)) score -= 3;
  if (title.toLowerCase().includes("inc")) score += 2;
  return score;
}

async function getWikipediaSummaryFromTitle(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${normalizeTitle(title)}`;
  const s = await fetchJson(url);
  return {
    title: s.title,
    extract: s.extract || "",
    description: s.description || "",
    pageUrl: s.content_urls?.desktop?.page || null,
    source: "wikipedia"
  };
}

async function getWikipediaSummary(company) {
  const direct = await getWikipediaSummaryFromTitle(company).catch(() => null);
  if (direct && isLikelyCompanyProfile(direct)) return direct;

  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=8&srsearch=${encodeURIComponent(company + " company")}`;
  const data = await fetchJson(searchUrl);
  const candidates = (data?.query?.search || []).map((x) => ({ ...x, score: rankWikipediaCandidate(x.title || "", x.snippet || "") })).sort((a, b) => b.score - a.score).slice(0, 4);

  for (const c of candidates) {
    const summary = await getWikipediaSummaryFromTitle(c.title).catch(() => null);
    if (summary && isLikelyCompanyProfile(summary)) return summary;
  }

  if (direct) return direct;
  throw new Error("Could not find matching Wikipedia page");
}

async function getWikidata(company) {
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(company + " company")}&language=en&format=json&type=item&limit=3`;
  const search = await fetchJson(searchUrl);
  const entity = (search?.search || []).find((x) => COMPANY_HINTS.some((h) => (x.description || "").toLowerCase().includes(h))) || search?.search?.[0];
  if (!entity?.id) return null;
  return {
    id: entity.id,
    label: entity.label,
    description: entity.description || "",
    url: entity.concepturi,
    source: "wikidata"
  };
}

async function getWikidataFromWikipediaTitle(wikiTitle) {
  const pageInfoUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageprops&titles=${encodeURIComponent(wikiTitle)}`;
  const pageInfo = await fetchJson(pageInfoUrl);
  const pages = pageInfo?.query?.pages || {};
  const firstPage = Object.values(pages)[0];
  const qid = firstPage?.pageprops?.wikibase_item;
  if (!qid) return null;

  const dataUrl = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const raw = await fetchJson(dataUrl);
  const item = raw?.entities?.[qid];
  if (!item) return null;

  const enLabel = item?.labels?.en?.value || null;
  const enDesc = item?.descriptions?.en?.value || "";
  return {
    id: qid,
    label: enLabel,
    description: enDesc,
    url: `https://www.wikidata.org/wiki/${qid}`,
    source: "wikidata"
  };
}

async function getYahooByCompany(company) {
  try {
    const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(company)}`;
    const s = await fetchJson(searchUrl);
    const best = (s?.quotes || []).find((q) => q?.quoteType === "EQUITY" && q?.symbol);
    if (!best?.symbol) {
      return { status: "no_match", note: "No Yahoo equity match for company.", source: "yahoo-finance" };
    }
    return getYahooFinance(best.symbol);
  } catch (err) {
    return { status: "error", note: `Yahoo company search failed: ${err.message}`, source: "yahoo-finance" };
  }
}

async function loadOpenDatasets() {
  const companyPath = path.join(dataDir, "companies.csv");
  const fundingPath = path.join(dataDir, "funding_rounds.csv");

  const companies = await readFile(companyPath, "utf8").then(parseCsv).catch(() => []);
  const funding = await readFile(fundingPath, "utf8").then(parseCsv).catch(() => []);
  return { companies, funding };
}

function getDatasetMatch(company, datasets) {
  const query = norm(company);
  const c = datasets.companies.find((row) => norm(row.company_name) === query)
    || datasets.companies.find((row) => norm(row.company_name).includes(query) || query.includes(norm(row.company_name)));

  if (!c) {
    return {
      status: "no_match",
      note: "No company match in local open datasets.",
      source: "open-datasets"
    };
  }

  const rounds = datasets.funding.filter((r) => norm(r.company_name) === norm(c.company_name));
  const total = rounds.reduce((sum, r) => sum + (Number(r.amount_usd || 0) || 0), 0);

  return {
    status: "ok",
    source: "open-datasets",
    companyName: c.company_name,
    domain: c.domain || null,
    country: c.country || null,
    sector: c.sector || null,
    stage: c.stage || null,
    employees: c.employees || null,
    foundedYear: c.founded_year || null,
    ticker: c.ticker || null,
    fundingRounds: rounds.length,
    totalFundingUsd: total || null,
    latestRound: rounds[0] || null
  };
}

async function getYahooFinance(ticker) {
  if (!ticker) {
    return { status: "skipped", note: "No ticker in dataset (common for private startups).", source: "yahoo-finance" };
  }

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;
    const data = await fetchJson(url);
    const q = data?.quoteResponse?.result?.[0];
    if (!q) return { status: "no_match", note: "Ticker not found on Yahoo Finance.", source: "yahoo-finance", ticker };

    return {
      status: "ok",
      source: "yahoo-finance",
      ticker,
      shortName: q.shortName || null,
      currency: q.currency || null,
      marketCap: q.marketCap || null,
      regularMarketPrice: q.regularMarketPrice || null,
      regularMarketChangePercent: q.regularMarketChangePercent || null,
      trailingPE: q.trailingPE || null
    };
  } catch (err) {
    return { status: "error", note: `Yahoo fetch failed: ${err.message}`, source: "yahoo-finance", ticker };
  }
}

function scoreAnalysis(wiki, wd, ds, yf) {
  const summary = `${wiki.description || ""} ${wiki.extract || ""} ${ds?.sector || ""}`;
  const keys = topKeywords(summary, 8);

  const signals = [wiki.extract, wiki.description, wiki.pageUrl, wd?.description, ds?.sector, ds?.stage, ds?.foundedYear, ds?.totalFundingUsd, yf?.marketCap].filter(Boolean).length;
  const clarity = Math.min(100, 40 + Math.min(40, keys.length * 7));
  const dataDepth = Math.min(100, signals * 11);
  const confidence = Math.min(100, Math.round((clarity * 0.45) + (dataDepth * 0.55)));
  return { clarity, dataDepth, confidence, keywords: keys };
}

function buildPerspectives(company, wiki, ds, yf, score) {
  const desc = wiki.description || ds?.sector || "a defined niche";
  const sentences = (wiki.extract || "").split(". ").slice(0, 3);
  const facts = sentences.map(s => `<li>${s.replace(/\\.$/, "")}</li>`).join("");
  
  return {
    businessModel: `<strong>Primary Operation:</strong> ${desc}<br/><br/><strong>Core Facts:</strong><ul style="margin-top:8px; padding-left:16px;">${facts || "<li>Business model signals extracted from public data</li>"}</ul>`,
    marketingIntelligence: `<strong>Market Position:</strong> Based on public signals, ${company} targets ${desc}.<br/><br/><strong>Key Focus Areas:</strong><ul style="margin-top:8px; padding-left:16px;"><li>${score.keywords[0] || "Customer acquisition"}</li><li>${score.keywords[1] || "Distribution"}</li><li>${score.keywords[2] || "Growth"}</li></ul>`,
    competitiveMoat: `<strong>Defensibility Signals:</strong><br/><br/>${sentences[0] || `Moat levers likely include execution speed and distribution.`}<br/><br/><em>Public Market Validation:</em> ${yf?.status === "ok" ? yf.ticker + " at $" + yf.marketCap.toLocaleString() : "Private / Unknown"}`,
    swot: {
      strengths: `<ul style="padding-left:16px; margin:0;"><li>Strong signal for: ${score.keywords[0] || "Innovation"}</li><li>Established presence in ${desc}</li></ul>`,
      weaknesses: `<ul style="padding-left:16px; margin:0;"><li>Open datasets lag real-time private changes</li><li>Market positioning might be highly competitive</li></ul>`,
      opportunities: `<ul style="padding-left:16px; margin:0;"><li>Expand into adjacent categories</li><li>Leverage existing customer base for new products</li></ul>`,
      threats: `<ul style="padding-left:16px; margin:0;"><li>Macroeconomic headwinds</li><li>Rapidly evolving tech landscape</li></ul>`
    },
    businessMetrics: score,
    hiddenInsight: `Based on the data depth (${score.dataDepth}%), ${company} operates in a highly dynamic environment. The key to their long-term moat will be transitioning from single-product utility to an interconnected ecosystem.`
  };
}

function clampScore(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function computeTermScores(company, wiki, wd, ds, yf, score) {
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

async function analyzeIdeaText(idea) {
  const t = safeText(idea);
  if (!t || t.length < 10) throw new Error("Idea too short");

  const prompt = `You are an expert, brutally honest startup strategist and venture capitalist. 
Analyze the following startup idea and return a highly critical, realistic evaluation. Do not sugarcoat anything.
Idea: "${t}"

Return a JSON object strictly matching this schema:
{
  "viabilityScore": <integer between 0 and 100>,
  "decision": "<strictly one of: KILL, PIVOT, or DOUBLE DOWN>",
  "decisionReason": "<one brutal, undeniable sentence explaining the decision>",
  "marketPotential": <integer between 0 and 100>,
  "executionFeasibility": <integer between 0 and 100>,
  "defensibility": <integer between 0 and 100>,
  "capitalEfficiency": <integer between 0 and 100>,
  "mutations": ["<better variation 1>", "<better variation 2>", "<better variation 3>"],
  "crazyPivot": "<one crazy but high-potential wild idea variation>",
  "copycatRisk": "<assessment of who can crush them (e.g. 'Apple could replicate in 6 months') and what specific data advantage is needed to survive>",
  "liveExperiments": ["<specific actionable cheap test 1>", "<test 2>", "<test 3>"],
  "mistakePredictor": "<prediction of the classic psychological or building mistake the founder will make for this specific idea>",
  "hiddenOpportunity": "<one deep, non-obvious strategic angle or partnership the founder is likely missing>"
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            viabilityScore: { type: Type.INTEGER },
            decision: { type: Type.STRING },
            decisionReason: { type: Type.STRING },
            marketPotential: { type: Type.INTEGER },
            executionFeasibility: { type: Type.INTEGER },
            defensibility: { type: Type.INTEGER },
            capitalEfficiency: { type: Type.INTEGER },
            mutations: { type: Type.ARRAY, items: { type: Type.STRING } },
            crazyPivot: { type: Type.STRING },
            copycatRisk: { type: Type.STRING },
            liveExperiments: { type: Type.ARRAY, items: { type: Type.STRING } },
            mistakePredictor: { type: Type.STRING },
            hiddenOpportunity: { type: Type.STRING },
          },
          required: ["viabilityScore", "decision", "decisionReason", "marketPotential", "executionFeasibility", "defensibility", "capitalEfficiency", "mutations", "crazyPivot", "copycatRisk", "liveExperiments", "mistakePredictor", "hiddenOpportunity"]
        }
      }
    });

    const text = response.text;
    const result = JSON.parse(text);
    return result;
  } catch (err) {
    console.error("LLM Error:", err);
    throw new Error("Failed to validate idea using AI.");
  }
}

async function generateLessonContent(topic) {
  const t = safeText(topic);
  if (!t || t.length < 3) throw new Error("Lesson topic is too short");

  const prompt = `You are an expert startup mentor and educator. Teach the topic: "${t}".
Write it like Duolingo meets Paul Graham: short, punchy, practical, with real-world examples.

Return ONLY valid JSON matching this schema:
{
  "keyPoints": ["string", "string", "string", "string"],
  "realWorldExample": "string",
  "commonMistake": "string",
  "proTip": "string",
  "quiz": {
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "correctIndex": 0,
    "explanation": "string"
  }
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            realWorldExample: { type: Type.STRING },
            commonMistake: { type: Type.STRING },
            proTip: { type: Type.STRING },
            quiz: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING }
              },
              required: ["question", "options", "correctIndex", "explanation"]
            }
          },
          required: ["keyPoints", "realWorldExample", "commonMistake", "proTip", "quiz"]
        }
      }
    });
    return JSON.parse(response.text);
  } catch (err) {
    console.error("Lesson LLM Error:", err);
    throw new Error("Failed to generate lesson content using AI.");
  }
}

async function simulateStartup(idea, stage) {
  const t = safeText(idea);
  if (!t || t.length < 10) throw new Error("Idea too short");

  const prompt = `You are a Y Combinator partner, experienced venture capitalist, and startup data scientist.
Simulate the realistic future of this startup idea.

Startup idea: "${t}"
Current stage: "${safeText(stage) || "idea"}"

Return ONLY valid JSON matching this schema:
{
  "summary": "string",
  "topMetrics": {
    "survivabilityScore": 0,
    "fundingLikelihood": 0,
    "marketFitScore": 0,
    "burnRunway": "string"
  },
  "timeline": [
    {
      "period": "Month 1-3",
      "title": "string",
      "narrative": "string",
      "metrics": {
        "users": "string",
        "revenue": "string",
        "retention": "string",
        "keyEvent": "string"
      }
    },
    {
      "period": "Month 4-6",
      "title": "string",
      "narrative": "string",
      "metrics": {
        "users": "string",
        "revenue": "string",
        "retention": "string",
        "keyEvent": "string"
      }
    },
    {
      "period": "Month 7-12",
      "title": "string",
      "narrative": "string",
      "metrics": {
        "users": "string",
        "revenue": "string",
        "retention": "string",
        "keyEvent": "string"
      }
    }
  ],
  "chartData": {
    "labels": ["Month 1", "Month 2", "Month 3", "Month 4", "Month 5", "Month 6", "Month 9", "Month 12"],
    "users": [0, 0, 0, 0, 0, 0, 0, 0],
    "revenue": [0, 0, 0, 0, 0, 0, 0, 0]
  },
  "failureTimeline": "string",
  "investorReaction": "string",
  "userReaction": "string",
  "strategicMoves": "string"
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            topMetrics: {
              type: Type.OBJECT,
              properties: {
                survivabilityScore: { type: Type.INTEGER },
                fundingLikelihood: { type: Type.INTEGER },
                marketFitScore: { type: Type.INTEGER },
                burnRunway: { type: Type.STRING }
              },
              required: ["survivabilityScore", "fundingLikelihood", "marketFitScore", "burnRunway"]
            },
            timeline: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  period: { type: Type.STRING },
                  title: { type: Type.STRING },
                  narrative: { type: Type.STRING },
                  metrics: {
                    type: Type.OBJECT,
                    properties: {
                      users: { type: Type.STRING },
                      revenue: { type: Type.STRING },
                      retention: { type: Type.STRING },
                      keyEvent: { type: Type.STRING }
                    },
                    required: ["users", "revenue", "retention", "keyEvent"]
                  }
                },
                required: ["period", "title", "narrative", "metrics"]
              }
            },
            chartData: {
              type: Type.OBJECT,
              properties: {
                labels: { type: Type.ARRAY, items: { type: Type.STRING } },
                users: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                revenue: { type: Type.ARRAY, items: { type: Type.NUMBER } }
              },
              required: ["labels", "users", "revenue"]
            },
            failureTimeline: { type: Type.STRING },
            investorReaction: { type: Type.STRING },
            userReaction: { type: Type.STRING },
            strategicMoves: { type: Type.STRING }
          },
          required: ["summary", "topMetrics", "timeline", "chartData", "failureTimeline", "investorReaction", "userReaction", "strategicMoves"]
        }
      }
    });
    return JSON.parse(response.text);
  } catch (err) {
    console.error("Simulation LLM Error:", err);
    throw new Error("Failed to run simulation using AI.");
  }
}
async function analyze(company) {
  const wiki = await getWikipediaSummary(company).catch(() => null);
  const wd = await getWikidataFromWikipediaTitle(wiki?.title || company).catch(() => null)
    || await getWikidata(company).catch(() => null);
  const datasets = await loadOpenDatasets();
  const ds = getDatasetMatch(company, datasets);
  const yf = ds?.ticker ? await getYahooFinance(ds.ticker) : await getYahooByCompany(company);

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
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const target = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(publicDir, target);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, { ok: true, service: "startup-sandbox" });
    }

    if (req.method === "GET" && url.pathname === "/api/analyze") {
      const company = safeText(url.searchParams.get("company"));
      if (!company) return json(res, 400, { error: "Missing ?company= query parameter" });
      const payload = await analyze(company);
      return json(res, 200, payload);
    }

    if (req.method === "POST" && url.pathname === "/api/analyze-idea") {
      let raw = "";
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", resolve);
        req.on("error", reject);
      });
      const body = JSON.parse(raw || "{}");
      const idea = safeText(body.idea);
      if (!idea || idea.length < 10) {
        return json(res, 400, { error: "Idea is too short. Add at least 10 characters." });
      }
      const result = await analyzeIdeaText(idea);
      return json(res, 200, {
        product: "Startup Sandbox",
        mode: "idea",
        generatedAt: new Date().toISOString(),
        idea,
        analysis: result
      });
    }

    if (req.method === "POST" && url.pathname === "/api/lesson") {
      let raw = "";
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", resolve);
        req.on("error", reject);
      });
      const body = JSON.parse(raw || "{}");
      const title = safeText(body.title);
      const desc = safeText(body.desc);
      if (!title) return json(res, 400, { error: "Missing lesson title." });
      const result = await generateLessonContent(`${title} - ${desc}`);
      return json(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/simulate") {
      let raw = "";
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", resolve);
        req.on("error", reject);
      });
      const body = JSON.parse(raw || "{}");
      const idea = safeText(body.idea);
      const stage = safeText(body.stage) || "idea";
      if (!idea || idea.length < 10) {
        return json(res, 400, { error: "Idea is too short. Add at least 10 characters." });
      }
      const result = await simulateStartup(idea, stage);
      return json(res, 200, result);
    }

    return serveStatic(req, res);
  } catch (err) {
    return json(res, 500, { error: err.message || "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`startup-sandbox running at http://localhost:${PORT}`);
});


