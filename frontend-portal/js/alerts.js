/**
 * Denjoy IT Platform — Fase 8: Alerts & Notificaties
 * IIFE module — window.loadAlertsSection
 */
(function () {
  'use strict';

  let _tabsBound = false;
  let _secureScore = null;
  let _auditData = null;
  let _signInsData = null;
  let _followUpData = null;
  let _requestSeq = 0;

  function getTid() { const s = document.getElementById('tenantSelect'); return s ? s.value : ''; }
  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtDate(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleString('nl-NL'); } catch(_) { return iso; } }

  function apiFetch(url, opts = {}) {
    const method = String(opts.method || 'GET').toUpperCase();
    if (method === 'GET' && typeof window.apiFetchCached === 'function') {
      return window.apiFetchCached(url, opts, window.CACHE_TTL ? window.CACHE_TTL.short : 60000);
    }
    const token = localStorage.getItem('denjoy_auth_token') || localStorage.getItem('denjoy_token') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (token && method !== 'GET' && method !== 'HEAD') headers['X-CSRF-Token'] = token;
    return fetch(url, { credentials: 'include', headers, ...opts }).then(r => r.json());
  }

  function withStrictLive(url, strictLive = false) {
    if (!strictLive) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}strict_live=1&refresh=${Date.now()}`;
  }

  function loading(msg, type = 'lines') {
    if (type === 'lines' && window.skeletonLines) return window.skeletonLines(5);
    if (type === 'cards' && window.skeletonCards) return window.skeletonCards(3);
    return `<div class="al-loading"><div class="al-spinner"></div><span>${esc(msg)}</span></div>`;
  }

  function resultBadge(result) {
    const cls = (result || 'unknown').toLowerCase();
    return `<span class="al-result al-result-${esc(cls)}">${esc(result || '—')}</span>`;
  }

  function riskBadge(level) {
    const cls = (level || 'none').toLowerCase();
    return `<span class="al-risk al-risk-${esc(cls)}">${esc(level || 'none')}</span>`;
  }

  function renderWorkspaceSource(data) {
    const wrap = document.getElementById('alWorkspaceSource');
    const describe = window.denjoyDescribeSourceMeta;
    if (!wrap || typeof describe !== 'function' || !data) return;
    const info = describe(data);
    wrap.innerHTML = `
      <div class="live-module-source">
        <span class="live-module-source-pill ${esc(info.className || '')}">${esc(info.label)}</span>
        <span>${esc(info.detail)}</span>
      </div>`;
  }

  function renderAlertsInfoShell() {
    const wrap = document.getElementById('alWorkspaceIntro');
    if (!wrap) return;
    const sourceNode = document.getElementById('alWorkspaceSource');
    const sourceHtml = sourceNode?.innerHTML || '';
    if (sourceNode) sourceNode.innerHTML = '';
    wrap.innerHTML = `
      <div class="workspace-info-shell">
        <div class="workspace-info-header">
          <span class="workspace-info-kicker">Beveiliging</span>
          <div class="workspace-info-title-row">
            <div>
              <h3 class="workspace-info-title">Alerts & Signalering</h3>
              <p class="workspace-info-desc">Gestandaardiseerde tenantweergave voor auditgebeurtenissen, beveiligingsscore, aanmeldingen en notificatieconfiguratie in dezelfde informatieve opbouw als de andere werkruimtes.</p>
            </div>
          </div>
          <div class="workspace-info-band">${sourceHtml}</div>
        </div>
      </div>`;
  }

  function renderAlertsOverview() {
    const wrap = document.getElementById('alServiceOverview');
    if (!wrap) return;
    const auditCount = _auditData ? (_auditData.items || []).length : '—';
    const score = _secureScore ? Number(_secureScore.currentScore ?? _secureScore.score ?? 0) : '—';
    const maxScore = _secureScore ? Number(_secureScore.maxScore || 100) : '—';
    const signIns = _signInsData ? (_signInsData.items || []).length : '—';
    const risky = _signInsData ? (_signInsData.items || []).filter((item) => String(item?.riskLevel || '').toLowerCase() !== 'none').length : '—';
    const openActions = _followUpData ? Number(_followUpData.summary?.open || 0) : '—';
    const scoreTone = Number.isFinite(score) ? (score >= 75 ? 'ok' : score >= 45 ? 'warn' : 'crit') : 'warn';
    const riskyTone = Number.isFinite(risky) ? (risky === 0 ? 'ok' : risky <= 2 ? 'warn' : 'crit') : 'warn';
    const auditTone = Number.isFinite(auditCount) ? (auditCount > 0 ? 'ok' : 'warn') : 'warn';
    const signInTone = Number.isFinite(signIns) ? (signIns > 0 ? 'ok' : 'warn') : 'warn';
    const actionTone = Number.isFinite(openActions) ? (openActions === 0 ? 'ok' : openActions <= 5 ? 'warn' : 'crit') : 'warn';
    wrap.innerHTML = `
      <div class="workspace-service-overview">
        <article class="workspace-service-card workspace-service-card--${auditTone}"><span class="workspace-service-label">Auditlog</span><strong class="workspace-service-value">${auditCount}</strong><span class="workspace-service-meta">gebeurtenissen</span></article>
        <article class="workspace-service-card workspace-service-card--${scoreTone}"><span class="workspace-service-label">Beveiligingsscore</span><strong class="workspace-service-value">${score}</strong><span class="workspace-service-meta">/ ${maxScore}</span></article>
        <article class="workspace-service-card workspace-service-card--${signInTone}"><span class="workspace-service-label">Aanmeldingen</span><strong class="workspace-service-value">${signIns}</strong><span class="workspace-service-meta">recent</span></article>
        <article class="workspace-service-card workspace-service-card--${riskyTone}"><span class="workspace-service-label">Risico</span><strong class="workspace-service-value">${risky}</strong><span class="workspace-service-meta">risicovol</span></article>
        <article class="workspace-service-card workspace-service-card--${actionTone}"><span class="workspace-service-label">Open acties</span><strong class="workspace-service-value">${openActions}</strong><span class="workspace-service-meta">opvolging</span></article>
      </div>`;
    renderAlertsInfoShell();
  }

  // ── Tab switching ──
  function switchAlTab(tab) {
    document.querySelectorAll('#alertsSection .al-tab').forEach(b => b.classList.toggle('active', b.dataset.alTab === tab));
    document.querySelectorAll('#alertsSection .al-tab-panel').forEach(p => { p.style.display = p.dataset.alPanel === tab ? '' : 'none'; });
    if (tab === 'auditlog')   loadAuditLog();
    if (tab === 'securescr')  loadSecureScore();
    if (tab === 'signins')    loadSignIns();
    if (tab === 'followup')   loadFollowUp();
    if (tab === 'config')     loadNotifConfig();
  }

  function bindAlTabs() {
    if (_tabsBound) return;
    _tabsBound = true;
    document.querySelectorAll('#alertsSection .al-tab[data-al-tab]').forEach(b => {
      b.addEventListener('click', () => switchAlTab(b.dataset.alTab));
    });
    const r = document.getElementById('alBtnRefreshAudit');
    if (r) r.addEventListener('click', () => loadAuditLog({ strictLive: true }));
    const rs = document.getElementById('alBtnRefreshScore');
    if (rs) rs.addEventListener('click', () => { _secureScore = null; loadSecureScore({ strictLive: true }); });
    const rsi = document.getElementById('alBtnRefreshSignIns');
    if (rsi) rsi.addEventListener('click', () => loadSignIns({ strictLive: true }));
    const rf = document.getElementById('alBtnRefreshFollowUp');
    if (rf) rf.addEventListener('click', () => { _followUpData = null; loadFollowUp({ strictLive: true }); });

    const followWrap = document.getElementById('alFollowUpWrap');
    if (followWrap && !followWrap._bound) {
      followWrap._bound = true;
      followWrap.addEventListener('click', (event) => {
        const statusBtn = event.target.closest('[data-action-status]');
        if (statusBtn) {
          const actionId = statusBtn.getAttribute('data-action-id') || '';
          const next = statusBtn.getAttribute('data-action-status') || '';
          updateActionStatus(actionId, next);
          return;
        }
        const createBtn = event.target.closest('[data-followup-create]');
        if (createBtn) {
          createFollowUpAction();
        }
      });
    }
  }

  // ── Audit Log ──
  function loadAuditLog(options = {}) {
    const tid = getTid(); if (!tid) return;
    const requestId = ++_requestSeq;
    const wrap = document.getElementById('alAuditWrap');
    if (!wrap) return;
    wrap.innerHTML = loading('Audit log laden…');
    apiFetch(withStrictLive(`/api/alerts/${tid}/audit-logs`, !!options.strictLive)).then(data => {
      if (requestId !== _requestSeq) return;
      renderAuditLog(data);
    })
      .catch(err => {
        if (requestId === _requestSeq) wrap.innerHTML = `<p class="al-empty">Fout: ${esc(err.message)}</p>`;
      });
  }

  function _showAlBanner(src) {
    const banner = document.getElementById('alSnapshotBanner');
    if (!banner) return;
    if (src === 'assessment_snapshot') {
      banner.style.display = '';
      banner.textContent = 'Gegevens uit laatste assessment. Live data vereist actieve verbinding.';
    } else {
      banner.style.display = 'none';
    }
  }

  function renderAuditLog(data) {
    const wrap = document.getElementById('alAuditWrap');
    const info = document.getElementById('alAuditCount');
    if (!wrap) return;
    _auditData = data;
    renderWorkspaceSource(data);
    renderAlertsOverview();
    _showAlBanner(data._source);
    if (!data.ok) { wrap.innerHTML = `<p class="al-empty">${esc(data.error || 'Fout')}</p>`; return; }
    const items = data.items || [];
    if (info) info.textContent = `${items.length} events`;
    if (!items.length) {
      const msg = data.message || 'Geen audit log events gevonden.';
      wrap.innerHTML = `<p class="al-empty">${esc(msg)}</p>`;
      return;
    }
    wrap.innerHTML = `
      <div class="al-table-wrap">
        <table class="al-table">
          <thead><tr><th>Tijdstip</th><th>Activiteit</th><th>Categorie</th><th>Resultaat</th><th>Geïnitieerd door</th><th>Doel</th></tr></thead>
          <tbody>${items.map(i => `<tr>
            <td style="white-space:nowrap">${fmtDate(i.activityDateTime)}</td>
            <td>${esc(i.activityDisplayName)}</td>
            <td>${esc(i.category || '—')}</td>
            <td>${resultBadge(i.result)}</td>
            <td>${esc(i.initiatedBy)}</td>
            <td>${esc(i.targetResources)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Secure Score ──
  function loadSecureScore(options = {}) {
    const tid = getTid(); if (!tid) return;
    if (_secureScore) { renderSecureScore(_secureScore); return; }
    const requestId = ++_requestSeq;
    const wrap = document.getElementById('alScoreWrap');
    if (!wrap) return;
    wrap.innerHTML = loading('Beveiligingsscore laden…', 'cards');
    apiFetch(withStrictLive(`/api/alerts/${tid}/secure-score`, !!options.strictLive)).then(data => {
      if (requestId !== _requestSeq) return;
      _secureScore = data;
      renderSecureScore(data);
    })
      .catch(err => {
        if (requestId === _requestSeq) wrap.innerHTML = `<p class="al-empty">Fout: ${esc(err.message)}</p>`;
      });
  }

  function renderSecureScore(data) {
    const wrap = document.getElementById('alScoreWrap');
    if (!wrap) return;
    renderWorkspaceSource(data);
    renderAlertsOverview();
    _showAlBanner(data._source);
    if (!data.ok) { wrap.innerHTML = `<p class="al-empty">${esc(data.error || 'Fout')}</p>`; return; }
    if (!data.score && data.message) { wrap.innerHTML = `<p class="al-empty">${esc(data.message)}</p>`; return; }

    const pct = data.percentage || 0;
    const circ = 2 * Math.PI * 50;
    const offset = circ - (pct / 100) * circ;
    const scoreColor = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';

    const improvRows = (data.improvements || []).map(i => `
      <div class="al-improvement-row">
        <div class="al-improvement-name">${esc(i.control)}<div class="al-improvement-cat">${esc(i.category || '')}</div></div>
        <div class="al-improvement-pct">${i.current}%</div>
      </div>`).join('');

    wrap.innerHTML = `
      <div class="al-score-wrap">
        <div class="al-score-ring-wrap">
          <svg class="al-score-ring" width="120" height="120" viewBox="0 0 120 120">
            <circle class="al-score-track" cx="60" cy="60" r="50"/>
            <circle class="al-score-fill" cx="60" cy="60" r="50"
              stroke="${scoreColor}" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
            <text x="60" y="56" class="al-score-pct-text" text-anchor="middle" dominant-baseline="middle" transform="rotate(90,60,60)">${pct}%</text>
            <text x="60" y="72" class="al-score-sub-text" text-anchor="middle" dominant-baseline="middle" transform="rotate(90,60,60)">score</text>
          </svg>
        </div>
        <div class="al-score-info">
          <div><span class="al-score-big">${data.currentScore ?? '—'}</span> <span class="al-score-max">/ ${data.maxScore ?? '—'} punten</span></div>
          <div class="al-score-updated">Bijgewerkt: ${fmtDate(data.createdAt)}</div>
          ${improvRows ? `<div class="al-improvements"><div class="al-improvements-title">Verbeterpunten</div>${improvRows}</div>` : ''}
        </div>
      </div>`;
  }

  // ── Sign-ins ──
  function loadSignIns(options = {}) {
    const tid = getTid(); if (!tid) return;
    const requestId = ++_requestSeq;
    const wrap = document.getElementById('alSignInsWrap');
    if (!wrap) return;
    wrap.innerHTML = loading('Aanmeldingen laden…');
    apiFetch(withStrictLive(`/api/alerts/${tid}/sign-ins`, !!options.strictLive)).then(data => {
      if (requestId !== _requestSeq) return;
      renderSignIns(data);
    })
      .catch(err => {
        if (requestId === _requestSeq) wrap.innerHTML = `<p class="al-empty">Fout: ${esc(err.message)}</p>`;
      });
  }

  function renderSignIns(data) {
    const wrap = document.getElementById('alSignInsWrap');
    if (!wrap) return;
    _signInsData = data;
    renderWorkspaceSource(data);
    renderAlertsOverview();
    _showAlBanner(data._source);
    if (!data.ok) { wrap.innerHTML = `<p class="al-empty">${esc(data.error || 'Fout')}</p>`; return; }
    const items = data.items || [];
    if (!items.length) {
      const msg = data.message || 'Geen aanmeldingen gevonden (P1/P2-licentie vereist voor volledige log).';
      wrap.innerHTML = `<p class="al-empty">${esc(msg)}</p>`;
      return;
    }
    wrap.innerHTML = `
      <div class="al-table-wrap">
        <table class="al-table">
          <thead><tr><th>Tijdstip</th><th>Gebruiker</th><th>App</th><th>IP / Locatie</th><th>Risico</th><th>Status</th></tr></thead>
          <tbody>${items.map(i => `<tr>
            <td style="white-space:nowrap">${fmtDate(i.createdDateTime)}</td>
            <td>${esc(i.userPrincipalName || '—')}</td>
            <td>${esc(i.appDisplayName || '—')}</td>
            <td>${esc(i.ipAddress || '—')}${i.location ? ` <span style="font-size:.75rem;color:var(--text-muted)">${esc(i.location)}</span>` : ''}</td>
            <td>${riskBadge(i.riskLevel)}</td>
            <td>${esc(i.statusDetail || (i.status === 0 ? 'Geslaagd' : `Code ${i.status}`))}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function slaBadge(item) {
    const state = String(item?.sla_state || '');
    if (state === 'overdue') return '<span class="al-risk al-risk-high">Over tijd</span>';
    if (state === 'due_soon') return '<span class="al-risk al-risk-medium">Bijna vervaldatum</span>';
    if (state === 'on_track') return '<span class="al-risk al-risk-none">Op schema</span>';
    if (state === 'closed') return '<span class="al-risk al-risk-none">Afgerond</span>';
    return '<span class="al-risk al-risk-none">Gepland</span>';
  }

  function statusBadge(status) {
    const s = String(status || 'open');
    if (s === 'open') return '<span class="al-result al-result-failure">Open</span>';
    if (s === 'in_progress') return '<span class="al-result al-result-timeout">In behandeling</span>';
    if (s === 'accepted') return '<span class="al-result al-result-success">Geaccepteerd</span>';
    if (s === 'done') return '<span class="al-result al-result-success">Gereed</span>';
    return `<span class="al-result">${esc(s)}</span>`;
  }

  function actionButtons(item) {
    const id = esc(item.id || '');
    const st = String(item.status || 'open');
    if (!id) return '—';
    if (st === 'open') {
      return `
        <button type="button" class="al-btn" data-action-id="${id}" data-action-status="in_progress">Start</button>
        <button type="button" class="al-btn" data-action-id="${id}" data-action-status="done">Gereed</button>
      `;
    }
    if (st === 'in_progress') {
      return `
        <button type="button" class="al-btn" data-action-id="${id}" data-action-status="done">Gereed</button>
        <button type="button" class="al-btn" data-action-id="${id}" data-action-status="open">Heropen</button>
      `;
    }
    return `<button type="button" class="al-btn" data-action-id="${id}" data-action-status="open">Heropen</button>`;
  }

  function renderFollowUp(data) {
    const wrap = document.getElementById('alFollowUpWrap');
    if (!wrap) return;
    _followUpData = data;
    renderAlertsOverview();
    renderWorkspaceSource(data);
    _showAlBanner(data._source);

    if (!data?.ok) {
      wrap.innerHTML = `<p class="al-empty">${esc(data?.error || 'Opvolgingsdata niet beschikbaar')}</p>`;
      return;
    }
    const items = Array.isArray(data.items) ? data.items : [];
    const summary = data.summary || {};
    wrap.innerHTML = `
      <div class="workspace-service-overview workspace-service-overview--tight">
        <article class="workspace-service-card workspace-service-card--warn"><span class="workspace-service-label">Open</span><strong class="workspace-service-value">${summary.open || 0}</strong><span class="workspace-service-meta">acties</span></article>
        <article class="workspace-service-card workspace-service-card--neutral"><span class="workspace-service-label">In behandeling</span><strong class="workspace-service-value">${summary.in_progress || 0}</strong><span class="workspace-service-meta">lopende opvolging</span></article>
        <article class="workspace-service-card workspace-service-card--crit"><span class="workspace-service-label">Over tijd</span><strong class="workspace-service-value">${summary.overdue || 0}</strong><span class="workspace-service-meta">SLA aandacht</span></article>
        <article class="workspace-service-card workspace-service-card--ok"><span class="workspace-service-label">Afgerond</span><strong class="workspace-service-value">${summary.closed || 0}</strong><span class="workspace-service-meta">done/accepted</span></article>
      </div>
      <div class="al-config-card al-config-card--full">
        <div class="al-config-title">Nieuwe opvolgactie</div>
        <div class="al-form-group"><label for="alFollowTitle">Titel</label><input id="alFollowTitle" type="text" placeholder="Bijv. Controleer forwarding mailbox X"></div>
        <div class="al-form-grid-3">
          <div class="al-form-group"><label for="alFollowSeverity">Severity</label><select id="alFollowSeverity"><option value="warning">Warning</option><option value="critical">Critical</option><option value="info">Info</option></select></div>
          <div class="al-form-group"><label for="alFollowOwner">Eigenaar</label><input id="alFollowOwner" type="text" placeholder="Naam/e-mail"></div>
          <div class="al-form-group"><label for="alFollowDue">Vervaldatum</label><input id="alFollowDue" type="date"></div>
        </div>
        <div class="al-form-group"><label for="alFollowNotes">Notities</label><textarea id="alFollowNotes" rows="2" placeholder="Context of vervolgstap"></textarea></div>
        <div class="live-module-action-row"><button type="button" class="live-module-refresh" data-followup-create="1">Actie toevoegen</button></div>
      </div>
      <div class="al-table-wrap">
        <table class="al-table">
          <thead><tr><th>Titel</th><th>Severity</th><th>Status</th><th>SLA</th><th>Owner</th><th>Vervaldatum</th><th>Actie</th></tr></thead>
          <tbody>
            ${items.length ? items.map((item) => `
              <tr>
                <td><strong>${esc(item.title || 'Actie')}</strong><div class="al-muted-mini">${esc(item.finding_key || '')}</div></td>
                <td>${riskBadge(item.severity || 'warning')}</td>
                <td>${statusBadge(item.status)}</td>
                <td>${slaBadge(item)}</td>
                <td>${esc(item.owner || '—')}</td>
                <td>${esc(item.due_date || '—')}</td>
                <td>${actionButtons(item)}</td>
              </tr>
            `).join('') : '<tr><td colspan="7" class="al-table-empty">Nog geen opvolgacties voor deze tenant.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  function loadFollowUp(options = {}) {
    const tid = getTid(); if (!tid) return;
    const requestId = ++_requestSeq;
    const wrap = document.getElementById('alFollowUpWrap');
    if (!wrap) return;
    wrap.innerHTML = loading('Opvolging laden…');
    apiFetch(withStrictLive(`/api/alerts/${tid}/follow-up`, !!options.strictLive)).then((data) => {
      if (requestId !== _requestSeq) return;
      renderFollowUp(data || { ok: false, error: 'Geen data' });
    }).catch((err) => {
      if (requestId === _requestSeq) {
        wrap.innerHTML = `<p class="al-empty">Fout: ${esc(err.message || 'Opvolging laden mislukt')}</p>`;
      }
    });
  }

  function updateActionStatus(actionId, nextStatus) {
    const tid = getTid(); if (!tid || !actionId || !nextStatus) return;
    apiFetch(`/api/actions/${encodeURIComponent(actionId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    }).then((data) => {
      if (data?.error) throw new Error(data.error);
      if (typeof window.showToast === 'function') window.showToast('Actiestatus bijgewerkt.', 'success');
      loadFollowUp();
    }).catch((err) => {
      if (typeof window.showToast === 'function') window.showToast(err.message || 'Status bijwerken mislukt.', 'error');
    });
  }

  function createFollowUpAction() {
    const tid = getTid(); if (!tid) return;
    const title = document.getElementById('alFollowTitle')?.value?.trim() || '';
    const severity = document.getElementById('alFollowSeverity')?.value || 'warning';
    const owner = document.getElementById('alFollowOwner')?.value?.trim() || '';
    const due = document.getElementById('alFollowDue')?.value || '';
    const notes = document.getElementById('alFollowNotes')?.value?.trim() || '';
    if (!title) {
      if (typeof window.showToast === 'function') window.showToast('Vul een titel in voor de opvolgactie.', 'warning');
      return;
    }
    apiFetch('/api/actions', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tid,
        title,
        severity,
        owner: owner || null,
        due_date: due || null,
        notes: notes || null,
        finding_key: `alerts:manual-${Date.now()}`,
      }),
    }).then((data) => {
      if (data?.error) throw new Error(data.error);
      if (typeof window.showToast === 'function') window.showToast('Opvolgactie aangemaakt.', 'success');
      const titleEl = document.getElementById('alFollowTitle');
      const notesEl = document.getElementById('alFollowNotes');
      if (titleEl) titleEl.value = '';
      if (notesEl) notesEl.value = '';
      loadFollowUp();
    }).catch((err) => {
      if (typeof window.showToast === 'function') window.showToast(err.message || 'Actie aanmaken mislukt.', 'error');
    });
  }

  // ── Notificatie configuratie ──
  function loadNotifConfig() {
    const tid = getTid(); if (!tid) return;
    apiFetch(`/api/alerts/${tid}/config`).then(data => {
      const cfg = data.config || {};
      const wh = document.getElementById('alWebhookUrl');
      const wt = document.getElementById('alWebhookType');
      const em = document.getElementById('alEmailAddr');
      const nc = document.getElementById('alNotifyOnCritical');
      const st = document.getElementById('alScoreThreshold');
      const sv = document.getElementById('alScoreThresholdVal');
      if (wh) wh.value = cfg.webhook_url || '';
      if (wt) wt.value = cfg.webhook_type || 'teams';
      if (em) em.value = cfg.email_addr || '';
      if (nc) nc.checked = cfg.notify_on_critical !== false && cfg.notify_on_critical !== 0;
      if (st) { st.value = cfg.score_threshold ?? 60; if (sv) sv.textContent = st.value + '%'; }
    }).catch(() => {});
  }

  function saveNotifConfig() {
    const tid = getTid(); if (!tid) return;
    const wh = document.getElementById('alWebhookUrl');
    const wt = document.getElementById('alWebhookType');
    const em = document.getElementById('alEmailAddr');
    const nc = document.getElementById('alNotifyOnCritical');
    const st = document.getElementById('alScoreThreshold');
    const res = document.getElementById('alConfigResult');
    apiFetch(`/api/alerts/${tid}/config`, {
      method: 'POST',
      body: JSON.stringify({
        webhook_url:       wh ? wh.value.trim() : '',
        webhook_type:      wt ? wt.value : 'teams',
        email_addr:        em ? em.value.trim() : '',
        notify_on_critical: nc ? nc.checked : true,
        score_threshold:   st ? parseInt(st.value, 10) : 60,
      })
    }).then(data => {
      if (res) {
        res.className = 'al-test-result ' + (data.ok ? 'al-test-result-ok' : 'al-test-result-err');
        res.textContent = data.ok ? 'Configuratie opgeslagen.' : (data.error || 'Fout');
        res.style.display = 'block';
        setTimeout(() => { res.style.display = 'none'; }, 3000);
      }
    }).catch(err => {
      if (res) { res.className = 'al-test-result al-test-result-err'; res.textContent = err.message; res.style.display = 'block'; }
    });
  }

  function testWebhook() {
    const tid = getTid(); if (!tid) return;
    const wh = document.getElementById('alWebhookUrl');
    const wt = document.getElementById('alWebhookType');
    const res = document.getElementById('alConfigResult');
    if (!wh || !wh.value.trim()) {
      if (typeof window.showToast === 'function') window.showToast('Vul eerst een webhook URL in.', 'warning');
      return;
    }
    apiFetch(`/api/alerts/${tid}/test-webhook`, {
      method: 'POST',
      body: JSON.stringify({ webhook_url: wh.value.trim(), webhook_type: wt ? wt.value : 'teams' })
    }).then(data => {
      if (res) {
        res.className = 'al-test-result ' + (data.ok ? 'al-test-result-ok' : 'al-test-result-err');
        res.textContent = data.ok ? '✓ Test bericht verzonden.' : ('Fout: ' + (data.error || 'Onbekend'));
        res.style.display = 'block';
      }
    }).catch(err => {
      if (res) { res.className = 'al-test-result al-test-result-err'; res.textContent = err.message; res.style.display = 'block'; }
    });
  }

  // ── Publieke ingang ──
  window.loadAlertsSection = function () {
    const tid = getTid();
    if (window._alLastTid !== tid) { _secureScore = null; _auditData = null; _signInsData = null; _followUpData = null; _tabsBound = false; _requestSeq = 0; window._alLastTid = tid; }
    bindAlTabs();

    // Config knopen binden
    const savBtn = document.getElementById('alBtnSaveConfig');
    if (savBtn && !savBtn._bound) { savBtn._bound = true; savBtn.addEventListener('click', saveNotifConfig); }
    const tstBtn = document.getElementById('alBtnTestWebhook');
    if (tstBtn && !tstBtn._bound) { tstBtn._bound = true; tstBtn.addEventListener('click', testWebhook); }

    const active = document.querySelector('#alertsSection .al-tab.active');
    switchAlTab(active ? active.dataset.alTab : 'auditlog');
  };
  window.switchAlertsTab = switchAlTab;
})();
