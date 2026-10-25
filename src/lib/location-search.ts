/** Public town searches must be state-qualified; full street addresses and
 * five-digit US ZIP codes are already sufficiently specific. */
export function isSpecificLocation(query: string): boolean {
  const q = query.trim();
  return /^\d{5}(?:-\d{4})?$/.test(q) || /,\s*\S/.test(q) || /^\d+\s+\S/.test(q);
}