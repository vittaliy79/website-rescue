export type LeadStatus = "New" | "Reviewed" | "Contacted" | "Interested" | "Proposal" | "Won" | "Lost";

export type WebsiteAnalysis = {
  isReachable: boolean;
  responseTimeMs: number | null;
  hasHttps: boolean;
  hasMobileViewport: boolean;
  hasTitle: boolean;
  hasMetaDescription: boolean;
  hasPhone: boolean;
  hasContactForm: boolean;
  hasBooking: boolean;
  hasCTA: boolean;
  hasOutdatedHTML: boolean;
  httpStatus: number | null;
  // true when Cloudflare or similar blocked the request — content checks are unreliable
  blocked: boolean;
  error: string | null;
};

export type PlaceResult = {
  placeId: string;
  company: string;
  niche: string;
  city: string;
  formattedAddress: string;
  phone: string;
  website: string;
  websiteUrl: string;
  rating: number | null;
  reviewCount: number;
  googleMapsUrl: string;
};

export type Lead = {
  id: string; company: string; niche: string; city: string; website: string; contactName: string;
  email: string; phone: string; status: LeadStatus; value: number; notes: string; createdAt: string;
  issues: { mobile: boolean; slow: boolean; dated: boolean; noCta: boolean; noBooking: boolean; noSsl: boolean };
  // Google Places & analysis fields (optional — old leads stay valid)
  placeId?: string;
  formattedAddress?: string;
  googleMapsUrl?: string;
  websiteUrl?: string;
  rating?: number;
  reviewCount?: number;
  analysis?: WebsiteAnalysis;
  analyzedAt?: string;
  rescueScore?: number;
  outreachCurrent?: string;
  outreachVersions?: { body: string; createdAt: string }[];
};

export const statuses: LeadStatus[] = ["New","Reviewed","Contacted","Interested","Proposal","Won","Lost"];
export const issueLabels: Record<keyof Lead["issues"], string> = { mobile:"Poor mobile experience",slow:"Slow loading",dated:"Outdated design",noCta:"Weak call to action",noBooking:"No online booking",noSsl:"No HTTPS" };
export function scoreLead(lead: Lead) { const weights: Record<keyof Lead["issues"],number>={mobile:22,slow:14,dated:18,noCta:20,noBooking:16,noSsl:10}; return (Object.keys(weights) as (keyof Lead["issues"])[]).reduce((n,k)=>n+(lead.issues[k]?weights[k]:0),0); }
export function issuesFromAnalysis(a: WebsiteAnalysis, noWebsite = false): Lead["issues"] {
  if (noWebsite) return { mobile:true,slow:true,dated:true,noCta:true,noBooking:true,noSsl:true };
  // When blocked by Cloudflare etc., only flag what we can actually verify
  if (a.blocked) {
    return {
      mobile: false,
      slow: a.responseTimeMs !== null && a.responseTimeMs > 3000,
      dated: false,
      noCta: false,
      noBooking: false,
      noSsl: !a.hasHttps,
    };
  }
  return {
    mobile: !a.hasMobileViewport,
    slow: a.responseTimeMs !== null && a.responseTimeMs > 3000,
    dated: a.hasOutdatedHTML,
    noCta: !a.hasCTA,
    noBooking: !a.hasBooking,
    noSsl: !a.hasHttps,
  };
}
