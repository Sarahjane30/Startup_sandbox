import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
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

function startupSimSchema() {
  const metricObject = {
    type: Type.OBJECT,
    properties: {
      cash: { type: Type.NUMBER },
      runwayMonths: { type: Type.INTEGER },
      users: { type: Type.INTEGER },
      revenue: { type: Type.NUMBER },
      retention: { type: Type.INTEGER },
      equityLeft: { type: Type.INTEGER },
      dilution: { type: Type.INTEGER },
      teamSize: { type: Type.INTEGER },
      growth: { type: Type.INTEGER },
      healthScore: { type: Type.INTEGER },
      founderStress: { type: Type.INTEGER },
      morale: { type: Type.INTEGER },
      investorInterest: { type: Type.INTEGER },
      technicalDebt: { type: Type.INTEGER }
    },
    required: ["cash", "runwayMonths", "users", "revenue", "retention", "equityLeft", "dilution", "teamSize", "growth", "healthScore", "founderStress", "morale", "investorInterest", "technicalDebt"]
  };

  return {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING },
      patternMatch: { type: Type.STRING },
      visible: metricObject,
      hidden: {
        type: Type.OBJECT,
        properties: {
          investorConfidence: { type: Type.INTEGER },
          teamTrust: { type: Type.INTEGER },
          marketHype: { type: Type.INTEGER },
          founderBurnout: { type: Type.INTEGER },
          competition: { type: Type.INTEGER },
          virality: { type: Type.INTEGER },
          productQuality: { type: Type.INTEGER },
          customerPain: { type: Type.INTEGER }
        },
        required: ["investorConfidence", "teamTrust", "marketHype", "founderBurnout", "competition", "virality", "productQuality", "customerPain"]
      },
      round: {
        type: Type.OBJECT,
        properties: {
          month: { type: Type.INTEGER },
          stage: { type: Type.STRING },
          title: { type: Type.STRING },
          narrative: { type: Type.STRING },
          randomEvent: { type: Type.STRING },
          events: { type: Type.ARRAY, items: { type: Type.STRING } },
          choices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["id", "label", "description"]
            }
          }
        },
        required: ["month", "stage", "title", "narrative", "randomEvent", "events", "choices"]
      },
      lesson: {
        type: Type.OBJECT,
        properties: {
          beginnerChoice: { type: Type.STRING },
          smartChoice: { type: Type.STRING },
          why: { type: Type.STRING }
        },
        required: ["beginnerChoice", "smartChoice", "why"]
      },
      chartData: {
        type: Type.OBJECT,
        properties: {
          labels: { type: Type.ARRAY, items: { type: Type.STRING } },
          users: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          revenue: { type: Type.ARRAY, items: { type: Type.NUMBER } }
          ,
          runway: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          health: { type: Type.ARRAY, items: { type: Type.NUMBER } }
        },
        required: ["labels", "users", "revenue", "runway", "health"]
      },
      history: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            month: { type: Type.INTEGER },
            choice: { type: Type.STRING },
            outcome: { type: Type.STRING }
          },
          required: ["month", "choice", "outcome"]
        }
      }
    },
    required: ["summary", "patternMatch", "visible", "hidden", "round", "lesson", "chartData", "history"]
  };
}

