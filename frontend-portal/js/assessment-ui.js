(function () {
  const state = {
    tenantId: null,
    nav: null,
    selectedKey: 'summary',
    loading: false,
    liveLoadingKey: null,
  };

  const LIVE_CHAPTERS = [
    {
      key: 'identity',
      title: 'Identiteit & Toegang',
      description: 'Live tenantdata voor MFA, gasten, beheerrollen en security defaults.',
      primaryAction: { label: 'Hoofdstuk ophalen', path: (tenantId) => `/api/identity/${tenantId}/mfa`, title: 'Identity / MFA' },
      actions: [
        { key: 'identity-mfa', label: 'MFA', path: (tenantId) => `/api/identity/${tenantId}/mfa`, title: 'Identity / MFA' },
        { key: 'identity-guests', label: 'Gastgebruikers', path: (tenantId) => `/api/identity/${tenantId}/guests`, title: 'Identity / Guests' },
        { key: 'identity-admin-roles', label: 'Adminrollen', path: (tenantId) => `/api/identity/${tenantId}/admin-roles`, title: 'Identity / Admin Roles' },
        { key: 'identity-security-defaults', label: 'Beveiligingsdefaults', path: (tenantId) => `/api/identity/${tenantId}/security-defaults`, title: 'Identity / Security Defaults' },
        { key: 'identity-legacy-auth', label: 'Verouderde login', path: (tenantId) => `/api/identity/${tenantId}/legacy-auth`, title: 'Identity / Legacy Auth' },
      ],
    },
    {
      key: 'collaboration',
      title: 'Samenwerking',
      description: 'SharePoint en Teams live uitlezen voor de geselecteerde tenant.',
      primaryAction: { label: 'Hoofdstuk ophalen', path: (tenantId) => `/api/collaboration/${tenantId}/teams`, title: 'Collaboration / Teams' },
      actions: [
        { key: 'collab-sharepoint-sites', label: 'SharePoint-sites', path: (tenantId) => `/api/collaboration/${tenantId}/sharepoint/sites`, title: 'Collaboration / SharePoint Sites' },
        { key: 'collab-sharepoint-settings', label: 'SharePoint-instellingen', path: (tenantId) => `/api/collaboration/${tenantId}/sharepoint/settings`, title: 'Collaboration / SharePoint Settings' },
        { key: 'collab-teams', label: 'Teams', path: (tenantId) => `/api/collaboration/${tenantId}/teams`, title: 'Collaboration / Teams' },
      ],
    },
    {
      key: 'apps',
      title: 'App Registraties',
      description: 'App-registraties, secret-verval en certificaatstatus per tenant.',
      primaryAction: { label: 'Hoofdstuk ophalen', path: (tenantId) => `/api/apps/${tenantId}/registrations`, title: 'Apps / Registrations' },
      actions: [
        { key: 'apps-registrations', label: 'Registraties', path: (tenantId) => `/api/apps/${tenantId}/registrations`, title: 'Apps / Registrations' },
      ],
    },
    {
      key: 'intune',
      title: 'Intune',
      description: 'Apparaten, naleving en configuratieprofielen live vanuit Graph.',
      primaryAction: { label: 'Hoofdstuk ophalen', path: (tenantId) => `/api/intune/${tenantId}/summary`, title: 'Intune / Overzicht' },
      actions: [
        { key: 'intune-summary', label: 'Overzicht', path: (tenantId) => `/api/intune/${tenantId}/summary`, title: 'Intune / Overzicht' },
        { key: 'intune-devices', label: 'Apparaten', path: (tenantId) => `/api/intune/${tenantId}/devices`, title: 'Intune / Apparaten' },
        { key: 'intune-compliance', label: 'Naleving', path: (tenantId) => `/api/intune/${tenantId}/compliance`, title: 'Intune / Naleving' },
        { key: 'intune-config', label: 'Configuratie', path: (tenantId) => `/api/intune/${tenantId}/config`, title: 'Intune / Configuratie' },
      ],
    },
    {
      key: 'backup',
      title: 'Gegevensback-up',
      description: 'Back-upstatus, beleid en beschermde onderdelen binnen Microsoft 365.',
      primaryAction: { label: 'Hoofdstuk ophalen', path: (tenantId) => `/api/backup/${tenantId}/summary`, title: 'Back-up / Overzicht' },
      actions: [
        { key: 'backup-summary', label: 'Overzicht', path: (tenantId) => `/api/backup/${tenantId}/summary`, title: 'Back-up / Overzicht' },
        { key: 'backup-status', label: 'Status', path: (tenantId) => `/api/backup/${tenantId}/status`, title: 'Back-up / Status' },
        { key: 'backup-sharepoint', label: 'SharePoint', path: (tenantId) => `/api/backup/${tenantId}/sharepoint`, title: 'Back-up / SharePoint' },
        { key: 'backup-onedrive', label: 'OneDrive', path: (tenantId) => `/api/backup/${tenantId}/onedrive`, title: 'Back-up / OneDrive' },
        { key: 'backup-exchange', label: 'Exchange', path: (tenantId) => `/api/backup/${tenantId}/exchange`, title: 'Back-up / Exchange' },
      ],
    },
    {
      key: 'ca',
      title: 'Toegangsbeleid',
      description: 'Beleid en vertrouwde locaties live ophalen voor deze tenant.',
      primaryAction: { label: 'Hoofdstuk ophalen', path: (tenantId) => `/api/ca/${tenantId}/policies`, title: 'Toegangsbeleid / Beleid' },
      actions: [
        { key: 'ca-policies', label: 'Beleid', path: (tenantId) => `/api/ca/${tenantId}/policies`, title: 'Toegangsbeleid / Beleid' },
        { key: 'ca-locations', label: 'Locaties', path: (tenantId) => `/api/ca/${tenantId}/named-locations`, title: 'Toegangsbeleid / Vertrouwde locaties' },
      ],
    },
    {
      key: 'domains',
      title: 'Domeinen & DNS',
      description: 'Domeinen live ophalen en desgewenst direct een DNS-analyse starten.',
      primaryAction: { label: 'Hoofdstuk ophalen', path: (tenantId) => `/api/domains/${tenantId}/list`, title: 'Domeinen / Overzicht' },
      actions: [
        { key: 'domains-list', label: 'Domeinen', path: (tenantId) => `/api/domains/${tenantId}/list`, title: 'Domeinen / Overzicht' },
        { key: 'domains-analyse', label: 'Analyse domein', path: (tenantId, formValues) => `/api/domains/${tenantId}/analyse?domain=${encodeURIComponent(formValues.domain || '')}`, title: 'Domeinen / Analyse', requiresInput: 'domain' },
      ],
    },
    {
      key: 'alerts',
      title: 'Beveiligingssignalen',
      description: 'Beveiligingsscore, auditlog en risicovolle aanmeldingen live controleren.',
      primaryAction: { label: 'Hoofdstuk ophalen', path: (tenantId) => `/api/alerts/${tenantId}/secure-score`, title: 'Beveiligingssignalen / Beveiligingsscore' },
      actions: [
        { key: 'alerts-secure-score', label: 'Beveiligingsscore', path: (tenantId) => `/api/alerts/${tenantId}/secure-score`, title: 'Beveiligingssignalen / Beveiligingsscore' },
        { key: 'alerts-audit-logs', label: 'Auditlog', path: (tenantId) => `/api/alerts/${tenantId}/audit-logs`, title: 'Beveiligingssignalen / Auditlog' },
        { key: 'alerts-sign-ins', label: 'Aanmeldingen', path: (tenantId) => `/api/alerts/${tenantId}/sign-ins`, title: 'Beveiligingssignalen / Aanmeldingen' },
      ],
    },
    {
      key: 'exchange',
      title: 'E-mail & Postvakken',
      description: 'Mailboxen, doorstuurregels en inboxregels live voor deze tenant.',
      primaryAction: { label: 'Hoofdstuk ophalen', path: (tenantId) => `/api/exchange/${tenantId}/mailboxes`, title: 'E-mail / Mailboxen' },
      actions: [
        { key: 'exchange-mailboxes', label: 'Mailboxen', path: (tenantId) => `/api/exchange/${tenantId}/mailboxes`, title: 'E-mail / Mailboxen' },
        { key: 'exchange-forwarding', label: 'Doorstuurregels', path: (tenantId) => `/api/exchange/${tenantId}/forwarding`, title: 'E-mail / Doorstuurregels' },
        { key: 'exchange-rules', label: 'Inboxregels', path: (tenantId) => `/api/exchange/${tenantId}/mailbox-rules`, title: 'E-mail / Inboxregels' },
      ],
    },
  ];

  function assessmentEscapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function assessmentFormatDate(value) {
    if (!value) return 'Nog geen run';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('nl-NL');
  }

  function assessmentFormatCell(value) {
    if (value == null || value === '') return '—';
    if (Array.isArray(value)) {
      if (!value.length) return '—';
      return value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).slice(0, 3).join(', ');
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (!keys.length) return '—';
      if ('count' in value) return String(value.count);
      return JSON.stringify(value);
    }
    return String(value);
  }

  async function assessmentFetchJson(path) {
    if (typeof window.apiFetchCached === 'function') {
      return window.apiFetchCached(path, {}, (window.CACHE_TTL && window.CACHE_TTL.short) || 60000);
    }
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
    });
    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }
    if (!response.ok) {
      throw new Error((data && data.error) || `HTTP ${response.status}`);
    }
    return data;
  }

  function selectedTenantId() {
    const s = document.getElementById('tenantSelect');
    if (s && s.value) return s.value;
    // Haal tenant-id uit pill indien mogelijk
    const pill = document.getElementById('tenantPill');
    if (pill && pill.dataset && pill.dataset.tenantId) {
      if (s) s.value = pill.dataset.tenantId;
      return pill.dataset.tenantId;
    }
    return null;
  }

  function currentSectionRoot() {
    return document.getElementById('assessmentExperienceRoot');
  }

  function currentLegacyRunner() {
    return document.getElementById('assessmentLegacyRunner');
  }

  function renderTopAssessmentMenu(nav) {
    const dropdown = document.getElementById('assessmentNavDropdown');
    if (!dropdown) return;
    const items = Array.isArray(nav?.items) && nav.items.length ? nav.items : [{ key: 'summary', label: 'Overzicht', count: null }];
    dropdown.innerHTML = items.map((item) => `
      <button type="button" class="nav-dropdown-link" data-assessment-navjump="${assessmentEscapeHtml(item.key)}">
        <span>${assessmentEscapeHtml(item.label)}</span>
        ${item.count != null ? `<span class="nav-dropdown-count">${assessmentEscapeHtml(item.count)}</span>` : ''}
      </button>
    `).join('');
  }

  function assessmentToneClass(tone) {
    if (tone === 'success') return 'is-success';
    if (tone === 'warn') return 'is-warn';
    return 'is-default';
  }

  function renderAssessmentTable(section) {
    const columns = Array.isArray(section.columns) ? section.columns : [];
    const rows = Array.isArray(section.rows) ? section.rows : [];
    if (!rows.length) {
      return `
        <div class="assessment-panel assessment-panel-empty">
          <p>Voor dit onderdeel is nog geen assessmentdata gevonden.</p>
        </div>
      `;
    }
    return `
      <div class="assessment-panel assessment-panel-table">
        <div class="assessment-table-wrap">
          <table class="assessment-table">
            <thead>
              <tr>${columns.map((column) => `<th>${assessmentEscapeHtml(column)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map((row) => {
                const values = Object.values(row || {});
                return `
                  <tr>
                    ${values.map((value) => `<td>${assessmentEscapeHtml(value || '—')}</td>`).join('')}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderAssessmentCards(cards) {
    if (!Array.isArray(cards) || !cards.length) return '';
    return `
      <div class="assessment-kpi-grid">
        ${cards.map((card) => `
          <article class="assessment-kpi-card ${assessmentToneClass(card.tone)}">
            <span class="assessment-kpi-label">${assessmentEscapeHtml(card.label)}</span>
            <strong class="assessment-kpi-value">${assessmentEscapeHtml(card.value)}</strong>
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderAssessmentBars(bars) {
    if (!Array.isArray(bars) || !bars.length) return '';
    return `
      <div class="assessment-panel">
        <div class="assessment-panel-header">
          <div>
            <p class="assessment-panel-eyebrow">Tenant gezondheid</p>
            <h3>Gevonden onderdelen in de laatste run</h3>
          </div>
        </div>
        <div class="assessment-bars">
          ${bars.map((bar) => {
            const max = Math.max(Number(bar.max || 0), 1);
            const value = Number(bar.value || 0);
            const width = Math.max(8, Math.min(100, Math.round((value / max) * 100)));
            return `
              <div class="assessment-bar-row">
                <div class="assessment-bar-topline">
                  <span>${assessmentEscapeHtml(bar.label)}</span>
                  <strong>${assessmentEscapeHtml(value)}</strong>
                </div>
                <div class="assessment-bar-track">
                  <span class="assessment-bar-fill" style="width:${width}%"></span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderAssessmentSection(section, nav) {
    const cards = renderAssessmentCards(section.cards);
    const bars = renderAssessmentBars(section.bars);
    const table = renderAssessmentTable(section);
    return `
      <div class="assessment-content-head">
        <div>
          <p class="assessment-panel-eyebrow">Assessment onderdeel</p>
          <h2>${assessmentEscapeHtml(section.title || 'Assessment')}</h2>
          <p class="assessment-content-sub">
            Laatste synchronisatie: ${assessmentEscapeHtml(assessmentFormatDate(section.generated_at || nav.generated_at))}
          </p>
        </div>
        <div class="assessment-content-actions">
          <button type="button" class="assessment-action-btn assessment-action-btn-secondary" data-assessment-action="show-results">Bekijk resultaten</button>
          <button type="button" class="assessment-action-btn" data-assessment-action="scroll-runner">Nieuwe run starten</button>
        </div>
      </div>
      ${cards}
      ${bars}
      ${section.rows ? table : ''}
    `;
  }

  function renderLiveChapterCards() {
    return `
      <section class="assessment-live-panel">
        <div class="assessment-panel-header">
          <div>
            <p class="assessment-panel-eyebrow">Live tenantdata</p>
            <h3>Per hoofdstuk en subhoofdstuk direct ophalen</h3>
          </div>
        </div>
        <div class="assessment-live-grid">
          ${LIVE_CHAPTERS.map((chapter) => `
            <article class="assessment-live-card">
              <div class="assessment-live-card-head">
                <div>
                  <h4>${assessmentEscapeHtml(chapter.title)}</h4>
                  <p>${assessmentEscapeHtml(chapter.description)}</p>
                </div>
                <button
                  type="button"
                  class="assessment-live-fetch"
                  data-live-title="${assessmentEscapeHtml(chapter.primaryAction.title)}"
                  data-live-path="${assessmentEscapeHtml(chapter.primaryAction.path(state.tenantId || ''))}"
                  data-live-key="${assessmentEscapeHtml(chapter.key)}"
                >${assessmentEscapeHtml(chapter.primaryAction.label)}</button>
              </div>
              ${chapter.actions.some((action) => action.requiresInput === 'domain') ? `
                <div class="assessment-live-inline-form">
                  <input type="text" id="assessmentLiveDomainInput" class="assessment-live-input" placeholder="bijv. contoso.nl" />
                </div>
              ` : ''}
              <div class="assessment-live-actions">
                ${chapter.actions.map((action) => `
                  <button
                    type="button"
                    class="assessment-live-subaction"
                    data-live-title="${assessmentEscapeHtml(action.title)}"
                    data-live-action-key="${assessmentEscapeHtml(action.key)}"
                    data-live-chapter="${assessmentEscapeHtml(chapter.key)}"
                  >${assessmentEscapeHtml(action.label)}</button>
                `).join('')}
              </div>
            </article>
          `).join('')}
        </div>
        <div class="assessment-live-result" id="assessmentLiveResult">
          <div class="assessment-live-placeholder">
            Klik op een hoofdstuk of subhoofdstuk om live tenantdata op te halen.
          </div>
        </div>
      </section>
    `;
  }

  function normalizeLiveRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return { columns: [], rows: [] };
    const sample = rows.find((row) => row && typeof row === 'object') || {};
    const columns = Object.keys(sample).slice(0, 8);
    const normalizedRows = rows.slice(0, 100).map((row) => {
      const out = {};
      columns.forEach((column) => {
        out[column] = assessmentFormatCell(row ? row[column] : null);
      });
      return out;
    });
    return { columns, rows: normalizedRows };
  }

  function extractLiveCollection(data) {
    const collectionKeys = ['users', 'guests', 'roles', 'policies', 'profiles', 'devices', 'domains', 'items', 'mailboxes', 'rules', 'forwarding', 'locations', 'sites', 'teams', 'apps'];
    for (const key of collectionKeys) {
      if (Array.isArray(data?.[key])) return { key, value: data[key] };
    }
    return null;
  }

  function renderLiveSummary(data) {
    const summaryKeys = Object.keys(data || {}).filter((key) => {
      const value = data[key];
      return !Array.isArray(value) && (typeof value !== 'object' || value === null);
    }).slice(0, 8);
    if (!summaryKeys.length) return '';
    return `
      <div class="assessment-live-summary">
        ${summaryKeys.map((key) => `
          <div class="assessment-live-summary-item">
            <span>${assessmentEscapeHtml(key)}</span>
            <strong>${assessmentEscapeHtml(assessmentFormatCell(data[key]))}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderLiveResult(title, data) {
    const resultRoot = document.getElementById('assessmentLiveResult');
    if (!resultRoot) return;
    const collection = extractLiveCollection(data);
    const summary = renderLiveSummary(data);

    if (!collection) {
      const objectRows = Object.keys(data || {}).slice(0, 20).map((key) => ({ key, value: assessmentFormatCell(data[key]) }));
      resultRoot.innerHTML = `
        <div class="assessment-live-result-head">
          <div>
            <p class="assessment-panel-eyebrow">Live resultaat</p>
            <h3>${assessmentEscapeHtml(title)}</h3>
          </div>
        </div>
        ${summary}
        <div class="assessment-table-wrap">
          <table class="assessment-table">
            <thead><tr><th>Veld</th><th>Waarde</th></tr></thead>
            <tbody>
              ${objectRows.map((row) => `
                <tr>
                  <td>${assessmentEscapeHtml(row.key)}</td>
                  <td>${assessmentEscapeHtml(row.value)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    const normalized = normalizeLiveRows(collection.value);
    resultRoot.innerHTML = `
      <div class="assessment-live-result-head">
        <div>
          <p class="assessment-panel-eyebrow">Live resultaat</p>
          <h3>${assessmentEscapeHtml(title)}</h3>
        </div>
        <div class="assessment-live-count">${assessmentEscapeHtml(collection.key)}: ${assessmentEscapeHtml(collection.value.length)}</div>
      </div>
      ${summary}
      <div class="assessment-table-wrap">
        <table class="assessment-table">
          <thead>
            <tr>${normalized.columns.map((column) => `<th>${assessmentEscapeHtml(column)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${normalized.rows.map((row) => `
              <tr>
                ${normalized.columns.map((column) => `<td>${assessmentEscapeHtml(row[column])}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function setLiveLoading(title) {
    const resultRoot = document.getElementById('assessmentLiveResult');
    if (!resultRoot) return;
    resultRoot.innerHTML = `
      <div class="assessment-live-placeholder">
        ${assessmentEscapeHtml(title)} wordt opgehaald...
      </div>
    `;
  }

  function resolveLiveAction(actionKey, chapterKey) {
    const chapter = LIVE_CHAPTERS.find((item) => item.key === chapterKey);
    if (!chapter) return null;
    return chapter.actions.find((action) => action.key === actionKey) || null;
  }

  function getLiveFormValues() {
    return {
      domain: document.getElementById('assessmentLiveDomainInput')?.value?.trim() || '',
    };
  }

  async function fetchLiveData({ title, path, loadingKey }) {
    if (!state.tenantId || !path) return;
    state.liveLoadingKey = loadingKey || null;
    setLiveLoading(title);
    try {
      const data = await assessmentFetchJson(path);
      renderLiveResult(title, data || {});
    } catch (error) {
      const resultRoot = document.getElementById('assessmentLiveResult');
      if (resultRoot) {
        resultRoot.innerHTML = `
          <div class="assessment-live-error">
            <strong>${assessmentEscapeHtml(title)}</strong>
            <span>${assessmentEscapeHtml(error.message || 'Ophalen mislukt')}</span>
          </div>
        `;
      }
    } finally {
      state.liveLoadingKey = null;
    }
  }

  function renderAssessmentShell(nav, section) {
    const pill = document.getElementById('tenantPill');
    const s = document.getElementById('tenantSelect');
    if (pill && pill.dataset && pill.dataset.tenantId && s) {
      s.value = pill.dataset.tenantId;
    }
    const root = currentSectionRoot();
    const items = Array.isArray(nav.items) ? nav.items : [];
    const score = nav.score != null && nav.score !== '' ? nav.score : '—';
    root.innerHTML = `
      <div class="assessment-experience">
        <section class="assessment-hero">
          <div class="assessment-hero-copy">
            <span class="assessment-badge">Microsoft 365 Scan</span>
            <h1>Scan die echt meedenkt.</h1>
            <p>
              Een Denjoy-overzicht van licenties, identiteiten, app registraties en tenantgezondheid.
              Alleen onderdelen met echte data worden hier zichtbaar.
            </p>
            <div class="assessment-hero-actions">
              <button type="button" class="assessment-action-btn" data-assessment-action="scroll-runner">Scan uitvoeren</button>
              <button type="button" class="assessment-action-btn assessment-action-btn-secondary" data-assessment-action="show-results">Bekijk resultaten</button>
            </div>
          </div>
          <div class="assessment-hero-aside">
            <div class="assessment-signal-card">
              <span>Tenant</span>
              <strong>${assessmentEscapeHtml(nav.tenant_name || 'Onbekend')}</strong>
            </div>
            <div class="assessment-signal-card">
              <span>Laatste run</span>
              <strong>${assessmentEscapeHtml(assessmentFormatDate(nav.generated_at))}</strong>
            </div>
            <div class="assessment-signal-card">
              <span>Scanscore</span>
              <strong>${assessmentEscapeHtml(score)}</strong>
            </div>
          </div>
        </section>

        <section class="assessment-shell">
          <aside class="assessment-shell-nav">
            <div class="assessment-shell-topline">
              <span class="assessment-shell-led"></span>
              <span>portal.denjoy.nl/scan</span>
            </div>
            <div class="assessment-shell-menu">
              ${items.map((item) => `
                <button
                  type="button"
                  class="assessment-nav-item ${item.key === state.selectedKey ? 'is-active' : ''}"
                  data-assessment-key="${assessmentEscapeHtml(item.key)}"
                >
                  <span>${assessmentEscapeHtml(item.label)}</span>
                  ${item.count != null ? `<strong>${assessmentEscapeHtml(item.count)}</strong>` : ''}
                </button>
              `).join('')}
            </div>
          </aside>
          <div class="assessment-shell-body">
            ${renderAssessmentSection(section, nav)}
          </div>
        </section>
      </div>
    `;
  }

  function renderAssessmentNotice(title, message, tone) {
    const root = currentSectionRoot();
    if (!root) return;
    root.innerHTML = `
      <div class="assessment-experience">
        <section class="assessment-hero assessment-hero-notice">
          <div class="assessment-panel ${tone === 'error' ? 'assessment-panel-error' : ''}">
            <p class="assessment-panel-eyebrow">Scan</p>
            <h2>${assessmentEscapeHtml(title)}</h2>
            <p>${assessmentEscapeHtml(message)}</p>
          </div>
        </section>
      </div>
    `;
  }

  function syncLegacyRunnerVisibility(enabled) {
    const runner = currentLegacyRunner();
    if (!runner) return;
    runner.classList.toggle('assessment-legacy-runner-enhanced', enabled);
  }

  async function loadAssessmentExperience(options = {}) {
    const force = Boolean(options.force);
    const root = currentSectionRoot();
    if (!root || state.loading) return;
    const tenantId = selectedTenantId();
    syncLegacyRunnerVisibility(true);

    if (!tenantId) {
      state.tenantId = null;
      renderAssessmentNotice('Geen tenant geselecteerd', 'Selecteer eerst een tenant om scanresultaten en bevindingen te laden.');
      return;
    }

    try {
      state.loading = true;
      if (force || state.tenantId !== tenantId) {
        state.tenantId = tenantId;
        state.nav = null;
        state.selectedKey = 'summary';
      }

      let nav = null;
      let section = null;
      try {
        nav = await assessmentFetchJson(`/api/assessment/${tenantId}/nav`);
        state.nav = nav;
        renderTopAssessmentMenu(nav);

        if (!nav.enabled) {
          renderAssessmentNotice('Nieuwe scanweergave staat uit', 'De huidige portal gebruikt nog de klassieke scanpagina. Zet assessment_ui_v1 aan om deze ervaring te tonen.');
          syncLegacyRunnerVisibility(false);
          return;
        }

        const availableKeys = (nav.items || []).map((item) => item.key);
        if (!availableKeys.includes(state.selectedKey)) {
          state.selectedKey = availableKeys[0] || 'summary';
        }

        section = await assessmentFetchJson(`/api/assessment/${tenantId}/section/${state.selectedKey}`);
        renderAssessmentShell(nav, section);
      } catch (err) {
        // Fallback: als nav/section niet werkt, probeer direct mailboxen live endpoint
        if (state.selectedKey === 'exchange' || (nav && nav.items && nav.items.some(i => i.key === 'exchange'))) {
          // Simuleer live fetch-knop voor mailboxen
          renderAssessmentShell({items: [{key: 'exchange', title: 'E-mail & Postvakken'}]}, {});
          fetchLiveData({
            title: 'E-mail / Mailboxen',
            path: `/api/exchange/${tenantId}/mailboxes`,
            loadingKey: 'exchange-mailboxes',
          });
          return;
        } else {
          renderAssessmentNotice('Scan laden mislukt', err.message || 'Onbekende fout bij laden van scandata.', 'error');
        }
      }
    } catch (error) {
      console.error(error);
      renderAssessmentNotice('Scan laden mislukt', error.message || 'Onbekende fout bij laden van scandata.', 'error');
    } finally {
      state.loading = false;
    }
  }

  async function selectAssessmentSection(key) {
    if (!key || key === state.selectedKey) return;
    state.selectedKey = key;
    await loadAssessmentExperience({ force: false });
  }

  function scrollToLegacyRunner() {
    const runner = currentLegacyRunner();
    if (!runner) return;
    runner.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindAssessmentUiEvents() {
    document.addEventListener('click', (event) => {
      const navButton = event.target.closest('[data-assessment-key]');
      if (navButton) {
        event.preventDefault();
        selectAssessmentSection(navButton.dataset.assessmentKey);
        return;
      }

      const actionButton = event.target.closest('[data-assessment-action]');
      if (!actionButton) return;
      event.preventDefault();
      const action = actionButton.dataset.assessmentAction;
      if (action === 'scroll-runner') {
        scrollToLegacyRunner();
      } else if (action === 'show-results' && typeof showSection === 'function') {
        showSection('results', { resultsPanel: 'viewer' });
      }
    });

    document.addEventListener('click', (event) => {
      const livePrimaryButton = event.target.closest('[data-live-path]');
      if (livePrimaryButton) {
        event.preventDefault();
        fetchLiveData({
          title: livePrimaryButton.dataset.liveTitle || 'Live data',
          path: livePrimaryButton.dataset.livePath,
          loadingKey: livePrimaryButton.dataset.liveKey || '',
        });
        return;
      }

      const liveSubButton = event.target.closest('[data-live-action-key]');
      if (!liveSubButton) return;
      event.preventDefault();
      const action = resolveLiveAction(liveSubButton.dataset.liveActionKey, liveSubButton.dataset.liveChapter);
      if (!action || !state.tenantId) return;
      const formValues = getLiveFormValues();
      if (action.requiresInput === 'domain' && !formValues.domain) {
        renderLiveResult(action.title, { error: 'Vul eerst een domeinnaam in om een analyse te starten.' });
        return;
      }
      fetchLiveData({
        title: action.title,
        path: action.path(state.tenantId, formValues),
        loadingKey: action.key,
      });
    });

    document.addEventListener('click', (event) => {
      const jumpButton = event.target.closest('[data-assessment-navjump]');
      if (!jumpButton) return;
      event.preventDefault();
      state.selectedKey = jumpButton.dataset.assessmentNavjump || 'summary';
      const dropdownGroup = document.querySelector('.nav-dropdown');
      if (dropdownGroup) dropdownGroup.classList.remove('open');
      if (typeof showSection === 'function') showSection('assessment');
    });

    document.addEventListener('click', (event) => {
      const toggle = event.target.closest('#assessmentNavToggle');
      const dropdownGroup = document.querySelector('.nav-dropdown');
      if (!dropdownGroup) return;
      if (toggle) {
        event.preventDefault();
        dropdownGroup.classList.toggle('open');
        if (typeof showSection === 'function') showSection('assessment');
        return;
      }
      if (!event.target.closest('.nav-dropdown')) {
        dropdownGroup.classList.remove('open');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAssessmentUiEvents, { once: true });
  } else {
    bindAssessmentUiEvents();
  }
  window.loadAssessmentExperience = loadAssessmentExperience;
  window.selectAssessmentSection = selectAssessmentSection;
})();
