/**
 * Parse an EBM datetime/date string into a Date.
 * Supports yyyyMMddHHmmss (14 chars), yyyyMMdd (8 chars), and ISO strings.
 */
export function parseEbmDateTime(value: unknown): Date | null {
  if (value == null) return null;

  const str = String(value).trim();
  if (!str) return null;

  if (/^\d{14}$/.test(str)) {
    const parsed = new Date(
      `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T${str.slice(8, 10)}:${str.slice(10, 12)}:${str.slice(12, 14)}Z`,
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{8}$/.test(str)) {
    const parsed = new Date(
      `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T00:00:00.000Z`,
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Resolve a receipt date from EBM fields, falling back to now. */
export function resolveEbmDateReceived(...candidates: unknown[]): Date {
  for (const candidate of candidates) {
    const parsed = parseEbmDateTime(candidate);
    if (parsed) return parsed;
  }
  return new Date();
}
