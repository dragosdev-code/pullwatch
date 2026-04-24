/**
 * Runtime schema validation for the pattern registry.
 *
 * TypeScript types vanish at runtime, so JSON from the remote config host
 * or chrome.storage.local is trusted on faith alone. This module defines
 * Valibot schemas that mirror the interfaces in pattern-types.ts and
 * provides validate functions that return typed, discriminated results.
 *
 * Validation runs *before* compilePatterns (safeCompile), which remains as
 * a second defense layer for invalid RegExp syntax that structural
 * validation cannot catch.
 *
 * Valibot: tree-shakeable runtime schema validation (~1 KB for this use
 * case vs ~4 KB+ for Zod v4). Only the validators we import are bundled.
 */

import * as v from 'valibot';
import type { PatternRegistry } from './pattern-types';

// ── Leaf schemas ────────────────────────────────────────────────────

const PatternEntrySchema = v.object({
  description: v.optional(v.string()),
  regex: v.string(),
  flags: v.string(),
  // captureGroups maps human-readable names to 1-based RegExp group indices.
  // Optional because many patterns (e.g. pageRecognition) don't use named groups.
  captureGroups: v.optional(
    v.record(
      v.string(),
      // Group index 0 is "the full match" — never correct for a named capture group.
      v.pipe(v.number(), v.integer(), v.minValue(1)),
    ),
  ),
});

const PrRowSelectorSchema = v.object({
  name: v.string(),
  // Discriminator that controls how GitHubHTMLParser applies the regex.
  type: v.picklist(['class', 'attribute', 'balanced-div']),
  value: v.string(),
  regex: v.string(),
  flags: v.string(),
});

const PatternTypeEntrySchema = v.object({
  type: v.picklist(['draft', 'open', 'merged']),
  pattern: PatternEntrySchema,
});

// ── New-experience patterns (optional block) ────────────────────────

const NewExperiencePatternsSchema = v.object({
  pageMarker: PatternEntrySchema,
  resultsCount: PatternEntrySchema,
  rowSelector: PatternEntrySchema,
  titleLink: PatternEntrySchema,
  repoName: PatternEntrySchema,
  prNumber: PatternEntrySchema,
  author: PatternEntrySchema,
  timestamp: v.pipe(v.array(PatternEntrySchema), v.minLength(1)),
  prType: v.pipe(v.array(PatternTypeEntrySchema), v.minLength(1)),
});

// ── Composite: full PatternRegistry ─────────────────────────────────

export const PatternRegistrySchema = v.object({
  pageRecognition: v.object({
    hasPRContent: PatternEntrySchema,
    knownSelectors: PatternEntrySchema,
    emptyState: PatternEntrySchema,
    noResults: PatternEntrySchema,
  }),
  // The parser tries selectors in order — first match wins.
  // An empty array would mean "can never find PR rows."
  prRowSelectors: v.pipe(v.array(PrRowSelectorSchema), v.minLength(1)),
  prRowFallback: v.object({
    linkScan: PatternEntrySchema,
    containerExtract: PatternEntrySchema,
  }),
  prLink: v.pipe(v.array(PatternEntrySchema), v.minLength(1)),
  prNumber: v.object({
    fromUrl: PatternEntrySchema,
    fromElement: PatternEntrySchema,
  }),
  repoName: PatternEntrySchema,
  author: v.pipe(v.array(PatternEntrySchema), v.minLength(1)),
  assigneeAvatar: v.object({
    stackContainer: PatternEntrySchema,
    closeTag: PatternEntrySchema,
    anchorSelector: PatternEntrySchema,
    hrefExtract: PatternEntrySchema,
    loginFromHrefEncoded: PatternEntrySchema,
    loginFromHrefPlain: PatternEntrySchema,
    loginFromAlt: PatternEntrySchema,
    loginFromAria: PatternEntrySchema,
    avatarImg: PatternEntrySchema,
  }),
  timestamp: v.pipe(v.array(PatternEntrySchema), v.minLength(1)),
  prType: v.pipe(v.array(PatternTypeEntrySchema), v.minLength(1)),
  viewerLogin: v.pipe(v.array(PatternEntrySchema), v.minLength(1)),
  // Optional — absent in remote configs published before the new-experience parser shipped.
  newExperience: v.optional(NewExperiencePatternsSchema),
});

