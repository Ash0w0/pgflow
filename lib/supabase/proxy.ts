import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readPublicSupabaseConfig } from "./config";

export async function refreshSupabaseSession(request: NextRequest) {
  let config: ReturnType<typeof readPublicSupabaseConfig>;
  try {
    config = readPublicSupabaseConfig();
  } catch {
    return NextResponse.next({ request });
  }
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const client = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() validates the session with Supabase; getSession() alone must not
  // be used as an authorization decision.
  await client.auth.getUser();
  return response;
}
