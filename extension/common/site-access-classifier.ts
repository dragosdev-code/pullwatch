/**
 * Classifies a transport-shape GitHub fetch failure (TypeError / AbortError, no HTTP status) into
 * one of two reasons consumed by {@link GitHubOutageReason} and the popup outage banner:
 *
 * - `'site_access_blocked'`: Chrome is gating the request because the user disabled per-site
 *   access for the extension (chrome://extensions → "Allow access on click" / "On specific sites").
 * - `'transport'`: Generic GitHub-down / offline / DNS / timeout. The default when we cannot
 *   confidently attribute the failure to site-access revocation.
 *
 * Lives in `@common/` (no `chrome.*` imports) so it can be unit-tested without a Chromium harness;
 * the caller passes a {@link SiteAccessProbe} that wraps `chrome.permissions.contains`.
 */

/**
 * Pattern fed into `chrome.permissions.contains({ origins: [...] })`. Match patterns must
 * line up with manifest `host_permissions`; a mismatch flips `contains` to `false` for an
 * unrelated reason and would misclassify into the new banner.
 */
export const GITHUB_ORIGIN_PATTERN = 'https://github.com/*' as const;

export interface SiteAccessProbe {
  /**
   * Returns whether `https://github.com/*` is currently granted to the extension. Implementation
   * wraps `chrome.permissions.contains({ origins: [GITHUB_ORIGIN_PATTERN] })`.
   *
   * WHY [github.com is sufficient]: All four declared hosts (github.com, avatars.*,
   * raw.githubusercontent.com, www.githubstatus.com) share the same site-access toggle in
   * chrome://extensions — Chrome revokes them as a group. Probing one is enough; probing more
   * is redundant cost.
   */
  hasGitHubOrigin(): Promise<boolean>;
}

export type SiteAccessClassification = 'transport' | 'site_access_blocked';

/**
 * WHY [conservative default]: `'transport'` is the existing copy and the safer label when we are
 * uncertain. Only flip to `'site_access_blocked'` when Chromium itself tells us the origin is not
 * granted; do not infer it from secondary heuristics that could overlap with real GitHub outages.
 *
 * WHY [no live network probe]: A previous design considered probing `githubstatus.com` to
 * disambiguate. It does not help: Chrome's "On click" site-access toggle revokes all manifest
 * `host_permissions` atomically, so the sibling host fails alongside `github.com`. A fresh
 * probe would not separate site-access from a generic outage. The authoritative signal is
 * `chrome.permissions.contains` — paired with `chrome.permissions.onRemoved` (handled by
 * {@link SiteAccessWatcher}) for proactive detection between fetch waves.
 */
export async function classifyTransportFailure(
  probe: SiteAccessProbe
): Promise<SiteAccessClassification> {
  let hasGitHub: boolean;
  try {
    hasGitHub = await probe.hasGitHubOrigin();
  } catch {
    // WHY [fail-open]: If the permissions API itself throws (rare, but possible on a torn-down
    // service worker), do not invent certainty. Default to the existing 'transport' banner so
    // we never blame the user's chrome://extensions settings without evidence.
    return 'transport';
  }
  return hasGitHub ? 'transport' : 'site_access_blocked';
}
