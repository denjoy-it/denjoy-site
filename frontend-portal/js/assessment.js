// Local assessment execution (backend-driven)

let activeRunId = null;
let activeRunTenantId = null;
let activeRunPollTimer = null;
let activeLogPollTimer = null;
let isRunPollingActive = false;

function assessmentNotify(message, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  if (type === 'error') {
    console.error(message);
  } else {
    console.log(message);
  }
}

function selectedAssessmentTenantId() {
  return (typeof window._getCurrentTenantId === 'function' ? window._getCurrentTenantId() : '')
    || document.getElementById('tenantSelect')?.value
    || (typeof currentTenantId !== 'undefined' ? currentTenantId : '')
    || window.currentTenantId
    || '';
}

function goToResultsPanel(panel = 'viewer') {
  if (typeof showSection === 'function') {
    showSection('results', { resultsPanel: panel });
  }
}

function escapeAssessmentHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function assessmentStatusBadge(status) {
  const tone = String(status || 'pending').toLowerCase();
  const map = {
    pending: ['rgba(234,179,8,0.12)', '#a16207'],
    queued: ['rgba(59,130,246,0.12)', '#1d4ed8'],
    running: ['rgba(59,130,246,0.12)', '#1d4ed8'],
    completed: ['rgba(34,197,94,0.12)', '#15803d'],
    failed: ['rgba(239,68,68,0.12)', '#dc2626'],
    cancelled: ['rgba(107,114,128,0.12)', '#4b5563'],
  };
  const labels = {
    pending: 'In wachtrij',
    queued: 'Gepland',
    running: 'Bezig',
    completed: 'Voltooid',
    failed: 'Mislukt',
    cancelled: 'Geannuleerd',
  };
  const [bg, fg] = map[tone] || map.pending;
  const label = labels[tone] || escapeAssessmentHtml(status || 'pending');
  return `<span class="assessment-scheduled-status" style="background:${bg};color:${fg};">${label}</span>`;
}

function assessmentFormatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('nl-NL');
}

function openScheduledRunDetail(jobId) {
  const items = Array.isArray(window._scheduledAssessmentRunsCache) ? window._scheduledAssessmentRunsCache : [];
  const item = items.find((entry) => entry.id === jobId);
  if (!item) return;
  const payload = item.payload || {};
  const phases = Array.isArray(payload.phases) && payload.phases.length
    ? payload.phases.map(phaseLabel).join(', ')
    : 'Alle standaardfasen';
  if (typeof window.openSideRailDetail === 'function' && typeof window.updateSideRailDetail === 'function') {
    window.openSideRailDetail('Scanplanning', 'Geplande scan');
    const status = String(item.status || 'pending').toLowerCase();
    const tone = status === 'completed' ? 'good' : status === 'failed' || status === 'cancelled' ? 'error' : 'warn';
    const bodyHtml = typeof window.renderSideRailTemplate === 'function'
      ? window.renderSideRailTemplate({
          tone,
          statusLabel: status === 'completed' ? 'Voltooid' : status === 'failed' ? 'Mislukt' : status === 'cancelled' ? 'Geannuleerd' : 'Gepland',
          summaryCards: [
            { label: 'Tenant', value: item.tenant_id || '—', meta: 'doeltenant', tone: 'neutral' },
            { label: 'Status', value: status || 'pending', meta: 'scanplanning', tone },
            { label: 'Gepland op', value: assessmentFormatDateTime(item.scheduled_at), meta: 'uitvoering', tone: 'neutral' },
            { label: 'Run mode', value: payload.run_mode || 'demo', meta: payload.scan_type || 'full', tone: 'neutral' },
          ],
          sections: [{
            title: 'Planning',
            badge: 'Assessment',
            tone,
            bodyHtml: `
              <div class="bev-wb-list">
                <div class="bev-wb-item"><strong>Aangemaakt</strong><span>${escapeAssessmentHtml(assessmentFormatDateTime(item.created_at))}</span></div>
                <div class="bev-wb-item"><strong>Scan type</strong><span>${escapeAssessmentHtml(payload.scan_type || 'full')}</span></div>
                <div class="bev-wb-item"><strong>Fasen</strong><span>${escapeAssessmentHtml(phases)}</span></div>
                <div class="bev-wb-item"><strong>Notitie</strong><span>${escapeAssessmentHtml(payload.note || 'Geen notitie')}</span></div>
              </div>`,
          }],
          actions: (item.status === 'pending' || item.status === 'queued') ? [{
            title: 'Geplande scan annuleren',
            body: 'Stop deze scan voordat hij wordt uitgevoerd als de planning of scope niet meer klopt.',
            actionHtml: '<button type="button" class="bev-inline-btn" id="scheduledRunCancelBtn">Annuleren</button>',
          }] : [],
        })
      : '<div class="bev-workbench-empty">Geplande scandetails laden…</div>';
    window.updateSideRailDetail('Geplande scan', bodyHtml);
    document.getElementById('scheduledRunCancelBtn')?.addEventListener('click', () => {
      cancelScheduledRun(jobId);
    });
    return;
  }
  assessmentNotify(`Geplande scan: ${item.tenant_id || 'tenant'} op ${assessmentFormatDateTime(item.scheduled_at)}`, 'info');
}

