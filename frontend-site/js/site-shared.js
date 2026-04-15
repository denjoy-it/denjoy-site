(function initDenjoySiteShared(global) {
  'use strict';

  function initReveal(threshold) {
    var t = typeof threshold === 'number' ? threshold : 0.1;
    var targets = document.querySelectorAll('.reveal');
    if (!targets.length) return;
    var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      targets.forEach(function(el) { el.classList.add('visible'); });
      return;
    }
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      });
    }, { threshold: t });
    targets.forEach(function(el) { obs.observe(el); });
  }

  function initCountUp(selector, threshold, steps) {
    var sel = selector || '[data-target]';
    var t = typeof threshold === 'number' ? threshold : 0.5;
    var s = Math.max(10, Number(steps || 45));
    var targets = document.querySelectorAll(sel);
    if (!targets.length) return;
    var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      targets.forEach(function(el) {
        var target = parseInt(el.dataset.target, 10);
        if (isNaN(target)) return;
        var sup = el.querySelector('sup');
        var supHtml = sup ? sup.outerHTML : '';
        el.innerHTML = String(target) + supHtml;
      });
      return;
    }
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.dataset.target, 10);
        if (isNaN(target)) return;
        var sup = el.querySelector('sup');
        var supHtml = sup ? sup.outerHTML : '';
        var current = 0;
        var step = Math.max(1, target / s);
        var timer = setInterval(function() {
          current = Math.min(current + step, target);
          el.innerHTML = String(Math.round(current)) + supHtml;
          if (current >= target) clearInterval(timer);
        }, 16);
        obs.unobserve(el);
      });
    }, { threshold: t });
    targets.forEach(function(el) { obs.observe(el); });
  }

  function initThemeToggle(buttonId) {
    var id = buttonId || 'site-theme-btn';
    var btn = document.getElementById(id);
    if (!btn) return;

    function iconFor(theme) {
      return theme === 'dark' ? '☀️' : '🌙';
    }

    var active = document.documentElement.getAttribute('data-theme') || 'light';
    btn.textContent = iconFor(active);
    btn.setAttribute('aria-pressed', active === 'dark' ? 'true' : 'false');

    btn.addEventListener('click', function() {
      var current = document.documentElement.getAttribute('data-theme') || 'light';
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      btn.textContent = iconFor(next);
      btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
      try {
        localStorage.setItem('m365LocalTheme', next);
      } catch (_) {}
    });
  }

  function initHamburger(hamId, menuId) {
    var hId = hamId || 'nav-hamburger';
    var mId = menuId || 'mobile-menu';
    var ham = document.getElementById(hId);
    var menu = document.getElementById(mId);
    if (!ham || !menu) return;

    if (!ham.getAttribute('aria-controls')) {
      ham.setAttribute('aria-controls', mId);
    }

    function closeMenu() {
      menu.classList.remove('open');
      ham.classList.remove('open');
      ham.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-hidden', 'true');
    }

    function openMenu() {
      menu.classList.add('open');
      ham.classList.add('open');
      ham.setAttribute('aria-expanded', 'true');
      menu.setAttribute('aria-hidden', 'false');
    }

    function isOpen() {
      return menu.classList.contains('open');
    }

    ham.addEventListener('click', function() {
      if (isOpen()) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    menu.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape' && isOpen()) {
        closeMenu();
        ham.focus();
      }
      if (event.key !== 'Tab' || !isOpen()) return;
      var focusables = menu.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    document.addEventListener('click', function(event) {
      if (!isOpen()) return;
      if (menu.contains(event.target) || ham.contains(event.target)) return;
      closeMenu();
    });
  }

  global.DenjoySiteShared = {
    initReveal: initReveal,
    initCountUp: initCountUp,
    initThemeToggle: initThemeToggle,
    initHamburger: initHamburger,
  };
})(window);
