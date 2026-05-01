import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { MinigameSessionCheckpoint } from '@common/types';
import type { FinishCelebration, FinishedRoundSummary, GameMode } from './game-types';
import { applyPopupSizePresetToDocument, usePopupSize } from '@src/hooks/use-popup-size';
import {
  useMinigameDiscovery,
  type UseMinigameDiscoveryResult,
} from './hooks/use-minigame-discovery';
import { useRecordRoundResult } from './hooks/use-record-round-result';
import { ensureCompleteMinigameStats } from './storage/minigame-stats-defaults';
import { readMinigameStats, writeMinigameStats } from './storage/minigame-stats-storage';
import {
  clearSessionCheckpoint,
  readSessionCheckpoint,
  writeSessionCheckpoint,
} from './storage/session-checkpoint-storage';
import { applyMinigameSessionPopupDimensions } from './minigame-popup-session-size';
import { SquashQuickStartBoard } from './quick-start/squash-quick-start-board';
import { SquashMinigameLoadingScreen } from './squash-minigame-loading-screen';
import { SquashMinigameLazy } from './squash-minigame.lazy';
import { PausedOverlay } from './components/paused-overlay';
import {
  popupResizeFallbackTimeoutMs,
  waitForPopupShellResizeComplete,
} from './wait-popup-shell-resize';

type SessionState =
  | null
  /** Same warm-up as `loading` (spinner + resize + shell chunk) before first-time quick start. */
  | { stage: 'intro_loading' }
  | { stage: 'intro' }
  | { stage: 'loading'; mode: GameMode; checkpoint?: MinigameSessionCheckpoint }
  | { stage: 'game'; mode: GameMode; checkpoint?: MinigameSessionCheckpoint }
  /** Popup re-opened with a saved checkpoint; PausedOverlay shown with Resume / Discard. */
  | { stage: 'paused'; checkpoint: MinigameSessionCheckpoint }
  | { stage: 'closing' };

export type SquashMinigameExperienceValue = UseMinigameDiscoveryResult & {
  openSquashGame: (mode: GameMode) => void;
  /** Header Play path: optional one-time quick-start before {@link openSquashGame}. */
  beginSquashFromHeaderCta: () => void;
};

const SquashMinigameExperienceContext = createContext<SquashMinigameExperienceValue | null>(null);

