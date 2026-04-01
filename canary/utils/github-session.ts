/**
 * Playwright-backed GitHub session for Tier 2 canary tests.
 *
 * Encapsulates the full browser lifecycle: launch, session reuse,
 * credential login, device-verification bypass (via Gmail OTP),
 * and authenticated page fetching. The test file only sees a clean
 * `launch() → getPageHTML() → close()` surface.
 */

import fs from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { getGitHubVerificationCode } from './gmail-fetcher';
import {
  CANARY_USERNAME,
  CANARY_PASSWORD,
  HAS_GMAIL_SECRETS,
  REALISTIC_UA,
  STATE_FILE,
} from './config';

export class GitHubSession {
  private browser!: Browser;
  private context!: BrowserContext;
  private page!: Page;
  private _isLoggedIn = false;

  get isLoggedIn(): boolean {
    return this._isLoggedIn;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Spins up Chromium, restores cached cookies if available, and either
   * validates the cached session or performs a full login flow.
   *
   * Intentionally does NOT throw on login failure — it sets `isLoggedIn`
   * to false so individual tests can gracefully skip with a clear log
   * message instead of blowing up the entire suite.
   */
  async launch(): Promise<void> {
    console.log('\n── Tier 2: beforeAll — Starting Playwright session ──');

    const hasCachedState = fs.existsSync(STATE_FILE);
    console.log(`  [state] ${STATE_FILE} exists: ${hasCachedState}`);

    console.log('  [pw] Launching Chromium (headless)...');
    this.browser = await chromium.launch({ headless: true });
    console.log('  [pw] Chromium launched');

    const contextOptions = {
      userAgent: REALISTIC_UA,
      viewport: { width: 1920, height: 1080 } as const,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      ...(hasCachedState ? { storageState: STATE_FILE } : {}),
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
   * Navigates to a URL, waits for GitHub's client-side hydration to
   * finish rendering search results, and returns the full page HTML.
   *
   * The 2 s settle delay exists because GitHub's PR search pages render
   * a server-side shell and then hydrate the actual result rows via JS.
   */
  async getPageHTML(url: string): Promise<string> {
    console.log(`  [navigate] Going to ${url} ...`);
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const pageUrl = this.page.url();
    const pageTitle = await this.page.title();
    console.log(`  [navigate] Landed on: ${pageUrl}`);
    console.log(`  [navigate] Page title: "${pageTitle}"`);

    console.log('  [navigate] Waiting 2s for dynamic content to settle...');
    await this.page.waitForTimeout(2_000);

    const html = await this.page.content();
    console.log(`  [html] Captured page HTML: ${html.length} bytes`);

    return html;
  }

  async close(): Promise<void> {
    console.log('\n── Tier 2: afterAll — Closing Playwright ──');
    await this.context?.close();
    console.log('  [pw] Browser context closed');
    await this.browser?.close();
    console.log('  [pw] Browser closed');
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
    await this.page.goto('https://github.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    if (this.page.url() !== 'https://github.com/login') {
      console.log(`  ✓ [state] Cached session VALID — redirected to: ${this.page.url()}`);
      this._isLoggedIn = true;
      console.log('── Tier 2: beforeAll — Using cached session ──\n');
      return true;
    }

    console.log('  [state] Cached session EXPIRED or missing — on login page');
    return false;
  }

  // ── Private: fresh login ─────────────────────────────────────────────

  private async performFreshLogin(): Promise<void> {
    console.log('  [login] Proceeding with fresh login flow...');

    console.log('  [login] Waiting for #login_field selector...');
    await this.page.waitForSelector('#login_field', { timeout: 10_000 });
    console.log('  [login] Login form found');

    console.log(`  [login] Filling username: ${CANARY_USERNAME}`);
    await this.page.fill('#login_field', CANARY_USERNAME);

    console.log('  [login] Filling password: ****');
    await this.page.fill('#password', CANARY_PASSWORD);

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
    // /login momentarily.
    const isLoginError =
      postLoginUrl.includes('/login') ||
      postLoginHtml.includes('Incorrect username or password');

    if (isLoginError) {
      console.error(
        '\n  ✗ [login] LOGIN FAILED — incorrect username or password\n' +
          `    Post-login URL: ${postLoginUrl}\n` +
          `    Page title: "${postLoginTitle}"\n` +
          '    Action: Verify GH_CANARY_USERNAME and GH_CANARY_PASSWORD secrets.\n',
      );
      return;
    }

    this._isLoggedIn = true;
    console.log(`  ✓ [login] Successfully logged in as @${CANARY_USERNAME} (fresh login)`);

    console.log(`  [state] Saving session cookies to ${STATE_FILE}...`);
    await this.context.storageState({ path: STATE_FILE });
    console.log(`  [state] Session state saved`);

    console.log('── Tier 2: beforeAll — Fresh login complete ──\n');
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
