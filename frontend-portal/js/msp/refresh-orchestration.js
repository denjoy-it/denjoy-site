(function (global) {
  let tenantRefreshPromise = null;

  function getCurrentSection() {
    if (typeof global._getCurrentSection === 'function') {
      return global._getCurrentSection() || global._currentSection || 'overview';
    }
    return global._currentSection || 'overview';
  }

  function optionalTask(handler, ...args) {
    if (typeof handler !== 'function') return Promise.resolve();
    try {
      return Promise.resolve(handler(...args));
    } catch (_) {
      return Promise.resolve();
    }
  }

  async function refreshTenantData() {
    if (tenantRefreshPromise) return tenantRefreshPromise;
    tenantRefreshPromise = (async () => {
      const tenantId = global.currentTenantId || null;
      const section = getCurrentSection();
      const subItem = global._currentSubItem || null;

      if (tenantId) global.invalidateTenantScopedCaches?.(tenantId);
      
      // Always clear and reload MSP control center data on tenant change
      // This ensures cross-tenant aggregates reflect the current tenant selection
      if (global.cacheClear) {
        global.cacheClear('/api/msp/control-center');
        global.cacheClear('/api/msp/aggregate');
      }
      await optionalTask(global.loadMspControlCenter, true);
      
      const tasks = [];
      if (section === 'overview' || !section) tasks.push(optionalTask(global.loadOverview));
      if (section === 'results') tasks.push(optionalTask(global.loadResultsSection));
      if (section === 'assessment') tasks.push(optionalTask(global.loadOverview));
      if (section === 'mspcontrolcenter') tasks.push(optionalTask(global.loadMspControlCenter, true));
      if (section === 'tenantoverzicht') tasks.push(optionalTask(global.loadTenantHealthDashboard));
      if (!tasks.length) tasks.push(optionalTask(global.loadOverview));
      await Promise.allSettled(tasks);

      if (document.getElementById('assessmentSection')?.classList.contains('active') && typeof global.loadAssessmentExperience === 'function') {
        await global.loadAssessmentExperience({ force: true });
      }
      if (section === 'backup' && typeof global.loadBackupSection === 'function') {
        global.loadBackupSection();
      }
      if (['teams', 'sharepoint', 'identity', 'apps', 'domains', 'exchange', 'intune', 'alerts'].includes(section) && typeof global.loadLiveModuleSection === 'function') {
        await global.loadLiveModuleSection(section, subItem || null);
      }
      if (section === 'zerotrust' && typeof global.loadZeroTrustSection === 'function') {
        await global.loadZeroTrustSection(subItem || 'overview');
      }
      if (section === 'intuneManagementHub' && typeof global.loadIntuneManagementHubSection === 'function') {
        await global.loadIntuneManagementHubSection({ forceRefresh: true });
      }

      global.updateWorkspaceHeader?.(section);
      global.DenjoyShellContextRail?.renderContextRail?.(section);
      global.renderNavSignals?.();
    })().finally(() => {
      tenantRefreshPromise = null;
    });
    return tenantRefreshPromise;
  }

  global.DenjoyMspRefreshOrchestration = {
    refreshTenantData,
  };

  global.refreshTenantData = refreshTenantData;
})(window);
