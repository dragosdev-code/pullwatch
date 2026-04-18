/**
 * GitHub public status API client for outage-vs-DOM disambiguation.
 *
 * GitHub can return HTTP 200 with a valid-looking page shell but no PR content
 * during partial outages (e.g., SSR failure on their end). This looks identical
 * to a DOM change from the parser's perspective. Checking the status API lets
 * the failure message (and downstream Discord alert) point at the right cause.
 */

const GITHUB_STATUS_API = 'https://www.githubstatus.com/api/v2/status.json';

/**
 * Returns `true` when GitHub reports anything other than `indicator: 'none'`
 * (i.e. minor, major, or critical). Any API failure defaults to `false` so
 * a flaky status endpoint cannot mask a real DOM-change alert.
 */
export async function isGitHubDegraded(): Promise<boolean> {
  try {
    const resp = await fetch(GITHUB_STATUS_API);
    if (!resp.ok) return false;
    const data = await resp.json();
    return data?.status?.indicator !== 'none';
  } catch {
    return false;
  }
}
