"use client";
import { useCallback, useState } from "react";
import { AlertCircle, ArrowUpRight, Check, CheckSquare, Globe, Loader2, MapPin, RefreshCw, Search, Square, Star, Zap } from "lucide-react";
import type { Lead, PlaceResult, WebsiteAnalysis } from "@/lib/types";
import { issueLabels, issuesFromAnalysis, scoreLead } from "@/lib/types";

type AnalysisState = { status: "idle" | "loading" | "done" | "error"; data?: WebsiteAnalysis; error?: string };

function placeToLead(place: PlaceResult, analysis?: WebsiteAnalysis): Lead {
  const noWebsite = !place.websiteUrl;
  const issues = analysis ? issuesFromAnalysis(analysis, noWebsite) :
    noWebsite ? { mobile: true, slow: true, dated: true, noCta: true, noBooking: true, noSsl: true } :
    { mobile: false, slow: false, dated: false, noCta: false, noBooking: false, noSsl: false };
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
  };
}

function isDuplicate(place: PlaceResult, existing: Lead[]): boolean {
  return existing.some(l =>
    (place.placeId && l.placeId === place.placeId) ||
    (place.website && l.website === place.website) ||
    l.company.toLowerCase() === place.company.toLowerCase()
  );
}

function analysisScore(a: WebsiteAnalysis, noWebsite: boolean): number {
  if (noWebsite) return 100;
  const lead = { issues: issuesFromAnalysis(a, false) } as Lead;
  return scoreLead(lead);
}

