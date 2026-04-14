import type { IAvatarService } from '../interfaces/IAvatarService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { PullRequest } from '../../common/types';
import { isOfflineError } from '../../common/network-utils';

/**
 * AvatarService fetches and caches GitHub user avatars as base64 data URLs.
 */
export class AvatarService implements IAvatarService {
  private debugService: IDebugService;
  private baseURL: string;
  private avatarCache = new Map<string, string>();
  private initialized = false;

  /**
   * WHY [concurrency cap]: MV3 service workers share a single thread and a ~6 concurrent
   * connection limit per host. Firing `Promise.all` on 60+ unique logins would queue most
   * requests behind the connection limit while keeping the SW alive waiting, risking the
   * 5-minute execution ceiling on slow networks. Batching in groups of 6 matches Chrome's
   * per-host connection pool so every in-flight request has a real socket.
   */
  private static readonly MAX_CONCURRENT_AVATAR_FETCHES = 6;

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
    const uniqueLogins = [...new Set(prs.flatMap((pr) => pr.author.map((a) => a.login)))].filter(
      (login) => login !== 'Unknown Author'
    );

    const avatarMap = new Map<string, string>();

    // Pooled fetch — at most MAX_CONCURRENT_AVATAR_FETCHES in-flight at once
    for (let i = 0; i < uniqueLogins.length; i += AvatarService.MAX_CONCURRENT_AVATAR_FETCHES) {
      const batch = uniqueLogins.slice(i, i + AvatarService.MAX_CONCURRENT_AVATAR_FETCHES);
      const entries = await Promise.all(
        batch.map(async (login) => {
          const base64 = await this.fetchAvatarAsBase64(login);
          return [login, base64] as const;
        })
      );
      for (const [login, base64] of entries) {
        if (base64 !== null) avatarMap.set(login, base64);
      }
    }

    return prs.map((pr) => {
      const nextAuthor = pr.author.map((a) => {
        const fetched = avatarMap.get(a.login);
        return fetched ? { ...a, avatarUrl: fetched } : a;
      });
      const changed = nextAuthor.some((a, i) => a.avatarUrl !== pr.author[i]?.avatarUrl);
      if (!changed) return pr;
      return { ...pr, author: nextAuthor };
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
      // WHY [silent]: Transient transport loss (sleep/wake, DNS not ready) is expected; PR rows
      // stay usable without avatars — skip error telemetry so real faults stay visible.
      if (isOfflineError(error)) {
        return null;
      }
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