export function useSquashMinigameExperience(): SquashMinigameExperienceValue {
  const ctx = useContext(SquashMinigameExperienceContext);
  if (!ctx) {
    throw new Error(
      'useSquashMinigameExperience must be used within SquashMinigameExperienceProvider'
    );
  }
  return ctx;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function waitTwoAnimationFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function SquashMinigameExperienceProvider({ children }: { children: ReactNode }) {
  const discovery = useMinigameDiscovery();
  const { presetId } = usePopupSize();
  const [session, setSession] = useState<SessionState>(null);
  /** Bumps React `key` on `SquashMinigameLazy` when the overlay picks the same mode again. */
  const [gameMountKey, setGameMountKey] = useState(0);
  const [finishCelebration, setFinishCelebration] = useState<FinishCelebration | null>(null);
  const sessionRef = useRef<SessionState>(null);
  sessionRef.current = session;
  const recordRound = useRecordRoundResult();

  useEffect(() => {
    if (session === null || session.stage !== 'game') {
      setGameMountKey(0);
    }
  }, [session]);

  const closeSquashGame = useCallback(() => {
    setFinishCelebration(null);
    setSession((s) => {
      if (!s || s.stage === 'closing') return s;
      return { stage: 'closing' };
    });
  }, []);

  const openSquashGame = useCallback((mode: GameMode) => {
    setSession({ stage: 'loading', mode });
  }, []);

  const beginSquashFromHeaderCta = useCallback(() => {
    const live = discovery.stats;
    if (!live) {
      openSquashGame('standard');
      return;
    }
    if (!live.hasSeenSquashQuickStart) {
      setSession({ stage: 'intro_loading' });
      return;
    }
    openSquashGame(live.lastPlayedMode ?? 'standard');
  }, [discovery.stats, openSquashGame]);

  const handleQuickStartConfirm = useCallback(
    async (mode: GameMode) => {
      const stored = await readMinigameStats();
      const live = discovery.stats;
      const next = ensureCompleteMinigameStats({
        ...stored,
        ...(live ? { ...live } : {}),
        hasSeenSquashQuickStart: true,
      });
      try {
        await writeMinigameStats(next);
      } catch {
        /* same as discoverMinigame: do not block starting after a failed write */
      }
      // Shell chunk was prefetched during `intro_loading`; go straight into the round.
      setSession({ stage: 'game', mode });
    },
    [discovery.stats]
  );

  const handleFinish = useCallback(
    (summary: FinishedRoundSummary) => {
      void recordRound(summary).then((meta) => {
        if (meta) {
          setFinishCelebration({
            roundId: summary.roundId,
            isNewHighScore: meta.isNewHighScore,
            previousHighScore: meta.previousHighScore,
          });
        }
      });
    },
    [recordRound]
  );

  const handleGameChangeMode = useCallback((nextMode: GameMode) => {
    const s = sessionRef.current;
    if (!s || s.stage !== 'game') return;
    if (s.mode === nextMode) {
      setGameMountKey((k) => k + 1);
    } else {
      setSession({ stage: 'game', mode: nextMode });
    }
  }, []);

  const loadingToken = session?.stage === 'loading' ? session.mode : null;
  const introLoadingActive = session?.stage === 'intro_loading';

  useEffect(() => {
    if (!introLoadingActive) return;
    let cancelled = false;

    applyMinigameSessionPopupDimensions();
    const chunkPromise = import('./squash-minigame-shell');
    const resizePromise = prefersReducedMotion()
      ? waitTwoAnimationFrames()
      : waitForPopupShellResizeComplete(document.documentElement, popupResizeFallbackTimeoutMs());

    void Promise.all([resizePromise, chunkPromise]).then(() => {
      if (cancelled) return;
      setSession((prev) => {
        if (!prev || prev.stage !== 'intro_loading') return prev;
        return { stage: 'intro' };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [introLoadingActive]);

  // WHY [parallel Promise.all]: chunk download runs during the CSS resize animation so the gate
  // hides combined latency; the board mounts only after both complete so layout matches final vars.
  useEffect(() => {
    if (loadingToken === null) return;
    const mode = loadingToken;
    let cancelled = false;

    applyMinigameSessionPopupDimensions();
    const chunkPromise = import('./squash-minigame-shell');
    const resizePromise = prefersReducedMotion()
      ? waitTwoAnimationFrames()
      : waitForPopupShellResizeComplete(document.documentElement, popupResizeFallbackTimeoutMs());

    void Promise.all([resizePromise, chunkPromise]).then(() => {
      if (cancelled) return;
      setSession((prev) => {
        if (!prev || prev.stage !== 'loading' || prev.mode !== mode) return prev;
        return { stage: 'game', mode, checkpoint: prev.checkpoint };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [loadingToken]);

  // ── Checkpoint hydration on mount ───────────────────────────────────────────
  /**
   * WHY [mount-only]: this runs once when the provider mounts (popup open). If a checkpoint
   * exists, we show the paused overlay instead of the normal PR list. If the user explicitly
   * opened a game via a launcher, that takes precedence (`session !== null` guard).
   */
  const [checkpointChecked, setCheckpointChecked] = useState(false);
  useEffect(() => {
    if (checkpointChecked) return;
    let cancelled = false;
    void readSessionCheckpoint().then((cp) => {
      if (cancelled) return;
      setCheckpointChecked(true);
      if (cp && cp.timeRemainingMs > 0) {
        setSession((prev) => {
          // Don't overwrite an active session the user launched explicitly.
          if (prev !== null) return prev;
          return { stage: 'paused', checkpoint: cp };
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [checkpointChecked]);

  const handleResume = useCallback(() => {
    setSession((prev) => {
      if (!prev || prev.stage !== 'paused') return prev;
      return { stage: 'loading', mode: prev.checkpoint.mode, checkpoint: prev.checkpoint };
    });
  }, []);

  const handleDiscard = useCallback(() => {
    void clearSessionCheckpoint();
    setSession(null);
  }, []);

  const handleSaveCheckpoint = useCallback((cp: MinigameSessionCheckpoint) => {
    void writeSessionCheckpoint(cp);
  }, []);

  const handleClearCheckpoint = useCallback(() => {
    void clearSessionCheckpoint();
  }, []);

  useEffect(() => {
    if (!session || session.stage !== 'closing') return;
    let cancelled = false;
    applyPopupSizePresetToDocument(presetId);
    const resizePromise = prefersReducedMotion()
      ? waitTwoAnimationFrames()
      : waitForPopupShellResizeComplete(document.documentElement, popupResizeFallbackTimeoutMs());

    void resizePromise.then(() => {
      if (!cancelled) setSession(null);
    });

    return () => {
      cancelled = true;
    };
  }, [session, presetId]);

  useEffect(() => {
    if (session === null) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    // WHY [html + body]: matches extension shell scroll; lock prevents PR lists scrolling under the portal.
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [session !== null]);

  const value: SquashMinigameExperienceValue = {
    ...discovery,
    openSquashGame,
    beginSquashFromHeaderCta,
  };

  const portal =
    session !== null ? (
      <div
        className="fixed inset-0 z-60 flex min-h-0 flex-col overflow-hidden bg-base-200"
        role="presentation"
        data-testid="squash-minigame-overlay-root"
      >
        {session.stage === 'intro_loading' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <SquashMinigameLoadingScreen />
          </div>
        ) : null}
        {session.stage === 'intro' ? (
          <SquashQuickStartBoard
            lastPlayedMode={discovery.stats?.lastPlayedMode}
            onClose={closeSquashGame}
            onStart={(mode) => {
              void handleQuickStartConfirm(mode);
            }}
          />
        ) : null}
        {session.stage === 'paused' ? (
          <PausedOverlay
            checkpoint={session.checkpoint}
            onResume={handleResume}
            onDiscard={handleDiscard}
          />
        ) : null}
        {session.stage === 'loading' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <SquashMinigameLoadingScreen />
          </div>
        ) : null}
        {session.stage === 'game' ? (
          <Suspense
            fallback={
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <SquashMinigameLoadingScreen />
              </div>
            }
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <SquashMinigameLazy
                key={`${session.mode}-${gameMountKey}`}
                mode={session.mode}
                onExit={closeSquashGame}
                onFinish={handleFinish}
                onChangeMode={handleGameChangeMode}
                checkpoint={session.checkpoint}
                onSaveCheckpoint={handleSaveCheckpoint}
                onClearCheckpoint={handleClearCheckpoint}
                finishCelebration={finishCelebration}
              />
            </div>
          </Suspense>
        ) : null}
        {session.stage === 'closing' ? (
          <div
            className="absolute inset-0 bg-base-200"
            aria-hidden
            data-testid="squash-minigame-overlay-closing"
          />
        ) : null}
      </div>
    ) : null;

  return (
    <SquashMinigameExperienceContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && portal ? createPortal(portal, document.body) : null}
    </SquashMinigameExperienceContext.Provider>
  );
}
