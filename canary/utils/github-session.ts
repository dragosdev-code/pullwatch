/**
 * Playwright-backed GitHub session for Tier 2 canary tests.
 *
 * Encapsulates the full browser lifecycle: launch, session reuse,
 * credential login, device-verification bypass (via Gmail OTP),
 * and authenticated page fetching. The test file only sees a clean
 * `launch() → getPageHTML() → close()` surface.
 *
 * When a shared `browser` is injected, this class only creates a new
 * `BrowserContext` so legacy and new-experience accounts never share cookies.
 * Why contexts, not just two tabs: a second `Page` on the same context shares
 * `document.cookie` and storage — the new bot would inherit the legacy session
 * and GitHub would route the wrong UI variant.
 */

import fs from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { GITHUB_BASE_URL } from '../../extension/common/constants';
import { isGitHubLoggedOutHtmlShell } from '../../extension/common/github-html-session';
import {
  isGitHubPageNotFoundDocument,
  isGitHubPageNotFoundTitle,
} from './github-page-signals';
import { getGitHubVerificationCode } from './gmail-fetcher';
import { HAS_GMAIL_SECRETS, REALISTIC_UA } from './config';

/** Shared `page.goto` options for GitHub navigations (fast first paint, bounded timeout). */
const GOTO_OPTS = { waitUntil: 'domcontentloaded' as const, timeout: 30_000 };

export interface GitHubSessionOptions {
  username: string;
  password: string;
  stateFile: string;
  /**
   * When set, do not launch Chromium here — Tier 2’s parent already did. We only
   * attach a fresh context so each chapter keeps isolated auth state on one process.
   */
  browser?: Browser;
  /** Shown in login errors so operators fix the right GitHub Actions secret name. */
  usernameEnvHint: string;
}

export class GitHubSession {
  private browser!: Browser;
  private context!: BrowserContext;
  private page!: Page;
  private _isLoggedIn = false;
  /** Only the session that called `chromium.launch()` may close the browser — shared-browser chapters must not. */
  private readonly ownsBrowser: boolean;

  constructor(private readonly options: GitHubSessionOptions) {
    this.ownsBrowser = options.browser === undefined;
  }

