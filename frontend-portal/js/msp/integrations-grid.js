(function initDenjoyMspIntegrationsGrid(global) {
  'use strict';

  async function loadIntegratieStatusGrid() {
    const grid = document.getElementById('integratieStatusGrid');
    if (!grid) return;

    const tenantId = global.currentTenantId || (Array.isArray(global.allTenants) && global.allTenants[0] && global.allTenants[0].id);
    if (!tenantId) {
      grid.innerHTML = '<p style="color:var(--text-muted,#6b7280);font-size:.875rem;grid-column:1/-1;">Selecteer een tenant om integratiestatus te laden.</p>';
      return;
    }

    grid.innerHTML = '<p style="color:var(--text-muted,#6b7280);font-size:.875rem;grid-column:1/-1;">Laden...</p>';
    try {
      const data = await global.apiFetch(`/api/tenants/${tenantId}/integrations`);
      const items = (data && data.items) || [];
      if (!items.length) {
        grid.innerHTML = '<p style="color:var(--text-muted,#6b7280);font-size:.875rem;grid-column:1/-1;">Geen integraties geconfigureerd voor deze tenant.</p>';
        return;
      }

      const statusIcon = { active: '✓', unknown: '?', error: '✗', inactive: '○' };
      const statusColor = { active: '#16a34a', unknown: '#d97706', error: '#dc2626', inactive: '#6b7280' };
      grid.innerHTML = items.map((integration) => {
        const status = integration.status || 'unknown';
        const color = statusColor[status] || '#6b7280';
        const icon = statusIcon[status] || '?';
        return `<div style="border:1px solid var(--border-color,#e5e7eb);border-radius:8px;padding:.875rem 1rem;background:var(--card-bg,#fff);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem;">
            <strong style="font-size:.9rem;">${global.escapeHtml(integration.integration_type || '-')}</strong>
            <span style="font-size:.8rem;font-weight:600;color:${color};">${icon} ${global.escapeHtml(status)}</span>
          </div>
          ${integration.gdap_status ? `<div style="font-size:.78rem;color:var(--text-muted,#6b7280);">GDAP: <strong>${global.escapeHtml(integration.gdap_status)}</strong></div>` : ''}
          ${integration.app_registration_status ? `<div style="font-size:.78rem;color:var(--text-muted,#6b7280);">App Reg: <strong>${global.escapeHtml(integration.app_registration_status)}</strong></div>` : ''}
          ${integration.lighthouse_status ? `<div style="font-size:.78rem;color:var(--text-muted,#6b7280);">Lighthouse: <strong>${global.escapeHtml(integration.lighthouse_status)}</strong></div>` : ''}
          ${integration.last_validated_at ? `<div style="font-size:.75rem;color:var(--text-muted,#6b7280);margin-top:.35rem;">Gevalideerd: ${global.formatDate(integration.last_validated_at)}</div>` : ''}
        </div>`;
      }).join('');
    } catch (error) {
      grid.innerHTML = `<p style="color:#dc2626;font-size:.875rem;grid-column:1/-1;">Fout bij laden integraties: ${global.escapeHtml(String(error))}</p>`;
    }
  }

  global.DenjoyMspIntegrationsGrid = {
    loadIntegratieStatusGrid,
  };
  global.loadIntegratieStatusGrid = loadIntegratieStatusGrid;
})(window);
