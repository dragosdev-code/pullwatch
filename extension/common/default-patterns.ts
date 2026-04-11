import type {
  PatternRegistry,
  PatternEntry,
  PrRowSelector,
  PatternTypeEntry,
  CompiledPatterns,
  CompiledPattern,
  CompiledPrRowSelector,
  CompiledPatternTypeEntry,
} from './pattern-types';

// ── Compilation helpers ──────────────────────────────────────────────

function compileEntry(entry: PatternEntry): CompiledPattern {
  return {
    compiled: new RegExp(entry.regex, entry.flags),
    ...(entry.captureGroups && { captureGroups: entry.captureGroups }),
  };
}

function compileRowSelector(s: PrRowSelector): CompiledPrRowSelector {
  return { name: s.name, type: s.type, value: s.value, compiled: new RegExp(s.regex, s.flags) };
}

function compileTypeEntry(e: PatternTypeEntry): CompiledPatternTypeEntry {
  return { type: e.type, compiled: new RegExp(e.pattern.regex, e.pattern.flags) };
}

/** Converts a serializable PatternRegistry into runtime-ready CompiledPatterns. */
export function compilePatterns(registry: PatternRegistry): CompiledPatterns {
  return {
    pageRecognition: {
      hasPRContent: compileEntry(registry.pageRecognition.hasPRContent),
      knownSelectors: compileEntry(registry.pageRecognition.knownSelectors),
      emptyState: compileEntry(registry.pageRecognition.emptyState),
      noResults: compileEntry(registry.pageRecognition.noResults),
    },
    prRowSelectors: registry.prRowSelectors.map(compileRowSelector),
    prRowFallback: {
      linkScan: compileEntry(registry.prRowFallback.linkScan),
      containerExtract: compileEntry(registry.prRowFallback.containerExtract),
    },
    prLink: registry.prLink.map(compileEntry),
    prNumber: {
      fromUrl: compileEntry(registry.prNumber.fromUrl),
      fromElement: compileEntry(registry.prNumber.fromElement),
    },
    repoName: compileEntry(registry.repoName),
    author: registry.author.map(compileEntry),
    assigneeAvatar: {
      stackContainer: compileEntry(registry.assigneeAvatar.stackContainer),
      closeTag: compileEntry(registry.assigneeAvatar.closeTag),
      anchorSelector: compileEntry(registry.assigneeAvatar.anchorSelector),
      hrefExtract: compileEntry(registry.assigneeAvatar.hrefExtract),
      loginFromHrefEncoded: compileEntry(registry.assigneeAvatar.loginFromHrefEncoded),
      loginFromHrefPlain: compileEntry(registry.assigneeAvatar.loginFromHrefPlain),
      loginFromAlt: compileEntry(registry.assigneeAvatar.loginFromAlt),
      loginFromAria: compileEntry(registry.assigneeAvatar.loginFromAria),
      avatarImg: compileEntry(registry.assigneeAvatar.avatarImg),
    },
    timestamp: registry.timestamp.map(compileEntry),
    prType: registry.prType.map(compileTypeEntry),
    viewerLogin: registry.viewerLogin.map(compileEntry),
    ...(registry.newExperience && {
      newExperience: {
        pageMarker: compileEntry(registry.newExperience.pageMarker),
        resultsCount: compileEntry(registry.newExperience.resultsCount),
        rowSelector: compileEntry(registry.newExperience.rowSelector),
        titleLink: compileEntry(registry.newExperience.titleLink),
        repoName: compileEntry(registry.newExperience.repoName),
        prNumber: compileEntry(registry.newExperience.prNumber),
        author: compileEntry(registry.newExperience.author),
        timestamp: registry.newExperience.timestamp.map(compileEntry),
        prType: registry.newExperience.prType.map(compileTypeEntry),
      },
    }),
  };
}

// ── Default patterns (exact 1:1 extraction from the original parser) ─

