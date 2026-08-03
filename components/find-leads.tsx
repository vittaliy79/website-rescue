"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, Check, CheckSquare, Clock, Globe, Loader2, MapPin, RefreshCw, Search, Square, Star, Zap } from "lucide-react";
import type { Lead, PlaceResult, WebsiteAnalysis } from "@/lib/types";
import { issuesFromAnalysis, scoreLead } from "@/lib/types";
import { isSupabaseConfigured, dbLoadPlaceAnalyses, dbSavePlaceAnalysis } from "@/lib/db";

type AnalysisState = { status: "idle" | "loading" | "done" | "error"; data?: WebsiteAnalysis; error?: string; fromCache?: boolean; cachedAt?: string };
type SearchHistoryItem = { query: string; at: string; limit: 10 | 20 | 50; resultCount: number; expanded: number };

const searchHistoryKey = "website-rescue-find-history-v1";

function buildExpandedQueries(query: string): string[] {
  const trimmed = query.trim().replace(/\s+/g, " ");
  const variants = new Set<string>([trimmed]);
  const inMatch = trimmed.match(/^(.*?)(?:\s+in\s+|\s+near\s+)(.+)$/i);

  if (inMatch) {
    const subject = inMatch[1].trim();
    const location = inMatch[2].trim();
    if (subject && location) {
      variants.add(`${location} ${subject}`);
      variants.add(`${subject} near ${location}`);
      variants.add(`${subject} ${location}`);
    }
  }

  const commaParts = trimmed.split(",").map(part => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const [left, right] = commaParts;
    variants.add(`${right} ${left}`);
    variants.add(`${left} near ${right}`);
  }

  return [...variants].filter(Boolean).slice(0, 5);
}

