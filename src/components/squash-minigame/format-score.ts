/**
 * Format a numeric score for display in the HUD and summary overlays.
 *
 * - `< 1000` → integer (e.g. `42`)
 * - `< 1_000_000` → `Xk` with one decimal, trailing `.0` stripped (e.g. `1.2k`, `10k`)
 * - `>= 1_000_000` → `Xm` with one decimal (e.g. `3.5m`)
 * - Negative values supported.
 */
export function formatScore(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';

  if (abs < 1_000) {
    return `${sign}${abs}`;
  }

  if (abs < 1_000_000) {
    const k = abs / 1_000;
    const formatted = k.toFixed(1).replace(/\.0$/, '');
    return `${sign}${formatted}k`;
  }

  const m = abs / 1_000_000;
  const formatted = m.toFixed(1).replace(/\.0$/, '');
  return `${sign}${formatted}m`;
}
