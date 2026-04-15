(function initDenjoyMspAzureMenu(global) {
  'use strict';

  const state = {
    loaded: false,
    selectedTenantId: '',
    activeTab: 'overview',
    tenantSummaries: [],
  };

  function getTenantLabel(tenant) {
    return tenant?.customer_name || tenant?.tenant_name || tenant?.tenant_id || tenant?.id || '-';
  }

  function safeJsonParse(value, fallback = {}) {
    try {
      return JSON.parse(value || '{}');
    } catch (_) {
      return fallback;
    }
  }

  function renderVmActionPanel() {
    return `
      <div style="margin-top:.9rem;padding:.8rem .9rem;border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:#f8fafc;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;flex-wrap:wrap;">
          <div>
            <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#6b7280);">Guarded actions</div>
            <strong style="display:block;margin-top:.15rem;">Virtuele machine actie aanvragen</strong>
            <div style="font-size:.8rem;color:var(--text-muted,#6b7280);margin-top:.2rem;">Start, stop of herstart alleen via approval en auditspoor.</div>
          </div>
          <span style="font-size:.72rem;padding:.15rem .55rem;border-radius:999px;background:#fff7ed;color:#9a3412;border:1px solid #fdba74;">Goedkeuring vereist</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.55rem;margin-top:.75rem;">
          <label style="display:flex;flex-direction:column;gap:.2rem;font-size:.76rem;">
            <span>Subscription</span>
            <input type="text" id="azureVmSubscriptionInput" placeholder="subscription-id">
          </label>
          <label style="display:flex;flex-direction:column;gap:.2rem;font-size:.76rem;">
            <span>Resource group</span>
            <input type="text" id="azureVmResourceGroupInput" placeholder="resource-group">
          </label>
          <label style="display:flex;flex-direction:column;gap:.2rem;font-size:.76rem;">
            <span>VM naam</span>
            <input type="text" id="azureVmNameInput" placeholder="vm-naam">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:.2rem;font-size:.76rem;margin-top:.55rem;">
          <span>Reden / change-context</span>
          <textarea id="azureVmReasonInput" rows="3" placeholder="Waarom is deze actie nodig?"></textarea>
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.7rem;">
          <button type="button" class="btn btn-secondary btn-sm" data-azure-vm-op="start">Start VM</button>
          <button type="button" class="btn btn-secondary btn-sm" data-azure-vm-op="stop">Stop VM</button>
          <button type="button" class="btn btn-secondary btn-sm" data-azure-vm-op="restart">Herstart VM</button>
        </div>
      </div>
    `;
  }

  function bindVmActionEvents(tenantId) {
    document.querySelectorAll('[data-azure-vm-op]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const operation = btn.dataset.azureVmOp || 'restart';
        const payload = {
          subscription_id: document.getElementById('azureVmSubscriptionInput')?.value || '',
          resource_group: document.getElementById('azureVmResourceGroupInput')?.value || '',
          vm_name: document.getElementById('azureVmNameInput')?.value || '',
          reason: document.getElementById('azureVmReasonInput')?.value || '',
        };
        if (!payload.resource_group || !payload.vm_name) {
          global.showToast?.('Vul minimaal resource group en VM naam in.', 'warning');
          return;
        }
        btn.disabled = true;
        try {
          const response = await global.apiFetch(`/api/azure/${tenantId}/vm/${operation}`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          global.showToast?.(`Aanvraag ingediend. Approval ${response?.approval?.id || ''}`.trim(), 'success');
        } catch (error) {
          global.showToast?.(`Azure-actie aanvragen mislukt: ${error?.message || error}`, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function renderSummaryBadges(summaries) {
    const host = document.getElementById('azureSummaryBadges');
    if (!host) return;

    const totals = summaries.reduce((acc, item) => {
      acc.tenants += 1;
      acc.subscriptions += Number(item.subscription_count || 0);
      acc.resources += Number(item.resource_snapshot_count || 0);
      acc.alerts += Number(item.alert_snapshot_count || 0);
      acc.costs += Number(item.cost_snapshot_count || 0);
      acc.lighthouse += Number(item.lighthouse_onboarded || 0);
      return acc;
    }, { tenants: 0, subscriptions: 0, resources: 0, alerts: 0, costs: 0, lighthouse: 0 });

    host.innerHTML = `
      <span style="padding:.25rem .7rem;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:.8rem;">${totals.tenants} tenants</span>
      <span style="padding:.25rem .7rem;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:.8rem;">${totals.subscriptions} abonnementen</span>
      <span style="padding:.25rem .7rem;border-radius:999px;background:#ecfeff;color:#0e7490;font-size:.8rem;">${totals.resources} resources</span>
      <span style="padding:.25rem .7rem;border-radius:999px;background:#fff7ed;color:#9a3412;font-size:.8rem;">${totals.alerts} meldingen</span>
      <span style="padding:.25rem .7rem;border-radius:999px;background:#f5f3ff;color:#6d28d9;font-size:.8rem;">${totals.costs} kostensnapshots</span>
      <span style="padding:.25rem .7rem;border-radius:999px;background:#ecfdf5;color:#166534;font-size:.8rem;">${totals.lighthouse} lighthouse</span>
    `;
  }

  function renderTenantTable(summaries) {
    const tbody = document.getElementById('azureTenantsTableBody');
    if (!tbody) return;

    if (!summaries.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted,#6b7280);padding:2rem;">Geen Azure-data beschikbaar.</td></tr>';
      return;
    }

    tbody.innerHTML = summaries.map((item) => {
      const selected = item.tenant_id === state.selectedTenantId;
      return `
        <tr data-azure-tenant-row="${global.escapeHtml(item.tenant_id || '')}" style="cursor:pointer;${selected ? 'background:#f8fafc;' : ''}">
          <td>${global.escapeHtml(item.tenant_name || item.tenant_id || '-')}</td>
          <td>${Number(item.subscription_count || 0)}</td>
          <td>${Number(item.resource_snapshot_count || 0)}</td>
          <td>${Number(item.alert_snapshot_count || 0)}</td>
          <td>${Number(item.cost_snapshot_count || 0)}</td>
          <td>${Number(item.lighthouse_onboarded || 0)}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('[data-azure-tenant-row]').forEach((row) => {
      row.addEventListener('click', () => {
        state.selectedTenantId = row.dataset.azureTenantRow || '';
        syncTenantSelect();
        renderTenantTable(state.tenantSummaries);
        loadTenantDetail(state.activeTab);
      });
    });
  }

  function syncTenantSelect() {
    const select = document.getElementById('azureTenantSelect');
    if (!select) return;
    if (state.selectedTenantId) {
      select.value = state.selectedTenantId;
    }
  }

  function renderTabButtonState() {
    document.querySelectorAll('#azureTabButtons [data-azure-tab]').forEach((btn) => {
      const active = btn.dataset.azureTab === state.activeTab;
      btn.classList.toggle('btn-primary', active);
      btn.classList.toggle('btn-secondary', !active);
    });
  }

  async function fetchTenantSummaries(tenants) {
    const jobs = await Promise.allSettled(tenants.map(async (tenant) => {
      const summary = await (global.apiFetchCached
        ? global.apiFetchCached(`/api/azure/${tenant.id}/summary`, {}, global.CACHE_TTL.medium)
        : global.apiFetch(`/api/azure/${tenant.id}/summary`));
      return {
        ...summary,
        tenant_id: tenant.id,
        tenant_name: getTenantLabel(tenant),
      };
    }));

    return jobs
      .filter((job) => job.status === 'fulfilled')
      .map((job) => job.value);
  }

  async function loadTenantDetail(tabName) {
    const panel = document.getElementById('azureDetailPanel');
    if (!panel) return;
    const tenantId = state.selectedTenantId;
    if (!tenantId) {
      panel.innerHTML = 'Selecteer een tenant om Azure-details te laden.';
      return;
    }

    state.activeTab = tabName || 'overview';
    renderTabButtonState();
    panel.innerHTML = '<p style="color:var(--text-muted,#6b7280);">Details laden…</p>';

    try {
      if (state.activeTab === 'overview') {
        const data = await (global.apiFetchCached
          ? global.apiFetchCached(`/api/azure/${tenantId}/summary`, {}, global.CACHE_TTL.medium)
          : global.apiFetch(`/api/azure/${tenantId}/summary`));
        panel.innerHTML = `
          <div class="bev-wb-list">
            <div class="bev-wb-item"><strong>Abonnementen</strong><span>${Number(data.subscription_count || 0)}</span></div>
            <div class="bev-wb-item"><strong>Resources snapshots</strong><span>${Number(data.resource_snapshot_count || 0)}</span></div>
            <div class="bev-wb-item"><strong>Alerts snapshots</strong><span>${Number(data.alert_snapshot_count || 0)}</span></div>
            <div class="bev-wb-item"><strong>Kosten snapshots</strong><span>${Number(data.cost_snapshot_count || 0)}</span></div>
            <div class="bev-wb-item"><strong>Lighthouse onboarded</strong><span>${Number(data.lighthouse_onboarded || 0)}</span></div>
            <div class="bev-wb-item"><strong>Laatste kostenperiode</strong><span>${global.escapeHtml(data.latest_cost_period?.period_start || '-')} – ${global.escapeHtml(data.latest_cost_period?.period_end || '-')}</span></div>
          </div>
          ${renderVmActionPanel()}
        `;
        bindVmActionEvents(tenantId);
        return;
      }

      if (state.activeTab === 'subscriptions') {
        const data = await global.apiFetch(`/api/azure/${tenantId}/subscriptions`);
        const items = Array.isArray(data?.items) ? data.items : [];
        panel.innerHTML = items.length
          ? `<div class="bev-wb-list">${items.slice(0, 25).map((item) => `<div class="bev-wb-item"><strong>${global.escapeHtml(item.display_name || item.azure_subscription_id || item.subscription_id || '-')}</strong><span>${Number(item.lighthouse_onboarded || 0) === 1 ? 'Lighthouse' : 'Geen lighthouse'}</span></div>`).join('')}</div>`
          : '<p style="color:var(--text-muted,#6b7280);">Geen abonnementen gevonden.</p>';
        return;
      }

      if (state.activeTab === 'resources') {
        const data = await global.apiFetch(`/api/azure/${tenantId}/resources`);
        const items = Array.isArray(data?.items) ? data.items : [];
        panel.innerHTML = items.length
          ? `<div class="bev-wb-list">${items.slice(0, 25).map((item) => `<div class="bev-wb-item"><strong>${global.escapeHtml(item.generated_at || '-')}</strong><span>${global.escapeHtml(item.snapshot_type || 'snapshot')}</span></div>`).join('')}</div>`
          : '<p style="color:var(--text-muted,#6b7280);">Geen resource snapshots gevonden.</p>';
        return;
      }

      if (state.activeTab === 'alerts') {
        const data = await global.apiFetch(`/api/azure/${tenantId}/alerts`);
        const items = Array.isArray(data?.items) ? data.items : [];
        panel.innerHTML = items.length
          ? `<div class="bev-wb-list">${items.slice(0, 25).map((item) => `<div class="bev-wb-item"><strong>${global.escapeHtml(item.generated_at || '-')}</strong><span>${global.escapeHtml(item.alert_type || item.source || 'alert snapshot')}</span></div>`).join('')}</div>`
          : '<p style="color:var(--text-muted,#6b7280);">Geen alerts snapshots gevonden.</p>';
        return;
      }

      if (state.activeTab === 'costs') {
        const data = await global.apiFetch(`/api/azure/${tenantId}/costs`);
        const items = Array.isArray(data?.items) ? data.items : [];
        panel.innerHTML = items.length
          ? `<div class="bev-wb-list">${items.slice(0, 25).map((item) => {
              const summary = safeJsonParse(item.summary_json);
              const amount = Number(summary.total_cost || summary.totalCost || 0);
              const currency = summary.currency || 'EUR';
              return `<div class="bev-wb-item"><strong>${global.escapeHtml(item.period_start || '-')} – ${global.escapeHtml(item.period_end || '-')}</strong><span>${amount.toFixed(2)} ${global.escapeHtml(currency)}</span></div>`;
            }).join('')}</div>`
          : '<p style="color:var(--text-muted,#6b7280);">Geen kosten snapshots gevonden.</p>';
        return;
      }
    } catch (error) {
      panel.innerHTML = `<p style="color:#b91c1c;">Fout bij laden Azure detail: ${global.escapeHtml(error?.message || String(error))}</p>`;
    }
  }

  function bindStaticEvents() {
    if (state.loaded) return;

    document.getElementById('azureRefreshBtn')?.addEventListener('click', () => loadAzureSection(state.activeTab, true));
    document.getElementById('azureOpenCostsBtn')?.addEventListener('click', () => global.showSection?.('kosten'));

    document.getElementById('azureTenantSelect')?.addEventListener('change', (event) => {
      state.selectedTenantId = event.target.value || '';
      renderTenantTable(state.tenantSummaries);
      loadTenantDetail(state.activeTab);
    });

    document.querySelectorAll('#azureTabButtons [data-azure-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeTab = btn.dataset.azureTab || 'overview';
        loadTenantDetail(state.activeTab);
      });
    });

    state.loaded = true;
  }

  async function loadAzureSection(initialTab = 'overview', forceRefresh = false) {
    const tbody = document.getElementById('azureTenantsTableBody');
    const select = document.getElementById('azureTenantSelect');
    if (!tbody || !select) return;

    state.activeTab = initialTab || state.activeTab || 'overview';
    renderTabButtonState();
    bindStaticEvents();

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted,#6b7280);padding:2rem;">Azure data laden…</td></tr>';

    try {
      const tenantsResponse = forceRefresh
        ? await global.apiFetch('/api/tenants')
        : (global.apiFetchCached
          ? await global.apiFetchCached('/api/tenants', {}, global.CACHE_TTL.tenants)
          : await global.apiFetch('/api/tenants'));
      const tenants = Array.isArray(tenantsResponse?.items) ? tenantsResponse.items : [];
      const summaries = await fetchTenantSummaries(tenants);
      state.tenantSummaries = summaries;

      const selectedFromContext = global.currentTenantId || select.value || tenants[0]?.id || '';
      if (!state.selectedTenantId) state.selectedTenantId = selectedFromContext;

      select.innerHTML = tenants.length
        ? tenants.map((tenant) => `<option value="${global.escapeHtml(tenant.id)}">${global.escapeHtml(getTenantLabel(tenant))}</option>`).join('')
        : '<option value="">Geen tenants</option>';

      if (!tenants.some((tenant) => tenant.id === state.selectedTenantId)) {
        state.selectedTenantId = tenants[0]?.id || '';
      }

      syncTenantSelect();
      renderSummaryBadges(summaries);
      renderTenantTable(summaries);
      await loadTenantDetail(state.activeTab);
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#b91c1c;padding:2rem;">Fout bij laden Azure inzichten: ${global.escapeHtml(error?.message || String(error))}</td></tr>`;
    }
  }

  global.DenjoyMspAzureMenu = {
    loadAzureSection,
  };
  global.loadAzureSection = loadAzureSection;
})(window);
