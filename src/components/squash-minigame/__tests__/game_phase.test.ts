import { describe, it, expect } from 'vitest';
import {
  computeBugPhase,
  PHASE_FRACTION_FRESH_TO_MIDDLE,
  PHASE_FRACTION_MIDDLE_TO_FINAL,
} from '../game-phase';
import { PHASE_BASE_POINTS } from '../game-config';

const LIFETIME_MS = 900;

function targetSpawnedAt(spawnedAt: number) {
  return { spawnedAt };
}

describe('computeBugPhase', () => {
  it('returns fresh at spawn time', () => {
    expect(computeBugPhase(targetSpawnedAt(1_000), 1_000, LIFETIME_MS)).toBe('fresh');
  });

  it('returns fresh just before the fresh→middle boundary', () => {
    const just = LIFETIME_MS * PHASE_FRACTION_FRESH_TO_MIDDLE - 1;
    expect(computeBugPhase(targetSpawnedAt(0), just, LIFETIME_MS)).toBe('fresh');
  });

  it('returns middle exactly at the fresh→middle boundary', () => {
    const at = LIFETIME_MS * PHASE_FRACTION_FRESH_TO_MIDDLE;
    expect(computeBugPhase(targetSpawnedAt(0), at, LIFETIME_MS)).toBe('middle');
  });

  it('returns middle in the middle window', () => {
    expect(computeBugPhase(targetSpawnedAt(0), LIFETIME_MS / 2, LIFETIME_MS)).toBe('middle');
  });

  it('returns middle just before the middle→final boundary', () => {
    const just = LIFETIME_MS * PHASE_FRACTION_MIDDLE_TO_FINAL - 1;
    expect(computeBugPhase(targetSpawnedAt(0), just, LIFETIME_MS)).toBe('middle');
  });

  it('returns final exactly at the middle→final boundary', () => {
    const at = LIFETIME_MS * PHASE_FRACTION_MIDDLE_TO_FINAL;
    expect(computeBugPhase(targetSpawnedAt(0), at, LIFETIME_MS)).toBe('final');
  });

  it('returns final in the final window', () => {
    expect(computeBugPhase(targetSpawnedAt(0), LIFETIME_MS - 1, LIFETIME_MS)).toBe('final');
  });

  it('clamps to final past the despawn time', () => {
    expect(computeBugPhase(targetSpawnedAt(0), LIFETIME_MS * 5, LIFETIME_MS)).toBe('final');
  });

  it('clamps to fresh when now precedes spawnedAt', () => {
    expect(computeBugPhase(targetSpawnedAt(1_000), 500, LIFETIME_MS)).toBe('fresh');
  });

  it('returns final when lifetime is zero or negative (defensive)', () => {
    expect(computeBugPhase(targetSpawnedAt(0), 0, 0)).toBe('final');
    expect(computeBugPhase(targetSpawnedAt(0), 100, -10)).toBe('final');
  });

  it('is independent of absolute time scale', () => {
    const offset = 1_700_000_000_000;
    expect(computeBugPhase(targetSpawnedAt(offset), offset + 100, LIFETIME_MS)).toBe('fresh');
    expect(computeBugPhase(targetSpawnedAt(offset), offset + LIFETIME_MS / 2, LIFETIME_MS)).toBe(
      'middle'
    );
    expect(computeBugPhase(targetSpawnedAt(offset), offset + LIFETIME_MS - 1, LIFETIME_MS)).toBe(
      'final'
    );
  });
});

describe('PHASE_BASE_POINTS', () => {
  it('matches the spec: fresh 10, middle 5, final 2', () => {
    expect(PHASE_BASE_POINTS.fresh).toBe(10);
    expect(PHASE_BASE_POINTS.middle).toBe(5);
    expect(PHASE_BASE_POINTS.final).toBe(2);
  });

  it('is monotonically non-increasing across phases', () => {
    expect(PHASE_BASE_POINTS.fresh).toBeGreaterThan(PHASE_BASE_POINTS.middle);
    expect(PHASE_BASE_POINTS.middle).toBeGreaterThan(PHASE_BASE_POINTS.final);
  });
});
