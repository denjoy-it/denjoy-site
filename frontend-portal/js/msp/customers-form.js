(function initDenjoyMspCustomersForm(global) {
  function normalizeTenantItems(payload) {
    return Array.isArray(payload?.items) ? payload.items : [];
  }

  function renderTenantSelection(tenants, selectedIds, currentCustomerId) {
    const items = Array.isArray(tenants) ? tenants : [];
    if (!items.length) {
      return '<div class="bev-workbench-empty">Nog geen geregistreerde tenants beschikbaar.</div>';
    }
    return `
      <div class="setting-item" style="grid-column:1 / -1;">
        <span>Gekoppelde tenants</span>
        <div class="bev-wb-list" style="max-height:220px;overflow:auto;padding:.35rem;">
          ${items.map((tenant) => {
            const tenantId = String(tenant.id || '');
            const linkedCustomerId = String(tenant.customer_id || tenant.customerId || '');
            const linkedCustomerName = String(tenant.customer_name || tenant.customerName || '');
            const checked = selectedIds.has(tenantId);
            const lockedToOtherCustomer = linkedCustomerId && linkedCustomerId !== currentCustomerId;
            return `
              <label class="bev-wb-item" style="display:flex;align-items:flex-start;gap:.65rem;cursor:${lockedToOtherCustomer ? 'not-allowed' : 'pointer'};opacity:${lockedToOtherCustomer ? '.65' : '1'};">
                <input
                  type="checkbox"
                  class="customer-tenant-link"
                  value="${global.escapeHtml(tenantId)}"
                  ${checked ? 'checked' : ''}
                  ${lockedToOtherCustomer ? 'disabled' : ''}
                  style="margin-top:.2rem;"
                >
                <span style="display:grid;gap:.18rem;">
                  <strong>${global.escapeHtml(tenant.tenant_name || tenant.customer_name || 'Tenant')}</strong>
                  <span style="font-size:.78rem;color:var(--text-muted,#6b7280);">
                    ${global.escapeHtml(tenant.tenant_guid || tenant.id || 'Geen GUID')}
                  </span>
                  <span style="font-size:.76rem;color:${lockedToOtherCustomer ? '#9a3412' : 'var(--text-muted,#6b7280)'};">
                    ${lockedToOtherCustomer
                      ? `Al gekoppeld aan klant: ${global.escapeHtml(linkedCustomerName || linkedCustomerId)}`
                      : checked
                        ? 'Gekoppeld aan deze klantkaart'
                        : 'Beschikbaar om te koppelen'}
                  </span>
                </span>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  async function syncCustomerTenantLinks(customerId, customerName, selectedTenantIds, existingTenantIds, tenantItems) {
    const selected = new Set(selectedTenantIds);
    const existing = new Set(existingTenantIds);
    const tenantMap = new Map((Array.isArray(tenantItems) ? tenantItems : []).map((tenant) => [String(tenant.id || ''), tenant]));
    const toAttach = [...selected].filter((tenantId) => !existing.has(tenantId));
    const toDetach = [...existing].filter((tenantId) => !selected.has(tenantId));

    await Promise.all([
      ...toAttach.map((tenantId) => global.apiFetch(`/api/tenants/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          customer_id: customerId,
          customer_name: customerName,
        }),
      })),
      ...toDetach.map((tenantId) => {
        const tenant = tenantMap.get(tenantId) || {};
        return global.apiFetch(`/api/tenants/${tenantId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            customer_id: '',
            customer_name: tenant.customer_name || tenant.tenant_name || '',
          }),
        });
      }),
    ]);
  }

  function clearCustomerLinkCaches(customerId, tenantIds) {
    if (typeof global.cacheClear !== 'function') return;
    const ids = Array.isArray(tenantIds) ? tenantIds : [];
    [
      '/api/customers',
      `/api/customers/${customerId}`,
      `/api/customers/${customerId}/overview`,
      `/api/customers/${customerId}/onboarding`,
      `/api/customers/${customerId}/health`,
      `/api/customers/${customerId}/finance`,
      `/api/customers/${customerId}/assessments`,
      `/api/customers/${customerId}/azure`,
      '/api/tenants',
      ...ids.map((tenantId) => `/api/tenants/${tenantId}`),
    ].forEach((key) => global.cacheClear(key));
  }

  async function showKlantForm(customerId) {
    const isNew = !customerId;
    let existing = {};
    let tenantItems = [];
    if (!isNew) {
      try {
        existing = await global.apiFetchCached(`/api/customers/${customerId}`, {}, global.CACHE_TTL.customers) || {};
      } catch (_) {}
    }
    try {
      tenantItems = normalizeTenantItems(await global.apiFetchCached('/api/tenants', {}, global.CACHE_TTL.tenants));
    } catch (_) {}
    if (typeof global.openSideRailDetail !== 'function' || typeof global.updateSideRailDetail !== 'function') return;
    const existingTenantIds = new Set((Array.isArray(existing.tenants) ? existing.tenants : []).map((tenant) => String(tenant.id || tenant.tenant_id || '')));
    global.openSideRailDetail('Klantbeheer', isNew ? 'Nieuwe klant' : 'Klant bewerken');
    global.updateSideRailDetail(isNew ? 'Nieuwe klant' : (existing.name || 'Klant bewerken'), `
      <div class="bev-workbench-meta">${isNew ? 'Nieuwe MSP klant' : `Bewerken · ${global.escapeHtml(existing.name || 'Klant')}`}</div>
      <div class="results-actions-compose" style="margin-top:.9rem;">
        <div class="results-actions-form-grid">
          <label class="setting-item">
            <span>Naam</span>
            <input type="text" id="customerRailNameInput" value="${global.escapeHtml(existing.name || '')}" placeholder="Bijv. Stichting Meerwaarde">
          </label>
          <label class="setting-item">
            <span>Contactpersoon</span>
            <input type="text" id="customerRailContactInput" value="${global.escapeHtml(existing.primary_contact_name || '')}" placeholder="Naam">
          </label>
          <label class="setting-item">
            <span>E-mail</span>
            <input type="email" id="customerRailEmailInput" value="${global.escapeHtml(existing.primary_contact_email || '')}" placeholder="naam@organisatie.nl">
          </label>
          <label class="setting-item">
            <span>Service tier</span>
            <select id="customerRailTierInput">
              <option value="">Selecteer tier</option>
              <option value="Essential" ${(existing.service_tier || '') === 'Essential' ? 'selected' : ''}>Essential</option>
              <option value="Professional" ${(existing.service_tier || '') === 'Professional' ? 'selected' : ''}>Professional</option>
              <option value="Premium" ${(existing.service_tier || '') === 'Premium' ? 'selected' : ''}>Premium</option>
            </select>
          </label>
          <label class="setting-item">
            <span>Supportmodel</span>
            <select id="customerRailSupportInput">
              <option value="">Selecteer supportmodel</option>
              <option value="Remote" ${(existing.support_model || '') === 'Remote' ? 'selected' : ''}>Remote</option>
              <option value="Hybrid" ${(existing.support_model || '') === 'Hybrid' ? 'selected' : ''}>Hybrid</option>
              <option value="Managed" ${(existing.support_model || '') === 'Managed' ? 'selected' : ''}>Managed</option>
            </select>
          </label>
          <label class="setting-item">
            <span>SLA</span>
            <input type="text" id="customerRailSlaInput" value="${global.escapeHtml(existing.sla_name || '')}" placeholder="Bijv. 8x5 standaard">
          </label>
          <label class="setting-item">
            <span>Renewal datum</span>
            <input type="date" id="customerRailRenewalInput" value="${global.escapeHtml(existing.renewal_date || '')}">
          </label>
          <label class="setting-item" style="grid-column:1 / -1;">
            <span>Contractnotities</span>
            <textarea id="customerRailNotesInput" rows="4" placeholder="Contractafspraken, verlengingen, supportcontext">${global.escapeHtml(existing.notes || '')}</textarea>
          </label>
          ${renderTenantSelection(tenantItems, existingTenantIds, String(customerId || ''))}
        </div>
        <div class="results-actions-form-actions">
          <button type="button" class="btn btn-primary" id="customerRailSaveBtn">${isNew ? 'Klant aanmaken' : 'Klant opslaan'}</button>
        </div>
      </div>
    `);
    document.getElementById('customerRailSaveBtn')?.addEventListener('click', async () => {
      const payload = {
        name: document.getElementById('customerRailNameInput')?.value?.trim() || '',
        primary_contact_name: document.getElementById('customerRailContactInput')?.value?.trim() || '',
        primary_contact_email: document.getElementById('customerRailEmailInput')?.value?.trim() || '',
        service_tier: document.getElementById('customerRailTierInput')?.value || '',
        support_model: document.getElementById('customerRailSupportInput')?.value || '',
        sla_name: document.getElementById('customerRailSlaInput')?.value?.trim() || '',
        renewal_date: document.getElementById('customerRailRenewalInput')?.value || '',
        notes: document.getElementById('customerRailNotesInput')?.value?.trim() || '',
      };
      if (!payload.name) {
        global.showToast?.('Vul een klantnaam in.', 'warning');
        return;
      }
      try {
        const response = await global.apiFetch(
          isNew ? '/api/customers' : `/api/customers/${customerId}`,
          { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(isNew ? payload : { ...payload, status: existing.status || 'active' }) }
        );
        const nextCustomerId = customerId || response?.id || '';
        const selectedTenantIds = Array.from(document.querySelectorAll('.customer-tenant-link:checked')).map((input) => String(input.value || ''));
        if (nextCustomerId) {
          await syncCustomerTenantLinks(
            nextCustomerId,
            payload.name,
            selectedTenantIds,
            Array.from(existingTenantIds),
            tenantItems,
          );
          clearCustomerLinkCaches(nextCustomerId, Array.from(new Set([...selectedTenantIds, ...Array.from(existingTenantIds)])));
        }
        global.showToast?.(isNew ? 'Klant aangemaakt.' : 'Klant bijgewerkt.', 'success');
        await global.loadKlantenbeheer?.();
        await global.populateSettings?.();
        if (nextCustomerId) global._showKlantDetail?.(nextCustomerId);
      } catch (e) {
        global.showToast?.(`Fout: ${e.message || e}`, 'error');
      }
    });
  }

  global.DenjoyMspCustomersForm = {
    showKlantForm,
  };
  global._showKlantForm = showKlantForm;
})(window);
