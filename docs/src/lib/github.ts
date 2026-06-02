const REPO = "dragosdev-code/pullwatch";
const REF = "main";

/** Link to a source file on GitHub (for use in TS-driven UI, not markdown). */
export function sourceUrl(repoPath: string, line?: number): string {
  const base = `https://github.com/${REPO}/blob/${REF}/${repoPath.replace(/^\//, "")}`;
  return line != null ? `${base}#L${line}` : base;
}

export const GITHUB_REPO_URL = `https://github.com/${REPO}`;
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;
