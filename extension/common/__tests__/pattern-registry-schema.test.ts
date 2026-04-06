/// <reference types="vitest/globals" />
/**
 * Pattern registry schema validation tests.
 *
 * Organized as a narrative: each "chapter" covers one aspect of what
 * happens when the extension receives pattern data — from the happy path
 * to every category of invalid input we want to catch before it can
 * crash compilePatterns or poison runtime state.
 */

import { DEFAULT_PATTERNS } from '../default-patterns';
import {
  validateRemoteConfig,
  validatePatternRegistry,
  validateStoredPatternData,
} from '../pattern-registry-schema';
import {
  clone,
  cloneLoose,
  makeValidRemoteConfig,
  makeValidStoredData,
  makePatternEntry,
  makeRowSelector,
} from './schema-test-helpers';

// =====================================================================
// Chapter 1: The bundled defaults are always valid
// =====================================================================
// This is the "canary for the schema itself." If DEFAULT_PATTERNS
// changes shape and the schema doesn't follow, this test fails.

describe('Chapter 1: The bundled defaults are always valid', () => {
  it('DEFAULT_PATTERNS passes validatePatternRegistry', () => {
    const result = validatePatternRegistry(DEFAULT_PATTERNS);
    expect(result.success).toBe(true);
  });

  it('DEFAULT_PATTERNS wrapped as a remote config passes validateRemoteConfig', () => {
    const config = makeValidRemoteConfig();
    const result = validateRemoteConfig(config);
    expect(result.success).toBe(true);
  });

  it('rejects newExperience object missing resultsCount', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    delete patterns.newExperience.resultsCount;
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });

  it('DEFAULT_PATTERNS wrapped as stored data passes validateStoredPatternData', () => {
    const stored = makeValidStoredData();
    const result = validateStoredPatternData(stored);
    expect(result.success).toBe(true);
  });
});

// =====================================================================
// Chapter 2: A well-formed remote config is accepted
// =====================================================================

describe('Chapter 2: A well-formed remote config is accepted', () => {
  it('accepts a complete, valid remote config', () => {
    const config = makeValidRemoteConfig({ updatedAt: '2025-06-01T00:00:00Z' });
    const result = validateRemoteConfig(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.minExtensionVersion).toBe('1.0.0');
      expect(result.data.patterns.pageRecognition).toBeDefined();
    }
  });

  it('strips extra unknown fields without rejecting the config', () => {
    const config = { ...makeValidRemoteConfig(), surpriseField: 'hello', extraNumber: 42 };
    const result = validateRemoteConfig(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('surpriseField' in result.data).toBe(false);
    }
  });

  it('accepts updatedAt as optional (missing is fine)', () => {
    const config = cloneLoose(makeValidRemoteConfig());
    delete config.updatedAt;
    const result = validateRemoteConfig(config);
    expect(result.success).toBe(true);
  });
});

// =====================================================================
// Chapter 3: The remote envelope is validated
// =====================================================================
// These are top-level fields that the service reads before even looking
// at patterns: version for staleness, minExtensionVersion for compat.

describe('Chapter 3: The remote envelope is validated', () => {
  it('rejects when version is missing', () => {
    const config = cloneLoose(makeValidRemoteConfig());
    delete config.version;
    const result = validateRemoteConfig(config);
    expect(result.success).toBe(false);
  });

  it('rejects version as a string (JSON might produce "1" instead of 1)', () => {
    const config = cloneLoose(makeValidRemoteConfig());
    config.version = '1';
    const result = validateRemoteConfig(config);
    expect(result.success).toBe(false);
  });

  it('rejects version 0 (reserved as the local "no remote" sentinel)', () => {
    const config = cloneLoose(makeValidRemoteConfig());
    config.version = 0;
    const result = validateRemoteConfig(config);
    expect(result.success).toBe(false);
  });

  it('rejects negative version', () => {
    const config = cloneLoose(makeValidRemoteConfig());
    config.version = -1;
    const result = validateRemoteConfig(config);
    expect(result.success).toBe(false);
  });

  it('rejects fractional version', () => {
    const config = cloneLoose(makeValidRemoteConfig());
    config.version = 1.5;
    const result = validateRemoteConfig(config);
    expect(result.success).toBe(false);
  });

  it('rejects when minExtensionVersion is missing', () => {
    const config = cloneLoose(makeValidRemoteConfig());
    delete config.minExtensionVersion;
    const result = validateRemoteConfig(config);
    expect(result.success).toBe(false);
  });

  it('rejects when patterns is missing entirely', () => {
    const config = cloneLoose(makeValidRemoteConfig());
    delete config.patterns;
    const result = validateRemoteConfig(config);
    expect(result.success).toBe(false);
  });

  it('rejects when patterns is an empty object', () => {
    const config = cloneLoose(makeValidRemoteConfig());
    config.patterns = {};
    const result = validateRemoteConfig(config);
    expect(result.success).toBe(false);
  });
});

