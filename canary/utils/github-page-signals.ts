/**
 * Lightweight HTML/title heuristics for GitHub documents that are not PR lists.
 * Used by the canary to disambiguate "0 PRs" from parser breakage vs wrong page.
 */

/**
 * True when GitHub served the standard 404 shell (often still HTTP 200).
 * Global `/pulls` returns this when the session never completed account selection
 * after `github.com/switch_account`, or the URL is invalid for the account.
 */
export function isGitHubPageNotFoundDocument(html: string): boolean {
  const head = html.slice(0, 12_000);
  return (
    /<title>[^<]*Page not found/i.test(head) ||
    /data-testid="not-found"/i.test(head) ||
    /\bpage not found\b.*github/i.test(head)
  );
}
