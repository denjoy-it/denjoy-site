(function initDenjoyMspCosts(global) {
  async function fetchTenants() {
    const resp = global.apiFetchCached
      ? await global.apiFetchCached('/api/tenants', {}, global.CACHE_TTL.tenants)
      : await global.apiFetch('/api/tenants');
    return Array.isArray(resp?.items) ? resp.items : [];
  }

  async function fetchSubscriptionsForTenant(tenantId) {
    if (!tenantId) return [];
    try {
      const resp = global.apiFetchCached
        ? await global.apiFetchCached(`/api/tenants/${tenantId}/subscriptions`, {}, global.CACHE_TTL.medium)
        : await global.apiFetch(`/api/tenants/${tenantId}/subscriptions`);
      return Array.isArray(resp?.items) ? resp.items : [];
    } catch (_) {
      return [];
    }
  }

  async function loadKostenSection() {
    const tbody = document.getElementById('kostenTableBody');
    const summary = document.getElementById('kostenSummary');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted,#6b7280);">Laden…</td></tr>';
    try {
      const tenants = await fetchTenants();
      const tenantJobs = await Promise.allSettled(tenants.map(async (tenant) => {
        const [data, subscriptions] = await Promise.all([
          (global.apiFetchCached
            ? global.apiFetchCached(`/api/tenants/${tenant.id}/cost-snapshots`, {}, global.CACHE_TTL.medium)
            : global.apiFetch(`/api/tenants/${tenant.id}/cost-snapshots`)).catch(() => ({ items: [] })),
          (global.apiFetchCached
            ? global.apiFetchCached(`/api/tenants/${tenant.id}/subscriptions`, {}, global.CACHE_TTL.medium)
            : global.apiFetch(`/api/tenants/${tenant.id}/subscriptions`)).catch(() => ({ items: [] })),
        ]);
        let customerFinance = { summary: {} };
        if (tenant?.customer_id) {
          customerFinance = await (global.apiFetchCached
            ? global.apiFetchCached(`/api/customers/${tenant.customer_id}/finance`, {}, global.CACHE_TTL.medium)
            : global.apiFetch(`/api/customers/${tenant.customer_id}/finance`)).catch(() => ({ summary: {} }));
        }
        return {
          tenant,
          items: Array.isArray(data?.items) ? data.items : [],
          subscriptions: Array.isArray(subscriptions?.items) ? subscriptions.items : [],
          customerFinance,
        };
      }));

      const tenantBundles = tenantJobs
        .filter((entry) => entry.status === 'fulfilled')
        .map((entry) => entry.value);
      const items = tenantBundles.flatMap((bundle) => bundle.items.map((item) => ({
        ...item,
        _tenant: bundle.tenant,
      })));
      const subItems = tenantBundles.flatMap((bundle) => bundle.subscriptions);
      const customerFinanceMap = new Map();
      tenantBundles.forEach((bundle) => {
        const customerId = bundle.tenant?.customer_id || bundle.tenant?.customerId || '';
        if (!customerId || customerFinanceMap.has(customerId)) return;
        customerFinanceMap.set(customerId, bundle.customerFinance?.summary || {});
      });
      const customerFinanceList = Array.from(customerFinanceMap.values());

      if (!tbody) return;
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted,#6b7280);padding:2rem;">Geen kostendata beschikbaar voor deze tenant.</td></tr>';
        if (summary) {
          const latestCustomerTotal = customerFinanceList.reduce((max, item) => Math.max(max, Number(item.latest_total_cost || 0)), 0);
          summary.innerHTML = `
            <span style="padding:.25rem .7rem;border-radius:999px;background:#f3f4f6;color:#374151;font-size:.8rem;">${subItems.length} abonnementen</span>
            ${latestCustomerTotal > 0 ? `<span style="padding:.25rem .7rem;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:.8rem;">Klant totaal: € ${latestCustomerTotal.toFixed(2)}</span>` : ''}
            <span style="padding:.25rem .7rem;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:.8rem;">Handmatig invoeren mogelijk</span>
            <span style="padding:.25rem .7rem;border-radius:999px;background:#fff7ed;color:#9a3412;font-size:.8rem;">Geen kostenimport beschikbaar</span>
          `;
        }
        return;
      }
      let totalCost = 0;
      let manualCount = 0;
      items.sort((a, b) => String(b.generated_at || '').localeCompare(String(a.generated_at || '')));
      tbody.innerHTML = items.map((s) => {
        let sumObj = {};
        try { sumObj = JSON.parse(s.summary_json || '{}'); } catch (_) {}
        const cost = parseFloat(sumObj.total_cost || sumObj.totalCost || 0);
        totalCost += cost;
        const currency = sumObj.currency || 'EUR';
        const source = String(sumObj.source || 'import');
        if (source === 'manual') manualCount += 1;
        const tenantLabel = s._tenant?.customer_name || s._tenant?.tenant_name || s.tenant_id || '-';
        return `<tr>
          <td>${global.escapeHtml(tenantLabel)}</td>
          <td style="font-size:.8rem;color:var(--text-muted,#6b7280);">${global.escapeHtml(s.subscription_id || 'Alle')}</td>
          <td>${global.escapeHtml(s.period_start || '-')} – ${global.escapeHtml(s.period_end || '-')}</td>
          <td style="font-weight:600;">${cost > 0 ? `€ ${cost.toFixed(2)}` : '-'}</td>
          <td>${global.escapeHtml(currency)}</td>
          <td><span style="padding:.2rem .55rem;border-radius:999px;font-size:.74rem;font-weight:600;background:${source === 'manual' ? '#eff6ff' : '#f3f4f6'};color:${source === 'manual' ? '#1d4ed8' : '#475569'};">${global.escapeHtml(source === 'manual' ? 'Handmatig' : 'Import')}</span></td>
          <td>${global.formatDate(s.generated_at)}</td>
          <td>
            <div class="results-row-actions">
              <button type="button" class="btn btn-secondary btn-sm" data-action="viewCostSnapshot" data-id="${global.escapeHtml(s.id)}">Details</button>
              ${source === 'manual' ? `<button type="button" class="btn btn-secondary btn-sm" data-action="editCostSnapshot" data-id="${global.escapeHtml(s.id)}">Bewerken</button><button type="button" class="btn btn-secondary btn-sm" data-action="deleteCostSnapshot" data-id="${global.escapeHtml(s.id)}" style="color:#dc2626;">Verwijderen</button>` : ''}
            </div>
          </td>
        </tr>`;
      }).join('');
      global.bindActions?.(tbody);
      if (summary) {
        const lighthouse = subItems.filter((item) => Number(item.lighthouse_onboarded || 0) === 1).length;
        const latestCustomerTotal = customerFinanceList.reduce((sum, item) => sum + Number(item.latest_total_cost || 0), 0);
        summary.innerHTML = `
          <span style="padding:.25rem .7rem;border-radius:999px;background:#dbeafe;color:#1e40af;font-size:.8rem;font-weight:600;">Totaal: € ${totalCost.toFixed(2)}</span>
          ${latestCustomerTotal > 0 ? `<span style="padding:.25rem .7rem;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:.8rem;">Klant totaal: € ${latestCustomerTotal.toFixed(2)}</span>` : ''}
          <span style="padding:.25rem .7rem;border-radius:999px;background:#f3f4f6;color:#374151;font-size:.8rem;">${tenants.length} tenants</span>
          <span style="padding:.25rem .7rem;border-radius:999px;background:#f3f4f6;color:#374151;font-size:.8rem;">${items.length} perioden</span>
          <span style="padding:.25rem .7rem;border-radius:999px;background:#f3f4f6;color:#374151;font-size:.8rem;">${subItems.length} abonnementen</span>
          <span style="padding:.25rem .7rem;border-radius:999px;background:${manualCount > 0 ? '#eff6ff' : '#f3f4f6'};color:${manualCount > 0 ? '#1d4ed8' : '#374151'};font-size:.8rem;">${manualCount} handmatig</span>
          <span style="padding:.25rem .7rem;border-radius:999px;background:${lighthouse > 0 ? '#ecfdf5' : '#fff7ed'};color:${lighthouse > 0 ? '#166534' : '#9a3412'};font-size:.8rem;">${lighthouse}/${subItems.length || 0} Lighthouse</span>
        `;
      }
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#dc2626;padding:2rem;">Fout: ${global.escapeHtml(String(e))}</td></tr>`;
    }
  }

  async function openKostenSnapshotForm() {
    if (typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    const tenants = await fetchTenants();
    const selectedTenantId = global.currentTenantId || tenants[0]?.id || '';
    if (!selectedTenantId && !tenants.length) {
      global.showToast?.('Er zijn nog geen tenants beschikbaar voor kosteninvoer.', 'warning');
      return;
    }
    const subs = await fetchSubscriptionsForTenant(selectedTenantId);
    const today = new Date().toISOString().slice(0, 10);
    const firstDay = `${today.slice(0, 8)}01`;
    global.openSideRailDetail('Financieel', 'Kosten toevoegen');
    global.updateSideRailDetail('Kosten toevoegen', `
      <div class="bev-workbench-meta">Handmatige kosteninvoer voor tenant of subscription.</div>
      <div class="results-actions-compose" style="margin-top:.9rem;">
        <div class="results-actions-form-grid">
          <label class="setting-item">
            <span>Tenant</span>
            <select id="kostenSnapshotTenantInput">
              <option value="">Selecteer tenant</option>
              ${tenants.map((tenant) => `<option value="${global.escapeHtml(tenant.id)}"${tenant.id === selectedTenantId ? ' selected' : ''}>${global.escapeHtml(tenant.customer_name || tenant.tenant_name || tenant.id)}</option>`).join('')}
            </select>
          </label>
          <label class="setting-item">
            <span>Abonnement</span>
            <select id="kostenSnapshotSubscriptionInput">
              <option value="">Alle / tenantbreed</option>
              ${subs.map((item) => `<option value="${global.escapeHtml(item.azure_subscription_id || item.subscription_id || item.id)}">${global.escapeHtml(item.display_name || item.azure_subscription_id || item.id)}</option>`).join('')}
            </select>
          </label>
          <label class="setting-item">
            <span>Periode start</span>
            <input type="date" id="kostenSnapshotStartInput" value="${global.escapeHtml(firstDay)}">
          </label>
          <label class="setting-item">
            <span>Periode eind</span>
            <input type="date" id="kostenSnapshotEndInput" value="${global.escapeHtml(today)}">
          </label>
          <label class="setting-item">
            <span>Totaal kosten</span>
            <input type="number" id="kostenSnapshotTotalInput" min="0" step="0.01" placeholder="0.00">
          </label>
          <label class="setting-item">
            <span>Valuta</span>
            <input type="text" id="kostenSnapshotCurrencyInput" value="EUR" maxlength="8">
          </label>
          <label class="setting-item" style="grid-column:1 / -1;">
            <span>Notitie</span>
            <textarea id="kostenSnapshotNotesInput" rows="4" placeholder="Bijv. handmatige maandcorrectie, marketplace kosten, klantfactuur-notitie"></textarea>
          </label>
        </div>
        <div class="results-actions-form-actions">
          <button type="button" class="btn btn-primary" id="kostenSnapshotSaveBtn">Kosten opslaan</button>
        </div>
      </div>
    `);
    const tenantInput = document.getElementById('kostenSnapshotTenantInput');
    const subscriptionInput = document.getElementById('kostenSnapshotSubscriptionInput');
    tenantInput?.addEventListener('change', async () => {
      if (!subscriptionInput) return;
      subscriptionInput.innerHTML = '<option value="">Alle / tenantbreed</option>';
      const tenantId = tenantInput.value || '';
      if (!tenantId) return;
      const tenantSubscriptions = await fetchSubscriptionsForTenant(tenantId);
      subscriptionInput.innerHTML = `
        <option value="">Alle / tenantbreed</option>
        ${tenantSubscriptions.map((item) => `<option value="${global.escapeHtml(item.azure_subscription_id || item.subscription_id || item.id)}">${global.escapeHtml(item.display_name || item.azure_subscription_id || item.id)}</option>`).join('')}
      `;
    });
    document.getElementById('kostenSnapshotSaveBtn')?.addEventListener('click', async () => {
      const tenantId = document.getElementById('kostenSnapshotTenantInput')?.value || '';
      const payload = {
        subscription_id: document.getElementById('kostenSnapshotSubscriptionInput')?.value || '',
        period_start: document.getElementById('kostenSnapshotStartInput')?.value || '',
        period_end: document.getElementById('kostenSnapshotEndInput')?.value || '',
        total_cost: Number(document.getElementById('kostenSnapshotTotalInput')?.value || 0),
        currency: (document.getElementById('kostenSnapshotCurrencyInput')?.value || 'EUR').trim().toUpperCase(),
        source: 'manual',
        notes: document.getElementById('kostenSnapshotNotesInput')?.value?.trim() || '',
        label: 'Handmatige invoer',
      };
      if (!tenantId) {
        global.showToast?.('Selecteer een tenant voor deze kostenpost.', 'warning');
        return;
      }
      if (!payload.period_start || !payload.period_end) {
        global.showToast?.('Vul periode start en eind in.', 'warning');
        return;
      }
      if (!(payload.total_cost >= 0)) {
        global.showToast?.('Vul een geldig kostenbedrag in.', 'warning');
        return;
      }
      try {
        await global.apiFetch(`/api/tenants/${tenantId}/cost-snapshots`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        global.showToast?.('Kostenpost opgeslagen.', 'success');
        await loadKostenSection();
      } catch (e) {
        global.showToast?.(`Fout bij opslaan van kosten: ${e.message || e}`, 'error');
      }
    });
  }

  async function openCostSnapshotDetail(snapshotId) {
    if (typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    try {
      const row = await global.apiFetch(`/api/cost-snapshots/${snapshotId}`);
      let summary = {};
      try { summary = JSON.parse(row.summary_json || '{}'); } catch (_) {}
      global.openSideRailDetail('Financieel', 'Kostenrecord');
      global.updateSideRailDetail('Kostenrecord', `
        <div class="bev-workbench-meta">${global.escapeHtml(row.tenant_id || '-')} · ${global.escapeHtml(summary.source === 'manual' ? 'Handmatig' : 'Import')}</div>
        <div class="bev-wb-list" style="margin-top:.9rem;">
          <div class="bev-wb-item"><strong>Abonnement</strong><span>${global.escapeHtml(row.subscription_id || 'Alle')}</span></div>
          <div class="bev-wb-item"><strong>Periode</strong><span>${global.escapeHtml(row.period_start || '-')} – ${global.escapeHtml(row.period_end || '-')}</span></div>
          <div class="bev-wb-item"><strong>Kosten</strong><span>€ ${Number(summary.total_cost || summary.totalCost || 0).toFixed(2)} ${global.escapeHtml(summary.currency || 'EUR')}</span></div>
          <div class="bev-wb-item"><strong>Bron</strong><span>${global.escapeHtml(summary.source === 'manual' ? 'Handmatig' : 'Import')}</span></div>
          <div class="bev-wb-item"><strong>Notitie</strong><span>${global.escapeHtml(summary.notes || 'Geen notitie')}</span></div>
          <div class="bev-wb-item"><strong>Gegenereerd op</strong><span>${global.formatDate(row.generated_at)}</span></div>
        </div>
        ${summary.source === 'manual' ? `<div class="bev-inline-actions" style="margin-top:.75rem;"><button type="button" class="bev-inline-btn" id="costSnapshotEditBtn">Bewerken</button><button type="button" class="bev-inline-btn" id="costSnapshotDeleteBtn">Verwijderen</button></div>` : ''}
      `);
      document.getElementById('costSnapshotEditBtn')?.addEventListener('click', () => openKostenSnapshotEditForm(snapshotId));
      document.getElementById('costSnapshotDeleteBtn')?.addEventListener('click', () => deleteCostSnapshot(snapshotId));
    } catch (e) {
      global.showToast?.(`Fout bij laden kostenrecord: ${e.message || e}`, 'error');
    }
  }

  async function openKostenSnapshotEditForm(snapshotId) {
    if (typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    try {
      const row = await global.apiFetch(`/api/cost-snapshots/${snapshotId}`);
      let summary = {};
      try { summary = JSON.parse(row.summary_json || '{}'); } catch (_) {}
      global.openSideRailDetail('Financieel', 'Kostenrecord bewerken');
      global.updateSideRailDetail('Kostenrecord bewerken', `
        <div class="bev-workbench-meta">${global.escapeHtml(row.tenant_id || '-')} · handmatige kostenpost</div>
        <div class="results-actions-compose" style="margin-top:.9rem;">
          <div class="results-actions-form-grid">
            <label class="setting-item">
              <span>Abonnement</span>
              <input type="text" id="editKostenSubscriptionInput" value="${global.escapeHtml(row.subscription_id || '')}" placeholder="abonnement-ID of leeg">
            </label>
            <label class="setting-item">
              <span>Periode start</span>
              <input type="date" id="editKostenStartInput" value="${global.escapeHtml(row.period_start || '')}">
            </label>
            <label class="setting-item">
              <span>Periode eind</span>
              <input type="date" id="editKostenEndInput" value="${global.escapeHtml(row.period_end || '')}">
            </label>
            <label class="setting-item">
              <span>Totaal kosten</span>
              <input type="number" id="editKostenTotalInput" min="0" step="0.01" value="${global.escapeHtml(String(summary.total_cost || summary.totalCost || 0))}">
            </label>
            <label class="setting-item">
              <span>Valuta</span>
              <input type="text" id="editKostenCurrencyInput" value="${global.escapeHtml(summary.currency || 'EUR')}" maxlength="8">
            </label>
            <label class="setting-item" style="grid-column:1 / -1;">
              <span>Notitie</span>
              <textarea id="editKostenNotesInput" rows="4">${global.escapeHtml(summary.notes || '')}</textarea>
            </label>
          </div>
          <div class="results-actions-form-actions">
            <button type="button" class="btn btn-primary" id="editKostenSaveBtn">Wijzigingen opslaan</button>
          </div>
        </div>
      `);
      document.getElementById('editKostenSaveBtn')?.addEventListener('click', async () => {
        try {
          await global.apiFetch(`/api/cost-snapshots/${snapshotId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              subscription_id: document.getElementById('editKostenSubscriptionInput')?.value || '',
              period_start: document.getElementById('editKostenStartInput')?.value || '',
              period_end: document.getElementById('editKostenEndInput')?.value || '',
              total_cost: Number(document.getElementById('editKostenTotalInput')?.value || 0),
              currency: (document.getElementById('editKostenCurrencyInput')?.value || 'EUR').trim().toUpperCase(),
              notes: document.getElementById('editKostenNotesInput')?.value?.trim() || '',
              source: 'manual',
              label: 'Handmatige invoer',
            }),
          });
          global.showToast?.('Kostenrecord bijgewerkt.', 'success');
          await loadKostenSection();
          await openCostSnapshotDetail(snapshotId);
        } catch (e) {
          global.showToast?.(`Fout bij bijwerken: ${e.message || e}`, 'error');
        }
      });
    } catch (e) {
      global.showToast?.(`Fout bij laden bewerkformulier: ${e.message || e}`, 'error');
    }
  }

  async function deleteCostSnapshot(snapshotId) {
    if (typeof global.openSideRailDetail !== 'function' && typeof global.updateSideRailDetail !== 'function') return;
    global.openSideRailDetail('Financieel', 'Kostenrecord verwijderen');
    global.updateSideRailDetail('Kostenrecord verwijderen', `
      <div class="bev-workbench-meta">Deze handmatige kostenpost wordt permanent verwijderd.</div>
      <div class="results-actions-form-actions" style="margin-top:.85rem;">
        <button type="button" class="btn btn-secondary" id="deleteCostSnapshotConfirmBtn">Verwijderen</button>
      </div>
    `);
    document.getElementById('deleteCostSnapshotConfirmBtn')?.addEventListener('click', async () => {
      try {
        await global.apiFetch(`/api/cost-snapshots/${snapshotId}`, { method: 'DELETE' });
        global.showToast?.('Kostenrecord verwijderd.', 'success');
        await loadKostenSection();
        global.renderContextRail?.(global._currentSection || 'kosten');
      } catch (e) {
        global.showToast?.(`Fout bij verwijderen: ${e.message || e}`, 'error');
      }
    }, { once: true });
  }

  global.DenjoyMspCosts = {
    loadKostenSection,
    openKostenSnapshotForm,
    openCostSnapshotDetail,
    openKostenSnapshotEditForm,
    deleteCostSnapshot,
  };
  global.loadKostenSection = loadKostenSection;
})(window);
