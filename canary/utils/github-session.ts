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
import { GITHUB_BASE_URL } from '@common/constants';
import { isGitHubLoggedOutHtmlShell } from '@common/github-html-session';
import {
  isGitHubPageNotFoundDocument,
  isGitHubPageNotFoundTitle,
} from './github-page-signals';
import { stopAndSaveTrace, writeCanaryFailureSnapshot } from './failure-snapshot';
import { getGitHubVerificationCode } from './gmail-fetcher';
import { HAS_GMAIL_SECRETS, REALISTIC_UA } from './config';

/** Shared `page.goto` options for GitHub navigations (fast first paint, bounded timeout). */
const GOTO_OPTS = { waitUntil: 'domcontentloaded' as const, timeout: 30_000 };
const RECOVERY_BACKOFF_MS = [2_000, 5_000] as const;

type PullsShell = 'ok' | 'page-not-found' | 'logged-out';

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
    await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    console.log('  [trace] Playwright tracing started');

    this.page = await this.context.newPage();
    console.log('  [pw] New page opened');

    const isCachedLogin = await this.validateCachedSession();

    if (!isCachedLogin) {
      await this.performFreshLogin();
    }
  }

  /**
   * Navigates to a pulls URL, classifies GitHub error shells before parser work,
   * and returns the authenticated page HTML.
   */
  async getPageHTML(url: string): Promise<string> {
    const html = await this.loadPullsPageWithRecovery(url);
    return html;
  }

  private classifyPullsShell(html: string, title: string, finalUrl: string): PullsShell {
    if (isGitHubPageNotFoundDocument(html) || isGitHubPageNotFoundTitle(title)) {
      return 'page-not-found';
    }
    if (isGitHubLoggedOutHtmlShell(html, finalUrl)) return 'logged-out';
    return 'ok';
  }

  /**
   * Waits for the React search dashboard only after the HTML shell is known-good.
   * That keeps 404/login shells classified from captured HTML instead of timing
   * out on selectors that can never exist there.
   */
  private async settleSearchSurface(): Promise<void> {
    // Non-empty `/pulls/search` can render both `results-count` and row title links.
    // `locator.or()` matches *all* union members, so waitFor hits strict-mode (2+ nodes).
    // Comma CSS + `.first()` waits until either signal exists while resolving to one element.
    const searchSurface = this.page.locator(
      '[data-testid="results-count"], [data-testid="listitem-title-link"]',
    ).first();
    await searchSurface.waitFor({ state: 'attached', timeout: 20_000 });
  }

  /**
   * `goto`, capture URL/title/HTML, classify the shell, then settle the search UI
   * only for an authenticated `/pulls/search` document.
   */
  private async navigateToUrlAndCapture(requestedUrl: string): Promise<{
    html: string;
    title: string;
    finalUrl: string;
    shell: PullsShell;
  }> {
    await this.page.goto(requestedUrl, GOTO_OPTS);
    console.log('  [navigate] Waiting for document load...');
    await this.page.waitForLoadState('load', { timeout: 25_000 });
    const finalUrl = this.page.url();
    const title = await this.page.title();
    const html = await this.page.content();
    const shell = this.classifyPullsShell(html, title, finalUrl);
    console.log(`  [navigate] Shell classification: ${shell}`);

    if (shell === 'ok' && requestedUrl.includes('/pulls/search')) {
      console.log('  [navigate] Waiting for search surface readiness...');
      try {
        await this.settleSearchSurface();
      } catch (error) {
        const label = this.failureLabelForUrl(requestedUrl, 'ok-search-surface-unreachable');
        writeCanaryFailureSnapshot(html, label);
        await stopAndSaveTrace(this.context, label);
        console.error(
          '  [navigate] Search shell classified ok, but expected search surface selectors did not attach. ' +
            'HTML + Playwright trace saved under canary/.',
        );
        throw error;
      }
    }

    return { html, title, finalUrl, shell };
  }

  /**
   * Loads `url`, with bounded in-session recovery if global `/pulls` returns
   * GitHub’s “Page not found” shell. Vitest owns whole-test retries; this only
   * handles the known active-account cookie flake without re-login pressure.
   */
  private async loadPullsPageWithRecovery(url: string): Promise<string> {
    console.log(`  [navigate] Going to ${url} ...`);
    let { html, title: pageTitle, finalUrl: pageUrl, shell } =
      await this.navigateToUrlAndCapture(url);
    let recoveredSession = false;
    let recoveryAttempts = 0;

    console.log(`  [navigate] Landed on: ${pageUrl}`);
    console.log(`  [navigate] Page title: "${pageTitle}"`);
    console.log(`  [html] Captured page HTML: ${html.length} bytes`);

    for (let attempt = 0; attempt < RECOVERY_BACKOFF_MS.length; attempt++) {
      if (shell !== 'page-not-found' || !this._isLoggedIn) break;

      console.warn(`  [navigate] 404 shell on ${url} — recovery attempt ${attempt + 1}`);
      await this.refreshActiveUserContextForStaleSession();
      await new Promise((resolve) => setTimeout(resolve, RECOVERY_BACKOFF_MS[attempt]));
      console.log(`  [navigate] Retrying: ${url}`);
      ({ html, title: pageTitle, finalUrl: pageUrl, shell } =
        await this.navigateToUrlAndCapture(url));
      recoveredSession = true;
      recoveryAttempts = attempt + 1;
      console.log(`  [navigate] After recovery — landed on: ${pageUrl}`);
      console.log(`  [navigate] After recovery — page title: "${pageTitle}"`);
      console.log(`  [html] Captured page HTML after recovery: ${html.length} bytes`);
    }

    if (shell === 'page-not-found') {
      const label = this.failureLabelForUrl(url, 'page-not-found-after-recovery');
      writeCanaryFailureSnapshot(html, label);
      await stopAndSaveTrace(this.context, label);
      throw new Error(
        `[canary] /pulls returns "Page not found" after ${recoveryAttempts} recovery attempts ` +
          `(multi-account active-cookie likely missing). HTML + Playwright trace saved under canary/.`,
      );
    }

    if (shell === 'logged-out') {
      const label = this.failureLabelForUrl(url, 'logged-out');
      writeCanaryFailureSnapshot(html, label);
      await stopAndSaveTrace(this.context, label);
      throw new Error(
        `[canary] ${url} returned a logged-out GitHub shell while Tier 2 believed it was authenticated. ` +
          `HTML + Playwright trace saved under canary/.`,
      );
    }

    if (recoveredSession) {
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
   * 404 on `/pulls` means the active-account cookie was lost or never set.
   * Only GitHub's account-switch endpoint re-mints that server-side routing cookie.
   */
  private async refreshActiveUserContextForStaleSession(): Promise<void> {
    await this.activateAccountForRouting(this.options.username);
  }

  private failureLabel(reason: string): string {
    return `${reason}-${this.accountLabel()}`;
  }

  private failureLabelForUrl(url: string, reason: string): string {
    const chapter = url.includes('/pulls/search') ? 'chapter2' : 'chapter1';
    return `${chapter}-${reason}-${this.accountLabel()}`;
  }

  private accountLabel(): string {
    return this.options.usernameEnvHint
      .replace(/^GH_CANARY_USERNAME_/, '')
      .toLowerCase();
  }

  /**
   * Closes this session's context (and browser only when this instance launched it).
   */
  async close(): Promise<void> {
    const { usernameEnvHint } = this.options;
    console.log(`\n── Tier 2: afterAll — Closing Playwright (${usernameEnvHint}) ──`);
    await stopAndSaveTrace(this.context, `${usernameEnvHint}-session-close`);
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

    await this.activateAccountForRouting(username);

    this._isLoggedIn = true;
    console.log(`  ✓ [login] Successfully logged in as @${username} (fresh login)`);

    console.log(`  [state] Saving session cookies to ${stateFile}...`);
    await this.context.storageState({ path: stateFile });
    console.log(`  [state] Session state saved`);

    console.log('── Tier 2: beforeAll — Fresh login complete ──\n');
  }

  /**
   * Multi-account routing invariant: global `/pulls` resolves via an active-account
   * cookie set by `/login/account_switch`. Opening `/<username>` reads that profile
   * but does not promote it for global surfaces like `/pulls` or `/notifications`.
   */
  private async activateAccountForRouting(username: string): Promise<void> {
    console.log(`  [login] Activating @${username} for global GitHub routing...`);
    const switchUrl = `${GITHUB_BASE_URL}/login/account_switch?login=${encodeURIComponent(username)}`;
    const responsePromise = this.page.waitForResponse(
      (response) => response.url().includes('/login/account_switch') && response.status() < 400,
      { timeout: 15_000 },
    ).catch((error: unknown) => error);

    const switchResponse = await this.page.goto(switchUrl, GOTO_OPTS);
    const switchResponseSeen = await responsePromise;
    if (switchResponseSeen instanceof Error) {
      const status = switchResponse?.status() ?? 'unknown';
      console.warn(`  [login] Account-switch response wait did not observe <400 status (goto status: ${status})`);
    }

    await this.page.goto(`${GITHUB_BASE_URL}/pulls`, GOTO_OPTS);
    await this.page.waitForLoadState('load', { timeout: 25_000 });
    const probeFinalUrl = this.page.url();
    const probeTitle = await this.page.title();
    const probeHtml = await this.page.content();
    const probeShell = this.classifyPullsShell(probeHtml, probeTitle, probeFinalUrl);

    if (probeShell !== 'ok') {
      const label = this.failureLabel('account-activation-failed');
      writeCanaryFailureSnapshot(probeHtml, label);
      await stopAndSaveTrace(this.context, label);
      const shellDescription = probeShell === 'page-not-found' ? '404' : probeShell;
      throw new Error(
        `[canary] Account activation failed: /pulls still ${shellDescription} after ` +
          `/login/account_switch?login=${username}. Bot may not be in this session's account list, ` +
          `or GitHub changed activation semantics.`,
      );
    }

    console.log(`  ✓ [login] Account routing active for @${username} (/pulls probe ok)`);
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
