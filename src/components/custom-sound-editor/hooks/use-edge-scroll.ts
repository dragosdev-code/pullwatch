import { useRef, useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import type { DragState } from '../types';
import { getEdgeScrollDirection } from '../utils/canvas-utils';
import { EDGE_SCROLL_SPEED_PX } from '../constants';

interface UseEdgeScrollParams {
  scrollRef: RefObject<HTMLDivElement | null>;
  dragRef: RefObject<DragState | null>;
  lastPointerClientXRef: RefObject<number>;
  applyDragFromClientX: (clientX: number) => void;
}

/**
 * Drives automatic horizontal scrolling when the user drags a trim handle
 * near the edge of the visible waveform viewport.
 *
 * WHY rAF loop (not pointer-event-driven): `pointermove` only fires when the
 * pointer physically moves. When the user holds the pointer still in the scroll
 * margin, the waveform must keep scrolling anyway — so we run a self-scheduling
 * rAF loop that continues as long as (a) a drag is active, (b) the pointer is
 * in a scroll margin, and (c) there is remaining scroll distance.
 *
 * Each tick: mutate scrollLeft → call applyDragFromClientX (so the trim selection
 * tracks the new scroll position) → check if more scrolling is needed → schedule
 * next tick or stop.
 */
export const useEdgeScroll = ({
  scrollRef,
  dragRef,
  lastPointerClientXRef,
  applyDragFromClientX,
}: UseEdgeScrollParams) => {
  const edgeScrollRafRef = useRef<number | null>(null);

  /**
   * WHY ref indirection for applyDragFromClientX: it is a useCallback whose
   * identity changes when pxToTime / setStartS / setEndS change. The rAF loop
   * must always call the LATEST version, but listing it as a dependency of
   * runEdgeScrollTick would re-create the entire callback chain on every change
   * and break in-flight rAF closures. Storing in a ref and reading `.current`
   * inside the tick guarantees freshness without re-creation.
   */
  const applyDragRef = useRef(applyDragFromClientX);
  applyDragRef.current = applyDragFromClientX;

  const stopEdgeScroll = useCallback(() => {
    if (edgeScrollRafRef.current != null) {
      cancelAnimationFrame(edgeScrollRafRef.current);
      edgeScrollRafRef.current = null;
    }
  }, []);

  const runEdgeScrollTick = useCallback(() => {
    edgeScrollRafRef.current = null;
    if (!dragRef.current) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const clientX = lastPointerClientXRef.current;
    const dir = getEdgeScrollDirection(scrollEl, clientX);
    if (dir === 'left' && scrollEl.scrollLeft > 0) {
      scrollEl.scrollLeft = Math.max(0, scrollEl.scrollLeft - EDGE_SCROLL_SPEED_PX);
    } else if (dir === 'right') {
      const maxL = scrollEl.scrollWidth - scrollEl.clientWidth;
      if (scrollEl.scrollLeft < maxL - 0.5) {
        scrollEl.scrollLeft = Math.min(maxL, scrollEl.scrollLeft + EDGE_SCROLL_SPEED_PX);
      }
    }
    applyDragRef.current(clientX);
    if (!dragRef.current) return;
    const dir2 = getEdgeScrollDirection(scrollEl, clientX);
    const maxL = scrollEl.scrollWidth - scrollEl.clientWidth;
    const more =
      (dir2 === 'left' && scrollEl.scrollLeft > 0) ||
      (dir2 === 'right' && scrollEl.scrollLeft < maxL - 0.5);
    if (dir2 && more) {
      edgeScrollRafRef.current = requestAnimationFrame(() => runEdgeScrollTick());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // All values read inside are refs — stable across renders, no deps needed.

  const tryScheduleEdgeScroll = useCallback(() => {
    if (edgeScrollRafRef.current != null) return;
    if (!dragRef.current) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    if (!getEdgeScrollDirection(scrollEl, lastPointerClientXRef.current)) return;
    edgeScrollRafRef.current = requestAnimationFrame(() => runEdgeScrollTick());
  }, [runEdgeScrollTick]);

  // Prevent orphan rAF on unmount.
  useEffect(() => () => stopEdgeScroll(), [stopEdgeScroll]);

  return { stopEdgeScroll, tryScheduleEdgeScroll };
};
