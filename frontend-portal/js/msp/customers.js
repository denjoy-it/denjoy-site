(function initDenjoyMspCustomers(global) {
  function parseAccessScope(scope) {
    const raw = String(scope || '').trim();
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  async function openTenantAppRegistrations(tenantId, tenantName = '') {
    if (!tenantId) return;
    try {
      if (tenantId !== global.currentTenantId && typeof global.selectTenantFromManagement === 'function') {
        await global.selectTenantFromManagement(tenantId);
      }
      global.showSection?.('apps', { liveTab: 'registrations' });
      global.showToast?.(`App Registraties geopend voor ${tenantName || tenantId}.`, 'success');
    } catch (e) {
      global.showToast?.(`Kon App Registraties niet openen: ${e.message || e}`, 'error');
    }
  }

  async function openTenantKnowledgeBase(tenantId, kbTab = 'overview', tenantName = '') {
    if (!tenantId) return;
    if (!global.DenjoyShellAccess?.hasKbAccess?.()) {
      global.showToast?.('Kennisbank is alleen beschikbaar voor administrator of een toegewezen MSP-rol.', 'warning');
      return;
    }
    try {
      if (tenantId !== global.currentTenantId && typeof global.selectTenantFromManagement === 'function') {
        await global.selectTenantFromManagement(tenantId);
      }
      global.showSection?.('kb', { kbTab });
      const labels = {
        overview: 'KB overzicht',
        assets: 'KB apparaten',
        pages: 'KB documenten',
        changelog: 'KB wijzigingslog',
        appregs: 'KB app registraties',
      };
      global.showToast?.(`${labels[kbTab] || 'Kennisbank'} geopend voor ${tenantName || tenantId}.`, 'success');
    } catch (e) {
      global.showToast?.(`Kon kennisbank niet openen: ${e.message || e}`, 'error');
    }
  }

  async function openCustomerAccessManager(customerId, customerName = '') {
    if (typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    try {
      const [accessResp, usersResp, rolesResp] = await Promise.all([
        global.apiFetch(`/api/customers/${customerId}/access`),
        global.apiFetchCached('/api/users', {}, global.CACHE_TTL.roles),
        global.apiFetchCached('/api/portal-roles', {}, global.CACHE_TTL.roles),
      ]);
      const accessItems = Array.isArray(accessResp.items) ? accessResp.items : [];
      const users = Array.isArray(usersResp.items) ? usersResp.items : [];
      const roles = Array.isArray(rolesResp.items) ? rolesResp.items : [];
      const userMap = new Map(users.map((item) => [item.id, item]));
      const roleMap = new Map(roles.map((item) => [item.id, item]));
      const assignedUserIds = new Set(accessItems.map((item) => item.portal_user_id));

      global.openSideRailDetail('Klanttoegang', customerName || 'Klant');
      global.updateSideRailDetail(customerName || 'Klanttoegang', `
        <div class="bev-workbench-meta">${global.escapeHtml(customerName || 'Klant')} · toegang beheren</div>
        <div class="bev-wb-list" style="margin-top:.9rem;">
          ${accessItems.length ? accessItems.map((entry) => {
            const user = userMap.get(entry.portal_user_id) || {};
            const role = roleMap.get(entry.portal_role_id) || {};
            return `
              <div class="bev-wb-item">
                <strong>${global.escapeHtml(user.display_name || user.email || entry.portal_user_id || 'Gebruiker')}</strong>
                <span>${global.escapeHtml(role.label || role.role_key || 'rol')}${parseAccessScope(entry.scope).documentation_enabled ? ' · Documentatie' : ''} · ${global.escapeHtml(user.email || '')}</span>
                <div class="bev-inline-actions" style="margin-top:.35rem;">
                  <select class="bev-inline-select" data-customer-access-role="${global.escapeHtml(entry.portal_user_id)}" style="min-width:180px;">
                    ${roles.map((roleOption) => `<option value="${global.escapeHtml(roleOption.role_key)}" ${roleOption.id === entry.portal_role_id ? 'selected' : ''}>${global.escapeHtml(roleOption.label || roleOption.role_key)}</option>`).join('')}
                  </select>
                  <label class="bev-inline-check" style="display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem;">
                    <input type="checkbox" data-customer-access-docs="${global.escapeHtml(entry.portal_user_id)}" ${parseAccessScope(entry.scope).documentation_enabled ? 'checked' : ''}>
                    <span>Documentatie</span>
                  </label>
                  <button type="button" class="bev-inline-btn" data-action="updateCustomerAccessFromRail" data-customer-id="${global.escapeHtml(customerId)}" data-user-id="${global.escapeHtml(entry.portal_user_id)}" data-role-key="${global.escapeHtml(role.role_key || '')}">Wijzigen</button>
                  <button type="button" class="bev-inline-btn" data-action="openPortalUserFromCustomer" data-user-id="${global.escapeHtml(entry.portal_user_id)}">Gebruiker</button>
                  <button type="button" class="bev-inline-btn" data-action="revokeCustomerAccessFromRail" data-customer-id="${global.escapeHtml(customerId)}" data-user-id="${global.escapeHtml(entry.portal_user_id)}">Intrekken</button>
                </div>
              </div>
            `;
          }).join('') : '<div class="bev-workbench-empty">Nog geen gebruikers aan deze klant gekoppeld.</div>'}
        </div>
        <div class="results-actions-compose" style="margin-top:1rem;">
          <div class="results-actions-form-grid">
            <label class="setting-item">
              <span>Gebruiker</span>
              <select id="customerAccessUserInput">
                <option value="">Selecteer gebruiker</option>
                ${users.map((user) => `<option value="${global.escapeHtml(user.id)}" ${assignedUserIds.has(user.id) ? 'disabled' : ''}>${global.escapeHtml(user.display_name || user.email || user.id)}${assignedUserIds.has(user.id) ? ' (al gekoppeld)' : ''}</option>`).join('')}
              </select>
            </label>
            <label class="setting-item">
              <span>Portalrol</span>
              <select id="customerAccessRoleInput">
                <option value="">Selecteer rol</option>
                ${roles.map((role) => `<option value="${global.escapeHtml(role.role_key)}">${global.escapeHtml(role.label || role.role_key)}</option>`).join('')}
              </select>
            </label>
            <label class="setting-item">
              <span>Extra modules</span>
              <label class="checkbox-label" style="display:flex;align-items:center;gap:.45rem;">
                <input type="checkbox" id="customerAccessDocumentationInput">
                <span>Documentatie module activeren</span>
              </label>
            </label>
          </div>
          <div class="results-actions-form-actions">
            <button type="button" class="btn btn-primary" id="customerAccessGrantBtn">Toegang toewijzen</button>
          </div>
        </div>
      `);
      document.querySelectorAll('[data-action="openPortalUserFromCustomer"]').forEach((btn) => {
        btn.addEventListener('click', () => global.openPortalUserDetail?.(btn.dataset.userId));
      });
      document.querySelectorAll('[data-action="updateCustomerAccessFromRail"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const select = document.querySelector(`[data-customer-access-role="${btn.dataset.userId}"]`);
          const docsCheck = document.querySelector(`[data-customer-access-docs="${btn.dataset.userId}"]`);
          const nextRoleKey = select?.value || '';
          if (!nextRoleKey) {
            global.showToast?.('Selecteer eerst een portalrol.', 'warning');
            return;
          }
          if (nextRoleKey === (btn.dataset.roleKey || '')) {
            global.showToast?.('Deze gebruiker heeft deze portalrol al.', 'info');
            return;
          }
          try {
            await global.apiFetch(`/api/customers/${btn.dataset.customerId}/access/${btn.dataset.userId}`, {
              method: 'POST',
              body: JSON.stringify({ role_key: nextRoleKey, documentation_enabled: !!docsCheck?.checked }),
            });
            global.cacheClear?.('/api/user-access');
            global.cacheClear?.(`/api/customers/${customerId}/access`);
            global.cacheClear?.('/api/users');
            global.cacheClear?.('/api/customers');
            global.showToast?.('Klanttoegang gewijzigd.', 'success');
            await Promise.allSettled([global.loadRolesTab?.(), global._showKlantDetail?.(customerId)]);
            await openCustomerAccessManager(customerId, customerName);
          } catch (e) {
            global.showToast?.(`Fout bij wijzigen: ${e.message || e}`, 'error');
          }
        });
      });
      document.querySelectorAll('[data-action="revokeCustomerAccessFromRail"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await global._revokePortalCustomerAccess?.(btn.dataset.userId, btn.dataset.customerId);
          await openCustomerAccessManager(customerId, customerName);
        });
      });
      document.getElementById('customerAccessGrantBtn')?.addEventListener('click', async () => {
        const userId = document.getElementById('customerAccessUserInput')?.value || '';
        const roleKey = document.getElementById('customerAccessRoleInput')?.value || '';
        const documentationEnabled = !!document.getElementById('customerAccessDocumentationInput')?.checked;
        if (!userId || !roleKey) {
          global.showToast?.('Selecteer eerst een gebruiker en portalrol.', 'warning');
          return;
        }
        try {
          await global.apiFetch(`/api/customers/${customerId}/access/${userId}`, {
            method: 'POST',
            body: JSON.stringify({ role_key: roleKey, documentation_enabled: documentationEnabled }),
          });
          global.cacheClear?.('/api/user-access');
          global.cacheClear?.(`/api/customers/${customerId}/access`);
          global.cacheClear?.('/api/users');
          global.cacheClear?.('/api/customers');
          global.showToast?.('Klanttoegang toegewezen.', 'success');
          await Promise.allSettled([global.loadRolesTab?.(), global._showKlantDetail?.(customerId)]);
          await openCustomerAccessManager(customerId, customerName);
        } catch (e) {
          global.showToast?.(`Fout bij toewijzen: ${e.message || e}`, 'error');
        }
      });
    } catch (e) {
      global.showToast?.(`Fout bij laden klanttoegang: ${e.message || e}`, 'error');
    }
  }

  global.DenjoyMspCustomers = {
    openTenantAppRegistrations,
    openTenantKnowledgeBase,
    openCustomerAccessManager,
  };
  global.openTenantAppRegistrations = openTenantAppRegistrations;
  global.openTenantKnowledgeBase = openTenantKnowledgeBase;
  global.openCustomerAccessManager = openCustomerAccessManager;
})(window);
