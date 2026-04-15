(function initAboutPage() {
  'use strict';
  if (!window.DenjoySiteShared) return;
  window.DenjoySiteShared.initReveal(0.1);
  window.DenjoySiteShared.initCountUp('[data-target]', 0.5, 40);
  window.DenjoySiteShared.initThemeToggle('site-theme-btn');
  window.DenjoySiteShared.initHamburger('nav-hamburger', 'mobile-menu');
})();
