import http from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const ideaDataDir = path.join(__dirname, "ai_model", "data_sets", "data_sets");
const mlPredictorPath = path.join(__dirname, "ai_model", "data_sets", "training", "predict_startup_ml.py");
const mlModelPath = path.join(__dirname, "ai_model", "data_sets", "models", "ctgan_xgboost_strict_model.pkl");
const learningEnginePath = path.join(__dirname, "ai_model", "data_sets", "adaptive_path_engine.py");
const simulationEnginePath = path.join(__dirname, "ai_model", "data_sets", "simulation_platform.py");
const bundledPythonPath = path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
const PORT = Number(process.env.PORT || 3000);
const STRICT_LIVE_DATA = true;
const PYTHON_CMD = process.env.PYTHON_CMD || (existsSync(bundledPythonPath) ? bundledPythonPath : "python");
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 60000);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 4500);
const LIVE_CACHE_TTL_MS = Number(process.env.LIVE_CACHE_TTL_MS || 10 * 60 * 1000);
const ANALYSIS_CACHE_TTL_MS = Number(process.env.ANALYSIS_CACHE_TTL_MS || 30 * 60 * 1000);
const IDEA_CACHE_TTL_MS = Number(process.env.IDEA_CACHE_TTL_MS || 30 * 60 * 1000);
const IDEA_LIVE_TIMEOUT_MS = Number(process.env.IDEA_LIVE_TIMEOUT_MS || 4500);
const IDEA_DATASET_MATCH_THRESHOLD = Number(process.env.IDEA_DATASET_MATCH_THRESHOLD || 0.05);
const GEMINI_IDEA_MODEL = process.env.GEMINI_IDEA_MODEL || "gemini-2.5-flash";

