# DOM Change Runbook

When the canary test fails because GitHub changed their DOM, follow this runbook to diagnose, fix, test, and deploy updated regex patterns.

## Code map (on-call: open this first)

| Runbook topic | Canary module |
|---------------|----------------|
| Tier 1 / Chapter 1 legacy parse, structural `assertPRValid` | [`canary/utils/parse-orchestrator.ts`](utils/parse-orchestrator.ts) (`parseAndAssert`), [`canary/utils/assertions.ts`](utils/assertions.ts) |
| Chapter 2 JSON vs HTML dual-probe, `CANARY_*` markers | [`canary/utils/dual-probe.ts`](utils/dual-probe.ts), [`canary/utils/markers.ts`](utils/markers.ts) |
| Shared production waterfall (JSON → new HTML → legacy) | [`extension/common/pulls-list-parser.ts`](../extension/common/pulls-list-parser.ts) — `parseSearchRouteAndAssert` delegates here |
| GitHub Status API outage disambiguation | [`canary/utils/github-status.ts`](utils/github-status.ts) |
| Targets, headers, env diagnostics | [`canary/utils/config.ts`](utils/config.ts) — `loadCanaryEnv()` / `canaryEnv` discriminated union, `GITHUB_BASE_URL`, shared [`extension/common/github-url-utils.ts`](../extension/common/github-url-utils.ts) (`toPullsSearchUrl`) |
| Playwright login, session cache | [`canary/utils/github-session.ts`](utils/github-session.ts) |
| Entry tests | [`canary/parser.canary.test.ts`](parser.canary.test.ts) |
| Failure HTML snapshots (gitignored) | `canary/snapshots/` — written on parse throw from [`canary/utils/failure-snapshot.ts`](utils/failure-snapshot.ts) |

---

## How the System Works

The extension parses GitHub HTML pages using regex patterns to extract PR data. These patterns exist in two places:

1. **Bundled defaults** — `extension/common/default-patterns.ts` ships with every extension build. The canary CI also uses these.
2. **Remote config** — `patterns.json` hosted at <https://raw.githubusercontent.com/dragosdev-code/pr-live-config/main/patterns.json> (source repo: <https://github.com/dragosdev-code/pr-live-config>). The extension fetches this every 6 hours and applies it if the `version` number is higher than what it has locally.

**When GitHub changes their DOM**, the regex patterns stop matching, the parser throws `ParserBreakageError`, and users see a "parser breakage" banner. The canary CI catches this within an hour and fires a Discord alert.

**Two listing experiences** — Production uses different strategies by route:

- **Legacy global pulls** (`/pulls?q=…`) — `GitHubHTMLParser` + the legacy pattern set (`prRowSelectors`, `prLink`, etc.).
- **New global pulls** (`/pulls/search?q=…`) — same `parsePullsListHTML` gauntlet as legacy URL attempts: `GitHubEmbeddedJsonPullHarvest` first, then `NewExperienceGitHubHTMLParser`, then `GitHubHTMLParser`. The **new experience** uses the optional `patterns.newExperience` block in `patterns.json` (separate from legacy keys).

**Canary layout** — `canary/parser.canary.test.ts` runs **Tier 1** (public repo lists, legacy parser only) and **Tier 2** (authenticated Playwright): **Chapter 1** hits legacy `/pulls?q=…` with `GitHubHTMLParser`; **Chapter 2** hits `/pulls/search?q=…`, asserts embedded JSON, runs `NewExperienceGitHubHTMLParser` as a dual-probe, and **requires matching fields** (title, repo, type, author, number, createdAt) per PR when JSON and HTML row counts agree. Tier 2 uses **two bot accounts** (`GH_CANARY_USERNAME_LEGACY` / `GH_CANARY_USERNAME_NEW`) plus shared `GH_CANARY_PASSWORD`, isolated `storageState` files, and **one shared Chromium** process.

**To fix it**, you update the regex in **both** the remote `patterns.json` (immediate hot-fix for live users) and the bundled `default-patterns.ts` (for future builds and canary CI). If the break is **only** the SSR JSON envelope, you may need to change **`GitHubEmbeddedJsonPullHarvest.ts`** (traversal / mapping), not patterns.

### Key Files

