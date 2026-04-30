import type { PullRequest } from './types';

export interface ParsedPullRequestTimestamp {
  createdAt: string;
  eventAt?: string;
  timestampParseFailed: boolean;
}

export interface TimestampPatternLike {
  compiled: RegExp;
  captureGroups?: {
    datetime?: number;
  };
}

export function normalizeIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : undefined;
}

export function parseEventTimestampMs(pr: PullRequest): number | null {
  if (pr.timestampParseFailed) return null;
  const value = pr.eventAt ?? pr.updatedAt ?? pr.createdAt;
  const timestamp = normalizeIsoTimestamp(value);
  return timestamp ? Date.parse(timestamp) : null;
}

export function sortPullRequestsByEventTime(prs: PullRequest[]): PullRequest[] {
  return [...prs].sort((a, b) => (parseEventTimestampMs(b) ?? 0) - (parseEventTimestampMs(a) ?? 0));
}

export function extractIsoTimestampFromPatterns(
  html: string,
  patterns: readonly TimestampPatternLike[],
  fallbackCreatedAt = new Date().toISOString()
): ParsedPullRequestTimestamp {
  try {
    for (const pattern of patterns) {
      const groupIndex = pattern.captureGroups?.datetime;
      if (groupIndex === undefined) continue;
      const match = html.match(pattern.compiled);
      const raw = match?.[groupIndex];
      const timestamp = normalizeIsoTimestamp(raw);
      if (timestamp) {
        return { createdAt: timestamp, eventAt: timestamp, timestampParseFailed: false };
      }
      if (raw) {
        return { createdAt: fallbackCreatedAt, timestampParseFailed: true };
      }
    }
  } catch {
    return { createdAt: fallbackCreatedAt, timestampParseFailed: true };
  }
  return { createdAt: fallbackCreatedAt, timestampParseFailed: true };
}
