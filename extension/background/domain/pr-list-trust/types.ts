import type { GitHubStatusSnapshot } from '../../interfaces/IGitHubStatusClient';
import type { PullRequest } from '@common/types';

export type ListKind = 'assigned' | 'merged' | 'authored';

export interface LimboEntry {
  pr: PullRequest;
  firstSeenAt: number;
  lastSeenAt: number;
  missCount: number;
}

export interface ListTrustBucket {
  limboByKey?: Record<string, LimboEntry>;
  lastTrustedAt?: number;
  lastTrustedCount?: number;
  lastSuspiciousAt?: number;
  lastReasons?: string[];
}

export interface PRListTrustState {
  lists?: Partial<Record<ListKind, ListTrustBucket>>;
}

export interface ListTrustAssessment {
  suspicious: boolean;
  reasons: string[];
  status: GitHubStatusSnapshot;
  missConfirmationsRequired: number;
}
