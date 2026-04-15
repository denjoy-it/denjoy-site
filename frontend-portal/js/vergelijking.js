/**
 * Denjoy IT Platform — Tenant Vergelijking
 */
(function () {
  'use strict';

  function apiFetch(url, opts) {
    const token = localStorage.getItem('denjoy_token') || sessionStorage.getItem('denjoy_token');
    const headers = { ...(opts?.headers || {}), ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
    return fetch(url, { credentials: 'include', ...opts, headers }).then(r => r.json());
  }

  function esc(v) { return String(v ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

  function populateTenantDropdowns() {
    const a = document.getElementById('cmpTenantA');
    const b = document.getElementById('cmpTenantB');
    if (!a || !b) return;
    apiFetch('/api/tenants').then(data => {
      const tenants = data.tenants || data.items || [];
      const opts = tenants.map(t => `<option value="${esc(t.tenant_id || t.id)}">${esc(t.display_name || t.name || t.tenant_id || t.id)}</option>`).join('');
      a.innerHTML = opts;
      b.innerHTML = opts;
      // Default: select different tenants
      if (tenants.length > 1) b.selectedIndex = 1;
    }).catch(() => {});
  }

  function scoreBadge(score) {
    if (score == null) return '<span style="color:var(--text-muted,#6b7280)">—</span>';
    const n = Number(score);
    const bg = n >= 80 ? '#dcfce7' : n >= 60 ? '#fef9c3' : '#fee2e2';
    const fg = n >= 80 ? '#166534' : n >= 60 ? '#854d0e' : '#991b1b';
    return `<span style="font-weight:700;font-size:1.35rem;color:${fg};background:${bg};padding:.2rem .65rem;border-radius:8px;">${n}</span>`;
  }

  function deltaChip(val, lowerIsBetter = false) {
    if (val == null) return '';
    const better = lowerIsBetter ? val < 0 : val > 0;
    const worse = lowerIsBetter ? val > 0 : val < 0;
    const color = better ? '#166534' : worse ? '#991b1b' : '#6b7280';
    const prefix = val > 0 ? '+' : '';
    return `<span style="font-size:.75rem;margin-left:.4rem;color:${color};font-weight:600;">${prefix}${val}</span>`;
  }

  function metricRow(label, a, b, delta, lowerIsBetter = false) {
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;padding:.45rem 0;border-bottom:1px solid var(--border-color,#f3f4f6);align-items:center;">
        <div style="font-size:.83rem;color:var(--text-muted,#6b7280);font-weight:500;">${esc(label)}</div>
        <div style="font-size:.95rem;font-weight:600;text-align:center;">${a ?? '—'}</div>
        <div style="font-size:.95rem;font-weight:600;text-align:center;">${b ?? '—'}${delta != null ? deltaChip(delta, lowerIsBetter) : ''}</div>
      </div>`;
  }

  function renderComparison(data) {
    const el = document.getElementById('cmpResult');
    if (!el) return;
    if (!data.ok) {
      el.innerHTML = `<p style="color:#b91c1c;">${esc(data.error || 'Vergelijking mislukt')}</p>`;
      return;
    }
    const a = data.tenant_a || {};
    const b = data.tenant_b || {};
    const d = data.deltas || {};

    function tenantLabel(t) {
      const sel = document.getElementById(t === 'a' ? 'cmpTenantA' : 'cmpTenantB');
      return sel?.options[sel.selectedIndex]?.text || (t === 'a' ? a.tenant_id : b.tenant_id) || '?';
    }

    el.innerHTML = `
      <div style="overflow-x:auto;">
        <div style="min-width:540px;">
          <!-- Header -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;padding:.5rem 0 .7rem;border-bottom:2px solid var(--border-color,#e5e7eb);margin-bottom:.5rem;">
            <div style="font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#6b7280);">Metriek</div>
            <div style="font-size:.83rem;font-weight:700;text-align:center;">${esc(tenantLabel('a'))}</div>
            <div style="font-size:.83rem;font-weight:700;text-align:center;">${esc(tenantLabel('b'))} <span style="font-size:.7rem;color:var(--text-muted,#6b7280);">(Δ vs A)</span></div>
          </div>

          <!-- Score -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;padding:.6rem 0;border-bottom:1px solid var(--border-color,#e5e7eb);align-items:center;">
            <div style="font-size:.83rem;color:var(--text-muted,#6b7280);font-weight:600;">Score</div>
            <div style="text-align:center;">${scoreBadge(a.score)}</div>
            <div style="text-align:center;">${scoreBadge(b.score)}${d.score != null ? deltaChip(d.score) : ''}</div>
          </div>

          ${metricRow('Kritieke bevindingen', a.critical_count, b.critical_count, d.critical_count, true)}
          ${metricRow('Waarschuwingen', a.warning_count, b.warning_count, d.warning_count, true)}
          ${metricRow('Gebruikers totaal', a.total_users, b.total_users, null)}
          ${metricRow('MFA-dekking (%)', a.mfa_pct != null ? a.mfa_pct + '%' : null, b.mfa_pct != null ? b.mfa_pct + '%' : null, d.mfa_pct)}
          ${metricRow('Beheerders', a.admin_users, b.admin_users, d.admin_users, true)}
          ${metricRow('CA-policies (actief)', a.active_ca_policies, b.active_ca_policies, d.active_ca_policies)}
          ${metricRow('Domeinen', a.domain_count, b.domain_count, null)}
          ${metricRow('Forwarding mailboxen', a.mailboxes_with_forwarding, b.mailboxes_with_forwarding, d.mailboxes_with_forwarding, true)}
          ${metricRow('Intune compliance (%)', a.intune_compliance_pct != null ? a.intune_compliance_pct + '%' : null, b.intune_compliance_pct != null ? b.intune_compliance_pct + '%' : null, d.intune_compliance_pct)}
          ${metricRow('Intune apparaten', a.intune_device_count, b.intune_device_count, null)}

          <!-- Footer -->
          <div style="margin-top:1rem;font-size:.73rem;color:var(--text-muted,#6b7280);text-align:right;">
            Gegenereerd: ${esc((data.generated_at || '').slice(0, 19).replace('T', ' '))} UTC &nbsp;·&nbsp;
            Δ = verschil B − A &nbsp;·&nbsp; 🟢 beter &nbsp;·&nbsp; 🔴 slechter
          </div>
        </div>
      </div>`;
  }

  window.runTenantComparison = async function () {
    const tidA = document.getElementById('cmpTenantA')?.value;
    const tidB = document.getElementById('cmpTenantB')?.value;
    const el = document.getElementById('cmpResult');
    const btn = document.getElementById('cmpRunBtn');
    if (!tidA || !tidB) { if (el) el.innerHTML = '<p style="color:#b91c1c;">Selecteer twee tenants.</p>'; return; }
    if (tidA === tidB) { if (el) el.innerHTML = '<p style="color:#b91c1c;">Kies twee verschillende tenants.</p>'; return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Laden\u2026'; }
    if (el) el.innerHTML = '<p style="color:var(--text-muted,#6b7280);">Vergelijking ophalen\u2026</p>';
    try {
      const data = await apiFetch(`/api/compare/${encodeURIComponent(tidA)}/vs/${encodeURIComponent(tidB)}`);
      renderComparison(data);
    } catch (e) {
      if (el) el.innerHTML = `<p style="color:#b91c1c;">Fout: ${esc(e.message)}</p>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Vergelijk \u2192'; }
    }
  };

  window.loadVergelijkingSection = function () {
    populateTenantDropdowns();
  };
})();
