import { describe, expect, it } from 'vitest';
import { isTransientExtensionStorageError } from '../errors';
import { runWithTransientStorageRetry } from '../transient-storage-retry';

describe('isTransientExtensionStorageError', () => {
  it('matches Chromium No SW message', () => {
    expect(isTransientExtensionStorageError(new Error('No SW'))).toBe(true);
    expect(isTransientExtensionStorageError(new Error('Error: No SW'))).toBe(true);
  });

  it('rejects unrelated errors', () => {
    expect(isTransientExtensionStorageError(new Error('Quota exceeded'))).toBe(false);
    expect(isTransientExtensionStorageError('No SW')).toBe(false);
    expect(isTransientExtensionStorageError(null)).toBe(false);
  });
});

describe('runWithTransientStorageRetry', () => {
  it('succeeds after one transient failure', async () => {
    let calls = 0;
    const value = await runWithTransientStorageRetry(async () => {
      calls += 1;
      if (calls === 1) throw new Error('No SW');
      return 42;
    });
    expect(value).toBe(42);
    expect(calls).toBe(2);
  });

  it('does not retry non-transient errors', async () => {
    let calls = 0;
    await expect(
      runWithTransientStorageRetry(async () => {
        calls += 1;
        throw new Error('not transient');
      })
    ).rejects.toThrow('not transient');
    expect(calls).toBe(1);
  });

  it('gives up after MAX_TRIES transient failures', async () => {
    let calls = 0;
    await expect(
      runWithTransientStorageRetry(async () => {
        calls += 1;
        throw new Error('No SW');
      })
    ).rejects.toThrow('No SW');
    expect(calls).toBe(3);
  });
});