// ── Wrapper schemas ─────────────────────────────────────────────────

export const RemotePatternConfigSchema = v.object({
  // Version 0 is the local sentinel for "no remote version loaded yet" —
  // a remote config must always be >= 1.
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  // Required — controls min-extension-version gating via isVersionAtLeast().
  minExtensionVersion: v.string(),
  updatedAt: v.optional(v.string()),
  patterns: PatternRegistrySchema,
});

// Validates the full chrome.storage.local envelope, not just patterns —
// corrupted version/timestamp would poison the staleness check
// (Date.now() - NaN → NaN) and version comparison (NaN <= N → false).
export const StoredPatternDataSchema = v.object({
  patterns: PatternRegistrySchema,
  // Version 0 is valid in storage — it represents the initial persist of bundled defaults.
  version: v.pipe(v.number(), v.integer(), v.minValue(0)),
  timestamp: v.pipe(v.number(), v.minValue(0)),
});

// ── Exported types (single source of truth) ─────────────────────────

export type RemotePatternConfig = v.InferOutput<typeof RemotePatternConfigSchema>;
export type StoredPatternData = v.InferOutput<typeof StoredPatternDataSchema>;

// Forward-direction type guard: the schema output must be assignable to
// the hand-written PatternRegistry interface. If they drift, the callers
// that pass validated data to compilePatterns(registry: PatternRegistry)
// would get a type error — this guard surfaces it at the definition site.
type _SchemaOutput = v.InferOutput<typeof PatternRegistrySchema>;
/** Compile-time guard: schema output must stay assignable to {@link PatternRegistry}. */
type _AssertExtendsTrue<T extends true> = T;
type _RegistrySchemaCoversInterface = _AssertExtendsTrue<
  _SchemaOutput extends PatternRegistry ? true : false
>;
/** Compile-time witness only — schema output must stay assignable to {@link PatternRegistry}. */
export type CompileTimePatternRegistrySchemaMatchesInterface = _RegistrySchemaCoversInterface;

// ── Validation result ───────────────────────────────────────────────

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

// Cap displayed issues to keep log lines actionable — the first few
// are usually enough to diagnose the problem.
const MAX_REPORTED_ISSUES = 3;

function formatIssues(issues: v.BaseIssue<unknown>[]): string {
  const formatted = issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => {
    const path = issue.path?.map((p) => p.key).join('.') ?? '(root)';
    return `${path}: ${issue.message}`;
  });
  if (issues.length > MAX_REPORTED_ISSUES) {
    formatted.push(`... and ${issues.length - MAX_REPORTED_ISSUES} more`);
  }
  return formatted.join('; ');
}

// ── Public API ──────────────────────────────────────────────────────

export function validateRemoteConfig(data: unknown): ValidationResult<RemotePatternConfig> {
  const result = v.safeParse(RemotePatternConfigSchema, data);
  if (result.success) return { success: true, data: result.output };
  return { success: false, message: formatIssues(result.issues) };
}

export function validatePatternRegistry(data: unknown): ValidationResult<PatternRegistry> {
  const result = v.safeParse(PatternRegistrySchema, data);
  if (result.success) return { success: true, data: result.output };
  return { success: false, message: formatIssues(result.issues) };
}

export function validateStoredPatternData(data: unknown): ValidationResult<StoredPatternData> {
  const result = v.safeParse(StoredPatternDataSchema, data);
  if (result.success) return { success: true, data: result.output };
  return { success: false, message: formatIssues(result.issues) };
}
