export const OWNER_PASSWORD_MIN_LENGTH = 12;
export const OWNER_PASSWORD_MAX_LENGTH = 128;

export function isStrongOwnerPassword(password: string) {
  if (password.length < OWNER_PASSWORD_MIN_LENGTH || password.length > OWNER_PASSWORD_MAX_LENGTH) {
    return false;
  }
  return /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

export const RESIDENT_PASSWORD_MIN_LENGTH = 8;

/** Residents type this on a phone and can only reach their own records: 8+ characters with a letter and a number. */
export function isAcceptableResidentPassword(password: string) {
  return password.length >= RESIDENT_PASSWORD_MIN_LENGTH
    && password.length <= OWNER_PASSWORD_MAX_LENGTH
    && /[A-Za-z]/.test(password)
    && /\d/.test(password);
}