function AnalysisBadges({ a }: { a: WebsiteAnalysis }) {
  const issues: string[] = [];
  if (!a.hasHttps) issues.push("No HTTPS");
  if (!a.hasMobileViewport) issues.push("No mobile");
  if (!a.hasCTA) issues.push("No CTA");
  if (!a.hasBooking) issues.push("No booking");
  if (a.responseTimeMs && a.responseTimeMs > 3000) issues.push(`Slow (${(a.responseTimeMs / 1000).toFixed(1)}s)`);
  if (a.hasOutdatedHTML) issues.push("Outdated HTML");
  if (!a.isReachable) issues.push("Unreachable");
  if (!issues.length) return <span className="find-ok">✓ No major issues</span>;
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    setSelected(new Set());
    setAnalyses({});
    setImported(new Set());
    try {
      const res = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), maxResults }),
      });
      const data = await res.json();
      if (data.error) { setSearchError(data.error); return; }
      setResults(data.places ?? []);
    } catch {
      setSearchError("Request failed. Check your network connection.");
    } finally {
      setSearching(false);
    }
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
        setAnalyses(p => ({ ...p, [id]: { status: "done", data: data.analysis as WebsiteAnalysis } }));
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

    const batchSize = 3;
    const queue = [...toAnalyze];

    const processBatch = async (): Promise<void> => {
      const batch = queue.splice(0, batchSize);
      if (!batch.length) return;
      await Promise.all(batch.map(analyzeSingle));
      await processBatch();
    };
    await processBatch();
  }, [results, analyses, analyzeSingle]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const importable = results.filter(p => !imported.has(p.placeId) && !isDuplicate(p, existingLeads));
    if (selected.size === importable.length && importable.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importable.map(p => p.placeId)));
    }
  };

  const handleImport = () => {
    const toImport = results.filter(p => selected.has(p.placeId));
    if (!toImport.length) return;
    if (toImport.length > 5) {
      if (!confirm(`Import ${toImport.length} leads into your CRM?`)) return;
    }
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

  const alreadyIn = (p: PlaceResult) => imported.has(p.placeId) || isDuplicate(p, existingLeads);
  const importableCount = results.filter(p => !alreadyIn(p)).length;
  const allSelected = importableCount > 0 && selected.size === importableCount;

  return (
    <div className="content">
      <div className="lead-head">
        <div><p>Search Google Maps for local businesses and import them directly into your CRM.</p></div>
      </div>

      {/* Search form */}
      <section className="panel find-search-panel">
        <form className="find-search-form" onSubmit={handleSearch}>
          <label className="find-search-input">
            <Search />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. dentists in San Jose"
              disabled={searching}
            />
          </label>
          <div className="find-limit-group">
            {([10, 20, 50] as const).map(n => (
              <button
                key={n}
                type="button"
                className={maxResults === n ? "find-limit active" : "find-limit"}
                onClick={() => setMaxResults(n)}
              >{n}</button>
            ))}
          </div>
          <button type="submit" className="primary find-go" disabled={searching || !query.trim()}>
            {searching ? <><Loader2 className="spin" />Searching…</> : <><MapPin />Search Google Maps</>}
          </button>
        </form>
        <p className="find-hint">Results are fetched from Google Places API (New). Requires <code>GOOGLE_PLACES_API_KEY</code>.</p>
      </section>

      {/* API error */}
      {searchError && (
        <div className={`find-error ${searchError.includes("not configured") ? "find-error-setup" : ""}`}>
          <AlertCircle />
          <div>
            <strong>{searchError.includes("not configured") ? "Google API not configured" : "Search failed"}</strong>
            <p>{searchError}</p>
            {searchError.includes("not configured") && (
              <p>See the README for setup instructions. Add <code>GOOGLE_PLACES_API_KEY</code> to <code>.env.local</code> and restart the server.</p>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <section className="panel find-results-panel">
          <div className="find-results-head">
            <div className="find-results-title">
              <strong>{results.length} places found</strong>
              <span className="muted">{importableCount} importable · {selected.size} selected</span>
            </div>
            <div className="find-results-actions">
              <button className="secondary small" onClick={analyzeAll} disabled={results.every(p => analyses[p.placeId]?.status === "done" || analyses[p.placeId]?.status === "loading")}>
                <Zap />Analyze all
              </button>
              <button className="primary small" onClick={handleImport} disabled={selected.size === 0}>
                <Check />Import selected ({selected.size})
              </button>
            </div>
          </div>

          <div className="find-table-wrap">
            <table className="find-table">
              <thead>
                <tr>
                  <th>
                    <button className="check-btn" onClick={toggleAll} title="Select all">
                      {allSelected ? <CheckSquare /> : <Square />}
                    </button>
                  </th>
                  <th>COMPANY</th>
                  <th>CONTACT</th>
                  <th>RATING</th>
                  <th>RESCUE SCORE</th>
                  <th>ISSUES</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map(place => {
                  const aState = analyses[place.placeId];
                  const dup = alreadyIn(place);
                  const isSelected = selected.has(place.placeId);
                  const score = aState?.status === "done" && aState.data
                    ? analysisScore(aState.data, !place.websiteUrl)
                    : !place.websiteUrl ? 100 : null;

                  return (
                    <tr key={place.placeId} className={isSelected ? "find-row selected" : "find-row"}>
                      <td>
                        {dup ? (
                          <span className="find-dup-badge" title="Already in CRM">✓</span>
                        ) : (
                          <button className="check-btn" onClick={() => toggleSelect(place.placeId)}>
                            {isSelected ? <CheckSquare /> : <Square />}
                          </button>
                        )}
                      </td>
                      <td>
                        <div className="find-company">
                          <i className="co-initials">{place.company.slice(0, 2).toUpperCase()}</i>
                          <div>
                            <strong>{place.company}</strong>
                            <small>{place.niche} · {place.city}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="find-contact">
                          {place.phone && <span>{place.phone}</span>}
                          {place.websiteUrl ? (
                            <a href={place.websiteUrl} target="_blank" rel="noopener noreferrer" className="find-link"><Globe size={13} />{place.website}</a>
                          ) : <span className="find-no-site">No website</span>}
                          {place.googleMapsUrl && (
                            <a href={place.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="find-link"><MapPin size={13} />Maps</a>
                          )}
                        </div>
                      </td>
                      <td>
                        {place.rating !== null ? (
                          <span className="find-rating"><Star size={12} />{place.rating} <small>({place.reviewCount})</small></span>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>
                        {!place.websiteUrl ? (
                          <span className="find-score high">100 <small>No website</small></span>
                        ) : score !== null ? (
                          <span className={`find-score ${score >= 60 ? "high" : score >= 30 ? "med" : "low"}`}>{score}</span>
                        ) : (
                          <span className="find-score none">—</span>
                        )}
                      </td>
                      <td>
                        {!place.websiteUrl ? (
                          <span className="find-issue-tag">No website</span>
                        ) : aState?.status === "done" && aState.data ? (
                          <AnalysisBadges a={aState.data} />
                        ) : aState?.status === "loading" ? (
                          <span className="find-analyzing"><Loader2 size={13} className="spin" />Analyzing…</span>
                        ) : aState?.status === "error" ? (
                          <span className="find-error-tag" title={aState.error}><AlertCircle size={13} />Error</span>
                        ) : (
                          <span className="muted">Not analyzed</span>
                        )}
                      </td>
                      <td>
                        <div className="find-row-actions">
                          {place.websiteUrl && (
                            <button
                              className="secondary small icon-btn"
                              onClick={() => analyzeSingle(place)}
                              disabled={aState?.status === "loading"}
                              title={aState?.status === "done" ? "Re-analyze" : "Analyze website"}
                            >
                              {aState?.status === "loading" ? <Loader2 size={13} className="spin" /> :
                               aState?.status === "done" ? <RefreshCw size={13} /> : <Zap size={13} />}
                            </button>
                          )}
                          {!dup && (
                            <button
                              className="primary small icon-btn"
                              onClick={() => importOne(place)}
                              title="Import this lead"
                            >
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
        </section>
      )}

      {/* Empty state after search */}
      {!searching && !searchError && results.length === 0 && query && (
        <div className="empty">
          <Search />
          <h3>No results yet</h3>
          <p>Run a search above to find businesses from Google Maps.</p>
        </div>
      )}
    </div>
  );
}
