/**
 * Denjoy IT Portal — Bevindingen & Health module
 * Laadt /api/findings/{tid}/health en /api/findings/{tid}/list
 */

(function () {
  'use strict';

  let _loaded = false;
  let _allFindings = [];
  let _selectedFindingKey = null;
  let _importInProgress = false;

  function getImportLockKey(tid) {
    return `denjoy:bevindingen:imported:${String(tid || '')}`;
  }

  function hasImportedForTenant(tid) {
    if (!tid) return false;
    try {
      return localStorage.getItem(getImportLockKey(tid)) === '1';
    } catch (_) {
      return false;
    }
  }

  function markImportedForTenant(tid) {
    if (!tid) return;
    try {
      localStorage.setItem(getImportLockKey(tid), '1');
    } catch (_) {
      // Ignore storage errors and keep runtime guard active.
    }
  }

  function updateImportButtonState() {
    const importBtn = document.getElementById('bevImportBtn');
    if (!importBtn) return;
    const tid = getTid();
    if (_importInProgress) {
      importBtn.disabled = true;
      importBtn.textContent = '⟳ Bezig…';
      return;
    }
    if (hasImportedForTenant(tid)) {
      importBtn.disabled = true;
      importBtn.textContent = '✓ Al geimporteerd';
      return;
    }
    importBtn.disabled = false;
    importBtn.textContent = '⬇ Importeer uit assessment';
  }

  const DOMAIN_LABELS = {
    identity:      'Identity',
    appregs:       'App Registraties',
    exchange:      'Exchange',
    collaboration: 'Samenwerking',
    ca:            'Conditional Access',
  };

  const STATUS_ORDER = { critical: 0, warning: 1, info: 2, ok: 3 };

  function getTid() {
    return (typeof currentTenantId !== 'undefined') ? currentTenantId : null;
  }

  function getToken() {
    return localStorage.getItem('denjoy_token') || '';
  }

  async function apiFetch(path) {
    const res = await fetch(path, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ── Health score ───────────────────────────────────────────────────────────

  function buildDomainBreakdown(findings) {
    const map = {};
    for (const f of findings) {
      if (!map[f.domain]) map[f.domain] = { total: 0, ok: 0, warn: 0 };
      map[f.domain].total++;
      if (f.status === 'ok') map[f.domain].ok++;
      if (f.status === 'warning') map[f.domain].warn++;
    }
    const result = {};
    for (const [d, v] of Object.entries(map)) {
      result[d] = {
        total: v.total,
        score: v.total ? Math.round((v.ok * 1.0 + v.warn * 0.5) / v.total * 100) : null,
      };
    }
    return result;
  }

  function renderHealthBar(health) {
    const scoreEl = document.getElementById('bevHealthScore');
    const pillsEl = document.getElementById('bevDomainPills');
    if (!scoreEl || !pillsEl) return;

    const score = health.score ?? null;
    const scoreClass = score === null ? '' : score >= 80 ? 'bev-score--ok' : score >= 50 ? 'bev-score--warn' : 'bev-score--crit';
    scoreEl.textContent = score !== null ? `${score}%` : '—';
    scoreEl.className = `bev-health-score ${scoreClass}`;

    const domains = buildDomainBreakdown(health.findings || []);
    pillsEl.innerHTML = Object.entries(domains).map(([domain, info]) => {
      const label = DOMAIN_LABELS[domain] || domain;
      const s = info.score ?? 0;
      const cls = s >= 80 ? 'bev-pill--ok' : s >= 50 ? 'bev-pill--warn' : 'bev-pill--crit';
      return `<span class="bev-domain-pill ${cls}" title="${label}: ${s}% (${info.total} controls)">${label} <strong>${s}%</strong></span>`;
    }).join('');
  }

  // ── Findings table ────────────────────────────────────────────────────────

  function domainLabel(d) { return DOMAIN_LABELS[d] || d; }

  function statusBadge(s) {
    const map = { ok: 'ok', warning: 'warn', critical: 'crit', info: 'info' };
    const cls = map[s] || 'neutral';
    const labels = { ok: 'OK', warning: 'Waarschuwing', critical: 'Kritiek', info: 'Info' };
    return `<span class="live-badge live-badge-${cls}">${labels[s] || s}</span>`;
  }

  function impactBadge(i) {
    const map = { high: 'crit', medium: 'warn', low: 'neutral' };
    const cls = map[i] || 'neutral';
    const labels = { high: 'Hoog', medium: 'Middel', low: 'Laag' };
    return `<span class="live-badge live-badge-${cls} live-badge-sm">${labels[i] || i}</span>`;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) { return iso; }
  }

  function renderTable(findings) {
    const tbody = document.getElementById('bevFindingsBody');
    const countEl = document.getElementById('bevCount');
    if (!tbody) return;

    if (!findings || findings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="bev-empty">Geen bevindingen gevonden voor de geselecteerde filters.</td></tr>`;
      if (countEl) countEl.textContent = '';
      return;
    }

    const sorted = [...findings].sort((a, b) =>
      (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
    );

    tbody.innerHTML = sorted.map(f => `
      <tr class="bev-row bev-row--${f.status || 'info'}" data-finding-key="${escapeHtml(f.domain || '')}:${escapeHtml(f.control || '')}">
        <td>${statusBadge(f.status)}</td>
        <td><span class="bev-domain-tag">${domainLabel(f.domain)}</span></td>
        <td class="bev-control">${escapeHtml(f.control || '')}</td>
        <td class="bev-finding">${escapeHtml(f.finding || f.title || '')}</td>
        <td>${impactBadge(f.impact)}</td>
        <td class="bev-recommendation">${f.recommendation ? escapeHtml(f.recommendation) : '<span class="bev-na">—</span>'}</td>
        <td class="bev-date">${formatDate(f.scanned_at)}</td>
        <td class="bev-workbench-cell">
          <div class="bev-inline-actions">
            <button type="button" class="bev-inline-btn" data-bev-action="workbench">Werkbank</button>
            <button type="button" class="bev-inline-btn" data-bev-action="playbook">Runbook</button>
            <button type="button" class="bev-inline-btn" data-bev-action="create-action">Actie</button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('tr[data-finding-key]').forEach((row, index) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('[data-bev-action]')) return;
        openWorkbench(sorted[index]);
      });
      row.querySelector('[data-bev-action="workbench"]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        openWorkbench(sorted[index]);
      });
      row.querySelector('[data-bev-action="playbook"]')?.addEventListener('click', async (event) => {
        event.stopPropagation();
        await createPlaybookForFinding(sorted[index]);
      });
      row.querySelector('[data-bev-action="create-action"]')?.addEventListener('click', async (event) => {
        event.stopPropagation();
        await createActionFromFinding(sorted[index]);
      });
    });

    if (countEl) countEl.textContent = `${findings.length} bevinding${findings.length !== 1 ? 'en' : ''}`;
  }

  function applyFilters() {
    const domain = document.getElementById('bevDomainFilter')?.value || '';
    const status = document.getElementById('bevStatusFilter')?.value || '';
    let filtered = _allFindings;
    if (domain) filtered = filtered.filter(f => f.domain === domain);
    if (status) filtered = filtered.filter(f => f.status === status);
    renderTable(filtered);
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadBevindingenSection() {
    const tid = getTid();
    if (!tid) {
      renderTable([]);
      const scoreEl = document.getElementById('bevHealthScore');
      if (scoreEl) scoreEl.textContent = '—';
      const pillsEl = document.getElementById('bevDomainPills');
      if (pillsEl) pillsEl.innerHTML = '';
      const countEl = document.getElementById('bevCount');
      if (countEl) countEl.textContent = 'Geen tenant geselecteerd.';
      return;
    }

    // Loading state
    const tbody = document.getElementById('bevFindingsBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="bev-empty bev-loading">Bevindingen laden…</td></tr>`;

    try {
      const [health, list] = await Promise.all([
        apiFetch(`/api/findings/${tid}/health`),
        apiFetch(`/api/findings/${tid}/list`),
      ]);

      renderHealthBar(health);

      _allFindings = list.findings || [];
      applyFilters();
      resetWorkbench();
      _loaded = true;
    } catch (err) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="bev-empty bev-error">Fout bij laden van bevindingen: ${escapeHtml(String(err.message || err))}</td></tr>`;
      console.error('[bevindingen] load error', err);
    }
  }

  function resetWorkbench() {
    _selectedFindingKey = null;
    if (typeof window.renderContextRail === 'function') {
      window.renderContextRail('bevindingen');
    }
  }

  async function openWorkbench(finding) {
    const tid = getTid();
    if (!tid || !finding) return;
    _selectedFindingKey = `${finding.domain || ''}:${finding.control || ''}`;
    if (typeof window.openSideRailDetail === 'function') {
      window.openSideRailDetail('Bevinding', finding.title || finding.finding || finding.control || 'Bevinding');
    }
    if (typeof window.updateSideRailDetail === 'function') {
      window.updateSideRailDetail(
        finding.title || finding.finding || finding.control || 'Bevinding',
        '<div class="bev-workbench-empty">Werkbank laden…</div>'
      );
    }
    try {
      const params = new URLSearchParams({
        domain: finding.domain || '',
        control: finding.control || '',
        title: finding.title || '',
        finding: finding.finding || '',
        recommendation: finding.recommendation || '',
      });
      const data = await apiFetch(`/api/findings/${tid}/workbench?${params}`);
      renderWorkbench(finding, data);
    } catch (err) {
      if (typeof window.updateSideRailDetail === 'function') {
        window.updateSideRailDetail(
          finding.title || finding.finding || finding.control || 'Bevinding',
          `<div class="bev-workbench-empty" style="color:#dc2626;">Werkbank laden mislukt: ${escapeHtml(String(err.message || err))}</div>`
        );
      }
    }
  }

  function renderWorkbench(finding, data) {
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const changes = Array.isArray(data.changes) ? data.changes : [];
    const actions = Array.isArray(data.actions) ? data.actions : [];
    const playbooks = data.playbooks && typeof data.playbooks === 'object' ? data.playbooks : {};
    const playbookPages = Array.isArray(playbooks.existing) ? playbooks.existing : [];
    const playbookTemplate = playbooks.template && typeof playbooks.template === 'object' ? playbooks.template : null;
    const bodyHtml = `
      <div class="bev-workbench-meta">${escapeHtml(domainLabel(finding.domain))} · ${escapeHtml(finding.control || '')} · ${escapeHtml(finding.status || '')}</div>
      <div class="bev-inline-actions" style="margin: .75rem 0 1rem;">
        <button type="button" class="bev-inline-btn" id="bevWorkbenchCreatePlaybookBtn">Runbook maken</button>
        <button type="button" class="bev-inline-btn" id="bevWorkbenchCreateActionBtn">Actie aanmaken</button>
      </div>
      <div class="bev-workbench-grid">
        <div class="bev-wb-card bev-wb-card--primary">
          <h4>Runbooks</h4>
          <div class="bev-wb-list">
            ${playbookPages.length ? playbookPages.map((item) => `
              <div class="bev-wb-item">
                <strong>${escapeHtml(item.title || 'Procedure')}</strong>
                <span>${escapeHtml(item.category || 'procedures')} · score ${escapeHtml(String(item.score || 0))}</span>
                <div class="bev-wb-item-actions">
                  <button type="button" class="bev-inline-btn" data-open-kb-page="${escapeHtml(String(item.id))}">Open runbook</button>
                </div>
              </div>
            `).join('') : `
              <div class="bev-wb-item">
                <strong>${escapeHtml(playbookTemplate?.title || 'Nieuw runbook')}</strong>
                <span>${escapeHtml(playbookTemplate?.summary || 'Nog geen bestaand procedure-item gevonden.')}</span>
                <div class="bev-wb-item-actions">
                  <button type="button" class="bev-inline-btn" id="bevWorkbenchCreatePlaybookInlineBtn">Maak procedure</button>
                </div>
              </div>
            `}
          </div>
        </div>
        <div class="bev-wb-card">
          <h4>Operaties</h4>
          <div class="bev-wb-list">
            <div class="bev-wb-item">
              <strong>Directe vervolgactie</strong>
              <span>Start operationele taken voor deze tenant vanuit dezelfde bevinding.</span>
              <div class="bev-wb-item-actions">
                <button type="button" class="bev-inline-btn" id="bevWorkbenchTenantRefreshBtn">Tenant refresh</button>
                <button type="button" class="bev-inline-btn" id="bevWorkbenchGuardianSyncBtn">Guardian sync</button>
                <button type="button" class="bev-inline-btn" id="bevWorkbenchAssessmentBtn">Assessment</button>
              </div>
            </div>
          </div>
        </div>
        <div class="bev-wb-card">
          <h4>Assets</h4>
          <div class="bev-wb-list">
            ${assets.length ? assets.map((item) => `
              <div class="bev-wb-item">
                <strong>${escapeHtml(item.name || 'Asset')}</strong>
                <span>${escapeHtml(item.type_name || 'Onbekend type')} · ${escapeHtml(item.location || 'Geen locatie')}</span>
                <div class="bev-wb-item-actions">
                  <button type="button" class="bev-inline-btn" data-open-kb-asset="${escapeHtml(String(item.id))}">Open asset</button>
                </div>
              </div>
            `).join('') : '<div class="bev-workbench-empty">Geen duidelijke asset-match gevonden.</div>'}
          </div>
        </div>
        <div class="bev-wb-card">
          <h4>Pagina&apos;s</h4>
          <div class="bev-wb-list">
            ${pages.length ? pages.map((item) => `
              <div class="bev-wb-item">
                <strong>${escapeHtml(item.title || 'Pagina')}</strong>
                <span>${escapeHtml(item.category || 'Geen categorie')}</span>
                <div class="bev-wb-item-actions">
                  <button type="button" class="bev-inline-btn" data-open-kb-page="${escapeHtml(String(item.id))}">Open pagina</button>
                </div>
              </div>
            `).join('') : '<div class="bev-workbench-empty">Geen pagina-suggesties beschikbaar.</div>'}
          </div>
        </div>
        <div class="bev-wb-card">
          <h4>Wijzigingslog</h4>
          <div class="bev-wb-list">
            ${changes.length ? changes.map((item) => `
              <div class="bev-wb-item">
                <strong>${escapeHtml(item.action || 'Wijziging')}</strong>
                <span>${escapeHtml(item.change_date || '—')} · ${escapeHtml(item.category || '—')}</span>
                <div class="bev-wb-item-actions">
                  <button type="button" class="bev-inline-btn" data-open-kb-change="${escapeHtml(String(item.id))}">Open wijziging</button>
                </div>
              </div>
            `).join('') : '<div class="bev-workbench-empty">Geen relevante wijzigingen gevonden.</div>'}
          </div>
        </div>
        <div class="bev-wb-card">
          <h4>Gekoppelde acties</h4>
          <div class="bev-wb-list">
            ${actions.length ? actions.map((item) => `
              <div class="bev-wb-item">
                <strong>${escapeHtml(item.title || 'Actie')}</strong>
                <span>${escapeHtml(item.status || 'open')} · ${escapeHtml(item.owner || 'Geen owner')}</span>
                <span>${escapeHtml(item.due_date || 'Geen deadline')} · ${escapeHtml(item.sla_label || 'SLA niet bekend')}</span>
              </div>
            `).join('') : '<div class="bev-workbench-empty">Nog geen actie gekoppeld aan deze bevinding.</div>'}
          </div>
        </div>
      </div>
    `;
    if (typeof window.updateSideRailDetail === 'function') {
      window.updateSideRailDetail(finding.title || finding.finding || finding.control || 'Bevinding', bodyHtml);
    }
    const scope = document.getElementById('dpBody') || document;

    scope.querySelector('#bevWorkbenchCreateActionBtn')?.addEventListener('click', () => createActionFromFinding(finding, assets[0] || null));
    scope.querySelector('#bevWorkbenchCreatePlaybookBtn')?.addEventListener('click', () => createPlaybookForFinding(finding));
    scope.querySelector('#bevWorkbenchCreatePlaybookInlineBtn')?.addEventListener('click', () => createPlaybookForFinding(finding));
    scope.querySelector('#bevWorkbenchTenantRefreshBtn')?.addEventListener('click', () => enqueueFindingJob(finding, 'tenant_refresh'));
    scope.querySelector('#bevWorkbenchGuardianSyncBtn')?.addEventListener('click', () => enqueueFindingJob(finding, 'guardian_sync'));
    scope.querySelector('#bevWorkbenchAssessmentBtn')?.addEventListener('click', () => enqueueFindingJob(finding, 'assessment_run'));
    scope.querySelectorAll('[data-open-kb-asset]').forEach((btn) => btn.addEventListener('click', () => openKbAsset(btn.dataset.openKbAsset)));
    scope.querySelectorAll('[data-open-kb-page]').forEach((btn) => btn.addEventListener('click', () => openKbPage(btn.dataset.openKbPage)));
    scope.querySelectorAll('[data-open-kb-change]').forEach((btn) => btn.addEventListener('click', () => openKbChange(btn.dataset.openKbChange)));
  }

  async function createActionFromFinding(finding, suggestedAsset = null) {
    const tid = getTid();
    if (!tid || !finding) return;
    const defaultDueDate = (() => {
      const days = finding.status === 'critical' ? 1 : (finding.status === 'warning' ? 7 : 14);
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    })();
    if (typeof window.openSideRailDetail === 'function' && typeof window.updateSideRailDetail === 'function') {
      window.openSideRailDetail('Bevinding', 'Actie aanmaken');
      window.updateSideRailDetail('Actie aanmaken', `
        <div class="bev-workbench-meta">${escapeHtml(finding.title || finding.finding || finding.control || 'Bevindingactie')}</div>
        <div class="bev-wb-list" style="margin-top:.9rem;">
          <div class="bev-wb-item"><strong>Domein</strong><span>${escapeHtml(domainLabel(finding.domain || '—'))}</span></div>
          <div class="bev-wb-item"><strong>Control</strong><span>${escapeHtml(finding.control || '—')}</span></div>
          <div class="bev-wb-item"><strong>Streefdatum</strong><span>${escapeHtml(defaultDueDate)}</span></div>
          ${suggestedAsset ? `<div class="bev-wb-item"><strong>Asset</strong><span>${escapeHtml(suggestedAsset.name || '—')}</span></div>` : ''}
        </div>
        <form id="bevCreateActionForm" class="settings-form" style="margin-top:1rem;">
          <label class="settings-field">
            <span>Owner</span>
            <input id="bevActionOwner" type="text" placeholder="Naam of team">
          </label>
          <label class="settings-field">
            <span>Streefdatum</span>
            <input id="bevActionDueDate" type="date" value="${escapeHtml(defaultDueDate)}">
          </label>
          <label class="settings-field">
            <span>Notitie</span>
            <textarea id="bevActionNotes" rows="4" placeholder="Extra context of vervolgstap">${escapeHtml(finding.recommendation || '')}</textarea>
          </label>
          <div class="settings-actions" style="margin-top:1rem;">
            <button type="submit" class="btn primary">Actie opslaan</button>
          </div>
        </form>
      `);
      document.getElementById('bevCreateActionForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        submitActionFromFinding(finding, suggestedAsset, {
          owner: document.getElementById('bevActionOwner')?.value || '',
          dueDate: document.getElementById('bevActionDueDate')?.value || defaultDueDate,
          notes: document.getElementById('bevActionNotes')?.value || '',
        });
      }, { once: true });
      return;
    }
    return submitActionFromFinding(finding, suggestedAsset, {
      owner: '',
      dueDate: defaultDueDate,
      notes: finding.recommendation || '',
    });
  }

  async function submitActionFromFinding(finding, suggestedAsset = null, formValues = null) {
    const tid = getTid();
    if (!tid || !finding || !formValues) return;
    const payload = {
      tenant_id: tid,
      finding_key: `${finding.domain || ''}:${finding.control || ''}`,
      title: finding.title || finding.finding || finding.control || 'Nieuwe bevindingactie',
      severity: finding.status === 'critical' ? 'critical' : (finding.status === 'warning' ? 'warning' : 'info'),
      owner: String(formValues.owner || '').trim() || null,
      due_date: String(formValues.dueDate || '').trim() || null,
      notes: String(formValues.notes || '').trim() || null,
      evidence: finding.finding || null,
      kb_asset_id: suggestedAsset?.id || null,
      kb_asset_name: suggestedAsset?.name || null,
    };
    try {
      await fetch('/api/actions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      });
      if (typeof showToast === 'function') showToast('Actie aangemaakt voor deze bevinding.', 'success');
      if (_selectedFindingKey === `${finding.domain || ''}:${finding.control || ''}`) {
        await openWorkbench(finding);
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(`Actie aanmaken mislukt: ${String(err.message || err)}`, 'error');
    }
  }

  function openKbAsset(assetId) {
    if (!assetId || typeof window.showSection !== 'function') return;
    window.showSection('kb', { kbTab: 'assets' });
    window.kbSwitchTab?.('assets');
    setTimeout(() => window.kbOpenEditAsset ? window.kbOpenEditAsset(Number(assetId)) : null, 180);
  }

  function openKbPage(pageId) {
    if (!pageId || typeof window.showSection !== 'function') return;
    window.showSection('kb', { kbTab: 'pages' });
    window.kbSwitchTab?.('pages');
    setTimeout(() => window.kbOpenPage?.(Number(pageId)), 180);
  }

  function openKbChange(changeId) {
    if (!changeId || typeof window.showSection !== 'function') return;
    window.showSection('kb', { kbTab: 'changelog' });
    window.kbSwitchTab?.('changelog');
    setTimeout(() => window.kbOpenEditChangelog?.(Number(changeId)), 180);
  }

  async function createPlaybookForFinding(finding) {
    const tid = getTid();
    if (!tid || !finding) return;
    try {
      const res = await fetch(`/api/findings/${tid}/playbook`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.cookie.match(/denjoy_csrf=([^;]+)/)?.[1] || '',
        },
        credentials: 'include',
        body: JSON.stringify({
          domain: finding.domain || '',
          control: finding.control || '',
          title: finding.title || '',
          finding: finding.finding || '',
          recommendation: finding.recommendation || '',
          status: finding.status || '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (typeof showToast === 'function') {
        showToast(data.created ? 'Runbook aangemaakt in Procedures.' : 'Bestaand runbook geopend.', 'success');
      }
      if (data.page?.id) openKbPage(data.page.id);
      if (_selectedFindingKey === `${finding.domain || ''}:${finding.control || ''}`) {
        await openWorkbench(finding);
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(`Runbook aanmaken mislukt: ${String(err.message || err)}`, 'error');
    }
  }

  async function enqueueFindingJob(finding, jobType) {
    const tid = getTid();
    if (!tid || !finding) return;
    const payload = {
      finding_key: `${finding.domain || ''}:${finding.control || ''}`,
      finding_title: finding.title || finding.finding || finding.control || '',
      domain: finding.domain || '',
      control: finding.control || '',
      requested_from: 'findings_workbench',
    };
    if (jobType === 'guardian_sync') payload.limit = 25;
    if (jobType === 'assessment_run') {
      payload.phases = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6'];
      payload.run_mode = 'demo';
      payload.scan_type = 'full';
      payload.started_by = 'bevindingen-workbench';
    }
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.cookie.match(/denjoy_csrf=([^;]+)/)?.[1] || '',
        },
        credentials: 'include',
        body: JSON.stringify({
          job_type: jobType,
          tenant_id: tid,
          payload,
          priority: jobType === 'assessment_run' ? 4 : 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const labels = {
        tenant_refresh: 'Tenant refresh ingepland.',
        guardian_sync: 'Guardian sync ingepland.',
        assessment_run: 'Assessment ingepland.',
      };
      if (typeof showToast === 'function') showToast(labels[jobType] || 'Job ingepland.', 'success');
    } catch (err) {
      if (typeof showToast === 'function') showToast(`Job inplannen mislukt: ${String(err.message || err)}`, 'error');
    }
  }

  // ── Filter wiring ─────────────────────────────────────────────────────────

  function wireFilters() {
    const domainSel = document.getElementById('bevDomainFilter');
    const statusSel = document.getElementById('bevStatusFilter');
    const refreshBtn = document.getElementById('bevRefreshBtn');

    if (domainSel && !domainSel._bevWired) {
      domainSel.addEventListener('change', applyFilters);
      domainSel._bevWired = true;
    }
    if (statusSel && !statusSel._bevWired) {
      statusSel.addEventListener('change', applyFilters);
      statusSel._bevWired = true;
    }
    if (refreshBtn && !refreshBtn._bevWired) {
      refreshBtn.addEventListener('click', () => { _loaded = false; loadBevindingenSection(); });
      refreshBtn._bevWired = true;
    }
    const importBtn = document.getElementById('bevImportBtn');
    if (importBtn && !importBtn._bevWired) {
      importBtn.addEventListener('click', importFromSnapshot);
      importBtn._bevWired = true;
    }
    updateImportButtonState();
  }

  async function importFromSnapshot() {
    const tid = getTid();
    if (!tid) {
      if (typeof showToast === 'function') showToast('Selecteer eerst een tenant.', 'warning');
      return;
    }
    if (_importInProgress || hasImportedForTenant(tid)) {
      if (typeof showToast === 'function') showToast('Assessment is al geimporteerd voor deze tenant.', 'info');
      updateImportButtonState();
      return;
    }

    _importInProgress = true;
    updateImportButtonState();
    try {
      const res = await fetch(`/api/findings/${tid}/import-snapshot`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.cookie.match(/denjoy_csrf=([^;]+)/)?.[1] || '',
        },
        credentials: 'include',
        body: '{}',
      });
      const data = await res.json();
      if (data.ok) {
        markImportedForTenant(tid);
        if (typeof showToast === 'function') showToast(`${data.findings_written} bevindingen geïmporteerd uit assessment-snapshot.`, 'success');
        _loaded = false;
        await loadBevindingenSection();
      } else {
        if (data.error_code === 'already_imported') {
          markImportedForTenant(tid);
          if (typeof showToast === 'function') showToast(data.error || 'Assessment is al geimporteerd.', 'info');
        } else if (typeof showToast === 'function') {
          showToast(data.error || 'Import mislukt.', 'error');
        }
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast('Import mislukt: ' + String(err.message || err), 'error');
    } finally {
      _importInProgress = false;
      updateImportButtonState();
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init() {
    wireFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.loadBevindingenSection = loadBevindingenSection;

  // Reload when tenant switches
  document.addEventListener('tenantChanged', () => {
    _loaded = false;
    _allFindings = [];
    updateImportButtonState();
    if (typeof window._currentSection !== 'undefined' && window._currentSection === 'bevindingen') {
      loadBevindingenSection();
    }
  });

  // Helper — may already be defined globally
  function escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