async function cancelScheduledRun(jobId) {
  if (!jobId) return;
  if (typeof window.openSideRailDetail === 'function' && typeof window.updateSideRailDetail === 'function') {
    window.openSideRailDetail('Scanplanning', 'Annuleren');
    window.updateSideRailDetail('Geplande scan annuleren', typeof window.renderSideRailTemplate === 'function'
      ? window.renderSideRailTemplate({
          tone: 'error',
          statusLabel: 'Bevestiging',
          summaryCards: [
            { label: 'Job', value: jobId, meta: 'geplande scan', tone: 'neutral' },
          ],
          findings: [{
            tone: 'warn',
            label: 'Let op',
            title: 'Planning wordt verwijderd',
            body: 'Deze scan wordt geannuleerd voordat hij wordt uitgevoerd.',
          }],
          actions: [{
            title: 'Annuleren bevestigen',
            body: 'Gebruik dit alleen als deze run niet meer nodig is of opnieuw gepland moet worden.',
            actionHtml: '<button type="button" class="bev-inline-btn bev-inline-btn--danger" id="confirmScheduledRunCancelBtn">Annuleren bevestigen</button>',
          }],
        })
      : `<div class="bev-workbench-meta">Deze geplande scan wordt gestopt voordat hij uitgevoerd wordt.</div>`);
    document.getElementById('confirmScheduledRunCancelBtn')?.addEventListener('click', () => performScheduledRunCancel(jobId), { once: true });
    return;
  }
  return performScheduledRunCancel(jobId);
}

async function performScheduledRunCancel(jobId) {
  if (!jobId) return;
  try {
    const response = await fetch(`/api/jobs/${jobId}/cancel`, {
      method: 'POST',
      credentials: 'include',
      headers: buildAssessmentRequestHeaders(),
    });
    if (!response.ok) {
      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        data = null;
      }
      throw new Error((data && data.error) || `HTTP ${response.status}`);
    }
  assessmentNotify('Geplande scan geannuleerd.', 'success');
    await loadScheduledRuns();
  } catch (error) {
    assessmentNotify(`Annuleren mislukt: ${error.message}`, 'error');
  }
}

function getSelectedPhases() {
  const checkboxes = document.querySelectorAll('input[name="phase"]:checked');
  return Array.from(checkboxes).map((cb) => cb.value);
}

function phaseLabel(phase) {
  const labels = {
    phase1: 'Fase 1: Gebruikers & licenties',
    phase2: 'Fase 2: Samenwerking & opslag',
    phase3: 'Fase 3: Naleving & beveiliging',
    phase4: 'Fase 4: Geavanceerde beveiliging',
    phase5: 'Fase 5: Intune',
    phase6: 'Fase 6: Azure',
  };
  return labels[phase] || phase;
}

function getAssessmentSessionToken() {
  return sessionStorage.getItem('denjoy_token')
    || localStorage.getItem('denjoy_token')
    || localStorage.getItem('denjoy_auth_token')
    || '';
}

function buildAssessmentRequestHeaders(includeJson = false) {
  const token = getAssessmentSessionToken();
  const headers = {};
  if (includeJson) headers['Content-Type'] = 'application/json';
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-CSRF-Token'] = token;
  }
  return headers;
}

