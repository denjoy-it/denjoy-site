(function initPortalNext(global) {
  'use strict';

  const state = {
    page: 'overview',
    currentSection: 'overview',
    currentSubItem: null,
    tenants: [],
    activeTenantId: 'all',
    session: null,
    mobileSidebarOpen: false,
    openNavGroups: new Set(),
    inlinePortalView: { section: 'overview', subItem: null, label: 'Mijn Overzicht' },
  };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    const parts = String(name || 'D').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'D';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }

  function formatDate(value) {
    if (!value) return 'Onbekend';
    try {
      return new Date(value).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) {
      return String(value);
    }
  }

  function formatShortDate(value) {
    if (!value) return 'Onbekend';
    try {
      return new Date(value).toLocaleDateString('nl-NL', { dateStyle: 'medium' });
    } catch (_) {
      return String(value);
    }
  }

  function formatCurrency(value) {
    const num = Number(value || 0);
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(num);
  }

  function relativeDate(value) {
    if (!value) return 'Nog niet gescand';
    try {
      const diffDays = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
      if (diffDays <= 0) return 'Vandaag';
      if (diffDays === 1) return 'Gisteren';
      if (diffDays < 30) return `${diffDays} dagen geleden`;
      const months = Math.floor(diffDays / 30);
      return `${months} maand${months === 1 ? '' : 'en'} geleden`;
    } catch (_) {
      return String(value).slice(0, 10);
    }
  }

  function healthTone(score) {
    if (score == null) return 'info';
    if (score >= 85) return 'good';
    if (score >= 60) return 'warn';
    return 'danger';
  }

  function cardClassFromTone(tone) {
    if (tone === 'good') return 'is-tone-good';
    if (tone === 'warn' || tone === 'warning') return 'is-tone-warn';
    if (tone === 'danger' || tone === 'critical' || tone === 'urgent') return 'is-tone-danger';
    return '';
  }

  function pillClass(tone) {
    if (tone === 'good') return 'portal-next-pill portal-next-pill--good';
    if (tone === 'warn' || tone === 'warning') return 'portal-next-pill portal-next-pill--warn';
    if (tone === 'danger' || tone === 'critical' || tone === 'urgent') return 'portal-next-pill portal-next-pill--danger';
    return 'portal-next-pill portal-next-pill--info';
  }

  function getTenantRecord(tenantId = state.activeTenantId) {
    return state.tenants.find((item) => item.id === tenantId) || null;
  }

  function isAdminLikeSection(sectionName) {
    const adminSections = new Set(['tenantoverzicht', 'mspcontrolcenter', 'klantenbeheer', 'azure', 'platformHub', 'dienstenHub', 'goedkeuringen', 'kosten', 'jobmonitor', 'settings']);
    return adminSections.has(sectionName);
  }

  function getStoredTheme() {
    try {
      return localStorage.getItem('m365LocalTheme') || 'light';
    } catch (_) {
      return 'light';
    }
  }

  function applyTheme(theme) {
    const effective = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', effective);
    try {
      localStorage.setItem('m365LocalTheme', effective);
    } catch (_) {}
  }

  function getSelectedTenantLabel() {
    if (state.activeTenantId === 'all') return 'Alle tenants';
    const tenant = getTenantRecord();
    return tenant ? (tenant.customer_name || tenant.tenant_name || tenant.id) : 'Geen tenant';
  }

  function syncTenantStorage() {
    try {
      if (state.activeTenantId && state.activeTenantId !== 'all') {
        localStorage.setItem('local_m365_current_tenant', state.activeTenantId);
      } else {
        localStorage.removeItem('local_m365_current_tenant');
      }
    } catch (_) {}
  }

  function getPortalConfig() {
    return global.DenjoyMspPortalConfig || {};
  }

  function setCurrentPortalRoute(section, subItem = null, extraOptions = {}) {
    const config = getPortalConfig();
    const mapping = {
      results: 'resultsPanel',
      kb: 'kbTab',
      settings: 'settingsTab',
      herstel: 'remTab',
      gebruikers: 'gbTab',
      baseline: 'baselineTab',
      ca: 'caTab',
      zerotrust: 'ztTab',
      backup: 'bkTab',
    };
    const optionKey = mapping[section] || 'liveTab';
    const sectionMemory = {};
    if (subItem) sectionMemory[section] = subItem;
    try {
      localStorage.setItem('denjoy.portal.routeState', JSON.stringify({
        section: section || 'overview',
        subItem: subItem || null,
        sectionMemory,
        ...(subItem ? { [optionKey]: subItem } : {}),
        ...extraOptions,
      }));
    } catch (_) {}
  }

  function openCurrentPortalRoute(section, subItem = null, mode = 'same-tab', extraOptions = {}) {
    syncTenantStorage();
    setCurrentPortalRoute(section, subItem, extraOptions);
    if (mode === 'new-tab') {
      global.open('/portal/dashboard-v2.html', '_blank', 'noopener');
      return;
    }
    global.location.href = '/portal/dashboard-v2.html';
  }

  function updateInlineFrameSize() {
    const frame = document.getElementById('previewInlinePortalFrame');
    if (!frame) return;
    try {
      const doc = frame.contentWindow?.document;
      const height = doc?.documentElement?.scrollHeight || doc?.body?.scrollHeight || 780;
      frame.style.minHeight = `${Math.max(780, Math.min(height + 24, 2200))}px`;
    } catch (_) {}
  }

  function renderInlineViewHeader() {
    const title = document.getElementById('previewInlineTitle');
    const meta = document.getElementById('previewInlineMeta');
    if (title) title.textContent = state.inlinePortalView.label || 'Nog geen onderdeel geopend';
    if (meta) {
      const sub = state.inlinePortalView.subItem ? ` · subonderdeel ${state.inlinePortalView.subItem}` : '';
      meta.textContent = `Live inhoud uit de huidige portal voor ${state.inlinePortalView.section || 'overview'}${sub}.`;
    }
  }

  function loadInlinePortalView(section, subItem = null, label = '') {
    state.inlinePortalView = { section: section || 'overview', subItem: subItem || null, label: label || section || 'Portal' };
    syncTenantStorage();
    setCurrentPortalRoute(section, subItem);
    renderInlineViewHeader();
    const frame = document.getElementById('previewInlinePortalFrame');
    if (!frame) return;
    const nextSrc = `/portal/dashboard-v2.html?embed=1#${encodeURIComponent(section || 'overview')}`;
    try {
      if (frame.contentWindow) {
        frame.contentWindow.location.replace(nextSrc);
      } else {
        frame.src = nextSrc;
      }
    } catch (_) {
      frame.src = nextSrc;
    }
  }

  function getGroupMeta(groupKey) {
    const labels = {
      people: {
        title: 'Identiteit & Toegang',
        meta: 'Accounts, toegangscontrole, gekoppelde apps en synchronisatie.',
      },
      security: {
        title: 'Beveiliging & Naleving',
        meta: 'Scores, signalen, normering, risico’s en domeinbeveiliging.',
      },
      collab: {
        title: 'E-mail & Samenwerking',
        meta: 'Exchange, Teams en SharePoint-onderdelen.',
      },
      devices: {
        title: 'Apparaten & Beheer',
        meta: 'Intune, beheerfuncties en gegevensback-up.',
      },
      followup: {
        title: 'Analyse & Acties',
        meta: 'Scans, rapporten, herstel en standaardinstellingen.',
      },
      kb: {
        title: 'Documentatie',
        meta: 'Kennisbank, assets, procedures en tenantdocumentatie.',
      },
      admin: {
        title: 'MSP Admin',
        meta: 'Multi-tenant beheer, Azure, instellingen en servicehubs.',
      },
    };
    return labels[groupKey] || { title: groupKey, meta: '' };
  }

  function subnavKeyFromItem(item = {}) {
    return item.resultsPanel || item.kbTab || item.settingsTab || item.remTab || item.gbTab || item.baselineTab || item.bkTab || item.caTab || item.ztTab || item.liveTab || item.section || null;
  }

  function subnavLabelFromItem(item = {}) {
    return item.label || subnavKeyFromItem(item) || 'Subonderdeel';
  }

  function buildPortalEmbedUrl(section, subItem = null) {
    const params = new URLSearchParams();
    params.set('embed', '1');
    params.set('section', section || 'overview');
    if (subItem) params.set('subitem', subItem);
    return `/portal/dashboard-v2.html?${params.toString()}`;
  }

  function getSubnavEntries(sectionName, entry = null) {
    const config = getPortalConfig();
    const subnavConfig = Array.isArray(config.SUBNAV_CONFIG?.[sectionName]) ? config.SUBNAV_CONFIG[sectionName] : [];
    if (subnavConfig.length) {
      return subnavConfig.map((item) => ({
        label: subnavLabelFromItem(item),
        subItem: subnavKeyFromItem(item),
      })).filter((item) => !!item.subItem);
    }
    const subItems = Array.isArray(entry?.subItems) ? entry.subItems : [];
    if (!subItems.length) return [];
    return subItems.map((item) => ({
      label: item,
      subItem: item,
    }));
  }

  function getNavEntry(sectionName) {
    const config = getPortalConfig();
    const groups = config.NAV_GROUP_SECTIONS || {};
    for (const [groupKey, items] of Object.entries(groups)) {
      for (const entry of items || []) {
        const resolvedSection = typeof entry === 'string' ? entry : entry?.section;
        if (resolvedSection === sectionName) {
          return { groupKey, entry };
        }
      }
    }
    return null;
  }

  function getDefaultSubItem(sectionName) {
    const navEntry = getNavEntry(sectionName);
    const entries = getSubnavEntries(sectionName, navEntry?.entry);
    return entries[0]?.subItem || null;
  }

  function toArray(value, candidates = ['items', 'value', 'data', 'rows']) {
    if (Array.isArray(value)) return value;
    for (const key of candidates) {
      if (Array.isArray(value?.[key])) return value[key];
    }
    return [];
  }

  function valueFromSettled(result) {
    return result?.status === 'fulfilled' ? result.value : null;
  }

  function renderSimpleList(items, emptyText = 'Geen items gevonden.') {
    if (!items.length) return `<div class="portal-next-empty">${esc(emptyText)}</div>`;
    return items.map((item) => `
      <article class="portal-next-list-item">
        <div class="portal-next-list-head">
          <div>
            <strong>${esc(item.title || 'Item')}</strong>
            <p class="portal-next-list-sub">${esc(item.meta || '')}</p>
          </div>
          ${item.badge ? `<span class="${pillClass(item.tone || 'info')}">${esc(item.badge)}</span>` : ''}
        </div>
        ${item.body ? `<p class="portal-next-list-body">${esc(item.body)}</p>` : ''}
      </article>
    `).join('');
  }

  function renderSimpleTable(columns, rows, emptyText = 'Geen data gevonden.') {
    if (!rows.length) return `<div class="portal-next-empty">${esc(emptyText)}</div>`;
    return `
      <div class="portal-next-table-wrap">
        <table class="portal-next-table">
          <thead>
            <tr>${columns.map((col) => `<th>${esc(col.label)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${columns.map((col) => `<td>${esc(row[col.key] ?? '—')}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderDetailBlocks(blocks) {
    const usable = blocks.filter((block) => block && (block.html || (block.rows && block.rows.length)));
    if (!usable.length) return '<div class="portal-next-empty">Voor dit onderdeel is nog geen native datasamenvatting beschikbaar.</div>';
    return `
      <div class="portal-next-detail-stack">
        ${usable.map((block) => `
          <section class="portal-next-detail-card">
            <h3>${esc(block.title || 'Details')}</h3>
            ${block.html || renderSimpleTable(block.columns || [], block.rows || [], block.emptyText)}
          </section>
        `).join('')}
      </div>
    `;
  }

  function buildDynamicNav() {
    const root = document.getElementById('portalNextDynamicNav');
    if (!root) return;
    const config = getPortalConfig();
    const groups = config.NAV_GROUP_SECTIONS || {};
    const meta = config.SECTION_META || {};
    root.innerHTML = Object.entries(groups).map(([groupKey, items]) => {
      const groupMeta = getGroupMeta(groupKey);
      const resolvedItems = (items || []).filter((entry) => !(typeof entry === 'object' && entry?.hidden));
      const autoOpen = resolvedItems.some((entry) => (typeof entry === 'string' ? entry : entry?.section) === state.currentSection);
      const isOpen = state.openNavGroups.has(groupKey) || autoOpen;
      return `
        <div class="portal-next-nav-group ${isOpen ? 'is-open' : ''}" data-next-group="${esc(groupKey)}">
          <button type="button" class="portal-next-nav-section" data-next-group-toggle="${esc(groupKey)}">${esc(groupMeta.title)}</button>
          <div class="portal-next-nav-subitems">
            ${resolvedItems.map((entry) => {
              const section = typeof entry === 'string' ? entry : entry?.section;
              if (!section) return '';
              const sectionMeta = meta[section] || {};
              const sectionActive = state.currentSection === section;
              const subnav = getSubnavEntries(section, typeof entry === 'object' ? entry : null);
              return `
                <button type="button" class="portal-next-nav-subitem ${sectionActive && !state.currentSubItem ? 'is-active' : ''}" data-next-section="${esc(section)}">
                  ${esc(sectionMeta.title || section)}
                </button>
                ${subnav.map((item) => `
                  <button type="button" class="portal-next-nav-subitem ${sectionActive && state.currentSubItem === item.subItem ? 'is-active' : ''}" data-next-section="${esc(section)}" data-next-subitem="${esc(item.subItem)}">
                    ${esc(item.label)}
                  </button>
                `).join('')}
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    root.querySelectorAll('[data-next-section]').forEach((button) => {
      button.addEventListener('click', async () => {
        state.currentSection = button.dataset.nextSection || 'overview';
        state.currentSubItem = button.dataset.nextSubitem || getDefaultSubItem(state.currentSection);
        setPage('workspace');
        buildDynamicNav();
        await renderActivePage();
      });
    });

    root.querySelectorAll('[data-next-group-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.nextGroupToggle || '';
        if (!key) return;
        if (state.openNavGroups.has(key)) state.openNavGroups.delete(key);
        else state.openNavGroups.add(key);
        buildDynamicNav();
      });
    });
  }

  async function loadSession() {
    try {
      state.session = await global.apiFetch('/api/auth/verify');
    } catch (_) {
      state.session = null;
    }
    const name = state.session?.display_name || state.session?.email || 'Lokaal';
    const role = state.session?.role || 'portal';
    ['previewSidebarName', 'previewTopbarName'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = name;
    });
    ['previewSidebarRole', 'previewTopbarRole'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = role;
    });
    ['previewSidebarAvatar', 'previewTopbarAvatar'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = initials(name);
    });
  }

  async function loadTenants(forceRefresh = false) {
    if (forceRefresh) global.cacheClear?.('/api/tenants');
    const data = await global.apiFetchCached('/api/tenants', {}, global.CACHE_TTL.tenants);
    state.tenants = Array.isArray(data?.items) ? data.items : [];
    const stored = (() => {
      try {
        return localStorage.getItem('local_m365_current_tenant') || 'all';
      } catch (_) {
        return 'all';
      }
    })();
    const validStored = stored === 'all' || state.tenants.some((item) => item.id === stored);
    if (!validStored) {
      state.activeTenantId = state.tenants[0]?.id || 'all';
    } else if (!state.activeTenantId || state.activeTenantId === 'all') {
      state.activeTenantId = stored === 'all' ? (state.tenants[0]?.id || 'all') : stored;
    } else if (state.activeTenantId !== 'all' && !state.tenants.some((item) => item.id === state.activeTenantId)) {
      state.activeTenantId = state.tenants[0]?.id || 'all';
    }
    syncTenantStorage();
    renderTenantSelect();
  }

  function renderTenantSelect() {
    const select = document.getElementById('previewTenantSelect');
    if (!select) return;
    select.innerHTML = [
      '<option value="all">Alle tenants (portfolio)</option>',
      ...state.tenants.map((tenant) => `<option value="${esc(tenant.id)}">${esc(tenant.customer_name || tenant.tenant_name || tenant.id)}</option>`),
    ].join('');
    select.value = state.activeTenantId;
  }

  function setPage(page) {
    state.page = page;
    global.location.hash = page;
    document.querySelectorAll('.portal-next-nav-item[data-next-page]').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.nextPage === page);
    });
    document.querySelectorAll('.portal-next-page').forEach((section) => {
      section.classList.toggle('is-active', section.id === `previewPage-${page}`);
    });
    if (page === 'workspace') buildDynamicNav();
    if (state.mobileSidebarOpen) toggleSidebar(false);
  }

  function toggleSidebar(force) {
    state.mobileSidebarOpen = typeof force === 'boolean' ? force : !state.mobileSidebarOpen;
    document.getElementById('portalNextApp')?.classList.toggle('is-sidebar-open', state.mobileSidebarOpen);
  }

  function recommendationItemsForTenant(tenant, onboarding, capabilities) {
    const items = [];
    if (onboarding && !onboarding.auth_ready) {
      items.push({
        tone: 'danger',
        title: 'Auth-profiel ontbreekt',
        body: 'Deze tenant heeft nog geen compleet auth-profiel voor live connectors of onboarding.',
      });
    }
    if (Number(capabilities?.summary?.config_required || capabilities?.capability_summary?.config_required || 0) > 0) {
      items.push({
        tone: 'warn',
        title: 'Configuratie nodig',
        body: 'Een of meer capabilities vragen nog connector- of serviceconfiguratie.',
      });
    }
    if (Number(tenant?.latest_run?.critical_count || 0) > 0) {
      items.push({
        tone: 'danger',
        title: 'Kritieke bevindingen open',
        body: `${tenant.latest_run.critical_count} kritieke bevinding(en) vragen snelle opvolging.`,
      });
    }
    if (Number(tenant?.ops_summary?.job_summary?.failed || 0) > 0) {
      items.push({
        tone: 'warn',
        title: 'Mislukte jobs',
        body: `${tenant.ops_summary.job_summary.failed} job(s) vragen handmatige opvolging of retry.`,
      });
    }
    if (!items.length) {
      items.push({
        tone: 'good',
        title: 'Geen directe blokkades',
        body: 'Voor deze tenant zijn momenteel geen opvallende operationele blokkades gedetecteerd.',
      });
    }
    return items;
  }

  function serviceCardHtml(service) {
    return `
      <article class="portal-next-service-card">
        <div class="portal-next-service-top">
          <span class="portal-next-service-tag">${esc(service.tag)}</span>
          <span class="${pillClass(service.tone)}">${esc(service.badge)}</span>
        </div>
        <div class="portal-next-service-title">${esc(service.title)}</div>
        <div class="portal-next-service-value">${esc(service.value)}</div>
        <div class="portal-next-service-meta">${esc(service.meta)}</div>
        <a class="portal-next-service-link" href="#" data-next-page-link="${esc(service.linkPage)}">${esc(service.linkLabel || 'Open blok')}</a>
      </article>
    `;
  }

  function attachPageLinks(root) {
    root?.querySelectorAll('[data-next-page-link]').forEach((link) => {
      if (link.dataset.bound === '1') return;
      link.dataset.bound = '1';
      link.addEventListener('click', (event) => {
        event.preventDefault();
        setPage(link.dataset.nextPageLink || 'overview');
        void renderActivePage();
      });
    });
  }

  function attachPortalBridgeHandlers(root = document) {
    root.querySelectorAll('[data-live-portal-section]').forEach((button) => {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', () => {
        const section = button.dataset.livePortalSection || 'overview';
        const subItem = button.dataset.livePortalSubitem || null;
        const mode = button.dataset.livePortalMode || 'same-tab';
        const label = button.dataset.livePortalLabel || section;
        if (mode === 'inline') {
          loadInlinePortalView(section, subItem, label);
          return;
        }
        openCurrentPortalRoute(section, subItem, mode);
      });
    });
  }

  function tenantSummaryPills(tenants) {
    const total = tenants.length;
    const completed = tenants.filter((item) => item.latest_run?.status === 'completed').length;
    const critical = tenants.filter((item) => Number(item.latest_run?.critical_count || 0) > 0).length;
    const ready = tenants.filter((item) => Number(item.ops_summary?.onboarding?.completion_pct || 0) >= 75).length;
    const failedJobs = tenants.reduce((sum, item) => sum + Number(item.ops_summary?.job_summary?.failed || 0), 0);
    return [
      { label: 'Tenants', value: total, note: 'gekoppeld' },
      { label: 'Scans gereed', value: completed, note: 'voltooid' },
      { label: 'Kritiek', value: critical, note: 'met kritieke issues' },
      { label: 'Readiness', value: ready, note: 'boven 75%' },
      { label: 'Failed jobs', value: failedJobs, note: 'openstaand' },
    ];
  }

  function tenantCardHtml(tenant) {
    const run = tenant.latest_run || {};
    const ops = tenant.ops_summary || {};
    const onboarding = ops.onboarding || {};
    const jobs = ops.job_summary || {};
    const tone = healthTone(run.score_overall);
    return `
      <article class="portal-next-tenant-card is-${esc(tone === 'danger' ? 'critical' : tone === 'warn' ? 'warning' : tone === 'good' ? 'good' : 'info')}">
        <div class="portal-next-tenant-head">
          <div>
            <h2 class="portal-next-tenant-name">${esc(tenant.customer_name || tenant.tenant_name || 'Tenant')}</h2>
            <p class="portal-next-tenant-sub">${esc(tenant.tenant_name || tenant.id || '')}</p>
          </div>
          <div class="portal-next-score">
            <strong>${esc(run.score_overall ?? '—')}</strong>
            <span>score</span>
          </div>
        </div>
        <div class="portal-next-chip-row">
          <span class="${pillClass(Number(run.critical_count || 0) > 0 ? 'danger' : 'good')}">${esc(run.critical_count || 0)} kritiek</span>
          <span class="${pillClass(Number(run.warning_count || 0) > 0 ? 'warn' : 'info')}">${esc(run.warning_count || 0)} waarschuwingen</span>
          <span class="${pillClass(Number(onboarding.completion_pct || 0) >= 75 ? 'good' : 'warn')}">Gereedheid ${esc(onboarding.completion_pct ?? 0)}%</span>
          <span class="${pillClass(Number(jobs.failed || 0) > 0 ? 'danger' : 'info')}">Jobs ${esc((jobs.pending || 0) + (jobs.running || 0) + (jobs.failed || 0))}</span>
        </div>
        <div class="portal-next-list-body">Laatste scan: ${esc(relativeDate(run.completed_at || run.started_at))}</div>
        <div class="portal-next-actions">
          <button type="button" class="portal-next-btn portal-next-btn--primary portal-next-btn--small" data-tenant-action="open" data-tenant-id="${esc(tenant.id)}">Open</button>
          <button type="button" class="portal-next-btn portal-next-btn--ghost portal-next-btn--small" data-tenant-action="refresh" data-tenant-id="${esc(tenant.id)}">Refresh</button>
          <button type="button" class="portal-next-btn portal-next-btn--ghost portal-next-btn--small" data-tenant-action="scan" data-tenant-id="${esc(tenant.id)}">Scan</button>
        </div>
      </article>
    `;
  }

  async function renderOverview() {
    const heroActions = document.getElementById('previewHeroActions');
    const kpiRoot = document.getElementById('previewOverviewKpis');
    const focusRoot = document.getElementById('previewOverviewFocus');
    const recommendationRoot = document.getElementById('previewOverviewRecommendations');
    const servicesRoot = document.getElementById('previewOverviewServices');
    const runsRoot = document.getElementById('previewOverviewRuns');
    const kicker = document.getElementById('previewKicker');
    const subtitle = document.getElementById('previewSubtitle');
    if (!heroActions || !kpiRoot || !focusRoot || !recommendationRoot || !servicesRoot || !runsRoot || !kicker || !subtitle) return;

    const tenant = getTenantRecord();
    const activeTenantId = state.activeTenantId;
    heroActions.innerHTML = `
      <button type="button" class="portal-next-btn portal-next-btn--ghost" data-next-page-link="tenantoverzicht">Tenantoverzicht</button>
      <button type="button" class="portal-next-btn portal-next-btn--ghost" data-next-page-link="mspcontrolcenter">MSP overzicht</button>
      <button type="button" class="portal-next-btn portal-next-btn--primary" id="previewOverviewRefreshBtn">Nu verversen</button>
    `;
    attachPageLinks(heroActions);
    document.getElementById('previewOverviewRefreshBtn')?.addEventListener('click', () => {
      void refreshCurrentPage(true);
    }, { once: true });

    if (activeTenantId === 'all' || !tenant) {
      kicker.textContent = 'Portfolio';
      subtitle.textContent = 'MSP-brede samenvatting van alle gekoppelde tenants en hun actuele status in de preview-shell.';

      const avgScoreItems = state.tenants
        .map((item) => Number(item.latest_run?.score_overall))
        .filter((value) => Number.isFinite(value));
      const avgScore = avgScoreItems.length ? Math.round(avgScoreItems.reduce((sum, value) => sum + value, 0) / avgScoreItems.length) : null;
      const kpis = [
        { label: 'Tenants', value: state.tenants.length, meta: 'gekoppeld in het portfolio', tone: 'info' },
        { label: 'Gemiddelde score', value: avgScore != null ? `${avgScore}%` : '—', meta: 'laatste voltooide scans', tone: avgScore != null ? healthTone(avgScore) : 'info' },
        { label: 'Kritieke tenants', value: state.tenants.filter((item) => Number(item.latest_run?.critical_count || 0) > 0).length, meta: 'minstens één kritieke bevinding', tone: 'danger' },
        { label: 'Auth-ready', value: state.tenants.filter((item) => item.ops_summary?.onboarding?.auth_ready).length, meta: 'met compleet auth-profiel', tone: 'good' },
      ];
      kpiRoot.innerHTML = kpis.map((item) => `
        <article class="portal-next-kpi ${cardClassFromTone(item.tone)}">
          <span class="portal-next-kpi-label">${esc(item.label)}</span>
          <strong class="portal-next-kpi-value">${esc(item.value)}</strong>
          <span class="portal-next-kpi-meta">${esc(item.meta)}</span>
        </article>
      `).join('');

      const topTenants = [...state.tenants]
        .sort((a, b) => Number(b.latest_run?.critical_count || 0) - Number(a.latest_run?.critical_count || 0))
        .slice(0, 4);
      focusRoot.innerHTML = topTenants.length ? topTenants.map((item) => `
        <article class="portal-next-list-item">
          <div class="portal-next-list-head">
            <div>
              <strong>${esc(item.customer_name || item.tenant_name || item.id)}</strong>
              <p class="portal-next-list-sub">${esc(item.tenant_name || item.id || '')}</p>
            </div>
            <span class="${pillClass(healthTone(item.latest_run?.score_overall))}">Score ${esc(item.latest_run?.score_overall ?? '—')}</span>
          </div>
          <p class="portal-next-list-body">${esc(Number(item.latest_run?.critical_count || 0))} kritiek · ${esc(Number(item.latest_run?.warning_count || 0))} waarschuwingen · readiness ${esc(item.ops_summary?.onboarding?.completion_pct ?? 0)}%</p>
          <div class="portal-next-actions">
            <button type="button" class="portal-next-btn portal-next-btn--ghost portal-next-btn--small" data-tenant-action="open" data-tenant-id="${esc(item.id)}">Open tenant</button>
          </div>
        </article>
      `).join('') : '<div class="portal-next-empty">Nog geen tenants beschikbaar.</div>';

      const recommendationGroups = tenantSummaryPills(state.tenants);
      recommendationRoot.innerHTML = recommendationGroups.map((item) => `
        <article class="portal-next-recommendation portal-next-list-item">
          <strong>${esc(item.label)}</strong>
          <p>${esc(`${item.value} ${item.note}`)}</p>
        </article>
      `).join('');

      servicesRoot.innerHTML = [
        { tag: 'Portfolio', badge: 'Tenants', tone: 'info', title: 'Tenantstatus', value: String(state.tenants.length), meta: 'gekoppelde tenants in preview', linkPage: 'tenantoverzicht' },
        { tag: 'Risico', badge: 'Kritiek', tone: 'danger', title: 'Kritieke opvolging', value: String(state.tenants.filter((item) => Number(item.latest_run?.critical_count || 0) > 0).length), meta: 'tenants met directe aandacht', linkPage: 'tenantoverzicht' },
        { tag: 'Readiness', badge: 'Voortgang', tone: 'good', title: 'Auth-ready', value: String(state.tenants.filter((item) => item.ops_summary?.onboarding?.auth_ready).length), meta: 'tenants met compleet auth-profiel', linkPage: 'tenantoverzicht' },
        { tag: 'MSP', badge: 'Inbox', tone: 'warn', title: 'Open approvals', value: 'Zie MSP', meta: 'open approvals en jobs', linkPage: 'mspcontrolcenter' },
        { tag: 'Preview', badge: 'Shell', tone: 'info', title: 'Nieuwe variant', value: 'Fase 1', meta: 'overview, tenants en MSP', linkPage: 'mspcontrolcenter' },
      ].map(serviceCardHtml).join('');
      attachPageLinks(servicesRoot);

      const recentRuns = state.tenants
        .filter((item) => item.latest_run)
        .sort((a, b) => new Date(b.latest_run.completed_at || b.latest_run.started_at || 0).getTime() - new Date(a.latest_run.completed_at || a.latest_run.started_at || 0).getTime())
        .slice(0, 6);
      runsRoot.innerHTML = recentRuns.length ? recentRuns.map((item) => `
        <article class="portal-next-run-row portal-next-list-item">
          <div>
            <strong>${esc(item.customer_name || item.tenant_name || item.id)}</strong>
            <p class="portal-next-run-meta">${esc(formatDate(item.latest_run.completed_at || item.latest_run.started_at))}</p>
          </div>
          <span class="${pillClass(healthTone(item.latest_run.score_overall))}">${esc(item.latest_run.status || 'unknown')}</span>
          <strong class="portal-next-run-score">${esc(item.latest_run.score_overall ?? '—')}</strong>
        </article>
      `).join('') : '<div class="portal-next-empty">Nog geen recente runs gevonden.</div>';
      attachTenantActionHandlers();
      return;
    }

    kicker.textContent = 'Tenant';
    subtitle.textContent = `${tenant.customer_name || tenant.tenant_name || 'Geselecteerde tenant'} · actuele dashboardsamenvatting in de preview-shell.`;

    const tenantId = tenant.id;
    global.invalidateTenantScopedCaches?.(tenantId);
    const [statsRes, runsRes, usersRes, onboardingRes, capabilitiesRes, exchangeRes, teamsRes, sitesRes, backupRes, licensesRes] = await Promise.allSettled([
      global.apiFetchCached(`/api/tenants/${tenantId}/overview`, {}, global.CACHE_TTL.overview),
      global.apiFetchCached(`/api/tenants/${tenantId}/runs`, {}, global.CACHE_TTL.runs),
      global.apiFetchCached(global.API.m365.users(tenantId), {}, global.CACHE_TTL.short),
      global.apiFetchCached(`/api/tenants/${tenantId}/onboarding`, {}, global.CACHE_TTL.medium),
      global.apiFetchCached(global.API.capabilities.tenant(tenantId), {}, global.CACHE_TTL.medium),
      global.apiFetchCached(global.API.exchange.mailboxes(tenantId), {}, global.CACHE_TTL.mailboxes),
      global.apiFetchCached(global.API.collaboration.teams(tenantId), {}, global.CACHE_TTL.teams),
      global.apiFetchCached(global.API.collaboration.sharepointSites(tenantId), {}, global.CACHE_TTL.teams),
      global.apiFetchCached(global.API.backup.summary(tenantId), {}, global.CACHE_TTL.short),
      global.apiFetchCached(global.API.m365.licenses(tenantId), {}, global.CACHE_TTL.short),
    ]);

    const stats = statsRes.status === 'fulfilled' ? statsRes.value : null;
    const runs = runsRes.status === 'fulfilled' ? (runsRes.value?.items || []) : [];
    const usersData = usersRes.status === 'fulfilled' ? usersRes.value : null;
    const onboarding = onboardingRes.status === 'fulfilled' ? onboardingRes.value : null;
    const capabilities = capabilitiesRes.status === 'fulfilled' ? capabilitiesRes.value : null;

    const userCount = stats?.totalUsers || stats?.userCount || (Array.isArray(usersData?.users) ? usersData.users.length : null);
    const mfaCoverage = stats?.mfaCoverage != null ? `${Math.round(stats.mfaCoverage)}%` : '—';
    const secureScore = stats?.secureScorePercentage != null ? `${Math.round(stats.secureScorePercentage)}%` : (stats?.scoreOverall != null ? `${stats.scoreOverall}%` : '—');
    const caPolicies = stats?.caPolicies ?? '—';
    const kpis = [
      { label: 'Gebruikers', value: userCount ?? '—', meta: 'accounts en licenties', tone: 'info' },
      { label: 'MFA-dekking', value: mfaCoverage, meta: 'geregistreerde dekking', tone: stats?.mfaCoverage >= 75 ? 'good' : 'warn' },
      { label: 'Beveiligingsscore', value: secureScore, meta: 'laatste tenantoverzicht', tone: healthTone(stats?.secureScorePercentage ?? stats?.scoreOverall) },
      { label: 'Toegangsbeleid', value: caPolicies, meta: 'beleidregels in beeld', tone: Number(caPolicies || 0) > 0 ? 'good' : 'info' },
    ];
    kpiRoot.innerHTML = kpis.map((item) => `
      <article class="portal-next-kpi ${cardClassFromTone(item.tone)}">
        <span class="portal-next-kpi-label">${esc(item.label)}</span>
        <strong class="portal-next-kpi-value">${esc(item.value)}</strong>
        <span class="portal-next-kpi-meta">${esc(item.meta)}</span>
      </article>
    `).join('');

    const latestRun = runs[0] || tenant.latest_run || null;
    focusRoot.innerHTML = `
      <article class="portal-next-list-item">
        <div class="portal-next-list-head">
          <div>
            <strong>${esc(tenant.customer_name || tenant.tenant_name || tenant.id)}</strong>
            <p class="portal-next-list-sub">${esc(latestRun?.status === 'completed' ? 'Laatste scan voltooid' : 'Nog geen voltooide scan')}</p>
          </div>
          <span class="${pillClass(healthTone(latestRun?.score_overall))}">Score ${esc(latestRun?.score_overall ?? '—')}</span>
        </div>
        <p class="portal-next-list-body">${esc(Number(latestRun?.critical_count || 0))} kritiek · ${esc(Number(latestRun?.warning_count || 0))} waarschuwingen · ${esc(Number(latestRun?.info_count || 0))} informatief</p>
        <div class="portal-next-chip-row">
          <span class="${pillClass(onboarding?.auth_ready ? 'good' : 'danger')}">${onboarding?.auth_ready ? 'Auth gereed' : 'Auth ontbreekt'}</span>
          <span class="${pillClass(Number(onboarding?.completion_pct || 0) >= 75 ? 'good' : 'warn')}">Readiness ${esc(onboarding?.completion_pct ?? 0)}%</span>
          <span class="${pillClass(Number(tenant.ops_summary?.job_summary?.failed || 0) > 0 ? 'danger' : 'info')}">Jobs ${esc((tenant.ops_summary?.job_summary?.pending || 0) + (tenant.ops_summary?.job_summary?.running || 0) + (tenant.ops_summary?.job_summary?.failed || 0))}</span>
        </div>
      </article>
    `;

    recommendationRoot.innerHTML = recommendationItemsForTenant(tenant, onboarding, capabilities).map((item) => `
      <article class="portal-next-recommendation ${cardClassFromTone(item.tone)} portal-next-list-item">
        <strong>${esc(item.title)}</strong>
        <p>${esc(item.body)}</p>
      </article>
    `).join('');

    const exchange = exchangeRes.status === 'fulfilled' ? exchangeRes.value : null;
    const teams = teamsRes.status === 'fulfilled' ? teamsRes.value : null;
    const sites = sitesRes.status === 'fulfilled' ? sitesRes.value : null;
    const backup = backupRes.status === 'fulfilled' ? backupRes.value : null;
    const licenses = licensesRes.status === 'fulfilled' ? licensesRes.value : null;
    const serviceCards = [
      {
        tag: 'Exchange',
        badge: exchange?.ok ? 'Live' : 'Geen data',
        tone: exchange?.ok ? 'good' : 'info',
        title: 'Mailboxen',
        value: String(exchange?.count || exchange?.mailboxes?.length || '—'),
        meta: exchange?.ok ? `${(exchange.mailboxes || []).filter((item) => item?.accountEnabled !== false).length} actief` : 'live data niet beschikbaar',
        linkPage: 'overview',
      },
      {
        tag: 'Teams',
        badge: teams?.ok ? 'Live' : 'Geen data',
        tone: teams?.ok ? 'good' : 'info',
        title: 'Teams',
        value: String(teams?.count || teams?.teams?.length || '—'),
        meta: teams?.ok ? `${teams?.publicCount || 0} publiek` : 'live data niet beschikbaar',
        linkPage: 'overview',
      },
      {
        tag: 'SharePoint',
        badge: sites?.ok ? 'Live' : 'Geen data',
        tone: sites?.ok ? 'good' : 'info',
        title: 'Sites',
        value: String(sites?.count || sites?.sites?.length || '—'),
        meta: sites?.ok ? 'bestanden en sites' : 'live data niet beschikbaar',
        linkPage: 'overview',
      },
      {
        tag: 'Backup',
        badge: backup?.ok ? 'Actief' : 'Geen data',
        tone: backup?.ok ? 'good' : 'info',
        title: 'OneDrive',
        value: String(backup?.oneDrive?.resourceCount || '—'),
        meta: backup?.ok ? `${backup?.oneDrive?.policyCount || 0} policy's` : 'backupstatus onbekend',
        linkPage: 'overview',
      },
      {
        tag: 'Licenties',
        badge: licenses?.ok ? 'Live' : 'Geen data',
        tone: licenses?.ok ? 'good' : 'info',
        title: 'Toegewezen',
        value: String((licenses?.licenses || []).reduce((sum, item) => sum + (Number(item?.consumed) || 0), 0) || '—'),
        meta: licenses?.ok ? `${(licenses?.licenses || []).reduce((sum, item) => sum + (Number(item?.available) || 0), 0)} beschikbaar` : 'licenties niet geladen',
        linkPage: 'overview',
      },
    ];
    servicesRoot.innerHTML = serviceCards.map(serviceCardHtml).join('');
    attachPageLinks(servicesRoot);

    runsRoot.innerHTML = runs.length ? runs.slice(0, 6).map((item) => `
      <article class="portal-next-run-row portal-next-list-item">
        <div>
          <strong>${esc(formatShortDate(item.completed_at || item.created_at))}</strong>
          <p class="portal-next-run-meta">${esc(item.run_mode || item.status || 'run')}</p>
        </div>
        <span class="${pillClass(healthTone(item.score_overall))}">${esc(item.status || 'unknown')}</span>
        <strong class="portal-next-run-score">${esc(item.score_overall ?? '—')}</strong>
      </article>
    `).join('') : '<div class="portal-next-empty">Nog geen runs voor deze tenant gevonden.</div>';
  }

  async function renderTenantOverview() {
    const summaryRoot = document.getElementById('previewTenantSummary');
    const cardsRoot = document.getElementById('previewTenantCards');
    if (!summaryRoot || !cardsRoot) return;
    summaryRoot.innerHTML = tenantSummaryPills(state.tenants).map((item) => `
      <article class="portal-next-summary-pill">
        <span>${esc(item.label)}</span>
        <strong>${esc(item.value)}</strong>
        <span>${esc(item.note)}</span>
      </article>
    `).join('');
    cardsRoot.innerHTML = state.tenants.length
      ? state.tenants.map(tenantCardHtml).join('')
      : '<div class="portal-next-empty">Nog geen tenants gevonden.</div>';
    attachTenantActionHandlers();
  }

  function mspPriorityHtml(item) {
    return `
      <article class="portal-next-priority-row portal-next-list-item ${cardClassFromTone(item.tone || 'info')}">
        <div class="portal-next-list-head">
          <div>
            <strong>${esc(item.title || 'Prioriteit')}</strong>
            <p class="portal-next-list-sub">${esc(item.detail || '')}</p>
          </div>
          <span class="${pillClass(item.tone || 'info')}">${esc((item.tone || 'info').toUpperCase())}</span>
        </div>
      </article>
    `;
  }

  async function renderMspControlCenter() {
    const kpiRoot = document.getElementById('previewMspKpis');
    const priorityRoot = document.getElementById('previewMspPriorities');
    const opsRoot = document.getElementById('previewMspOps');
    const customersRoot = document.getElementById('previewMspCustomers');
    const tenantsRoot = document.getElementById('previewMspTenants');
    if (!kpiRoot || !priorityRoot || !opsRoot || !customersRoot || !tenantsRoot) return;
    const data = await global.apiFetchCached('/api/msp/control-center', {}, global.CACHE_TTL.short);
    const summary = data?.summary || {};
    const kpis = [
      { label: 'Klanten', value: summary.total_customers ?? '—', meta: 'in beheer', tone: 'info' },
      { label: 'Tenants', value: summary.total_tenants ?? '—', meta: 'gekoppeld', tone: 'info' },
      { label: 'Approvals', value: summary.pending_approvals ?? '—', meta: 'wachten op besluit', tone: Number(summary.pending_approvals || 0) > 0 ? 'warn' : 'good' },
      { label: 'Jobs failed', value: summary.failed_jobs ?? '—', meta: 'vragen opvolging', tone: Number(summary.failed_jobs || 0) > 0 ? 'danger' : 'good' },
    ];
    kpiRoot.innerHTML = kpis.map((item) => `
      <article class="portal-next-kpi ${cardClassFromTone(item.tone)}">
        <span class="portal-next-kpi-label">${esc(item.label)}</span>
        <strong class="portal-next-kpi-value">${esc(item.value)}</strong>
        <span class="portal-next-kpi-meta">${esc(item.meta)}</span>
      </article>
    `).join('');

    const priorities = Array.isArray(data?.priorities) ? data.priorities : [];
    priorityRoot.innerHTML = priorities.length
      ? priorities.map(mspPriorityHtml).join('')
      : '<div class="portal-next-empty">Geen centrale prioriteiten gevonden.</div>';

    const approvals = Array.isArray(data?.approvals) ? data.approvals : [];
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    opsRoot.innerHTML = [
      ...approvals.slice(0, 4).map((item) => `
        <article class="portal-next-list-item">
          <div class="portal-next-list-head">
            <div>
              <strong>${esc(item.action_type || item.section || 'Goedkeuring')}</strong>
              <p class="portal-next-list-sub">${esc(item.requested_by || 'Onbekend')} · ${esc(formatDate(item.requested_at))}</p>
            </div>
            <span class="${pillClass('warn')}">Approval</span>
          </div>
          <p class="portal-next-list-body">${esc(item.reason || 'Geen reden')}</p>
        </article>
      `),
      ...jobs.slice(0, 4).map((item) => `
        <article class="portal-next-list-item">
          <div class="portal-next-list-head">
            <div>
              <strong>${esc(item.job_type || 'Job')}</strong>
              <p class="portal-next-list-sub">${esc(item.tenant_id || 'Globaal')} · ${esc(formatDate(item.scheduled_at))}</p>
            </div>
            <span class="${pillClass(item.status === 'failed' ? 'danger' : 'info')}">${esc(String(item.status || 'pending').toUpperCase())}</span>
          </div>
          <p class="portal-next-list-body">${esc(item.error_message || 'Geen foutmelding')}</p>
        </article>
      `),
    ].join('') || '<div class="portal-next-empty">Geen approvals of jobs in beeld.</div>';

    const customers = Array.isArray(data?.customers) ? data.customers : [];
    customersRoot.innerHTML = customers.length
      ? customers.slice(0, 6).map((item) => `
        <article class="portal-next-list-item">
          <div class="portal-next-list-head">
            <div>
              <strong>${esc(item.customer_name || 'Klant')}</strong>
              <p class="portal-next-list-sub">${esc(item.service_tier || 'Tier onbekend')} · ${esc(item.sla_name || 'SLA onbekend')}</p>
            </div>
            <span class="${pillClass(item.critical_tenants > 0 ? 'danger' : item.avg_completion_pct < 75 ? 'warn' : 'good')}">${esc(item.avg_completion_pct || 0)}%</span>
          </div>
          <p class="portal-next-list-body">${esc(item.critical_tenants || 0)} kritieke tenants · ${esc(item.failed_jobs || 0)} failed jobs · ${esc(item.ready_services || 0)}/${esc(item.enabled_services || 0)} services gereed</p>
        </article>
      `).join('')
      : '<div class="portal-next-empty">Nog geen klantfocus beschikbaar.</div>';

    const staleTenants = Array.isArray(data?.stale_tenants) ? data.stale_tenants : [];
    tenantsRoot.innerHTML = staleTenants.length
      ? staleTenants.slice(0, 6).map((item) => `
        <article class="portal-next-list-item">
          <div class="portal-next-list-head">
            <div>
              <strong>${esc(item.customer_name || '')} · ${esc(item.tenant_name || item.tenant_id || 'Tenant')}</strong>
              <p class="portal-next-list-sub">${esc(item.last_assessment_at ? formatDate(item.last_assessment_at) : 'Nog geen assessment')}</p>
            </div>
            <span class="${pillClass(item.critical_count > 0 ? 'danger' : 'warn')}">${esc(item.completion_pct || 0)}%</span>
          </div>
          <p class="portal-next-list-body">${esc((item.reasons || []).join(', ') || 'opvolging nodig')}</p>
          <div class="portal-next-actions">
            <button type="button" class="portal-next-btn portal-next-btn--ghost portal-next-btn--small" data-tenant-action="open" data-tenant-id="${esc(item.tenant_id || '')}">Open tenant</button>
          </div>
        </article>
      `).join('')
      : '<div class="portal-next-empty">Geen tenants met directe opvolging gevonden.</div>';
    attachTenantActionHandlers();
  }

  async function loadWorkspaceSectionData(sectionName, subItem) {
    const tenantId = state.activeTenantId;
    const tenant = getTenantRecord();
    const config = getPortalConfig();
    const meta = config.SECTION_META || {};
    const title = meta[sectionName]?.title || sectionName;

    if (!tenantId || tenantId === 'all') {
      return {
        kpis: [],
        summaryHtml: `<div class="portal-next-empty">Selecteer eerst een tenant om ${esc(title)} native te laden in de nieuwe portal.</div>`,
        insightsHtml: `<div class="portal-next-empty">Tenantselectie is nodig voor detaildata.</div>`,
        detailsHtml: '<div class="portal-next-empty">Nog geen tenant gekozen.</div>',
      };
    }

    const directFetch = (path, ttl = global.CACHE_TTL.short) => global.apiFetchCached(path, {}, ttl);
    const overviewRes = await Promise.allSettled([
      global.apiFetchCached(global.API.tenants.overview(tenantId), {}, global.CACHE_TTL.overview),
      global.apiFetchCached(global.API.tenants.runs(tenantId), {}, global.CACHE_TTL.runs),
      global.apiFetchCached(`/api/tenants/${tenantId}/onboarding`, {}, global.CACHE_TTL.medium),
    ]);
    const tenantOverview = valueFromSettled(overviewRes[0]);
    const tenantRuns = toArray(valueFromSettled(overviewRes[1]));
    const onboarding = valueFromSettled(overviewRes[2]);

    const sectionLoaders = {
      gebruikers: async () => {
        const [usersRes, licensesRes, historyRes] = await Promise.allSettled([
          global.apiFetchCached(global.API.m365.users(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.m365.licenses(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.m365.provisioningHistory(tenantId), {}, global.CACHE_TTL.short),
        ]);
        const users = toArray(valueFromSettled(usersRes), ['users', 'items', 'value']);
        const licenses = toArray(valueFromSettled(licensesRes), ['licenses', 'items', 'value']);
        const history = toArray(valueFromSettled(historyRes));
        return {
          kpis: [
            { label: 'Gebruikers', value: users.length || '—', meta: 'accounts in beeld', tone: 'info' },
            { label: 'Actief', value: users.filter((u) => u.accountEnabled !== false).length || '—', meta: 'ingeschakeld', tone: 'good' },
            { label: 'Licenties', value: licenses.reduce((sum, item) => sum + Number(item.consumed || 0), 0) || '—', meta: 'toegewezen', tone: 'info' },
            { label: 'Recente acties', value: history.length || '—', meta: 'provisioninghistorie', tone: 'warn' },
          ],
          summaryHtml: renderSimpleList(users.slice(0, 5).map((u) => ({ title: u.displayName || u.userPrincipalName || 'Gebruiker', meta: u.userPrincipalName || '', body: u.jobTitle || 'Geen functietitel', badge: u.accountEnabled === false ? 'Uit' : 'Actief', tone: u.accountEnabled === false ? 'warn' : 'good' })), 'Geen gebruikers gevonden.'),
          insightsHtml: renderSimpleList([
            { title: 'Licentiedruk', meta: `${licenses.length} SKU’s`, body: 'Bekijk toewijzingen en vrije capaciteit per licentie.', badge: 'Licenties', tone: 'info' },
            { title: 'Provisioninghistorie', meta: `${history.length} events`, body: 'Nieuwe of gewijzigde gebruikersacties uit provisioning zijn zichtbaar.', badge: 'Historie', tone: history.length ? 'warn' : 'info' },
          ]),
          detailsHtml: renderDetailBlocks([
            { title: 'Gebruikers', columns: [{ label: 'Naam', key: 'name' }, { label: 'UPN', key: 'upn' }, { label: 'Status', key: 'status' }], rows: users.slice(0, 12).map((u) => ({ name: u.displayName || 'Onbekend', upn: u.userPrincipalName || '—', status: u.accountEnabled === false ? 'Uitgeschakeld' : 'Actief' })), emptyText: 'Geen gebruikersdata.' },
            { title: 'Licenties', columns: [{ label: 'SKU', key: 'name' }, { label: 'Verbruikt', key: 'used' }, { label: 'Beschikbaar', key: 'available' }], rows: licenses.slice(0, 12).map((l) => ({ name: l.displayName || l.skuPartNumber || 'SKU', used: l.consumed || 0, available: l.available || 0 })), emptyText: 'Geen licentiegegevens.' },
          ]),
        };
      },
      identity: async () => {
        const [mfaRes, guestsRes, rolesRes, legacyRes] = await Promise.allSettled([
          global.apiFetchCached(global.API.identity.mfa(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.identity.guests(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.identity.adminRoles(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.identity.legacyAuth(tenantId), {}, global.CACHE_TTL.short),
        ]);
        const mfa = toArray(valueFromSettled(mfaRes));
        const guests = toArray(valueFromSettled(guestsRes));
        const roles = toArray(valueFromSettled(rolesRes));
        const legacy = toArray(valueFromSettled(legacyRes));
        return {
          kpis: [
            { label: 'MFA-records', value: mfa.length || '—', meta: 'inlogbeveiliging', tone: 'good' },
            { label: 'Gastgebruikers', value: guests.length || '—', meta: 'externe accounts', tone: 'info' },
            { label: 'Beheerdersrollen', value: roles.length || '—', meta: 'roltoewijzingen', tone: 'warn' },
            { label: 'Legacy auth', value: legacy.length || '—', meta: 'verouderde protocollen', tone: legacy.length ? 'danger' : 'good' },
          ],
          summaryHtml: renderSimpleList(mfa.slice(0, 5).map((item) => ({ title: item.displayName || item.userPrincipalName || 'MFA-item', meta: item.userPrincipalName || '', body: item.status || 'Status onbekend', badge: item.status || 'MFA', tone: item.status?.toLowerCase?.().includes('enabled') ? 'good' : 'warn' }))),
          insightsHtml: renderSimpleList([
            { title: 'Externe toegang', meta: `${guests.length} gasten`, body: 'Controleer gastgebruikers en hun noodzaak.', badge: 'Guests', tone: guests.length ? 'warn' : 'good' },
            { title: 'Adminoppervlak', meta: `${roles.length} rolrecords`, body: 'Beperk waar mogelijk beheerrollen en evalueer rolverdeling.', badge: 'Admin', tone: roles.length > 10 ? 'warn' : 'info' },
          ]),
          detailsHtml: renderDetailBlocks([
            { title: 'Gastgebruikers', columns: [{ label: 'Naam', key: 'name' }, { label: 'UPN', key: 'upn' }], rows: guests.slice(0, 12).map((g) => ({ name: g.displayName || 'Gast', upn: g.userPrincipalName || '—' })) },
            { title: 'Beheerdersrollen', columns: [{ label: 'Rol', key: 'role' }, { label: 'Lid', key: 'member' }], rows: roles.slice(0, 12).map((r) => ({ role: r.roleName || r.role || 'Rol', member: r.displayName || r.userPrincipalName || '—' })) },
          ]),
        };
      },
      ca: async () => {
        const [polRes, locRes, histRes] = await Promise.allSettled([
          global.apiFetchCached(global.API.ca.policies(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.ca.namedLocations(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.ca.history(tenantId), {}, global.CACHE_TTL.short),
        ]);
        const policies = toArray(valueFromSettled(polRes));
        const locations = toArray(valueFromSettled(locRes));
        const history = toArray(valueFromSettled(histRes));
        return {
          kpis: [
            { label: 'Policies', value: policies.length || '—', meta: 'toegangsbeleid', tone: policies.length ? 'good' : 'warn' },
            { label: 'Locaties', value: locations.length || '—', meta: 'vertrouwde locaties', tone: 'info' },
            { label: 'Wijzigingen', value: history.length || '—', meta: 'historie-items', tone: 'warn' },
            { label: 'Actieve policy', value: policies.filter((p) => p.state !== 'disabled').length || '—', meta: 'ingeschakeld', tone: 'good' },
          ],
          summaryHtml: renderSimpleList(policies.slice(0, 5).map((p) => ({ title: p.displayName || p.name || 'Policy', meta: p.state || 'Status onbekend', body: p.conditionsSummary || 'Voorwaarden niet beschikbaar', badge: p.state || 'Policy', tone: p.state === 'enabled' ? 'good' : 'warn' }))),
          insightsHtml: renderSimpleList([{ title: 'Conditional Access', meta: `${policies.length} policies`, body: 'Gebruik dit onderdeel om dekking, locaties en wijzigingshistorie te beoordelen.', badge: 'CA', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Policies', columns: [{ label: 'Naam', key: 'name' }, { label: 'Status', key: 'status' }], rows: policies.slice(0, 12).map((p) => ({ name: p.displayName || p.name || 'Policy', status: p.state || 'Onbekend' })) }]),
        };
      },
      apps: async () => {
        const res = await global.apiFetchCached(global.API.apps.registrations(tenantId), {}, global.CACHE_TTL.short).catch(() => null);
        const apps = toArray(res, ['items', 'registrations', 'value']);
        return {
          kpis: [
            { label: 'App-registraties', value: apps.length || '—', meta: 'gekoppelde apps', tone: 'info' },
            { label: 'Met certificaat', value: apps.filter((a) => a.certificates?.length).length || '—', meta: 'certificaatgebruik', tone: 'good' },
            { label: 'Secrets', value: apps.filter((a) => a.passwordCredentials?.length).length || '—', meta: 'client secrets', tone: 'warn' },
            { label: 'Verlopen risico', value: apps.filter((a) => a.expiringSoon).length || '—', meta: 'spoedig verlopend', tone: 'danger' },
          ],
          summaryHtml: renderSimpleList(apps.slice(0, 5).map((a) => ({ title: a.displayName || a.appId || 'App', meta: a.appId || '', body: a.publisherDomain || 'Geen publisherdomein', badge: a.expiringSoon ? 'Let op' : 'Registratie', tone: a.expiringSoon ? 'warn' : 'info' }))),
          insightsHtml: renderSimpleList([{ title: 'App governance', meta: `${apps.length} registraties`, body: 'Beoordeel secrets, certificaten en verlopen referenties.', badge: 'Apps', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Registraties', columns: [{ label: 'Naam', key: 'name' }, { label: 'App ID', key: 'appId' }], rows: apps.slice(0, 12).map((a) => ({ name: a.displayName || 'App', appId: a.appId || '—' })) }]),
        };
      },
      hybrid: async () => {
        const sync = await directFetch(`/api/hybrid/${tenantId}/sync`).catch(() => null);
        return {
          kpis: [
            { label: 'AD Sync', value: sync?.status || 'Onbekend', meta: 'koppelstatus', tone: sync?.status === 'healthy' ? 'good' : 'warn' },
            { label: 'Laatste sync', value: sync?.last_sync ? relativeDate(sync.last_sync) : '—', meta: 'recente synchronisatie', tone: 'info' },
            { label: 'Fouten', value: sync?.error_count ?? '—', meta: 'bekende issues', tone: Number(sync?.error_count || 0) > 0 ? 'danger' : 'good' },
            { label: 'Objects', value: sync?.object_count ?? '—', meta: 'gesynchroniseerd', tone: 'info' },
          ],
          summaryHtml: renderSimpleList([{ title: 'AD-koppeling', meta: sync?.status || 'Onbekend', body: sync?.message || 'Geen extra synchronisatie-info ontvangen.', badge: 'Sync', tone: sync?.status === 'healthy' ? 'good' : 'warn' }]),
          insightsHtml: renderSimpleList([{ title: 'Hybride identiteit', meta: 'AD Sync', body: 'Gebruik deze weergave om laatste synchronisatie en syncfouten te monitoren.', badge: 'Hybrid', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Synchronisatiestatus', html: `<div class="portal-next-empty">${esc(sync ? JSON.stringify(sync, null, 2) : 'Geen hybride synchronisatiedata gevonden.')}</div>` }]),
        };
      },
      alerts: async () => {
        const [scoreRes, signInsRes, auditRes] = await Promise.allSettled([
          global.apiFetchCached(global.API.alerts.secureScore(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.alerts.signIns(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.alerts.auditLogs(tenantId), {}, global.CACHE_TTL.short),
        ]);
        const score = valueFromSettled(scoreRes);
        const signins = toArray(valueFromSettled(signInsRes));
        const audit = toArray(valueFromSettled(auditRes));
        return {
          kpis: [
            { label: 'Beveiligingsscore', value: score?.percentage != null ? `${Math.round(score.percentage)}%` : '—', meta: 'secure score', tone: healthTone(score?.percentage) },
            { label: 'Verdachte aanmeldingen', value: signins.length || '—', meta: 'in beeld', tone: signins.length ? 'warn' : 'good' },
            { label: 'Audit logs', value: audit.length || '—', meta: 'wijzigingsitems', tone: 'info' },
            { label: 'Kritiek', value: signins.filter((s) => s.riskLevel === 'high').length || '—', meta: 'hoog risico', tone: 'danger' },
          ],
          summaryHtml: renderSimpleList(signins.slice(0, 5).map((s) => ({ title: s.userPrincipalName || s.user || 'Aanmelding', meta: s.createdDateTime || s.time || '', body: s.location || s.ipAddress || 'Locatie onbekend', badge: s.riskLevel || 'Sign-in', tone: s.riskLevel === 'high' ? 'danger' : 'warn' }))),
          insightsHtml: renderSimpleList([{ title: 'Signalen', meta: `${audit.length} auditlogs`, body: 'Beveiligingsscore, verdachte aanmeldingen en wijzigingshistorie zijn hier samengebracht.', badge: 'Alerts', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Audit logs', columns: [{ label: 'Actie', key: 'action' }, { label: 'Gebruiker', key: 'user' }], rows: audit.slice(0, 12).map((a) => ({ action: a.activityDisplayName || a.operation || 'Log', user: a.userPrincipalName || a.initiatedBy || '—' })) }]),
        };
      },
      compliance: async () => {
        const [cisRes, ztRes] = await Promise.allSettled([
          directFetch(`/api/compliance/${tenantId}/cis`, global.CACHE_TTL.short),
          directFetch(`/api/compliance/${tenantId}/zerotrust`, global.CACHE_TTL.short),
        ]);
        const cis = valueFromSettled(cisRes);
        const zt = valueFromSettled(ztRes);
        const findings = toArray(cis?.findings || cis?.items || []);
        return {
          kpis: [
            { label: 'CIS items', value: findings.length || '—', meta: 'normering', tone: findings.length ? 'warn' : 'info' },
            { label: 'Zero Trust score', value: zt?.summary?.score ?? '—', meta: 'volwassenheid', tone: healthTone(zt?.summary?.score) },
            { label: 'Open issues', value: findings.filter((f) => f.status !== 'passed').length || '—', meta: 'aandacht nodig', tone: 'warn' },
            { label: 'Passed', value: findings.filter((f) => f.status === 'passed').length || '—', meta: 'in orde', tone: 'good' },
          ],
          summaryHtml: renderSimpleList(findings.slice(0, 5).map((f) => ({ title: f.title || f.control || 'CIS check', meta: f.status || 'Status onbekend', body: f.description || '', badge: f.status || 'CIS', tone: f.status === 'passed' ? 'good' : 'warn' }))),
          insightsHtml: renderSimpleList([{ title: 'Normering en maturity', meta: 'CIS + Zero Trust', body: 'Gebruik deze weergave om normeringsresultaten en volwassenheid naast elkaar te bekijken.', badge: 'Compliance', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'CIS-controles', columns: [{ label: 'Controle', key: 'control' }, { label: 'Status', key: 'status' }], rows: findings.slice(0, 12).map((f) => ({ control: f.title || f.control || 'Controle', status: f.status || 'Onbekend' })) }]),
        };
      },
      bevindingen: async () => {
        const [healthRes, listRes] = await Promise.allSettled([
          directFetch(`/api/findings/${tenantId}/health`, global.CACHE_TTL.short),
          directFetch(`/api/findings/${tenantId}/list`, global.CACHE_TTL.short),
        ]);
        const health = valueFromSettled(healthRes);
        const findings = toArray(valueFromSettled(listRes));
        return {
          kpis: [
            { label: 'Bevindingen', value: findings.length || '—', meta: 'open risico’s', tone: 'warn' },
            { label: 'Kritiek', value: health?.critical || findings.filter((f) => f.severity === 'critical').length || '—', meta: 'directe opvolging', tone: 'danger' },
            { label: 'Waarschuwing', value: health?.warning || findings.filter((f) => f.severity === 'warning').length || '—', meta: 'verbeterpunten', tone: 'warn' },
            { label: 'Info', value: health?.info || findings.filter((f) => f.severity === 'info').length || '—', meta: 'informatief', tone: 'info' },
          ],
          summaryHtml: renderSimpleList(findings.slice(0, 5).map((f) => ({ title: f.title || f.finding_title || 'Bevinding', meta: f.category || 'Categorie onbekend', body: f.recommendation || f.description || '', badge: f.severity || 'Severity', tone: f.severity || 'warn' }))),
          insightsHtml: renderSimpleList([{ title: 'Risicowerkbank', meta: `${findings.length} items`, body: 'Openstaande bevindingen worden hier compact samengevat voor triage en opvolging.', badge: 'Findings', tone: 'warn' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Open bevindingen', columns: [{ label: 'Titel', key: 'title' }, { label: 'Severity', key: 'severity' }], rows: findings.slice(0, 12).map((f) => ({ title: f.title || f.finding_title || 'Bevinding', severity: f.severity || 'Onbekend' })) }]),
        };
      },
      zerotrust: async () => {
        const data = await directFetch(`/api/compliance/${tenantId}/zerotrust`, global.CACHE_TTL.short).catch(() => null);
        const pillars = toArray(data?.pillars || data?.items || []);
        return {
          kpis: [
            { label: 'Pijlers', value: pillars.length || '—', meta: 'zero trust domeinen', tone: 'info' },
            { label: 'Score', value: data?.summary?.score ?? '—', meta: 'gemiddelde maturity', tone: healthTone(data?.summary?.score) },
            { label: 'Prioriteit', value: data?.summary?.priority_count ?? '—', meta: 'verbeterpunten', tone: 'warn' },
            { label: 'Laatste run', value: data?.summary?.last_run ? relativeDate(data.summary.last_run) : '—', meta: 'scanmoment', tone: 'info' },
          ],
          summaryHtml: renderSimpleList(pillars.slice(0, 5).map((p) => ({ title: p.title || p.name || 'Pijler', meta: `Score ${p.score ?? '—'}`, body: p.summary || '', badge: p.status || 'Pijler', tone: healthTone(p.score) }))),
          insightsHtml: renderSimpleList([{ title: 'Zero Trust maturity', meta: `${pillars.length} pijlers`, body: 'Bekijk per pijler waar de grootste gaten en verbeterkansen zitten.', badge: 'ZT', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Pijlers', columns: [{ label: 'Pijler', key: 'name' }, { label: 'Score', key: 'score' }], rows: pillars.slice(0, 12).map((p) => ({ name: p.title || p.name || 'Pijler', score: p.score ?? '—' })) }]),
        };
      },
      domains: async () => {
        const data = await global.apiFetchCached(global.API.domains.list(tenantId), {}, global.CACHE_TTL.domains).catch(() => null);
        const domains = toArray(data);
        return {
          kpis: [
            { label: 'Domeinen', value: domains.length || '—', meta: 'geverifieerd of gekoppeld', tone: 'info' },
            { label: 'SPF', value: domains.filter((d) => d.spf_valid).length || '—', meta: 'geldig', tone: 'good' },
            { label: 'DKIM', value: domains.filter((d) => d.dkim_valid).length || '—', meta: 'geldig', tone: 'good' },
            { label: 'DMARC', value: domains.filter((d) => d.dmarc_valid).length || '—', meta: 'geldig', tone: 'warn' },
          ],
          summaryHtml: renderSimpleList(domains.slice(0, 5).map((d) => ({ title: d.domain || 'Domein', meta: `SPF ${d.spf_valid ? 'ok' : 'mist'} · DKIM ${d.dkim_valid ? 'ok' : 'mist'}`, body: `DMARC ${d.dmarc_valid ? 'ok' : 'mist'}`, badge: d.dmarc_valid ? 'Beschermd' : 'Aandacht', tone: d.dmarc_valid ? 'good' : 'warn' }))),
          insightsHtml: renderSimpleList([{ title: 'E-mailbeveiliging', meta: `${domains.length} domeinen`, body: 'Hier zie je per domein snel of SPF, DKIM en DMARC op orde zijn.', badge: 'DNS', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Domeinoverzicht', columns: [{ label: 'Domein', key: 'domain' }, { label: 'SPF', key: 'spf' }, { label: 'DKIM', key: 'dkim' }, { label: 'DMARC', key: 'dmarc' }], rows: domains.slice(0, 12).map((d) => ({ domain: d.domain || '—', spf: d.spf_valid ? 'OK' : 'Mist', dkim: d.dkim_valid ? 'OK' : 'Mist', dmarc: d.dmarc_valid ? 'OK' : 'Mist' })) }]),
        };
      },
      exchange: async () => {
        const [mailboxesRes, forwardingRes, rulesRes] = await Promise.allSettled([
          global.apiFetchCached(global.API.exchange.mailboxes(tenantId), {}, global.CACHE_TTL.mailboxes),
          global.apiFetchCached(global.API.exchange.forwarding(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.exchange.rules(tenantId), {}, global.CACHE_TTL.short),
        ]);
        const mailboxes = toArray(valueFromSettled(mailboxesRes), ['mailboxes', 'items', 'value']);
        const forwarding = toArray(valueFromSettled(forwardingRes));
        const rules = toArray(valueFromSettled(rulesRes));
        return {
          kpis: [
            { label: 'Mailboxen', value: mailboxes.length || '—', meta: 'in tenant', tone: 'info' },
            { label: 'Doorsturing', value: forwarding.length || '—', meta: 'gevonden regels', tone: forwarding.length ? 'warn' : 'good' },
            { label: 'Mailboxregels', value: rules.length || '—', meta: 'in beeld', tone: 'warn' },
            { label: 'Recente scan', value: tenantRuns[0]?.completed_at ? relativeDate(tenantRuns[0].completed_at) : '—', meta: 'exchange context', tone: 'info' },
          ],
          summaryHtml: renderSimpleList(mailboxes.slice(0, 5).map((m) => ({ title: m.displayName || m.userPrincipalName || 'Mailbox', meta: m.userPrincipalName || '', body: m.primarySmtpAddress || '', badge: m.accountEnabled === false ? 'Uit' : 'Actief', tone: m.accountEnabled === false ? 'warn' : 'good' }))),
          insightsHtml: renderSimpleList([{ title: 'Mailflow aandacht', meta: `${forwarding.length} forwarding`, body: 'Controleer doorsturing en mailboxregels op onverwachte instellingen.', badge: 'Exchange', tone: forwarding.length || rules.length ? 'warn' : 'good' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Mailboxen', columns: [{ label: 'Naam', key: 'name' }, { label: 'Adres', key: 'mail' }], rows: mailboxes.slice(0, 12).map((m) => ({ name: m.displayName || 'Mailbox', mail: m.primarySmtpAddress || m.userPrincipalName || '—' })) }]),
        };
      },
      teams: async () => {
        const data = await global.apiFetchCached(global.API.collaboration.teams(tenantId), {}, global.CACHE_TTL.teams).catch(() => null);
        const teams = toArray(data, ['teams', 'items', 'value']);
        return {
          kpis: [
            { label: 'Teams', value: teams.length || '—', meta: 'samenwerkingsruimtes', tone: 'info' },
            { label: 'Publiek', value: teams.filter((t) => t.visibility === 'Public').length || '—', meta: 'openbaar', tone: 'warn' },
            { label: 'Privé', value: teams.filter((t) => t.visibility !== 'Public').length || '—', meta: 'afgeschermd', tone: 'good' },
            { label: 'Eigenaren', value: teams.reduce((sum, t) => sum + Number(t.ownerCount || 0), 0) || '—', meta: 'totaal geteld', tone: 'info' },
          ],
          summaryHtml: renderSimpleList(teams.slice(0, 5).map((t) => ({ title: t.displayName || t.name || 'Team', meta: t.visibility || 'Visibility onbekend', body: `${t.memberCount || 0} leden`, badge: t.visibility || 'Team', tone: t.visibility === 'Public' ? 'warn' : 'good' }))),
          insightsHtml: renderSimpleList([{ title: 'Teams-governance', meta: `${teams.length} teams`, body: 'Publieke teams en eigenaarschap worden hier compact zichtbaar.', badge: 'Teams', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Teamslijst', columns: [{ label: 'Naam', key: 'name' }, { label: 'Visibility', key: 'visibility' }, { label: 'Leden', key: 'members' }], rows: teams.slice(0, 12).map((t) => ({ name: t.displayName || t.name || 'Team', visibility: t.visibility || '—', members: t.memberCount || 0 })) }]),
        };
      },
      sharepoint: async () => {
        const [sitesRes, settingsRes] = await Promise.allSettled([
          global.apiFetchCached(global.API.collaboration.sharepointSites(tenantId), {}, global.CACHE_TTL.teams),
          global.apiFetchCached(global.API.collaboration.sharepointSettings(tenantId), {}, global.CACHE_TTL.short),
        ]);
        const sites = toArray(valueFromSettled(sitesRes), ['sites', 'items', 'value']);
        const settings = valueFromSettled(settingsRes);
        return {
          kpis: [
            { label: 'Sites', value: sites.length || '—', meta: 'sharepoint sites', tone: 'info' },
            { label: 'Extern delen', value: settings?.externalSharing || 'Onbekend', meta: 'beleid', tone: 'warn' },
            { label: 'Actieve sites', value: sites.filter((s) => !s.isDeleted).length || '—', meta: 'beschikbaar', tone: 'good' },
            { label: 'M365 gekoppeld', value: sites.filter((s) => s.groupId).length || '—', meta: 'met groep', tone: 'info' },
          ],
          summaryHtml: renderSimpleList(sites.slice(0, 5).map((s) => ({ title: s.displayName || s.name || 'Site', meta: s.webUrl || '', body: s.template || 'Template onbekend', badge: s.sharingCapability || 'Sharing', tone: 'info' }))),
          insightsHtml: renderSimpleList([{ title: 'Sites en instellingen', meta: `${sites.length} sites`, body: 'SharePoint-sites en globale samenwerkingsinstellingen native in de nieuwe portal.', badge: 'SP', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Sites', columns: [{ label: 'Naam', key: 'name' }, { label: 'Template', key: 'template' }], rows: sites.slice(0, 12).map((s) => ({ name: s.displayName || s.name || 'Site', template: s.template || '—' })) }]),
        };
      },
      backup: async () => {
        const [summaryRes, statusRes, historyRes] = await Promise.allSettled([
          global.apiFetchCached(global.API.backup.summary(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.backup.status(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.backup.history(tenantId), {}, global.CACHE_TTL.short),
        ]);
        const summary = valueFromSettled(summaryRes);
        const status = valueFromSettled(statusRes);
        const history = toArray(valueFromSettled(historyRes));
        return {
          kpis: [
            { label: 'Exchange', value: summary?.exchange?.resourceCount ?? '—', meta: 'backup items', tone: 'info' },
            { label: 'OneDrive', value: summary?.oneDrive?.resourceCount ?? '—', meta: 'backup items', tone: 'info' },
            { label: 'SharePoint', value: summary?.sharePoint?.resourceCount ?? '—', meta: 'backup items', tone: 'info' },
            { label: 'Historie', value: history.length || '—', meta: 'backup events', tone: 'good' },
          ],
          summaryHtml: renderSimpleList([{ title: 'Backupstatus', meta: status?.status || 'Onbekend', body: status?.message || 'Samenvatting van beschermde workloads.', badge: 'Backup', tone: status?.status === 'healthy' ? 'good' : 'warn' }]),
          insightsHtml: renderSimpleList([{ title: 'Bescherming', meta: 'M365 workloads', body: 'Exchange, OneDrive en SharePoint backupstatus worden hier samengebracht.', badge: 'Backup', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Backuphistorie', columns: [{ label: 'Type', key: 'type' }, { label: 'Status', key: 'status' }], rows: history.slice(0, 12).map((h) => ({ type: h.jobType || h.type || 'Backup', status: h.status || 'Onbekend' })) }]),
        };
      },
      intuneManagementHub: async () => {
        const [overviewRes, prefsRes, guardianRes] = await Promise.allSettled([
          directFetch(`/api/management-hub/${tenantId}/overview`, global.CACHE_TTL.short),
          directFetch(`/api/management-hub/${tenantId}/policy-preferences`, global.CACHE_TTL.short),
          directFetch(`/api/management-hub/${tenantId}/guardian-events?limit=10`, global.CACHE_TTL.short),
        ]);
        const overview = valueFromSettled(overviewRes);
        const prefs = toArray(valueFromSettled(prefsRes));
        const guardian = toArray(valueFromSettled(guardianRes));
        return {
          kpis: [
            { label: 'Policies', value: prefs.length || '—', meta: 'policy preferences', tone: 'info' },
            { label: 'Guardian events', value: guardian.length || '—', meta: 'auditfeed', tone: 'warn' },
            { label: 'Devices', value: overview?.device_count ?? '—', meta: 'beheerlaag', tone: 'info' },
            { label: 'Status', value: overview?.status || 'Onbekend', meta: 'hubstatus', tone: overview?.status === 'healthy' ? 'good' : 'warn' },
          ],
          summaryHtml: renderSimpleList([{ title: 'Beheercockpit', meta: overview?.status || 'Onbekend', body: overview?.message || 'Centraal beeld van cloud policy preferences en guardian-events.', badge: 'Hub', tone: 'info' }]),
          insightsHtml: renderSimpleList([{ title: 'Audit en policies', meta: `${prefs.length} policies`, body: 'Beleidsvoorkeuren en guardian-events zijn native samengevat in deze shell.', badge: 'Hub', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([
            { title: 'Policy preferences', columns: [{ label: 'Naam', key: 'name' }, { label: 'Type', key: 'type' }], rows: prefs.slice(0, 12).map((p) => ({ name: p.name || p.displayName || 'Policy', type: p.policyType || p.type || '—' })) },
            { title: 'Guardian events', columns: [{ label: 'Event', key: 'event' }, { label: 'Tijd', key: 'time' }], rows: guardian.slice(0, 12).map((g) => ({ event: g.title || g.eventName || 'Event', time: g.created_at || g.timestamp || '—' })) },
          ]),
        };
      },
      intune: async () => {
        const [summaryRes, devicesRes, complianceRes, configRes, historyRes] = await Promise.allSettled([
          directFetch(`/api/intune/${tenantId}/summary`, global.CACHE_TTL.short),
          directFetch(`/api/intune/${tenantId}/devices`, global.CACHE_TTL.short),
          directFetch(`/api/intune/${tenantId}/compliance`, global.CACHE_TTL.short),
          directFetch(`/api/intune/${tenantId}/config`, global.CACHE_TTL.short),
          directFetch(`/api/intune/${tenantId}/history`, global.CACHE_TTL.short),
        ]);
        const summary = valueFromSettled(summaryRes);
        const devices = toArray(valueFromSettled(devicesRes));
        const compliance = toArray(valueFromSettled(complianceRes));
        const configRows = toArray(valueFromSettled(configRes));
        const history = toArray(valueFromSettled(historyRes));
        return {
          kpis: [
            { label: 'Apparaten', value: devices.length || summary?.device_count || '—', meta: 'managed devices', tone: 'info' },
            { label: 'Compliant', value: compliance.filter((d) => d.status === 'compliant').length || '—', meta: 'voldoet', tone: 'good' },
            { label: 'Profielen', value: configRows.length || '—', meta: 'configuraties', tone: 'info' },
            { label: 'Historie', value: history.length || '—', meta: 'deployment events', tone: 'warn' },
          ],
          summaryHtml: renderSimpleList(devices.slice(0, 5).map((d) => ({ title: d.deviceName || d.name || 'Apparaat', meta: d.operatingSystem || d.os || '', body: d.userPrincipalName || d.primaryUser || '', badge: d.complianceState || d.status || 'Device', tone: (d.complianceState || d.status) === 'compliant' ? 'good' : 'warn' }))),
          insightsHtml: renderSimpleList([{ title: 'Device posture', meta: `${devices.length} apparaten`, body: 'Overzicht van apparaten, naleving en configuratieprofielen in native vorm.', badge: 'Intune', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([
            { title: 'Apparaten', columns: [{ label: 'Naam', key: 'name' }, { label: 'OS', key: 'os' }, { label: 'Status', key: 'status' }], rows: devices.slice(0, 12).map((d) => ({ name: d.deviceName || d.name || 'Apparaat', os: d.operatingSystem || d.os || '—', status: d.complianceState || d.status || '—' })) },
            { title: 'Configuratieprofielen', columns: [{ label: 'Naam', key: 'name' }, { label: 'Type', key: 'type' }], rows: configRows.slice(0, 12).map((c) => ({ name: c.displayName || c.name || 'Profiel', type: c.platformType || c.type || '—' })) },
          ]),
        };
      },
      assessment: async () => ({
        kpis: [
          { label: 'Runs', value: tenantRuns.length || '—', meta: 'scanhistorie', tone: 'info' },
          { label: 'Auth ready', value: onboarding?.auth_ready ? 'Ja' : 'Nee', meta: 'connectorstatus', tone: onboarding?.auth_ready ? 'good' : 'warn' },
          { label: 'Readiness', value: onboarding?.completion_pct != null ? `${onboarding.completion_pct}%` : '—', meta: 'onboarding', tone: onboarding?.completion_pct >= 75 ? 'good' : 'warn' },
          { label: 'Laatste scan', value: tenantRuns[0]?.completed_at ? relativeDate(tenantRuns[0].completed_at) : 'Nog niet', meta: 'runstatus', tone: 'info' },
        ],
        summaryHtml: renderSimpleList(tenantRuns.slice(0, 5).map((run) => ({ title: run.status || 'Run', meta: formatDate(run.completed_at || run.started_at), body: `Score ${run.score_overall ?? '—'} · ${run.run_mode || 'run'}`, badge: run.status || 'Run', tone: healthTone(run.score_overall) })), 'Nog geen scanruns gevonden.'),
        insightsHtml: renderSimpleList([{ title: 'Scangereedheid', meta: onboarding?.auth_ready ? 'Connector klaar' : 'Connector mist', body: 'Gebruik deze native weergave om readiness en runhistorie te volgen.', badge: 'Scan', tone: onboarding?.auth_ready ? 'good' : 'warn' }]),
        detailsHtml: renderDetailBlocks([{ title: 'Recente runs', columns: [{ label: 'Datum', key: 'date' }, { label: 'Status', key: 'status' }, { label: 'Score', key: 'score' }], rows: tenantRuns.slice(0, 12).map((r) => ({ date: formatDate(r.completed_at || r.started_at), status: r.status || '—', score: r.score_overall ?? '—' })) }]),
      }),
      results: async () => {
        const [statsRes, actionsRes] = await Promise.allSettled([
          global.apiFetchCached(global.API.reports.stats(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.actions.list(tenantId), {}, global.CACHE_TTL.short),
        ]);
        const stats = valueFromSettled(statsRes);
        const actions = toArray(valueFromSettled(actionsRes));
        return {
          kpis: [
            { label: 'Rapporten', value: stats?.reports_count ?? tenantRuns.length ?? '—', meta: 'beschikbaar', tone: 'info' },
            { label: 'Gem. score', value: stats?.avg_score != null ? `${Math.round(stats.avg_score)}%` : '—', meta: 'op rapporten', tone: healthTone(stats?.avg_score) },
            { label: 'Acties', value: actions.length || '—', meta: 'open taken', tone: actions.length ? 'warn' : 'good' },
            { label: 'Laatste run', value: tenantRuns[0]?.completed_at ? relativeDate(tenantRuns[0].completed_at) : '—', meta: 'recente rapportage', tone: 'info' },
          ],
          summaryHtml: renderSimpleList(tenantRuns.slice(0, 5).map((r) => ({ title: `Run ${formatShortDate(r.completed_at || r.started_at)}`, meta: r.status || '', body: `Score ${r.score_overall ?? '—'} · ${r.critical_count || 0} kritiek`, badge: r.status || 'Run', tone: healthTone(r.score_overall) }))),
          insightsHtml: renderSimpleList(actions.slice(0, 4).map((a) => ({ title: a.title || a.action_title || 'Actie', meta: a.status || 'Open', body: a.description || '', badge: a.status || 'Actie', tone: a.status === 'completed' ? 'good' : 'warn' })), 'Geen open acties gevonden.'),
          detailsHtml: renderDetailBlocks([{ title: 'Actielijst', columns: [{ label: 'Actie', key: 'title' }, { label: 'Status', key: 'status' }], rows: actions.slice(0, 12).map((a) => ({ title: a.title || a.action_title || 'Actie', status: a.status || 'Open' })) }]),
        };
      },
      herstel: async () => {
        const [catalogRes, historyRes] = await Promise.allSettled([
          global.apiFetchCached(global.API.remediate.catalog(tenantId), {}, global.CACHE_TTL.short),
          global.apiFetchCached(global.API.remediate.history(tenantId), {}, global.CACHE_TTL.short),
        ]);
        const catalog = toArray(valueFromSettled(catalogRes));
        const history = toArray(valueFromSettled(historyRes));
        return {
          kpis: [
            { label: 'Catalogus', value: catalog.length || '—', meta: 'beschikbare fixes', tone: 'info' },
            { label: 'Uitgevoerd', value: history.filter((h) => h.status === 'completed').length || '—', meta: 'afgerond', tone: 'good' },
            { label: 'Mislukt', value: history.filter((h) => h.status === 'failed').length || '—', meta: 'opvolging', tone: 'danger' },
            { label: 'Geschiedenis', value: history.length || '—', meta: 'herstelruns', tone: 'warn' },
          ],
          summaryHtml: renderSimpleList(catalog.slice(0, 5).map((c) => ({ title: c.title || c.name || 'Fix', meta: c.category || 'Categorie', body: c.description || '', badge: c.risk_level || 'Catalogus', tone: 'info' }))),
          insightsHtml: renderSimpleList([{ title: 'Herstelcatalogus', meta: `${catalog.length} items`, body: 'Beschikbare fixes en uitgevoerde herstelgeschiedenis in één native overzicht.', badge: 'Herstel', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Herstelhistorie', columns: [{ label: 'Actie', key: 'action' }, { label: 'Status', key: 'status' }], rows: history.slice(0, 12).map((h) => ({ action: h.title || h.job_type || 'Herstel', status: h.status || 'Onbekend' })) }]),
        };
      },
      baseline: async () => {
        const [baselinesRes, assignmentsRes] = await Promise.allSettled([
          global.apiFetchCached(global.API.baselines.list(), {}, global.CACHE_TTL.medium),
          global.apiFetchCached(global.API.baselines.allAssign(), {}, global.CACHE_TTL.medium),
        ]);
        const baselines = toArray(valueFromSettled(baselinesRes));
        const assignments = toArray(valueFromSettled(assignmentsRes));
        return {
          kpis: [
            { label: 'Baselines', value: baselines.length || '—', meta: 'beschikbaar', tone: 'info' },
            { label: 'Toewijzingen', value: assignments.length || '—', meta: 'tenantkoppelingen', tone: 'good' },
            { label: 'Actief', value: baselines.filter((b) => b.is_active !== false).length || '—', meta: 'ingeschakeld', tone: 'good' },
            { label: 'Controls', value: baselines.reduce((sum, b) => sum + Number(b.control_count || 0), 0) || '—', meta: 'ingestelde checks', tone: 'info' },
          ],
          summaryHtml: renderSimpleList(baselines.slice(0, 5).map((b) => ({ title: b.name || 'Baseline', meta: `${b.control_count || 0} controls`, body: b.description || '', badge: b.is_active === false ? 'Inactief' : 'Actief', tone: b.is_active === false ? 'warn' : 'good' }))),
          insightsHtml: renderSimpleList([{ title: 'Standaardinstellingen', meta: `${assignments.length} toewijzingen`, body: 'Baselines en toewijzingen zijn nu native inzichtelijk in de nieuwe shell.', badge: 'Baseline', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Baseline-overzicht', columns: [{ label: 'Naam', key: 'name' }, { label: 'Controls', key: 'controls' }], rows: baselines.slice(0, 12).map((b) => ({ name: b.name || 'Baseline', controls: b.control_count || 0 })) }]),
        };
      },
      kb: async () => {
        const activeTab = subItem || 'overview';
        const metaRes = await global.apiFetchCached(global.API.kb.meta(tenantId), {}, global.CACHE_TTL.medium).catch(() => null);
        const endpointMap = {
          overview: global.API.kb.assets(tenantId),
          assets: global.API.kb.assets(tenantId),
          vlans: global.API.kb.vlans(tenantId),
          pages: global.API.kb.pages(tenantId),
          contacts: global.API.kb.contacts(tenantId),
          passwords: global.API.kb.passwords(tenantId),
          software: global.API.kb.software(tenantId),
          domains: global.API.kb.domains(tenantId),
          appregs: `/api/kb/${tenantId}/appregs`,
          m365: global.API.kb.m365(tenantId),
          changelog: global.API.kb.changelog(tenantId),
        };
        const rowsRes = await global.apiFetchCached(endpointMap[activeTab] || endpointMap.overview, {}, global.CACHE_TTL.medium).catch(() => null);
        const rows = toArray(rowsRes);
        return {
          kpis: [
            { label: 'KB meta', value: metaRes?.customer_name || tenant?.customer_name || 'Tenant', meta: 'documentatiecontext', tone: 'info' },
            { label: 'Actief tabblad', value: activeTab, meta: 'subhoofdstuk', tone: 'good' },
            { label: 'Items', value: rows.length || '—', meta: 'in dit onderdeel', tone: 'info' },
            { label: 'Tenant', value: tenant?.tenant_name || tenantId, meta: 'brondataset', tone: 'info' },
          ],
          summaryHtml: renderSimpleList(rows.slice(0, 5).map((r) => ({ title: r.name || r.title || r.display_name || r.domain || 'KB item', meta: r.type || r.category || activeTab, body: r.description || r.notes || '', badge: activeTab, tone: 'info' })), 'Geen documentatie-items gevonden.'),
          insightsHtml: renderSimpleList([{ title: 'Kennisbank', meta: activeTab, body: 'Deze native weergave gebruikt dezelfde tenantdocumentatie maar toont die in de nieuwe portallayout.', badge: 'KB', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: `KB · ${activeTab}`, columns: [{ label: 'Naam', key: 'name' }, { label: 'Type', key: 'type' }], rows: rows.slice(0, 12).map((r) => ({ name: r.name || r.title || r.display_name || r.domain || 'Item', type: r.type || r.category || activeTab })) }]),
        };
      },
      tenantoverzicht: async () => null,
      mspcontrolcenter: async () => null,
      platformHub: async () => ({
        kpis: [
          { label: 'Tenants', value: state.tenants.length || '—', meta: 'gekoppeld', tone: 'info' },
          { label: 'Klantstatus', value: 'Platform', meta: 'beheerlaag', tone: 'good' },
          { label: 'Rollen', value: 'Zie instellingen', meta: 'toegang', tone: 'warn' },
          { label: 'Config', value: 'Portal', meta: 'platforminstellingen', tone: 'info' },
        ],
        summaryHtml: renderSimpleList([{ title: 'Platformbeheer', meta: 'Tenantoverzicht, rollen en configuratie', body: 'Gebruik de nieuwe shell om platformonderdelen logisch te ordenen en later native uit te bouwen.', badge: 'Platform', tone: 'info' }]),
        insightsHtml: renderSimpleList([{ title: 'Volgende native stap', meta: 'Platform', body: 'Rollen, tenantinstellingen en platformconfiguratie kunnen hier als volgende native modules worden ingebouwd.', badge: 'Roadmap', tone: 'warn' }]),
        detailsHtml: renderDetailBlocks([{ title: 'Gekoppelde tenants', columns: [{ label: 'Naam', key: 'name' }, { label: 'Readiness', key: 'readiness' }], rows: state.tenants.slice(0, 12).map((t) => ({ name: t.customer_name || t.tenant_name || 'Tenant', readiness: `${t.ops_summary?.onboarding?.completion_pct ?? 0}%` })) }]),
      }),
      dienstenHub: async () => ({
        kpis: [
          { label: 'Catalogus', value: 'Diensten', meta: 'managed en advisory', tone: 'info' },
          { label: 'Security', value: 'Beschikbaar', meta: 'identiteit en monitoring', tone: 'good' },
          { label: 'Cloud', value: 'Azure', meta: 'kosten en resources', tone: 'info' },
          { label: 'Rapportage', value: 'Acties', meta: 'follow-up', tone: 'warn' },
        ],
        summaryHtml: renderSimpleList([{ title: 'Dienstenhub', meta: 'Catalogus en dienstlijnen', body: 'Deze shell kan diensten logisch bundelen zonder terug te vallen op de oude portallayout.', badge: 'Diensten', tone: 'info' }]),
        insightsHtml: renderSimpleList([{ title: 'Functionele routing', meta: 'Security, cloud, scans', body: 'Vanuit hier kunnen native hubtegels verder worden doorontwikkeld in de nieuwe portal.', badge: 'Hub', tone: 'info' }]),
        detailsHtml: renderDetailBlocks([{ title: 'Beschikbare tenantcontext', columns: [{ label: 'Tenant', key: 'tenant' }, { label: 'Score', key: 'score' }], rows: state.tenants.slice(0, 12).map((t) => ({ tenant: t.customer_name || t.tenant_name || 'Tenant', score: t.latest_run?.score_overall ?? '—' })) }]),
      }),
      klantenbeheer: async () => {
        const data = await global.apiFetchCached('/api/customers', {}, global.CACHE_TTL.customers).catch(() => null);
        const customers = toArray(data);
        return {
          kpis: [
            { label: 'Klanten', value: customers.length || '—', meta: 'in beheer', tone: 'info' },
            { label: 'Actief', value: customers.filter((c) => c.status === 'active').length || '—', meta: 'status actief', tone: 'good' },
            { label: 'Tenants', value: customers.reduce((sum, c) => sum + Number(c.tenant_count || 0), 0) || '—', meta: 'gekoppeld', tone: 'info' },
            { label: 'Aandacht', value: customers.filter((c) => c.status !== 'active').length || '—', meta: 'niet-actief', tone: 'warn' },
          ],
          summaryHtml: renderSimpleList(customers.slice(0, 6).map((c) => ({ title: c.name || c.customer_name || 'Klant', meta: c.service_tier || c.status || '', body: `${c.tenant_count || 0} tenants`, badge: c.status || 'Klant', tone: c.status === 'active' ? 'good' : 'warn' }))),
          insightsHtml: renderSimpleList([{ title: 'Klantportfolio', meta: `${customers.length} klanten`, body: 'Klantenbeheer draait nu native als portfolio-overzicht in de nieuwe shell.', badge: 'MSP', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Klantenlijst', columns: [{ label: 'Klant', key: 'name' }, { label: 'Status', key: 'status' }, { label: 'Tenants', key: 'tenants' }], rows: customers.slice(0, 12).map((c) => ({ name: c.name || c.customer_name || 'Klant', status: c.status || '—', tenants: c.tenant_count || 0 })) }]),
        };
      },
      azure: async () => {
        const [customerAzureRes, costsRes] = await Promise.allSettled([
          tenant?.customer_id ? directFetch(`/api/customers/${tenant.customer_id}/azure`, global.CACHE_TTL.medium) : Promise.resolve(null),
          tenant?.customer_id ? directFetch(`/api/customers/${tenant.customer_id}/finance`, global.CACHE_TTL.medium) : Promise.resolve(null),
        ]);
        const azure = valueFromSettled(customerAzureRes);
        const costs = valueFromSettled(costsRes);
        const subscriptions = toArray(azure?.subscriptions || azure?.items || []);
        return {
          kpis: [
            { label: 'Subscriptions', value: subscriptions.length || '—', meta: 'azure koppelingen', tone: 'info' },
            { label: 'Resources', value: azure?.summary?.resources ?? '—', meta: 'in beeld', tone: 'info' },
            { label: 'Kosten', value: formatCurrency(costs?.summary?.monthly_cost || 0), meta: 'samenvatting', tone: 'warn' },
            { label: 'Tenant', value: tenant?.customer_name || tenant?.tenant_name || '—', meta: 'klantcontext', tone: 'good' },
          ],
          summaryHtml: renderSimpleList(subscriptions.slice(0, 5).map((s) => ({ title: s.display_name || s.name || 'Subscription', meta: s.subscription_id || '', body: s.state || 'Status onbekend', badge: s.state || 'Azure', tone: 'info' })), 'Geen Azure-data gevonden voor deze klant.'),
          insightsHtml: renderSimpleList([{ title: 'Azure in de nieuwe shell', meta: 'Kosten en subscriptions', body: 'Dit onderdeel toont al native Azure-context vanuit klantdata, zonder de oude portal-embed.', badge: 'Azure', tone: 'info' }]),
          detailsHtml: renderDetailBlocks([{ title: 'Subscriptions', columns: [{ label: 'Naam', key: 'name' }, { label: 'Status', key: 'status' }], rows: subscriptions.slice(0, 12).map((s) => ({ name: s.display_name || s.name || 'Subscription', status: s.state || '—' })) }]),
        };
      },
      settings: async () => ({
        kpis: [
          { label: 'Tenant', value: tenant?.customer_name || tenant?.tenant_name || '—', meta: 'geselecteerd', tone: 'info' },
          { label: 'Subonderdeel', value: subItem || 'tenant', meta: 'instellingstab', tone: 'good' },
          { label: 'Portal', value: 'Nieuw', meta: 'configuratiecontext', tone: 'info' },
          { label: 'Thema', value: getStoredTheme(), meta: 'weergave', tone: 'info' },
        ],
        summaryHtml: renderSimpleList([{ title: 'Instellingen', meta: subItem || 'tenant', body: 'Deze native instellingenpagina is de basis voor tenant-, rol- en algemene configuratie in de nieuwe shell.', badge: 'Settings', tone: 'info' }]),
        insightsHtml: renderSimpleList([{ title: 'Nog uit te bouwen', meta: 'Instellingen', body: 'De logische structuur staat klaar; de diepere forms kunnen hier vervolgens native worden overgenomen.', badge: 'Roadmap', tone: 'warn' }]),
        detailsHtml: renderDetailBlocks([{ title: 'Instellingscontext', html: `<div class="portal-next-empty">Subonderdeel: ${esc(subItem || 'tenant')} · tenant: ${esc(tenant?.customer_name || tenant?.tenant_name || tenantId)}</div>` }]),
      }),
      portalInfo: async () => ({
        kpis: [
          { label: 'Portal', value: 'dashboard-next', meta: 'nieuwe variant', tone: 'good' },
          { label: 'Data', value: 'Native', meta: 'geen embed', tone: 'good' },
          { label: 'Tenant', value: getSelectedTenantLabel(), meta: 'context', tone: 'info' },
          { label: 'Status', value: 'Actief', meta: 'testomgeving', tone: 'info' },
        ],
        summaryHtml: renderSimpleList([{ title: 'Hoe werkt dit portaal?', meta: 'Nieuwe shell', body: 'Deze variant gebruikt dezelfde datafeeds maar toont ze in een nieuw, logischer dashboardkader.', badge: 'Uitleg', tone: 'info' }]),
        insightsHtml: renderSimpleList([{ title: 'Wat is anders?', meta: 'Native weergave', body: 'De bedoeling is dat deze shell de oude portal uiteindelijk vervangt, niet alleen ernaast embedt.', badge: 'Richting', tone: 'good' }]),
        detailsHtml: renderDetailBlocks([{ title: 'Portaaluitleg', html: '<div class="portal-next-empty">Gebruik de logische menu-indeling links om hoofdstukken en subhoofdstukken native te verkennen in de nieuwe portal.</div>' }]),
      }),
    };

    if (sectionName === 'overview') return null;
    if (sectionName === 'tenantoverzicht') return null;
    if (sectionName === 'mspcontrolcenter') return null;
    const loader = sectionLoaders[sectionName];
    if (!loader) {
      return {
        kpis: [
          { label: 'Hoofdstuk', value: title, meta: 'nieuwe shell', tone: 'info' },
          { label: 'Tenant', value: tenant?.customer_name || tenant?.tenant_name || '—', meta: 'context', tone: 'info' },
          { label: 'Subonderdeel', value: subItem || 'geen', meta: 'actieve focus', tone: 'info' },
          { label: 'Status', value: 'In opbouw', meta: 'native variant', tone: 'warn' },
        ],
        summaryHtml: `<div class="portal-next-empty">Voor ${esc(title)} is nog geen specifieke native renderer gebouwd, maar de shellstructuur staat nu wel klaar.</div>`,
        insightsHtml: `<div class="portal-next-empty">Volgende stap: dit hoofdstuk als volwaardige native module uitwerken.</div>`,
        detailsHtml: '<div class="portal-next-empty">Nog geen detailweergave beschikbaar.</div>',
      };
    }
    return loader();
  }

  async function renderWorkspaceSection() {
    const config = getPortalConfig();
    const meta = config.SECTION_META || {};
    const sectionName = state.currentSection || 'overview';
    const activeSubItem = state.currentSubItem || getDefaultSubItem(sectionName);
    const title = document.getElementById('previewWorkspaceTitle');
    const subtitle = document.getElementById('previewWorkspaceSubtitle');
    const kicker = document.getElementById('previewWorkspaceKicker');
    const subnavRoot = document.getElementById('previewWorkspaceSubnav');
    const kpiRoot = document.getElementById('previewWorkspaceKpis');
    const summaryRoot = document.getElementById('previewWorkspaceSummary');
    const insightsRoot = document.getElementById('previewWorkspaceInsights');
    const detailsRoot = document.getElementById('previewWorkspaceDetails');
    if (!title || !subtitle || !kicker || !subnavRoot || !kpiRoot || !summaryRoot || !insightsRoot || !detailsRoot) return;

    const sectionMeta = meta[sectionName] || {};
    title.textContent = sectionMeta.title || sectionName;
    subtitle.textContent = isAdminLikeSection(sectionName)
      ? `${sectionMeta.meta || 'Portfolio-overzicht in de nieuwe shell.'} Portfolio: alle klanten en tenants.`
      : `${sectionMeta.meta || 'Native tenantweergave in de nieuwe shell.'} Tenant: ${getSelectedTenantLabel()}.`;
    kicker.textContent = isAdminLikeSection(sectionName) ? 'Portfolio' : 'Tenant';

    const subnav = getSubnavEntries(sectionName, getNavEntry(sectionName)?.entry);
    subnavRoot.innerHTML = subnav.map((item) => `
      <button type="button" class="portal-next-subchapter-pill ${activeSubItem === item.subItem ? 'is-active' : ''}" data-workspace-subitem="${esc(item.subItem)}">${esc(item.label)}</button>
    `).join('');
    subnavRoot.style.display = subnav.length ? '' : 'none';
    subnavRoot.querySelectorAll('[data-workspace-subitem]').forEach((button) => {
      button.addEventListener('click', async () => {
        state.currentSubItem = button.dataset.workspaceSubitem || null;
        await renderWorkspaceSection();
        buildDynamicNav();
      });
    });

    const data = await loadWorkspaceSectionData(sectionName, activeSubItem);
    if (!data) {
      kpiRoot.innerHTML = '';
      summaryRoot.innerHTML = '<div class="portal-next-empty">Voor deze route bestaat al een aparte native pagina in de nieuwe shell.</div>';
      insightsRoot.innerHTML = '<div class="portal-next-empty">Gebruik de startnavigatie links voor deze pagina.</div>';
      detailsRoot.innerHTML = '';
      return;
    }
    kpiRoot.innerHTML = (data.kpis || []).map((item) => `
      <article class="portal-next-kpi ${cardClassFromTone(item.tone)}">
        <span class="portal-next-kpi-label">${esc(item.label)}</span>
        <strong class="portal-next-kpi-value">${esc(item.value)}</strong>
        <span class="portal-next-kpi-meta">${esc(item.meta)}</span>
      </article>
    `).join('');
    summaryRoot.innerHTML = data.summaryHtml || '<div class="portal-next-empty">Geen samenvatting beschikbaar.</div>';
    insightsRoot.innerHTML = data.insightsHtml || '<div class="portal-next-empty">Geen aandachtspunten beschikbaar.</div>';
    detailsRoot.innerHTML = data.detailsHtml || '<div class="portal-next-empty">Geen details beschikbaar.</div>';
  }

  function attachTenantActionHandlers() {
    document.querySelectorAll('[data-tenant-action]').forEach((button) => {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', async () => {
        const tenantId = button.dataset.tenantId || '';
        const action = button.dataset.tenantAction || 'open';
        if (!tenantId) return;
        if (action === 'open') {
          state.activeTenantId = tenantId;
          syncTenantStorage();
          renderTenantSelect();
          setPage('overview');
          await renderActivePage();
          return;
        }
        if (action === 'refresh') {
          try {
            await global.apiFetch('/api/jobs', {
              method: 'POST',
              body: JSON.stringify({ job_type: 'tenant_refresh', tenant_id: tenantId, payload: {} }),
            });
            global.showToast?.('Tenant refresh ingepland.', 'success');
            await loadTenants(true);
            if (state.page === 'tenantoverzicht') await renderTenantOverview();
          } catch (error) {
            global.showToast?.(`Refresh mislukt: ${error?.message || error}`, 'error');
          }
          return;
        }
        if (action === 'scan') {
          syncTenantStorage();
          setCurrentPortalRoute('assessment');
          try {
            localStorage.setItem('local_m365_current_tenant', tenantId);
          } catch (_) {}
          global.open('/portal/dashboard-v2.html', '_blank', 'noopener');
        }
      });
    });
  }

  async function renderActivePage() {
    if (state.page === 'workspace') {
      await renderWorkspaceSection();
      return;
    }
    if (state.page === 'tenantoverzicht') {
      await renderTenantOverview();
      return;
    }
    if (state.page === 'mspcontrolcenter') {
      await renderMspControlCenter();
      return;
    }
    await renderOverview();
  }

  async function refreshCurrentPage(forceRefresh = false) {
    await loadTenants(forceRefresh);
    if (forceRefresh) {
      global.cacheClear?.('/api/msp/control-center');
      if (state.activeTenantId && state.activeTenantId !== 'all') {
        global.invalidateTenantScopedCaches?.(state.activeTenantId);
      }
    }
    await renderActivePage();
  }

  function bindEvents() {
    document.querySelectorAll('.portal-next-nav-item[data-next-page]').forEach((item) => {
      item.addEventListener('click', async () => {
        setPage(item.dataset.nextPage || 'overview');
        await renderActivePage();
      });
    });

    document.getElementById('previewTenantSelect')?.addEventListener('change', async (event) => {
      state.activeTenantId = event.target.value || 'all';
      syncTenantStorage();
      await renderActivePage();
    });

    document.getElementById('previewRefresh')?.addEventListener('click', () => {
      void refreshCurrentPage(true);
    });

    document.getElementById('previewThemeToggle')?.addEventListener('click', () => {
      applyTheme(getStoredTheme() === 'dark' ? 'light' : 'dark');
    });

    document.getElementById('previewOpenLive')?.addEventListener('click', () => {
      const liveSection = state.page === 'workspace' ? (state.currentSection || 'overview') : state.page === 'mspcontrolcenter' ? 'mspcontrolcenter' : state.page === 'tenantoverzicht' ? 'tenantoverzicht' : 'overview';
      openCurrentPortalRoute(liveSection, state.page === 'workspace' ? state.currentSubItem : null);
    });

    document.getElementById('previewMobileToggle')?.addEventListener('click', () => {
      toggleSidebar();
    });

    document.getElementById('previewWorkspaceOpenLive')?.addEventListener('click', () => {
      openCurrentPortalRoute(state.currentSection || 'overview', state.currentSubItem || null);
    });
  }

  async function bootstrap() {
    applyTheme(getStoredTheme());
    bindEvents();
    state.page = global.location.hash.replace(/^#/, '') || 'overview';
    if (!['overview', 'tenantoverzicht', 'mspcontrolcenter', 'workspace'].includes(state.page)) state.page = 'overview';
    setPage(state.page);
    await loadSession();
    await loadTenants(false);
    buildDynamicNav();
    await renderActivePage();
  }

  global.addEventListener('DOMContentLoaded', () => {
    void bootstrap().catch((error) => {
      console.error(error);
      global.showToast?.(`Preview laden mislukt: ${error?.message || error}`, 'error');
    });
  });
})(window);