export const DEFAULT_PATTERNS: PatternRegistry = {
  // ── Page recognition (used by isRecognizedGitHubPage / top-level guard) ──
  pageRecognition: {
    hasPRContent: { regex: '/pull/\\d+', flags: '' },
    knownSelectors: {
      regex: 'js-issue-row|Box-row|issue-list-item|data-hovercard-type="pull_request"',
      flags: 'i',
    },
    emptyState: { regex: 'class="[^"]*blankslate', flags: 'i' },
    noResults: { regex: 'No results matched', flags: 'i' },
  },

  // ── PR row extraction selectors (tried in order, first hit wins) ──
  prRowSelectors: [
    {
      name: 'js-issue-row',
      type: 'balanced-div',
      value: 'js-issue-row',
      regex: '<div\\b[^>]*\\bclass="[^"]*\\bjs-issue-row\\b[^"]*"[^>]*>',
      flags: 'gi',
    },
    {
      name: 'Box-row',
      type: 'class',
      value: 'Box-row',
      regex: '<[^>]*class="[^"]*Box-row[^"]*"[^>]*>(.*?)</[^>]*>',
      flags: 'gis',
    },
    {
      name: 'issue-list-item',
      type: 'class',
      value: 'issue-list-item',
      regex: '<[^>]*class="[^"]*issue-list-item[^"]*"[^>]*>(.*?)</[^>]*>',
      flags: 'gis',
    },
    {
      name: 'hovercard-pr',
      type: 'attribute',
      value: 'data-hovercard-type="pull_request"',
      regex: '<[^>]*data-hovercard-type="pull_request"[^>]*>(.*?)</[^>]*>',
      flags: 'gis',
    },
  ],

  // ── Fallback when no row selector matched ──
  prRowFallback: {
    linkScan: {
      regex: '<a[^>]*href="[^"]*/pull/\\d+[^"]*"[^>]*>([^<]*)</a>',
      flags: 'gi',
    },
    containerExtract: {
      regex:
        '<(?:div|article|li|tr)[^>]*>.*?<a[^>]*href="([^"]*/pull/\\d+)[^"]*"[^>]*>([^<]*)</a>.*?</(?:div|article|li|tr)>',
      flags: 'gi',
    },
  },

  // ── PR link + title (tried in order, first hit wins) ──
  prLink: [
    {
      regex:
        '<a[^>]*href="([^"]*/pull/\\d+)"[^>]*class="[^"]*(?:markdown-title|js-navigation-open|Link--primary)[^"]*"[^>]*>([^<]+)</a>',
      flags: 'i',
      captureGroups: { url: 1, title: 2 },
    },
    {
      regex: '<a[^>]*href="([^"]*/pull/\\d+)"[^>]*>([^<]+)</a>',
      flags: 'i',
      captureGroups: { url: 1, title: 2 },
    },
    {
      regex:
        '<a[^>]*class="[^"]*(?:markdown-title|js-navigation-open|Link--primary)[^"]*"[^>]*href="([^"]*/pull/\\d+)"[^>]*>([^<]+)</a>',
      flags: 'i',
      captureGroups: { url: 1, title: 2 },
    },
  ],

  // ── PR number ──
  prNumber: {
    fromUrl: { regex: '/pull/(\\d+)', flags: '', captureGroups: { number: 1 } },
    fromElement: { regex: '#(\\d+)\\s+opened', flags: '', captureGroups: { number: 1 } },
  },

  // ── Repository name ──
  repoName: { regex: '/([^/]+/[^/]+)/pull', flags: '', captureGroups: { repoName: 1 } },

  // ── Author (tried in order, first hit wins) ──
  author: [
    {
      regex: '<a[^>]*href="[^"]*/([^"/?]+)"[^>]*title="[^"]*"[^>]*>([^<]+)</a>',
      flags: 'i',
      captureGroups: { login: 1, loginAlt: 2 },
    },
    {
      regex: '<a[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)</a>',
      flags: 'i',
      captureGroups: { login: 1 },
    },
    {
      regex:
        '<a[^>]*data-hovercard-type="user"[^>]*data-hovercard-url="[^"]*/users/([^"/]+)/[^"]*"[^>]*>',
      flags: 'i',
      captureGroups: { login: 1 },
    },
    {
      regex: 'opened[^<]*by[^<]*<a[^>]*>([^<]+)</a>',
      flags: 'i',
      captureGroups: { login: 1 },
    },
  ],

  // ── Assignee avatar stack ──
  assigneeAvatar: {
    stackContainer: {
      regex:
        '<div\\b(?=[^>]*\\bclass="[^"]*\\bAvatarStack-body\\b[^"]*")(?=[^>]*\\baria-label="Assigned to[^"]*")[^>]*>',
      flags: 'i',
    },
    closeTag: { regex: '</div>', flags: 'i' },
    anchorSelector: {
      regex: '<a\\b[^>]*class="[^"]*\\bavatar-user\\b[^"]*"[^>]*>[\\s\\S]*?</a>',
      flags: 'gi',
    },
    hrefExtract: {
      regex: '\\bhref="([^"]+)"',
      flags: 'i',
      captureGroups: { href: 1 },
    },
    loginFromHrefEncoded: {
      regex: 'assignee%3A([^&"+]+)',
      flags: 'i',
      captureGroups: { login: 1 },
    },
    loginFromHrefPlain: {
      regex: 'assignee:([^&"+]+)',
      flags: 'i',
      captureGroups: { login: 1 },
    },
    loginFromAlt: {
      regex: '\\balt="@([^"]+)"',
      flags: 'i',
      captureGroups: { login: 1 },
    },
    loginFromAria: {
      regex: '\\baria-label="([^"]+?)(?:\'|&#39;|\\u2019)s assigned issues"',
      flags: 'i',
      captureGroups: { login: 1 },
    },
    avatarImg: {
      regex: '<img[^>]*class="[^"]*\\bfrom-avatar\\b[^"]*"[^>]*\\bsrc="([^"]+)"',
      flags: 'i',
      captureGroups: { src: 1 },
    },
  },

  // ── Timestamp (tried in order, first hit wins) ──
  timestamp: [
    { regex: '<relative-time[^>]+datetime="([^"]+)"', flags: 'i', captureGroups: { datetime: 1 } },
    { regex: '<time[^>]+datetime="([^"]+)"', flags: 'i', captureGroups: { datetime: 1 } },
    { regex: 'datetime="([^"]+)"', flags: 'i', captureGroups: { datetime: 1 } },
  ],

  // ── PR type detection (ordered: aria-labels first, then icons — first match wins) ──
  prType: [
    { type: 'draft', pattern: { regex: 'aria-label="[^"]*Draft Pull Request[^"]*"', flags: 'i' } },
    { type: 'open', pattern: { regex: 'aria-label="[^"]*Open Pull Request[^"]*"', flags: 'i' } },
    {
      type: 'merged',
      pattern: { regex: 'aria-label="[^"]*Merged Pull Request[^"]*"', flags: 'i' },
    },
    { type: 'draft', pattern: { regex: 'octicon-git-pull-request-draft', flags: 'i' } },
    { type: 'draft', pattern: { regex: 'color-fg-draft', flags: 'i' } },
    { type: 'open', pattern: { regex: 'octicon-git-pull-request(?!-)', flags: 'i' } },
    { type: 'open', pattern: { regex: 'color-fg-open', flags: 'i' } },
    { type: 'merged', pattern: { regex: 'octicon-git-merge', flags: 'i' } },
  ],

  // WHY [flat chain]: Same strategy as list parsing — one ordered regex list, no branching on URL or
  // legacy vs new experience. GitHubService walks these until the first capture of `login`.
  // Roadmap: add optional `description` on every PatternEntry across this file for remote/config clarity.
  viewerLogin: [
    {
      // WHY [fragility]: `[^}]*` is intentionally narrow for speed on large HTML blobs.
      // If GitHub nests objects before `login`, fallback entries below still recover.
      description: 'Match current_user login in embedded data',
      regex: '"current_user"\\s*:\\s*\\{[^}]*"login"\\s*:\\s*"([^"]+)"',
      flags: '',
      captureGroups: { login: 1 },
    },
    {
      // WHY [fragility]: Same trade-off as current_user — keep this specific JSON shape fast,
      // then rely on ordered metas/client-env fallbacks when nav embedding changes.
      description: 'Match userMenu owner login in global nav partial',
      regex: '"userMenu"\\s*:\\s*\\{[^}]*"owner"\\s*:\\s*\\{[^}]*"login"\\s*:\\s*"([^"]+)"',
      flags: '',
      captureGroups: { login: 1 },
    },
    {
      description: 'Match octolytics-actor-login meta tag',
      regex: '<meta[^>]+name="octolytics-actor-login"[^>]+content="([^"]+)"',
      flags: 'i',
      captureGroups: { login: 1 },
    },
    {
      description: 'Match user-login meta tag',
      regex: '<meta[^>]+name="user-login"[^>]+content="([^"]+)"',
      flags: 'i',
      captureGroups: { login: 1 },
    },
    {
      description: 'Match login in legacy client-env json',
      regex: '<script[^>]*id="client-env"[^>]*>[\\s\\S]*?"login"\\s*:\\s*"([^"]+)"',
      flags: 'i',
      captureGroups: { login: 1 },
    },
  ],

  // ── New-experience patterns (React-based global pulls dashboard) ───
  newExperience: {
    // data-testid is a stable React testing attribute unique to the new dashboard.
    pageMarker: { regex: 'data-testid="listitem-title-link"', flags: 'i' },

    // Multiline-safe: production HTML may break between the digit and "results".
    resultsCount: {
      regex:
        '<span(?=[^>]*data-testid="results-count")[^>]*>\\s*(\\d+)[\\s\\S]*?\\bresults\\b',
      flags: 'i',
      captureGroups: { count: 1 },
    },

    // Partial CSS module class — hash suffix varies; match stable substrings.
    rowSelector: {
      regex:
        '<li\\b[^>]*class="[^"]*(?:PullsListItem-module__listItem|ListItem-module__listItem)[^"]*"[^>]*>',
      flags: 'gi',
    },

    // Lookaheads assert data-testid and href exist on the <a>; href capture works
    // regardless of attribute order. Group 2 is inner HTML (spans); parser strips tags.
    titleLink: {
      regex:
        '<a(?=[^>]*data-testid="listitem-title-link")(?=[^>]*\\bhref=)[^>]*href="([^"]*)"[^>]*>([\\s\\S]*?)</a>',
      flags: 'i',
      captureGroups: { url: 1, titleHtml: 2 },
    },

    // URL-based extraction — self-contained so remote config changes to
    // newExperience patterns cannot accidentally alter legacy behavior.
    repoName: { regex: '/([^/]+/[^/]+)/pull', flags: '', captureGroups: { repoName: 1 } },
    prNumber: { regex: '/pull/(\\d+)', flags: '', captureGroups: { number: 1 } },

    // Author login appears as a text node immediately before <span>opened.
    // \w covers [a-zA-Z0-9_]; GitHub disallows underscores but \w is
    // harmless here and simpler than a custom character class.
    author: {
      regex: '([\\w][\\w-]*)\\s*<span[^>]*>\\s*opened\\b',
      flags: 'i',
      captureGroups: { login: 1 },
    },

    timestamp: [
      {
        regex: '<relative-time[^>]+datetime="([^"]+)"',
        flags: 'i',
        captureGroups: { datetime: 1 },
      },
      { regex: '<time[^>]+datetime="([^"]+)"', flags: 'i', captureGroups: { datetime: 1 } },
      { regex: 'datetime="([^"]+)"', flags: 'i', captureGroups: { datetime: 1 } },
    ],

    // aria-label and octicon class names are stable across both legacy and
    // new experience. CSS-module color classes (fgColor-*) are NOT targeted
    // because their hashes change per deploy.
    prType: [
      { type: 'draft', pattern: { regex: 'aria-label="[^"]*Draft[^"]*"', flags: 'i' } },
      { type: 'open', pattern: { regex: 'aria-label="Open"', flags: 'i' } },
      { type: 'merged', pattern: { regex: 'aria-label="[^"]*Merged[^"]*"', flags: 'i' } },
      { type: 'draft', pattern: { regex: 'octicon-git-pull-request-draft', flags: 'i' } },
      { type: 'open', pattern: { regex: 'octicon-git-pull-request(?!-)', flags: 'i' } },
      { type: 'merged', pattern: { regex: 'octicon-git-merge', flags: 'i' } },
    ],
  },
};

/** Pre-compiled default patterns — ready for immediate use by the parser. */
export const DEFAULT_COMPILED_PATTERNS: CompiledPatterns = compilePatterns(DEFAULT_PATTERNS);
