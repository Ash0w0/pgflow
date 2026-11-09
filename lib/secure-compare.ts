/** Constant-time string comparison for secrets and signatures. */
export function secureEqual(actual: string, expected: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(actual);
  const right = encoder.encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/** Minimum length for deployment secrets such as CRON_SECRET and webhook tokens. */
export const MIN_SECRET_LENGTH = 32;

export function configuredSecret(name: string) {
  const value = process.env[name]?.trim() ?? "";
  return value.length >= MIN_SECRET_LENGTH ? value : null;
}
