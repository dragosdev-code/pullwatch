/**
 * WHY [heuristic]: `fetch` rejects with coarse `TypeError` / `DOMException` values — the platform
 * does not expose DNS vs sleep vs CORS as distinct types in script. We only match messages and
 * names browsers use for transport failures so HTTP-layer problems stay visible: `fetch`
 * fulfills on 4xx/5xx and callers surface those via `Response.ok` / typed errors, not this path.
 *
 * WHY [not navigator.onLine]: MDN documents `onLine === true` does not guarantee reachability; it
 * can stay `true` during brief post-wake outages. Relying on message shape matches what we
 * actually observed in telemetry (`Failed to fetch`) without false negatives from `onLine` alone.
 */
export function isOfflineError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  if (error instanceof TypeError) {
    const m = error.message;
    return (
      /failed to fetch/i.test(m) ||
      /^networkerror when attempting to fetch resource\.?$/i.test(m) ||
      /load failed/i.test(m)
    );
  }

  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'NetworkError';
  }

  return false;
}
