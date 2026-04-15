(function initDenjoyMspActionsPanel(global) {
  'use strict';

  let actionsPanelCache = [];
  let editingActionId = null;
  let lastActionsPanelFilter = 'all';
  let lastActionsSeverityFilter = 'all';

  function resetFindingActionForm() {
    editingActionId = null;
    const values = {
      actionTitleInput: '',
      actionKeyInput: '',
      actionOwnerInput: '',
      actionDueDateInput: '',
      actionAssetNameInput: '',
      actionEditIdInput: '',
      actionNotesInput: '',
    };
    Object.entries(values).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });
    const severityEl = document.getElementById('actionSeverityInput');
    if (severityEl) severityEl.value = 'warning';
    const statusEl = document.getElementById('actionStatusInput');
    if (statusEl) statusEl.value = 'open';
    const saveBtn = document.getElementById('actionSaveBtn');
    if (saveBtn) saveBtn.textContent = 'Actie toevoegen';
    const cancelBtn = document.getElementById('actionCancelEditBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
  }

  function startEditFindingAction(actionId) {
    const item = actionsPanelCache.find((entry) => entry.id === actionId);
    if (!item) return;
    editingActionId = item.id;
    const map = {
      actionTitleInput: item.title || '',
      actionKeyInput: item.finding_key || '',
      actionOwnerInput: item.owner || '',
      actionDueDateInput: item.due_date || '',
      actionAssetNameInput: item.kb_asset_name || '',
      actionEditIdInput: item.id || '',
      actionNotesInput: item.notes || '',
    };
    Object.entries(map).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });
    const severityEl = document.getElementById('actionSeverityInput');
    if (severityEl) severityEl.value = item.severity || 'warning';
    const statusEl = document.getElementById('actionStatusInput');
    if (statusEl) statusEl.value = item.status || 'open';
    const saveBtn = document.getElementById('actionSaveBtn');
    if (saveBtn) saveBtn.textContent = 'Actie opslaan';
    const cancelBtn = document.getElementById('actionCancelEditBtn');
    if (cancelBtn) cancelBtn.style.display = '';
    document.getElementById('actionTitleInput')?.focus();
  }

  function openFindingActionDetail(actionId) {
    const item = actionsPanelCache.find((entry) => entry.id === actionId);
    if (!item || typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    global.openSideRailDetail('Actie', item.title || item.finding_key || 'Actie');
    const dueMeta = item.due_date
      ? `${global.escapeHtml(item.due_date)}${typeof item.days_until_due === 'number' ? ` · ${item.days_until_due < 0 ? `${Math.abs(item.days_until_due)} dag(en) te laat` : item.days_until_due === 0 ? 'Vandaag vervalt' : `${item.days_until_due} dag(en) resterend`}` : ''}`
      : 'Geen deadline';
    const severity = String(item.severity || 'warning').toLowerCase();
    const tone = severity === 'critical' ? 'error' : severity === 'warning' ? 'warn' : 'good';
    global.updateSideRailDetail(item.title || item.finding_key || 'Actie', typeof global.renderSideRailTemplate === 'function'
      ? global.renderSideRailTemplate({
          tone,
          statusLabel: item.status || 'open',
          summaryCards: [
            { label: 'Eigenaar', value: item.owner || 'Niet toegewezen', meta: 'actiehouder', tone: item.owner ? 'good' : 'warn' },
            { label: 'Ernst', value: item.severity || 'warning', meta: item.sla_label || 'SLA', tone },
            { label: 'Uiterste datum', value: item.due_date || 'Geen deadline', meta: dueMeta, tone: item.sla_state === 'overdue' ? 'error' : item.sla_state === 'due_soon' ? 'warn' : 'neutral' },
            { label: 'Asset', value: item.kb_asset_name || 'Geen gekoppeld asset', meta: item.finding_key || 'Actie', tone: 'neutral' },
          ],
          sections: [{
            title: 'Actiedetails',
            badge: item.status || 'open',
            tone,
            bodyHtml: `<div class="bev-wb-list">
              <div class="bev-wb-item"><strong>Notities</strong><span>${global.escapeHtml(item.notes || 'Geen extra notities')}</span></div>
            </div>`,
          }],
          actions: [{
            title: 'Status wijzigen',
            body: 'Werk de actiestatus bij of open de actie om velden te bewerken.',
            actionHtml: `
              <div class="bev-inline-actions">
                <button type="button" class="bev-inline-btn" id="actionRailEditBtn">Bewerken</button>
                <button type="button" class="bev-inline-btn" id="actionRailOpenBtn">Open zetten</button>
                <button type="button" class="bev-inline-btn" id="actionRailProgressBtn">In behandeling</button>
                <button type="button" class="bev-inline-btn" id="actionRailDoneBtn">Afgerond</button>
              </div>`,
          }],
        })
      : `<div class="bev-workbench-meta">${global.escapeHtml(item.finding_key || 'Actie')}</div>`);
    document.getElementById('actionRailEditBtn')?.addEventListener('click', () => startEditFindingAction(item.id));
    document.getElementById('actionRailOpenBtn')?.addEventListener('click', () => setActionStatus(item.id, 'open'));
    document.getElementById('actionRailProgressBtn')?.addEventListener('click', () => setActionStatus(item.id, 'in_progress'));
    document.getElementById('actionRailDoneBtn')?.addEventListener('click', () => setActionStatus(item.id, 'done'));
  }

  async function loadActionsPanel() {
    const tbody = document.getElementById('actionsTableBody');
    if (!tbody || !global.currentTenantId) return;
    const status = document.getElementById('actionsStatusFilter')?.value || 'all';
    const severity = document.getElementById('actionsSeverityFilter')?.value || 'all';
    if (lastActionsPanelFilter !== status) {
      global.resetCollectionPager?.('tenantActions');
      lastActionsPanelFilter = status;
    }
    if (lastActionsSeverityFilter !== severity) {
      global.resetCollectionPager?.('tenantActions');
      lastActionsSeverityFilter = severity;
    }
    try {
      const data = await global.apiFetch(`/api/tenants/${global.currentTenantId}/actions${global.toQuery({ status })}`);
      const items = (data.items || []).filter((item) => severity === 'all' ? true : String(item.severity || '') === severity);
      actionsPanelCache = items;
      global._actionsPanelCache = items;
      const paging = global.paginateCollection ? global.paginateCollection('tenantActions', items, 25) : { items, total: items.length };
      const pageItems = paging.items || items;
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nog geen acties voor deze tenant.</td></tr>';
        resetFindingActionForm();
        global.renderCollectionPager?.({ key: 'tenantActions', anchor: tbody, total: 0, pageSize: 25, onChange: () => loadActionsPanel(), label: 'acties' });
        return;
      }
      const dueLabel = (item) => {
        if (!item.due_date) return '<span style="color:var(--text-muted,#6b7280)">Geen datum</span>';
        const days = typeof item.days_until_due === 'number' ? item.days_until_due : null;
        const tone = item.sla_state === 'overdue'
          ? 'background:#fee2e2;color:#991b1b;'
          : item.sla_state === 'due_soon'
            ? 'background:#fef3c7;color:#92400e;'
            : item.sla_state === 'closed'
              ? 'background:#dcfce7;color:#166534;'
              : 'background:#eff6ff;color:#1d4ed8;';
        const meta = days == null
          ? (item.sla_label || '')
          : (days < 0 ? `${Math.abs(days)} dag(en) te laat` : days === 0 ? 'Vandaag vervalt' : `${days} dag(en) resterend`);
        return `
          <div style="display:flex;flex-direction:column;gap:.2rem;">
            <strong>${global.escapeHtml(item.due_date)}</strong>
            <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;${tone}">${global.escapeHtml(meta)}</span>
          </div>
        `;
      };
      tbody.innerHTML = pageItems.map((item) => `
        <tr>
          <td><strong>${global.escapeHtml(item.finding_key)}</strong><br><span>${global.escapeHtml(item.title)}</span></td>
          <td>${global.severityBadge(item.severity)}</td>
          <td>${global.escapeHtml(item.owner || '-')}</td>
          <td>${global.actionStatusBadge(item.status)}</td>
          <td>${dueLabel(item)}</td>
          <td>${global.escapeHtml(item.run_id ? item.run_id.slice(0, 8) : '-')}</td>
          <td>
            <div class="results-row-actions">
              <button class="btn btn-secondary btn-sm" data-action="viewFindingAction" data-id="${global.escapeHtml(item.id)}">Details</button>
              <button class="btn btn-secondary btn-sm" data-action="editFindingAction" data-id="${global.escapeHtml(item.id)}">Bewerken</button>
              <button class="btn btn-secondary btn-sm" data-action="setStatus" data-id="${global.escapeHtml(item.id)}" data-extra="open">Open</button>
              <button class="btn btn-secondary btn-sm" data-action="setStatus" data-id="${global.escapeHtml(item.id)}" data-extra="in_progress">In behandeling</button>
              <button class="btn btn-secondary btn-sm" data-action="setStatus" data-id="${global.escapeHtml(item.id)}" data-extra="done">Afgerond</button>
              <button class="btn btn-secondary btn-sm" data-action="setStatus" data-id="${global.escapeHtml(item.id)}" data-extra="accepted">Geaccepteerd</button>
            </div>
          </td>
        </tr>
      `).join('');
      global.bindActions(tbody);
      global.renderCollectionPager?.({ key: 'tenantActions', anchor: tbody, total: items.length, pageSize: 25, onChange: () => loadActionsPanel(), label: 'acties' });
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Acties laden mislukt: ${global.escapeHtml(error.message)}</td></tr>`;
    }
  }

  async function saveFindingAction() {
    if (!global.currentTenantId) {
      global.showToast?.('Selecteer eerst een tenant.', 'warning');
      return;
    }
    const payload = {
      tenant_id: global.currentTenantId,
      title: document.getElementById('actionTitleInput')?.value || '',
      finding_key: document.getElementById('actionKeyInput')?.value || '',
      severity: document.getElementById('actionSeverityInput')?.value || 'warning',
      owner: document.getElementById('actionOwnerInput')?.value || '',
      due_date: document.getElementById('actionDueDateInput')?.value || '',
      status: document.getElementById('actionStatusInput')?.value || 'open',
      notes: document.getElementById('actionNotesInput')?.value || '',
      kb_asset_name: document.getElementById('actionAssetNameInput')?.value || '',
    };
    if (!payload.title.trim()) {
      global.showToast?.('Vul een titel in.', 'warning');
      return;
    }
    if (editingActionId) {
      await global.apiFetch(`/api/actions/${editingActionId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      global.showToast?.('Actie bijgewerkt.', 'success');
    } else {
      await global.apiFetch('/api/actions', { method: 'POST', body: JSON.stringify(payload) });
      global.showToast?.('Actie toegevoegd.', 'success');
    }
    resetFindingActionForm();
    await loadActionsPanel();
  }

  async function setActionStatus(actionId, status) {
    await global.apiFetch(`/api/actions/${actionId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await loadActionsPanel();
    if (global._getCurrentSection?.() === 'mspcontrolcenter') {
      await global.loadMspActionInbox?.(true);
    }
    global.showToast?.(`Actiestatus bijgewerkt naar ${status}.`, 'success');
  }

  function setTenantActionFilters({ status = 'all', severity = 'all' } = {}) {
    const statusEl = document.getElementById('actionsStatusFilter');
    const severityEl = document.getElementById('actionsSeverityFilter');
    if (statusEl) statusEl.value = status;
    if (severityEl) severityEl.value = severity;
  }

  global.DenjoyMspActionsPanel = {
    resetFindingActionForm,
    startEditFindingAction,
    openFindingActionDetail,
    loadActionsPanel,
    saveFindingAction,
    setActionStatus,
    setTenantActionFilters,
  };

  global.resetFindingActionForm = resetFindingActionForm;
  global.startEditFindingAction = startEditFindingAction;
  global.openFindingActionDetail = openFindingActionDetail;
  global.loadActionsPanel = loadActionsPanel;
  global.saveFindingAction = saveFindingAction;
  global.createFindingAction = saveFindingAction;
  global.setActionStatus = setActionStatus;
  global.setTenantActionFilters = setTenantActionFilters;
})(window);
