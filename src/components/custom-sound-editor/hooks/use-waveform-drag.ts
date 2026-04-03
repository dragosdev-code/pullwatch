import { useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';
import type { DragMode, DragState, HoverZone } from '../types';
import { clampStartS, clampEndS, clampMoveWindow } from '../utils/math-utils';
import { hitMarginPx } from '../utils/canvas-utils';
import { useEdgeScroll } from './use-edge-scroll';

interface UseWaveformDragParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  drawFnRef: RefObject<() => void>;
  trimRef: RefObject<{ startS: number; endS: number; duration: number }>;
  duration: number;
  startS: number;
  endS: number;
  setStartS: (v: number) => void;
  setEndS: (v: number) => void;
}

interface UseWaveformDragReturn {
  dragRef: RefObject<DragState | null>;
  hoverZoneRef: RefObject<HoverZone>;
  cursor: string;
  handlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerCancel: () => void;
  handlePointerLeave: () => void;
}

/**
 * Manages the trim-handle drag interaction on the waveform canvas.
 *
 * Encapsulates hit-testing, pointer-to-time mapping, drag state,
 * hover highlighting, cursor management, and edge-auto-scroll.
 * Internally composes `useEdgeScroll` to avoid circular dependencies.
 */
export const useWaveformDrag = ({
  canvasRef,
  wrapperRef,
  scrollRef,
  drawFnRef,
  trimRef: _trimRef,
  duration,
  startS,
  endS,
  setStartS,
  setEndS,
}: UseWaveformDragParams): UseWaveformDragReturn => {
  const dragRef = useRef<DragState | null>(null);
  const hoverZoneRef = useRef<HoverZone>(null);
  const lastPointerClientXRef = useRef(0);
  const [cursor, setCursor] = useState('default');

  /**
   * Maps a viewport clientX to a time position (seconds) within the audio.
   *
   * WHY getBoundingClientRect (not offsetX): the canvas may be wider than the
   * scroll viewport, so the visible portion is offset by scrollLeft.
   * `getBoundingClientRect()` returns the canvas position relative to the
   * viewport, which means `clientX - rect.left` correctly maps to canvas-content
   * pixels regardless of scroll position. `offsetX` would also work for direct
   * canvas events, but pointer events fire on the wrapper div — so we need
   * the absolute mapping via getBoundingClientRect.
   */
  const pxToTime = useCallback(
    (clientX: number): number => {
      const canvas = canvasRef.current;
      if (!canvas) return 0;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      return Math.max(0, Math.min((px / rect.width) * duration, duration));
    },
    [duration],
  );

  /**
   * Determines which drag zone (start handle, end handle, or center region)
   * the pointer is over. Returns null when the pointer is outside all zones.
   */
  const hitTest = useCallback(
    (clientX: number): DragMode | null => {
      const canvas = canvasRef.current;
      if (!canvas || duration === 0) return null;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const w = rect.width;
      const startPx = (startS / duration) * w;
      const endPx = (endS / duration) * w;
      const hitMargin = hitMarginPx(w);
      if (Math.abs(px - startPx) <= hitMargin) return 'start';
      if (Math.abs(px - endPx) <= hitMargin) return 'end';
      if (px > startPx + hitMargin && px < endPx - hitMargin) return 'move';
      return null;
    },
    [startS, endS, duration],
  );

  /** Applies a drag movement from the given clientX, updating trim boundaries. */
  const applyDragFromClientX = useCallback(
    (clientX: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const t = pxToTime(clientX);
      if (drag.mode === 'start') {
        setStartS(clampStartS(t, drag.e0));
      } else if (drag.mode === 'end') {
        setEndS(clampEndS(t, drag.s0, drag.dur));
      } else {
        const { startS: ns, endS: ne } = clampMoveWindow(
          drag.s0 + (t - drag.t0),
          drag.e0 - drag.s0,
          drag.dur,
        );
        setStartS(ns);
        setEndS(ne);
      }
    },
    [pxToTime, setStartS, setEndS],
  );

  // Compose edge-scroll behavior. useEdgeScroll stores applyDragFromClientX
  // in a ref internally, so there is no circular dependency.
  const { stopEdgeScroll, tryScheduleEdgeScroll } = useEdgeScroll({
    scrollRef,
    dragRef,
    lastPointerClientXRef,
    applyDragFromClientX,
  });

  /** Updates hover zone from pointer position and triggers a canvas redraw if changed. */
  const syncHoverFromClientX = useCallback(
    (clientX: number) => {
      const next = hitTest(clientX);
      if (hoverZoneRef.current !== next) {
        hoverZoneRef.current = next;
        drawFnRef.current();
      }
    },
    [hitTest],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (duration === 0) return;
      const mode = hitTest(e.clientX);
      if (!mode) return;
      e.preventDefault();
      wrapperRef.current?.setPointerCapture(e.pointerId);
      lastPointerClientXRef.current = e.clientX;
      dragRef.current = { mode, t0: pxToTime(e.clientX), s0: startS, e0: endS, dur: duration };
      setCursor(mode === 'move' ? 'grabbing' : 'ew-resize');
      drawFnRef.current();
    },
    [duration, hitTest, pxToTime, startS, endS],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) {
        const mode = hitTest(e.clientX);
        syncHoverFromClientX(e.clientX);
        setCursor(mode === 'move' ? 'grab' : mode ? 'ew-resize' : 'default');
        return;
      }
      lastPointerClientXRef.current = e.clientX;
      applyDragFromClientX(e.clientX);
      tryScheduleEdgeScroll();
    },
    [hitTest, syncHoverFromClientX, applyDragFromClientX, tryScheduleEdgeScroll],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      stopEdgeScroll();
      dragRef.current = null;
      if (duration > 0) {
        syncHoverFromClientX(e.clientX);
        const mode = hitTest(e.clientX);
        setCursor(mode === 'move' ? 'grab' : mode ? 'ew-resize' : 'default');
      } else {
        setCursor('default');
      }
      drawFnRef.current();
    },
    [duration, hitTest, syncHoverFromClientX, stopEdgeScroll],
  );

  const handlePointerCancel = useCallback(() => {
    stopEdgeScroll();
    dragRef.current = null;
    hoverZoneRef.current = null;
    setCursor('default');
    drawFnRef.current();
  }, [stopEdgeScroll]);

  /**
   * Clears hover state when pointer leaves the wrapper (only when not dragging).
   * During a drag, pointer capture keeps events flowing to the wrapper even
   * when the pointer is outside, so we must not clear state prematurely.
   */
  const handlePointerLeave = useCallback(() => {
    if (!dragRef.current) {
      if (hoverZoneRef.current !== null) {
        hoverZoneRef.current = null;
        drawFnRef.current();
      }
      setCursor('default');
    }
  }, []);

  return {
    dragRef,
    hoverZoneRef,
    cursor,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
  };
};
