# DOM Change Runbook

When the canary test fails because GitHub changed their DOM, follow this runbook to diagnose, fix, test, and deploy updated regex patterns.

---

## How the System Works

The extension parses GitHub HTML pages using regex patterns to extract PR data. These patterns exist in two places:

1. **Bundled defaults** — `extension/common/default-patterns.ts` ships with every extension build. The canary CI also uses these.
2. **Remote config** — `patterns.json` hosted at <https://dragosdev-code.github.io/pr-live-config/patterns.json> (source repo: <https://github.com/dragosdev-code/pr-live-config>). The extension fetches this every 6 hours and applies it if the `version` number is higher than what it has locally.

**When GitHub changes their DOM**, the regex patterns stop matching, the parser throws `ParserBreakageError`, and users see a "parser breakage" banner. The canary CI catches this within an hour and fires a Discord alert.

**To fix it**, you update the regex in **both** the remote `patterns.json` (immediate hot-fix for live users) and the bundled `default-patterns.ts` (for future builds and canary CI).

### Key Files

| File | Purpose |
|------|---------|
| `extension/common/default-patterns.ts` | Bundled fallback patterns + `compilePatterns()` helper |
| `extension/common/pattern-types.ts` | TypeScript interfaces for all pattern shapes (`PatternRegistry`, `CompiledPatterns`) |
| `extension/common/pattern-registry-schema.ts` | Valibot runtime schema — validates remote JSON and cached storage **before** compilation; produces dotted-path error messages |
| `extension/common/__tests__/pattern-registry-schema.test.ts` | 48 unit tests for the schema validator — run after any `patterns.json` edit to confirm the extension will accept it |
| `extension/common/__tests__/schema-test-helpers.ts` | Factory helpers (`makeValidRemoteConfig`, `makePatternEntry`, etc.) used by the schema tests |
| `extension/background/services/GitHubHTMLParser.ts` | The parser that consumes compiled patterns — zero hardcoded selectors |
| `extension/background/services/PatternRegistryService.ts` | Fetches remote `patterns.json`, caches in `chrome.storage.local`, 6-hour TTL |
| `extension/common/constants.ts` | `REMOTE_PATTERNS_URL`, `PATTERN_REFRESH_TTL_MS` (6h) |
| `extension/common/errors.ts` | `ParserBreakageError` definition |
| `canary/parser.canary.test.ts` | Canary test suite (Tier 1: public, Tier 2: authenticated) |
| `canary/utils/assertions.ts` | `parseAndAssert()`, `assertPRValid()`, GitHub Status API check |
| `canary/utils/config.ts` | Canary targets (URLs), HTTP headers, credential detection |
| `.github/workflows/canary-parser-test.yml` | Hourly CI cron, Discord alert on failure |

### Remote Config (`patterns.json`)

- **URL**: <https://dragosdev-code.github.io/pr-live-config/patterns.json>
- **Source repo**: <https://github.com/dragosdev-code/pr-live-config> (push to `main`, GitHub Pages auto-deploys within 1-2 minutes)
- **Schema**: `{ version: number, minExtensionVersion: string, updatedAt: string, patterns: PatternRegistry }`
- **Version gating**: `PatternRegistryService` skips the update if `config.version <= this.registryVersion` — you **must bump `version`** for any change to take effect.
- **Runtime validation**: Before compiling, the service runs `validateRemoteConfig()` (from `extension/common/pattern-registry-schema.ts`) against the raw JSON. If the structure is invalid, it is rejected immediately with a dotted-path error message logged to the extension console — e.g., `prRowSelectors.0.type: Expected 'class' | 'attribute' | 'balanced-div', received 'xpath'`. The current compiled patterns are preserved unchanged. This is a **structural** check; regex syntax is still validated by `safeCompile` (a second defense layer) after the schema passes.
- **Two version numbers to keep straight**:
  - `version` (integer, in `patterns.json`) — the **config revision**. Increment by 1 every time you push updated patterns. Starts at 1; the extension stores 0 locally for "no remote config loaded yet."
  - `minExtensionVersion` (semver string, in `patterns.json`) — the **minimum extension build** that should apply this config. Set this if new patterns require new extension code; leave it at `"0.0.0"` if all builds can safely use them. This is compared against `chrome.runtime.getManifest().version`, not against the config `version` number.

---

## Step 1 — Confirm It Is a DOM Change

When you receive a Discord alert (or see a failing canary run):

