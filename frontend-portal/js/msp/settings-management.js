(function (global) {
  'use strict';

  function getCurrentTenantId() {
    return global.currentTenantId || null;
  }

  function setCurrentTenantId(value) {
    if (typeof global._setCurrentTenantId === 'function') {
      global._setCurrentTenantId(value || null);
      return;
    }
    global.currentTenantId = value || null;
  }

  function getCurrentSection() {
    if (typeof global._getCurrentSection === 'function') {
      return global._getCurrentSection() || global._currentSection || 'overview';
    }
    return global._currentSection || 'overview';
  }

  async function callOptionalAsync(handler, ...args) {
    if (typeof handler !== 'function') return;
    await handler(...args);
  }

  function renderTenantManagementTable(tenants) {
    const tbody = document.getElementById('tenantManagementTableBody');
    if (!tbody) return;
    const items = Array.isArray(tenants) ? tenants : [];
    const paging = global.paginateCollection
      ? global.paginateCollection('tenantManagement', items, 25)
      : { items, total: items.length };
    const pageItems = paging.items || items;
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Geen actieve tenants.</td></tr>';
      global.renderCollectionPager?.({
        key: 'tenantManagement',
        anchor: tbody,
        total: 0,
        pageSize: 25,
        onChange: () => renderTenantManagementTable(tenants),
        label: 'tenants',
      });
      return;
    }
    tbody.innerHTML = pageItems.map((tenant) => `
      <tr>
        <td>${global.escapeHtml(tenant.customer_name || '-')}</td>
        <td>${global.escapeHtml(tenant.tenant_name || '-')}</td>
        <td>${global.escapeHtml(tenant.tenant_guid || '-')}</td>
        <td>${global.escapeHtml(tenant.status || '-')}</td>
        <td>
          <div class="results-row-actions">
            <button class="btn btn-secondary btn-sm" data-action="selectTenant" data-id="${global.escapeHtml(tenant.id)}">Selecteer</button>
            <button class="btn btn-warning btn-sm" data-action="deleteTenant" data-id="${global.escapeHtml(tenant.id)}">Verwijder</button>
          </div>
        </td>
      </tr>
    `).join('');
    global.bindActions?.(tbody);
    global.renderCollectionPager?.({
      key: 'tenantManagement',
      anchor: tbody,
      total: items.length,
      pageSize: 25,
      onChange: () => renderTenantManagementTable(tenants),
      label: 'tenants',
    });
  }

  async function selectTenantFromManagement(tenantId) {
    setCurrentTenantId(tenantId);
    localStorage.setItem('local_m365_current_tenant', tenantId);
    const select = document.getElementById('tenantSelect');
    if (select) select.value = tenantId;
    global.updateTenantPill?.(global.allTenants || [], tenantId);
    global.updateHeroVisibility?.();
    global.updateWorkspaceHeader?.(getCurrentSection());
    await populateSettings();
    await callOptionalAsync(global.refreshTenantData);
    global.renderNavSignals?.();
  }

  async function deleteTenantFromManagement(tenantId) {
    const tenants = await global.apiFetch('/api/tenants');
    const target = (tenants.items || []).find((tenant) => tenant.id === tenantId);
    const label = target ? `${target.customer_name} / ${target.tenant_name}` : tenantId;
    if (typeof global.openSideRailDetail === 'function' && typeof global.updateSideRailDetail === 'function') {
      global.openSideRailDetail('Tenantbeheer', 'Tenant verwijderen');
      global.updateSideRailDetail('Tenant verwijderen', `
        <div class="bev-workbench-meta">Bevestig tenantverwijdering</div>
        <div class="results-actions-compose" style="margin-top:.9rem;">
          <div class="bev-wb-list">
            <div class="bev-wb-item"><strong>Tenant</strong><span>${global.escapeHtml(label)}</span></div>
          </div>
          <div class="results-actions-form-grid" style="margin-top:.85rem;">
            <label class="setting-item">
              <span>Verwijdermodus</span>
              <select id="tenantDeleteModeInput">
                <option value="soft" selected>Soft delete (inactief maken)</option>
                <option value="hard">Hard delete inclusief geschiedenis</option>
              </select>
            </label>
          </div>
          <div class="results-actions-form-actions">
            <button type="button" class="btn btn-secondary" id="tenantDeleteConfirmBtn" style="color:#dc2626;">Tenant verwijderen</button>
          </div>
        </div>
      `);
      document.getElementById('tenantDeleteConfirmBtn')?.addEventListener('click', async () => {
        const mode = document.getElementById('tenantDeleteModeInput')?.value || 'soft';
        try {
          await global.apiFetch(`/api/tenants/${tenantId}?mode=${mode}`, { method: 'DELETE' });
        } catch (error) {
          await global.apiFetch(`/api/tenants/${tenantId}/delete?mode=${mode}`, {
            method: 'POST',
            body: JSON.stringify({ mode }),
          });
        }
        if (getCurrentTenantId() === tenantId) {
          setCurrentTenantId(null);
          localStorage.removeItem('local_m365_current_tenant');
        }
        await callOptionalAsync(global.loadTenants);
        await populateSettings();
        await callOptionalAsync(global.refreshTenantData);
        global.showToast?.(`Tenant verwijderd (${mode}).`, 'success');
      });
      return;
    }
    global.showToast?.('Verwijderen vereist de rechterzijbalk-flow in deze portal.', 'warning');
  }

  function getCurrentTenantRecord() {
    const tenants = Array.isArray(global.allTenants) ? global.allTenants : [];
    return tenants.find((item) => item.id === getCurrentTenantId()) || null;
  }

  async function openCurrentTenantCustomerServices(serviceKey = '') {
    const tenant = getCurrentTenantRecord();
    const tenantId = getCurrentTenantId();
    let customerId = tenant?.customer_id || tenant?.customerId || '';
    const tenantNameCandidates = [
      tenant?.tenant_name,
      tenant?.tenantName,
      tenant?.customer_name,
      tenant?.customerName,
    ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
    if (!customerId && tenantId) {
      try {
        const fullTenant = await global.apiFetchCached(`/api/tenants/${tenantId}`, {}, global.CACHE_TTL.tenants);
        customerId = fullTenant?.customer_id || fullTenant?.customerId || '';
        if (!customerId) {
          tenantNameCandidates.push(
            String(fullTenant?.tenant_name || fullTenant?.tenantName || '').trim().toLowerCase(),
            String(fullTenant?.customer_name || fullTenant?.customerName || '').trim().toLowerCase(),
          );
        }
      } catch (_) {}
    }
    if (!customerId && tenantNameCandidates.length) {
      try {
        const customers = await global.apiFetchCached('/api/customers', {}, global.CACHE_TTL.customers);
        const items = Array.isArray(customers?.items) ? customers.items : [];
        const matched = items.find((item) => tenantNameCandidates.includes(String(item?.name || '').trim().toLowerCase()));
        customerId = matched?.id || '';
      } catch (_) {}
    }
    if (!customerId) {
      global.showToast?.('Voor deze tenant is nog geen klantkaart gekoppeld.', 'warning');
      return;
    }
    await callOptionalAsync(global.openCustomerOnboardingManager, customerId);
    if (serviceKey) {
      const select = document.getElementById('customerServiceKeyInput');
      if (select) {
        select.value = serviceKey;
        select.focus();
      }
    }
  }

  async function populateSettings() {
    try {
      global.localConfig = await global.apiFetchCached('/api/config', {}, global.CACHE_TTL.config);
      const modeEl = document.getElementById('runModeSelect');
      const scriptEl = document.getElementById('scriptPathInput');
      const tenantAuthEl = document.getElementById('authTenantIdInput');
      const clientIdAuthEl = document.getElementById('authClientIdInput');
      const certThumbEl = document.getElementById('authCertThumbInput');
      if (modeEl) modeEl.value = global.localConfig.default_run_mode || 'demo';
      if (scriptEl) scriptEl.value = global.localConfig.script_path || '';
      if (tenantAuthEl) tenantAuthEl.value = global.localConfig.auth_tenant_id || '';
      if (clientIdAuthEl) clientIdAuthEl.value = global.localConfig.auth_client_id || '';
      if (certThumbEl) certThumbEl.value = global.localConfig.auth_cert_thumbprint || '';
    } catch (error) {
      console.warn('Config laden mislukt', error);
    }

    const clientId = document.getElementById('clientIdInput');
    const tenantId = document.getElementById('tenantIdInput');
    if (clientId) clientId.value = 'Lokale modus';
    if (tenantId) tenantId.value = getCurrentTenantId() || '-';

    try {
      const integrationCfg = JSON.parse(localStorage.getItem('m365LocalIntegrations') || '{}');
      const webhookUrlEl = document.getElementById('integrationWebhookUrlInput');
      const webhookEnabledEl = document.getElementById('integrationWebhookEnabledInput');
      if (webhookUrlEl) webhookUrlEl.value = integrationCfg.webhook_url || '';
      if (webhookEnabledEl) webhookEnabledEl.value = integrationCfg.webhook_enabled || 'off';
    } catch (_) {}

    try {
      const tenantsData = await global.apiFetchCached('/api/tenants', {}, global.CACHE_TTL.tenants);
      renderTenantManagementTable(tenantsData.items || []);
    } catch (_) {}

    const currentTenantId = getCurrentTenantId();
    if (!currentTenantId) return;
    try {
      const tenant = await global.apiFetchCached(`/api/tenants/${currentTenantId}`, {}, global.CACHE_TTL.tenants);
      const statusEl = document.getElementById('tenantStatusInput');
      const riskEl = document.getElementById('tenantRiskProfileInput');
      const ownerPrimaryEl = document.getElementById('tenantOwnerPrimaryInput');
      const ownerBackupEl = document.getElementById('tenantOwnerBackupInput');
      const tagsEl = document.getElementById('tenantTagsInput');
      if (statusEl) statusEl.value = tenant.status || 'active';
      if (riskEl) riskEl.value = tenant.risk_profile || 'standard';
      if (ownerPrimaryEl) ownerPrimaryEl.value = tenant.owner_primary || '';
      if (ownerBackupEl) ownerBackupEl.value = tenant.owner_backup || '';
      if (tagsEl) tagsEl.value = tenant.tags_csv || '';
    } catch (error) {
      console.warn('Tenant governance laden mislukt', error);
    }
  }

  async function saveLocalConfig() {
    const clientSecret = document.getElementById('authClientSecretInput')?.value || '';
    const payload = {
      default_run_mode: document.getElementById('runModeSelect')?.value || 'demo',
      script_path: document.getElementById('scriptPathInput')?.value || '',
      auth_tenant_id: document.getElementById('authTenantIdInput')?.value || '',
      auth_client_id: document.getElementById('authClientIdInput')?.value || '',
      auth_cert_thumbprint: document.getElementById('authCertThumbInput')?.value || '',
      ...(clientSecret ? { auth_client_secret: clientSecret } : {}),
    };
    global.localConfig = await global.apiFetch('/api/config', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const secretEl = document.getElementById('authClientSecretInput');
    if (secretEl) secretEl.value = '';
    global.showToast?.('Configuratie opgeslagen.', 'success');
  }

  async function createTenantFromForm() {
    const payload = {
      customer_name: document.getElementById('newCustomerNameInput')?.value || '',
      tenant_name: document.getElementById('newTenantNameInput')?.value || '',
      tenant_guid: document.getElementById('newTenantGuidInput')?.value || '',
      status: document.getElementById('tenantStatusInput')?.value || 'active',
      risk_profile: document.getElementById('tenantRiskProfileInput')?.value || 'standard',
      owner_primary: document.getElementById('tenantOwnerPrimaryInput')?.value || '',
      owner_backup: document.getElementById('tenantOwnerBackupInput')?.value || '',
      tags_csv: document.getElementById('tenantTagsInput')?.value || '',
    };
    if (!payload.customer_name && !payload.tenant_name) {
      global.showToast?.('Vul minimaal klantnaam of tenant naam in.', 'warning');
      return;
    }
    await global.apiFetch('/api/tenants', { method: 'POST', body: JSON.stringify(payload) });
    await callOptionalAsync(global.loadTenants);
    await callOptionalAsync(global.refreshTenantData);
    await populateSettings();
    ['newCustomerNameInput', 'newTenantNameInput', 'newTenantGuidInput'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    global.showToast?.('Tenant aangemaakt.', 'success');
  }

  async function saveTenantGovernance() {
    const currentTenantId = getCurrentTenantId();
    if (!currentTenantId) {
      global.showToast?.('Geen tenant geselecteerd.', 'warning');
      return;
    }
    const payload = {
      status: document.getElementById('tenantStatusInput')?.value || 'active',
      risk_profile: document.getElementById('tenantRiskProfileInput')?.value || 'standard',
      owner_primary: document.getElementById('tenantOwnerPrimaryInput')?.value || '',
      owner_backup: document.getElementById('tenantOwnerBackupInput')?.value || '',
      tags_csv: document.getElementById('tenantTagsInput')?.value || '',
    };
    await global.apiFetch(`/api/tenants/${currentTenantId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    await callOptionalAsync(global.loadTenants);
    await callOptionalAsync(global.refreshTenantData);
    await populateSettings();
    global.showToast?.('Tenant governance opgeslagen.', 'success');
  }

  function saveIntegrationSettings() {
    const payload = {
      webhook_url: document.getElementById('integrationWebhookUrlInput')?.value || '',
      webhook_enabled: document.getElementById('integrationWebhookEnabledInput')?.value || 'off',
    };
    localStorage.setItem('m365LocalIntegrations', JSON.stringify(payload));
    global.showToast?.('Integratie-instellingen opgeslagen.', 'success');
  }

  async function applySettingsRetentionPolicy() {
    const currentTenantId = getCurrentTenantId();
    if (!currentTenantId) {
      global.showToast?.('Selecteer eerst een tenant.', 'warning');
      return;
    }
    const keepLatest = parseInt(document.getElementById('settingsRetentionKeepLatestInput')?.value || '10', 10);
    const keepDays = parseInt(document.getElementById('settingsRetentionKeepDaysInput')?.value || '90', 10);
    const scope = document.getElementById('settingsRetentionScopeSelect')?.value || 'tenant';
    const result = await global.apiFetch('/api/reports/retention/apply', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: scope === 'all' ? null : currentTenantId,
        keep_latest: Number.isFinite(keepLatest) ? keepLatest : 10,
        keep_days: Number.isFinite(keepDays) ? keepDays : 90,
      }),
    });
    global.showToast?.(`Retentie toegepast. Gescand: ${result.scanned}, gearchiveerd: ${result.archived}.`, 'success');
    await callOptionalAsync(global.refreshTenantData);
  }

  function setupSettingsActions() {
    const saveBtn = document.getElementById('saveLocalConfigButton');
    if (saveBtn) saveBtn.addEventListener('click', saveLocalConfig);
    const createBtn = document.getElementById('createTenantButton');
    if (createBtn) createBtn.addEventListener('click', createTenantFromForm);
    const governanceBtn = document.getElementById('saveTenantGovernanceButton');
    if (governanceBtn) governanceBtn.addEventListener('click', saveTenantGovernance);
    const saveIntegrationBtn = document.getElementById('saveIntegrationSettingsButton');
    if (saveIntegrationBtn) saveIntegrationBtn.addEventListener('click', saveIntegrationSettings);
    const applyRetentionBtn = document.getElementById('applySettingsRetentionButton');
    if (applyRetentionBtn) applyRetentionBtn.addEventListener('click', applySettingsRetentionPolicy);
    const refreshTenantMgmtBtn = document.getElementById('refreshTenantManagementButton');
    if (refreshTenantMgmtBtn) {
      refreshTenantMgmtBtn.addEventListener('click', async () => {
        const tenantsData = await global.apiFetch('/api/tenants');
        renderTenantManagementTable(tenantsData.items || []);
      });
    }

    const regenBtn = document.getElementById('regenerateAppButton');
    if (regenBtn) {
      regenBtn.textContent = 'Herlaad dashboard';
      regenBtn.addEventListener('click', () => global.location.reload());
    }
  }

  const api = {
    getCurrentTenantRecord,
    openCurrentTenantCustomerServices,
    renderTenantManagementTable,
    selectTenantFromManagement,
    deleteTenantFromManagement,
    populateSettings,
    saveLocalConfig,
    createTenantFromForm,
    saveTenantGovernance,
    saveIntegrationSettings,
    applySettingsRetentionPolicy,
    setupSettingsActions,
  };

  global.DenjoyMspSettingsManagement = api;
  global.getCurrentTenantRecord = getCurrentTenantRecord;
  global.openCurrentTenantCustomerServices = openCurrentTenantCustomerServices;
  global.renderTenantManagementTable = renderTenantManagementTable;
  global.selectTenantFromManagement = selectTenantFromManagement;
  global.deleteTenantFromManagement = deleteTenantFromManagement;
  global.populateSettings = populateSettings;
  global.saveLocalConfig = saveLocalConfig;
  global.createTenantFromForm = createTenantFromForm;
  global.saveTenantGovernance = saveTenantGovernance;
  global.saveIntegrationSettings = saveIntegrationSettings;
  global.applySettingsRetentionPolicy = applySettingsRetentionPolicy;
  global.setupSettingsActions = setupSettingsActions;
})(window);
