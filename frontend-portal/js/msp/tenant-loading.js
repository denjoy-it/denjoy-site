(function (global) {
  'use strict';

  const apiFetchCached = global.apiFetchCached || (async () => ({}));
  const CACHE_TTL = global.CACHE_TTL || {};

  function getCurrentSection() {
    if (typeof global._getCurrentSection === 'function') {
      return global._getCurrentSection() || global._currentSection || 'overview';
    }
    return global._currentSection || 'overview';
  }

  function hasTenantSelectorAccess() {
    return typeof global.hasTenantSelectorAccess === 'function' ? global.hasTenantSelectorAccess() : false;
  }

  async function fetchLinkedTenantOnly(linkedTenantId) {
    if (!linkedTenantId) return [];
    try {
      const tenant = await apiFetchCached(`/api/tenants/${linkedTenantId}`, {}, CACHE_TTL.tenants);
      if (tenant && tenant.id) return [tenant];
    } catch (_) {}
    return [];
  }

  async function loadTenants() {
    const linkedTenantId = global._linkedTenantId || null;
    let tenants = [];
    try {
      const data = await apiFetchCached('/api/tenants', {}, CACHE_TTL.tenants);
      tenants = data.items || [];
    } catch (err) {
      if (linkedTenantId) {
        tenants = await fetchLinkedTenantOnly(linkedTenantId);
      } else {
        throw err;
      }
    }
    global.allTenants = tenants;
    const selectorAccess = hasTenantSelectorAccess();

    const select = document.getElementById('tenantSelect');
    if (select) {
      select.innerHTML = '';
      tenants.forEach((tenant) => {
        const option = document.createElement('option');
        option.value = tenant.id;
        const status = tenant.status ? ` [${tenant.status}]` : '';
        option.textContent = `${tenant.customer_name} / ${tenant.tenant_name}${status}`;
        select.appendChild(option);
      });
      select.style.display = selectorAccess ? '' : 'none';
    }

    const stored = localStorage.getItem('local_m365_current_tenant');
    if (linkedTenantId && tenants.some((tenant) => tenant.id === linkedTenantId)) {
      global._setCurrentTenantId?.(linkedTenantId);
    } else if (stored && tenants.some((tenant) => tenant.id === stored) && selectorAccess) {
      global._setCurrentTenantId?.(stored);
    } else if (tenants[0]) {
      global._setCurrentTenantId?.(tenants[0].id);
    } else {
      global._setCurrentTenantId?.(null);
    }

    const tenantId = global.currentTenantId || null;
    if (tenantId) {
      if (select) select.value = tenantId;
      localStorage.setItem('local_m365_current_tenant', tenantId);
    } else {
      localStorage.removeItem('local_m365_current_tenant');
    }

    global.updateTenantPill?.(selectorAccess ? tenants : [], tenantId);
    global.updateHeroVisibility?.();
    const section = getCurrentSection();
    global.updateWorkspaceHeader?.(section);
    global.DenjoyShellContextRail?.renderContextRail?.(section);
    global.renderNavSignals?.();

    if (document.getElementById('tenantManagementTableBody')) {
      global.renderTenantManagementTable?.(tenants);
    }

    return tenants;
  }

  global.DenjoyMspTenantLoading = {
    loadTenants,
  };

  global.loadTenants = loadTenants;
})(window);