1. **Read the Discord message.** If it says "GitHub Outage Detected (Not a DOM Change)" — wait for GitHub to recover, no action needed.
2. **Check manually**: <https://www.githubstatus.com>
   - Status is `none` (all operational) → this is a DOM change. Continue to Step 2.
   - Status is `minor` / `major` / `critical` → wait for recovery. The canary retries once and runs hourly, so it will self-heal.
3. **Check the CI logs** (link is in the Discord embed). The test output includes:
   - `[status] GitHub Status API reports degraded service` — if you see this, it is an outage.
   - `The parser is likely broken due to a GitHub DOM change.` — proceed below.

---

## Step 2 — Identify Which Pattern Broke

Open the failed GitHub Actions run. The CI logs tell you exactly what broke:

### Error: `ParserBreakageError` thrown

The page was not recognized at all. This means `pageRecognition.hasPRContent` did not match, AND none of the fallback page-recognition patterns matched either.

**Likely cause**: GitHub changed the fundamental page structure so thoroughly that even the presence of `/pull/\d+` links is gone or the HTML is served differently.

### Error: `0 PRs extracted` on a `requireResults: true` target

The page was recognized (no throw), but no PR rows were found. This means `prRowSelectors` all missed.

**Likely cause**: GitHub renamed the CSS class on PR row containers (e.g., `js-issue-row` → something else).

### Error: Assertion failure on a specific field

The CI log will show a message like:

```
[Public: Open PRs (facebook/react)] PR title
```

This tells you the `prLink` patterns broke. Similarly:

| Assertion message contains | Broken pattern key |
|---|---|
| `PR url` | `prLink` |
| `PR title` / `PR title length` | `prLink` |
| `PR number` | `prNumber` |
| `repoName` / `repoName not fallback` | `repoName` |
| `author array` / `first author login` | `author` |
| `PR type` | `prType` |
| `createdAt` | `timestamp` |
| Avatar coverage warning (soft) | `assigneeAvatar` |

### HTML Snippet in Logs

When the parser throws or returns 0 PRs, the canary dumps the **first 5,000 characters of the fetched HTML** to stderr. This is your primary debugging artifact — use it to see what GitHub is actually serving.

---

## Step 3 — Get a Live HTML Sample

You need a copy of the raw HTML to craft new regex against.

### Option A — curl (fastest, matches what canary does)

```bash
curl -s \
  -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" \
  -H "Accept-Language: en-US,en;q=0.9" \
  -H "Cache-Control: no-cache" \
  -H "Sec-Fetch-Dest: document" \
  -H "Sec-Fetch-Mode: navigate" \
  -H "Sec-Fetch-Site: none" \
  -H "Sec-Fetch-User: ?1" \
  https://github.com/facebook/react/pulls > /tmp/github-sample.html
```

These headers match the `BROWSER_HEADERS` defined in `canary/utils/config.ts`. GitHub blocks non-browser User-Agents.

### Option B — browser View Source

Navigate to <https://github.com/facebook/react/pulls> → press `Ctrl+U` (View Source) → save to disk as `github-sample.html`.

### Option C — browser DevTools

Navigate to the URL → press `F12` → Elements tab. Inspect the PR list markup to see current class names, attributes, and structure.

**Save the HTML to a file** — you will need it for local testing in the next steps.

---

## Step 4 — Reproduce Locally

Run the canary suite against live GitHub to confirm you see the same failure:

```bash
npm run canary:test
```

This runs `vitest run --config vitest.canary.config.ts` which targets `canary/**/*.canary.test.ts` with a 120-second test timeout and 1 retry.

The canary uses `DEFAULT_COMPILED_PATTERNS` from `extension/common/default-patterns.ts` — the exact same bundled patterns as CI.

---

## Step 5 — Craft the New Regex

### Understanding the pattern shape

Every pattern follows this TypeScript interface (from `extension/common/pattern-types.ts`):

```typescript
interface PatternEntry {
  regex: string;      // regex source (no delimiters — NOT /pattern/, just pattern)
  flags: string;      // e.g. "gi", "i", ""
  captureGroups?: Record<string, number>;  // named group → capture index mapping
}
```

When compiled, this becomes `new RegExp(entry.regex, entry.flags)`.

### Test a single regex against saved HTML

Create a quick script or run in Node REPL:

