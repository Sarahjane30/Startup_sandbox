import { FETCH_TIMEOUT_MS } from "./config.mjs";

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8"
};

const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "this", "that", "into", "your", "their", "company", "business", "profile", "public"]);
export const COMPANY_HINTS = ["company", "corporation", "software", "technology", "platform", "startup", "organization", "enterprise", "brand", "service"];
export const NON_COMPANY_HINTS = ["fruit", "myth", "album", "song", "film", "novel", "village", "given name", "surname"];

export function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload));
}

export function safeText(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

export function splitKeywords(text) {
  return safeText(text).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

export function topKeywords(text, n = 6) {
  const counts = new Map();
  for (const w of splitKeywords(text)) counts.set(w, (counts.get(w) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

export function normalizeTitle(input) {
  return encodeURIComponent(input.trim().replace(/\s+/g, "_"));
}

export function norm(s) {
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

export function parseCsv(text) {
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

export async function fetchJson(url, headers = {}) {
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

export async function fetchText(url, headers = {}) {
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

export async function cachedAsync(cache, key, ttlMs, loader) {
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

export async function withTimeout(promise, ms, fallback) {
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
