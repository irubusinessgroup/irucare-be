/** Parse stored batch dates from EbmSyncCursor.batchDates JSON. */
export function parseCursorBatchDates(batchDates: unknown): string[] {
  if (!Array.isArray(batchDates)) return [];
  return batchDates.filter((d): d is string => typeof d === "string" && d.length > 0);
}

/** Merge and sort batch dates newest-first (EBM yyyyMMddHHmmss lex order). */
export function mergeBatchDates(...sources: string[][]): string[] {
  return Array.from(new Set(sources.flat())).sort((a, b) => b.localeCompare(a));
}
