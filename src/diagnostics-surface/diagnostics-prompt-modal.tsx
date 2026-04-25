import { useCallback, useEffect, useRef, useState } from 'react';
import { DEV_TEST_AREA_ENABLE_DELAY_MS } from '@common/constants';
import { DurationRadialRing } from '@src/components/ui/duration-radial-ring';
import { useDebugStore } from '@src/stores/debug';
import { DIAGNOSTICS_SURFACE_DISCLAIMER, DIAGNOSTICS_SURFACE_TITLE } from './copy';

type Phase = 'prompt' | 'arming';

export function DiagnosticsPromptModal() {
  const open = useDebugStore((s) => s.diagnosticsPromptOpen);
  const closeDiagnosticsPrompt = useDebugStore((s) => s.closeDiagnosticsPrompt);
  const setDebugMode = useDebugStore((s) => s.setDebugMode);

  const [phase, setPhase] = useState<Phase>('prompt');
  const armTimerRef = useRef<number | null>(null);
  const titleId = 'diagnostics-gate-title';
  const panelRef = useRef<HTMLDivElement>(null);

  const clearArmTimer = useCallback(() => {
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setPhase('prompt');
      clearArmTimer();
    }
  }, [open, clearArmTimer]);

  useEffect(() => {
    if (!open || phase !== 'prompt') return;
    const node = panelRef.current?.querySelector<HTMLButtonElement>(
      'button[data-diagnostics-primary]'
    );
    node?.focus();
  }, [open, phase]);

  useEffect(() => {
    if (!open) return;
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        clearArmTimer();
        setPhase('prompt');
        closeDiagnosticsPrompt();
      }
    };
    window.addEventListener('keydown', trap, true);
    return () => window.removeEventListener('keydown', trap, true);
  }, [open, closeDiagnosticsPrompt, clearArmTimer]);

  const close = useCallback(() => {
    clearArmTimer();
    setPhase('prompt');
    closeDiagnosticsPrompt();
  }, [clearArmTimer, closeDiagnosticsPrompt]);

  const arm = useCallback(() => {
    setPhase('arming');
    armTimerRef.current = window.setTimeout(() => {
      armTimerRef.current = null;
      setDebugMode(true);
      setPhase('prompt');
      closeDiagnosticsPrompt();
    }, DEV_TEST_AREA_ENABLE_DELAY_MS);
  }, [setDebugMode, closeDiagnosticsPrompt]);

  const cancelArm = useCallback(() => {
    clearArmTimer();
    setPhase('prompt');
    close();
  }, [clearArmTimer, close]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-base-300/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[min(340px,100%)] rounded-xl border border-base-300 bg-base-100 shadow-lg p-4 flex flex-col gap-3"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-sm font-semibold text-base-content m-0">
          {DIAGNOSTICS_SURFACE_TITLE}
        </h2>
        <p className="text-xs leading-relaxed text-base-content/80 m-0">
          {DIAGNOSTICS_SURFACE_DISCLAIMER}
        </p>
        {phase === 'arming' ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <DurationRadialRing
              key="arming"
              active
              durationMs={DEV_TEST_AREA_ENABLE_DELAY_MS}
              viewSize={28}
            />
            <button type="button" className="btn btn-sm btn-ghost w-full" onClick={cancelArm}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2 justify-end flex-wrap">
            <button type="button" className="btn btn-sm btn-ghost" onClick={close}>
              No
            </button>
            <button
              type="button"
              data-diagnostics-primary
              className="btn btn-sm btn-warning"
              onClick={arm}
            >
              Yes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
