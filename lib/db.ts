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
  };
}

export async function dbLoadLeads(): Promise<Lead[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
  if (error) { console.error("dbLoadLeads:", error.message); return null; }
  return (data as Row[]).map(rowToLead);
}

export async function dbSaveLead(lead: Lead): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("leads").upsert(leadToRow(lead));
  if (error) { console.error("dbSaveLead:", error.message); return false; }
  return true;
}

export async function dbDeleteLead(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) { console.error("dbDeleteLead:", error.message); return false; }
  return true;
}

export async function dbLoadPlaceAnalyses(placeIds: string[]): Promise<Record<string, { analysis: WebsiteAnalysis; rescueScore: number }>> {
  if (!supabase || !placeIds.length) return {};
  const { data, error } = await supabase.from("place_analyses").select("*").in("place_id", placeIds);
  if (error || !data) return {};
  const out: Record<string, { analysis: WebsiteAnalysis; rescueScore: number }> = {};
  (data as Row[]).forEach(r => {
    out[r.place_id as string] = { analysis: r.analysis as WebsiteAnalysis, rescueScore: Number(r.rescue_score) };
  });
  return out;
}

export async function dbSavePlaceAnalysis(placeId: string, company: string, websiteUrl: string, analysis: WebsiteAnalysis, rescueScore: number): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("place_analyses").upsert({
    place_id: placeId,
    company,
    website_url: websiteUrl || null,
    analysis,
    rescue_score: rescueScore,
    analyzed_at: new Date().toISOString(),
  });
  if (error) console.error("dbSavePlaceAnalysis:", error.message);
}
