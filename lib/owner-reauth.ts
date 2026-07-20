import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";

export async function verifyOwnerPassword(authUserId: string, phone: string, password: string) {
  const { url, publishableKey } = requirePublicSupabaseConfig();
  const verifier = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await verifier.auth.signInWithPassword({ phone, password });
  const exact = !error && data.user?.id === authUserId && Boolean(data.session);
  if (data.session) await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
  return exact;
}
