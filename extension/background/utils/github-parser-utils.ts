import type { CompiledPatternTypeEntry } from '@common/pattern-types';

/** Plain text from link inner HTML (e.g. titles with `<code>` wrappers). */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ');
}

export function detectPRTypeFromEntries(
  html: string,
  prType: CompiledPatternTypeEntry[]
): 'draft' | 'open' | 'merged' {
  for (const entry of prType) {
    if (entry.compiled.test(html)) return entry.type;
  }
  return 'open';
}

export function extractBalancedBlocks(
  html: string,
  openingPattern: RegExp,
  tagName: 'div' | 'li'
): string[] {
  const blocks: string[] = [];
  openingPattern.lastIndex = 0;
  let m: RegExpExecArray | null;
  const openTag = new RegExp(`<${tagName}\\b`, 'i');
  const closeTag = new RegExp(`</${tagName}>`, 'i');
  const closeLength = tagName.length + 3;

  while ((m = openingPattern.exec(html)) !== null) {
    const start = m.index;
    let i = m.index + m[0].length;
    let depth = 1;

    while (i < html.length && depth > 0) {
      const tail = html.slice(i);
      const openMatch = tail.match(openTag);
      const closeMatch = tail.match(closeTag);
      const openIdx = openMatch?.index ?? -1;
      const closeIdx = closeMatch?.index ?? -1;

      if (closeIdx === -1) break;

      if (openIdx !== -1 && openIdx < closeIdx) {
        depth++;
        const tagStart = i + openIdx;
        const gt = html.indexOf('>', tagStart);
        i = gt === -1 ? i + openIdx + tagName.length + 1 : gt + 1;
      } else {
        depth--;
        i = i + closeIdx + closeLength;
      }
    }

    if (depth === 0) {
      blocks.push(html.slice(start, i));
    }
  }

  return blocks;
}
