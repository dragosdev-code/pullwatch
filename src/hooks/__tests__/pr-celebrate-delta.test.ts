import { describe, it, expect } from 'vitest';
import { shouldCelebrateNewPrIds } from '../pr-celebrate-delta';

describe('shouldCelebrateNewPrIds', () => {
  it('is false when keys are equal', () => {
    expect(shouldCelebrateNewPrIds('a\0b', 'a\0b')).toBe(false);
  });

  it('is true when next adds an id', () => {
    expect(shouldCelebrateNewPrIds('a', 'a\0b')).toBe(true);
  });

  it('is false when next only removes ids', () => {
    expect(shouldCelebrateNewPrIds('a\0b', 'a')).toBe(false);
  });
});
