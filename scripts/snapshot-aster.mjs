import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
if (!url || !key) throw new Error("Supabase server configuration is required.");

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const organizationResult = await db
  .from("organizations")
  .select("id,name,slug,state,demo_mode")
  .eq("slug", "aster-test-house")
  .single();
if (organizationResult.error) throw organizationResult.error;

const organization = organizationResult.data;
const tables = [
  "properties",
  "memberships",
  "staff_invitations",
  "floors",
  "rooms",
  "beds",
  "tenant_profiles",
  "occupancies",
  "invoices",
  "payments",
  "messages",
];
const counts = {};
for (const table of tables) {
  const result = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organization.id);
  if (result.error) throw result.error;
  counts[table] = result.count;
}

const authResult = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authResult.error) throw authResult.error;

const invitationResult = await db
  .from("staff_invitations")
  .select("state,credential_state,temporary_password_expires_at,activation_auth_user_id,activation_request_id,auth_user_id")
  .eq("organization_id", organization.id)
  .eq("role", "owner")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (invitationResult.error) throw invitationResult.error;
const invitation = invitationResult.data;
const activationAuthUserExists = invitation?.activation_auth_user_id
  ? authResult.data.users.some((user) => user.id === invitation.activation_auth_user_id)
  : false;

console.log(JSON.stringify({
  organization,
  counts,
  authUsers: authResult.data.users.length,
  ownerActivation: invitation ? {
    invitationState: invitation.state,
    credentialState: invitation.credential_state,
    temporaryCredentialExpired: !invitation.temporary_password_expires_at
      || Date.parse(invitation.temporary_password_expires_at) <= Date.now(),
    stableActivationIdAssigned: Boolean(invitation.activation_auth_user_id),
    activationRequestCommitted: Boolean(invitation.activation_request_id),
    authUserBound: Boolean(invitation.auth_user_id),
    activationAuthUserExists,
  } : null,
}, null, 2));