```typescript
// scratch.ts — run with: npx tsx scratch.ts
import { readFileSync } from 'fs';

const html = readFileSync('/tmp/github-sample.html', 'utf8');

// Example: testing a new prRowSelector regex
const newPattern = /<div\b[^>]*\bclass="[^"]*\bjs-issue-row\b[^"]*"[^>]*>/gi;
const matches = [...html.matchAll(newPattern)];
console.log(`Matched ${matches.length} PR rows`);
if (matches.length > 0) {
  console.log('First match:', matches[0][0].slice(0, 200));
}
```

### Test the full parser with your new pattern

Edit the pattern directly in `extension/common/default-patterns.ts`, then run:

```typescript
// scratch-full.ts — run with: npx tsx scratch-full.ts
import { readFileSync } from 'fs';
import { DEFAULT_COMPILED_PATTERNS } from './extension/common/default-patterns';
import { GitHubHTMLParser } from './extension/background/services/GitHubHTMLParser';

const html = readFileSync('/tmp/github-sample.html', 'utf8');
try {
  const prs = GitHubHTMLParser.parseFromHTML(html, 'https://github.com', DEFAULT_COMPILED_PATTERNS);
  console.log(`Parsed ${prs.length} PRs`);
  if (prs.length > 0) {
    console.log('First PR:', JSON.stringify(prs[0], null, 2));
  }
} catch (error) {
  console.error('Parser threw:', error);
}
```

### Patterns most likely to break

These target GitHub-specific CSS classes and attributes that GitHub may rename:

| Pattern key | What it targets | Current regex (abbreviated) |
|---|---|---|
| `prRowSelectors[0]` | Main PR row container | `js-issue-row` class |
| `prRowSelectors[1]` | Alternative row class | `Box-row` class |
| `prRowSelectors[2]` | Alternative row class | `issue-list-item` class |
| `pageRecognition.knownSelectors` | Page recognition | `js-issue-row\|Box-row\|issue-list-item\|data-hovercard-type` |
| `prLink[0]` | PR link with title | `markdown-title\|js-navigation-open\|Link--primary` class |
| `prType[0-2]` | PR type from aria-labels | `aria-label="...Draft/Open/Merged Pull Request..."` |
| `prType[3-7]` | PR type from icons/colors | `octicon-git-pull-request-draft`, `color-fg-draft`, etc. |
| `assigneeAvatar.stackContainer` | Assignee stack | `AvatarStack-body` class + `aria-label="Assigned to"` |

### Tips for writing resilient regex

- Prefer matching on `data-*` attributes and `aria-label` values over CSS classes — semantic attributes change less often.
- Use non-greedy quantifiers (`.*?`) to avoid runaway matches across PR rows.
- Test against multiple pages: `facebook/react/pulls` and `microsoft/vscode/pulls` at minimum.
- Keep the `captureGroups` mapping correct — the parser relies on these indices to extract named fields.

---

## Step 6 — Update `default-patterns.ts` and Verify

Edit `extension/common/default-patterns.ts` with the fixed regex.

Then run **both**:

```bash
# Canary tests (against live GitHub)
npm run canary:test

# Unit tests (must not regress)
npm test
```

Both must pass before proceeding.

### What `npm test` checks here

`npm test` runs the schema validator test suite at `extension/common/__tests__/pattern-registry-schema.test.ts` (48 tests across 9 story-chapters). One of those tests — **"Chapter 1: The bundled defaults are always valid"** — imports `DEFAULT_PATTERNS` directly and asserts that it passes `validatePatternRegistry()`. If your edit to `default-patterns.ts` accidentally removes a required field, changes `regex` to a non-string, or empties a required array, this test will fail with the exact dotted path of the problem, e.g.:

```
AssertionError: expected false to be true
    at Chapter 1 > DEFAULT_PATTERNS passes validatePatternRegistry
```

This is the fastest feedback loop — no live network request, no browser, sub-second. If the schema test passes, the validator used by the extension will also accept your bundled defaults.

---

## Step 7 — Deploy to `patterns.json` (Hot-fix for Live Users)

This is the critical step that fixes things for users **without requiring an extension update**.

The flow uses a **staging-first** approach: edit on the `staging` branch, validate the hosted file with the schema smoke test, then promote to `main` (production) once the smoke passes. This prevents broken config from reaching live users.

```
staging branch ──→ smoke test passes? ──→ merge to main ──→ GitHub Pages deploys
     │                    │                                        │
     │                  (no) → fix and retry                       │
     │                                                             ▼
     └─── raw.githubusercontent.com                   dragosdev-code.github.io
          (used by smoke test)                        (used by extension)
```

