import { describe, expect, it } from 'vitest';
import {
  classifyTransportFailure,
  type SiteAccessProbe,
} from '../site-access-classifier';

function probe(hasGitHub: boolean | Error): SiteAccessProbe {
  return {
    hasGitHubOrigin: () =>
      hasGitHub instanceof Error ? Promise.reject(hasGitHub) : Promise.resolve(hasGitHub),
  };
}

describe('classifyTransportFailure', () => {
  it('returns site_access_blocked when the github origin is not granted', async () => {
    expect(await classifyTransportFailure(probe(false))).toBe('site_access_blocked');
  });

  it('returns transport when the github origin is granted', async () => {
    expect(await classifyTransportFailure(probe(true))).toBe('transport');
  });

  it('falls back to transport when the permissions probe itself throws', async () => {
    expect(await classifyTransportFailure(probe(new Error('chrome.permissions unavailable')))).toBe(
      'transport'
    );
  });
});
