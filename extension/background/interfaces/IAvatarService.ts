import type { PullRequest } from '@common/types';
import type { IService } from './IService';

/**
 * WHY [GitHubService → storage]: Parsed PRs are persisted often; `avatarUrl` must stay
 * short https (parser CDN or `github.com/{login}.png`), not large inlined image payloads.
 * Popup reads authors and renders `<img src={avatarUrl}>` when set.
 */
export interface IAvatarService extends IService {
  enrichPRsWithAvatars(prs: PullRequest[]): Promise<PullRequest[]>;
}
