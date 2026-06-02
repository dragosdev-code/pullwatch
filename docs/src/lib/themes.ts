/** Docs site: light and dark only (extension keeps the full DaisyUI set). */
export const THEMES = ["light", "dark"] as const;

export type ThemeName = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "pr-extension-theme";
export const DEFAULT_THEME: ThemeName = "light";

export function isDocsTheme(value: string | null | undefined): value is ThemeName {
  return value === "light" || value === "dark";
}
