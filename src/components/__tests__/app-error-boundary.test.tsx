import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_LAST_RENDER_ERROR,
  STORAGE_KEY_MERGED_PRS,
} from '@common/constants';

const storageSet = vi.fn().mockResolvedValue(undefined);
const storageRemove = vi.fn().mockResolvedValue(undefined);
const reload = vi.fn();

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    storage: {
      local: {
        set: (...args: unknown[]) => storageSet(...args),
        remove: (...args: unknown[]) => storageRemove(...args),
      },
    },
  },
}));

vi.mock('@src/utils/is-extension-context', () => ({
  isExtensionContext: () => true,
}));

import { AppErrorBoundary } from '../app-error-boundary';

const Boom = (): ReactElement => {
  throw new Error('boom');
};

describe('AppErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    storageSet.mockClear();
    storageRemove.mockClear();
    reload.mockClear();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload, href: 'chrome-extension://test/index.html' },
      writable: true,
    });
    // React intentionally logs the caught error to console.error in dev — silence it for the test
    // run so passing assertions are not buried under a noisy stack trace.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
  });

  it('renders children when no error is thrown', () => {
    render(
      <AppErrorBoundary>
        <div data-testid="child">ok</div>
      </AppErrorBoundary>
    );
    expect(screen.getByTestId('child').textContent).toBe('ok');
  });

  it('renders the recovery panel when a child throws', () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>
    );
    expect(screen.getByText('Pullwatch hit a snag')).toBeTruthy();
    expect(screen.getByTestId('app-error-boundary-message').textContent).toBe('boom');
    expect(screen.getByRole('button', { name: 'Reload popup' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset PR cache' })).toBeTruthy();
  });

  it('persists a truncated error log to chrome.storage.local', () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>
    );
    expect(storageSet).toHaveBeenCalledTimes(1);
    const arg = storageSet.mock.calls[0][0] as Record<string, unknown>;
    const entry = arg[STORAGE_KEY_LAST_RENDER_ERROR] as {
      message: string;
      timestamp: number;
      href: string;
    };
    expect(entry.message).toBe('boom');
    expect(typeof entry.timestamp).toBe('number');
    expect(entry.href).toContain('chrome-extension://');
  });

  it('Reload popup button calls window.location.reload', () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload popup' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('Reset PR cache button removes the three PR storage keys then reloads', async () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset PR cache' }));
    // remove() is awaited inside the handler before reload
    await Promise.resolve();
    await Promise.resolve();
    expect(storageRemove).toHaveBeenCalledTimes(1);
    const removed = storageRemove.mock.calls[0][0] as string[];
    expect(removed).toEqual(
      expect.arrayContaining([
        STORAGE_KEY_ASSIGNED_PRS,
        STORAGE_KEY_MERGED_PRS,
        STORAGE_KEY_AUTHORED_PRS,
      ])
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
