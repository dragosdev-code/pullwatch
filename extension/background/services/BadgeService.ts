import type { IBadgeService } from '../interfaces/IBadgeService';
import type { IDebugService } from '../interfaces/IDebugService';
import {
  BADGE_COLOR_ACTIVE,
  BADGE_COLOR_INACTIVE,
  BADGE_TEXT_COLOR_ACTIVE,
  BADGE_TEXT_COLOR_INACTIVE,
  BADGE_TEXT_LOADING,
} from '../../common/constants';

/**
 * BadgeService handles Chrome extension badge management and visual feedback.
 * Provides methods to update the extension badge with different states and information.
 */
export class BadgeService implements IBadgeService {
  private debugService: IDebugService;
  private initialized = false;
  private previousBadgeText: string | null = null;
  private restoreTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(debugService: IDebugService) {
    this.debugService = debugService;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    this.debugService.log('[BadgeService] Badge service initialized');
  }

  async updateBadge(
    countOrText: number | string,
    color?: string,
    textColor?: string
  ): Promise<void> {
    try {
      const badgeColor = color || BADGE_COLOR_ACTIVE;
      const badgeTextColor = textColor || BADGE_TEXT_COLOR_ACTIVE;
      const badgeText = String(countOrText);

      await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
      await chrome.action.setBadgeTextColor({ color: badgeTextColor });
      await chrome.action.setBadgeText({ text: badgeText });

      this.debugService.log(`[BadgeService] Badge updated: "${badgeText}", Color: ${badgeColor}`);
    } catch (error) {
      this.debugService.error('[BadgeService] Error updating badge:', error);
      throw error;
    }
  }

  async setLoadingBadge(): Promise<void> {
    try {
      this.clearPendingRestore();
      await this.updateBadge(BADGE_TEXT_LOADING, BADGE_COLOR_INACTIVE);
      this.debugService.log('[BadgeService] Badge set to loading state');
    } catch (error) {
      this.debugService.error('[BadgeService] Error setting loading badge:', error);
      throw error;
    }
  }

  async setErrorBadge(): Promise<void> {
    try {
      this.clearPendingRestore();
      await this.updateBadge('!', BADGE_COLOR_INACTIVE, BADGE_TEXT_COLOR_INACTIVE);
      this.debugService.log('[BadgeService] Badge set to error state');
    } catch (error) {
      this.debugService.error('[BadgeService] Error setting error badge:', error);
      throw error;
    }
  }

  async setDefaultBadge(): Promise<void> {
    try {
      this.clearPendingRestore();
      await this.updateBadge('', BADGE_COLOR_INACTIVE, BADGE_TEXT_COLOR_INACTIVE);
      this.debugService.log('[BadgeService] Badge set to default state');
    } catch (error) {
      this.debugService.error('[BadgeService] Error setting default badge:', error);
      throw error;
    }
  }

  async setPRCountBadge(count: number): Promise<void> {
    try {
      this.clearPendingRestore();
      if (count === 0) {
        await this.setDefaultBadge();
        return;
      }

      const displayText = count > 99 ? '99+' : String(count);
      await this.updateBadge(displayText, BADGE_COLOR_ACTIVE, BADGE_TEXT_COLOR_ACTIVE);
      this.debugService.log(
        `[BadgeService] Badge set to PR count: ${count} (displayed as "${displayText}")`
      );
    } catch (error) {
      this.debugService.error('[BadgeService] Error setting PR count badge:', error);
      throw error;
    }
  }

  private async getBadgeText(): Promise<string> {
    try {
      const result = await chrome.action.getBadgeText({});
      return result;
    } catch (error) {
      this.debugService.error('[BadgeService] Error getting badge text:', error);
      return '';
    }
  }

  /**
   * Shows a temporary badge that auto-restores the previous text.
   * Uses an instance field to avoid stale-closure bugs on rapid re-calls.
   * If a "real" badge update (setPRCountBadge, setErrorBadge, etc.) occurs
   * before the timer fires, the pending restore is cancelled (self-healing).
   */
  async showTemporaryBadge(
    text: string,
    color: string = BADGE_COLOR_ACTIVE,
    textColor: string = BADGE_TEXT_COLOR_ACTIVE,
    duration: number = 3000
  ): Promise<void> {
    try {
      // Only capture the original text if no restore is already pending
      if (this.previousBadgeText === null) {
        this.previousBadgeText = await this.getBadgeText();
      }

      // Clear any existing restore timer (handles rapid re-calls)
      if (this.restoreTimer !== null) {
        clearTimeout(this.restoreTimer);
      }

      await this.updateBadge(text, color, textColor);

      this.restoreTimer = setTimeout(async () => {
        try {
          if (this.previousBadgeText !== null) {
            await this.updateBadge(this.previousBadgeText);
          }
        } catch (error) {
          this.debugService.error(
            '[BadgeService] Error restoring badge after temporary display:',
            error
          );
        } finally {
          this.previousBadgeText = null;
          this.restoreTimer = null;
        }
      }, duration);

      this.debugService.log(`[BadgeService] Temporary badge shown: "${text}" for ${duration}ms`);
    } catch (error) {
      this.debugService.error('[BadgeService] Error showing temporary badge:', error);
      throw error;
    }
  }

  /**
   * Cancels any pending temporary badge restore. Called by intentional badge
   * state changes (setPRCountBadge, setErrorBadge, etc.) which supersede
   * the pending restore, and also acts as self-healing if the service worker
   * was terminated before the setTimeout could fire.
   */
  private clearPendingRestore(): void {
    if (this.restoreTimer !== null) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = null;
    }
    this.previousBadgeText = null;
  }

  async getBadgeStatus(): Promise<{
    text: string;
    color: string;
    isVisible: boolean;
  }> {
    try {
      const text = await this.getBadgeText();
      const color = text ? BADGE_COLOR_ACTIVE : BADGE_COLOR_INACTIVE;
      const isVisible = text.length > 0;

      const status = { text, color, isVisible };
      this.debugService.log('[BadgeService] Badge status:', status);
      return status;
    } catch (error) {
      this.debugService.error('[BadgeService] Error getting badge status:', error);
      return { text: '', color: BADGE_COLOR_INACTIVE, isVisible: false };
    }
  }

  async dispose(): Promise<void> {
    this.clearPendingRestore();
    this.debugService.log('[BadgeService] Badge service disposed');
    this.initialized = false;
  }
}
