export function applyMarkup(base: number, markupPct?: number): number {
  const pct = Number(markupPct || 0);
  return Number((Number(base) * (1 + pct / 100)).toFixed(2));
}
