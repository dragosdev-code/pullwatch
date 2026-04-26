import { describe, it, expect } from 'vitest';
import { formatScore } from '../format-score';

describe('formatScore', () => {
  it('returns the integer for values under 1000', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(1)).toBe('1');
    expect(formatScore(42)).toBe('42');
    expect(formatScore(999)).toBe('999');
  });

  it('formats thousands with a k suffix and one decimal', () => {
    expect(formatScore(1_000)).toBe('1k');
    expect(formatScore(1_234)).toBe('1.2k');
    expect(formatScore(12_345)).toBe('12.3k');
    expect(formatScore(999_999)).toBe('1000k');
  });

  it('strips trailing .0 in k notation', () => {
    expect(formatScore(2_000)).toBe('2k');
    expect(formatScore(10_000)).toBe('10k');
  });

  it('formats millions with an m suffix and one decimal', () => {
    expect(formatScore(1_000_000)).toBe('1m');
    expect(formatScore(3_500_000)).toBe('3.5m');
    expect(formatScore(12_345_678)).toBe('12.3m');
  });

  it('strips trailing .0 in m notation', () => {
    expect(formatScore(5_000_000)).toBe('5m');
  });

  it('handles negative values', () => {
    expect(formatScore(-20)).toBe('-20');
    expect(formatScore(-1_500)).toBe('-1.5k');
    expect(formatScore(-2_000_000)).toBe('-2m');
  });
});