async function generateFounderSimulation(prompt) {
  const maxRetries = 3;
  const baseDelay = 1000;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: startupSimSchema()
        }
      });
      return JSON.parse(response.text);
    } catch (err) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isRetryable = err?.status === 503 || err?.status === 429;
      
      if (!isRetryable || isLastAttempt) {
        throw err;
      }
      
      const delayMs = baseDelay * Math.pow(2, attempt);
      console.log(`Gemini API attempt ${attempt + 1} failed (${err?.status}). Retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function compactSimState(state) {
  return {
    summary: safeText(state?.summary),
    patternMatch: safeText(state?.patternMatch),
    founder: state?.founder || {},
    startup: state?.startup || {},
    visible: state?.visible || {},
    hidden: state?.hidden || {},
    round: state?.round || {},
    lesson: state?.lesson || {},
    chartData: state?.chartData || {},
    history: Array.isArray(state?.history) ? state.history.slice(-8) : []
  };
}

function simNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function simClamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(simNumber(value))));
}

function fallbackChart(label, users, revenue, previous = null) {
  const labels = Array.isArray(previous?.labels) ? [...previous.labels, label] : [label];
  const userData = Array.isArray(previous?.users) ? [...previous.users, users] : [users];
  const revenueData = Array.isArray(previous?.revenue) ? [...previous.revenue, revenue] : [revenue];
  const runwayData = Array.isArray(previous?.runway) ? [...previous.runway, 0] : [0];
  const healthData = Array.isArray(previous?.health) ? [...previous.health, 0] : [0];
  return { labels: labels.slice(-8), users: userData.slice(-8), revenue: revenueData.slice(-8), runway: runwayData.slice(-8), health: healthData.slice(-8) };
}

function fallbackChartPoint(label, visible, previous = null) {
  const labels = Array.isArray(previous?.labels) ? [...previous.labels, label] : [label];
  const users = Array.isArray(previous?.users) ? [...previous.users, Math.round(simNumber(visible.users))] : [Math.round(simNumber(visible.users))];
  const revenue = Array.isArray(previous?.revenue) ? [...previous.revenue, Math.round(simNumber(visible.revenue))] : [Math.round(simNumber(visible.revenue))];
  const runway = Array.isArray(previous?.runway) ? [...previous.runway, Math.round(simNumber(visible.runwayMonths))] : [Math.round(simNumber(visible.runwayMonths))];
  const health = Array.isArray(previous?.health) ? [...previous.health, Math.round(simNumber(visible.healthScore))] : [Math.round(simNumber(visible.healthScore))];
  return { labels: labels.slice(-8), users: users.slice(-8), revenue: revenue.slice(-8), runway: runway.slice(-8), health: health.slice(-8) };
}

function chooseRandomEvent(visible, startup, month) {
  const events = [
    {
      name: "Investor rejection",
      text: "A seed investor likes the market but passes because retention is still too weak.",
      apply() {
        visible.investorInterest = simClamp(visible.investorInterest - 8);
        visible.founderStress = simClamp(visible.founderStress + 7);
      }
    },
    {
      name: "Server crash",
      text: "A server crash hits during a small usage spike and exposes brittle infrastructure.",
      apply() {
        visible.technicalDebt = simClamp(visible.technicalDebt + 10);
        visible.morale = simClamp(visible.morale - 5);
        visible.retention = simClamp(visible.retention - 3);
      }
    },
    {
      name: "Viral growth",
      text: "A post unexpectedly goes viral and sends a rush of curious but low-intent users.",
      apply() {
        visible.users = Math.round(simNumber(visible.users) * 1.55 + 40);
        visible.growth = simClamp(visible.growth + 18);
        visible.technicalDebt = simClamp(visible.technicalDebt + 5);
      }
    },
    {
      name: "Cofounder tension",
      text: "A cofounder starts questioning the direction after weeks of fuzzy customer feedback.",
      apply() {
        visible.morale = simClamp(visible.morale - 10);
        visible.founderStress = simClamp(visible.founderStress + 8);
      }
    },
    {
      name: "Competitor noise",
      text: "A competitor announces funding and makes your market feel louder overnight.",
      apply() {
        visible.investorInterest = simClamp(visible.investorInterest + 4);
        visible.founderStress = simClamp(visible.founderStress + 5);
      }
    }
  ];
  const indexSeed = month + safeText(startup?.industry).length + Math.round(simNumber(visible.users));
  const event = events[indexSeed % events.length];
  event.apply();
  return event.text;
}

function fallbackRound(month, visible, startup, lastOutcome = "") {
  const pressure = visible.runwayMonths <= 3 ? "Runway pressure" : safeText(startup?.startupStage) || "Early traction";
  const randomEvent = chooseRandomEvent(visible, startup, month);
  return {
    month,
    stage: pressure,
    title: visible.runwayMonths <= 3 ? "The Runway Squeeze" : "The First Traction Test",
    narrative: lastOutcome || `You are at month ${month}. The product has a small signal, but the next move decides whether this becomes learning velocity or expensive motion.`,
    randomEvent,
    events: [
      randomEvent,
      visible.runwayMonths <= 3 ? "cash runway is tightening" : "new users are curious but not committed",
      startup?.customerType === "B2B" ? "a warm enterprise lead asks for custom features" : "users ask for a cheaper plan",
      "one competitor starts posting loudly on social"
    ],
    choices: [
      { id: "A", label: "Talk to 20 users", description: "Pause feature work and run focused problem interviews before changing the product." },
      { id: "B", label: "Ship more features", description: "Try to make the product feel bigger and more complete before selling harder." },
      { id: "C", label: "Raise money now", description: "Pitch investors with the current story and try to extend runway quickly." },
      { id: "D", label: "Narrow the wedge", description: "Cut scope to one painful use case and sell it manually to a sharper segment." }
    ]
  };
}

function buildStartupNarrative(founder, startup, visible) {
  const founderType = norm(founder?.founderType) || "founder";
  const industry = safeText(startup?.industry) || "your space";
  const stage = safeText(startup?.startupStage) || "early";
  const isBB = norm(startup?.customerType).includes("b2b");
  
  const narratives = {
    "College student": `You launched from campus with ${moneyText(visible.cash)} in savings. The energy is high, but time is your constraint.`,
    "Working professional": `You left your job with ${moneyText(visible.cash)} and some severance. The pressure to prove this works is real.`,
    "Full-time founder": `You are betting your entire focus on this. With ${moneyText(visible.cash)}, every decision compounds.`,
    "Repeat founder": `You have been here before. This time, with ${moneyText(visible.cash)}, you are moving faster and trusting your instincts more.`,
  };
  
  const openingLine = narratives[founderType] || `You are starting this ${industry} venture with ${moneyText(visible.cash)}.`;
  const stageContext = stage.includes("Idea") ? "Your MVP is a rough sketch."
    : stage.includes("MVP") ? "Your MVP works, but only you know how it works."
    : stage.includes("pre-revenue") ? "You have product-market fit signals but no paying customers yet."
    : "You have early revenue, but the path to scale is not clear yet.";
  
  const customerContext = isBB
    ? `You are targeting ${safeText(startup?.customerType)} customers. Enterprise cycles are long, but the deals are bigger.`
    : `You are targeting ${safeText(startup?.customerType)} users. Virality is possible, but retention is fragile.`;
  
  return `${openingLine} ${stageContext} ${customerContext} The simulation will test whether you can find verified demand before runway becomes your only decision maker.`;
}

function fallbackInitialSimulation(founder, startup) {
  const cash = simNumber(founder?.money, 25000);
  const burn = Math.max(1, simNumber(founder?.monthlyBurn, 4000));
  const hasTech = norm(founder?.technicalCofounder) === "yes";
  const audienceBoost = norm(founder?.audience).includes("large") ? 18 : norm(founder?.audience).includes("small") ? 8 : 0;
  const knowledgeBoost = norm(founder?.industryKnowledge).includes("high") ? 12 : norm(founder?.industryKnowledge).includes("low") ? -8 : 0;
  const runwayMonths = Math.max(1, Math.floor(cash / burn));
  const users = Math.max(8, 35 + audienceBoost + knowledgeBoost);
  const revenue = norm(startup?.customerType).includes("b2b") ? 0 : Math.max(0, users * 1.5);
  const healthScore = simClamp(42 + audienceBoost + knowledgeBoost + (hasTech ? 8 : -10) + Math.min(runwayMonths, 10));
  const visible = {
    cash,
    runwayMonths,
    users,
    revenue,
    retention: simClamp(24 + knowledgeBoost + (hasTech ? 6 : -4)),
    equityLeft: 100,
    dilution: 0,
    teamSize: Math.max(1, simNumber(founder?.teamSize, 1)),
    growth: simClamp(20 + audienceBoost + knowledgeBoost),
    healthScore,
    founderStress: simClamp(65 - runwayMonths * 3 + (norm(founder?.personality).includes("perfectionist") ? 12 : 0)),
    morale: simClamp(58 + (hasTech ? 8 : -8)),
    investorInterest: simClamp(24 + audienceBoost + knowledgeBoost),
    technicalDebt: simClamp(hasTech ? 22 : 45)
  };
  
  const patterns = [
    "Your path currently resembles early Airbnb-style manual learning, with a possible Quibi-style risk if you overbuild before proving demand.",
    "Your path currently resembles a disciplined early-stage team trading vanity metrics for verified demand signals.",
    "Your path currently resembles the pivot risk that hit many first-time founders: building in isolation before customer contact."
  ];
  const patternIndex = (safeText(startup?.industry).length + safeText(founder?.founderType).length) % patterns.length;

  return {
    summary: buildStartupNarrative(founder, startup, visible),
    patternMatch: patterns[patternIndex],
    founder,
    startup,
    visible,
    hidden: {
      investorConfidence: visible.investorInterest,
      teamTrust: visible.morale,
      marketHype: simClamp(35 + audienceBoost),
      founderBurnout: visible.founderStress,
      competition: 42,
      virality: simClamp(18 + audienceBoost),
      productQuality: simClamp(hasTech ? 50 : 32),
      customerPain: simClamp(45 + knowledgeBoost)
    },
    round: fallbackRound(1, visible, startup),
    lesson: {
      beginnerChoice: "Beginner founders often try to look bigger: more features, more decks, more vague growth talk.",
      smartChoice: "Experienced founders force contact with reality: narrower user segment, painful problem, faster learning loop.",
      why: "At this stage, the scarcest resource is not code or pitch polish. It is verified demand before runway disappears."
    },
    chartData: fallbackChartPoint("Month 1", visible),
    history: [],
    _fallback: true,
    _fallbackNote: "Running with fallback simulation. The AI model was temporarily unavailable."
  };
}

function moneyText(value) {
  return `$${Math.round(simNumber(value)).toLocaleString("en-US")}`;
}

function fallbackAdvanceSimulation(state, choiceId) {
  const compact = compactSimState(state);
  const visible = { ...compact.visible };
  const hidden = { ...compact.hidden };
  const month = simNumber(compact.round?.month, 1) + 2;
  const burn = Math.max(1, simNumber(compact.founder?.monthlyBurn, Math.max(2000, visible.cash / 6)));
  const choice = (compact.round?.choices || []).find((c) => c.id === choiceId) || { id: choiceId, label: "Unknown choice" };
  let outcome = "";

  visible.cash = simNumber(visible.cash) - burn * 2 + simNumber(visible.revenue) * 2;

  if (choiceId === "A") {
    visible.users = simNumber(visible.users) + 35;
    visible.growth = simClamp(visible.growth + 8);
    visible.retention = simClamp(visible.retention + 10);
    visible.revenue = simNumber(visible.revenue) + 300;
    visible.founderStress = simClamp(visible.founderStress - 5);
    visible.morale = simClamp(visible.morale + 8);
    hidden.customerPain = simClamp(hidden.customerPain + 12);
    outcome = "The interviews are uncomfortable but useful. Two assumptions break, one painful segment becomes obvious, and the product gets sharper.";
  } else if (choiceId === "B") {
    visible.users = simNumber(visible.users) + 20;
    visible.growth = simClamp(visible.growth + 2);
    visible.retention = simClamp(visible.retention - 4);
    visible.technicalDebt = simClamp(visible.technicalDebt + 16);
    visible.founderStress = simClamp(visible.founderStress + 10);
    hidden.productQuality = simClamp(hidden.productQuality - 4);
    outcome = "The product looks busier, but the new features do not explain why people should return. Technical debt starts taxing every small change.";
  } else if (choiceId === "C") {
    const weakTerms = visible.investorInterest < 45;
    visible.cash += weakTerms ? 75000 : 150000;
    visible.equityLeft = simClamp(visible.equityLeft - (weakTerms ? 18 : 8), 0, 100);
    visible.dilution = 100 - visible.equityLeft;
    visible.investorInterest = simClamp(visible.investorInterest + 10);
    visible.founderStress = simClamp(visible.founderStress - 8);
    hidden.investorConfidence = simClamp(hidden.investorConfidence + 10);
    outcome = weakTerms
      ? "You get money, but the terms are expensive because traction is thin. The company survives, while ownership takes an early hit."
      : "The raise extends runway without wrecking the cap table. Investors respond to the focused narrative more than the raw numbers.";
  } else {
    visible.users = simNumber(visible.users) + 55;
    visible.growth = simClamp(visible.growth + 12);
    visible.revenue = simNumber(visible.revenue) + 900;
    visible.retention = simClamp(visible.retention + 7);
    visible.morale = simClamp(visible.morale + 4);
    visible.founderStress = simClamp(visible.founderStress + 3);
    hidden.customerPain = simClamp(hidden.customerPain + 8);
    outcome = "The narrower wedge reduces ego but improves signal. Fewer people care, yet the ones who care are more willing to pay.";
  }

  visible.runwayMonths = Math.max(0, Math.floor(simNumber(visible.cash) / burn));
  visible.healthScore = simClamp((visible.retention * 0.35) + (visible.morale * 0.2) + (visible.investorInterest * 0.15) + Math.min(visible.runwayMonths * 5, 30) - (visible.technicalDebt * 0.15));
  visible.dilution = 100 - simClamp(visible.equityLeft);
  hidden.founderBurnout = visible.founderStress;
  hidden.teamTrust = visible.morale;

  return {
    ...compact,
    summary: `${outcome} You now have ${moneyText(visible.cash)} left, ${visible.runwayMonths} months of runway, and ${Math.round(visible.users).toLocaleString("en-US")} users.`,
    patternMatch: visible.equityLeft < 85
      ? "Your path currently resembles founder-friendly cautionary tales around early dilution."
      : "Your path currently resembles disciplined early-stage teams that trade vanity progress for validated demand.",
    visible,
    hidden,
    round: fallbackRound(month, visible, compact.startup, outcome),
    lesson: {
      beginnerChoice: choiceId === "B" ? "Beginner founders often add features when traction is weak." : "Beginner founders often optimize for relief from anxiety.",
      smartChoice: "Experienced founders protect runway, cap table, and learning velocity at the same time.",
      why: "A startup decision is rarely just tactical. It changes psychology, negotiating leverage, and the next set of available moves."
    },
    chartData: fallbackChartPoint(`Month ${month}`, visible, compact.chartData),
    history: [
      ...(compact.history || []),
      { month: simNumber(compact.round?.month, 1), choice: choice.label || choiceId, outcome }
    ].slice(-8)
  };
}

async function simulateStartup(founder, startup) {
  const inferredIdea = [
    safeText(startup?.industry) && `${safeText(startup.industry)} startup`,
    safeText(startup?.customerType) && `for ${safeText(startup.customerType)} customers`,
    safeText(startup?.productType) && `delivered as ${safeText(startup.productType)}`,
    safeText(startup?.businessModel) && `with a ${safeText(startup.businessModel)} model`,
    safeText(startup?.revenueModel) && `charging ${safeText(startup.revenueModel)}`,
    safeText(startup?.aiDependency) && `with ${safeText(startup.aiDependency)} AI dependency`
  ].filter(Boolean).join(" ");
  const idea = safeText(startup?.idea).length >= 10 ? safeText(startup.idea) : inferredIdea;
  if (!idea || idea.length < 10) throw new Error("Idea too short");
  startup = { ...startup, idea };

  const prompt = `You are a realistic Founder Decision Simulator: YC partner, startup operator, behavioral coach, and business game designer.

Create the starting world for an interactive startup simulation. The user is the founder.

Founder setup:
${JSON.stringify(founder || {}, null, 2)}

Startup setup:
${JSON.stringify(startup || {}, null, 2)}

Rules:
- This is not a prediction report. It is a decision round game.
- Track visible variables and hidden variables. Hidden variables must affect the visible world, but do not reveal them in the narrative.
- Make numbers plausible for a very early startup.
- The first round should be Month 1 or Month 2 and present exactly 4 choices with ids A, B, C, D.
- Include realistic founder psychology, market pressure, user feedback, investor behavior, runway risk, and at least one random event.
- visible.growth is a 0-100 traction momentum score. visible.dilution is 100 - founder equity left.
- chartData must include labels, users, revenue, runway, and health arrays.
- The lesson must compare beginner-founder instinct vs experienced-founder decision making.
- patternMatch should say "Your path currently resembles ..." and reference a real startup pattern or failure pattern.
- chartData should start with current history only, not a 12-month forecast.

Return only JSON in the required schema.`;

  try {
    const result = await generateFounderSimulation(prompt);
    return {
      ...result,
      founder,
      startup,
      history: Array.isArray(result.history) ? result.history : []
    };
  } catch (err) {
    console.error("Simulation LLM Error:", err?.message || err);
    console.log("Falling back to deterministic simulation...");
    return fallbackInitialSimulation(founder, startup);
  }
}

async function advanceSimulation(state, choiceId) {
  const compactState = compactSimState(state);
  const chosen = (compactState.round?.choices || []).find((c) => c.id === choiceId);
  if (!chosen) throw new Error("Unknown choice");

  const prompt = `Continue this Founder Decision Simulator by one decision round.

Current state:
${JSON.stringify(compactState, null, 2)}

The founder chose:
${JSON.stringify(chosen, null, 2)}

Rules:
- Apply realistic consequences to visible and hidden variables. Do not make every choice good.
- Cash must move based on burn, revenue, fundraising, hiring, pivots, and random events.
- Equity can fall if the decision involves fundraising or selling ownership.
- Maintain visible.dilution as 100 - visible.equityLeft and update visible.growth as traction momentum.
- Include a new randomEvent in the next round, such as cofounder quits, server crash, viral growth, or investor rejection.
- Founder personality should create strengths and liabilities in the outcome.
- Add one history item for the chosen decision and its consequence.
- Then generate the next monthly decision round with exactly 4 choices A-D.
- The next round month should move forward by 1 to 3 months.
- The lesson should explain what beginner founders usually do in this situation vs what experienced founders do.
- chartData should append the new month and keep prior values.
- chartData must include labels, users, revenue, runway, and health arrays.
- Keep narrative sharp, specific, and game-like.

Return only JSON in the required schema.`;

  try {
    const result = await generateFounderSimulation(prompt);
    return {
      ...result,
      founder: compactState.founder,
      startup: compactState.startup
    };
  } catch (err) {
    console.error("Decision LLM Error:", err);
    return fallbackAdvanceSimulation(state, choiceId);
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
      const founder = body.founder || {};
      const startup = body.startup || { idea: body.idea, stage: body.stage };
      const idea = safeText(startup.idea) || [
        safeText(startup.industry),
        safeText(startup.customerType),
        safeText(startup.productType),
        safeText(startup.businessModel),
        safeText(startup.revenueModel),
        safeText(startup.aiDependency)
      ].filter(Boolean).join(" ");
      if (!idea || idea.length < 10) {
        return json(res, 400, { error: "Add a startup idea or fill in a few startup setup fields first." });
      }
      const result = await simulateStartup(founder, startup);
      return json(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/simulate/decision") {
      let raw = "";
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", resolve);
        req.on("error", reject);
      });
      const body = JSON.parse(raw || "{}");
      const choiceId = safeText(body.choiceId);
      if (!body.state || !choiceId) {
        return json(res, 400, { error: "Decision request needs state and choiceId." });
      }
      const result = await advanceSimulation(body.state, choiceId);
      return json(res, 200, result);
    }

    return serveStatic(req, res);
  } catch (err) {
    return json(res, 500, { error: err.message || "Internal server error" });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the existing server or run with a different PORT.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`startup-sandbox running at http://localhost:${PORT}`);
});
