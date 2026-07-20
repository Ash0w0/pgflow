import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in .env.local for this one-time command.`);
  return value;
}

const url = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const secretKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is required in .env.local.");

const phone = required("BOOTSTRAP_OPERATOR_PHONE").replace(/[\s()-]/g, "");
const password = required("BOOTSTRAP_OPERATOR_PASSWORD");
const displayName = required("BOOTSTRAP_OPERATOR_NAME");

if (!/^\+91[6-9]\d{9}$/.test(phone)) {
  throw new Error("BOOTSTRAP_OPERATOR_PHONE must be an Indian mobile number in +91XXXXXXXXXX format.");
}
if (password.length < 12 || password.length > 128) {
  throw new Error("BOOTSTRAP_OPERATOR_PASSWORD must contain 12 to 128 characters.");
}
if (displayName.length < 2 || displayName.length > 80) {
  throw new Error("BOOTSTRAP_OPERATOR_NAME must contain 2 to 80 characters.");
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { "User-Agent": "pgflow-operator-bootstrap/1.0" } },
});

const { data: operatorRows, error: operatorReadError } = await supabase
  .from("platform_operators")
  .select("auth_user_id,state")
  .limit(2);
if (operatorReadError) throw operatorReadError;

let matchingUser = null;
for (let page = 1; page <= 20 && !matchingUser; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  matchingUser = data.users.find((user) => user.phone === phone) ?? null;
  if (data.users.length < 100) break;
}

if (matchingUser) {
  const existingOperator = operatorRows.find((row) => row.auth_user_id === matchingUser.id);
  if (existingOperator?.state === "active") {
    console.log("Platform operator is already active. No changes were made.");
    process.exit(0);
  }
  throw new Error(
    "That phone already belongs to an Auth user but is not an active platform operator. Review it manually; this safety command will not overwrite an existing account.",
  );
}

if (operatorRows.some((row) => row.state === "active")) {
  throw new Error("An active platform operator already exists. Add future operators through the audited operator console.");
}

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  phone,
  password,
  phone_confirm: true,
  user_metadata: { display_name: displayName },
});
if (createError || !created.user) throw createError ?? new Error("Supabase did not return the created operator user.");

const { error: registryError } = await supabase.from("platform_operators").insert({
  auth_user_id: created.user.id,
  display_name: displayName,
  state: "active",
});

if (registryError) {
  await supabase.auth.admin.deleteUser(created.user.id);
  throw registryError;
}

console.log("Platform operator created successfully.");
console.log("Remove BOOTSTRAP_OPERATOR_PHONE, BOOTSTRAP_OPERATOR_PASSWORD, and BOOTSTRAP_OPERATOR_NAME from .env.local now.");
