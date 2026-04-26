import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAudioEngine } from '../audio-engine';
import type { ClickOutcome } from '../../game-types';

interface FakeOscillator {
  type: OscillatorType;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface FakeGain {
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
}

interface FakeContext {
  currentTime: number;
  destination: object;
  state: string;
  oscillators: FakeOscillator[];
  gains: FakeGain[];
  closeCalls: number;
  createOscillator: () => FakeOscillator;
  createGain: () => FakeGain;
  close: () => Promise<void>;
}

function buildFakeContext(): FakeContext {
  const ctx = {
    currentTime: 0,
    destination: {},
    state: 'running',
    oscillators: [] as FakeOscillator[],
    gains: [] as FakeGain[],
    closeCalls: 0,
  } as FakeContext;
  ctx.createOscillator = () => {
    const osc: FakeOscillator = {
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    ctx.oscillators.push(osc);
    return osc;
  };
  ctx.createGain = () => {
    const gain: FakeGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    ctx.gains.push(gain);
    return gain;
  };
  ctx.close = async () => {
    ctx.closeCalls += 1;
  };
  return ctx;
}

const bugSquashed = (combo: number): ClickOutcome => ({
  kind: 'bug_squashed',
  basePoints: 10,
  multiplier: Math.min(10, combo || 1),
  points: 10 * Math.min(10, combo || 1),
  combo,
  phase: 'fresh',
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createAudioEngine', () => {
  it('lazily constructs the AudioContext on the first playback', () => {
    const factory = vi.fn(() => buildFakeContext() as unknown as AudioContext);
    const engine = createAudioEngine({ audioContextFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    engine.playOutcome(bugSquashed(0), 0);
    expect(factory).toHaveBeenCalledTimes(1);
    engine.playOutcome(bugSquashed(0), 0);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('plays a square pop at 880Hz for a fresh-phase bug squash with combo pitch shift', () => {
    const ctx = buildFakeContext();
    const engine = createAudioEngine({
      audioContextFactory: () => ctx as unknown as AudioContext,
    });
    engine.playOutcome(bugSquashed(4), 4);
    expect(ctx.oscillators).toHaveLength(1);
    expect(ctx.oscillators[0].type).toBe('square');
    // fresh phase base = 880Hz, combo multiplier = 1 + 4*0.05 = 1.2
    expect(ctx.oscillators[0].frequency.value).toBeCloseTo(880 * (1 + 4 * 0.05), 4);
    expect(ctx.oscillators[0].start).toHaveBeenCalledTimes(1);
    expect(ctx.oscillators[0].stop).toHaveBeenCalledTimes(1);
  });

  it('caps the combo pitch multiplier at 4x to stay under the Nyquist limit', () => {
    const ctx = buildFakeContext();
    const engine = createAudioEngine({
      audioContextFactory: () => ctx as unknown as AudioContext,
    });
    engine.playOutcome(bugSquashed(500), 500);
    expect(ctx.oscillators[0].frequency.value).toBeCloseTo(880 * 4, 4);
  });

  it('uses 660Hz square for a middle-phase bug squash', () => {
    const ctx = buildFakeContext();
    const engine = createAudioEngine({
      audioContextFactory: () => ctx as unknown as AudioContext,
    });
    const outcome: ClickOutcome = {
      kind: 'bug_squashed', basePoints: 5, multiplier: 1, points: 5, combo: 1, phase: 'middle',
    };
    engine.playOutcome(outcome, 1);
    expect(ctx.oscillators[0].type).toBe('square');
    expect(ctx.oscillators[0].frequency.value).toBeCloseTo(660 * (1 + 1 * 0.05), 4);
  });

  it('uses 440Hz triangle for a final-phase bug squash', () => {
    const ctx = buildFakeContext();
    const engine = createAudioEngine({
      audioContextFactory: () => ctx as unknown as AudioContext,
    });
    const outcome: ClickOutcome = {
      kind: 'bug_squashed', basePoints: 2, multiplier: 1, points: 2, combo: 1, phase: 'final',
    };
    engine.playOutcome(outcome, 1);
    expect(ctx.oscillators[0].type).toBe('triangle');
    expect(ctx.oscillators[0].frequency.value).toBeCloseTo(440 * (1 + 1 * 0.05), 4);
  });

  it('does not pitch shift the bug crack tone by combo and uses phase freq times 0.75', () => {
    const ctx = buildFakeContext();
    const engine = createAudioEngine({
      audioContextFactory: () => ctx as unknown as AudioContext,
    });
    engine.playOutcome({ kind: 'bug_cracked', combo: 9, phase: 'fresh' }, 9);
    // fresh phase = 880Hz, crack = 880 * 0.75 = 660, no combo scaling
    expect(ctx.oscillators[0].frequency.value).toBeCloseTo(880 * 0.75, 4);
  });

  it('plays a sawtooth tone for feature break and a triangle for miss', () => {
    const ctx = buildFakeContext();
    const engine = createAudioEngine({
      audioContextFactory: () => ctx as unknown as AudioContext,
    });
    engine.playOutcome({ kind: 'feature_broken', points: -20 }, 0);
    engine.playOutcome({ kind: 'miss' }, 0);
    expect(ctx.oscillators[0].type).toBe('sawtooth');
    expect(ctx.oscillators[1].type).toBe('triangle');
  });

  it('ignores noop outcomes without constructing the AudioContext', () => {
    const factory = vi.fn(() => buildFakeContext() as unknown as AudioContext);
    const engine = createAudioEngine({ audioContextFactory: factory });
    engine.playOutcome({ kind: 'noop' }, 0);
    expect(factory).not.toHaveBeenCalled();
  });

  it('swallows AudioContext construction failures so a missing audio device cannot crash the game', () => {
    const factory = vi.fn(() => {
      throw new Error('not allowed');
    });
    const engine = createAudioEngine({ audioContextFactory: factory });
    expect(() => engine.playOutcome(bugSquashed(0), 0)).not.toThrow();
  });

  it('closes the underlying context exactly once', () => {
    const ctx = buildFakeContext();
    const engine = createAudioEngine({
      audioContextFactory: () => ctx as unknown as AudioContext,
    });
    engine.playOutcome(bugSquashed(0), 0);
    engine.close();
    engine.close();
    expect(ctx.closeCalls).toBe(1);
  });

  it('plays a three-note descending arpeggio for playRoundEnd', () => {
    const ctx = buildFakeContext();
    const engine = createAudioEngine({
      audioContextFactory: () => ctx as unknown as AudioContext,
    });
    engine.playRoundEnd();
    expect(ctx.oscillators).toHaveLength(3);
    expect(ctx.oscillators[0].frequency.value).toBe(660);
    expect(ctx.oscillators[1].frequency.value).toBe(440);
    expect(ctx.oscillators[2].frequency.value).toBe(220);
    // All three use triangle waveform
    for (const osc of ctx.oscillators) {
      expect(osc.type).toBe('triangle');
      expect(osc.start).toHaveBeenCalledTimes(1);
      expect(osc.stop).toHaveBeenCalledTimes(1);
    }
  });
});
