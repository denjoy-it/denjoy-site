/* intune-management-hub.js — full IntuneManagement replacement
 * Tabs: overview · browser · assignments · export · compare · import
 * Legacy accordion preserved for Guardian + CPP.
 */
(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────
  let _activeTab      = 'overview';
  let _browserItems   = [];
  let _browserType    = 'compliance';
  let _lastTenantId   = null;

  const OBJECT_TYPES = {
    compliance:               'Compliance Policies',
    config_profiles:          'Configuration Profiles',
    settings_catalog:         'Settings Catalog',
    scripts:                  'PowerShell Scripts',
    app_protection:           'App Protection Policies',
    autopilot:                'Autopilot Profiles',
    conditional_access:       'Conditional Access',
    enrollment_restrictions:  'Enrollment Restrictions',
    security_baselines:       'Security Baselines',
  };

  // legacy state kept for guardian/cpp accordion
  let _legacyState = { overview: {}, policies: [], events: [] };
  let _legacyBound = false;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function getTenantId() {
    if (typeof window.currentTenantId !== 'undefined' && window.currentTenantId) {
      return window.currentTenantId;
    }
    return document.getElementById('tenantSelect')?.value || null;
  }

  async function hubFetch(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET' && typeof window.apiFetchCached === 'function') {
      return window.apiFetchCached(path, options, (window.CACHE_TTL?.short) || 60000);
    }
    const token = localStorage.getItem('denjoy_token') || '';
    const res = await fetch(path, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function esc(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDateTime(v) {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return v; }
  }

  function labelForType(key) { return OBJECT_TYPES[key] || key; }

  function pillClass(v) {
    const s = String(v || '').toLowerCase();
    if (s === 'active' || s === 'enabled') return 'ipm-pill-active';
    if (s === 'error' || s === 'failed') return 'ipm-pill-error';
    return 'ipm-pill-draft';
  }

  function diffBadge(status) {
    const MAP = { identical: 'Identiek', modified: 'Gewijzigd', source_only: 'Alleen bron', target_only: 'Alleen doel' };
    return `<span class="ipm-diff-badge ipm-diff-${esc(status)}">${MAP[status] || esc(status)}</span>`;
  }

  function getContainer() {
    return document.getElementById('intuneManagementHubSection')
      || document.querySelector('[data-section="intuneManagementHub"]')
      || document.querySelector('[data-section="intune"]');
  }

  // ── Shell ─────────────────────────────────────────────────────────────────
  function buildShell(container) {
    container.innerHTML = `
      <div class="ipm-wrap" id="ipm-root">
        <nav class="ipm-tabbar" role="tablist">
          <button class="ipm-tab ipm-tab--active" data-tab="overview"    role="tab">Overzicht</button>
          <button class="ipm-tab"                 data-tab="browser"     role="tab">Browser</button>
          <button class="ipm-tab"                 data-tab="assignments" role="tab">Assignments</button>
          <button class="ipm-tab"                 data-tab="export"      role="tab">Export</button>
          <button class="ipm-tab"                 data-tab="compare"     role="tab">Vergelijk</button>
          <button class="ipm-tab"                 data-tab="import"      role="tab">Import</button>
        </nav>
        <div class="ipm-panel" id="ipm-panel-overview"></div>
        <div class="ipm-panel ipm-panel--hidden" id="ipm-panel-browser"></div>
        <div class="ipm-panel ipm-panel--hidden" id="ipm-panel-assignments"></div>
        <div class="ipm-panel ipm-panel--hidden" id="ipm-panel-export"></div>
        <div class="ipm-panel ipm-panel--hidden" id="ipm-panel-compare"></div>
        <div class="ipm-panel ipm-panel--hidden" id="ipm-panel-import"></div>
        <aside class="ipm-slideover" id="ipm-slideover" aria-hidden="true">
          <div class="ipm-slideover-header">
            <span id="ipm-slideover-title">Detail</span>
            <button class="ipm-slideover-close" id="ipm-slideover-close" aria-label="Sluiten">&times;</button>
          </div>
          <div class="ipm-slideover-body" id="ipm-slideover-body"></div>
        </aside>
      </div>`;
  }

  function switchTab(tab) {
    _activeTab = tab;
    document.querySelectorAll('.ipm-tab').forEach(b => {
      b.classList.toggle('ipm-tab--active', b.dataset.tab === tab);
      b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
    });
    document.querySelectorAll('.ipm-panel').forEach(p => {
      p.classList.toggle('ipm-panel--hidden', !p.id.endsWith(tab));
    });
  }

  function openSlideover(title, bodyHtml) {
    const so = document.getElementById('ipm-slideover');
    document.getElementById('ipm-slideover-title').textContent = title;
    document.getElementById('ipm-slideover-body').innerHTML = bodyHtml;
    so.classList.add('ipm-slideover--open');
    so.setAttribute('aria-hidden', 'false');
  }

  function closeSlideover() {
    const so = document.getElementById('ipm-slideover');
    so.classList.remove('ipm-slideover--open');
    so.setAttribute('aria-hidden', 'true');
  }

  // ── Tab: Overview ─────────────────────────────────────────────────────────
  async function loadOverview(tenantId, panel) {
    panel.innerHTML = '<div class="ipm-spinner"></div>';
    try {
      const [summary, legacy] = await Promise.allSettled([
        hubFetch(`/api/intune-policy/${tenantId}/summary`),
        hubFetch(`/api/management-hub/${tenantId}/overview`),
      ]);
      const counts = summary.status === 'fulfilled' ? (summary.value.data || {}) : null;
      const ov = legacy.status === 'fulfilled' ? legacy.value : null;

      let typeGrid = '';
      if (counts) {
        typeGrid = Object.entries(OBJECT_TYPES).map(([k, label]) =>
          `<div class="ipm-type-card" data-tab-trigger="browser" data-browser-type="${k}">
            <div class="ipm-type-count">${counts[k] ?? '—'}</div>
            <div class="ipm-type-label">${esc(label)}</div>
          </div>`
        ).join('');
      } else {
        typeGrid = '<p class="ipm-info">Kon Intune samenvatting niet laden. Controleer Graph API-rechten.</p>';
      }

      let legacyHtml = '';
      if (ov) {
        legacyHtml = `<section class="ipm-legacy-summary">
          <h3>Guardian / CPP</h3>
          <dl class="ipm-dl">
            <dt>Actieve policies</dt><dd>${esc(ov.active_policy_count ?? '—')}</dd>
            <dt>Alerts</dt><dd>${esc(ov.alert_count ?? '—')}</dd>
            <dt>Laatste sync</dt><dd>${fmtDateTime(ov.last_sync)}</dd>
          </dl>
        </section>`;
      }

      panel.innerHTML = `
        <h2 class="ipm-section-title">Intune Beleid Overzicht</h2>
        <div class="ipm-type-grid">${typeGrid}</div>
        ${legacyHtml}
        <details class="ipm-legacy-accordion" id="ipm-legacy-accordion">
          <summary>Guardian &amp; CloudPolicy (legacy)</summary>
          <div id="ipm-legacy-body"><div class="ipm-spinner"></div></div>
        </details>`;

      // Lazy-load legacy accordion on open
      panel.querySelector('#ipm-legacy-accordion').addEventListener('toggle', function () {
        if (this.open) loadLegacy(tenantId);
      }, { once: true });

      // Overview type cards navigate to browser
      panel.querySelectorAll('.ipm-type-card[data-browser-type]').forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
          _browserType = card.dataset.browserType;
          switchTab('browser');
          const sel = document.getElementById('ipm-browser-type-select');
          if (sel) { sel.value = _browserType; loadBrowser(tenantId, document.getElementById('ipm-panel-browser')); }
          else loadTabData('browser', tenantId);
        });
      });
    } catch (err) {
      panel.innerHTML = `<p class="ipm-error">Fout: ${esc(err.message)}</p>`;
    }
  }

  // ── Tab: Browser ──────────────────────────────────────────────────────────
  async function loadBrowser(tenantId, panel) {
    panel.innerHTML = `
      <div class="ipm-toolbar">
        <select id="ipm-browser-type-select" class="ipm-select">
          ${Object.entries(OBJECT_TYPES).map(([k, l]) =>
            `<option value="${k}"${k === _browserType ? ' selected' : ''}>${esc(l)}</option>`
          ).join('')}
        </select>
        <button class="ipm-btn" id="ipm-browser-reload">Vernieuwen</button>
      </div>
      <div id="ipm-browser-content"><div class="ipm-spinner"></div></div>`;

    panel.querySelector('#ipm-browser-type-select').addEventListener('change', e => {
      _browserType = e.target.value;
      fetchBrowserItems(tenantId, panel);
    });
    panel.querySelector('#ipm-browser-reload').addEventListener('click', () => fetchBrowserItems(tenantId, panel));

    fetchBrowserItems(tenantId, panel);
  }

  async function fetchBrowserItems(tenantId, panel) {
    const content = panel.querySelector('#ipm-browser-content');
    content.innerHTML = '<div class="ipm-spinner"></div>';
    try {
      const res = await hubFetch(`/api/intune-policy/${tenantId}/objects?type=${_browserType}`);
      _browserItems = res.data || [];
      content.innerHTML = renderBrowserTable(_browserItems, tenantId);
      content.querySelectorAll('.ipm-row-link').forEach(btn => {
        btn.addEventListener('click', () => loadObjectDetail(tenantId, _browserType, btn.dataset.id, btn.dataset.name));
      });
    } catch (err) {
      content.innerHTML = `<p class="ipm-error">Fout: ${esc(err.message)}</p>`;
    }
  }

  function renderBrowserTable(items, _tid) {
    if (!items.length) return '<p class="ipm-info">Geen items gevonden.</p>';
    return `<div class="ipm-table-wrap"><table class="ipm-table">
      <thead><tr><th>Naam</th><th>Status</th><th>Gewijzigd</th><th></th></tr></thead>
      <tbody>${items.map(item => `<tr>
        <td>${esc(item.displayName || item.name || '—')}</td>
        <td><span class="${pillClass(item.state || item.status)}">${esc(item.state || item.status || '—')}</span></td>
        <td>${fmtDateTime(item.lastModifiedDateTime || item.modifiedAt)}</td>
        <td><button class="ipm-btn ipm-btn-sm ipm-row-link" data-id="${esc(item.id)}" data-name="${esc(item.displayName || item.name || item.id)}">Details</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  async function loadObjectDetail(tenantId, type, id, name) {
    openSlideover(name || id, '<div class="ipm-spinner"></div>');
    try {
      const res = await hubFetch(`/api/intune-policy/${tenantId}/objects/${encodeURIComponent(id)}?type=${type}`);
      const obj = res.data || {};
      const asRes = await hubFetch(`/api/intune-policy/${tenantId}/objects/${encodeURIComponent(id)}/assignments?type=${type}`).catch(() => ({ data: [] }));
      const assignments = asRes.data || [];
      const asHtml = assignments.length
        ? `<h4>Assignments (${assignments.length})</h4><ul class="ipm-assign-list">${assignments.map(a => `<li>${esc(a.target?.groupDisplayName || a.target?.groupId || JSON.stringify(a.target))}</li>`).join('')}</ul>`
        : '<p class="ipm-info">Geen assignments.</p>';
      openSlideover(name || id, `
        <pre class="ipm-pre">${esc(JSON.stringify(obj, null, 2))}</pre>
        ${asHtml}
        <div class="ipm-slideover-actions">
          <button class="ipm-btn ipm-btn-danger ipm-delete-obj" data-id="${esc(id)}" data-type="${esc(type)}">Verwijderen</button>
        </div>`);
      document.querySelector('.ipm-delete-obj')?.addEventListener('click', async btn => {
        if (!confirm('Zeker weten dat u dit object wilt verwijderen?')) return;
        try {
          await hubFetch(`/api/intune-policy/${tenantId}/objects/${encodeURIComponent(id)}?type=${type}`, { method: 'DELETE' });
          closeSlideover();
          fetchBrowserItems(tenantId, document.getElementById('ipm-panel-browser'));
        } catch (e) { alert('Verwijderen mislukt: ' + e.message); }
      });
    } catch (err) {
      document.getElementById('ipm-slideover-body').innerHTML = `<p class="ipm-error">Fout: ${esc(err.message)}</p>`;
    }
  }

  // ── Tab: Assignments ──────────────────────────────────────────────────────
  async function loadAssignments(tenantId, panel) {
    panel.innerHTML = '<div class="ipm-spinner"></div>';
    try {
      const res = await hubFetch(`/api/intune-policy/${tenantId}/assignments`);
      const groups = res.data || {};
      panel.innerHTML = renderGroupList(groups);
    } catch (err) {
      panel.innerHTML = `<p class="ipm-error">Fout: ${esc(err.message)}</p>`;
    }
  }

  function renderGroupList(groups) {
    const keys = Object.keys(groups);
    if (!keys.length) return '<p class="ipm-info">Geen assignments gevonden.</p>';
    return `<div class="ipm-assignments-list">` + keys.map(gid => {
      const policies = groups[gid] || [];
      return `<div class="ipm-group-row">
        <div class="ipm-group-header"><strong>${esc(policies[0]?.groupDisplayName || gid)}</strong> <span class="ipm-count">${policies.length} policies</span></div>
        <div class="ipm-group-policies">${policies.map(p =>
          `<span class="ipm-policy-chip">${esc(p.displayName || p.id)}</span>`
        ).join('')}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  // ── Tab: Export ───────────────────────────────────────────────────────────
  function loadExport(tenantId, panel) {
    panel.innerHTML = `
      <h2 class="ipm-section-title">Export</h2>
      <p class="ipm-info">Selecteer de typen die u wilt exporteren als ZIP-bestand.</p>
      <div class="ipm-export-grid">
        ${Object.entries(OBJECT_TYPES).map(([k, l]) =>
          `<label class="ipm-export-check"><input type="checkbox" name="export-type" value="${k}" checked> ${esc(l)}</label>`
        ).join('')}
      </div>
      <div class="ipm-toolbar" style="margin-top:1rem;">
        <button class="ipm-btn ipm-btn-primary" id="ipm-export-btn">Exporteren als ZIP</button>
        <span id="ipm-export-status"></span>
      </div>`;

    panel.querySelector('#ipm-export-btn').addEventListener('click', () => runExport(tenantId, panel));
  }

  async function runExport(tenantId, panel) {
    const checked = Array.from(panel.querySelectorAll('input[name="export-type"]:checked')).map(i => i.value);
    if (!checked.length) { alert('Selecteer minimaal één type.'); return; }
    const status = panel.querySelector('#ipm-export-status');
    status.textContent = 'Bezig…';
    try {
      const res = await hubFetch(`/api/intune-policy/${tenantId}/export?types=${checked.join(',')}`);
      if (!res.data_base64) throw new Error('Geen data ontvangen');
      const bytes = atob(res.data_base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || `intune-export-${tenantId}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      status.textContent = `Export klaar (${res.filename || 'export.zip'})`;
    } catch (err) {
      status.textContent = `Fout: ${err.message}`;
    }
  }

  // ── Tab: Compare ──────────────────────────────────────────────────────────
  function loadCompare(panel) {
    panel.innerHTML = `
      <h2 class="ipm-section-title">Vergelijk tenants</h2>
      <div class="ipm-compare-form">
        <div class="ipm-compare-row">
          <label>Bron tenant ID <input class="ipm-input" id="ipm-cmp-src" placeholder="tenant-id-of-uuid"></label>
          <label>Doel tenant ID <input class="ipm-input" id="ipm-cmp-dst" placeholder="tenant-id-of-uuid"></label>
        </div>
        <div class="ipm-compare-row">
          <label>Type
            <select class="ipm-select" id="ipm-cmp-type">
              ${Object.entries(OBJECT_TYPES).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}
            </select>
          </label>
          <button class="ipm-btn ipm-btn-primary" id="ipm-cmp-btn">Vergelijken</button>
        </div>
      </div>
      <div id="ipm-cmp-result"></div>`;

    panel.querySelector('#ipm-cmp-btn').addEventListener('click', () => runCompare(panel));
  }

  async function runCompare(panel) {
    const srcId = panel.querySelector('#ipm-cmp-src').value.trim();
    const dstId = panel.querySelector('#ipm-cmp-dst').value.trim();
    const type  = panel.querySelector('#ipm-cmp-type').value;
    const result = panel.querySelector('#ipm-cmp-result');
    if (!srcId || !dstId) { alert('Vul beide tenant IDs in.'); return; }
    result.innerHTML = '<div class="ipm-spinner"></div>';
    try {
      const res = await hubFetch('/api/intune-policy/compare', {
        method: 'POST',
        body: JSON.stringify({ source_tenant_id: srcId, target_tenant_id: dstId, object_types: [type] }),
      });
      result.innerHTML = renderDiff(res.data || []);
    } catch (err) {
      result.innerHTML = `<p class="ipm-error">Fout: ${esc(err.message)}</p>`;
    }
  }

  function renderDiff(items) {
    if (!items.length) return '<p class="ipm-info">Geen resultaten.</p>';
    return `<div class="ipm-table-wrap"><table class="ipm-table">
      <thead><tr><th>Naam</th><th>Type</th><th>Status</th></tr></thead>
      <tbody>${items.map(d =>
        `<tr class="ipm-diff-row ipm-diff-row--${esc(d.status)}">
          <td>${esc(d.displayName || d.name || '—')}</td>
          <td>${esc(labelForType(d.object_type))}</td>
          <td>${diffBadge(d.status)}</td>
        </tr>`
      ).join('')}</tbody>
    </table></div>`;
  }

  // ── Tab: Import ───────────────────────────────────────────────────────────
  function loadImport(tenantId, panel) {
    panel.innerHTML = `
      <h2 class="ipm-section-title">Import</h2>
      <p class="ipm-info">Sleep een eerder geëxporteerd ZIP-bestand hieronder naartoe, of klik om te bladeren.</p>
      <div class="ipm-file-drop" id="ipm-file-drop">
        <input type="file" id="ipm-file-input" accept=".zip" style="display:none">
        <span>Sleep ZIP hier of <button class="ipm-btn" id="ipm-file-browse">Bladeren</button></span>
      </div>
      <div id="ipm-import-preview"></div>
      <div class="ipm-toolbar" id="ipm-import-actions" style="display:none">
        <button class="ipm-btn ipm-btn-primary" id="ipm-import-confirm">Importeren</button>
        <span id="ipm-import-status"></span>
      </div>`;

    const drop  = panel.querySelector('#ipm-file-drop');
    const input = panel.querySelector('#ipm-file-input');
    panel.querySelector('#ipm-file-browse').addEventListener('click', () => input.click());
    input.addEventListener('change', e => e.target.files[0] && handleImportFile(e.target.files[0], tenantId, panel));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('ipm-file-drop--over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('ipm-file-drop--over'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('ipm-file-drop--over');
      e.dataTransfer.files[0] && handleImportFile(e.dataTransfer.files[0], tenantId, panel);
    });
  }

  let _importPayload = null;

  async function handleImportFile(file, tenantId, panel) {
    const preview = panel.querySelector('#ipm-import-preview');
    const actions = panel.querySelector('#ipm-import-actions');
    preview.innerHTML = '<div class="ipm-spinner"></div>';
    actions.style.display = 'none';
    _importPayload = null;
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      _importPayload = b64;
      preview.innerHTML = `<p class="ipm-info">Bestand geladen: <strong>${esc(file.name)}</strong> (${(file.size / 1024).toFixed(1)} KB)</p>`;
      actions.style.display = '';
      panel.querySelector('#ipm-import-confirm').onclick = () => runImport(tenantId, panel);
    } catch (err) {
      preview.innerHTML = `<p class="ipm-error">Bestand kon niet worden geladen: ${esc(err.message)}</p>`;
    }
  }

  async function runImport(tenantId, panel) {
    if (!_importPayload) return;
    const status = panel.querySelector('#ipm-import-status');
    status.textContent = 'Importeren…';
    try {
      const res = await hubFetch(`/api/intune-policy/${tenantId}/import`, {
        method: 'POST',
        body: JSON.stringify({ data_base64: _importPayload }),
      });
      const results = res.results || [];
      const ok  = results.filter(r => r.ok).length;
      const err = results.filter(r => !r.ok).length;
      status.textContent = `Klaar — ${ok} geslaagd, ${err} mislukt.`;
    } catch (err) {
      status.textContent = `Fout: ${err.message}`;
    }
  }

  // ── Legacy accordion ──────────────────────────────────────────────────────
  async function loadLegacy(tenantId) {
    const body = document.getElementById('ipm-legacy-body');
    if (!body) return;
    try {
      const [ov, policies, events] = await Promise.all([
        hubFetch(`/api/management-hub/${tenantId}/overview`),
        hubFetch(`/api/management-hub/${tenantId}/policy-preferences`),
        hubFetch(`/api/management-hub/${tenantId}/guardian-events?limit=20`),
      ]);
      _legacyState = { overview: ov || {}, policies: (policies.items || []), events: (events.items || []) };
      body.innerHTML = renderLegacyContent(_legacyState);
    } catch (err) {
      body.innerHTML = `<p class="ipm-error">Fout: ${esc(err.message)}</p>`;
    }
  }

  function renderLegacyContent({ overview, policies, events }) {
    const ov = overview;
    const ovHtml = `<dl class="ipm-dl">
      <dt>Status</dt><dd>${esc(ov.status || '—')}</dd>
      <dt>Actieve policies</dt><dd>${esc(ov.active_policy_count ?? '—')}</dd>
      <dt>Alerts</dt><dd>${esc(ov.alert_count ?? '—')}</dd>
      <dt>Laatste sync</dt><dd>${fmtDateTime(ov.last_sync)}</dd>
    </dl>`;

    const polHtml = policies.length
      ? `<div class="ipm-table-wrap"><table class="ipm-table">
          <thead><tr><th>Naam</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>${policies.map(p => `<tr>
            <td>${esc(p.display_name || p.name || '—')}</td>
            <td>${esc(p.policy_type || '—')}</td>
            <td><span class="${pillClass(p.state || p.status)}">${esc(p.state || p.status || '—')}</span></td>
          </tr>`).join('')}</tbody>
        </table></div>`
      : '<p class="ipm-info">Geen policies.</p>';

    const evHtml = events.length
      ? `<ul class="ipm-event-list">${events.map(e =>
          `<li><span class="ipm-event-time">${fmtDateTime(e.timestamp)}</span> ${esc(e.message || e.event_type || '—')}</li>`
        ).join('')}</ul>`
      : '<p class="ipm-info">Geen events.</p>';

    return `<h4>Overzicht</h4>${ovHtml}<h4>Policies</h4>${polHtml}<h4>Recente events</h4>${evHtml}`;
  }

  // ── Event binding & tab dispatch ──────────────────────────────────────────
  function loadTabData(tab, tenantId) {
    const panel = document.getElementById(`ipm-panel-${tab}`);
    if (!panel) return;
    if (tab === 'overview')     loadOverview(tenantId, panel);
    else if (tab === 'browser') loadBrowser(tenantId, panel);
    else if (tab === 'assignments') loadAssignments(tenantId, panel);
    else if (tab === 'export')  loadExport(tenantId, panel);
    else if (tab === 'compare') loadCompare(panel);
    else if (tab === 'import')  loadImport(tenantId, panel);
  }

  function bindEvents() {
    document.addEventListener('click', e => {
      // Tab buttons
      const tabBtn = e.target.closest('.ipm-tab[data-tab]');
      if (tabBtn && document.getElementById('ipm-root')) {
        const tab = tabBtn.dataset.tab;
        switchTab(tab);
        const tid = getTenantId();
        if (tid) loadTabData(tab, tid);
        return;
      }
      // Slideover close
      if (e.target.closest('#ipm-slideover-close')) { closeSlideover(); return; }
    });

    // Tenant change
    const sel = document.getElementById('tenantSelect');
    if (sel) {
      sel.addEventListener('change', () => {
        const tid = sel.value;
        if (!tid || !document.getElementById('ipm-root')) return;
        loadTabData(_activeTab, tid);
      });
    }
  }

  // ── Entry point ───────────────────────────────────────────────────────────
  async function loadIntuneManagementHubSection(options = {}) {
    const container = getContainer();
    if (!container) return;

    buildShell(container);
    _activeTab = 'overview';
    bindEvents();

    const tenantId = options.tenantId || getTenantId();
    if (!tenantId) {
      // Show "select a tenant" placeholder in the overview panel
      const panel = document.getElementById('ipm-panel-overview');
      if (panel) {
        panel.innerHTML = `<p class="ipm-info" style="margin-top:2rem;">
          Selecteer eerst een tenant om Intune-beleid te bekijken.
        </p>`;
      }
      return;
    }

    loadTabData('overview', tenantId);
  }

  window.loadIntuneManagementHubSection = loadIntuneManagementHubSection;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.getElementById('ipm-root')) return; // already initialized
    }, { once: true });
  }
})();
