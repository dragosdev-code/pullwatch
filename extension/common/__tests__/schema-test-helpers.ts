/**
 * Factory functions for pattern registry schema tests.
 *
 * Each factory returns a fresh deep clone so tests can freely mutate
 * objects without cross-contamination between test cases.
 */

import { DEFAULT_PATTERNS } from '../default-patterns';
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