### 7.1 — Clone or open the config repo

```bash
git clone https://github.com/dragosdev-code/pr-live-config.git
cd pr-live-config
```

Or if you already have it:

```bash
git fetch origin
git checkout staging
git pull origin staging
```

### 7.2 — Edit `patterns.json` on the staging branch

Make your regex changes on the `staging` branch (not `main`). The JSON structure mirrors `PatternRegistry` exactly. Find the broken pattern key and replace the `regex` and/or `flags` values.

**You MUST also:**

1. **Bump `version`** — increment by 1 (e.g., `1` → `2`). The extension skips the update if the version is not strictly greater than what it has locally (see `PatternRegistryService.doFetchRemote()` line: `if (config.version <= this.registryVersion)`).
2. **Update `updatedAt`** — set to current ISO timestamp (e.g., `"2026-04-02T15:00:00Z"`).

Example diff:

```json
{
  "version": 2,
  "minExtensionVersion": "1.0.0",
  "updatedAt": "2026-04-02T15:00:00Z",
  "patterns": {
    "prRowSelectors": [
      {
        "name": "js-issue-row",
        "regex": "<YOUR_NEW_REGEX_HERE>",
        "flags": "gi",
        ...
      }
    ]
  }
}
```

### 7.3 — Validate JSON syntax

```bash
python -m json.tool patterns.json > /dev/null && echo "Valid JSON" || echo "INVALID JSON"
```

Or use `jq`:

```bash
jq . patterns.json > /dev/null && echo "Valid JSON" || echo "INVALID JSON"
```

### 7.3b — Validate against the extension schema (offline)

JSON syntax being valid is necessary but not sufficient. The extension rejects `patterns.json` if its **structure** does not match the `PatternRegistry` schema — even if the JSON parses cleanly. Run the unit test suite from the extension repo to confirm the live extension will accept what you just edited:

```bash
# Run from the extension repo root
npm test
```

This executes `extension/common/__tests__/pattern-registry-schema.test.ts`. The tests mirror exactly what `validateRemoteConfig()` checks at runtime. If any test fails, the output includes the dotted path to the offending field, for example:

```
FAIL  extension/common/__tests__/pattern-registry-schema.test.ts
  Chapter 4: Missing nested structure is caught before compilation
    ✕ rejects when pageRecognition.hasPRContent is missing

AssertionError: expected false to be true (schema rejected an invalid payload)
```

**Common failure reasons when editing `patterns.json`:**

| Symptom | What to check |
|---------|---------------|
| `version: Expected number, received string` | `version` must be a number (`1`), not a string (`"1"`) |
| `version: Value must be >=1` | You set `version: 0`; bump to at least `1` |
| `prRowSelectors.0.type: Invalid value` | `type` must be exactly one of `"class"`, `"attribute"`, `"balanced-div"` |
| `prLink: Array must have >=1 items` | `prLink`, `author`, `timestamp`, `prType`, `prRowSelectors` cannot be empty arrays |
| `assigneeAvatar.avatarImg: Missing field` | A required sub-key of `assigneeAvatar` is absent |
| `prLink.0.captureGroups.url: Value must be >=1` | `captureGroups` values are 1-based group indices; `0` is invalid |
| `pageRecognition.hasPRContent.regex: Expected string` | `regex` must always be a string, never a number, null, or RegExp object |

**This test is the quickest way to confirm the extension will accept your config before you push.** The schema tests run in under a second and require no network access.

### 7.4 — Push to the staging branch

```bash
git add patterns.json
git commit -m "fix: update regex for GitHub DOM change YYYY-MM-DD"
git push origin staging
```

**Do NOT push to `main` yet.** The staging branch is where you validate the hosted file before it reaches production.

### 7.5 — Run the remote schema smoke test against staging

This step validates the **actual hosted file** on the `staging` branch — not your local copy. It fetches the raw file from GitHub, runs the same Valibot schema validation + regex compilation the extension performs at runtime, and catches any issues that the offline tests in 7.3b cannot (e.g., JSON encoding differences between your editor and what GitHub serves).

**Locally:**

```bash
# From the extension repo root (PR-live-extension)
REMOTE_PATTERNS_URL=https://raw.githubusercontent.com/dragosdev-code/pr-live-config/staging/patterns.json \
  npm run test:remote-patterns
```

**Via GitHub Actions (recommended):**

