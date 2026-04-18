/**
 * Text comparison helpers used when cross-checking embedded JSON rows against
 * new-experience HTML scrape rows. JSON text is already decoded; HTML-derived
 * text still contains entities and leading/trailing whitespace — normalizing
 * both sides keeps alignment checks signal over noise.
 */

import type { PullRequest } from '../../extension/common/types';

/** Canonical key for matching the same PR row across JSON harvest vs HTML scrape. */
export function normalizePullUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '') || u.pathname;
    return `${u.hostname.toLowerCase()}${path}`;
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}

/** Decode a small subset of entities so JSON plain text and DOM-derived titles compare fairly. */
export function decodeBasicHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'");
}

export function normalizeTitleForCompare(title: string): string {
  return decodeBasicHtmlEntities(title.trim()).replace(/\s+/g, ' ');
}

/** Embedded JSON rows often omit `number`; permalink URLs always carry `/pull/N`. */
export function inferNumberFromPullUrl(pr: PullRequest): number | null {
  if (pr.number != null && pr.number > 0) return pr.number;
  const m = pr.url.match(/\/pull\/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
