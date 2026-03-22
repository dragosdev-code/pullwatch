import type { PullRequest } from '../../../extension/common/types';

export interface PRItemProps {
  pr: PullRequest;
  isNew: boolean;
  isFirst?: boolean;
  isReviewed?: boolean;
  showAuthorStatus?: boolean;
  /** Called when the user activates the PR link (assigned / merged entrance-seen). */
  onPrLinkActivated?: (prId: string) => void;
}
