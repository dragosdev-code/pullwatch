import { describe, it, expect } from 'vitest';
import { formatScore } from '../format-score';

describe('formatScore', () => {
  it('returns the full integer string for any magnitude', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(1)).toBe('1');
    expect(formatScore(42)).toBe('42');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(1_000)).toBe('1000');
    expect(formatScore(1_234)).toBe('1234');
    expect(formatScore(12_345)).toBe('12345');
    expect(formatScore(999_999)).toBe('999999');
    expect(formatScore(1_000_000)).toBe('1000000');
    expect(formatScore(3_500_000)).toBe('3500000');
    expect(formatScore(12_345_678)).toBe('12345678');
  });

  it('rounds to the nearest integer', () => {
    expect(formatScore(1.4)).toBe('1');
    expect(formatScore(1.5)).toBe('2');
  });

  it('handles negative values', () => {
    expect(formatScore(-20)).toBe('-20');
    expect(formatScore(-1_500)).toBe('-1500');
    expect(formatScore(-2_000_000)).toBe('-2000000');
  });
});
