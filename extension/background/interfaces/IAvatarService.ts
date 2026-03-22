import type { PullRequest } from '../../common/types';
import type { IService } from './IService';

/**
 * Interface for the avatar service that fetches and caches GitHub user avatars.
 */
export interface IAvatarService extends IService {
  /**
   * Enriches PR rows with base64 avatar data URLs, keyed by login across every
   * person in each PR’s `author` array; deduplicates fetches globally.
   */
  enrichPRsWithAvatars(prs: PullRequest[]): Promise<PullRequest[]>;
}