  get isLoggedIn(): boolean {
    return this._isLoggedIn;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Spins up Chromium (or attaches to a shared browser), restores cached
   * cookies if available, and either validates the cached session or performs
   * a full login flow.
   *
   * Intentionally does NOT throw on login failure — it sets `isLoggedIn`
   * to false so individual tests can gracefully skip with a clear log
   * message instead of blowing up the entire suite.
   */
  async launch(): Promise<void> {
    const { stateFile, usernameEnvHint } = this.options;
    console.log(`\n── Tier 2: beforeAll — Starting Playwright session (${usernameEnvHint}) ──`);

    const hasCachedState = fs.existsSync(stateFile);
    console.log(`  [state] ${stateFile} exists: ${hasCachedState}`);

    if (this.ownsBrowser) {
      console.log('  [pw] Launching Chromium (headless)...');
      this.browser = await chromium.launch({ headless: true });
      console.log('  [pw] Chromium launched');
    } else {
      this.browser = this.options.browser!;
      console.log('  [pw] Using shared browser instance (new isolated context)');
    }

    const contextOptions = {
      userAgent: REALISTIC_UA,
      viewport: { width: 1920, height: 1080 } as const,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      ...(hasCachedState ? { storageState: stateFile } : {}),
    };
    console.log(`  [pw] Creating browser context (storageState: ${hasCachedState ? 'CACHED' : 'NONE'})...`);
    this.context = await this.browser.newContext(contextOptions);
    console.log('  [pw] Browser context created');

    this.page = await this.context.newPage();
    console.log('  [pw] New page opened');

    const isCachedLogin = await this.validateCachedSession();

    if (!isCachedLogin) {
      await this.performFreshLogin();
    }
  }

  /**
   * Navigates to a URL, waits for document load and (on the new `/pulls/search`
   * dashboard) for list markers to attach, then returns the full page HTML.
   */
  async getPageHTML(url: string): Promise<string> {
    const html = await this.loadPullsPageWithRecovery(url);
    return html;
  }

  /**
   * After `goto(..., domcontentloaded)`, wait for the `load` event, then — only for
   * the React search dashboard — for `results-count` or a row link so empty and
   * non-empty lists both resolve without a fixed sleep (Playwright-recommended
   * condition waits). Legacy `/pulls?q=` and repo `/pulls` tabs rely on `load` only.
   */
  private async settleAfterPullsNavigation(requestedUrl: string): Promise<void> {
    await this.page.waitForLoadState('load', { timeout: 25_000 });
    if (!requestedUrl.includes('/pulls/search')) return;

    // Non-empty `/pulls/search` can render both `results-count` and row title links.
    // `locator.or()` matches *all* union members, so waitFor hits strict-mode (2+ nodes).
    // Comma CSS + `.first()` waits until either signal exists while resolving to one element.
    const searchSurface = this.page.locator(
      '[data-testid="results-count"], [data-testid="listitem-title-link"]',
    ).first();
    await searchSurface.waitFor({ state: 'attached', timeout: 20_000 });
  }

  /**
   * `goto` + {@link settleAfterPullsNavigation}, then snapshot URL/title/HTML.
   */
  private async navigateToUrlAndCapture(requestedUrl: string): Promise<{
    html: string;
    title: string;
    finalUrl: string;
  }> {
    await this.page.goto(requestedUrl, GOTO_OPTS);
    console.log('  [navigate] Waiting for load / pulls surface readiness...');
    await this.settleAfterPullsNavigation(requestedUrl);
    const finalUrl = this.page.url();
    const title = await this.page.title();
    const html = await this.page.content();
    return { html, title, finalUrl };
  }

  /**
   * Loads `url`, with one automatic recovery if global `/pulls` returns GitHub’s
   * “Page not found” shell (stale `storageState`, incomplete account switcher, etc.).
   * Re-establishes context via profile → retry; persists cookies when recovery fixes it.
   */
  private async loadPullsPageWithRecovery(url: string): Promise<string> {
    console.log(`  [navigate] Going to ${url} ...`);
    let { html, title: pageTitle, finalUrl: pageUrl } = await this.navigateToUrlAndCapture(url);

    console.log(`  [navigate] Landed on: ${pageUrl}`);
    console.log(`  [navigate] Page title: "${pageTitle}"`);
    console.log(`  [html] Captured page HTML: ${html.length} bytes`);

    const isPullsRoute = url.includes('/pulls');
    const looks404 =
      isPullsRoute &&
      (isGitHubPageNotFoundDocument(html) || isGitHubPageNotFoundTitle(pageTitle));

    if (looks404 && this._isLoggedIn) {
      console.warn(
        '  [navigate] Global pulls URL returned GitHub’s Page-not-found shell — recovering session (profile/home + single retry)...'
      );
      await this.refreshActiveUserContextForStaleSession();
      console.log(`  [navigate] Retrying: ${url}`);
      ({ html, title: pageTitle, finalUrl: pageUrl } = await this.navigateToUrlAndCapture(url));
      console.log(`  [navigate] After recovery — landed on: ${pageUrl}`);
      console.log(`  [navigate] After recovery — page title: "${pageTitle}"`);
      console.log(`  [html] Captured page HTML after recovery: ${html.length} bytes`);

      const still404 =
        isGitHubPageNotFoundDocument(html) || isGitHubPageNotFoundTitle(pageTitle);
      if (still404) {
        throw new Error(
          `[canary] GitHub still returned "Page not found" for global pulls after session recovery. ` +
            `Delete ${this.options.stateFile} locally, or in CI run the workflow with "force fresh login". ` +
            `This is a browser/session issue, not a parser regression.`
        );
      }

      try {
        await this.context.storageState({ path: this.options.stateFile });
        console.log(`  [state] Updated ${this.options.stateFile} after pulls 404 recovery (fixes next run’s cache)`);
      } catch (e) {
        console.warn(`  [state] Could not persist storage after recovery: ${e}`);
      }
    }

    return html;
  }

  /**
   * Opens the bot profile (or github.com) so an active user context exists before `/pulls`.
   * Same idea as {@link resolveAccountSwitcherIfPresent} but for cached sessions that 404 on pulls.
   */
  private async refreshActiveUserContextForStaleSession(): Promise<void> {
    const username = this.options.username;
    const profileUrl = `${GITHUB_BASE_URL}/${encodeURIComponent(username)}`;
    try {
      await this.page.goto(profileUrl, GOTO_OPTS);
      const title = await this.page.title();
      if (!isGitHubPageNotFoundTitle(title)) {
        console.log(`  [navigate] Recovery: opened ${profileUrl}`);
        return;
      }
      console.warn(`  [navigate] Recovery: profile URL still Page not found — trying ${GITHUB_BASE_URL}`);
    } catch (err) {
      console.warn(`  [navigate] Recovery: profile navigation failed: ${err}`);
    }

    await this.page.goto(GITHUB_BASE_URL, GOTO_OPTS);
    console.log(`  [navigate] Recovery: opened ${GITHUB_BASE_URL}`);
  }

  /**
   * Closes this session's context (and browser only when this instance launched it).
   */
  async close(): Promise<void> {
    const { usernameEnvHint } = this.options;
    console.log(`\n── Tier 2: afterAll — Closing Playwright (${usernameEnvHint}) ──`);
    await this.context?.close();
    console.log('  [pw] Browser context closed');
    if (this.ownsBrowser) {
      await this.browser?.close();
      console.log('  [pw] Browser closed');
    }
    console.log('── Tier 2: afterAll — Done ──\n');
  }

  // ── Private: session validation ──────────────────────────────────────

  /**
   * Uses redirect behaviour — not DOM inspection — to check if cached
   * cookies are still valid. If GitHub redirects /login away from /login,
   * the session is alive. This avoids fragile selectors that break when
   * GitHub tweaks their login page markup.
   */
  private async validateCachedSession(): Promise<boolean> {
    console.log('  [state] Validating session — navigating to https://github.com/login ...');
    await this.page.goto('https://github.com/login', GOTO_OPTS);

    const landedUrl = this.page.url();
    if (landedUrl !== 'https://github.com/login') {
      console.log(`  ✓ [state] Cached session VALID — redirected to: ${landedUrl}`);
      this._isLoggedIn = true;
      console.log('── Tier 2: beforeAll — Using cached session ──\n');
      return true;
    }

    const loginHtml = await this.page.content();
    if (!isGitHubLoggedOutHtmlShell(loginHtml, landedUrl)) {
      console.log(
        '  ✓ [state] Cached session VALID — HTML shows authenticated shell despite /login URL (redirect probe alone can miss auth drift)'
      );
      this._isLoggedIn = true;
      console.log('── Tier 2: beforeAll — Using cached session ──\n');
      return true;
    }

    console.log('  [state] Cached session EXPIRED or missing — on login page');
    return false;
  }

  // ── Private: fresh login ─────────────────────────────────────────────

  private async performFreshLogin(): Promise<void> {
    const { username, password, stateFile, usernameEnvHint } = this.options;
    console.log('  [login] Proceeding with fresh login flow...');

    console.log('  [login] Waiting for #login_field selector...');
    await this.page.waitForSelector('#login_field', { timeout: 10_000 });
    console.log('  [login] Login form found');

    console.log(`  [login] Filling username: ${username}`);
    await this.page.fill('#login_field', username);

    console.log('  [login] Filling password: ****');
    await this.page.fill('#password', password);

    console.log('  [login] Clicking submit button...');
    await this.page.click('input[type="submit"], input[name="commit"]');

    console.log('  [login] Waiting for post-login page to load...');
    await this.page.waitForLoadState('domcontentloaded', { timeout: 15_000 });

    const postLoginUrl = this.page.url();
    const postLoginTitle = await this.page.title();
    const postLoginHtml = await this.page.content();

    console.log(`  [login] Post-login URL: ${postLoginUrl}`);
    console.log(`  [login] Post-login page title: "${postLoginTitle}"`);
    console.log(`  [login] Post-login HTML length: ${postLoginHtml.length} bytes`);

    // GitHub may challenge with device verification or 2FA after valid
    // credentials. We check multiple signals because GitHub ships the
    // challenge under varying URLs and DOM structures.
    const isDeviceVerification =
      postLoginUrl.includes('/sessions/') ||
      postLoginUrl.includes('/two-factor') ||
      postLoginHtml.includes('id="device-verification-prompt"') ||
      postLoginHtml.includes('Device verification') ||
      postLoginHtml.includes('Two-factor authentication');

    if (isDeviceVerification) {
      const shouldContinue = await this.handleDeviceVerification(postLoginUrl, postLoginTitle);
      if (!shouldContinue) return;
    }

    // Detect incorrect credentials — must come after device-verification
    // handling because a successful OTP submission may redirect through
    // /login momentarily. Use pathname only: query strings (e.g. return_to=…/login)
    // must not be treated as "still on /login".
    let loginPath = '';
    try {
      loginPath = new URL(postLoginUrl).pathname;
    } catch {
      loginPath = postLoginUrl;
    }
    const isLoginError =
      loginPath === '/login' ||
      loginPath.startsWith('/login/') ||
      postLoginHtml.includes('Incorrect username or password');

    if (isLoginError) {
      console.error(
        '\n  ✗ [login] LOGIN FAILED — incorrect username or password\n' +
          `    Post-login URL: ${postLoginUrl}\n` +
          `    Page title: "${postLoginTitle}"\n` +
          `    Action: Verify ${usernameEnvHint} and GH_CANARY_PASSWORD secrets.\n`,
      );
      return;
    }

    await this.resolveAccountSwitcherIfPresent(username);

    this._isLoggedIn = true;
    console.log(`  ✓ [login] Successfully logged in as @${username} (fresh login)`);

    console.log(`  [state] Saving session cookies to ${stateFile}...`);
    await this.context.storageState({ path: stateFile });
    console.log(`  [state] Session state saved`);

    console.log('── Tier 2: beforeAll — Fresh login complete ──\n');
  }

  /**
   * After password login GitHub may land on `/switch_account` ("Your accounts").
   * Saving storage in that state leaves global `/pulls` as "Page not found" until
   * an account is active. Opening the bot’s profile establishes the session.
   */
  private async resolveAccountSwitcherIfPresent(username: string): Promise<void> {
    if (!this.page.url().includes('switch_account')) return;

    console.log(
      '  [login] Account switcher detected — activating session (required for global /pulls)...'
    );
    const profileUrl = `${GITHUB_BASE_URL}/${encodeURIComponent(username)}`;
    try {
      await this.page.goto(profileUrl, GOTO_OPTS);
      const title = await this.page.title();
      if (!/Page not found/i.test(title)) {
        console.log(`  [login] Opened ${profileUrl} — session context established`);
        return;
      }
      console.warn(`  [login] Profile URL returned Page not found — trying github.com home`);
    } catch (err) {
      console.warn(`  [login] Profile navigation failed: ${err}`);
    }

    await this.page.goto(GITHUB_BASE_URL, GOTO_OPTS);
    console.log(`  [login] Opened ${GITHUB_BASE_URL} as fallback after account switcher`);
  }

  // ── Private: device verification ─────────────────────────────────────

  /**
   * Handles GitHub's device-verification challenge by fetching the OTP
   * from the canary bot's Gmail inbox and submitting it.
   *
   * Returns true if verification succeeded and login should continue,
   * or false if it failed and the caller should bail out.
   */
  private async handleDeviceVerification(
    postLoginUrl: string,
    postLoginTitle: string,
  ): Promise<boolean> {
    console.log(
      '\n  ⚠ [login] DEVICE VERIFICATION DETECTED\n' +
        `    Post-login URL: ${postLoginUrl}\n` +
        `    Page title: "${postLoginTitle}"`,
    );

    if (!HAS_GMAIL_SECRETS) {
      console.warn(
        '  [login] GMAIL secrets not configured — cannot auto-resolve device verification.\n' +
          '    Tier 2 tests will be skipped.\n' +
          '    Action: Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN secrets,\n' +
          '    or manually approve the device from the canary bot email.\n',
      );
      return false;
    }

    console.log('  [login] Gmail secrets available — starting OTP extraction via Gmail API...');

    const otpCode = await getGitHubVerificationCode();
    console.log(`  [login] Received OTP code: ${otpCode}`);

    // The verification form uses a specific action URL and a numeric
    // input with id="otp". We locate both to be resilient to minor
    // DOM reshuffles while staying specific enough to avoid false matches.
    console.log('  [login] Waiting for the device verification form...');
    const verifyForm = this.page.locator('form[action="/sessions/verified-device"]');
    await verifyForm.waitFor({ state: 'visible', timeout: 10_000 });
    console.log('  [login] Verification form found');

    const otpInput = verifyForm.locator('input#otp');
    await otpInput.waitFor({ state: 'visible', timeout: 5_000 });
    console.log('  [login] OTP input (#otp) visible — filling code...');

    // pressSequentially with a delay mimics human typing cadence —
    // fill() sets the value instantly which some bot-detection may flag.
    await otpInput.pressSequentially(otpCode, { delay: 100 });
    console.log('  [login] OTP code entered.');

    console.log('  [login] Waiting for GitHub to process the form...');

    // Some GitHub builds auto-submit on 6 digits; others require Enter.
    // We try the auto-submit path first, then fall back to explicit Enter.
    try {
      await this.page.waitForURL((url) => !url.toString().includes('verified-device'), {
        timeout: 10_000,
      });
      console.log('  [login] Navigation completed successfully!');
    } catch {
      console.log('  [login] Did not auto-navigate, pressing Enter as fallback...');
      await Promise.all([
        this.page.waitForURL((url) => !url.toString().includes('verified-device'), {
          timeout: 15_000,
        }),
        otpInput.press('Enter'),
      ]);
      console.log('  [login] Navigation completed after pressing Enter!');
    }

    const postVerifyUrl = this.page.url();
    const postVerifyTitle = await this.page.title();
    console.log(`  [login] Post-verification URL: ${postVerifyUrl}`);
    console.log(`  [login] Post-verification page title: "${postVerifyTitle}"`);

    if (postVerifyUrl.includes('/sessions/') || postVerifyUrl.includes('/login')) {
      console.error(
        '  ✗ [login] Still on verification/login page after OTP submission.\n' +
          `    URL: ${postVerifyUrl}\n` +
          '    The OTP may have been invalid or expired. Tier 2 tests will be skipped.\n',
      );
      return false;
    }

    console.log('  ✓ [login] Device verification passed via Gmail OTP');
    return true;
  }
}
