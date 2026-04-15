(function initDenjoyMspNavBootstrap(global) {
  'use strict';

  function getSectionOptionsFromDataset(dataset) {
    const handler = global.DenjoyShellNavigation?.getSectionOptionsFromDataset;
    return handler ? (handler(dataset) || {}) : {};
  }

  function switchSettingsTab(tabName) {
    return global.DenjoyShellNavigation?.switchSettingsTab?.(tabName);
  }

  function buildStoredRouteOptions(sectionName, subItem) {
    if (!sectionName || !subItem || subItem === sectionName) return {};
    const propMap = {
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
    const prop = propMap[sectionName] || 'liveTab';
    return { [prop]: subItem };
  }

  function loadGoedkeuringen(statusFilter) {
    const handler = global.loadGoedkeuringen || global.DenjoyMspApprovals?.loadGoedkeuringen;
    return handler ? handler(statusFilter) : undefined;
  }

  function loadJobMonitor(statusFilter) {
    const handler = global.loadJobMonitor || global.DenjoyMspJobs?.loadJobMonitor;
    return handler ? handler(statusFilter) : undefined;
  }

  function openKostenSnapshotForm() {
    const handler = global.openKostenSnapshotForm || global.DenjoyMspCosts?.openKostenSnapshotForm;
    return handler ? handler() : undefined;
  }

  function filterKlantTable(query) {
    const handler = global._filterKlantTable || global.DenjoyMspCustomersView?.filterKlantTable;
    return handler ? handler(query) : undefined;
  }

  function setupNavigation() {
    document.querySelectorAll('.portal-nav-link[data-section]:not(.nav-dropdown-toggle), .nav-dropdown-link[data-section]').forEach((item) => {
      item.addEventListener('click', (event) => {
        event.preventDefault();
        const opts = getSectionOptionsFromDataset(item.dataset);
        global.showSection?.(item.dataset.section, opts);
      });
    });
    document.querySelectorAll('.nav-dropdown-toggle').forEach((toggle) => {
      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const dropdown = toggle.closest('.nav-dropdown');
        // Keep the selected chapter open after navigation so submenu context remains visible.
        const shouldOpen = true;
        document.querySelectorAll('.nav-dropdown.open').forEach((item) => {
          if (item !== dropdown) global.setDropdownOpen?.(item, false);
        });
        if (toggle.dataset.section) {
          global.showSection?.(toggle.dataset.section, getSectionOptionsFromDataset(toggle.dataset));
        }
        global.setDropdownOpen?.(dropdown, shouldOpen);
      });
    });
    document.querySelectorAll('.nav-dropdown').forEach((dropdown) => {
      dropdown.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          global.setDropdownOpen?.(dropdown, false);
          dropdown.querySelector('.nav-dropdown-toggle')?.focus();
        }
      });
    });
  }

  async function bootstrap() {
    try {
      const fallbackName = 'Lokaal';
      const userNameEl = document.getElementById('userName');
      if (userNameEl) userNameEl.textContent = fallbackName;
      const initialsEl = document.getElementById('userInitials');
      if (initialsEl) initialsEl.textContent = global.getInitials?.(fallbackName) || 'LK';

      global.initThemeControls?.();
      setupNavigation();
      global.setupHeaderActions?.();
      global.setupSettingsActions?.();
      switchSettingsTab('tenant');
      global.updateSubnav?.('overview');
      const prefs = global.getUiPrefs?.() || {};
      global.setSidebarCompact?.(!!prefs.sidebarCompact);
      global.updateWorkspaceHeader?.('overview');
      global._setContextRailOpen?.(false, { skipPersist: true });

      const rolePromise = global._loadCurrentRole ? global._loadCurrentRole() : Promise.resolve();
      await Promise.allSettled([rolePromise]);
      const tenantsPromise = global.loadTenants ? global.loadTenants() : Promise.resolve();
      await Promise.allSettled([tenantsPromise]);
      global.DenjoyShellAccess?.applyRoleVisibility?.();
      await global.refreshTenantData?.();
      global.runWhenIdle?.(() => {
        Promise.allSettled([global.populateSettings?.()]).catch(() => {});
      }, 1200);
      const section = global._getCurrentSection?.() || 'overview';
      const subItem = global._getCurrentSubItem?.() || null;
      await global.showSection?.(section, {
        ...buildStoredRouteOptions(section, subItem),
        contextRailAutoOpen: false,
      });
    } catch (error) {
      console.error(error);
      global.showToast?.(`Dashboard initialisatie mislukt: ${error.message}`, 'error');
    }
  }

  function bindDeferredPortalEvents() {
    const thRefreshBtn = document.getElementById('thRefreshBtn');
    if (thRefreshBtn) thRefreshBtn.addEventListener('click', () => global.loadTenantHealthDashboard?.());

    const mspccRefreshBtn = document.getElementById('mspccRefreshBtn');
    if (mspccRefreshBtn) mspccRefreshBtn.addEventListener('click', () => global.loadMspControlCenter?.(true));

    document.getElementById('mspccActionApplyBtn')?.addEventListener('click', () => {
      global.setMspActionInboxPreset?.('all');
      global.loadMspActionInbox?.(true);
    });
    document.getElementById('mspccActionStatusFilter')?.addEventListener('change', () => {
      global.setMspActionInboxPreset?.('all');
      global.loadMspActionInbox?.(true);
    });
    document.getElementById('mspccActionOwnerFilter')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        global.setMspActionInboxPreset?.('all');
        global.loadMspActionInbox?.(true);
      }
    });
    document.getElementById('mspccMyWorkBtn')?.addEventListener('click', () => {
      const ownerInput = document.getElementById('mspccActionOwnerFilter');
      if (ownerInput) ownerInput.value = global._getCurrentDisplayName?.() || global._currentDisplayName || '';
      global.setMspActionInboxPreset?.('my_work');
      global.loadMspActionInbox?.(true);
    });
    document.getElementById('mspccClearOwnerBtn')?.addEventListener('click', () => {
      const ownerInput = document.getElementById('mspccActionOwnerFilter');
      if (ownerInput) ownerInput.value = '';
      global.setMspActionInboxPreset?.('all');
      global.loadMspActionInbox?.(true);
    });
    document.querySelectorAll('[data-mspcc-view]').forEach((btn) => {
      btn.addEventListener('click', () => global.applyMspSavedView?.(btn.dataset.mspccView || ''));
    });
    const mspccSection = document.getElementById('mspcontrolcenterSection');
    if (mspccSection) global.bindActions?.(mspccSection);

    document.querySelectorAll('#resultsTabbar [data-results-panel]').forEach((tab) => {
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        global.showResultsPanel?.(tab.dataset.resultsPanel);
      });
    });

    document.getElementById('kbhRefreshBtn')?.addEventListener('click', () => global.loadKlantenbeheer?.());
    document.getElementById('kbhAddBtn')?.addEventListener('click', () => global._showKlantForm?.(null));
    document.getElementById('kbhDetailClose')?.addEventListener('click', () => {
      const panel = document.getElementById('kbhDetailPanel');
      if (panel) panel.style.display = 'none';
    });
    const kbhSearch = document.getElementById('kbhSearch');
    if (kbhSearch) kbhSearch.addEventListener('input', () => filterKlantTable(kbhSearch.value));

    document.querySelectorAll('.gdk-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gdk-filter-btn').forEach((item) => item.classList.remove('active'));
        btn.classList.add('active');
        global.resetCollectionPager?.('approvalsTable');
        loadGoedkeuringen(btn.dataset.status || null);
      });
    });
    document.getElementById('gdkRefreshBtn')?.addEventListener('click', () => {
      const active = document.querySelector('.gdk-filter-btn.active');
      loadGoedkeuringen(active ? (active.dataset.status || null) : 'pending');
    });
    document.getElementById('gdkTenantFilter')?.addEventListener('change', () => {
      const active = document.querySelector('.gdk-filter-btn.active');
      global.resetCollectionPager?.('approvalsTable');
      loadGoedkeuringen(active ? (active.dataset.status || null) : 'pending');
    });

    document.getElementById('kostenRefreshBtn')?.addEventListener('click', () => global.loadKostenSection?.());
    document.getElementById('kostenManualAddBtn')?.addEventListener('click', () => openKostenSnapshotForm());

    document.querySelectorAll('.jm-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.jm-filter').forEach((item) => item.classList.remove('active'));
        btn.classList.add('active');
        global.resetCollectionPager?.('jobsTable');
        loadJobMonitor(btn.dataset.status || null);
      });
    });
    document.getElementById('jmRefreshBtn')?.addEventListener('click', () => {
      const active = document.querySelector('.jm-filter.active');
      loadJobMonitor(active ? (active.dataset.status || null) : null);
    });
    document.getElementById('jmTenantFilter')?.addEventListener('change', () => {
      const active = document.querySelector('.jm-filter.active');
      global.resetCollectionPager?.('jobsTable');
      loadJobMonitor(active ? (active.dataset.status || null) : null);
    });
    document.getElementById('jmEnqueueBtn')?.addEventListener('click', () => global._jmEnqueue?.());
    document.getElementById('jmTenantRefreshBtn')?.addEventListener('click', () => global._jmEnqueueTyped?.('tenant_refresh'));
    document.getElementById('jmGuardianSyncBtn')?.addEventListener('click', () => global._jmEnqueueTyped?.('guardian_sync'));
  }

  function initDashboardDomEvents() {
    bootstrap();
    global.addEventListener('resize', () => global._setContextRailOpen?.(global._getContextRailOpen?.()));

    const hamburger = document.getElementById('mobileMenuToggle');
    if (hamburger) {
      const navBar = hamburger.closest('.portal-nav-bar');
      hamburger.addEventListener('click', () => {
        const isOpen = navBar.classList.toggle('nav-mobile-open');
        hamburger.setAttribute('aria-expanded', String(isOpen));
        hamburger.setAttribute('aria-label', isOpen ? 'Menu sluiten' : 'Menu openen');
      });
      document.addEventListener('click', (event) => {
        if (navBar && !navBar.contains(event.target)) {
          navBar.classList.remove('nav-mobile-open');
          hamburger.setAttribute('aria-expanded', 'false');
          hamburger.setAttribute('aria-label', 'Menu openen');
        }
      });
      document.querySelectorAll('.portal-nav-links .portal-nav-link, .portal-nav-links .nav-dropdown-link').forEach((link) => {
        link.addEventListener('click', () => {
          navBar.classList.remove('nav-mobile-open');
          hamburger.setAttribute('aria-expanded', 'false');
        });
      });
    }

    global.runWhenIdle?.(bindDeferredPortalEvents, 850);

    document.addEventListener('click', (event) => {
      const tile = event.target.closest('.hub-tile[data-section]');
      if (!tile) return;
      event.preventDefault();
      const ds = tile.dataset;
      const opts = {};
      if (ds.gbTab) opts.gbTab = ds.gbTab;
      if (ds.liveTab) opts.liveTab = ds.liveTab;
      if (ds.caTab) opts.caTab = ds.caTab;
      if (ds.kbTab) opts.kbTab = ds.kbTab;
      if (ds.resultsPanel) opts.resultsPanel = ds.resultsPanel;
      if (ds.settingsTab) opts.settingsTab = ds.settingsTab;
      global.showSection?.(ds.section, opts);
    });

    const rolesRefreshBtn = document.getElementById('rolesRefreshBtn');
    if (rolesRefreshBtn) rolesRefreshBtn.addEventListener('click', () => global.loadRolesTab?.());
    const rolesAddUserBtn = document.getElementById('rolesAddUserBtn');
    if (rolesAddUserBtn) rolesAddUserBtn.addEventListener('click', () => global.openPortalUserCreateForm?.());
    global.initRolesFilters?.();
  }

  global.DenjoyMspNavBootstrap = {
    setupNavigation,
    bootstrap,
    bindDeferredPortalEvents,
    initDashboardDomEvents,
  };
  global.setupNavigation = setupNavigation;
  global.bootstrap = bootstrap;
  global.bindDeferredPortalEvents = bindDeferredPortalEvents;
  global.initDashboardDomEvents = initDashboardDomEvents;

  if (!global.__denjoyNavBootstrapBound) {
    document.addEventListener('DOMContentLoaded', initDashboardDomEvents);
    global.__denjoyNavBootstrapBound = true;
  }
})(window);
