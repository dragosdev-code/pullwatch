/**
 * Format a numeric score for display in the HUD and summary overlays.
 * Always shows the full integer (no k / m abbreviations); values are rounded.
 */
export function formatScore(n: number): string {
  return String(Math.round(n));
}
