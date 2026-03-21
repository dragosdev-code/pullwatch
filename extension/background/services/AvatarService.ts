import type { IAvatarService } from '../interfaces/IAvatarService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { PullRequest } from '../../common/types';

/**
 * AvatarService fetches and caches GitHub user avatars as base64 data URLs.
 */
export class AvatarService implements IAvatarService {
  private debugService: IDebugService;
  private baseURL: string;
  private avatarCache = new Map<string, string>();
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
    const uniqueLogins = [...new Set(prs.map((pr) => pr.author.login))].filter(
      (login) => login !== 'Unknown Author'
    );

    const avatarEntries = await Promise.all(
      uniqueLogins.map(async (login) => {
        const base64 = await this.fetchAvatarAsBase64(login);
        return [login, base64] as const;
      })
    );

    const avatarMap = new Map(
      avatarEntries.filter((entry): entry is [string, string] => entry[1] !== null)
    );

    return prs.map((pr) => {
      const avatarUrl = avatarMap.get(pr.author.login);
      if (!avatarUrl) return pr;
      return {
        ...pr,
        author: { ...pr.author, avatarUrl },
      };
    });
  }

  /**
   * Fetches an avatar image and converts it to a base64 data URL.
   * Uses an in-memory cache keyed by login to avoid redundant network requests.
   */
  private async fetchAvatarAsBase64(login: string): Promise<string | null> {
    if (this.avatarCache.has(login)) {
      return this.avatarCache.get(login)!;
    }

    try {
      const avatarUrl = `${this.baseURL}/${login}.png?size=80`;
      const response = await fetch(avatarUrl);
      if (!response.ok) return null;

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const contentType = response.headers.get('content-type') || 'image/png';
      const dataUrl = `data:${contentType};base64,${btoa(binary)}`;

      this.avatarCache.set(login, dataUrl);
      return dataUrl;
    } catch (error) {
      this.debugService.error(
        `[AvatarService] Failed to fetch avatar for ${login}:`,
        error instanceof Error ? error.message : error
      );
      return null;
    }
  }

  async dispose(): Promise<void> {
    this.avatarCache.clear();
    this.initialized = false;
    this.debugService.log('[AvatarService] Disposed');
  }
}
