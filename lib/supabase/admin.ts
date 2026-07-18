import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requirePublicSupabaseConfig } from "./config";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;

  const { url } = requirePublicSupabaseConfig();
  const serviceRoleKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!serviceRoleKey) throw new Error("SUPABASE_SECRET_KEY is required on the server.");

  adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}
