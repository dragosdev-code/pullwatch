// Apply popup size synchronously before render to prevent first-frame size flicker.
// Preset table duplicated from src/constants/popup-sizes.ts; keep in sync when adding presets.
(function () {
  var PRESETS = {
    compact: { width: 380, height: 400 },
    cozy: { width: 418, height: 440 },
    comfortable: { width: 456, height: 480 },
  };
  var DEFAULT_ID = 'compact';
  var STORAGE_KEY = 'pr-extension-popup-size';

  var stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (_) {
    // localStorage may be unavailable (e.g., sandboxed contexts); fall through to default
  }

  var preset = PRESETS[stored] || PRESETS[DEFAULT_ID];
  var root = document.documentElement;
  root.style.setProperty('--pw-popup-width', preset.width + 'px');
  root.style.setProperty('--pw-popup-height', preset.height + 'px');

  // Dev-only popup simulation: when this document is loaded outside a Chrome extension
  // context (plain `vite dev` tab), pin html/body to the popup box so the first paint
  // is already centered. In a real extension popup `chrome.runtime.sendMessage` exists,
  // so the class is skipped and production styling is untouched.
  var inExtension =
    typeof chrome !== 'undefined' &&
    chrome.runtime &&
    typeof chrome.runtime.sendMessage === 'function';
  if (!inExtension) {
    root.classList.add('pw-dev-popup-sim');
  }
})();