// =====================================================================
// Chapter 4: Missing nested structure is caught before compilation
// =====================================================================
// Today these would crash inside compilePatterns with an unhelpful
// "Cannot read properties of undefined" error. Schema validation
// catches them early with an actionable dotted path.

describe('Chapter 4: Missing nested structure is caught before compilation', () => {
  it('rejects when pageRecognition is missing', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    delete patterns.pageRecognition;
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('pageRecognition');
    }
  });

  it('rejects when pageRecognition.hasPRContent is missing', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    delete patterns.pageRecognition.hasPRContent;
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });

  it('rejects when assigneeAvatar.avatarImg is missing', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    delete patterns.assigneeAvatar.avatarImg;
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });

  it('rejects when prRowFallback is missing', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    delete patterns.prRowFallback;
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });

  it('rejects when prNumber is missing', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    delete patterns.prNumber;
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });

  it('rejects when repoName is missing', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    delete patterns.repoName;
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });
});

// =====================================================================
// Chapter 5: Pattern entries are validated strictly
// =====================================================================
// Each PatternEntry must have string regex + flags. CaptureGroups,
// when present, must map to positive integers (1-based group indices).

describe('Chapter 5: Pattern entries are validated strictly', () => {
  it('rejects regex as a number', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    patterns.pageRecognition.hasPRContent.regex = 123;
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });

  it('rejects flags as null', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    patterns.pageRecognition.hasPRContent.flags = null;
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });

  it('rejects captureGroups with index 0 (0 is the full match, not a named group)', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    patterns.prLink[0].captureGroups = { url: 0 };
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });

  it('rejects captureGroups with negative index', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    patterns.prLink[0].captureGroups = { url: -1 };
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });

  it('rejects captureGroups with fractional index', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    patterns.prLink[0].captureGroups = { url: 1.5 };
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });

  it('accepts captureGroups as omitted (optional field)', () => {
    const patterns = clone(DEFAULT_PATTERNS);
    delete patterns.pageRecognition.hasPRContent.captureGroups;
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(true);
  });

  it('accepts a minimal PatternEntry with just regex and flags', () => {
    const patterns = clone(DEFAULT_PATTERNS);
    patterns.repoName = makePatternEntry();
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(true);
  });
});

// =====================================================================
// Chapter 6: Discriminated unions are enforced
// =====================================================================
// The parser dispatches on PrRowSelector.type and PatternTypeEntry.type.
// An unrecognized value would silently skip extraction.

describe('Chapter 6: Discriminated unions are enforced', () => {
  it('rejects prRowSelectors[0].type = "xpath" (not in the union)', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    patterns.prRowSelectors[0].type = 'xpath';
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });

  it('rejects prType[0].type = "closed" (not in the union)', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    patterns.prType[0].type = 'closed';
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
  });

  it('accepts all valid prRowSelector types', () => {
    const validTypes = ['class', 'attribute', 'balanced-div'] as const;
    for (const type of validTypes) {
      const patterns = clone(DEFAULT_PATTERNS);
      patterns.prRowSelectors = [makeRowSelector({ type })];
      const result = validatePatternRegistry(patterns);
      expect(result.success, `type "${type}" should be accepted`).toBe(true);
    }
  });

  it('accepts all valid prType types', () => {
    const validTypes = ['draft', 'open', 'merged'] as const;
    for (const type of validTypes) {
      const patterns = clone(DEFAULT_PATTERNS);
      patterns.prType = [{ type, pattern: makePatternEntry() }];
      const result = validatePatternRegistry(patterns);
      expect(result.success, `type "${type}" should be accepted`).toBe(true);
    }
  });
});

