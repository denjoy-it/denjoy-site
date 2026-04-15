(function initDenjoyMspSessionRole(global) {
  'use strict';

  function getShellAccess() {
    return global.DenjoyShellAccess || null;
  }

  function getCurrentUserRole() {
    const shellAccess = getShellAccess();
    return shellAccess?.getCurrentUserRole ? shellAccess.getCurrentUserRole() : 'klant';
  }

  function hasPortalRole(roleKey) {
    const shellAccess = getShellAccess();
    return shellAccess?.hasPortalRole ? shellAccess.hasPortalRole(roleKey) : false;
  }

  function hasMspAdminAccess() {
    const shellAccess = getShellAccess();
    return shellAccess?.hasMspAdminAccess ? shellAccess.hasMspAdminAccess() : getCurrentUserRole() === 'admin';
  }

  function hasMspPowerAccess() {
    const shellAccess = getShellAccess();
    return shellAccess?.hasMspPowerAccess ? shellAccess.hasMspPowerAccess() : getCurrentUserRole() === 'admin';
  }

  function hasKbAccess() {
    const shellAccess = getShellAccess();
    return shellAccess?.hasKbAccess ? shellAccess.hasKbAccess() : getCurrentUserRole() === 'admin';
  }

  async function loadCurrentRole() {
    try {
      const res = await global.apiFetch('/api/auth/verify');
      if (res && res.ok && res.role) {
        getShellAccess()?.setRoleContext?.({
          role: res.role,
          portal_role_keys: res.portal_role_keys,
          access: res.access,
        });
        global._linkedTenantId = res.linked_tenant_id || null;
        if (!global.currentTenantId && global._linkedTenantId) {
          global._setCurrentTenantId?.(global._linkedTenantId);
        }
        const name = res.display_name || res.email || 'Lokaal';
        global._currentDisplayName = name;
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = name;
        const initialsEl = document.getElementById('userInitials');
        if (initialsEl) {
          initialsEl.textContent = global.getInitials?.(name)
            || (String(name).substring(0, 2).toUpperCase());
        }
        const avatarBtn = document.getElementById('userAvatarBtn');
        if (avatarBtn) avatarBtn.title = name;
      }
    } catch (_) {
      // Stil falen — rol blijft 'klant' (veiligste standaard)
    }
  }

  const api = {
    getCurrentUserRole,
    hasPortalRole,
    hasMspAdminAccess,
    hasMspPowerAccess,
    hasKbAccess,
    loadCurrentRole,
  };

  global.DenjoyMspSessionRole = api;
  global._getCurrentDisplayName = () => global._currentDisplayName || 'Lokaal';
  global._loadCurrentRole = loadCurrentRole;
})(window);
