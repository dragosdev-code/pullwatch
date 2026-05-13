import type { IDebugService } from '../interfaces/IDebugService';
import type { IHealthStatusService } from '../interfaces/IHealthStatusService';
import type { ISiteAccessWatcher } from '../interfaces/ISiteAccessWatcher';
import type {
  PermissionsAdapter,
  PermissionsChangeListener,
} from '@common/chrome/adapters/permissions-adapter';
import type { PermissionsSpec } from '@common/chrome/chrome-types';
import { GITHUB_ORIGIN_PATTERN } from '@common/site-access-classifier';

/**
 * Watches Chrome's runtime host-permission events so the popup outage banner reflects a
 * chrome://extensions site-access toggle BEFORE the next alarm tick produces a generic transport
 * failure.
 *
 * Lifecycle:
 *   onRemoved(github.com) → signal `'site_access_blocked'`; HealthStatusService upgrades any
 *                            stale `'transport'` payload in-place so the banner never flickers.
 *   onAdded(github.com)   → clear the outage flag so the popup falls back to its normal list.
 */
export class SiteAccessWatcher implements ISiteAccessWatcher {
  private initialized = false;
  private readonly onAddedListener: PermissionsChangeListener;
  private readonly onRemovedListener: PermissionsChangeListener;

  constructor(
    private readonly debugService: IDebugService,
    private readonly healthStatusService: IHealthStatusService,
    private readonly permissions: PermissionsAdapter
  ) {
    this.onAddedListener = (perms) => {
      void this.handleAdded(perms);
    };
    this.onRemovedListener = (perms) => {
      void this.handleRemoved(perms);
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.permissions.onAdded.addListener(this.onAddedListener);
    this.permissions.onRemoved.addListener(this.onRemovedListener);
    this.initialized = true;
    this.debugService.log('[SiteAccessWatcher] Listening for chrome.permissions changes.');
  }

  async dispose(): Promise<void> {
    if (!this.initialized) return;
    this.permissions.onAdded.removeListener(this.onAddedListener);
    this.permissions.onRemoved.removeListener(this.onRemovedListener);
    this.initialized = false;
  }

  private async handleAdded(perms: PermissionsSpec): Promise<void> {
    if (!this.matchesGitHub(perms)) return;
    this.debugService.log(
      '[SiteAccessWatcher] github.com site access re-enabled — clearing outage flag.'
    );
    try {
      await this.healthStatusService.clearGitHubOutage();
    } catch (error) {
      this.debugService.error('[SiteAccessWatcher] Failed to clear outage flag:', error);
    }
  }

  private async handleRemoved(perms: PermissionsSpec): Promise<void> {
    if (!this.matchesGitHub(perms)) return;
    this.debugService.warn(
      '[SiteAccessWatcher] github.com site access revoked at runtime — flagging site_access_blocked.'
    );
    try {
      // WHY [single signal]: HealthStatusService.signalGitHubOutage upgrades a stale
      // `'transport'` payload to `'site_access_blocked'` in-place. No clear is needed and the
      // popup never sees a brief banner-off state.
      await this.healthStatusService.signalGitHubOutage(
        'chrome://extensions site access revoked',
        'site_access_blocked'
      );
    } catch (error) {
      this.debugService.error(
        '[SiteAccessWatcher] Failed to write site_access_blocked outage:',
        error
      );
    }
  }

  /**
   * WHY [pattern match, not exact]: chrome.permissions events report whatever subset of origins
   * Chrome considers changed. The user does not have to revoke `https://github.com/*` literally —
   * matching against the host substring is the cheapest correct check for the manifest hosts we
   * actually care about. Avatars and raw.githubusercontent.com travel with github.com under the
   * same site-access toggle, so a single host match is sufficient.
   */
  private matchesGitHub(perms: PermissionsSpec): boolean {
    const origins = perms.origins;
    if (!origins || origins.length === 0) return false;
    return origins.some((o) => o === GITHUB_ORIGIN_PATTERN || /\bgithub\.com\b/i.test(o));
  }
}
