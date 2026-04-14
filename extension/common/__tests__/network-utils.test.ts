import { describe, expect, it } from 'vitest';
import { isOfflineError } from '../network-utils';

describe('isOfflineError', () => {
  it('matches Chrome-style fetch transport TypeError', () => {
    expect(isOfflineError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('matches Firefox-style fetch transport TypeError', () => {
    expect(isOfflineError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(
      true
    );
  });

  it('matches Load failed (defensive)', () => {
    expect(isOfflineError(new TypeError('Load failed'))).toBe(true);
  });

  it('does not match plain Error with similar message', () => {
    expect(isOfflineError(new Error('Failed to fetch'))).toBe(false);
  });

  it('does not match unrelated TypeError', () => {
    expect(isOfflineError(new TypeError('Cannot read properties of undefined'))).toBe(false);
  });

  it('does not match unrelated Error', () => {
    expect(isOfflineError(new Error('parser broke'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isOfflineError(null)).toBe(false);
    expect(isOfflineError('Failed to fetch')).toBe(false);
  });

  it('matches DOMException NetworkError when available', () => {
    if (typeof DOMException === 'undefined') {
      return;
    }
    expect(isOfflineError(new DOMException('blocked', 'NetworkError'))).toBe(true);
    expect(isOfflineError(new DOMException('other', 'NotFoundError'))).toBe(false);
  });
});
