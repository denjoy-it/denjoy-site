(function initDenjoyMspApprovals(global) {
  let approvalsCache = [];

  function getApprovalTenantFilter() {
    return document.getElementById('gdkTenantFilter')?.value || '';
  }

  function getTenantLabel(tenantId) {
    const tenants = Array.isArray(global.allTenants) ? global.allTenants : [];
    const tenant = tenants.find((item) => String(item.id || '') === String(tenantId || ''));
    return tenant?.customer_name || tenant?.tenant_name || tenantId || '-';
  }

  function getApprovalScopeLabel(item) {
    const metadata = item?.metadata || {};
    if (item?.tenant_id) return getTenantLabel(item.tenant_id);
    return metadata.customer_name || metadata.scope_label || metadata.user_label || item?.subsection || '-';
  }

  function populateApprovalTenantFilter() {
    const select = document.getElementById('gdkTenantFilter');
    if (!select) return;
    const current = select.value || '';
    const tenants = Array.isArray(global.allTenants) ? global.allTenants : [];
    select.innerHTML = ['<option value="">Alle tenants</option>'].concat(
      tenants.map((tenant) => `<option value="${global.escapeHtml(tenant.id || '')}">${global.escapeHtml(tenant.customer_name || tenant.tenant_name || tenant.id || 'Tenant')}</option>`)
    ).join('');
    select.value = current;
  }

  async function loadGoedkeuringen(statusFilter = 'pending') {
    const tbody = document.getElementById('gdkTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted,#6b7280);">Laden…</td></tr>';
    try {
      populateApprovalTenantFilter();
      const params = new URLSearchParams({ limit: '200' });
      if (statusFilter) params.set('status', statusFilter);
      const data = await global.apiFetch(`/api/approvals?${params}`);
      const tenantFilter = getApprovalTenantFilter();
      const items = ((data && data.items) || []).filter((item) => tenantFilter ? String(item.tenant_id || '') === tenantFilter : true);
      approvalsCache = items;
      const paging = global.paginateCollection ? global.paginateCollection('approvalsTable', items, 25) : { items, total: items.length };
      const pageItems = paging.items || items;
      if (!tbody) return;
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted,#6b7280);padding:2rem;">Geen goedkeuringen gevonden.</td></tr>';
        global.renderCollectionPager?.({ key: 'approvalsTable', anchor: tbody, total: 0, pageSize: 25, onChange: () => loadGoedkeuringen(statusFilter), label: 'goedkeuringen' });
        return;
      }
      const statusColor = { pending: '#fef3c7:#92400e', approved: '#dcfce7:#166534', rejected: '#fee2e2:#991b1b' };
      tbody.innerHTML = pageItems.map((a) => {
        const parts = (statusColor[a.approval_status] || '#f3f4f6:#374151').split(':');
        const bg = parts[0];
        const fg = parts[1];
        return `<tr>
          <td style="font-size:.82rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <strong>${global.escapeHtml(a.action_type || a.action_log_id || '-')}</strong>
            <div style="color:var(--text-muted,#6b7280);font-size:.74rem;">${global.escapeHtml(getApprovalScopeLabel(a))} · ${global.escapeHtml(a.subsection || a.section || '-')}</div>
          </td>
          <td><span style="padding:.2rem .6rem;border-radius:999px;font-size:.78rem;font-weight:600;background:${bg};color:${fg};">${global.escapeHtml(a.approval_status || '-')}</span></td>
          <td>${global.escapeHtml(a.requested_by || '-')}</td>
          <td>${global.formatDate(a.requested_at)}</td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;">${global.escapeHtml(a.reason || '-')}</td>
          <td>${global.escapeHtml(a.approved_by || '-')}</td>
          <td style="white-space:nowrap;">
            <button type="button" class="btn btn-secondary" data-action="viewApproval" data-id="${global.escapeHtml(a.id)}" style="font-size:.75rem;padding:.25rem .6rem;">Details</button>
            ${a.approval_status === 'pending' ? `
              <button type="button" class="btn btn-primary" data-action="decideApproval" data-id="${global.escapeHtml(a.id)}" data-extra="approve" style="font-size:.75rem;padding:.25rem .6rem;">Goedkeuren</button>
              <button type="button" class="btn btn-secondary" data-action="decideApproval" data-id="${global.escapeHtml(a.id)}" data-extra="reject" style="font-size:.75rem;padding:.25rem .6rem;color:#dc2626;">Afwijzen</button>
            ` : ''}
          </td>
        </tr>`;
      }).join('');
      global.bindActions(tbody);
      global.renderCollectionPager?.({ key: 'approvalsTable', anchor: tbody, total: items.length, pageSize: 25, onChange: () => loadGoedkeuringen(statusFilter), label: 'goedkeuringen' });
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#dc2626;padding:2rem;">Fout: ${global.escapeHtml(String(e))}</td></tr>`;
    }
  }

  function openApprovalDetail(approvalId) {
    const item = approvalsCache.find((entry) => entry.id === approvalId);
    if (!item || typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    const metadata = item.metadata || {};
    global.openSideRailDetail('Goedkeuring', item.action_type || item.action_log_id || 'Goedkeuring');
    const canDecide = item.approval_status === 'pending';
    global.updateSideRailDetail(item.action_type || item.action_log_id || 'Goedkeuring', `
      <div class="bev-workbench-meta">${global.escapeHtml(item.approval_status || 'pending')} · ${global.escapeHtml(item.requested_by || '-')}</div>
      <div class="bev-wb-list" style="margin-top:.9rem;">
        <div class="bev-wb-item"><strong>Actietype</strong><span>${global.escapeHtml(item.action_type || '-')}</span></div>
        <div class="bev-wb-item"><strong>Scope</strong><span>${global.escapeHtml(item.section || '-')} / ${global.escapeHtml(item.subsection || '-')}</span></div>
        <div class="bev-wb-item"><strong>Scope ID</strong><span>${global.escapeHtml(item.tenant_id || metadata.customer_id || '-')}</span></div>
        <div class="bev-wb-item"><strong>Scope label</strong><span>${global.escapeHtml(getApprovalScopeLabel(item))}</span></div>
        <div class="bev-wb-item"><strong>Aangevraagd door</strong><span>${global.escapeHtml(item.requested_by || '-')}</span></div>
        <div class="bev-wb-item"><strong>Aangevraagd op</strong><span>${global.formatDate(item.requested_at)}</span></div>
        <div class="bev-wb-item"><strong>Reden</strong><span>${global.escapeHtml(item.reason || 'Geen reden opgegeven')}</span></div>
        <div class="bev-wb-item"><strong>Afgehandeld door</strong><span>${global.escapeHtml(item.approved_by || '-')}</span></div>
        ${Object.keys(metadata).length ? `<div class="bev-wb-item"><strong>Metadata</strong><span>${global.escapeHtml(JSON.stringify(metadata))}</span></div>` : ''}
        <div class="bev-inline-actions" style="margin-top:.35rem;">
          ${item.tenant_id ? '<button type="button" class="bev-inline-btn" id="approvalRailTenantBtn">Open tenant</button><button type="button" class="bev-inline-btn" id="approvalRailKbChangesBtn">KB wijzigingslog</button><button type="button" class="bev-inline-btn" id="approvalRailKbAppsBtn">KB app registraties</button>' : ''}
          ${canDecide ? '<button type="button" class="bev-inline-btn" id="approvalRailApproveBtn">Goedkeuren</button><button type="button" class="bev-inline-btn" id="approvalRailRejectBtn">Afwijzen</button>' : ''}
        </div>
      </div>
    `);
    document.getElementById('approvalRailTenantBtn')?.addEventListener('click', async () => {
      await global.selectTenantFromPill?.(item.tenant_id, { skipRefresh: false });
      global.showSection?.('overview');
    });
    document.getElementById('approvalRailKbChangesBtn')?.addEventListener('click', () => global.openTenantKnowledgeBase(item.tenant_id, 'changelog', item.tenant_id));
    document.getElementById('approvalRailKbAppsBtn')?.addEventListener('click', () => global.openTenantKnowledgeBase(item.tenant_id, 'appregs', item.tenant_id));
    document.getElementById('approvalRailApproveBtn')?.addEventListener('click', () => openApprovalDecisionForm(item.id, 'approve'));
    document.getElementById('approvalRailRejectBtn')?.addEventListener('click', () => openApprovalDecisionForm(item.id, 'reject'));
  }

  function openApprovalDecisionForm(approvalId, decision) {
    const item = approvalsCache.find((entry) => entry.id === approvalId);
    if (!item || typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') {
      decideApproval(approvalId, decision, '');
      return;
    }
    const title = decision === 'approve' ? 'Goedkeuring bevestigen' : 'Afwijzing bevestigen';
    global.openSideRailDetail('Goedkeuring', title);
    global.updateSideRailDetail(title, `
      <div class="bev-workbench-meta">${global.escapeHtml(item.action_log_id || 'Actie')} · ${decision === 'approve' ? 'goedkeuren' : 'afwijzen'}</div>
      <div class="results-actions-compose" style="margin-top:.9rem;">
        <div class="results-actions-form-grid">
          <label class="setting-item">
            <span>Reden (optioneel)</span>
            <textarea id="approvalDecisionReasonInput" rows="5" placeholder="${decision === 'approve' ? 'Waarom keuren we dit goed?' : 'Waarom wijzen we dit af?'}"></textarea>
          </label>
        </div>
        <div class="results-actions-form-actions">
          <button type="button" class="btn ${decision === 'approve' ? 'btn-primary' : 'btn-secondary'}" id="approvalDecisionSubmitBtn">${decision === 'approve' ? 'Goedkeuren' : 'Afwijzen'}</button>
        </div>
      </div>
    `);
    document.getElementById('approvalDecisionSubmitBtn')?.addEventListener('click', () => {
      const reason = document.getElementById('approvalDecisionReasonInput')?.value?.trim() || '';
      decideApproval(approvalId, decision, reason);
    });
  }

  async function decideApproval(approvalId, decision, reason = '') {
    try {
      await global.apiFetch(`/api/approvals/${approvalId}/${decision === 'approve' ? 'approve' : 'reject'}`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      global.showToast(decision === 'approve' ? 'Goedgekeurd.' : 'Afgewezen.', 'success');
      const active = document.querySelector('.gdk-filter-btn.active');
      await loadGoedkeuringen(active ? (active.dataset.status || null) : 'pending');
    } catch (e) {
      global.showToast(`Fout: ${e}`, 'error');
    }
  }

  global.DenjoyMspApprovals = {
    loadGoedkeuringen,
    openApprovalDetail,
    _gdkDecide: decideApproval,
    populateApprovalTenantFilter,
  };

  global.loadGoedkeuringen = loadGoedkeuringen;
  global.openApprovalDetail = openApprovalDetail;
  global._gdkDecide = decideApproval;
  global.setApprovalTenantFilter = (tenantId = '') => {
    populateApprovalTenantFilter();
    const select = document.getElementById('gdkTenantFilter');
    if (select) select.value = tenantId || '';
  };
}(window));
