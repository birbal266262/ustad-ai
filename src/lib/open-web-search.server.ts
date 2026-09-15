/**
 * Keyless OPEN WEB search + page reading — the LAST-RESORT fallback used only
 * when the API Manager has no working web provider (Tavily / EXA / Jina /
 * Firecrawl).
 *
 * Rules honoured here:
 *  - Results are REAL. Every title, URL and snippet comes from a live HTTP
 *    response; nothing is cached, hardcoded, invented or "sample" data. When
 *    every source fails, the caller is told so — no fabricated answer.
 *  - No API keys. Nothing here reads a secret, so no credential can leak, and
 *    the user is never forced to configure a provider just to search.
 *  - It never overrides a provider the user configured: the router only calls
 *    this after the configured chain is absent or has actually failed.
 *  - All requests run SERVER-side (a server function / route), so the browser's
 *    CORS restrictions do not apply and no third-party site receives any app
 *    secret or user token.
 */

export type OpenWebResult = { title: string; url: string; snippet: string };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const TIMEOUT_MS = 12000;

async function get(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "user-agent": UA,
        "accept-language": "en-IN,en;q=0.9,hi;q=0.8",
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** DuckDuckGo redirects results through /l/?uddg=<encoded> — unwrap it. */
function cleanUrl(href: string): string | null {
  let u = decodeEntities(href.trim());
  if (u.startsWith("//")) u = `https:${u}`;
  const m = u.match(/[?&]uddg=([^&]+)/);
  if (m?.[1]) {
    try {
      u = decodeURIComponent(m[1]);
    } catch {
      /* keep the raw value */
    }
  }
  if (!/^https?:\/\//i.test(u)) return null;
  if (/duckduckgo\.com\/y\.js/i.test(u)) return null;
  return u;
}

/* ------------------------------------------------------------------ */
/* Source 1 — DuckDuckGo Lite (real live results, no key)              */
/* ------------------------------------------------------------------ */

async function duckDuckGoLite(query: string, limit: number): Promise<OpenWebResult[]> {
  const res = await get(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`DuckDuckGo Lite returned ${res.status}`);
  const html = await res.text();
  if (/anomaly|automated queries/i.test(html) && !/result-link/.test(html))
    throw new Error("DuckDuckGo Lite blocked this request (rate limit).");

  const out: OpenWebResult[] = [];
  // The markup uses single quotes for class names, so both quote styles are
  // accepted; the snippet lives in the NEXT `result-snippet` cell.
  const anchor = /<a[^>]+href=["']([^"']+)["'][^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(html))) {
    const url = cleanUrl(m[1] ?? "");
    const title = stripTags(m[2] ?? "");
    if (!url || !title || out.some((r) => r.url === url)) continue;
    const after = html.slice(anchor.lastIndex, anchor.lastIndex + 4000);
    const snip = after.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/);
    out.push({ title, url, snippet: stripTags(snip?.[1] ?? "").slice(0, 500) });
    if (out.length >= limit) break;
  }
  if (!out.length) throw new Error("DuckDuckGo Lite returned no parsable results");
  return out;
}

/* ------------------------------------------------------------------ */
/* Source 2 — DuckDuckGo HTML endpoint (same engine, other markup)     */
/* ------------------------------------------------------------------ */

async function duckDuckGoHtml(query: string, limit: number): Promise<OpenWebResult[]> {
  const res = await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`);
  const html = await res.text();
  if (/anomaly|automated queries/i.test(html) && !/result__a/.test(html))
    throw new Error("DuckDuckGo blocked this request (rate limit).");

  const out: OpenWebResult[] = [];
  const anchor = /<a[^>]+class=['"][^'"]*result__a[^'"]*['"][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;
  const anchorAlt = /<a[^>]+href=["']([^"']+)["'][^>]*class=['"][^'"]*result__a[^'"]*['"][^>]*>([\s\S]*?)<\/a>/g;
  for (const re of [anchor, anchorAlt]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const url = cleanUrl(m[1] ?? "");
      const title = stripTags(m[2] ?? "");
      if (!url || !title || out.some((r) => r.url === url)) continue;
      const after = html.slice(re.lastIndex, re.lastIndex + 4000);
      const snip = after.match(/class=['"][^'"]*result__snippet[^'"]*['"][^>]*>([\s\S]*?)<\/(?:a|div|span|td)>/);
      out.push({ title, url, snippet: stripTags(snip?.[1] ?? "").slice(0, 500) });
      if (out.length >= limit) break;
    }
    if (out.length) break;
  }
  if (!out.length) throw new Error("DuckDuckGo returned no parsable results");
  return out;
}


/* ------------------------------------------------------------------ */
/* Source 3 — Wikipedia open search API (real encyclopaedic answers)    */
/* ------------------------------------------------------------------ */

async function wikipedia(query: string, limit: number): Promise<OpenWebResult[]> {
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srlimit=" +
    String(limit) +
    "&srsearch=" +
    encodeURIComponent(query);
  const res = await get(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`);
  const j = (await res.json()) as {
    query?: { search?: Array<{ title: string; snippet?: string }> };
  };
  const hits = j.query?.search ?? [];
  if (!hits.length) throw new Error("Wikipedia returned no results");
  return hits.slice(0, limit).map((h) => ({
    title: h.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/\s/g, "_"))}`,
    snippet: stripTags(h.snippet ?? "").slice(0, 500),
  }));
}

/* ------------------------------------------------------------------ */
/* Public entry points                                                 */
/* ------------------------------------------------------------------ */

export type OpenWebSearchOutcome = {
  results: OpenWebResult[];
  /** Which keyless source produced the results, for honest reporting. */
  source: string | null;
  /** Real failure messages from every source that was tried. */
  failures: string[];
};

/**
 * Try each keyless source in order and return the first REAL result set.
 * Every failure (network, rate limit, block, empty) is recorded so the caller
 * can tell the user exactly what happened instead of pretending to have
 * searched.
 */
export async function openWebSearch(query: string, limit = 5): Promise<OpenWebSearchOutcome> {
  const q = String(query ?? "").trim();
  if (!q) return { results: [], source: null, failures: ["Empty search query."] };

  const sources: Array<[string, (q: string, n: number) => Promise<OpenWebResult[]>]> = [
    ["DuckDuckGo Lite", duckDuckGoLite],
    ["DuckDuckGo", duckDuckGoHtml],
    ["Wikipedia", wikipedia],
  ];


  const failures: string[] = [];
  for (const [name, fn] of sources) {
    try {
      const results = await fn(q, limit);
      if (results.length) return { results, source: name, failures };
      failures.push(`${name}: no results.`);
    } catch (e) {
      const msg = (e as Error)?.message ?? "unknown error";
      failures.push(`${name}: ${msg}`);
    }
  }
  return { results: [], source: null, failures };
}

/**
 * Keyless page read: fetches the URL server-side and returns readable text.
 * Used only when no reader provider (Jina / Firecrawl) is configured or all of
 * them failed. Non-HTML and error responses are reported, never faked.
 */
export async function openWebRead(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) throw new Error("Only http(s) URLs can be read.");
  const res = await get(url, { headers: { accept: "text/html,text/plain;q=0.9" } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (/json/.test(type)) return body.slice(0, 8000);
  const main = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = stripTags(main);
  if (!text) throw new Error(`${new URL(url).hostname} returned no readable text.`);
  return text.slice(0, 8000);
}
