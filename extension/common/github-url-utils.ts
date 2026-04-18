/**
 * Shared URL transforms for GitHub pulls routes. Keeping this in `common/`
 * (instead of inside `GitHubService`) lets the canary suite consume the same
 * transformation production uses — no two-places-to-update bug when GitHub
 * renames or adds another list route.
 */

/**
 * Injects `/search` into a legacy `/pulls?q=…` URL to produce the new
 * experience's `/pulls/search?q=…` form. Idempotent — already-transformed
 * URLs pass through unchanged.
 *
 * All URL templates in `constants.ts` use the legacy form. The waterfall in
 * {@link GitHubService.fetchPRs} calls this only for the `'search'` route;
 * the original URL is already correct for the `'legacy'` route.
 */
export function toPullsSearchUrl(url: string): string {
  if (url.includes('/pulls/search?')) return url;
  return url.replace('/pulls?', '/pulls/search?');
}
