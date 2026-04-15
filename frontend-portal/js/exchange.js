/**
 * Denjoy IT Platform — Fase 9: Exchange & Email module
 * IIFE module — window.loadExchangeSection
 */
(function () {
  'use strict';

  let _mailboxes = null;
  let _rules = null;
  let _forwarding = null;
  let _tabsBound = false;
  let _searchQ = '';
  let _requestSeq = 0;

  function getTid() {
    // Probeer eerst tenantSelect, anders haal uit pill
    const s = document.getElementById('tenantSelect');
    if (s && s.value) return s.value;
    // Haal tenant-id uit pill indien mogelijk
    const pill = document.getElementById('tenantPill');
    if (pill && pill.dataset && pill.dataset.tenantId) {
      if (s) s.value = pill.dataset.tenantId;
      return pill.dataset.tenantId;
    }
    return '';
  }
  function getSessionToken() {
    return sessionStorage.getItem('denjoy_token')
      || localStorage.getItem('denjoy_token')
      || localStorage.getItem('denjoy_auth_token')
      || '';
  }
  function esc(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtDate(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleString('nl-NL'); } catch(_) { return iso; } }
  function initials(name) { if (!name) return '?'; return name.split(' ').filter(Boolean).map(w => w[0]).slice(0,2).join('').toUpperCase(); }
  function mailboxStatusMeta(value) {
    if (value === true) return { cls: 'active', label: 'Actief', tone: 'ok' };
    if (value === false) return { cls: 'disabled', label: 'Uitgeschakeld', tone: 'crit' };
    return { cls: 'neutral', label: 'Onbekend', tone: 'warn' };
  }

  function mailboxMatchKeys(mailbox) {
    return [mailbox?.id, mailbox?.mail, mailbox?.primarySmtpAddress, mailbox?.upn, mailbox?.userPrincipalName]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
  }

  function getExchangeControlContext() {
    return (typeof window !== 'undefined' && window.__denjoyExchangeMailboxContext && typeof window.__denjoyExchangeMailboxContext === 'object')
      ? window.__denjoyExchangeMailboxContext
      : (_mailboxes && typeof _mailboxes === 'object' ? _mailboxes : null);
  }

  function findMailboxControlItems(mailbox) {
    const controls = getExchangeControlContext()?._controls || {};
    const keys = new Set(mailboxMatchKeys(mailbox));
    const find = (controlKey) => {
      const items = Array.isArray(controls?.[controlKey]?.items) ? controls[controlKey].items : [];
      return items.filter((item) => (item?.affected_objects || []).some((entry) => keys.has(String(entry || '').trim().toLowerCase())));
    };
    return {
      forwarding: find('mail-forwarding-detection'),
      rules: find('inbox-rule-risk-detection'),
      permissions: find('mailbox-permission-governance'),
    };
  }

  function apiFetch(url, opts = {}) {
    const method = String(opts.method || 'GET').toUpperCase();
    if (method === 'GET' && typeof window.apiFetchCached === 'function') {
      return window.apiFetchCached(url, opts, window.CACHE_TTL ? window.CACHE_TTL.mailboxes : 120000);
    }
    const token = getSessionToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (token && method !== 'GET') headers['X-CSRF-Token'] = token;
    return fetch(url, { credentials: 'include', headers, ...opts }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      return data;
    });
  }

  function apiFetchCached(url, opts, ttlMs) {
    if (typeof window.apiFetchCached === 'function') {
      return window.apiFetchCached(url, opts || {}, ttlMs || (window.CACHE_TTL ? window.CACHE_TTL.mailboxes : 120000));
    }
    const get = window.cacheGet; const set = window.cacheSet;
    const ttl = ttlMs || (window.CACHE_TTL ? window.CACHE_TTL.mailboxes : 120000);
    if (get) { const hit = get(url); if (hit !== null) return Promise.resolve(hit); }
    return apiFetch(url, opts).then(data => { if (data !== null && set) set(url, data, ttl); return data; });
  }

  function withStrictLive(url, forceRefresh = false) {
    if (!forceRefresh) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}strict_live=1&refresh=${Date.now()}`;
  }

  function loading(msg, type = 'lines') {
    if (type === 'table' && window.skeletonTable) return `<tr><td colspan="5">${window.skeletonCards(3)}</td></tr>`;
    if (type === 'lines' && window.skeletonLines) return window.skeletonLines(4);
    return `<div class="ex-loading"><div class="ex-spinner"></div><span>${esc(msg)}</span></div>`;
  }

  function renderWorkspaceSource(data) {
    const wrap = document.getElementById('exWorkspaceSource');
    const describe = window.denjoyDescribeSourceMeta;
    if (!wrap || typeof describe !== 'function' || !data) return;
    const info = describe(data);
    wrap.innerHTML = `
      <div class="live-module-source">
        <span class="live-module-source-pill ${esc(info.className || '')}">${esc(info.label)}</span>
        <span>${esc(info.detail)}</span>
      </div>`;
  }

  function renderExchangeOverview() {
    const wrap = document.getElementById('exServiceOverview');
    if (!wrap) return;
    const mailboxCount = _mailboxes ? Number(_mailboxes.count || (_mailboxes.mailboxes || []).length || 0) : '—';
    const forwardingCount = _forwarding ? Number(_forwarding.count || (_forwarding.forwarding || []).length || 0) : '—';
    const rulesCount = _rules ? Number(_rules.total || (_rules.rules || []).length || 0) : '—';
    const suspiciousCount = _rules ? Number(_rules.suspicious || 0) : '—';
    wrap.innerHTML = `
      <div class="workspace-service-overview">
        <article class="workspace-service-card workspace-service-card--${Number(mailboxCount) > 0 ? 'ok' : 'warn'}"><span class="workspace-service-label">Mailboxen</span><strong class="workspace-service-value">${mailboxCount}</strong><span class="workspace-service-meta">tenantbreed</span></article>
        <article class="workspace-service-card workspace-service-card--${Number(forwardingCount) === 0 ? 'ok' : Number(forwardingCount) <= 2 ? 'warn' : 'crit'}"><span class="workspace-service-label">Doorstuurregels</span><strong class="workspace-service-value">${forwardingCount}</strong><span class="workspace-service-meta">actief</span></article>
        <article class="workspace-service-card workspace-service-card--${Number(rulesCount) > 0 ? 'ok' : 'warn'}"><span class="workspace-service-label">Regels</span><strong class="workspace-service-value">${rulesCount}</strong><span class="workspace-service-meta">inboxregels</span></article>
        <article class="workspace-service-card workspace-service-card--${Number(suspiciousCount) === 0 ? 'ok' : Number(suspiciousCount) <= 2 ? 'warn' : 'crit'}"><span class="workspace-service-label">Verdacht</span><strong class="workspace-service-value">${suspiciousCount}</strong><span class="workspace-service-meta">controle vereist</span></article>
      </div>`;
  }

  // ── Tab switching ──
  function switchExTab(tab) {
    document.querySelectorAll('#exchangeSection .ex-tab').forEach(b => b.classList.toggle('active', b.dataset.exTab === tab));
    document.querySelectorAll('#exchangeSection .ex-tab-panel').forEach(p => { p.style.display = p.dataset.exPanel === tab ? '' : 'none'; });
    if (tab === 'mailboxen'   && !_mailboxes)  loadMailboxes();
    if (tab === 'forwarding'  && !_forwarding) loadForwarding();
    if (tab === 'regels'      && !_rules)      loadRules();
  }

  function bindExTabs() {
    if (_tabsBound) return;
    _tabsBound = true;
    document.querySelectorAll('#exchangeSection .ex-tab[data-ex-tab]').forEach(b => {
      b.addEventListener('click', () => switchExTab(b.dataset.exTab));
    });
    const r = document.getElementById('exBtnRefreshMbx');
    if (r) r.addEventListener('click', () => { _mailboxes = null; loadMailboxes(true); });
    const rf = document.getElementById('exBtnRefreshFwd');
    if (rf) rf.addEventListener('click', () => { _forwarding = null; loadForwarding(true); });
    const rr = document.getElementById('exBtnRefreshRules');
    if (rr) rr.addEventListener('click', () => { _rules = null; loadRules(true); });
    const search = document.getElementById('exSearchInput');
    if (search) search.addEventListener('input', e => { _searchQ = e.target.value.toLowerCase(); renderMailboxes(_mailboxes); });

    const tbody = document.getElementById('exMailboxTableBody');
    if (tbody && !tbody.dataset.bound) {
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', (e) => {
        const detailBtn = e.target.closest('[data-detail]');
        if (!detailBtn) return;
        openMailboxDetail(detailBtn.dataset.detail);
      });
    }
  }

  // ── Mailboxen ──
  function loadMailboxes(forceRefresh = false) {
    const tid = getTid(); if (!tid) return;
    const requestId = ++_requestSeq;
    const wrap = document.getElementById('exMailboxTableBody');
    if (!wrap) return;
    wrap.innerHTML = `<tr><td colspan="5" class="ex-table-empty">${loading('Mailboxen laden…', 'table')}</td></tr>`;
    const url = withStrictLive(`/api/exchange/${tid}/mailboxes`, forceRefresh);
    const fetcher = forceRefresh
      ? apiFetch(url, { method: 'GET' })
      : apiFetchCached(url, {}, window.CACHE_TTL ? window.CACHE_TTL.mailboxes : 120000);
    fetcher
      .then(data => {
        if (requestId !== _requestSeq) return;
        _mailboxes = data;
        renderMailboxes(data);
      })
      .catch(err => {
        if (requestId === _requestSeq) wrap.innerHTML = `<tr><td colspan="5" class="ex-table-empty">Fout: ${esc(err.message)}</td></tr>`;
      });
  }

  function renderMailboxes(data) {
    const tbody = document.getElementById('exMailboxTableBody');
    const info = document.getElementById('exMbxCount');
    if (!tbody) return;
    renderWorkspaceSource(data);
    renderExchangeOverview();
    if (!data || !data.ok) { tbody.innerHTML = `<tr><td colspan="5" class="ex-table-empty">${esc(data?.error || 'Fout')}</td></tr>`; return; }
    let mbx = data.mailboxes || [];
    if (_searchQ) mbx = mbx.filter(m => `${m.displayName || ''}${m.upn || ''}${m.mail || m.primarySmtpAddress || ''}`.toLowerCase().includes(_searchQ));
    if (info) info.textContent = `${mbx.length} mailboxen`;
    if (!mbx.length) { tbody.innerHTML = '<tr><td colspan="5" class="ex-table-empty">Geen mailboxen gevonden.</td></tr>'; return; }
    tbody.innerHTML = mbx.map(m => {
      const status = mailboxStatusMeta(m.accountEnabled);
      const syncBadge = m.onPremSync ? '<span class="ex-badge ex-badge-sync">Synchronisatie</span> ' : '';
      const replyBadge = m.autoReplyEnabled ? '<span class="ex-badge ex-badge-warn">Automatisch antwoord</span> ' : '';
      const primaryEmail = m.mail || m.primarySmtpAddress || '—';
      const primaryUpn = m.upn || m.userPrincipalName || primaryEmail;
      return `<tr data-uid="${esc(m.id)}">
        <td>
          <div class="ex-mailbox-cell">
            <div class="ex-mailbox-avatar">${esc(initials(m.displayName))}</div>
            <div>
              <div class="ex-name-strong">${esc(m.displayName)}</div>
              <div class="ex-mail-address ex-mail-address--muted" title="${esc(primaryUpn)}">${esc(primaryUpn)}</div>
            </div>
          </div>
        </td>
        <td><span class="ex-mail-address" title="${esc(primaryEmail)}">${esc(primaryEmail)}</span></td>
        <td><span class="ex-badge ex-badge-${esc(status.cls)}">${esc(status.label)}</span> ${syncBadge}${replyBadge}</td>
        <td>${esc(m.timezone || '—')}</td>
        <td><button class="ex-btn u-btn-xs-tight" data-detail="${esc(m.id)}">Meer info</button></td>
      </tr>`;
    }).join('');
  }

  function _mailboxDetailHtml(m) {
    const isSnapshot = m._source === 'assessment_snapshot';
    const controlItems = findMailboxControlItems(m);
    const permissionEvidence = controlItems.permissions[0]?.evidence || {};
    const permissionCount = Number(permissionEvidence.permissionCount || 0);
    const inboxRuleSummary = controlItems.rules.map((item) => item.summary).filter(Boolean).join(' · ');
    const forwardingSummary = controlItems.forwarding.map((item) => item.summary).filter(Boolean).join(' · ');
    const forwardingEnabled = !!(m.forwarding && m.forwarding.enabled);
    const forwardingAddress = m.forwarding?.address || '—';
    const status = mailboxStatusMeta(m.accountEnabled);
    const statusLabel = status.label;
    const displayName = m.displayName || m.mail || m.upn || 'Mailbox';
    const heroHtml = `
      <section class="dp-hero dp-hero--${forwardingEnabled ? 'error' : (m.accountEnabled === false ? 'warn' : m.accountEnabled === true ? 'good' : 'neutral')}">
        <div class="dp-hero-avatar">${esc(initials(displayName))}</div>
        <div class="dp-hero-copy">
          <h4>${esc(displayName)}</h4>
          <p>${esc(m.mail || m.upn || 'Geen e-mailadres beschikbaar')}</p>
          <div class="dp-hero-badges">
            <span class="dp-inline-status dp-inline-status--${forwardingEnabled ? 'error' : (status.tone === 'crit' ? 'error' : status.tone)}">${forwardingEnabled ? 'Doorsturen actief' : statusLabel}</span>
            ${m.recipientTypeDetails ? `<span class="dp-inline-status dp-inline-status--neutral">${esc(m.recipientTypeDetails)}</span>` : ''}
            ${isSnapshot ? `<span class="dp-inline-status dp-inline-status--warn">Assessment</span>` : `<span class="dp-inline-status dp-inline-status--good">Live data</span>`}
          </div>
        </div>
      </section>`;
    if (typeof window.renderSideRailTemplate === 'function') {
      return heroHtml + window.renderSideRailTemplate({
          tone: forwardingEnabled ? 'error' : (status.tone === 'crit' ? 'warn' : status.tone),
          statusLabel: forwardingEnabled ? 'Controle nodig' : (status.label === 'Actief' ? 'In orde' : status.label),
          summaryCards: [
            { label: 'Status', value: statusLabel || 'Onbekend', meta: m.recipientTypeDetails || 'mailbox', tone: status.tone },
            { label: 'Doorsturen', value: forwardingEnabled ? 'Actief' : 'Geen', meta: forwardingEnabled ? forwardingAddress : 'geen actieve regel', tone: forwardingEnabled ? 'error' : 'good' },
            { label: 'Auto reply', value: esc(m.autoReply?.status || 'disabled'), meta: 'mailflow', tone: String(m.autoReply?.status || 'disabled').toLowerCase() === 'disabled' ? 'neutral' : 'warn' },
            { label: 'Bron', value: isSnapshot ? 'Assessment' : 'Live', meta: isSnapshot ? 'laatste scan' : 'actieve verbinding', tone: isSnapshot ? 'warn' : 'good' },
        ],
        sections: [
          {
            title: 'Mailbox informatie',
            badge: statusLabel || 'Mailbox',
            tone: status.tone,
            bodyHtml: `
              <div class="ex-detail-grid">
                <div class="ex-detail-item"><label>E-mail</label><span>${esc(m.mail || '—')}</span></div>
                <div class="ex-detail-item"><label>UPN</label><span>${esc(m.upn || '—')}</span></div>
                <div class="ex-detail-item"><label>Afdeling</label><span>${esc(m.department || '—')}</span></div>
                <div class="ex-detail-item"><label>Functie</label><span>${esc(m.jobTitle || '—')}</span></div>
                <div class="ex-detail-item"><label>Tijdzone</label><span>${esc(m.timezone || '—')}</span></div>
                <div class="ex-detail-item"><label>Taal</label><span>${esc(m.language || '—')}</span></div>
                <div class="ex-detail-item"><label>Mobiel</label><span>${esc(m.mobile || '—')}</span></div>
                <div class="ex-detail-item"><label>Kantoor</label><span>${esc(m.office || '—')}</span></div>
                ${m.recipientTypeDetails ? `<div class="ex-detail-item"><label>Type</label><span>${esc(m.recipientTypeDetails)}</span></div>` : ''}
                ${m.whenCreated ? `<div class="ex-detail-item"><label>Aangemaakt</label><span>${fmtDate(m.whenCreated)}</span></div>` : ''}
              </div>`,
          },
          {
            title: 'Governance signalen',
            badge: permissionCount > 0 ? 'Actie nodig' : 'In orde',
            tone: permissionCount > 0 ? 'warn' : 'good',
            bodyHtml: `
              <div class="ex-detail-grid">
                <div class="ex-detail-item"><label>Mailboxrechten</label><span>${esc(String(permissionCount || 0))}</span></div>
                <div class="ex-detail-item"><label>Full Access</label><span>${esc(String(permissionEvidence.fullAccessCount || 0))}</span></div>
                <div class="ex-detail-item"><label>Send As</label><span>${esc(String(permissionEvidence.sendAsCount || 0))}</span></div>
                <div class="ex-detail-item"><label>Send on Behalf</label><span>${esc(String(permissionEvidence.sendOnBehalfCount || 0))}</span></div>
                <div class="ex-detail-item"><label>Inboxregels</label><span>${esc(String(controlItems.rules.length || 0))}</span></div>
                <div class="ex-detail-item"><label>Doorsturen</label><span>${esc(String(controlItems.forwarding.length || 0))}</span></div>
              </div>`,
          },
        ],
        findings: [
          ...(forwardingEnabled ? [{
            tone: 'error',
            label: 'Fout',
            title: 'Doorsturen actief',
            body: `E-mail wordt doorgestuurd naar ${forwardingAddress}. Controleer of dit gewenst en veilig is.`,
          }] : [{
            tone: 'good',
            label: 'Goed',
            title: 'Geen actieve doorstuurregel',
            body: 'Er is geen actieve forwarding op deze mailbox gevonden.',
          }]),
          ...(controlItems.forwarding.length && !forwardingEnabled ? [{
            tone: 'warn',
            label: 'Let op',
            title: 'Forwarding-signaal in controle',
            body: forwardingSummary || 'Deze mailbox kwam naar voren in de forwardingcontrole en verdient extra controle.',
          }] : []),
          ...(controlItems.rules.length ? [{
            tone: 'warn',
            label: 'Aandacht',
            title: 'Inboxregels met risico',
            body: inboxRuleSummary || 'Voor deze mailbox zijn één of meer inboxregels met verhoogd risico gevonden.',
          }] : []),
          ...(permissionCount > 0 ? [{
            tone: permissionCount > 3 ? 'error' : 'warn',
            label: permissionCount > 3 ? 'Fout' : 'Let op',
            title: 'Mailboxrechten governance',
            body: `${permissionCount} extra machtiging(en) gedetecteerd. Full Access: ${permissionEvidence.fullAccessCount || 0}, Send As: ${permissionEvidence.sendAsCount || 0}, Send on Behalf: ${permissionEvidence.sendOnBehalfCount || 0}.`,
          }] : [{
            tone: 'good',
            label: 'Goed',
            title: 'Geen verhoogde mailboxrechten',
            body: 'Er zijn geen extra mailboxmachtigingen met verhoogd risico gedetecteerd.',
          }]),
          ...(String(m.autoReply?.status || 'disabled').toLowerCase() !== 'disabled' ? [{
            tone: 'warn',
            label: 'Let op',
            title: 'Automatisch antwoord actief',
            body: `Automatisch antwoord staat op ${esc(m.autoReply?.status || 'enabled')}.`,
          }] : []),
        ],
        actions: [
          {
            title: 'Mailboxcontrole',
            body: forwardingEnabled
              ? 'Controleer de doorstuurregel, valideer de bestemming en verwijder de regel als die niet verwacht is.'
              : permissionCount > 0 || controlItems.rules.length
                ? 'Controleer aanvullende mailboxrechten en inboxregels, en trek overbodige delegaties of verdachte regels in.'
                : 'Controleer alleen aanvullende mailboxrechten of inboxregels als daar aanleiding voor is.',
          },
        ],
        notes: isSnapshot ? [{ tone: 'warn', body: 'Gegevens komen uit de laatste assessment-run. Live mailboxdetails kunnen uitgebreider zijn.' }] : [],
      });
    }
    return heroHtml + '<p class="ex-empty">Geen detailtemplate beschikbaar.</p>';
  }

  function _renderMailboxDetailModal(overlay, m) {
    // Verouderd pad — stuurt nu naar het Inzichten-paneel
    if (typeof window.updateSideRailDetail === 'function') {
      window.updateSideRailDetail(m.displayName || 'Mailbox', _mailboxDetailHtml(m));
    }
  }

  function _cachedMailbox(uid) {
    const target = String(uid || '').toLowerCase();
    return (_mailboxes?.mailboxes || []).find(m => [m.id, m.primarySmtpAddress, m.mail, m.upn].some(value => String(value || '').toLowerCase() === target));
  }

  function openMailboxDetail(uid) {
    const tid = getTid(); if (!tid) return;

    const cached = _cachedMailbox(uid);
    const fallbackName = cached?.displayName || uid;

    // Open het Inzichten-paneel direct
    if (typeof window.openSideRailDetail === 'function') {
      window.openSideRailDetail('Mailbox', fallbackName);
    }

    // Uit assessment snapshot? Direct renderen zonder round-trip
    if (cached && _mailboxes?._source === 'assessment_snapshot') {
      _renderMailboxDetailModal(null, {
        ok: true,
        displayName: cached.displayName,
        mail: cached.mail || cached.primarySmtpAddress || uid,
        upn: cached.upn || cached.primarySmtpAddress || uid,
        department: cached.department || null,
        jobTitle: cached.jobTitle || null,
        office: cached.office || null,
        mobile: cached.mobile || null,
        timezone: cached.timezone || null,
        language: cached.language || null,
        accountEnabled: cached.accountEnabled,
        recipientTypeDetails: cached.recipientTypeDetails || null,
        whenCreated: cached.whenCreated || null,
        autoReply: { status: cached.autoReplyEnabled ? 'enabled' : 'disabled' },
        forwarding: cached.forwarding || { enabled: false, address: null },
        _source: _mailboxes?._source || 'assessment_snapshot',
      });
      return;
    }

    const fallbackData = cached ? { ok: true, displayName: cached.displayName, mail: cached.mail || cached.primarySmtpAddress || uid, upn: cached.upn || uid, department: cached.department || null, jobTitle: cached.jobTitle || null, office: cached.office || null, mobile: cached.mobile || null, timezone: cached.timezone || null, language: cached.language || null, accountEnabled: cached.accountEnabled, recipientTypeDetails: cached.recipientTypeDetails, whenCreated: cached.whenCreated, autoReply: { status: cached.autoReplyEnabled ? 'enabled' : 'disabled' }, forwarding: cached.forwarding || { enabled: false }, _source: _mailboxes?._source || 'assessment_snapshot' } : null;

    apiFetch(`/api/exchange/${tid}/mailboxes/${uid}`).then(data => {
      if (!data.ok) {
        if (fallbackData) _renderMailboxDetailModal(null, fallbackData);
        else if (typeof window.updateSideRailDetail === 'function') window.updateSideRailDetail('Fout', `<p class="ex-empty">${esc(data.error || 'Fout')}</p>`);
        return;
      }
      _renderMailboxDetailModal(null, data);
    }).catch(err => {
      if (fallbackData) _renderMailboxDetailModal(null, fallbackData);
      else if (typeof window.updateSideRailDetail === 'function') window.updateSideRailDetail('Fout', `<p class="ex-empty">Fout: ${esc(err.message)}</p>`);
    });
  }

  // ── Forwarding ──
  function loadForwarding(forceRefresh = false) {
    const tid = getTid(); if (!tid) return;
    const requestId = ++_requestSeq;
    const wrap = document.getElementById('exFwdWrap');
    if (!wrap) return;
    wrap.innerHTML = loading('Doorstuurregels laden…');
    apiFetch(withStrictLive(`/api/exchange/${tid}/forwarding`, forceRefresh)).then(data => {
      if (requestId !== _requestSeq) return;
      _forwarding = data;
      renderForwarding(data);
    })
      .catch(err => {
        if (requestId === _requestSeq) wrap.innerHTML = `<p class="ex-empty">Fout: ${esc(err.message)}</p>`;
      });
  }

  function renderForwarding(data) {
    const wrap = document.getElementById('exFwdWrap');
    const info = document.getElementById('exFwdCount');
    if (!wrap) return;
    renderWorkspaceSource(data);
    renderExchangeOverview();
    if (!data.ok) { wrap.innerHTML = `<p class="ex-empty">${esc(data.error || 'Fout')}</p>`; return; }
    const fwd = data.forwarding || [];
    if (info) info.textContent = `${fwd.length} actieve doorstuurregels`;
    if (!fwd.length) { wrap.innerHTML = '<div class="ex-fwd-empty">✓ Geen actieve e-mail-doorstuurregels gevonden.</div>'; return; }
    wrap.innerHTML = `
      <div class="ex-fwd-banner">⚠ ${fwd.length} mailbox(en) met actieve doorstuurregels — controleer of dit gewenst is.</div>
      <div class="ex-table-wrap">
        <table class="ex-table">
          <thead><tr><th>Gebruiker</th><th>UPN</th><th>Doorstuurt naar</th></tr></thead>
          <tbody>${fwd.map(f => `<tr>
            <td>${esc(f.displayName)}</td>
            <td>${esc(f.upn)}</td>
            <td><span class="ex-fwd-alert">⚠ ${esc(f.forwardTo)}</span></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Inbox regels ──
  function loadRules(forceRefresh = false) {
    const tid = getTid(); if (!tid) return;
    const requestId = ++_requestSeq;
    const wrap = document.getElementById('exRulesWrap');
    if (!wrap) return;
    wrap.innerHTML = loading('Inbox regels analyseren (kan even duren)…');
    apiFetch(withStrictLive(`/api/exchange/${tid}/mailbox-rules`, forceRefresh)).then(data => {
      if (requestId !== _requestSeq) return;
      _rules = data;
      renderRules(data);
    })
      .catch(err => {
        if (requestId === _requestSeq) wrap.innerHTML = `<p class="ex-empty">Fout: ${esc(err.message)}</p>`;
      });
  }

  function renderRules(data) {
    const wrap = document.getElementById('exRulesWrap');
    const info = document.getElementById('exRulesCount');
    if (!wrap) return;
    renderWorkspaceSource(data);
    renderExchangeOverview();
    if (!data.ok) { wrap.innerHTML = `<p class="ex-empty">${esc(data.error || 'Fout')}</p>`; return; }
    const rules = data.rules || [];
    if (info) info.textContent = `${rules.length} regels (${data.suspicious || 0} verdacht)`;
    if (!rules.length) { wrap.innerHTML = `<p class="ex-empty">Geen inbox regels gevonden (${data.usersChecked || 0} mailboxen gecontroleerd).</p>`; return; }

    const suspicious = rules.filter(r => r.suspicious);
    const normal = rules.filter(r => !r.suspicious);

    wrap.innerHTML = `
      ${suspicious.length ? `
        <div class="ex-fwd-banner">⚠ ${suspicious.length} verdachte regel(s) gevonden — controleer direct.</div>
        <div class="ex-table-wrap" style="margin-bottom:1rem">
          <table class="ex-table">
            <thead><tr><th>Gebruiker</th><th>Regelsnaam</th><th>Melding</th><th>Actief</th><th>Doorstuurt naar</th></tr></thead>
            <tbody>${suspicious.map(r => `<tr>
              <td>${esc(r.userName)}<div style="font-size:.75rem;color:var(--text-muted)">${esc(r.userUpn)}</div></td>
              <td>${esc(r.ruleName)}</td>
              <td>${r.flags.map(f => `<span class="ex-rule-suspicious">⚠ ${esc(f)}</span>`).join(' ')}</td>
              <td>${r.enabled ? '✓' : '—'}</td>
              <td>${esc(r.forwardTo || '—')}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>` : ''}
      ${normal.length ? `
        <details>
          <summary style="cursor:pointer;font-size:.875rem;color:var(--text-muted);margin-bottom:.5rem">
            ${normal.length} normale regel(s) tonen
          </summary>
          <div class="ex-table-wrap">
            <table class="ex-table">
              <thead><tr><th>Gebruiker</th><th>Regelsnaam</th><th>Actief</th></tr></thead>
              <tbody>${normal.map(r => `<tr>
                <td>${esc(r.userName)}<div style="font-size:.75rem;color:var(--text-muted)">${esc(r.userUpn)}</div></td>
                <td>${esc(r.ruleName)}</td>
                <td>${r.enabled ? '✓' : '—'}</td>
              </tr>`).join('')}</tbody>
            </table>
          </div>
        </details>` : ''}`;
  }

  // ── Publieke ingang ──
  window.loadExchangeSection = function () {
    // Synchroniseer tenantSelect met tenantPill indien nodig
    const pill = document.getElementById('tenantPill');
    const s = document.getElementById('tenantSelect');
    if (pill && pill.dataset && pill.dataset.tenantId && s) {
      s.value = pill.dataset.tenantId;
    }
    const tid = getTid();
    if (window._exLastTid !== tid) { _mailboxes = _rules = _forwarding = null; _tabsBound = false; _searchQ = ''; _requestSeq = 0; window._exLastTid = tid; }
    bindExTabs();
    const active = document.querySelector('#exchangeSection .ex-tab.active');
    switchExTab(active ? active.dataset.exTab : 'mailboxen');
  };
  window.switchExchangeTab = switchExTab;
  window.openExchangeMailboxDetail = openMailboxDetail;
})();
