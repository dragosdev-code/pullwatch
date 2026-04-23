import { useRef, useState, useEffect, useCallback } from 'react';
import type { WaveformScrollerProps } from '../types';
import { MIN_WAVEFORM_ZOOM, MAX_WAVEFORM_ZOOM, WAVEFORM_VIEWPORT_FALLBACK_PX } from '../constants';
import { useWaveformDrag } from '../hooks/use-waveform-drag';
import { WaveformCanvas } from './waveform-canvas';
import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '../../ui/icons';

export const WaveformScroller = ({
  peaks,
  startS,
  endS,
  duration,
  setStartS,
  setEndS,
}: WaveformScrollerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const drawFnRef = useRef<() => void>(() => {});

  const trimRef = useRef({ startS, endS, duration });
  /**
   * WHY `trimRef.current = { startS, endS, duration }` in the render body
   * (not in useEffect): the canvas draw function and the rAF edge-scroll
   * loop both read `trimRef.current` to get the latest trim boundaries.
   * If we updated the ref in useEffect, there would be a one-frame delay
   * between React committing new startS/endS values and the draw function
   * seeing them — causing a visible flicker where handles jump back and forth.
   * Assigning in the render body ensures the ref is always current before
   * any effects or rAF callbacks run.
   */
  trimRef.current = { startS, endS, duration };

  const [zoomLevel, setZoomLevel] = useState(MIN_WAVEFORM_ZOOM);
  const [baseViewportWidth, setBaseViewportWidth] = useState(0);

  const baseW = baseViewportWidth > 0 ? baseViewportWidth : WAVEFORM_VIEWPORT_FALLBACK_PX;
  const canvasCssWidth = baseW * zoomLevel;

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const observer = new ResizeObserver(() => {
      setBaseViewportWidth(scrollEl.clientWidth);
    });
    observer.observe(scrollEl);
    setBaseViewportWidth(scrollEl.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Scroll to keep the selection centered when zooming or when viewport width changes.
  useEffect(() => {
    const el = scrollRef.current;
    const { startS: s0, endS: e0, duration: dur } = trimRef.current;
    if (!el || dur <= 0 || baseViewportWidth <= 0) return;
    const canvasW = baseViewportWidth * zoomLevel;
    const centerT = (s0 + e0) / 2;
    const targetPx = (centerT / dur) * canvasW - el.clientWidth / 2;
    el.scrollLeft = Math.max(0, Math.min(targetPx, Math.max(0, canvasW - el.clientWidth)));
  }, [zoomLevel, baseViewportWidth]);

  const bumpZoom = useCallback((delta: number) => {
    setZoomLevel((z) => Math.min(MAX_WAVEFORM_ZOOM, Math.max(MIN_WAVEFORM_ZOOM, z + delta)));
  }, []);

  const {
    dragRef,
    hoverZoneRef,
    cursor,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
  } = useWaveformDrag({
    canvasRef,
    wrapperRef,
    scrollRef,
    drawFnRef,
    trimRef,
    duration,
    startS,
    endS,
    setStartS,
    setEndS,
  });

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex flex-row items-center justify-center gap-1 shrink-0 mx-auto">
        <div className="flex items-center justify-center shrink-0">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square shrink-0"
            aria-label="Zoom out waveform"
            disabled={zoomLevel <= MIN_WAVEFORM_ZOOM}
            onClick={() => bumpZoom(-1)}
          >
            <MagnifyingGlassMinusIcon className="size-6" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square shrink-0"
            aria-label="Zoom in waveform"
            disabled={zoomLevel >= MAX_WAVEFORM_ZOOM}
            onClick={() => bumpZoom(1)}
          >
            <MagnifyingGlassPlusIcon className="size-6" />
          </button>
        </div>
        <span className="text-[12px] text-base-content/70 tabular-nums text-center">
          {zoomLevel}×
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-w-full overflow-x-auto overflow-y-hidden rounded-lg border border-base-300 touch-pan-x"
      >
        <div
          ref={wrapperRef}
          className="shrink-0"
          style={{ width: canvasCssWidth, cursor, touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
        >
          <WaveformCanvas
            canvasRef={canvasRef}
            drawFnRef={drawFnRef}
            hoverZoneRef={hoverZoneRef}
            dragRef={dragRef}
            trimRef={trimRef}
            peaks={peaks}
            startS={startS}
            endS={endS}
            duration={duration}
            zoomLevel={zoomLevel}
            baseViewportWidth={baseViewportWidth}
            canvasCssWidth={canvasCssWidth}
          />
        </div>
      </div>
    </div>
  );
};