| File | Purpose |
|------|---------|
| `extension/common/default-patterns.ts` | Bundled fallback patterns + `compilePatterns()` helper |
| `extension/common/pattern-types.ts` | TypeScript interfaces for all pattern shapes (`PatternRegistry`, `CompiledPatterns`) |
| `extension/common/pattern-registry-schema.ts` | Valibot runtime schema — validates remote JSON and cached storage **before** compilation; produces dotted-path error messages |
| `extension/common/__tests__/pattern-registry-schema.test.ts` | 48 unit tests for the schema validator — run after any `patterns.json` edit to confirm the extension will accept it |
| `extension/common/__tests__/schema-test-helpers.ts` | Factory helpers (`makeValidRemoteConfig`, `makePatternEntry`, etc.) used by the schema tests |
| `extension/background/services/GitHubHTMLParser.ts` | Legacy listing parser — consumes compiled legacy patterns only; zero hardcoded selectors |
| `extension/background/services/NewExperienceGitHubHTMLParser.ts` | New-dashboard listing parser — consumes `patterns.newExperience` only; zero hardcoded selectors |
| `extension/background/services/GitHubEmbeddedJsonPullHarvest.ts` | Extracts PR rows from the new pulls dashboard SSR JSON blob (primary path for `/pulls/search`) |
| `extension/background/services/GitHubService.ts` | Production router: shared `parsePullsListHTML` (JSON → new-experience HTML → legacy) |
| `extension/common/pulls-list-parser.ts` | Shared waterfall used by `GitHubService` and canary `parseSearchRouteAndAssert` |
| `extension/common/github-url-utils.ts` | `toPullsSearchUrl` — production and canary Chapter 2 URLs |
| `extension/background/services/PatternRegistryService.ts` | Fetches remote `patterns.json`, caches in `chrome.storage.local`, 6-hour TTL |
| `extension/common/constants.ts` | `REMOTE_PATTERNS_URL`, `REMOTE_PATTERNS_STAGING_URL`, `PATTERN_REFRESH_TTL_MS` (6h) — single source of truth for smoke-test fetch targets |
| `vitest.remote-patterns.config.ts` | Vitest config for the remote schema smoke: sets `REMOTE_PATTERNS_URL` from constants via `--mode` (`staging` vs default production), or respects a pre-set `REMOTE_PATTERNS_URL` for forks |
| `extension/common/errors.ts` | `ParserBreakageError` definition |
| `canary/parser.canary.test.ts` | Canary suite: Tier 1 public; Tier 2 shared browser, Chapter 1 legacy pulls, Chapter 2 `/pulls/search` |
| `canary/utils/assertions.ts` | `assertPRValid`, `checkAvatarCoverage` — structural PR contract only |
| `canary/utils/parse-orchestrator.ts` | `parseAndAssert`, `parseSearchRouteAndAssert` (delegates to shared `parsePullsListHTML`) |
| `canary/utils/dual-probe.ts` | `observeNewExperienceSearchObservability`, JSON-vs-HTML field alignment |
| `canary/utils/markers.ts` | `CANARY_EMBEDDED_JSON_DRIFT` / `CANARY_NEW_HTML_FALLBACK_DEGRADED` (CI grep targets) |
| `canary/utils/config.ts` | Targets (`PUBLIC_TARGETS`, `AUTH_TARGETS`, `AUTH_TARGETS_SEARCH`), `BROWSER_HEADERS`, dual-bot env flags; imports `GITHUB_BASE_URL` + `toPullsSearchUrl` from extension common |
| `canary/utils/github-session.ts` | Playwright login, cached `storageState`, optional shared `Browser`, Gmail OTP for device verification |
| `.github/workflows/canary-parser-test.yml` | Hourly cron; secrets for legacy/new usernames + password + Gmail; `tee canary.log`; grep markers → CRITICAL JSON drift vs NOTICE HTML degraded Discord; failure alert with outage disambiguation |

### Remote Config (`patterns.json`)

