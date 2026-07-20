import { createTemporaryPassword, sha256Hex } from "./owner-invitations";

export const OWNER_RECOVERY_TTL_MS = 30 * 60 * 1000;

export function createOwnerRecoveryCredential() {
  return createTemporaryPassword();
}

export async function ownerRecoveryCredentialHash(credential: string) {
  return sha256Hex(credential);
}

export async function ownerPasswordIntentHash(
  recoveryRequestId: string,
  credential: string,
  newPassword: string,
) {
  return sha256Hex(`${recoveryRequestId}\u0000${credential}\u0000${newPassword}`);
}
