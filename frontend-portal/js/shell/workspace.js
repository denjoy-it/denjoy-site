(function initDenjoyShellWorkspace(global) {
  const ROUTE_STATE_KEY = 'denjoy.portal.routeState';
  const EMBED_PARAMS = ['resultsPanel', 'kbTab', 'settingsTab', 'remTab', 'gbTab', 'baselineTab', 'bkTab', 'caTab', 'ztTab', 'liveTab'];
  const routeState = loadRouteState();

  function getUrlRouteOverride() {
    try {
      const params = new URLSearchParams(global.location?.search || '');
      const section = params.get('section') || '';
      const subItem = params.get('subitem') || params.get('subItem') || '';
      const override = {
        section: section || '',
        subItem: subItem || '',
        sectionMemory: {},
      };
      EMBED_PARAMS.forEach((key) => {
        const value = params.get(key);
        if (value) override[key] = value;
      });
      if (!override.subItem) {
        const directKey = EMBED_PARAMS.find((key) => override[key]);
        if (directKey) override.subItem = override[directKey];
      }
      if (override.section && override.subItem) {
        override.sectionMemory[override.section] = override.subItem;
      }
      return override.section ? override : null;
    } catch (_) {
      return null;
    }
  }

  function loadRouteState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ROUTE_STATE_KEY) || '{}');
      const stored = {
        section: parsed.section || 'overview',
        subItem: parsed.subItem || null,
        sectionMemory: parsed.sectionMemory && typeof parsed.sectionMemory === 'object' ? parsed.sectionMemory : {},
      };
      const override = getUrlRouteOverride();
      if (!override) return stored;
      return {
        ...stored,
        ...override,
        section: override.section || stored.section || 'overview',
        subItem: override.subItem || stored.subItem || null,
        sectionMemory: {
          ...(stored.sectionMemory || {}),
          ...(override.sectionMemory || {}),
        },
      };
    } catch (_) {
      const override = getUrlRouteOverride();
      return override || { section: 'overview', subItem: null, sectionMemory: {} };
    }
  }

  function persistRouteState() {
    try {
      localStorage.setItem(ROUTE_STATE_KEY, JSON.stringify(routeState));
    } catch (_) {}
    global._currentSection = routeState.section;
    global._currentSubItem = routeState.subItem;
  }

  function getCurrentSection() {
    return routeState.section || global._currentSection || 'overview';
  }

  function getCurrentSubItem() {
    return routeState.subItem || global._currentSubItem || null;
  }

  function setCurrentRouteState(sectionName, subItem = null) {
    routeState.section = sectionName || routeState.section || 'overview';
    routeState.subItem = subItem || null;
    if (routeState.section && subItem) {
      routeState.sectionMemory[routeState.section] = subItem;
    }
    persistRouteState();
  }

  function isEmbedMode() {
    try {
      return new URLSearchParams(global.location?.search || '').get('embed') === '1';
    } catch (_) {
      return false;
    }
  }

  function getSectionOptionProp(sectionName) {
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
    return mapping[sectionName] || 'liveTab';
  }

  function getRouteOptionsFromConfigItem(item = {}) {
    const optionKeys = ['resultsPanel', 'kbTab', 'settingsTab', 'remTab', 'gbTab', 'baselineTab', 'itTab', 'bkTab', 'caTab', 'alTab', 'exTab', 'ztTab', 'liveTab'];
    return optionKeys.reduce((acc, key) => {
      if (item[key]) acc[key] = item[key];
      return acc;
    }, {});
  }

  function getNavGroupForSection(sectionName) {
    const groups = global.NAV_GROUP_SECTIONS || {};
    return Object.keys(groups).find((groupName) => {
      return (groups[groupName] || []).some((entry) => {
        if (typeof entry === 'string') return entry === sectionName;
        return entry?.section === sectionName;
      });
    }) || null;
  }

  function buildSectionOpts(sectionName, subItem = null) {
    if (!subItem || subItem === sectionName) return {};
    return { [getSectionOptionProp(sectionName)]: subItem };
  }

  function getSectionDefaultSubItem(sectionName) {
    const configItems = global.SUBNAV_CONFIG?.[sectionName] || [];
    if (configItems.length) {
      return getSubnavItemMeta(configItems[0]).key || null;
    }
    const navGroup = getNavGroupForSection(sectionName);
    const entry = (global.NAV_GROUP_SECTIONS?.[navGroup] || []).find((item) => typeof item !== 'string' && item?.section === sectionName);
    return entry?.subItems?.[0] || null;
  }

  function getStoredSubItem(sectionName) {
    return routeState.sectionMemory?.[sectionName] || null;
  }

  function getPreferredSubItem(sectionName) {
    return getStoredSubItem(sectionName) || getSectionDefaultSubItem(sectionName);
  }

  function getSectionShortcutItems(sectionName) {
    const navGroup = getNavGroupForSection(sectionName);
    const entries = global.NAV_GROUP_SECTIONS?.[navGroup] || [];
    return entries.filter((entry) => !(typeof entry === 'object' && entry?.hidden)).map((entry) => {
      const siblingSection = typeof entry === 'string' ? entry : entry.section;
      const label = global.SECTION_META?.[siblingSection]?.title || siblingSection;
      const preferredSubItem = getPreferredSubItem(siblingSection);
      return {
        label,
        section: siblingSection,
        subItem: preferredSubItem,
        active: siblingSection === sectionName,
      };
    }).filter((item) => !!item.section);
  }

  function createSubnavButton({ label, section, subItem, opts = {}, active = false, countId = '' }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `subnav-item${active ? ' active' : ''}`;
    button.dataset.subnavSection = section || '';
    button.dataset.subnavKey = subItem || section || '';
    if (countId) button.dataset.countId = countId;
    button.textContent = label;
    button.addEventListener('click', () => {
      global.showSection?.(section, Object.keys(opts).length ? opts : buildSectionOpts(section, subItem));
    });
    return button;
  }

  function appendCountBadge(button, countText) {
    if (!button) return;
    let badge = button.querySelector('.subnav-count');
    if (!countText && countText !== 0) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'subnav-count';
      button.appendChild(badge);
    }
    badge.textContent = String(countText);
  }

  function updateWorkspaceHeader(sectionName) {
    const meta = global.SECTION_META?.[sectionName] || global.SECTION_META?.overview || {};
    const isAdminSection = getNavGroupForSection(sectionName) === 'admin';
    const eyebrowEl = document.getElementById('workspaceEyebrow');
    const titleEl = document.getElementById('workspaceTitle');
    const metaEl = document.getElementById('workspaceMeta');
    const tenantContext = getSelectedTenantContext();
    if (eyebrowEl) eyebrowEl.textContent = meta.eyebrow || '';
    if (titleEl) titleEl.textContent = meta.title || '';
    if (metaEl) {
      metaEl.textContent = buildWorkspaceMetaText(meta.meta || '', isAdminSection, tenantContext);
    }
    renderWorkspaceActions(sectionName);
    renderSignalBar({
      score: tenantContext.score ?? global.parseMetricValue?.(document.getElementById('secureScore')?.textContent),
      critical: tenantContext.critical ?? global.parseMetricValue?.(document.getElementById('kpiCritical')?.textContent),
      warning: tenantContext.warnings,
      openActions: tenantContext.openActions,
      latestRunAt: tenantContext.latestRunAt,
      readiness: tenantContext.readiness,
    });
  }

  function getQuickActionHandlers() {
    return {
      refreshWorkspace: () => global.refreshTenantData?.(),
      refreshMspControlCenter: () => global.loadMspControlCenter?.(true),
      scanUsersLive: () => {
        global.showSection?.('gebruikers', { gbTab: 'gebruikers' });
        global.scanGebruikersLive?.();
      },
      goResults: () => global.showSection?.('results', { resultsPanel: 'viewer' }),
      goKb: () => global.showSection?.('kb', { kbTab: 'overview' }),
      goAssessment: () => global.showSection?.('assessment'),
      resultsViewer: () => global.showSection?.('results', { resultsPanel: 'viewer' }),
      resultsActions: () => global.showSection?.('results', { resultsPanel: 'actions' }),
      goRemCatalog: () => global.showSection?.('herstel', { remTab: 'catalogus' }),
      goRemHistory: () => global.showSection?.('herstel', { remTab: 'geschiedenis' }),
      goUsers: () => global.showSection?.('gebruikers', { gbTab: 'gebruikers' }),
      goLicenses: () => global.showSection?.('gebruikers', { gbTab: 'licenties' }),
      goGuests: () => global.showSection?.('gebruikers', { gbTab: 'gasten' }),
      goTeams: () => global.showSection?.('teams', { liveTab: 'teams' }),
      goSharePointSites: () => global.showSection?.('sharepoint', { liveTab: 'sharepoint-sites' }),
      goSharePointBackup: () => global.showSection?.('sharepoint', { liveTab: 'sharepoint-backup' }),
      goIdentityMfa: () => global.showSection?.('identity', { liveTab: 'mfa' }),
      goAppsRegistrations: () => global.showSection?.('apps', { liveTab: 'registrations' }),
      goDevicesHub: () => global.showSection?.('devicesHub'),
      goBaselines: () => global.showSection?.('baseline', { baselineTab: 'baselines' }),
      goAssignments: () => global.showSection?.('baseline', { baselineTab: 'assignments' }),
      goDevices: () => global.showSection?.('intune', { liveTab: 'apparaten' }),
      goCompliance: () => global.showSection?.('intune', { liveTab: 'compliance' }),
      goBackupOverview: () => global.showSection?.('backup', { bkTab: 'overzicht' }),
      goBackupHistory: () => global.showSection?.('backup', { bkTab: 'geschiedenis' }),
      goCaPolicies: () => global.showSection?.('ca', { caTab: 'policies' }),
      goCaLocations: () => global.showSection?.('ca', { caTab: 'locations' }),
      goDomains: () => global.showSection?.('domains', { liveTab: 'domains-list' }),
      goAzureOverview: () => global.showSection?.('azure', { liveTab: 'overview' }),
      goAzureCosts: () => global.showSection?.('azure', { liveTab: 'costs' }),
      goPlatformTenants: () => global.showSection?.('tenantoverzicht'),
      goPlatformRoles: () => global.showSection?.('settings', { settingsTab: 'roles' }),
      goPlatformSettings: () => global.showSection?.('settings', { settingsTab: 'general' }),
      goServicesCatalog: () => global.showSection?.('dienstenHub'),
      goServicesSecurity: () => global.showSection?.('securityHub'),
      goServicesCloud: () => global.showSection?.('azure', { liveTab: 'overview' }),
      goSecurityFindings: () => global.showSection?.('bevindingen'),
      goSecurityDomains: () => global.showSection?.('domains', { liveTab: 'domains-list' }),
      goAlertsAudit: () => global.showSection?.('alerts', { liveTab: 'auditlog' }),
      goAlertsScore: () => global.showSection?.('alerts', { liveTab: 'securescr' }),
      goComplianceCis: () => global.showSection?.('compliance', { liveTab: 'cis' }),
      goZeroTrust: () => global.showSection?.('zerotrust', { ztTab: 'overview' }),
      goExchangeMail: () => global.showSection?.('exchange', { liveTab: 'mailboxen' }),
      goExchangeRules: () => global.showSection?.('exchange', { liveTab: 'regels' }),
      goKbAssets: () => global.showSection?.('kb', { kbTab: 'assets' }),
      goKbChanges: () => global.showSection?.('kb', { kbTab: 'changelog' }),
      goSettingsTenant: () => global.showSection?.('settings', { settingsTab: 'tenant' }),
      goSettingsGeneral: () => global.showSection?.('settings', { settingsTab: 'general' }),
      goSettingsIntegrations: () => global.showSection?.('settings', { settingsTab: 'integrations' }),
      goMspCustomers: () => global.showSection?.('klantenbeheer'),
      goMspApprovals: () => global.showSection?.('goedkeuringen'),
      goMspJobs: () => global.showSection?.('jobmonitor'),
    };
  }

  function renderWorkspaceActions(sectionName = getCurrentSection()) {
    const root = document.getElementById('workspaceQuickActions');
    if (!root) return;
    const configured = global.QUICK_ACTIONS?.[sectionName] || global.QUICK_ACTIONS?.overview || [];
    const seen = new Set();
    const uniqueActions = configured.filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // Global workspace standard: keep header actions operational and concise.
    const keepActionIds = new Set(['refreshWorkspace', 'refreshMspControlCenter', 'scanUsersLive', 'goAssessment']);
    const conciseActions = uniqueActions
      .filter((item) => keepActionIds.has(item.id))
      .slice(0, 2);
    const actions = conciseActions.length ? conciseActions : uniqueActions.slice(0, 1);

    root.innerHTML = actions.map((item) => `
      <button type="button" class="workspace-action-btn workspace-action-btn--${global.escapeHtml(item.kind || 'ghost')}" data-workspace-action="${global.escapeHtml(item.id)}">
        ${global.escapeHtml(item.label)}
      </button>
    `).join('');
    const handlers = getQuickActionHandlers();
    root.querySelectorAll('[data-workspace-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const handler = handlers[btn.dataset.workspaceAction];
        if (typeof handler === 'function') handler();
      });
    });
  }

  global.isPortalEmbedMode = isEmbedMode;

  global.addEventListener?.('DOMContentLoaded', () => {
    if (isEmbedMode()) {
      document.body.classList.add('portal-embed-mode');
    }
  });

  function setNavSignal(target, text, tone = 'info') {
    const host = document.querySelector(target);
    if (!host) return;
    let badge = host.querySelector('.portal-nav-signal');
    if (!text && text !== 0) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'portal-nav-signal';
      host.appendChild(badge);
    }
    badge.className = `portal-nav-signal portal-nav-signal--${tone}`;
    badge.textContent = String(text);
  }

  function renderNavSignals() {
    const tenantContext = getSelectedTenantContext();
    const score = tenantContext.score ?? global.parseMetricValue?.(document.getElementById('secureScore')?.textContent);
    const critical = tenantContext.critical ?? global.parseMetricValue?.(document.getElementById('kpiCritical')?.textContent);
    const reportRuns = global.parseMetricValue?.(document.getElementById('metaReportRuns')?.textContent);
    const kbCountIds = ['nbCountAssets', 'nbCountPages', 'nbCountContacts', 'nbCountSoftware', 'nbCountDomains', 'nbCountChangelog'];
    const kbTotal = kbCountIds.reduce((sum, id) => sum + (global.parseMetricValue?.(document.getElementById(id)?.textContent) || 0), 0);
    const userCount = global.parseMetricValue?.(document.getElementById('userCount')?.textContent);

    setNavSignal('[data-nav-group="followup"] > .portal-nav-link', critical > 0 ? critical : reportRuns || '', critical > 0 ? 'urgent' : 'info');
    setNavSignal('[data-nav-group="kb"] > .portal-nav-link', kbTotal || '', 'info');
    setNavSignal('[data-nav-group="people"] > .portal-nav-link', userCount || '', 'info');
    setNavSignal('[data-nav-group="security"] > .portal-nav-link', score != null ? `${score}%` : '', score != null && score < 65 ? 'warn' : 'info');
    setNavSignal('[data-nav-group="collab"] > .portal-nav-link', '', 'info');
    setNavSignal('[data-nav-group="devices"] > .portal-nav-link', '', 'info');

    /* ── Sidebar groep-badges ── */
    updateSidebarGroupSignal('sgnFollowup', critical > 0 ? critical : (reportRuns || null), critical > 0 ? 'urgent' : 'info');
    updateSidebarGroupSignal('sgnSecurity', score != null ? `${score}%` : null, score != null && score < 65 ? 'warn' : 'info');
    updateSidebarGroupSignal('sgnPeople', userCount || null, 'info');
    updateSidebarGroupSignal('sgnKb', kbTotal || null, 'info');
    global.renderSidebarMetrics?.();

    /* ── Signal bar ── */
    renderSignalBar({
      score,
      critical,
      warning: tenantContext.warnings,
      openActions: tenantContext.openActions,
      latestRunAt: tenantContext.latestRunAt,
      readiness: tenantContext.readiness,
    });
  }

  /* ── Secties zonder score: signal bar verbergen ── */
  const SIGNAL_BAR_HIDDEN_SECTIONS = new Set(['mspcontrolcenter', 'klantenbeheer', 'portalInfo', 'kb', 'platformHub', 'dienstenHub', 'settings', 'tenantoverzicht', 'jobmonitor', 'goedkeuringen', 'activityfeed', 'playbooks']);

  function renderSignalBar({ score, critical, warning, openActions, latestRunAt, readiness } = {}) {
    const bar    = document.getElementById('portalSignalBar');
    if (!bar) return;

    const section = getCurrentSection();
    if (SIGNAL_BAR_HIDDEN_SECTIONS.has(section)) {
      bar.style.display = 'none';
      return;
    }

    const tenantContext = getSelectedTenantContext();
    const tenantLabel = tenantContext.tenantName || global.getCurrentTenantLabel?.() || '';
    if (!tenantLabel) { bar.style.display = 'none'; return; }

    bar.style.display = '';

    // Score
    const s = (score != null && !isNaN(Number(score))) ? Number(score) : null;
    const tone = s == null ? 'unknown' : s >= 85 ? 'good' : s >= 60 ? 'warning' : 'critical';
    bar.dataset.tone = tone;

    const ring  = document.getElementById('signalBarRing');
    const inner = document.getElementById('signalBarScore');
    if (ring && s != null) {
      ring.style.setProperty('--signal-pct', `${s}%`);
    }
    if (inner) inner.textContent = s != null ? String(s) : '—';

    // Titel
    const titleEl = document.getElementById('signalBarTitle');
    if (titleEl) titleEl.textContent = tenantLabel;

    // Sub: laatste scan
    const subEl = document.getElementById('signalBarSub');
    if (subEl) {
      const ran = latestRunAt || tenantContext.latestRunAt;
      if (ran) {
        try {
          const diff = Math.round((Date.now() - new Date(ran).getTime()) / 60000);
          const label = diff < 60 ? `${diff} min geleden` : diff < 1440 ? `${Math.round(diff/60)} uur geleden` : `${Math.round(diff/1440)} dag(en) geleden`;
          const readinessLabel = Number.isFinite(Number(readiness ?? tenantContext.readiness))
            ? ` · Readiness ${Number(readiness ?? tenantContext.readiness)}%`
            : '';
          subEl.textContent = `Laatste scan: ${label}${readinessLabel}`;
        } catch(_) { subEl.textContent = ''; }
      } else {
        subEl.textContent = 'Nog niet gescand';
      }
    }

    // Chips
    const chipsEl = document.getElementById('signalBarChips');
    if (chipsEl) {
      const warningCount = warning ?? tenantContext.warnings ?? global.parseMetricValue?.(document.getElementById('kpiWarning')?.textContent) ?? null;
      const ok      = global.parseMetricValue?.(document.getElementById('kpiOk')?.textContent) ?? null;
      const chips = [];
      if (critical > 0)        chips.push(`<span class="signal-chip signal-chip--critical">${critical} kritiek</span>`);
      if (warningCount > 0)    chips.push(`<span class="signal-chip signal-chip--warning">${warningCount} waarschuwing</span>`);
      if (openActions > 0 || tenantContext.openActions > 0) chips.push(`<span class="signal-chip signal-chip--muted">${openActions ?? tenantContext.openActions} open acties</span>`);
      if (ok > 0)              chips.push(`<span class="signal-chip signal-chip--ok">${ok} OK</span>`);
      if (!chips.length && s != null) chips.push(`<span class="signal-chip signal-chip--muted">Score: ${s}</span>`);
      chipsEl.innerHTML = chips.join('');
    }
  }

  function getSelectedTenantContext() {
    const selectedTenantId = global.currentTenantId || global._getCurrentTenantId?.() || document.getElementById('tenantSelect')?.value || '';
    const focus = global._selectedTenantFocus;
    if (focus?.tenantId && focus.tenantId === selectedTenantId) {
      return focus;
    }
    const tenant = (global.allTenants || []).find((item) => item.id === selectedTenantId);
    const latestRun = tenant?.latest_run || {};
    return {
      tenantId: selectedTenantId,
      tenantName: tenant?.customer_name || tenant?.tenant_name || global.getCurrentTenantLabel?.() || '',
      score: coerceMetricValue(latestRun.score_overall),
      critical: coerceMetricValue(latestRun.critical_count),
      warnings: coerceMetricValue(latestRun.warning_count),
      latestRunAt: latestRun.completed_at || latestRun.started_at || '',
      readiness: coerceMetricValue(tenant?.ops_summary?.onboarding?.completion_pct),
      openActions: null,
    };
  }

  function coerceMetricValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function buildWorkspaceMetaText(prefix, isAdminSection, tenantContext = {}) {
    const parts = [];
    if (prefix) parts.push(prefix.trim());
    if (isAdminSection) {
      parts.push('Portfolio: alle klanten en tenants.');
      if (tenantContext?.tenantName) {
        const adminSummary = [];
        if (tenantContext.score != null) adminSummary.push(`score ${tenantContext.score}%`);
        if (tenantContext.critical > 0) adminSummary.push(`${tenantContext.critical} kritiek`);
        if (tenantContext.openActions > 0) adminSummary.push(`${tenantContext.openActions} open acties`);
        parts.push(`Focus tenant: ${tenantContext.tenantName}${adminSummary.length ? ` · ${adminSummary.join(' · ')}` : ''}.`);
      }
      return parts.join(' ').trim();
    }
    if (!tenantContext?.tenantName) {
      parts.push('Tenant: Geen tenant geselecteerd.');
      return parts.join(' ').trim();
    }
    const summary = [];
    if (tenantContext.score != null) summary.push(`score ${tenantContext.score}%`);
    if (tenantContext.critical > 0) summary.push(`${tenantContext.critical} kritiek`);
    if (tenantContext.warnings > 0) summary.push(`${tenantContext.warnings} waarschuwingen`);
    if (tenantContext.openActions > 0) summary.push(`${tenantContext.openActions} open acties`);
    if (tenantContext.readiness != null) summary.push(`readiness ${tenantContext.readiness}%`);
    parts.push(`Tenant: ${tenantContext.tenantName}${summary.length ? ` · ${summary.join(' · ')}` : ''}.`);
    return parts.join(' ').trim();
  }

  function getNavGroupLabel(groupName) {
    const labels = {
      people: 'Identiteit & Toegang',
      security: 'Beveiliging & Naleving',
      collab: 'Email & Samenwerking',
      devices: 'Apparaten & Beheer',
      followup: 'Analyse & Acties',
      kb: 'Documentatie',
      admin: 'MSP Admin',
    };
    return labels[groupName] || groupName || 'Navigatie';
  }

  function getSubnavItemMeta(item) {
    const pairs = [
      ['kbTab', 'kb'],
      ['settingsTab', 'settings'],
      ['resultsPanel', 'results'],
      ['remTab', 'rem'],
      ['gbTab', 'gebruikers'],
      ['baselineTab', 'baseline'],
      ['itTab', 'intune'],
      ['bkTab', 'backup'],
      ['caTab', 'ca'],
      ['alTab', 'alerts'],
      ['exTab', 'exchange'],
      ['ztTab', 'zerotrust'],
      ['liveTab', 'live'],
      ['section', 'section'],
    ];
    for (const [prop, type] of pairs) {
      if (item[prop]) return { key: item[prop], type };
    }
    return { key: '', type: 'section' };
  }

  function updateSidebarGroupSignal(signalId, text, tone) {
    const el = document.getElementById(signalId);
    if (!el) return;
    if (!text && text !== 0) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = '';
    el.textContent = String(text);
    el.className = `sidebar-group-signal${tone ? ' sidebar-group-signal--' + tone : ''}`;
    global.renderSidebarMetrics?.();
  }

  function setActiveSubnavItem(key) {
    setCurrentRouteState(getCurrentSection(), key);
    document.querySelectorAll('.subnav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.subnavKey === key);
    });
    /* Sidebar: zet active op het overeenkomende sidebar-nav-link */
    const section = getCurrentSection();
    document.querySelectorAll('.sidebar-nav-link[data-section]').forEach((btn) => {
      if (btn.dataset.section !== section) return;
      const btnKey = global.getNavItemSubKey?.(btn) || '';
      btn.classList.toggle('active', key ? btnKey === key : !btnKey);
    });
  }

  function activateSectionSubtab(sectionName, tabKey) {
    const switchers = {
      herstel: global.switchRemediationTab,
      gebruikers: global.switchGebruikersTab,
      baseline: global.switchBaselineTab,
      intune: global.switchIntuneTab,
      backup: global.switchBackupTab,
      ca: global.switchCaTab,
      alerts: global.switchAlertsTab,
      exchange: global.switchExchangeTab,
    };
    const switcher = switchers[sectionName];
    if (typeof switcher === 'function' && tabKey) switcher(tabKey);
    setActiveSubnavItem(tabKey || null);
  }

  function updateSubnav(sectionName = getCurrentSection(), activeItem = getCurrentSubItem()) {
    const subnav = document.getElementById('portalSubnav');
    if (!subnav) return;
    subnav.innerHTML = '';

    const siblingItems = getSectionShortcutItems(sectionName);
    const sectionItems = (global.SUBNAV_CONFIG?.[sectionName] || []).map((item) => {
      const meta = getSubnavItemMeta(item);
      const targetSection = item.section || sectionName;
      const targetOpts = getRouteOptionsFromConfigItem(item);
      const itemKey = meta.key || targetSection;
      return {
        label: item.label || meta.key || sectionName,
        section: targetSection,
        subItem: itemKey,
        opts: targetOpts,
        countId: item.countId || '',
        active: targetSection === sectionName && (
          (meta.type === 'section' && !activeItem)
          || (!!meta.key && meta.key === activeItem)
        ),
      };
    });

    if (!siblingItems.length && !sectionItems.length) {
      subnav.style.display = 'none';
      return;
    }

    const groupName = getNavGroupForSection(sectionName);
    const crumb = document.createElement('div');
    crumb.className = 'subnav-breadcrumb';
    crumb.innerHTML = `
      <span class="subnav-bc-group">${global.escapeHtml(getNavGroupLabel(groupName))}</span>
      <span class="subnav-bc-sep">/</span>
      <span class="subnav-bc-section">${global.escapeHtml(global.SECTION_META?.[sectionName]?.title || sectionName)}</span>
    `;
    subnav.appendChild(crumb);

    siblingItems.forEach((item) => {
      subnav.appendChild(createSubnavButton(item));
    });

    if (sectionItems.length) {
      const divider = document.createElement('span');
      divider.className = 'subnav-divider';
      subnav.appendChild(divider);
      sectionItems.forEach((item) => {
        subnav.appendChild(createSubnavButton(item));
      });
    }

    subnav.style.display = 'flex';
    refreshSubnavCounts();
  }

  function refreshSubnavCounts() {
    const subnav = document.getElementById('portalSubnav');
    if (!subnav) return;
    subnav.querySelectorAll('.subnav-item').forEach((btn) => {
      const countId = btn.dataset.countId || '';
      if (!countId) return;
      const count = document.getElementById(countId)?.textContent || '';
      const showCount = count && count !== '—' && count !== '';
      appendCountBadge(btn, showCount ? count : '');
    });
    renderNavSignals();
  }

  function applyWorkspaceDataStandard(sectionName = getCurrentSection()) {
    const run = () => {
      const activeSection = document.querySelector('.content-section.active')
        || document.getElementById(`${sectionName}Section`)
        || document.querySelector('.content-section');
      if (!activeSection) return;

      activeSection.classList.add('workspace-data-standard');

      const tabContainers = activeSection.querySelectorAll('.rem-tabs, .bl-tabs, .it-tabs, .bk-tabs, .ca-tabs, .al-tabs, .ex-tabs');
      tabContainers.forEach((el) => el.classList.add('workspace-standard-tabs'));

      const tabButtons = activeSection.querySelectorAll('.rem-tab, .bl-tab, .it-tab, .bk-tab, .ca-tab, .al-tab, .ex-tab');
      tabButtons.forEach((el) => el.classList.add('workspace-standard-tab'));

      const dataBlocks = activeSection.querySelectorAll(
        '.rem-table-wrap, .rem-catalog-grid, .bl-findings-wrap, .bl-assign-table-wrap, .bl-preset-grid, .bl-gold-grid, '
        + '.it-table-wrap, .it-history-wrap, .it-summary-grid, .it-config-grid, .it-policy-grid, '
        + '.bk-history-wrap, .bk-resource-table-wrap, #bkSummaryWrap, #bkSPList, #bkODList, #bkEXList, '
        + '.ca-table-wrap, #caPoliciesWrap, #caLocationsWrap, '
        + '.al-table-wrap, #alAuditWrap, #alScoreWrap, #alSignInsWrap, '
        + '.ex-table-wrap, #exFwdWrap, #exRulesWrap, '
        + '.dm-analyse-panel, .dm-domain-list, #dmDomainsWrap, '
        + '.results-runs-table-wrap, .results-actions-table-wrap, .results-card, '
        + '.ops-table-wrap, .nb-table-wrap'
      );
      dataBlocks.forEach((el) => el.classList.add('workspace-standard-workcard'));
    };

    run();
    global.setTimeout?.(run, 120);
    global.setTimeout?.(run, 600);
  }

  global.DenjoyShellWorkspace = {
    updateWorkspaceHeader,
    renderWorkspaceActions,
    setNavSignal,
    renderNavSignals,
    renderSignalBar,
    getSubnavItemMeta,
    setActiveSubnavItem,
    activateSectionSubtab,
    updateSubnav,
    refreshSubnavCounts,
    applyWorkspaceDataStandard,
  };

  global.updateWorkspaceHeader = updateWorkspaceHeader;
  global.renderWorkspaceActions = renderWorkspaceActions;
  global.renderNavSignals = renderNavSignals;
  global._setCurrentRouteState = setCurrentRouteState;
  global._getCurrentSection = getCurrentSection;
  global._getCurrentSubItem = getCurrentSubItem;
  global.setActiveSubnavItem = setActiveSubnavItem;
  global.activateSectionSubtab = activateSectionSubtab;
  global.updateSubnav = updateSubnav;
  global.refreshSubnavCounts = refreshSubnavCounts;
  global.applyWorkspaceDataStandard = applyWorkspaceDataStandard;
  persistRouteState();
})(window);
