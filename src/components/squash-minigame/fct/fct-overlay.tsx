import { useEffect, useRef } from 'react';
import { useGameStore } from '../context/game-store-context';
import { createFctEngine, type FctEngine, type FctParticle } from './fct-engine';

export interface FctOverlayProps {
  /** Override for tests so the overlay does not depend on real RAF or performance.now. */
  engine?: FctEngine;
  now?: () => number;
  requestFrame?: (cb: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Fallback when a CSS variable is missing or empty (e.g. headless test). */
const FALLBACK_COLOR: Record<string, string> = {
  '--color-success': '#22c55e',
  '--color-warning': '#fbbf24',
  '--color-error': '#ef4444',
};

function drawParticle(
  ctx: CanvasRenderingContext2D,
  particle: FctParticle,
  now: number,
  canvasWidth: number,
  canvasHeight: number,
  resolveColor: (token: string) => string
) {
  const g = particle.layoutGridSize;
  const cellWidth = canvasWidth / g;
  const cellHeight = canvasHeight / g;
  const elapsed = now - particle.spawnedAt;
  const progress = Math.min(1, Math.max(0, elapsed / particle.lifetimeMs));
  const eased = easeOutCubic(progress);
  const row = Math.floor(particle.cellIndex / g);
  const col = particle.cellIndex % g;
  const x = (col + 0.5) * cellWidth;
  const baseY = (row + 0.5) * cellHeight;
  const y = baseY - eased * cellHeight * 0.6;
  const alpha = 1 - eased;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = resolveColor(particle.color);
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(particle.text, x, y);
}

/**
 * Canvas overlay for floating combat text. Sits above the grid with `pointer-events: none` so
 * clicks fall through to the cells beneath. Particles live entirely outside React state.
 *
 * WHY [subscribe outside React]: `store.subscribe` updates particles without triggering a render,
 * so a furious clicker producing 60 spawns per second does not stress the React reconciler.
 */
export function FctOverlay({
  engine,
  now = () => performance.now(),
  requestFrame = (cb) => globalThis.requestAnimationFrame(cb),
  cancelFrame = (handle) => globalThis.cancelAnimationFrame(handle),
}: FctOverlayProps = {}) {
  const store = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<FctEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = engine ?? createFctEngine();
  }

  useEffect(() => {
    let lastClickId = store.getState().lastClick?.id ?? -1;
    const unsubscribe = store.subscribe((state) => {
      const click = state.lastClick;
      if (!click || click.id === lastClickId) return;
      lastClickId = click.id;
      engineRef.current?.spawn(click.outcome, click.cellIndex, click.at, state.gridSize);
    });
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let handle: number | null = null;
    const draw = () => {
      const e = engineRef.current;
      if (!e) return;
      const t = now();
      const snapshot = e.snapshot(t);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      /**
       * WHY [per-frame cache]: getComputedStyle is expensive; caching per unique token per frame
       * means at most 3 lookups (success, warning, error) regardless of particle count.
       */
      const colorCache = new Map<string, string>();
      const computedStyle = globalThis.getComputedStyle?.(canvas);
      const resolveColor = (token: string): string => {
        const cached = colorCache.get(token);
        if (cached) return cached;
        const resolved = computedStyle?.getPropertyValue(token).trim();
        const color = resolved || FALLBACK_COLOR[token] || token;
        colorCache.set(token, color);
        return color;
      };

      for (const particle of snapshot.particles) {
        drawParticle(ctx, particle, t, canvas.width, canvas.height, resolveColor);
      }
      handle = requestFrame(draw);
    };
    handle = requestFrame(draw);
    return () => {
      if (handle !== null) cancelFrame(handle);
    };
  }, [store, now, requestFrame, cancelFrame]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="squash-fct-overlay"
      width={300}
      height={300}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
