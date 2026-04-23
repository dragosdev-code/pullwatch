import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { DragState, HoverZone } from '../types';
import { hitMarginPx, oklchWithAlpha } from '../utils/canvas-utils';

interface WaveformCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  drawFnRef: RefObject<() => void>;
  hoverZoneRef: RefObject<HoverZone>;
  dragRef: RefObject<DragState | null>;
  trimRef: RefObject<{ startS: number; endS: number; duration: number }>;
  peaks: number[];
  startS: number;
  endS: number;
  duration: number;
  zoomLevel: number;
  baseViewportWidth: number;
  canvasCssWidth: number;
}

/**
 * Renders the audio waveform and trim selection overlays on a 2D canvas.
 *
 * Responsibilities strictly limited to:
 * 1. Managing the `useEffect` that assigns `drawFnRef.current` and draws to the canvas.
 * 2. Managing the `ResizeObserver` on the canvas to re-trigger draws.
 * 3. Rendering the raw `<canvas>` element.
 */
export const WaveformCanvas = ({
  canvasRef,
  drawFnRef,
  hoverZoneRef,
  dragRef,
  trimRef,
  peaks,
  startS,
  endS,
  duration,
  zoomLevel,
  baseViewportWidth,
  canvasCssWidth,
}: WaveformCanvasProps) => {
  /**
   * Main drawing routine.
   *
   * WHY refs instead of state for hoverZone/dragMode: hover changes fire on every
   * pointermove (dozens per second). If these were React state, each change would
   * trigger a full component re-render -> React reconciliation -> useEffect re-run ->
   * canvas redraw. By using refs and calling drawFnRef.current() imperatively,
   * we skip React entirely and redraw in ~0.5ms instead of ~5ms. This keeps hover
   * highlighting at 60fps even on low-end hardware.
   */
  useEffect(() => {
    drawFnRef.current = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;

      /**
       * WHY `canvas.width = clientWidth * dpr` + `ctx.scale(dpr, dpr)`:
       * Canvas has two sizes: CSS size (layout) and pixel-buffer size (actual pixels).
       * On a 2x Retina display, CSS width of 400px means 800 physical pixels. Without
       * DPR scaling, the browser stretches 400 buffer pixels across 800 physical pixels ->
       * blurry lines. Setting buffer to 400*2=800 and scaling the context by 2x means
       * our drawing commands still use CSS-pixel coordinates but render perfectly crisp.
       */
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      const barWidth = Math.max(1, (w / peaks.length) * 0.7);
      const gap = w / peaks.length;

      const style = getComputedStyle(canvas);
      const baseContentRaw =
        style.getPropertyValue('--color-base-content').trim() || '21% 0.006 285.885';
      const primaryRaw = style.getPropertyValue('--color-primary').trim() || '45% 0.24 277';
      const handleChRaw =
        style.getPropertyValue('--color-secondary').trim() ||
        style.getPropertyValue('--color-accent').trim() ||
        style.getPropertyValue('--color-neutral').trim() ||
        '65% 0.241 354';

      ctx.clearRect(0, 0, w, h);

      // Read from trimRef to ensure we have the absolute latest boundaries,
      // especially when drawn imperatively during an edge-scroll rAF loop.
      const { startS: s0, endS: e0, duration: dur } = trimRef.current;
      const selStart = dur > 0 ? (s0 / dur) * w : 0;
      const selEnd = dur > 0 ? (e0 / dur) * w : w;
      const selW = selEnd - selStart;
      const hm = hitMarginPx(w);
      const mid = selStart + selW / 2;
      let leftZoneEnd = Math.min(selStart + hm, mid);
      let rightZoneStart = Math.max(selEnd - hm, mid);
      if (leftZoneEnd > rightZoneStart) {
        leftZoneEnd = mid;
        rightZoneStart = mid;
      }

      const hover = hoverZoneRef.current;
      const dragMode = dragRef.current?.mode ?? null;
      const activeStart = dragMode === 'start' || hover === 'start';
      const activeEnd = dragMode === 'end' || hover === 'end';
      const activeMove = dragMode === 'move' || hover === 'move';

      const barCenterX = (i: number) => i * gap + barWidth * 0.5;

      const barFillForPeakIndex = (i: number): string => {
        const cx = barCenterX(i);
        if (cx < selStart || cx > selEnd) {
          return oklchWithAlpha(baseContentRaw, 0.4, '21% 0.006 285.885');
        }
        if (cx < leftZoneEnd) {
          return oklchWithAlpha(handleChRaw, activeStart ? 0.62 : 0.52, '65% 0.241 354');
        }
        if (cx > rightZoneStart) {
          return oklchWithAlpha(handleChRaw, activeEnd ? 0.62 : 0.52, '65% 0.241 354');
        }
        return oklchWithAlpha(primaryRaw, activeMove ? 0.64 : 0.58, '45% 0.24 277');
      };

      // Draw waveform bars
      for (let i = 0; i < peaks.length; i++) {
        const x = i * gap;
        const amplitude = peaks[i] * (h / 2) * 0.9;
        ctx.fillStyle = barFillForPeakIndex(i);
        ctx.fillRect(x, h / 2 - amplitude, barWidth, amplitude * 2 || 1);
      }

      // Draw excluded regions (dimmed)
      const excludedAlpha = 0.16;
      ctx.fillStyle = oklchWithAlpha(baseContentRaw, excludedAlpha, '21% 0.006 285.885');
      if (selStart > 0.5) {
        ctx.fillRect(0, 0, selStart, h);
      }
      if (selEnd < w - 0.5) {
        ctx.fillRect(selEnd, 0, w - selEnd, h);
      }

      const fillHandleIdle = 0.12;
      const fillHandleActive = 0.22;
      const fillMoveIdle = 0.08;
      const fillMoveActive = 0.12;

      // Draw selection overlay blocks
      ctx.fillStyle = oklchWithAlpha(
        handleChRaw,
        activeStart ? fillHandleActive : fillHandleIdle,
        '65% 0.241 354'
      );
      ctx.fillRect(selStart, 0, leftZoneEnd - selStart, h);
      ctx.fillStyle = oklchWithAlpha(
        primaryRaw,
        activeMove ? fillMoveActive : fillMoveIdle,
        '45% 0.24 277'
      );
      ctx.fillRect(leftZoneEnd, 0, rightZoneStart - leftZoneEnd, h);
      ctx.fillStyle = oklchWithAlpha(
        handleChRaw,
        activeEnd ? fillHandleActive : fillHandleIdle,
        '65% 0.241 354'
      );
      ctx.fillRect(rightZoneStart, 0, selEnd - rightZoneStart, h);

      // Draw separator lines inside selection
      ctx.strokeStyle = oklchWithAlpha(baseContentRaw, 0.28, '21% 0.006 285.885');
      ctx.lineWidth = 1;
      if (leftZoneEnd > selStart + 0.5) {
        ctx.beginPath();
        ctx.moveTo(leftZoneEnd, 0);
        ctx.lineTo(leftZoneEnd, h);
        ctx.stroke();
      }
      if (rightZoneStart < selEnd - 0.5 && rightZoneStart > leftZoneEnd + 0.5) {
        ctx.beginPath();
        ctx.moveTo(rightZoneStart, 0);
        ctx.lineTo(rightZoneStart, h);
        ctx.stroke();
      }

      // Draw edge handles
      const capLen = 5;
      const edgeLine = (at: number, capsRight: boolean, active: boolean) => {
        ctx.strokeStyle = active
          ? oklchWithAlpha(primaryRaw, 0.92, '45% 0.24 277')
          : oklchWithAlpha(baseContentRaw, 0.52, '21% 0.006 285.885');
        ctx.lineWidth = active ? 3 : 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(at, 0);
        ctx.lineTo(at, h);
        ctx.moveTo(at, 2);
        ctx.lineTo(capsRight ? at + capLen : at - capLen, 2);
        ctx.moveTo(at, h - 2);
        ctx.lineTo(capsRight ? at + capLen : at - capLen, h - 2);
        ctx.stroke();
      };
      edgeLine(selStart, true, activeStart);
      edgeLine(selEnd, false, activeEnd);
    };
    drawFnRef.current();
  }, [
    peaks,
    startS,
    endS,
    duration,
    zoomLevel,
    baseViewportWidth,
    canvasRef,
    drawFnRef,
    trimRef,
    hoverZoneRef,
    dragRef,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => drawFnRef.current());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef, drawFnRef]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-24 bg-base-200"
      style={{ width: canvasCssWidth, height: 90 }}
    />
  );
};
