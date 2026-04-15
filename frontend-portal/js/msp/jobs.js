(function initDenjoyMspJobs(global) {
  const statusColors = {
    pending: ['#fef3c7', '#92400e'],
    running: ['#dbeafe', '#1e40af'],
    completed: ['#dcfce7', '#166534'],
    failed: ['#fee2e2', '#991b1b'],
    cancelled: ['#f3f4f6', '#6b7280'],
  };

  const jobLabels = {
    assessment_run: 'Assessment',
    snapshot_import: 'Snapshot import',
    findings_refresh: 'Findings refresh',
    guardian_sync: 'Guardian sync',
    retention_apply: 'Retentie',
    tenant_refresh: 'Tenant refresh',
  };

  let jobMonitorCache = [];

  function getTenantLabel(tenantId) {
    const tenants = Array.isArray(global.allTenants) ? global.allTenants : [];
    const tenant = tenants.find((item) => String(item.id || '') === String(tenantId || ''));
    return tenant?.customer_name || tenant?.tenant_name || tenantId || '-';
  }

  function populateJobTenantFilter() {
    const select = document.getElementById('jmTenantFilter');
    if (!select) return;
    const current = select.value || '';
    const tenants = Array.isArray(global.allTenants) ? global.allTenants : [];
    select.innerHTML = ['<option value="">Alle tenants</option>'].concat(
      tenants.map((tenant) => `<option value="${global.escapeHtml(tenant.id || '')}">${global.escapeHtml(tenant.customer_name || tenant.tenant_name || tenant.id || 'Tenant')}</option>`)
    ).join('');
    select.value = current;
  }

  function parseJobJson(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (_) { return {}; }
  }

  async function loadJobMonitor(statusFilter = null) {
    const tbody = document.getElementById('jmTableBody');
    const summary = document.getElementById('jmSummary');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted,#6b7280);">Laden…</td></tr>';
    try {
      populateJobTenantFilter();
      const params = new URLSearchParams({ limit: '200' });
      if (statusFilter) params.set('status', statusFilter);
      const data = await global.apiFetch(`/api/jobs?${params}`);
      const tenantFilter = document.getElementById('jmTenantFilter')?.value || '';
      const items = ((data && data.items) || []).filter((item) => tenantFilter ? String(item.tenant_id || '') === tenantFilter : true);
      jobMonitorCache = items;
      const paging = global.paginateCollection ? global.paginateCollection('jobsTable', items, 25) : { items, total: items.length };
      const pageItems = paging.items || items;

      if (summary) {
        const counts = {};
        items.forEach((j) => { counts[j.status] = (counts[j.status] || 0) + 1; });
        summary.innerHTML = Object.entries(counts).map(([st, cnt]) => {
          const tone = statusColors[st] || ['#f3f4f6', '#374151'];
          return `<span style="padding:.25rem .7rem;border-radius:999px;background:${tone[0]};color:${tone[1]};font-size:.8rem;font-weight:600;">${cnt} ${st}</span>`;
        }).join('');
      }

      if (!tbody) return;
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted,#6b7280);padding:2rem;">Geen jobs gevonden.</td></tr>';
        global.renderCollectionPager?.({ key: 'jobsTable', anchor: tbody, total: 0, pageSize: 25, onChange: () => loadJobMonitor(statusFilter), label: 'jobs' });
        return;
      }
      tbody.innerHTML = pageItems.map((j) => {
        const tone = statusColors[j.status] || ['#f3f4f6', '#374151'];
        const canCancel = j.status === 'pending' || j.status === 'failed';
        const payload = parseJobJson(j.payload_json);
        const result = parseJobJson(j.result_json);
        const note = payload.note || payload.scan_type || payload.run_mode || '';
        const resultHint = j.status === 'completed'
          ? (result.run_id ? `run ${String(result.run_id).slice(0, 8)}…` : result.findings_written != null ? `${result.findings_written} findings` : result.snapshots_written != null ? `${result.snapshots_written} snapshots` : '')
          : '';
        return `<tr>
          <td>
            <div style="font-family:monospace;font-size:.8rem;">${global.escapeHtml(j.job_type)}</div>
            <div style="font-size:.72rem;color:var(--text-muted,#6b7280);">${global.escapeHtml(jobLabels[j.job_type] || 'Taak')}</div>
          </td>
          <td style="font-size:.78rem;color:var(--text-muted,#6b7280);">${global.escapeHtml(getTenantLabel(j.tenant_id))}</td>
          <td><span style="padding:.2rem .6rem;border-radius:999px;font-size:.78rem;font-weight:600;background:${tone[0]};color:${tone[1]};">${j.status}</span></td>
          <td style="text-align:center;">${j.priority}</td>
          <td style="text-align:center;">${j.attempt_count}/${3}</td>
          <td style="font-size:.78rem;">${global.formatDate(j.scheduled_at)}</td>
          <td style="font-size:.78rem;">${j.completed_at ? global.formatDate(j.completed_at) : '-'}</td>
          <td style="font-size:.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${global.escapeHtml(j.error_message || note || resultHint || '')};">
            ${j.error_message ? `<span style="color:#dc2626;">${global.escapeHtml(j.error_message)}</span>` : `<span style="color:var(--text-muted,#6b7280);">${global.escapeHtml(note || resultHint || '-')}</span>`}
          </td>
          <td>
            <div class="results-row-actions">
              <button type="button" class="btn btn-secondary btn-sm" data-action="viewJob" data-id="${global.escapeHtml(j.id)}">Details</button>
              ${canCancel ? `<button type="button" class="btn btn-secondary btn-sm" data-action="cancelJob" data-id="${global.escapeHtml(j.id)}" style="color:#dc2626;">Annuleren</button>` : ''}
            </div>
          </td>
        </tr>`;
      }).join('');
      global.bindActions(tbody);
      global.renderCollectionPager?.({ key: 'jobsTable', anchor: tbody, total: items.length, pageSize: 25, onChange: () => loadJobMonitor(statusFilter), label: 'jobs' });
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#dc2626;padding:2rem;">Fout: ${global.escapeHtml(String(e))}</td></tr>`;
    }
  }

  function openJobDetail(jobId) {
    const item = jobMonitorCache.find((entry) => entry.id === jobId);
    if (!item || typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    const payload = parseJobJson(item.payload_json);
    const result = parseJobJson(item.result_json);
    global.openSideRailDetail('Job', jobLabels[item.job_type] || item.job_type || 'Job');
    global.updateSideRailDetail(jobLabels[item.job_type] || item.job_type || 'Job', `
      <div class="bev-workbench-meta">${global.escapeHtml(item.job_type || 'job')} · ${global.escapeHtml(item.status || 'pending')}</div>
      <div class="bev-wb-list" style="margin-top:.9rem;">
        <div class="bev-wb-item"><strong>Tenant</strong><span>${global.escapeHtml(item.tenant_id || '-')}</span></div>
        <div class="bev-wb-item"><strong>Tenant label</strong><span>${global.escapeHtml(getTenantLabel(item.tenant_id))}</span></div>
        <div class="bev-wb-item"><strong>Planning</strong><span>${global.formatDate(item.scheduled_at)} · prioriteit ${global.escapeHtml(String(item.priority || '-'))}</span></div>
        <div class="bev-wb-item"><strong>Pogingen</strong><span>${global.escapeHtml(String(item.attempt_count || 0))} / 3</span></div>
        <div class="bev-wb-item"><strong>Payload</strong><span>${global.escapeHtml(JSON.stringify(payload) || '{}')}</span></div>
        <div class="bev-wb-item"><strong>Resultaat</strong><span>${global.escapeHtml(JSON.stringify(result) || '{}')}</span></div>
        <div class="bev-wb-item"><strong>Foutmelding</strong><span>${global.escapeHtml(item.error_message || 'Geen foutmelding')}</span></div>
        <div class="bev-inline-actions" style="margin-top:.35rem;">
          ${item.tenant_id ? '<button type="button" class="bev-inline-btn" id="jobRailTenantBtn">Open tenant</button><button type="button" class="bev-inline-btn" id="jobRailKbAssetsBtn">KB apparaten</button><button type="button" class="bev-inline-btn" id="jobRailKbChangesBtn">KB wijzigingslog</button>' : ''}
          ${(item.status === 'pending' || item.status === 'failed') ? '<button type="button" class="bev-inline-btn" id="jobRailCancelBtn">Annuleren</button>' : ''}
        </div>
      </div>
    `);
    document.getElementById('jobRailTenantBtn')?.addEventListener('click', async () => {
      await global.selectTenantFromPill?.(item.tenant_id, { skipRefresh: false });
      global.showSection?.('overview');
    });
    document.getElementById('jobRailKbAssetsBtn')?.addEventListener('click', () => global.openTenantKnowledgeBase(item.tenant_id, 'assets', item.tenant_id));
    document.getElementById('jobRailKbChangesBtn')?.addEventListener('click', () => global.openTenantKnowledgeBase(item.tenant_id, 'changelog', item.tenant_id));
    document.getElementById('jobRailCancelBtn')?.addEventListener('click', () => cancelJob(item.id));
  }

  async function cancelJob(jobId) {
    if (typeof global.openSideRailDetail === 'function' && typeof global.updateSideRailDetail === 'function') {
      global.openSideRailDetail('Job Monitor', 'Job annuleren');
      global.updateSideRailDetail('Job annuleren', `
        <div class="bev-workbench-meta">Deze job wordt gemarkeerd als geannuleerd.</div>
        <div class="bev-wb-list" style="margin-top:.9rem;">
          <div class="bev-wb-item"><strong>Job</strong><span>${global.escapeHtml(String(jobId))}</span></div>
        </div>
        <div class="results-actions-form-actions" style="margin-top:.85rem;">
          <button type="button" class="btn btn-secondary" id="jobCancelConfirmBtn">Job annuleren</button>
        </div>
      `);
      document.getElementById('jobCancelConfirmBtn')?.addEventListener('click', () => cancelJobConfirmed(jobId), { once: true });
      return;
    }
    return cancelJobConfirmed(jobId);
  }

  async function cancelJobConfirmed(jobId) {
    try {
      await global.apiFetch(`/api/jobs/${jobId}/cancel`, { method: 'POST', body: '{}' });
      global.showToast('Job geannuleerd.', 'success');
      const active = document.querySelector('.jm-filter.active');
      await loadJobMonitor(active ? (active.dataset.status || null) : null);
    } catch (e) {
      global.showToast(`Fout: ${e}`, 'error');
    }
  }

  function openJobCreateForm(defaultJobType = 'assessment_run', initialValues = {}) {
    if (typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    const initialTenantId = initialValues.tenantId ?? global.currentTenantId ?? '';
    const initialLimit = initialValues.limit ?? 25;
    const initialKeepLatest = initialValues.keepLatest ?? 10;
    const initialKeepDays = initialValues.keepDays ?? 90;
    global.openSideRailDetail('Job Monitor', 'Taak aanmaken');
    global.updateSideRailDetail('Taak aanmaken', `
      <div class="bev-workbench-meta">Nieuwe achtergrondtaak voor MSP-operaties</div>
      <div class="results-actions-compose" style="margin-top:.9rem;">
        <div class="results-actions-form-grid">
          <label class="setting-item">
            <span>Job type</span>
            <select id="jobCreateTypeInput">
              <option value="assessment_run" ${defaultJobType === 'assessment_run' ? 'selected' : ''}>assessment_run</option>
              <option value="snapshot_import" ${defaultJobType === 'snapshot_import' ? 'selected' : ''}>snapshot_import</option>
              <option value="tenant_refresh" ${defaultJobType === 'tenant_refresh' ? 'selected' : ''}>tenant_refresh</option>
              <option value="guardian_sync" ${defaultJobType === 'guardian_sync' ? 'selected' : ''}>guardian_sync</option>
              <option value="findings_refresh" ${defaultJobType === 'findings_refresh' ? 'selected' : ''}>findings_refresh</option>
              <option value="retention_apply" ${defaultJobType === 'retention_apply' ? 'selected' : ''}>retention_apply</option>
            </select>
          </label>
          <label class="setting-item">
            <span>Tenant ID</span>
            <input type="text" id="jobCreateTenantInput" value="${global.escapeHtml(initialTenantId)}" placeholder="Leeg = globale taak">
          </label>
          <label class="setting-item" id="jobCreateLimitRow" style="display:${defaultJobType === 'guardian_sync' ? 'block' : 'none'};">
            <span>Guardian events limiet</span>
            <input type="number" id="jobCreateLimitInput" value="${global.escapeHtml(String(initialLimit))}" min="1" max="200">
          </label>
          <label class="setting-item" id="jobCreateKeepLatestRow" style="display:${defaultJobType === 'retention_apply' ? 'block' : 'none'};">
            <span>Bewaar laatste runs</span>
            <input type="number" id="jobCreateKeepLatestInput" value="${global.escapeHtml(String(initialKeepLatest))}" min="1">
          </label>
          <label class="setting-item" id="jobCreateKeepDaysRow" style="display:${defaultJobType === 'retention_apply' ? 'block' : 'none'};">
            <span>Bewaar dagen</span>
            <input type="number" id="jobCreateKeepDaysInput" value="${global.escapeHtml(String(initialKeepDays))}" min="1">
          </label>
        </div>
        <div class="results-actions-form-actions">
          <button type="button" class="btn btn-primary" id="jobCreateSubmitBtn">Taak aanmaken</button>
        </div>
      </div>
    `);
    const typeInput = document.getElementById('jobCreateTypeInput');
    const syncVisibility = () => {
      const selected = typeInput?.value || 'assessment_run';
      const limitRow = document.getElementById('jobCreateLimitRow');
      const keepLatestRow = document.getElementById('jobCreateKeepLatestRow');
      const keepDaysRow = document.getElementById('jobCreateKeepDaysRow');
      const tenantInput = document.getElementById('jobCreateTenantInput');
      if (limitRow) limitRow.style.display = selected === 'guardian_sync' ? 'block' : 'none';
      if (keepLatestRow) keepLatestRow.style.display = selected === 'retention_apply' ? 'block' : 'none';
      if (keepDaysRow) keepDaysRow.style.display = selected === 'retention_apply' ? 'block' : 'none';
      if (tenantInput) tenantInput.disabled = selected === 'retention_apply';
    };
    typeInput?.addEventListener('change', syncVisibility);
    syncVisibility();
    document.getElementById('jobCreateSubmitBtn')?.addEventListener('click', createFromRail);
  }

  async function createFromRail() {
    const jobType = document.getElementById('jobCreateTypeInput')?.value || 'assessment_run';
    const tenantIdRaw = document.getElementById('jobCreateTenantInput')?.value?.trim() || '';
    const payload = {};
    if (jobType === 'guardian_sync') {
      payload.limit = Number(document.getElementById('jobCreateLimitInput')?.value || 25);
    } else if (jobType === 'retention_apply') {
      payload.keep_latest = Number(document.getElementById('jobCreateKeepLatestInput')?.value || 10);
      payload.keep_days = Number(document.getElementById('jobCreateKeepDaysInput')?.value || 90);
    }
    if (jobType !== 'retention_apply' && !tenantIdRaw) {
      global.showToast('Vul een tenant ID in of kies een globale jobtype.', 'warning');
      return;
    }
    try {
      await global.apiFetch('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ job_type: jobType, tenant_id: jobType === 'retention_apply' ? null : tenantIdRaw || null, payload }),
      });
      global.showToast(`${jobLabels[jobType] || jobType} ingepland.`, 'success');
      await loadJobMonitor();
    } catch (e) {
      global.showToast(`Fout: ${e}`, 'error');
    }
  }

  function enqueueDefault() {
    openJobCreateForm('assessment_run');
  }

  function enqueueTyped(jobType) {
    const initialValues = {
      tenantId: global.currentTenantId || '',
      limit: 25,
      keepLatest: 10,
      keepDays: 90,
    };
    openJobCreateForm(jobType, initialValues);
  }

  global.DenjoyMspJobs = {
    loadJobMonitor,
    openJobDetail,
    _jmCancel: cancelJob,
    _jmCreateFromRail: createFromRail,
    _jmEnqueue: enqueueDefault,
    _jmEnqueueTyped: enqueueTyped,
    populateJobTenantFilter,
  };

  global._jmJobLabels = jobLabels;
  global.loadJobMonitor = loadJobMonitor;
  global.openJobDetail = openJobDetail;
  global.setJobMonitorTenantFilter = (tenantId = '') => {
    populateJobTenantFilter();
    const select = document.getElementById('jmTenantFilter');
    if (select) select.value = tenantId || '';
    document.querySelectorAll('.jm-filter').forEach((btn) => {
      btn.classList.toggle('active', (btn.dataset.status || '') === 'failed');
    });
  };
  global._jmCancel = cancelJob;
  global._jmCreateFromRail = createFromRail;
  global._jmEnqueue = enqueueDefault;
  global._jmEnqueueTyped = enqueueTyped;
}(window));
