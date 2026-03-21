export class RateLimitError extends Error {
  public readonly retryAfterSeconds: number;

  constructor(context: string, retryAfterSeconds = 0) {
    super(`Rate limited (429) during ${context}`);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
