/**
 * Denjoy IT Platform — Activiteitenlog
 * Chronologisch overzicht van audit-events, jobs, acties en goedkeuringen.
 */
(function initDenjoyActivityFeed(global) {
  'use strict';

  let _feedItems = [];
  let _tenantFilter = '';
  let _typeFilter = '';
  let _loading = false;

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) {
      return iso;
    }
  }

  function getToken() {
    return localStorage.getItem('denjoy_auth_token') || localStorage.getItem('denjoy_token') || '';
  }

  async function apiFetch(url) {
    const token = getToken();
    const res = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  async function loadFeed(forceRefresh = false) {
    if (_loading) return;
    _loading = true;
    const root = document.getElementById('activityFeedRoot');
    if (root) root.innerHTML = '<div class="mspcc-empty">Activiteitenlog laden…</div>';

    try {
      const tenantParam = _tenantFilter ? `&tenant_id=${encodeURIComponent(_tenantFilter)}` : '';
      const [auditRes, jobsRes, actionsRes, approvalsRes] = await Promise.allSettled([
        apiFetch(`/api/audit?limit=80${tenantParam}`),
        apiFetch(`/api/jobs?limit=50${tenantParam}`),
        apiFetch(`/api/msp/actions?limit=50${tenantParam}`),
        apiFetch(`/api/approvals?status=all&limit=40${tenantParam}`),
      ]);

      const events = [];

      // Audit events
      const auditItems = auditRes.status === 'fulfilled' ? (auditRes.value?.items || []) : [];
      auditItems.forEach((item) => {
        events.push({
          type: 'audit',
          ts: item.created_at || item.timestamp || '',
          title: item.action || 'Portaalgebeurtenis',
          detail: item.detail || item.description || '',
          actor: item.user_email || item.actor || '',
          tenant_id: item.tenant_id || '',
          tenant_name: item.tenant_name || item.tenant_id || '',
          status: 'info',
          raw: item,
        });
      });

      // Jobs
      const jobItems = jobsRes.status === 'fulfilled' ? (jobsRes.value?.items || []) : [];
      jobItems.forEach((item) => {
        const status = String(item.status || 'unknown');
        events.push({
          type: 'job',
          ts: item.completed_at || item.started_at || item.scheduled_at || item.created_at || '',
          title: (global._jmJobLabels || {})[item.job_type] || item.job_type || 'Taak',
          detail: item.error_message || (status === 'done' ? 'Succesvol afgerond.' : `Status: ${status}`),
          actor: '',
          tenant_id: item.tenant_id || '',
          tenant_name: item.tenant_name || item.tenant_id || '',
          status: status === 'failed' ? 'critical' : status === 'done' ? 'ok' : 'info',
          raw: item,
        });
      });

      // MSP Acties
      const actionItems = actionsRes.status === 'fulfilled' ? (actionsRes.value?.items || []) : [];
      actionItems.forEach((item) => {
        events.push({
          type: 'action',
          ts: item.updated_at || item.created_at || '',
          title: item.title || item.action_type || 'Actie',
          detail: item.description || item.notes || '',
          actor: item.owner || item.created_by || '',
          tenant_id: item.tenant_id || '',
          tenant_name: item.tenant_name || item.tenant_id || '',
          status: item.is_overdue ? 'critical' : item.status === 'done' ? 'ok' : 'info',
          raw: item,
        });
      });

      // Goedkeuringen
      const approvalItems = approvalsRes.status === 'fulfilled' ? (approvalsRes.value?.items || []) : [];
      approvalItems.forEach((item) => {
        events.push({
          type: 'approval',
          ts: item.resolved_at || item.requested_at || '',
          title: item.action_type || item.section || 'Goedkeuring',
          detail: item.reason || item.summary || '',
          actor: item.requested_by || '',
          tenant_id: item.tenant_id || '',
          tenant_name: item.tenant_name || item.tenant_id || '',
          status: String(item.status || '').toLowerCase() === 'rejected' ? 'critical' : String(item.status || '').toLowerCase() === 'approved' ? 'ok' : 'info',
          raw: item,
        });
      });

      // Sort newest first
      events.sort((a, b) => {
        const ta = a.ts ? new Date(a.ts).getTime() : 0;
        const tb = b.ts ? new Date(b.ts).getTime() : 0;
        return tb - ta;
      });

      _feedItems = events;
      populateTenantFilter(events);
      renderFeed();
    } catch (e) {
      if (root) root.innerHTML = `<div class="mspcc-empty">Fout bij laden: ${esc(e.message || String(e))}</div>`;
    } finally {
      _loading = false;
    }
  }

  function populateTenantFilter(events) {
    const select = document.getElementById('activityFeedTenantFilter');
    if (!select) return;
    const current = select.value;
    const tenants = [...new Map(events
      .filter((e) => e.tenant_id)
      .map((e) => [e.tenant_id, e.tenant_name || e.tenant_id])
    ).entries()];
    const extra = tenants.map(([id, name]) => `<option value="${esc(id)}"${current === id ? ' selected' : ''}>${esc(name)}</option>`).join('');
    select.innerHTML = `<option value="">Alle tenants</option>${extra}`;
  }

  function statusBadge(status, type) {
    const toneMap = { critical: 'mspcc-pill--crit', ok: 'mspcc-pill--ok', info: '' };
    const typeLabel = { job: 'Taak', audit: 'Audit', action: 'Actie', approval: 'Goedkeuring' };
    const tone = toneMap[status] || '';
    return `<span class="mspcc-pill ${esc(tone)}">${esc(typeLabel[type] || type)}</span>`;
  }

  function renderFeed() {
    const root = document.getElementById('activityFeedRoot');
    if (!root) return;
    let items = _feedItems;
    if (_typeFilter) items = items.filter((e) => e.type === _typeFilter);
    if (_tenantFilter) items = items.filter((e) => e.tenant_id === _tenantFilter);
    if (!items.length) {
      root.innerHTML = '<div class="mspcc-empty">Geen activiteiten gevonden voor de geselecteerde filters.</div>';
      return;
    }
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:.5rem;">
        ${items.slice(0, 200).map((item) => `
          <article class="mspcc-list-item" style="border-left:3px solid var(--${item.status === 'critical' ? 'dj-crit,#dc2626' : item.status === 'ok' ? 'dj-ok,#16a34a' : 'border-color,#e5e7eb'});">
            <div class="mspcc-list-item-top">
              <div>
                <strong>${esc(item.title)}</strong>
                ${item.tenant_name ? `<div style="font-size:.78rem;color:var(--text-muted,#6b7280);">${esc(item.tenant_name)}</div>` : ''}
              </div>
              <div style="display:flex;gap:.4rem;align-items:center;flex-shrink:0;">
                ${statusBadge(item.status, item.type)}
                <span style="font-size:.72rem;color:var(--text-muted,#9ca3af);white-space:nowrap;">${esc(fmtDate(item.ts))}</span>
              </div>
            </div>
            ${item.detail ? `<div style="font-size:.82rem;color:var(--text-muted,#6b7280);margin-top:.2rem;">${esc(item.detail)}</div>` : ''}
            ${item.actor ? `<div style="font-size:.75rem;color:var(--text-muted,#9ca3af);margin-top:.15rem;">Door: ${esc(item.actor)}</div>` : ''}
          </article>
        `).join('')}
      </div>
    `;
  }

  function bindControls() {
    const refreshBtn = document.getElementById('activityFeedRefreshBtn');
    if (refreshBtn && !refreshBtn._activityBound) {
      refreshBtn._activityBound = true;
      refreshBtn.addEventListener('click', () => loadFeed(true));
    }
    const tenantFilter = document.getElementById('activityFeedTenantFilter');
    if (tenantFilter && !tenantFilter._activityBound) {
      tenantFilter._activityBound = true;
      tenantFilter.addEventListener('change', () => {
        _tenantFilter = tenantFilter.value;
        renderFeed();
      });
    }
    const typeFilter = document.getElementById('activityFeedTypeFilter');
    if (typeFilter && !typeFilter._activityBound) {
      typeFilter._activityBound = true;
      typeFilter.addEventListener('change', () => {
        _typeFilter = typeFilter.value;
        renderFeed();
      });
    }
  }

  function loadActivityFeedSection() {
    bindControls();
    if (!_feedItems.length) {
      loadFeed();
    } else {
      renderFeed();
    }
  }

  global.loadActivityFeedSection = loadActivityFeedSection;
})(window);