let datasetsPromise = null;
const wikiCache = new Map();
const wikidataCache = new Map();
const yahooCache = new Map();
const analysisCache = new Map();
const ideaAnalysisCache = new Map();
const publicIdeaCache = new Map();
let mlWorker = null;
let mlWorkerStderr = "";
const mlPending = [];
let ideaDatasetsPromise = null;

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "startup-sandbox/0.3", ...headers },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`Fetch failed (${r.status})`);
    return r.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 startup-sandbox/0.3", ...headers },
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`Fetch failed (${r.status})`);
    return r.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function cachedAsync(cache, key, ttlMs, loader) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;

  const value = Promise.resolve().then(loader);
  cache.set(key, { expires: now + ttlMs, value });
  try {
    return await value;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

async function withTimeout(promise, ms, fallback) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
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
  const directPromise = getWikipediaSummaryFromTitle(company).catch(() => null);
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=8&srsearch=${encodeURIComponent(company + " company")}`;
  const searchPromise = fetchJson(searchUrl).catch(() => null);

  const direct = await directPromise;
  if (direct && isLikelyCompanyProfile(direct)) return direct;

  const data = await searchPromise;
  const candidates = (data?.query?.search || []).map((x) => ({ ...x, score: rankWikipediaCandidate(x.title || "", x.snippet || "") })).sort((a, b) => b.score - a.score).slice(0, 4);

  const summaries = await Promise.all(candidates.map((c) => getWikipediaSummaryFromTitle(c.title).catch(() => null)));
  const match = summaries.find((summary) => summary && isLikelyCompanyProfile(summary));
  if (match) return match;

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
  if (datasetsPromise) return datasetsPromise;
  const companyPath = path.join(dataDir, "companies.csv");
  const fundingPath = path.join(dataDir, "funding_rounds.csv");

  datasetsPromise = Promise.all([
    readFile(companyPath, "utf8").then(parseCsv).catch(() => []),
    readFile(fundingPath, "utf8").then(parseCsv).catch(() => [])
  ]).then(([companies, funding]) => ({ companies, funding }));
  return datasetsPromise;
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

function runStartupModel(payload) {
  const worker = getMlWorker();
  return new Promise((resolve, reject) => {
    const pending = {};
    const timeout = setTimeout(() => {
      const index = mlPending.indexOf(pending);
      if (index >= 0) mlPending.splice(index, 1);
      reject(new Error("Local ML model timed out while searching datasets. Try a shorter idea or disable public context."));
    }, ML_TIMEOUT_MS);

    pending.resolve = (value) => {
      clearTimeout(timeout);
      resolve(value);
    };
    pending.reject = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
    mlPending.push(pending);

    worker.stdin.write(`${JSON.stringify({ ...payload, model_path: mlModelPath })}\n`, (err) => {
      if (!err) return;
      clearTimeout(timeout);
      const index = mlPending.indexOf(pending);
      if (index >= 0) mlPending.splice(index, 1);
      mlWorker = null;
      reject(err);
    });
  });
}

function stopMlWorker() {
  const worker = mlWorker;
  if (!worker) return Promise.resolve();
  mlWorker = null;
  if (worker.killed || worker.exitCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    const done = () => resolve();
    const fallback = setTimeout(done, 1500);
    worker.once("close", () => {
      clearTimeout(fallback);
      resolve();
    });
    worker.kill();
  });
}

function getMlWorker() {
  if (mlWorker && !mlWorker.killed) return mlWorker;

  mlWorkerStderr = "";
  mlWorker = spawn(PYTHON_CMD, [mlPredictorPath, "--server"], {
    cwd: __dirname,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const rl = readline.createInterface({ input: mlWorker.stdout });
  rl.on("line", (line) => {
    const pending = mlPending.shift();
    if (!pending) return;
    try {
      const payload = JSON.parse(line);
      if (payload?.error) pending.reject(new Error(payload.error));
      else pending.resolve(payload);
    } catch {
      pending.reject(new Error(`ML worker returned invalid JSON: ${line || mlWorkerStderr}`));
    }
  });

  mlWorker.stderr.on("data", (chunk) => {
    mlWorkerStderr = `${mlWorkerStderr}${chunk}`.slice(-4000);
  });

  const failPending = (message) => {
    while (mlPending.length) {
      mlPending.shift().reject(new Error(message));
    }
  };

  mlWorker.on("error", (err) => {
    failPending(`Could not start ML worker with ${PYTHON_CMD}: ${err.message}`);
    mlWorker = null;
  });

  mlWorker.on("close", (code) => {
    failPending(mlWorkerStderr || `ML worker exited with code ${code}`);
    mlWorker = null;
  });

  return mlWorker;
}

process.on("exit", () => {
  if (mlWorker && !mlWorker.killed) mlWorker.kill();
});

function warmMlWorker() {
  loadIdeaDatasets()
    .then(() => console.log("idea datasets ready"))
    .catch((err) => console.warn(`Idea dataset warmup skipped: ${err.message}`));
}

function decisionFromScore(score) {
  if (score >= 82) return "SCALE THE WEDGE";
  if (score >= 68) return "VALIDATE AGGRESSIVELY";
  if (score >= 54) return "NICHE DOWN";
  if (score >= 40) return "REBUILD THE ANGLE";
  if (score >= 25) return "PROVE DEMAND FIRST";
  return "DROP OR REINVENT";
}

function ideaSignals(idea) {
  const text = norm(idea);
  const customers = [
    ["students", ["student", "school", "college", "learner", "teacher"]],
    ["small businesses", ["small business", "smb", "shop", "store", "local business"]],
    ["founders", ["founder", "startup", "entrepreneur"]],
    ["teams", ["team", "employee", "manager", "company"]],
    ["creators", ["creator", "influencer", "artist", "writer"]],
    ["pet owners", ["pet", "dog", "cat", "veterinary", "vet", "animal"]],
    ["consumers", ["consumer", "user", "people", "personal"]]
  ];
  const models = [
    ["subscription", ["subscription", "monthly", "saas", "paid plan"]],
    ["marketplace", ["marketplace", "commission", "buyers", "sellers"]],
    ["transaction fee", ["fee", "take rate", "payment", "invoice", "bill"]],
    ["enterprise contract", ["enterprise", "b2b", "contract"]],
    ["freemium", ["freemium", "free", "premium"]]
  ];
  const channels = [
    ["school/community partnerships", ["school", "student", "teacher", "education"]],
    ["founder-led outbound", ["b2b", "company", "team", "enterprise"]],
    ["creator-led distribution", ["creator", "content", "social"]],
    ["SEO and templates", ["search", "content", "template"]],
    ["paid acquisition", ["consumer", "app", "mobile"]]
  ];

  const pick = (items, fallback) => {
    const found = items.find(([, keys]) => keys.some((k) => text.includes(k)));
    return found?.[0] || fallback;
  };

  return {
    customer: pick(customers, "a sharply defined first customer"),
    revenueModel: pick(models, "paid pilot"),
    channel: pick(channels, "direct outreach"),
    hasAi: containsAny(text, ["ai", "artificial intelligence", "machine learning", "llm", "chatbot"]),
    hasFunding: /\$|\b\d+\s*(k|m|million|b|billion)\b/i.test(idea),
    hasCustomer: containsAny(text, ["for", "students", "teams", "founders", "businesses", "creators", "parents", "teachers"])
  };
}

function formatMatches(matches, type) {
  if (!matches.length) return `No close ${type} match found in the dataset.`;
  return matches.map((x) => {
    if (type === "success") return `${x.name} (${x.sector}, ${x.funding}, similarity ${x.similarity})`;
    return `${x.name} (${x.whatTheyDid}): ${x.whyFailed || x.takeaway}`;
  }).join("; ");
}

function buildIdeaVariants(signals, sector, topFailure, topSuccess, topReference) {
  const customer = signals.customer;
  const channel = signals.channel;
  const revenue = signals.revenueModel;
  const article = /^[aeiou]/i.test(sector) ? "an" : "a";
  const failureLesson = topFailure?.whyFailed || topFailure?.takeaway || "the nearest failure pattern";
  const successName = topReference?.name || topSuccess?.name || "the nearest success peer";
  return [
    `Wedge version: sell ${article} ${sector} tool only for ${customer}, with one measurable outcome and a ${revenue} offer.`,
    `Anti-failure version: explicitly avoid "${failureLesson}" by making the product useful before any broad AI layer or feature expansion.`,
    `Distribution-first version: build the product around ${channel}, then compare traction against ${successName} instead of generic AI apps.`,
    `Premium version: replace the broad idea with a paid concierge pilot where users pay for the result, not the software.`,
    `Data-moat version: collect proprietary workflow or outcome data that makes the product improve with every user.`
  ];
}

function ideaUseCase(idea, sector) {
  const text = norm(idea);
  if (sector === "pet care") {
    if (containsAny(text, ["symptom", "diagnosis", "diagnose", "sick", "vet", "veterinary", "health"])) {
      return {
        wedge: "vet-backed symptom triage for anxious dog and cat owners before they decide whether to book a visit",
        buyer: "pet owners with recurring vet anxiety",
        channel: "vet clinics, pet insurance communities, and breed-specific owner groups",
        moat: "vet-reviewed triage data, clinic partnerships, safety guardrails, and follow-up outcome data",
        risk: "medical trust and liability, not just app competition"
      };
    }
    return {
      wedge: "one recurring pet-care job that owners already pay to solve",
      buyer: "pet owners",
      channel: "local vets, groomers, shelters, and breed communities",
      moat: "owner history, pet profiles, service-provider relationships, and repeated outcome data",
      risk: "low trust and high customer acquisition cost"
    };
  }

  if (sector === "finance") {
    if (containsAny(text, ["accounting", "invoice", "invoices", "cash flow", "cashflow", "bill", "bills", "bookkeeping"])) {
      return {
        wedge: "invoice-to-cashflow control for small business owners who miss bills or lose visibility after invoices arrive",
        buyer: "small business owners or bookkeepers",
        channel: "accounting firms, QuickBooks/Xero communities, and founder-led outbound to cash-constrained SMBs",
        moat: "banking, invoice, payment-timing, and bookkeeping workflow data that compounds into better cash-flow recommendations",
        risk: "trust, data access, and crowded accounting software positioning"
      };
    }
    return {
      wedge: "one expensive finance workflow where the buyer already pays to reduce risk or save time",
      buyer: ideaSignals(idea).customer,
      channel: "niche finance communities, accountants, advisors, and founder-led outbound",
      moat: "proprietary financial workflow data, integrations, compliance trust, and switching cost",
      risk: "trust, compliance, and customer acquisition cost"
    };
  }

  return {
    wedge: `${sector} workflow with one painful, measurable job`,
    buyer: ideaSignals(idea).customer,
    channel: ideaSignals(idea).channel,
    moat: "proprietary workflow data, distribution, and switching cost",
    risk: "generic positioning"
  };
}

function buildDomainVariants(idea, sector, topFailure, topSuccess, topReference, publicContext = []) {
  const useCase = ideaUseCase(idea, sector);
  const benchmark = topReference?.name || topSuccess?.name || publicContext[0]?.title || "the closest live comparable";
  const failureLesson = sectorRelevantFailureLesson(sector, topFailure, useCase.risk);

  if (sector !== "pet care") {
    const signals = ideaSignals(idea);
    const successName = topReference?.name || topSuccess?.name || "the nearest success peer";
    return [
      `Wedge version: build a narrow product around ${useCase.wedge}, aimed at ${useCase.buyer}, with one measurable outcome and a ${signals.revenueModel} offer.`,
      `Anti-failure version: explicitly avoid "${failureLesson}" by making the product useful before any broad AI layer or feature expansion.`,
      `Distribution-first version: build the product around ${useCase.channel}, then compare traction against ${successName} instead of generic AI apps.`,
      `Premium version: replace the broad idea with a paid concierge pilot where users pay for the result, not the software.`,
      `Data-moat version: collect ${useCase.moat} so the product becomes harder to copy with every customer.`
    ];
  }

  return [
    `Wedge version: start with ${useCase.wedge}; do not claim diagnosis, route owners to the right next action.`,
    `Trust-first version: build a vet-reviewed triage flow and explicitly avoid "${failureLesson}" with disclaimers, escalation rules, and human review for scary cases.`,
    `Distribution-first version: acquire users through ${useCase.channel}, then benchmark retention against ${benchmark}.`,
    `Premium version: sell a paid monthly "pet health navigator" for owners of puppies, senior pets, or chronic-condition pets.`,
    `Data-moat version: collect structured symptom, breed, age, action, and outcome data so the product improves beyond a generic chatbot.`
  ];
}

function sectorRelevantFailureLesson(sector, topFailure, fallback) {
  const lesson = safeText(topFailure?.whyFailed || topFailure?.takeaway);
  if (!lesson) return fallback;
  if (sector !== "pet care") return lesson;

  const petCareSignals = [
    "pet", "dog", "cat", "vet", "veterinary", "animal", "owner", "breed",
    "trust", "health", "symptom", "triage", "consumer", "care"
  ];
  return petCareSignals.some((signal) => lesson.toLowerCase().includes(signal))
    ? lesson
    : fallback;
}

function buildDomainExperiments(idea, sector, variants) {
  const useCase = ideaUseCase(idea, sector);
  if (sector === "pet care") {
    return [
      `Run a landing-page test: "AI pet symptom checker" vs "vet-backed triage before you panic-book"; track email signup and booked-call intent.`,
      `Partner with 2 local vets for a concierge pilot: owners submit symptoms, you return a safe next-step recommendation reviewed by a vet.`,
      `Collect 50 real owner cases and label outcomes: emergency, routine vet visit, monitor at home, or product/service recommendation.`
    ];
  }
  return [
    `Interview 10 ${useCase.buyer} and ask them to rank the exact pain, current workaround, budget owner, and urgency before showing the product.`,
    `Concierge pilot: manually deliver ${useCase.wedge} for 3 paying customers before building automation.`,
    `Landing page A/B test: broad positioning vs "${variants[0]}"; measure qualified calls booked, not just email signups.`
  ];
}

function buildMistakePredictor(idea, sector, riskList) {
  const useCase = ideaUseCase(idea, sector);
  if (sector === "pet care") {
    return `The likely mistake is overclaiming what AI can safely decide. Keep the product in triage, routing, and preparation until you have vet-reviewed outcome data. Dataset warning pattern: ${riskList}.`;
  }
  return `The likely mistake is staying too broad: a generic ${sector} product will be easy to ignore and easy to copy. Narrow the first customer, prove ${useCase.wedge}, and watch the dataset warning pattern: ${riskList}.`;
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
    if (hasAi) queries.add(`AI ${sector} startup company`);
    queries.add(`${sector} technology startup company`);
  } else if (words.length) {
    queries.add(`${words.slice(0, 4).join(" ")} startup company`);
  }
  if (words.length) queries.add(`${words.slice(0, 5).join(" ")} competitors`);
  return [...queries].filter(Boolean).slice(0, 3);
}

const IDEA_SECTOR_KEYWORDS = {
  pet_care: ["pet", "pets", "dog", "dogs", "cat", "cats", "veterinary", "vet", "animal", "grooming"],
  finance: ["finance", "fintech", "bank", "loan", "insurance", "payment", "wallet", "invest", "credit", "accounting", "invoice", "invoices", "cash flow", "cashflow", "bill", "bills", "payroll", "bookkeeping", "tax"],
  health_care: ["health", "medical", "doctor", "hospital", "patient", "clinic", "medicine", "therapy", "diagnosis"],
  education: ["education", "school", "student", "teacher", "learn", "course", "tutor", "exam", "edtech"],
  retail: ["retail", "shop", "store", "commerce", "marketplace", "delivery", "fashion", "consumer"],
  food_services: ["food", "restaurant", "meal", "cafe", "kitchen", "hotel", "hospitality"],
  manufacturing: ["manufacturing", "factory", "hardware", "industrial", "supply chain", "logistics"],
  information: ["software", "app", "platform", "saas", "web", "mobile", "ai", "data", "analytics", "automation", "cloud"]
};

function inferIdeaSector(text) {
  const lower = norm(text);
  let best = "information";
  let bestScore = 0;
  for (const [sector, keywords] of Object.entries(IDEA_SECTOR_KEYWORDS)) {
    const weight = sector === "information" ? 0.45 : 1;
    const score = keywords.filter((keyword) => textHasTerm(lower, keyword)).length * weight;
    if (score > bestScore) {
      best = sector;
      bestScore = score;
    }
  }
  return best;
}

function normalizeIdeaSector(value) {
  const text = norm(value);
  if (!text || text === "nan" || text === "none") return "unknown";
  for (const [sector, keywords] of Object.entries(IDEA_SECTOR_KEYWORDS)) {
    if (keywords.some((keyword) => textHasTerm(text, keyword))) return sector;
  }
  return text.split("|")[0].replace(/\s+/g, "_").slice(0, 40);
}

function textHasTerm(text, term) {
  const normalizedText = norm(text);
  const normalizedTerm = norm(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return normalizedText.includes(normalizedTerm);
  return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(normalizedText);
}

function ideaTokens(text) {
  return new Set(splitKeywords(text).filter((token) => token.length > 2));
}

function tokenSimilarity(queryTokens, text) {
  if (!queryTokens.size) return 0;
  const textTokens = ideaTokens(text);
  if (!textTokens.size) return 0;
  let hits = 0;
  for (const token of queryTokens) if (textTokens.has(token)) hits += 1;
  return hits / Math.sqrt(queryTokens.size * textTokens.size);
}

function tokenHitCount(queryTokens, text) {
  const textTokens = ideaTokens(text);
  let hits = 0;
  for (const token of queryTokens) if (textTokens.has(token)) hits += 1;
  return hits;
}

function rowPick(row, ...names) {
  const entries = Object.entries(row || {});
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (found) return safeText(found[1]);
  }
  return "";
}

function compactUsd(value) {
  const amount = Number(String(value || "").replace(/[$,]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return safeText(value) || "unknown";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${Math.round(amount)}`;
}

