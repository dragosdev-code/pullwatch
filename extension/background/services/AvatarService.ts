import type { IAvatarService } from '../interfaces/IAvatarService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { PullRequest } from '../../common/types';

/**
 * WHY [no SW fetch]: Popup extension pages can load GitHub avatar URLs in `<img>`; doing
 * it there keeps this path synchronous and avoids bloating objects written to storage.
 */
export class AvatarService implements IAvatarService {
  private debugService: IDebugService;
  private baseURL: string;
  private initialized = false;

  constructor(debugService: IDebugService, baseURL: string) {
    this.debugService = debugService;
    this.baseURL = baseURL;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.debugService.log('[AvatarService] Initialized');
  }

  async enrichPRsWithAvatars(prs: PullRequest[]): Promise<PullRequest[]> {
    return prs.map((pr) => {
      const nextAuthor = pr.author.map((a) => {
        // WHY: DOM path already has `avatarUrl`; Unknown Author is a placeholder (initials in PrAuthorRow).
        if (a.avatarUrl || a.login === 'Unknown Author') return a;
        // WHY [login.png]: Login-only parse path has no `avatars.githubusercontent.com/u/{id}`.
        return { ...a, avatarUrl: `${this.baseURL}/${a.login}.png?size=80` };
      });

      const changed = nextAuthor.some((a, i) => a !== pr.author[i]);
      if (!changed) return pr;
      return { ...pr, author: nextAuthor };
    });
  }

  async dispose(): Promise<void> {
    this.initialized = false;
    this.debugService.log('[AvatarService] Disposed');
  }
}
