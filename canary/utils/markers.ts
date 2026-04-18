/**
 * Grep-stable marker strings emitted into stdout / stderr on canary failures.
 *
 * `.github/workflows/canary-parser-test.yml` matches these exact substrings in
 * `canary.log` to decide whether to send a Discord NOTICE vs CRITICAL alert.
 * Do not rename without updating the workflow in the same commit.
 */

/**
 * Emitted when the new-dashboard page is present but the SSR JSON path is
 * broken — users lose the primary extraction path. CI fails; Discord CRITICAL.
 */
export const CANARY_MARKER_EMBEDDED_JSON_DRIFT = 'CANARY_EMBEDDED_JSON_DRIFT';

/**
 * Emitted when embedded JSON still works but the HTML fallback does not
 * match the JSON (or count-align). CI stays green; Discord NOTICE — fix the
 * fallback before JSON goes away.
 */
export const CANARY_MARKER_NEW_HTML_FALLBACK_DEGRADED = 'CANARY_NEW_HTML_FALLBACK_DEGRADED';

/**
 * Appended to thrown errors for JSON-drift failures so CI logs point at remediation
 * without opening the repo. GitHub renders this path as an anchor to Step 2.
 */
export const CANARY_RUNBOOK_JSON_DRIFT_HINT =
  'See canary/DOM_CHANGE_RUNBOOK.md#step-2--identify-which-pattern-broke';
