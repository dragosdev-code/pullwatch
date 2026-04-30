/// <reference types="vitest/globals" />
import { compilePatterns, DEFAULT_PATTERNS } from '@common/default-patterns';
import type { CompiledPatterns, PatternRegistry } from '@common/pattern-types';
import { ParserBreakageError } from '@common/errors';
import { clone } from '@common/__tests__/schema-test-helpers';
import { NewExperienceGitHubHTMLParser } from '../NewExperienceGitHubHTMLParser';

function compiledWithNePatch(
  patch: Partial<NonNullable<PatternRegistry['newExperience']>>,
): CompiledPatterns {
  const registry = clone(DEFAULT_PATTERNS);
  Object.assign(registry.newExperience!, patch);
  return compilePatterns(registry);
}

describe('NewExperienceGitHubHTMLParser', () => {
  const baseURL = 'https://github.com';

  it('throws ParserBreakageError when results-count advertises N>0 but rowSelector matches no rows', () => {
    const html = `
      <a data-testid="listitem-title-link" href="/o/r/pull/1">T</a>
      <span data-testid="results-count">2 results</span>
      <ul><li class="no-match-here"><a data-testid="listitem-title-link" href="/o/r/pull/2">x</a></li></ul>
    `;
    const patterns = compiledWithNePatch({});
    expect(() =>
      NewExperienceGitHubHTMLParser.parseFromHTML(html, baseURL, patterns),
    ).toThrow(ParserBreakageError);
  });

  it('accepts multiline results-count when throwing on selector breakage', () => {
    const html = `
      <a data-testid="listitem-title-link" href="/o/r/pull/1">T</a>
      <span data-testid="results-count">3
      results</span>
      <ul><li class="bad"></li></ul>
    `;
    const patterns = compiledWithNePatch({});
    expect(() =>
      NewExperienceGitHubHTMLParser.parseFromHTML(html, baseURL, patterns),
    ).toThrow(ParserBreakageError);
  });

  it('returns empty array when pageMarker matches, zero rows, and no results-count in HTML', () => {
    const html = `
      <a data-testid="listitem-title-link" href="/o/r/pull/1">Only marker</a>
    `;
    const patterns = compiledWithNePatch({});
    expect(NewExperienceGitHubHTMLParser.parseFromHTML(html, baseURL, patterns)).toEqual([]);
  });

  it('returns null when pageMarker is absent', () => {
    const html = '<div>no new experience markers</div>';
    const patterns = compiledWithNePatch({});
    expect(NewExperienceGitHubHTMLParser.parseFromHTML(html, baseURL, patterns)).toBeNull();
  });

  // WHY [author extraction]: Tier-2 canary compares each PR’s `author.login` from this HTML parser
  // against `GitHubEmbeddedJsonPullHarvest` (embedded JSON). On `/pulls/search`, GitHub often renders
  // the author as a filter control (`data-testid="author-filter-link"`) before `<span>opened`, not as
  // bare text — a mismatch surfaces as `Unknown Author` and fails alignment. The two cases below pin
  // the alternation regex: current button-in-row shape vs. plain-login-before-opened (still supported).

  it('extracts author login from data-testid="author-filter-link" button before opened span', () => {
    const html = `
      <li class="PullsListItem-module__listItem__abc">
        <a data-testid="listitem-title-link" href="/owner/repo/pull/42">Fix things</a>
        <button type="button" data-testid="author-filter-link" aria-label="Filter by author alice-writer">alice-writer</button>
        <span>opened </span>
        <relative-time datetime="2026-03-29T12:00:00Z"></relative-time>
        <span aria-label="Open"></span>
      </li>
    `;
    const patterns = compiledWithNePatch({});
    const prs = NewExperienceGitHubHTMLParser.parseFromHTML(html, baseURL, patterns);
    expect(prs).toHaveLength(1);
    expect(prs![0].author[0].login).toBe('alice-writer');
    expect(prs![0].url).toBe('https://github.com/owner/repo/pull/42');
  });

  it('extracts author login from plain text before opened span (legacy shape)', () => {
    const html = `
      <li class="ListItem-module__listItem__xyz">
        <a data-testid="listitem-title-link" href="/o/r/pull/1">Title</a>
        legacy-user<span>opened</span>
        <relative-time datetime="2026-01-02T00:00:00Z"></relative-time>
        <span aria-label="Open"></span>
      </li>
    `;
    const patterns = compiledWithNePatch({});
    const prs = NewExperienceGitHubHTMLParser.parseFromHTML(html, baseURL, patterns);
    expect(prs).toHaveLength(1);
    expect(prs![0].author[0].login).toBe('legacy-user');
  });

  it('keeps a row when relative-time datetime is missing and marks timestamp freshness unknown', () => {
    const html = `
      <li class="PullsListItem-module__listItem__abc">
        <a data-testid="listitem-title-link" href="/owner/repo/pull/42">Fix things</a>
        <button type="button" data-testid="author-filter-link">alice-writer</button>
        <span>opened </span>
        <relative-time></relative-time>
        <span aria-label="Open"></span>
      </li>
    `;
    const patterns = compiledWithNePatch({});
    const prs = NewExperienceGitHubHTMLParser.parseFromHTML(html, baseURL, patterns);

    expect(prs).toHaveLength(1);
    expect(prs![0].timestampParseFailed).toBe(true);
    expect(prs![0].eventAt).toBeUndefined();
  });

  it('keeps a row when relative-time datetime is malformed and marks timestamp freshness unknown', () => {
    const html = `
      <li class="PullsListItem-module__listItem__abc">
        <a data-testid="listitem-title-link" href="/owner/repo/pull/42">Fix things</a>
        <button type="button" data-testid="author-filter-link">alice-writer</button>
        <span>opened </span>
        <relative-time datetime="not-a-date"></relative-time>
        <span aria-label="Open"></span>
      </li>
    `;
    const patterns = compiledWithNePatch({});
    const prs = NewExperienceGitHubHTMLParser.parseFromHTML(html, baseURL, patterns);

    expect(prs).toHaveLength(1);
    expect(prs![0].timestampParseFailed).toBe(true);
    expect(prs![0].eventAt).toBeUndefined();
  });
});
