import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrFetchErrorHandler } from '../PrFetchErrorHandler';
import { GitHubOutageError } from '@common/errors';
import type { IDebugService } from '@background/interfaces/IDebugService';
import type { IBadgeService } from '@background/interfaces/IBadgeService';
import type { IHealthStatusService } from '@background/interfaces/IHealthStatusService';
import type { IRateLimitService } from '@background/interfaces/IRateLimitService';
import type { SiteAccessProbe } from '@common/site-access-classifier';

function makeHarness(hasGitHubOrigin: () => Promise<boolean>) {
  const debugService = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as IDebugService;

  const badgeService = {
    setErrorBadge: vi.fn().mockResolvedValue(undefined),
  } as unknown as IBadgeService;

  const healthStatusService = {
    signalGitHubOutage: vi.fn().mockResolvedValue(undefined),
    signalParserBreakage: vi.fn().mockResolvedValue(undefined),
  } as unknown as IHealthStatusService;

  const rateLimitService = {
    recordRateLimitHit: vi.fn().mockResolvedValue(undefined),
  } as unknown as IRateLimitService;

  const probe: SiteAccessProbe = { hasGitHubOrigin };

  const handler = new PrFetchErrorHandler(
    debugService,
    badgeService,
    healthStatusService,
    rateLimitService,
    probe
  );
  return { handler, healthStatusService, badgeService };
}

const params = {
  listKind: 'assigned' as const,
  oldPRs: [],
  updateBadgeOnError: false,
  transportErrorLabel: 'assigned PR fetch',
};

describe('PrFetchErrorHandler outage reason classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signals site_access_blocked when the github origin is not granted on a transport-shape outage', async () => {
    const { handler, healthStatusService } = makeHarness(() => Promise.resolve(false));

    await handler.handle(new GitHubOutageError('assigned PR fetch'), params);

    expect(healthStatusService.signalGitHubOutage).toHaveBeenCalledWith(
      expect.stringContaining('GitHub temporarily unavailable'),
      'site_access_blocked'
    );
  });

  it('signals transport when the github origin is granted on a transport-shape outage', async () => {
    const { handler, healthStatusService } = makeHarness(() => Promise.resolve(true));

    await handler.handle(new GitHubOutageError('assigned PR fetch'), params);

    expect(healthStatusService.signalGitHubOutage).toHaveBeenCalledWith(
      expect.any(String),
      'transport'
    );
  });

  it('signals transport (not site_access_blocked) when the outage carries an HTTP status', async () => {
    // WHY [HTTP status branch]: A 5xx is GitHub's fault by definition. Do not run the permissions
    // probe at all — the classification is fixed.
    const probeFn = vi.fn().mockResolvedValue(false);
    const { handler, healthStatusService } = makeHarness(probeFn);

    await handler.handle(new GitHubOutageError('assigned PR fetch', 503), params);

    expect(probeFn).not.toHaveBeenCalled();
    expect(healthStatusService.signalGitHubOutage).toHaveBeenCalledWith(
      expect.any(String),
      'transport'
    );
  });

  it('falls back to transport when the permissions probe itself throws', async () => {
    const { handler, healthStatusService } = makeHarness(() =>
      Promise.reject(new Error('chrome.permissions unavailable'))
    );

    await handler.handle(new GitHubOutageError('assigned PR fetch'), params);

    expect(healthStatusService.signalGitHubOutage).toHaveBeenCalledWith(
      expect.any(String),
      'transport'
    );
  });
});
