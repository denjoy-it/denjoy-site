(function initDenjoyMspReportsManagement(global) {
  'use strict';

  function getReportsFilters() {
    return {
      tenant_id: global.currentTenantId || '',
      status: document.getElementById('reportsFilterStatus')?.value || '',
      archived: document.getElementById('reportsFilterArchived')?.value || 'exclude',
      from: document.getElementById('reportsFilterFrom')?.value || '',
      to: document.getElementById('reportsFilterTo')?.value || '',
      q: document.getElementById('reportsFilterSearch')?.value || '',
      limit: 300,
    };
  }

  async function loadReportsManagementPanel() {
    const tbody = document.getElementById('reportsManagementTableBody');
    if (!tbody || !global.currentTenantId) return;
    try {
      const filters = getReportsFilters();
      const data = await global.apiFetch(`/api/reports${global.toQuery(filters)}`);
      const items = data.items || [];
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Geen rapporten gevonden met huidige filters.</td></tr>';
        return;
      }
      tbody.innerHTML = items.map((report) => `
        <tr>
          <td>${global.formatDate(report.completed_at || report.started_at)}</td>
          <td>${global.escapeHtml(report.tenant_name || '-')}</td>
          <td>${global.statusBadge(report.status)}</td>
          <td>${report.is_archived ? '<span class="diff-neutral">Gearchiveerd</span>' : '<span class="diff-good">Actief</span>'}</td>
          <td>${global.escapeHtml(report.score_overall ?? '-')}</td>
          <td>${global.escapeHtml(report.critical_count ?? 0)} / ${global.escapeHtml(report.warning_count ?? 0)} / ${global.escapeHtml(report.info_count ?? 0)}</td>
          <td title="${global.escapeHtml(report.report_filename || '')}">${global.escapeHtml(report.report_filename || '-')}</td>
          <td>
            <div class="results-row-actions">
              <button class="btn btn-secondary btn-sm" data-action="viewRun" data-id="${global.escapeHtml(report.id)}">Details</button>
              <button class="btn btn-secondary btn-sm" data-action="openUrl" data-id="${global.escapeHtml(report.report_path)}">Open</button>
              ${report.is_archived
                ? `<button class="btn btn-secondary btn-sm" data-action="restoreRun" data-id="${global.escapeHtml(report.id)}">Herstel</button>`
                : `<button class="btn btn-secondary btn-sm" data-action="archiveRun" data-id="${global.escapeHtml(report.id)}">Archiveer</button>`}
              <button class="btn btn-warning btn-sm" data-action="deleteRun" data-id="${global.escapeHtml(report.id)}">Verwijder</button>
            </div>
          </td>
        </tr>
      `).join('');
      global.bindActions(tbody);
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Rapportbeheer laden mislukt: ${global.escapeHtml(error.message)}</td></tr>`;
    }
  }

  function clearReportsFilters() {
    const ids = ['reportsFilterSearch', 'reportsFilterStatus', 'reportsFilterArchived', 'reportsFilterFrom', 'reportsFilterTo'];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const archivedEl = document.getElementById('reportsFilterArchived');
    if (archivedEl) archivedEl.value = 'exclude';
    loadReportsManagementPanel();
  }

  function exportReportsCsv() {
    if (!global.currentTenantId) return;
    const url = `/api/reports/export.csv${global.toQuery(getReportsFilters())}`;
    window.open(url, '_blank');
  }

  async function archiveReportRun(runId) {
    if (typeof global.openSideRailDetail === 'function' && typeof global.updateSideRailDetail === 'function') {
      global.openSideRailDetail('Rapportbeheer', 'Rapport archiveren');
      global.updateSideRailDetail('Rapport archiveren', `
        <div class="bev-workbench-meta">Run ${global.escapeHtml(runId)}</div>
        <div class="results-actions-compose" style="margin-top:.9rem;">
          <div class="results-actions-form-grid">
            <label class="setting-item">
              <span>Reden (optioneel)</span>
              <textarea id="archiveRunReasonInput" rows="5" placeholder="Bijv. handmatig gearchiveerd na review">Handmatig gearchiveerd</textarea>
            </label>
          </div>
          <div class="results-actions-form-actions">
            <button type="button" class="btn btn-secondary" id="archiveRunSubmitBtn">Archiveer rapport</button>
          </div>
        </div>
      `);
      document.getElementById('archiveRunSubmitBtn')?.addEventListener('click', async () => {
        const reason = document.getElementById('archiveRunReasonInput')?.value || '';
        await global.apiFetch(`/api/reports/${runId}/archive`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
        await Promise.allSettled([global.loadReportsManagementPanel(), global.loadResultsSection()]);
        global.showToast?.('Rapport gearchiveerd.', 'success');
      });
      return;
    }
    await global.apiFetch(`/api/reports/${runId}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Handmatig gearchiveerd' }),
    });
    await Promise.allSettled([global.loadReportsManagementPanel(), global.loadResultsSection()]);
    global.showToast?.('Rapport gearchiveerd.', 'success');
  }

  async function restoreReportRun(runId) {
    await global.apiFetch(`/api/reports/${runId}/restore`, { method: 'POST', body: '{}' });
    await Promise.allSettled([global.loadReportsManagementPanel(), global.loadResultsSection()]);
    global.showToast?.('Rapport hersteld.', 'success');
  }

  async function deleteRunPermanently(runId) {
    if (typeof global.openSideRailDetail === 'function' && typeof global.updateSideRailDetail === 'function') {
      global.openSideRailDetail('Rapportbeheer', 'Run verwijderen');
      global.updateSideRailDetail('Run verwijderen', `
        <div class="bev-workbench-meta">Permanent verwijderen</div>
        <div class="bev-wb-list" style="margin-top:.9rem;">
          <div class="bev-wb-item"><strong>Run</strong><span>${global.escapeHtml(runId)}</span></div>
          <div class="bev-wb-item"><strong>Let op</strong><span>Dit verwijdert ook rapportbestanden en run-logs.</span></div>
        </div>
        <div class="results-actions-form-actions" style="margin-top:.85rem;">
          <button type="button" class="btn btn-secondary" id="deleteRunSubmitBtn" style="color:#dc2626;">Permanent verwijderen</button>
        </div>
      `);
      document.getElementById('deleteRunSubmitBtn')?.addEventListener('click', async () => {
        try {
          await global.apiFetch(`/api/runs/${runId}`, { method: 'DELETE' });
        } catch (_) {
          await global.apiFetch(`/api/runs/${runId}/delete`, { method: 'POST', body: '{}' });
        }
        await Promise.allSettled([global.loadOverview(), global.loadResultsSection(), global.loadReportsManagementPanel()]);
        global.showToast?.('Run permanent verwijderd.', 'success');
      });
      return;
    }
    global.showToast?.('Verwijderen vereist de rechterzijbalk-flow in deze portal.', 'warning');
  }

  async function stopRunById(runId) {
    if (typeof global.openSideRailDetail === 'function' && typeof global.updateSideRailDetail === 'function') {
      global.openSideRailDetail('Assessment run', 'Run stoppen');
      global.updateSideRailDetail('Run stoppen', `
        <div class="bev-workbench-meta">Stop actieve assessment run</div>
        <div class="bev-wb-list" style="margin-top:.9rem;">
          <div class="bev-wb-item"><strong>Run</strong><span>${global.escapeHtml(runId)}</span></div>
          <div class="bev-wb-item"><strong>Gevolg</strong><span>De run wordt gestopt en gemarkeerd als geannuleerd.</span></div>
        </div>
        <div class="results-actions-form-actions" style="margin-top:.85rem;">
          <button type="button" class="btn btn-secondary" id="stopRunSubmitBtn" style="color:#dc2626;">Run stoppen</button>
        </div>
      `);
      document.getElementById('stopRunSubmitBtn')?.addEventListener('click', async () => {
        try {
          await global.apiFetch(`/api/runs/${runId}/stop`, { method: 'POST', body: '{}' });
          global.showToast?.('Run gestopt.', 'success');
        } catch (error) {
          global.showToast?.(`Kon run niet stoppen: ${error.message || error}`, 'error');
        }
        await Promise.allSettled([global.loadOverview(), global.loadResultsSection(), global.loadReportsManagementPanel()]);
      });
      return;
    }
    global.showToast?.('Stoppen vereist de rechterzijbalk-flow in deze portal.', 'warning');
  }

  async function applyRetentionPolicy() {
    if (!global.currentTenantId) {
      global.showToast?.('Selecteer eerst een tenant.', 'warning');
      return;
    }
    const keepLatest = parseInt(document.getElementById('retentionKeepLatestInput')?.value || '10', 10);
    const keepDays = parseInt(document.getElementById('retentionKeepDaysInput')?.value || '90', 10);
    const scope = document.getElementById('retentionScopeSelect')?.value || 'tenant';

    const result = await global.apiFetch('/api/reports/retention/apply', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: scope === 'all' ? null : global.currentTenantId,
        keep_latest: Number.isFinite(keepLatest) ? keepLatest : 10,
        keep_days: Number.isFinite(keepDays) ? keepDays : 90,
      }),
    });
    global.showToast?.(`Retentie toegepast. Gescand: ${result.scanned}, gearchiveerd: ${result.archived}.`, 'success');
    await Promise.allSettled([global.loadReportsManagementPanel(), global.loadResultsSection(), global.loadOverview()]);
  }

  global.DenjoyMspReportsManagement = {
    getReportsFilters,
    loadReportsManagementPanel,
    clearReportsFilters,
    exportReportsCsv,
    archiveReportRun,
    restoreReportRun,
    deleteRunPermanently,
    stopRunById,
    applyRetentionPolicy,
  };

  global.getReportsFilters = getReportsFilters;
  global.loadReportsManagementPanel = loadReportsManagementPanel;
  global.clearReportsFilters = clearReportsFilters;
  global.exportReportsCsv = exportReportsCsv;
  global.archiveReportRun = archiveReportRun;
  global.restoreReportRun = restoreReportRun;
  global.deleteRunPermanently = deleteRunPermanently;
  global.stopRunById = stopRunById;
  global.applyRetentionPolicy = applyRetentionPolicy;
})(window);
