import type { PullRequest } from './types';

/**
 * GitHub's PR search buckets overlap: a single open draft PR authored by @me
 * matches both `review:none` (the pending bucket) and `draft:true` (the draft
 * bucket). The four authored sub-fetches stamp `authorReviewStatus` from the
 * URL bucket, not from DOM truth, so the same PullRequest.id can appear twice
 * with conflicting statuses. This module collapses those overlaps client-side
 * before the list reaches storage, the trust assessor, and the UI.
 *
 * Tightening the pending URL with `-draft:true` reduces — but does not
 * eliminate — overlap (other bucket pairs can still collide on edge cases like
 * approving a draft). The merge stays the source of truth.
 */

export type AuthorReviewBucket = 'approved' | 'changes_requested' | 'pending' | 'draft';

/**
 * Highest-precedence bucket wins when the same PR id lands in multiple buckets.
 * `draft` is a lifecycle state from DOM truth (parser already sets `type: 'draft'`)
 * — preserving it enforces the invariant `authorReviewStatus === 'draft' ⇒ type === 'draft'`.
 * Concrete review states beat `pending` because `pending` is `review:none`,
 * the *absence* of review signal.
 */
export const AUTHOR_REVIEW_STATUS_PRECEDENCE: readonly AuthorReviewBucket[] = [
  'draft',
  'changes_requested',
  'approved',
  'pending',
] as const;

export function mergeAuthoredPrLists(
  resultsByStatus: Record<AuthorReviewBucket, PullRequest[]>
): PullRequest[] {
  const winnerById = new Map<string, PullRequest>();

  for (const bucket of AUTHOR_REVIEW_STATUS_PRECEDENCE) {
    const rows = resultsByStatus[bucket] ?? [];
    for (const pr of rows) {
      if (!winnerById.has(pr.id)) {
        winnerById.set(pr.id, pr);
      }
    }
  }

  const out: PullRequest[] = [];
  const emitted = new Set<string>();
  for (const bucket of AUTHOR_REVIEW_STATUS_PRECEDENCE) {
    const rows = resultsByStatus[bucket] ?? [];
    for (const pr of rows) {
      if (emitted.has(pr.id)) continue;
      const winner = winnerById.get(pr.id);
      if (winner === pr) {
        out.push(pr);
        emitted.add(pr.id);
      }
    }
  }
  return out;
}
