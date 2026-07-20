import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isTrustedMutationRequest, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin sign-out is not allowed.", 403);
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  return Response.json({ authenticated: false }, { headers: { "cache-control": "no-store" } });
}
