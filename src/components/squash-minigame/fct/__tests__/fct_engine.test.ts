import { describe, it, expect } from 'vitest';
import { createFctEngine, describeOutcome, FCT_LIFETIME_MS } from '../fct-engine';

describe('describeOutcome', () => {
  it('returns a success-token plus points label for a bug squash with no combo tag at combo one', () => {
    const desc = describeOutcome({
      kind: 'bug_squashed',
      basePoints: 10,
      multiplier: 1,
      points: 10,
      combo: 1,
      phase: 'fresh',
    });
    expect(desc).toEqual({ text: '+10', color: '--color-success' });
  });

  it('appends an x combo suffix when combo is greater than one', () => {
    const desc = describeOutcome({
      kind: 'bug_squashed',
      basePoints: 10,
      multiplier: 5,
      points: 50,
      combo: 5,
      phase: 'fresh',
    });
    expect(desc?.text).toBe('+50 x5');
  });

  it('returns a warning-token crack label for a cracked bug', () => {
    const desc = describeOutcome({ kind: 'bug_cracked', combo: 0, phase: 'fresh' });
    expect(desc).toEqual({ text: 'crack', color: '--color-warning' });
  });

  it('returns an error-token negative points label for a feature break', () => {
    const desc = describeOutcome({ kind: 'feature_broken', points: -20 });
    expect(desc?.text).toBe('-20');
    expect(desc?.color).toBe('--color-error');
  });

  it('returns a miss label for an empty cell click', () => {
    const desc = describeOutcome({ kind: 'miss' });
    expect(desc?.text).toBe('miss');
  });

  it('returns null for noop so no particle is spawned outside the playing state', () => {
    expect(describeOutcome({ kind: 'noop' })).toBeNull();
  });
});

describe('createFctEngine', () => {
  it('spawns a particle with a unique id and the spawn time', () => {
    const engine = createFctEngine();
    const a = engine.spawn(
      { kind: 'bug_squashed', basePoints: 10, multiplier: 1, points: 10, combo: 1, phase: 'fresh' },
      4,
      1_000,
      3
    );
    const b = engine.spawn(
      { kind: 'bug_squashed', basePoints: 10, multiplier: 2, points: 20, combo: 2, phase: 'fresh' },
      5,
      1_010,
      3
    );
    expect(a?.id).not.toBe(b?.id);
    expect(a?.spawnedAt).toBe(1_000);
    expect(b?.spawnedAt).toBe(1_010);
    expect(engine.size()).toBe(2);
  });

  it('does not spawn a particle for noop outcomes', () => {
    const engine = createFctEngine();
    const result = engine.spawn({ kind: 'noop' }, 0, 0, 3);
    expect(result).toBeNull();
    expect(engine.size()).toBe(0);
  });

  it('drops particles older than the lifetime when snapshotting', () => {
    const engine = createFctEngine();
    engine.spawn({ kind: 'miss' }, 0, 0, 3);
    engine.spawn({ kind: 'miss' }, 1, FCT_LIFETIME_MS / 2, 3);
    const snapshot = engine.snapshot(FCT_LIFETIME_MS + 1);
    expect(snapshot.particles).toHaveLength(1);
    expect(snapshot.particles[0].cellIndex).toBe(1);
  });

  it('clears all particles via clear', () => {
    const engine = createFctEngine();
    engine.spawn({ kind: 'miss' }, 0, 0, 3);
    engine.spawn({ kind: 'miss' }, 1, 0, 3);
    engine.clear();
    expect(engine.size()).toBe(0);
  });
});
