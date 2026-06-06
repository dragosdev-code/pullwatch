import { DEFAULT_THEME, THEME_STORAGE_KEY } from "./themes";

export { DEFAULT_THEME, THEME_STORAGE_KEY };

/**
 * Inline IIFE applied in <head> before paint (HeadThemeInit + DocsThemeProvider).
 * Must stay in sync with applyDocsTheme in DocsThemeSelect.
 */
export const themeInitInlineScript = `(function () {
  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }
  try {
    var saved = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (saved === "light" || saved === "dark") apply(saved);
    else apply(${JSON.stringify(DEFAULT_THEME)});
  } catch {
    apply(${JSON.stringify(DEFAULT_THEME)});
  }
})();`;
