import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_LAST_RENDER_ERROR,
  STORAGE_KEY_MERGED_PRS,
} from '@common/constants';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { isExtensionContext } from '@src/utils/is-extension-context';

const STACK_CHAR_CAP = 2000;
const COMPONENT_STACK_CHAR_CAP = 1000;

const PR_STORAGE_KEYS = [
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
] as const;

interface RenderErrorLogEntry {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: number;
  href: string;
  userAgent?: string;
}

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
  isResetting: boolean;
}

/**
 * Top-level React error boundary for the popup. Catches uncaught render errors anywhere below
 * <App />, persists a truncated diagnostic record to chrome.storage.local for support, and renders
 * a recovery panel so the user is not left staring at a blank popup.
 *
 * WHY [class component]: React only catches render errors in class components via
 * componentDidCatch / getDerivedStateFromError — there is no functional equivalent.
 *
 * WHY [reload as primary recovery]: the popup is a single-shot document that re-hydrates from
 * chrome.storage.local on every open. Reloading is the cheapest way to drop any in-memory state
 * that React Query, Zustand, or hooks might be holding in a half-broken shape.
 *
 * WHY [reset PR cache as escalation]: if the underlying cause is malformed cached PR data
 * (the most plausible regression path), clearing the three PR storage keys removes the input
 * the next render reads. The background will refetch on its next alarm tick and `usePrListsStorageSync`
 * will populate the popup once data lands.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, isResetting: false };

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // WHY [console first]: developers and Chrome Web Store reviewers see this in DevTools.
    // The chrome.storage write is fire-and-forget — log even if the storage write fails.
    console.error('[AppErrorBoundary] Render error caught:', error, info);
    void this.persistErrorLog(error, info);
  }

  private async persistErrorLog(error: unknown, info: ErrorInfo): Promise<void> {
    if (!isExtensionContext()) return;

    const entry: RenderErrorLogEntry = {
      message: error instanceof Error ? error.message : String(error),
      stack:
        error instanceof Error && typeof error.stack === 'string'
          ? error.stack.slice(0, STACK_CHAR_CAP)
          : undefined,
      componentStack:
        typeof info.componentStack === 'string'
          ? info.componentStack.slice(0, COMPONENT_STACK_CHAR_CAP)
          : undefined,
      timestamp: Date.now(),
      href: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    try {
      await chromeExtensionService.storage.local.set({ [STORAGE_KEY_LAST_RENDER_ERROR]: entry });
    } catch (storageError) {
      console.error('[AppErrorBoundary] Failed to persist error log:', storageError);
    }
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleResetPrCache = async (): Promise<void> => {
    if (this.state.isResetting) return;
    this.setState({ isResetting: true });

    if (isExtensionContext()) {
      try {
        await chromeExtensionService.storage.local.remove([...PR_STORAGE_KEYS]);
      } catch (resetError) {
        console.error('[AppErrorBoundary] Failed to clear PR cache:', resetError);
      }
    }
    // Reload regardless of clear outcome — the boundary's job is to get the user unstuck,
    // not to gate recovery on a storage write that may itself be the failure mode.
    this.handleReload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 bg-base-100">
        <div className="flex flex-col items-center gap-2 text-center">
          <ExclamationTriangleIcon className="size-8 text-warning" aria-hidden />
          <h1 className="text-sm font-semibold text-base-content">Pullwatch hit a snag</h1>
          <p className="text-xs text-base-content/70 leading-snug max-w-xs">
            Something went wrong while rendering the popup. Reloading usually fixes it. If it keeps
            happening, resetting the cached PR list will force a fresh fetch.
          </p>
          {this.state.errorMessage && (
            <p
              className="text-[10px] text-base-content/50 mt-1 max-w-xs wrap-break-word"
              data-testid="app-error-boundary-message"
            >
              {this.state.errorMessage}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={this.handleReload} className="btn btn-sm btn-primary">
            Reload popup
          </button>
          <button
            type="button"
            onClick={() => {
              void this.handleResetPrCache();
            }}
            disabled={this.state.isResetting}
            className="btn btn-sm btn-ghost"
          >
            {this.state.isResetting ? 'Resetting…' : 'Reset PR cache'}
          </button>
        </div>
      </div>
    );
  }
}
