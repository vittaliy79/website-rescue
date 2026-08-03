import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import type { WebsiteAnalysis } from "@/lib/types";

const TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 5;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Upgrade-Insecure-Requests": "1",
};

function isPrivateIP(ip: string): boolean {
  if (ip === "::1" || /^::ffff:/i.test(ip)) return isPrivateIP(ip.replace(/^::ffff:/i, ""));
  if (/^fe80:/i.test(ip) || /^f[cd][0-9a-f]{2}:/i.test(ip)) return true;
  if (ip.includes(":")) return false;
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a === 255 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19));
}

async function validateUrl(urlStr: string): Promise<URL> {
  let parsed: URL;
  try { parsed = new URL(urlStr); } catch { throw new Error("Invalid URL."); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http and https URLs are allowed.");
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") throw new Error("Access to localhost is not allowed.");
  let addresses: { address: string }[];
  try { addresses = await lookup(hostname, { all: true }); } catch { throw new Error(`Cannot resolve host: ${hostname}`); }
  for (const { address } of addresses) {
    if (isPrivateIP(address)) throw new Error("Access to private or internal addresses is not allowed.");
  }
  return parsed;
}

async function safeFetch(startUrl: string): Promise<{ html: string; finalUrl: string; responseTimeMs: number; httpStatus: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    let currentUrl = startUrl;
    let hops = 0;
    while (hops <= MAX_REDIRECTS) {
      await validateUrl(currentUrl);
      const res = await fetch(currentUrl, { method: "GET", headers: BROWSER_HEADERS, redirect: "manual", signal: controller.signal });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) { clearTimeout(timer); return { html: "", finalUrl: currentUrl, responseTimeMs: Date.now() - start, httpStatus: res.status }; }
        try { currentUrl = new URL(loc, currentUrl).href; } catch { break; }
        hops++; continue;
      }
      const reader = res.body?.getReader();
      let html = "";
      if (reader) {
        let received = 0;
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          html += decoder.decode(value, { stream: true });
          if (received >= MAX_BODY_BYTES) { reader.cancel(); break; }
        }
      }
      clearTimeout(timer);
      return { html, finalUrl: currentUrl, responseTimeMs: Date.now() - start, httpStatus: res.status };
    }
    clearTimeout(timer);
    throw new Error("Too many redirects.");
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function detectBotBlock(html: string, status: number): boolean {
  if (html.length < 200) return status === 403 || status === 429;
  const h = html.slice(0, 4000);
  return (
    h.includes("challenges.cloudflare.com") ||
    h.includes("Just a moment...") ||
    h.includes("Enable JavaScript and cookies to continue") ||
    h.includes("cf-browser-verification") ||
    h.includes("_cf_chl_opt") ||
    h.includes("Pardon Our Interruption") ||
    h.includes("datadome") ||
    h.includes("px-captcha") ||
    h.includes("Verifying you are human") ||
    h.includes("bot protection") ||
    h.includes("ddos protection by cloudflare")
  );
}

