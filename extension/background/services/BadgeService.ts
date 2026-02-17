import type { IBadgeService } from '../interfaces/IBadgeService';
import type { IDebugService } from '../interfaces/IDebugService';
import {
  BADGE_COLOR_ACTIVE,
  BADGE_COLOR_INACTIVE,
  BADGE_TEXT_LOADING,
} from '../../common/constants';

/**
 * BadgeService handles Chrome extension badge management and visual feedback.
 * Provides methods to update the extension badge with different states and information.
 */
export class BadgeService implements IBadgeService {
  private debugService: IDebugService;
  private initialized = false;

  constructor(debugService: IDebugService) {
    this.debugService = debugService;
  }

  /**
   * Initializes the badge service.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    this.debugService.log('[BadgeService] Badge service initialized');
  }

  /**
   * Updates the badge with a count or text.
   */
  async updateBadge(countOrText: number | string, color?: string): Promise<void> {
    try {
      const badgeColor = color || BADGE_COLOR_ACTIVE;
      const badgeText = String(countOrText);

      await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
      await chrome.action.setBadgeText({ text: badgeText });

      this.debugService.log(`[BadgeService] Badge updated: "${badgeText}", Color: ${badgeColor}`);
    } catch (error) {
      this.debugService.error('[BadgeService] Error updating badge:', error);
      throw error;
    }
  }

  /**
   * Sets the badge to loading state.
   */
  async setLoadingBadge(): Promise<void> {
    try {
      await this.updateBadge(BADGE_TEXT_LOADING, BADGE_COLOR_INACTIVE);
      this.debugService.log('[BadgeService] Badge set to loading state');
    } catch (error) {
      this.debugService.error('[BadgeService] Error setting loading badge:', error);
      throw error;
    }
  }

  /**
   * Sets the badge to error state.
   */
  async setErrorBadge(): Promise<void> {
    try {
      await this.updateBadge('!', BADGE_COLOR_INACTIVE);
      this.debugService.log('[BadgeService] Badge set to error state');
    } catch (error) {
      this.debugService.error('[BadgeService] Error setting error badge:', error);
      throw error;
    }
  }

  /**
   * Sets the badge to default/inactive state.
   */
  async setDefaultBadge(): Promise<void> {
    try {
      await this.updateBadge('', BADGE_COLOR_INACTIVE);
      this.debugService.log('[BadgeService] Badge set to default state');
    } catch (error) {
      this.debugService.error('[BadgeService] Error setting default badge:', error);
      throw error;
    }
  }

  /**
   * Sets the badge to show PR count.
   */
  async setPRCountBadge(count: number): Promise<void> {
    try {
      if (count === 0) {
        await this.setDefaultBadge();
        return;
      }

      const displayText = count > 99 ? '99+' : String(count);
      await this.updateBadge(displayText, BADGE_COLOR_ACTIVE);
      this.debugService.log(
        `[BadgeService] Badge set to PR count: ${count} (displayed as "${displayText}")`
      );
    } catch (error) {
      this.debugService.error('[BadgeService] Error setting PR count badge:', error);
      throw error;
    }
  }

  /**
   * Gets the current badge text.
   */
  private async getBadgeText(): Promise<string> {
    try {
      const result = await chrome.action.getBadgeText({});
      this.debugService.log('[BadgeService] Current badge text:', result);
      return result;
    } catch (error) {
      this.debugService.error('[BadgeService] Error getting badge text:', error);
      return '';
    }
  }

  /**
   * Sets a custom badge with animation support.
   */
  async setAnimatedBadge(
    states: Array<{ text: string; color?: string; duration: number }>
  ): Promise<void> {
    try {
      this.debugService.log('[BadgeService] Starting animated badge sequence');

      for (const state of states) {
        await this.updateBadge(state.text, state.color);
        await this.delay(state.duration);
      }

      this.debugService.log('[BadgeService] Animated badge sequence completed');
    } catch (error) {
      this.debugService.error('[BadgeService] Error setting animated badge:', error);
      throw error;
    }
  }

  /**
   * Shows a temporary notification badge.
   */
  async showTemporaryBadge(
    text: string,
    color: string = BADGE_COLOR_ACTIVE,
    duration: number = 3000
  ): Promise<void> {
    try {
      const currentText = await this.getBadgeText();

      // Show temporary badge
      await this.updateBadge(text, color);

      // Restore previous badge after duration
      setTimeout(async () => {
        try {
          await this.updateBadge(currentText);
          this.debugService.log('[BadgeService] Temporary badge restored');
        } catch (error) {
          this.debugService.error(
            '[BadgeService] Error restoring badge after temporary display:',
            error
          );
        }
      }, duration);

      this.debugService.log(`[BadgeService] Temporary badge shown: "${text}" for ${duration}ms`);
    } catch (error) {
      this.debugService.error('[BadgeService] Error showing temporary badge:', error);
      throw error;
    }
  }

  /**
   * Gets badge status information.
   */
  async getBadgeStatus(): Promise<{
    text: string;
    color: string;
    isVisible: boolean;
  }> {
    try {
      const text = await this.getBadgeText();
      // Note: Chrome API doesn't provide a direct way to get current badge color
      // We'll track it internally or use a default
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

  /**
   * Helper method to create delays for animations.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Disposes the badge service.
   */
  async dispose(): Promise<void> {
    this.debugService.log('[BadgeService] Badge service disposed');
    this.initialized = false;
  }
}
