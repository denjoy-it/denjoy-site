(function initSiteThemeEarly() {
  try {
    var theme = localStorage.getItem('m365LocalTheme');
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (_) {}
})();
