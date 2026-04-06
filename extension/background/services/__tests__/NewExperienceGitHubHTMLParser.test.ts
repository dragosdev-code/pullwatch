/// <reference types="vitest/globals" />
import { compilePatterns, DEFAULT_PATTERNS } from '../../../common/default-patterns';
import type { CompiledPatterns, PatternRegistry } from '../../../common/pattern-types';
import { ParserBreakageError } from '../../../common/errors';
import { clone } from '../../../common/__tests__/schema-test-helpers';
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
});
