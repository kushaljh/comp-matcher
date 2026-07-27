// ============================================================================
// Comp Matcher — GET /api/scrape-contests?url=<event website>
// ----------------------------------------------------------------------------
// Vercel deploys any file under a root-level api/ directory as a serverless
// function, even for an otherwise-static (Expo web export) build — no
// framework config needed. This file uses the web-standard Fetch API
// signature (`export default async (request: Request) => Response`), which
// Vercel's Node.js function runtime supports directly, AND which is directly
// callable from plain Node (18+ ships global fetch/Request/Response/
// AbortController) — so scripts/verify-scraper.mjs can import and invoke
// this handler with zero Vercel-specific tooling.
//
// What it does: fetches a public webpage (an event's website_url), strips it
// to plain text, and runs a small set of regex heuristics over it to guess at
// contest names + divisions. This is ONLY a suggestion source for the admin
// panel — nothing here writes to the database; the admin reviews/edits every
// suggestion before it becomes a real contest (see features/admin/api.ts).
//
// Security posture: this endpoint fetches attacker-influenceable URLs
// (an event's website_url is supplied by whoever suggested the event, before
// any admin review), so it is SSRF-guarded:
//   - only http/https accepted
//   - the hostname string is checked against known-private patterns
//     (localhost, *.local, literal private/loopback IPs)
//   - the hostname is then ACTUALLY RESOLVED via DNS, and every resolved
//     address is checked too — this is what stops the classic bypass where
//     a public-looking domain name resolves to 127.0.0.1 / a cloud metadata
//     address / an internal network address (DNS rebinding)
//   - every redirect hop is re-validated the same way before being followed
//     (redirect: 'manual' + a manual loop) — otherwise a "safe" URL could
//     302 to an internal address and slip the initial check entirely
//   - 5s total timeout (AbortController), response body capped at ~500KB
// NOT implemented (documented tradeoff, see .claude/logs/contest-scraper.md):
// the DNS check and the actual fetch are two separate steps (check-then-use),
// not pinned to the verified IP at the socket level, so a sufufficiently
// well-timed DNS-rebinding attack between the two could theoretically still
// slip through. Given this endpoint only reads public event webpages for
// human-reviewed heuristic suggestions (no secrets, no writes), this is a
// proportionate level of defense, not a full anti-rebinding pinned fetch.
// ============================================================================

import { lookup } from 'node:dns/promises';

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 500_000; // ~500KB cap on the response body we read
const MAX_SUGGESTIONS = 10;
const DIVISION_WINDOW = 200; // chars scanned on each side of a name match

class ScrapeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// --- SSRF guard --------------------------------------------------------

function isPrivateOrLoopbackIp(ip) {
  const addr = ip.split('%')[0]; // strip an IPv6 zone id, e.g. fe80::1%eth0

  const v4 = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }

  const lower = addr.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateOrLoopbackIp(mapped[1]); // IPv4-mapped IPv6
  return false;
}

function isBlockedHostnameString(rawHostname) {
  const h = rawHostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost') return true;
  if (h.endsWith('.local')) return true;
  return isPrivateOrLoopbackIp(h);
}

// Validates one hop: parses the URL, rejects non-http(s) schemes and blocked
// hostname strings, then resolves the hostname via DNS and rejects if ANY
// resolved address is private/loopback (the DNS-rebinding defense — see the
// file header). Returns the parsed URL so the caller can fetch it.
async function assertPublicHost(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new ScrapeError(400, 'Not a valid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ScrapeError(400, 'Only http/https URLs are supported.');
  }
  if (isBlockedHostnameString(parsed.hostname)) {
    throw new ScrapeError(400, 'That host is not a public address.');
  }

  let addresses;
  try {
    addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
  } catch {
    throw new ScrapeError(400, 'Could not resolve that host.');
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateOrLoopbackIp(a.address))) {
    throw new ScrapeError(400, 'That host resolves to a private address.');
  }
  return parsed;
}

// --- fetch: manual redirect-following (re-validated per hop) + timeout + cap

async function fetchPage(initialUrl) {
  let current = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = await assertPublicHost(current); // validate THIS hop, every time

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(target, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'CompMatcherContestScraper/1.0 (+https://comp-matcher-web.vercel.app)' },
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw new ScrapeError(504, 'Timed out fetching that page.');
      throw new ScrapeError(502, `Could not fetch that page: ${err?.message ?? err}`);
    } finally {
      clearTimeout(timer);
    }

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      if (hop === MAX_REDIRECTS) throw new ScrapeError(502, 'Too many redirects.');
      current = new URL(location, target).toString();
      continue;
    }

    if (!response.ok) {
      throw new ScrapeError(502, `Page responded with status ${response.status}.`);
    }
    return readCapped(response);
  }
  throw new ScrapeError(502, 'Too many redirects.');
}

