(function initDenjoyShellNavigation(global) {

  /* ── Sidebar collapse toggle ── */
  const COLLAPSED_KEY = 'denjoy_sidebar_collapsed';

  function ensureSidebarDecorators() {
    document.querySelectorAll('.sidebar-nav-link[data-section]').forEach((link) => {
      if (!link.querySelector('.sidebar-nav-state-dot')) {
        const dot = document.createElement('span');
        dot.className = 'sidebar-nav-state-dot';
        link.insertBefore(dot, link.firstChild);
      }
      if (!link.querySelector('.sidebar-nav-text')) {
        const small = link.querySelector('small');
        const textParts = Array.from(link.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
        const label = (textParts.map((node) => node.textContent).join(' ').trim()) || link.textContent.trim();
        link.childNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) link.removeChild(node);
        });
        const text = document.createElement('span');
        text.className = 'sidebar-nav-text';
        text.textContent = label;
        const dot = link.querySelector('.sidebar-nav-state-dot');
        if (dot && dot.nextSibling) {
          link.insertBefore(text, dot.nextSibling);
        } else {
          link.appendChild(text);
        }
        if (small) link.appendChild(small);
      }
      if (!link.querySelector('.sidebar-nav-count')) {
        const count = document.createElement('span');
        count.className = 'sidebar-nav-count';
        link.appendChild(count);
      }
    });
  }

  function setSidebarItemMetric(selector, { tone = '', count = '', title = '' } = {}) {
    const link = document.querySelector(selector);
    if (!link) return;
    const dot = link.querySelector('.sidebar-nav-state-dot');
    const pill = link.querySelector('.sidebar-nav-count');
    if (dot) {
      dot.classList.remove('status-good', 'status-warn', 'status-error');
      if (tone) dot.classList.add(`status-${tone}`);
    }
    if (pill) {
      pill.classList.remove('has-count', 'status-good', 'status-warn', 'status-error');
      if (count || count === 0) {
        pill.textContent = String(count);
        pill.classList.add('has-count');
      } else {
        pill.textContent = '';
      }
      if (tone) pill.classList.add(`status-${tone}`);
    }
    if (title) link.title = title;
  }

  function syncCollapsedGroupBadges() {
    [
      ['sgnPeople', 'sgnPeopleBadge'],
      ['sgnSecurity', 'sgnSecurityBadge'],
      ['sgnCollab', 'sgnCollabBadge'],
      ['sgnDevices', 'sgnDevicesBadge'],
      ['sgnFollowup', 'sgnFollowupBadge'],
      ['sgnKb', 'sgnKbBadge'],
      ['sgnAdmin', 'sgnAdminBadge'],
    ].forEach(([signalId, badgeId]) => {
      const signal = document.getElementById(signalId);
      const badge = document.getElementById(badgeId);
      if (!badge) return;
      const text = (signal?.textContent || '').trim();
      badge.textContent = text;
      badge.classList.toggle('has-count', !!text);
    });
  }

  function renderSidebarMetrics() {
    ensureSidebarDecorators();
    const secureScore = Number(window.parseMetricValue?.(document.getElementById('secureScore')?.textContent) || 0);
    const critical = Number(window.parseMetricValue?.(document.getElementById('kpiCritical')?.textContent) || 0);
    const userDisabled = Number(window.parseMetricValue?.(document.getElementById('gbInsightDisabledValue')?.textContent) || 0);
    const guests = Number(window.parseMetricValue?.(document.getElementById('gbInsightGuestsValue')?.textContent) || 0);
    const licenses = Number(window.parseMetricValue?.(document.getElementById('gbInsightLicensesValue')?.textContent) || 0);
    const legacyAuthCount = Number(window.parseMetricValue?.(document.getElementById('hubStatLegacyAuth')?.textContent) || 0);
    const peopleTone = userDisabled > 2 ? 'error' : userDisabled > 0 ? 'warn' : licenses > 0 ? 'good' : 'warn';
    setSidebarItemMetric('.sidebar-nav-link[data-section="gebruikers"][data-gb-tab="gebruikers"]', {
      tone: peopleTone,
      count: userDisabled || licenses || '',
      title: userDisabled
        ? `${userDisabled} account(s) vragen aandacht`
        : licenses > 0
          ? `${licenses} licenties beschikbaar in deze werkruimte`
          : 'Gebruikers- en licentiegegevens nog niet geladen',
    });
    setSidebarItemMetric('.sidebar-nav-link[data-section="identity"][data-live-tab="legacy-auth"]', {
      tone: legacyAuthCount > 0 ? (legacyAuthCount > 5 ? 'error' : 'warn') : 'good',
      count: legacyAuthCount || '',
      title: legacyAuthCount
        ? `${legacyAuthCount} account(s) met verouderde login-signalen`
        : 'Geen verouderde login-signalen gevonden',
    });
    setSidebarItemMetric('.sidebar-nav-link[data-section="alerts"][data-live-tab="securescr"]', {
      tone: secureScore >= 80 ? 'good' : secureScore >= 65 ? 'warn' : 'error',
      count: secureScore ? `${secureScore}%` : '',
      title: secureScore ? `Secure Score ${secureScore}%` : 'Secure Score onbekend',
    });
    setSidebarItemMetric('.sidebar-nav-link[data-section="bevindingen"]', {
      tone: critical > 3 ? 'error' : critical > 0 ? 'warn' : 'good',
      count: critical || '',
      title: critical ? `${critical} kritieke bevinding(en)` : 'Geen kritieke bevindingen',
    });
    setSidebarItemMetric('.sidebar-nav-link[data-section="securityHub"]', {
      tone: critical > 3 ? 'error' : secureScore >= 80 ? 'good' : secureScore >= 65 ? 'warn' : 'error',
      count: critical || (secureScore ? `${secureScore}%` : ''),
      title: critical
        ? `${critical} kritieke bevinding(en) in Security Center`
        : secureScore
          ? `Secure Score ${secureScore}%`
          : 'Security Center nog niet geladen',
    });
    setSidebarItemMetric('.sidebar-nav-link[data-section="compliance"][data-live-tab="cis"]', {
      tone: secureScore >= 80 ? 'good' : secureScore >= 65 ? 'warn' : 'error',
      count: secureScore ? `${secureScore}%` : '',
      title: secureScore ? `Compliance & Maturity, Secure Score ${secureScore}%` : 'Compliance & Maturity nog niet geladen',
    });
    syncCollapsedGroupBadges();
  }

  function initSidebarCollapse() {
    const btn = document.getElementById('sidebarCollapseBtn');
    ensureSidebarDecorators();
    renderSidebarMetrics();
    if (!btn) return;

    // Herstel vorige staat
    if (localStorage.getItem(COLLAPSED_KEY) === '1') {
      document.body.classList.add('sidebar-collapsed');
    }

    btn.addEventListener('click', () => {
      const isNowCollapsed = document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem(COLLAPSED_KEY, isNowCollapsed ? '1' : '0');
    });
  }

  /* ── Breadcrumb helper ── */
  // Map van section-naam naar leesbare naam
  const SECTION_LABELS = {
    overview: 'Mijn Overzicht',
    gebruikers: 'Gebruikers & Licenties',
    identity: 'Identiteit',
    ca: 'Conditional Access',
    apps: 'Gekoppelde Apps',
    hybrid: 'AD-koppeling',
    securityHub: 'Security Center',
    alerts: 'Security Center',
    compliance: 'Compliance & Maturity',
    bevindingen: 'Security Center',
    zerotrust: 'Compliance & Maturity',
    domains: 'Security Center',
    exchange: 'E-mail & Postvakken',
    teams: 'Microsoft Teams',
    sharepoint: 'Bestanden & Sites',
    intuneManagementHub: 'Beheercockpit',
    intune: 'Apparaten',
    backup: 'Gegevensback-up',
    assessment: 'Beveiligingsscan',
    results: 'Rapporten & Scores',
    herstel: 'Problemen Herstellen',
    baseline: 'Standaardinstellingen',
    vergelijking: 'Tenant Vergelijking',
    kb: 'Documentatie',
    portalInfo: 'Hoe werkt dit portaal?',
    mspcontrolcenter: 'MSP Control Center',
    activityfeed: 'Activiteitenlog',
    playbooks: 'Playbooks',
    klantenbeheer: 'Klanten',
    azure: 'Azure',
    platformHub: 'Platform',
    dienstenHub: 'Diensten',
    settings: 'Instellingen',
  };

  // Map van data-nav-group naar leesbare groepnaam (fallback via data-group-label)
  const GROUP_LABELS = {
    people: 'Identiteit & Toegang',
    security: 'Beveiliging & Naleving',
    collab: 'Email & Samenwerking',
    devices: 'Apparaten & Beheer',
    followup: 'Analyse & Acties',
    kb: 'Documentatie',
    admin: 'MSP Admin',
  };

  function updateBreadcrumb(sectionName) {
    const bcGroup   = document.getElementById('bcGroupLabel');
    const bcSep     = document.getElementById('bcSep');
    const bcSection = document.getElementById('bcSectionLabel');
    if (!bcGroup || !bcSection) return;

    const sectionLabel = SECTION_LABELS[sectionName] || sectionName;

    // Zoek de groep die deze sectie bevat
    let groupLabel = '';
    document.querySelectorAll('.sidebar-group[data-nav-group]').forEach((group) => {
      const items = group.querySelectorAll('.sidebar-nav-link[data-section]');
      const match = Array.from(items).some((btn) => btn.dataset.section === sectionName);
      if (match) {
        const navGroup = group.dataset.navGroup;
        const toggle   = group.querySelector('.sidebar-group-toggle');
        groupLabel = toggle?.dataset.groupLabel
          || GROUP_LABELS[navGroup]
          || navGroup;
      }
    });

    if (groupLabel && groupLabel !== sectionLabel) {
      bcGroup.textContent = groupLabel;
      bcGroup.style.display = '';
      bcSep.style.display   = '';
      bcSection.textContent = sectionLabel;
    } else {
      bcGroup.textContent   = sectionLabel;
      bcGroup.style.display = '';
      bcSep.style.display   = 'none';
      bcSection.textContent = '';
    }
  }


  function setDropdownOpen(dropdown, isOpen) {
    if (!dropdown) return;
    dropdown.classList.toggle('open', !!isOpen);
    dropdown.querySelector('.nav-dropdown-toggle')?.setAttribute('aria-expanded', String(!!isOpen));
  }

  function getSectionOptionsFromDataset(dataset) {
    const opts = {};
    if (dataset.resultsPanel) opts.resultsPanel = dataset.resultsPanel;
    if (dataset.kbTab) opts.kbTab = dataset.kbTab;
    if (dataset.settingsTab) opts.settingsTab = dataset.settingsTab;
    if (dataset.remTab) opts.remTab = dataset.remTab;
    if (dataset.gbTab) opts.gbTab = dataset.gbTab;
    if (dataset.baselineTab) opts.baselineTab = dataset.baselineTab;
    if (dataset.itTab) opts.itTab = dataset.itTab;
    if (dataset.bkTab) opts.bkTab = dataset.bkTab;
    if (dataset.caTab) opts.caTab = dataset.caTab;
    if (dataset.alTab) opts.alTab = dataset.alTab;
    if (dataset.exTab) opts.exTab = dataset.exTab;
    if (dataset.ztTab) opts.ztTab = dataset.ztTab;
    if (dataset.liveTab) opts.liveTab = dataset.liveTab;
    return opts;
  }

  function getNavItemSubKey(item) {
    return item.dataset.resultsPanel
      || item.dataset.kbTab
      || item.dataset.settingsTab
      || item.dataset.remTab
      || item.dataset.gbTab
      || item.dataset.baselineTab
      || item.dataset.itTab
      || item.dataset.bkTab
      || item.dataset.caTab
      || item.dataset.alTab
      || item.dataset.exTab
        || item.dataset.ztTab
      || item.dataset.liveTab
      || '';
  }

  function isNavItemActive(item, navSection) {
    if (!item?.dataset?.section || item.dataset.section !== navSection) return false;
    if (item.classList.contains('nav-dropdown-toggle')) return true;
    const subKey = getNavItemSubKey(item);
    if (!subKey) return true;
    return subKey === global._getCurrentSubItem?.();
  }

  function setActiveNav(sectionName) {
    updateBreadcrumb(sectionName);
    const navSection = sectionName === 'history' ? 'results' : sectionName;
    document.querySelectorAll('.portal-nav-link[data-section], .nav-dropdown-link[data-section]').forEach((item) => {
      item.classList.toggle('active', isNavItemActive(item, navSection));
    });
    document.querySelectorAll('.nav-dropdown').forEach((dropdown) => {
      const groupSections = global.NAV_GROUP_SECTIONS?.[dropdown.dataset.navGroup || ''] || [];
      const hasActiveChild = groupSections.some((entry) => {
        if (typeof entry === 'string') return entry === navSection;
        if (!entry || entry.section !== navSection) return false;
        if (!Array.isArray(entry.subItems) || !entry.subItems.length) return true;
        return entry.subItems.includes(global._getCurrentSubItem?.());
      });
      dropdown.classList.toggle('has-active', hasActiveChild);
      const toggle = dropdown.querySelector('.nav-dropdown-toggle');
      if (toggle) {
        toggle.classList.toggle('active', hasActiveChild || isNavItemActive(toggle, navSection));
      }
      if (hasActiveChild) setDropdownOpen(dropdown, true);
    });
    const activeGroup = document.querySelector('.nav-dropdown.has-active');
    if (activeGroup) {
      document.querySelectorAll('.nav-dropdown:not(.has-active)').forEach((dropdown) => {
        setDropdownOpen(dropdown, false);
      });
    }

    /* ── Sidebar groepen: has-active markeren, maar niet auto-openen ── */
    document.querySelectorAll('.sidebar-group[data-nav-group]').forEach((group) => {
      const groupItems = group.querySelectorAll('.sidebar-nav-link[data-section]');
      const hasActive = Array.from(groupItems).some((btn) => isNavItemActive(btn, navSection));
      const toggle = group.querySelector('.sidebar-group-toggle');
      if (toggle) toggle.classList.toggle('has-active', hasActive);
      if (toggle) toggle.setAttribute('aria-expanded', group.classList.contains('collapsed') ? 'false' : 'true');
    });
  }

  function switchSettingsTab(tabName) {
    const tabs = document.querySelectorAll('.settings-tab');
    const panes = document.querySelectorAll('.settings-pane');
    tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
    panes.forEach((pane) => pane.classList.toggle('active', pane.dataset.tab === tabName));
    if (global._getCurrentSection?.() === 'settings') global.setActiveSubnavItem?.(tabName);
    if (tabName === 'roles') global.loadRolesTab?.();
    if (tabName === 'tenant') global.loadIntegratieStatusGrid?.();
  }

  global.DenjoyShellNavigation = {
    setDropdownOpen,
    getSectionOptionsFromDataset,
    getNavItemSubKey,
    isNavItemActive,
    setActiveNav,
    switchSettingsTab,
    initSidebarCollapse,
    updateBreadcrumb,
    renderSidebarMetrics,
  };
  global.setDropdownOpen = setDropdownOpen;
  global.getSectionOptionsFromDataset = getSectionOptionsFromDataset;
  global.getNavItemSubKey = getNavItemSubKey;
  global.isNavItemActive = isNavItemActive;
  global.setActiveNav = setActiveNav;
  global.switchSettingsTab = switchSettingsTab;
  global.initSidebarCollapse = initSidebarCollapse;
  global.updateBreadcrumb = updateBreadcrumb;
  global.renderSidebarMetrics = renderSidebarMetrics;

  // Init collapse toggle zodra DOM klaar is
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarCollapse);
  } else {
    initSidebarCollapse();
  }
})(window);
