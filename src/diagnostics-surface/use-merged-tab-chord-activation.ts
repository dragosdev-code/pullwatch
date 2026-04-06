import { useEffect, useRef } from 'react';
import { useDebugStore } from '../stores/debug';

const SLOT_SEQUENCE = Array.from('testdev');

function isEditableTarget(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false;
  const el = t;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return el.closest('[contenteditable="true"]') !== null;
}

export function useMergedTabChordActivation(mergedTabButton: HTMLButtonElement | null) {
  const chordIndexRef = useRef(0);
  const chordArmedRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { isDebugMode, diagnosticsPromptOpen, openDiagnosticsPrompt } =
        useDebugStore.getState();
      if (!chordArmedRef.current || isDebugMode || diagnosticsPromptOpen) return;
      if (isEditableTarget(e.target)) return;
      const ch = e.key;
      if (ch.length !== 1) return;
      const expected = SLOT_SEQUENCE[chordIndexRef.current];
      if (ch === expected) {
        chordIndexRef.current += 1;
        if (chordIndexRef.current >= SLOT_SEQUENCE.length) {
          chordIndexRef.current = 0;
          chordArmedRef.current = false;
          openDiagnosticsPrompt();
        }
      } else {
        chordIndexRef.current = 0;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    const releaseChord = () => {
      chordArmedRef.current = false;
      chordIndexRef.current = 0;
    };
    window.addEventListener('pointerup', releaseChord);
    window.addEventListener('pointercancel', releaseChord);
    return () => {
      window.removeEventListener('pointerup', releaseChord);
      window.removeEventListener('pointercancel', releaseChord);
    };
  }, []);

  useEffect(() => {
    if (!mergedTabButton) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const { isDebugMode, diagnosticsPromptOpen } = useDebugStore.getState();
      if (isDebugMode || diagnosticsPromptOpen) return;
      chordArmedRef.current = true;
      chordIndexRef.current = 0;
    };

    const onPointerLeave = () => {
      if (chordArmedRef.current) {
        chordArmedRef.current = false;
        chordIndexRef.current = 0;
      }
    };

    mergedTabButton.addEventListener('pointerdown', onPointerDown, true);
    mergedTabButton.addEventListener('pointerleave', onPointerLeave);
    return () => {
      mergedTabButton.removeEventListener('pointerdown', onPointerDown, true);
      mergedTabButton.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [mergedTabButton]);
}
