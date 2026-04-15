(function initDenjoyMspOverview(global) {
  'use strict';

  function getCurrentSection() {
    if (typeof global._getCurrentSection === 'function') {
      return global._getCurrentSection() || global._currentSection || 'overview';
    }
    return global._currentSection || 'overview';
  }

  function getActiveTenantId() {
    return global._getCurrentTenantId?.() || global.currentTenantId || document.getElementById('tenantSelect')?.value || null;
  }

  function getCurrentTenantName() {
    const tenants = Array.isArray(global.allTenants) ? global.allTenants : [];
    const tenantId = getActiveTenantId();
    const tenant = tenants.find((item) => item.id === tenantId);
    return tenant?.tenant_name || tenant?.customer_name || tenantId || '';
  }

  function getSelectedTenantFocus() {
    const tenantId = getActiveTenantId();
    const focus = global._selectedTenantFocus;
    if (focus?.tenantId && focus.tenantId === tenantId) return focus;
    const tenants = Array.isArray(global.allTenants) ? global.allTenants : [];
    const tenant = tenants.find((item) => item.id === tenantId);
    const latestRun = tenant?.latest_run || {};
    return {
      tenantId,
      tenantName: tenant?.customer_name || tenant?.tenant_name || tenantId || '',
      score: latestRun.score_overall ?? null,
      critical: latestRun.critical_count ?? null,
      warnings: latestRun.warning_count ?? null,
      latestRunAt: latestRun.completed_at || latestRun.started_at || '',
      readiness: tenant?.ops_summary?.onboarding?.completion_pct ?? null,
      openActions: null,
      integrationsCount: tenant?.ops_summary?.integrations_total ?? null,
    };
  }

  function buildQuickContextAction(label, action, extra = {}) {
    const attrs = Object.entries(extra).map(([key, value]) => `data-${key}="${global.escapeHtml(String(value ?? ''))}"`).join(' ');
    return `<button type="button" class="bev-inline-btn" data-context-action="${global.escapeHtml(action)}" ${attrs}>${global.escapeHtml(label)}</button>`;
  }

  function formatFocusDate(iso) {
    if (!iso) return 'Geen recente assessment';
    try {
      return global.formatDate ? global.formatDate(iso) : String(iso).slice(0, 10);
    } catch (_) {
      return String(iso).slice(0, 10);
    }
  }

  function buildTenantFocusEntries(sectionName) {
    const focus = getSelectedTenantFocus();
    if (!focus?.tenantId || sectionName === 'mspcontrolcenter') return [];

    const entries = [{
      tone: 'info',
      title: focus.tenantName || 'Geselecteerde tenant',
      body: `Actieve tenantcontext voor deze pagina. Laatste assessment: ${formatFocusDate(focus.latestRunAt)}.`,
    }];

    if (focus.score != null || focus.readiness != null) {
      const postureBits = [];
      if (focus.score != null) postureBits.push(`score ${focus.score}%`);
      if (focus.readiness != null) postureBits.push(`readiness ${focus.readiness}%`);
      if (focus.integrationsCount != null) postureBits.push(`${focus.integrationsCount} integraties`);
      entries.push({
        tone: focus.score != null && Number(focus.score) < 65 ? 'warn' : 'info',
        title: 'Tenantposture',
        body: `Huidige tenantstatus: ${postureBits.join(' · ') || 'basisstatus nog niet beschikbaar'}.`,
        badge: focus.score != null ? `${focus.score}%` : null,
      });
    }

    if (Number(focus.critical || 0) > 0 || Number(focus.warnings || 0) > 0 || Number(focus.openActions || 0) > 0) {
      const followupBits = [];
      if (Number(focus.critical || 0) > 0) followupBits.push(`${focus.critical} kritiek`);
      if (Number(focus.warnings || 0) > 0) followupBits.push(`${focus.warnings} waarschuwingen`);
      if (Number(focus.openActions || 0) > 0) followupBits.push(`${focus.openActions} open acties`);
      entries.push({
        tone: Number(focus.critical || 0) > 0 ? 'urgent' : 'warn',
        title: 'Directe opvolging',
        body: `Voor deze tenant vragen nu ${followupBits.join(' · ')} aandacht.`,
        badge: Number(focus.critical || 0) > 0 ? focus.critical : (focus.openActions || focus.warnings || null),
      });
    }

    return entries;
  }

  function recommendationTone(kind) {
    if (kind === 'warn') return { bg: '#fff7ed', fg: '#9a3412', border: '#fdba74' };
    if (kind === 'critical') return { bg: '#fef2f2', fg: '#b91c1c', border: '#fca5a5' };
    if (kind === 'good') return { bg: '#ecfdf5', fg: '#166534', border: '#86efac' };
    return { bg: '#eff6ff', fg: '#1d4ed8', border: '#93c5fd' };
  }

  function recommendationSeverity(kind) {
    if (kind === 'critical') return 'critical';
    if (kind === 'warn') return 'warning';
    return 'info';
  }

  function recommendationDueDate(kind) {
    const date = new Date();
    const days = kind === 'critical' ? 3 : kind === 'warn' ? 7 : 14;
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  async function createCapabilityRecommendationAction(tenantId, tenantName, recommendation) {
    const label = recommendation?.label || 'Aanbeveling opvolgen';
    const detail = recommendation?.detail || '';
    const severity = recommendationSeverity(recommendation?.kind);
    await global.apiFetch('/api/actions', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        title: label,
        finding_key: `overview-capability:${String(recommendation?.action?.type || 'review')}`,
        severity,
        owner: '',
        due_date: recommendationDueDate(recommendation?.kind),
        status: 'open',
        notes: `${tenantName || tenantId}\n\n${detail}`,
        kb_asset_name: '',
      }),
    });
  }

  function resetOverviewServiceCards() {
    setOverviewServiceCard('Exchange', '—', 'Mailboxen', 'Open module', null);
    setOverviewServiceCard('Teams', '—', 'Teams', 'Open module', null);
    setOverviewServiceCard('SharePoint', '—', 'Sites', 'Open module', null);
    setOverviewServiceCard('OneDrive', '—', 'Accounts', 'Open module', null);
    setOverviewServiceCard('Licenses', '—', 'Toegewezen', 'Open module', null);
  }

  function setOverviewServiceCard(prefix, primary = '—', secondary = '—', meta = 'Live data niet beschikbaar', data = null) {
    global.setTextContent?.(`overview${prefix}Primary`, primary);
    global.setTextContent?.(`overview${prefix}Secondary`, secondary);
    global.setTextContent?.(`overview${prefix}Meta`, meta);
    const source = document.getElementById(`overview${prefix}Source`);
    if (source) {
      if (!data) {
        source.textContent = 'Bron onbekend';
        source.className = 'ov-service-source';
        return;
      }
      const info = global.describeSourceMeta ? global.describeSourceMeta(data) : { label: 'Live', detail: 'actueel', className: 'is-live' };
      source.textContent = `${info.label} · ${info.detail}`;
      source.className = `ov-service-source ${info.className}`;
    }
  }

  function bindOverviewActions() {
    document.querySelectorAll('[data-overview-nav]').forEach((btn) => {
      if (btn.dataset.ovBound === '1') return;
      btn.dataset.ovBound = '1';
      btn.addEventListener('click', () => {
        const section = btn.dataset.overviewNav;
        if (!section) return;
        const opts = {};
        if (btn.dataset.liveTab) opts.liveTab = btn.dataset.liveTab;
        if (btn.dataset.gbTab) opts.gbTab = btn.dataset.gbTab;
        if (btn.dataset.caTab) opts.caTab = btn.dataset.caTab;
        global.showSection?.(section, opts);
      });
    });
    const refreshBtn = document.getElementById('overviewRefreshButton');
    if (refreshBtn && refreshBtn.dataset.ovBound !== '1') {
      refreshBtn.dataset.ovBound = '1';
      refreshBtn.addEventListener('click', () => global.refreshTenantData?.());
    }
    document.querySelectorAll('[data-saved-view]').forEach((btn) => {
      if (btn.dataset.savedViewBound === '1') return;
      btn.dataset.savedViewBound = '1';
      btn.addEventListener('click', () => {
        void applyOperatorSavedView(btn.dataset.savedView || '');
      });
    });
  }

  async function applyOperatorSavedView(viewKey) {
    const tenantId = getActiveTenantId();
    if (!tenantId) {
      global.showToast?.('Selecteer eerst een tenant om een saved view te openen.', 'warning');
      return;
    }
    if (tenantId && global.currentTenantId !== tenantId) {
      global._setCurrentTenantId?.(tenantId);
    }
    if (viewKey === 'critical_followup') {
      global.setTenantActionFilters?.({ status: 'open', severity: 'critical' });
      global.showSection?.('results', { resultsPanel: 'actions' });
      return;
    }
    if (viewKey === 'tenant_actions') {
      global.setTenantActionFilters?.({ status: 'all', severity: 'all' });
      global.showSection?.('results', { resultsPanel: 'actions' });
      return;
    }
    if (viewKey === 'failed_jobs') {
      global.setJobMonitorTenantFilter?.(tenantId);
      global.showSection?.('jobmonitor');
      await global.loadJobMonitor?.('failed');
      return;
    }
    if (viewKey === 'pending_approvals') {
      global.setApprovalTenantFilter?.(tenantId);
      global.showSection?.('goedkeuringen');
      await global.loadGoedkeuringen?.('pending');
      return;
    }
    if (viewKey === 'identity_mfa') {
      global.showSection?.('identity', { liveTab: 'mfa' });
      return;
    }
    if (viewKey === 'apps_review') {
      global.showSection?.('apps', { liveTab: 'registrations' });
      return;
    }
    if (viewKey === 'tenant_onboarding') {
      await global.openTenantOnboardingManager?.(tenantId, getCurrentTenantName(), null);
      return;
    }
  }

  function deriveNextBestAction(focus) {
    if (!focus?.tenantId) return null;
    if (Number(focus.critical || 0) > 0 && Number(focus.openActions || 0) === 0) {
      return {
        title: 'Maak opvolgactie aan',
        detail: 'Er zijn kritieke signalen maar nog geen open tenantactie om die op te pakken.',
        action: 'open_tenant_actions',
        cta: 'Open acties',
      };
    }
    if (Number(focus.readiness || 0) < 75) {
      return {
        title: 'Werk onboarding verder uit',
        detail: `Readiness staat op ${focus.readiness || 0}%. Werk ontbrekende onboardingstappen af.`,
        action: 'open_tenant_onboarding',
        cta: 'Open onboarding',
      };
    }
    if (Number(focus.failedJobs || 0) > 0) {
      return {
        title: 'Controleer mislukte jobs',
        detail: `${focus.failedJobs} job(s) voor deze tenant staan op failed en vragen aandacht.`,
        action: 'open_tenant_jobs_failed',
        cta: 'Open jobs',
      };
    }
    if (Number(focus.pendingApprovals || 0) > 0) {
      return {
        title: 'Beslis openstaande approval',
        detail: `${focus.pendingApprovals} approval(s) blokkeren nu voortgang voor deze tenant.`,
        action: 'open_tenant_approvals',
        cta: 'Open approvals',
      };
    }
    return {
      title: 'Bekijk laatste assessment',
      detail: 'Gebruik de laatste assessment als startpunt voor verdere verfijning of documentatie.',
      action: 'open_latest_results',
      cta: 'Open results',
    };
  }

  function renderOverviewExceptionCenter({ focus = null, actions = [], jobs = [], approvals = [] } = {}) {
    const root = document.getElementById('overviewExceptionCenter');
    if (!root) return;
    if (!focus?.tenantId) {
      root.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">Selecteer een tenant om uitzonderingen te laden.</p>';
      return;
    }
    const openActions = actions.filter((item) => !item.is_closed);
    const failedJobs = jobs.filter((item) => String(item.status || '') === 'failed');
    const pendingApprovals = approvals.filter((item) => String(item.approval_status || '') === 'pending');
    const nextAction = deriveNextBestAction({
      ...focus,
      failedJobs: failedJobs.length,
      pendingApprovals: pendingApprovals.length,
    });

    const cards = [];
    cards.push(`
      <div class="ov-launch-card">
        <strong>Volgende beste stap</strong>
        <span>${global.escapeHtml(nextAction?.detail || 'Geen directe stap beschikbaar.')}</span>
        <div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.7rem;">
          ${nextAction ? buildQuickContextAction(nextAction.cta || 'Open', nextAction.action) : ''}
          ${buildQuickContextAction('Meer informatie', 'open_context_rail')}
        </div>
      </div>
    `);
    cards.push(`
      <div class="ov-launch-card">
        <strong>Open acties</strong>
        <span>${global.escapeHtml(String(openActions.length))} open actie(s) voor deze tenant.</span>
        <div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.7rem;">
          ${buildQuickContextAction('Actie inbox', 'open_tenant_actions')}
          ${buildQuickContextAction('Kritieke acties', 'open_tenant_actions_critical')}
        </div>
      </div>
    `);
    cards.push(`
      <div class="ov-launch-card">
        <strong>Approvals & jobs</strong>
        <span>${global.escapeHtml(String(pendingApprovals.length))} approvals open · ${global.escapeHtml(String(failedJobs.length))} mislukte jobs.</span>
        <div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.7rem;">
          ${buildQuickContextAction('Approvals', 'open_tenant_approvals')}
          ${buildQuickContextAction('Failed jobs', 'open_tenant_jobs_failed')}
        </div>
      </div>
    `);
    cards.push(`
      <div class="ov-launch-card">
        <strong>Tenant werkruimte</strong>
        <span>Open direct onboarding, laatste run of de huidige tenant in focus.</span>
        <div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.7rem;">
          ${buildQuickContextAction('Onboarding', 'open_tenant_onboarding')}
          ${buildQuickContextAction('Results', 'open_latest_results')}
          ${buildQuickContextAction('Assessment', 'open_assessment')}
        </div>
      </div>
    `);
    root.innerHTML = cards.join('');
    bindOverviewContextButtons(root);
  }

  function buildPortfolioPriorityCards() {
    const root = document.getElementById('overviewPortfolioPriorities');
    if (!root) return;
    const tenants = Array.isArray(global.allTenants) ? global.allTenants : [];
    if (tenants.length <= 1) {
      root.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">Geen cross-tenant vergelijking beschikbaar in deze context.</p>';
      return;
    }
    const ranked = tenants
      .map((tenant) => {
        const run = tenant.latest_run || {};
        const onboarding = tenant.ops_summary?.onboarding || {};
        const jobs = tenant.ops_summary?.job_summary || {};
        const score = Number(run.score_overall || 0);
        const critical = Number(run.critical_count || 0);
        const warning = Number(run.warning_count || 0);
        const readiness = Number(onboarding.completion_pct || 0);
        const failedJobs = Number(jobs.failed || 0);
        const rank = (critical * 100) + (failedJobs * 40) + Math.max(0, 75 - readiness) + Math.max(0, 65 - score);
        return { tenant, score, critical, warning, readiness, failedJobs, rank };
      })
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 4);
    if (!ranked.length) {
      root.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">Geen tenants beschikbaar voor vergelijking.</p>';
      return;
    }
    root.innerHTML = ranked.map(({ tenant, score, critical, warning, readiness, failedJobs }) => `
      <div class="ov-launch-card">
        <strong>${global.escapeHtml(tenant.customer_name || tenant.tenant_name || tenant.id || 'Tenant')}</strong>
        <span>Score ${global.escapeHtml(String(score || 0))}% · ${global.escapeHtml(String(critical))} kritiek · ${global.escapeHtml(String(readiness))}% readiness.</span>
        <div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.7rem;">
          <span class="mspcc-meta-chip">${global.escapeHtml(String(warning))} waarschuwingen</span>
          <span class="mspcc-meta-chip">${global.escapeHtml(String(failedJobs))} mislukte jobs</span>
          <button type="button" class="bev-inline-btn" data-overview-priority-open="${global.escapeHtml(tenant.id || '')}">Open tenant</button>
        </div>
      </div>
    `).join('');
    root.querySelectorAll('[data-overview-priority-open]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', async () => {
        const tenantId = btn.dataset.overviewPriorityOpen || '';
        if (!tenantId) return;
        await global.selectTenantFromPill?.(tenantId, { skipRefresh: false });
        global.showSection?.('overview');
      });
    });
  }

  function renderOverviewTrendCards({ stats = null, runs = [], actions = [], jobs = [], approvals = [], auditItems = [] } = {}) {
    const root = document.getElementById('overviewTrendCards');
    if (!root) return;
    const latestRun = runs[0] || null;
    const previousRun = runs[1] || null;
    const latestScore = Number(stats?.scoreOverall ?? stats?.secureScorePercentage ?? latestRun?.score_overall ?? 0);
    const previousScore = Number(previousRun?.score_overall ?? latestScore);
    const scoreDelta = previousRun ? (latestScore - previousScore) : null;
    const latestCritical = Number(stats?.criticalIssues ?? latestRun?.critical_count ?? 0);
    const previousCritical = Number(previousRun?.critical_count ?? latestCritical);
    const criticalDelta = previousRun ? (latestCritical - previousCritical) : null;
    const openActions = actions.filter((item) => !item.is_closed);
    const failedJobs = jobs.filter((item) => String(item.status || '') === 'failed');
    const pendingApprovals = approvals.filter((item) => String(item.approval_status || '') === 'pending');
    const recentAudit = Array.isArray(auditItems) ? auditItems.slice(0, 3) : [];

    const deltaLabel = (value, suffix = '') => {
      if (value == null || Number.isNaN(Number(value))) return 'Geen vorige run';
      if (Number(value) === 0) return `Ongewijzigd${suffix}`;
      return `${value > 0 ? '+' : ''}${value}${suffix}`;
    };

    root.innerHTML = `
      <div class="ov-launch-card">
        <strong>Scoretrend</strong>
        <span>Huidige score ${global.escapeHtml(String(latestScore || 0))}% · verschil ${global.escapeHtml(deltaLabel(scoreDelta, ' pt'))}.</span>
        <small style="color:var(--muted);">Vergelijkt met de vorige assessment-run van deze tenant.</small>
      </div>
      <div class="ov-launch-card">
        <strong>Risicobeweging</strong>
        <span>${global.escapeHtml(String(latestCritical))} kritieke issues · verschil ${global.escapeHtml(deltaLabel(criticalDelta))}.</span>
        <small style="color:var(--muted);">${global.escapeHtml(String(openActions.length))} open acties, ${global.escapeHtml(String(failedJobs.length))} failed jobs, ${global.escapeHtml(String(pendingApprovals.length))} approvals.</small>
      </div>
      <div class="ov-launch-card">
        <strong>Laatste operatoractiviteit</strong>
        <span>${recentAudit.length ? global.escapeHtml(recentAudit[0].action || 'Recente wijziging') : 'Nog geen recente auditactiviteit gevonden.'}</span>
        <small style="color:var(--muted);">${recentAudit.length ? global.escapeHtml(recentAudit.map((item) => `${item.action || 'actie'} · ${global.formatDate(item.created_at || item.timestamp || '')}`).join(' | ')) : 'Gebruik acties, approvals en jobs om activiteit op te bouwen.'}</small>
      </div>
      <div class="ov-launch-card">
        <strong>Werkbelasting nu</strong>
        <span>${global.escapeHtml(String(openActions.length))} open acties · ${global.escapeHtml(String(failedJobs.length))} job failures · ${global.escapeHtml(String(pendingApprovals.length))} wachtende approvals.</span>
        <div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.7rem;">
          ${buildQuickContextAction('Acties', 'open_tenant_actions')}
          ${buildQuickContextAction('Approvals', 'open_tenant_approvals')}
          ${buildQuickContextAction('Jobs', 'open_tenant_jobs_failed')}
        </div>
      </div>
    `;
    bindOverviewContextButtons(root);
  }

  function bindOverviewContextButtons(root = document) {
    root.querySelectorAll('[data-context-action]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', async () => {
        const action = btn.dataset.contextAction || '';
        const tenantId = getActiveTenantId();
        if (!tenantId && action !== 'open_context_rail') return;
        if (action === 'open_context_rail') {
          global._setContextRailOpen?.(true);
          global.renderContextRail?.(getCurrentSection());
          return;
        }
        if (action === 'open_tenant_actions') {
          global.setTenantActionFilters?.({ status: 'all', severity: 'all' });
          global.showSection?.('results', { resultsPanel: 'actions' });
          return;
        }
        if (action === 'open_tenant_actions_critical') {
          global.setTenantActionFilters?.({ status: 'open', severity: 'critical' });
          global.showSection?.('results', { resultsPanel: 'actions' });
          return;
        }
        if (action === 'open_tenant_onboarding') {
          await global.openTenantOnboardingManager?.(tenantId, getCurrentTenantName(), null);
          return;
        }
        if (action === 'open_tenant_jobs_failed') {
          global.setJobMonitorTenantFilter?.(tenantId);
          global.showSection?.('jobmonitor');
          await global.loadJobMonitor?.('failed');
          return;
        }
        if (action === 'open_tenant_approvals') {
          global.setApprovalTenantFilter?.(tenantId);
          global.showSection?.('goedkeuringen');
          await global.loadGoedkeuringen?.('pending');
          return;
        }
        if (action === 'open_latest_results') {
          global.showSection?.('results', { resultsPanel: 'viewer' });
          return;
        }
        if (action === 'open_assessment') {
          global.showSection?.('assessment');
        }
      });
    });
  }

  async function loadOverviewServiceCards() {
    resetOverviewServiceCards();
    const tenantId = getActiveTenantId();
    if (!tenantId) return;
    const requests = await Promise.allSettled([
      global.apiFetchCached(global.API.exchange.mailboxes(tenantId), {}, global.CACHE_TTL.mailboxes),
      global.apiFetchCached(global.API.collaboration.teams(tenantId), {}, global.CACHE_TTL.teams),
      global.apiFetchCached(global.API.collaboration.sharepointSites(tenantId), {}, global.CACHE_TTL.teams),
      global.apiFetchCached(global.API.backup.summary(tenantId), {}, global.CACHE_TTL.short),
      global.apiFetchCached(global.API.m365.licenses(tenantId), {}, global.CACHE_TTL.short),
    ]);
    const [exchangeRes, teamsRes, sharePointRes, backupRes, licenseRes] = requests;

    if (exchangeRes.status === 'fulfilled' && exchangeRes.value?.ok) {
      const payload = exchangeRes.value;
      const total = Number(payload.count || payload.mailboxes?.length || 0);
      const active = (payload.mailboxes || []).filter((item) => item && item.accountEnabled !== false).length;
      setOverviewServiceCard('Exchange', String(total), 'Mailboxen', active ? `${active} actief` : 'Mailboxoverzicht', payload);
    } else {
      setOverviewServiceCard('Exchange', '—', 'Mailboxen', 'Live data niet beschikbaar', null);
    }

    if (teamsRes.status === 'fulfilled' && teamsRes.value?.ok) {
      const payload = teamsRes.value;
      const total = Number(payload.count || payload.teams?.length || 0);
      const publicCount = Number(payload.publicCount || 0);
      setOverviewServiceCard('Teams', String(total), 'Teams', publicCount ? `${publicCount} publiek` : 'Teams-overzicht', payload);
    } else {
      setOverviewServiceCard('Teams', '—', 'Teams', 'Live data niet beschikbaar', null);
    }

    if (sharePointRes.status === 'fulfilled' && sharePointRes.value?.ok) {
      const payload = sharePointRes.value;
      const total = Number(payload.count || payload.sites?.length || 0);
      const storage = (payload.sites || []).reduce((sum, item) => sum + (Number(item?.storageUsed) || 0), 0);
      setOverviewServiceCard('SharePoint', String(total), 'Sites', storage > 0 ? `${global.formatCompactBytes(storage)} opslag` : 'Sites-overzicht', payload);
    } else {
      setOverviewServiceCard('SharePoint', '—', 'Sites', 'Live data niet beschikbaar', null);
    }

    if (backupRes.status === 'fulfilled' && backupRes.value?.ok) {
      const payload = backupRes.value;
      const count = Number(payload.oneDrive?.resourceCount || 0);
      const policies = Number(payload.oneDrive?.policyCount || 0);
      setOverviewServiceCard('OneDrive', String(count), 'Accounts', policies ? `${policies} policy${policies === 1 ? '' : '\'s'}` : 'Backup-overzicht', payload);
    } else {
      setOverviewServiceCard('OneDrive', '—', 'Accounts', 'Live data niet beschikbaar', null);
    }

    if (licenseRes.status === 'fulfilled' && licenseRes.value?.ok) {
      const licenses = licenseRes.value.licenses || [];
      const assigned = licenses.reduce((sum, item) => sum + (Number(item?.consumed) || 0), 0);
      const available = licenses.reduce((sum, item) => sum + (Number(item?.available) || 0), 0);
      setOverviewServiceCard('Licenses', String(assigned), 'Toegewezen', `${available} beschikbaar`, licenseRes.value);
    } else {
      setOverviewServiceCard('Licenses', '—', 'Toegewezen', 'Live data niet beschikbaar', null);
    }
  }

  function renderOverviewRecommendations(onboarding, capabilityData) {
    const wrap = document.getElementById('overviewRecommendations');
    if (!wrap) return;
    const serviceItems = Array.isArray(onboarding?.service_items) ? onboarding.service_items : [];
    const recommendations = global.DenjoyMspCustomersView?.buildTenantCapabilityRecommendations
      ? global.DenjoyMspCustomersView.buildTenantCapabilityRecommendations(serviceItems, capabilityData, onboarding || {})
      : [];
    if (!recommendations.length) {
      wrap.innerHTML = `
        <div class="ov-launch-card" style="cursor:default;">
          <strong>Geen directe opvolging nodig</strong>
          <span>Deze tenant heeft op basis van onboarding en capabilitystatus nu geen opvallende operator-aanbevelingen.</span>
        </div>
      `;
      return;
    }

    wrap.innerHTML = recommendations.slice(0, 4).map((item) => {
      const tone = recommendationTone(item.kind);
      return `
        <div class="ov-launch-card" style="border:1px solid ${tone.border};background:${tone.bg};color:${tone.fg};">
          <strong>${global.escapeHtml(item.label)}</strong>
          <span style="color:inherit;opacity:.9;">${global.escapeHtml(item.detail)}</span>
          <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.6rem;">
            ${item.action ? `
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                data-action="overviewRecommendationPrimary"
                data-rec-action="${global.escapeHtml(item.action.type || '')}"
                data-rec-service-key="${global.escapeHtml(item.action.service_key || '')}"
                style="font-size:.72rem;padding:.22rem .55rem;"
              >${global.escapeHtml(item.action.label || 'Open')}</button>
            ` : ''}
            ${(item.kind === 'critical' || item.kind === 'warn') ? `
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                data-action="overviewRecommendationAction"
                data-rec-label="${global.escapeHtml(item.label)}"
                data-rec-detail="${global.escapeHtml(item.detail)}"
                data-rec-kind="${global.escapeHtml(item.kind || 'info')}"
                data-rec-subaction="${global.escapeHtml(item.action?.type || '')}"
                style="font-size:.72rem;padding:.22rem .55rem;"
              >Actie</button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                data-action="overviewRecommendationApproval"
                data-rec-label="${global.escapeHtml(item.label)}"
                data-rec-detail="${global.escapeHtml(item.detail)}"
                data-rec-kind="${global.escapeHtml(item.kind || 'info')}"
                data-rec-subaction="${global.escapeHtml(item.action?.type || '')}"
                style="font-size:.72rem;padding:.22rem .55rem;"
              >Goedkeuring</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('[data-action="overviewRecommendationPrimary"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const actionType = btn.dataset.recAction;
        const serviceKey = btn.dataset.recServiceKey;
        try {
          if (actionType === 'customer_services') {
            await global.openCurrentTenantCustomerServices?.(serviceKey);
            return;
          }
          if (actionType === 'tenant_onboarding') {
            await global.openTenantOnboardingManager?.(global.currentTenantId, getCurrentTenantName(), null);
            return;
          }
          if (actionType === 'tenant_refresh') {
            await global.enqueueTenantOnboardingJob?.(global.currentTenantId, 'tenant_refresh', null);
            return;
          }
          if (actionType === 'guardian_sync') {
            await global.enqueueTenantOnboardingJob?.(global.currentTenantId, 'guardian_sync', null, { limit: 25 });
            return;
          }
          if (serviceKey) {
            await global.openCurrentTenantCustomerServices?.(serviceKey);
          }
        } catch (error) {
          global.showToast?.(`Fout bij aanbeveling: ${error.message || error}`, 'error');
        }
      });
    });

    wrap.querySelectorAll('[data-action="overviewRecommendationAction"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await createCapabilityRecommendationAction(global.currentTenantId, getCurrentTenantName(), {
            label: btn.dataset.recLabel || 'Aanbeveling opvolgen',
            detail: btn.dataset.recDetail || '',
            kind: btn.dataset.recKind || 'info',
            action: { type: btn.dataset.recSubaction || '' },
          });
          global.showToast?.('Opvolgactie aangemaakt.', 'success');
          await global.loadActionsPanel?.();
        } catch (error) {
          global.showToast?.(`Fout bij actie-aanmaak: ${error.message || error}`, 'error');
        }
      });
    });

    wrap.querySelectorAll('[data-action="overviewRecommendationApproval"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await global.requestOnboardingApproval?.(
          global.currentTenantId,
          'capabilities',
          'capability_recommendation_requested',
          `Goedkeuring gevraagd voor aanbeveling: ${btn.dataset.recLabel || 'Aanbeveling'}`,
          {
            label: btn.dataset.recLabel || '',
            detail: btn.dataset.recDetail || '',
            kind: btn.dataset.recKind || 'info',
            recommendation_action: btn.dataset.recSubaction || null,
          },
        );
      });
    });
  }

  async function loadOverview() {
    const tenantId = getActiveTenantId();
    if (tenantId && global.currentTenantId !== tenantId) {
      global._setCurrentTenantId?.(tenantId);
    }
    bindOverviewActions();
    const statTargets = {
      userCount: ['userCount', 'heroUserCount'],
      mfaStatus: ['mfaStatus', 'heroMfaStatus'],
      secureScore: ['secureScore', 'heroSecureScore'],
      caPolicies: ['caPolicies', 'heroCaPolicies'],
    };

    Object.values(statTargets).flat().forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '-';
    });

    const list = document.getElementById('recentAssessmentsList');
    const recommendationWrap = document.getElementById('overviewRecommendations');
    if (!tenantId) {
      if (list) list.innerHTML = '<p class="empty-state">Geen tenant geselecteerd</p>';
      if (recommendationWrap) recommendationWrap.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">Geen tenant geselecteerd</p>';
      const exceptionRoot = document.getElementById('overviewExceptionCenter');
      if (exceptionRoot) exceptionRoot.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">Selecteer een tenant om uitzonderingen te laden.</p>';
      buildPortfolioPriorityCards();
      resetOverviewServiceCards();
      global.renderContextRail?.('overview');
      global.renderNavSignals?.();
      return;
    }

    await loadOverviewServiceCards();

    const [statsResult, runsResult, usersResult, onboardingResult, capabilityResult, actionsResult, jobsResult, approvalsResult, auditResult] = await Promise.allSettled([
      global.apiFetchCached(`/api/tenants/${tenantId}/overview`, {}, global.CACHE_TTL.overview),
      global.apiFetchCached(`/api/tenants/${tenantId}/runs`, {}, global.CACHE_TTL.runs),
      global.apiFetchCached(global.API.m365.users(tenantId), {}, global.CACHE_TTL.short),
      global.apiFetchCached(`/api/tenants/${tenantId}/onboarding`, {}, global.CACHE_TTL.medium),
      global.apiFetchCached(global.API.capabilities.tenant(tenantId), {}, global.CACHE_TTL.medium),
      global.apiFetchCached(`/api/tenants/${tenantId}/actions?status=all`, {}, global.CACHE_TTL.short),
      global.apiFetchCached('/api/jobs?limit=200', {}, global.CACHE_TTL.short),
      global.apiFetchCached('/api/approvals?limit=200&status=pending', {}, global.CACHE_TTL.short),
      global.apiFetchCached(`/api/audit?tenant_id=${encodeURIComponent(tenantId)}&limit=5`, {}, global.CACHE_TTL.short),
    ]);

    const stats = statsResult.status === 'fulfilled' ? statsResult.value : null;
    const runs = runsResult.status === 'fulfilled' ? runsResult.value : { items: [] };
    const usersData = usersResult.status === 'fulfilled' ? usersResult.value : null;
    const onboarding = onboardingResult.status === 'fulfilled' ? onboardingResult.value : null;
    const capabilityData = capabilityResult.status === 'fulfilled' ? capabilityResult.value : null;
    const actions = actionsResult.status === 'fulfilled' ? (actionsResult.value?.items || []) : [];
    const jobs = jobsResult.status === 'fulfilled' ? ((jobsResult.value?.items || []).filter((item) => String(item.tenant_id || '') === String(tenantId))) : [];
    const approvals = approvalsResult.status === 'fulfilled' ? ((approvalsResult.value?.items || []).filter((item) => String(item.tenant_id || '') === String(tenantId))) : [];
    const auditItems = auditResult.status === 'fulfilled' ? (auditResult.value?.items || []) : [];
    const items = Array.isArray(runs.items) ? runs.items.slice(0, 5) : [];

    const latestRun = items[0] || null;
    const focus = {
      ...(global._selectedTenantFocus || {}),
      tenantId,
      tenantName: getCurrentTenantName(),
      score: stats?.scoreOverall ?? stats?.secureScorePercentage ?? latestRun?.score_overall ?? null,
      critical: stats?.criticalIssues ?? latestRun?.critical_count ?? null,
      warnings: stats?.warnings ?? latestRun?.warning_count ?? null,
      readiness: onboarding?.completion_pct ?? global._selectedTenantFocus?.readiness ?? null,
      latestRunAt: latestRun?.completed_at || latestRun?.started_at || stats?.reportDate || '',
      openActions: actions.filter((item) => !item.is_closed).length,
      failedJobs: jobs.filter((item) => String(item.status || '') === 'failed').length,
      pendingApprovals: approvals.filter((item) => String(item.approval_status || '') === 'pending').length,
      integrationsCount: global._selectedTenantFocus?.integrationsCount ?? null,
    };
    global._selectedTenantFocus = { ...(global._selectedTenantFocus || {}), ...focus };

    renderOverviewRecommendations(onboarding, capabilityData);
    renderOverviewExceptionCenter({ focus, actions, jobs, approvals });
    renderOverviewTrendCards({ stats, runs: items, actions, jobs, approvals, auditItems });
    buildPortfolioPriorityCards();
    bindOverviewContextButtons(document.getElementById('overviewSection'));

    if (stats && stats.hasData) {
      const fallbackUserCount = Array.isArray(usersData?.users) ? usersData.users.length : null;
      const values = {
        userCount: stats.totalUsers || stats.userCount || fallbackUserCount || '-',
        mfaStatus: stats.mfaCoverage != null ? `${Math.round(stats.mfaCoverage)}%` : '-',
        secureScore: stats.secureScorePercentage != null ? `${Math.round(stats.secureScorePercentage)}%` : (stats.scoreOverall ?? '-'),
        caPolicies: stats.caPolicies ?? '-',
      };
      Object.entries(statTargets).forEach(([key, targetIds]) => {
        targetIds.forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.textContent = values[key];
        });
      });
    } else if (Array.isArray(usersData?.users)) {
      statTargets.userCount.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(usersData.users.length);
      });
    }

    if (!items.length) {
      const reason = statsResult.status === 'rejected'
        ? `Overzicht laden deels mislukt: ${global.escapeHtml(String(statsResult.reason?.message || statsResult.reason || 'onbekende fout'))}`
        : 'Nog geen assessments uitgevoerd';
      if (list) list.innerHTML = `<p class="empty-state">${reason}</p>`;
      renderOverviewTrendCards({ stats, runs: items, actions, jobs, approvals, auditItems });
      global.renderContextRail?.('overview');
      global.renderNavSignals?.();
      return;
    }

    const isAdmin = global.getCurrentUserRole?.() === 'admin';
    if (list) {
      list.innerHTML = items.map((run) => {
        const stamp = global.formatDate(run.completed_at || run.started_at);
        const score = run.score_overall != null ? `${run.score_overall}%` : '—';
        return `
          <div class="assessment-item" style="margin-bottom:10px;padding:10px;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;">
            <div><strong>${stamp}</strong> - ${global.statusBadge(run.status)}</div>
            <div style="font-size:.9rem;color:var(--text-secondary,#475569);margin-top:4px;">Score: ${score} · Kritiek: ${run.critical_count ?? 0} · Waarschuwing: ${run.warning_count ?? 0}</div>
            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" data-action="viewRun" data-id="${global.escapeHtml(run.id)}">Details</button>
              <button class="btn btn-secondary btn-sm" data-action="showSection" data-id="assessment">Assessment</button>
              ${isAdmin && run.status === 'running' ? `<button class="btn btn-warning btn-sm" data-action="stopRun" data-id="${global.escapeHtml(run.id)}">&#9646; Stop</button>` : ''}
              ${isAdmin && ['completed', 'failed', 'cancelled'].includes(String(run.status || '')) ? `<button class="btn btn-danger btn-sm" data-action="deleteRun" data-id="${global.escapeHtml(run.id)}">&#128465; Verwijder</button>` : ''}
            </div>
          </div>`;
      }).join('');
      global.bindActions?.(list);

      if (statsResult.status === 'rejected') {
        list.insertAdjacentHTML('afterbegin', '<p class="empty-state" style="margin-bottom:1rem;">Basisoverzicht deels mislukt, maar recente runs zijn wel beschikbaar.</p>');
      }
    }

    global.renderContextRail?.('overview');
    global.renderNavSignals?.();
  }

  function updateWorkspaceHeader(sectionName) {
    return global.DenjoyShellWorkspace?.updateWorkspaceHeader?.(sectionName);
  }

  function renderWorkspaceActions(sectionName = getCurrentSection()) {
    return global.DenjoyShellWorkspace?.renderWorkspaceActions?.(sectionName);
  }

  function getContextEntries(sectionName) {
    const tenantLabel = global.getCurrentTenantLabel ? global.getCurrentTenantLabel() : 'Geen tenant geselecteerd';
    if (!global.currentTenantId && sectionName !== 'mspcontrolcenter') {
      return [{
        tone: 'info',
        title: 'Selecteer eerst een tenant',
        body: 'Kies links een tenant om aanbevelingen, opmerkingen en urgente signalen te laden.',
      }];
    }

    if (sectionName === 'overview') {
      const score = global.parseMetricValue(document.getElementById('secureScore')?.textContent);
      const mfa = global.parseMetricValue(document.getElementById('mfaStatus')?.textContent);
      const policies = global.parseMetricValue(document.getElementById('caPolicies')?.textContent);
      const assessments = document.querySelectorAll('#recentAssessmentsList .assessment-item').length;
      const entries = [
        ...buildTenantFocusEntries(sectionName),
        {
          tone: 'info',
          title: tenantLabel,
          body: 'Gebruik dit paneel als snelle operator-samenvatting met aandachtspunten voordat je een module induikt.',
        },
      ];
      if (score != null && score < 65) entries.push({ tone: 'urgent', title: 'Beveiligingsscore vraagt aandacht', body: `De huidige beveiligingsscore staat rond ${score}%. Prioriteer rapportvergelijking en openstaande acties.`, badge: score });
      if (mfa != null && mfa < 90) entries.push({ tone: 'warn', title: 'MFA-dekking is niet volledig', body: `De huidige MFA-dekking is ${mfa}%. Controleer gebruikersbeheer en toegangsbeleid.`, badge: `${mfa}%` });
      if (policies != null && policies < 3) entries.push({ tone: 'warn', title: 'Beperkte CA-set', body: `Er lijken maar ${policies} CA-policies actief. Controleer minimaal basisblokkades en admin-beveiliging.`, badge: policies });
      const nextAction = deriveNextBestAction(getSelectedTenantFocus());
      if (nextAction) {
        entries.push({
          tone: 'info',
          title: `Volgende stap: ${nextAction.title}`,
          body: nextAction.detail,
          actionHtml: `<div class="bev-inline-actions" style="margin-top:.55rem;">${buildQuickContextAction(nextAction.cta || 'Open', nextAction.action)}${buildQuickContextAction('Acties', 'open_tenant_actions')}${buildQuickContextAction('Onboarding', 'open_tenant_onboarding')}</div>`,
        });
      }
      entries.push({ tone: 'info', title: 'Recente scans', body: `${assessments || 0} recente run(s) beschikbaar voor deze tenant.`, badge: assessments || 0 });
      return entries;
    }

    if (sectionName === 'results') {
      const critical = global.parseMetricValue(document.getElementById('kpiCritical')?.textContent);
      const warning = global.parseMetricValue(document.getElementById('kpiWarning')?.textContent);
      const reportRuns = global.parseMetricValue(document.getElementById('metaReportRuns')?.textContent);
      const entries = [
        ...buildTenantFocusEntries(sectionName),
        { tone: 'info', title: 'Rapportworkspace', body: 'Werk vanuit viewer, vergelijking en acties om bevindingen direct om te zetten naar opvolging.' },
      ];
      if (critical != null && critical > 0) entries.push({ tone: 'urgent', title: 'Kritieke bevindingen gedetecteerd', body: `${critical} kritieke bevinding(en) vragen directe opvolging of escalatie.`, badge: critical });
      if (warning != null && warning > 0) entries.push({ tone: 'warn', title: 'Waarschuwingen beschikbaar', body: `${warning} waarschuwing(en) kunnen worden omgezet in acties of baseline-wijzigingen.`, badge: warning });
      entries.push({ tone: 'info', title: 'Rapportgeschiedenis', body: `${reportRuns || 0} rapport-run(s) beschikbaar voor vergelijking en retentiebeheer.`, badge: reportRuns || 0 });
      return entries;
    }

    if (sectionName === 'kb') {
      const countIds = ['nbCountAssets', 'nbCountPages', 'nbCountContacts', 'nbCountSoftware', 'nbCountDomains', 'nbCountChangelog'];
      const totalKnown = countIds.reduce((sum, id) => sum + (global.parseMetricValue(document.getElementById(id)?.textContent) || 0), 0);
      return [
        ...buildTenantFocusEntries(sectionName),
        { tone: 'info', title: 'Knowledge posture', body: `Ongeveer ${totalKnown} gedocumenteerde items zichtbaar. Gebruik dit om lacunes in documentatie snel te herkennen.`, badge: totalKnown },
        { tone: 'warn', title: 'Let op actualiteit', body: 'Controleer vooral passwords, changelog en documenten als hier veel operationele wijzigingen lopen.' },
      ];
    }

    if (sectionName === 'mspcontrolcenter') {
      const summary = global._mspControlCenterCache?.summary || {};
      const entries = [{ tone: 'info', title: 'MSP stuurlaag', body: 'Gebruik dit scherm als centrale operator-home voor approvals, jobs, klantprioriteiten en renewals.' }];
      if (Number(summary.pending_approvals || 0) > 0) entries.push({ tone: 'urgent', title: 'Open approvals', body: `${summary.pending_approvals} goedkeuring(en) wachten op besluit in de MSP-workflow.`, badge: summary.pending_approvals });
      if (Number(summary.failed_jobs || 0) > 0) entries.push({ tone: 'warn', title: 'Mislukte jobs', body: `${summary.failed_jobs} job(s) staan op failed en vragen handmatige opvolging.`, badge: summary.failed_jobs });
      entries.push({ tone: 'info', title: 'Financiële signalen', body: `${summary.renewals_60d || 0} renewal(s) binnen 60 dagen en € ${Number(summary.latest_total_cost || 0).toFixed(2)} laatste kosten over het portfolio.` });
      return entries;
    }

    const introText = document.querySelector(`#${sectionName}Section .section-intro`)?.textContent?.trim();
    const subnavLabels = (global.SUBNAV_CONFIG?.[sectionName] || []).map((item) => item.label).join(', ');
    const entries = [
      ...buildTenantFocusEntries(sectionName),
      {
        tone: 'info',
        title: global.SECTION_META?.[sectionName]?.title || 'Werkruimte',
        body: introText || global.SECTION_META?.[sectionName]?.meta || 'Moduleoverzicht voor de geselecteerde tenant.',
      },
    ];
    if (subnavLabels) entries.push({ tone: 'info', title: 'Snelle routes', body: `Beschikbare onderdelen: ${subnavLabels}.` });
    if (['herstel', 'alerts', 'exchange', 'ca'].includes(sectionName)) entries.push({ tone: 'warn', title: 'Controleer impact', body: 'Wijzigingen in deze module kunnen direct effect hebben op bereikbaarheid, authenticatie of compliance.' });
    const liveContext = global.denjoyGetLiveModuleContext?.();
    if (liveContext && liveContext.section === sectionName) {
      const capability = liveContext.capability || null;
      const describe = global.denjoyDescribeCapabilityStatus;
      const subnavItems = global.SUBNAV_CONFIG?.[sectionName] || [];
      const activeSubnav = subnavItems.find((item) => item.liveTab === liveContext.tab);
      const activeLabel = activeSubnav?.label || liveContext.tab || 'Subhoofdstuk';
      if (typeof describe === 'function' && capability) {
        const info = describe(capability);
        entries.push({ tone: info.className === 'is-live' ? 'info' : (info.className === 'is-warn' ? 'warn' : 'info'), title: `${activeLabel} status`, body: info.detail || 'Capabilitystatus beschikbaar voor dit subhoofdstuk.' });
        const engine = capability.engine || '—';
        const roles = (capability.extra_roles || []).length ? capability.extra_roles.join(', ') : 'Geen extra rollen';
        const consent = (capability.extra_consent || []).length ? capability.extra_consent.join(', ') : 'Geen extra consent';
        entries.push({ tone: 'info', title: `${activeLabel} toegang`, body: `Engine: ${engine}. Rollen: ${roles}. Consent: ${consent}.` });
      }
    }
    return entries;
  }

  global.DenjoyMspOverview = {
    resetOverviewServiceCards,
    setOverviewServiceCard,
    bindOverviewActions,
    loadOverviewServiceCards,
    renderOverviewRecommendations,
    loadOverview,
    applyOperatorSavedView,
    updateWorkspaceHeader,
    renderWorkspaceActions,
    getContextEntries,
  };

  // Re-export
  global.resetOverviewServiceCards = resetOverviewServiceCards;
  global.setOverviewServiceCard = setOverviewServiceCard;
  global.bindOverviewActions = bindOverviewActions;
  global.loadOverviewServiceCards = loadOverviewServiceCards;
  global.renderOverviewRecommendations = renderOverviewRecommendations;
  global.loadOverview = loadOverview;
  global.applyOperatorSavedView = applyOperatorSavedView;
  global.updateWorkspaceHeader = updateWorkspaceHeader;
  global.renderWorkspaceActions = renderWorkspaceActions;
  global.getContextEntries = getContextEntries;
})(window);
