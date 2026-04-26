import type { BugPhase, ClickOutcome } from '../game-types';

export interface AudioEngine {
  playOutcome(outcome: ClickOutcome, combo: number): void;
  playRoundEnd(): void;
  close(): void;
}

export interface AudioEngineDeps {
  /** Lazy factory so the AudioContext is only created on the first user gesture (autoplay rules). */
  audioContextFactory?: () => AudioContext;
  /** Wall clock used for the playback start time. Defaults to the AudioContext's own currentTime. */
  now?: (ctx: AudioContext) => number;
}

const POP_DURATION_S = 0.08;
const FEATURE_DURATION_S = 0.25;
const FEATURE_FREQ = 180;
const MISS_DURATION_S = 0.1;
const MISS_FREQ = 110;

/**
 * Phase-specific frequencies and wave shapes for bug squash / crack tones.
 *
 * WHY [descending freq by phase]: fresh bugs are the most valuable (10 pts) so they get the
 * highest, brightest tone. Final-phase bugs use a softer triangle wave at 440Hz to signal
 * that the player waited too long and the reward is diminished.
 */
const PHASE_TONE: Record<BugPhase, { freq: number; type: OscillatorType; peakGain: number }> = {
  fresh:  { freq: 880, type: 'square',   peakGain: 0.30 },
  middle: { freq: 660, type: 'square',   peakGain: 0.25 },
  final:  { freq: 440, type: 'triangle', peakGain: 0.20 },
};

interface ToneSpec {
  freq: number;
  durationS: number;
  type: OscillatorType;
  /** Combo pitch multiplier per spec: `1 + comboCount * 0.05`. Only the bug pop scales by combo. */
  scaleByCombo: boolean;
  peakGain: number;
}

function specForOutcome(outcome: ClickOutcome): ToneSpec | null {
  switch (outcome.kind) {
    case 'bug_squashed': {
      const tone = PHASE_TONE[outcome.phase];
      return {
        freq: tone.freq,
        durationS: POP_DURATION_S,
        type: tone.type,
        scaleByCombo: true,
        peakGain: tone.peakGain,
      };
    }
    case 'bug_cracked': {
      const tone = PHASE_TONE[outcome.phase];
      return {
        freq: tone.freq * 0.75,
        durationS: POP_DURATION_S,
        type: tone.type,
        scaleByCombo: false,
        peakGain: tone.peakGain * 0.65,
      };
    }
    case 'feature_broken':
      return {
        freq: FEATURE_FREQ,
        durationS: FEATURE_DURATION_S,
        type: 'sawtooth',
        scaleByCombo: false,
        peakGain: 0.35,
      };
    case 'miss':
      return {
        freq: MISS_FREQ,
        durationS: MISS_DURATION_S,
        type: 'triangle',
        scaleByCombo: false,
        peakGain: 0.15,
      };
    case 'noop':
      return null;
  }
}

/**
 * Produces short procedurally generated tones for each click outcome. Bug squash pops scale up
 * in pitch with the combo counter (`1 + combo * 0.05`) per spec, capped to a 4x ceiling so a
 * fifty plus combo does not reach the Nyquist limit and squeak.
 *
 * WHY [lazy AudioContext]: browsers block AudioContext construction until a user gesture. The
 * factory is invoked from inside `playOutcome`, so the first click is the trigger.
 */
export function createAudioEngine(deps: AudioEngineDeps = {}): AudioEngine {
  const audioContextFactory =
    deps.audioContextFactory ??
    (() => {
      const Ctor =
        (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('AudioContext is not available in this environment');
      return new Ctor();
    });
  const now = deps.now ?? ((ctx: AudioContext) => ctx.currentTime);

  let ctx: AudioContext | null = null;

  function ensureContext(): AudioContext | null {
    if (ctx) return ctx;
    try {
      ctx = audioContextFactory();
      return ctx;
    } catch {
      return null;
    }
  }

  return {
    playOutcome(outcome, combo) {
      const spec = specForOutcome(outcome);
      if (!spec) return;
      const audio = ensureContext();
      if (!audio) return;

      const startAt = now(audio);
      const comboMultiplier = spec.scaleByCombo ? Math.min(4, 1 + combo * 0.05) : 1;

      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = spec.type;
      osc.frequency.value = spec.freq * comboMultiplier;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(spec.peakGain, startAt + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + spec.durationS);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(startAt);
      osc.stop(startAt + spec.durationS);
    },

    /**
     * Brief descending arpeggio signalling round completion.
     *
     * WHY [one-shot, no dedup here]: dedup is the caller's responsibility (via `useRoundEndAudio`
     * which tracks `roundId`). The engine just plays sounds.
     */
    playRoundEnd() {
      const audio = ensureContext();
      if (!audio) return;

      const startAt = now(audio);
      const notes = [
        { freq: 660, delay: 0 },
        { freq: 440, delay: 0.12 },
        { freq: 220, delay: 0.28 },
      ];
      const noteDuration = 0.15;
      const gain = 0.2;

      for (const note of notes) {
        const osc = audio.createOscillator();
        const g = audio.createGain();
        osc.type = 'triangle';
        osc.frequency.value = note.freq;
        g.gain.setValueAtTime(0, startAt + note.delay);
        g.gain.linearRampToValueAtTime(gain, startAt + note.delay + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, startAt + note.delay + noteDuration);
        osc.connect(g);
        g.connect(audio.destination);
        osc.start(startAt + note.delay);
        osc.stop(startAt + note.delay + noteDuration);
      }
    },

    close() {
      if (!ctx) return;
      void ctx.close();
      ctx = null;
    },
  };
}
