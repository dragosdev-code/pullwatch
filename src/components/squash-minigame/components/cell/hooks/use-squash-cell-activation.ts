import { useCallback, useRef } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent, RefObject } from 'react';
import type { GameStore } from '../../../game-store';
import { playSquashCellTapFeedback } from '../squash-cell-tap-feedback';

function releasePointerCaptureSafe(el: HTMLButtonElement, pointerId: number) {
  try {
    if (el.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId);
    }
  } catch {
    /* pointer already released */
  }
}

export interface UseSquashCellActivationParams {
  store: GameStore;
  cellIndex: number;
  reducedMotion: boolean;
}

export interface UseSquashCellActivationResult {
  buttonRef: RefObject<HTMLButtonElement | null>;
  glyphRef: RefObject<HTMLSpanElement | null>;
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Pointer capture + primary `pointerup` activation (sloppy taps still hit this cell), synthetic
 * `click` deduping, and keyboard (`Space` / `Enter`) paths — plus {@link playSquashCellTapFeedback}
 * after each successful {@link GameStore} `clickCell`.
 *
 * WHY extracted: keeps {@link SquashCell} as subscription + presentation only, matching how
 * `custom-sound-editor` splits interaction hooks from shell components.
 */
export function useSquashCellActivation({
  store,
  cellIndex,
  reducedMotion,
}: UseSquashCellActivationParams): UseSquashCellActivationResult {
  const suppressClickFromPointerRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const glyphRef = useRef<HTMLSpanElement>(null);

  const activate = useCallback(() => {
    store.getState().clickCell(cellIndex, performance.now());
    const btn = buttonRef.current;
    if (btn) {
      playSquashCellTapFeedback(btn, glyphRef.current, reducedMotion);
    }
  }, [store, cellIndex, reducedMotion]);

  const onPointerDown = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    suppressClickFromPointerRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || !e.isPrimary) return;
      releasePointerCaptureSafe(e.currentTarget, e.pointerId);
      e.preventDefault();
      suppressClickFromPointerRef.current = true;
      activate();
    },
    [activate]
  );

  const onPointerCancel = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    releasePointerCaptureSafe(e.currentTarget, e.pointerId);
  }, []);

  /**
   * WHY: Space/Enter fire `click` without a pointer sequence. Clear duplicate-suppression so a
   * prior pointer-only gesture that left `suppressClickFromPointerRef` stuck does not swallow the
   * keyboard `click`.
   */
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.currentTarget !== e.target) return;
    if (e.key !== ' ' && e.key !== 'Enter') return;
    suppressClickFromPointerRef.current = false;
  }, []);

  /**
   * WHY [suppress only]: `pointerup` runs first and sets suppression; the synthetic `click` must be
   * ignored. Do not branch on `detail === 0`: many environments (including after `pointerup`) emit
   * `detail === 0`, which would fire `activate()` twice — squash plus miss on one tap.
   */
  const onClick = useCallback(
    (_e: MouseEvent<HTMLButtonElement>) => {
      if (suppressClickFromPointerRef.current) {
        suppressClickFromPointerRef.current = false;
        return;
      }
      activate();
    },
    [activate]
  );

  return {
    buttonRef,
    glyphRef,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onKeyDown,
    onClick,
  };
}
