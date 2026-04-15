(function initDenjoyServicesHub(global) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getCsrfTokenFromCookie() {
    const match = document.cookie.match(/(?:^|; )denjoy_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function renderCatalog(items) {
    const body = getEl('servicesCatalogBody');
    const select = getEl('serviceRequestService');
    if (!body || !select) return;

    if (!Array.isArray(items) || !items.length) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted,#6b7280);padding:1.5rem;">Geen diensten gevonden.</td></tr>';
      select.innerHTML = '<option value="">Geen diensten beschikbaar</option>';
      return;
    }

    body.innerHTML = items.map((item) => {
      return `
        <tr>
          <td><strong>${esc(item.name || item.id || '')}</strong><br><small style="color:var(--text-muted,#6b7280);">${esc(item.description || '')}</small></td>
          <td>${esc(item.category || '')}</td>
          <td>${esc(item.tier || '')}</td>
          <td>${esc(item.price_from || '')}</td>
        </tr>
      `;
    }).join('');

    const currentValue = select.value;
    select.innerHTML = '<option value="">Kies een dienst</option>' + items.map((item) => (
      `<option value="${esc(item.id || '')}">${esc(item.name || item.id || '')} (${esc(item.category || '')})</option>`
    )).join('');
    if (currentValue) select.value = currentValue;
  }

  function renderRequests(items) {
    const body = getEl('serviceRequestsBody');
    if (!body) return;

    if (!Array.isArray(items) || !items.length) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted,#6b7280);padding:1rem;">Nog geen aanvragen.</td></tr>';
      return;
    }

    body.innerHTML = items.map((row) => {
      const customer = row.customer_name || row.customer_id || 'Onbekend';
      return `
        <tr>
          <td><strong>${esc(row.service_name || row.service_id || '')}</strong><br><small style="color:var(--text-muted,#6b7280);">${esc(row.created_at || '')}</small></td>
          <td>${esc(customer)}</td>
          <td>${esc(row.status || '')}</td>
          <td>${esc(row.priority || '')}</td>
        </tr>
      `;
    }).join('');
  }

  async function loadCatalog() {
    const category = (getEl('servicesCategoryFilter')?.value || '').trim();
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const payload = await global.apiFetch?.(`/api/services/catalog${query}`);
    const items = payload?.items || [];
    renderCatalog(items);
    return items;
  }

  async function loadRequests() {
    const payload = await global.apiFetch?.('/api/services/requests');
    renderRequests(payload?.items || []);
  }

  async function submitRequest() {
    const serviceId = (getEl('serviceRequestService')?.value || '').trim();
    const customerId = (getEl('serviceRequestCustomerId')?.value || '').trim();
    const customerName = (getEl('serviceRequestCustomerName')?.value || '').trim();
    const priority = (getEl('serviceRequestPriority')?.value || 'normal').trim();
    const note = (getEl('serviceRequestNote')?.value || '').trim();

    if (!serviceId) {
      global.showToast?.('Selecteer eerst een dienst.', 'warning');
      return;
    }
    if (!customerId && !customerName) {
      global.showToast?.('Vul een klantnaam of customer ID in.', 'warning');
      return;
    }

    const headers = {};
    const csrf = getCsrfTokenFromCookie();
    if (csrf) headers['X-CSRF-Token'] = csrf;

    await global.apiFetch?.('/api/services/requests', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        service_id: serviceId,
        customer_id: customerId,
        customer_name: customerName,
        priority,
        note,
      }),
    });

    const noteInput = getEl('serviceRequestNote');
    if (noteInput) noteInput.value = '';
    global.showToast?.('Service aanvraag ingediend.', 'success');
    await loadRequests();
  }

  async function loadServicesHubSection(forceRefresh) {
    try {
      if (forceRefresh) {
        // Keep this local section always fresh when user explicitly refreshes.
      }
      await loadCatalog();
      await loadRequests();
    } catch (err) {
      global.showToast?.(`Diensten laden mislukt: ${err.message || err}`, 'error');
    }
  }

  function bindEvents() {
    const refreshBtn = getEl('servicesRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        void loadServicesHubSection(true);
      });
    }

    const categoryFilter = getEl('servicesCategoryFilter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', () => {
        void loadCatalog();
      });
    }

    const submitBtn = getEl('serviceRequestSubmitBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        void submitRequest();
      });
    }
  }

  global.loadServicesHubSection = loadServicesHubSection;

  if (!global.__denjoyServicesHubBound) {
    document.addEventListener('DOMContentLoaded', bindEvents);
    global.__denjoyServicesHubBound = true;
  }
})(window);
