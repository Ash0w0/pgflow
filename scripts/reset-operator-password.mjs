import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const secretKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const newPassword = (process.env.NEW_OPERATOR_PASSWORD ?? process.argv[2] ?? "").trim();

if (!url || !secretKey || secretKey.includes(".dummy")) {
  console.error("Error: Valid NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required in .env.local.");
  process.exit(1);
}

if (!newPassword || newPassword.length < 12) {
  console.error("Usage: node scripts/reset-operator-password.mjs <NewStrongPassword123!>");
  console.error("Password must be at least 12 characters long.");
  process.exit(1);
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: operators, error: opError } = await supabase
  .from("platform_operators")
  .select("auth_user_id, display_name")
  .eq("state", "active");

if (opError || !operators || operators.length === 0) {
  console.error("Error: No active platform operator found in database.", opError?.message);
  process.exit(1);
}

for (const op of operators) {
  const { error: updateError } = await supabase.auth.admin.updateUserById(op.auth_user_id, {
    password: newPassword,
  });

  if (updateError) {
    console.error(`Failed to update password for operator (${op.display_name}):`, updateError.message);
  } else {
    console.log(`Successfully reset password for operator (${op.display_name})!`);
  }
}
