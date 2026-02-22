// Apply theme synchronously before render to prevent flicker
(function() {
  const theme = localStorage.getItem('pr-extension-theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();
