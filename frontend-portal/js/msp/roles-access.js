(function initDenjoyMspRolesAccess(global) {
  let rolesData = { users: [], roles: [], customers: [], access: [] };
  let rolesFilterState = { access: 'all', query: '' };

  function clearRolesAccessCaches(customerId = '') {
    if (typeof global.cacheClear !== 'function') return;
    [
      '/api/users',
      '/api/user-access',
      '/api/customers',
      '/api/portal-roles',
      '/api/tenants',
      '/api/msp/control-center',
      customerId ? `/api/customers/${customerId}/access` : '',
    ].filter(Boolean).forEach((key) => global.cacheClear(key));
  }

  function getRoleKeyByPortalRoleId(portalRoleId) {
    const role = (rolesData.roles || []).find((item) => item.id === portalRoleId);
    return String(role?.role_key || '').trim();
  }

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

  function getTenantLabel(tenantId) {
    const tenants = Array.isArray(global.allTenants) ? global.allTenants : [];
    const tenant = tenants.find((item) => String(item.id || '') === String(tenantId || ''));
    return tenant?.customer_name || tenant?.tenant_name || tenantId || '';
  }

  function buildUserPortalRoleSummary(userId) {
    const accessItems = (rolesData.access || []).filter((item) => item.portal_user_id === userId);
    const roleMap = new Map((rolesData.roles || []).map((item) => [item.id, item]));
    const roleKeys = accessItems.map((item) => String(roleMap.get(item.portal_role_id)?.role_key || '')).filter(Boolean);
    const labels = accessItems.map((item) => String(roleMap.get(item.portal_role_id)?.label || roleMap.get(item.portal_role_id)?.role_key || '')).filter(Boolean);
    const uniqueRoleKeys = [...new Set(roleKeys)];
    const hasMsp = uniqueRoleKeys.some((key) => ['msp_super_admin', 'engineer', 'monitoring_operator', 'billing_analyst', 'read_only'].includes(key));
    const hasKb = uniqueRoleKeys.some((key) => ['msp_super_admin', 'engineer'].includes(key));
    return {
      accessItems,
      roleKeys: uniqueRoleKeys,
      labels: [...new Set(labels)],
      customerCount: new Set(accessItems.map((item) => item.customer_id)).size,
      hasMsp,
      hasKb,
    };
  }

  function renderUserAccessBadges(userId) {
    const summary = buildUserPortalRoleSummary(userId);
    const chips = [];
    if (summary.hasMsp) {
      chips.push('<span class="roles-chip roles-chip--msp">MSP Admin</span>');
    }
    if (summary.hasKb) {
      chips.push('<span class="roles-chip roles-chip--kb">Kennisbank</span>');
    }
    if (!chips.length) {
      chips.push('<span class="roles-chip roles-chip--none">Geen extra toegang</span>');
    }
    return `${chips.join('')}<div class="roles-chip-meta">${summary.customerCount} klanttoegang(en)</div>`;
  }

  function renderRolesSummary(users) {
    const host = document.getElementById('rolesSummaryPills');
    if (!host) return;
    const summaries = users.map((user) => buildUserPortalRoleSummary(user.id));
    const active = users.filter((user) => Number(user.is_active || 0) === 1).length;
    const msp = summaries.filter((summary) => summary.hasMsp).length;
    const kb = summaries.filter((summary) => summary.hasKb).length;
    const noCustomer = summaries.filter((summary) => summary.customerCount === 0).length;
    const chips = [
      { label: `${active} actief`, filter: 'all', tone: ['#dcfce7', '#166534'] },
      { label: `${msp} MSP Admin`, filter: 'msp', tone: ['#eff6ff', '#1d4ed8'] },
      { label: `${kb} Kennisbank`, filter: 'kb', tone: ['#ecfdf5', '#166534'] },
      { label: `${noCustomer} zonder klanttoegang`, filter: 'nocustomer', tone: ['#fff7ed', '#9a3412'] },
    ];
    host.innerHTML = chips.map((item) => `
      <button
        type="button"
        class="btn btn-secondary btn-sm roles-filter-chip"
        data-roles-filter="${global.escapeHtml(item.filter)}"
        style="background:${item.tone[0]};color:${item.tone[1]};"
      >${global.escapeHtml(item.label)}</button>
    `).join('');
    host.querySelectorAll('[data-roles-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        rolesFilterState.access = btn.dataset.rolesFilter || 'all';
        const select = document.getElementById('rolesAccessFilter');
        if (select) select.value = rolesFilterState.access;
        applyRolesFilters();
      });
    });
  }

  function renderRolesInsights(users) {
    const host = document.getElementById('rolesInsightCards');
    if (!host) return;
    const accessItems = Array.isArray(rolesData.access) ? rolesData.access : [];
    const customers = Array.isArray(rolesData.customers) ? rolesData.customers : [];
    const activeUsers = users.filter((user) => Number(user.is_active || 0) === 1).length;
    const linkedUsers = users.filter((user) => buildUserPortalRoleSummary(user.id).customerCount > 0).length;
    const unlinkedUsers = Math.max(0, users.length - linkedUsers);
    host.innerHTML = `
      <div class="ops-card"><small>Actieve gebruikers</small><strong>${global.escapeHtml(String(activeUsers))}</strong><p>Gebruikers met portaaltoegang.</p></div>
      <div class="ops-card"><small>Klantrollen</small><strong>${global.escapeHtml(String(accessItems.length))}</strong><p>Toegewezen klant/rol combinaties.</p></div>
      <div class="ops-card"><small>Zonder klantscope</small><strong>${global.escapeHtml(String(unlinkedUsers))}</strong><p>Gebruikers die nog geen klanttoegang hebben.</p></div>
      <div class="ops-card"><small>Klanten beschikbaar</small><strong>${global.escapeHtml(String(customers.length))}</strong><p>Klantrecords die aan gebruikers gekoppeld kunnen worden.</p></div>
    `;
  }

  function renderRolesWorkspaceGuidance(users) {
    const host = document.getElementById('rolesWorkspaceGuidance');
    if (!host) return;
    const accessItems = Array.isArray(rolesData.access) ? rolesData.access : [];
    const firstUser = users[0] || null;
    const firstCustomer = (rolesData.customers || [])[0] || null;
    if (!users.length) {
      host.innerHTML = `
        <div class="ops-detail-panel ops-detail-panel--flush">
          <div class="ops-detail-head"><h3 class="ops-detail-title-reset">Nog geen portaalgebruikers</h3></div>
          <p class="ops-detail-copy">Maak eerst een gebruiker aan om rollen en klanttoegang te beheren.</p>
        </div>
      `;
      return;
    }
    if (accessItems.length) {
      host.innerHTML = '';
      return;
    }
    host.innerHTML = `
      <div class="ops-detail-panel ops-detail-panel--flush">
        <div class="ops-detail-head"><h3 class="ops-detail-title-reset">Rollen-pagina is klaar voor gebruik</h3></div>
        <p class="ops-detail-copy ops-detail-copy--spaced">Er zijn nog geen klantrollen toegewezen. Open een gebruiker en koppel een klant met een portalrol om MSP-toegang echt actief te maken.</p>
        <div class="u-flex-row-wrap ops-detail-actions">
          ${firstUser ? `<button type="button" class="btn btn-secondary btn-sm" data-action="viewPortalUser" data-id="${global.escapeHtml(firstUser.id)}">Open ${global.escapeHtml(firstUser.display_name || firstUser.email || 'gebruiker')}</button>` : ''}
          ${firstCustomer ? `<button type="button" class="btn btn-secondary btn-sm" data-action="viewCustomer" data-id="${global.escapeHtml(firstCustomer.id)}">Open ${global.escapeHtml(firstCustomer.name || 'klant')}</button>` : ''}
          <button type="button" class="btn btn-secondary btn-sm" data-action="showSection" data-id="klantenbeheer">Klantenbeheer</button>
        </div>
      </div>
    `;
    global.bindActions?.(host);
  }

  function filterPortalUsers(users) {
    const query = String(rolesFilterState.query || '').trim().toLowerCase();
    const accessFilter = String(rolesFilterState.access || 'all');
    return users.filter((user) => {
      const summary = buildUserPortalRoleSummary(user.id);
      if (query) {
        const haystack = `${user.display_name || ''} ${user.email || ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (accessFilter === 'msp' && !summary.hasMsp) return false;
      if (accessFilter === 'kb' && !summary.hasKb) return false;
      if (accessFilter === 'none' && (summary.hasMsp || summary.hasKb)) return false;
      if (accessFilter === 'nocustomer' && summary.customerCount > 0) return false;
      return true;
    });
  }

  function applyRolesFilters() {
    renderRolesSummary(rolesData.users || []);
    renderRolesInsights(rolesData.users || []);
    renderRolesWorkspaceGuidance(rolesData.users || []);
    renderRolesTable(filterPortalUsers(rolesData.users || []));
  }

  async function loadRolesTab() {
    const tbody = document.getElementById('rolesUsersTableBody');
    const pillsEl = document.getElementById('rolesRolePills');
    if (tbody) tbody.innerHTML = '<tr class="u-table-loading-row-sm"><td colspan="8">Laden…</td></tr>';
    try {
      const [usersResp, rolesResp, customersResp, accessResp] = await Promise.all([
        global.apiFetchCached('/api/users', {}, global.CACHE_TTL.roles),
        global.apiFetchCached('/api/portal-roles', {}, global.CACHE_TTL.roles),
        global.apiFetchCached('/api/customers', {}, global.CACHE_TTL.customers),
        global.apiFetchCached('/api/user-access', {}, global.CACHE_TTL.roles),
      ]);
      rolesData.users = (usersResp && usersResp.items) || [];
      rolesData.roles = (rolesResp && rolesResp.items) || [];
      rolesData.customers = (customersResp && customersResp.items) || [];
      rolesData.access = (accessResp && accessResp.items) || [];

      if (pillsEl) {
        pillsEl.innerHTML = rolesData.roles.map((r) =>
          `<span class="roles-pill" title="${global.escapeHtml(r.description || '')}">${global.escapeHtml(r.label || r.role_key)}</span>`
        ).join('');
      }

      applyRolesFilters();
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr class="u-table-loading-row-sm"><td colspan="8" class="roles-error-text">Fout: ${global.escapeHtml(String(e))}</td></tr>`;
    }
  }

  function renderRolesTable(users) {
    const tbody = document.getElementById('rolesUsersTableBody');
    if (!tbody) return;
    const paging = global.paginateCollection ? global.paginateCollection('rolesUsersTable', users, 25) : { items: users, total: users.length };
    const pageItems = paging.items || users;
    if (!users.length) {
      tbody.innerHTML = '<tr class="u-table-loading-row-sm"><td colspan="8">Geen gebruikers gevonden.</td></tr>';
      global.renderCollectionPager?.({ key: 'rolesUsersTable', anchor: tbody, total: 0, pageSize: 25, onChange: () => renderRolesTable(users), label: 'gebruikers' });
      return;
    }
    tbody.innerHTML = pageItems.map((u) => `
      <tr>
        <td>${global.escapeHtml(u.display_name || '-')}</td>
        <td class="roles-cell-email">${global.escapeHtml(u.email || '-')}</td>
        <td>
          <select onchange="_updateUserRole('${global.escapeHtml(u.id)}', this.value)" class="roles-role-select">
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
            <option value="klant" ${u.role === 'klant' ? 'selected' : ''}>klant</option>
            <option value="security" ${u.role === 'security' ? 'selected' : ''}>security</option>
          </select>
        </td>
        <td>${renderUserAccessBadges(u.id)}</td>
        <td class="roles-cell-muted">${global.escapeHtml(u.linked_tenant_id || '-')}</td>
        <td>
          <span class="roles-status-pill ${u.is_active ? 'roles-status-pill--active' : 'roles-status-pill--inactive'}">${u.is_active ? 'Actief' : 'Inactief'}</span>
        </td>
        <td class="roles-cell-date">${global.formatDate(u.last_login_at || u.created_at)}</td>
        <td>
          <div class="results-row-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="viewPortalUser" data-id="${global.escapeHtml(u.id)}">Details</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="togglePortalUser" data-id="${global.escapeHtml(u.id)}" data-extra="${u.is_active ? '1' : '0'}">
              ${u.is_active ? 'Deactiveren' : 'Activeren'}
            </button>
          </div>
        </td>
      </tr>
    `).join('');
    global.bindActions(tbody);
    global.renderCollectionPager?.({ key: 'rolesUsersTable', anchor: tbody, total: users.length, pageSize: 25, onChange: () => renderRolesTable(users), label: 'gebruikers' });
  }

  function openPortalUserCreateForm() {
    if (typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    global.openSideRailDetail('Gebruikersbeheer', 'Nieuwe gebruiker');
    global.updateSideRailDetail('Nieuwe gebruiker', `
      <div class="bev-workbench-meta">Portaaltoegang toevoegen</div>
      <div class="results-actions-compose roles-compose-top">
        <div class="results-actions-form-grid">
          <label class="setting-item">
            <span>E-mail</span>
            <input type="email" id="portalUserEmailInput" placeholder="naam@denjoy.nl">
          </label>
          <label class="setting-item">
            <span>Naam</span>
            <input type="text" id="portalUserNameInput" placeholder="Volledige naam">
          </label>
          <label class="setting-item">
            <span>Rol</span>
            <select id="portalUserRoleInput">
              <option value="admin">admin</option>
              <option value="klant" selected>klant</option>
              <option value="security">security</option>
            </select>
          </label>
          <label class="setting-item">
            <span>Tijdelijk wachtwoord</span>
            <input type="text" id="portalUserPasswordInput" placeholder="Tijdelijk wachtwoord">
          </label>
        </div>
        <div class="results-actions-form-actions">
          <button type="button" class="btn btn-primary" id="portalUserCreateBtn">Gebruiker aanmaken</button>
        </div>
      </div>
    `);
    document.getElementById('portalUserCreateBtn')?.addEventListener('click', createPortalUserFromRail);
  }

  async function createPortalUserFromRail() {
    const payload = {
      email: document.getElementById('portalUserEmailInput')?.value?.trim() || '',
      display_name: document.getElementById('portalUserNameInput')?.value?.trim() || '',
      role: document.getElementById('portalUserRoleInput')?.value || 'klant',
      password: document.getElementById('portalUserPasswordInput')?.value || '',
    };
    if (!payload.email) {
      global.showToast('Vul een e-mailadres in.', 'warning');
      return;
    }
    if (!payload.password) {
      global.showToast('Vul een tijdelijk wachtwoord in.', 'warning');
      return;
    }
    if (!payload.display_name) payload.display_name = payload.email;
    try {
      await global.apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      global.showToast('Gebruiker aangemaakt.', 'success');
      await loadRolesTab();
    } catch (e) {
      global.showToast(`Fout: ${e.message || e}`, 'error');
    }
  }

  function computeEffectivePermissions(roleKeys) {
    const is = (key) => roleKeys.includes(key);
    const isSuperAdmin = is('msp_super_admin');
    const isEngineer = is('engineer');
    const isMonitor = is('monitoring_operator');
    const isBilling = is('billing_analyst');
    const hasAnyRole = roleKeys.length > 0;
    return [
      { module: 'Tenant overzicht',   view: hasAnyRole,                                     operate: isSuperAdmin || isEngineer,     approve: isSuperAdmin },
      { module: 'Security controls',  view: hasAnyRole,                                     operate: isSuperAdmin || isEngineer,     approve: isSuperAdmin },
      { module: 'Exchange / E-mail',  view: hasAnyRole,                                     operate: isSuperAdmin || isEngineer,     approve: isSuperAdmin },
      { module: 'Teams / SharePoint', view: hasAnyRole,                                     operate: isSuperAdmin || isEngineer,     approve: isSuperAdmin },
      { module: 'Intune',             view: hasAnyRole,                                     operate: isSuperAdmin || isEngineer,     approve: isSuperAdmin },
      { module: 'Monitoring',         view: isSuperAdmin || isEngineer || isMonitor,         operate: isSuperAdmin || isMonitor,      approve: false },
      { module: 'Facturering',        view: isSuperAdmin || isBilling,                      operate: isSuperAdmin,                   approve: false },
      { module: 'MSP Instellingen',  view: isSuperAdmin,                                    operate: isSuperAdmin,                   approve: false },
    ];
  }

  function renderEffectiveAccessSection(roleKeys) {
    const perms = computeEffectivePermissions(roleKeys);
    const yes = '<span class="roles-yn roles-yn--yes" aria-label="Ja">✓</span>';
    const no  = '<span class="roles-yn roles-yn--no" aria-label="Nee">—</span>';
    return `
      <div class="u-mt-md">
        <div class="roles-subheading">Effectieve toegang (Bekijk als)</div>
        <div class="roles-permissions-wrap">
          <table class="roles-permissions-table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Bekijken</th>
                <th>Beheren</th>
                <th>Goedkeuren</th>
              </tr>
            </thead>
            <tbody>
              ${perms.map((row) => `
                <tr>
                  <td>${global.escapeHtml(row.module)}</td>
                  <td>${row.view ? yes : no}</td>
                  <td>${row.operate ? yes : no}</td>
                  <td>${row.approve ? yes : no}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function openPortalUserDetail(userId) {
    const item = (rolesData.users || []).find((entry) => entry.id === userId);
    if (!item || typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    const roleMap = new Map((rolesData.roles || []).map((entry) => [entry.id, entry]));
    const customerMap = new Map((rolesData.customers || []).map((entry) => [entry.id, entry]));
    const accessSummary = buildUserPortalRoleSummary(userId);
    const accessItems = accessSummary.accessItems;
    global.openSideRailDetail('Portaalgebruiker', item.display_name || item.email || 'Gebruiker');
    global.updateSideRailDetail(item.display_name || item.email || 'Gebruiker', `
      <div class="bev-workbench-meta">${global.escapeHtml(item.role || 'klant')} · ${item.is_active ? 'actief' : 'inactief'}</div>
      <div class="bev-wb-list u-mt-md">
        <div class="bev-wb-item"><strong>Naam</strong><span>${global.escapeHtml(item.display_name || '-')}</span></div>
        <div class="bev-wb-item"><strong>E-mail</strong><span>${global.escapeHtml(item.email || '-')}</span></div>
        <div class="bev-wb-item"><strong>Rol</strong><span>${global.escapeHtml(item.role || 'klant')}</span></div>
        <div class="bev-wb-item"><strong>Vaste tenantkoppeling</strong><span>${global.escapeHtml(item.linked_tenant_id ? `${getTenantLabel(item.linked_tenant_id)} (${item.linked_tenant_id})` : 'Geen vaste tenantkoppeling')}</span></div>
        <div class="bev-wb-item"><strong>Laatste login</strong><span>${global.escapeHtml(global.formatDate(item.last_login_at || item.created_at))}</span></div>
        <div class="bev-wb-item"><strong>MSP toegang</strong><span>${accessSummary.hasMsp ? 'Ja' : 'Nee'}</span></div>
        <div class="bev-wb-item"><strong>Kennisbank</strong><span>${accessSummary.hasKb ? 'Ja' : 'Nee'}</span></div>
        <div class="bev-inline-actions roles-inline-actions">
          <button type="button" class="bev-inline-btn" id="portalUserToggleBtn">${item.is_active ? 'Deactiveren' : 'Activeren'}</button>
        </div>
      </div>
      <div class="u-mt-md">
        <div class="roles-subheading">Klantrollen</div>
        <div class="bev-wb-list">
          ${accessItems.length ? accessItems.map((access) => `
            <div class="bev-wb-item">
              <strong>${global.escapeHtml(customerMap.get(access.customer_id)?.name || access.customer_id || 'Klant')}</strong>
              <span>${global.escapeHtml(roleMap.get(access.portal_role_id)?.label || roleMap.get(access.portal_role_id)?.role_key || 'rol')}${parseAccessScope(access.scope).documentation_enabled ? ' · Documentatie' : ''}</span>
              <div class="bev-inline-actions roles-inline-actions">
                <select class="bev-inline-select roles-inline-select" data-role-update-select="${global.escapeHtml(access.customer_id)}">
                  ${(rolesData.roles || []).map((role) => `<option value="${global.escapeHtml(role.role_key)}" ${getRoleKeyByPortalRoleId(access.portal_role_id) === role.role_key ? 'selected' : ''}>${global.escapeHtml(role.label || role.role_key)}</option>`).join('')}
                </select>
                <label class="bev-inline-check roles-inline-check">
                  <input type="checkbox" data-docs-update-check="${global.escapeHtml(access.customer_id)}" ${parseAccessScope(access.scope).documentation_enabled ? 'checked' : ''}>
                  <span>Documentatie</span>
                </label>
                <button type="button" class="bev-inline-btn" data-action="updatePortalCustomerAccess" data-user-id="${global.escapeHtml(userId)}" data-customer-id="${global.escapeHtml(access.customer_id)}" data-role-key="${global.escapeHtml(getRoleKeyByPortalRoleId(access.portal_role_id))}">Wijzigen</button>
                <button type="button" class="bev-inline-btn" data-action="revokePortalCustomerAccess" data-user-id="${global.escapeHtml(userId)}" data-customer-id="${global.escapeHtml(access.customer_id)}">Intrekken</button>
              </div>
            </div>
          `).join('') : '<div class="bev-workbench-empty">Nog geen klantrollen toegewezen.</div>'}
        </div>
      </div>
      ${renderEffectiveAccessSection(accessSummary.roleKeys)}
      <div class="results-actions-compose u-mt-md">
        <div class="results-actions-form-grid">
          <label class="setting-item">
            <span>Klant</span>
            <select id="portalUserAccessCustomerInput">
              <option value="">Selecteer klant</option>
              ${(rolesData.customers || []).map((customer) => `<option value="${global.escapeHtml(customer.id)}">${global.escapeHtml(customer.name || customer.id)}</option>`).join('')}
            </select>
          </label>
          <label class="setting-item">
            <span>Portalrol</span>
            <select id="portalUserAccessRoleInput">
              <option value="">Selecteer rol</option>
              ${(rolesData.roles || []).map((role) => `<option value="${global.escapeHtml(role.role_key)}">${global.escapeHtml(role.label || role.role_key)}</option>`).join('')}
            </select>
          </label>
          <label class="setting-item">
            <span>Extra modules</span>
            <label class="checkbox-label roles-checkbox-inline">
              <input type="checkbox" id="portalUserAccessDocumentationInput">
              <span>Documentatie module activeren</span>
            </label>
          </label>
        </div>
        <div class="results-actions-form-actions">
          <button type="button" class="btn btn-primary" id="portalUserGrantAccessBtn">Klantrol toewijzen</button>
        </div>
      </div>
    `);
    document.getElementById('portalUserToggleBtn')?.addEventListener('click', () => toggleUserActive(item.id, !!item.is_active));
    document.getElementById('portalUserGrantAccessBtn')?.addEventListener('click', () => grantPortalCustomerAccess(item.id));
    document.querySelectorAll('[data-action="updatePortalCustomerAccess"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const customerId = btn.dataset.customerId;
        const select = document.querySelector(`[data-role-update-select="${customerId}"]`);
        const docsCheck = document.querySelector(`[data-docs-update-check="${customerId}"]`);
        updatePortalCustomerAccess(btn.dataset.userId, customerId, select?.value || '', btn.dataset.roleKey || '', !!docsCheck?.checked);
      });
    });
    document.querySelectorAll('[data-action="revokePortalCustomerAccess"]').forEach((btn) => {
      btn.addEventListener('click', () => revokePortalCustomerAccess(btn.dataset.userId, btn.dataset.customerId));
    });
  }

  async function grantPortalCustomerAccess(userId) {
    const customerId = document.getElementById('portalUserAccessCustomerInput')?.value || '';
    const roleKey = document.getElementById('portalUserAccessRoleInput')?.value || '';
    const documentationEnabled = !!document.getElementById('portalUserAccessDocumentationInput')?.checked;
    if (!customerId || !roleKey) {
      global.showToast('Selecteer eerst een klant en portalrol.', 'warning');
      return;
    }
    try {
      await global.apiFetch(`/api/customers/${customerId}/access/${userId}`, {
        method: 'POST',
        body: JSON.stringify({ role_key: roleKey, documentation_enabled: documentationEnabled }),
      });
      clearRolesAccessCaches(customerId);
      global.showToast('Klantrol toegewezen.', 'success');
      await loadRolesTab();
      openPortalUserDetail(userId);
    } catch (e) {
      global.showToast(`Fout bij toewijzen: ${e.message || e}`, 'error');
    }
  }

  async function updatePortalCustomerAccess(userId, customerId, roleKey, currentRoleKey = '', documentationEnabled = false) {
    if (!customerId || !roleKey) {
      global.showToast('Selecteer eerst een nieuwe portalrol.', 'warning');
      return;
    }
    if (roleKey === currentRoleKey) {
      global.showToast('Deze gebruiker heeft deze portalrol al.', 'info');
      return;
    }
    try {
      await global.apiFetch(`/api/customers/${customerId}/access/${userId}`, {
        method: 'POST',
        body: JSON.stringify({ role_key: roleKey, documentation_enabled: documentationEnabled }),
      });
      clearRolesAccessCaches(customerId);
      global.showToast('Klantrol gewijzigd.', 'success');
      await loadRolesTab();
      openPortalUserDetail(userId);
    } catch (e) {
      global.showToast(`Fout bij wijzigen: ${e.message || e}`, 'error');
    }
  }

  async function revokePortalCustomerAccess(userId, customerId) {
    try {
      await global.apiFetch(`/api/customers/${customerId}/access/${userId}`, {
        method: 'DELETE',
      });
      clearRolesAccessCaches(customerId);
      global.showToast('Klantrol ingetrokken.', 'success');
      await loadRolesTab();
      openPortalUserDetail(userId);
    } catch (e) {
      global.showToast(`Fout bij intrekken: ${e.message || e}`, 'error');
    }
  }

  async function updateUserRole(userId, newRole) {
    try {
      await global.apiFetch(`/api/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      global.showToast('Rol bijgewerkt.', 'success');
      await loadRolesTab();
    } catch (e) {
      global.showToast(`Fout bij bijwerken rol: ${e}`, 'error');
      loadRolesTab();
    }
  }

  async function toggleUserActive(userId, currentlyActive) {
    const action = currentlyActive ? 'deactiveren' : 'activeren';
    const item = (rolesData.users || []).find((entry) => entry.id === userId);
    if (typeof global.openSideRailDetail === 'function' && typeof global.updateSideRailDetail === 'function') {
      global.openSideRailDetail('Portaalgebruiker', `Gebruiker ${action}`);
      global.updateSideRailDetail(`Gebruiker ${action}`, `
        <div class="bev-workbench-meta">${global.escapeHtml(item?.display_name || item?.email || 'Gebruiker')}</div>
        <div class="bev-wb-list u-mt-md">
          <div class="bev-wb-item"><strong>Status nu</strong><span>${currentlyActive ? 'Actief' : 'Inactief'}</span></div>
          <div class="bev-wb-item"><strong>Nieuwe actie</strong><span>${action}</span></div>
        </div>
        <div class="results-actions-form-actions roles-actions-tight">
          <button type="button" class="btn btn-secondary" id="portalUserToggleConfirmBtn">${action === 'deactiveren' ? 'Deactiveren' : 'Activeren'}</button>
        </div>
      `);
      document.getElementById('portalUserToggleConfirmBtn')?.addEventListener('click', async () => {
        try {
          await global.apiFetch(`/api/users/${userId}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: currentlyActive ? 0 : 1 }),
          });
          global.showToast(`Gebruiker ${action === 'deactiveren' ? 'gedeactiveerd' : 'geactiveerd'}.`, 'success');
          await loadRolesTab();
        } catch (e) {
          global.showToast(`Fout: ${e}`, 'error');
        }
      });
      return;
    }
    if (typeof global.showToast === 'function') global.showToast(`Gebruiker ${action} vereist de rechterzijbalk-flow in deze portal.`, 'warning');
  }

  function initRolesFilters() {
    document.getElementById('rolesAccessFilter')?.addEventListener('change', (e) => {
      rolesFilterState.access = e.target.value || 'all';
      global.resetCollectionPager?.('rolesUsersTable');
      applyRolesFilters();
    });
    document.getElementById('rolesSearchInput')?.addEventListener('input', (e) => {
      rolesFilterState.query = e.target.value || '';
      global.resetCollectionPager?.('rolesUsersTable');
      applyRolesFilters();
    });
  }

  global.DenjoyMspRolesAccess = {
    loadRolesTab,
    openPortalUserCreateForm,
    openPortalUserDetail,
    _updateUserRole: updateUserRole,
    _toggleUserActive: toggleUserActive,
    _updatePortalCustomerAccess: updatePortalCustomerAccess,
    _revokePortalCustomerAccess: revokePortalCustomerAccess,
    initRolesFilters,
  };

  global.loadRolesTab = loadRolesTab;
  global.openPortalUserCreateForm = openPortalUserCreateForm;
  global.openPortalUserDetail = openPortalUserDetail;
  global._updateUserRole = updateUserRole;
  global._toggleUserActive = toggleUserActive;
  global._updatePortalCustomerAccess = updatePortalCustomerAccess;
  global._revokePortalCustomerAccess = revokePortalCustomerAccess;
}(window));
