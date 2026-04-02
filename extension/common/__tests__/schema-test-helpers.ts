/**
 * Shared helpers for pattern registry tests.
 *
 * - Factories return fresh deep clones so tests can freely mutate
 *   objects without cross-contamination between test cases.
 * - fetchWithRetry provides resilient HTTP fetching for the remote
 *   smoke test (retries transient 5xx / timeouts, fails fast on 4xx).
 */

import { DEFAULT_PATTERNS } from '../default-patterns';
import { REMOTE_FETCH_TIMEOUT_MS } from '../constants';
import type { PatternEntry, PrRowSelector } from '../pattern-types';

// ── Deep clone ──────────────────────────────────────────────────────

/** JSON round-trip clone — safe for our plain-data objects. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Clone an object and return it as a loose record so tests can delete
 * fields or assign invalid values without fighting the type checker.
 * Intentionally untyped — this is a test-only escape hatch.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cloneLoose(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

// ── Factory: RemotePatternConfig ────────────────────────────────────

interface RemoteConfigOverrides {
  version?: number;
  minExtensionVersion?: string;
  updatedAt?: string;
  patterns?: unknown;
}

/**
 * Builds a valid RemotePatternConfig wrapping DEFAULT_PATTERNS.
 * Pass overrides to replace individual top-level fields for negative tests.
 */
export function makeValidRemoteConfig(overrides?: RemoteConfigOverrides) {
  return {
    version: 1,
    minExtensionVersion: '1.0.0',
    patterns: clone(DEFAULT_PATTERNS),
    ...overrides,
  };
}

// ── Factory: StoredPatternData ──────────────────────────────────────

interface StoredDataOverrides {
  version?: number;
  timestamp?: number;
  patterns?: unknown;
}

/**
 * Builds a valid StoredPatternData wrapping DEFAULT_PATTERNS.
 * Mirrors what PatternRegistryService.persistToStorage writes.
 */
export function makeValidStoredData(overrides?: StoredDataOverrides) {
  return {
    patterns: clone(DEFAULT_PATTERNS),
    version: 1,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ── Factory: PatternEntry ───────────────────────────────────────────

/** Builds a minimal valid PatternEntry for single-field tests. */
export function makePatternEntry(overrides?: Partial<PatternEntry>): PatternEntry {
  return {
    regex: 'test-pattern',
    flags: 'i',
    ...overrides,
  };
}

// ── Factory: PrRowSelector ──────────────────────────────────────────

/** Builds a minimal valid PrRowSelector. */
export function makeRowSelector(overrides?: Partial<PrRowSelector>): PrRowSelector {
  return {
    name: 'test-selector',
    type: 'class',
    value: 'test-class',
    regex: '<div class="test">',
    flags: 'gi',
    ...overrides,
  };
}

// ── Resilient HTTP fetch ────────────────────────────────────────────
// Used by the remote smoke test. Transient failures (5xx, timeouts,
// network errors) are retried with exponential backoff. Permanent
// client errors (4xx) fail immediately — retrying a 404 or 403 is
// pointless and wastes CI minutes.

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;

function isTransient(status: number): boolean {
  return status >= 500 && status < 600;
}

export async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
      });

      if (response.ok) return response;

      if (!isTransient(response.status)) {
        throw new Error(
          `Permanent HTTP error ${response.status} ${response.statusText} — not retrying`,
        );
      }

      lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
    } catch (error) {
      // AbortSignal.timeout throws a DOMException with name "TimeoutError".
      // Network failures throw TypeError. Both are transient.
      if (
        error instanceof Error &&
        error.message.startsWith('Permanent HTTP error')
      ) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt < MAX_RETRIES) {
      const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw new Error(
    `Failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastError?.message}`,
  );
}