async function loadIdeaDatasets() {
  if (ideaDatasetsPromise) return ideaDatasetsPromise;
  const readCsv = (fileName) => readFile(path.join(ideaDataDir, fileName), "utf8").then(parseCsv).catch(() => []);
  ideaDatasetsPromise = Promise.all([
    readCsv("final_training_data_v2.csv"),
    readCsv("master_failure_dataset.csv"),
    readCsv("yc_companies.csv"),
    readCsv("Y_Combinator_2025.csv"),
    readCsv("AI_Companies.csv")
  ]).then(([training, failures, yc, yc2025, aiCompanies]) => ({ training, failures, references: [...yc, ...yc2025, ...aiCompanies] }));
  return ideaDatasetsPromise;
}

function nearestIdeaRows(idea, rows, buildText, limit = 3, requiredTerms = []) {
  const queryTokens = ideaTokens(idea);
  return rows
    .map((row) => {
      const text = buildText(row);
      return { row, text, hits: tokenHitCount(queryTokens, text), similarity: tokenSimilarity(queryTokens, text) };
    })
    .filter((item) => {
      const sectorRelevant = !requiredTerms.length || requiredTerms.some((term) => textHasTerm(item.text, term));
      return sectorRelevant && item.hits >= 2 && item.similarity > 0;
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

function topIdeaRiskPatterns(rows) {
  const riskColumns = [
    "Giants", "No Budget", "Competition", "Poor Market Fit", "Acquisition Stagnation",
    "Platform Dependency", "Monetization Failure", "Niche Limits", "Execution Flaws",
    "Trend Shifts", "Toxicity/Trust Issues", "Regulatory Pressure", "Overhype", "High Operational Costs"
  ];
  return riskColumns
    .map((risk) => {
      const values = rows.map((row) => Number(rowPick(row, risk)) || 0);
      const rate = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return { risk, rate };
    })
    .filter((item) => item.rate > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);
}

function isUsefulPublicIdeaContext(item, idea, features = {}) {
  const title = norm(item?.title);
  const text = norm(`${item?.title || ""} ${item?.description || ""} ${item?.extract || ""}`);
  const genericTitles = new Set([
    "artificial intelligence",
    "artificial intelligence act",
    "startup company",
    "technology company",
    "software company"
  ]);
  if (genericTitles.has(title)) return false;
  if (containsAny(text, ["university", "regulation", "law", "act of", "public university"])) return false;

  const sector = safeText(features.sector_group || "");
  const queryTokens = ideaTokens(idea);
  const hits = tokenHitCount(queryTokens, text);
  const sectorTerms = IDEA_SECTOR_KEYWORDS[sector] || [];
  const sectorHit = sectorTerms.some((term) => textHasTerm(text, term));
  const companyHit = containsAny(text, ["startup", "company", "founded", "platform", "app", "service", "marketplace"]);
  return companyHit && (hits >= 2 || sectorHit);
}

function decodeHtml(text) {
  return safeText(text)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(text) {
  return decodeHtml(String(text || "").replace(/<[^>]+>/g, " "));
}

async function getSearchIdeaContext(query, idea, features = {}) {
  const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}`).catch(() => "");
  if (!html) return [];
  const blocks = html.split(/<li class="b_algo"/).slice(1, 8);
  return blocks.map((block) => {
    const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    return {
      query,
      title: stripHtml(linkMatch?.[2] || ""),
      description: stripHtml(snippetMatch?.[1] || ""),
      extract: stripHtml(snippetMatch?.[1] || ""),
      url: decodeHtml(linkMatch?.[1] || ""),
      source: "web-search"
    };
  }).filter((item) => item.title && isUsefulPublicIdeaContext(item, idea, features));
}

async function runFastIdeaModel(payload) {
  const idea = safeText(payload.idea);
  const datasets = await loadIdeaDatasets();
  const features = {
    funding_total_usd: Number(payload.funding_total_usd || payload.fundingTotalUsd || 0) || 0,
    company_age: Number(payload.company_age || payload.companyAge || 1) || 1,
    sector_group: safeText(payload.sector_group || payload.sectorGroup) || inferIdeaSector(idea),
    funding_log1p: Math.log1p(Number(payload.funding_total_usd || payload.fundingTotalUsd || 0) || 0)
  };

  const trainingWithSector = datasets.training.map((row) => ({ ...row, _sectorGroup: normalizeIdeaSector(rowPick(row, "sector")) }));
  const successRows = trainingWithSector.filter((row) => rowPick(row, "target") === "1");
  const labeledFailureRows = trainingWithSector.filter((row) => rowPick(row, "target") === "0");
  const failureRows = datasets.failures.map((row) => ({ ...row, _sectorGroup: normalizeIdeaSector(rowPick(row, "Sector")) }));

  const filterBySector = (rows, minRows) => {
    const sectorRows = rows.filter((row) => row._sectorGroup === features.sector_group);
    return sectorRows.length >= minRows ? sectorRows : rows;
  };

  const successPool = filterBySector(successRows, 5);
  const failurePool = filterBySector(failureRows, 3);
  const labeledFailurePool = filterBySector(labeledFailureRows, 5);
  const referenceRows = datasets.references;
  const requiredTerms = features.sector_group === "information" ? [] : IDEA_SECTOR_KEYWORDS[features.sector_group] || [];

  const successfulMatches = nearestIdeaRows(
    idea,
    successPool,
    (row) => `${rowPick(row, "company_name", "name")} ${rowPick(row, "sector")} ${rowPick(row, "description", "company_description", "long_description")}`,
    3,
    requiredTerms
  ).map(({ row, similarity }) => ({
    name: rowPick(row, "company_name", "name"),
    sector: rowPick(row, "sector"),
    funding: compactUsd(rowPick(row, "funding_total_usd")),
    companyAge: Number(rowPick(row, "company_age")) || null,
    similarity: Number(similarity.toFixed(3)),
    similarityMethod: "fast-token-dataset"
  }));

  const failureMatches = nearestIdeaRows(
    idea,
    failurePool,
    (row) => `${rowPick(row, "Name")} ${rowPick(row, "Sector")} ${rowPick(row, "What They Did")} ${rowPick(row, "Why They Failed")} ${rowPick(row, "Takeaway")}`,
    3,
    requiredTerms
  ).map(({ row, similarity }) => ({
    name: rowPick(row, "Name"),
    sector: rowPick(row, "Sector"),
    whatTheyDid: rowPick(row, "What They Did"),
    funding: rowPick(row, "How Much They Raised"),
    whyFailed: rowPick(row, "Why They Failed"),
    takeaway: rowPick(row, "Takeaway"),
    similarity: Number(similarity.toFixed(3)),
    similarityMethod: "fast-token-dataset"
  }));

  const referenceMatches = nearestIdeaRows(
    idea,
    referenceRows,
    (row) => `${rowPick(row, "company_name", "name", "Company_Name", "Company")} ${rowPick(row, "long_description", "company_description", "description", "one_liner", "Use_Case")} ${rowPick(row, "industry", "industries", "Industry", "category_list")}`,
    6,
    requiredTerms
  ).map(({ row, similarity }) => ({
    name: rowPick(row, "company_name", "name", "Company_Name", "Company"),
    sector: rowPick(row, "industry", "industries", "Industry", "category_list") || "unknown",
    description: rowPick(row, "long_description", "company_description", "description", "one_liner", "Use_Case"),
    status: rowPick(row, "status", "stage", "Company_Type") || "reference",
    batch: rowPick(row, "batch", "batch_name", "Year"),
    url: rowPick(row, "website", "company_url", "Website"),
    sourceFile: "local datasets",
    similarity: Number(similarity.toFixed(3)),
    similarityMethod: "fast-token-dataset"
  }));

  const bestSimilarity = Math.max(0, ...successfulMatches.map((x) => x.similarity), ...failureMatches.map((x) => x.similarity), ...referenceMatches.map((x) => x.similarity));
  const failurePenalty = Math.min(0.18, (failureMatches[0]?.similarity || 0) * 0.55);
  const successBoost = Math.min(0.2, Math.max(successfulMatches[0]?.similarity || 0, referenceMatches[0]?.similarity || 0) * 0.7);
  const sectorBoost = features.sector_group === "information" ? 0.03 : 0.01;
  const successProbability = Math.max(0.05, Math.min(0.95, 0.56 + successBoost + sectorBoost - failurePenalty));

  return {
    prediction: successProbability >= 0.62 ? 1 : 0,
    label: successProbability >= 0.62 ? "success" : "failure",
    successProbability,
    failureProbability: 1 - successProbability,
    threshold: 0.62,
    features,
    comparables: {
      sectorGroup: features.sector_group,
      successfulMatches,
      failureMatches,
      referenceMatches,
      sectorRiskPatterns: topIdeaRiskPatterns(labeledFailurePool),
      sampleSizes: {
        successRows: successPool.length,
        failureRows: failurePool.length
      },
      retrievalModel: "fast-token-dataset",
      bestDatasetSimilarity: bestSimilarity
    },
    modelPath: "fast-node-dataset-analyzer"
  };
}

async function getPublicIdeaContext(idea, features = {}) {
  const queries = extractIdeaQueries(idea, features);
  const queryResults = await Promise.all(queries.map(async (query) => {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(query)}`;
    const search = await fetchJson(searchUrl).catch(() => null);
    const summaries = await Promise.all((search?.query?.search || []).map(async (item) => {
      const summary = await cachedAsync(
        wikiCache,
        norm(item.title),
        LIVE_CACHE_TTL_MS,
        () => getWikipediaSummaryFromTitle(item.title).catch(() => null)
      );
      if (!summary?.extract) return null;
      return {
        query,
        title: summary.title,
        description: summary.description || "",
        extract: summary.extract,
        url: summary.pageUrl,
        source: "wikipedia"
      };
    }));
    return summaries.filter(Boolean);
  }));
  const wikiResults = queryResults.flat();
  const webResults = wikiResults.length >= 2
    ? []
    : (await Promise.all(queries.map((query) => getSearchIdeaContext(query, idea, features)))).flat();
  const results = [...wikiResults, ...webResults];
  const seen = new Set();
  return results.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return isUsefulPublicIdeaContext(item, idea, features);
  }).slice(0, 5);
}

