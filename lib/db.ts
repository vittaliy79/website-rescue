import { supabase } from "./supabase";
import { scoreLead } from "./types";
import type { Lead, WebsiteAnalysis } from "./types";

export { isSupabaseConfigured } from "./supabase";

type Row = Record<string, unknown>;

export function rowToLead(r: Row): Lead {
  return {
    id: r.id as string,
    company: (r.company as string) || "",
    niche: (r.niche as string) || "",
    city: (r.city as string) || "",
    website: (r.website as string) || "",
    contactName: (r.contact_name as string) || "",
    email: (r.email as string) || "",
    phone: (r.phone as string) || "",
    status: (r.status as Lead["status"]) || "New",
    value: Number(r.value) || 2500,
    notes: (r.notes as string) || "",
    createdAt: (r.created_at as string) || "",
    issues: (r.issues as Lead["issues"]) || { mobile: false, slow: false, dated: false, noCta: false, noBooking: false, noSsl: false },
    placeId: (r.place_id as string) || undefined,
    formattedAddress: (r.formatted_address as string) || undefined,
    googleMapsUrl: (r.google_maps_url as string) || undefined,
    websiteUrl: (r.website_url as string) || undefined,
    rating: r.rating != null ? Number(r.rating) : undefined,
    reviewCount: r.review_count != null ? Number(r.review_count) : undefined,
    analysis: (r.analysis as WebsiteAnalysis) || undefined,
    analyzedAt: (r.analyzed_at as string) || undefined,
    rescueScore: r.rescue_score != null ? Number(r.rescue_score) : undefined,
    outreachCurrent: (r.outreach_current as string) || undefined,
    outreachVersions: (r.outreach_versions as { body: string; createdAt: string }[] | undefined) || undefined,
  };
}

export function leadToRow(lead: Lead): Row {
  return {
    id: lead.id,
    company: lead.company,
    niche: lead.niche,
    city: lead.city,
    website: lead.website,
    contact_name: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    status: lead.status,
    value: lead.value,
    notes: lead.notes,
    created_at: lead.createdAt,
    issues: lead.issues,
    place_id: lead.placeId ?? null,
    formatted_address: lead.formattedAddress ?? null,
    google_maps_url: lead.googleMapsUrl ?? null,
    website_url: lead.websiteUrl ?? null,
    rating: lead.rating ?? null,
    review_count: lead.reviewCount ?? null,
    analysis: lead.analysis ?? null,
    analyzed_at: lead.analyzedAt ?? null,
    rescue_score: scoreLead(lead),
    outreach_current: lead.outreachCurrent ?? null,
    outreach_versions: lead.outreachVersions ?? null,
  };
}

export async function dbLoadLeads(): Promise<Lead[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("wr_leads").select("*").order("created_at", { ascending: false });
  if (error) { console.error("dbLoadLeads:", error.message); return null; }
  return (data as Row[]).map(rowToLead);
}

export async function dbSaveLead(lead: Lead): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("wr_leads").upsert(leadToRow(lead));
  if (error) { console.error("dbSaveLead:", error.message); return false; }
  return true;
}

export async function dbDeleteLead(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("wr_leads").delete().eq("id", id);
  if (error) { console.error("dbDeleteLead:", error.message); return false; }
  return true;
}

export async function dbLoadPlaceAnalyses(placeIds: string[]): Promise<{
  data: Record<string, { analysis: WebsiteAnalysis; rescueScore: number; analyzedAt: string }>;
  error: string | null;
}> {
  if (!supabase || !placeIds.length) return { data: {}, error: null };
  let data: unknown, error: { message: string } | null;
  try {
    ({ data, error } = await supabase.from("wr_place_analyses").select("*").in("place_id", placeIds));
  } catch (e) {
    return { data: {}, error: e instanceof Error ? e.message : String(e) };
  }
  if (error) return { data: {}, error: error.message };
  const out: Record<string, { analysis: WebsiteAnalysis; rescueScore: number; analyzedAt: string }> = {};
  (data as Row[]).forEach(r => {
    out[r.place_id as string] = {
      analysis: r.analysis as WebsiteAnalysis,
      rescueScore: Number(r.rescue_score),
      analyzedAt: (r.analyzed_at as string) ?? "",
    };
  });
  return { data: out, error: null };
}

export async function dbSavePlaceAnalysis(placeId: string, company: string, websiteUrl: string, analysis: WebsiteAnalysis, rescueScore: number): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { error } = await supabase.from("wr_place_analyses").upsert({
      place_id: placeId,
      company,
      website_url: websiteUrl || null,
      analysis,
      rescue_score: rescueScore,
      analyzed_at: new Date().toISOString(),
    });
    if (error) return error.message;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return null;
}