- **URL** (production): <https://raw.githubusercontent.com/dragosdev-code/pr-live-config/main/patterns.json>
- **URL** (staging): <https://raw.githubusercontent.com/dragosdev-code/pr-live-config/staging/patterns.json>
- **Source repo**: <https://github.com/dragosdev-code/pr-live-config> (edit on `staging`, merge to `main` after smoke test passes)
- **Schema**: `{ version: number, minExtensionVersion: string, updatedAt: string, patterns: PatternRegistry }`
- **Version gating**: `PatternRegistryService` skips the update if `config.version <= this.registryVersion` — you **must bump `version`** for any change to take effect.
- **Runtime validation**: Before compiling, the service runs `validateRemoteConfig()` (from `extension/common/pattern-registry-schema.ts`) against the raw JSON. If the structure is invalid, it is rejected immediately with a dotted-path error message logged to the extension console — e.g., `prRowSelectors.0.type: Expected 'class' | 'attribute' | 'balanced-div', received 'xpath'`. The current compiled patterns are preserved unchanged. This is a **structural** check; regex syntax is still validated by `safeCompile` (a second defense layer) after the schema passes.
- **Two version numbers to keep straight**:
  - `version` (integer, in `patterns.json`) — the **config revision**. Increment by 1 every time you push updated patterns. Starts at 1; the extension stores 0 locally for "no remote config loaded yet."
  - `minExtensionVersion` (semver string, in `patterns.json`) — the **minimum extension build** that should apply this config. Set this if new patterns require new extension code; leave it at `"0.0.0"` if all builds can safely use them. This is compared against `chrome.runtime.getManifest().version`, not against the config `version` number.

---

## Step 1 — Confirm It Is a DOM Change

When you receive a Discord alert (or see a failing canary run):

1. **Read the Discord message.**
   - **"GitHub Outage Detected (Not a DOM Change)"** — wait for GitHub to recover; no pattern work.
   - **"CRITICAL: Embedded JSON drift"** — the new-dashboard SSR JSON path failed (`CANARY_EMBEDDED_JSON_DRIFT`); fix `GitHubEmbeddedJsonPullHarvest` and/or login/session (not always a regex issue).
   - **"NOTICE: New experience HTML fallback degraded"** — tests **passed** but the log contains `CANARY_NEW_HTML_FALLBACK_DEGRADED`: embedded JSON still works, but `NewExperienceGitHubHTMLParser` row count or alignment is wrong; update `patterns.newExperience` before GitHub drops JSON.
   - **"Possible GitHub DOM Change"** (generic failure) — proceed with pattern / parser diagnosis below.
2. **Check manually**: <https://www.githubstatus.com>
   - Status is `none` (all operational) → this is a DOM change. Continue to Step 2.
   - Status is `minor` / `major` / `critical` → wait for recovery. The canary retries once (`vitest.canary.config.ts` `retry: 1`) and runs hourly, so it will self-heal.
3. **Check the CI logs** (link is in the Discord embed). The test output includes:
   - `[status] GitHub Status API reports degraded service` — if you see this, it is an outage.
   - `The parser is likely broken due to a GitHub DOM change.` — proceed below.
   - `CANARY_EMBEDDED_JSON_DRIFT` / `CANARY_NEW_HTML_FALLBACK_DEGRADED` — see Step 2 (canary markers).

---

## Step 2 — Identify Which Pattern Broke

Open the failed GitHub Actions run. The CI logs tell you exactly what broke.

### Canary log markers (Tier 2 / new experience)

| Marker / symptom | Meaning | Likely fix location |
|------------------|---------|---------------------|
| `CANARY_EMBEDDED_JSON_DRIFT` | Dashboard HTML looks like the new pulls surface, but `GitHubEmbeddedJsonPullHarvest.extractFromHTML` returned `null` | `GitHubEmbeddedJsonPullHarvest.ts` (script tag / JSON traversal / `mapToPullRequest`), or wrong page HTML (login wall) |
| `CANARY_NEW_HTML_FALLBACK_DEGRADED` | JSON returned rows, but `NewExperienceGitHubHTMLParser` returned `null`, zero rows, or a **different row count** than JSON | `patterns.newExperience` in `default-patterns.ts` + remote `patterns.json` |
| Vitest `expect` on `title (HTML vs embedded JSON)`, `repoName`, `type`, `author login`, `number`, `createdAt` | Same row count, but **field mismatch** between JSON and HTML scrape for a matched PR URL | Adjust the specific `newExperience` key (e.g. `titleLink`, `author`, `timestamp`, `prType`) |

**Which chapter failed?**

- **Chapter 1** (`/pulls?q=…`, labels like `Auth: Assigned PRs…`) — legacy `GitHubHTMLParser` + legacy pattern keys (`prRowSelectors`, `prLink`, …).
- **Chapter 2** (`/pulls/search?q=…`, labels like `Auth (search): …`) — embedded JSON + `NewExperienceGitHubHTMLParser` dual-probe; assertions described in `canary/utils/assertions.ts`.

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
| `HTML vs embedded JSON` / `NewExperienceGitHubHTMLParser dual-probe` / `Auth (search):` in the label | `patterns.newExperience` (and possibly harvester if JSON fields are wrong) |

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

