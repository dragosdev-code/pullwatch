/// <reference types="vitest/globals" />
import { DEFAULT_COMPILED_PATTERNS } from '@common/default-patterns';
import { GitHubHTMLParser } from '../GitHubHTMLParser';

const baseURL = 'https://github.com';

/** Minimal legacy pulls list page shell so pageRecognition passes. */
function legacyListPage(body: string): string {
  return `<!DOCTYPE html><html><body><div class="js-navigation-container">${body}</div></body></html>`;
}

describe('GitHubHTMLParser', () => {
  it('parses PR title when markdown-title link contains nested <code>', () => {
    const row = `
      <div id="issue_42_acme_widgets" class="Box-row js-navigation-item js-issue-row">
        <a class="v-align-middle Link--muted h4 pr-1" href="https://github.com/acme-corp/widgets">acme-corp/widgets</a>
        <a id="issue_42_acme_widgets_link" class="Link--primary v-align-middle no-underline h4 js-navigation-open markdown-title"
           data-hovercard-type="pull_request" href="/acme-corp/widgets/pull/42">
          ABC-123: <code>WidgetLoader</code>
          as shared module
        </a>
        <span class="opened-by">#42 opened <relative-time datetime="2026-01-15T10:00:00Z"></relative-time> by
          <a class="Link--muted" href="/issues?q=is%3Apr+is%3Aopen+author%3Aalice-writer">alice-writer</a>
        </span>
      </div>`;

    const html = legacyListPage(row);
    const prs = GitHubHTMLParser.parseFromHTML(html, baseURL, DEFAULT_COMPILED_PATTERNS);

    expect(prs).toHaveLength(1);
    expect(prs[0].url).toBe('https://github.com/acme-corp/widgets/pull/42');
    expect(prs[0].title).toBe('ABC-123: WidgetLoader as shared module');
    expect(prs[0].number).toBe(42);
    expect(prs[0].repoName).toBe('acme-corp/widgets');
  });
});