1. Go to **Actions** → **"Remote Patterns Schema Smoke"** → **"Run workflow"**.
2. Check the **"Use staging URL"** checkbox (similar to the canary's "force fresh login" checkbox).
3. Click **"Run workflow"**.

The workflow fetches `patterns.json` from the `staging` branch (`raw.githubusercontent.com`) instead of production (`GitHub Pages`) and runs the full schema + compile validation.

**If the smoke test fails:** fix the issue on the `staging` branch, push again, and re-run. Do not proceed to 7.6 until it passes.

### 7.6 — Promote staging to production

Once the smoke test passes on staging, merge to `main` to deploy via GitHub Pages:

```bash
cd pr-live-config
git checkout main
git pull origin main
git merge staging
git push origin main
```

GitHub Pages auto-deploys within 1-2 minutes.

### 7.7 — Verify production deployment

```bash
curl -s https://dragosdev-code.github.io/pr-live-config/patterns.json | jq '.version'
```

Confirm the version matches what you just promoted.

### 7.8 — Run the smoke test against production

Now validate that the production GitHub Pages URL is serving the correct file:

```bash
# From the extension repo root — no env override needed, defaults to production
npm run test:remote-patterns
```

Or via GitHub Actions: run the **"Remote Patterns Schema Smoke"** workflow **without** checking the staging checkbox (it defaults to production).

**What the smoke test proves vs. what it does not:**

| Test | What it validates | What it does NOT validate |
|------|-------------------|--------------------------|
| Schema smoke (`npm run test:remote-patterns`) | Hosted JSON is structurally valid — correct types, required keys, valid unions, non-empty arrays, capture group indices >= 1, and all regex strings compile via `new RegExp()` | Whether regexes actually *match* live GitHub HTML |
| Canary (`npm run canary:test`) | Regexes match real GitHub PR pages end-to-end (login -> navigate -> parse) | JSON structure (assumes bundled defaults are valid) |

Run **both** after a `patterns.json` change: the smoke test catches typos and schema drift, the canary catches DOM-mismatch regressions.

Both URLs (`REMOTE_PATTERNS_URL` for production and `REMOTE_PATTERNS_STAGING_URL` for staging) are defined as constants in `extension/common/constants.ts` so they stay in sync with the extension.

---

## Step 8 — Commit to the Extension Repo

Back in this repo, commit the updated `extension/common/default-patterns.ts`:

```bash
git add extension/common/default-patterns.ts
git commit -m "fix: update parser patterns for GitHub DOM change YYYY-MM-DD"
git push origin main
```

This ensures:
- Future canary runs use the fixed bundled patterns.
- New extension builds ship the correct defaults.
- The canary and remote config stay in sync.

---

## Step 9 — Verify End-to-End

1. **Canary CI**: Either wait for the next hourly run or trigger manually from GitHub Actions → "Parser Canary Tests" → "Run workflow".
2. **Remote config propagation**: Live extension users will pick up the new `patterns.json` within 6 hours (`PATTERN_REFRESH_TTL_MS` in `extension/common/constants.ts`), or on their next service-worker wake-up. No extension update needed.
3. **UI recovery**: Once the extension successfully parses with the new patterns, `HealthStatusService` clears the breakage signal and the "parser breakage" banner in `src/components/parser-breakage-banner.tsx` disappears automatically.

---

## Quick Reference: Pattern Schema

The full `PatternRegistry` type is defined in `extension/common/pattern-types.ts`. Here is the top-level structure:

```
PatternRegistry
├── pageRecognition
│   ├── hasPRContent        → detects if page has /pull/\d+ links at all
│   ├── knownSelectors      → recognizes known GitHub PR listing classes
│   ├── emptyState          → detects blankslate (0 PRs legitimately)
│   └── noResults           → detects "No results matched" message
├── prRowSelectors[]        → ordered list of row extraction strategies
├── prRowFallback
│   ├── linkScan            → find PR links when no row selector matched
│   └── containerExtract    → extract container around found links
├── prLink[]                → ordered: extract PR URL + title from row HTML
├── prNumber
│   ├── fromUrl             → extract PR number from URL path
│   └── fromElement         → extract PR number from "#N opened" text
├── repoName                → extract "owner/repo" from PR URL
├── author[]                → ordered: extract author login from row HTML
├── assigneeAvatar
│   ├── stackContainer      → find AvatarStack-body div
│   ├── closeTag            → find closing </div>
│   ├── anchorSelector      → find avatar-user anchors inside stack
│   ├── hrefExtract         → extract href from anchor
│   ├── loginFromHrefEncoded → extract login from URL-encoded href
│   ├── loginFromHrefPlain   → extract login from plain href
│   ├── loginFromAlt         → extract login from img alt attribute
│   ├── loginFromAria        → extract login from aria-label
│   └── avatarImg            → extract avatar image src
├── timestamp[]             → ordered: extract datetime from <relative-time>/<time>
└── prType[]                → ordered: detect draft/open/merged from aria-labels and icons
```

---

## AI Agent Instructions

If you are an AI coding agent tasked with fixing a canary failure:

1. **Read the CI logs first** to identify the specific assertion or error. The log contains the HTML snippet.
2. **Fetch a fresh HTML sample** using the curl command from Step 3, Option A. Save it locally.
3. **Identify the broken pattern** using the mapping table in Step 2.
4. **Inspect the HTML** around where PR rows, links, or status icons appear. Look for changed class names, attribute names, or structural changes.
5. **Edit `extension/common/default-patterns.ts`** with the fixed regex. The pattern shape is `{ regex: string, flags: string, captureGroups?: Record<string, number> }`.
6. **Run `npm test`** immediately after editing `default-patterns.ts`. The schema test suite at `extension/common/__tests__/pattern-registry-schema.test.ts` validates the bundled defaults — Chapter 1 of the tests imports `DEFAULT_PATTERNS` and runs it through `validatePatternRegistry()`. If you accidentally remove a required field or break the structure, this fails in under a second with the exact dotted path of the problem, before any network request.
7. **Run `npm run canary:test`** to verify the fix works against live GitHub HTML.
8. **Update the remote `patterns.json`** on the `staging` branch of the `pr-live-config` repo (see Step 7). Remember to bump `version` and update `updatedAt`. Push to `staging`, not `main`.
9. **After editing `patterns.json`**, run `npm test` from the extension repo (see Step 7.3b) for offline validation, then run the remote smoke test against staging: `REMOTE_PATTERNS_URL=https://raw.githubusercontent.com/dragosdev-code/pr-live-config/staging/patterns.json npm run test:remote-patterns` (see Step 7.5). This validates the actual hosted file end-to-end with the same schema + regex compilation the extension uses.
10. **Promote staging to production** once the smoke test passes: `git checkout main && git merge staging && git push origin main` in the config repo (see Step 7.6).
11. **Run the smoke test against production** to confirm GitHub Pages is serving the correct file: `npm run test:remote-patterns` (see Step 7.8).
12. **Commit both repos.**

Key constraints:
- The `patterns.json` structure MUST match the `PatternRegistry` interface in `extension/common/pattern-types.ts` exactly. The Valibot schema in `extension/common/pattern-registry-schema.ts` is the enforced definition — any deviation is rejected before compilation with a dotted-path error in the extension console.
- The `version` field in `patterns.json` MUST be a **number ≥ 1** and strictly greater than the current cached value or the extension will ignore the update. `0` is reserved as the "no remote config yet" sentinel.
- The `minExtensionVersion` field is the **extension semver** gate, not the config version. Set it to `"0.0.0"` if all builds can use the config, or a specific version if the new patterns require new extension code.
- Regex strings in JSON use double-escaped backslashes (`\\d` not `\d`).
- The `captureGroups` map MUST be correct — the parser indexes into match results using these numbers. Values must be positive integers ≥ 1 (group 0 is the full match, which is never a named group).
- Arrays `prRowSelectors`, `prLink`, `author`, `timestamp`, and `prType` MUST each have at least one entry — the schema enforces `minLength(1)` on all of them.
- **Never hardcode selectors in `GitHubHTMLParser.ts`** — all extraction logic is pattern-driven.

### Understanding validation errors vs. compilation errors

The extension applies two independent layers of defense:

| Layer | When it runs | What it catches | Error visible in |
|-------|-------------|-----------------|------------------|
| Schema validation (`validateRemoteConfig`) | After `response.json()`, before compilePatterns | Wrong types, missing fields, invalid union values, empty required arrays, out-of-range captureGroups | Extension console: `[PatternRegistry] Remote config rejected: <dotted-path>: <reason>` |
| Regex compilation (`safeCompile`) | After schema passes | Syntactically invalid RegExp source strings (e.g., `[unclosed`) | Extension console: `[PatternRegistry] Compilation failed: <error message>` |

If you see "Remote config rejected" — fix the JSON structure (run `npm test` to guide you).
If you see "Compilation failed" — the structure is valid but a regex string itself is syntactically broken.
