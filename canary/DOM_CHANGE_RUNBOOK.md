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

---

## Step 7 — Deploy to `patterns.json` (Hot-fix for Live Users)

This is the critical step that fixes things for users **without requiring an extension update**.

### 7.1 — Clone or open the config repo

```bash
git clone https://github.com/dragosdev-code/pr-live-config.git
cd pr-live-config
```

Or if you already have it: `git pull origin main`

### 7.2 — Edit `patterns.json`

The JSON structure mirrors `PatternRegistry` exactly. Find the broken pattern key and replace the `regex` and/or `flags` values.

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

### 7.4 — Commit and push

```bash
git add patterns.json
git commit -m "fix: update regex for GitHub DOM change YYYY-MM-DD"
git push origin main
```

GitHub Pages auto-deploys within 1-2 minutes.

### 7.5 — Verify deployment

```bash
curl -s https://dragosdev-code.github.io/pr-live-config/patterns.json | jq '.version'
```

Confirm the version matches what you just pushed.

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
6. **Run `npm run canary:test`** to verify the fix works against live GitHub HTML.
7. **Run `npm test`** to verify no regressions in unit tests.
8. **Update the remote `patterns.json`** in the `pr-live-config` repo (see Step 7). Remember to bump `version` and update `updatedAt`.
9. **Commit both repos.**

Key constraints:
- The `patterns.json` structure MUST match the `PatternRegistry` interface in `extension/common/pattern-types.ts` exactly.
- The `version` field in `patterns.json` MUST be strictly greater than the previous value or the extension will ignore the update.
- Regex strings in JSON use double-escaped backslashes (`\\d` not `\d`).
- The `captureGroups` map MUST be correct — the parser indexes into match results using these numbers.
- **Never hardcode selectors in `GitHubHTMLParser.ts`** — all extraction logic is pattern-driven.
