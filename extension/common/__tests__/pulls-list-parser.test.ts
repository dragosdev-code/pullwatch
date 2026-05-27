/// <reference types="vitest/globals" />
import { DEFAULT_COMPILED_PATTERNS } from '../default-patterns';
import { parsePullsListHTML } from '../pulls-list-parser';

const baseURL = 'https://github.com';

function embeddedJsonHtml(payload: unknown): string {
  const json = JSON.stringify(payload);
  return `<!DOCTYPE html><html><body><script type="application/json" data-target="react-app.embeddedData">${json}</script></body></html>`;
}

describe('parsePullsListHTML', () => {
  it('returns embedded JSON rows first and does not invoke later-stage observers beyond JSON', () => {
    const html = embeddedJsonHtml({
      payload: {
        pullsDashboardSurfaceContentRoute: {
          results: [
            {
              permalink: 'https://github.com/o/r/pull/99',
              title: 'From JSON',
              author: { displayLogin: 'dev' },
              createdAt: '2026-01-01T00:00:00Z',
              state: 'OPEN',
              isDraft: false,
              repoNameWithOwner: 'o/r',
            },
          ],
        },
      },
    });

    const seen: string[] = [];
    const prs = parsePullsListHTML(html, baseURL, DEFAULT_COMPILED_PATTERNS, {
      onJsonProbed(r) {
        seen.push(`json:${r?.length ?? 'null'}`);
      },
      onNewHtmlProbed(r) {
        seen.push(`new:${r === null ? 'null' : r.length}`);
      },
      onLegacyHtmlProbed(r) {
        seen.push(`legacy:${r.length}`);
      },
    });

    expect(prs).toHaveLength(1);
    expect(prs[0].title).toBe('From JSON');
    expect(seen).toEqual(['json:1']);
  });

  it('falls through to new-experience HTML when JSON is absent', () => {
    const html = `
      <li class="PullsListItem-module__listItem__abc">
        <a data-testid="listitem-title-link" href="/owner/repo/pull/42">Fix things</a>
        <button type="button" data-testid="author-filter-link">alice-writer</button>
        <span>opened </span>
        <relative-time datetime="2026-03-29T12:00:00Z"></relative-time>
        <span aria-label="Open"></span>
      </li>
    `;

    const seen: string[] = [];
    const prs = parsePullsListHTML(html, baseURL, DEFAULT_COMPILED_PATTERNS, {
      onJsonProbed(r) {
        seen.push(`json:${r === null ? 'null' : r!.length}`);
      },
      onNewHtmlProbed(r) {
        seen.push(`new:${r === null ? 'null' : r!.length}`);
      },
      onLegacyHtmlProbed(r) {
        seen.push(`legacy:${r.length}`);
      },
    });

    expect(prs).toHaveLength(1);
    expect(prs[0].url).toBe('https://github.com/owner/repo/pull/42');
    expect(seen).toEqual(['json:null', 'new:1']);
  });

  it('returns empty array from new-experience when markers match but there are no rows (legacy not run)', () => {
    const html = `
      <a data-testid="listitem-title-link" href="/o/r/pull/1">Only marker</a>
    `;

    const seen: string[] = [];
    const prs = parsePullsListHTML(html, baseURL, DEFAULT_COMPILED_PATTERNS, {
      onJsonProbed(r) {
        seen.push(`json:${r === null ? 'null' : r!.length}`);
      },
      onNewHtmlProbed(r) {
        seen.push(`new:${r === null ? 'null' : r!.length}`);
      },
      onLegacyHtmlProbed(r) {
        seen.push(`legacy:${r.length}`);
      },
    });

    expect(prs).toEqual([]);
    expect(seen).toEqual(['json:null', 'new:0']);
  });

  it('falls through to legacy HTML when JSON and new experience are absent', () => {
    const row = `
      <div class="js-issue-row Box-row">
        <a class="markdown-title Link--primary" href="/acme-corp/widgets/pull/42">
          ABC-123: <code>WidgetLoader</code> as shared module
        </a>
        <span class="opened-by">#42 opened <relative-time datetime="2026-01-15T10:00:00Z"></relative-time> by
          <a href="/issues?q=author">alice-writer</a>
        </span>
      </div>`;
    const html = `<!DOCTYPE html><html><body><div class="js-navigation-container">${row}</div></body></html>`;

    const seen: string[] = [];
    const prs = parsePullsListHTML(html, baseURL, DEFAULT_COMPILED_PATTERNS, {
      onJsonProbed(r) {
        seen.push(`json:${r === null ? 'null' : r!.length}`);
      },
      onNewHtmlProbed(r) {
        seen.push(`new:${r === null ? 'null' : r!.length}`);
      },
      onLegacyHtmlProbed(r) {
        seen.push(`legacy:${r.length}`);
      },
    });

    expect(prs).toHaveLength(1);
    expect(prs[0].url).toBe('https://github.com/acme-corp/widgets/pull/42');
    expect(prs[0].title).toBe('ABC-123: WidgetLoader as shared module');
    expect(seen).toEqual(['json:null', 'new:null', 'legacy:1']);
  });
});
