import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const secretKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const targetDomain = "pgflow-ruby.vercel.app";

if (!url || !secretKey || secretKey.includes(".dummy")) {
  console.error("Error: Valid NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required in .env.local.");
  process.exit(1);
}

const supabase = createClient(url, secretKey);

console.log(`Mapping ${targetDomain} in Supabase...`);

let { data: org } = await supabase
  .from("organizations")
  .select("id")
  .neq("state", "archived")
  .limit(1)
  .maybeSingle();

if (!org) {
  const { data: newOrg, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: "PGFlow Starter", slug: "pgflow-starter", state: "core_ready" })
    .select("id")
    .single();

  if (orgError) {
    console.error("Failed to create organization:", orgError.message);
    process.exit(1);
  }
  org = newOrg;
}

const { error: mappingError } = await supabase.from("domain_mappings").upsert(
  {
    organization_id: org.id,
    hostname: targetDomain,
    kind: "platform_subdomain",
    state: "verified",
    verified_at: new Date().toISOString(),
  },
  { onConflict: "hostname" }
);

if (mappingError) {
  console.error("Failed to map domain:", mappingError.message);
  process.exit(1);
}

console.log(`Success! ${targetDomain} is now mapped to organization ID: ${org.id}`);
