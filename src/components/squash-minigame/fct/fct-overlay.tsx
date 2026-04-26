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

function drawParticle(
  ctx: CanvasRenderingContext2D,
  particle: FctParticle,
  now: number,
  cellWidth: number,
  cellHeight: number,
  gridSize: number
) {
  const elapsed = now - particle.spawnedAt;
  const progress = Math.min(1, Math.max(0, elapsed / particle.lifetimeMs));
  const eased = easeOutCubic(progress);
  const row = Math.floor(particle.cellIndex / gridSize);
  const col = particle.cellIndex % gridSize;
  const x = (col + 0.5) * cellWidth;
  const baseY = (row + 0.5) * cellHeight;
  const y = baseY - eased * cellHeight * 0.6;
  const alpha = 1 - eased;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = particle.color;
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
    let lastClickAt = store.getState().lastClick?.at ?? -1;
    const unsubscribe = store.subscribe((state) => {
      const click = state.lastClick;
      if (!click || click.at === lastClickAt) return;
      lastClickAt = click.at;
      engineRef.current?.spawn(click.outcome, click.cellIndex, click.at);
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
      const { gridSize } = store.getState();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cellWidth = canvas.width / gridSize;
      const cellHeight = canvas.height / gridSize;
      for (const particle of snapshot.particles) {
        drawParticle(ctx, particle, t, cellWidth, cellHeight, gridSize);
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
