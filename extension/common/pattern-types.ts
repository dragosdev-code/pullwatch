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
}