function buildMlIdeaAnalysis(idea, ml) {
  const scoreDetails = calibrateIdeaScore(idea, ml);
  const score = scoreDetails.score;
  const decision = decisionFromScore(score);
  const features = ml.features || {};
  const comparables = ml.comparables || {};
  const successfulMatches = comparables.successfulMatches || [];
  const failureMatches = comparables.failureMatches || [];
  const referenceMatches = comparables.referenceMatches || [];
  const publicContext = ml.publicContext || [];
  const riskPatterns = comparables.sectorRiskPatterns || [];
  const sector = safeText(features.sector_group || "information").replace(/_/g, " ");
  const funding = Number(features.funding_total_usd || 0);
  const age = Number(features.company_age || 0);
  const fundingSignal = funding > 0 ? `reported funding of $${Math.round(funding).toLocaleString("en-US")}` : "no clear funding signal in the idea text";
  const ageSignal = age > 1 ? `${Math.round(age)} years of operating history` : "an early-stage company profile";
  const topSuccess = successfulMatches[0];
  const topFailure = failureMatches[0];
  const topReference = referenceMatches[0];
  const topRisk = riskPatterns[0];
  const signals = ideaSignals(idea);
  const scoreLabel = ml.modelPath === "fast-node-dataset-analyzer" ? "calibrated dataset score" : "calibrated XGBoost score";
  const sectorUseCase = ideaUseCase(idea, sector);
  const upsideReference = topReference?.name || topSuccess?.name || (publicContext[0]?.title ? `${publicContext[0].title} from live context` : "no close comparable");
  const downsideReference = topFailure?.name || "no close failed comparable";

  const decisionReason = `${decision}: the ${scoreLabel} is ${score}/100 from ${sector}, ${fundingSignal}, and ${ageSignal}. The closest useful benchmark is ${upsideReference}; the real risk is ${sectorUseCase.risk}, with ${topRisk?.risk || "unclear differentiation"} showing up in the dataset risk profile.`;

  const successList = formatMatches(successfulMatches, "success");
  const failureList = formatMatches(failureMatches, "failure");
  const riskList = riskPatterns.length
    ? riskPatterns.map((x) => `${x.risk} (${Math.round(x.rate * 100)}% of nearby failure rows)`).join(", ")
    : "No dominant sector risk pattern found.";
  const variants = buildDomainVariants(idea, sector, topFailure, topSuccess, topReference, publicContext);
  const referenceList = referenceMatches.length
    ? referenceMatches.map((x) => `${x.name} (${x.sector || x.sourceFile}: ${x.description || x.status})`).join("; ")
    : "No YC/AI reference match found in the added datasets.";
  const publicList = publicContext.length
    ? publicContext.map((x) => `${x.title}: ${safeText(x.description || x.extract).slice(0, 120)}`).join("; ")
    : "No extra public-source context was needed or available.";
  const refinedIdeas = [
    `${variants[0]} Use ${topReference?.name || topSuccess?.name || "the closest dataset reference"} as the benchmark, not a generic AI app.`,
    `${variants[3]} Package it around a paid outcome and compare conversion against the nearest failure: ${topFailure?.name || "the closest failed startup"}.`,
    `${variants[4]} The dataset-backed moat must be stronger than ${topRisk?.risk || "the top retrieved risk"}.`
  ];

  return {
    viabilityScore: score,
    decision,
    decisionReason,
    marketPotential: clampScore(score + (sector === "information" ? 4 : 0)),
    executionFeasibility: clampScore(72 - Math.min(30, Math.round(funding / 1_000_000))),
    defensibility: clampScore(35 + Math.min(35, Math.round(funding / 250_000)) + Math.min(15, Math.round(age * 2))),
    capitalEfficiency: clampScore(funding > 0 ? 65 - Math.min(35, Math.round(funding / 500_000)) : 78),
    mutations: [
      ...variants.slice(0, 3)
    ],
    crazyPivot: topFailure?.takeaway
      ? `Invert the ${topFailure.name} failure: ${topFailure.whyFailed || topFailure.takeaway}. Build the smallest paid product that proves the opposite.`
      : `Turn the idea into ${sectorUseCase.wedge}, sold through ${sectorUseCase.channel}.`,
    copycatRisk: buildCopycatMoat(idea, sector, successList, failureList, referenceList, publicList, publicContext),
    liveExperiments: buildDomainExperiments(idea, sector, variants),
    mistakePredictor: buildMistakePredictor(idea, sector, riskList),
    hiddenOpportunity: topSuccess?.name
      ? `Use ${topSuccess.name} as the success reference, but choose a narrower customer and a more painful job-to-be-done so you are not competing as a generic ${sector} product.`
      : `The strongest opportunity is ${sectorUseCase.wedge}, because it sits next to an urgent paid behavior instead of a casual wellness feature.`,
    advancedFeedback: {
      verdict: decision,
      retrievalModel: comparables.retrievalModel || "unknown",
      ideaVariants: variants,
      refinedIdeas,
      successComparables: successfulMatches,
      failureComparables: failureMatches,
      referenceComparables: referenceMatches,
      publicContext,
      sectorRisks: riskPatterns,
      nextMove: refinedIdeas[0]
    },
    ml: {
      model: "CTGAN-balanced XGBoost strict model",
      successProbability: ml.successProbability,
      failureProbability: ml.failureProbability,
      threshold: ml.threshold,
      prediction: ml.label,
      calibratedScore: score,
      scoreDetails,
      features,
      comparables
    }
  };
}

