/**
 * Writes full HTML / Playwright traces under `canary/` when a canary fails so
 * on-call can diagnose GitHub's served shell without re-fetching live pages.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from 'playwright';

const SNAPSHOT_DIR = path.join(__dirname, '..', 'snapshots');
const TRACE_DIR = path.join(__dirname, '..', 'traces');
const stoppedTraceContexts = new WeakSet<BrowserContext>();

function sanitizeLabel(label: string): string {
  return label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'target';
}

/**
 * Persists `html` to a timestamped file. Returns the path on success, or `null`.
 * Failures are non-fatal — the original error still propagates.
 */
export function writeCanaryFailureSnapshot(html: string, label: string): string | null {
  try {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const safe = sanitizeLabel(label);
    const file = path.join(SNAPSHOT_DIR, `failure-${Date.now()}-${safe}.html`);
    fs.writeFileSync(file, html, 'utf8');
    console.error(`  [snapshot] Saved failing HTML to ${file} (${html.length} bytes)`);
    return file;
  } catch (err) {
    console.warn(`  [snapshot] Could not write failure snapshot: ${err}`);
    return null;
  }
}

/**
 * Stops Playwright tracing and persists the trace zip. Safe to call from both the
 * failure path and `close()`; only the first stop for a context produces a file.
 */
export async function stopAndSaveTrace(
  context: BrowserContext | undefined,
  label: string
): Promise<string | null> {
  if (!context || stoppedTraceContexts.has(context)) return null;

  try {
    fs.mkdirSync(TRACE_DIR, { recursive: true });
    const safe = sanitizeLabel(label);
    const file = path.join(TRACE_DIR, `trace-${Date.now()}-${safe}.zip`);
    await context.tracing.stop({ path: file });
    stoppedTraceContexts.add(context);
    console.error(`  [trace] Saved Playwright trace to ${file}`);
    return file;
  } catch (err) {
    stoppedTraceContexts.add(context);
    console.warn(`  [trace] Could not save Playwright trace: ${err}`);
    return null;
  }
}
