export class RateLimitError extends Error {
  public readonly retryAfterSeconds: number;

  constructor(context: string, retryAfterSeconds = 0) {
    super(`Rate limited (429) during ${context}`);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Thrown by GitHubHTMLParser when the fetched HTML does not match any
 * known GitHub search-results page structure. Signals that the parser
 * is likely broken (GitHub redesign) rather than the user having 0 PRs.
 */
export class ParserBreakageError extends Error {
  constructor(context: string) {
    super(`GitHub page structure not recognized during ${context} — parser may need updating`);
    this.name = 'ParserBreakageError';
  }
}

/**
 * Thrown when GitHub returns a transient HTTP error (5xx, network timeout,
 * DNS failure, etc.) that is NOT caused by a DOM/parser change or by the
 * user's auth state. The distinction matters because the extension should
 * keep showing stale cached data and display an "outage" banner rather
 * than the "parser broken" banner — the two require different user action
 * (wait vs. update the extension).
 */
export class GitHubOutageError extends Error {
  public readonly httpStatus: number | null;

  constructor(context: string, httpStatus: number | null = null) {
    super(
      `GitHub temporarily unavailable during ${context}${httpStatus ? ` (HTTP ${httpStatus})` : ''}`,
    );
    this.name = 'GitHubOutageError';
    this.httpStatus = httpStatus;
  }
}

/**
 * `Error.message` / runtime `sendResponse.error` when GitHub has no web session in this browser.
 * Matches throws in `GitHubService` so popups can treat it as session loss via `isAuthLikeErrorMessage`.
 */
export const GITHUB_WEB_SESSION_NOT_LOGGED_IN_MESSAGE =
  'NotLoggedIn: User is not logged in to GitHub.';

// ─── Chromium / platform (not thrown by this extension) ─────────────────────

/**
 * True when `error` is the transient chrome.storage failure Chromium reports as
 * "No SW" (MV3 worker not attached yet — common right after sleep/wake).
 *
 * Custom `Error` subclasses in this file are for **our** throws (`RateLimitError`,
 * etc.) so callers can use `instanceof`. The browser does not throw those types for
 * storage glitches; it uses a plain `Error` with this message. Until Chrome exposes
 * a stable `code` or subtype, we match the message — same idea as parsing HTTP
 * status from a response we did not construct.
 */
export function isTransientExtensionStorageError(error: unknown): boolean {
  return error instanceof Error && /no sw/i.test(error.message);
}

/**
 * True when the background should treat the failure as loss of the GitHub web session (clear
 * cached identity/PRs). Session loss is decided in `GitHubService` from HTML (`user-login` meta,
 * etc.); this helper only recognizes the resulting `Error` shapes for `EventService` (including
 * messages wrapped by `fetchAssignedPRs` and similar).
 */
export function isGitHubWebSessionAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const m = error.message;
  return (
    m.includes('NotLoggedIn:') ||
    m.includes('AuthenticationError:') ||
    /not\s+logged\s+in/i.test(m)
  );
}
