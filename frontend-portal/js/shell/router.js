(function initDenjoyShellRouter(global) {
  const LIVE_SECTIONS = new Set(['teams', 'sharepoint', 'identity', 'apps', 'domains', 'exchange', 'intune', 'alerts', 'compliance', 'hybrid']);
  const MSP_SECTIONS = new Set(['mspcontrolcenter', 'tenantoverzicht', 'klantenbeheer', 'goedkeuringen', 'kosten', 'jobmonitor', 'azure', 'platformHub', 'dienstenHub', 'activityfeed', 'playbooks']);
  const loadedScripts = new Map();
  const ASSET_VERSION = String(global.__denjoyAssetVersion || '20260414-13');
  const SECTION_SCRIPT_MAP = {
    assessment: ['js/assessment-ui.js', 'js/assessment.js'],
    results: ['js/results-viewer.js'],
    herstel: ['js/remediate.js'],
    gebruikers: ['js/gebruikers.js'],
    baseline: ['js/baseline.js'],
    intuneManagementHub: ['js/intune-management-hub.js'],
    backup: ['js/backup.js'],
    ca: ['js/ca.js'],
    bevindingen: ['js/bevindingen.js'],
    zerotrust: ['js/zerotrust.js'],
    kb: ['js/kb.js'],
    domains: ['js/live-modules.js', 'js/domains.js'],
    exchange: ['js/live-modules.js', 'js/exchange.js'],
    intune: ['js/live-modules.js', 'js/intune.js'],
    alerts: ['js/live-modules.js', 'js/alerts.js'],
    teams: ['js/live-modules.js'],
    sharepoint: ['js/live-modules.js'],
    identity: ['js/live-modules.js'],
    apps: ['js/live-modules.js'],
    compliance: ['js/live-modules.js'],
    hybrid: ['js/live-modules.js'],
    dienstenHub: ['js/msp/services-hub.js'],
    activityfeed: ['js/msp/activity-feed.js'],
    playbooks: ['js/msp/playbooks.js'],
  };
  const LIVE_DEFAULT_TABS = {
    teams: 'teams',
    sharepoint: 'sharepoint-sites',
    identity: 'mfa',
    apps: 'registrations',
    domains: 'domains-list',
    exchange: 'mailboxen',
    intune: 'overzicht',
    backup: 'overzicht',
    alerts: 'auditlog',
    compliance: 'cis',
    hybrid: 'sync',
  };

  function getSubItemFromOptions(sectionName, opts = {}) {
    return opts.resultsPanel
      || opts.kbTab
      || opts.settingsTab
      || opts.remTab
      || opts.gbTab
      || opts.ztTab
      || opts.liveTab
      || opts.baselineTab
      || opts.itTab
      || opts.bkTab
      || opts.caTab
      || opts.alTab
      || opts.exTab
      || (sectionName === 'assessment' ? 'assessment' : null);
  }

  function resolveAssetPath(src) {
    if (!src || /^https?:\/\//i.test(src)) return src;
    return src.includes('?') ? `${src}&v=${encodeURIComponent(ASSET_VERSION)}` : `${src}?v=${encodeURIComponent(ASSET_VERSION)}`;
  }

  function loadScriptOnce(src) {
    if (!src) return Promise.resolve();
    const resolvedSrc = resolveAssetPath(src);
    if (loadedScripts.has(resolvedSrc)) return loadedScripts.get(resolvedSrc);
    const existing = document.querySelector(`script[src="${resolvedSrc}"]`);
    if (existing) {
      const ready = Promise.resolve();
      loadedScripts.set(resolvedSrc, ready);
      return ready;
    }
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = resolvedSrc;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Een module kon niet worden geladen (${resolvedSrc}). Ververs de pagina of neem contact op met Denjoy.`));
      document.body.appendChild(script);
    });
    loadedScripts.set(resolvedSrc, promise);
    return promise;
  }

  async function ensureSectionScripts(sectionName) {
    const scripts = SECTION_SCRIPT_MAP[sectionName] || [];
    for (const src of scripts) {
      await loadScriptOnce(src);
    }
  }

  function activateSection(sectionName) {
    document.querySelectorAll('.content-section').forEach((section) => section.classList.remove('active'));
    const target = document.getElementById(`${sectionName}Section`);
    if (target) target.classList.add('active');
  }

  function guardSection(sectionName, opts = {}) {
    let nextSection = sectionName === 'history' ? 'results' : sectionName;
    let nextOpts = opts;

    if (nextSection === 'kb' && !global.hasKbAccess?.()) {
      global.showToast?.('Documentatie is alleen beschikbaar voor beheerders en toegewezen MSP-rollen.', 'warning');
      nextSection = 'overview';
      nextOpts = {};
    }
    if (MSP_SECTIONS.has(nextSection) && !global.hasMspAdminAccess?.()) {
      global.showToast?.('MSP Admin is alleen beschikbaar voor beheerders en toegewezen MSP-rollen.', 'warning');
      nextSection = 'overview';
      nextOpts = {};
    }
    if (nextSection === 'settings' && ['tenant', 'roles', 'general'].includes(String(nextOpts.settingsTab || 'tenant')) && !global.hasMspPowerAccess?.()) {
      global.showToast?.('Deze sectie is alleen toegankelijk voor beheerders met MSP Super Admin-rechten.', 'warning');
      nextSection = 'overview';
      nextOpts = {};
    }
    return { sectionName: nextSection, opts: nextOpts };
  }

  function handleAdminOnlySection(sectionName, loader) {
    if (global.getCurrentUserRole?.() !== 'admin') {
      global.showToast?.(sectionName === 'mspcontrolcenter' ? 'Geen toegang tot het MSP Control Center. Neem contact op met uw beheerder.' : 'Geen toegang. Neem contact op met uw beheerder.', 'error');
      global.showSection?.('overview');
      return true;
    }
    global.updateSubnav?.(sectionName, null);
    global._setCurrentRouteState?.(sectionName, null);
    loader?.();
    return true;
  }

  async function showSection(sectionName, opts = {}) {
    const guarded = guardSection(sectionName, opts);
    const resolvedSection = guarded.sectionName;
    const resolvedOpts = guarded.opts;
    const resolvedSubItem = getSubItemFromOptions(resolvedSection, resolvedOpts);
    const shouldAutoOpenContextRail = resolvedOpts.contextRailAutoOpen !== false;

    global._setCurrentRouteState?.(resolvedSection, resolvedSubItem);
    global.updateWorkspaceHeader?.(resolvedSection);
    global._setContextRailOpen?.(false, { skipPersist: true });
    global.renderContextRail?.(resolvedSection);
    if (shouldAutoOpenContextRail) {
      global._setContextRailOpen?.(true, { skipPersist: true });
    }
    activateSection(resolvedSection);
    global.setActiveNav?.(resolvedSection);
    global.applyWorkspaceDataStandard?.(resolvedSection);

    await ensureSectionScripts(resolvedSection);

    if (resolvedSection === 'assessment') {
      global.loadAssessmentExperience?.();
      global.loadScheduledRuns?.();
    }

    if (resolvedSection === 'zerotrust') {
      const activeTab = resolvedOpts.ztTab || 'overview';
      global.updateSubnav?.('zerotrust', activeTab);
      global._setCurrentRouteState?.(resolvedSection, activeTab);
      global.loadZeroTrustSection?.(activeTab);
      return;
    }

    if (resolvedSection === 'results') {
      const activePanel = resolvedOpts.resultsPanel || 'viewer';
      global.updateSubnav?.('results', activePanel);
      global._setCurrentRouteState?.(resolvedSection, activePanel);
      global.loadResultsSection?.().then(() => {
        global.showResultsPanel?.(activePanel);
      });
      return;
    }

    if (resolvedSection === 'settings') {
      const activeTab = resolvedOpts.settingsTab || 'tenant';
      global.populateSettings?.();
      global.switchSettingsTab?.(activeTab);
      global.updateSubnav?.('settings', activeTab);
      global._setCurrentRouteState?.(resolvedSection, activeTab);
      return;
    }

    if (resolvedSection === 'kb') {
      const activeTab = resolvedOpts.kbTab || 'overview';
      global.kbSwitchTab?.(activeTab);
      global.updateSubnav?.('kb', activeTab);
      global._setCurrentRouteState?.(resolvedSection, activeTab);
      global.setTimeout?.(global.refreshSubnavCounts, 600);
      return;
    }

    if (resolvedSection === 'herstel') {
      const activeTab = resolvedOpts.remTab || 'catalogus';
      global.updateSubnav?.('herstel', activeTab);
      global._setCurrentRouteState?.(resolvedSection, activeTab);
      global.loadHerstellSection?.();
      global.activateSectionSubtab?.('herstel', activeTab);
      return;
    }

    if (resolvedSection === 'gebruikers') {
      const activeTab = resolvedOpts.gbTab || 'gebruikers';
      global.updateSubnav?.('gebruikers', activeTab);
      global._setCurrentRouteState?.(resolvedSection, activeTab);
      global.loadGebruikersSection?.();
      global.activateSectionSubtab?.('gebruikers', activeTab);
      return;
    }

    if (resolvedSection === 'baseline') {
      const activeTab = resolvedOpts.baselineTab || 'baselines';
      global.updateSubnav?.('baseline', activeTab);
      global._setCurrentRouteState?.(resolvedSection, activeTab);
      global.loadBaselineSection?.();
      global.activateSectionSubtab?.('baseline', activeTab);
      return;
    }

    if (resolvedSection === 'intuneManagementHub') {
      global.updateSubnav?.('intuneManagementHub', null);
      global._setCurrentRouteState?.(resolvedSection, null);
      global.loadIntuneManagementHubSection?.();
      return;
    }

    if (resolvedSection === 'backup') {
      const activeTab = resolvedOpts.bkTab || resolvedOpts.liveTab || 'overzicht';
      global.updateSubnav?.('backup', activeTab);
      global._setCurrentRouteState?.(resolvedSection, activeTab);
      global.loadBackupSection?.();
      global.switchBackupTab?.(activeTab);
      return;
    }

    if (resolvedSection === 'azure') {
      const activeTab = resolvedOpts.liveTab || 'overview';
      global.updateSubnav?.('azure', activeTab);
      global._setCurrentRouteState?.(resolvedSection, activeTab);
      global.loadAzureSection?.(activeTab);
      return;
    }

    if (LIVE_SECTIONS.has(resolvedSection)) {
      const activeTab = resolvedOpts.liveTab || LIVE_DEFAULT_TABS[resolvedSection];
      global.updateSubnav?.(resolvedSection, activeTab);
      global._setCurrentRouteState?.(resolvedSection, activeTab);
      global.loadLiveModuleSection?.(resolvedSection, activeTab);
      return;
    }

    if (resolvedSection === 'ca') {
      const activeTab = resolvedOpts.caTab || 'policies';
      global.updateSubnav?.('ca', activeTab);
      global._setCurrentRouteState?.(resolvedSection, activeTab);
      global.loadCaSection?.();
      global.activateSectionSubtab?.('ca', activeTab);
      return;
    }

    if (resolvedSection === 'bevindingen') {
      global.updateSubnav?.('bevindingen', null);
      global._setCurrentRouteState?.(resolvedSection, null);
      global.loadBevindingenSection?.();
      return;
    }

    if (resolvedSection === 'vergelijking') {
      global.updateSubnav?.('vergelijking', null);
      global._setCurrentRouteState?.(resolvedSection, null);
      global.loadVergelijkingSection?.();
      return;
    }

    if (resolvedSection === 'tenantoverzicht') {
      if (global.getCurrentUserRole?.() !== 'admin') {
        global.showToast?.('Geen toegang tot het tenantoverzicht. Neem contact op met uw beheerder.', 'error');
        global.showSection?.('overview');
        return;
      }
      global.updateSubnav?.('tenantoverzicht', null);
      global._setCurrentRouteState?.(resolvedSection, null);
      global.loadTenantHealthDashboard?.();
      return;
    }

    if (resolvedSection === 'mspcontrolcenter') {
      if (handleAdminOnlySection('mspcontrolcenter', global.loadMspControlCenter)) return;
    }

    if (resolvedSection === 'klantenbeheer') {
      if (handleAdminOnlySection('klantenbeheer', global.loadKlantenbeheer)) return;
    }

    if (resolvedSection === 'goedkeuringen') {
      if (handleAdminOnlySection('goedkeuringen', global.loadGoedkeuringen)) return;
    }

    if (resolvedSection === 'kosten') {
      if (handleAdminOnlySection('kosten', global.loadKostenSection)) return;
    }

    if (resolvedSection === 'jobmonitor') {
      if (handleAdminOnlySection('jobmonitor', global.loadJobMonitor)) return;
    }

    if (resolvedSection === 'activityfeed') {
      if (handleAdminOnlySection('activityfeed', global.loadActivityFeedSection)) return;
    }

    if (resolvedSection === 'playbooks') {
      if (handleAdminOnlySection('playbooks', global.loadPlaybooksSection)) return;
    }

    if (resolvedSection === 'peopleHub' || resolvedSection === 'gbidHub') {
      global.updateSubnav?.('peopleHub', null);
      global._setCurrentRouteState?.(resolvedSection, null);
      global.loadHubSection?.('gbid');
      return;
    }

    if (resolvedSection === 'securityHub') {
      global.updateSubnav?.('securityHub', null);
      global._setCurrentRouteState?.(resolvedSection, null);
      global.loadHubSection?.('security');
      return;
    }

    if (resolvedSection === 'collabHub') {
      global.updateSubnav?.('collabHub', null);
      global._setCurrentRouteState?.(resolvedSection, null);
      global.loadHubSection?.('collab');
      return;
    }

    if (resolvedSection === 'devicesHub') {
      global.updateSubnav?.('devicesHub', null);
      global._setCurrentRouteState?.(resolvedSection, null);
      global.loadHubSection?.('devices');
      return;
    }

    if (resolvedSection === 'assessmentHub') {
      global.updateSubnav?.('assessmentHub', null);
      global._setCurrentRouteState?.(resolvedSection, null);
      global.loadHubSection?.('assessment');
      return;
    }

    if (resolvedSection === 'platformHub') {
      global.updateSubnav?.('platformHub', null);
      global._setCurrentRouteState?.(resolvedSection, null);
      return;
    }

    if (resolvedSection === 'dienstenHub') {
      const activeTab = resolvedOpts.liveTab || resolvedOpts.resultsPanel || 'dienstenHub';
      global.updateSubnav?.('dienstenHub', activeTab);
      global._setCurrentRouteState?.(resolvedSection, activeTab);
      global.loadServicesHubSection?.();
      return;
    }

    if (resolvedSection === 'portalInfo') {
      global.updateSubnav?.('portalInfo', null);
      global._setCurrentRouteState?.(resolvedSection, null);
      return;
    }

    global.updateSubnav?.(resolvedSection, resolvedSection === 'assessment' ? 'assessment' : null);
    global._setCurrentRouteState?.(resolvedSection, resolvedSection === 'assessment' ? 'assessment' : null);
  }

  global.DenjoyShellRouter = {
    showSection,
  };
})(window);
