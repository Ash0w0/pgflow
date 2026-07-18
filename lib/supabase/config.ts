export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

function validSupabaseUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    return false;
  }
}

export function readPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? ""
  ).trim();

  if (!url && !publishableKey) return null;
  if (!url || !publishableKey || !validSupabaseUrl(url)) {
    throw new Error("Supabase public environment variables are incomplete or invalid.");
  }

  return { url: url.replace(/\/$/, ""), publishableKey };
}

export function requirePublicSupabaseConfig() {
  const config = readPublicSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured for this runtime.");
  return config;
}
