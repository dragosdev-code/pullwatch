import type { PullRequest } from '@common/types';

/**
 * Stable sorted key for the set of PR ids that the background marked `isNew` after a compare.
 * We use `\0` as a delimiter because PR urls can contain commas.
 */
export const newPrIdsKey = (assigned: PullRequest[], merged: PullRequest[]): string => {
  const ids = new Set<string>();
  for (const pr of assigned) {
    if (pr.isNew) {
      ids.add(pr.id || pr.url);
    }
  }
  for (const pr of merged) {
    if (pr.isNew) {
      ids.add(pr.id || pr.url);
    }
  }
  return [...ids].sort().join('\0');
};

/**
 * True when `nextKey` introduces at least one `isNew` id not present in `prevKey`.
 * Caller should skip when `prevKey === nextKey` or `prevKey === null` (baseline).
 */
export const shouldCelebrateNewPrIds = (prevKey: string, nextKey: string): boolean => {
  if (prevKey === nextKey) return false;
  const prevSet = new Set(prevKey.length > 0 ? prevKey.split('\0') : []);
  const currSet = new Set(nextKey.length > 0 ? nextKey.split('\0') : []);
  for (const id of currSet) {
    if (!prevSet.has(id)) {
      return true;
    }
  }
  return false;
};