function mergePlaces(existing: PlaceResult[], incoming: PlaceResult[]): PlaceResult[] {
  const seen = new Set<string>();
  const merged: PlaceResult[] = [];
  for (const place of [...existing, ...incoming]) {
    const key = place.placeId || place.websiteUrl || `${place.company}|${place.city}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(place);
  }
  return merged;
}

function placeToLead(place: PlaceResult, analysis?: WebsiteAnalysis): Lead {
  const noWebsite = !place.websiteUrl;
  const issues = analysis ? issuesFromAnalysis(analysis, noWebsite) :
    noWebsite ? { mobile: true, slow: true, dated: true, noCta: true, noBooking: true, noSsl: true } :
    { mobile: false, slow: false, dated: false, noCta: false, noBooking: false, noSsl: false };
  const score = analysis ? scoreLead({ issues } as Lead) : (noWebsite ? 100 : undefined);
  return {
    id: crypto.randomUUID(),
    company: place.company,
    niche: place.niche,
    city: place.city,
    website: place.website,
    websiteUrl: place.websiteUrl || undefined,
    contactName: "",
    email: "",
    phone: place.phone,
    status: "New",
    value: 2500,
    notes: "",
    createdAt: new Date().toISOString().slice(0, 10),
    issues,
    placeId: place.placeId,
    formattedAddress: place.formattedAddress || undefined,
    googleMapsUrl: place.googleMapsUrl || undefined,
    rating: place.rating ?? undefined,
    reviewCount: place.reviewCount || undefined,
    analysis,
    analyzedAt: analysis ? new Date().toISOString().slice(0, 10) : undefined,
    rescueScore: score,
  };
}

function isDuplicate(place: PlaceResult, existing: Lead[]): boolean {
  return existing.some(l =>
    (place.placeId && l.placeId === place.placeId) ||
    (place.website && l.website === place.website) ||
    l.company.toLowerCase() === place.company.toLowerCase()
  );
}

function calcScore(a: WebsiteAnalysis, noWebsite: boolean): number {
  if (noWebsite) return 100;
  return scoreLead({ issues: issuesFromAnalysis(a, false) } as Lead);
}

function AnalysisBadges({ a }: { a: WebsiteAnalysis }) {
  // When blocked by Cloudflare etc., don't show false issue tags — we simply couldn't read the page
  if (a.blocked) {
    return (
      <span className="find-blocked-tag" title="Cloudflare or similar bot-protection prevented content analysis. HTTPS and response time are still verified.">
        🛡 Bot protection
      </span>
    );
  }
  const issues: string[] = [];
  if (!a.isReachable) issues.push("Unreachable");
  if (!a.hasHttps) issues.push("No HTTPS");
  if (!a.hasMobileViewport) issues.push("No mobile");
  if (!a.hasCTA) issues.push("No CTA");
  if (!a.hasBooking) issues.push("No booking");
  if (a.responseTimeMs && a.responseTimeMs > 3000) issues.push(`Slow (${(a.responseTimeMs / 1000).toFixed(1)}s)`);
  if (a.hasOutdatedHTML) issues.push("Outdated HTML");
  if (!issues.length) return <span className="find-ok">&#10003; No major issues</span>;
  return <>{issues.map(i => <span key={i} className="find-issue-tag">{i}</span>)}</>;
}

export function FindLeads({ existingLeads, onImport, notify }: {
  existingLeads: Lead[];
  onImport: (leads: Lead[]) => void;
  notify: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState<10 | 20 | 50>(10);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analyses, setAnalyses] = useState<Record<string, AnalysisState>>({});
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [minScore, setMinScore] = useState(10);
  const [useScoreFilter, setUseScoreFilter] = useState(true);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [expandedQueries, setExpandedQueries] = useState(1);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(searchHistoryKey);
      if (raw) setSearchHistory(JSON.parse(raw) as SearchHistoryItem[]);
    } catch {
      // ignore malformed local history
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(searchHistoryKey, JSON.stringify(searchHistory.slice(0, 10)));
    } catch {
      // ignore storage quota or privacy blocking
    }
  }, [searchHistory]);

  const runSearch = async (rawQuery: string) => {
    const normalizedQuery = rawQuery.trim();
    if (!normalizedQuery || searching) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    setSelected(new Set());
    setAnalyses({});
    setImported(new Set());
    setExpandedQueries(1);
    try {
      const variants = buildExpandedQueries(normalizedQuery);
      setExpandedQueries(variants.length);
      const collected: PlaceResult[] = [];
      let firstError: string | null = null;

      for (const variant of variants) {
        const res = await fetch("/api/places/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: variant, maxResults }),
        });
        const data = await res.json();
        if (data.error) {
          firstError ??= data.error;
          continue;
        }
        collected.push(...(data.places ?? []));
      }

      const places = mergePlaces([], collected);
      setResults(places);

      const historyQuery = normalizedQuery.replace(/\s+/g, " ");
      setSearchHistory(prev => [
        { query: historyQuery, at: new Date().toISOString(), limit: maxResults, resultCount: places.length, expanded: variants.length },
        ...prev.filter(item => item.query !== historyQuery),
      ].slice(0, 10));

      if (!places.length && firstError) {
        setSearchError(firstError);
        return;
      }

      // Load cached analyses from Supabase — pre-populates scores from previous sessions
      if (isSupabaseConfigured && places.length > 0) {
        setDbError(null);
        const { data: cached, error: loadErr } = await dbLoadPlaceAnalyses(places.map(p => p.placeId));
        if (loadErr) {
          setDbError(`Supabase load error: ${loadErr}`);
        } else if (Object.keys(cached).length > 0) {
          setAnalyses(
            Object.fromEntries(
              Object.entries(cached).map(([id, { analysis, analyzedAt }]) => [
                id, { status: "done" as const, data: analysis, fromCache: true, cachedAt: analyzedAt }
              ])
            )
          );
        }
      }
    } catch {
      setSearchError("Request failed. Check your network connection.");
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch(query);
  };

  const analyzeSingle = useCallback(async (place: PlaceResult) => {
    const id = place.placeId;
    setAnalyses(p => ({ ...p, [id]: { status: "loading" } }));
    try {
      const res = await fetch("/api/websites/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: place.websiteUrl || "" }),
      });
      const data = await res.json();
      if (data.error) {
        setAnalyses(p => ({ ...p, [id]: { status: "error", error: data.error } }));
      } else {
        const analysis = data.analysis as WebsiteAnalysis;
        const score = calcScore(analysis, !place.websiteUrl);
        setAnalyses(p => ({ ...p, [id]: { status: "done", data: analysis } }));
        if (isSupabaseConfigured) {
          await dbSavePlaceAnalysis(id, place.company, place.websiteUrl, analysis, score);
        }
      }
    } catch {
      setAnalyses(p => ({ ...p, [id]: { status: "error", error: "Request failed" } }));
    }
  }, []);

  const analyzeAll = useCallback(async () => {
    const toAnalyze = results.filter(p => {
      const s = analyses[p.placeId]?.status;
      return s !== "loading" && s !== "done";
    });
    if (!toAnalyze.length) return;
    const queue = [...toAnalyze];
    const processBatch = async (): Promise<void> => {
      const batch = queue.splice(0, 3);
      if (!batch.length) return;
      await Promise.all(batch.map(analyzeSingle));
      await processBatch();
    };
    await processBatch();
  }, [results, analyses, analyzeSingle]);

  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const alreadyIn = (p: PlaceResult) => imported.has(p.placeId) || isDuplicate(p, existingLeads);

  // Filter logic: unanalyzed always shown; blocked sites shown regardless of score
  const visibleResults = results.filter(p => {
    if (!useScoreFilter) return true;
    const aState = analyses[p.placeId];
    if (!aState || aState.status !== "done" || !aState.data) return true;
    if (aState.data.blocked) return true;  // blocked → we don\'t know real score
    return calcScore(aState.data, !p.websiteUrl) >= minScore;
  });

  const hiddenCount = results.length - visibleResults.length;
  const importableVisible = visibleResults.filter(p => !alreadyIn(p));
  const allSelected = importableVisible.length > 0 && selected.size === importableVisible.length;

  const toggleAll = () => {
    if (allSelected) { setSelected(new Set()); }
    else { setSelected(new Set(importableVisible.map(p => p.placeId))); }
  };

  const handleImport = () => {
    const toImport = visibleResults.filter(p => selected.has(p.placeId));
    if (!toImport.length) return;
    if (toImport.length > 5 && !confirm(`Import ${toImport.length} leads into your CRM?`)) return;
    const leads = toImport.map(p => placeToLead(p, analyses[p.placeId]?.data));
    onImport(leads);
    setImported(prev => new Set([...prev, ...toImport.map(p => p.placeId)]));
    setSelected(new Set());
    notify(`${leads.length} lead${leads.length !== 1 ? "s" : ""} imported`);
  };

  const importOne = (place: PlaceResult) => {
    const lead = placeToLead(place, analyses[place.placeId]?.data);
    onImport([lead]);
    setImported(prev => new Set([...prev, place.placeId]));
    notify(`${place.company} imported`);
  };

  return (
    <div className="content">
      <div className="lead-head">
        <div><p>Search Google Maps for local businesses and import them directly into your CRM.</p></div>
      </div>

      <section className="panel find-search-panel">
        <form className="find-search-form" onSubmit={handleSearch}>
          <label className="find-search-input">
            <Search />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. dentists in San Jose" disabled={searching} />
          </label>
          <div className="find-limit-group">
            {([10, 20, 50] as const).map(n => (
              <button key={n} type="button" className={maxResults === n ? "find-limit active" : "find-limit"} onClick={() => setMaxResults(n)}>{n}</button>
            ))}
          </div>
          <button type="submit" className="primary find-go" disabled={searching || !query.trim()}>
            {searching ? <><Loader2 className="spin" />Searching…</> : <><MapPin />Search Google Maps</>}
          </button>
        </form>
        <p className="find-hint">
          Google Places API (New). Requires <code>GOOGLE_PLACES_API_KEY</code>.
          Searches expand into a few related query variants so you can see more than a single first page.
          {isSupabaseConfigured && <> Analyses persist in Supabase.</>}
        </p>
        {searchHistory.length > 0 && (
          <div className="find-history">
            <span>Recent searches</span>
            <div className="find-history-list">
              {searchHistory.map(item => (
                <button
                  key={`${item.query}-${item.at}`}
                  type="button"
                  className="find-history-chip"
                  onClick={() => { setQuery(item.query); void runSearch(item.query); }}
                  title={`${item.resultCount} results · expanded across ${item.expanded} queries`}
                >
                  <strong>{item.query}</strong>
                  <small>{item.resultCount} results</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {searchError && (
        <div className={`find-error ${searchError.includes("not configured") ? "find-error-setup" : ""}`}>
          <AlertCircle />
          <div>
            <strong>{searchError.includes("not configured") ? "Google API not configured" : "Search failed"}</strong>
            <p>{searchError}</p>
            {searchError.includes("not configured") && (
              <p>Add <code>GOOGLE_PLACES_API_KEY</code> to <code>.env.local</code> and restart the server. See README for details.</p>
            )}
          </div>
        </div>
      )}

      {dbError && (
        <div className={`find-error find-error-db${dbError.toLowerCase().includes("failed to fetch") ? " find-error-offline" : ""}`}>
          <AlertCircle size={15} />
          <div>
            <strong>{dbError.toLowerCase().includes("failed to fetch") ? "Supabase unavailable" : "Supabase sync error"}</strong>
            <p>{dbError.toLowerCase().includes("failed to fetch") ? "Could not reach Supabase. Results save locally only." : dbError}</p>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <section className="panel find-results-panel">
          <div className="find-results-head">
            <div className="find-results-title">
              <strong>{visibleResults.length} of {results.length} shown</strong>
              {expandedQueries > 1 && <span className="find-expanded-note">Expanded across {expandedQueries} related searches</span>}
              {hiddenCount > 0 && useScoreFilter && <span className="find-hidden-note">{hiddenCount} hidden (score &lt; {minScore})</span>}
              <span className="muted">{importableVisible.length} importable · {selected.size} selected</span>
            </div>
            <div className="find-results-actions">
              <label className="find-filter-toggle" title="When on, results below the min score are hidden">
                <input type="checkbox" checked={useScoreFilter} onChange={e => setUseScoreFilter(e.target.checked)} />
                Filter by score
              </label>
              {useScoreFilter && (
                <label className="find-minscore-label">
                  Min score
                  <input type="number" className="find-minscore-input" value={minScore}
                    onChange={e => setMinScore(Math.max(0, Math.min(100, Number(e.target.value))))}
                    min={0} max={100} />
                </label>
              )}
              <button className="secondary small" onClick={analyzeAll}
                disabled={results.every(p => analyses[p.placeId]?.status === "done" || analyses[p.placeId]?.status === "loading")}>
                <Zap />Analyze all
              </button>
              <button className="primary small" onClick={handleImport} disabled={selected.size === 0}>
                <Check />Import ({selected.size})
              </button>
            </div>
          </div>

          <div className="find-table-wrap">
            <table className="find-table">
              <thead>
                <tr>
                  <th><button className="check-btn" onClick={toggleAll}>{allSelected ? <CheckSquare /> : <Square />}</button></th>
                  <th>COMPANY</th><th>CONTACT</th><th>RATING</th><th>RESCUE SCORE</th><th>ISSUES</th><th></th>
                </tr>
              </thead>
              <tbody>
                {visibleResults.map(place => {
                  const aState = analyses[place.placeId];
                  const dup = alreadyIn(place);
                  const isSelected = selected.has(place.placeId);
                  const score = aState?.status === "done" && aState.data
                    ? calcScore(aState.data, !place.websiteUrl)
                    : !place.websiteUrl ? 100 : null;

                  return (
                    <tr key={place.placeId} className={isSelected ? "find-row selected" : "find-row"}>
                      <td>
                        {dup
                          ? <span className="find-dup-badge" title="Already in CRM">✓</span>
                          : <button className="check-btn" onClick={() => toggleSelect(place.placeId)}>{isSelected ? <CheckSquare /> : <Square />}</button>}
                      </td>
                      <td>
                        <div className="find-company">
                          <i className="co-initials">{place.company.slice(0, 2).toUpperCase()}</i>
                          <div><strong>{place.company}</strong><small>{place.niche} · {place.city}</small></div>
                        </div>
                      </td>
                      <td>
                        <div className="find-contact">
                          {place.phone && <span>{place.phone}</span>}
                          {place.websiteUrl
                            ? <a href={place.websiteUrl} target="_blank" rel="noopener noreferrer" className="find-link"><Globe size={13} />{place.website}</a>
                            : <span className="find-no-site">No website</span>}
                          {place.googleMapsUrl && <a href={place.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="find-link"><MapPin size={13} />Maps</a>}
                        </div>
                      </td>
                      <td>
                        {place.rating !== null
                          ? <span className="find-rating"><Star size={12} />{place.rating} <small>({place.reviewCount})</small></span>
                          : <span className="muted">—</span>}
                      </td>
                      <td>
                        {!place.websiteUrl
                          ? <span className="find-score high">100 <small>No website</small></span>
                          : score !== null
                            ? <span className={`find-score ${score >= 60 ? "high" : score >= 30 ? "med" : "low"}`}>
                                {score}
                                {aState?.fromCache && <span className="find-cached-badge" title={`Cached: ${aState.cachedAt ? new Date(aState.cachedAt).toLocaleDateString() : "prev. session"}`}><Clock size={10}/></span>}
                              </span>
                            : <span className="find-score none">—</span>}
                      </td>
                      <td>
                        {!place.websiteUrl ? <span className="find-issue-tag">No website</span>
                          : aState?.status === "done" && aState.data ? <AnalysisBadges a={aState.data} />
                          : aState?.status === "loading" ? <span className="find-analyzing"><Loader2 size={13} className="spin" />Analyzing…</span>
                          : aState?.status === "error" ? <span className="find-error-tag" title={aState.error}><AlertCircle size={13} />Error</span>
                          : <span className="muted">Not analyzed</span>}
                      </td>
                      <td>
                        <div className="find-row-actions">
                          {place.websiteUrl && (
                            <button className="secondary small icon-btn" onClick={() => analyzeSingle(place)}
                              disabled={aState?.status === "loading"}
                              title={aState?.status === "done" ? "Re-analyze" : "Analyze website"}>
                              {aState?.status === "loading" ? <Loader2 size={13} className="spin" />
                                : aState?.status === "done" ? <RefreshCw size={13} /> : <Zap size={13} />}
                            </button>
                          )}
                          {!dup && (
                            <button className="primary small icon-btn" onClick={() => importOne(place)} title="Import this lead">
                              <ArrowUpRight size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hiddenCount > 0 && (
            <div className="find-hidden-bar">
              <AlertCircle size={14} />
              {hiddenCount} result{hiddenCount !== 1 ? "s" : ""} hidden — score below {minScore}. Lower the min score or re-analyze to reveal them.
            </div>
          )}
        </section>
      )}

      {!searching && !searchError && results.length === 0 && query && (
        <div className="empty"><Search /><h3>No results yet</h3><p>Run a search above to find businesses from Google Maps.</p></div>
      )}
    </div>
  );
}