For **Chapter 2** (new search route), public `curl` without cookies often returns a login wall — capture HTML while logged in (Playwright “Save as”, DevTools copy outer HTML on `/pulls/search?…`, or run the canary / a small Playwright script with your test account).

---

## Step 4 — Reproduce Locally

Run the canary suite against live GitHub to confirm you see the same failure:

```bash
npm run canary:test
```

This runs `vitest run --config vitest.canary.config.ts` which targets `canary/**/*.canary.test.ts` with a 120-second test timeout, 60-second hook timeout, **`maxWorkers: 1`**, and **1 retry**.

The canary uses `DEFAULT_COMPILED_PATTERNS` from `extension/common/default-patterns.ts` — the exact same bundled patterns as CI.

**Tier 2 locally** requires the same env vars as CI if you want Chapter 1 / 2 to run: `GH_CANARY_USERNAME_LEGACY`, `GH_CANARY_USERNAME_NEW`, `GH_CANARY_PASSWORD`, and (for device verification) Gmail OAuth secrets — see `canary/parser.canary.test.ts` and `canary/utils/config.ts`. Without them, Tier 2 is skipped and only Tier 1 runs.

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

### Test the new-experience HTML parser against saved HTML

```typescript
// scratch-new-exp.ts — run with: npx tsx scratch-new-exp.ts
import { readFileSync } from 'fs';
import { DEFAULT_COMPILED_PATTERNS } from './extension/common/default-patterns';
import { NewExperienceGitHubHTMLParser } from './extension/background/services/NewExperienceGitHubHTMLParser';
import { GitHubEmbeddedJsonPullHarvest } from './extension/background/services/GitHubEmbeddedJsonPullHarvest';

const html = readFileSync('/tmp/github-pulls-search-sample.html', 'utf8');
const json = GitHubEmbeddedJsonPullHarvest.extractFromHTML(html);
const ne = NewExperienceGitHubHTMLParser.parseFromHTML(
  html,
  'https://github.com',
  DEFAULT_COMPILED_PATTERNS,
);
console.log('JSON rows:', json?.length ?? 'null');
console.log('NewExperience HTML rows:', ne?.length ?? 'null');
```

### Test the embedded JSON harvester only

```typescript
import { readFileSync } from 'fs';
import { GitHubEmbeddedJsonPullHarvest } from './extension/background/services/GitHubEmbeddedJsonPullHarvest';

const html = readFileSync('/tmp/github-pulls-search-sample.html', 'utf8');
const prs = GitHubEmbeddedJsonPullHarvest.extractFromHTML(html);
console.log(prs === null ? 'null (no embedded payload)' : `${prs.length} PR(s)`);
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
| `newExperience.pageMarker` / `rowSelector` | New dashboard markers / `<li>` row roots | `data-testid`, `PullsListItem-module` / `ListItem-module` prefixes, etc. |
| `newExperience.resultsCount` | `data-testid="results-count"` (advertised hit count) | **Multiline-safe:** GitHub may put a newline between the digit and the word `results`; regex must allow `\s` / `[\s\S]*?` in that gap. If count > 0 but row extraction yields 0 rows, the parser throws `ParserBreakageError`. |
| `newExperience.titleLink` | PR URL + title in row | Same row as `NewExperienceGitHubHTMLParser.extractPRData` |
| `newExperience.timestamp[]` | `createdAt` for HTML path | Must align with JSON `createdAt` in canary field-compare (1s tolerance) |
| `newExperience.prType[]` | draft / open / merged | Must align with JSON-derived `type` |

### Tips for writing resilient regex

- Prefer matching on `data-*` attributes and `aria-label` values over CSS classes — semantic attributes change less often.
- Use non-greedy quantifiers (`.*?`) to avoid runaway matches across PR rows.
- Test against multiple pages: `facebook/react/pulls` and `microsoft/vscode/pulls` at minimum.
- Keep the `captureGroups` mapping correct — the parser relies on these indices to extract named fields.
- For `newExperience.resultsCount`, use a pattern anchored on `data-testid="results-count"` that still matches when the count and the word `results` are split across lines inside the span.

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
staging branch ──→ smoke test passes? ──→ merge to main ──→ extension fetches
     │                    │                                        │
     │                  (no) → fix and retry                       │
     │                                                             ▼
     └─── raw.githubusercontent.com/…/staging   raw.githubusercontent.com/…/main
          (`test:remote-patterns:staging` / CI checkbox)   (extension + `test:remote-patterns`)
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
npm run test:remote-patterns:staging
```

