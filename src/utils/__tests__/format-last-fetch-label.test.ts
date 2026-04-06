import { describe, expect, it } from 'vitest';
import {
  formatLastFetchDetail,
  formatLastFetchMainLine,
  LAST_FETCH_PREFIX,
} from '../format-last-fetch-label';

describe('formatLastFetchMainLine', () => {
  it('returns plain when no timestamp', () => {
    expect(formatLastFetchMainLine(null, 10_000)).toEqual({
      variant: 'plain',
      text: 'No updates yet',
    });
  });

  it('uses seconds suffix below 60s', () => {
    const t0 = 1_000_000;
    expect(formatLastFetchMainLine(t0, t0 + 0)).toEqual({
      variant: 'withSuffix',
      prefix: LAST_FETCH_PREFIX,
      suffix: '~0s ago',
    });
    expect(formatLastFetchMainLine(t0, t0 + 59_999)).toEqual({
      variant: 'withSuffix',
      prefix: LAST_FETCH_PREFIX,
      suffix: '~59s ago',
    });
  });

  it('switches to whole minutes at 60s', () => {
    const t0 = 1_000_000;
    expect(formatLastFetchMainLine(t0, t0 + 60_000)).toEqual({
      variant: 'withSuffix',
      prefix: LAST_FETCH_PREFIX,
      suffix: '1 min ago',
    });
  });

  it('supports large minute counts', () => {
    const t0 = 1_000_000;
    expect(formatLastFetchMainLine(t0, t0 + 180_000)).toEqual({
      variant: 'withSuffix',
      prefix: LAST_FETCH_PREFIX,
      suffix: '3 min ago',
    });
    expect(formatLastFetchMainLine(t0, t0 + 125 * 60_000)).toEqual({
      variant: 'withSuffix',
      prefix: LAST_FETCH_PREFIX,
      suffix: '125 min ago',
    });
  });

  it('never returns negative-looking ages when clock skews', () => {
    const t0 = 1_000_000;
    expect(formatLastFetchMainLine(t0, t0 - 5000)).toEqual({
      variant: 'withSuffix',
      prefix: LAST_FETCH_PREFIX,
      suffix: '~0s ago',
    });
  });
});

describe('formatLastFetchDetail', () => {
  it('formats minutes and seconds', () => {
    const t0 = 1_000_000;
    expect(formatLastFetchDetail(t0, t0 + 45_000)).toBe('0 min 45 sec ago');
    expect(formatLastFetchDetail(t0, t0 + 60_000)).toBe('1 min 0 sec ago');
    expect(formatLastFetchDetail(t0, t0 + 125_000)).toBe('2 min 5 sec ago');
  });
});
