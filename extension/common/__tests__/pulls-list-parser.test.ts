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
});