function analyzeHtml(html: string, finalUrl: string, responseTimeMs: number, httpStatus: number): WebsiteAnalysis {
  const blocked = detectBotBlock(html, httpStatus);
  const isReachable = httpStatus > 0 && httpStatus < 500;

  if (blocked) {
    return {
      isReachable,
      responseTimeMs,
      hasHttps: finalUrl.startsWith("https://"),
      hasMobileViewport: false,
      hasTitle: false,
      hasMetaDescription: false,
      hasPhone: false,
      hasContactForm: false,
      hasBooking: false,
      hasCTA: false,
      hasOutdatedHTML: false,
      httpStatus,
      blocked: true,
      error: "Site uses bot protection — content analysis unavailable",
    };
  }

  const h = html.toLowerCase();

  const hasCTA =
    /\b(call\s*(now|us|today)|contact\s*us|get\s*(a\s*)?(free\s*)?(quote|estimate|consultation|proposal|inspection)|free\s*(estimate|quote|consultation|inspection|trial|exam|cleaning)|request\s*(an?\s*)?(quote|estimate|appointment|service|callback|call|demo)|get\s+started|book\s*(now|online|today|an?\s+appointment|a\s+(visit|call))?|schedule\s*(now|today|free|a?\s*(appointment|consultation|visit|call|estimate|cleaning|exam|service))?|make\s+an?\s+appointment|sign\s+up|apply\s+now|order\s+now|buy\s+now|shop\s+now|try\s+(it\s+)?(free|now)|start\s+(free|your)|claim\s+(your|free)|new\s+patient\s+special|see\s+a\s+doctor|find\s+a\s+(doctor|dentist|provider)|urgent\s+care|emergency\s+(appointment|visit|care)|same\s+day\s+(appointment|service)|call\s+to\s+(schedule|book|make)|click\s+to\s+(call|book)|send\s+a\s+message|send\s+us\s+a|reach\s+out|get\s+in\s+touch|speak\s+(with|to)\s+(us|a)|chat\s+(with\s+us|now|live)|text\s+us|whatsapp)\b/i.test(h) ||
    // CTA in button/link text via href patterns
    /href=["'](tel:|mailto:|#contact|#book|#schedule|#appointment)/i.test(html);

  const hasBooking =
    // Direct booking keywords in page text / buttons / links
    /\b(book\s*(now|online|today|an?\s*(appointment|visit|service|call))?|appointment(s)?\b|schedul(e|ing|er|ed)\b|reserv(e|ation|ations|ing)\b|availabilit|pick\s+a\s+(time|date|slot)|online\s+(booking|scheduling|appointment)|new\s+patient|returning\s+patient|patient\s+portal|request\s+an?\s+appointment|same[- ]day\s+(appointment|service)|book\s+a\s+(free|demo|call|visit|tour|consult))\b/i.test(h) ||
    // Booking widget platforms (in script src, href, iframe src, or inline links)
    /calendly\.|acuityscheduling\.|mindbodyonline\.|zocdoc\.|patientpop\.|solutionreach\.|healthgrades\.|nexhealth\.|opencare\.|fresha\.|vagaro\.|booksy\.|setmore\.|square\.site|squareup\.com\/appointments|simplybook\.|janeapp\.|drchrono\.|athenahealth\.|intakeq\.|nookal\.|cliniko\.|10to8\.|vcita\.|appointy\.|genbook\.|picktime\.|bookedin\.|schedulicity\./i.test(h) ||
    // Booking button patterns: <a href="...book..."> or data-action="book"
    /href=["'][^"']*\b(book|appointment|schedule|reserve)\b[^"']*["']/i.test(html) ||
    // Calendar embed or booking iframe
    /<iframe[^>]+(?:calendly|acuity|zocdoc|booking|schedule|appointment)/i.test(html);

  const hasPhone = /href=["']tel:/i.test(html) || /(?:\+?1[\s.\-()]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/.test(html);

  const hasContactForm =
    (/<form[^>]*>/i.test(html) && (/<input[^>]+type=["']?(email|tel)/i.test(html) || /<textarea/i.test(html))) ||
    /<input[^>]+placeholder=["'][^"']*(?:email|phone|message|name)/i.test(html);

  return {
    isReachable,
    responseTimeMs,
    hasHttps: finalUrl.startsWith("https://"),
    hasMobileViewport: /<meta[^>]+name=["']?viewport[^>]*>/i.test(html),
    hasTitle: /<title[^>]*>[^<]{2,}<\/title>/i.test(html),
    hasMetaDescription: /<meta[^>]+name=["']?description/i.test(html),
    hasPhone,
    hasContactForm,
    hasBooking,
    hasCTA,
    hasOutdatedHTML: /<marquee[\s>]|<blink[\s>]|<font\s[^>]*(color|face|size)|<applet[\s>]|application\/x-shockwave-flash/i.test(html),
    httpStatus,
    blocked: false,
    error: isReachable ? null : `HTTP ${httpStatus}`,
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const { url } = body as Record<string, unknown>;

  if (!url || (typeof url === "string" && url.trim() === "")) {
    const analysis: WebsiteAnalysis = {
      isReachable: false, responseTimeMs: null, hasHttps: false,
      hasMobileViewport: false, hasTitle: false, hasMetaDescription: false,
      hasPhone: false, hasContactForm: false, hasBooking: false,
      hasCTA: false, hasOutdatedHTML: false, httpStatus: null, blocked: false, error: "No website",
    };
    return NextResponse.json({ analysis, noWebsite: true });
  }

  if (typeof url !== "string") return NextResponse.json({ error: "url must be a string." }, { status: 400 });

  const rawUrl = url.trim();
  const fullUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  try {
    const { html, finalUrl, responseTimeMs, httpStatus } = await safeFetch(fullUrl);
    const analysis = analyzeHtml(html, finalUrl, responseTimeMs, httpStatus);
    return NextResponse.json({ analysis, noWebsite: false });
  } catch (err) {
    const msg = (err as Error).message ?? "Analysis failed.";
    if (msg.includes("private") || msg.includes("localhost") || msg.includes("internal") || msg.includes("resolve") || msg.includes("Protocol")) {
      return NextResponse.json({ error: "This URL cannot be analyzed." }, { status: 422 });
    }
    // Check DNS: if hostname resolves but request failed/timed out the site is
    // likely alive but blocking our server (Cloudflare silent-drop, IP block, etc.)
    let dnsResolves = false;
    try {
      const hostname = new URL(fullUrl).hostname;
      await lookup(hostname, { all: true });
      dnsResolves = true;
    } catch { /* ignore */ }

    if ((err as Error).name === "AbortError") {
      const analysis: WebsiteAnalysis = {
        // DNS resolves → server is up, request was silently dropped (bot protection)
        isReachable: dnsResolves, responseTimeMs: TIMEOUT_MS, hasHttps: fullUrl.startsWith("https://"),
        hasMobileViewport: false, hasTitle: false, hasMetaDescription: false,
        hasPhone: false, hasContactForm: false, hasBooking: false,
        hasCTA: false, hasOutdatedHTML: false, httpStatus: null,
        blocked: dnsResolves,
        error: dnsResolves ? "Request timed out — site is likely blocking server-side requests" : "Request timed out",
      };
      return NextResponse.json({ analysis, noWebsite: false });
    }
    const analysis: WebsiteAnalysis = {
      isReachable: false, responseTimeMs: null, hasHttps: fullUrl.startsWith("https://"),
      hasMobileViewport: false, hasTitle: false, hasMetaDescription: false,
      hasPhone: false, hasContactForm: false, hasBooking: false,
      hasCTA: false, hasOutdatedHTML: false, httpStatus: null,
      blocked: dnsResolves,
      error: msg.slice(0, 120),
    };
    return NextResponse.json({ analysis, noWebsite: false });
  }
}
