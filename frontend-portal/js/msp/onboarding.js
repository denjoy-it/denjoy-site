(function initDenjoyMspOnboarding(global) {
  const customerServiceOptions = [
    'identity',
    'security',
    'exchange',
    'intune',
    'backup',
    'alerts',
    'zerotrust',
    'kb',
    'management_hub',
  ];

  function nowIsoString() {
    return new Date().toISOString();
  }

  function optionalTask(handler, ...args) {
    if (typeof handler !== 'function') return Promise.resolve();
    try {
      return Promise.resolve(handler(...args));
    } catch (_) {
      return Promise.resolve();
    }
  }

  async function upsertCustomerService(customerId, serviceKey, patch = {}) {
    try {
      await global.apiFetch(`/api/customers/${customerId}/services`, {
        method: 'POST',
        body: JSON.stringify({
          service_key: serviceKey,
          is_enabled: patch.is_enabled !== undefined ? patch.is_enabled : true,
          onboarded_at: Object.prototype.hasOwnProperty.call(patch, 'onboarded_at') ? patch.onboarded_at : nowIsoString(),
          notes: patch.notes || null,
        }),
      });
      global.showToast?.('Service bijgewerkt.', 'success');
      await Promise.allSettled([
        optionalTask(global.loadKlantenbeheer),
        optionalTask(global._showKlantDetail, customerId),
      ]);
    } catch (e) {
      global.showToast?.(`Fout bij service-update: ${e.message || e}`, 'error');
    }
  }

  async function requestOnboardingApproval(tenantId, subsection, actionType, reason, metadata = {}) {
    try {
      await global.apiFetch(`/api/onboarding/${tenantId}/approvals`, {
        method: 'POST',
        body: JSON.stringify({ subsection, action_type: actionType, reason, metadata }),
      });
      global.showToast?.('Goedkeuringsverzoek aangemaakt.', 'success');
      await Promise.allSettled([
        optionalTask(global.loadGoedkeuringen),
        optionalTask(global.loadMspControlCenter),
      ]);
    } catch (e) {
      global.showToast?.(`Fout bij goedkeuringsverzoek: ${e.message || e}`, 'error');
    }
  }

  async function enqueueTenantOnboardingJob(tenantId, jobType, customerId = null, payload = {}) {
    try {
      await global.apiFetch('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, job_type: jobType, payload }),
      });
      global.showToast?.(`${jobType} ingepland.`, 'success');
      await Promise.allSettled([
        optionalTask(global.loadJobMonitor),
        optionalTask(global.loadKlantenbeheer),
        customerId ? optionalTask(global._showKlantDetail, customerId) : Promise.resolve(),
      ]);
    } catch (e) {
      global.showToast?.(`Fout bij job-planning: ${e.message || e}`, 'error');
    }
  }

  async function assignBaselineFromOnboarding(tenantId, baselineId, customerId = null) {
    try {
      await global.apiFetch(`/api/baselines/${baselineId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      global.showToast?.('Baseline toegewezen.', 'success');
      await Promise.allSettled([
        optionalTask(global.loadKlantenbeheer),
        customerId ? optionalTask(global._showKlantDetail, customerId) : Promise.resolve(),
      ]);
    } catch (e) {
      global.showToast?.(`Fout bij baseline-toewijzing: ${e.message || e}`, 'error');
    }
  }

  async function launchTenantOnboardingPlan(tenantId, planKey, customerId = null) {
    try {
      const result = await global.apiFetch(`/api/onboarding/${tenantId}/launch-plan`, {
        method: 'POST',
        body: JSON.stringify({ plan_key: planKey }),
      });
      global.showToast?.(`Workflowketen ${planKey} gestart (${(result.jobs || []).length} jobs).`, 'success');
      await Promise.allSettled([
        optionalTask(global.loadJobMonitor),
        optionalTask(global.loadKlantenbeheer),
        customerId ? optionalTask(global._showKlantDetail, customerId) : Promise.resolve(),
      ]);
    } catch (e) {
      global.showToast?.(`Fout bij starten keten: ${e.message || e}`, 'error');
    }
  }

  async function openCustomerOnboardingManager(customerId) {
    const customer = await global.apiFetch(`/api/customers/${customerId}`);
    const services = Array.isArray(customer.services) ? customer.services : [];
    if (typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    const usedKeys = new Set(services.map((item) => String(item.service_key || '')));
    global.openSideRailDetail('Klant onboarding', customer.name || 'Services');
    global.updateSideRailDetail('Services beheren', `
      <div class="bev-workbench-meta">${global.escapeHtml(customer.name || 'Klant')} · service onboarding</div>
      <div class="bev-wb-list" style="margin-top:.9rem;">
        ${services.length ? services.map((svc) => `
          <div class="bev-wb-item">
            <strong>${global.escapeHtml(svc.service_key || 'service')}</strong>
            <span>${Number(svc.is_enabled || 0) === 1 ? 'Ingeschakeld' : 'Uitgeschakeld'} · ${svc.onboarded_at ? `Onboarded ${global.escapeHtml(global.formatDate(svc.onboarded_at))}` : 'Nog niet onboarded'}</span>
            <div class="bev-inline-actions" style="margin-top:.35rem;">
              <button type="button" class="bev-inline-btn" data-action="toggleCustomerService" data-customer-id="${global.escapeHtml(customerId)}" data-service-key="${global.escapeHtml(svc.service_key || '')}" data-enabled="${Number(svc.is_enabled || 0) === 1 ? '1' : '0'}">${Number(svc.is_enabled || 0) === 1 ? 'Uitschakelen' : 'Inschakelen'}</button>
              <button type="button" class="bev-inline-btn" data-action="markCustomerServiceOnboarded" data-customer-id="${global.escapeHtml(customerId)}" data-service-key="${global.escapeHtml(svc.service_key || '')}" data-onboarded="${svc.onboarded_at ? '1' : '0'}">${svc.onboarded_at ? 'Onboarded wissen' : 'Markeer onboarded'}</button>
            </div>
          </div>
        `).join('') : '<div class="bev-workbench-empty">Nog geen diensten gekoppeld.</div>'}
      </div>
      <div class="results-actions-compose" style="margin-top:1rem;">
        <div class="results-actions-form-grid">
          <label class="setting-item">
            <span>Nieuwe service</span>
            <select id="customerServiceKeyInput">
              <option value="">Selecteer service</option>
              ${customerServiceOptions.map((key) => `<option value="${global.escapeHtml(key)}" ${usedKeys.has(key) ? 'disabled' : ''}>${global.escapeHtml(key)}</option>`).join('')}
            </select>
          </label>
          <label class="setting-item">
            <span>Notitie</span>
            <input type="text" id="customerServiceNotesInput" placeholder="Optionele notitie">
          </label>
        </div>
        <div class="results-actions-form-actions">
          <button type="button" class="btn btn-primary" id="customerServiceAddBtn">Service toevoegen</button>
        </div>
      </div>
    `);
    document.querySelectorAll('[data-action="toggleCustomerService"]').forEach((btn) => {
      btn.addEventListener('click', () => upsertCustomerService(customerId, btn.dataset.serviceKey, {
        is_enabled: btn.dataset.enabled !== '1',
      }));
    });
    document.querySelectorAll('[data-action="markCustomerServiceOnboarded"]').forEach((btn) => {
      btn.addEventListener('click', () => upsertCustomerService(customerId, btn.dataset.serviceKey, {
        onboarded_at: btn.dataset.onboarded === '1' ? null : new Date().toISOString(),
      }));
    });
    document.getElementById('customerServiceAddBtn')?.addEventListener('click', async () => {
      const serviceKey = document.getElementById('customerServiceKeyInput')?.value || '';
      const notes = document.getElementById('customerServiceNotesInput')?.value || '';
      if (!serviceKey) {
        global.showToast?.('Selecteer eerst een service.', 'warning');
        return;
      }
      await upsertCustomerService(customerId, serviceKey, {
        is_enabled: true,
        onboarded_at: null,
        notes,
      });
    });
  }

  async function openTenantOnboardingManager(tenantId, tenantName, customerId = null) {
    if (!tenantId) return;
    const [onboarding, integrationsResp, baselinesResp, auditResp] = await Promise.all([
      global.apiFetch(`/api/tenants/${tenantId}/onboarding`),
      global.apiFetch(`/api/tenants/${tenantId}/integrations`),
      global.apiFetch('/api/baselines').catch(() => ({ items: [] })),
      global.apiFetch(`/api/audit?tenant_id=${encodeURIComponent(tenantId)}&limit=6`).catch(() => ({ items: [] })),
    ]);
    const integrations = Array.isArray(integrationsResp.items) ? integrationsResp.items : [];
    const baselines = Array.isArray(baselinesResp.items) ? baselinesResp.items : [];
    const auditItems = Array.isArray(auditResp.items) ? auditResp.items : [];
    const integrationMap = new Map(integrations.map((item) => [String(item.integration_type || ''), item]));
    const types = [
      { key: 'gdap', label: 'GDAP', field: 'gdap_status' },
      { key: 'customer_app', label: 'App registratie', field: 'app_registration_status' },
      { key: 'lighthouse', label: 'Lighthouse', field: 'lighthouse_status' },
    ];
    if (typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    global.openSideRailDetail('Tenant onboarding', tenantName || tenantId);
    global.updateSideRailDetail(tenantName || tenantId, `
      <div class="bev-workbench-meta">${global.escapeHtml(tenantName || tenantId)} · onboarding beheer</div>
      <div class="bev-wb-list" style="margin-top:.9rem;">
        <div class="bev-wb-item"><strong>Gereedheid</strong><span>${global.escapeHtml(String(onboarding.completion_pct || 0))}%</span></div>
        <div class="bev-wb-item"><strong>Auth-profiel</strong><span>${onboarding.auth_ready ? 'Gereed' : 'Mist'}</span></div>
        <div class="bev-wb-item"><strong>KB-basis</strong><span>${onboarding.kb_ready ? 'Gevuld' : 'Leeg'}</span></div>
      </div>
      <div class="results-actions-compose" style="margin-top:1rem;">
        <div class="results-actions-form-grid">
          ${types.map((type) => {
            const item = integrationMap.get(type.key) || {};
            const current = item[type.field] || (item.status === 'active' ? 'active' : 'unknown');
            return `<label class="setting-item"><span>${global.escapeHtml(type.label)}</span><select data-integration-type="${global.escapeHtml(type.key)}" data-integration-field="${global.escapeHtml(type.field)}"><option value="unknown" ${current === 'unknown' ? 'selected' : ''}>unknown</option><option value="active" ${current === 'active' ? 'selected' : ''}>active</option><option value="pending" ${current === 'pending' ? 'selected' : ''}>pending</option><option value="error" ${current === 'error' ? 'selected' : ''}>error</option></select></label>`;
          }).join('')}
        </div>
        <div class="results-actions-form-actions">
          <button type="button" class="btn btn-primary" id="tenantOnboardingSaveBtn">Integratiestatus opslaan</button>
          <button type="button" class="btn btn-secondary" id="tenantOnboardingApprovalBtn">Goedkeuring voor wijzigingen</button>
        </div>
      </div>
      <div class="results-actions-compose" style="margin-top:1rem;">
        <div class="results-actions-form-grid">
          <label class="setting-item"><span>Baseline</span><select id="tenantOnboardingBaselineInput"><option value="">Selecteer baseline</option>${baselines.map((item) => `<option value="${global.escapeHtml(item.id)}">${global.escapeHtml(item.name || item.id)}</option>`).join('')}</select></label>
        </div>
        <div class="results-actions-form-actions" style="display:flex;flex-wrap:wrap;gap:.5rem;">
          <button type="button" class="btn btn-secondary" id="tenantOnboardingAssessmentBtn">Assessment plannen</button>
          <button type="button" class="btn btn-secondary" id="tenantOnboardingRefreshBtn">Tenant refresh</button>
          <button type="button" class="btn btn-secondary" id="tenantOnboardingGuardianBtn">Guardian sync</button>
          <button type="button" class="btn btn-secondary" id="tenantOnboardingAppsBtn">App Registraties</button>
          <button type="button" class="btn btn-secondary" id="tenantOnboardingKbAssetsBtn">KB apparaten</button>
          <button type="button" class="btn btn-secondary" id="tenantOnboardingKbPagesBtn">KB documenten</button>
          <button type="button" class="btn btn-secondary" id="tenantOnboardingKbChangesBtn">KB wijzigingslog</button>
          <button type="button" class="btn btn-primary" id="tenantOnboardingBaselineBtn">Baseline toewijzen</button>
          <button type="button" class="btn btn-secondary" id="tenantOnboardingGuardianApprovalBtn">Goedkeuring voor Guardian</button>
          <button type="button" class="btn btn-secondary" id="tenantOnboardingBaselineApprovalBtn">Goedkeuring voor baseline</button>
        </div>
      </div>
      <div class="results-actions-compose" style="margin-top:1rem;">
        <div class="results-actions-form-grid">
          <label class="setting-item"><span>Workflowketen</span><select id="tenantOnboardingPlanInput"><option value="readiness">Gereedheidsketen</option><option value="baseline">Baselineketen</option><option value="operations">Operationele keten</option></select></label>
        </div>
        <div class="results-actions-form-actions" style="display:flex;flex-wrap:wrap;gap:.5rem;">
          <button type="button" class="btn btn-primary" id="tenantOnboardingLaunchPlanBtn">Keten starten</button>
          <button type="button" class="btn btn-secondary" id="tenantOnboardingPlanApprovalBtn">Goedkeuring voor keten</button>
        </div>
      </div>
      ${Array.isArray(onboarding.next_actions) && onboarding.next_actions.length ? `<div style="margin-top:1rem;"><div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#6b7280);margin-bottom:.35rem;">Openstaande stappen</div><div style="display:flex;flex-wrap:wrap;gap:.35rem;">${onboarding.next_actions.map((label) => `<span style="font-size:.72rem;padding:.1rem .5rem;border-radius:999px;background:#fff7ed;color:#9a3412;border:1px solid #fdba74;">${global.escapeHtml(label)}</span>`).join('')}</div></div>` : ''}
      <div style="margin-top:1rem;"><div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#6b7280);margin-bottom:.35rem;">Recente activiteiten</div><div class="bev-wb-list">${auditItems.length ? auditItems.map((item) => `<div class="bev-wb-item"><strong>${global.escapeHtml(item.action || 'actie')}</strong><span>${global.escapeHtml(item.detail || 'Geen detail')}</span><span>${global.escapeHtml(global.formatDate(item.created_at))}</span></div>`).join('') : '<div class="bev-workbench-empty">Nog geen recente tenantactiviteiten gevonden.</div>'}</div></div>
    `);
    document.getElementById('tenantOnboardingSaveBtn')?.addEventListener('click', async () => {
      try {
        const selects = Array.from(document.querySelectorAll('[data-integration-type][data-integration-field]'));
        await Promise.all(selects.map((select) => {
          const integrationType = select.dataset.integrationType;
          const field = select.dataset.integrationField;
          const value = select.value;
          return global.apiFetch(`/api/integrations/${tenantId}/${integrationType}`, {
            method: 'POST',
            body: JSON.stringify({
              status: value === 'active' ? 'active' : (value === 'pending' ? 'pending' : value === 'error' ? 'error' : 'unknown'),
              [field]: value,
              last_validated_at: nowIsoString(),
            }),
          });
        }));
        global.showToast?.('Tenant onboarding bijgewerkt.', 'success');
        await Promise.allSettled([
          optionalTask(global.loadKlantenbeheer),
          customerId ? optionalTask(global._showKlantDetail, customerId) : Promise.resolve(),
        ]);
      } catch (e) {
        global.showToast?.(`Fout bij onboarding-update: ${e.message || e}`, 'error');
      }
    });
    document.getElementById('tenantOnboardingApprovalBtn')?.addEventListener('click', async () => {
      const selects = Array.from(document.querySelectorAll('[data-integration-type][data-integration-field]'));
      const desired = selects.map((select) => ({ integration_type: select.dataset.integrationType, field: select.dataset.integrationField, value: select.value }));
      await requestOnboardingApproval(tenantId, 'integrations', 'integration_change_requested', 'Goedkeuring gevraagd voor onboarding-integratiewijzigingen.', { desired });
    });
    document.getElementById('tenantOnboardingAssessmentBtn')?.addEventListener('click', async () => { await enqueueTenantOnboardingJob(tenantId, 'assessment_run', customerId); });
    document.getElementById('tenantOnboardingRefreshBtn')?.addEventListener('click', async () => { await enqueueTenantOnboardingJob(tenantId, 'tenant_refresh', customerId); });
    document.getElementById('tenantOnboardingGuardianBtn')?.addEventListener('click', async () => { await enqueueTenantOnboardingJob(tenantId, 'guardian_sync', customerId, { limit: 25 }); });
    document.getElementById('tenantOnboardingAppsBtn')?.addEventListener('click', async () => { await global.openTenantAppRegistrations?.(tenantId, tenantName); });
    document.getElementById('tenantOnboardingKbAssetsBtn')?.addEventListener('click', async () => { await global.openTenantKnowledgeBase?.(tenantId, 'assets', tenantName); });
    document.getElementById('tenantOnboardingKbPagesBtn')?.addEventListener('click', async () => { await global.openTenantKnowledgeBase?.(tenantId, 'pages', tenantName); });
    document.getElementById('tenantOnboardingKbChangesBtn')?.addEventListener('click', async () => { await global.openTenantKnowledgeBase?.(tenantId, 'changelog', tenantName); });
    document.getElementById('tenantOnboardingBaselineBtn')?.addEventListener('click', async () => {
      const baselineId = document.getElementById('tenantOnboardingBaselineInput')?.value || '';
      if (!baselineId) {
        global.showToast?.('Selecteer eerst een baseline.', 'warning');
        return;
      }
      await assignBaselineFromOnboarding(tenantId, baselineId, customerId);
    });
    document.getElementById('tenantOnboardingGuardianApprovalBtn')?.addEventListener('click', async () => {
      await requestOnboardingApproval(tenantId, 'jobs', 'guardian_sync_requested', 'Goedkeuring gevraagd voor Guardian sync.', { job_type: 'guardian_sync', payload: { limit: 25 } });
    });
    document.getElementById('tenantOnboardingBaselineApprovalBtn')?.addEventListener('click', async () => {
      const baselineId = document.getElementById('tenantOnboardingBaselineInput')?.value || '';
      if (!baselineId) {
        global.showToast?.('Selecteer eerst een baseline.', 'warning');
        return;
      }
      await requestOnboardingApproval(tenantId, 'baseline', 'baseline_assignment_requested', 'Goedkeuring gevraagd voor baseline-toewijzing.', { baseline_id: baselineId });
    });
    document.getElementById('tenantOnboardingLaunchPlanBtn')?.addEventListener('click', async () => {
      const planKey = document.getElementById('tenantOnboardingPlanInput')?.value || 'readiness';
      await launchTenantOnboardingPlan(tenantId, planKey, customerId);
    });
    document.getElementById('tenantOnboardingPlanApprovalBtn')?.addEventListener('click', async () => {
      const planKey = document.getElementById('tenantOnboardingPlanInput')?.value || 'readiness';
      await requestOnboardingApproval(tenantId, 'workflow', 'onboarding_plan_requested', `Goedkeuring gevraagd voor onboarding-keten ${planKey}.`, { plan_key: planKey });
    });
  }

  global.DenjoyMspOnboarding = {
    openCustomerOnboardingManager,
    upsertCustomerService,
    openTenantOnboardingManager,
    launchTenantOnboardingPlan,
    enqueueTenantOnboardingJob,
    assignBaselineFromOnboarding,
    requestOnboardingApproval,
  };
  global.openCustomerOnboardingManager = openCustomerOnboardingManager;
  global.openTenantOnboardingManager = openTenantOnboardingManager;
})(window);
