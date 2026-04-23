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
})();
