/** Serializable regex pattern entry (JSON-safe for remote config). */
export interface PatternEntry {
  regex: string;
  flags: string;
  captureGroups?: Record<string, number>;
}

/** PR row selector with extraction-strategy discriminator. */
export interface PrRowSelector {
  name: string;
  /**
   * 'class'        — regex matchAll against the full HTML
   * 'attribute'    — regex matchAll against the full HTML
   * 'balanced-div' — balanced tag extraction using the regex as the opening-tag finder
   */
  type: 'class' | 'attribute' | 'balanced-div';
  value: string;
  regex: string;
  flags: string;
}

/** Ordered PR-type detection entry — first match wins. */
export interface PatternTypeEntry {
  type: 'draft' | 'open' | 'merged';
  pattern: PatternEntry;
}

/**
 * Patterns for GitHub's new React-based pulls dashboard (CSS Modules DOM).
 * Kept separate from the legacy patterns so a remote config update to one
 * parser cannot accidentally break the other.
 */
export interface NewExperiencePatterns {
  pageMarker: PatternEntry;
  /** `data-testid="results-count"` — advertised list size; multiline-safe regex. */
  resultsCount: PatternEntry;
  rowSelector: PatternEntry;
  titleLink: PatternEntry;
  repoName: PatternEntry;
  prNumber: PatternEntry;
  author: PatternEntry;
  timestamp: PatternEntry[];
  prType: PatternTypeEntry[];
}

/** Full set of patterns needed by GitHubHTMLParser (serializable). */
export interface PatternRegistry {
  pageRecognition: {
    hasPRContent: PatternEntry;
    knownSelectors: PatternEntry;
    emptyState: PatternEntry;
    noResults: PatternEntry;
  };
  prRowSelectors: PrRowSelector[];
  prRowFallback: {
    linkScan: PatternEntry;
    containerExtract: PatternEntry;
  };
  prLink: PatternEntry[];
  prNumber: {
    fromUrl: PatternEntry;
    fromElement: PatternEntry;
  };
  repoName: PatternEntry;
  author: PatternEntry[];
  assigneeAvatar: {
    stackContainer: PatternEntry;
    closeTag: PatternEntry;
    anchorSelector: PatternEntry;
    hrefExtract: PatternEntry;
    loginFromHrefEncoded: PatternEntry;
    loginFromHrefPlain: PatternEntry;
    loginFromAlt: PatternEntry;
    loginFromAria: PatternEntry;
    avatarImg: PatternEntry;
  };
  timestamp: PatternEntry[];
  prType: PatternTypeEntry[];
  /** Optional — absent in remote configs published before the new-experience parser shipped. */
  newExperience?: NewExperiencePatterns;
}

// ── Compiled (runtime-ready) counterparts ────────────────────────────

export interface CompiledPattern {
  compiled: RegExp;
  captureGroups?: Record<string, number>;
}

export interface CompiledPrRowSelector {
  name: string;
  type: 'class' | 'attribute' | 'balanced-div';
  value: string;
  compiled: RegExp;
}

export interface CompiledPatternTypeEntry {
  type: 'draft' | 'open' | 'merged';
  compiled: RegExp;
}

/** Compiled counterpart of {@link NewExperiencePatterns}. */
export interface CompiledNewExperiencePatterns {
  pageMarker: CompiledPattern;
  resultsCount: CompiledPattern;
  rowSelector: CompiledPattern;
  titleLink: CompiledPattern;
  repoName: CompiledPattern;
  prNumber: CompiledPattern;
  author: CompiledPattern;
  timestamp: CompiledPattern[];
  prType: CompiledPatternTypeEntry[];
}

/** Runtime-ready compiled patterns consumed by GitHubHTMLParser. */
export interface CompiledPatterns {
  pageRecognition: {
    hasPRContent: CompiledPattern;
    knownSelectors: CompiledPattern;
    emptyState: CompiledPattern;
    noResults: CompiledPattern;
  };
  prRowSelectors: CompiledPrRowSelector[];
  prRowFallback: {
    linkScan: CompiledPattern;
    containerExtract: CompiledPattern;
  };
  prLink: CompiledPattern[];
  prNumber: {
    fromUrl: CompiledPattern;
    fromElement: CompiledPattern;
  };
  repoName: CompiledPattern;
  author: CompiledPattern[];
  assigneeAvatar: {
    stackContainer: CompiledPattern;
    closeTag: CompiledPattern;
    anchorSelector: CompiledPattern;
    hrefExtract: CompiledPattern;
    loginFromHrefEncoded: CompiledPattern;
    loginFromHrefPlain: CompiledPattern;
    loginFromAlt: CompiledPattern;
    loginFromAria: CompiledPattern;
    avatarImg: CompiledPattern;
  };
  timestamp: CompiledPattern[];
  prType: CompiledPatternTypeEntry[];
  /** Optional — undefined when the active registry predates the new-experience parser. */
  newExperience?: CompiledNewExperiencePatterns;
}
