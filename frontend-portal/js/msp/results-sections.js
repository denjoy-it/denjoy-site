(function (global) {
  const apiFetch = global.apiFetch || (async () => ({}));
  const apiFetchCached = global.apiFetchCached || (async () => ({}));
  const CACHE_TTL = global.CACHE_TTL || {};
  const escapeHtml = global.escapeHtml || ((v) => String(v ?? ''));
  const formatDate = global.formatDate || ((v) => (v ? String(v) : '-'));
  const statusBadge = global.statusBadge || ((status) => String(status ?? '-'));
  const formatPhaseList = global.formatPhaseList || ((phases) => Array.isArray(phases) ? phases.join(', ') : '-');
  const deltaText = global.deltaText || ((v) => String(v ?? '-'));
  const bindActions = global.bindActions || (() => {});
  const showToast = global.showToast || (() => {});

  function invokeIfFn(handler, ...args) {
    if (typeof handler !== 'function') return;
    return handler(...args);
  }

  function renderContext(sectionName) {
    global.DenjoyShellContextRail?.renderContextRail?.(sectionName);
    global.renderNavSignals?.();
  }

  async function loadHistorySection() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    const tenantId = global.currentTenantId || null;
    if (!tenantId) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Geen tenant geselecteerd</td></tr>';
      return;
    }
    try {
      const data = await apiFetchCached(`/api/tenants/${tenantId}/runs`, {}, CACHE_TTL.runs);
      const runs = data.items || [];
      if (!runs.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Geen geschiedenis beschikbaar</td></tr>';
        return;
      }
      tbody.innerHTML = runs.map((r) => `
      <tr>
        <td>${formatDate(r.completed_at || r.started_at)}</td>
        <td>${r.tenant_name || '-'}</td>
        <td>${(r.phases || []).join(', ') || '-'}</td>
        <td>${statusBadge(r.status)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" data-action="viewRun" data-id="${escapeHtml(r.id)}">Details</button>
          ${r.report_path ? `<button class="btn btn-secondary btn-sm" data-action="openUrl" data-id="${escapeHtml(r.report_path)}">Rapport</button>` : ''}
          ${r.is_archived ? `<button class="btn btn-secondary btn-sm" data-action="restoreRun" data-id="${escapeHtml(r.id)}">Herstel</button>` : `<button class="btn btn-secondary btn-sm" data-action="archiveRun" data-id="${escapeHtml(r.id)}">Archiveer</button>`}
          <button class="btn btn-warning btn-sm" data-action="deleteRun" data-id="${escapeHtml(r.id)}">Verwijder</button>
        </td>
      </tr>`).join('');
      invokeIfFn(bindActions, tbody);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Geschiedenis laden mislukt: ${escapeHtml(String(e.message || e))}</td></tr>`;
    }
  }

  async function loadResultsSection() {
    const emptyEl = document.getElementById('resultsViewerEmpty');
    const contentEl = document.getElementById('resultsViewerContent');
    const tenantId = global.currentTenantId || null;

    function showEmpty(msg) {
      if (emptyEl) {
        emptyEl.style.display = '';
        emptyEl.textContent = msg;
      }
      if (contentEl) contentEl.style.display = 'none';
    }

    if (!tenantId) {
      showEmpty('Geen tenant geselecteerd.');
      renderContext('results');
      return;
    }

    try {
      const runs = await apiFetchCached(`/api/tenants/${tenantId}/runs`, {}, CACHE_TTL.runs);
      const allRuns = runs.items || [];
      const latest = allRuns.find((r) => !!(r.snapshot_path || r.report_path));

      if (!latest) {
        showEmpty('Start een assessment om resultaten te zien.');
        renderContext('results');
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';
      if (contentEl) contentEl.style.display = '';

      const reportRuns = allRuns.filter((r) => !!(r.snapshot_path || r.report_path)).slice(0, 8);
      const completedRuns = allRuns.filter((r) => r.status === 'completed').length;
      const failedRuns = allRuns.filter((r) => r.status === 'failed').length;

      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      const setHtml = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = value;
      };

      setText('kpiScore', latest.score_overall ?? '—');
      setText('kpiCritical', latest.critical_count ?? 0);
      setText('kpiWarning', latest.warning_count ?? 0);
      setText('kpiInfo', latest.info_count ?? 0);

      setText('metaRunId', latest.id);
      setHtml('metaStatus', statusBadge(latest.status));
      setText('metaStarted', formatDate(latest.started_at));
      setText('metaCompleted', formatDate(latest.completed_at));
      setText('metaRunMode', latest.run_mode || '—');
      setText('metaPhases', formatPhaseList(latest.phases));
      setText('metaTenantName', latest.tenant_name || '—');
      setText('metaCustomer', latest.customer_name || '—');
      setText('metaTotalRuns', allRuns.length);
      setText('metaCompletedRuns', completedRuns);
      setText('metaFailedRuns', failedRuns);
      setText('metaReportRuns', reportRuns.length);

      setText('resultsRunCount', reportRuns.length);
      setText('resultsRunsCount', `${reportRuns.length} item(s)`);
      setText('resultsTabCount', reportRuns.length);

      if (typeof global.initResultsViewer === 'function') {
        global.initResultsViewer('resultsViewerContainer', latest.report_path || '', {
          tenantId,
          latestRun: latest,
          reportRuns,
          summary: {
            totalRuns: allRuns.length,
            completedRuns,
            failedRuns,
            reportRuns: reportRuns.length,
          },
          latestReportUrl: latest.report_path || '',
          latestCsvUrl: latest.report_path ? latest.report_path.replace(/\/[^/]+\.html$/, '') + '/_Assessment-Summary.csv' : '',
          formatDate,
          formatPhaseList,
          statusBadge,
          escapeHtml,
        });
      }
      renderContext('results');
    } catch (e) {
      showEmpty(`Rapportviewer laden mislukt: ${escapeHtml(String(e.message || e))}`);
      renderContext('results');
    }
  }

  async function loadRunDiffPanel() {
    const el = document.getElementById('runDiffContainer');
    const tenantId = global.currentTenantId || null;
    if (!el || !tenantId) return;
    try {
      const diff = await apiFetchCached(`/api/tenants/${tenantId}/runs/diff`, {}, CACHE_TTL.runs);
      if (!diff.hasDiff) {
        el.innerHTML = '<div class="empty-state">Nog onvoldoende runs voor vergelijking (minimaal 2 rapport-runs nodig).</div>';
        return;
      }
      el.innerHTML = `
      <div class="diff-grid">
        <div class="diff-card"><span>Trend</span><strong>${escapeHtml(diff.trend)}</strong></div>
        <div class="diff-card"><span>Score Δ</span><strong>${deltaText(diff.delta.score_overall, false)}</strong></div>
        <div class="diff-card"><span>Kritiek Δ</span><strong>${deltaText(diff.delta.critical_count, true)}</strong></div>
        <div class="diff-card"><span>Waarschuwing Δ</span><strong>${deltaText(diff.delta.warning_count, true)}</strong></div>
        <div class="diff-card"><span>Info Δ</span><strong>${deltaText(diff.delta.info_count, true)}</strong></div>
      </div>
      <div class="diff-footnote">
        Van ${formatDate(diff.from.completed_at)} naar ${formatDate(diff.to.completed_at)}
      </div>
    `;
    } catch (e) {
      el.innerHTML = `<div class="empty-state">Vergelijking mislukt: ${escapeHtml(e.message)}</div>`;
    }
  }

  async function viewRunDetails(runId) {
    const [run, logs] = await Promise.all([
      apiFetch(`/api/runs/${runId}`),
      apiFetch(`/api/runs/${runId}/logs`),
    ]);
    const logLines = Array.isArray(logs.lines) ? logs.lines.slice(-25) : [];
    if (typeof global.openSideRailDetail === 'function' && typeof global.updateSideRailDetail === 'function') {
      global.openSideRailDetail('Assessment run', run.id || 'Run');
      const status = String(run.status || 'unknown').toLowerCase();
      const tone = status === 'completed' ? 'good' : status === 'failed' || status === 'cancelled' ? 'error' : 'warn';
      global.updateSideRailDetail(run.id || 'Run', typeof global.renderSideRailTemplate === 'function'
        ? global.renderSideRailTemplate({
            tone,
            statusLabel: run.status || 'unknown',
            summaryCards: [
              { label: 'Status', value: run.status || 'unknown', meta: run.run_mode || '—', tone },
              { label: 'Gestart', value: formatDate(run.started_at), meta: 'starttijd', tone: 'neutral' },
              { label: 'Voltooid', value: formatDate(run.completed_at), meta: 'eindtijd', tone: status === 'completed' ? 'good' : 'neutral' },
              { label: 'Fases', value: (run.phases || []).length || 'alle', meta: escapeHtml((run.phases || []).join(', ') || 'alle fases'), tone: 'neutral' },
            ],
            sections: [
              {
                title: 'Runcontext',
                badge: 'Assessment',
                tone,
                bodyHtml: `<div class="bev-wb-list">
                  <div class="bev-wb-item"><strong>Rapport</strong><span>${run.report_path ? escapeHtml(run.report_path) : 'Geen rapport gekoppeld'}</span></div>
                  <div class="bev-wb-item"><strong>Foutmelding</strong><span>${escapeHtml(run.error_message || 'Geen foutmelding')}</span></div>
                </div>`,
              },
              {
                title: 'Laatste logregels',
                bodyHtml: `<div class="bev-wb-list"><div class="bev-wb-item"><span style="white-space:pre-wrap;font-family:var(--mono,monospace);">${escapeHtml(logLines.join('\n') || '(geen logs)')}</span></div></div>`,
              },
            ],
          })
        : `<div class="bev-workbench-meta">${escapeHtml(run.status || 'unknown')}</div>`);
      return;
    }
    showToast('Run-details worden in de rechterzijbalk geopend.', 'info');
  }

  global.DenjoyMspResultsSections = {
    loadHistorySection,
    loadResultsSection,
    loadRunDiffPanel,
    viewRunDetails,
  };

  global.loadHistorySection = loadHistorySection;
  global.loadResultsSection = loadResultsSection;
  global.loadRunDiffPanel = loadRunDiffPanel;
  global.viewRunDetails = viewRunDetails;
})(window);
