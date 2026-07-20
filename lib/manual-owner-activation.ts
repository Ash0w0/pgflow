import "server-only";

import { timingSafeEqual } from "node:crypto";
import { isUuid, sha256Hex } from "./owner-invitations";
import { getSupabaseAdmin } from "./supabase/admin";

export type VerifiedManualOwnerCredential = {
  invitationId: string;
  activationAuthUserId: string;
  organizationId: string;
  propertyId: string;
  phone: string;
  displayName: string;
};

type CredentialRow = {
  id: string;
  activation_auth_user_id: string | null;
  organization_id: string;
  property_id: string;
  phone: string;
  display_name: string;
  temporary_password_hash: string | null;
  temporary_password_expires_at: string | null;
};

function isUnexpired(value: string | null) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function equalSha256Hex(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

/**
 * Controls whether a draft hostname may expose its owner setup form. Database
 * errors deliberately return false so an incomplete workspace fails closed.
 */
export async function hasPendingManualOwnerCredential(organizationId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("staff_invitations")
    .select("id,activation_auth_user_id,temporary_password_expires_at")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .eq("state", "pending")
    .eq("credential_state", "temporary")
    .not("activation_auth_user_id", "is", null)
    .not("temporary_password_hash", "is", null)
    .gt("temporary_password_expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  return !error
    && Boolean(data?.id)
    && isUuid(data?.activation_auth_user_id ?? "")
    && isUnexpired(data?.temporary_password_expires_at ?? null);
}

/**
 * Determines whether a draft workspace has completed its one-time owner setup.
 * Both the accepted invitation and active owner membership must agree.
 */
export async function hasActivatedManualOwner(organizationId: string) {
  const admin = getSupabaseAdmin();
  const { data: invitation, error: invitationError } = await admin
    .from("staff_invitations")
    .select("activation_auth_user_id,auth_user_id")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .eq("state", "accepted")
    .eq("credential_state", "activated")
    .limit(1)
    .maybeSingle();

  const authUserId = invitation?.auth_user_id;
  if (
    invitationError
    || !authUserId
    || !isUuid(authUserId)
    || invitation.activation_auth_user_id !== authUserId
  ) return false;

  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("auth_user_id", authUserId)
    .eq("role", "owner")
    .eq("state", "active")
    .limit(1)
    .maybeSingle();

  return !membershipError && Boolean(membership?.id);
}

/**
 * Verifies the high-entropy temporary credential against its server-only hash.
 * It creates no Supabase Auth session, user, JWT, or membership.
 */
export async function verifyPendingManualOwnerCredential(
  organizationId: string,
  phone: string,
  temporaryPassword: string,
): Promise<VerifiedManualOwnerCredential | null> {
  const { data: credential, error } = await getSupabaseAdmin()
    .from("staff_invitations")
    .select("id,activation_auth_user_id,organization_id,property_id,phone,display_name,temporary_password_hash,temporary_password_expires_at")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .eq("role", "owner")
    .eq("state", "pending")
    .eq("credential_state", "temporary")
    .maybeSingle<CredentialRow>();

  const activationAuthUserId = credential?.activation_auth_user_id;
  if (
    error
    || !credential
    || !activationAuthUserId
    || !isUuid(activationAuthUserId)
    || !isUnexpired(credential.temporary_password_expires_at)
  ) return null;
  const submittedHash = await sha256Hex(temporaryPassword);
  if (!credential.temporary_password_hash || !equalSha256Hex(credential.temporary_password_hash, submittedHash)) {
    return null;
  }

  return {
    invitationId: credential.id,
    activationAuthUserId,
    organizationId: credential.organization_id,
    propertyId: credential.property_id,
    phone: credential.phone,
    displayName: credential.display_name,
  };
}
