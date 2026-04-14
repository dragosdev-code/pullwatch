/**
 * Detects logged-out github.com HTML shells from the document itself (not HTTP status alone).
 * `GitHubService` uses this so a 404 on a bad URL while signed in — still carrying a non-empty
 * `user-login` meta — does not clear the extension session.
 *
 * **Session vs scraping:** Meta regexes here are the **static, store-reviewed** gate for
 * `NotLoggedIn` / session-loss classification (small blast radius — no remote `patterns.json`).
 * The same `user-login` signal appears again in `default-patterns.ts` inside
 * `DEFAULT_PATTERNS.viewerLogin` as a **stricter, remote-tunable** extractor for viewer login
 * on authenticated pages. That duplication is intentional: flexible matching for security
 * decisions; ordered chain entries for feature parsing and hot-fix without conflating the two.
 *
 * Cross-ref: `default-patterns.ts` → `DEFAULT_PATTERNS.viewerLogin` → description
 * “Match user-login meta tag”.
 */

const META_USER_LOGIN_NAME_FIRST_RE =
  /<meta\s+name=["']user-login["']\s+content=["']([^"']*)["']/i;
const META_USER_LOGIN_CONTENT_FIRST_RE =
  /<meta\s+content=["']([^"']*)["']\s+name=["']user-login["']/i;

const IS_LOGGED_OUT_PAGE_NAME_FIRST_RE =
  /<meta\s+name=["']is_logged_out_page["']\s+content=["']true["']/i;
const IS_LOGGED_OUT_PAGE_CONTENT_FIRST_RE =
  /<meta\s+content=["']true["']\s+name=["']is_logged_out_page["']/i;

/** Raw `content` of the `user-login` meta, or `undefined` when that tag is absent. */
export function parseGitHubMetaUserLoginContent(html: string): string | undefined {
  const nameFirst = html.match(META_USER_LOGIN_NAME_FIRST_RE);
  if (nameFirst) return nameFirst[1] ?? '';
  const contentFirst = html.match(META_USER_LOGIN_CONTENT_FIRST_RE);
  if (contentFirst) return contentFirst[1] ?? '';
  return undefined;
}

/** Classic sign-in / session forms when GitHub omits the newer metas (older shells). */
function legacyLoggedOutHeuristics(html: string, responseUrl: string): boolean {
  const pageTitle = (html.match(/<title>(.*?)<\/title>/i) || [])[1] || '';
  return (
    pageTitle.includes('Sign in to GitHub') ||
    responseUrl.includes('/login') ||
    html.includes('action="/session"') ||
    html.includes('class="auth-form"')
  );
}

/**
 * True when the HTML is a logged-out github.com document (marketing shell, 404 logged-out page,
 * or dedicated sign-in page). A non-empty `user-login` meta means an authenticated shell — return
 * false even for HTTP 404 so scraping mistakes stay non-auth errors.
 */
export function isGitHubLoggedOutHtmlShell(html: string, responseUrl: string): boolean {
  const metaLogin = parseGitHubMetaUserLoginContent(html);
  if (metaLogin !== undefined && metaLogin.trim().length > 0) {
    return false;
  }
  if (IS_LOGGED_OUT_PAGE_NAME_FIRST_RE.test(html) || IS_LOGGED_OUT_PAGE_CONTENT_FIRST_RE.test(html)) {
    return true;
  }
  if (metaLogin !== undefined && metaLogin.trim().length === 0) {
    return true;
  }
  return legacyLoggedOutHeuristics(html, responseUrl);
}
