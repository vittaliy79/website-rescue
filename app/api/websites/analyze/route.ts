import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import type { WebsiteAnalysis } from "@/lib/types";

const TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB
const MAX_REDIRECTS = 5;

function isPrivateIP(ip: string): boolean {
  // IPv6 loopback / link-local / ULA
  if (ip === "::1" || /^::ffff:/i.test(ip)) {
    const v4 = ip.replace(/^::ffff:/i, "");
    return isPrivateIP(v4);
  }
  if (/^fe80:/i.test(ip)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;
  if (ip.includes(":")) return false; // other IPv6 — allow

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;           // 0.0.0.0/8
  if (a === 10) return true;          // 10.0.0.0/8
  if (a === 127) return true;         // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 shared
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a === 255) return true;         // broadcast
  return false;
}

async function validateUrl(urlStr: string): Promise<URL> {
  let parsed: URL;
  try { parsed = new URL(urlStr); } catch { throw new Error("Invalid URL."); }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are allowed.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    throw new Error("Access to localhost is not allowed.");
  }
  // Resolve hostname and reject private IPs
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

      const res = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SiteAuditBot/1.0)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) { clearTimeout(timer); return { html: "", finalUrl: currentUrl, responseTimeMs: Date.now() - start, httpStatus: res.status }; }
        try { currentUrl = new URL(loc, currentUrl).href; } catch { break; }
        hops++;
        continue;
      }

      // Read up to MAX_BODY_BYTES
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

function analyzeHtml(html: string, finalUrl: string, responseTimeMs: number, httpStatus: number): WebsiteAnalysis {
  const h = html.toLowerCase();
  return {
    isReachable: httpStatus >= 200 && httpStatus < 400,
    responseTimeMs,
    hasHttps: finalUrl.startsWith("https://"),
    hasMobileViewport: /<meta[^>]+name=["']?viewport/i.test(html),
    hasTitle: /<title[^>]*>[^<]{2,}<\/title>/i.test(html),
    hasMetaDescription: /<meta[^>]+name=["']?description/i.test(html),
    hasPhone:
      /href=["']tel:/i.test(html) ||
      /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(html),
    hasContactForm:
      /<form[^>]*>/i.test(html) &&
      (/<input[^>]+type=["']?(email|tel)/i.test(html) || /<textarea/i.test(html)),
    hasBooking:
      /\b(book\s*(now|online|appointment|a\s+time)|schedul|appointment|reserv|availability|pick\s+a\s+time|online\s+booking|calendar)\b/.test(h),
    hasCTA:
      /\b(call\s+now|call\s+us|contact\s+us|get\s+a\s+quote|free\s+(estimate|quote|consultation)|request\s+a|get\s+started|schedule\s+(now|today)|book\s+now|sign\s+up)\b/.test(h),
    hasOutdatedHTML:
      /<marquee[\s>]|<blink[\s>]|<font\s[^>]*(color|face|size)|<center[\s>]|<applet[\s>]|application\/x-shockwave-flash/i.test(html),
    httpStatus,
    error: null,
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const { url } = body as Record<string, unknown>;

  // No website — valid case, return high-opportunity result
  if (!url || (typeof url === "string" && url.trim() === "")) {
    const analysis: WebsiteAnalysis = {
      isReachable: false, responseTimeMs: null, hasHttps: false,
      hasMobileViewport: false, hasTitle: false, hasMetaDescription: false,
      hasPhone: false, hasContactForm: false, hasBooking: false,
      hasCTA: false, hasOutdatedHTML: false, httpStatus: null, error: "No website",
    };
    return NextResponse.json({ analysis, noWebsite: true });
  }

  if (typeof url !== "string") {
    return NextResponse.json({ error: "url must be a string." }, { status: 400 });
  }

  const rawUrl = url.trim();
  // Ensure the URL has a scheme so URL() can parse it
  const fullUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  try {
    const { html, finalUrl, responseTimeMs, httpStatus } = await safeFetch(fullUrl);
    const analysis = analyzeHtml(html, finalUrl, responseTimeMs, httpStatus);
    return NextResponse.json({ analysis, noWebsite: false });
  } catch (err) {
    const msg = (err as Error).message ?? "Analysis failed.";
    // Don't leak internal details — log server-side, return safe message
    if (
      msg.includes("private") || msg.includes("localhost") || msg.includes("internal") ||
      msg.includes("resolve") || msg.includes("Protocol")
    ) {
      return NextResponse.json({ error: "This URL cannot be analyzed." }, { status: 422 });
    }
    if ((err as Error).name === "AbortError") {
      const analysis: WebsiteAnalysis = {
        isReachable: false, responseTimeMs: TIMEOUT_MS, hasHttps: fullUrl.startsWith("https://"),
        hasMobileViewport: false, hasTitle: false, hasMetaDescription: false,
        hasPhone: false, hasContactForm: false, hasBooking: false,
        hasCTA: false, hasOutdatedHTML: false, httpStatus: null, error: "Request timed out",
      };
      return NextResponse.json({ analysis, noWebsite: false });
    }
    // Unreachable
    const analysis: WebsiteAnalysis = {
      isReachable: false, responseTimeMs: null, hasHttps: fullUrl.startsWith("https://"),
      hasMobileViewport: false, hasTitle: false, hasMetaDescription: false,
      hasPhone: false, hasContactForm: false, hasBooking: false,
      hasCTA: false, hasOutdatedHTML: false, httpStatus: null, error: msg.slice(0, 120),
    };
    return NextResponse.json({ analysis, noWebsite: false });
  }
}