function calibrateIdeaScore(idea, ml) {
  const comparables = ml.comparables || {};
  const successMatches = comparables.successfulMatches || [];
  const failureMatches = comparables.failureMatches || [];
  const referenceMatches = comparables.referenceMatches || [];
  const riskPatterns = comparables.sectorRiskPatterns || [];
  const signals = ideaSignals(idea);
  const base = clampScore(Number(ml.successProbability || 0.5) * 100);
  const bestSuccess = Math.max(0, ...(successMatches || []).map((x) => Number(x.similarity || 0)));
  const bestReference = Math.max(0, ...(referenceMatches || []).map((x) => Number(x.similarity || 0)));
  const bestFailure = Math.max(0, ...(failureMatches || []).map((x) => Number(x.similarity || 0)));
  const bestPositive = Math.max(bestSuccess, bestReference);
  const primaryRiskRate = Number(riskPatterns[0]?.rate || 0);
  const sampleSizes = comparables.sampleSizes || {};
  const sampleDepth = Math.min(1, (Number(sampleSizes.successRows || 0) + Number(sampleSizes.failureRows || 0)) / 300);

  const evidenceBoost = Math.min(12, bestPositive * 38);
  const failurePenalty = Math.min(16, bestFailure * 42 + primaryRiskRate * 8);
  const clarityBoost = (signals.hasCustomer ? 4 : -5) + (signals.revenueModel !== "paid pilot" ? 3 : -2);
  const aiPenalty = signals.hasAi && !/data|workflow|proprietary|model|automation|agent/i.test(idea) ? 4 : 0;
  const fundingBoost = signals.hasFunding ? 2 : 0;
  const confidenceShrink = (1 - sampleDepth) * 0.18;
  const evidenceAdjusted = base + evidenceBoost - failurePenalty + clarityBoost - aiPenalty + fundingBoost;
  const calibrated = 50 + (evidenceAdjusted - 50) * (1 - confidenceShrink);

  return {
    score: clampScore(calibrated),
    rawModelScore: base,
    evidenceBoost: Math.round(evidenceBoost),
    failurePenalty: Math.round(failurePenalty),
    clarityAdjustment: clarityBoost - aiPenalty + fundingBoost,
    sampleDepth: Number(sampleDepth.toFixed(2)),
    bestPositiveSimilarity: Number(bestPositive.toFixed(3)),
    bestFailureSimilarity: Number(bestFailure.toFixed(3)),
    dominantRiskRate: Number(primaryRiskRate.toFixed(2)),
    explanation: "Score is calibrated from model probability, nearest success/reference matches, nearest failure matches, idea clarity, and dataset depth."
  };
}

