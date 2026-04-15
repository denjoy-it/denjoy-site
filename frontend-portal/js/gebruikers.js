/**
 * Denjoy IT Platform — Gebruikersbeheer module (Fase 2)
 * User management: overzicht, provisioning wizard, offboarding wizard,
 * gebruiker detail panel.
 */
(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────

  let _users        = [];
  let _licenses     = [];
  let _filterStatus = 'all';   // 'all' | 'enabled' | 'disabled' | 'guest'
  let _searchQ      = '';
  let _loadingUsers = false;
  let _usersSource  = 'live';
  let _userCountsOverride = null;
  let _guestGovernance = null;
  let _currentCapability = null;
  const USERS_LICENSES_V2 = true;
  const GB_V2_PANEL_ORDER = ['overzicht', 'gebruikers', 'licenties', 'risicos', 'geschiedenis'];
  let _activeGbPanel = USERS_LICENSES_V2 ? 'overzicht' : 'gebruikers';
  let _openGbPanels = new Set([_activeGbPanel]);

  function isReadOnlyViewer() {
    return (typeof window.getCurrentUserRole === 'function' ? window.getCurrentUserRole() : 'klant') === 'klant';
  }

  // ── API helper ───────────────────────────────────────────────────────────

  function gbApiFetch(url, opts = {}) {
    const token = localStorage.getItem('denjoy_token') || localStorage.getItem('denjoy_auth_token') || '';
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, Object.assign({}, opts, { headers })).then((r) => {
      if (!r.ok) return r.json().then((e) => Promise.reject(e.error || r.statusText));
      return r.json();
    });
  }

  function getTenantId() {
    if (typeof window.currentTenantId !== 'undefined') return window.currentTenantId;
    const sel = document.getElementById('tenantSelect');
    return sel ? sel.value : null;
  }

  // ── Weergave helpers ─────────────────────────────────────────────────────

  function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('nl-NL'); } catch { return iso; }
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toFiniteNumber(value) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isGuestUser(user) {
    const userType = String(user?.userType || '').toLowerCase();
    const upn = String(user?.userPrincipalName || '').toLowerCase();
    return userType === 'guest' || upn.includes('#ext#');
  }

  function isEnabledUser(user) {
    const raw = user?.accountEnabled;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw !== 0;
    const text = String(raw ?? '').trim().toLowerCase();
    if (!text) return true;
    if (['false', '0', 'no', 'nee', 'disabled', 'uitgeschakeld', 'inactive', 'inactief'].includes(text)) return false;
    if (['true', '1', 'yes', 'ja', 'enabled', 'actief', 'active'].includes(text)) return true;
    return true;
  }

  function pickCount(source, keys) {
    if (!source || typeof source !== 'object') return null;
    for (const key of keys) {
      const value = toFiniteNumber(source[key]);
      if (value != null) return value;
    }
    return null;
  }

  function normalizeUserCounts(rawCounts) {
    const counts = rawCounts && typeof rawCounts === 'object' ? rawCounts : {};
    return {
      total: pickCount(counts, ['total', 'users', 'userCount', 'total_users', 'totalUsers']),
      active: pickCount(counts, ['active', 'enabled', 'active_users', 'enabled_users', 'activeUsers']),
      disabled: pickCount(counts, ['disabled', 'disabled_users', 'inactive', 'inactive_users', 'disabledUsers']),
      guest: pickCount(counts, ['guest', 'guests', 'guest_users', 'guestUsers', 'external_users', 'externalUsers']),
    };
  }

  function getComputedUserSummary() {
    const computedTotal = _users.length;
    const computedActive = _users.filter((u) => isEnabledUser(u)).length;
    const computedDisabled = computedTotal - computedActive;
    const computedGuests = _users.filter((u) => isGuestUser(u)).length;
    const controlGuests = toFiniteNumber(_guestGovernance?.summary?.total);
    return {
      total: Number.isFinite(_userCountsOverride?.total) ? _userCountsOverride.total : computedTotal,
      active: Number.isFinite(_userCountsOverride?.active) ? _userCountsOverride.active : computedActive,
      disabled: Number.isFinite(_userCountsOverride?.disabled) ? _userCountsOverride.disabled : computedDisabled,
      guests: Number.isFinite(_userCountsOverride?.guest)
        ? _userCountsOverride.guest
        : (Number.isFinite(controlGuests) ? Math.max(controlGuests, computedGuests) : computedGuests),
    };
  }

  function updateText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function updateInsightCardValue(selector, value, meta, source, statusLabel, tone) {
    const card = document.querySelector(selector);
    if (!card) return;
    const valueEl = card.querySelector('strong');
    const metaEl = card.querySelector('.gb-insight-meta');
    const sourceEl = card.querySelector('.gb-insight-source');
    const statusEl = card.querySelector('.gb-insight-status');
    if (valueEl) valueEl.textContent = String(value);
    if (metaEl && meta != null) metaEl.textContent = String(meta);
    if (sourceEl && source != null) sourceEl.textContent = String(source);
    if (statusEl && statusLabel != null) {
      statusEl.textContent = String(statusLabel);
      statusEl.classList.remove('status-good', 'status-warn', 'status-error');
      statusEl.classList.add(`status-${tone}`);
    }
    card.classList.remove('status-good', 'status-warn', 'status-error');
    card.classList.add(`status-${tone}`);
  }

  function setInsightStatus(cardKey, tone, label, sourceLabel) {
    const card = document.querySelector(`.gb-insight-card${cardKey ? `[data-gb-insight="${cardKey.section}"]${cardKey.filter ? `[data-gb-filter="${cardKey.filter}"]` : ''}` : ''}`);
    const statusEl = document.getElementById(cardKey.statusId);
    const sourceEl = document.getElementById(cardKey.sourceId);
    if (card) {
      card.classList.remove('status-good', 'status-warn', 'status-error');
      card.classList.add(`status-${tone}`);
    }
    if (statusEl) {
      statusEl.textContent = label;
      statusEl.classList.remove('status-good', 'status-warn', 'status-error');
      statusEl.classList.add(`status-${tone}`);
    }
    if (sourceEl && sourceLabel) sourceEl.textContent = sourceLabel;
  }

  function chip(label, tone) {
    return `<span class="gb-wc-chip gb-wc-chip--${tone}">${escHtml(label)}</span>`;
  }

  function renderGbWorkCardMeta() {
    const summary = getComputedUserSummary();

    // Count chips for gebruikers workcard toggle
    const usersCounts = document.getElementById('gbCardUsersCounts');
    if (usersCounts) {
      const chips = [];
      chips.push(chip(`${summary.total} accounts`, 'neutral'));
      if (summary.disabled > 0) chips.push(chip(`${summary.disabled} uitgeschakeld`, summary.disabled > 2 ? 'error' : 'warn'));
      if (summary.guests > 0) chips.push(chip(`${summary.guests} gasten`, summary.guests > 5 ? 'warn' : 'neutral'));
      usersCounts.innerHTML = chips.join('');
      const usersCard = document.querySelector('.gb-workcard[data-gb-card="gebruikers"]');
      if (usersCard) usersCard.dataset.tone = summary.disabled > 2 ? 'error' : summary.disabled > 0 ? 'warn' : 'good';
    }

    // Count chips for licenties workcard toggle
    const licCounts = document.getElementById('gbCardLicentiesCounts');
    if (licCounts) {
      licCounts.innerHTML = _licenses.length
        ? chip(`${_licenses.length} licenties`, 'ok')
        : chip('Nog niet geladen', 'neutral');
    }

    const overviewCounts = document.getElementById('gbCardOverzichtCounts');
    if (overviewCounts) {
      const cards = [];
      cards.push(chip(`${summary.total} accounts`, 'neutral'));
      cards.push(chip(`${summary.active} actief`, summary.active > 0 ? 'ok' : 'neutral'));
      if (summary.disabled > 0) cards.push(chip(`${summary.disabled} uit`, summary.disabled > 2 ? 'error' : 'warn'));
      overviewCounts.innerHTML = cards.join('');
    }

    const riskSummary = buildRiskSummary();
    const riskCounts = document.getElementById('gbCardRisicosCounts');
    if (riskCounts) {
      const chips = [];
      chips.push(chip(`${riskSummary.total} signalen`, riskSummary.total ? 'warn' : 'ok'));
      if (riskSummary.critical) chips.push(chip(`${riskSummary.critical} kritiek`, 'error'));
      if (riskSummary.warning) chips.push(chip(`${riskSummary.warning} waarschuwing`, 'warn'));
      riskCounts.innerHTML = chips.join('');
      const riskCard = document.querySelector('.gb-workcard[data-gb-card="risicos"]');
      if (riskCard) riskCard.dataset.tone = riskSummary.critical ? 'error' : riskSummary.warning ? 'warn' : 'good';
    }
  }

  function buildRiskSummary() {
    const disabledWithLicense = _users.filter((u) => !isEnabledUser(u) && Number(u.licenseCount || 0) > 0).length;
    const mfaMissing = _users.filter((u) => {
      if (!isEnabledUser(u) || isGuestUser(u)) return false;
      if (typeof u.mfaRegistered === 'boolean') return !u.mfaRegistered;
      if (Array.isArray(u.mfaMethods)) return u.mfaMethods.length === 0;
      return false;
    }).length;
    const highUtilLicenses = _licenses.filter((l) => {
      const enabled = Number(l.enabled || 0);
      const consumed = Number(l.consumed || 0);
      return enabled > 0 && (consumed / enabled) >= 0.9;
    }).length;
    const guestUsers = _users.filter((u) => isGuestUser(u)).length;
    const warning = Number(disabledWithLicense > 0) + Number(guestUsers > 0) + Number(highUtilLicenses > 0);
    const critical = Number(mfaMissing > 0) + Number(highUtilLicenses >= 2);
    return {
      disabledWithLicense,
      mfaMissing,
      highUtilLicenses,
      guestUsers,
      warning,
      critical,
      total: disabledWithLicense + mfaMissing + highUtilLicenses + (guestUsers > 10 ? 1 : 0),
    };
  }

  function renderOverviewPanel() {
    const host = document.getElementById('gbOverviewGrid');
    if (!host) return;
    const summary = getComputedUserSummary();
    const mfaKnown = _users.filter((u) => typeof u.mfaRegistered === 'boolean').length;
    const mfaOk = _users.filter((u) => {
      if (typeof u.mfaRegistered === 'boolean') return !!u.mfaRegistered;
      if (Array.isArray(u.mfaMethods)) return u.mfaMethods.length > 0;
      return false;
    }).length;
    const mfaCoverage = mfaKnown ? Math.round((mfaOk / mfaKnown) * 100) : null;
    const licEnabled = _licenses.reduce((acc, l) => acc + Number(l.enabled || 0), 0);
    const licConsumed = _licenses.reduce((acc, l) => acc + Number(l.consumed || 0), 0);
    const licFree = Math.max(0, licEnabled - licConsumed);
    const cards = [
      { label: 'Totaal gebruikers', value: summary.total, meta: `${summary.active} actief`, tone: 'good' },
      { label: 'Gastaccounts', value: summary.guests, meta: summary.guests ? 'Externe toegang actief' : 'Geen gastaccounts', tone: summary.guests > 10 ? 'warn' : 'good' },
      { label: 'MFA dekking', value: mfaCoverage == null ? '—' : `${mfaCoverage}%`, meta: mfaKnown ? `${mfaKnown} beoordeeld` : 'Nog geen live MFA-status', tone: mfaCoverage == null ? 'warn' : mfaCoverage < 85 ? 'warn' : 'good' },
      { label: 'Licenties toegewezen', value: licConsumed || 0, meta: `${licFree} beschikbaar`, tone: licFree === 0 && licEnabled > 0 ? 'warn' : 'good' },
    ];
    host.innerHTML = cards.map((card) => `
      <article class="gb-overview-stat gb-overview-stat--${escHtml(card.tone)}">
        <strong>${escHtml(String(card.value))}</strong>
        <span>${escHtml(card.label)}</span>
        <small>${escHtml(card.meta)}</small>
      </article>`).join('');

    const actionsHost = document.getElementById('gbOverviewActions');
    if (!actionsHost) return;
    const risk = buildRiskSummary();
    const actions = [];
    if (risk.mfaMissing > 0) actions.push({ key: 'users', filter: 'enabled', tone: 'error', text: `${risk.mfaMissing} actieve gebruikers zonder bevestigde MFA` });
    if (risk.disabledWithLicense > 0) actions.push({ key: 'users', filter: 'disabled', tone: 'warn', text: `${risk.disabledWithLicense} uitgeschakelde accounts met licentie` });
    if (risk.highUtilLicenses > 0) actions.push({ key: 'licenties', tone: 'warn', text: `${risk.highUtilLicenses} licentie(s) bijna vol` });
    if (!actions.length) actions.push({ key: 'users', filter: 'all', tone: 'good', text: 'Geen directe risico-signalen. Controleer periodiek de details.' });
    actionsHost.innerHTML = actions.map((item) => `
      <button type="button" class="gb-overview-action gb-overview-action--${escHtml(item.tone)}"
        data-gb-overview-target="${escHtml(item.key)}"
        data-gb-overview-filter="${escHtml(item.filter || '')}">
        ${escHtml(item.text)}
      </button>`).join('');

    actionsHost.querySelectorAll('[data-gb-overview-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.gbOverviewTarget || 'gebruikers';
        const filter = btn.dataset.gbOverviewFilter || '';
        if (target === 'licenties') {
          switchGbTab('licenties');
          return;
        }
        switchGbTab('gebruikers');
        if (filter) applyQuickUserFilter(filter);
      });
    });
  }

  function renderRisksPanel() {
    const tbody = document.getElementById('gbRisksBody');
    const counter = document.getElementById('gbRiskCount');
    if (!tbody) return;
    const risk = buildRiskSummary();
    const items = [];
    if (risk.mfaMissing > 0) {
      items.push({ tone: 'error', title: 'MFA ontbreekt', detail: `${risk.mfaMissing} actieve accounts zonder bevestigde MFA`, action: 'Open gebruikers', panel: 'gebruikers', filter: 'enabled' });
    }
    if (risk.disabledWithLicense > 0) {
      items.push({ tone: 'warn', title: 'Licentie op uitgeschakeld account', detail: `${risk.disabledWithLicense} accounts hebben nog een toegewezen licentie`, action: 'Filter uitgeschakeld', panel: 'gebruikers', filter: 'disabled' });
    }
    if (risk.highUtilLicenses > 0) {
      items.push({ tone: 'warn', title: 'Licenties bijna vol', detail: `${risk.highUtilLicenses} licentieprofielen zitten boven 90% gebruik`, action: 'Open licenties', panel: 'licenties', filter: '' });
    }
    if (risk.guestUsers > 10) {
      items.push({ tone: 'warn', title: 'Veel gastaccounts', detail: `${risk.guestUsers} gastgebruikers actief in deze tenant`, action: 'Open gastenfilter', panel: 'gebruikers', filter: 'guest' });
    }
    if (_usersSource === 'assessment_snapshot') {
      items.push({ tone: 'warn', title: 'Snapshotbron actief', detail: 'Live data ontbreekt. Verifieer signalen met een live verversing.', action: 'Live scan', panel: 'gebruikers', filter: 'all' });
    }

    if (counter) counter.textContent = `${items.length} signaal${items.length !== 1 ? 'en' : ''}`;
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="gb-table-empty">Geen risico’s gedetecteerd in de huidige dataset.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map((item) => `
      <tr>
        <td><span class="gb-status gb-status-${item.tone === 'error' ? 'disabled' : 'enabled'}"><span class="gb-dot"></span>${item.tone === 'error' ? 'Kritiek' : 'Waarschuwing'}</span></td>
        <td><strong>${escHtml(item.title)}</strong></td>
        <td>${escHtml(item.detail)}</td>
        <td><button type="button" class="gb-btn gb-btn-secondary" data-gb-risk-panel="${escHtml(item.panel)}" data-gb-risk-filter="${escHtml(item.filter)}">${escHtml(item.action)}</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('[data-gb-risk-panel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panel = btn.dataset.gbRiskPanel || 'gebruikers';
        const filter = btn.dataset.gbRiskFilter || '';
        switchGbTab(panel);
        if (panel === 'gebruikers' && filter) applyQuickUserFilter(filter);
        if (btn.textContent === 'Live scan') loadUsers({ strictLive: true });
      });
    });
  }

  function renderGbInsights() {
    const summary = getComputedUserSummary();
    const sourceLabel = _usersSource === 'live'
      ? 'Live data'
      : _usersSource === 'assessment_snapshot'
        ? 'Assessment'
        : 'Bron onbekend';
    const totalTone = summary.total > 0 && _usersSource === 'live' ? 'good' : summary.total > 0 ? 'warn' : 'error';
    const disabledTone = summary.disabled === 0 ? 'good' : summary.disabled <= 2 ? 'warn' : 'error';
    const guestsTone = summary.guests === 0 ? 'good' : summary.guests <= 5 ? 'warn' : 'error';
    const licensesTone = _licenses.length ? 'good' : (_currentCapability && _currentCapability.status === 'not_implemented') ? 'error' : 'warn';
    updateText('gbInsightTotalValue', summary.total);
    updateText('gbInsightDisabledValue', summary.disabled);
    updateText('gbInsightGuestsValue', summary.guests);
    updateText('gbInsightLicensesValue', _licenses.length || '—');
    updateText('gbInsightTotalMeta', summary.total ? `${summary.active} actief in de huidige tenant` : 'Nog geen gebruikersdata beschikbaar');
    updateText('gbInsightDisabledMeta', summary.disabled ? 'Open gefilterde lijst met uitgeschakelde accounts' : 'Geen uitgeschakelde accounts gevonden');
    updateText('gbInsightGuestsMeta', summary.guests ? 'Open de lijst met externe accounts en controleer toegang' : 'Geen externe accounts gevonden');
    updateText('gbInsightLicensesMeta', _licenses.length ? 'Open licentie-overzicht en klik door naar gekoppelde gebruikers' : 'Licentie-overzicht nog niet geladen of niet beschikbaar');

    updateInsightCardValue(
      '.gb-insight-card[data-gb-insight="gebruikers"][data-gb-filter="all"]',
      summary.total,
      summary.total ? `${summary.active} actief in de huidige tenant` : 'Nog geen gebruikersdata beschikbaar',
      sourceLabel,
      summary.total > 0 && _usersSource === 'live' ? 'Goed' : summary.total > 0 ? 'Let op' : 'Fout',
      totalTone,
    );
    updateInsightCardValue(
      '.gb-insight-card[data-gb-insight="gebruikers"][data-gb-filter="disabled"]',
      summary.disabled,
      summary.disabled ? 'Open gefilterde lijst met uitgeschakelde accounts' : 'Geen uitgeschakelde accounts gevonden',
      'Accountstatus',
      summary.disabled === 0 ? 'Goed' : summary.disabled <= 2 ? 'Let op' : 'Fout',
      disabledTone,
    );
    updateInsightCardValue(
      '.gb-insight-card[data-gb-insight="gebruikers"][data-gb-filter="guest"]',
      summary.guests,
      summary.guests ? 'Open de lijst met externe accounts en controleer toegang' : 'Geen externe accounts gevonden',
      'Externe toegang',
      summary.guests === 0 ? 'Goed' : summary.guests <= 5 ? 'Let op' : 'Fout',
      guestsTone,
    );
    updateInsightCardValue(
      '.gb-insight-card[data-gb-insight="licenties"]',
      _licenses.length || '—',
      _licenses.length ? 'Open licentie-overzicht en klik door naar gekoppelde gebruikers' : 'Licentie-overzicht nog niet geladen of niet beschikbaar',
      _licenses.length ? 'Live data' : 'Licenties',
      _licenses.length ? 'Goed' : (_currentCapability && _currentCapability.status === 'not_implemented') ? 'Fout' : 'Let op',
      licensesTone,
    );
    setInsightStatus(
      { section: 'gebruikers', filter: 'all', statusId: 'gbInsightTotalStatus', sourceId: 'gbInsightTotalSource' },
      totalTone,
      summary.total > 0 && _usersSource === 'live' ? 'Goed' : summary.total > 0 ? 'Let op' : 'Fout',
      sourceLabel,
    );
    setInsightStatus(
      { section: 'gebruikers', filter: 'disabled', statusId: 'gbInsightDisabledStatus', sourceId: 'gbInsightDisabledSource' },
      disabledTone,
      summary.disabled === 0 ? 'Goed' : summary.disabled <= 2 ? 'Let op' : 'Fout',
      'Accountstatus',
    );
    setInsightStatus(
      { section: 'gebruikers', filter: 'guest', statusId: 'gbInsightGuestsStatus', sourceId: 'gbInsightGuestsSource' },
      guestsTone,
      summary.guests === 0 ? 'Goed' : summary.guests <= 5 ? 'Let op' : 'Fout',
      'Externe toegang',
    );
    setInsightStatus(
      { section: 'licenties', statusId: 'gbInsightLicensesStatus', sourceId: 'gbInsightLicensesSource' },
      licensesTone,
      _licenses.length ? 'Goed' : (_currentCapability && _currentCapability.status === 'not_implemented') ? 'Fout' : 'Let op',
      _licenses.length ? 'Live data' : 'Licenties',
    );
    renderGbWorkCardMeta();
    window.renderSidebarMetrics?.();
  }

  function getCapabilitySubsection(tab) {
    const map = {
      gebruikers: 'users',
      licenties: 'licenses',
      geschiedenis: 'history',
    };
    return map[tab] || 'users';
  }

  async function renderCapabilityBanner(tab, forceRefresh = false) {
    const tid = getTenantId();
    const wrap = document.getElementById('gbCapabilityBanner');
    if (!wrap || !tid || typeof window.denjoyFetchCapabilityStatus !== 'function' || typeof window.denjoyDescribeCapabilityStatus !== 'function') {
      if (wrap) wrap.innerHTML = '';
      return null;
    }
    try {
      const capability = await window.denjoyFetchCapabilityStatus(tid, 'gebruikers', getCapabilitySubsection(tab), { forceRefresh });
      _currentCapability = capability;
      const info = window.denjoyDescribeCapabilityStatus(capability);
      const roles = (capability.extra_roles || []).slice(0, 3).join(', ');
      wrap.innerHTML = `
        <div class="live-module-source">
          <span class="live-module-source-pill ${escHtml(info.className || '')}">${escHtml(info.label)}</span>
          <span>${escHtml(info.detail)}</span>
        </div>
        <div class="gb-capability-meta">${escHtml(roles || 'Geen extra rollen gespecificeerd')}</div>`;
      const liveButtons = ['gbBtnLiveScan', 'gbBtnRefresh', 'gbBtnRefreshLic']
        .map((id) => document.getElementById(id))
        .filter(Boolean);
      const blocked = capability.status === 'config_required' || capability.status === 'not_implemented' || !capability.supports_live;
      liveButtons.forEach((btn) => { btn.disabled = blocked; });
      return capability;
    } catch (_) {
      wrap.innerHTML = '';
      return null;
    }
  }

  function renderOverviewStats() {
    const { total, active, disabled, guests } = getComputedUserSummary();
    updateText('gbStatTotal', total);
    updateText('gbStatActive', active);
    updateText('gbStatDisabled', disabled);
    updateText('gbStatGuests', guests);
    renderGbInsights();
    renderOverviewPanel();
    renderRisksPanel();
  }

  function applyReadOnlyState() {
    const readOnly = isReadOnlyViewer();
    const newBtn = document.getElementById('gbBtnNieuw');
    if (newBtn) {
      newBtn.style.display = readOnly ? 'none' : '';
      newBtn.disabled = readOnly;
    }
    const banner = document.getElementById('gbSnapshotBanner');
    if (readOnly && banner && !banner.textContent) {
      banner.style.display = '';
      if (USERS_LICENSES_V2) {
        banner.className = 'snapshot-banner gb-status-banner gb-status-banner--warn';
        banner.innerHTML = `<span class="gb-status-banner-dot"></span><span>Read-only modus actief: wijzigingen zijn uitgeschakeld.</span>`;
      } else {
        banner.textContent = 'Read-only modus: gebruikers en licenties zijn inzichtelijk, maar wijzigingen zijn uitgeschakeld voor dit account.';
      }
    }
  }

  function setSnapshotBanner(message, tone = 'warn') {
    const banner = document.getElementById('gbSnapshotBanner');
    if (!banner) return;
    if (!message) {
      banner.style.display = 'none';
      banner.textContent = '';
      return;
    }
    banner.style.display = '';
    if (USERS_LICENSES_V2) {
      const normalizedTone = ['good', 'warn', 'error'].includes(tone) ? tone : 'warn';
      banner.className = `snapshot-banner gb-status-banner gb-status-banner--${normalizedTone}`;
      banner.innerHTML = `<span class="gb-status-banner-dot"></span><span>${escHtml(String(message))}</span>`;
      return;
    }
    banner.className = 'snapshot-banner';
    banner.textContent = String(message);
  }

  function applySourceState() {
    const disabledFilter = document.querySelector('.gb-filter-tab[data-filter="disabled"]');
    if (!disabledFilter) return;

    const isSnapshot = _usersSource === 'assessment_snapshot';
    disabledFilter.disabled = false;
    disabledFilter.title = isSnapshot
      ? 'Filtert op de status uit de laatst bekende assessment- of live data.'
      : '';
  }

  function renderGuestGovernanceBanner() {
    const banner = document.getElementById('gbSnapshotBanner');
    if (!banner || !_guestGovernance || _filterStatus !== 'guest') return;
    const total = Number(_guestGovernance?.summary?.total || 0) || 0;
    const critical = Number(_guestGovernance?.summary?.critical || 0) || 0;
    const warning = Number(_guestGovernance?.summary?.warning || 0) || 0;
    const sourceLabel = _guestGovernance.source === 'live'
      ? 'live data'
      : _guestGovernance.source === 'assessment_snapshot'
        ? 'assessment'
        : 'onbekende bron';
    banner.style.display = '';
    if (!total) {
      banner.innerHTML = `<span>Gastgebruikers governance geeft momenteel geen aanvullende signalen terug (${escHtml(sourceLabel)}).</span>`;
      return;
    }
    const tone = critical > 0 ? 'error' : warning > 0 ? 'warn' : 'good';
    const items = Array.isArray(_guestGovernance.items) ? _guestGovernance.items : [];
    const statusBadge = (status) => {
      const cls = status === 'critical' ? 'gb-badge-crit' : status === 'warning' ? 'gb-badge-warn' : 'gb-badge-ok';
      const label = status === 'critical' ? 'Kritiek' : status === 'warning' ? 'Aandacht' : 'OK';
      return `<span class="gb-tag ${escHtml(cls)}">${label}</span>`;
    };
    banner.className = `snapshot-banner snapshot-banner--${tone}`;
    banner.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:${items.length ? '.75rem' : '0'}">
        <div>
          <strong>Gastgebruikers governance</strong> · ${escHtml(String(total))} account(s),
          ${critical > 0 ? `<strong>${escHtml(String(critical))} kritiek</strong>, ` : ''}
          ${warning > 0 ? `${escHtml(String(warning))} aandachtspunt(en), ` : ''}
          bron: ${escHtml(sourceLabel)}.
        </div>
      </div>
      ${items.length ? `
        <div class="assessment-table-wrap" style="margin-top:.5rem">
          <table class="assessment-table" style="font-size:.8125rem">
            <thead>
              <tr><th>Account</th><th>Samenvatting</th><th>Status</th><th>Aanbeveling</th></tr>
            </thead>
            <tbody>
              ${items.slice(0, 50).map((item) => `
                <tr>
                  <td><strong>${escHtml(item.title || '—')}</strong></td>
                  <td>${escHtml(item.summary || '—')}</td>
                  <td>${statusBadge(item.status)}</td>
                  <td style="font-size:.75rem;color:var(--text-muted)">${escHtml(item.recommended_action || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  }

  function loadGuestGovernance(options = {}) {
    const tid = getTenantId();
    if (!tid || !window.API?.controls?.get) return Promise.resolve(null);
    const url = window.API.controls.get(tid, 'guest-user-governance', !!options.strictLive);
    return gbApiFetch(url)
      .then((data) => {
        _guestGovernance = data;
        renderOverviewStats();
        if (_filterStatus === 'guest') renderGuestGovernanceBanner();
        return data;
      })
      .catch(() => null);
  }

  // ── Hoofd render: gebruikerstabel ────────────────────────────────────────

  function renderUsersTable() {
    const tbody = document.getElementById('gbUserTableBody');
    const info  = document.getElementById('gbUserCount');
    if (!tbody) return;

    let filtered = _users;
    if (_filterStatus === 'enabled')  filtered = filtered.filter((u) => isEnabledUser(u));
    if (_filterStatus === 'disabled') filtered = filtered.filter((u) => !isEnabledUser(u));
    if (_filterStatus === 'guest') filtered = filtered.filter((u) => isGuestUser(u));
    if (_searchQ) {
      const q = _searchQ.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          (u.displayName || '').toLowerCase().includes(q) ||
          (u.userPrincipalName || '').toLowerCase().includes(q) ||
          (u.department || '').toLowerCase().includes(q) ||
          (u.jobTitle || '').toLowerCase().includes(q)
      );
    }

    if (info) {
      const total = _users.length;
      const shown = filtered.length;
      info.textContent = shown === total ? `${total} gebruiker${total !== 1 ? 's' : ''}` : `${shown} van ${total}`;
    }

    const paging = window.paginateCollection ? window.paginateCollection('gbUsersMain', filtered, 50) : { items: filtered, total: filtered.length };
    const pageItems = paging.items || filtered;

    if (filtered.length === 0) {
      const snapshotDisabledMessage = _usersSource === 'assessment_snapshot' && (_filterStatus === 'disabled' || _filterStatus === 'guest')
        ? (_filterStatus === 'guest'
          ? 'Gastgebruikers zijn niet volledig betrouwbaar in assessment snapshotdata. Gebruik live data via Verversen.'
          : 'Uitgeschakelde gebruikers zijn niet beschikbaar in assessment snapshotdata. Gebruik live data via Verversen.')
        : null;
      tbody.innerHTML = `<tr><td colspan="6" class="gb-table-empty">${
        snapshotDisabledMessage || _searchQ || _filterStatus !== 'all'
          ? (snapshotDisabledMessage || 'Geen gebruikers gevonden voor deze filter.')
          : 'Geen gebruikers geladen. Klik op Verversen.'
      }</td></tr>`;
      window.renderCollectionPager?.({ key: 'gbUsersMain', anchor: tbody, total: 0, pageSize: 50, onChange: () => renderUsersTable(), label: 'gebruikers' });
      return;
    }

    tbody.innerHTML = pageItems.map((u) => {
      const enabled = isEnabledUser(u);
      const statusHtml = enabled
        ? `<span class="gb-status gb-status-enabled"><span class="gb-dot"></span>Actief</span>`
        : `<span class="gb-status gb-status-disabled"><span class="gb-dot"></span>Uitgeschakeld</span>`;
      const licHtml = u.licenseCount
        ? `<span class="gb-lic-count has-lic">${u.licenseCount}</span>`
        : `<span class="gb-lic-count">0</span>`;
      const lastSign = u.lastSignIn ? fmtDate(u.lastSignIn) : '—';

      return `<tr data-uid="${escHtml(u.id)}" data-upn="${escHtml(u.userPrincipalName)}">
        <td>
          <div class="gb-user-cell">
            <div class="gb-avatar">${initials(u.displayName)}</div>
            <div>
              <div class="gb-user-name">${escHtml(u.displayName)}</div>
              <div class="gb-user-upn">${escHtml(u.userPrincipalName)}</div>
            </div>
          </div>
        </td>
        <td>${escHtml(u.department || '—')}</td>
        <td>${escHtml(u.jobTitle || '—')}</td>
        <td>${statusHtml}</td>
        <td>${licHtml}</td>
        <td>
          <div class="gb-row-actions">
            <button class="gb-btn gb-btn-ghost gb-btn-detail" data-uid="${escHtml(u.id)}" data-name="${escHtml(u.displayName)}">Detail</button>
            ${enabled && !isReadOnlyViewer()
              ? `<button class="gb-btn gb-btn-ghost gb-btn-danger gb-btn-offboard" data-uid="${escHtml(u.id)}" data-upn="${escHtml(u.userPrincipalName)}" data-name="${escHtml(u.displayName)}">Offboard</button>`
              : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    // Rij klikken → detail
    tbody.querySelectorAll('tr[data-uid]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.gb-row-actions')) return;
        openDetailPanel(row.dataset.uid, row.dataset.upn);
      });
    });
    tbody.querySelectorAll('.gb-btn-detail').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openDetailPanel(btn.dataset.uid, btn.dataset.name); });
    });
    tbody.querySelectorAll('.gb-btn-offboard').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openOffboardWizard(btn.dataset.uid, btn.dataset.upn, btn.dataset.name); });
    });
    window.renderCollectionPager?.({ key: 'gbUsersMain', anchor: tbody, total: filtered.length, pageSize: 50, onChange: () => renderUsersTable(), label: 'gebruikers' });
  }

  // ── Gebruikers laden ─────────────────────────────────────────────────────

  function loadUsers(options = {}) {
    const tid = getTenantId();
    if (!tid) { showStatus('Selecteer eerst een tenant.'); return; }
    if (_loadingUsers) return;
    _loadingUsers = true;
    const strictLive = !!options.strictLive;
    const previousUsers = Array.isArray(_users) ? [..._users] : [];
    const previousSource = _usersSource;
    const previousCounts = _userCountsOverride ? { ..._userCountsOverride } : null;

    const tbody = document.getElementById('gbUserTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="gb-loading">Gebruikers laden...</td></tr>`;
    const btnLiveScan = document.getElementById('gbBtnLiveScan');
    const btnRefresh = document.getElementById('gbBtnRefresh');
    const setLoadingButtons = (isLoading) => {
      if (btnLiveScan) {
        btnLiveScan.disabled = isLoading;
        btnLiveScan.textContent = isLoading ? 'Live scan...' : 'Live scan';
      }
      if (btnRefresh) btnRefresh.disabled = isLoading;
    };
    setLoadingButtons(true);
    if (strictLive) setSnapshotBanner('Gerichte live scan voor gebruikers wordt uitgevoerd...', 'warn');

    const url = strictLive ? `${API.m365.users(tid)}?strict_live=1` : API.m365.users(tid);
    gbApiFetch(url)
      .then((data) => {
        _users = data.users || [];
        _usersSource = data._source || 'live';
        _userCountsOverride = normalizeUserCounts(data.counts);
        renderOverviewStats();
        applySourceState();
        if (data._source === 'assessment_snapshot') {
          const info = document.getElementById('gbUserCount');
          if (info) info.title = 'Data uit laatste assessment — klik Vernieuwen voor live data';
          setSnapshotBanner('Gegevens uit laatste assessment. Live data vereist actieve verbinding.', 'warn');
        } else {
          if (strictLive) {
            setSnapshotBanner('Gerichte live scan voor gebruikers succesvol afgerond.', 'good');
          } else {
            setSnapshotBanner('');
          }
        }
        renderUsersTable();
        renderGuestGovernanceBanner();
        if (strictLive || !_guestGovernance) loadGuestGovernance({ strictLive });
        if (!_licenses.length) loadLicenses(tid);
        if (strictLive && typeof showToast === 'function') showToast('Live scan voor gebruikers afgerond.', 'success');
      })
      .catch((err) => {
        _users = strictLive ? previousUsers : [];
        _usersSource = strictLive ? previousSource : 'live';
        _userCountsOverride = strictLive ? previousCounts : null;
        renderOverviewStats();
        applySourceState();
        setSnapshotBanner(
          strictLive
            ? `Gerichte live scan voor gebruikers mislukt: ${String(err)}`
            : `Fout: ${String(err)}`,
          'error',
        );
        if (strictLive) {
          renderUsersTable();
          renderGuestGovernanceBanner();
        } else if (tbody) {
          tbody.innerHTML = `<tr><td colspan="6" class="gb-table-empty">Fout: ${escHtml(String(err))}</td></tr>`;
        }
        if (strictLive && typeof showToast === 'function') showToast(String(err), 'error');
      })
      .finally(() => {
        _loadingUsers = false;
        setLoadingButtons(false);
      });
  }

  function loadLicenses(tid) {
    return gbApiFetch(API.m365.licenses(tid))
      .then((data) => { _licenses = data.licenses || []; renderGbInsights(); return _licenses; })
      .catch(() => { _licenses = []; renderGbInsights(); return []; });
  }

  function findCachedUser(userId, fallbackName) {
    return _users.find((u) =>
      u.id === userId ||
      u.userPrincipalName === userId ||
      u.userPrincipalName === fallbackName ||
      u.displayName === fallbackName
    ) || null;
  }

  // ── Detail panel ─────────────────────────────────────────────────────────

  function openDetailPanel(userId, fallbackName) {
    const tid = getTenantId();
    if (!tid) return;
    const cachedUser = findCachedUser(userId, fallbackName);

    // Open het Inzichten-paneel
    if (typeof window.openSideRailDetail === 'function') {
      window.openSideRailDetail('Gebruiker', fallbackName || userId);
    }

    gbApiFetch(API.m365.user(tid, userId))
      .then((data) => {
        const isSnapshot = data._source === 'assessment_snapshot';
        const u = Object.assign({}, cachedUser || {}, data.user || {});
        const licenses = Array.isArray(u.licenses) ? u.licenses : [];
        const licChips = licenses.map((l) => `<span class="gb-chip gb-chip-lic">${escHtml(l)}</span>`).join('');
        const mfaMethods = u.mfaMethods || [];
        const mfaChips = mfaMethods.map((m) => `<span class="gb-chip gb-chip-mfa">${escHtml(m)}</span>`).join('');
        const mfaMissing = mfaMethods.length === 0;
        const grpList = u.groups || [];
        const grpChips = grpList.slice(0, 8).map((g) => `<span class="gb-chip gb-chip-grp">${escHtml(g)}</span>`).join('') +
          (grpList.length > 8 ? `<span class="gb-chip">+${grpList.length - 8}</span>` : '');
        const grpEmpty = isSnapshot
          ? '<span style="color:var(--text-muted)" title="Groepslidmaatschap is niet beschikbaar in de snapshot. Stel app-authenticatie in voor live data.">Niet beschikbaar in snapshot</span>'
          : '<span style="color:var(--text-muted)">Geen groepen</span>';
        const isEnabled = !!u.accountEnabled;
        const isGuest = String(u.userType || '').toLowerCase() === 'guest' || String(u.userPrincipalName || '').toLowerCase().includes('#ext#');
        const roleTone = isEnabled ? 'good' : 'error';
        const mfaTone = mfaMissing ? (isSnapshot ? 'warn' : 'error') : 'good';
        const groupTone = grpList.length > 0 ? 'good' : (isSnapshot ? 'warn' : 'neutral');
        const offboardBtn = u.accountEnabled
          && !isReadOnlyViewer()
          ? `<button class="gb-btn gb-btn-danger" id="gbRailOffboardBtn" style="width:100%">Offboard gebruiker</button>`
          : '';
        const bodyHtml = typeof window.renderSideRailTemplate === 'function'
          ? window.renderSideRailTemplate({
              tone: !isEnabled ? 'error' : mfaTone,
              statusLabel: !isEnabled ? 'Geblokkeerd' : mfaMissing ? (isSnapshot ? 'Snapshot' : 'Actie nodig') : 'In orde',
              summaryCards: [
                { label: 'Status', value: isEnabled ? 'Actief' : 'Uitgeschakeld', meta: isGuest ? 'gastaccount' : 'interne gebruiker', tone: roleTone },
                { label: 'MFA', value: mfaMethods.length ? `${mfaMethods.length} methode${mfaMethods.length !== 1 ? 'n' : ''}` : 'Niet ingesteld', meta: isSnapshot ? 'snapshotbron' : 'live controle', tone: mfaTone },
                { label: 'Licenties', value: licenses.length || '0', meta: licenses.length ? 'toegewezen' : 'geen toewijzing', tone: licenses.length ? 'good' : 'warn' },
                { label: 'Groepen', value: grpList.length || '0', meta: isSnapshot ? 'mogelijk onvolledig' : 'lidmaatschappen', tone: groupTone },
              ],
              sections: [
                {
                  title: 'Account informatie',
                  badge: isEnabled ? 'Actief' : 'Uitgeschakeld',
                  tone: roleTone,
                  bodyHtml: `
                    <div class="gb-detail-grid">
                      <div class="gb-detail-item"><div class="gb-detail-key">UPN</div><div class="gb-detail-val" style="word-break:break-all">${escHtml(u.userPrincipalName || '—')}</div></div>
                      <div class="gb-detail-item"><div class="gb-detail-key">Functie</div><div class="gb-detail-val">${escHtml(u.jobTitle || '—')}</div></div>
                      <div class="gb-detail-item"><div class="gb-detail-key">Afdeling</div><div class="gb-detail-val">${escHtml(u.department || '—')}</div></div>
                      <div class="gb-detail-item"><div class="gb-detail-key">Locatie</div><div class="gb-detail-val">${escHtml(u.officeLocation || '—')}</div></div>
                      <div class="gb-detail-item"><div class="gb-detail-key">Taal</div><div class="gb-detail-val">${escHtml(u.preferredLanguage || '—')}</div></div>
                      <div class="gb-detail-item"><div class="gb-detail-key">Aangemaakt</div><div class="gb-detail-val">${fmtDate(u.createdDateTime)}</div></div>
                      <div class="gb-detail-item"><div class="gb-detail-key">On-Prem sync</div><div class="gb-detail-val">${u.onPremisesSyncEnabled ? 'Ja' : 'Nee'}</div></div>
                    </div>`,
                },
                {
                  title: 'Toegang & memberships',
                  badge: mfaMissing ? 'Nazien' : 'Compleet',
                  tone: mfaTone,
                  bodyHtml: `
                    <div class="gb-detail-item"><div class="gb-detail-key">Licenties</div><div class="gb-chip-list">${licChips || '<span style="color:var(--text-muted)">Geen licenties</span>'}</div></div>
                    <div class="gb-detail-item" style="margin-top:.7rem"><div class="gb-detail-key">MFA methoden</div><div class="gb-chip-list">${mfaChips || '<span style="color:var(--text-muted)">Geen MFA geregistreerd</span>'}</div></div>
                    <div class="gb-detail-item" style="margin-top:.7rem"><div class="gb-detail-key">Groepen (top 8)</div><div class="gb-chip-list">${grpChips || grpEmpty}</div></div>`,
                },
              ],
              findings: [
                ...(mfaMissing ? [{
                  tone: isSnapshot ? 'warn' : 'error',
                  label: isSnapshot ? 'Snapshot' : 'Kritiek',
                  title: 'MFA ontbreekt',
                  body: isSnapshot ? 'MFA kon niet volledig live worden bevestigd vanuit de assessment-snapshot.' : 'Deze gebruiker heeft geen geregistreerde MFA-methode en vraagt directe opvolging.',
                }] : []),
                ...(!isEnabled ? [{
                  tone: 'good',
                  label: 'Goed',
                  title: 'Account al uitgeschakeld',
                  body: 'Het account is al geblokkeerd voor aanmelding en vormt minder direct risico.',
                }] : []),
                ...(isSnapshot ? [{
                  tone: 'warn',
                  label: 'Let op',
                  title: 'Snapshotbron actief',
                  body: 'Groepslidmaatschap en sommige live kenmerken kunnen onvolledig zijn totdat live app-auth actief is.',
                }] : []),
              ],
              actions: [
                {
                  title: u.accountEnabled ? 'Herstel- of offboardactie' : 'Controleer vervolgstap',
                  body: u.accountEnabled
                    ? 'Start offboarding als deze gebruiker weg moet, of controleer MFA en groepsrechten als het account actief blijft.'
                    : 'Controleer of licenties en groepsrechten ook al zijn opgeschoond voor dit account.',
                  actionHtml: offboardBtn,
                },
              ],
              notes: isSnapshot ? [{ tone: 'warn', body: 'Gegevens komen uit de laatste assessment-run. Live data geeft vollediger gebruikerscontext.' }] : [],
            })
          : `
            <div class="gb-detail-grid">
              <div class="gb-detail-item"><div class="gb-detail-key">UPN</div><div class="gb-detail-val" style="word-break:break-all">${escHtml(u.userPrincipalName || '—')}</div></div>
            </div>
            ${offboardBtn}`;
        if (typeof window.updateSideRailDetail === 'function') {
          window.updateSideRailDetail(u.displayName || fallbackName || userId, bodyHtml);
        }
        // Offboard-knop activeren na renderen
        setTimeout(() => {
          document.getElementById('gbRailOffboardBtn')?.addEventListener('click', () => {
            openOffboardWizard(userId, u.userPrincipalName, u.displayName);
          });
        }, 50);
      })
      .catch((err) => {
        if (typeof window.updateSideRailDetail === 'function') {
          if (cachedUser) {
            const cachedLicenses = Array.isArray(cachedUser.licenses) ? cachedUser.licenses : [];
            window.updateSideRailDetail(cachedUser.displayName || fallbackName, typeof window.renderSideRailTemplate === 'function'
              ? window.renderSideRailTemplate({
                  tone: 'warn',
                  statusLabel: 'Beperkt',
                  summaryCards: [
                    { label: 'Status', value: cachedUser.accountEnabled ? 'Actief' : 'Uitgeschakeld', meta: 'cacheweergave', tone: cachedUser.accountEnabled ? 'good' : 'warn' },
                    { label: 'Licenties', value: cachedLicenses.length || '0', meta: 'basisinformatie', tone: cachedLicenses.length ? 'good' : 'warn' },
                  ],
                  sections: [{
                    title: 'Basisinformatie',
                    badge: 'Fallback',
                    tone: 'warn',
                    bodyHtml: `
                      <div class="gb-detail-grid">
                        <div class="gb-detail-item"><div class="gb-detail-key">UPN</div><div class="gb-detail-val">${escHtml(cachedUser.userPrincipalName || '—')}</div></div>
                        <div class="gb-detail-item"><div class="gb-detail-key">Functie</div><div class="gb-detail-val">${escHtml(cachedUser.jobTitle || '—')}</div></div>
                        <div class="gb-detail-item"><div class="gb-detail-key">Afdeling</div><div class="gb-detail-val">${escHtml(cachedUser.department || '—')}</div></div>
                        <div class="gb-detail-item gb-detail-full" style="grid-column:1/-1"><div class="gb-detail-key">Licenties</div><div class="gb-chip-list">${cachedLicenses.map((l) => `<span class="gb-chip gb-chip-lic">${escHtml(l)}</span>`).join('') || '<span style="color:var(--text-muted)">Geen licenties</span>'}</div></div>
                      </div>`,
                  }],
                  notes: [{ tone: 'warn', body: 'Live detail ophalen mislukt. Basisinformatie uit de huidige lijstweergave getoond.' }],
                })
              : `<div class="gb-empty">Live detail ophalen mislukt. Basisinformatie getoond.</div>`);
          } else {
            window.updateSideRailDetail('Fout', `<div class="gb-empty">Fout: ${escHtml(String(err))}</div>`);
          }
        }
      });
  }

  // ── Offboarding wizard ───────────────────────────────────────────────────

  function openOffboardWizard(userId, upn, displayName) {
    if (isReadOnlyViewer()) {
      if (typeof showToast === 'function') showToast('Dit account heeft alleen leesrechten.', 'warning');
      return;
    }
    const tid = getTenantId();
    if (!tid) return;

    const overlay = createOverlay('gb-modal-overlay', closeAllModals);
    const modal = document.createElement('div');
    modal.className = 'gb-modal';

    function render(step, state) {
      modal.innerHTML = `
        <div class="gb-modal-header">
          <div>
            <div class="gb-modal-title">Gebruiker offboarden</div>
            <div class="gb-modal-subtitle">${escHtml(displayName)} — ${escHtml(upn)}</div>
          </div>
          <button class="gb-modal-close" title="Sluiten">✕</button>
        </div>
        <div class="gb-modal-body">
          <div class="gb-wizard-steps">
            <div class="gb-step ${step >= 1 ? 'done' : ''} ${step === 0 ? 'active' : ''}">
              <span class="gb-step-num">${step > 0 ? '✓' : '1'}</span><span>Opties</span>
            </div>
            <div class="gb-step ${step >= 2 ? 'done' : ''} ${step === 1 ? 'active' : ''}">
              <span class="gb-step-num">${step > 1 ? '✓' : '2'}</span><span>Bevestig</span>
            </div>
            <div class="gb-step ${step === 2 ? 'active' : ''}">
              <span class="gb-step-num">3</span><span>Resultaat</span>
            </div>
          </div>
          <div id="gbOffStepContent"></div>
        </div>
        <div class="gb-modal-footer" id="gbOffFooter"></div>`;

      modal.querySelector('.gb-modal-close').onclick = closeAllModals;

      const content = modal.querySelector('#gbOffStepContent');
      const footer  = modal.querySelector('#gbOffFooter');

      if (step === 0) {
        // Stap 1: opties kiezen
        content.innerHTML = `
          <div class="gb-checkbox-group">
            <label class="gb-checkbox-item">
              <input type="checkbox" id="gbOpt_revoke" checked>
              <div><div class="gb-checkbox-label">Sessies & tokens intrekken</div>
              <div class="gb-checkbox-desc">Beëindigt alle actieve sessies direct</div></div>
            </label>
            <label class="gb-checkbox-item">
              <input type="checkbox" id="gbOpt_disable" checked>
              <div><div class="gb-checkbox-label">Account uitschakelen</div>
              <div class="gb-checkbox-desc">Blokkeert inloggen voor deze gebruiker</div></div>
            </label>
            <label class="gb-checkbox-item">
              <input type="checkbox" id="gbOpt_lic" checked>
              <div><div class="gb-checkbox-label">Licenties verwijderen</div>
              <div class="gb-checkbox-desc">Verwijdert alle M365 licentietoewijzingen</div></div>
            </label>
            <label class="gb-checkbox-item">
              <input type="checkbox" id="gbOpt_ooo">
              <div><div class="gb-checkbox-label">Out-of-Office instellen</div>
              <div class="gb-checkbox-desc">Automatisch antwoord inschakelen (vereist MailboxSettings.ReadWrite)</div></div>
            </label>
          </div>
          <div id="gbOooMsgWrap" style="display:none;margin-top:.75rem">
            <label class="gb-form-label">OOO bericht</label>
            <textarea class="gb-form-input" id="gbOooMsg" rows="3" style="resize:vertical"
              placeholder="Deze medewerker is niet meer werkzaam. Neem contact op via info@uw-domein.nl">Deze medewerker is niet meer werkzaam bij ons bedrijf. Neem contact op via info@uw-domein.nl</textarea>
          </div>`;

        modal.querySelector('#gbOpt_ooo').addEventListener('change', (e) => {
          modal.querySelector('#gbOooMsgWrap').style.display = e.target.checked ? '' : 'none';
        });

        footer.innerHTML = `
          <button class="gb-btn gb-btn-secondary gb-cancel">Annuleren</button>
          <button class="gb-btn gb-btn-primary gb-next">Volgende →</button>`;
        footer.querySelector('.gb-cancel').onclick = closeAllModals;
        footer.querySelector('.gb-next').onclick = () => {
          const opts = {
            revoke_tokens:    modal.querySelector('#gbOpt_revoke')?.checked ?? true,
            disable_account:  modal.querySelector('#gbOpt_disable')?.checked ?? true,
            remove_licenses:  modal.querySelector('#gbOpt_lic')?.checked ?? true,
            set_out_of_office: modal.querySelector('#gbOpt_ooo')?.checked ?? false,
            ooo_message:      (modal.querySelector('#gbOooMsg')?.value || '').trim(),
          };
          render(1, opts);
        };

      } else if (step === 1) {
        // Stap 2: bevestiging
        const checks = [
          state.revoke_tokens    && '✓ Sessies & tokens intrekken',
          state.disable_account  && '✓ Account uitschakelen',
          state.remove_licenses  && '✓ Licenties verwijderen',
          state.set_out_of_office && '✓ Out-of-Office instellen',
        ].filter(Boolean);

        content.innerHTML = `
          <div class="gb-warn-box danger">
            <strong>Bevestig offboarding van ${escHtml(displayName)}</strong><br>
            De volgende acties worden <strong>direct</strong> uitgevoerd:
          </div>
          <ul style="margin:.75rem 0 0;padding-left:1.25rem;font-size:.875rem;color:var(--text-secondary)">
            ${checks.map((c) => `<li>${escHtml(c)}</li>`).join('')}
          </ul>
          <div style="margin-top:.75rem">
            <label class="gb-form-label" for="gbDryRunToggle">
              <input type="checkbox" id="gbDryRunToggle" style="accent-color:var(--accent)">
              Dry-run (preview zonder uitvoering)
            </label>
          </div>`;

        footer.innerHTML = `
          <button class="gb-btn gb-btn-secondary gb-back">← Terug</button>
          <button class="gb-btn gb-btn-danger gb-execute">Offboard uitvoeren</button>`;
        footer.querySelector('.gb-back').onclick = () => render(0, state);
        footer.querySelector('.gb-execute').onclick = () => {
          const dryRun = modal.querySelector('#gbDryRunToggle')?.checked ?? false;
          executeOffboard(userId, upn, displayName, state, dryRun, modal, overlay);
        };

      } else if (step === 2) {
        // Stap 3: resultaat — gevuld door executeOffboard
      }
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    render(0, {});
  }

  function executeOffboard(userId, upn, displayName, opts, dryRun, modal, overlay) {
    const tid = getTenantId();
    const footer = modal.querySelector('#gbOffFooter');
    const content = modal.querySelector('#gbOffStepContent');

    if (footer) footer.innerHTML = `<span style="font-size:.82rem;color:var(--text-muted)">Bezig met offboarding...</span>`;

    const payload = Object.assign({}, opts, { display_name: displayName, dry_run: dryRun });

    gbApiFetch(API.m365.offboard(tid, userId), {
      method: 'POST',
      body: JSON.stringify(payload),
    })
      .then((data) => {
        const actions  = data.actions  || [];
        const warnings = data.warnings || [];
        const isOk     = data.ok !== false;
        const isDry    = dryRun;

        if (content) {
          const resultClass = isDry ? 'gb-result-dryrun' : (isOk ? 'gb-result-ok' : 'gb-result-error');
          const icon = isDry ? 'ℹ️' : (isOk ? '✅' : '❌');
          content.innerHTML = `
            <div class="gb-result ${resultClass}">
              <div class="gb-result-icon">${icon}</div>
              <div class="gb-result-msg">${isDry ? 'Dry-run voltooid — geen wijzigingen gemaakt' : (isOk ? 'Offboarding succesvol uitgevoerd' : 'Offboarding gedeeltelijk mislukt')}</div>
            </div>
            ${actions.length ? `<ul class="gb-result-list">${actions.map((a) => `<li>${escHtml(a)}</li>`).join('')}</ul>` : ''}
            ${warnings.length ? `<ul class="gb-result-list warnings">${warnings.map((w) => `<li>${escHtml(w)}</li>`).join('')}</ul>` : ''}`;
        }
        if (footer) {
          footer.innerHTML = `<button class="gb-btn gb-btn-primary gb-done">Sluiten</button>`;
          footer.querySelector('.gb-done').onclick = () => { closeAllModals(); loadUsers(); };
        }
      })
      .catch((err) => {
        if (content) content.innerHTML = `<div class="gb-result gb-result-error"><div class="gb-result-msg">Fout: ${escHtml(String(err))}</div></div>`;
        if (footer) {
          footer.innerHTML = `<button class="gb-btn gb-btn-secondary gb-done">Sluiten</button>`;
          footer.querySelector('.gb-done').onclick = closeAllModals;
        }
      });
  }

  // ── Provisioning wizard ──────────────────────────────────────────────────

  function openProvisioningWizard() {
    if (isReadOnlyViewer()) {
      if (typeof showToast === 'function') showToast('Dit account heeft alleen leesrechten.', 'warning');
      return;
    }
    const tid = getTenantId();
    if (!tid) { showStatus('Selecteer eerst een tenant.'); return; }

    const overlay = createOverlay('gb-modal-overlay', closeAllModals);
    const modal   = document.createElement('div');
    modal.className = 'gb-modal gb-modal-wide';

    const state = { step: 0, formData: {}, selectedLicenses: [] };

    function renderStep() {
      modal.innerHTML = `
        <div class="gb-modal-header">
          <div>
            <div class="gb-modal-title">Nieuwe gebruiker aanmaken</div>
            <div class="gb-modal-subtitle">Provisioning wizard</div>
          </div>
          <button class="gb-modal-close">✕</button>
        </div>
        <div class="gb-modal-body">
          <div class="gb-wizard-steps">
            <div class="gb-step ${state.step > 0 ? 'done' : ''} ${state.step === 0 ? 'active' : ''}">
              <span class="gb-step-num">${state.step > 0 ? '✓' : '1'}</span><span>Gegevens</span>
            </div>
            <div class="gb-step ${state.step > 1 ? 'done' : ''} ${state.step === 1 ? 'active' : ''}">
              <span class="gb-step-num">${state.step > 1 ? '✓' : '2'}</span><span>Licenties</span>
            </div>
            <div class="gb-step ${state.step === 2 ? 'active' : ''}">
              <span class="gb-step-num">3</span><span>Resultaat</span>
            </div>
          </div>
          <div id="gbProvContent"></div>
        </div>
        <div class="gb-modal-footer" id="gbProvFooter"></div>`;

      modal.querySelector('.gb-modal-close').onclick = closeAllModals;

      const content = modal.querySelector('#gbProvContent');
      const footer  = modal.querySelector('#gbProvFooter');

      if (state.step === 0) {
        // Stap 1: gebruikersgegevens
        const d = state.formData;
        content.innerHTML = `
          <div class="gb-form">
            <div class="gb-form-row">
              <div class="gb-form-group">
                <label class="gb-form-label">Voornaam <span class="gb-required">*</span></label>
                <input class="gb-form-input" id="gbFldFirst" value="${escHtml(d.givenName || '')}" placeholder="Jan">
              </div>
              <div class="gb-form-group">
                <label class="gb-form-label">Achternaam <span class="gb-required">*</span></label>
                <input class="gb-form-input" id="gbFldLast" value="${escHtml(d.surname || '')}" placeholder="de Vries">
              </div>
            </div>
            <div class="gb-form-group">
              <label class="gb-form-label">Weergavenaam <span class="gb-required">*</span></label>
              <input class="gb-form-input" id="gbFldDisplay" value="${escHtml(d.displayName || '')}" placeholder="Jan de Vries">
            </div>
            <div class="gb-form-group">
              <label class="gb-form-label">UPN (e-mail) <span class="gb-required">*</span></label>
              <input class="gb-form-input" id="gbFldUpn" value="${escHtml(d.userPrincipalName || '')}" placeholder="jan.devries@bedrijf.onmicrosoft.com">
              <div class="gb-form-hint">Gebruik het .onmicrosoft.com domein of een geverifieerd domein</div>
            </div>
            <div class="gb-form-row">
              <div class="gb-form-group">
                <label class="gb-form-label">Functie</label>
                <input class="gb-form-input" id="gbFldJob" value="${escHtml(d.jobTitle || '')}" placeholder="Medewerker">
              </div>
              <div class="gb-form-group">
                <label class="gb-form-label">Afdeling</label>
                <input class="gb-form-input" id="gbFldDept" value="${escHtml(d.department || '')}" placeholder="ICT">
              </div>
            </div>
            <div class="gb-form-row">
              <div class="gb-form-group">
                <label class="gb-form-label">Gebruikslocatie</label>
                <select class="gb-form-select" id="gbFldLocale">
                  <option value="NL" ${d.usageLocation === 'NL' || !d.usageLocation ? 'selected' : ''}>Nederland (NL)</option>
                  <option value="BE" ${d.usageLocation === 'BE' ? 'selected' : ''}>België (BE)</option>
                  <option value="DE" ${d.usageLocation === 'DE' ? 'selected' : ''}>Duitsland (DE)</option>
                  <option value="GB" ${d.usageLocation === 'GB' ? 'selected' : ''}>Verenigd Koninkrijk (GB)</option>
                  <option value="US" ${d.usageLocation === 'US' ? 'selected' : ''}>Verenigde Staten (US)</option>
                </select>
              </div>
              <div class="gb-form-group">
                <label class="gb-form-label">Tijdelijk wachtwoord <span class="gb-required">*</span></label>
                <input class="gb-form-input" id="gbFldPwd" type="text" value="${escHtml(d.password || '')}"
                  placeholder="Minimaal 8 tekens, hoofdletter + cijfer">
                <div class="gb-form-hint">Gebruiker moet wachtwoord wijzigen bij eerste inlog</div>
              </div>
            </div>
          </div>`;

        // Auto-fill displayName
        ['gbFldFirst','gbFldLast'].forEach((id) => {
          modal.querySelector(`#${id}`)?.addEventListener('input', () => {
            const first = modal.querySelector('#gbFldFirst')?.value.trim() || '';
            const last  = modal.querySelector('#gbFldLast')?.value.trim()  || '';
            const disp  = modal.querySelector('#gbFldDisplay');
            if (disp && (!disp.value || disp.value === state.formData.displayName)) {
              disp.value = [first, last].filter(Boolean).join(' ');
            }
          });
        });

        footer.innerHTML = `
          <button class="gb-btn gb-btn-secondary gb-cancel">Annuleren</button>
          <button class="gb-btn gb-btn-primary gb-next">Licenties →</button>`;
        footer.querySelector('.gb-cancel').onclick = closeAllModals;
        footer.querySelector('.gb-next').onclick = () => {
          const fd = {
            givenName:         (modal.querySelector('#gbFldFirst')?.value || '').trim(),
            surname:           (modal.querySelector('#gbFldLast')?.value  || '').trim(),
            displayName:       (modal.querySelector('#gbFldDisplay')?.value || '').trim(),
            userPrincipalName: (modal.querySelector('#gbFldUpn')?.value || '').trim(),
            jobTitle:          (modal.querySelector('#gbFldJob')?.value  || '').trim(),
            department:        (modal.querySelector('#gbFldDept')?.value || '').trim(),
            usageLocation:     modal.querySelector('#gbFldLocale')?.value || 'NL',
            password:          (modal.querySelector('#gbFldPwd')?.value  || '').trim(),
          };
          if (!fd.displayName || !fd.userPrincipalName || !fd.password) {
            showFieldErrors(modal, ['gbFldDisplay','gbFldUpn','gbFldPwd'], fd);
            return;
          }
          state.formData = fd;
          // Licenties laden als nog niet gedaan
          const licPromise = _licenses.length ? Promise.resolve(_licenses) : loadLicenses(tid);
          licPromise.then(() => { state.step = 1; renderStep(); });
        };

      } else if (state.step === 1) {
        // Stap 2: licenties kiezen
        const licRows = _licenses.length
          ? _licenses.map((l) => {
              const availClass = l.available === 0 ? 'none' : l.available < 5 ? 'low' : '';
              const checked = state.selectedLicenses.includes(l.skuId) ? 'checked' : '';
              return `<label class="gb-license-item">
                <input type="checkbox" data-skuid="${escHtml(l.skuId)}" ${checked} ${l.available === 0 ? 'disabled' : ''}>
                <span class="gb-license-name">${escHtml(l.displayName)}</span>
                <span class="gb-license-avail ${availClass}">${l.consumed}/${l.enabled}</span>
              </label>`;
            }).join('')
          : `<div class="gb-empty">Geen licenties beschikbaar of laden mislukt.</div>`;

        content.innerHTML = `
          <p style="font-size:.875rem;color:var(--text-secondary);margin:0 0 .75rem">
            Kies de licenties voor <strong>${escHtml(state.formData.displayName)}</strong>.<br>
            Licenties kunnen later ook worden aangepast.
          </p>
          <div class="gb-license-list">${licRows}</div>
          <div style="margin-top:.75rem">
            <label style="font-size:.82rem;color:var(--text-secondary)">
              <input type="checkbox" id="gbDryRunProv" style="accent-color:var(--accent)">
              Dry-run (preview zonder aanmaken)
            </label>
          </div>`;

        footer.innerHTML = `
          <button class="gb-btn gb-btn-secondary gb-back">← Terug</button>
          <button class="gb-btn gb-btn-primary gb-create">Gebruiker aanmaken</button>`;
        footer.querySelector('.gb-back').onclick = () => { state.step = 0; renderStep(); };
        footer.querySelector('.gb-create').onclick = () => {
          const checked = [...modal.querySelectorAll('.gb-license-item input:checked')]
            .map((el) => el.dataset.skuid).filter(Boolean);
          state.selectedLicenses = checked;
          const dryRun = modal.querySelector('#gbDryRunProv')?.checked ?? false;
          executeProvision(state, dryRun, modal);
        };
      }
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    renderStep();
  }

  function showFieldErrors(modal, fieldIds, data) {
    fieldIds.forEach((id) => {
      const el = modal.querySelector(`#${id}`);
      if (el && !el.value.trim()) el.classList.add('error');
    });
    // Verwijder error klasse bij input
    fieldIds.forEach((id) => {
      modal.querySelector(`#${id}`)?.addEventListener('input', (e) => e.target.classList.remove('error'), { once: true });
    });
  }

  function executeProvision(state, dryRun, modal) {
    const tid = getTenantId();
    const footer  = modal.querySelector('#gbProvFooter');
    const content = modal.querySelector('#gbProvContent');
    if (footer) footer.innerHTML = `<span style="font-size:.82rem;color:var(--text-muted)">Gebruiker aanmaken...</span>`;

    const payload = Object.assign({}, state.formData, {
      licenseSkuIds: state.selectedLicenses,
      dry_run: dryRun,
    });

    gbApiFetch(API.m365.users(tid), {
      method: 'POST',
      body: JSON.stringify(payload),
    })
      .then((data) => {
        const isOk   = data.ok !== false;
        const isDry  = dryRun;
        const msg    = data.message || (isOk ? 'Gebruiker aangemaakt' : 'Aanmaken mislukt');
        const licAssigned = data.licenses_assigned || data.preview?.licenseCount;

        if (content) {
          const cls = isDry ? 'gb-result-dryrun' : (isOk ? 'gb-result-ok' : 'gb-result-error');
          const icon = isDry ? 'ℹ️' : (isOk ? '✅' : '❌');
          content.innerHTML = `
            <div class="gb-result ${cls}">
              <div class="gb-result-icon">${icon}</div>
              <div class="gb-result-msg">${escHtml(msg)}</div>
            </div>
            ${data.upn ? `<p style="font-size:.83rem;color:var(--text-secondary);margin:.5rem 0 0">UPN: <code>${escHtml(data.upn)}</code></p>` : ''}
            ${(data.preview?.licenseCount !== undefined) ? `<p style="font-size:.83rem;color:var(--text-secondary);margin:.25rem 0 0">Licenties: ${data.preview.licenseCount}</p>` : ''}`;
        }
        if (footer) {
          footer.innerHTML = `<button class="gb-btn gb-btn-primary gb-done">Sluiten</button>`;
          footer.querySelector('.gb-done').onclick = () => { closeAllModals(); if (!dryRun && isOk) loadUsers(); };
        }
      })
      .catch((err) => {
        if (content) content.innerHTML = `<div class="gb-result gb-result-error"><div class="gb-result-msg">Fout: ${escHtml(String(err))}</div></div>`;
        if (footer) {
          footer.innerHTML = `<button class="gb-btn gb-btn-secondary gb-done">Sluiten</button>`;
          footer.querySelector('.gb-done').onclick = closeAllModals;
        }
      });
  }

  // ── Provisioning-geschiedenis ────────────────────────────────────────────

  function loadProvisioningHistory() {
    const tid = getTenantId();
    if (!tid) return;
    const tbody = document.getElementById('gbHistoryBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="gb-loading">Laden...</td></tr>`;

    gbApiFetch(API.m365.provisioningHistory(tid))
      .then((data) => {
        const items = data.items || [];
        updateText('gbCardHistoryMeta', items.length ? `${items.length} recente mutatie${items.length !== 1 ? 's' : ''}` : 'Nog geen accountacties gelogd');
        if (!items.length) {
          tbody.innerHTML = `<tr><td colspan="6" class="gb-table-empty">Nog geen activiteit gelogd.</td></tr>`;
          return;
        }
        tbody.innerHTML = items.map((h) => {
          const statusBadge = h.status === 'success'
            ? `<span class="gb-status gb-status-enabled"><span class="gb-dot"></span>Succes</span>`
            : h.status === 'dry_run'
              ? `<span class="gb-status" style="background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd"><span class="gb-dot" style="background:#0369a1"></span>Dry-run</span>`
              : `<span class="gb-status gb-status-disabled"><span class="gb-dot"></span>Mislukt</span>`;
          const action = h.action === 'create-user' ? 'Aangemaakt' : h.action === 'offboard-user' ? 'Offboarded' : escHtml(h.action);
          return `<tr>
            <td>${fmtDate(h.executed_at)}</td>
            <td>${action}</td>
            <td>${escHtml(h.target_display_name || h.target_upn || '—')}</td>
            <td>${statusBadge}</td>
            <td>${escHtml(h.executed_by || '—')}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(h.error_message || '—')}</td>
          </tr>`;
        }).join('');
      })
      .catch(() => {
        updateText('gbCardHistoryMeta', 'Geschiedenis kon niet worden geladen');
        tbody.innerHTML = `<tr><td colspan="6" class="gb-table-empty">Fout bij laden geschiedenis.</td></tr>`;
      });
  }

  // ── Modal helpers ────────────────────────────────────────────────────────

  function createOverlay(cls, onClose) {
    const el = document.createElement('div');
    el.className = cls;
    el.addEventListener('click', (e) => { if (e.target === el) onClose(); });
    return el;
  }

  function closeAllModals() {
    document.querySelectorAll('.gb-modal-overlay').forEach((el) => el.remove());
  }

  function showStatus(msg) {
    // Hergebruik bestaand toast systeem als aanwezig
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    console.info('[Gebruikers]', msg);
  }

  function syncGbCardStates() {
    document.querySelectorAll('.gb-workcard[data-gb-card]').forEach((card) => {
      const panelKey = card.dataset.gbCard;
      const isOpen = _openGbPanels.has(panelKey);
      card.classList.toggle('is-open', isOpen);
      const toggle = card.querySelector('.gb-workcard-toggle');
      const body = card.querySelector('.gb-workcard-body');
      if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      // Display is handled by CSS via .is-open + grid-template-rows animation
      if (body) body.style.display = '';
    });
    document.querySelectorAll('.gb-insight-card[data-gb-insight]').forEach((card) => {
      card.classList.toggle('is-active', card.dataset.gbInsight === _activeGbPanel);
    });
  }

  function loadGbPanelData(tab) {
    if (tab === 'overzicht') {
      renderOverviewPanel();
      renderRisksPanel();
    }
    if (tab === 'licenties') loadLicensesTab();
    if (tab === 'risicos') renderRisksPanel();
    if (tab === 'geschiedenis') loadProvisioningHistory();
  }

  function openGbPanel(tab, options = {}) {
    _activeGbPanel = tab || 'gebruikers';
    _openGbPanels.add(_activeGbPanel);
    syncGbCardStates();
    syncGbViewTabs();
    renderCapabilityBanner(_activeGbPanel);
    loadGbPanelData(_activeGbPanel);
    if (options.scroll) {
      document.querySelector(`.gb-workcard[data-gb-card="${_activeGbPanel}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function toggleGbPanel(tab, options = {}) {
    const nextPanel = tab || 'gebruikers';
    const isOpen = _openGbPanels.has(nextPanel);
    if (isOpen) {
      _openGbPanels.delete(nextPanel);
      if (_activeGbPanel === nextPanel) {
        const fallback = GB_V2_PANEL_ORDER.find((key) => _openGbPanels.has(key)) || nextPanel;
        _activeGbPanel = fallback;
      }
      syncGbCardStates();
      syncGbViewTabs();
      renderCapabilityBanner(_activeGbPanel);
      return;
    }
    _activeGbPanel = nextPanel;
    _openGbPanels.add(nextPanel);
    syncGbCardStates();
    syncGbViewTabs();
    renderCapabilityBanner(_activeGbPanel);
    loadGbPanelData(_activeGbPanel);
    if (options.scroll) {
      document.querySelector(`.gb-workcard[data-gb-card="${_activeGbPanel}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function applyQuickUserFilter(filterKey) {
    _searchQ = '';
    const search = document.getElementById('gbSearchInput');
    if (search) search.value = '';
    _filterStatus = filterKey || 'all';
    document.querySelectorAll('.gb-filter-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.filter === _filterStatus));
    window.resetCollectionPager?.('gbUsersMain');
    renderUsersTable();
    renderGuestGovernanceBanner();
  }

  function normalizeGbTab(tab) {
    const raw = String(tab || '').toLowerCase();
    if (!USERS_LICENSES_V2) return raw || 'gebruikers';
    if (!raw || raw === 'gebruikers') return 'overzicht';
    if (raw === 'overview' || raw === 'overzicht') return 'overzicht';
    if (raw === 'users') return 'gebruikers';
    if (raw === 'licenses' || raw === 'licenties') return 'licenties';
    if (raw === 'gasten') return 'gasten';
    if (raw === 'risicos' || raw === 'risico' || raw === 'risico\'s' || raw === 'risks') return 'risicos';
    if (raw === 'geschiedenis' || raw === 'history') return 'geschiedenis';
    return raw;
  }

  function syncGbViewTabs() {
    document.querySelectorAll('[data-gb-view-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.gbViewTab === _activeGbPanel);
    });
  }

  function bindGbViewTabs() {
    document.querySelectorAll('[data-gb-view-tab]').forEach((btn) => {
      if (btn.dataset.gbViewBound === '1') return;
      btn.dataset.gbViewBound = '1';
      btn.addEventListener('click', () => {
        switchGbTab(btn.dataset.gbViewTab || 'overzicht');
      });
    });
  }

  // ── Tab switching / werkkaarten ──────────────────────────────────────────

  function switchGbTab(tab) {
    const nextTab = normalizeGbTab(tab);
    if (nextTab === 'gasten') {
      openGbPanel('gebruikers', { scroll: false });
      applyQuickUserFilter('guest');
      return;
    }
    if (nextTab === 'risicos') {
      openGbPanel('risicos', { scroll: false });
      return;
    }
    if (nextTab === 'overzicht') {
      openGbPanel('overzicht', { scroll: false });
      return;
    }
    openGbPanel(nextTab, { scroll: false });
  }

  function bindGbTabs() {
    document.querySelectorAll('[data-gb-toggle]').forEach((btn) => {
      if (btn.dataset.gbBound === '1') return;
      btn.dataset.gbBound = '1';
      btn.addEventListener('click', () => toggleGbPanel(btn.dataset.gbToggle));
    });
    document.querySelectorAll('[data-gb-insight]').forEach((btn) => {
      if (btn.dataset.gbInsightBound === '1') return;
      btn.dataset.gbInsightBound = '1';
      btn.addEventListener('click', () => {
        switchGbTab(btn.dataset.gbInsight || 'gebruikers');
        if ((btn.dataset.gbInsight || 'gebruikers') === 'gebruikers') {
          applyQuickUserFilter(btn.dataset.gbFilter || 'all');
        }
      });
    });
  }

  // ── Licenties tabblad ─────────────────────────────────────────────────────

  function loadLicensesTab() {
    const tid = getTenantId();
    if (!tid) {
      const grid = document.getElementById('gbLicGrid');
      if (grid) grid.innerHTML = '<p class="gb-empty">Selecteer eerst een tenant.</p>';
      return;
    }

    const grid    = document.getElementById('gbLicGrid');
    const counter = document.getElementById('gbLicCount');
    if (grid) grid.innerHTML = '<p class="gb-empty gb-loading">Licenties laden...</p>';

    gbApiFetch(API.m365.licenses(tid))
      .then((data) => {
        const lics = data.licenses || [];
        _licenses = lics;
        renderGbInsights();
        if (counter) counter.textContent = `${lics.length} licentie${lics.length !== 1 ? 's' : ''}`;
        if (!lics.length) {
          if (grid) grid.innerHTML = '<p class="gb-empty">Geen licenties gevonden voor deze tenant.</p>';
          return;
        }
        if (grid) {
          grid.innerHTML = lics.map((l) => {
            const pct = l.enabled > 0 ? Math.round((l.consumed / l.enabled) * 100) : 0;
            const barClass = pct >= 90 ? 'full' : pct >= 70 ? 'warn' : '';
            const avail = l.enabled - l.consumed;
            const wasteAlert = l.enabled >= 5 && pct < 10
              ? `<span class="gb-lic-badge gb-lic-badge--waste" title="Weinig gebruik — mogelijk onnodig betaald">Laag gebruik</span>` : '';
            const overAlert = pct >= 90
              ? `<span class="gb-lic-badge gb-lic-badge--over" title="Bijna vol — overweeg uitbreiding">Bijna vol</span>` : '';
            return `<div class="gb-lic-card" data-skuid="${escHtml(l.skuId)}" title="Klik om gekoppelde gebruikers te zien">
              <div class="gb-lic-name">${escHtml(l.displayName || l.skuPartNumber || l.skuId)}${wasteAlert}${overAlert}</div>
              <div class="gb-lic-stats">
                <span class="gb-lic-stat"><strong>${l.consumed}</strong> in gebruik</span>
                <span class="gb-lic-stat"><strong>${l.enabled}</strong> totaal</span>
                <span class="gb-lic-stat ${avail === 0 ? 'none' : avail < 5 ? 'low' : ''}">${avail} beschikbaar</span>
              </div>
              <div class="gb-lic-bar-wrap">
                <div class="gb-lic-bar ${barClass}" style="width:${pct}%"></div>
              </div>
              <div class="gb-lic-pct">${pct}% gebruikt</div>
            </div>`;
          }).join('');

          grid.querySelectorAll('.gb-lic-card[data-skuid]').forEach((card) => {
            card.addEventListener('click', () => openLicenseSideRail(card.dataset.skuid, lics));
          });
        }
      })
      .catch((err) => {
        _licenses = [];
        renderGbInsights();
        if (grid) grid.innerHTML = `<p class="gb-empty">Fout: ${escHtml(String(err))}</p>`;
      });
  }

  function getLicenseUsageTone(license) {
    const enabled = toFiniteNumber(license?.enabled) || 0;
    const consumed = toFiniteNumber(license?.consumed) || 0;
    const pct = enabled > 0 ? Math.round((consumed / enabled) * 100) : 0;
    if (enabled === 0) return 'warn';
    if (pct >= 90) return 'error';
    if (pct >= 70 || pct <= 10) return 'warn';
    return 'good';
  }

  function findUsersForLicense(license) {
    if (!license) return [];
    const skuId = String(license.skuId || '');
    const candidateNames = [
      license.displayName,
      license.skuPartNumber,
      license.name,
    ].filter(Boolean).map((value) => String(value).toLowerCase());

    return _users.filter((u) => {
      if (Array.isArray(u.licenseSkuIds) && skuId) {
        return u.licenseSkuIds.includes(skuId);
      }
      if (Array.isArray(u.licenses) && candidateNames.length) {
        const owned = u.licenses.map((value) => String(value).toLowerCase());
        return candidateNames.some((name) => owned.includes(name));
      }
      return false;
    });
  }

  function bindLicenseRailActions(matchedUsers, license) {
    document.getElementById('gbRailOpenLicPanel')?.addEventListener('click', () => {
      openGbPanel('licenties', { scroll: false });
    });
    document.getElementById('gbRailRefreshUsers')?.addEventListener('click', () => {
      loadUsers({ strictLive: false });
    });
    document.querySelectorAll('[data-gb-license-user]').forEach((button) => {
      button.addEventListener('click', () => {
        const userId = button.dataset.gbLicenseUser;
        const user = matchedUsers.find((entry) => String(entry.id || entry.userPrincipalName || '') === userId)
          || matchedUsers.find((entry) => String(entry.userPrincipalName || '') === userId)
          || null;
        openDetailPanel(user?.id || user?.userPrincipalName || userId, user?.displayName || user?.userPrincipalName || userId);
      });
    });
    document.getElementById('gbRailLicenseOpenUsers')?.addEventListener('click', () => {
      openGbPanel('gebruikers', { scroll: true });
      if (matchedUsers.length) {
        _searchQ = '';
        const search = document.getElementById('gbSearchInput');
        if (search) search.value = '';
        _filterStatus = 'all';
        renderUsersTable();
      }
    });
  }

  function openLicenseSideRail(skuId, lics) {
    const lic = lics.find((l) => l.skuId === skuId);
    const licName = lic ? (lic.displayName || lic.skuPartNumber || skuId) : skuId;
    const matched = findUsersForLicense(lic || { skuId, displayName: licName });
    const enabled = toFiniteNumber(lic?.enabled) || 0;
    const consumed = toFiniteNumber(lic?.consumed) || 0;
    const available = Math.max(0, enabled - consumed);
    const pct = enabled > 0 ? Math.round((consumed / enabled) * 100) : 0;
    const usageTone = getLicenseUsageTone(lic);
    const findings = [];

    if (enabled === 0) {
      findings.push({
        tone: 'warn',
        label: 'Controle',
        title: 'Geen beschikbare seats gemeld',
        body: 'Deze licentie rapporteert momenteel geen totaal aantal beschikbare seats.',
      });
    } else if (pct >= 90) {
      findings.push({
        tone: 'error',
        label: 'Fout',
        title: 'Licentie bijna volledig benut',
        body: 'De bezetting ligt boven de 90%. Controleer uitbreiding of schoning van ongebruikte toewijzingen.',
      });
    } else if (pct <= 10 && enabled >= 5) {
      findings.push({
        tone: 'warn',
        label: 'Let op',
        title: 'Laag gebruik',
        body: 'Er zijn relatief veel ongebruikte seats. Controleer of deze licentie nog passend is.',
      });
    } else {
      findings.push({
        tone: 'good',
        label: 'Goed',
        title: 'Bezetting is in balans',
        body: 'De huidige licentiebezetting lijkt gezond op basis van de geladen tenantdata.',
      });
    }

    const userTableHtml = matched.length
      ? `<div class="gb-table-wrap"><table class="gb-table">
           <thead><tr><th>Naam</th><th>UPN</th><th>Afdeling</th><th>Status</th><th>Actie</th></tr></thead>
           <tbody>${matched.map((u) => `
             <tr>
               <td><div class="gb-user-cell">
                 <div class="gb-avatar">${initials(u.displayName)}</div>
                 <span>${escHtml(u.displayName || u.userPrincipalName || 'Gebruiker')}</span>
               </div></td>
               <td>${escHtml(u.userPrincipalName || '—')}</td>
               <td>${escHtml(u.department || '—')}</td>
               <td>${u.accountEnabled
                 ? '<span class="gb-status gb-status-enabled"><span class="gb-dot"></span>Actief</span>'
                 : '<span class="gb-status gb-status-disabled"><span class="gb-dot"></span>Uitgeschakeld</span>'}</td>
               <td><button type="button" class="gb-btn gb-btn-secondary" data-gb-license-user="${escHtml(u.id || u.userPrincipalName || '')}">Meer info</button></td>
             </tr>`).join('')}
           </tbody>
         </table></div>`
      : `<p style="color:var(--text-secondary);font-size:.875rem">
           Geen gekoppelde gebruikers gevonden in de huidige lijstweergave.<br>
           <em>Tip: vernieuw eerst de gebruikerslijst voor een vollediger koppeling van skuIds.</em>
         </p>`;

    if (typeof closeAllModals === 'function') {
      closeAllModals();
    }
    if (typeof window._setContextRailOpen === 'function') {
      window._setContextRailOpen(true);
    }
    if (typeof window.openSideRailDetail === 'function') {
      window.openSideRailDetail('Licentie', licName);
    }
    if (typeof window.updateSideRailDetail === 'function') {
      window.updateSideRailDetail(licName, typeof window.renderSideRailTemplate === 'function'
        ? window.renderSideRailTemplate({
            tone: usageTone,
            statusLabel: pct >= 90 ? 'Bijna vol' : pct <= 10 && enabled >= 5 ? 'Laag gebruik' : 'In beeld',
            summaryCards: [
              { label: 'In gebruik', value: consumed, meta: 'toegewezen seats', tone: usageTone },
              { label: 'Totaal', value: enabled || '—', meta: 'beschikbare seats', tone: enabled ? 'neutral' : 'warn' },
              { label: 'Vrij', value: available, meta: enabled ? 'direct inzetbaar' : 'onbekend', tone: available > 0 ? 'good' : 'error' },
              { label: 'Gebruik', value: `${pct}%`, meta: matched.length ? `${matched.length} gebruiker${matched.length !== 1 ? 's' : ''} geladen` : 'geen user-match', tone: usageTone },
            ],
            sections: [
              {
                title: 'Licentie informatie',
                badge: lic?.skuPartNumber || 'SKU',
                tone: usageTone,
                bodyHtml: `
                  <div class="gb-detail-grid">
                    <div class="gb-detail-item"><div class="gb-detail-key">Naam</div><div class="gb-detail-val">${escHtml(licName)}</div></div>
                    <div class="gb-detail-item"><div class="gb-detail-key">SKU Part Number</div><div class="gb-detail-val">${escHtml(lic?.skuPartNumber || '—')}</div></div>
                    <div class="gb-detail-item"><div class="gb-detail-key">SKU ID</div><div class="gb-detail-val" style="word-break:break-all">${escHtml(lic?.skuId || skuId || '—')}</div></div>
                    <div class="gb-detail-item"><div class="gb-detail-key">Beschikbaar</div><div class="gb-detail-val">${available}</div></div>
                  </div>`,
              },
              {
                title: 'Gekoppelde gebruikers',
                badge: `${matched.length}`,
                tone: matched.length ? 'good' : 'warn',
                bodyHtml: userTableHtml,
              },
            ],
            findings,
            actions: [
              {
                title: 'Vervolgactie',
                body: matched.length
                  ? 'Open een gekoppelde gebruiker voor detailinformatie of ga terug naar het licentieoverzicht voor verdere analyse.'
                  : 'Ververs gebruikersdata als je de daadwerkelijke toewijzingen per gebruiker wilt controleren.',
                actionHtml: `
                  <div style="display:grid;gap:.55rem">
                    <button type="button" class="gb-btn gb-btn-primary" id="gbRailOpenLicPanel">Open licentieoverzicht</button>
                    <button type="button" class="gb-btn gb-btn-secondary" id="gbRailRefreshUsers">Gebruikers vernieuwen</button>
                    ${matched.length ? '<button type="button" class="gb-btn gb-btn-secondary" id="gbRailLicenseOpenUsers">Open gebruikerslijst</button>' : ''}
                  </div>`,
              },
            ],
            notes: [
              {
                tone: matched.length ? 'neutral' : 'warn',
                body: matched.length
                  ? 'Gebruikerskoppeling is gebaseerd op geladen skuIds en zichtbare gebruikersdata.'
                  : 'Niet elke tenant levert direct sku-koppelingen mee in de huidige lijstweergave.',
              },
            ],
          })
        : userTableHtml);
    }
    setTimeout(() => bindLicenseRailActions(matched, lic || { skuId, displayName: licName }), 40);
  }

  // ── Filter & zoek binding ────────────────────────────────────────────────

  function bindToolbar() {
    const search = document.getElementById('gbSearchInput');
    if (search && search.dataset.gbBound !== '1') {
      search.dataset.gbBound = '1';
      search.addEventListener('input', () => {
        _searchQ = search.value.trim();
        window.resetCollectionPager?.('gbUsersMain');
        renderUsersTable();
      });
    }

    document.querySelectorAll('.gb-filter-tab[data-filter]').forEach((btn) => {
      if (btn.dataset.gbBound === '1') return;
      btn.dataset.gbBound = '1';
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gb-filter-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        _filterStatus = btn.dataset.filter;
        window.resetCollectionPager?.('gbUsersMain');
        renderUsersTable();
        renderGuestGovernanceBanner();
      });
    });

    const btnRefresh = document.getElementById('gbBtnRefresh');
    if (btnRefresh && btnRefresh.dataset.gbBound !== '1') {
      btnRefresh.dataset.gbBound = '1';
      btnRefresh.addEventListener('click', loadUsers);
    }

    const btnLiveScan = document.getElementById('gbBtnLiveScan');
    if (btnLiveScan && btnLiveScan.dataset.gbBound !== '1') {
      btnLiveScan.dataset.gbBound = '1';
      btnLiveScan.addEventListener('click', () => loadUsers({ strictLive: true }));
    }

    const btnNew = document.getElementById('gbBtnNieuw');
    if (btnNew && btnNew.dataset.gbBound !== '1') {
      btnNew.dataset.gbBound = '1';
      btnNew.addEventListener('click', openProvisioningWizard);
    }
  }

  // ── Publieke interface ───────────────────────────────────────────────────

  /**
   * Laad de Gebruikers sectie.
   * Wordt aangeroepen vanuit dashboard.js showSection('gebruikers')
   */
  window.loadGebruikersSection = function () {
    if (!_openGbPanels || typeof _openGbPanels.has !== 'function') {
      _openGbPanels = new Set([USERS_LICENSES_V2 ? 'overzicht' : 'gebruikers']);
    }
    if (!_openGbPanels.size) _openGbPanels.add(_activeGbPanel || (USERS_LICENSES_V2 ? 'overzicht' : 'gebruikers'));
    applyReadOnlyState();
    document.querySelectorAll('[data-gb-v2-only]').forEach((el) => {
      el.style.display = USERS_LICENSES_V2 ? '' : 'none';
    });
    document.querySelectorAll('[data-gb-v2-legacy]').forEach((el) => {
      el.style.display = USERS_LICENSES_V2 ? 'none' : '';
    });
    renderOverviewStats();
    bindGbViewTabs();
    bindGbTabs();
    bindToolbar();
    applySourceState();
    const btnRefreshLic = document.getElementById('gbBtnRefreshLic');
    if (btnRefreshLic) btnRefreshLic.onclick = loadLicensesTab;
    syncGbCardStates();
    syncGbViewTabs();
    renderGbInsights();
    renderCapabilityBanner(_activeGbPanel);
    loadUsers();
    loadLicenses(getTenantId());
    loadGuestGovernance();
    try {
      const desiredTab = normalizeGbTab(window._getCurrentSubItem?.());
      if (desiredTab) switchGbTab(desiredTab);
    } catch (_) {}
  };

  window.loadGebruikersHistory = function () {
    loadProvisioningHistory();
  };
  window.switchGebruikersTab = switchGbTab;
  window.scanGebruikersLive = function () {
    loadUsers({ strictLive: true });
    loadLicenses(getTenantId());
  };

})();
