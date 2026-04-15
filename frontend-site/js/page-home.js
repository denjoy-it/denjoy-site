(function initHomePage() {
  'use strict';
  if (window.DenjoySiteShared) {
    window.DenjoySiteShared.initReveal(0.1);
    window.DenjoySiteShared.initCountUp('.stat-num[data-target]', 0.5, 45);
    window.DenjoySiteShared.initThemeToggle('site-theme-btn');
    window.DenjoySiteShared.initHamburger('nav-hamburger', 'mobile-menu');
  }

  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    document.querySelectorAll('.mbar-fill[data-w]').forEach(function(bar) {
      bar.style.transition = 'none';
      bar.style.width = bar.dataset.w + '%';
    });
  } else {
    setTimeout(function() {
      document.querySelectorAll('.mbar-fill[data-w]').forEach(function(bar) {
        bar.style.width = bar.dataset.w + '%';
      });
    }, 600);
  }
})();
