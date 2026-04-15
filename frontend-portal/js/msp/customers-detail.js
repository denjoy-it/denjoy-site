(function initDenjoyMspCustomersDetail(global) {
  async function fetchCapabilitiesWithLimit(tenants, limit = 6) {
    const queue = Array.isArray(tenants) ? tenants.slice() : [];
    const out = [];
    const workers = Array.from({ length: Math.max(1, Number(limit) || 1) }, async () => {
      while (queue.length) {
        const tenant = queue.shift();
        if (!tenant?.tenant_id) continue;
        try {
          const data = await global.apiFetchCached(global.API.capabilities.tenant(tenant.tenant_id), {}, global.CACHE_TTL.medium);
          out.push([tenant.tenant_id, data]);
        } catch (_) {
          out.push([tenant.tenant_id, null]);
        }
      }
    });
    await Promise.all(workers);
    return new Map(out);
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

  function assessmentStatusBadge(status) {
    if (!status) return '<span style="font-size:.72rem;padding:.1rem .45rem;border-radius:999px;background:#f3f4f6;color:#6b7280;">Geen run</span>';
    const map = {
      completed: ['#dcfce7', '#166534', 'Voltooid'],
      running: ['#eff6ff', '#1d4ed8', 'Actief'],
      queued: ['#fff7ed', '#9a3412', 'Wachtrij'],
      failed: ['#fee2e2', '#991b1b', 'Mislukt'],
    };
    const [bg, fg, label] = map[status] || ['#f3f4f6', '#6b7280', status];
    return `<span style="font-size:.72rem;padding:.1rem .45rem;border-radius:999px;background:${bg};color:${fg};">${label}</span>`;
  }

  function renderCustomerAssessmentHistory(overview, assessmentsData) {
    if (!assessmentsData?.ok) return '';
    const trendPoints = Array.isArray(overview?.signals?.avg_trend_30d) ? overview.signals.avg_trend_30d : [];
    const timeline = (Array.isArray(assessmentsData.tenants) ? assessmentsData.tenants : [])
      .flatMap((tenant) => (Array.isArray(tenant.runs) ? tenant.runs : []).map((run) => ({
        ...run,
        tenant_name: tenant.tenant_name || tenant.tenant_id || 'Tenant',
      })))
      .sort((a, b) => {
        const aTs = String(a.completed_at || a.started_at || '');
        const bTs = String(b.completed_at || b.started_at || '');
        return bTs.localeCompare(aTs);
      })
      .slice(0, 8);
    const summary = assessmentsData.summary || {};
    const lastRun = timeline[0] || null;
    const trendMarkup = typeof global.DenjoyMspCustomersView?.renderTrendSparkline === 'function'
      ? global.DenjoyMspCustomersView.renderTrendSparkline(trendPoints)
      : '<span style="color:var(--text-muted,#6b7280);font-size:.82rem;">Trendweergave niet beschikbaar.</span>';
    return `
      <h4 style="margin:.75rem 0 .5rem;">Assessment historie & trends</h4>
      <div style="padding:.8rem .9rem;border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--card-bg,#fff);margin-bottom:.8rem;">
        ${trendMarkup}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.55rem;margin-bottom:.8rem;">
        <div style="padding:.55rem .65rem;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;background:var(--card-bg,#fff);"><div style="font-size:.68rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.05em;">Runs totaal</div><div style="font-size:1.05rem;font-weight:800;">${Number(summary.total_runs || 0)}</div></div>
        <div style="padding:.55rem .65rem;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;background:var(--card-bg,#fff);"><div style="font-size:.68rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.05em;">Actieve runs</div><div style="font-size:1.05rem;font-weight:800;color:${Number(summary.active_runs || 0) > 0 ? '#1d4ed8' : 'inherit'};">${Number(summary.active_runs || 0)}</div></div>
        <div style="padding:.55rem .65rem;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;background:var(--card-bg,#fff);"><div style="font-size:.68rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.05em;">Gem. score</div><div style="font-size:1.05rem;font-weight:800;">${summary.avg_score != null ? `${summary.avg_score}%` : '—'}</div></div>
        <div style="padding:.55rem .65rem;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;background:var(--card-bg,#fff);"><div style="font-size:.68rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.05em;">Laatste run</div><div style="font-size:1.05rem;font-weight:800;">${lastRun ? global.escapeHtml(String((lastRun.completed_at || lastRun.started_at || '').slice(0, 10) || '—')) : '—'}</div></div>
      </div>
      <div class="bev-wb-list" style="margin-bottom:.95rem;">
        ${timeline.length ? timeline.map((run) => `
          <div class="bev-wb-item" style="align-items:flex-start;">
            <div>
              <strong style="font-size:.83rem;">${global.escapeHtml(run.tenant_name || 'Tenant')}</strong>
              <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.3rem;align-items:center;">
                ${assessmentStatusBadge(run.status)}
                ${run.score_overall != null ? `<span style="font-size:.72rem;padding:.1rem .45rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);">${global.escapeHtml(String(run.score_overall))}%</span>` : ''}
                ${Number(run.critical_count || 0) > 0 ? `<span style="font-size:.72rem;color:#b91c1c;">${Number(run.critical_count || 0)} kritiek</span>` : ''}
                ${Number(run.warning_count || 0) > 0 ? `<span style="font-size:.72rem;color:#b45309;">${Number(run.warning_count || 0)} waarschuwingen</span>` : ''}
                <span style="font-size:.7rem;color:var(--text-muted,#6b7280);">${global.escapeHtml(String((run.completed_at || run.started_at || '').slice(0, 16) || '—').replace('T', ' '))}</span>
              </div>
            </div>
          </div>
        `).join('') : '<div class="bev-workbench-empty">Nog geen assessment historie beschikbaar.</div>'}
      </div>
    `;
  }

  function lifecycleTone(state) {
    if (state === 'running') return { bg: '#eff6ff', fg: '#1d4ed8', label: 'Scan bezig' };
    if (state === 'queued') return { bg: '#fff7ed', fg: '#9a3412', label: 'Scan ingepland' };
    if (state === 'completed_with_findings') return { bg: '#ecfdf5', fg: '#166534', label: 'Bevindingen beschikbaar' };
    if (state === 'completed_without_findings') return { bg: '#f8fafc', fg: '#475569', label: 'Scan voltooid, import nodig' };
    return { bg: '#f3f4f6', fg: '#6b7280', label: 'Nog niet gestart' };
  }

  async function importAssessmentFindings(tenantId, customerId) {
    try {
      const response = await fetch(`/api/findings/${tenantId}/import-snapshot`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${global.getToken?.() || ''}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.cookie.match(/denjoy_csrf=([^;]+)/)?.[1] || '',
        },
        credentials: 'include',
        body: '{}',
      });
      const data = await response.json();
      if (data.ok) {
        global.showToast?.(`${data.findings_written} bevindingen geïmporteerd.`, 'success');
      } else if (data.error_code === 'already_imported') {
        global.showToast?.(data.error || 'Assessment is al geïmporteerd.', 'info');
      } else {
        throw new Error(data.error || 'Import mislukt');
      }
      await Promise.allSettled([showKlantDetail(customerId), global.loadBevindingenSection?.()]);
    } catch (error) {
      global.showToast?.(`Import van bevindingen mislukt: ${error?.message || error}`, 'error');
    }
  }

  async function createCapabilityRecommendationAction(tenantId, customerId, tenantName, recommendation) {
    const label = recommendation?.label || 'Aanbeveling opvolgen';
    const detail = recommendation?.detail || '';
    const severity = recommendationSeverity(recommendation?.kind);
    await global.apiFetch('/api/actions', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        title: label,
        finding_key: `customer-capability:${String(recommendation?.action?.type || 'review')}`,
        severity,
        owner: '',
        due_date: recommendationDueDate(recommendation?.kind),
        status: 'open',
        notes: `${tenantName || tenantId}\n\n${detail}\n\nKlant: ${customerId}`,
        kb_asset_name: '',
      }),
    });
  }

  async function openTenantAzureDetail(tenantId, tenantName) {
    if (!tenantId || typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    global.openSideRailDetail('Azure', tenantName || tenantId);
    global.updateSideRailDetail(tenantName || tenantId, '<p class="cd-muted-paragraph">Azure data laden…</p>');
    try {
      const [summary, subscriptions, resources, alerts, costs] = await Promise.all([
        global.apiFetch(`/api/azure/${tenantId}/summary`).catch(() => ({})),
        global.apiFetch(`/api/azure/${tenantId}/subscriptions`).catch(() => ({ items: [] })),
        global.apiFetch(`/api/azure/${tenantId}/resources`).catch(() => ({ items: [] })),
        global.apiFetch(`/api/azure/${tenantId}/alerts`).catch(() => ({ items: [] })),
        global.apiFetch(`/api/azure/${tenantId}/costs`).catch(() => ({ items: [] })),
      ]);
      const subs = Array.isArray(subscriptions.items) ? subscriptions.items : [];
      const res = Array.isArray(resources.items) ? resources.items : [];
      const al = Array.isArray(alerts.items) ? alerts.items : [];
      const costItems = Array.isArray(costs.items) ? costs.items : [];
      const latestCost = costItems[0] || null;
      let latestCostValue = '—';
      if (latestCost?.summary_json) {
        try {
          const parsed = JSON.parse(latestCost.summary_json || '{}');
          const total = Number(parsed.total_cost || parsed.totalCost || 0);
          const currency = parsed.currency || 'EUR';
          latestCostValue = total > 0 ? `${total.toFixed(2)} ${currency}` : `0 ${currency}`;
        } catch (_) {
          latestCostValue = '—';
        }
      }
      const html = `
        <div class="bev-workbench-meta">${global.escapeHtml(tenantName || tenantId)} · Azure read-only overzicht</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.55rem;margin:.85rem 0;">
          <div style="padding:.55rem .65rem;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;"><div style="font-size:.68rem;color:var(--text-muted,#6b7280);">Subscriptions</div><div style="font-size:1.05rem;font-weight:800;">${Number(summary.subscription_count || subs.length || 0)}</div></div>
          <div style="padding:.55rem .65rem;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;"><div style="font-size:.68rem;color:var(--text-muted,#6b7280);">Resources</div><div style="font-size:1.05rem;font-weight:800;">${Number(summary.resource_snapshot_count || res.length || 0)}</div></div>
          <div style="padding:.55rem .65rem;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;"><div style="font-size:.68rem;color:var(--text-muted,#6b7280);">Alerts</div><div style="font-size:1.05rem;font-weight:800;">${Number(summary.alert_snapshot_count || al.length || 0)}</div></div>
          <div style="padding:.55rem .65rem;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;"><div style="font-size:.68rem;color:var(--text-muted,#6b7280);">Laatste kosten</div><div style="font-size:1.05rem;font-weight:800;">${global.escapeHtml(latestCostValue)}</div></div>
        </div>
        <div class="bev-wb-list" style="margin-bottom:.75rem;">
          <div class="bev-wb-item"><strong>Lighthouse onboarded</strong><span>${global.escapeHtml(String(summary.lighthouse_onboarded || 0))}</span></div>
          <div class="bev-wb-item"><strong>Kosten snapshots</strong><span>${global.escapeHtml(String(summary.cost_snapshot_count || costItems.length || 0))}</span></div>
        </div>
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#6b7280);margin:.55rem 0 .35rem;">Subscriptions</div>
        <div class="bev-wb-list">
          ${subs.length ? subs.slice(0, 8).map((item) => `
            <div class="bev-wb-item">
              <strong>${global.escapeHtml(item.display_name || item.azure_subscription_id || item.id || 'Subscription')}</strong>
              <span>${global.escapeHtml(item.state || 'unknown')} · ${Number(item.lighthouse_onboarded || 0) === 1 ? 'Lighthouse' : 'Geen Lighthouse'}</span>
            </div>
          `).join('') : '<div class="bev-workbench-empty">Nog geen abonnementen in deze tenant.</div>'}
        </div>
        <div class="results-actions-form-actions" style="margin-top:.85rem;display:flex;gap:.5rem;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary" id="azureDetailsOpenCostsBtn">Open Kosten</button>
        </div>
      `;
      global.updateSideRailDetail(tenantName || tenantId, html);
      document.getElementById('azureDetailsOpenCostsBtn')?.addEventListener('click', () => {
        if (typeof global.selectTenant === 'function') {
          global.selectTenant(tenantId, tenantName || tenantId);
        }
        if (typeof global.openSection === 'function') {
          global.openSection('kosten');
        }
      });
    } catch (e) {
      global.updateSideRailDetail(tenantName || tenantId, `<p style="color:#dc2626;">Azure data laden mislukt: ${global.escapeHtml(String(e?.message || e))}</p>`);
    }
  }

  async function showKlantDetail(customerId) {
    const panel = document.getElementById('kbhDetailPanel');
    const nameEl = document.getElementById('kbhDetailName');
    const body = document.getElementById('kbhDetailBody');
    const useRail = typeof global.openSideRailDetail === 'function' && typeof global.updateSideRailDetail === 'function';
    if (!useRail && (!panel || !body)) return;
    if (useRail) {
      global.openSideRailDetail('Klant', 'Klantdetail');
      global.updateSideRailDetail('Klantdetail', '<p class="cd-muted-paragraph">Laden…</p>');
    } else {
      panel.style.display = 'block';
      body.innerHTML = '<p class="cd-muted-paragraph">Laden…</p>';
    }
    try {
      const [c, overview, access, usersResp, rolesResp, assessmentsData, customerAzureData] = await Promise.all([
        global.apiFetch(`/api/customers/${customerId}`),
        global.apiFetch(`/api/customers/${customerId}/overview`).catch(() => null),
        global.apiFetch(`/api/customers/${customerId}/access`),
        global.apiFetchCached('/api/users', {}, global.CACHE_TTL.roles).catch(() => ({ items: [] })),
        global.apiFetchCached('/api/portal-roles', {}, global.CACHE_TTL.roles).catch(() => ({ items: [] })),
        global.apiFetch(`/api/customers/${customerId}/assessments`).catch(() => null),
        global.apiFetch(`/api/customers/${customerId}/azure`).catch(() => null),
      ]);
      const [onb, health, finance] = await Promise.all([
        overview?.onboarding
          ? Promise.resolve(overview.onboarding)
          : global.apiFetch(`/api/customers/${customerId}/onboarding`),
        overview?.health
          ? Promise.resolve(overview.health)
          : global.apiFetch(`/api/customers/${customerId}/health`),
        overview?.finance
          ? Promise.resolve(overview.finance)
          : global.apiFetch(`/api/customers/${customerId}/finance`).catch(() => ({ summary: {}, tenants: [] })),
      ]);
      if (nameEl) nameEl.textContent = c.name || 'Klant';
      const tenants = (c.tenants || []);
      const onbTenants = (onb.tenants || []);
      const services = Array.isArray(c.services) ? c.services : [];
      const healthSummary = health.summary || {};
      const accessItems = Array.isArray(access.items) ? access.items : [];
      const users = Array.isArray(usersResp.items) ? usersResp.items : [];
      const roles = Array.isArray(rolesResp.items) ? rolesResp.items : [];
      const userMap = new Map(users.map((item) => [item.id, item]));
      const roleMap = new Map(roles.map((item) => [item.id, item]));
      const financeSummary = finance.summary || {};
      const healthByTenant = new Map((health.tenants || []).map((item) => [item.tenant_id, item]));
      const onboardingSummary = onb.summary || {};
      const capabilityByTenant = await fetchCapabilitiesWithLimit(onbTenants, 6);
      const azureByTenant = new Map(
        ((customerAzureData?.tenants || []).map((item) => [item.tenant_id, item]))
      );
      const azureErrors = Array.isArray(customerAzureData?.errors) ? customerAzureData.errors : [];
      const detailHtml = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem;margin-bottom:1rem;">
          <div style="padding:.75rem .85rem;border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--card-bg,#fff);"><div style="font-size:.72rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.06em;">Gem. score</div><div style="font-size:1.3rem;font-weight:800;">${healthSummary.avg_score != null ? global.escapeHtml(String(healthSummary.avg_score)) + '%' : '—'}</div></div>
          <div style="padding:.75rem .85rem;border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--card-bg,#fff);"><div style="font-size:.72rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.06em;">Gereedheid</div><div style="font-size:1.3rem;font-weight:800;">${global.escapeHtml(String(onb.summary?.avg_completion_pct || 0))}%</div></div>
          <div style="padding:.75rem .85rem;border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--card-bg,#fff);"><div style="font-size:.72rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.06em;">Kritieke tenants</div><div style="font-size:1.3rem;font-weight:800;color:${(healthSummary.tenants_with_critical || 0) > 0 ? '#b91c1c' : 'var(--text-primary,#0f172a)'};">${global.escapeHtml(String(healthSummary.tenants_with_critical || 0))}</div></div>
          <div style="padding:.75rem .85rem;border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--card-bg,#fff);"><div style="font-size:.72rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.06em;">Openstaande taken</div><div style="font-size:1.3rem;font-weight:800;">${global.escapeHtml(String(healthSummary.pending_jobs || 0))}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
          <div><strong>Status:</strong> ${global.escapeHtml(c.status || '-')}</div>
          <div><strong>Contactpersoon:</strong> ${global.escapeHtml(c.primary_contact_name || '-')}</div>
          <div><strong>E-mail:</strong> ${global.escapeHtml(c.primary_contact_email || '-')}</div>
          <div><strong>Tenants:</strong> ${tenants.length}</div>
          <div><strong>Service tier:</strong> ${global.escapeHtml(c.service_tier || '-')}</div>
          <div><strong>Supportmodel:</strong> ${global.escapeHtml(c.support_model || '-')}</div>
          <div><strong>SLA:</strong> ${global.escapeHtml(c.sla_name || '-')}</div>
          <div><strong>Renewal:</strong> ${global.escapeHtml(c.renewal_date || '-')}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1rem;">
          ${services.length ? services.map((svc) => `<span style="padding:.2rem .6rem;border-radius:999px;background:${svc.is_enabled ? '#eff6ff' : '#f3f4f6'};color:${svc.is_enabled ? '#1d4ed8' : '#475569'};font-size:.76rem;font-weight:600;">${global.escapeHtml(svc.service_key || 'service')}</span>`).join('') : '<span style="font-size:.85rem;color:var(--text-muted,#6b7280);">Geen services gekoppeld.</span>'}
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem;">
          <button type="button" class="btn btn-secondary btn-sm" id="customerOnboardingManageBtn">Services beheren</button>
          <button type="button" class="btn btn-secondary btn-sm" id="customerOnboardingWizardBtn">Onboarding wizard</button>
          <button type="button" class="btn btn-secondary btn-sm" id="customerAccessManageBtn">Toegang beheren</button>
          <button type="button" class="btn btn-secondary btn-sm" id="customerKbAssetsBtn">KB apparaten</button>
          <button type="button" class="btn btn-secondary btn-sm" id="customerKbPagesBtn">KB documenten</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:.75rem;margin-bottom:1rem;font-size:.82rem;color:var(--text-secondary,#475569);">
          <span><strong>Services ready:</strong> ${global.escapeHtml(String(onboardingSummary.ready_services || 0))}/${global.escapeHtml(String(onboardingSummary.enabled_services || 0))}</span>
          <span><strong>Toegangsregels:</strong> ${accessItems.length}</span>
          <span><strong>KB assets:</strong> ${global.escapeHtml(String(healthSummary.kb_assets || 0))}</span>
          <span><strong>KB pagina's:</strong> ${global.escapeHtml(String(healthSummary.kb_pages || 0))}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:.75rem;margin-bottom:1rem;font-size:.82rem;color:var(--text-secondary,#475569);">
          <span><strong>Subscriptions:</strong> ${global.escapeHtml(String(financeSummary.subscription_count || 0))}</span>
          <span><strong>Lighthouse:</strong> ${global.escapeHtml(String(financeSummary.lighthouse_onboarded || 0))}</span>
          <span><strong>Laatste kosten:</strong> ${global.escapeHtml(String(financeSummary.latest_total_cost || 0))} ${(financeSummary.currencies || ['EUR']).join(', ')}</span>
          <span><strong>Service gap:</strong> ${global.escapeHtml(String(financeSummary.service_gap || 0))}</span>
          <span><strong>Verouderde kosten:</strong> ${global.escapeHtml(String(financeSummary.stale_cost_snapshots || 0))}</span>
        </div>
        <div style="margin-bottom:1rem;">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#6b7280);margin-bottom:.35rem;">Klanttoegang</div>
          <div class="bev-wb-list">
            ${accessItems.length ? accessItems.map((entry) => {
              const user = userMap.get(entry.portal_user_id) || {};
              const role = roleMap.get(entry.portal_role_id) || {};
              return `
                <div class="bev-wb-item">
                  <strong>${global.escapeHtml(user.display_name || user.email || entry.portal_user_id || 'Gebruiker')}</strong>
                  <span>${global.escapeHtml(role.label || role.role_key || 'rol')} · ${global.escapeHtml(user.email || '')}</span>
                </div>
              `;
            }).join('') : '<div class="bev-workbench-empty">Nog geen gebruikers aan deze klant gekoppeld.</div>'}
          </div>
        </div>
        ${c.notes ? `<p style="color:var(--text-muted,#6b7280);font-size:.875rem;">${global.escapeHtml(c.notes)}</p>` : ''}
        ${renderCustomerAssessmentHistory(overview, assessmentsData)}
        <h4 style="margin:.75rem 0 .5rem;">Onboarding voortgang</h4>
        ${onbTenants.map((t) => {
          const tenantHealth = healthByTenant.get(t.tenant_id) || {};
          const capabilitySummary = tenantHealth.ops_summary?.capability_summary || {};
          const jobSummary = tenantHealth.ops_summary?.job_summary || {};
          const serviceSummary = t.service_summary || {};
          const serviceItems = Array.isArray(t.service_items) ? t.service_items : [];
          const nextActions = Array.isArray(t.next_actions) ? t.next_actions : [];
          const tenantCapabilities = capabilityByTenant.get(t.tenant_id);
          const recommendations = global.DenjoyMspCustomersView.buildTenantCapabilityRecommendations(serviceItems, tenantCapabilities, t);
          return `
          <div style="margin-bottom:.75rem;padding:.75rem;border:1px solid var(--border-color,#e5e7eb);border-radius:6px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:.4rem;">
              <strong style="font-size:.875rem;">${global.escapeHtml(t.tenant_name || t.tenant_id)}</strong>
              <span style="font-size:.8rem;color:var(--text-muted,#6b7280);">${t.completion_pct ?? 0}%</span>
            </div>
            <div style="height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${t.completion_pct ?? 0}%;background:#2563eb;border-radius:3px;transition:width .3s;"></div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.55rem;margin-bottom:.15rem;">
              <span style="padding:.15rem .5rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);font-size:.72rem;">Auth ${t.auth_ready ? 'gereed' : 'mist'}</span>
              <span style="padding:.15rem .5rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);font-size:.72rem;">KB ${t.kb_ready ? 'gevuld' : 'leeg'}</span>
              <span style="padding:.15rem .5rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);font-size:.72rem;">Services ${t.services_ready ? 'gekoppeld' : 'ontbreken'}</span>
              <span style="padding:.15rem .5rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);font-size:.72rem;">Onboarded ${global.escapeHtml(String(serviceSummary.ready || 0))}/${global.escapeHtml(String(serviceSummary.enabled || 0))}</span>
              <span style="padding:.15rem .5rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);font-size:.72rem;">Capabilities ${global.escapeHtml(String(capabilitySummary.live_ready || 0))}/${global.escapeHtml(String(capabilitySummary.total || 0))}</span>
              <span style="padding:.15rem .5rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);font-size:.72rem;">Jobs ${global.escapeHtml(String((jobSummary.pending || 0) + (jobSummary.running || 0) + (jobSummary.failed || 0)))}</span>
            </div>
            ${serviceItems.length ? `
              <div style="margin-top:.55rem;">
                <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#6b7280);margin-bottom:.35rem;">Service checklist</div>
                <div style="display:flex;flex-wrap:wrap;gap:.35rem;">
                  ${serviceItems.map((svc) => `
                    <span style="font-size:.72rem;padding:.1rem .5rem;border-radius:999px;background:${svc.status === 'ready' ? '#dcfce7' : svc.status === 'in_progress' ? '#eff6ff' : '#fee2e2'};color:${svc.status === 'ready' ? '#166534' : svc.status === 'in_progress' ? '#1d4ed8' : '#991b1b'};">${svc.status === 'ready' ? '✓' : svc.status === 'in_progress' ? '↻' : '✗'} ${global.escapeHtml(svc.service_key || 'service')}</span>
                  `).join('')}
                </div>
              </div>
            ` : ''}
            ${serviceItems.length ? `
              <div style="margin-top:.55rem;">
                <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#6b7280);margin-bottom:.35rem;">Service → capability</div>
                <div style="display:flex;flex-wrap:wrap;gap:.35rem;">
                  ${serviceItems.map((svc) => global.DenjoyMspCustomersView.renderServiceCapabilityPill(svc.service_key, tenantCapabilities)).join('')}
                </div>
              </div>
            ` : ''}
            ${recommendations.length ? `
              <div style="margin-top:.65rem;">
                <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#6b7280);margin-bottom:.35rem;">Aanbevolen acties</div>
                <div style="display:grid;gap:.4rem;">
                  ${recommendations.map((item) => {
                    const tone = recommendationTone(item.kind);
                    return `
                      <div style="padding:.55rem .65rem;border-radius:10px;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.border};">
                        <div style="font-size:.78rem;font-weight:700;">${global.escapeHtml(item.label)}</div>
                        <div style="font-size:.74rem;line-height:1.45;margin-top:.15rem;">${global.escapeHtml(item.detail)}</div>
                        ${(item.action || item.kind === 'critical' || item.kind === 'warn') ? `
                          <div style="display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.45rem;">
                            ${item.action ? `
                            <button type="button" class="btn btn-secondary btn-sm cd-btn-micro" data-action="runCapabilityRecommendation" data-rec-action="${global.escapeHtml(item.action.type || '')}" data-rec-service-key="${global.escapeHtml(item.action.service_key || '')}" data-tenant-id="${global.escapeHtml(t.tenant_id)}" data-tenant-name="${global.escapeHtml(t.tenant_name || t.tenant_id)}" data-customer-id="${global.escapeHtml(customerId)}">${global.escapeHtml(item.action.label || 'Open')}</button>
                            ` : ''}
                            ${(item.kind === 'critical' || item.kind === 'warn') ? `
                              <button type="button" class="btn btn-secondary btn-sm cd-btn-micro" data-action="createCapabilityRecommendationAction" data-rec-label="${global.escapeHtml(item.label)}" data-rec-detail="${global.escapeHtml(item.detail)}" data-rec-kind="${global.escapeHtml(item.kind || 'info')}" data-rec-subaction="${global.escapeHtml(item.action?.type || '')}" data-tenant-id="${global.escapeHtml(t.tenant_id)}" data-tenant-name="${global.escapeHtml(t.tenant_name || t.tenant_id)}" data-customer-id="${global.escapeHtml(customerId)}">Actie</button>
                              <button type="button" class="btn btn-secondary btn-sm cd-btn-micro" data-action="requestCapabilityRecommendationApproval" data-rec-label="${global.escapeHtml(item.label)}" data-rec-detail="${global.escapeHtml(item.detail)}" data-rec-kind="${global.escapeHtml(item.kind || 'info')}" data-rec-subaction="${global.escapeHtml(item.action?.type || '')}" data-tenant-id="${global.escapeHtml(t.tenant_id)}" data-tenant-name="${global.escapeHtml(t.tenant_name || t.tenant_id)}" data-customer-id="${global.escapeHtml(customerId)}">Goedkeuring</button>
                            ` : ''}
                          </div>
                        ` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}
            ${nextActions.length ? `
              <div style="margin-top:.55rem;">
                <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#6b7280);margin-bottom:.35rem;">Volgende stappen</div>
                <div style="display:flex;flex-wrap:wrap;gap:.35rem;">
                  ${nextActions.map((label) => `<span style="font-size:.72rem;padding:.1rem .5rem;border-radius:999px;background:#fff7ed;color:#9a3412;border:1px solid #fdba74;">${global.escapeHtml(label)}</span>`).join('')}
                </div>
              </div>
            ` : ''}
            <div style="display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.5rem;">
              ${(t.steps || []).map((s) => `<span style="font-size:.72rem;padding:.1rem .5rem;border-radius:999px;background:${s.done ? '#dcfce7' : s.required === false ? '#f8fafc' : '#fee2e2'};color:${s.done ? '#166534' : s.required === false ? '#475569' : '#991b1b'};">${s.done ? '✓' : s.required === false ? '○' : '✗'} ${global.escapeHtml(s.label)}</span>`).join('')}
            </div>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem;">
              <button type="button" class="btn btn-secondary btn-sm" data-action="manageTenantOnboarding" data-id="${global.escapeHtml(t.tenant_id)}" data-name="${global.escapeHtml(t.tenant_name || t.tenant_id)}">Tenant onboarding beheren</button>
              <button type="button" class="btn btn-secondary btn-sm" data-action="openTenantKb" data-kb-tab="overview" data-id="${global.escapeHtml(t.tenant_id)}" data-name="${global.escapeHtml(t.tenant_name || t.tenant_id)}">KB overzicht</button>
              <button type="button" class="btn btn-secondary btn-sm" data-action="openTenantKb" data-kb-tab="appregs" data-id="${global.escapeHtml(t.tenant_id)}" data-name="${global.escapeHtml(t.tenant_name || t.tenant_id)}">KB app registraties</button>
              <button type="button" class="btn btn-secondary btn-sm" data-action="openTenantKb" data-kb-tab="changelog" data-id="${global.escapeHtml(t.tenant_id)}" data-name="${global.escapeHtml(t.tenant_name || t.tenant_id)}">KB wijzigingslog</button>
            </div>
          </div>`;
        }).join('') || '<p style="color:var(--text-muted,#6b7280);font-size:.875rem;">Geen tenants gekoppeld.</p>'}
        ${(() => {
          if (!assessmentsData || !assessmentsData.ok) return '';
          const aSum = assessmentsData.summary || {};
          const aTenants = assessmentsData.tenants || [];
          return `
            <h4 style="margin:.75rem 0 .5rem;">Assessment status</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:.5rem;margin-bottom:.75rem;">
              <div style="padding:.5rem .65rem;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;background:var(--card-bg,#fff);"><div style="font-size:.68rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.05em;">Gem. score</div><div style="font-size:1.1rem;font-weight:800;">${aSum.avg_score != null ? aSum.avg_score + '%' : '—'}</div></div>
              <div style="padding:.5rem .65rem;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;background:var(--card-bg,#fff);"><div style="font-size:.68rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.05em;">Beoordeeld</div><div style="font-size:1.1rem;font-weight:800;">${aSum.tenants_assessed ?? 0}/${aSum.tenant_count ?? 0}</div></div>
              <div style="padding:.5rem .65rem;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;background:var(--card-bg,#fff);"><div style="font-size:.68rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.05em;">Kritiek</div><div style="font-size:1.1rem;font-weight:800;color:${(aSum.total_critical || 0) > 0 ? '#b91c1c' : 'inherit'}">${aSum.total_critical ?? 0}</div></div>
              <div style="padding:.5rem .65rem;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;background:var(--card-bg,#fff);"><div style="font-size:.68rem;color:var(--text-muted,#6b7280);text-transform:uppercase;letter-spacing:.05em;">Actief</div><div style="font-size:1.1rem;font-weight:800;color:${(aSum.active_runs || 0) > 0 ? '#1d4ed8' : 'inherit'}">${aSum.active_runs ?? 0}</div></div>
            </div>
            <div class="bev-wb-list">
              ${aTenants.map((at) => {
                const lr = at.latest_run;
                const score = lr?.score_overall;
                const findingSummary = at.findings_summary || {};
                const lifecycle = lifecycleTone(at.lifecycle_state);
                return `
                  <div class="bev-wb-item" style="align-items:flex-start;">
                    <div>
                      <strong style="font-size:.83rem;">${global.escapeHtml(at.tenant_name || at.tenant_id)}</strong>
                      <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.3rem;align-items:center;">
                        <span style="font-size:.72rem;padding:.1rem .45rem;border-radius:999px;background:${lifecycle.bg};color:${lifecycle.fg};">${lifecycle.label}</span>
                        ${assessmentStatusBadge(lr?.status)}
                        ${score != null ? `<span style="font-size:.72rem;padding:.1rem .45rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);">${score}%</span>` : ''}
                        ${(lr?.critical_count || 0) > 0 ? `<span style="font-size:.72rem;color:#b91c1c;">${lr.critical_count} kritiek</span>` : ''}
                        ${(lr?.warning_count || 0) > 0 ? `<span style="font-size:.72rem;color:#b45309;">${lr.warning_count} warn</span>` : ''}
                        ${lr?.completed_at ? `<span style="font-size:.7rem;color:var(--text-muted,#6b7280);">${lr.completed_at.slice(0,10)}</span>` : ''}
                        ${Number(findingSummary.total || 0) > 0 ? `<span style="font-size:.72rem;color:#166534;">${Number(findingSummary.total || 0)} bevindingen</span>` : ''}
                        ${Number(findingSummary.critical_count || 0) > 0 ? `<span style="font-size:.72rem;color:#b91c1c;">${Number(findingSummary.critical_count || 0)} kritiek open</span>` : ''}
                        ${(at.open_actions || 0) > 0 ? `<span style="font-size:.72rem;color:#7c3aed;">${at.open_actions} acties open</span>` : ''}
                      </div>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.3rem;">
                      <button type="button" class="btn btn-secondary btn-sm cd-btn-micro" data-action="openTenantAssessment" data-id="${global.escapeHtml(at.tenant_id)}" data-name="${global.escapeHtml(at.tenant_name || at.tenant_id)}">Assessment</button>
                      <button type="button" class="btn btn-secondary btn-sm cd-btn-micro" data-action="openTenantFindings" data-id="${global.escapeHtml(at.tenant_id)}" data-name="${global.escapeHtml(at.tenant_name || at.tenant_id)}">Bevindingen</button>
                      ${at.lifecycle_state === 'completed_without_findings' ? `<button type="button" class="btn btn-secondary btn-sm cd-btn-micro" data-action="importTenantFindings" data-id="${global.escapeHtml(at.tenant_id)}" data-name="${global.escapeHtml(at.tenant_name || at.tenant_id)}">Importeer bevindingen</button>` : ''}
                      ${!at.active_run && !lr ? `<button type="button" class="btn btn-secondary btn-sm cd-btn-micro" data-action="queueTenantAssessment" data-id="${global.escapeHtml(at.tenant_id)}" data-name="${global.escapeHtml(at.tenant_name || at.tenant_id)}">Start scan</button>` : ''}
                      ${lr?.report_path ? `<button type="button" class="btn btn-secondary btn-sm cd-btn-micro" data-action="viewAssessmentReport" data-report-path="${global.escapeHtml(lr.report_path)}">Rapport</button>` : ''}
                    </div>
                  </div>
                `;
              }).join('') || '<div class="bev-workbench-empty">Geen assessment data beschikbaar.</div>'}
            </div>
          `;
        })()}
        ${(() => {
          if (!onbTenants.length) return '';
          const cards = onbTenants.map((tenant) => {
            const az = azureByTenant.get(tenant.tenant_id) || {};
            const subCount = Number(az.subscription_count || 0);
            const resourceCount = Number(az.resource_snapshot_count || 0);
            const alertCount = Number(az.alert_snapshot_count || 0);
            const costCount = Number(az.cost_snapshot_count || 0);
            const lighthouse = Number(az.lighthouse_onboarded || 0);
            const healthy = subCount > 0 || resourceCount > 0 || alertCount > 0 || costCount > 0;
            return `
              <div class="bev-wb-item" style="align-items:flex-start;">
                <div>
                  <strong style="font-size:.83rem;">${global.escapeHtml(tenant.tenant_name || tenant.tenant_id)}</strong>
                  <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.3rem;align-items:center;">
                    <span style="font-size:.72rem;padding:.1rem .45rem;border-radius:999px;background:${healthy ? '#ecfdf5' : '#f3f4f6'};color:${healthy ? '#166534' : '#6b7280'};">${healthy ? 'Data beschikbaar' : 'Nog geen data'}</span>
                    <span style="font-size:.72rem;padding:.1rem .45rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);">Subs ${subCount}</span>
                    <span style="font-size:.72rem;padding:.1rem .45rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);">Resources ${resourceCount}</span>
                    <span style="font-size:.72rem;padding:.1rem .45rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);">Alerts ${alertCount}</span>
                    <span style="font-size:.72rem;padding:.1rem .45rem;border-radius:999px;background:#f8fafc;border:1px solid var(--border-color,#e5e7eb);">Kosten ${costCount}</span>
                    ${lighthouse > 0 ? `<span style="font-size:.72rem;color:#166534;">Lighthouse ${lighthouse}</span>` : ''}
                  </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.3rem;">
                  <button type="button" class="btn btn-secondary btn-sm cd-btn-micro" data-action="openTenantAzureDetail" data-id="${global.escapeHtml(tenant.tenant_id)}" data-name="${global.escapeHtml(tenant.tenant_name || tenant.tenant_id)}">Azure details</button>
                  <button type="button" class="btn btn-secondary btn-sm cd-btn-micro" data-action="openTenantCosts" data-id="${global.escapeHtml(tenant.tenant_id)}" data-name="${global.escapeHtml(tenant.tenant_name || tenant.tenant_id)}">Kosten</button>
                </div>
              </div>
            `;
          });
          return `
            <h4 style="margin:.75rem 0 .5rem;">Azure status</h4>
            ${azureErrors.length ? `
              <div style="margin:0 0 .6rem;padding:.55rem .7rem;border-radius:8px;border:1px solid #fdba74;background:#fff7ed;color:#9a3412;font-size:.78rem;">
                Azure data is gedeeltelijk geladen (${azureErrors.length} tenant${azureErrors.length === 1 ? '' : 's'} met fouten). Check backend logs voor details.
              </div>
            ` : ''}
            <div class="bev-wb-list">
              ${cards.join('')}
            </div>
          `;
        })()}
      `;
      if (useRail) {
        global.updateSideRailDetail(c.name || 'Klant', detailHtml);
      } else {
        if (nameEl) nameEl.textContent = c.name || 'Klant';
        body.innerHTML = detailHtml;
      }
      document.getElementById('customerOnboardingManageBtn')?.addEventListener('click', () => global.openCustomerOnboardingManager?.(customerId));
      document.getElementById('customerOnboardingWizardBtn')?.addEventListener('click', () => openCustomerOnboardingWizard(customerId));
      document.getElementById('customerAccessManageBtn')?.addEventListener('click', () => global.openCustomerAccessManager?.(customerId, c.name || 'Klant'));
      document.getElementById('customerKbAssetsBtn')?.addEventListener('click', async () => {
        const firstTenant = onbTenants[0];
        if (!firstTenant?.tenant_id) {
          global.showToast?.('Deze klant heeft nog geen tenant gekoppeld voor KB-context.', 'warning');
          return;
        }
        await global.openTenantKnowledgeBase?.(firstTenant.tenant_id, 'assets', firstTenant.tenant_name || firstTenant.tenant_id);
      });
      document.getElementById('customerKbPagesBtn')?.addEventListener('click', async () => {
        const firstTenant = onbTenants[0];
        if (!firstTenant?.tenant_id) {
          global.showToast?.('Deze klant heeft nog geen tenant gekoppeld voor KB-context.', 'warning');
          return;
        }
        await global.openTenantKnowledgeBase?.(firstTenant.tenant_id, 'pages', firstTenant.tenant_name || firstTenant.tenant_id);
      });
      document.querySelectorAll('[data-action="manageTenantOnboarding"]').forEach((btn) => {
        btn.addEventListener('click', () => global.openTenantOnboardingManager?.(btn.dataset.id, btn.dataset.name, customerId));
      });
      document.querySelectorAll('[data-action="openTenantKb"]').forEach((btn) => {
        btn.addEventListener('click', () => global.openTenantKnowledgeBase?.(btn.dataset.id, btn.dataset.kbTab || 'overview', btn.dataset.name));
      });
      document.querySelectorAll('[data-action="openTenantAssessment"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (typeof global.selectTenant === 'function') {
            global.selectTenant(btn.dataset.id, btn.dataset.name);
          }
          if (typeof global.openSection === 'function') {
            global.openSection('assessment');
          } else {
            global.showToast?.(`Navigeer handmatig naar Assessment voor tenant: ${btn.dataset.name}`, 'info');
          }
        });
      });
      document.querySelectorAll('[data-action="viewAssessmentReport"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const path = btn.dataset.reportPath;
          if (path) window.open(path, '_blank', 'noopener,noreferrer');
        });
      });
      document.querySelectorAll('[data-action="openTenantFindings"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (typeof global.selectTenant === 'function') {
            global.selectTenant(btn.dataset.id, btn.dataset.name);
          }
          if (typeof global.openSection === 'function') {
            global.openSection('bevindingen');
          } else {
            global.showToast?.(`Navigeer handmatig naar Bevindingen voor tenant: ${btn.dataset.name}`, 'info');
          }
        });
      });
      document.querySelectorAll('[data-action="importTenantFindings"]').forEach((btn) => {
        btn.addEventListener('click', () => importAssessmentFindings(btn.dataset.id, customerId));
      });
      document.querySelectorAll('[data-action="queueTenantAssessment"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await global.enqueueTenantOnboardingJob?.(btn.dataset.id, 'assessment_run', customerId);
        });
      });
      document.querySelectorAll('[data-action="openTenantCosts"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (typeof global.selectTenant === 'function') {
            global.selectTenant(btn.dataset.id, btn.dataset.name);
          }
          if (typeof global.openSection === 'function') {
            global.openSection('kosten');
            return;
          }
          global.showToast?.(`Navigeer handmatig naar Kosten voor tenant: ${btn.dataset.name}`, 'info');
        });
      });
      document.querySelectorAll('[data-action="openTenantAzureDetail"]').forEach((btn) => {
        btn.addEventListener('click', () => openTenantAzureDetail(btn.dataset.id, btn.dataset.name));
      });
      document.querySelectorAll('[data-action="runCapabilityRecommendation"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const actionType = btn.dataset.recAction;
          const tenantId = btn.dataset.tenantId;
          const tenantName = btn.dataset.tenantName;
          const serviceKey = btn.dataset.recServiceKey;
          try {
            if (actionType === 'customer_services') {
              await global.openCustomerOnboardingManager?.(customerId);
              if (serviceKey) {
                const select = document.getElementById('customerServiceKeyInput');
                if (select) select.value = serviceKey;
              }
              return;
            }
            if (actionType === 'tenant_onboarding') {
              await global.openTenantOnboardingManager?.(tenantId, tenantName, customerId);
              return;
            }
            if (actionType === 'tenant_refresh') {
              await global.enqueueTenantOnboardingJob?.(tenantId, 'tenant_refresh', customerId);
              return;
            }
            if (actionType === 'guardian_sync') {
              await global.enqueueTenantOnboardingJob?.(tenantId, 'guardian_sync', customerId, { limit: 25 });
            }
          } catch (e) {
            global.showToast?.(`Fout bij uitvoeren aanbeveling: ${e.message || e}`, 'error');
          }
        });
      });
      document.querySelectorAll('[data-action="createCapabilityRecommendationAction"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const tenantId = btn.dataset.tenantId;
          const tenantName = btn.dataset.tenantName;
          const recommendation = {
            label: btn.dataset.recLabel || 'Aanbeveling opvolgen',
            detail: btn.dataset.recDetail || '',
            kind: btn.dataset.recKind || 'info',
            action: { type: btn.dataset.recSubaction || '' },
          };
          try {
            await createCapabilityRecommendationAction(tenantId, customerId, tenantName, recommendation);
            global.showToast?.('Opvolgactie aangemaakt.', 'success');
            await Promise.allSettled([global.loadActionsPanel?.(), showKlantDetail(customerId)]);
          } catch (e) {
            global.showToast?.(`Fout bij actie-aanmaak: ${e.message || e}`, 'error');
          }
        });
      });
      document.querySelectorAll('[data-action="requestCapabilityRecommendationApproval"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const tenantId = btn.dataset.tenantId;
          const recommendation = {
            label: btn.dataset.recLabel || 'Aanbeveling opvolgen',
            detail: btn.dataset.recDetail || '',
            kind: btn.dataset.recKind || 'info',
            action: { type: btn.dataset.recSubaction || '' },
          };
          await global.requestOnboardingApproval?.(
            tenantId,
            'capabilities',
            'capability_recommendation_requested',
            `Goedkeuring gevraagd voor aanbeveling: ${recommendation.label}`,
            {
              label: recommendation.label,
              detail: recommendation.detail,
              kind: recommendation.kind,
              recommendation_action: recommendation.action?.type || null,
            },
          );
        });
      });
    } catch (e) {
      const errorHtml = `<p style="color:#dc2626;">Fout bij laden: ${global.escapeHtml(String(e))}</p>`;
      if (useRail) {
        global.updateSideRailDetail('Klantdetail', errorHtml);
      } else {
        body.innerHTML = errorHtml;
      }
    }
  }

  async function openCustomerOnboardingWizard(customerId) {
    const customer = await global.apiFetch(`/api/customers/${customerId}`);
    const onboarding = await global.apiFetch(`/api/customers/${customerId}/onboarding`);
    const tenants = Array.isArray(onboarding.tenants) ? onboarding.tenants : [];
    if (typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    global.openSideRailDetail('Onboarding wizard', customer.name || 'Klant');
    global.updateSideRailDetail(customer.name || 'Onboarding wizard', `
      <div class="bev-workbench-meta">${global.escapeHtml(customer.name || 'Klant')} · onboarding wizard</div>
      <div class="bev-wb-list u-mt-md">
        <div class="bev-wb-item"><strong>Service tier</strong><span>${global.escapeHtml(customer.service_tier || 'Nog niet vastgelegd')}</span></div>
        <div class="bev-wb-item"><strong>SLA</strong><span>${global.escapeHtml(customer.sla_name || 'Nog niet vastgelegd')}</span></div>
        <div class="bev-wb-item"><strong>Supportmodel</strong><span>${global.escapeHtml(customer.support_model || 'Nog niet vastgelegd')}</span></div>
        <div class="bev-wb-item"><strong>Renewal</strong><span>${global.escapeHtml(customer.renewal_date || 'Nog niet vastgelegd')}</span></div>
      </div>
      <div style="margin-top:1rem;">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#6b7280);margin-bottom:.35rem;">Wizard stappen</div>
        <div class="bev-wb-list">
          <div class="bev-wb-item"><strong>1. Contractcontext</strong><span>${customer.service_tier && customer.sla_name ? 'Gereed' : 'Aanvullen in klantkaart'}</span></div>
          <div class="bev-wb-item"><strong>2. Services</strong><span>${Number(customer.onboarding_summary?.enabled_services || 0)} gekoppeld</span></div>
          <div class="bev-wb-item"><strong>3. Tenants</strong><span>${tenants.length} tenant(s) gekoppeld</span></div>
          <div class="bev-wb-item"><strong>4. Gereedheid</strong><span>${global.escapeHtml(String(customer.onboarding_summary?.avg_completion_pct || 0))}% gemiddeld</span></div>
        </div>
      </div>
      <div class="results-actions-form-actions" style="margin-top:1rem;display:flex;flex-wrap:wrap;gap:.5rem;">
        <button type="button" class="btn btn-secondary" id="customerWizardEditBtn">Klantkaart aanvullen</button>
        <button type="button" class="btn btn-secondary" id="customerWizardServicesBtn">Services beheren</button>
      </div>
      <div class="bev-wb-list" style="margin-top:1rem;">
        ${tenants.length ? tenants.map((tenant) => `
          <div class="bev-wb-item">
            <strong>${global.escapeHtml(tenant.tenant_name || tenant.tenant_id)}</strong>
            <span>${global.escapeHtml(String(tenant.completion_pct || 0))}% readiness · ${global.escapeHtml((tenant.next_actions || []).join(', ') || 'Geen openstaande stappen')}</span>
            <div class="bev-inline-actions roles-inline-actions">
              <button type="button" class="bev-inline-btn" data-action="wizardManageTenant" data-id="${global.escapeHtml(tenant.tenant_id)}" data-name="${global.escapeHtml(tenant.tenant_name || tenant.tenant_id)}">Tenant onboarding</button>
              <button type="button" class="bev-inline-btn" data-action="wizardOpenApps" data-id="${global.escapeHtml(tenant.tenant_id)}" data-name="${global.escapeHtml(tenant.tenant_name || tenant.tenant_id)}">App Registraties</button>
              <button type="button" class="bev-inline-btn" data-action="wizardLaunchPlan" data-id="${global.escapeHtml(tenant.tenant_id)}" data-plan="readiness">Gereedheidsketen</button>
            </div>
          </div>
        `).join('') : '<div class="bev-workbench-empty">Nog geen tenants gekoppeld.</div>'}
      </div>
    `);
    document.getElementById('customerWizardEditBtn')?.addEventListener('click', () => global._showKlantForm?.(customerId));
    document.getElementById('customerWizardServicesBtn')?.addEventListener('click', () => global.openCustomerOnboardingManager?.(customerId));
    document.querySelectorAll('[data-action="wizardManageTenant"]').forEach((btn) => {
      btn.addEventListener('click', () => global.openTenantOnboardingManager?.(btn.dataset.id, btn.dataset.name, customerId));
    });
    document.querySelectorAll('[data-action="wizardOpenApps"]').forEach((btn) => {
      btn.addEventListener('click', () => global.openTenantAppRegistrations?.(btn.dataset.id, btn.dataset.name));
    });
    document.querySelectorAll('[data-action="wizardLaunchPlan"]').forEach((btn) => {
      btn.addEventListener('click', () => global.launchTenantOnboardingPlan?.(btn.dataset.id, btn.dataset.plan || 'readiness', customerId));
    });
  }

  global.DenjoyMspCustomersDetail = {
    showKlantDetail,
    openCustomerOnboardingWizard,
  };
  global._showKlantDetail = showKlantDetail;
  global.openCustomerOnboardingWizard = openCustomerOnboardingWizard;
})(window);
