/**
 * Writes full HTML to `canary/snapshots/` when a parse fails so on-call can
 * diff against prior runs without re-fetching live GitHub (directory is gitignored).
 */

import fs from 'node:fs';
import path from 'node:path';

const SNAPSHOT_DIR = path.join(__dirname, '..', 'snapshots');

/**
 * Persists `html` to a timestamped file. Returns the path on success, or `null`.
 * Failures are non-fatal — the original error still propagates.
 */
export function writeCanaryFailureSnapshot(html: string, label: string): string | null {
  try {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const safe = label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'target';
    const file = path.join(SNAPSHOT_DIR, `failure-${Date.now()}-${safe}.html`);
    fs.writeFileSync(file, html, 'utf8');
    console.error(`  [snapshot] Saved failing HTML to ${file} (${html.length} bytes)`);
    return file;
  } catch (err) {
    console.warn(`  [snapshot] Could not write failure snapshot: ${err}`);
    return null;
  }
}
