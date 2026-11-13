/** Set in Supabase Auth app_metadata for accounts issued a one-time password (managers). */
export const MUST_CHANGE_PASSWORD_FLAG = "pgflow_must_change_password";

export function mustChangePassword(user: { app_metadata?: Record<string, unknown> | null } | null | undefined) {
  return user?.app_metadata?.[MUST_CHANGE_PASSWORD_FLAG] === true;
}
