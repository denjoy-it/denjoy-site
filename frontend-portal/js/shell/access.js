(function initDenjoyShellAccess(global) {
  const state = {
    currentUserRole: 'klant',
    currentPortalRoleKeys: [],
    currentAccessFlags: {
      msp_admin: false,
      msp_power: false,
      tenant_selector: false,
      kb: false,
      kb_write: false,
    },
  };

  function normalizeRoleKeys(items) {
    return Array.isArray(items) ? items.map((item) => String(item || '')) : [];
  }

  function setRoleContext(context = {}) {
    if (context.role) state.currentUserRole = context.role;
    if ('portal_role_keys' in context) state.currentPortalRoleKeys = normalizeRoleKeys(context.portal_role_keys);
    if ('access' in context) {
      state.currentAccessFlags = {
        msp_admin: !!context.access?.msp_admin,
        msp_power: !!context.access?.msp_power,
        tenant_selector: !!context.access?.tenant_selector,
        kb: !!context.access?.kb,
        kb_write: !!context.access?.kb_write,
      };
    }
    applyRoleVisibility();
  }

  function setCurrentUserRole(role) {
    state.currentUserRole = role || 'klant';
    applyRoleVisibility();
  }

  function getCurrentUserRole() {
    return state.currentUserRole;
  }

  function getCurrentPortalRoleKeys() {
    return state.currentPortalRoleKeys.slice();
  }

  function getCurrentAccessFlags() {
    return { ...state.currentAccessFlags };
  }

  function hasPortalRole(roleKey) {
    return state.currentPortalRoleKeys.includes(String(roleKey || ''));
  }

  function hasMspAdminAccess() {
    return state.currentUserRole === 'admin' || !!state.currentAccessFlags.msp_admin;
  }

  function hasMspPowerAccess() {
    return state.currentUserRole === 'admin' || !!state.currentAccessFlags.msp_power;
  }

  function hasTenantSelectorAccess() {
    return state.currentUserRole === 'admin' || !!state.currentAccessFlags.tenant_selector;
  }

  function hasKbAccess() {
    return state.currentUserRole === 'admin' || !!state.currentAccessFlags.kb;
  }

  function applyRoleVisibility() {
    const tenantPill = document.getElementById('tenantPill');
    if (tenantPill) {
      // Topbar pill is verplaatst naar sidebar; altijd verbergen
      tenantPill.style.display = 'none';
    }
    // Sidebar tenant-area zichtbaarheid
    const sbTenantArea = document.getElementById('sbTenantArea');
    if (sbTenantArea && hasTenantSelectorAccess()) {
      // Alleen tonen als er al tenantdata is
      const hasData = !!(global.allTenants?.length);
      if (hasData) sbTenantArea.style.display = '';
    }
    if (state.currentUserRole === 'admin') {
      document.querySelectorAll('.admin-only-nav').forEach((el) => el.classList.remove('admin-only-nav'));
    }
    if (hasKbAccess()) {
      document.querySelectorAll('.role-kb-nav').forEach((el) => el.classList.remove('role-restricted-nav'));
    }
    if (hasMspAdminAccess()) {
      document.querySelectorAll('.role-msp-nav').forEach((el) => el.classList.remove('role-restricted-nav'));
    }
    if (hasMspPowerAccess()) {
      document.querySelectorAll('.role-msp-power-nav').forEach((el) => el.classList.remove('role-restricted-item'));
    }
  }

  global.DenjoyShellAccess = {
    setRoleContext,
    setCurrentUserRole,
    getCurrentUserRole,
    getCurrentPortalRoleKeys,
    getCurrentAccessFlags,
    hasPortalRole,
    hasMspAdminAccess,
    hasMspPowerAccess,
    hasTenantSelectorAccess,
    hasKbAccess,
    applyRoleVisibility,
  };

  global._setDashboardRole = setCurrentUserRole;
  global._getDashboardRole = getCurrentUserRole;
  global.getCurrentUserRole = getCurrentUserRole;
  global.hasMspAdminAccess = hasMspAdminAccess;
  global.hasMspPowerAccess = hasMspPowerAccess;
  global.hasTenantSelectorAccess = hasTenantSelectorAccess;
  global.hasKbAccess = hasKbAccess;
})(window);
