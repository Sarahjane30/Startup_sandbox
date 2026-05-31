import { LIVE_CACHE_TTL_MS } from "./config.mjs";
import { cachedAsync, fetchText, safeText } from "./utils.mjs";

const productHuntCache = new Map();
const GOOGLE_NEWS_QUERIES = [
  "new app launch startup when:7d",
  "new AI product launched when:7d",
  "new software product launch when:7d"
];

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function slugify(value) {
  return safeText(value)
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanLine(line) {
  return decodeHtml(line)
    .replace(/\s+/g, " ")
    .replace(/^Image:\s*/i, "")
    .trim();
}

function tagValue(xml, tagName) {
  const match = String(xml || "").match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? cleanLine(match[1]) : "";
}

function attrValue(xml, tagName, attrName) {
  const match = String(xml || "").match(new RegExp(`<${tagName}[^>]*\\s${attrName}="([^"]+)"`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function stripTags(value) {
  return cleanLine(String(value || "").replace(/<[^>]+>/g, " "));
}

function normalizeGoogleTitle(title) {
  return safeText(title).replace(/\s+-\s+[^-]+$/, "");
}

function looksLikeLaunch(item) {
  const text = `${item.name || ""} ${item.tagline || ""}`.toLowerCase();
  return /launch|launched|launches|unveil|unveils|debut|debuts|release|releases|rolls out|introduces|announces/.test(text);
}

function uniqueLaunches(items, limit) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = safeText(item.name).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= limit) break;
  }
  return unique;
}

function isNoiseLine(line) {
  return !line
    || line === "Launches"
    || line === "Products"
    || line === "News"
    || line === "Community"
    || line === "Advertise"
    || line === "Sign in"
    || line === "Subscribe"
    || /^image:/i.test(line)
    || /^https?:\/\//i.test(line);
}

function numberFromLine(line) {
  const text = safeText(line);
  if (!/^\d{1,5}$/.test(text)) return null;
  return Number(text);
}

function sectionLines(html) {
  const stripped = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<\/(div|p|a|span|h1|h2|h3|li|button|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const lines = stripped
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => !isNoiseLine(line));

  const start = lines.findIndex((line) => /Top Products Launching Today/i.test(line));
  if (start < 0) return lines;

  const end = lines.findIndex((line, index) => index > start && /Get the best new products|Launching soon|See all of today's launches/i.test(line));
  return lines.slice(start + 1, end > start ? end : start + 180);
}

export function parseProductHuntLaunches(html) {
  const lines = sectionLines(html);
  const launches = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(\d{1,2})\.\s+(.+)$/);
    if (!match) continue;

    const rank = Number(match[1]);
    const name = safeText(match[2]);
    if (!name || launches.some((item) => item.name.toLowerCase() === name.toLowerCase())) continue;

    let tagline = "";
    let categories = [];
    let comments = null;
    let upvotes = null;

    for (let j = i + 1; j < Math.min(lines.length, i + 9); j += 1) {
      const line = lines[j];
      if (/^\d{1,2}\.\s+/.test(line)) break;
      const numeric = numberFromLine(line);
      if (numeric !== null) {
        if (comments === null) comments = numeric;
        else if (upvotes === null) upvotes = numeric;
        continue;
      }
      if (!tagline && !line.includes("•")) {
        tagline = line;
        continue;
      }
      if (line.includes("•")) {
        categories = line.split("•").map(safeText).filter(Boolean).slice(0, 4);
      }
    }

    launches.push({
      rank,
      name,
      tagline,
        categories,
        comments,
        upvotes,
        sourceLabel: "Product Hunt",
        url: `https://www.producthunt.com/posts/${slugify(name)}`
      });
  }

  return launches.slice(0, 8);
}

export function parseProductHuntFeed(xml) {
  return String(xml || "")
    .split(/<entry>/i)
    .slice(1)
    .map((entry, index) => {
      const title = tagValue(entry, "title");
      const content = decodeHtml(tagValue(entry, "content"));
      const tagline = cleanLine((content.match(/<p>\s*([\s\S]*?)\s*<\/p>/i)?.[1] || "").replace(/<[^>]+>/g, " "));
      return {
        rank: index + 1,
        name: title,
        tagline,
        categories: ["Product Hunt"],
        comments: null,
        upvotes: null,
        author: tagValue(entry, "name"),
        publishedAt: tagValue(entry, "published"),
        sourceLabel: "Product Hunt",
        url: attrValue(entry, "link", "href") || `https://www.producthunt.com/posts/${slugify(title)}`
      };
    })
    .filter((item) => item.name)
    .slice(0, 8);
}

export function parseGoogleNewsFeed(xml) {
  return String(xml || "")
    .split(/<item>/i)
    .slice(1)
    .map((item) => {
      const title = tagValue(item, "title");
      const source = tagValue(item, "source") || "Google News";
      const description = stripTags(decodeHtml(tagValue(item, "description")));
      return {
        rank: null,
        name: normalizeGoogleTitle(title),
        tagline: description || `Recent launch coverage from ${source}.`,
        categories: ["Google News", "Recent Launch"],
        comments: null,
        upvotes: null,
        author: source,
        publishedAt: tagValue(item, "pubDate"),
        sourceLabel: "Google News",
        url: tagValue(item, "link")
      };
    })
    .filter((item) => item.name && looksLikeLaunch(item));
}

async function getGoogleLaunches() {
  const feeds = await Promise.allSettled(
    GOOGLE_NEWS_QUERIES.map((query) => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      return fetchText(url, { Accept: "application/rss+xml,application/xml,text/xml" });
    })
  );

  const launches = feeds.flatMap((result) => result.status === "fulfilled" ? parseGoogleNewsFeed(result.value) : []);
  return uniqueLaunches(launches, 6);
}

export async function getProductHuntLaunches() {
  return cachedAsync(productHuntCache, "today", LIVE_CACHE_TTL_MS, async () => {
    let launches = [];
    let source = "product-hunt-homepage";

    try {
      const html = await fetchText("https://www.producthunt.com/", {
        Accept: "text/html,application/xhtml+xml"
      });
      launches = parseProductHuntLaunches(html);
    } catch {
      const xml = await fetchText("https://www.producthunt.com/feed", {
        Accept: "application/atom+xml,application/xml,text/xml"
      });
      launches = parseProductHuntFeed(xml);
      source = "product-hunt-feed";
    }

    if (!launches.length) {
      throw new Error("Product Hunt returned no launches.");
    }

    const googleLaunches = await getGoogleLaunches().catch(() => []);
    const mergedLaunches = uniqueLaunches([
      ...launches,
      ...googleLaunches.map((item, index) => ({ ...item, rank: launches.length + index + 1 }))
    ], 12);

    return {
      source: googleLaunches.length ? `${source}+google-news` : source,
      fetchedAt: new Date().toISOString(),
      launches: mergedLaunches,
      sourceBreakdown: {
        productHunt: mergedLaunches.filter((item) => item.sourceLabel === "Product Hunt").length,
        googleNews: mergedLaunches.filter((item) => item.sourceLabel === "Google News").length
      }
    };
  });
}
