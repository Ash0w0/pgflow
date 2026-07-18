import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase/admin";
import { requirePublicSupabaseConfig } from "./supabase/config";

export async function verifyOperatorPassword(operatorUserId: string, password: string) {
  if (password.length < 8 || password.length > 128) return false;

  const admin = getSupabaseAdmin();
  const { data: operatorUser, error: lookupError } = await admin.auth.admin.getUserById(operatorUserId);
  const phone = operatorUser.user?.phone;
  if (lookupError || !phone) return false;

  const { url, publishableKey } = requirePublicSupabaseConfig();
  const verifier = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await verifier.auth.signInWithPassword({ phone, password });
  const matches = !error && data.user?.id === operatorUserId;
  if (data.session) await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
  return matches;
}

export async function verifyOperatorPasswordAndRevokeSessions(operatorUserId: string, password: string) {
  if (password.length < 8 || password.length > 128) return false;

  const admin = getSupabaseAdmin();
  const { data: operatorUser, error: lookupError } = await admin.auth.admin.getUserById(operatorUserId);
  const phone = operatorUser.user?.phone;
  if (lookupError || !phone) return false;

  const { url, publishableKey } = requirePublicSupabaseConfig();
  const verifier = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await verifier.auth.signInWithPassword({ phone, password });
  if (error || data.user?.id !== operatorUserId || !data.session) return false;
  const { error: signOutError } = await verifier.auth.signOut({ scope: "global" });
  return !signOutError;
}
