import { createClient, SupabaseClient } from "@supabase/supabase-js";

function normalizeSupabaseUrl(rawUrl?: string): string | null {
	if (!rawUrl) return null;

	const trimmed = rawUrl.trim();

	try {
		const parsed = new URL(trimmed);
		const match = parsed.hostname === "supabase.com"
			? parsed.pathname.match(/^\/dashboard\/project\/([^/]+)/)
			: null;

		if (match) return `https://${match[1]}.supabase.co`;
		return `${parsed.protocol}//${parsed.host}`;
	} catch {
		return null;
	}
}

const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const isSupabaseConfigured = !!(url && key);
