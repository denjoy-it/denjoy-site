(function initDenjoyMspTenantHealth(global) {
  function thHealthClass(score) {
    if (score == null) return 'unknown';
    if (score >= 85) return 'good';
    if (score >= 60) return 'warning';
    return 'critical';
  }

  function thRelativeDate(iso) {
    if (!iso) return 'onbekend';
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const days = Math.floor(diff / 86400000);
      if (days === 0) return 'vandaag';
      if (days === 1) return 'gisteren';
      if (days < 30) return `${days} dagen geleden`;
      const months = Math.floor(days / 30);
      return `${months} maand${months > 1 ? 'en' : ''} geleden`;
    } catch (_) {
      return iso.slice(0, 10);
    }
  }

  function thBuildCard(tenant) {
    const run = tenant.latest_run;
    const ops = tenant.ops_summary || {};
    const onboarding = ops.onboarding || {};
    const jobs = ops.job_summary || {};
    const capabilities = ops.capability_summary || {};
    const kb = ops.kb_summary || {};
    const score = run?.score_overall ?? null;
    const health = thHealthClass(score);
    const hasScan = !!run && run.status === 'completed';

    const badgeClass = `th-score-badge--${health}`;
    const badgeLabel = score != null ? score : '—';

    const card = document.createElement('div');
    card.className = 'th-card';
    card.dataset.health = health;
    card.dataset.tenantId = tenant.id;

    const riskColors = { low: '#16a34a', standard: '#b45309', high: '#ea580c', critical: '#dc2626' };
    const riskColor = riskColors[tenant.risk_profile] || riskColors.standard;
    const riskLabel = { low: 'Laag', standard: 'Standaard', high: 'Hoog', critical: 'Kritiek' }[tenant.risk_profile] || 'Standaard';

    let signalsHtml = '';
    if (hasScan) {
      const crit = run.critical_count || 0;
      const warn = run.warning_count || 0;
      const info = run.info_count || 0;

      if (crit > 0) {
        signalsHtml += `<div class="th-signal"><span class="th-signal-dot th-signal-dot--crit"></span>${crit} kritieke bevinding${crit !== 1 ? 'en' : ''}</div>`;
      }
      if (warn > 0) {
        signalsHtml += `<div class="th-signal"><span class="th-signal-dot th-signal-dot--warn"></span>${warn} waarschuwing${warn !== 1 ? 'en' : ''}</div>`;
      }
      if (crit === 0 && warn === 0) {
        signalsHtml += `<div class="th-signal"><span class="th-signal-dot th-signal-dot--ok"></span>Geen kritieke bevindingen</div>`;
      }
      if (info > 0) {
        signalsHtml += `<div class="th-signal"><span class="th-signal-dot th-signal-dot--muted"></span>${info} informatief item${info !== 1 ? 's' : ''}</div>`;
      }
    } else {
      signalsHtml = `<div class="th-no-scan">Nog geen voltooide scan beschikbaar</div>`;
    }

    if (onboarding.completion_pct != null) {
      signalsHtml += `<div class="th-signal"><span class="th-signal-dot th-signal-dot--muted"></span>Onboarding ${global.escapeHtml(String(onboarding.completion_pct))}% voltooid</div>`;
    }
    if ((capabilities.total || 0) > 0) {
      signalsHtml += `<div class="th-signal"><span class="th-signal-dot th-signal-dot--ok"></span>${global.escapeHtml(String(capabilities.live_ready || 0))}/${global.escapeHtml(String(capabilities.total || 0))} capabilities live-gereed</div>`;
    }
    if ((jobs.pending || 0) + (jobs.running || 0) > 0 || (jobs.failed || 0) > 0) {
      signalsHtml += `<div class="th-signal"><span class="th-signal-dot ${(jobs.failed || 0) > 0 ? 'th-signal-dot--crit' : 'th-signal-dot--warn'}"></span>${global.escapeHtml(String((jobs.pending || 0) + (jobs.running || 0)))} open jobs · ${global.escapeHtml(String(jobs.failed || 0))} mislukt</div>`;
    }

    const scanDate = hasScan ? `Laatste scan: ${thRelativeDate(run.completed_at || run.started_at)}` : 'Nog niet gescand';
    const statusColors = { active: '#16a34a', onboarding: '#b45309', paused: '#6b7280', offboarded: '#dc2626' };
    const statusColor = statusColors[tenant.status] || '#6b7280';
    const needsOnboarding = Number(onboarding.completion_pct || 0) < 75 || !onboarding.auth_ready;
    const hasFailedJobs = Number(jobs.failed || 0) > 0;
    const hasOpenFindings = Number(run?.critical_count || 0) > 0 || Number(run?.warning_count || 0) > 0;
    const quickActions = [];
    if (hasOpenFindings) {
      quickActions.push(`<button type="button" class="th-btn th-btn--secondary" data-action="tenantActions" data-tenant-id="${global.escapeHtml(tenant.id)}">Acties</button>`);
    }
    if (hasFailedJobs) {
      quickActions.push(`<button type="button" class="th-btn th-btn--secondary" data-action="tenantJobs" data-tenant-id="${global.escapeHtml(tenant.id)}">Jobs</button>`);
    }
    if (needsOnboarding) {
      quickActions.push(`<button type="button" class="th-btn th-btn--secondary" data-action="tenantOnboarding" data-tenant-id="${global.escapeHtml(tenant.id)}" data-tenant-name="${global.escapeHtml(tenant.tenant_name || tenant.customer_name || tenant.id)}">Onboarding</button>`);
    }

    card.innerHTML = `
      <div class="th-card-head">
        <div>
          <p class="th-card-name">${global.escapeHtml(tenant.customer_name || tenant.tenant_name || 'Onbekend')}</p>
          <p class="th-card-sub">${global.escapeHtml(tenant.tenant_name || '')}</p>
          <span style="display:inline-flex;align-items:center;gap:.3rem;font-size:.7rem;font-weight:600;color:${riskColor};margin-top:.3rem;">
            <span style="width:6px;height:6px;border-radius:50%;background:${riskColor};display:inline-block;"></span>
            Risico: ${riskLabel}
          </span>
        </div>
        <div class="th-score-badge ${badgeClass}" title="Overallscore laatste scan">
          ${badgeLabel}
          <small>score</small>
        </div>
      </div>
      <div class="th-signals">${signalsHtml}</div>
      <div class="th-card-meta">
        <span style="width:7px;height:7px;border-radius:50%;background:${statusColor};display:inline-block;flex-shrink:0;"></span>
        ${scanDate}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin:.75rem 0 0;">
        <span style="padding:.2rem .55rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);font-size:.72rem;color:var(--text-secondary,#475569);">Gereedheid ${global.escapeHtml(String(onboarding.completion_pct ?? 0))}%</span>
        <span style="padding:.2rem .55rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);font-size:.72rem;color:var(--text-secondary,#475569);">KB ${global.escapeHtml(String(kb.assets || 0))} assets</span>
        <span style="padding:.2rem .55rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);font-size:.72rem;color:var(--text-secondary,#475569);">Jobs ${global.escapeHtml(String((jobs.pending || 0) + (jobs.running || 0) + (jobs.failed || 0)))}</span>
      </div>
      ${quickActions.length ? `<div class="th-card-quick-actions">${quickActions.join('')}</div>` : ''}
      <div class="th-card-footer">
        <button type="button" class="th-btn th-btn--primary" data-action="open" data-tenant-id="${global.escapeHtml(tenant.id)}">Open →</button>
        <button type="button" class="th-btn th-btn--secondary" data-action="refresh" data-tenant-id="${global.escapeHtml(tenant.id)}" title="Tenant refresh job">↻ Refresh</button>
        <button type="button" class="th-btn th-btn--secondary" data-action="scan" data-tenant-id="${global.escapeHtml(tenant.id)}" title="Assessment starten voor deze tenant">▷ Scan</button>
      </div>
    `;

    card.querySelector('[data-action="open"]').addEventListener('click', async () => {
      await global.selectTenantFromManagement?.(tenant.id);
      global.showSection?.('overview');
    });
    card.querySelector('[data-action="refresh"]').addEventListener('click', async () => {
      try {
        await global.apiFetch?.('/api/jobs', {
          method: 'POST',
          body: JSON.stringify({ job_type: 'tenant_refresh', tenant_id: tenant.id, payload: {} }),
        });
        global.showToast?.('Tenant refresh ingepland.', 'success');
        global.loadTenantHealthDashboard?.();
      } catch (e) {
        global.showToast?.(`Fout: ${e}`, 'error');
      }
    });
    card.querySelector('[data-action="scan"]').addEventListener('click', async () => {
      await global.selectTenantFromManagement?.(tenant.id);
      global.showSection?.('assessment');
    });
    card.querySelectorAll('[data-action="tenantActions"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await global.selectTenantFromManagement?.(btn.dataset.tenantId || tenant.id);
        global.showSection?.('results', { resultsPanel: 'actions' });
      });
    });
    card.querySelectorAll('[data-action="tenantJobs"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await global.selectTenantFromManagement?.(btn.dataset.tenantId || tenant.id);
        global.showSection?.('jobmonitor');
        global.loadJobMonitor?.('failed');
      });
    });
    card.querySelectorAll('[data-action="tenantOnboarding"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await global.openTenantOnboardingManager?.(btn.dataset.tenantId || tenant.id, btn.dataset.tenantName || tenant.tenant_name || tenant.id, tenant.customer_id || null);
      });
    });

    return card;
  }

  function thBuildRecommendationCards(tenants) {
    const wrap = document.getElementById('thRecommendations');
    if (!wrap) return;
    const authMissing = tenants.filter((tenant) => !tenant.ops_summary?.onboarding?.auth_ready);
    const configHeavy = tenants.filter(
      (tenant) =>
        Number(tenant.ops_summary?.capability_summary?.config_required || 0) > 0 ||
        Number(tenant.ops_summary?.capability_summary?.not_implemented || 0) > 0
    );
    const snapshotOnly = tenants.filter((tenant) => {
      const cap = tenant.ops_summary?.capability_summary || {};
      return Number(cap.snapshot_only || 0) > 0 && Number(cap.live_ready || 0) === 0;
    });
    const failedJobs = tenants.filter((tenant) => Number(tenant.ops_summary?.job_summary?.failed || 0) > 0);

    const cards = [
      {
        tone: 'background:#fef2f2;color:#991b1b;border:1px solid #fecaca;',
        title: 'Auth opvolging',
        count: authMissing.length,
        detail: authMissing.length
          ? `${authMissing.length} tenant${authMissing.length !== 1 ? 's hebben' : ' heeft'} nog geen compleet auth-profiel.`
          : 'Alle tenants hebben een bruikbaar auth-profiel.',
        tenant: authMissing[0],
        button: 'Onboarding openen',
        action: 'tenantOnboarding',
      },
      {
        tone: 'background:#fff7ed;color:#9a3412;border:1px solid #fdba74;',
        title: 'Configuratie nodig',
        count: configHeavy.length,
        detail: configHeavy.length
          ? `${configHeavy.length} tenant${configHeavy.length !== 1 ? 's vragen' : ' vraagt'} nog connector- of serviceconfiguratie.`
          : 'Geen open configuratieachterstand in capabilitylaag.',
        tenant: configHeavy[0],
        button: 'Tenant openen',
        action: 'tenantOpen',
      },
      {
        tone: 'background:#eff6ff;color:#1d4ed8;border:1px solid #93c5fd;',
        title: 'Snapshot-only',
        count: snapshotOnly.length,
        detail: snapshotOnly.length
          ? `${snapshotOnly.length} tenant${snapshotOnly.length !== 1 ? 's leunen' : ' leunt'} nog volledig op snapshotdata.`
          : 'Geen tenants die volledig snapshot-only draaien.',
        tenant: snapshotOnly[0],
        button: 'Guardian sync',
        action: 'guardianSync',
      },
      {
        tone: 'background:#fef2f2;color:#991b1b;border:1px solid #fca5a5;',
        title: 'Mislukte jobs',
        count: failedJobs.length,
        detail: failedJobs.length
          ? `${failedJobs.length} tenant${failedJobs.length !== 1 ? 's hebben' : ' heeft'} mislukte jobs die aandacht vragen.`
          : 'Geen mislukte jobs openstaand.',
        tenant: failedJobs[0],
        button: 'Refresh plannen',
        action: 'tenantRefresh',
      },
    ];

    wrap.innerHTML = cards
      .map(
        (card) => `
      <div style="${card.tone}border-radius:12px;padding:.85rem .95rem;">
        <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;">
          <div>
            <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;opacity:.75;">${global.escapeHtml(card.title)}</div>
            <div style="font-size:1.35rem;font-weight:800;line-height:1.1;margin-top:.15rem;">${global.escapeHtml(String(card.count))}</div>
          </div>
          ${card.tenant ? `<span style="font-size:.72rem;font-weight:700;padding:.12rem .45rem;border-radius:999px;background:rgba(255,255,255,.55);">${global.escapeHtml(card.tenant.tenant_name || card.tenant.customer_name || '')}</span>` : ''}
        </div>
        <div style="font-size:.78rem;line-height:1.45;margin-top:.45rem;min-height:2.4rem;">${global.escapeHtml(card.detail)}</div>
        ${
          card.tenant
            ? `
          <div style="margin-top:.6rem;">
            <button type="button" class="btn btn-secondary btn-sm" data-action="thRecommendationAction" data-rec-action="${global.escapeHtml(card.action)}" data-tenant-id="${global.escapeHtml(card.tenant.id || '')}" data-tenant-name="${global.escapeHtml(card.tenant.tenant_name || card.tenant.customer_name || card.tenant.id || '')}" style="font-size:.74rem;padding:.25rem .6rem;">${global.escapeHtml(card.button)}</button>
          </div>
        `
            : ''
        }
      </div>
    `
      )
      .join('');

    wrap.querySelectorAll('[data-action="thRecommendationAction"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.recAction;
        const tenantId = btn.dataset.tenantId;
        const tenantName = btn.dataset.tenantName;
        if (!tenantId) return;
        try {
          if (action === 'tenantOnboarding') {
            await global.openTenantOnboardingManager?.(tenantId, tenantName, null);
            return;
          }
          if (action === 'tenantOpen') {
            await global.selectTenantFromManagement?.(tenantId);
            global.showSection?.('overview');
            return;
          }
          if (action === 'guardianSync') {
            await global.enqueueTenantOnboardingJob?.(tenantId, 'guardian_sync', null, { limit: 25 });
            return;
          }
          if (action === 'tenantRefresh') {
            await global.enqueueTenantOnboardingJob?.(tenantId, 'tenant_refresh', null);
          }
        } catch (e) {
          global.showToast?.(`Fout bij aanbeveling: ${e.message || e}`, 'error');
        }
      });
    });
  }

  function thRenderSkeletons(grid, count = 6) {
    grid.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const sk = document.createElement('div');
      sk.className = 'th-card';
      sk.dataset.health = 'unknown';
      sk.innerHTML = `
        <div class="th-card-head">
          <div style="flex:1;">
            <div class="th-skeleton" style="height:14px;width:65%;margin-bottom:8px;"></div>
            <div class="th-skeleton" style="height:10px;width:45%;"></div>
          </div>
          <div class="th-skeleton" style="width:52px;height:52px;border-radius:10px;flex-shrink:0;"></div>
        </div>
        <div class="th-signals">
          <div class="th-skeleton" style="height:10px;width:80%;margin-bottom:6px;"></div>
          <div class="th-skeleton" style="height:10px;width:60%;"></div>
        </div>
        <div class="th-skeleton" style="height:10px;width:55%;margin-bottom:.9rem;"></div>
        <div class="th-card-footer" style="border-top:none;padding-top:0;">
          <div class="th-skeleton" style="height:32px;flex:1;border-radius:8px;"></div>
          <div class="th-skeleton" style="height:32px;width:60px;border-radius:8px;"></div>
        </div>`;
      grid.appendChild(sk);
    }
  }

  async function loadTenantHealthDashboard() {
    if (global.getCurrentUserRole?.() !== 'admin') return;

    const grid = document.getElementById('thGrid');
    const pills = document.getElementById('thSummaryPills');
    if (!grid) return;

    thRenderSkeletons(grid);

    let tenants = [];
    try {
      const data = await global.apiFetchCached?.('/api/tenants', {}, global.CACHE_TTL?.tenants || 300000);
      tenants = data && data.items ? data.items : [];
    } catch (e) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Tenants laden mislukt: ${global.escapeHtml(e.message)}</div>`;
      return;
    }

    if (tenants.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Nog geen tenants aangemaakt. Voeg een tenant toe via Admin → Tenants.</div>`;
      if (pills) pills.innerHTML = '';
      const recommendations = document.getElementById('thRecommendations');
      if (recommendations) recommendations.innerHTML = '';
      return;
    }

    const total = tenants.length;
    const scanned = tenants.filter((t) => t.latest_run?.status === 'completed').length;
    const crits = tenants.filter((t) => (t.latest_run?.critical_count || 0) > 0).length;
    const ready = tenants.filter((t) => (t.ops_summary?.onboarding?.completion_pct || 0) >= 75).length;
    const authReady = tenants.filter((t) => !!t.ops_summary?.onboarding?.auth_ready).length;
    const failedJobs = tenants.reduce((sum, t) => sum + Number(t.ops_summary?.job_summary?.failed || 0), 0);
    const ok = tenants.filter((t) => {
      const r = t.latest_run;
      return r?.status === 'completed' && (r.critical_count || 0) === 0 && (r.warning_count || 0) === 0;
    }).length;

    if (pills) {
      pills.innerHTML = `
        <span class="th-pill th-pill--total">◈ ${total} tenant${total !== 1 ? 's' : ''}</span>
        ${scanned > 0 ? `<span class="th-pill th-pill--ok">✓ ${ok} schoon</span>` : ''}
        ${crits > 0 ? `<span class="th-pill th-pill--crit">✕ ${crits} kritiek</span>` : ''}
        <span class="th-pill th-pill--ok">↗ ${ready} readiness gereed</span>
        <span class="th-pill th-pill--total">☁ ${authReady} auth-ready</span>
        ${failedJobs > 0 ? `<span class="th-pill th-pill--warn">⚠ ${failedJobs} mislukte jobs</span>` : ''}
        ${scanned < total ? `<span class="th-pill th-pill--warn">⚑ ${total - scanned} niet gescand</span>` : ''}
      `;
    }

    const order = { critical: 0, warning: 1, good: 2, unknown: 3 };
    tenants.sort((a, b) => {
      return (order[thHealthClass(a.latest_run?.score_overall)] ?? 3) - (order[thHealthClass(b.latest_run?.score_overall)] ?? 3);
    });

    grid.innerHTML = '';
    thBuildRecommendationCards(tenants);
    tenants.forEach((tenant) => grid.appendChild(thBuildCard(tenant)));

    global.loadMspAggregate?.();
  }

  global.DenjoyMspTenantHealth = {
    loadTenantHealthDashboard,
    thHealthClass,
    thRelativeDate,
    thBuildCard,
    thBuildRecommendationCards,
    thRenderSkeletons,
  };

  global.loadTenantHealthDashboard = loadTenantHealthDashboard;
}(window));
