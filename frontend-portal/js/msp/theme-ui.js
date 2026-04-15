(function initDenjoyMspThemeUI(global) {
  'use strict';

  function applyTheme(theme) {
    const effective = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', effective);
    try { localStorage.setItem('m365LocalTheme', effective); } catch (_) {}
    document.body.style.colorScheme = effective;
    const lightBtn = document.getElementById('theme-light-btn');
    const darkBtn = document.getElementById('theme-dark-btn');
    const cycleBtn = document.getElementById('themeCycleButton');
    if (lightBtn) lightBtn.classList.toggle('active', effective === 'light');
    if (darkBtn) darkBtn.classList.toggle('active', effective === 'dark');
    if (cycleBtn) {
      cycleBtn.setAttribute('aria-label', effective === 'dark' ? 'Schakel naar licht thema' : 'Schakel naar donker thema');
      cycleBtn.textContent = effective === 'dark' ? '☀️' : '🌙';
    }
  }

  function initThemeControls() {
    let storedTheme = 'light';
    try {
      storedTheme = localStorage.getItem('m365LocalTheme') || document.documentElement.getAttribute('data-theme') || 'light';
    } catch (_) {
      storedTheme = document.documentElement.getAttribute('data-theme') || 'light';
    }
    applyTheme(storedTheme);

    const lightBtn = document.getElementById('theme-light-btn');
    const darkBtn = document.getElementById('theme-dark-btn');
    const cycleBtn = document.getElementById('themeCycleButton');

    if (lightBtn && !lightBtn.dataset.themeBound) {
      lightBtn.dataset.themeBound = 'true';
      lightBtn.addEventListener('click', () => applyTheme('light'));
    }
    if (darkBtn && !darkBtn.dataset.themeBound) {
      darkBtn.dataset.themeBound = 'true';
      darkBtn.addEventListener('click', () => applyTheme('dark'));
    }
    if (cycleBtn && !cycleBtn.dataset.themeBound) {
      cycleBtn.dataset.themeBound = 'true';
      cycleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
      });
    }
  }

  function getUiPrefs() {
    try {
      return JSON.parse(localStorage.getItem(global.UI_PREFS_KEY || 'portal_ui_prefs_v1') || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveUiPrefs(patch) {
    const next = { ...getUiPrefs(), ...(patch || {}) };
    try { localStorage.setItem(global.UI_PREFS_KEY || 'portal_ui_prefs_v1', JSON.stringify(next)); } catch (_) {}
    return next;
  }

  function setCurrentTenantId(value) {
    const previousTenantId = global.currentTenantId || document.getElementById('tenantSelect')?.value || null;
    const tenantId = value || null;
    global.currentTenantId = tenantId;
    try {
      if (tenantId) {
        localStorage.setItem('local_m365_current_tenant', tenantId);
      } else {
        localStorage.removeItem('local_m365_current_tenant');
      }
    } catch (_) {}
    const select = document.getElementById('tenantSelect');
    if (select) select.value = tenantId || '';
    if (previousTenantId !== tenantId) {
      try {
        global.dispatchEvent(new CustomEvent('denjoy:tenant-changed', {
          detail: {
            previousTenantId,
            tenantId,
          },
        }));
      } catch (_) {}
    }
    return tenantId;
  }

  function getCurrentTenantId() {
    return global.currentTenantId || document.getElementById('tenantSelect')?.value || null;
  }

  function getCurrentTenantLabel() {
    const tenants = Array.isArray(global.allTenants) ? global.allTenants : [];
    const activeTenantId = getCurrentTenantId();
    const tenant = tenants.find((item) => item.id === activeTenantId);
    return tenant ? (tenant.customer_name || tenant.tenant_name || 'Actieve tenant') : 'Geen tenant geselecteerd';
  }

  function parseMetricValue(text) {
    const match = String(text || '').match(/-?\d+/);
    return match ? Number(match[0]) : null;
  }

  function formatCompactBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '—';
    if (value >= 1024 ** 4) return `${(value / (1024 ** 4)).toFixed(1)} TB`;
    if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(1)} GB`;
    if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(1)} MB`;
    return `${Math.round(value / 1024)} KB`;
  }

  function setTextContent(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function parseSourceDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatSourceStamp(value) {
    if (!value) return 'datum onbekend';
    const date = parseSourceDate(value);
    if (!date) return `laatst: ${String(value)}`;
    try {
      return `laatst: ${date.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}`;
    } catch (_) {
      return `laatst: ${value}`;
    }
  }

  function formatSourceAge(value) {
    const date = parseSourceDate(value);
    if (!date) return formatSourceStamp(value);
    const ageMs = Date.now() - date.getTime();
    const ageMin = Math.max(0, Math.round(ageMs / 60000));
    if (ageMin < 1) return 'zojuist';
    if (ageMin < 60) return `${ageMin} min oud`;
    const ageHours = Math.round(ageMin / 60);
    if (ageHours < 24) return `${ageHours} uur oud`;
    const ageDays = Math.round(ageHours / 24);
    return `${ageDays} dag${ageDays === 1 ? '' : 'en'} oud`;
  }

  function describeSourceMeta(data) {
    const isAssessment = data && data._source === 'assessment_snapshot';
    const generatedAt = data?._generated_at || data?.generated_at || data?.assessment_generated_at || data?.createdAt || null;
    const stale = isAssessment ? (typeof data?._stale === 'boolean' ? data._stale : ((Date.now() - (parseSourceDate(generatedAt)?.getTime() || Date.now())) > 30 * 60 * 1000)) : false;
    return {
      label: isAssessment ? 'Assessment' : 'Live',
      detail: isAssessment ? formatSourceAge(generatedAt) : 'actueel',
      className: isAssessment ? (stale ? 'is-stale' : 'is-assessment') : 'is-live',
    };
  }

  function runWhenIdle(fn, timeout = 900) {
    if (typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(() => fn(), { timeout });
    }
    return window.setTimeout(fn, Math.min(timeout, 180));
  }

  global.DenjoyMspThemeUI = {
    applyTheme,
    initThemeControls,
    getUiPrefs,
    saveUiPrefs,
    setCurrentTenantId,
    getCurrentTenantId,
    getCurrentTenantLabel,
    parseMetricValue,
    formatCompactBytes,
    setTextContent,
    parseSourceDate,
    formatSourceStamp,
    formatSourceAge,
    describeSourceMeta,
    runWhenIdle,
  };

  global.applyTheme = applyTheme;
  global.initThemeControls = initThemeControls;
  global.getUiPrefs = getUiPrefs;
  global.saveUiPrefs = saveUiPrefs;
  global._setCurrentTenantId = setCurrentTenantId;
  global._getCurrentTenantId = getCurrentTenantId;
  global.getCurrentTenantLabel = getCurrentTenantLabel;
  global.parseMetricValue = parseMetricValue;
  global.formatCompactBytes = formatCompactBytes;
  global.setTextContent = setTextContent;
  global.parseSourceDate = parseSourceDate;
  global.formatSourceStamp = formatSourceStamp;
  global.formatSourceAge = formatSourceAge;
  global.describeSourceMeta = describeSourceMeta;
  global.denjoyDescribeSourceMeta = describeSourceMeta;
  global.runWhenIdle = runWhenIdle;
})(window);
