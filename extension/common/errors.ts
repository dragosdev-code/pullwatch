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
