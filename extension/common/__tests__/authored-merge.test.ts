/// <reference types="vitest/globals" />
import { mergeAuthoredPrLists, type AuthorReviewBucket } from '../authored-merge';
import type { PullRequest } from '../types';

function pr(
  id: string,
  authorReviewStatus: PullRequest['authorReviewStatus'],
  overrides: Partial<PullRequest> = {}
): PullRequest {
  return {
    id,
    url: id,
    title: `PR ${id}`,
    number: null,
    repoName: 'acme/repo',
    author: [{ login: 'me' }],
    type: authorReviewStatus === 'draft' ? 'draft' : 'open',
    authorReviewStatus,
    ...overrides,
  };
}

function buckets(
  partial: Partial<Record<AuthorReviewBucket, PullRequest[]>> = {}
): Record<AuthorReviewBucket, PullRequest[]> {
  return {
    approved: partial.approved ?? [],
    changes_requested: partial.changes_requested ?? [],
    pending: partial.pending ?? [],
    draft: partial.draft ?? [],
  };
}

describe('mergeAuthoredPrLists', () => {
  it('returns empty array when all buckets are empty', () => {
    expect(mergeAuthoredPrLists(buckets())).toEqual([]);
  });

  it('passes a single bucket through unchanged', () => {
    const rows = [
      pr('https://github.com/a/r/pull/1', 'pending'),
      pr('https://github.com/a/r/pull/2', 'pending'),
    ];
    const out = mergeAuthoredPrLists(buckets({ pending: rows }));
    expect(out).toEqual(rows);
  });

  it('collapses pending+draft overlap into the draft row', () => {
    const sharedId = 'https://github.com/a/r/pull/1';
    const draftRow = pr(sharedId, 'draft');
    const pendingRow = pr(sharedId, 'pending', { type: 'draft' });
    const out = mergeAuthoredPrLists(buckets({ draft: [draftRow], pending: [pendingRow] }));
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(draftRow);
    expect(out[0].authorReviewStatus).toBe('draft');
  });

  it('collapses approved+draft overlap into the draft row', () => {
    const sharedId = 'https://github.com/a/r/pull/1';
    const draftRow = pr(sharedId, 'draft');
    const approvedRow = pr(sharedId, 'approved', { type: 'draft' });
    const out = mergeAuthoredPrLists(buckets({ approved: [approvedRow], draft: [draftRow] }));
    expect(out).toHaveLength(1);
    expect(out[0].authorReviewStatus).toBe('draft');
  });

  it('collapses pending+approved overlap into the approved row', () => {
    const sharedId = 'https://github.com/a/r/pull/1';
    const approvedRow = pr(sharedId, 'approved');
    const pendingRow = pr(sharedId, 'pending');
    const out = mergeAuthoredPrLists(buckets({ approved: [approvedRow], pending: [pendingRow] }));
    expect(out).toHaveLength(1);
    expect(out[0].authorReviewStatus).toBe('approved');
  });

  it('collapses pending+changes_requested+draft into the draft row', () => {
    const sharedId = 'https://github.com/a/r/pull/1';
    const draftRow = pr(sharedId, 'draft');
    const cr = pr(sharedId, 'changes_requested', { type: 'draft' });
    const pendingRow = pr(sharedId, 'pending', { type: 'draft' });
    const out = mergeAuthoredPrLists(
      buckets({ draft: [draftRow], changes_requested: [cr], pending: [pendingRow] })
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(draftRow);
  });

  it('preserves all rows when ids are distinct across buckets', () => {
    const a = pr('https://github.com/a/r/pull/1', 'approved');
    const c = pr('https://github.com/a/r/pull/2', 'changes_requested');
    const p = pr('https://github.com/a/r/pull/3', 'pending');
    const d = pr('https://github.com/a/r/pull/4', 'draft');
    const out = mergeAuthoredPrLists(
      buckets({ approved: [a], changes_requested: [c], pending: [p], draft: [d] })
    );
    expect(out).toHaveLength(4);
    expect(new Set(out.map((r) => r.authorReviewStatus))).toEqual(
      new Set(['approved', 'changes_requested', 'pending', 'draft'])
    );
  });

  it('keys on PullRequest.id (URL); same number across different repos is not collapsed', () => {
    const a = pr('https://github.com/acme/repo/pull/1', 'pending', {
      number: 1,
      repoName: 'acme/repo',
    });
    const b = pr('https://github.com/widgets/repo/pull/1', 'pending', {
      number: 1,
      repoName: 'widgets/repo',
    });
    const out = mergeAuthoredPrLists(buckets({ pending: [a, b] }));
    expect(out).toHaveLength(2);
  });

  it('emits draft rows before review-status rows before pending (precedence ordering)', () => {
    const draftRow = pr('https://github.com/a/r/pull/1', 'draft');
    const approvedRow = pr('https://github.com/a/r/pull/2', 'approved');
    const pendingRow = pr('https://github.com/a/r/pull/3', 'pending');
    const out = mergeAuthoredPrLists(
      buckets({ pending: [pendingRow], approved: [approvedRow], draft: [draftRow] })
    );
    expect(out.map((r) => r.id)).toEqual([draftRow.id, approvedRow.id, pendingRow.id]);
  });
});
