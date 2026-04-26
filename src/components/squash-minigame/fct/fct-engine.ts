import type { ClickOutcome } from '../game-types';

export interface FctParticle {
  id: string;
  text: string;
  color: string;
  cellIndex: number;
  /** Row/col mapping uses this N so FCT does not jump when the grid grows mid-particle. */
  layoutGridSize: number;
  spawnedAt: number;
  lifetimeMs: number;
}

export interface FctSnapshot {
  particles: FctParticle[];
}

export const FCT_LIFETIME_MS = 700;

/**
 * Returns the text + CSS variable name for a click outcome. The overlay resolves the variable
 * at draw time via `getComputedStyle` so colors stay theme-aware without the engine knowing
 * the active DaisyUI theme.
 *
 * WHY [var names, not hex]: hardcoded hex works only for one theme. By returning the semantic
 * token name, callers can resolve it against the live DOM and automatically pick up theme switches.
 */
export function describeOutcome(outcome: ClickOutcome): { text: string; color: string } | null {
  switch (outcome.kind) {
    case 'bug_squashed': {
      const comboTag = outcome.combo > 1 ? ` x${outcome.combo}` : '';
      return { text: `+${outcome.points}${comboTag}`, color: '--color-success' };
    }
    case 'bug_cracked':
      return { text: 'crack', color: '--color-warning' };
    case 'feature_broken':
      return { text: `${outcome.points}`, color: '--color-error' };
    case 'miss':
      return { text: 'miss', color: '--color-error' };
    case 'noop':
      return null;
  }
}

/**
 * Pure FCT particle store. The canvas overlay component pushes spawn events on every click and
 * polls `snapshot(now)` each frame to drop expired particles before drawing.
 *
 * WHY [pure module]: keeps particles outside React state so adding a particle does not trigger a
 * render. The canvas overlay reads via RAF, not React subscriptions.
 */
export function createFctEngine() {
  let particles: FctParticle[] = [];
  let nextId = 0;

  return {
    spawn(
      outcome: ClickOutcome,
      cellIndex: number,
      now: number,
      layoutGridSize: number
    ): FctParticle | null {
      const desc = describeOutcome(outcome);
      if (!desc) return null;
      nextId += 1;
      const particle: FctParticle = {
        id: `fct_${nextId}`,
        text: desc.text,
        color: desc.color,
        cellIndex,
        layoutGridSize,
        spawnedAt: now,
        lifetimeMs: FCT_LIFETIME_MS,
      };
      particles.push(particle);
      return particle;
    },
    snapshot(now: number): FctSnapshot {
      particles = particles.filter((p) => now - p.spawnedAt < p.lifetimeMs);
      return { particles };
    },
    size(): number {
      return particles.length;
    },
    clear() {
      particles = [];
    },
  };
}

export type FctEngine = ReturnType<typeof createFctEngine>;
