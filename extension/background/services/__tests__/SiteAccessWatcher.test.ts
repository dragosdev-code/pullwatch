import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SiteAccessWatcher } from '../SiteAccessWatcher';
import type { IDebugService } from '../../interfaces/IDebugService';
import type { IHealthStatusService } from '../../interfaces/IHealthStatusService';
import type {
  PermissionsAdapter,
  PermissionsChangeListener,
} from '@common/chrome/adapters/permissions-adapter';
import type { PermissionsSpec } from '@common/chrome/chrome-types';

function makeHarness() {
  const debugService = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as IDebugService;

  const healthStatusService = {
    signalGitHubOutage: vi.fn().mockResolvedValue(undefined),
    clearGitHubOutage: vi.fn().mockResolvedValue(undefined),
    signalParserBreakage: vi.fn().mockResolvedValue(undefined),
    clearParserBreakage: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as IHealthStatusService;

  const onAddedListeners: PermissionsChangeListener[] = [];
  const onRemovedListeners: PermissionsChangeListener[] = [];

  const permissions: PermissionsAdapter = {
    contains: vi.fn().mockResolvedValue(true),
    request: vi.fn().mockResolvedValue(true),
    onAdded: {
      addListener: (l) => {
        onAddedListeners.push(l);
      },
      removeListener: (l) => {
        const i = onAddedListeners.indexOf(l);
        if (i >= 0) onAddedListeners.splice(i, 1);
      },
    },
    onRemoved: {
      addListener: (l) => {
        onRemovedListeners.push(l);
      },
      removeListener: (l) => {
        const i = onRemovedListeners.indexOf(l);
        if (i >= 0) onRemovedListeners.splice(i, 1);
      },
    },
  };

  const watcher = new SiteAccessWatcher(debugService, healthStatusService, permissions);

  async function fire(kind: 'added' | 'removed', payload: PermissionsSpec): Promise<void> {
    const listeners = kind === 'added' ? onAddedListeners : onRemovedListeners;
    for (const l of listeners) l(payload);
    // WHY [microtask flush]: listener handlers are sync-fire-and-forget; awaiting a resolved
    // promise yields enough turns of the microtask queue to let the inner `void this.handle*`
    // promise chain settle before assertions.
    await Promise.resolve();
    await Promise.resolve();
  }

  return { watcher, healthStatusService, fire, onAddedListeners, onRemovedListeners };
}

describe('SiteAccessWatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signals site_access_blocked when github.com permission is removed', async () => {
    const { watcher, healthStatusService, fire } = makeHarness();
    await watcher.initialize();

    await fire('removed', { origins: ['https://github.com/*'] });

    // WHY [no clear]: HealthStatusService.signalGitHubOutage upgrades a stale `'transport'`
    // payload in-place; the watcher should not pre-clear and risk a banner flicker.
    expect(healthStatusService.clearGitHubOutage).not.toHaveBeenCalled();
    expect(healthStatusService.signalGitHubOutage).toHaveBeenCalledWith(
      'chrome://extensions site access revoked',
      'site_access_blocked'
    );
  });

  it('clears the outage flag when github.com permission is granted back', async () => {
    const { watcher, healthStatusService, fire } = makeHarness();
    await watcher.initialize();

    await fire('added', { origins: ['https://github.com/*'] });

    expect(healthStatusService.clearGitHubOutage).toHaveBeenCalledTimes(1);
    expect(healthStatusService.signalGitHubOutage).not.toHaveBeenCalled();
  });

  it('ignores permission events that do not touch the github origin', async () => {
    const { watcher, healthStatusService, fire } = makeHarness();
    await watcher.initialize();

    await fire('removed', { origins: ['https://example.com/*'] });
    await fire('added', { permissions: ['storage'] });

    expect(healthStatusService.signalGitHubOutage).not.toHaveBeenCalled();
    expect(healthStatusService.clearGitHubOutage).not.toHaveBeenCalled();
  });

  it('unregisters listeners on dispose', async () => {
    const { watcher, fire, onAddedListeners, onRemovedListeners } = makeHarness();
    await watcher.initialize();
    expect(onAddedListeners.length).toBe(1);
    expect(onRemovedListeners.length).toBe(1);

    await watcher.dispose();
    expect(onAddedListeners.length).toBe(0);
    expect(onRemovedListeners.length).toBe(0);

    await fire('removed', { origins: ['https://github.com/*'] });
    // No listener left to react — the test just asserts the unregister landed.
  });
});