// =====================================================================
// Chapter 7: Empty arrays are rejected
// =====================================================================
// The parser tries entries in order and stops at the first hit.
// An empty array means "nothing can ever match" — that's a config bug.

describe('Chapter 7: Empty arrays are rejected', () => {
  const arrayFields = [
    'prRowSelectors',
    'prLink',
    'author',
    'timestamp',
    'prType',
  ] as const;

  for (const field of arrayFields) {
    it(`rejects empty ${field}`, () => {
      const patterns = cloneLoose(DEFAULT_PATTERNS);
      patterns[field] = [];
      const result = validatePatternRegistry(patterns);
      expect(result.success).toBe(false);
    });
  }
});

// =====================================================================
// Chapter 8: Stored pattern data wrapper
// =====================================================================
// chrome.storage.local can be corrupted by bugs, other extensions, or
// manual edits. The wrapper fields (version, timestamp) must also be
// validated — corrupted values poison the staleness and version logic.

describe('Chapter 8: Stored pattern data wrapper', () => {
  it('accepts valid stored data', () => {
    const stored = makeValidStoredData();
    const result = validateStoredPatternData(stored);
    expect(result.success).toBe(true);
  });

  it('accepts version 0 (initial persist of bundled defaults)', () => {
    const stored = cloneLoose(makeValidStoredData());
    stored.version = 0;
    const result = validateStoredPatternData(stored);
    expect(result.success).toBe(true);
  });

  it('rejects version as a string', () => {
    const stored = cloneLoose(makeValidStoredData());
    stored.version = 'abc';
    const result = validateStoredPatternData(stored);
    expect(result.success).toBe(false);
  });

  it('rejects negative version', () => {
    const stored = cloneLoose(makeValidStoredData());
    stored.version = -1;
    const result = validateStoredPatternData(stored);
    expect(result.success).toBe(false);
  });

  it('rejects negative timestamp', () => {
    const stored = cloneLoose(makeValidStoredData());
    stored.timestamp = -1;
    const result = validateStoredPatternData(stored);
    expect(result.success).toBe(false);
  });

  it('rejects timestamp as a string', () => {
    const stored = cloneLoose(makeValidStoredData());
    stored.timestamp = 'yesterday';
    const result = validateStoredPatternData(stored);
    expect(result.success).toBe(false);
  });

  it('rejects valid wrapper with invalid nested patterns', () => {
    const stored = cloneLoose(makeValidStoredData());
    stored.patterns = { pageRecognition: 'not an object' };
    const result = validateStoredPatternData(stored);
    expect(result.success).toBe(false);
  });

  it('rejects when patterns is missing', () => {
    const stored = cloneLoose(makeValidStoredData());
    delete stored.patterns;
    const result = validateStoredPatternData(stored);
    expect(result.success).toBe(false);
  });
});

// =====================================================================
// Chapter 9: Error messages are actionable
// =====================================================================
// When validation fails, the message should include a dotted path so
// developers know exactly where to look in the JSON.

describe('Chapter 9: Error messages are actionable', () => {
  it('includes the dotted path to the failing field', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    patterns.pageRecognition.hasPRContent.regex = 123;
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toMatch(/pageRecognition\.hasPRContent\.regex/);
    }
  });

  it('includes the path for deeply nested assigneeAvatar fields', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    patterns.assigneeAvatar.loginFromAria.flags = 42;
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toMatch(/assigneeAvatar\.loginFromAria\.flags/);
    }
  });

  it('includes the path for array element failures', () => {
    const patterns = cloneLoose(DEFAULT_PATTERNS);
    patterns.prRowSelectors[0].type = 'xpath';
    const result = validatePatternRegistry(patterns);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toMatch(/prRowSelectors/);
    }
  });

  it('caps the number of issues reported to keep log lines readable', () => {
    const result = validateRemoteConfig({
      version: 'bad',
      minExtensionVersion: 123,
      patterns: 'not an object',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const semicolons = result.message.split(';').length - 1;
      // MAX_REPORTED_ISSUES is 3, so at most 3 items + "... and N more"
      expect(semicolons).toBeLessThanOrEqual(3);
    }
  });
});
