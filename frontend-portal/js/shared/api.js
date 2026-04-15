(function initDenjoySharedApi(global) {
  const API_BASE = '';

  const API = {
    auth: {
      verify: () => '/api/auth/verify',
      login: () => '/api/auth/login',
      logout: () => '/api/auth/logout',
      csrfToken: () => '/api/auth/csrf-token',
    },
    config: () => '/api/config',
    tenants: {
      list: () => '/api/tenants',
      get: (id) => `/api/tenants/${id}`,
      overview: (id) => `/api/tenants/${id}/overview`,
      runs: (id) => `/api/tenants/${id}/runs`,
      diff: (id) => `/api/tenants/${id}/runs/diff`,
      actions: (id) => `/api/tenants/${id}/actions`,
    },
    runs: {
      list: (tid) => tid ? `/api/runs?tenant_id=${tid}` : '/api/runs',
      get: (id) => `/api/runs/${id}`,
      logs: (id) => `/api/runs/${id}/logs`,
      create: () => '/api/runs',
      delete: (id) => `/api/runs/${id}/delete`,
      archive: (id) => `/api/reports/${id}/archive`,
      restore: (id) => `/api/reports/${id}/restore`,
    },
    reports: {
      list: () => '/api/reports/list',
      stats: (tid) => tid ? `/api/reports/stats?tenant_id=${tid}` : '/api/reports/stats',
      retention: () => '/api/reports/retention/apply',
    },
    actions: {
      list: (tid) => `/api/tenants/${tid}/actions`,
      create: () => '/api/actions',
      update: (id) => `/api/actions/${id}`,
    },
    remediate: {
      catalog: (tid) => `/api/remediate/${tid}/catalog`,
      history: (tid) => `/api/remediate/${tid}/history`,
      execute: (tid) => `/api/remediate/${tid}/execute`,
    },
    capabilities: {
      tenant: (tid) => `/api/capabilities/${tid}`,
      subsection: (tid, section, subsection) => `/api/capabilities/${tid}/${section}/${subsection}`,
    },
    m365: {
      users: (tid) => `/api/m365/${tid}/users`,
      user: (tid, uid) => `/api/m365/${tid}/users/${uid}`,
      offboard: (tid, uid) => `/api/m365/${tid}/users/${uid}/offboard`,
      licenses: (tid) => `/api/m365/${tid}/licenses`,
      provisioningHistory: (tid) => `/api/m365/${tid}/provisioning-history`,
    },
    baselines: {
      list: () => '/api/baselines',
      get: (bid) => `/api/baselines/${bid}`,
      create: () => '/api/baselines',
      update: (bid) => `/api/baselines/${bid}`,
      delete: (bid) => `/api/baselines/${bid}`,
      export: (tid) => `/api/baselines/export/${tid}`,
      assign: (bid) => `/api/baselines/${bid}/assign`,
      unassign: (bid, tid) => `/api/baselines/${bid}/assign/${tid}`,
      assignments: (bid) => `/api/baselines/${bid}/assignments`,
      allAssign: () => '/api/baselines/assignments/all',
      check: (bid, tid) => `/api/baselines/${bid}/check/${tid}`,
      apply: (bid, tid) => `/api/baselines/${bid}/apply/${tid}`,
      history: (bid) => `/api/baselines/${bid}/history`,
    },
    backup: {
      summary: (tid) => `/api/backup/${tid}/summary`,
      status: (tid) => `/api/backup/${tid}/status`,
      sharepoint: (tid) => `/api/backup/${tid}/sharepoint`,
      onedrive: (tid) => `/api/backup/${tid}/onedrive`,
      exchange: (tid) => `/api/backup/${tid}/exchange`,
      history: (tid) => `/api/backup/${tid}/history`,
    },
    ca: {
      policies: (tid) => `/api/ca/${tid}/policies`,
      policy: (tid, pid) => `/api/ca/${tid}/policies/${pid}`,
      policyToggle: (tid, pid) => `/api/ca/${tid}/policies/${pid}/toggle`,
      namedLocations: (tid) => `/api/ca/${tid}/named-locations`,
      history: (tid) => `/api/ca/${tid}/history`,
    },
    domains: {
      list: (tid) => `/api/domains/${tid}/list`,
      analyse: (tid, domain) => `/api/domains/${tid}/analyse?domain=${encodeURIComponent(domain)}`,
    },
    alerts: {
      auditLogs: (tid) => `/api/alerts/${tid}/audit-logs`,
      secureScore: (tid) => `/api/alerts/${tid}/secure-score`,
      signIns: (tid) => `/api/alerts/${tid}/sign-ins`,
      config: (tid) => `/api/alerts/${tid}/config`,
      testWebhook: (tid) => `/api/alerts/${tid}/test-webhook`,
    },
    exchange: {
      mailboxes: (tid) => `/api/exchange/${tid}/mailboxes`,
      mailbox: (tid, uid) => `/api/exchange/${tid}/mailboxes/${uid}`,
      forwarding: (tid) => `/api/exchange/${tid}/forwarding`,
      rules: (tid) => `/api/exchange/${tid}/mailbox-rules`,
    },
    identity: {
      mfa: (tid) => `/api/identity/${tid}/mfa`,
      guests: (tid) => `/api/identity/${tid}/guests`,
      adminRoles: (tid) => `/api/identity/${tid}/admin-roles`,
      securityDefaults: (tid) => `/api/identity/${tid}/security-defaults`,
      legacyAuth: (tid) => `/api/identity/${tid}/legacy-auth`,
    },
    apps: {
      registrations: (tid) => `/api/apps/${tid}/registrations`,
      registration: (tid, appId) => `/api/apps/${tid}/registrations/${appId}`,
    },
    controls: {
      get: (tid, controlKey, strictLive = false) =>
        `/api/controls/${tid}/${encodeURIComponent(controlKey)}${strictLive ? '?strict_live=1' : ''}`,
    },
    collaboration: {
      sharepointSites: (tid) => `/api/collaboration/${tid}/sharepoint/sites`,
      sharepointSettings: (tid) => `/api/collaboration/${tid}/sharepoint/settings`,
      teams: (tid) => `/api/collaboration/${tid}/teams`,
      team: (tid, teamId) => `/api/collaboration/${tid}/teams/${teamId}`,
    },
    kb: {
      assets: (tid) => `/api/kb/${tid}/assets`,
      asset: (tid, id) => `/api/kb/${tid}/assets/${id}`,
      assetTypes: (tid) => `/api/kb/${tid}/asset-types`,
      vlans: (tid) => `/api/kb/${tid}/vlans`,
      vlan: (tid, id) => `/api/kb/${tid}/vlans/${id}`,
      pages: (tid) => `/api/kb/${tid}/pages`,
      page: (tid, id) => `/api/kb/${tid}/pages/${id}`,
      contacts: (tid) => `/api/kb/${tid}/contacts`,
      contact: (tid, id) => `/api/kb/${tid}/contacts/${id}`,
      passwords: (tid) => `/api/kb/${tid}/passwords`,
      password: (tid, id) => `/api/kb/${tid}/passwords/${id}`,
      software: (tid) => `/api/kb/${tid}/software`,
      softwareItem: (tid, id) => `/api/kb/${tid}/software/${id}`,
      domains: (tid) => `/api/kb/${tid}/domains`,
      domain: (tid, id) => `/api/kb/${tid}/domains/${id}`,
      m365: (tid) => `/api/kb/${tid}/m365`,
      changelog: (tid) => `/api/kb/${tid}/changelog`,
      changelogItem: (tid, id) => `/api/kb/${tid}/changelog/${id}`,
      meta: (tid) => `/api/kb/${tid}/meta`,
    },
  };

  let loadingCount = 0;
  let loadingTimer = null;

  function showLoadingBar() {
    loadingCount += 1;
    if (loadingTimer) return;
    loadingTimer = setTimeout(() => {
      loadingTimer = null;
      if (loadingCount <= 0) return;
      const bar = document.getElementById('topLoadingBar');
      if (bar) {
        bar.classList.add('loading');
        bar.classList.remove('done');
      }
    }, 120);
  }

  function hideLoadingBar() {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0 && loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
    if (loadingCount === 0) {
      const bar = document.getElementById('topLoadingBar');
      if (bar) {
        bar.classList.add('done');
        setTimeout(() => bar.classList.remove('loading', 'done'), 400);
      }
    }
  }

  function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML =
      `<span class="toast-icon" aria-hidden="true">${icons[type] || icons.info}</span>` +
      `<span class="toast-body">${message}</span>` +
      '<button type="button" class="toast-close" aria-label="Sluiten">×</button>';

    const close = () => {
      toast.classList.add('toast-hiding');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };

    toast.querySelector('.toast-close').addEventListener('click', close);
    container.appendChild(toast);

    if (duration > 0) setTimeout(close, duration);
  }

  async function apiFetch(path, options = {}) {
    showLoadingBar();
    try {
      const method = String(options.method || 'GET').toUpperCase();
      const token = sessionStorage.getItem('denjoy_token')
        || localStorage.getItem('denjoy_token')
        || localStorage.getItem('denjoy_auth_token')
        || '';
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const csrfHeader = token && method !== 'GET' && method !== 'HEAD'
        ? { 'X-CSRF-Token': token }
        : {};
      const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeader, ...csrfHeader, ...(options.headers || {}) },
        ...options,
      });
      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }
      if (res.status === 401) {
        localStorage.removeItem('denjoy_token');
        try { sessionStorage.removeItem('denjoy_token'); } catch (_) {}
        window.location.href = '/login.html';
        return null;
      }
      
      // Handle HTTP 402: approval required
      if (res.status === 402 && data && data.error_code === 'approval_required') {
        hideLoadingBar();
        return handleApprovalRequired(path, options, data);
      }
      
      if (!res.ok) {
        throw new Error((data && data.error) || `HTTP ${res.status}`);
      }
      return data;
    } finally {
      hideLoadingBar();
    }
  }

  async function handleApprovalRequired(path, options, responseData) {
    return new Promise((resolve, reject) => {
      if (typeof window.ApprovalModal === 'undefined') {
        reject(new Error('Approval modal niet geladen'));
        return;
      }
      
      const approvalConfig = {
        actionKey: responseData.action_key || 'unknown',
        actionName: responseData.action_name || 'Gevoelige actie',
        actionDescription: responseData.action_description || 'Deze actie vereist goedkeuring',
        requiredApprovers: responseData.min_approvers || 1,
        metadata: responseData.metadata || {},
      };
      
      window.ApprovalModal.show(
        approvalConfig,
        async (approvalId) => {
          // A request was created, but the action should not be retried immediately.
          // Sensitive actions require a separate approval decision first.
          showApprovalPendingMessage(approvalId);
          reject(new Error('Goedkeuringsaanvraag ingediend. Wacht op goedkeuring van beheerder.'));
        },
        () => {
          // User cancelled
          reject(new Error('Actie geannuleerd'));
        }
      );
    });
  }

  function showApprovalPendingMessage(approvalId = '') {
    const msg = document.createElement('div');
    msg.className = 'approval-message approval-message-info';
    msg.innerHTML = `
      <strong>⏳ Wacht op goedkeuring</strong>
      <p>Je goedkeuringsaanvraag${approvalId ? ` (${approvalId})` : ''} is ingediend. Een beheerder zal deze eerst moeten goedkeuren.</p>
    `;
    document.body.appendChild(msg);
    
    setTimeout(() => {
      msg.classList.add('is-visible');
    }, 50);
    
    setTimeout(() => {
      msg.classList.remove('is-visible');
      setTimeout(() => msg.remove(), 300);
    }, 5000);
  }

  const CACHE_PREFIX = 'djc:';
  const inflightGets = new Map();
  const tablePagerState = new Map();

  function cacheSet(key, data, ttlMs) {
    try {
      sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        data,
        expires: Date.now() + ttlMs,
      }));
    } catch (_) {}
  }

  function cacheGet(key) {
    try {
      const raw = sessionStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() > entry.expires) {
        sessionStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return entry.data;
    } catch (_) {
      return null;
    }
  }

  function cacheClear(keyPrefix) {
    try {
      const toRemove = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX + (keyPrefix || ''))) toRemove.push(key);
      }
      toRemove.forEach((key) => sessionStorage.removeItem(key));
    } catch (_) {}
  }

  const CACHE_TTL = {
    tenants: 3 * 60 * 1000,
    runs: 60 * 1000,
    overview: 60 * 1000,
    config: 3 * 60 * 1000,
    roles: 5 * 60 * 1000,
    customers: 3 * 60 * 1000,
    policies: 5 * 60 * 1000,
    domains: 5 * 60 * 1000,
    teams: 3 * 60 * 1000,
    mailboxes: 2 * 60 * 1000,
    short: 2 * 60 * 1000,
    medium: 5 * 60 * 1000,
  };

  function inferCacheTtl(path) {
    if (!path) return CACHE_TTL.short;
    if (/^\/api\/tenants(?:\?|$)/.test(path)) return CACHE_TTL.tenants;
    if (/^\/api\/tenants\/[^/]+\/overview(?:\?|$)/.test(path)) return CACHE_TTL.overview;
    if (/^\/api\/tenants\/[^/]+\/runs(?:\?|$)/.test(path)) return CACHE_TTL.runs;
    if (/^\/api\/config(?:\?|$)/.test(path)) return CACHE_TTL.config;
    if (/^\/api\/users(?:\?|$)/.test(path) || /^\/api\/portal-roles(?:\?|$)/.test(path)) return CACHE_TTL.roles;
    if (/^\/api\/customers(?:\?|$)/.test(path)) return CACHE_TTL.customers;
    if (/^\/api\/customer[s]?\/[^/]+\/finance(?:\?|$)/.test(path) || /^\/api\/customers\/[^/]+\/finance(?:\?|$)/.test(path)) return CACHE_TTL.medium;
    if (/^\/api\/tenants\/[^/]+\/subscriptions(?:\?|$)/.test(path)) return CACHE_TTL.medium;
    if (/^\/api\/tenants\/[^/]+\/cost-snapshots(?:\?|$)/.test(path) || /^\/api\/cost-snapshots\/[^/]+(?:\?|$)/.test(path)) return CACHE_TTL.medium;
    if (/^\/api\/jobs(?:\?|$)/.test(path) || /^\/api\/approvals(?:\?|$)/.test(path) || /^\/api\/user-access(?:\?|$)/.test(path)) return CACHE_TTL.short;
    if (/^\/api\/kb\/[^/]+\/(?:assets|vlans|pages|contacts|passwords|software|domains|m365|changelog|asset-types|meta|appregs)(?:\?|$)/.test(path)) return CACHE_TTL.medium;
    if (/^\/api\/baselines\/assignments\/all(?:\?|$)/.test(path)) return CACHE_TTL.medium;
    if (/^\/api\/m365\/[^/]+\/users(?:\?|$)/.test(path)) return CACHE_TTL.short;
    if (/^\/api\/assessment\/[^/]+\/nav(?:\?|$)/.test(path) || /^\/api\/assessment\/[^/]+\/section\/[^/]+(?:\?|$)/.test(path)) return CACHE_TTL.short;
    if (/^\/api\/management-hub\/[^/]+\/overview(?:\?|$)/.test(path) || /^\/api\/management-hub\/[^/]+\/policy-preferences(?:\?|$)/.test(path) || /^\/api\/management-hub\/[^/]+\/guardian-events(?:\?|$)/.test(path)) return CACHE_TTL.short;
    return CACHE_TTL.short;
  }

  function invalidateTenantScopedCaches(tenantId) {
    if (tenantId) {
      [
        `/api/tenants/${tenantId}`,
        `/api/assessment/${tenantId}`,
        `/api/management-hub/${tenantId}`,
        `/api/findings/${tenantId}`,
        `/api/m365/${tenantId}`,
        `/api/identity/${tenantId}`,
        `/api/collaboration/${tenantId}`,
        `/api/apps/${tenantId}`,
        `/api/controls/${tenantId}`,
        `/api/domains/${tenantId}`,
        `/api/exchange/${tenantId}`,
        `/api/intune/${tenantId}`,
        `/api/backup/${tenantId}`,
        `/api/alerts/${tenantId}`,
        `/api/ca/${tenantId}`,
      ].forEach((prefix) => cacheClear(prefix));
    }
    ['/api/tenants', '/api/reports', '/api/jobs', '/api/customers', '/api/users', '/api/portal-roles', '/api/msp/aggregate', '/api/msp/control-center'].forEach((prefix) => cacheClear(prefix));
  }

  async function apiFetchCached(path, options = {}, ttlMs = CACHE_TTL.short) {
    const method = String(options.method || 'GET').toUpperCase();
    if (method !== 'GET') {
      return apiFetch(path, options);
    }
    const cached = cacheGet(path);
    if (cached !== null) return cached;
    if (inflightGets.has(path)) return inflightGets.get(path);
    const effectiveTtl = ttlMs || inferCacheTtl(path);
    const request = apiFetch(path, options)
      .then((data) => {
        if (data !== null) cacheSet(path, data, effectiveTtl);
        return data;
      })
      .finally(() => {
        inflightGets.delete(path);
      });
    inflightGets.set(path, request);
    return request;
  }

  function skeletonTable(rows = 5, cols = 5) {
    const widths = ['sk-w-60', 'sk-w-40', 'sk-w-30', 'sk-w-50', 'sk-w-30', 'sk-w-40', 'sk-w-20'];
    const row = `<tr class="sk-table-row">${
      Array.from({ length: cols }, (_, i) =>
        `<td><span class="sk-shimmer sk-line ${widths[i % widths.length]}">&nbsp;</span></td>`).join('')
    }</tr>`;
    return Array(rows).fill(row).join('');
  }

  function skeletonCards(n = 4) {
    return Array.from({ length: n }, (_, i) => `
      <div class="sk-card-block">
        <span class="sk-shimmer sk-line sk-line-lg ${i % 2 === 0 ? 'sk-w-50' : 'sk-w-40'}">&nbsp;</span>
        <span class="sk-shimmer sk-line sk-line-sm sk-w-80">&nbsp;</span>
        <span class="sk-shimmer sk-line sk-line-sm sk-w-60">&nbsp;</span>
      </div>`).join('');
  }

  function skeletonLines(n = 3) {
    const widths = ['sk-w-80', 'sk-w-60', 'sk-w-70', 'sk-w-50', 'sk-w-40'];
    return '<div style="padding:.75rem 0">' +
      Array.from({ length: n }, (_, i) =>
        `<div><span class="sk-shimmer sk-line ${widths[i % widths.length]}">&nbsp;</span></div>`).join('') +
      '</div>';
  }

  function paginateCollection(key, items = [], pageSize = 50, reset = false) {
    const safeItems = Array.isArray(items) ? items : [];
    const state = tablePagerState.get(key) || { page: 1 };
    if (reset) state.page = 1;
    const total = safeItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    state.page = Math.max(1, Math.min(state.page || 1, totalPages));
    tablePagerState.set(key, state);
    const startIndex = (state.page - 1) * pageSize;
    return {
      items: safeItems.slice(startIndex, startIndex + pageSize),
      page: state.page,
      pageSize,
      total,
      totalPages,
      start: total ? startIndex + 1 : 0,
      end: Math.min(startIndex + pageSize, total),
    };
  }

  function resetCollectionPager(key) {
    tablePagerState.set(key, { page: 1 });
  }

  function renderCollectionPager({ key, anchor, total, pageSize = 50, onChange, label = 'items' }) {
    if (!anchor) return;
    const state = tablePagerState.get(key) || { page: 1 };
    state.onChange = onChange;
    tablePagerState.set(key, state);
    const host = anchor.closest('.ops-table-wrap, .nb-table-wrap, .it-table-wrap, .ex-table-wrap, .al-table-wrap, .results-runs-table-wrap, .gb-table-wrap') || anchor.parentElement;
    if (!host || !host.parentNode) return;
    let pager = host.parentNode.querySelector(`.portal-list-pager[data-pager-key="${key}"]`);
    if (!pager) {
      pager = document.createElement('div');
      pager.className = 'portal-list-pager';
      pager.dataset.pagerKey = key;
      host.parentNode.insertBefore(pager, host.nextSibling);
    }
    if (!total || total <= pageSize) {
      pager.style.display = 'none';
      pager.innerHTML = '';
      return;
    }
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    state.page = Math.max(1, Math.min(state.page || 1, totalPages));
    const start = (state.page - 1) * pageSize + 1;
    const end = Math.min(state.page * pageSize, total);
    pager.style.display = '';
    pager.innerHTML = `
      <div class="portal-list-pager__meta">${start}-${end} van ${total} ${label}</div>
      <div class="portal-list-pager__actions">
        <button type="button" class="portal-list-pager__btn" data-pager-nav="prev" ${state.page <= 1 ? 'disabled' : ''}>Vorige</button>
        <span class="portal-list-pager__page">Pagina ${state.page} / ${totalPages}</span>
        <button type="button" class="portal-list-pager__btn" data-pager-nav="next" ${state.page >= totalPages ? 'disabled' : ''}>Volgende</button>
      </div>
    `;
    pager.querySelectorAll('[data-pager-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.pagerNav === 'prev' && state.page > 1) state.page -= 1;
        if (btn.dataset.pagerNav === 'next' && state.page < totalPages) state.page += 1;
        tablePagerState.set(key, state);
        if (typeof state.onChange === 'function') state.onChange();
      });
    });
  }

  function normalizeCapabilityStatus(raw) {
    const fallback = {
      supports_live: false,
      assessment_available: false,
      status: 'unknown',
      status_label: 'Onbekend',
      status_reason: 'Capabilitystatus is niet beschikbaar.',
      engine: '',
      access_method: '',
      extra_roles: [],
      extra_consent: [],
      gdap_required: false,
    };
    if (!raw || typeof raw !== 'object') return { ...fallback };

    const source = raw.capability && typeof raw.capability === 'object'
      ? raw.capability
      : (raw.data && typeof raw.data === 'object' ? raw.data : raw);
    const normalized = { ...fallback, ...source };

    if (typeof normalized.supports_live !== 'boolean') {
      const status = String(normalized.status || '').toLowerCase();
      normalized.supports_live = status === 'ready' || status === 'validation_required' || status === 'live_backend_only';
    }
    if (typeof normalized.assessment_available !== 'boolean') {
      normalized.assessment_available = !!normalized.snapshot_available || !!normalized.snapshot_only;
    }
    if (!normalized.status_label) {
      const map = {
        ready: 'Live gereed',
        validation_required: 'Validatie nodig',
        snapshot_only: 'Snapshot-only',
        config_required: 'Configuratie nodig',
        not_implemented: 'Nog niet gebouwd',
        live_backend_only: 'Backend live',
      };
      normalized.status_label = map[String(normalized.status || '').toLowerCase()] || 'Onbekend';
    }
    if (!Array.isArray(normalized.extra_roles)) normalized.extra_roles = [];
    if (!Array.isArray(normalized.extra_consent)) normalized.extra_consent = [];
    return normalized;
  }

  async function denjoyFetchCapabilityStatus(tenantId, section, subsection, { forceRefresh = false } = {}) {
    if (!tenantId || !section || !subsection) return null;
    const path = API.capabilities.subsection(tenantId, section, subsection);
    try {
      if (forceRefresh) cacheClear(path);
      const payload = forceRefresh
        ? await apiFetch(path)
        : await apiFetchCached(path, {}, CACHE_TTL.short);
      return normalizeCapabilityStatus(payload);
    } catch (error) {
      return normalizeCapabilityStatus({
        supports_live: false,
        assessment_available: false,
        status: 'unavailable',
        status_label: 'Niet beschikbaar',
        status_reason: error?.message || 'Capabilitystatus kon niet worden opgehaald.',
      });
    }
  }

  function denjoyDescribeCapabilityStatus(capability) {
    const cap = normalizeCapabilityStatus(capability);
    const status = String(cap.status || '').toLowerCase();
    const map = {
      ready: { label: 'Live gereed', className: 'is-live', detail: 'Live data kan direct worden opgehaald.' },
      validation_required: { label: 'Validatie nodig', className: 'is-warn', detail: 'Live pad is beschikbaar maar heeft extra verificatie nodig.' },
      live_backend_only: { label: 'Backend live', className: 'is-warn', detail: 'Backend pad is live; frontend-validatie volgt nog.' },
      snapshot_only: { label: 'Snapshot-only', className: 'is-assessment', detail: 'Alleen assessment-snapshot is beschikbaar.' },
      config_required: { label: 'Configuratie nodig', className: 'is-warn', detail: cap.status_reason || 'Benodigde app-registratie/rollen ontbreken.' },
      not_implemented: { label: 'Nog niet gebouwd', className: 'is-stale', detail: cap.status_reason || 'Deze capability is nog niet geïmplementeerd.' },
      unavailable: { label: 'Niet beschikbaar', className: 'is-stale', detail: cap.status_reason || 'Status kon niet worden opgehaald.' },
    };
    return map[status] || { label: cap.status_label || 'Onbekend', className: cap.supports_live ? 'is-live' : 'is-warn', detail: cap.status_reason || 'Capabilitystatus onbekend.' };
  }

  global.API_BASE = API_BASE;
  global.API = API;
  global.showToast = showToast;
  global.apiFetch = apiFetch;
  global.cacheSet = cacheSet;
  global.cacheGet = cacheGet;
  global.cacheClear = cacheClear;
  global.CACHE_TTL = CACHE_TTL;
  global.apiFetchCached = apiFetchCached;
  global.invalidateTenantScopedCaches = invalidateTenantScopedCaches;
  global.skeletonTable = skeletonTable;
  global.skeletonCards = skeletonCards;
  global.skeletonLines = skeletonLines;
  global.paginateCollection = paginateCollection;
  global.resetCollectionPager = resetCollectionPager;
  global.renderCollectionPager = renderCollectionPager;
  global.denjoyFetchCapabilityStatus = denjoyFetchCapabilityStatus;
  global.denjoyDescribeCapabilityStatus = denjoyDescribeCapabilityStatus;
})(window);
