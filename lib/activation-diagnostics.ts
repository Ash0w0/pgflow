import "server-only";

type ActivationFailureDiagnostic = {
  authErrorCode: string | null;
  authErrorStatus: number | null;
  reconciliationState: "committed_exact" | "committed_other" | "pending" | "rotated" | "inconsistent" | "unavailable";
  requestBoundToStableId: true;
};

export function reportActivationFailure(diagnostic: ActivationFailureDiagnostic) {
  console.error("[owner-activation] Auth creation did not commit exactly", diagnostic);
}
