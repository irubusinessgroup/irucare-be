import { randomBytes } from "crypto";

/** Fixed temporary password when email delivery is unavailable (e.g. free-tier SMTP). */
export const TEMPORARY_PASSWORD = "Password123!";

/**
 * Generates a readable secure password with mixed character classes.
 */
export const generateSecurePassword = (length = 12): string => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;

  const pick = (charset: string) =>
    charset[randomBytes(1)[0] % charset.length];

  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];

  for (let i = chars.length; i < length; i++) {
    chars.push(pick(all));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
};
