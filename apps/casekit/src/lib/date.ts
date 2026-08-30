export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** date-only, for github search qualifiers like pushed:>=2026-05-31 */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
