import type { PullRequest } from '../../common/types';
import type { IService } from './IService';

/**
 * Interface for the avatar service that fetches and caches GitHub user avatars.
 */
export interface IAvatarService extends IService {
  /**
   * Enriches an array of PRs with base64-encoded author avatar data URLs.
   * Deduplicates by author login and fetches all unique avatars in parallel.
   */
  enrichPRsWithAvatars(prs: PullRequest[]): Promise<PullRequest[]>;
}