This runs `vitest run --config vitest.remote-patterns.config.ts --mode staging`. The staging raw URL comes from `REMOTE_PATTERNS_STAGING_URL` in `extension/common/constants.ts` (not duplicated in npm scripts). The suite also runs **Act 4**: hosted `patterns` must match bundled `DEFAULT_PATTERNS` in `default-patterns.ts` — catch drift before merging config to `main`.

To hit a **fork** or custom raw URL, set `REMOTE_PATTERNS_URL` in the environment before running; that overrides the mode-based default (see `vitest.remote-patterns.config.ts`).

**Via GitHub Actions (recommended):**

1. Go to **Actions** → **"Remote Patterns Schema Smoke"** → **"Run workflow"**.
2. Check the **"Use staging URL"** checkbox (similar to the canary's "force fresh login" checkbox).
3. Click **"Run workflow"**.

The workflow runs `npm run test:remote-patterns:staging` (vs `npm run test:remote-patterns` for production). URLs are not duplicated in the YAML — they match the constants the extension ships with.

**If the smoke test fails:** fix the issue on the `staging` branch, push again, and re-run. Do not proceed to 7.6 until it passes.

### 7.6 — Promote staging to production

Once the smoke test passes on staging, merge to `main` to make the config live:

```bash
cd pr-live-config
git checkout main
git pull origin main
git merge staging
git push origin main
```

The raw `main` URL is served immediately once the push lands — no deploy step needed.

### 7.7 — Verify production deployment

```bash
curl -s https://raw.githubusercontent.com/dragosdev-code/pr-live-config/main/patterns.json | jq '.version'
```

Confirm the version matches what you just promoted.

### 7.8 — Run the smoke test against production

Now validate that the production (`main`) URL is serving the correct file:

```bash
# From the extension repo root — production URL from REMOTE_PATTERNS_URL in constants.ts
npm run test:remote-patterns
```

Or via GitHub Actions: run the **"Remote Patterns Schema Smoke"** workflow **without** checking the staging checkbox (scheduled runs use production as well).

**What the smoke test proves vs. what it does not:**

| Test | What it validates | What it does NOT validate |
|------|-------------------|--------------------------|
| Schema smoke — production (`npm run test:remote-patterns`) | Hosted JSON from `main` passes Valibot + every `regex` compiles (Acts 1–3). No `DEFAULT_PATTERNS` parity — production may hotfix ahead of a store release | Whether regexes actually *match* live GitHub HTML |
| Schema smoke — staging (`npm run test:remote-patterns:staging`) | Acts 1–3 **plus** Act 4: hosted `patterns` must equal bundled `DEFAULT_PATTERNS` after a JSON round-trip | Whether regexes actually *match* live GitHub HTML |
| Canary (`npm run canary:test`) | Tier 1: legacy parser on public repo lists. Tier 2: Playwright → Chapter 1 legacy `/pulls`, Chapter 2 `/pulls/search` with embedded JSON + `newExperience` HTML dual-probe and per-field JSON/HTML alignment when counts match | Remote `patterns.json` schema parity with production smoke (canary uses **bundled** `DEFAULT_COMPILED_PATTERNS` only) |

Run **both** smoke variants when promoting config: staging script before merge to `main`, production script after. Run the **canary** after a `patterns.json` change: the smoke catches typos and schema drift; the canary catches DOM-mismatch regressions.

Both URLs (`REMOTE_PATTERNS_URL` for production and `REMOTE_PATTERNS_STAGING_URL` for staging) are defined only in `extension/common/constants.ts`. `vitest.remote-patterns.config.ts` selects which one to fetch via Vitest `--mode staging` vs default, unless `REMOTE_PATTERNS_URL` is already set in the environment.

---

## Step 8 — Commit to the Extension Repo

Back in this repo, commit the updated parser assets (patterns and, if needed, harvester code):

```bash
git add extension/common/default-patterns.ts
# If SSR JSON traversal changed:
# git add extension/background/services/GitHubEmbeddedJsonPullHarvest.ts
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
├── prType[]                → ordered: detect draft/open/merged from aria-labels and icons
└── newExperience?          → optional; new `/pulls/search` HTML fallback only
    ├── pageMarker          → detect new-dashboard document
    ├── rowSelector         → opening `<li>` (balanced extraction)
    ├── titleLink           → PR URL + title HTML fragment
    ├── repoName            → from PR URL
    ├── prNumber            → from PR URL
    ├── author              → login in row
    ├── timestamp[]         → createdAt for row
    └── prType[]            → draft / open / merged
```

---

## AI Agent Instructions

If you are an AI coding agent tasked with fixing a canary failure:

1. **Read the CI logs first** to identify the specific assertion, marker, or error. The log may contain an HTML snippet and lines like `Chapter 1:` vs `Chapter 2:`.
2. **Fetch a fresh HTML sample** using the curl command from Step 3, Option A for **Tier 1 / legacy** pages. For **`/pulls/search`**, prefer an authenticated capture (Step 3 note) because anonymous responses may omit the embedded JSON blob.
3. **Identify the broken component** using Step 2: legacy pattern keys vs `newExperience` vs `GitHubEmbeddedJsonPullHarvest` / `CANARY_EMBEDDED_JSON_DRIFT`.
4. **Inspect the HTML** around PR rows, `react-app.embeddedData`, links, timestamps, and status markers.
5. **Edit `extension/common/default-patterns.ts`** for regex fixes. For SSR JSON envelope drift, edit **`GitHubEmbeddedJsonPullHarvest.ts`** (not patterns).
6. **Run `npm test`** immediately after editing `default-patterns.ts` (and after harvester edits if TypeScript broke types). The schema suite validates `DEFAULT_PATTERNS`; harvester changes should still pass `npm test` for the whole project.
7. **Run `npm run canary:test`** (with Tier 2 secrets if you need Chapter 2 locally) to verify against live GitHub.
8. **Update the remote `patterns.json`** on the `staging` branch of the `pr-live-config` repo (see Step 7). Remember to bump `version` and update `updatedAt`. Push to `staging`, not `main`.
9. **After editing `patterns.json`**, run `npm test` from the extension repo (see Step 7.3b) for offline validation, then run `npm run test:remote-patterns:staging` (see Step 7.5). This validates the actual hosted staging file end-to-end with the same schema + regex compilation the extension uses, and asserts parity with `DEFAULT_PATTERNS`.
10. **Promote staging to production** once the smoke test passes: `git checkout main && git merge staging && git push origin main` in the config repo (see Step 7.6).
11. **Run the smoke test against production** to confirm the `main` branch URL is serving the correct file: `npm run test:remote-patterns` (see Step 7.8).
12. **Commit both repos.** If the harvester changed, commit the extension repo even when `patterns.json` did not.

Key constraints:
- The `patterns.json` structure MUST match the `PatternRegistry` interface in `extension/common/pattern-types.ts` exactly. The Valibot schema in `extension/common/pattern-registry-schema.ts` is the enforced definition — any deviation is rejected before compilation with a dotted-path error in the extension console.
- The `version` field in `patterns.json` MUST be a **number ≥ 1** and strictly greater than the current cached value or the extension will ignore the update. `0` is reserved as the "no remote config yet" sentinel.
- The `minExtensionVersion` field is the **extension semver** gate, not the config version. Set it to `"0.0.0"` if all builds can use the config, or a specific version if the new patterns require new extension code.
- Regex strings in JSON use double-escaped backslashes (`\\d` not `\d`).
- The `captureGroups` map MUST be correct — the parser indexes into match results using these numbers. Values must be positive integers ≥ 1 (group 0 is the full match, which is never a named group).
- Arrays `prRowSelectors`, `prLink`, `author`, `timestamp`, and `prType` MUST each have at least one entry — the schema enforces `minLength(1)` on all of them.
- **Never hardcode selectors in `GitHubHTMLParser.ts` or `NewExperienceGitHubHTMLParser.ts`** — all extraction logic is pattern-driven from `PatternRegistry` / `newExperience`.

### Understanding validation errors vs. compilation errors

The extension applies two independent layers of defense:

| Layer | When it runs | What it catches | Error visible in |
|-------|-------------|-----------------|------------------|
| Schema validation (`validateRemoteConfig`) | After `response.json()`, before compilePatterns | Wrong types, missing fields, invalid union values, empty required arrays, out-of-range captureGroups | Extension console: `[PatternRegistry] Remote config rejected: <dotted-path>: <reason>` |
| Regex compilation (`safeCompile`) | After schema passes | Syntactically invalid RegExp source strings (e.g., `[unclosed`) | Extension console: `[PatternRegistry] Compilation failed: <error message>` |

If you see "Remote config rejected" — fix the JSON structure (run `npm test` to guide you).
If you see "Compilation failed" — the structure is valid but a regex string itself is syntactically broken.
