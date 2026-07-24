export function isDemoRuntime() {
  const runtime = process.env.PGFLOW_RUNTIME;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isPlaceholderSupabase = !supabaseUrl || supabaseUrl.includes("your-project.supabase.co") || supabaseUrl.includes("replace_me");
  return runtime === "demo" || isPlaceholderSupabase || !process.env.SUPABASE_SECRET_KEY;
}

export function isProductionRuntime() {
  return !isDemoRuntime();
}