async function readCapped(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      chunks.push(value.subarray(0, value.byteLength - (total - MAX_BYTES)));
      try {
        await reader.cancel();
      } catch {
        /* best effort — we already have all the bytes we need */
      }
      break;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

// --- HTML -> plain text (no DOM libs available; regex strip + entity decode)

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, '-')
    .replace(/&ndash;/gi, '-')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

// --- heuristic contest extraction ---------------------------------------

function normalizeWhitespace(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function titleCase(s) {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// Each entry finds contest-name candidates; `build` turns a regex match into
// a display name (canonical names for the fixed-form contest types, and a
// cleaned-up verbatim match for the free-form "strictly ___" ones).
const NAME_PATTERNS = [
  {
    regex: /strictly\s+[a-z ]{0,20}(lindy|balboa|bal|swing|shag|charleston)/gi,
    build: (m) => titleCase(normalizeWhitespace(m[0])),
  },
  {
    regex: /(amateur|open|invitational|classic)\s+strictly/gi,
    build: (m) => titleCase(normalizeWhitespace(m[0])),
  },
  { regex: /jack\s*(&|and|n)\s*jill/gi, build: () => 'Jack & Jill' },
  { regex: /mix\s*(&|and)\s*match/gi, build: () => 'Mix & Match' },
  { regex: /solo\s+(jazz|charleston)/gi, build: (m) => `Solo ${titleCase(m[1])}` },
  { regex: /team\s+(match|competition)/gi, build: (m) => `Team ${titleCase(m[1])}` },
];

// Division keywords, mapped onto our division enum (novice|amateur|advanced|
// open): newcomer -> novice; all-star(s)/masters/invitational -> open; the
// rest map to themselves.
const DIVISION_KEYWORDS = [
  { pattern: /newcomer/i, division: 'novice' },
  { pattern: /novice/i, division: 'novice' },
  { pattern: /amateur/i, division: 'amateur' },
  { pattern: /advanced/i, division: 'advanced' },
  { pattern: /all-?stars?/i, division: 'open' },
  { pattern: /masters/i, division: 'open' },
  { pattern: /invitational/i, division: 'open' },
  { pattern: /\bopen\b/i, division: 'open' },
];

function extractContests(text) {
  const found = new Map(); // normalized name -> { name, divisions: Set }

  for (const { regex, build } of NAME_PATTERNS) {
    for (const match of text.matchAll(regex)) {
      const name = build(match);
      const key = name.toLowerCase();

      const start = Math.max(0, match.index - DIVISION_WINDOW);
      const end = Math.min(text.length, match.index + match[0].length + DIVISION_WINDOW);
      const window = text.slice(start, end);

      const divisions = new Set();
      for (const { pattern, division } of DIVISION_KEYWORDS) {
        if (pattern.test(window)) divisions.add(division);
      }

      if (!found.has(key)) {
        found.set(key, { name, divisions });
      } else {
        for (const d of divisions) found.get(key).divisions.add(d);
      }
    }
  }

  return Array.from(found.values())
    .slice(0, MAX_SUGGESTIONS)
    .map((c) => ({ name: c.name, divisions: Array.from(c.divisions) }));
}

// --- HTTP handler --------------------------------------------------------

function corsHeaders() {
  // Safe to allow any origin: this endpoint holds no secrets, performs no
  // writes, and only reads pages that are already public.
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() },
  });
}

// Web-standard core — used directly by scripts/verify-scraper.mjs, and by the
// Vercel adapter below.
export async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== 'GET') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed.' });
  }

  const targetUrl = new URL(request.url).searchParams.get('url');
  if (!targetUrl) {
    return jsonResponse(400, { ok: false, error: 'Missing required "url" query parameter.' });
  }

  try {
    const html = await fetchPage(targetUrl);
    const text = htmlToText(html);
    const contests = extractContests(text);
    return jsonResponse(200, { ok: true, contests, scannedChars: text.length });
  } catch (err) {
    if (err instanceof ScrapeError) {
      return jsonResponse(err.status, { ok: false, error: err.message });
    }
    return jsonResponse(500, { ok: false, error: 'Unexpected error scraping that page.' });
  }
}

// Vercel's Node.js runtime invokes the default export with the classic
// (req, res) signature — req.url is a RELATIVE path, so the web-standard
// handler above cannot be the default export directly (new URL(req.url)
// throws, which surfaced as FUNCTION_INVOCATION_FAILED in production).
export default async function vercelHandler(req, res) {
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  const host = req.headers.host ?? 'localhost';
  const request = new Request(`${proto}://${host}${req.url}`, { method: req.method });
  const response = await handleRequest(request);
  res.statusCode = response.status;
  for (const [key, value] of response.headers.entries()) res.setHeader(key, value);
  res.end(await response.text());
}
