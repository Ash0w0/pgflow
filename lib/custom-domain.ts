import "server-only";

import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { getSupabaseAdmin } from "./supabase/admin";

const CHALLENGE_PREFIX = "pgflow-verify=";
const CHALLENGE_BYTE_LENGTH = 32;

/**
 * Generates a cryptographically random DNS TXT challenge token.
 * The PG Owner places this as a TXT record on their domain.
 */
export function generateDnsChallenge(): string {
  return randomBytes(CHALLENGE_BYTE_LENGTH).toString("base64url");
}

/**
 * Formats the full TXT record value expected on the domain.
 */
export function formatTxtRecordValue(challenge: string): string {
  return `${CHALLENGE_PREFIX}${challenge}`;
}

/**
 * Performs a live DNS TXT lookup and checks for the pgflow challenge token.
 * Returns true if the expected TXT record is found.
 */
export async function verifyDnsTxtRecord(
  hostname: string,
  expectedChallenge: string
): Promise<{ verified: boolean; records: string[] }> {
  const expectedValue = formatTxtRecordValue(expectedChallenge);

  try {
    // DNS TXT records return arrays of arrays (each record is chunked)
    const rawRecords = await resolveTxt(hostname);
    const flatRecords = rawRecords.map((chunks) => chunks.join(""));

    return {
      verified: flatRecords.some((record) => record.trim() === expectedValue),
      records: flatRecords,
    };
  } catch (err: unknown) {
    // ENODATA or ENOTFOUND means no TXT records exist — not an error, just unverified
    const code = err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : "";
    if (code === "ENODATA" || code === "ENOTFOUND") {
      return { verified: false, records: [] };
    }
    throw err;
  }
}

/**
 * Initiates custom domain verification for an organization.
 * Generates a challenge token and stores it in the domain_mappings row.
 */
export async function initiateCustomDomainVerification(
  organizationId: string,
  hostname: string
): Promise<{ challenge: string; txtRecord: string; domainMappingId: string }> {
  const admin = getSupabaseAdmin();
  const challenge = generateDnsChallenge();

  // Upsert domain mapping with the challenge
  const { data, error } = await admin
    .from("domain_mappings")
    .upsert(
      {
        organization_id: organizationId,
        hostname: hostname.toLowerCase().trim(),
        kind: "custom",
        state: "pending",
        dns_txt_challenge: challenge,
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: "hostname" }
    )
    .select("id")
    .single();

  if (error) throw new Error(`Failed to initiate domain verification: ${error.message}`);

  return {
    challenge,
    txtRecord: formatTxtRecordValue(challenge),
    domainMappingId: data.id,
  };
}

/**
 * Checks the DNS TXT record for a pending domain mapping and updates its state.
 */
export async function checkDomainVerification(
  domainMappingId: string
): Promise<{ verified: boolean; hostname: string }> {
  const admin = getSupabaseAdmin();

  // Fetch the pending mapping
  const { data: mapping, error: fetchError } = await admin
    .from("domain_mappings")
    .select("id,hostname,dns_txt_challenge,state")
    .eq("id", domainMappingId)
    .single();

  if (fetchError || !mapping) throw new Error("Domain mapping not found.");
  if (!mapping.dns_txt_challenge) throw new Error("No DNS challenge token set.");
  if (mapping.state === "verified") return { verified: true, hostname: mapping.hostname };

  // Perform the DNS lookup
  const result = await verifyDnsTxtRecord(mapping.hostname, mapping.dns_txt_challenge);

  // Update state based on result
  const now = new Date().toISOString();
  if (result.verified) {
    const { error: updateError } = await admin
      .from("domain_mappings")
      .update({ state: "verified", verified_at: now, last_checked_at: now })
      .eq("id", domainMappingId);

    if (updateError) throw new Error(`Failed to mark domain as verified: ${updateError.message}`);
  } else {
    const { error: updateError } = await admin
      .from("domain_mappings")
      .update({ state: "dns_checking", last_checked_at: now })
      .eq("id", domainMappingId);

    if (updateError) throw new Error(`Failed to update check timestamp: ${updateError.message}`);
  }

  return { verified: result.verified, hostname: mapping.hostname };
}
