import { readFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./config.mjs";
import { COMPANY_HINTS, NON_COMPANY_HINTS, fetchJson, norm, normalizeTitle, parseCsv, safeText, topKeywords } from "./utils.mjs";

let datasetsPromise = null;
export const wikiCache = new Map();
export const wikidataCache = new Map();
export const yahooCache = new Map();

const PRODUCT_HINTS = ["application", "app", "software", "platform", "tool", "service", "website", "product"];
const PERSON_HINTS = ["entrepreneur", "businessman", "businesswoman", "billionaire", "investor"];
const BIOGRAPHY_HINTS = ["entrepreneur", "businessman", "businesswoman", "billionaire", "investor"];

function isLikelyCompanyProfile(summary) {
  const title = norm(summary?.title || "");
  const text = `${summary?.description || ""} ${summary?.extract || ""}`.toLowerCase();
  const hitCompany = COMPANY_HINTS.some((h) => text.includes(h));
  const hitProduct = PRODUCT_HINTS.some((h) => text.includes(h));
  const hitNonCompany = NON_COMPANY_HINTS.some((h) => text.includes(h));
  const isPersonProfile = BIOGRAPHY_HINTS.some((h) => text.includes(h)) && !PRODUCT_HINTS.some((h) => title.includes(h));
  return (hitCompany || hitProduct) && !hitNonCompany && !isPersonProfile;
}

function rankWikipediaCandidate(query, title, snippet) {
  const normalizedQuery = norm(query);
  const normalizedTitle = norm(title);
  const text = `${title} ${snippet}`.toLowerCase();
  let score = 0;
  if (normalizedTitle === normalizedQuery) score += 14;
  if (normalizedTitle.startsWith(`${normalizedQuery} `)) score += 8;
  if (normalizedTitle.includes(normalizedQuery)) score += 4;
  for (const h of COMPANY_HINTS) if (text.includes(h)) score += 2;
  for (const h of PRODUCT_HINTS) if (text.includes(h)) score += 2;
  for (const h of NON_COMPANY_HINTS) if (text.includes(h)) score -= 3;
  for (const h of PERSON_HINTS) if (text.includes(h)) score -= 4;
  if (text.includes("founder")) score -= 2;
  if (text.includes("co-founder")) score -= 2;
  if (text.includes(`co-founder of ${normalizedQuery}`) || text.includes(`founder of ${normalizedQuery}`)) score -= 8;
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

export async function getWikipediaSummary(company) {
  const directPromise = getWikipediaSummaryFromTitle(company).catch(() => null);
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=8&srsearch=${encodeURIComponent(company + " company")}`;
  const searchPromise = fetchJson(searchUrl).catch(() => null);

  const direct = await directPromise;
  if (direct && isLikelyCompanyProfile(direct)) return direct;

  const data = await searchPromise;
  const candidates = (data?.query?.search || []).map((x) => ({ ...x, score: rankWikipediaCandidate(company, x.title || "", x.snippet || "") })).sort((a, b) => b.score - a.score).slice(0, 4);

  const summaries = await Promise.all(candidates.map((c) => getWikipediaSummaryFromTitle(c.title).catch(() => null)));
  const match = summaries.find((summary) => summary && isLikelyCompanyProfile(summary));
  if (match) return match;

  if (direct) return direct;
  throw new Error("Could not find matching Wikipedia page");
}

export async function getWikidata(company) {
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

export async function getWikidataFromWikipediaTitle(wikiTitle) {
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

export async function getYahooByCompany(company) {
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

export async function loadOpenDatasets() {
  if (datasetsPromise) return datasetsPromise;
  const companyPath = path.join(dataDir, "companies.csv");
  const fundingPath = path.join(dataDir, "funding_rounds.csv");

  datasetsPromise = Promise.all([
    readFile(companyPath, "utf8").then(parseCsv).catch(() => []),
    readFile(fundingPath, "utf8").then(parseCsv).catch(() => [])
  ]).then(([companies, funding]) => ({ companies, funding }));
  return datasetsPromise;
}

export function getDatasetMatch(company, datasets) {
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

export async function getYahooFinance(ticker) {
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

export function scoreAnalysis(wiki, wd, ds, yf) {
  const summary = `${wiki.description || ""} ${wiki.extract || ""} ${ds?.sector || ""}`;
  const keys = topKeywords(summary, 8);

  const extractLength = safeText(wiki?.extract).length;
  const extractSentences = safeText(wiki?.extract).split(/[.!?]+/).filter((x) => safeText(x).length > 24).length;
  const publicFacts = [
    /founded|launched|released/i.test(summary),
    /acquired|acquisition|valuation|funding|raised/i.test(summary),
    /collaborative|web-based|browser-based|cloud|software|platform|application/i.test(summary),
    /users|customers|employees|teams|designers|developers/i.test(summary)
  ].filter(Boolean).length;
  const signals = [
    wiki.extract,
    wiki.description,
    wiki.pageUrl,
    wd?.description,
    ds?.sector,
    ds?.stage,
    ds?.foundedYear,
    ds?.totalFundingUsd,
    yf?.marketCap,
    extractLength > 220,
    extractSentences >= 2,
    publicFacts >= 2,
    keys.length >= 5
  ].filter(Boolean).length;
  const clarity = Math.min(100, 40 + Math.min(40, keys.length * 7));
  const dataDepth = Math.min(100, 28 + signals * 7);
  const confidence = Math.min(100, Math.round((clarity * 0.45) + (dataDepth * 0.55)));
  return { clarity, dataDepth, confidence, keywords: keys };
}
