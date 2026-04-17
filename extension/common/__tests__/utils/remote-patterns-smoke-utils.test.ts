/// <reference types="vitest/globals" />
import { REMOTE_PATTERNS_URL, REMOTE_PATTERNS_STAGING_URL } from '../../constants';
import {
  isRawGitHubMainPatternsPath,
  isRawGitHubStagingPatternsPath,
  shouldRunAct4DefaultsParity,
} from './remote-patterns-smoke-utils';

describe('shouldRunAct4DefaultsParity', () => {
  const prev = process.env.REMOTE_PATTERNS_COMPARE_DEFAULTS;

  afterEach(() => {
    if (prev === undefined) delete process.env.REMOTE_PATTERNS_COMPARE_DEFAULTS;
    else process.env.REMOTE_PATTERNS_COMPARE_DEFAULTS = prev;
  });

  it('is true for canonical staging only (not production) by default', () => {
    expect(shouldRunAct4DefaultsParity(REMOTE_PATTERNS_STAGING_URL)).toBe(true);
    expect(shouldRunAct4DefaultsParity(REMOTE_PATTERNS_URL)).toBe(false);
  });

  it('is true for raw.githubusercontent.com staging path; main path is parity-off unless env', () => {
    expect(
      isRawGitHubMainPatternsPath(
        'https://raw.githubusercontent.com/acme/pr-live-config/main/patterns.json'
      )
    ).toBe(true);
    expect(
      isRawGitHubStagingPatternsPath(
        'https://raw.githubusercontent.com/acme/pr-live-config/staging/patterns.json'
      )
    ).toBe(true);
    expect(
      shouldRunAct4DefaultsParity(
        'https://raw.githubusercontent.com/acme/pr-live-config/staging/patterns.json'
      )
    ).toBe(true);
    expect(
      shouldRunAct4DefaultsParity(
        'https://raw.githubusercontent.com/acme/pr-live-config/main/patterns.json'
      )
    ).toBe(false);
  });

  it('is true for production when REMOTE_PATTERNS_COMPARE_DEFAULTS=true', () => {
    process.env.REMOTE_PATTERNS_COMPARE_DEFAULTS = 'true';
    expect(shouldRunAct4DefaultsParity(REMOTE_PATTERNS_URL)).toBe(true);
    expect(
      shouldRunAct4DefaultsParity(
        'https://raw.githubusercontent.com/acme/pr-live-config/main/patterns.json'
      )
    ).toBe(true);
  });

  it('is false for arbitrary URLs unless REMOTE_PATTERNS_COMPARE_DEFAULTS=true', () => {
    expect(shouldRunAct4DefaultsParity('https://example.com/patterns.json')).toBe(false);
    process.env.REMOTE_PATTERNS_COMPARE_DEFAULTS = 'true';
    expect(shouldRunAct4DefaultsParity('https://example.com/patterns.json')).toBe(true);
  });

  it('is false for staging when REMOTE_PATTERNS_COMPARE_DEFAULTS=false', () => {
    process.env.REMOTE_PATTERNS_COMPARE_DEFAULTS = 'false';
    expect(shouldRunAct4DefaultsParity(REMOTE_PATTERNS_STAGING_URL)).toBe(false);
  });
});