function parseJsonObject(text) {
  const raw = safeText(text);
  if (!raw) throw new Error("Empty JSON response");
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found");
    return JSON.parse(match[0]);
  }
}

function normalizeStringArray(value, fallback = []) {
  const items = Array.isArray(value) ? value : fallback;
  return items.map((item) => safeText(item)).filter(Boolean).slice(0, 4);
}

function mergeGeminiIdeaFeedback(base, refined, model) {
  const merged = { ...base };
  const textFields = ["decisionReason", "crazyPivot", "copycatRisk", "mistakePredictor", "hiddenOpportunity"];
  for (const field of textFields) {
    const value = safeText(refined?.[field]);
    if (value) merged[field] = value;
  }

  merged.mutations = normalizeStringArray(refined?.mutations, base.mutations);
  merged.liveExperiments = normalizeStringArray(refined?.liveExperiments, base.liveExperiments);

  for (const field of ["marketPotential", "executionFeasibility", "defensibility", "capitalEfficiency"]) {
    if (Number.isFinite(Number(refined?.[field]))) merged[field] = clampScore(Number(refined[field]));
  }

  const nextMove = safeText(refined?.nextMove);
  merged.advancedFeedback = {
    ...(base.advancedFeedback || {}),
    geminiReview: safeText(refined?.scoreReview),
    geminiVerification: safeText(refined?.verificationSummary),
    geminiEvidenceWarnings: normalizeStringArray(refined?.evidenceWarnings, []),
    geminiNextMove: nextMove,
    nextMove: nextMove || base.advancedFeedback?.nextMove,
    personalizedAdvice: safeText(refined?.personalizedAdvice)
  };

  merged.llm = {
    provider: "gemini",
    model,
    role: "model-output reviewer and personalized feedback writer",
    used: true
  };
  return merged;
}

