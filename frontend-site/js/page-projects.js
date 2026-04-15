(function initProjectsPage() {
  'use strict';
  if (window.DenjoySiteShared) {
    window.DenjoySiteShared.initReveal(0.08);
    window.DenjoySiteShared.initThemeToggle('site-theme-btn');
    window.DenjoySiteShared.initHamburger('nav-hamburger', 'mobile-menu');
  }

  setTimeout(function() {
    document.querySelectorAll('.mbar-fill[data-w]').forEach(function(bar) {
      bar.style.width = bar.dataset.w + '%';
    });
  }, 400);

  function filter(cat, btn) {
    document.querySelectorAll('.filter-btn').forEach(function(item) {
      item.classList.remove('active');
    });
    btn.classList.add('active');
    document.querySelectorAll('.pf-card').forEach(function(card) {
      if (cat === 'all') {
        card.style.display = '';
        return;
      }
      var cats = (card.dataset.cat || '').split(' ');
      card.style.display = cats.includes(cat) ? '' : 'none';
    });
  }

  var filterBar = document.getElementById('filterBar');
  if (filterBar) {
    filterBar.addEventListener('click', function(event) {
      var btn = event.target.closest('.filter-btn');
      if (!btn) return;
      filter(btn.dataset.filter, btn);
    });
  }
})();
