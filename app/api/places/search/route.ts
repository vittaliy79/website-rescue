import { NextRequest, NextResponse } from "next/server";
import type { PlaceResult } from "@/lib/types";

// In-memory rate limiter (resets on cold start — acceptable for MVP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

// Simple query cache (TTL: 5 min)
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL_MS = 5 * 60_000;

const PLACES_API = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.primaryType",
  "places.types",
  "places.formattedAddress",
  "places.addressComponents",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
].join(",");

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Places API is not configured. Add GOOGLE_PLACES_API_KEY to your environment variables and restart the server." },
      { status: 503 }
    );
  }

  // Rate limiting by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const rate = rateLimitMap.get(ip);
  if (rate && now < rate.resetAt) {
    if (rate.count >= RATE_LIMIT) {
      return NextResponse.json({ error: "Too many requests. Please wait a minute before searching again." }, { status: 429 });
    }
    rate.count++;
  } else {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { query, maxResults } = body as Record<string, unknown>;

  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return NextResponse.json({ error: "Search query must be at least 2 characters." }, { status: 400 });
  }
  const trimmedQuery = query.trim().slice(0, 200);
  const limit = typeof maxResults === "number" && [10, 20, 50].includes(maxResults) ? maxResults : 10;

  const cacheKey = `${trimmedQuery}::${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && now < cached.expires) {
    return NextResponse.json(cached.data);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(PLACES_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: trimmedQuery, maxResultCount: limit, languageCode: "en" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Places API error:", res.status, text);
      if (res.status === 403 || res.status === 400) {
        return NextResponse.json({ error: "Google Places API rejected the request. Verify your API key is valid and Places API (New) is enabled." }, { status: 502 });
      }
      return NextResponse.json({ error: "Google Places API request failed. Check billing and API key restrictions." }, { status: 502 });
    }

    const data = (await res.json()) as { places?: Record<string, unknown>[] };
    const raw = data.places ?? [];

    const places: PlaceResult[] = raw.map((p) => {
      const displayName = (p.displayName as { text?: string } | undefined)?.text ?? "";
      const components = (p.addressComponents as { longText: string; shortText: string; types: string[] }[] | undefined) ?? [];
      const cityComp = components.find((c) => c.types.includes("locality"));
      const stateComp = components.find((c) => c.types.includes("administrative_area_level_1"));
      const city = cityComp ? `${cityComp.longText}${stateComp ? `, ${stateComp.shortText}` : ""}` : "";
      const primaryType = ((p.primaryType as string | undefined) ?? (p.types as string[] | undefined)?.[0] ?? "").replace(/_/g, " ");
      const websiteUri = (p.websiteUri as string | undefined) ?? "";
      let website = "";
      try { website = websiteUri ? new URL(websiteUri).hostname.replace(/^www\./, "") : ""; } catch { /* ignore */ }

      return {
        placeId: (p.id as string | undefined) ?? "",
        company: displayName,
        niche: primaryType,
        city,
        formattedAddress: (p.formattedAddress as string | undefined) ?? "",
        phone: (p.internationalPhoneNumber as string | undefined) ?? "",
        website,
        websiteUrl: websiteUri,
        rating: typeof p.rating === "number" ? p.rating : null,
        reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : 0,
        googleMapsUrl: (p.googleMapsUri as string | undefined) ?? "",
      };
    });

    const result = { places };
    cache.set(cacheKey, { data: result, expires: now + CACHE_TTL_MS });
    return NextResponse.json(result);
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === "AbortError") {
      return NextResponse.json({ error: "Request to Google Places API timed out." }, { status: 504 });
    }
    console.error("Places search unexpected error:", err);
    return NextResponse.json({ error: "Failed to fetch places data." }, { status: 500 });
  }
}