async function refineIdeaWithGemini(idea, baseAnalysis, fields = {}) {
  if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
    return {
      ...baseAnalysis,
      llm: { provider: "gemini", model: GEMINI_IDEA_MODEL, used: false, reason: "Missing Gemini API key" }
    };
  }

  const model = GEMINI_IDEA_MODEL;
  const compactModelOutput = {
    idea,
    sector: baseAnalysis?.ml?.features?.sector_group,
    modelScore: baseAnalysis.viabilityScore,
    rawModelScore: baseAnalysis?.ml?.scoreDetails?.rawModelScore,
    scoreDetails: baseAnalysis?.ml?.scoreDetails,
    decision: baseAnalysis.decision,
    modelReason: baseAnalysis.decisionReason,
    marketPotential: baseAnalysis.marketPotential,
    executionFeasibility: baseAnalysis.executionFeasibility,
    defensibility: baseAnalysis.defensibility,
    capitalEfficiency: baseAnalysis.capitalEfficiency,
    successComparables: (baseAnalysis.advancedFeedback?.successComparables || []).slice(0, 3),
    failureComparables: (baseAnalysis.advancedFeedback?.failureComparables || []).slice(0, 3),
    sectorRisks: (baseAnalysis.advancedFeedback?.sectorRisks || []).slice(0, 3),
    candidateMutations: baseAnalysis.mutations,
    candidateExperiments: baseAnalysis.liveExperiments,
    requestedSector: fields.sector_group || fields.sectorGroup || ""
  };

  const prompt = `You are a startup feedback reviewer. The local ML model already produced the score and evidence below.

Rules:
- Do not invent new numeric scores. Keep the model score as the authority.
- First verify the evidence. If a comparable, risk, or lesson is irrelevant to the user's idea, ignore it and say so in evidenceWarnings.
- Do not repeat awkward dataset labels, irrelevant competitor examples, or generic phrases like "Giants" unless the evidence clearly supports them.
- Review whether the score feels directionally justified from the evidence, including any uncertainty.
- Rewrite the feedback so it is personalized, specific, and useful to a founder.
- Keep output practical: what to change, what to test, what risk to watch.
- The user should feel the answer was checked by a second model, not just paraphrased.
- Return only JSON.

Local model output:
${JSON.stringify(compactModelOutput, null, 2)}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            decisionReason: { type: Type.STRING },
            verificationSummary: { type: Type.STRING },
            evidenceWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            scoreReview: { type: Type.STRING },
            personalizedAdvice: { type: Type.STRING },
            mutations: { type: Type.ARRAY, items: { type: Type.STRING } },
            crazyPivot: { type: Type.STRING },
            copycatRisk: { type: Type.STRING },
            liveExperiments: { type: Type.ARRAY, items: { type: Type.STRING } },
            mistakePredictor: { type: Type.STRING },
            hiddenOpportunity: { type: Type.STRING },
            nextMove: { type: Type.STRING },
            marketPotential: { type: Type.INTEGER },
            executionFeasibility: { type: Type.INTEGER },
            defensibility: { type: Type.INTEGER },
            capitalEfficiency: { type: Type.INTEGER }
          },
          required: ["decisionReason", "verificationSummary", "evidenceWarnings", "scoreReview", "personalizedAdvice", "mutations", "crazyPivot", "copycatRisk", "liveExperiments", "mistakePredictor", "hiddenOpportunity", "nextMove"]
        }
      }
    });
    return mergeGeminiIdeaFeedback(baseAnalysis, JSON.parse(response.text), model);
  } catch (err) {
    console.warn(`Gemini idea refinement unavailable, returning model feedback: ${err.message}`);
    return {
      ...baseAnalysis,
      llm: {
        provider: "gemini",
        model,
        used: false,
        error: err.message
      }
    };
  }
}

async function analyzeIdeaText(idea, fields = {}) {
  const t = safeText(idea);
  if (!t || t.length < 10) throw new Error("Idea too short");
  const usePublicSetting = fields.usePublicContext ?? fields.useLiveContext ?? fields.useWebContext;
  const cacheKey = JSON.stringify({
    idea: norm(t),
    sector: fields.sector_group || fields.sectorGroup || "",
    funding: fields.funding_total_usd || fields.fundingTotalUsd || "",
    age: fields.company_age || fields.companyAge || "",
    live: usePublicSetting ?? "auto"
  });

  return cachedAsync(ideaAnalysisCache, cacheKey, IDEA_CACHE_TTL_MS, async () => {
  const ml = await runStartupModel({ ...fields, idea: t }).catch(async (err) => {
    console.warn(`Python ML model unavailable, falling back to fast dataset scorer: ${err.message}`);
    const fallback = await runFastIdeaModel({ ...fields, idea: t });
    fallback.fallbackReason = err.message;
    return fallback;
  });
  const bestDatasetSimilarity = Math.max(
    0,
    ...(ml.comparables?.successfulMatches || []).map((x) => Number(x.similarity || 0)),
    ...(ml.comparables?.failureMatches || []).map((x) => Number(x.similarity || 0)),
    ...(ml.comparables?.referenceMatches || []).map((x) => Number(x.similarity || 0)),
    Number(ml.comparables?.bestDatasetSimilarity || 0)
  );
  const hasDatasetMatches = bestDatasetSimilarity >= IDEA_DATASET_MATCH_THRESHOLD;
  const forceLive = usePublicSetting === true || usePublicSetting === "true";
  const skipLive = usePublicSetting === false || usePublicSetting === "false";
  const shouldUseLive = forceLive || (!skipLive && !hasDatasetMatches);

  if (shouldUseLive) {
    const liveKey = JSON.stringify({ idea: norm(t), sector: ml.features?.sector_group || "" });
    ml.publicContext = await withTimeout(
      cachedAsync(publicIdeaCache, liveKey, LIVE_CACHE_TTL_MS, () => getPublicIdeaContext(t, ml.features).catch(() => [])),
      IDEA_LIVE_TIMEOUT_MS,
      []
    );
  } else {
    ml.publicContext = [];
  }
  const firstStage = buildMlIdeaAnalysis(t, ml);
  await stopMlWorker();
  const result = await refineIdeaWithGemini(t, firstStage, fields);
  result.contextStrategy = {
    datasetFirst: true,
    geminiReviewPass: result.llm?.provider === "gemini" && result.llm?.used === true,
    bestDatasetSimilarity: Number(bestDatasetSimilarity.toFixed(3)),
    usedLiveContext: shouldUseLive && ml.publicContext.length > 0,
    liveContextTimedOutOrEmpty: shouldUseLive && ml.publicContext.length === 0,
    reason: hasDatasetMatches
      ? "Dataset matches were strong enough, so live lookup was skipped."
      : "Dataset matches were weak, so live context was attempted with a short timeout."
  };
  return result;
  });
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
      topMetrics: {
        type: Type.OBJECT,
        properties: {
          survivabilityScore: { type: Type.INTEGER },
          fundingLikelihood: { type: Type.INTEGER },
          marketFitScore: { type: Type.INTEGER },
          burnRunway: { type: Type.STRING }
        }
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
              }
            }
          }
        }
      },
      failureTimeline: { type: Type.STRING },
      investorReaction: { type: Type.STRING },
      userReaction: { type: Type.STRING },
      strategicMoves: { type: Type.STRING },
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

function enrichSimulationData(sim) {
  const visible = sim.visible || {};
  const lesson = sim.lesson || {};
  const round = sim.round || {};

  const topMetrics = sim.topMetrics || {
    survivabilityScore: sim.topMetrics?.survivabilityScore ?? Math.round((simNumber(visible.healthScore) + simNumber(visible.retention) + simNumber(visible.growth)) / 3),
    fundingLikelihood: sim.topMetrics?.fundingLikelihood ?? simNumber(visible.investorInterest || visible.investorConfidence),
    marketFitScore: sim.topMetrics?.marketFitScore ?? simNumber(visible.growth || visible.retention),
    burnRunway: sim.topMetrics?.burnRunway ?? (typeof visible.runwayMonths === "number" ? `${visible.runwayMonths} months` : "--")
  };

  const timeline = sim.timeline || (round ? [
    {
      period: `Month ${round.month || 1}`,
      title: round.title || round.stage || "Current phase",
      narrative: round.narrative || round.randomEvent || "",
      metrics: {
        users: visible.users != null ? `${Math.round(visible.users).toLocaleString("en-US")} users` : "--",
        revenue: visible.revenue != null ? `$${Math.round(visible.revenue).toLocaleString("en-US")}` : "--",
        retention: visible.retention != null ? `${visible.retention}%` : "--",
        keyEvent: round.randomEvent || ""
      }
    }
  ] : []);

  return {
    ...sim,
    topMetrics,
    timeline,
    failureTimeline: sim.failureTimeline || sim.patternMatch || "",
    investorReaction: sim.investorReaction || (typeof visible.investorInterest === "number" ? `Investor interest is around ${visible.investorInterest}/100.` : ""),
    userReaction: sim.userReaction || (typeof visible.retention === "number" ? `Early user retention is around ${visible.retention}%.` : ""),
    strategicMoves: sim.strategicMoves || [lesson.beginnerChoice, lesson.smartChoice].filter(Boolean).join("\n")
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

  return enrichSimulationData({
    summary: `You are starting with ${moneyText(cash)} in cash and about ${runwayMonths} months of runway. The simulation will reward evidence from customers over theatrical momentum.`,
    patternMatch: "Your path currently resembles early Airbnb-style manual learning, with a possible Quibi-style risk if you overbuild before proving demand.",
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
    history: []
  });
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

  try {
    const modelResult = await runSimulationModel({ action: "start", founder, startup });
    return enrichSimulationData(modelResult);
  } catch (err) {
    console.error("Python simulation model error:", err?.message || err);
  }

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
    return enrichSimulationData({
      ...result,
      founder,
      startup,
      history: Array.isArray(result.history) ? result.history : []
    });
  } catch (err) {
    console.error("Simulation LLM Error:", err?.message || err);
    console.log("Falling back to deterministic simulation...");
    return fallbackInitialSimulation(founder, startup);
  }
}

async function advanceSimulation(state, choiceId, allocation, strategicAnswer, actorDecision = null) {
  const compactState = compactSimState(state);
  const chosen = (compactState.round?.choices || []).find((c) => c.id === choiceId) || { id: "BUDGET", label: "Operating budget", allocation };

  if (state?.modelState && state?.modelScenario) {
    try {
      const modelResult = await runSimulationModel({ action: "decision", state, choiceId, allocation, strategicAnswer, actorDecision });
      return enrichSimulationData(modelResult);
    } catch (err) {
      console.error("Python simulation decision error:", err?.message || err);
    }
  }

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
    return enrichSimulationData({
      ...result,
      founder: compactState.founder,
      startup: compactState.startup
    });
  } catch (err) {
    console.error("Decision LLM Error:", err);
    return enrichSimulationData(fallbackAdvanceSimulation(state, choiceId));
  }
}
async function analyze(company) {
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

function runLearningEngine(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_CMD, [learningEnginePath], {
      cwd: path.dirname(learningEnginePath),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Learning engine timed out"));
    }, 20000);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(stderr || `Learning engine exited with code ${code}`));
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (err) {
        reject(new Error(`Learning engine returned invalid JSON: ${err.message}`));
      }
    });
    child.stdin.end(JSON.stringify(payload || {}));
  });
}

function runSimulationModel(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_CMD, [simulationEnginePath], {
      cwd: path.dirname(simulationEnginePath),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Simulation model timed out"));
    }, 20000);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(stderr || `Simulation model exited with code ${code}`));
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (err) {
        reject(new Error(`Simulation model returned invalid JSON: ${err.message}`));
      }
    });
    child.stdin.end(JSON.stringify(payload || {}));
  });
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
      const result = await analyzeIdeaText(idea, body);
      return json(res, 200, {
        product: "Startup Sandbox",
        mode: "idea",
        engine: "local-ctgan-xgboost",
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

    if (req.method === "POST" && url.pathname === "/api/learning") {
      let raw = "";
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", resolve);
        req.on("error", reject);
      });
      const body = JSON.parse(raw || "{}");
      const action = safeText(body.action) || "analyze";
      if (!["curriculum", "lesson", "submit", "analyze"].includes(action)) {
        return json(res, 400, { error: "Unsupported learning action." });
      }
      if (["lesson", "submit"].includes(action) && !safeText(body.moduleId)) {
        return json(res, 400, { error: "Missing moduleId." });
      }
      const result = await runLearningEngine(body);
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
      const allocation = body.allocation && typeof body.allocation === "object" ? body.allocation : null;
      const strategicAnswer = safeText(body.strategicAnswer);
      if (!body.state || (!choiceId && !allocation)) {
        return json(res, 400, { error: "Decision request needs state and an operating budget." });
      }
      const actorDecision = body.actorDecision && typeof body.actorDecision === "object" ? body.actorDecision : null;
      const result = await advanceSimulation(body.state, choiceId, allocation, strategicAnswer, actorDecision);
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
  warmMlWorker();
});
