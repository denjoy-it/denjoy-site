(function initDenjoyMspControlCenter(global) {
  let actionInboxPreset = 'all';

  function mspccCurrency(value) {
    const num = Number(value || 0);
    return `€ ${num.toFixed(2)}`;
  }

  function mspccAttentionTone(customer) {
    if (Number(customer?.critical_tenants || 0) > 0 || Number(customer?.failed_jobs || 0) > 0) return 'urgent';
    if (Number(customer?.avg_completion_pct || 0) < 75) return 'warn';
    return 'info';
  }

  function mspccActionButton(action, fallbackClass = 'btn btn-secondary btn-sm') {
    if (!action) return '';
    if (action.type === 'section') {
      return `<button type="button" class="${fallbackClass}" data-action="showSection" data-id="${global.escapeHtml(action.section || 'overview')}">${global.escapeHtml(action.label || 'Openen')}</button>`;
    }
    if (action.type === 'customer') {
      return `<button type="button" class="${fallbackClass}" data-action="viewCustomer" data-id="${global.escapeHtml(action.customer_id || '')}">${global.escapeHtml(action.label || 'Open klantdetail')}</button>`;
    }
    if (action.type === 'customer_edit') {
      return `<button type="button" class="${fallbackClass}" data-action="editCustomer" data-id="${global.escapeHtml(action.customer_id || '')}">${global.escapeHtml(action.label || 'Open klantkaart')}</button>`;
    }
    if (action.type === 'tenant_onboarding') {
      return `<button type="button" class="${fallbackClass}" data-mspcc-open-onboarding="1" data-id="${global.escapeHtml(action.tenant_id || '')}" data-name="${global.escapeHtml(action.tenant_name || action.tenant_id || '')}">${global.escapeHtml(action.label || 'Open onboarding')}</button>`;
    }
    return '';
  }

  function is404Error(error) {
    return /404/.test(String(error?.message || error || ''));
  }

  function flashPanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    panel.classList.add('mspcc-panel-highlight');
    global.setTimeout?.(() => panel.classList.remove('mspcc-panel-highlight'), 1600);
  }

  function setActionOwnerFilter(value = '') {
    const ownerInput = document.getElementById('mspccActionOwnerFilter');
    if (ownerInput) ownerInput.value = value;
  }

  function setActionStatusFilter(value = 'all') {
    const statusInput = document.getElementById('mspccActionStatusFilter');
    if (statusInput) statusInput.value = value;
  }

  function setJobMonitorFilter(status = null) {
    document.querySelectorAll('.jm-filter').forEach((btn) => {
      btn.classList.toggle('active', (btn.dataset.status || '') === String(status || ''));
    });
  }

  function setApprovalFilter(status = 'pending') {
    document.querySelectorAll('.gdk-filter-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn.dataset.status || '') === String(status || ''));
    });
  }

  function applyInboxPreset(items = [], preset = actionInboxPreset) {
    if (!Array.isArray(items)) return [];
    if (preset === 'overdue') return items.filter((item) => item.is_overdue && !item.is_closed);
    if (preset === 'due_today') return items.filter((item) => item.days_until_due === 0 && !item.is_closed);
    if (preset === 'waiting_customer') return items.filter((item) => /klant|customer|extern/i.test(String(item.notes || '')) && !item.is_closed);
    if (preset === 'my_work') {
      const displayName = String(global._getCurrentDisplayName?.() || global._currentDisplayName || '').trim().toLowerCase();
      return items.filter((item) => String(item.owner || '').trim().toLowerCase() === displayName);
    }
    return items;
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysSince(value) {
    const date = parseDate(value);
    if (!date) return null;
    return Math.floor((Date.now() - date.getTime()) / 86400000);
  }

  function buildReminderCandidates(approvals = [], approvalRequests = [], jobs = [], recentJobs = [], actions = [], staleTenants = []) {
    const openActionKeys = new Set(
      (Array.isArray(actions) ? actions : [])
        .filter((item) => !item.is_closed)
        .map((item) => String(item.finding_key || '').trim().toLowerCase())
        .filter(Boolean)
    );
    const candidates = [];

    (Array.isArray(approvals) ? approvals : []).forEach((item) => {
      const age = daysSince(item.requested_at);
      if (age == null || age < 2 || !item.tenant_id) return;
      const severity = age >= 5 ? 'critical' : 'warning';
      const reminderKey = `ops-reminder:approval:${item.id}`;
      candidates.push({
        kind: 'approval',
        id: item.id,
        tenant_id: item.tenant_id,
        title: age >= 5 ? 'Approval escaleert' : 'Approval wacht op opvolging',
        detail: `${item.action_type || item.section || 'Approval'} staat ${age} dag(en) open en blokkeert besluitvorming.`,
        finding_key: reminderKey,
        severity,
        due_date: new Date(Date.now() + (severity === 'critical' ? 86400000 : 3 * 86400000)).toISOString().slice(0, 10),
        owner: item.approved_by || '',
        notes: `Approval ${item.id}\nTenant ${item.tenant_id}\nAangevraagd door ${item.requested_by || 'onbekend'} op ${item.requested_at || 'onbekend'}`,
        has_open_action: openActionKeys.has(reminderKey),
        open_action: { type: 'section', section: 'goedkeuringen' },
        cta: age >= 5 ? 'Maak escalatie' : 'Maak reminder',
        meta: `${age} dag(en) open · ${item.requested_by || 'onbekend'}`,
      });
    });

    (Array.isArray(approvalRequests) ? approvalRequests : []).forEach((item) => {
      const age = daysSince(item.requested_at);
      if (age == null || age < 2) return;
      const severity = age >= 5 ? 'critical' : 'warning';
      const reminderKey = `ops-reminder:approval-request:${item.id}`;
      candidates.push({
        kind: 'approval_request',
        id: item.id,
        tenant_id: '',
        title: age >= 5 ? 'Approval request escaleert' : 'Approval request vraagt opvolging',
        detail: `${item.action_name || item.action_key || 'Approval request'} staat ${age} dag(en) open in de governance-laag.`,
        finding_key: reminderKey,
        severity,
        due_date: new Date(Date.now() + (severity === 'critical' ? 86400000 : 3 * 86400000)).toISOString().slice(0, 10),
        owner: '',
        notes: `Approval request ${item.id}\nAction key ${item.action_key || 'onbekend'}\nAangevraagd door ${item.requested_by || 'onbekend'} op ${item.requested_at || 'onbekend'}`,
        has_open_action: openActionKeys.has(reminderKey),
        open_action: { type: 'section', section: 'mspcontrolcenter' },
        cta: age >= 5 ? 'Maak escalatie' : 'Maak reminder',
        meta: `${age} dag(en) open · ${item.requested_by || 'onbekend'}`,
      });
    });

    const jobSource = Array.isArray(jobs) && jobs.length ? jobs : recentJobs;
    (Array.isArray(jobSource) ? jobSource : []).forEach((item) => {
      const age = daysSince(item.scheduled_at || item.created_at || item.started_at);
      const status = String(item.status || '');
      if (!item.tenant_id) return;
      if (status === 'failed') {
        const reminderKey = `ops-reminder:job:${item.id}`;
        candidates.push({
          kind: 'job',
          id: item.id,
          tenant_id: item.tenant_id,
          title: 'Failed job vraagt escalatie',
          detail: `${item.job_type || 'Job'} staat op failed en vraagt handmatige opvolging of retry.`,
          finding_key: reminderKey,
          severity: 'critical',
          due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          owner: '',
          notes: `Job ${item.id}\nTenant ${item.tenant_id}\nStatus failed\nFout: ${item.error_message || 'geen foutmelding'}`,
          has_open_action: openActionKeys.has(reminderKey),
          open_action: { type: 'section', section: 'jobmonitor' },
          cta: 'Maak escalatie',
          meta: item.error_message || 'Geen foutmelding',
        });
        return;
      }
      if ((status === 'pending' || status === 'running') && age != null && age >= 1) {
        const severity = age >= 3 ? 'critical' : 'warning';
        const reminderKey = `ops-reminder:job-stale:${item.id}`;
        candidates.push({
          kind: 'job',
          id: item.id,
          tenant_id: item.tenant_id,
          title: age >= 3 ? 'Job hangt al meerdere dagen' : 'Job vraagt reminder',
          detail: `${item.job_type || 'Job'} staat ${age} dag(en) op ${status} en moet worden gecontroleerd.`,
          finding_key: reminderKey,
          severity,
          due_date: new Date(Date.now() + (severity === 'critical' ? 86400000 : 3 * 86400000)).toISOString().slice(0, 10),
          owner: '',
          notes: `Job ${item.id}\nTenant ${item.tenant_id}\nStatus ${status}\nGepland op ${item.scheduled_at || item.created_at || 'onbekend'}`,
          has_open_action: openActionKeys.has(reminderKey),
          open_action: { type: 'section', section: 'jobmonitor' },
          cta: severity === 'critical' ? 'Maak escalatie' : 'Maak reminder',
          meta: `${age} dag(en) op ${status}`,
        });
      }
    });

    (Array.isArray(staleTenants) ? staleTenants : []).forEach((item) => {
      const reminderKey = `ops-reminder:tenant:${item.tenant_id}`;
      if (openActionKeys.has(reminderKey)) return;
      candidates.push({
        kind: 'tenant',
        id: item.tenant_id,
        tenant_id: item.tenant_id,
        title: 'Tenant vraagt opvolging',
        detail: `${item.tenant_name || item.tenant_id} heeft ${Array.isArray(item.reasons) ? item.reasons.join(', ') : 'openstaande issues'}.`,
        finding_key: reminderKey,
        severity: Number(item.critical_count || 0) > 0 || Number(item.failed_jobs || 0) > 0 ? 'critical' : 'warning',
        due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        owner: '',
        notes: `Tenant ${item.tenant_name || item.tenant_id}\nRedenen: ${Array.isArray(item.reasons) ? item.reasons.join(', ') : 'onbekend'}`,
        has_open_action: false,
        open_action: { type: 'section', section: 'tenantoverzicht' },
        cta: 'Maak opvolgactie',
        meta: `${item.customer_name || 'Klant onbekend'} · ${item.completion_pct || 0}% readiness`,
      });
    });

    return candidates
      .sort((a, b) => {
        const sevA = a.severity === 'critical' ? 0 : 1;
        const sevB = b.severity === 'critical' ? 0 : 1;
        if (sevA !== sevB) return sevA - sevB;
        return String(a.title || '').localeCompare(String(b.title || ''));
      })
      .slice(0, 8);
  }

  function renderReminderList(root, approvals = [], approvalRequests = [], jobs = [], recentJobs = [], actions = [], staleTenants = [], selectedTenantId = '') {
    if (!root) return;
    let candidates = buildReminderCandidates(approvals, approvalRequests, jobs, recentJobs, actions, staleTenants);
    if (selectedTenantId) {
      candidates = candidates.filter((item) => String(item.tenant_id || '') === String(selectedTenantId));
    }
    if (!candidates.length) {
      root.innerHTML = `<div class="mspcc-empty">${selectedTenantId ? 'Geen tenant-specifieke reminders of escalaties voor de geselecteerde tenant.' : 'Geen reminders of escalaties nodig op basis van approvals en jobs.'}</div>`;
      return;
    }
    root.innerHTML = candidates.map((item) => `
      <article class="mspcc-list-item">
        <div class="mspcc-list-item-top">
          <div>
            <strong>${global.escapeHtml(item.title)}</strong>
            <div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(item.meta || '')}</div>
          </div>
          <span class="mspcc-pill">${global.escapeHtml(String(item.severity).toUpperCase())}</span>
        </div>
        <div style="color:var(--text-muted,#6b7280);font-size:.84rem;">${global.escapeHtml(item.detail)}</div>
        <div class="mspcc-meta">
          <span class="mspcc-meta-chip">${global.escapeHtml(item.kind)}</span>
          <span class="mspcc-meta-chip">${global.escapeHtml(item.tenant_id || '')}</span>
          <span class="mspcc-meta-chip">${global.escapeHtml(item.finding_key)}</span>
        </div>
        <div class="mspcc-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-mspcc-open-target="${global.escapeHtml(item.kind)}">Open bron</button>
          ${item.has_open_action
            ? `<button type="button" class="btn btn-secondary btn-sm" data-mspcc-open-existing="1">Reminder bestaat al</button>`
            : `<button type="button" class="btn btn-secondary btn-sm" data-mspcc-create-reminder="1" data-reminder='${global.escapeHtml(JSON.stringify(item))}'>${global.escapeHtml(item.cta)}</button>`}
        </div>
      </article>
    `).join('');

    root.querySelectorAll('[data-mspcc-open-target]').forEach((btn, index) => {
      if (btn._actionBound) return;
      btn._actionBound = true;
      btn.addEventListener('click', async () => {
        const item = candidates[index];
        if (!item) return;
        if (item.kind === 'approval') {
          global.showSection?.('goedkeuringen');
          setApprovalFilter('pending');
          await global.loadGoedkeuringen?.('pending');
          return;
        }
        if (item.kind === 'approval_request') {
          global.showSection?.('mspcontrolcenter');
          flashPanel('mspccRemindersList');
          return;
        }
        if (item.kind === 'tenant') {
          global.showSection?.('tenantoverzicht');
          return;
        }
        global.showSection?.('jobmonitor');
        setJobMonitorFilter(item.severity === 'critical' ? 'failed' : null);
        await global.loadJobMonitor?.(item.severity === 'critical' ? 'failed' : null);
      });
    });

    root.querySelectorAll('[data-mspcc-create-reminder]').forEach((btn) => {
      if (btn._actionBound) return;
      btn._actionBound = true;
      btn.addEventListener('click', async () => {
        try {
          const item = JSON.parse(btn.dataset.reminder || '{}');
          await createReminderAction(item);
        } catch (error) {
          global.showToast?.(`Reminder aanmaken mislukt: ${error.message || error}`, 'error');
        }
      });
    });

    root.querySelectorAll('[data-mspcc-open-existing]').forEach((btn) => {
      if (btn._actionBound) return;
      btn._actionBound = true;
      btn.addEventListener('click', async () => {
        global.showSection?.('mspcontrolcenter');
        actionInboxPreset = 'all';
        setActionStatusFilter('all');
        setActionOwnerFilter('');
        await loadMspActionInbox(true);
        flashPanel('mspccActionsList');
      });
    });
  }

  async function createReminderAction(item) {
    if (!item?.tenant_id || !item?.finding_key) {
      throw new Error('Reminder mist tenant- of sleuteldata.');
    }
    await global.apiFetch?.('/api/actions', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: item.tenant_id,
        title: item.title || 'Operations reminder',
        finding_key: item.finding_key,
        severity: item.severity || 'warning',
        owner: item.owner || '',
        due_date: item.due_date || '',
        status: 'open',
        notes: item.notes || item.detail || '',
        kb_asset_name: '',
      }),
    });
    global.showToast?.('Reminderactie aangemaakt.', 'success');
    actionInboxPreset = 'all';
    await loadMspControlCenter(true);
  }

  async function loadSelectedTenantFocus(forceRefresh = false) {
    const root = document.getElementById('mspccTenantFocusList');
    if (!root) return;
    const tenantId = global.currentTenantId || global._getCurrentTenantId?.() || document.getElementById('tenantSelect')?.value || '';
    if (!tenantId) {
      global._selectedTenantFocus = null;
      root.innerHTML = '<div class="mspcc-empty">Selecteer een tenant om hier actuele tenantdata te tonen.</div>';
      global.updateWorkspaceHeader?.(global._getCurrentSection?.() || global._currentSection || 'overview');
      global.renderNavSignals?.();
      return;
    }
    root.innerHTML = '<div class="mspcc-empty">Tenantcontext laden…</div>';
    try {
      if (forceRefresh && global.cacheClear) {
        global.cacheClear(`/api/tenants/${tenantId}/overview`);
        global.cacheClear(`/api/tenants/${tenantId}/onboarding`);
        global.cacheClear(`/api/tenants/${tenantId}/integrations`);
        global.cacheClear(`/api/tenants/${tenantId}/actions`);
        global.cacheClear(`/api/tenants/${tenantId}/runs`);
      }
      const [tenantRes, overviewRes, onboardingRes, integrationsRes, actionsRes, runsRes, capabilitiesRes, jobsRes, approvalsRes] = await Promise.allSettled([
        global.apiFetchCached(`/api/tenants/${tenantId}`, {}, global.CACHE_TTL.tenants),
        global.apiFetchCached(`/api/tenants/${tenantId}/overview`, {}, global.CACHE_TTL.overview),
        global.apiFetchCached(`/api/tenants/${tenantId}/onboarding`, {}, global.CACHE_TTL.medium),
        global.apiFetchCached(`/api/tenants/${tenantId}/integrations`, {}, global.CACHE_TTL.medium),
        global.apiFetchCached(`/api/tenants/${tenantId}/actions?status=all`, {}, global.CACHE_TTL.short),
        global.apiFetchCached(`/api/tenants/${tenantId}/runs`, {}, global.CACHE_TTL.runs),
        global.apiFetchCached(global.API.capabilities.tenant(tenantId), {}, global.CACHE_TTL.medium),
        global.apiFetchCached('/api/jobs?limit=200', {}, global.CACHE_TTL.short),
        global.apiFetchCached('/api/approvals?limit=200&status=pending', {}, global.CACHE_TTL.short),
      ]);

      const tenant = tenantRes.status === 'fulfilled' ? tenantRes.value : null;
      const overview = overviewRes.status === 'fulfilled' ? overviewRes.value : null;
      const onboarding = onboardingRes.status === 'fulfilled' ? onboardingRes.value : null;
      const integrations = integrationsRes.status === 'fulfilled' ? (integrationsRes.value?.items || []) : [];
      const actions = actionsRes.status === 'fulfilled' ? (actionsRes.value?.items || []) : [];
      const runs = runsRes.status === 'fulfilled' ? (runsRes.value?.items || []) : [];
      const capabilities = capabilitiesRes.status === 'fulfilled' ? (capabilitiesRes.value?.modules || []) : [];
      const jobs = jobsRes.status === 'fulfilled' ? ((jobsRes.value?.items || []).filter((item) => String(item.tenant_id || '') === String(tenantId))) : [];
      const approvals = approvalsRes.status === 'fulfilled' ? ((approvalsRes.value?.items || []).filter((item) => String(item.tenant_id || '') === String(tenantId))) : [];

      const latestRun = Array.isArray(runs) && runs.length ? runs[0] : null;
      const integrationLabels = integrations.slice(0, 3).map((item) => {
        const label = item.integration_type || 'integratie';
        const state = item.app_registration_status || item.gdap_status || item.lighthouse_status || item.status || 'unknown';
        return `<span class="mspcc-meta-chip">${global.escapeHtml(label)} · ${global.escapeHtml(state)}</span>`;
      }).join('');
      const capabilityStats = { ready: 0, validation_required: 0, snapshot_only: 0, config_required: 0, not_implemented: 0, total: 0 };
      capabilities.forEach((module) => {
        (module.subsections || []).forEach((item) => {
          const status = String(item.status || '');
          if (Object.prototype.hasOwnProperty.call(capabilityStats, status)) capabilityStats[status] += 1;
          capabilityStats.total += 1;
        });
      });
      const openActions = actions.filter((item) => !item.is_closed);
      const criticalActions = openActions.filter((item) => String(item.severity || '') === 'critical').length;
      const score = overview?.scoreOverall ?? overview?.secureScorePercentage ?? latestRun?.score_overall ?? '—';
      const critical = overview?.criticalIssues ?? latestRun?.critical_count ?? 0;
      const warnings = overview?.warnings ?? latestRun?.warning_count ?? 0;
      const tenantName = tenant?.tenant_name || tenant?.customer_name || overview?.tenantName || tenantId;

      global._selectedTenantFocus = {
        tenantId,
        tenantName,
        customerName: tenant?.customer_name || '',
        score: score === '—' ? null : Number(score),
        critical: Number(critical || 0),
        warnings: Number(warnings || 0),
        readiness: Number(onboarding?.completion_pct ?? 0),
        openActions: openActions.length,
        criticalActions,
        latestRunAt: latestRun?.completed_at || latestRun?.started_at || overview?.reportDate || '',
        latestRunStatus: String(latestRun?.status || overview?.latestRunStatus || ''),
        integrationsCount: integrations.length,
        capabilityStats,
        secureScore: overview?.secureScorePercentage ?? null,
        mfaCoverage: overview?.mfaCoverage ?? null,
        caPolicies: overview?.caPolicies ?? null,
        authReady: !!onboarding?.auth_ready,
        kbReady: !!onboarding?.kb_ready,
        failedJobs: jobs.filter((item) => String(item.status || '') === 'failed').length,
        pendingApprovals: approvals.filter((item) => String(item.approval_status || '') === 'pending').length,
      };

      root.innerHTML = `
        <article class="mspcc-list-item">
          <div class="mspcc-list-item-top">
            <div>
              <strong>${global.escapeHtml(tenantName)}</strong>
              <div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(tenant?.customer_name || '')} · geselecteerde tenant</div>
            </div>
            <span class="mspcc-pill">${global.escapeHtml(String(score))}${score !== '—' ? '%' : ''}</span>
          </div>
          <div class="mspcc-meta">
            <span class="mspcc-meta-chip">${global.escapeHtml(String(critical))} kritiek</span>
            <span class="mspcc-meta-chip">${global.escapeHtml(String(warnings))} waarschuwingen</span>
            <span class="mspcc-meta-chip">${global.escapeHtml(String(openActions.length))} open acties</span>
            <span class="mspcc-meta-chip">${global.escapeHtml(String(onboarding?.completion_pct ?? 0))}% readiness</span>
          </div>
          <div class="mspcc-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="showSection" data-id="overview">Open tenant</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="showSection" data-id="results">Acties</button>
          </div>
        </article>
        <article class="mspcc-list-item">
          <div class="mspcc-list-item-top">
            <div>
              <strong>Laatste assessment</strong>
              <div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(latestRun?.completed_at ? global.formatDate(latestRun.completed_at) : overview?.reportDate ? global.formatDate(overview.reportDate) : 'Geen recente assessment')}</div>
            </div>
            <span class="mspcc-pill">${global.escapeHtml(String(latestRun?.status || overview?.latestRunStatus || 'onbekend').toUpperCase())}</span>
          </div>
          <div style="color:var(--text-muted,#6b7280);font-size:.84rem;">Secure Score ${global.escapeHtml(String(overview?.secureScorePercentage ?? '—'))}% · CA policies ${global.escapeHtml(String(overview?.caPolicies ?? '—'))} · MFA ${global.escapeHtml(String(overview?.mfaCoverage ?? '—'))}%</div>
        </article>
        <article class="mspcc-list-item">
          <div class="mspcc-list-item-top">
            <div>
              <strong>Onboarding & integraties</strong>
              <div style="color:var(--text-muted,#6b7280);font-size:.82rem;">Auth ${onboarding?.auth_ready ? 'gereed' : 'mist'} · KB ${onboarding?.kb_ready ? 'gevuld' : 'mist'}</div>
            </div>
            <span class="mspcc-pill">${global.escapeHtml(String(integrations.length))} bronnen</span>
          </div>
          <div class="mspcc-meta">${integrationLabels || '<span class="mspcc-meta-chip">Geen integraties zichtbaar</span>'}</div>
          <div class="mspcc-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-mspcc-open-onboarding="1" data-id="${global.escapeHtml(tenantId)}" data-name="${global.escapeHtml(tenantName)}">Onboarding</button>
          </div>
        </article>
        <article class="mspcc-list-item">
          <div class="mspcc-list-item-top">
            <div>
              <strong>Capabilitydekking</strong>
              <div style="color:var(--text-muted,#6b7280);font-size:.82rem;">Werkelijke tenantdekking vanuit capability- en snapshotlaag</div>
            </div>
            <span class="mspcc-pill">${global.escapeHtml(String(capabilityStats.total || 0))} checks</span>
          </div>
          <div class="mspcc-meta">
            <span class="mspcc-meta-chip">${global.escapeHtml(String(capabilityStats.ready || 0))} live ready</span>
            <span class="mspcc-meta-chip">${global.escapeHtml(String(capabilityStats.validation_required || 0))} validatie</span>
            <span class="mspcc-meta-chip">${global.escapeHtml(String(capabilityStats.snapshot_only || 0))} snapshot</span>
            <span class="mspcc-meta-chip">${global.escapeHtml(String(capabilityStats.config_required || 0))} config nodig</span>
            <span class="mspcc-meta-chip">${global.escapeHtml(String(capabilityStats.not_implemented || 0))} niet gebouwd</span>
          </div>
        </article>
        <article class="mspcc-list-item">
          <div class="mspcc-list-item-top">
            <div>
              <strong>Bestaande opvolging</strong>
              <div style="color:var(--text-muted,#6b7280);font-size:.82rem;">Echte tenantacties uit de huidige database</div>
            </div>
            <span class="mspcc-pill">${global.escapeHtml(String(criticalActions))} kritisch</span>
          </div>
          <div class="mspcc-meta">
            ${openActions.length
              ? openActions.slice(0, 4).map((item) => `<span class="mspcc-meta-chip">${global.escapeHtml(item.title || item.finding_key || 'actie')} · ${global.escapeHtml(item.status || 'open')}</span>`).join('')
              : '<span class="mspcc-meta-chip">Geen open acties voor deze tenant</span>'}
          </div>
        </article>
      `;
      global.bindActions(root);
      bindExtraActions(root);
      global.updateWorkspaceHeader?.(global._getCurrentSection?.() || global._currentSection || 'overview');
      global.renderNavSignals?.();
      global.renderContextRail?.(global._getCurrentSection?.() || global._currentSection || 'overview');
    } catch (error) {
      global._selectedTenantFocus = null;
      root.innerHTML = `<div class="mspcc-empty">${global.escapeHtml(`Tenantcontext laden mislukt: ${error.message || error}`)}</div>`;
      global.updateWorkspaceHeader?.(global._getCurrentSection?.() || global._currentSection || 'overview');
      global.renderNavSignals?.();
      global.renderContextRail?.(global._getCurrentSection?.() || global._currentSection || 'overview');
    }
  }

  function buildOwnerSummariesFromActions(items = []) {
    const map = new Map();
    items.forEach((action) => {
      const owner = String(action?.owner || '').trim() || 'Niet toegewezen';
      if (!map.has(owner)) {
        map.set(owner, {
          owner,
          total: 0,
          open: 0,
          in_progress: 0,
          done: 0,
          accepted: 0,
          overdue: 0,
          due_today: 0,
          critical: 0,
        });
      }
      const entry = map.get(owner);
      const status = String(action?.status || 'open');
      entry.total += 1;
      if (Object.prototype.hasOwnProperty.call(entry, status)) entry[status] += 1;
      if (action?.is_overdue) entry.overdue += 1;
      if (action?.days_until_due === 0) entry.due_today += 1;
      if (String(action?.severity || '') === 'critical') entry.critical += 1;
    });
    return Array.from(map.values()).sort((a, b) => (
      (b.overdue - a.overdue) ||
      (b.critical - a.critical) ||
      (b.open - a.open) ||
      a.owner.localeCompare(b.owner)
    ));
  }

  async function fetchMspActionsWithFallback(status = 'all', owner = '', forceRefresh = false, tenantId = null) {
    const path = `/api/msp/actions${global.toQuery({ status, owner, limit: 80, ...(tenantId && { tenant_id: tenantId }) })}`;
    if (forceRefresh && global.cacheClear) global.cacheClear('/api/msp/actions');
    try {
      return await global.apiFetchCached(path, {}, global.CACHE_TTL.short);
    } catch (e) {
      if (!is404Error(e)) throw e;
      const tenantsRes = await global.apiFetchCached('/api/tenants', {}, global.CACHE_TTL.tenants);
      let tenants = Array.isArray(tenantsRes?.items) ? tenantsRes.items : [];
      // If tenantId is specified, filter to only that tenant
      if (tenantId) {
        tenants = tenants.filter(t => t.id === tenantId);
      }
      const tenantActionSets = await Promise.allSettled(
        tenants.map((tenant) => global.apiFetchCached(`/api/tenants/${tenant.id}/actions${global.toQuery({ status, limit: 80 })}`, {}, global.CACHE_TTL.short))
      );
      const items = [];
      tenantActionSets.forEach((res, index) => {
        if (res.status !== 'fulfilled') return;
        const tenant = tenants[index] || {};
        const tenantItems = Array.isArray(res.value?.items) ? res.value.items : [];
        tenantItems.forEach((item) => {
          items.push({
            ...item,
            customer_name: tenant.customer_name || '',
            tenant_name: tenant.tenant_name || tenant.id || '',
          });
        });
      });
      const filtered = owner
        ? items.filter((item) => String(item.owner || '').toLowerCase().includes(String(owner).toLowerCase()))
        : items;
      return { items: filtered };
    }
  }

  async function fetchMspControlCenterData(forceRefresh = false) {
    if (forceRefresh && global.cacheClear) global.cacheClear('/api/msp/control-center');
    const tenantId = window.currentTenantId || localStorage.getItem('local_m365_current_tenant');
    const params = tenantId ? { tenant_id: tenantId } : {};
    try {
      return await global.apiFetchCached('/api/msp/control-center', params, global.CACHE_TTL.short);
    } catch (e) {
      if (!is404Error(e)) throw e;
      const [aggregate, customersRes, approvalsRes, jobsRes, tenantsRes, actionsRes] = await Promise.all([
        global.apiFetchCached('/api/msp/aggregate', params, global.CACHE_TTL.short),
        global.apiFetchCached('/api/customers', {}, global.CACHE_TTL.customers),
        global.apiFetchCached('/api/approvals?status=pending', { tenant_id: tenantId || undefined }, global.CACHE_TTL.short).catch(() => ({ items: [] })),
        global.apiFetchCached('/api/jobs?limit=120', { tenant_id: tenantId || undefined }, global.CACHE_TTL.short).catch(() => ({ items: [] })),
        global.apiFetchCached('/api/tenants', {}, global.CACHE_TTL.tenants),
        fetchMspActionsWithFallback('all', '', forceRefresh, tenantId).catch(() => ({ items: [] })),
      ]);

      const customers = Array.isArray(customersRes?.items) ? customersRes.items : [];
      const approvals = Array.isArray(approvalsRes?.items) ? approvalsRes.items.slice(0, 6) : [];
      const jobsAll = Array.isArray(jobsRes?.items) ? jobsRes.items : [];
      const jobs = jobsAll.filter((j) => ['pending', 'running', 'failed'].includes(String(j.status || ''))).slice(0, 8);
      const tenants = Array.isArray(tenantsRes?.items) ? tenantsRes.items : [];
      const actions = Array.isArray(actionsRes?.items) ? actionsRes.items : [];

      const customerRows = customers.map((item) => {
        const onboarding = item.onboarding_summary || {};
        const health = item.health_summary || {};
        const attentionScore =
          (Number(health.tenants_with_critical || 0) > 0 ? 40 : 0) +
          (Number(health.failed_jobs || 0) > 0 ? 25 : 0) +
          (Number(onboarding.avg_completion_pct || 0) < 75 ? 20 : 0) +
          (Number(item.tenant_count || 0) === 0 ? 15 : 0) +
          (Number(onboarding.enabled_services || 0) === 0 ? 10 : 0);
        return {
          customer_id: item.id,
          customer_name: item.name,
          status: item.status,
          tenant_count: Number(item.tenant_count || 0),
          service_count: Number(item.service_count || 0),
          ready_services: Number(onboarding.ready_services || 0),
          enabled_services: Number(onboarding.enabled_services || 0),
          avg_completion_pct: Number(onboarding.avg_completion_pct || 0),
          avg_score: health.avg_score,
          critical_tenants: Number(health.tenants_with_critical || 0),
          failed_jobs: Number(health.failed_jobs || 0),
          pending_jobs: Number(health.pending_jobs || 0),
          service_tier: item.service_tier,
          support_model: item.support_model,
          sla_name: item.sla_name,
          renewal_date: item.renewal_date,
          latest_total_cost: 0,
          attention_score: attentionScore,
        };
      }).sort((a, b) => (b.attention_score - a.attention_score));

      const renewals = customerRows
        .filter((item) => item.renewal_date)
        .map((item) => {
          const renewal = new Date(item.renewal_date);
          const daysUntil = Number.isNaN(renewal.getTime()) ? null : Math.ceil((renewal.getTime() - Date.now()) / 86400000);
          return {
            customer_id: item.customer_id,
            customer_name: item.customer_name,
            renewal_date: item.renewal_date,
            days_until: daysUntil,
            service_tier: item.service_tier,
            sla_name: item.sla_name,
            latest_total_cost: item.latest_total_cost || 0,
          };
        })
        .sort((a, b) => (a.days_until ?? 99999) - (b.days_until ?? 99999))
        .slice(0, 6);

      const staleTenants = tenants.map((tenant) => {
        const onboarding = tenant.ops_summary?.onboarding || {};
        const jobSummary = tenant.ops_summary?.job_summary || {};
        const assessment = tenant.ops_summary?.assessment_summary || {};
        const capability = tenant.ops_summary?.capability_summary || {};
        const reasons = [];
        if (!tenant.latest_run) reasons.push('geen assessment');
        if (Number(onboarding.completion_pct || 0) < 75) reasons.push('onboarding onvolledig');
        if (Number(jobSummary.failed || 0) > 0) reasons.push('mislukte jobs');
        if (Number(capability.config_required || 0) > 0) reasons.push('configuratie nodig');
        return {
          tenant_id: tenant.id,
          tenant_name: tenant.tenant_name,
          customer_name: tenant.customer_name,
          last_assessment_at: tenant.latest_run?.completed_at || null,
          completion_pct: Number(onboarding.completion_pct || 0),
          critical_count: Number(assessment.critical_count || 0),
          failed_jobs: Number(jobSummary.failed || 0),
          reasons,
        };
      }).filter((item) => item.reasons.length).sort((a, b) => (
        (b.critical_count - a.critical_count) ||
        (b.failed_jobs - a.failed_jobs) ||
        (a.completion_pct - b.completion_pct)
      )).slice(0, 8);

      const priorities = [];
      if (approvals.length) {
        priorities.push({
          tone: 'urgent',
          title: 'Goedkeuringen wachten op besluit',
          detail: `${approvals.length} openstaande approval(s) blokkeren voortgang of governance.`,
          action: { type: 'section', section: 'goedkeuringen', label: 'Open approvals' },
        });
      }
      if (Number(aggregate?.jobs_failed || 0) > 0) {
        priorities.push({
          tone: 'warn',
          title: 'Mislukte jobs vragen aandacht',
          detail: `${aggregate.jobs_failed} job(s) staan op failed en vragen handmatige opvolging.`,
          action: { type: 'section', section: 'jobmonitor', label: 'Bekijk jobs' },
        });
      }
      if (staleTenants.length) {
        priorities.push({
          tone: 'warn',
          title: 'Tenant vraagt directe opvolging',
          detail: `${staleTenants[0].customer_name}: ${staleTenants[0].tenant_name} heeft ${staleTenants[0].reasons.join(', ')}.`,
          action: { type: 'tenant_onboarding', tenant_id: staleTenants[0].tenant_id, tenant_name: staleTenants[0].tenant_name, label: 'Open onboarding' },
        });
      }
      if (customerRows.length) {
        priorities.push({
          tone: customerRows[0].attention_score >= 40 ? 'warn' : 'info',
          title: 'Klant met hoogste aandachtsscore',
          detail: `${customerRows[0].customer_name} · readiness ${customerRows[0].avg_completion_pct}% · ${customerRows[0].critical_tenants} kritieke tenant(s).`,
          action: { type: 'customer', customer_id: customerRows[0].customer_id, label: 'Open klantdetail' },
        });
      }

      return {
        generated_at: new Date().toISOString(),
        summary: {
          total_customers: customers.length,
          active_customers: customers.filter((item) => item.status === 'active').length,
          customers_at_risk: customerRows.filter((item) => item.attention_score >= 40).length,
          total_tenants: Number(aggregate?.total_tenants || tenants.length || 0),
          avg_score: aggregate?.avg_score ?? null,
          critical_tenants: Number(aggregate?.tenants_with_critical || 0),
          ready_tenants: Number(aggregate?.tenants_ready || 0),
          auth_ready_tenants: Number(aggregate?.tenants_auth_ready || 0),
          pending_approvals: approvals.length,
          pending_jobs: Number(aggregate?.jobs_pending_or_running || jobs.length || 0),
          failed_jobs: Number(aggregate?.jobs_failed || 0),
          stale_tenants: staleTenants.length,
          total_subscriptions: 0,
          latest_total_cost: 0,
          renewals_60d: renewals.filter((item) => item.days_until != null && item.days_until <= 60).length,
          tenants_no_assessment: Number(aggregate?.tenants_no_assessment || 0),
        },
        priorities,
        customers: customerRows.slice(0, 8),
        approvals,
        jobs,
        owner_summaries: buildOwnerSummariesFromActions(actions).slice(0, 8),
        renewals,
        stale_tenants: staleTenants,
      };
    }
  }

  async function fetchMspAccessGaps(forceRefresh = false) {
    if (forceRefresh && global.cacheClear) {
      global.cacheClear('/api/customers');
      global.cacheClear('/api/users');
      global.cacheClear('/api/portal-roles');
      global.cacheClear('/api/user-access');
    }
    const [customersRes, usersRes, rolesRes, accessRes] = await Promise.all([
      global.apiFetchCached('/api/customers', {}, global.CACHE_TTL.customers),
      global.apiFetchCached('/api/users', {}, global.CACHE_TTL.roles),
      global.apiFetchCached('/api/portal-roles', {}, global.CACHE_TTL.roles),
      global.apiFetchCached('/api/user-access', {}, global.CACHE_TTL.roles).catch(() => ({ items: [] })),
    ]);
    const customers = Array.isArray(customersRes?.items) ? customersRes.items : [];
    const users = Array.isArray(usersRes?.items) ? usersRes.items : [];
    const roles = Array.isArray(rolesRes?.items) ? rolesRes.items : [];
    const accessItems = Array.isArray(accessRes?.items) ? accessRes.items : [];
    const roleMap = new Map(roles.map((item) => [item.id, item]));
    const userMap = new Map(users.map((item) => [item.id, item]));

    return customers.map((customer) => {
      const customerAccess = accessItems.filter((item) => item.customer_id === customer.id);
      const roleKeys = customerAccess.map((item) => String(roleMap.get(item.portal_role_id)?.role_key || '')).filter(Boolean);
      const assignedUsers = customerAccess.map((item) => userMap.get(item.portal_user_id)).filter(Boolean);
      const hasManager = roleKeys.some((key) => ['msp_super_admin', 'engineer', 'monitoring_operator'].includes(key));
      const hasKb = roleKeys.some((key) => ['msp_super_admin', 'engineer'].includes(key));
      const reasons = [];
      if (!assignedUsers.length) reasons.push('geen toegewezen beheerder');
      if (!hasManager) reasons.push('geen MSP-beheerrol');
      if (!hasKb) reasons.push('geen KB-toegang');
      return {
        customer_id: customer.id,
        customer_name: customer.name || customer.id,
        assigned_count: assignedUsers.length,
        has_manager: hasManager,
        has_kb: hasKb,
        reasons,
        labels: [...new Set(customerAccess.map((item) => String(roleMap.get(item.portal_role_id)?.label || roleMap.get(item.portal_role_id)?.role_key || '')).filter(Boolean))],
      };
    }).filter((item) => item.reasons.length);
  }

  async function fetchMspSecurityExceptions(forceRefresh = false) {
    const url = `/api/msp/security-exceptions?limit=40`;
    if (forceRefresh && global.cacheClear) global.cacheClear(url);
    const data = await global.apiFetchCached(url, {}, global.CACHE_TTL?.customers || 120000).catch(() => ({ items: [] }));
    return Array.isArray(data?.items) ? data.items : [];
  }

  async function fetchMspOnboardingGaps(forceRefresh = false) {
    if (forceRefresh && global.cacheClear) {
      global.cacheClear('/api/customers');
      global.cacheClear('/api/tenants');
      global.cacheClear('/api/baselines/assignments/all');
    }
    const [customersRes, tenantsRes, baselineAssignmentsRes] = await Promise.all([
      global.apiFetchCached('/api/customers', {}, global.CACHE_TTL.customers),
      global.apiFetchCached('/api/tenants', {}, global.CACHE_TTL.tenants),
      global.apiFetchCached('/api/baselines/assignments/all', {}, global.CACHE_TTL.short).catch(() => ({ items: [] })),
    ]);
    const customers = Array.isArray(customersRes?.items) ? customersRes.items : [];
    const tenants = Array.isArray(tenantsRes?.items) ? tenantsRes.items : [];
    const baselineAssignments = Array.isArray(baselineAssignmentsRes?.items) ? baselineAssignmentsRes.items : [];
    const baselineTenantIds = new Set(baselineAssignments.map((item) => String(item.tenant_id || '')).filter(Boolean));

    return customers.map((customer) => {
      const onboarding = customer.onboarding_summary || {};
      const customerTenants = tenants.filter((tenant) => tenant.customer_id === customer.id);
      const reasons = [];
      if (Number(customer.tenant_count || 0) === 0) reasons.push('geen tenant gekoppeld');
      if (Number(onboarding.enabled_services || 0) === 0) reasons.push('geen services gekoppeld');
      if (Number(onboarding.avg_completion_pct || 0) < 75) reasons.push('readiness onder 75%');
      const authMissing = customerTenants.some((tenant) => !tenant.ops_summary?.onboarding?.auth_ready);
      if (authMissing) reasons.push('tenant mist auth-profiel');
      const baselineMissing = customerTenants.length > 0 && customerTenants.some((tenant) => !baselineTenantIds.has(String(tenant.id || '')));
      if (baselineMissing) reasons.push('tenant zonder baseline');
      return {
        customer_id: customer.id,
        customer_name: customer.name || customer.id,
        avg_completion_pct: Number(onboarding.avg_completion_pct || 0),
        enabled_services: Number(onboarding.enabled_services || 0),
        ready_services: Number(onboarding.ready_services || 0),
        tenant_count: Number(customer.tenant_count || 0),
        reasons,
      };
    }).filter((item) => item.reasons.length);
  }

  async function fetchMspCommercialGaps(forceRefresh = false) {
    if (forceRefresh && global.cacheClear) {
      global.cacheClear('/api/customers');
    }
    const customersRes = await global.apiFetchCached('/api/customers', {}, global.CACHE_TTL.customers);
    const customers = Array.isArray(customersRes?.items) ? customersRes.items : [];
    return customers.map((customer) => {
      const onboarding = customer.onboarding_summary || {};
      const finance = customer.finance_summary || {};
      const reasons = [];
      if (!customer.service_tier) reasons.push('geen service tier');
      if (!customer.sla_name) reasons.push('geen SLA');
      if (!customer.renewal_date) reasons.push('geen renewal datum');
      if (Number(finance.subscription_count || 0) === 0) reasons.push('geen abonnementen');
      if (Number(finance.service_gap || 0) > 0) reasons.push(`diensten-gap ${finance.service_gap}`);
      if (Number(finance.stale_cost_snapshots || 0) > 0) reasons.push('verouderde kostendata');
      if (Number(onboarding.enabled_services || 0) > 0 && Number(finance.subscription_count || 0) === 0) reasons.push('wel diensten, geen abonnementen');
      return {
        customer_id: customer.id,
        customer_name: customer.name || customer.id,
        service_tier: customer.service_tier || '',
        sla_name: customer.sla_name || '',
        renewal_date: customer.renewal_date || '',
        latest_total_cost: Number(finance.latest_total_cost || 0),
        subscription_count: Number(finance.subscription_count || 0),
        enabled_services: Number(onboarding.enabled_services || 0),
        reasons,
      };
    }).filter((item) => item.reasons.length);
  }

  function renderMspDaystart(root, controlData, actionsData) {
    if (!root) return;
    const summary = controlData?.summary || {};
    const approvals = Array.isArray(controlData?.approvals) ? controlData.approvals : [];
    const renewals = Array.isArray(controlData?.renewals) ? controlData.renewals : [];
    const staleTenants = Array.isArray(controlData?.stale_tenants) ? controlData.stale_tenants : [];
    const actions = Array.isArray(actionsData?.items) ? actionsData.items : [];
    const overdue = actions.filter((item) => item.is_overdue && !item.is_closed).length;
    const dueToday = actions.filter((item) => item.days_until_due === 0 && !item.is_closed).length;
    const waitingCustomer = actions.filter((item) => /klant|customer|extern/i.test(String(item.notes || '')) && !item.is_closed).length;
    const renewals30 = renewals.filter((item) => item.days_until != null && item.days_until <= 30).length;
    const cards = [
      { tone: overdue > 0 ? 'urgent' : 'info', value: overdue, title: 'Over tijd', body: 'Acties die direct opvolging nodig hebben omdat de deadline is verstreken.', action: { type: 'inbox_preset', preset: 'overdue' }, cta: 'Open inbox' },
      { tone: dueToday > 0 ? 'warn' : 'info', value: dueToday, title: 'Vandaag vervalt', body: 'Open acties die vandaag hun streefdatum bereiken.', action: { type: 'inbox_preset', preset: 'due_today' }, cta: 'Bekijk acties' },
      { tone: approvals.length > 0 ? 'urgent' : 'info', value: approvals.length, title: 'Wacht op approval', body: 'Goedkeuringen die de MSP-workflow of onboarding blokkeren.', action: { type: 'section', section: 'goedkeuringen' }, cta: 'Open approvals' },
      { tone: Number(summary.failed_jobs || 0) > 0 ? 'warn' : 'info', value: Number(summary.failed_jobs || 0), title: 'Failed jobs', body: 'Achtergrondtaken die handmatige opvolging of retry nodig hebben.', action: { type: 'section', section: 'jobmonitor' }, cta: 'Open jobs' },
      { tone: renewals30 > 0 ? 'warn' : 'info', value: renewals30, title: 'Renewals 30d', body: 'Klanten waarbij contract of serviceverlenging binnenkort speelt.', action: { type: 'section', section: 'klantenbeheer' }, cta: 'Open klanten' },
      { tone: staleTenants.length > 0 ? 'warn' : 'info', value: staleTenants.length, title: 'Wacht op tenant', body: 'Tenants met verouderde assessment, incomplete onboarding of configuratiewerk.', action: { type: 'section', section: 'tenantoverzicht' }, cta: 'Open tenants' },
      { tone: waitingCustomer > 0 ? 'warn' : 'info', value: waitingCustomer, title: 'Wacht op klant', body: 'Acties waarin de notities aangeven dat klantreactie of externe input nodig is.', action: { type: 'inbox_preset', preset: 'waiting_customer' }, cta: 'Bekijk acties' },
    ];
    root.innerHTML = cards.map((item) => `
      <article class="mspcc-daystart-card mspcc-daystart-card--${global.escapeHtml(item.tone)}">
        <div class="mspcc-daystart-top">
          <span class="mspcc-pill">${global.escapeHtml(item.title.toUpperCase())}</span>
          <span class="mspcc-daystart-value">${global.escapeHtml(String(item.value))}</span>
        </div>
        <h4>${global.escapeHtml(item.title)}</h4>
        <p>${global.escapeHtml(item.body)}</p>
        <div class="mspcc-actions">
          ${item.action?.type === 'section'
            ? `<button type="button" class="btn btn-secondary btn-sm" data-action="showSection" data-id="${global.escapeHtml(item.action.section)}">${global.escapeHtml(item.cta)}</button>`
            : `<button type="button" class="btn btn-secondary btn-sm" data-mspcc-daystart-actions="1" data-mspcc-preset="${global.escapeHtml(item.action?.preset || 'all')}">${global.escapeHtml(item.cta)}</button>`}
        </div>
      </article>`).join('');
    global.bindActions(root);
    root.querySelectorAll('[data-mspcc-daystart-actions]').forEach((btn) => {
      if (btn._actionBound) return;
      btn._actionBound = true;
      btn.addEventListener('click', () => {
        setActionOwnerFilter('');
        setActionStatusFilter('all');
        actionInboxPreset = btn.dataset.mspccPreset || 'all';
        loadMspActionInbox(true);
        flashPanel('mspccActionsList');
      });
    });
  }

  function bindExtraActions(root) {
    root?.querySelectorAll('[data-mspcc-open-onboarding]').forEach((btn) => {
      if (btn._actionBound) return;
      btn._actionBound = true;
      btn.addEventListener('click', () => global.openTenantOnboardingManager?.(btn.dataset.id, btn.dataset.name || btn.dataset.id, null));
    });
    root?.querySelectorAll('[data-mspcc-owner]').forEach((btn) => {
      if (btn._actionBound) return;
      btn._actionBound = true;
      btn.addEventListener('click', () => {
        const ownerInput = document.getElementById('mspccActionOwnerFilter');
        if (ownerInput) ownerInput.value = btn.dataset.mspccOwner || '';
        loadMspActionInbox(true);
      });
    });
    root?.querySelectorAll('[data-mspcc-customer-access]').forEach((btn) => {
      if (btn._actionBound) return;
      btn._actionBound = true;
      btn.addEventListener('click', () => global.openCustomerAccessManager?.(btn.dataset.id, btn.dataset.name || btn.dataset.id));
    });
    root?.querySelectorAll('[data-mspcc-playbook]').forEach((btn) => {
      if (btn._actionBound) return;
      btn._actionBound = true;
      btn.addEventListener('click', () => {
        const controlKey = btn.dataset.mspccPlaybook || '';
        const findingTitle = btn.dataset.finding || controlKey;
        if (typeof window.renderPlaybookModal === 'function') {
          window.renderPlaybookModal(controlKey, { findingTitle });
        }
      });
    });
  }

  async function loadMspActionInbox(forceRefresh = false) {
    const root = document.getElementById('mspccActionsList');
    if (!root) return;
    const status = document.getElementById('mspccActionStatusFilter')?.value || 'all';
    const owner = (document.getElementById('mspccActionOwnerFilter')?.value || '').trim();
    if (forceRefresh && global.cacheClear) global.cacheClear('/api/msp/actions');
    root.innerHTML = '<div class="mspcc-empty">Acties laden…</div>';
    try {
      const data = await fetchMspActionsWithFallback(status, owner, forceRefresh, window.currentTenantId);
      const allItems = Array.isArray(data.items) ? data.items : [];
      const items = applyInboxPreset(allItems, actionInboxPreset);
      global._mspActionInboxCache = items;
      global._actionsPanelCache = items;
      if (!items.length) {
        root.innerHTML = `<div class="mspcc-empty">Geen acties gevonden voor deze filters${actionInboxPreset !== 'all' ? ` (${global.escapeHtml(actionInboxPreset)})` : ''}.</div>`;
        return;
      }
      root.innerHTML = items.map((item) => `
        <article class="mspcc-list-item">
          <div class="mspcc-list-item-top">
            <div>
              <strong>${global.escapeHtml(item.title || item.finding_key || 'Actie')}</strong>
              <div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(item.customer_name || 'Onbekende klant')} · ${global.escapeHtml(item.tenant_name || item.tenant_id || 'Tenant')}</div>
            </div>
            <span class="mspcc-pill">${global.escapeHtml(String(item.status || 'open').toUpperCase())}</span>
          </div>
          <div style="color:var(--text-muted,#6b7280);font-size:.84rem;">Owner: ${global.escapeHtml(item.owner || 'Niet toegewezen')} · Due: ${global.escapeHtml(item.due_date || 'Geen datum')}</div>
          <div class="mspcc-meta">
            <span class="mspcc-meta-chip">${global.escapeHtml(item.finding_key || 'Geen key')}</span>
            <span class="mspcc-meta-chip">${global.escapeHtml(item.severity || 'warning')}</span>
            <span class="mspcc-meta-chip">${global.escapeHtml(item.sla_label || 'SLA')}</span>
            ${item.kb_asset_name ? `<span class="mspcc-meta-chip">${global.escapeHtml(item.kb_asset_name)}</span>` : ''}
          </div>
          <div class="mspcc-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="viewFindingAction" data-id="${global.escapeHtml(item.id || '')}">Details</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="setStatus" data-id="${global.escapeHtml(item.id || '')}" data-extra="in_progress">In progress</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="setStatus" data-id="${global.escapeHtml(item.id || '')}" data-extra="done">Done</button>
          </div>
        </article>`).join('');
      global.bindActions(root);
    } catch (e) {
      root.innerHTML = `<div class="mspcc-empty">${global.escapeHtml(`Actie inbox laden mislukt: ${e.message || e}`)}</div>`;
    }
  }

  async function applyMspSavedView(viewKey) {
    if (viewKey === 'approvals') {
      global.showSection?.('goedkeuringen');
      setApprovalFilter('pending');
      await global.loadGoedkeuringen?.('pending');
      return;
    }
    if (viewKey === 'failed_jobs') {
      global.showSection?.('jobmonitor');
      setJobMonitorFilter('failed');
      await global.loadJobMonitor?.('failed');
      return;
    }
    if (viewKey === 'overdue_actions') {
      global.showSection?.('mspcontrolcenter');
      setActionStatusFilter('all');
      setActionOwnerFilter('');
      actionInboxPreset = 'overdue';
      await loadMspActionInbox(true);
      flashPanel('mspccActionsList');
      return;
    }
    if (viewKey === 'access_gaps') {
      global.showSection?.('mspcontrolcenter');
      flashPanel('mspccAccessList');
      return;
    }
    if (viewKey === 'onboarding_gaps') {
      global.showSection?.('mspcontrolcenter');
      flashPanel('mspccOnboardingList');
      return;
    }
    if (viewKey === 'my_work') {
      global.showSection?.('mspcontrolcenter');
      setActionStatusFilter('all');
      setActionOwnerFilter(global._getCurrentDisplayName?.() || global._currentDisplayName || '');
      actionInboxPreset = 'my_work';
      await loadMspActionInbox(true);
      flashPanel('mspccActionsList');
    }
  }

  function setMspActionInboxPreset(preset = 'all') {
    actionInboxPreset = preset || 'all';
  }

  async function loadMspControlCenter(forceRefresh = false) {
    const kpiRoot = document.getElementById('mspccKpis');
    const summaryRoot = document.getElementById('mspccSummary');
    const daystartRoot = document.getElementById('mspccDaystartGrid');
    const priorityRoot = document.getElementById('mspccPriorityGrid');
    const customersRoot = document.getElementById('mspccCustomersList');
    const tenantFocusRoot = document.getElementById('mspccTenantFocusList');
    const opsRoot = document.getElementById('mspccOpsList');
    const actionsRoot = document.getElementById('mspccActionsList');
    const remindersRoot = document.getElementById('mspccRemindersList');
    const ownersRoot = document.getElementById('mspccOwnersList');
    const accessRoot = document.getElementById('mspccAccessList');
    const onboardingRoot = document.getElementById('mspccOnboardingList');
    const commercialRoot = document.getElementById('mspccCommercialList');
    const renewalsRoot = document.getElementById('mspccRenewalsList');
    const tenantsRoot = document.getElementById('mspccTenantsList');
    const exceptionsRoot = document.getElementById('mspccExceptionsList');
    if (!kpiRoot || !summaryRoot || !daystartRoot || !priorityRoot || !customersRoot || !tenantFocusRoot || !opsRoot || !actionsRoot || !ownersRoot || !accessRoot || !onboardingRoot || !commercialRoot || !renewalsRoot || !tenantsRoot || !remindersRoot) return;
    if (forceRefresh && global.cacheClear) global.cacheClear('/api/msp/control-center');
    kpiRoot.innerHTML = '<div class="mspcc-kpi-card"><span class="mspcc-kpi-label">Status</span><span class="mspcc-kpi-value">Laden…</span></div>';
    summaryRoot.innerHTML = '';
    daystartRoot.innerHTML = '<div class="mspcc-empty">Dagstart laden…</div>';
    priorityRoot.innerHTML = '<div class="mspcc-empty">Prioriteiten laden…</div>';
    customersRoot.innerHTML = '<div class="mspcc-empty">Klanten laden…</div>';
    tenantFocusRoot.innerHTML = '<div class="mspcc-empty">Tenantcontext laden…</div>';
    opsRoot.innerHTML = '<div class="mspcc-empty">Operations laden…</div>';
    actionsRoot.innerHTML = '<div class="mspcc-empty">Acties laden…</div>';
    remindersRoot.innerHTML = '<div class="mspcc-empty">Reminders laden…</div>';
    ownersRoot.innerHTML = '<div class="mspcc-empty">Owners laden…</div>';
    accessRoot.innerHTML = '<div class="mspcc-empty">Toegang laden…</div>';
    onboardingRoot.innerHTML = '<div class="mspcc-empty">Onboarding laden…</div>';
    commercialRoot.innerHTML = '<div class="mspcc-empty">Commercieel laden…</div>';
    renewalsRoot.innerHTML = '<div class="mspcc-empty">Renewals laden…</div>';
    tenantsRoot.innerHTML = '<div class="mspcc-empty">Tenants laden…</div>';
    if (exceptionsRoot) exceptionsRoot.innerHTML = '<div class="mspcc-empty">Security-uitzonderingen laden…</div>';

    try {
      const [data, allActionsData] = await Promise.all([
        fetchMspControlCenterData(forceRefresh),
        fetchMspActionsWithFallback('all', '', forceRefresh).catch(() => ({ items: [] })),
      ]);
      global._mspControlCenterCache = data;
      global._mspAllActionsCache = Array.isArray(allActionsData?.items) ? allActionsData.items : [];
      const summary = data.summary || {};
      global._goedkeuringenCache = Array.isArray(data.approvals) ? data.approvals : global._goedkeuringenCache;
      global._jobMonitorCache = Array.isArray(data.jobs) ? data.jobs : global._jobMonitorCache;

      const kpis = [
        ['Klanten', summary.total_customers ?? '—'],
        ['Tenants', summary.total_tenants ?? '—'],
        ['Gem. score', summary.avg_score != null ? `${summary.avg_score}%` : '—'],
        ['Open approvals', summary.pending_approvals ?? '—'],
        ['Open jobs', summary.pending_jobs ?? '—'],
        ['Jobs failed', summary.failed_jobs ?? '—'],
        ['Renewals 60d', summary.renewals_60d ?? '—'],
        ['Portfolio kosten', mspccCurrency(summary.latest_total_cost || 0)],
      ];
      kpiRoot.innerHTML = kpis.map(([label, value]) => `<div class="mspcc-kpi-card"><span class="mspcc-kpi-label">${global.escapeHtml(label)}</span><span class="mspcc-kpi-value">${global.escapeHtml(String(value))}</span></div>`).join('');
      summaryRoot.innerHTML = `
        <span class="mspcc-meta-chip">${global.escapeHtml(String(summary.active_customers || 0))} actief</span>
        <span class="mspcc-meta-chip">${global.escapeHtml(String(summary.customers_at_risk || 0))} klanten met aandacht</span>
        <span class="mspcc-meta-chip">${global.escapeHtml(String(summary.critical_tenants || 0))} kritieke tenants</span>
        <span class="mspcc-meta-chip">${global.escapeHtml(String(summary.ready_tenants || 0))} readiness-gereed</span>
        <span class="mspcc-meta-chip">${global.escapeHtml(String(summary.auth_ready_tenants || 0))} auth-ready</span>
        <span class="mspcc-meta-chip">${global.escapeHtml(String(summary.total_subscriptions || 0))} abonnementen</span>
        <span class="mspcc-meta-chip">${global.escapeHtml(String(summary.tenants_no_assessment || 0))} zonder assessment</span>
        <span class="mspcc-meta-chip">${global.escapeHtml(String(summary.stale_tenants || 0))} stale tenants</span>`;

      const priorities = Array.isArray(data.priorities) ? data.priorities : [];
      priorityRoot.innerHTML = priorities.length ? priorities.map((item) => `
        <article class="mspcc-priority-card mspcc-priority-card--${global.escapeHtml(item.tone || 'info')}">
          <div class="mspcc-priority-top"><span class="mspcc-pill">${global.escapeHtml((item.tone || 'info').toUpperCase())}</span></div>
          <div><strong>${global.escapeHtml(item.title || 'Prioriteit')}</strong><p style="margin:.35rem 0 0;color:var(--text-muted,#6b7280);">${global.escapeHtml(item.detail || '')}</p></div>
          <div class="mspcc-actions">${mspccActionButton(item.action, 'btn btn-secondary btn-sm')}</div>
        </article>`).join('') : '<div class="mspcc-empty">Geen centrale prioriteiten gevonden.</div>';

      const customers = Array.isArray(data.customers) ? data.customers : [];
      await loadSelectedTenantFocus(forceRefresh);
      customersRoot.innerHTML = customers.length ? customers.map((item) => `
        <article class="mspcc-list-item">
          <div class="mspcc-list-item-top"><div><strong>${global.escapeHtml(item.customer_name || 'Klant')}</strong><div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(item.service_tier || 'Tier onbekend')} · ${global.escapeHtml(item.sla_name || 'SLA onbekend')}</div></div><span class="mspcc-pill">${global.escapeHtml(mspccAttentionTone(item).toUpperCase())}</span></div>
          <div class="mspcc-meta"><span class="mspcc-meta-chip">Gereedheid ${global.escapeHtml(String(item.avg_completion_pct || 0))}%</span><span class="mspcc-meta-chip">${global.escapeHtml(String(item.critical_tenants || 0))} kritieke tenants</span><span class="mspcc-meta-chip">${global.escapeHtml(String(item.failed_jobs || 0))} mislukte taken</span><span class="mspcc-meta-chip">${global.escapeHtml(String(item.ready_services || 0))}/${global.escapeHtml(String(item.enabled_services || 0))} services gereed</span><span class="mspcc-meta-chip">${global.escapeHtml(mspccCurrency(item.latest_total_cost || 0))}</span></div>
          <div class="mspcc-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="viewCustomer" data-id="${global.escapeHtml(item.customer_id || '')}">Details</button><button type="button" class="btn btn-secondary btn-sm" data-action="editCustomer" data-id="${global.escapeHtml(item.customer_id || '')}">Bewerken</button></div>
        </article>`).join('') : '<div class="mspcc-empty">Nog geen klanten met prioriteit gevonden.</div>';

      const approvals = Array.isArray(data.approvals) ? data.approvals : [];
      const approvalRequests = Array.isArray(data.approval_requests) ? data.approval_requests : [];
      const jobs = Array.isArray(data.jobs) ? data.jobs : [];
      const recentJobs = Array.isArray(data.jobs_recent) ? data.jobs_recent : [];
      opsRoot.innerHTML = `
        ${approvals.length ? approvals.map((item) => `<article class="mspcc-list-item"><div class="mspcc-list-item-top"><div><strong>${global.escapeHtml(item.action_type || item.section || 'Goedkeuring')}</strong><div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(item.requested_by || 'Onbekend')} · ${global.escapeHtml(global.formatDate(item.requested_at))}</div></div><span class="mspcc-pill">WACHT</span></div><div style="color:var(--text-muted,#6b7280);font-size:.84rem;">${global.escapeHtml(item.reason || 'Geen reden')}</div><div class="mspcc-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="viewApproval" data-id="${global.escapeHtml(item.id || '')}">Details</button></div></article>`).join('') : ''}
        ${approvalRequests.length ? approvalRequests.map((item) => `<article class="mspcc-list-item"><div class="mspcc-list-item-top"><div><strong>${global.escapeHtml(item.action_name || item.action_key || 'Approval request')}</strong><div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(item.requested_by || 'Onbekend')} · ${global.escapeHtml(global.formatDate(item.requested_at))}</div></div><span class="mspcc-pill">${global.escapeHtml(String(item.status || 'pending').toUpperCase())}</span></div><div style="color:var(--text-muted,#6b7280);font-size:.84rem;">${global.escapeHtml(item.action_description || item.action_key || 'Governance-verzoek')}</div></article>`).join('') : ''}
        ${(jobs.length ? jobs : recentJobs).length ? (jobs.length ? jobs : recentJobs).map((item) => `<article class="mspcc-list-item"><div class="mspcc-list-item-top"><div><strong>${global.escapeHtml((global._jmJobLabels || {})[item.job_type] || item.job_type || 'Job')}</strong><div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(item.tenant_id || 'Globaal')} · ${global.escapeHtml(global.formatDate(item.scheduled_at || item.created_at))}</div></div><span class="mspcc-pill">${global.escapeHtml(String(item.status || 'pending').toUpperCase())}</span></div><div style="color:var(--text-muted,#6b7280);font-size:.84rem;">${global.escapeHtml(item.error_message || 'Geen foutmelding')}</div><div class="mspcc-actions">${item.id ? `<button type="button" class="btn btn-secondary btn-sm" data-action="viewJob" data-id="${global.escapeHtml(item.id || '')}">Details</button>` : ''}</div></article>`).join('') : ''}
        ${(!approvals.length && !approvalRequests.length && !(jobs.length ? jobs : recentJobs).length) ? '<div class="mspcc-empty">Nog geen approvals of jobs beschikbaar.</div>' : ''}`;

      const owners = Array.isArray(data.owner_summaries) ? data.owner_summaries : [];
      ownersRoot.innerHTML = owners.length ? owners.map((item) => `<article class="mspcc-list-item"><div class="mspcc-list-item-top"><div><strong>${global.escapeHtml(item.owner || 'Niet toegewezen')}</strong><div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(String(item.total || 0))} totale actie(s)</div></div><span class="mspcc-pill">${global.escapeHtml(String(item.overdue || 0))} overdue</span></div><div class="mspcc-meta"><span class="mspcc-meta-chip">${global.escapeHtml(String(item.open || 0))} open</span><span class="mspcc-meta-chip">${global.escapeHtml(String(item.in_progress || 0))} in progress</span><span class="mspcc-meta-chip">${global.escapeHtml(String(item.due_today || 0))} vandaag</span><span class="mspcc-meta-chip">${global.escapeHtml(String(item.critical || 0))} kritiek</span></div><div class="mspcc-actions"><button type="button" class="btn btn-secondary btn-sm" data-mspcc-owner="${global.escapeHtml(item.owner || '')}">Filter acties</button></div></article>`).join('') : '<div class="mspcc-empty">Nog geen owner- of teambelasting beschikbaar.</div>';

      accessRoot.innerHTML = '<div class="mspcc-empty">Toegangsgaten laden…</div>';
      onboardingRoot.innerHTML = '<div class="mspcc-empty">Onboarding-gaten laden…</div>';
      commercialRoot.innerHTML = '<div class="mspcc-empty">Commerciële gaten laden…</div>';

      const renewals = Array.isArray(data.renewals) ? data.renewals : [];
      renewalsRoot.innerHTML = renewals.length ? renewals.map((item) => `<article class="mspcc-list-item"><div class="mspcc-list-item-top"><div><strong>${global.escapeHtml(item.customer_name || 'Klant')}</strong><div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(item.service_tier || 'Tier onbekend')} · ${global.escapeHtml(item.sla_name || 'SLA onbekend')}</div></div><span class="mspcc-pill">${global.escapeHtml(String(item.days_until ?? '—'))} dgn</span></div><div class="mspcc-meta"><span class="mspcc-meta-chip">Verlenging ${global.escapeHtml(item.renewal_date || 'onbekend')}</span><span class="mspcc-meta-chip">${global.escapeHtml(mspccCurrency(item.latest_total_cost || 0))}</span></div><div class="mspcc-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="editCustomer" data-id="${global.escapeHtml(item.customer_id || '')}">Open klantkaart</button></div></article>`).join('') : '<div class="mspcc-empty">Geen aankomende renewals in beeld.</div>';

      const staleTenants = Array.isArray(data.stale_tenants) ? data.stale_tenants : [];
      tenantsRoot.innerHTML = staleTenants.length ? staleTenants.map((item) => `<article class="mspcc-list-item"><div class="mspcc-list-item-top"><div><strong>${global.escapeHtml(item.customer_name || '')} · ${global.escapeHtml(item.tenant_name || item.tenant_id || 'Tenant')}</strong><div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(item.last_assessment_at ? global.formatDate(item.last_assessment_at) : 'Nog geen assessment')}</div></div><span class="mspcc-pill">${global.escapeHtml(String(item.completion_pct || 0))}%</span></div><div class="mspcc-meta">${(item.reasons || []).map((reason) => `<span class="mspcc-meta-chip">${global.escapeHtml(reason)}</span>`).join('')}<span class="mspcc-meta-chip">${global.escapeHtml(String(item.critical_count || 0))} kritiek</span><span class="mspcc-meta-chip">${global.escapeHtml(String(item.failed_jobs || 0))} mislukte taken</span></div><div class="mspcc-actions"><button type="button" class="btn btn-secondary btn-sm" data-mspcc-open-onboarding="1" data-id="${global.escapeHtml(item.tenant_id || '')}" data-name="${global.escapeHtml(item.tenant_name || item.tenant_id || '')}">Open onboarding</button><button type="button" class="btn btn-secondary btn-sm" data-action="showSection" data-id="tenantoverzicht">Tenant overzicht</button></div></article>`).join('') : '<div class="mspcc-empty">Geen tenants met directe opvolging gevonden.</div>';

      [priorityRoot, customersRoot, opsRoot, actionsRoot, ownersRoot, accessRoot, onboardingRoot, commercialRoot, renewalsRoot, tenantsRoot, remindersRoot].forEach((root) => global.bindActions(root));
      [priorityRoot, ownersRoot, tenantsRoot].forEach(bindExtraActions);
      const actionsData = allActionsData;
      renderMspDaystart(daystartRoot, data, actionsData);
      renderReminderList(remindersRoot, data.approvals || [], data.approval_requests || [], data.jobs || [], data.jobs_recent || [], global._mspAllActionsCache || [], data.stale_tenants || [], global.currentTenantId || global._getCurrentTenantId?.() || '');
      await loadMspActionInbox(forceRefresh);
      global.renderContextRail?.('mspcontrolcenter');

      Promise.allSettled([
        fetchMspAccessGaps(forceRefresh),
        fetchMspOnboardingGaps(forceRefresh),
        fetchMspCommercialGaps(forceRefresh),
        fetchMspSecurityExceptions(forceRefresh),
      ]).then((results) => {
        const [accessRes, onboardingRes, commercialRes, exceptionsRes] = results;
        const accessGaps = accessRes.status === 'fulfilled' ? accessRes.value : [];
        const onboardingGaps = onboardingRes.status === 'fulfilled' ? onboardingRes.value : [];
        const commercialGaps = commercialRes.status === 'fulfilled' ? commercialRes.value : [];
        const exceptions = exceptionsRes.status === 'fulfilled' ? exceptionsRes.value : [];

        accessRoot.innerHTML = accessGaps.length ? accessGaps.slice(0, 8).map((item) => `<article class="mspcc-list-item"><div class="mspcc-list-item-top"><div><strong>${global.escapeHtml(item.customer_name || 'Klant')}</strong><div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(String(item.assigned_count || 0))} toegewezen gebruiker(s)</div></div><span class="mspcc-pill">${global.escapeHtml(String(item.reasons.length || 0))} gaten</span></div><div class="mspcc-meta">${item.reasons.map((reason) => `<span class="mspcc-meta-chip">${global.escapeHtml(reason)}</span>`).join('')}${item.labels.length ? item.labels.map((label) => `<span class="mspcc-meta-chip">${global.escapeHtml(label)}</span>`).join('') : ''}</div><div class="mspcc-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="viewCustomer" data-id="${global.escapeHtml(item.customer_id || '')}">Klantdetail</button><button type="button" class="btn btn-secondary btn-sm" data-mspcc-customer-access="1" data-id="${global.escapeHtml(item.customer_id || '')}" data-name="${global.escapeHtml(item.customer_name || '')}">Toegang beheren</button></div></article>`).join('') : '<div class="mspcc-empty">Geen toegangsgaten gevonden.</div>';
        onboardingRoot.innerHTML = onboardingGaps.length ? onboardingGaps.slice(0, 8).map((item) => `<article class="mspcc-list-item"><div class="mspcc-list-item-top"><div><strong>${global.escapeHtml(item.customer_name || 'Klant')}</strong><div style="color:var(--text-muted,#6b7280);font-size:.82rem;">Gereedheid ${global.escapeHtml(String(item.avg_completion_pct || 0))}% · ${global.escapeHtml(String(item.ready_services || 0))}/${global.escapeHtml(String(item.enabled_services || 0))} diensten gereed</div></div><span class="mspcc-pill">${global.escapeHtml(String(item.reasons.length || 0))} gaten</span></div><div class="mspcc-meta">${item.reasons.map((reason) => `<span class="mspcc-meta-chip">${global.escapeHtml(reason)}</span>`).join('')}<span class="mspcc-meta-chip">${global.escapeHtml(String(item.tenant_count || 0))} tenants</span></div><div class="mspcc-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="viewCustomer" data-id="${global.escapeHtml(item.customer_id || '')}">Klantdetail</button><button type="button" class="btn btn-secondary btn-sm" data-action="showSection" data-id="klantenbeheer">Klantenbeheer</button></div></article>`).join('') : '<div class="mspcc-empty">Geen onboarding-gaten gevonden.</div>';
        commercialRoot.innerHTML = commercialGaps.length ? commercialGaps.slice(0, 8).map((item) => `<article class="mspcc-list-item"><div class="mspcc-list-item-top"><div><strong>${global.escapeHtml(item.customer_name || 'Klant')}</strong><div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(item.service_tier || 'Tier ontbreekt')} · ${global.escapeHtml(item.sla_name || 'SLA ontbreekt')}</div></div><span class="mspcc-pill">${global.escapeHtml(String(item.reasons.length || 0))} gaten</span></div><div class="mspcc-meta">${item.reasons.map((reason) => `<span class="mspcc-meta-chip">${global.escapeHtml(reason)}</span>`).join('')}<span class="mspcc-meta-chip">${global.escapeHtml(String(item.subscription_count || 0))} abonnementen</span><span class="mspcc-meta-chip">${global.escapeHtml(String(item.enabled_services || 0))} diensten</span><span class="mspcc-meta-chip">${global.escapeHtml(mspccCurrency(item.latest_total_cost || 0))}</span></div><div class="mspcc-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="editCustomer" data-id="${global.escapeHtml(item.customer_id || '')}">Klantkaart</button><button type="button" class="btn btn-secondary btn-sm" data-action="showSection" data-id="kosten">Kosten</button></div></article>`).join('') : '<div class="mspcc-empty">Geen commerciële gaten gevonden.</div>';

        if (exceptionsRoot) {
          const statusPill = (status) => {
            const cls = status === 'critical' ? 'mspcc-pill--crit' : 'mspcc-pill--warn';
            const label = status === 'critical' ? 'KRITIEK' : 'AANDACHT';
            return `<span class="mspcc-pill ${cls}">${label}</span>`;
          };
          exceptionsRoot.innerHTML = exceptions.length ? exceptions.slice(0, 20).map((item) => `
            <article class="mspcc-list-item">
              <div class="mspcc-list-item-top">
                <div>
                  <strong>${global.escapeHtml(item.title || item.control || 'Bevinding')}</strong>
                  <div style="color:var(--text-muted,#6b7280);font-size:.82rem;">${global.escapeHtml(item.tenant_name || item.tenant_id || 'Onbekende tenant')} · ${global.escapeHtml(item.control || '')}</div>
                </div>
                ${statusPill(item.status)}
              </div>
              ${item.finding ? `<div style="color:var(--text-muted,#6b7280);font-size:.84rem;">${global.escapeHtml(item.finding)}</div>` : ''}
              <div class="mspcc-meta"><span class="mspcc-meta-chip">${global.escapeHtml(item.scanned_at ? new Date(item.scanned_at).toLocaleDateString('nl-NL') : '')}</span></div>
              <div class="mspcc-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="showSection" data-id="tenantoverzicht">Open tenant</button>${typeof window.getPlaybookForControl === 'function' && window.getPlaybookForControl(item.control) ? `<button type="button" class="btn btn-secondary btn-sm" data-mspcc-playbook="${global.escapeHtml(item.control || '')}" data-finding="${global.escapeHtml(item.title || item.control || '')}">Playbook</button>` : ''}</div>
            </article>`).join('') : '<div class="mspcc-empty">Geen cross-tenant security-uitzonderingen gevonden.</div>';
          global.bindActions(exceptionsRoot);
          bindExtraActions(exceptionsRoot);
        }

        [accessRoot, onboardingRoot, commercialRoot].forEach((root) => {
          global.bindActions(root);
          bindExtraActions(root);
        });
      });
    } catch (e) {
      const message = `MSP Control Center laden mislukt: ${e.message || e}`;
      [kpiRoot, daystartRoot, priorityRoot, customersRoot, tenantFocusRoot, opsRoot, actionsRoot, ownersRoot, accessRoot, onboardingRoot, commercialRoot, renewalsRoot, tenantsRoot, remindersRoot]
        .forEach((root) => { if (root) root.innerHTML = `<div class="mspcc-empty">${global.escapeHtml(message)}</div>`; });
    }
  }

  global.DenjoyMspControlCenter = {
    loadMspControlCenter,
    loadMspActionInbox,
    applyMspSavedView,
    setMspActionInboxPreset,
    loadSelectedTenantFocus,
  };
  global.applyMspSavedView = applyMspSavedView;
  global.setMspActionInboxPreset = setMspActionInboxPreset;
  global.loadSelectedTenantFocus = loadSelectedTenantFocus;
})(window);