async function assessmentFetch(url, options = {}) {
  const baseHeaders = buildAssessmentRequestHeaders(!!options.includeJson);
  const mergedOptions = {
    credentials: 'include',
    ...options,
    headers: {
      ...baseHeaders,
      ...(options.headers || {}),
    },
  };
  delete mergedOptions.includeJson;
  return fetch(url, mergedOptions);
}

function addProgressLog(message, type = 'info') {
  const log = document.getElementById('progressLog');
  if (!log) return;
  const p = document.createElement('p');
  p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  if (type === 'error') p.style.color = '#ffb4b4';
  if (type === 'success') p.style.color = '#b7f7c8';
  if (type === 'warning') p.style.color = '#ffe08a';
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

function setProgress(percent, label) {
  const fill = document.getElementById('progressFill');
  if (!fill) return;
  fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  fill.textContent = label || `${Math.round(percent)}%`;
}

function estimateProgressFromLogs(logText, selectedPhases) {
  if (!logText) return 5;
  const lines = logText.split(/\r?\n/).filter(Boolean);
  let done = 0;
  for (const phase of selectedPhases) {
    const phaseNum = phase.replace('phase', '');
    const phaseRegex = new RegExp(`(Completed\\s+${phase}|Voltooid\\s+${phase}|SkipPhase${phaseNum})`, 'i');
    if (lines.some((l) => phaseRegex.test(l))) done += 1;
  }
  if (!selectedPhases.length) return 10;
  return Math.min(95, Math.round((done / selectedPhases.length) * 90) + 5);
}

async function pollRunStatus(runId, selectedPhases) {
  try {
    const res = await assessmentFetch(`/api/runs/${runId}`, {
      headers: buildAssessmentRequestHeaders(),
    });
    const run = await res.json();
    if (!res.ok) throw new Error(run.error || `HTTP ${res.status}`);
    const title = document.querySelector('#assessmentProgress h3');
    if (title) title.textContent = `Scanstatus: ${run.status}`;

    if (run.status === 'completed') {
      setProgress(100, '100%');
      addProgressLog('Scan voltooid.', 'success');
      if (run.snapshot_path) {
        addProgressLog('Scandata is gesynchroniseerd naar de portal-weergave.', 'success');
      } else if (run.report_path) {
        addProgressLog('Legacy rapportbestand beschikbaar voor export/doelarchief.', 'success');
      }
      stopRunPolling();
      activeRunId = null;
      activeRunTenantId = null;
      isRunPollingActive = false;
      document.querySelector('.assessment-config').style.display = 'block';
      document.getElementById('assessmentProgress').style.display = 'none';
      // Vervolgstappen-banner tonen
      const existing = document.getElementById('assessmentDoneNotice');
      if (existing) existing.remove();
      const configEl = document.querySelector('.assessment-config');
      if (configEl) {
        const banner = document.createElement('div');
        banner.id = 'assessmentDoneNotice';
        banner.className = 'assessment-inline-notice assessment-inline-notice-success';
        banner.innerHTML = `
          <div class="assessment-inline-notice-copy">
            <strong>Scan voltooid</strong>
            <span>Wat wil je nu doen?</span>
          </div>
          <div class="assessment-inline-notice-actions">
            <button type="button" class="btn btn-primary btn-sm" id="assessmentDoneViewReport">Rapport bekijken</button>
            <button type="button" class="btn btn-secondary btn-sm" id="assessmentDoneViewActions">Acties bekijken</button>
            <button type="button" class="btn btn-secondary btn-sm" id="assessmentDoneDismiss">Sluiten</button>
          </div>`;
        configEl.insertAdjacentElement('beforebegin', banner);
        document.getElementById('assessmentDoneViewReport')?.addEventListener('click', () => goToResultsPanel('viewer'));
        document.getElementById('assessmentDoneViewActions')?.addEventListener('click', () => goToResultsPanel('actions'));
        document.getElementById('assessmentDoneDismiss')?.addEventListener('click', () => {
          document.getElementById('assessmentDoneNotice')?.remove();
        });
      }
      if (typeof refreshTenantData === 'function') await refreshTenantData();
      if (document.getElementById('autoOpenReport')?.checked) {
        setTimeout(() => {
          goToResultsPanel('viewer');
        }, 500);
      }
      return { terminal: true, status: run.status };
    }

    if (run.status === 'failed') {
      addProgressLog(`Scan mislukt: ${run.error_message || 'Onbekende fout'}`, 'error');
      stopRunPolling();
      activeRunId = null;
      activeRunTenantId = null;
      isRunPollingActive = false;
      document.querySelector('.assessment-config').style.display = 'block';
      document.getElementById('assessmentProgress').style.display = 'none';
      if (typeof refreshTenantData === 'function') await refreshTenantData();
      return { terminal: true, status: run.status };
    }

    if (run.status === 'cancelled') {
      addProgressLog('Scan gestopt.', 'warning');
      stopRunPolling();
      activeRunId = null;
      activeRunTenantId = null;
      isRunPollingActive = false;
      const stopBtn = document.getElementById('stopAssessmentButton');
      if (stopBtn) { stopBtn.disabled = false; stopBtn.textContent = '⏹ Stoppen'; }
      document.querySelector('.assessment-config').style.display = 'block';
      document.getElementById('assessmentProgress').style.display = 'none';
      if (typeof refreshTenantData === 'function') await refreshTenantData();
      return { terminal: true, status: run.status };
    }

    const logsRes = await assessmentFetch(`/api/runs/${runId}/logs`, {
      headers: buildAssessmentRequestHeaders(),
    });
    const logs = await logsRes.json();
    setProgress(estimateProgressFromLogs(logs.text || '', selectedPhases));
    return { terminal: false, status: run.status };
  } catch (e) {
    console.error(e);
    addProgressLog(`Polling fout: ${e.message}`, 'error');
    return { terminal: false, status: 'error' };
  }
}

async function pollRunLogs(runId) {
  try {
    const res = await assessmentFetch(`/api/runs/${runId}/logs`, {
      headers: buildAssessmentRequestHeaders(),
    });
    const data = await res.json();
    const log = document.getElementById('progressLog');
    if (!log) return;
    const text = (data.lines || []).join('\n');
    log.innerHTML = '';
    for (const line of (data.lines || [])) {
      const p = document.createElement('p');
      p.textContent = line;
      if (/failed|mislukt|error/i.test(line)) p.style.color = '#ffb4b4';
      else if (/completed|voltooid|success/i.test(line)) p.style.color = '#b7f7c8';
      log.appendChild(p);
    }
    log.scrollTop = log.scrollHeight;
    return text;
  } catch (e) {
    console.warn('Log polling fout', e);
  }
}

function stopRunPolling() {
  if (activeRunPollTimer) clearInterval(activeRunPollTimer);
  if (activeLogPollTimer) clearInterval(activeLogPollTimer);
  activeRunPollTimer = null;
  activeLogPollTimer = null;
  isRunPollingActive = false;
}

function startRunPollingLoop(runId, selectedPhases) {
  stopRunPolling();
  isRunPollingActive = true;

  // Logs poll every 2s
  activeLogPollTimer = setInterval(() => {
    if (!isRunPollingActive || !activeRunId || activeRunId !== runId) return;
    pollRunLogs(runId);
  }, 2000);

  // Status poll every 3s (single source of truth)
  activeRunPollTimer = setInterval(async () => {
    if (!isRunPollingActive || !activeRunId || activeRunId !== runId) return;
    const state = await pollRunStatus(runId, selectedPhases);
    if (state && state.terminal) {
      stopRunPolling();
    }
  }, 3000);
}

async function startAssessment() {
  const tenantId = selectedAssessmentTenantId();
  if (activeRunId && activeRunTenantId === tenantId) {
    assessmentNotify('Er draait al een assessment. Wacht tot deze is afgerond.', 'warning');
    return;
  }

  const selectedPhases = getSelectedPhases();
  if (!selectedPhases.length) {
    assessmentNotify('Selecteer minimaal een fase.', 'warning');
    return;
  }

  if (!tenantId) {
    assessmentNotify('Selecteer eerst een tenant.', 'warning');
    return;
  }

  if (activeRunId && activeRunTenantId && activeRunTenantId !== tenantId) {
    stopRunPolling();
    activeRunId = null;
    activeRunTenantId = null;
    isRunPollingActive = false;
  }

  const runMode = document.getElementById('runModeSelect')?.value || 'demo';
  const authTenantId = (
    sessionStorage.getItem('denjoy_msal_tenant_id')
    || localStorage.getItem('m365_tenantId')
    || ''
  ).trim();

  document.querySelector('.assessment-config').style.display = 'none';
  document.getElementById('assessmentProgress').style.display = 'block';
  document.getElementById('progressLog').innerHTML = '';
  setProgress(2, 'Start...');
  addProgressLog(`Run wordt gestart voor tenant ${tenantId}`);
  addProgressLog(`Mode: ${runMode}`);
  addProgressLog(`Fasen: ${selectedPhases.map(phaseLabel).join(', ')}`);

  try {
    const res = await assessmentFetch('/api/runs', {
      method: 'POST',
      includeJson: true,
      body: JSON.stringify({
        tenant_id: tenantId,
        auth_tenant_id: authTenantId || null,
        phases: selectedPhases,
        run_mode: runMode,
        scan_type: 'full',
      }),
    });
    const run = await res.json();
    if (!res.ok) throw new Error(run.error || `HTTP ${res.status}`);

    activeRunId = run.id;
    activeRunTenantId = tenantId;
    isRunPollingActive = true;
    addProgressLog(`Run aangemaakt: ${activeRunId}`, 'success');

    await pollRunLogs(activeRunId);
    const firstState = await pollRunStatus(activeRunId, selectedPhases);
    if (!firstState || !firstState.terminal) {
      startRunPollingLoop(activeRunId, selectedPhases);
    }
  } catch (error) {
    console.error(error);
    addProgressLog(`Starten assessment mislukt: ${error.message}`, 'error');
    assessmentNotify(`Fout bij starten assessment: ${error.message}`, 'error');
    document.querySelector('.assessment-config').style.display = 'block';
    document.getElementById('assessmentProgress').style.display = 'none';
    activeRunId = null;
    activeRunTenantId = null;
    isRunPollingActive = false;
    stopRunPolling();
  }
}

async function stopAssessment() {
  if (!activeRunId) return;
  const btn = document.getElementById('stopAssessmentButton');
  if (btn) { btn.disabled = true; btn.textContent = 'Stoppen...'; }
  try {
    await assessmentFetch(`/api/runs/${activeRunId}/stop`, {
      method: 'POST',
    });
    addProgressLog('⏹ Stop-verzoek verstuurd...', 'warning');
  } catch (e) {
    addProgressLog(`Stop mislukt: ${e.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '⏹ Stoppen'; }
  }
}

function bindAssessmentButton() {
  const btn = document.getElementById('startAssessmentButton');
  if (!btn) return;
  btn.removeEventListener('click', startAssessment);
  btn.addEventListener('click', startAssessment);
}

function initAssessmentUi() {
  bindAssessmentButton();
  loadScheduledRuns();
  loadRecurringSchedule();
  window.addEventListener('denjoy:tenant-changed', () => {
    stopRunPolling();
    activeRunId = null;
    activeRunTenantId = null;
    isRunPollingActive = false;
    const progress = document.getElementById('assessmentProgress');
    const config = document.querySelector('.assessment-config');
    if (progress) progress.style.display = 'none';
    if (config) config.style.display = 'block';
    const log = document.getElementById('progressLog');
    if (log) log.innerHTML = '';
    setProgress(0, '0%');
    loadScheduledRuns();
    loadRecurringSchedule();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAssessmentUi, { once: true });
} else {
  initAssessmentUi();
}

async function scheduleAssessmentRun() {
  const dtInput = document.getElementById('scheduleDateTime');
  const noteInput = document.getElementById('scheduleNote');
  const btn = document.getElementById('scheduleRunBtn');
  const tid = selectedAssessmentTenantId();
  if (!tid) { _scheduleMsg('Selecteer eerst een tenant.', 'error'); return; }
  const dt = dtInput?.value;
  if (!dt) { _scheduleMsg('Kies een datum en tijd.', 'error'); return; }
  const scheduledAt = new Date(dt).toISOString();
  const phases = Array.from(document.querySelectorAll('input[name="phase"]:checked')).map(el => el.value);
  if (btn) { btn.disabled = true; btn.textContent = 'Plannen...'; }
  try {
    const res = await assessmentFetch('/api/scheduled-runs', {
      method: 'POST',
      includeJson: true,
      body: JSON.stringify({ tenant_id: tid, scheduled_at: scheduledAt, phases, note: noteInput?.value || '' }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    _scheduleMsg('Assessment ingepland.', 'success');
    if (dtInput) dtInput.value = '';
    if (noteInput) noteInput.value = '';
    loadScheduledRuns();
  } catch (e) {
    _scheduleMsg('Fout: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Inplannen →'; }
  }
}

function _scheduleMsg(msg, type) {
  const el = document.getElementById('scheduledRunsList');
  if (!el) return;
  const div = document.createElement('div');
  div.className = `assessment-inline-notice ${type === 'error' ? 'assessment-inline-notice-error' : 'assessment-inline-notice-success'}`;
  div.textContent = msg;
  el.prepend(div);
  setTimeout(() => div.remove(), 5000);
}

async function loadScheduledRuns() {
  const el = document.getElementById('scheduledRunsList');
  if (!el) return;
  try {
    const token = localStorage.getItem('denjoy_token') || sessionStorage.getItem('denjoy_token');
    const res = await assessmentFetch('/api/scheduled-runs', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    const data = await res.json();
    const selectedTenant = selectedAssessmentTenantId();
    const items = (data.items || []).filter((j) => {
      const active = ['pending', 'queued', 'running'].includes(String(j.status || '').toLowerCase());
      const tenantMatch = !selectedTenant || j.tenant_id === selectedTenant;
      return active && tenantMatch;
    });
    window._scheduledAssessmentRunsCache = items;
    if (!items.length) {
      el.innerHTML = '<div class="assessment-scheduled-empty">Geen geplande assessments voor deze tenant.</div>';
      return;
    }
    el.innerHTML = `
      <div class="assessment-scheduled-table-wrap">
        <table class="assessment-scheduled-table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Gepland op</th>
              <th>Run mode</th>
              <th>Notitie</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${items.map((j) => {
              const payload = j.payload || {};
              return `
                <tr>
                  <td>
                    <div class="assessment-scheduled-primary">${escapeAssessmentHtml(j.tenant_id || '—')}</div>
                    <div class="assessment-scheduled-secondary">${escapeAssessmentHtml((payload.phases || []).length ? `${payload.phases.length} fase(n)` : 'Standaardfasen')}</div>
                  </td>
                  <td>${escapeAssessmentHtml(assessmentFormatDateTime(j.scheduled_at))}</td>
                  <td>${escapeAssessmentHtml(payload.run_mode || 'demo')}</td>
                  <td class="assessment-scheduled-note">${escapeAssessmentHtml(payload.note || '—')}</td>
                  <td>${assessmentStatusBadge(j.status)}</td>
                  <td>
                    <div class="results-row-actions">
                      <button type="button" class="btn btn-secondary btn-sm" data-scheduled-action="details" data-job-id="${escapeAssessmentHtml(j.id)}">Details</button>
                      ${(j.status === 'pending' || j.status === 'queued') ? `<button type="button" class="btn btn-secondary btn-sm" data-scheduled-action="cancel" data-job-id="${escapeAssessmentHtml(j.id)}" style="color:#dc2626;">Annuleren</button>` : ''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    el.querySelectorAll('[data-scheduled-action="details"]').forEach((button) => {
      button.addEventListener('click', () => openScheduledRunDetail(button.dataset.jobId || ''));
    });
    el.querySelectorAll('[data-scheduled-action="cancel"]').forEach((button) => {
      button.addEventListener('click', () => cancelScheduledRun(button.dataset.jobId || ''));
    });
  } catch (_) {
    el.innerHTML = '<div class="assessment-scheduled-empty">Kon geplande jobs niet laden.</div>';
  }
}

window.loadScheduledRuns = loadScheduledRuns;

// ══════════════════════════════════════════════════════════════════════════════
// Herhalende assessment-schedules (recurring)
// ══════════════════════════════════════════════════════════════════════════════

function _buildAssessmentHeaders(json = false) {
  return buildAssessmentRequestHeaders(json);
}

async function loadRecurringSchedule() {
  const tid = selectedAssessmentTenantId();
  const statusEl = document.getElementById('recurringScheduleStatus');
  const deleteBtn = document.getElementById('recurringScheduleDeleteBtn');
  if (!tid || !statusEl) return;

  statusEl.innerHTML = '<span style="color:var(--text-muted,#6b7280);font-size:.83rem;">Laden…</span>';
  try {
    const res = await assessmentFetch(`/api/assessment-schedules/${tid}`, {
      headers: _buildAssessmentHeaders(),
    });
    if (res.status === 404) {
      statusEl.innerHTML = '<span style="font-size:.83rem;color:var(--text-muted,#6b7280);">Geen schema actief voor deze tenant.</span>';
      if (deleteBtn) deleteBtn.style.display = 'none';
      return;
    }
    const data = await res.json();
    const sched = data.schedule || {};

    // Vul formulier in
    const enabledEl = document.getElementById('recurringEnabled');
    const intervalEl = document.getElementById('recurringInterval');
    const modeEl = document.getElementById('recurringRunMode');
    if (enabledEl) enabledEl.value = sched.enabled ? 'true' : 'false';
    if (intervalEl) intervalEl.value = String(sched.interval_hours || 168);
    if (modeEl) modeEl.value = sched.run_mode || 'live';

    const nextRun = sched.next_run_at ? sched.next_run_at.slice(0, 16).replace('T', ' ') + ' UTC' : '—';
    const lastRun = sched.last_run_at ? sched.last_run_at.slice(0, 16).replace('T', ' ') + ' UTC' : 'Nog niet uitgevoerd';
    statusEl.innerHTML = `
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:.82rem;background:var(--card-bg-alt,#f9fafb);border:1px solid var(--border-color,#e5e7eb);border-radius:8px;padding:.6rem .9rem;">
        <span><strong>Status:</strong> ${sched.enabled ? '✅ Actief' : '⏸ Gepauzeerd'}</span>
        <span><strong>Volgende run:</strong> ${nextRun}</span>
        <span><strong>Laatste run:</strong> ${lastRun}</span>
        <span><strong>Interval:</strong> ${sched.interval_hours || 168}u</span>
      </div>`;
    if (deleteBtn) deleteBtn.style.display = '';
  } catch (e) {
    statusEl.innerHTML = `<span style="color:#b91c1c;font-size:.83rem;">Fout bij laden: ${e.message}</span>`;
  }
}

async function saveRecurringSchedule() {
  const tid = selectedAssessmentTenantId();
  const resultEl = document.getElementById('recurringScheduleResult');
  if (!tid) { if (resultEl) resultEl.innerHTML = '<span style="color:#b91c1c;">Selecteer eerst een tenant.</span>'; return; }

  const enabledEl = document.getElementById('recurringEnabled');
  const intervalEl = document.getElementById('recurringInterval');
  const modeEl = document.getElementById('recurringRunMode');

  const body = {
    enabled: (enabledEl?.value || 'true') === 'true',
    interval_hours: parseInt(intervalEl?.value || '168', 10),
    run_mode: modeEl?.value || 'live',
    phases_csv: 'users,collaboration,compliance,security,intune,azure',
  };

  const btn = document.getElementById('recurringScheduleSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Opslaan…'; }
  try {
    const res = await assessmentFetch(`/api/assessment-schedules/${tid}`, {
      method: 'POST',
      includeJson: true,
      headers: _buildAssessmentHeaders(true),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (resultEl) resultEl.innerHTML = '<span style="color:#166534;">✓ Schema opgeslagen.</span>';
    setTimeout(() => { if (resultEl) resultEl.innerHTML = ''; }, 4000);
    await loadRecurringSchedule();
  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<span style="color:#b91c1c;">Fout: ${e.message}</span>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Opslaan'; }
  }
}

async function deleteRecurringSchedule() {
  const tid = selectedAssessmentTenantId();
  const resultEl = document.getElementById('recurringScheduleResult');
  if (!tid) return;
  if (!confirm('Schema verwijderen voor deze tenant?')) return;

  try {
    const res = await assessmentFetch(`/api/assessment-schedules/${tid}`, {
      method: 'DELETE',
      headers: _buildAssessmentHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (resultEl) resultEl.innerHTML = '<span style="color:#166534;">✓ Schema verwijderd.</span>';
    setTimeout(() => { if (resultEl) resultEl.innerHTML = ''; }, 4000);
    await loadRecurringSchedule();
  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<span style="color:#b91c1c;">Fout: ${e.message}</span>`;
  }
}

window.saveRecurringSchedule = saveRecurringSchedule;
window.deleteRecurringSchedule = deleteRecurringSchedule;
window.loadRecurringSchedule = loadRecurringSchedule;
