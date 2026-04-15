(function () {
  const LIVE_MODULES = {
    teams: {
      rootId: 'teamsModuleRoot',
      defaultTab: 'teams',
      tabs: {
        teams: {
          title: 'Teams',
          description: 'Alle Teams met zicht op leden, owners en zichtbaarheid.',
          endpoint: (tenantId) => `/api/collaboration/${tenantId}/teams`,
        },
        groepen: {
          title: 'Groepen',
          description: 'Alle M365-groepen, beveiligingsgroepen en distributielijsten met leden en owners.',
          endpoint: (tenantId) => `/api/collaboration/${tenantId}/groups`,
        },
        'teams-security': {
          title: 'Beveiliging',
          description: 'Teams met gastdeelname en externe samenwerkingsrisico\'s.',
          endpoint: (tenantId) => `/api/controls/${tenantId}/teams-with-guests`,
        },
      },
    },
    sharepoint: {
      rootId: 'sharepointModuleRoot',
      defaultTab: 'sharepoint-sites',
      tabs: {
        'sharepoint-sites': {
          title: 'SharePoint-sites',
          description: 'Live overzicht van sites, opslag en laatste wijzigingen.',
          endpoint: (tenantId) => `/api/collaboration/${tenantId}/sharepoint/sites`,
        },
        'sharepoint-settings': {
          title: 'SharePoint-instellingen',
          description: 'Tenant-brede sharinginstellingen en linkdefaults.',
          endpoint: (tenantId) => `/api/collaboration/${tenantId}/sharepoint/settings`,
        },
        'sharepoint-backup': {
          title: 'SharePoint-back-up',
          description: 'Beschermde SharePoint-sites en policies binnen Microsoft 365 Backup.',
          endpoint: (tenantId) => `/api/backup/${tenantId}/sharepoint`,
        },
        'sharepoint-security': {
          title: 'Beveiliging',
          description: 'Extern deelrisico, anonieme links en sharing-policy beoordeling.',
          endpoint: (tenantId) => `/api/controls/${tenantId}/sharepoint-sharing-risk`,
        },
      },
    },
    identity: {
      rootId: 'identityModuleRoot',
      defaultTab: 'mfa',
      tabs: {
        mfa: {
          title: 'Inlogbeveiliging',
          description: 'MFA-dekking, niet-geregistreerde accounts en beheerders met extra risico.',
          endpoint: (tenantId) => `/api/identity/${tenantId}/mfa`,
        },
        guests: {
          title: 'Gastgebruikers',
          description: 'Externe accounts, aanmeldactiviteit en status binnen de tenant.',
          endpoint: (tenantId) => `/api/identity/${tenantId}/guests`,
        },
        'admin-roles': {
          title: 'Beheerdersrollen',
          description: 'Beheerdersrollen, bezetting en accounts met verhoogde rechten.',
          endpoint: (tenantId) => `/api/identity/${tenantId}/admin-roles`,
        },
        'security-defaults': {
          title: 'Standaardbeveiliging',
          description: 'Standaardbeveiliging en de relatie met Conditional Access beleid.',
          endpoint: (tenantId) => `/api/identity/${tenantId}/security-defaults`,
        },
        'legacy-auth': {
          title: 'Verouderd inloggen',
          description: 'Gebruikers en aanmeldingen via verouderde of onveilige protocollen.',
          endpoint: (tenantId) => `/api/identity/${tenantId}/legacy-auth`,
        },
        'ca-policy': {
          title: 'Toegangsbeleid',
          description: 'Conditional Access policies — inventaris, dekking, gaps en verouderde inlogblokkades.',
          endpoint: (tenantId) => `/api/controls/${tenantId}/ca-policy-export`,
        },
        'admin-risk': {
          title: 'Rolrisico',
          description: 'Bevindingen uit admin-rol analyse: onnodig verhoogde rechten en risicovolle bezetting.',
          endpoint: (tenantId) => `/api/controls/${tenantId}/admin-role-membership`,
        },
        'break-glass': {
          title: 'Break-glass',
          description: 'Status van noodtoegangsaccounts: aanwezigheid, configuratie en monitoring.',
          endpoint: (tenantId) => `/api/controls/${tenantId}/break-glass-accounts`,
        },
      },
    },
    apps: {
      rootId: 'appsModuleRoot',
      defaultTab: 'registrations',
      tabs: {
        registrations: {
          title: 'Registraties',
          description: 'App-registraties, secrets, certificaten en vervalstatus.',
          endpoint: (tenantId) => `/api/apps/${tenantId}/registrations`,
        },
        'app-secrets': {
          title: 'Secrets & Certificaten',
          description: 'Overzicht van verlopen en binnenkort-verlopende secrets en certificaten per app.',
          endpoint: (tenantId) => `/api/controls/${tenantId}/app-secrets-and-certs`,
        },
      },
    },
    domains: {
      rootId: 'domainsModuleRoot',
      defaultTab: 'domains-list',
      tabs: {
        'domains-list': {
          title: 'Domeinen',
          description: 'Overzicht van alle tenantdomeinen die via Graph beschikbaar zijn.',
          endpoint: (tenantId) => `/api/domains/${tenantId}/list`,
        },
        'domains-analyse': {
          title: 'DNS Analyse',
          description: 'Analyseer SPF, DKIM, DMARC en MX voor een specifiek domein.',
          endpoint: (tenantId, inputs) => `/api/domains/${tenantId}/analyse?domain=${encodeURIComponent(inputs.domain || '')}`,
          input: {
            key: 'domain',
            label: 'Domein',
            placeholder: 'bijv. contoso.nl',
          },
        },
      },
    },
    exchange: {
      rootId: 'exchangeModuleRoot',
      defaultTab: 'mailboxen',
      tabs: {
        mailboxen: {
          title: 'E-mail & Postvakken',
          description: 'Overzicht van alle mailboxen in de tenant.',
          endpoint: (tenantId) => `/api/exchange/${tenantId}/mailboxes`,
        },
        forwarding: {
          title: 'Doorsturen',
          description: 'Controleer actieve mailbox-forwarding en externe adressen.',
          endpoint: (tenantId) => `/api/exchange/${tenantId}/forwarding`,
        },
        regels: {
          title: 'Inboxregels',
          description: 'Normale en verdachte inboxregels tenant-breed analyseren.',
          endpoint: (tenantId) => `/api/exchange/${tenantId}/mailbox-rules`,
        },
        'mail-security': {
          title: 'E-mail Beveiliging',
          description: 'SPF, DKIM en DMARC per domein en mailboxrechten-governance.',
          endpoint: (tenantId) => `/api/controls/${tenantId}/domain-mail-auth`,
        },
      },
    },
    intune: {
      rootId: 'intuneModuleRoot',
      defaultTab: 'overzicht',
      tabs: {
        overzicht: {
          title: 'Overzicht',
          description: 'Samenvatting van compliance en device posture in Intune.',
          endpoint: (tenantId) => `/api/intune/${tenantId}/summary`,
        },
        apparaten: {
          title: 'Apparaten',
          description: 'Live overzicht van managed devices in de tenant.',
          endpoint: (tenantId) => `/api/intune/${tenantId}/devices`,
        },
        compliance: {
          title: 'Compliance',
          description: 'Compliance policies en hun basisinformatie.',
          endpoint: (tenantId) => `/api/intune/${tenantId}/compliance`,
        },
        configuratie: {
          title: 'Configuratie',
          description: 'Configuratieprofielen en settings catalog items.',
          endpoint: (tenantId) => `/api/intune/${tenantId}/config`,
        },
        geschiedenis: {
          title: 'Geschiedenis',
          description: 'Historie van Intune-activiteiten in het portaal.',
          endpoint: (tenantId) => `/api/intune/${tenantId}/history`,
        },
      },
    },
    backup: {
      rootId: 'backupModuleRoot',
      defaultTab: 'overzicht',
      tabs: {
        overzicht: {
          title: 'Overzicht',
          description: 'Algemene backupstatus en beschermde resources per workload.',
          endpoint: (tenantId) => `/api/backup/${tenantId}/summary`,
        },
        onedrive: {
          title: 'OneDrive',
          description: 'OneDrive protection policies en beschermde drives.',
          endpoint: (tenantId) => `/api/backup/${tenantId}/onedrive`,
        },
        exchange: {
          title: 'Exchange',
          description: 'Exchange protection policies en beschermde mailboxen.',
          endpoint: (tenantId) => `/api/backup/${tenantId}/exchange`,
        },
        geschiedenis: {
          title: 'Geschiedenis',
          description: 'Historie van backupacties en statussen.',
          endpoint: (tenantId) => `/api/backup/${tenantId}/history`,
        },
      },
    },
    compliance: {
      rootId: 'complianceModuleRoot',
      defaultTab: 'cis',
      tabs: {
        cis: {
          title: 'CIS M365 Benchmark',
          description: 'CIS M365 Foundations Benchmark v3.0 — pass/fail per control met framework-mapping.',
          endpoint: (tenantId) => `/api/compliance/${tenantId}/cis`,
        },
        zerotrust: {
          title: 'Zero Trust Assessment',
          description: 'Microsoft Zero Trust Assessment — identiteiten, apparaten, netwerk en data getoetst aan SFI-pilaren.',
          endpoint: (tenantId) => `/api/compliance/${tenantId}/zerotrust`,
        },
      },
    },
    hybrid: {
      rootId: 'hybridModuleRoot',
      defaultTab: 'sync',
      tabs: {
        sync: {
          title: 'AD Connect-synchronisatie',
          description: 'Synchronisatiestatus, authenticatietype en domeinen voor hybrid-tenants.',
          endpoint: (tenantId) => `/api/hybrid/${tenantId}/sync`,
        },
      },
    },
    alerts: {
      rootId: 'alertsModuleRoot',
      defaultTab: 'auditlog',
      tabs: {
        auditlog: {
          title: 'Auditlog',
          description: 'Directory audit events en tenantwijzigingen.',
          endpoint: (tenantId) => `/api/alerts/${tenantId}/audit-logs`,
        },
        securescr: {
          title: 'Beveiligingsscore',
          description: 'Microsoft Beveiligingsscore met aanbevelingen.',
          endpoint: (tenantId) => `/api/alerts/${tenantId}/secure-score`,
        },
        signins: {
          title: 'Aanmeldingen',
          description: 'Recente aanmeldingen en risico-indicatoren.',
          endpoint: (tenantId) => `/api/alerts/${tenantId}/sign-ins`,
        },
        followup: {
          title: 'Opvolging',
          description: 'Acties, reminders en SLA-opvolging op tenantniveau.',
          endpoint: (tenantId) => `/api/alerts/${tenantId}/follow-up`,
        },
        config: {
          title: 'Notificaties',
          description: 'Webhook- en e-mailinstellingen voor alerts beheren.',
          endpoint: (tenantId) => `/api/alerts/${tenantId}/config`,
          customType: 'alerts-config',
        },
      },
    },
  };

  const liveState = {
    section: null,
    tab: null,
  };
  const capabilityState = {
    byKey: {},
  };
  const appRegState = {
    items: [],
  };
  const detailState = {
    nextId: 0,
    items: {},
  };
  const CONTROL_MAP = {
    identity: {
      guests: ['guest-user-governance'],
      'admin-roles': ['admin-role-membership', 'break-glass-accounts'],
      'legacy-auth': ['legacy-auth-exposure'],
      'ca-policy': ['ca-policy-export'],
      'admin-risk': ['admin-role-membership'],
      'break-glass': ['break-glass-accounts'],
    },
    apps: {
      registrations: ['app-secrets-and-certs'],
      'app-secrets': ['app-secrets-and-certs'],
    },
    teams: {
      teams: ['teams-with-guests'],
    },
    sharepoint: {
      'sharepoint-sites': ['sharepoint-sharing-risk'],
      'sharepoint-settings': ['sharepoint-sharing-risk'],
    },
    exchange: {
      mailboxen: ['mail-forwarding-detection', 'inbox-rule-risk-detection', 'mailbox-permission-governance'],
      forwarding: ['mail-forwarding-detection'],
      regels: ['inbox-rule-risk-detection'],
      'mail-security': ['mailbox-permission-governance'],
    },
  };

  function getStoredToken() {
    return localStorage.getItem('denjoy_auth_token') || localStorage.getItem('denjoy_token') || '';
  }

  function liveEscapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function selectedTenantId() {
    try {
      if (typeof window !== 'undefined' && window.currentTenantId) return window.currentTenantId;
      if (typeof currentTenantId !== 'undefined' && currentTenantId) return currentTenantId;
    } catch (_) {}
    try {
      const fromHelper = typeof window?._getCurrentTenantId === 'function' ? window._getCurrentTenantId() : null;
      if (fromHelper) return fromHelper;
    } catch (_) {}
    const select = document.getElementById('tenantSelect');
    if (select?.value) return select.value;
    const pillTenantId = document.getElementById('tenantPill')?.dataset?.tenantId || '';
    if (pillTenantId) {
      if (select && !select.value) select.value = pillTenantId;
      return pillTenantId;
    }
    try {
      const stored = localStorage.getItem('local_m365_current_tenant');
      if (stored) {
        if (select && !select.value) select.value = stored;
        return stored;
      }
    } catch (_) {}
    return null;
  }

  // TTL voor live-module tabs (ms) — endpoints die zelden wijzigen krijgen langere cache
  const LIVE_TTL = {
    '/api/apps/':          5 * 60 * 1000,
    '/api/identity/':      3 * 60 * 1000,
    '/api/collaboration/': 3 * 60 * 1000,
    '/api/domains/':       5 * 60 * 1000,
    '/api/ca/':            5 * 60 * 1000,
    '/api/exchange/':      2 * 60 * 1000,
    '/api/alerts/':        1 * 60 * 1000,
    '/api/intune/':        5 * 60 * 1000,
    '/api/backup/':        5 * 60 * 1000,
  };

  function liveTtlFor(path) {
    for (const [prefix, ttl] of Object.entries(LIVE_TTL)) {
      if (path.startsWith(prefix)) return ttl;
    }
    return 60 * 1000; // 1 min standaard
  }

  async function liveFetchJson(path, { skipCache = false } = {}) {
    if (typeof window.apiFetchCached === 'function' && !skipCache) {
      return window.apiFetchCached(path, {}, liveTtlFor(path));
    }
    if (!skipCache && window.cacheGet) {
      const hit = window.cacheGet(path);
      if (hit !== null) return hit;
    }
    const token = getStoredToken();
    const res = await fetch(path, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    if (data !== null && window.cacheSet) {
      window.cacheSet(path, data, liveTtlFor(path));
    }
    return data;
  }

  async function liveFetchControls(sectionName, tabKey, tenantId, { skipCache = false } = {}) {
    const keys = CONTROL_MAP?.[sectionName]?.[tabKey] || [];
    if (!tenantId || !keys.length) return {};
    const results = await Promise.all(keys.map(async (controlKey) => {
      const apiPath = window.API?.controls?.get
        ? window.API.controls.get(tenantId, controlKey, skipCache)
        : `/api/controls/${tenantId}/${encodeURIComponent(controlKey)}${skipCache ? '?strict_live=1' : ''}`;
      if (skipCache && typeof window.cacheClear === 'function') window.cacheClear(apiPath);
      try {
        const payload = await liveFetchJson(apiPath, { skipCache });
        return [controlKey, payload];
      } catch (error) {
        return [controlKey, {
          ok: false,
          control_key: controlKey,
          tenant_id: tenantId,
          source: 'unavailable',
          captured_at: '',
          summary: { total: 0, warning: 0, critical: 0 },
          items: [],
          errors: [{ type: 'live_unavailable', message: error.message || 'Control laden mislukt.' }],
        }];
      }
    }));
    return Object.fromEntries(results);
  }

  async function liveApiRequest(path, options = {}) {
    const token = getStoredToken();
    const res = await fetch(path, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    if (!res.ok) {
      throw new Error((data && data.error) || `HTTP ${res.status}`);
    }
    return data;
  }

  function getModuleConfig(sectionName) {
    return LIVE_MODULES[sectionName] || null;
  }

  function getModuleRoot(sectionName) {
    const config = getModuleConfig(sectionName);
    if (!config) return null;
    return document.getElementById(config.rootId);
  }

  function getTabConfig(sectionName, tabKey) {
    const config = getModuleConfig(sectionName);
    return config?.tabs?.[tabKey] || null;
  }

  function syncWorkspaceHeaderForLiveTab(sectionName, tab) {
    if (!tab) return;
    const sectionLabel = window.SECTION_META?.[sectionName]?.title || humanizeKey(sectionName);
    const eyebrowEl = document.getElementById('workspaceEyebrow');
    const titleEl = document.getElementById('workspaceTitle');
    const metaEl = document.getElementById('workspaceMeta');
    if (eyebrowEl) eyebrowEl.textContent = sectionLabel;
    if (titleEl) titleEl.textContent = `${sectionLabel} · ${tab.title || humanizeKey(sectionName)}`;
    if (metaEl) metaEl.textContent = tab.description || '';
  }

  function normalizeScalar(value) {
    if (value == null || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Ja' : 'Nee';
    if (Array.isArray(value)) return value.length ? value.slice(0, 3).map(normalizeScalar).join(', ') : '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function isMetaKey(key) {
    return String(key || '').startsWith('_') || ['ok', 'error', 'error_code'].includes(String(key || ''));
  }

  function humanizeKey(key) {
    const value = String(key || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim();
    if (!value) return 'Onbekend';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeJson(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      return String(value);
    }
  }

  function resetDetailState() {
    detailState.nextId = 0;
    detailState.items = {};
  }

  function registerDetailEntry(entry) {
    const id = `live-detail-${++detailState.nextId}`;
    detailState.items[id] = entry;
    return id;
  }

  function buildDetailHtml(value) {
    if (Array.isArray(value)) {
      if (!value.length) return '<p class="live-module-empty">Geen items beschikbaar.</p>';
      if (value.every((item) => !isPlainObject(item))) {
        return `<div class="live-detail-list">${value.map((item) => `<p>${liveEscapeHtml(normalizeScalar(item))}</p>`).join('')}</div>`;
      }
      return value.map((item, index) => `
        <section class="live-detail-section">
          <h5>Item ${index + 1}</h5>
          ${buildDetailHtml(item)}
        </section>
      `).join('');
    }
    if (isPlainObject(value)) {
      const keys = Object.keys(value);
      if (!keys.length) return '<p class="live-module-empty">Geen velden beschikbaar.</p>';
      return `
        <div class="live-detail-grid">
          ${keys.map((key) => {
            const fieldValue = value[key];
            const scalar = !Array.isArray(fieldValue) && !isPlainObject(fieldValue);
            return `
              <div class="live-detail-card${scalar ? '' : ' live-detail-card--stacked'}">
                <span>${liveEscapeHtml(humanizeKey(key))}</span>
                ${scalar
                  ? `<strong>${liveEscapeHtml(normalizeScalar(fieldValue))}</strong>`
                  : `<pre>${liveEscapeHtml(safeJson(fieldValue))}</pre>`}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
    return `<div class="live-detail-grid"><div class="live-detail-card"><span>Waarde</span><strong>${liveEscapeHtml(normalizeScalar(value))}</strong></div></div>`;
  }

  function openRegisteredDetail(detailId) {
    const entry = detailState.items[detailId];
    if (!entry) return;
    const fallbackTitle = entry.title || 'Details';
    const fallbackKicker = entry.kicker || 'Detail';
    const bodyHtml = entry.bodyHtml || buildUniformDetailRail(entry);
    if (typeof window.openSideRailDetail === 'function') {
      window.openSideRailDetail(fallbackKicker, fallbackTitle);
    }
    if (typeof window.updateSideRailDetail === 'function') {
      window.updateSideRailDetail(fallbackTitle, bodyHtml);
    }
  }

  function mapMetricToneToRailTone(tone) {
    if (tone === 'ok') return 'good';
    if (tone === 'warn') return 'warn';
    if (tone === 'crit') return 'error';
    return 'neutral';
  }

  function buildUniformDetailRail(entry) {
    const data = entry?.data;
    const title = entry?.title || 'Detail';
    const kicker = entry?.kicker || 'Detail';
    if (!isPlainObject(data)) {
      return buildDetailHtml(data);
    }

    const allEntries = Object.entries(data).filter(([key]) => !isMetaKey(key));
    const scalarEntries = allEntries.filter(([, value]) => !Array.isArray(value) && !isPlainObject(value));
    const complexEntries = allEntries.filter(([, value]) => Array.isArray(value) || isPlainObject(value));

    const summaryCards = scalarEntries.slice(0, 4).map(([key, value]) => {
      const rawTone = metricTone(value, key);
      return {
        label: humanizeKey(key),
        value: normalizeScalar(value),
        meta: 'live response',
        tone: mapMetricToneToRailTone(rawTone),
      };
    });

    const detailsGrid = scalarEntries.length
      ? `
        <div class="ex-detail-grid">
          ${scalarEntries.slice(0, 24).map(([key, value]) => `
            <div class="ex-detail-item">
              <label>${liveEscapeHtml(humanizeKey(key))}</label>
              <span>${liveEscapeHtml(normalizeScalar(value))}</span>
            </div>
          `).join('')}
        </div>`
      : '<p class="live-module-empty">Geen scalar detailvelden gevonden.</p>';

    const sections = [{
      title: 'Objectdetails',
      badge: kicker,
      tone: 'neutral',
      bodyHtml: detailsGrid,
    }];

    complexEntries.slice(0, 4).forEach(([key, value]) => {
      const valueHtml = Array.isArray(value) && value.every((item) => !isPlainObject(item))
        ? `<div class="live-token-list">${value.slice(0, 50).map((item) => `<span class="live-token">${liveEscapeHtml(normalizeScalar(item))}</span>`).join('')}</div>`
        : `<pre style="margin:0;white-space:pre-wrap;word-break:break-word;">${liveEscapeHtml(safeJson(value))}</pre>`;
      sections.push({
        title: humanizeKey(key),
        badge: Array.isArray(value) ? `${value.length}` : 'Object',
        tone: 'neutral',
        bodyHtml: valueHtml,
      });
    });

    const sourceLabel = data._source ? String(data._source) : 'Live data';
    const capturedAt = data._captured_at || data.captured_at || '';
    const findings = [{
      tone: 'neutral',
      label: 'Bron',
      title: sourceLabel,
      body: capturedAt ? `Opgehaald: ${formatDate(capturedAt)}` : 'Geen tijdstempel beschikbaar.',
    }];

    if (typeof window.renderSideRailTemplate !== 'function') {
      return buildDetailHtml(data);
    }

    return window.renderSideRailTemplate({
      tone: 'neutral',
      statusLabel: 'In beeld',
      summaryCards,
      sections,
      findings,
      actions: [{
        title: 'Aanbevolen actie',
        body: `Controleer ${title} en valideer of aanvullende opvolging nodig is.`,
      }],
    });
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return normalizeScalar(value);
    return date.toLocaleDateString('nl-NL');
  }

  function formatNumber(value, digits = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return number.toLocaleString('nl-NL', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function formatCompactNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('nl-NL', { notation: 'compact', maximumFractionDigits: 1 }).format(number);
  }

  function formatStorageGb(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${formatNumber(number, number >= 100 ? 0 : 2)} GB`;
  }

  function formatPercent(value, digits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${formatNumber(number, digits)}%`;
  }

  function buildProgressTone(percent) {
    if (!Number.isFinite(percent)) return 'ok';
    if (percent >= 100) return 'crit';
    if (percent >= 85) return 'warn';
    return 'ok';
  }

  function extractCollection(data) {
    const keys = ['users', 'guests', 'roles', 'policies', 'profiles', 'devices', 'domains', 'items', 'mailboxes', 'rules', 'forwarding', 'locations', 'sites', 'teams', 'apps'];
    for (const key of keys) {
      if (Array.isArray(data?.[key])) return { key, items: data[key] };
    }
    return null;
  }

  function renderSummary(data) {
    const keys = Object.keys(data || {}).filter((key) => {
      const value = data[key];
      return !Array.isArray(value) && (typeof value !== 'object' || value === null);
    }).slice(0, 8);
    if (!keys.length) return '';
    return `
      <div class="live-module-summary">
        ${keys.map((key) => `
          <article class="live-module-summary-card">
            <span>${liveEscapeHtml(key)}</span>
            <strong>${liveEscapeHtml(normalizeScalar(data[key]))}</strong>
          </article>
        `).join('')}
      </div>
    `;
  }

  function collectMetricEntries(data) {
    const candidates = [];
    const pushEntry = (key, value, source = 'response') => {
      if (value == null || value === '' || Array.isArray(value) || isPlainObject(value)) return;
      candidates.push({ key, value, source });
    };
    Object.entries(data || {}).forEach(([key, value]) => {
      if (!isMetaKey(key)) pushEntry(key, value);
    });
    if (isPlainObject(data?.summary)) {
      Object.entries(data.summary).forEach(([key, value]) => pushEntry(key, value, 'summary'));
    }

    const preferredOrder = [
      'score', 'currentScore', 'count', 'total', 'totalUsers', 'affectedUsers', 'mfaPercentage',
      'mfaRegistered', 'secureScore', 'sites', 'users', 'mailboxes', 'devices', 'policies',
    ];
    const seen = new Set();
    return candidates
      .sort((a, b) => {
        const ai = preferredOrder.indexOf(a.key);
        const bi = preferredOrder.indexOf(b.key);
        if (ai === -1 && bi === -1) return a.key.localeCompare(b.key);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
      .filter((item) => {
        const marker = `${item.source}:${item.key}`;
        if (seen.has(marker)) return false;
        seen.add(marker);
        return true;
      })
      .slice(0, 4);
  }

  function metricTone(value, key) {
    const lowerKey = String(key || '').toLowerCase();
    const num = Number(value);
    if (!Number.isFinite(num)) return typeof value === 'boolean' ? (value ? 'ok' : 'warn') : 'neutral';
    if (lowerKey.includes('score') || lowerKey.includes('percentage') || lowerKey.includes('pct')) {
      if (num >= 80) return 'ok';
      if (num >= 50) return 'warn';
      return 'crit';
    }
    if (lowerKey.includes('risk') || lowerKey.includes('fail') || lowerKey.includes('warning') || lowerKey.includes('critical') || lowerKey.includes('affected') || lowerKey.includes('inactive')) {
      if (num <= 0) return 'ok';
      if (num <= 3) return 'warn';
      return 'crit';
    }
    return 'neutral';
  }

  function renderSignalBar(data) {
    const metrics = collectMetricEntries(data);
    if (!metrics.length) return '';
    return `
      <div class="live-signal-bar">
        ${metrics.map((metric) => `
          <article class="live-signal-card live-signal-card--${metricTone(metric.value, metric.key)}">
            <span class="live-signal-label">${liveEscapeHtml(humanizeKey(metric.key))}</span>
            <strong class="live-signal-value">${liveEscapeHtml(normalizeScalar(metric.value))}</strong>
            <span class="live-signal-meta">${liveEscapeHtml(metric.source === 'summary' ? 'samenvatting' : 'live response')}</span>
          </article>
        `).join('')}
      </div>
    `;
  }

  function getCollectionColumns(items) {
    const columnSet = new Set();
    items.slice(0, 10).forEach((item) => {
      if (!isPlainObject(item)) return;
      Object.keys(item).forEach((key) => {
        const value = item[key];
        if (!Array.isArray(value) && !isPlainObject(value)) columnSet.add(key);
      });
    });
    const preferred = ['displayName', 'name', 'title', 'mail', 'upn', 'userPrincipalName', 'status', 'createdAt', 'lastSignIn'];
    const columns = [...columnSet].sort((a, b) => {
      const ai = preferred.indexOf(a);
      const bi = preferred.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return columns.slice(0, 6);
  }

  function getPrimaryRecordLabel(record, fallbackLabel) {
    return record?.displayName || record?.name || record?.title || record?.mail || record?.upn || record?.userPrincipalName || record?.id || fallbackLabel || 'Record';
  }

  function renderCollectionCard(key, items) {
    const count = items.length;
    if (!count) return '';
    if (!items.some((item) => isPlainObject(item))) {
      const detailId = registerDetailEntry({ kicker: humanizeKey(key), title: `${humanizeKey(key)} (${count})`, data: items });
      return `
        <details class="live-disclosure-card">
          <summary class="live-disclosure-summary">
            <div>
              <strong>${liveEscapeHtml(humanizeKey(key))}</strong>
              <span>${liveEscapeHtml(`${count} item${count === 1 ? '' : 's'}`)}</span>
            </div>
            <div class="live-disclosure-actions">
              <span class="live-disclosure-badge">${count}</span>
              <button type="button" class="live-detail-btn" data-live-detail-id="${liveEscapeHtml(detailId)}">Volledig detail</button>
            </div>
          </summary>
          <div class="live-disclosure-body">
            <div class="live-token-list">
              ${items.slice(0, 30).map((item) => `<span class="live-token">${liveEscapeHtml(normalizeScalar(item))}</span>`).join('')}
            </div>
          </div>
        </details>
      `;
    }
    const columns = getCollectionColumns(items);
    return `
      <details class="live-disclosure-card">
        <summary class="live-disclosure-summary">
          <div>
            <strong>${liveEscapeHtml(humanizeKey(key))}</strong>
            <span>${liveEscapeHtml(`${count} records live opgehaald`)}</span>
          </div>
          <span class="live-disclosure-badge">${count}</span>
        </summary>
        <div class="live-disclosure-body">
          <div class="assessment-table-wrap">
            <table class="assessment-table live-disclosure-table">
              <thead>
                <tr>
                  ${columns.map((column) => `<th>${liveEscapeHtml(humanizeKey(column))}</th>`).join('')}
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                ${items.slice(0, 100).map((item, index) => {
                  const detailId = registerDetailEntry({
                    kicker: humanizeKey(key),
                    title: getPrimaryRecordLabel(item, `${humanizeKey(key)} ${index + 1}`),
                    data: item,
                  });
                  return `
                    <tr>
                      ${columns.map((column) => `<td>${liveEscapeHtml(normalizeScalar(item[column]))}</td>`).join('')}
                      <td><button type="button" class="live-detail-btn" data-live-detail-id="${liveEscapeHtml(detailId)}">Open</button></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    `;
  }

  function renderObjectCard(key, value) {
    if (!isPlainObject(value)) return '';
    const rows = Object.entries(value);
    if (!rows.length) return '';
    const detailId = registerDetailEntry({ kicker: humanizeKey(key), title: humanizeKey(key), data: value });
    return `
      <details class="live-disclosure-card">
        <summary class="live-disclosure-summary">
          <div>
            <strong>${liveEscapeHtml(humanizeKey(key))}</strong>
            <span>${liveEscapeHtml(`${rows.length} velden`)}</span>
          </div>
          <div class="live-disclosure-actions">
            <span class="live-disclosure-badge">${rows.length}</span>
            <button type="button" class="live-detail-btn" data-live-detail-id="${liveEscapeHtml(detailId)}">Volledig detail</button>
          </div>
        </summary>
        <div class="live-disclosure-body">
          <div class="live-kv-grid">
            ${rows.slice(0, 10).map(([rowKey, rowValue]) => `
              <article class="live-kv-card">
                <span>${liveEscapeHtml(humanizeKey(rowKey))}</span>
                <strong>${liveEscapeHtml(normalizeScalar(rowValue))}</strong>
              </article>
            `).join('')}
          </div>
        </div>
      </details>
    `;
  }

  function renderProgressiveDataExplorer(sectionName, tabKey, data) {
    const entries = Object.entries(data || {}).filter(([key]) => !isMetaKey(key));
    const arrays = entries.filter(([, value]) => Array.isArray(value));
    const objects = entries.filter(([key, value]) => isPlainObject(value) && key !== 'summary');
    const summaryObject = isPlainObject(data?.summary) ? renderObjectCard('summary', data.summary) : '';
    const cardsHtml = arrays.map(([key, value]) => renderCollectionCard(key, value)).join('')
      + objects.map(([key, value]) => renderObjectCard(key, value)).join('')
      + summaryObject;
    if (!cardsHtml) return '';
    return `
      <section class="live-progressive-shell">
        <div class="live-progressive-head">
          <div>
            <span class="live-progressive-kicker">${liveEscapeHtml(humanizeKey(sectionName))}</span>
            <h4>Alle opgehaalde data</h4>
            <p>Alles wat voor ${liveEscapeHtml(tabKey)} is opgehaald blijft hier zichtbaar via inklapbare kaarten en detailpanelen.</p>
          </div>
        </div>
        ${renderSignalBar(data)}
        <div class="live-disclosure-stack">
          ${cardsHtml}
        </div>
      </section>
    `;
  }

  function getServiceOverviewCards(sectionName, tabKey, data, collection) {
    const cards = [];
    const total = Number(data?.total || data?.count || data?.roleCount || (collection?.items?.length || 0));

    if (sectionName === 'teams' && tabKey === 'teams') {
      cards.push({ label: 'Teams', value: String(Number(data?.count || data?.teams?.length || 0) || 0), meta: 'werkruimtes' });
      cards.push({ label: 'Publiek', value: String(Number(data?.publicCount || 0) || 0), meta: 'zichtbaar' });
      const memberCount = (data?.teams || []).reduce((sum, item) => sum + (Number(item?.memberCount) || 0), 0);
      cards.push({ label: 'Leden', value: String(memberCount || 0), meta: 'geteld' });
      const guestCount = (data?.teams || []).reduce((sum, item) => sum + (Number(item?.guestCount) || 0), 0);
      cards.push({ label: 'Gasten', value: String(guestCount || 0), meta: 'binnen teams' });
    } else if (sectionName === 'teams' && tabKey === 'groepen') {
      const stats = data?.stats || {};
      cards.push({ label: 'Groepen', value: String(Number(data?.count || data?.groups?.length || 0) || 0), meta: 'totaal' });
      cards.push({ label: 'M365', value: String(Number(stats.microsoft365 || 0) || 0), meta: 'Microsoft 365' });
      cards.push({ label: 'Beveiliging', value: String(Number(stats.security || 0) || 0), meta: 'beveiligingsgroepen' });
      cards.push({ label: 'Distributie', value: String(Number(stats.distribution || 0) || 0), meta: 'distributielijsten' });
    } else if (sectionName === 'sharepoint' && tabKey === 'sharepoint-sites') {
      cards.push({ label: 'Sites', value: String(Number(data?.count || data?.sites?.length || 0) || 0), meta: 'gevonden' });
      cards.push({ label: 'Opslag', value: Number.isFinite(Number(data?.totalStorageUsedGB)) ? formatStorageGb(data.totalStorageUsedGB) : '—', meta: 'totaal gebruikt' });
      cards.push({ label: 'Inactief', value: String(Number(data?.inactiveSites || 0) || 0), meta: '> 90 dagen' });
      cards.push({ label: 'Quota', value: Number.isFinite(Number(data?.storageUsedPct)) ? formatPercent(data.storageUsedPct) : '—', meta: 'van capaciteit' });
    } else if (sectionName === 'sharepoint' && tabKey === 'sharepoint-settings') {
      cards.push({ label: 'Delen', value: data?.sharingCapability ? String(data.sharingCapability) : '—', meta: 'tenantbreed' });
      cards.push({ label: 'Gasten delen', value: typeof data?.guestSharingEnabled === 'boolean' ? (data.guestSharingEnabled ? 'Ja' : 'Nee') : '—', meta: 'status' });
      cards.push({ label: 'Standaardlink', value: data?.defaultSharingLinkType ? String(data.defaultSharingLinkType) : '—', meta: 'standaard' });
    } else if (sectionName === 'identity' && tabKey === 'mfa') {
      cards.push({ label: 'Gebruikers', value: String(Number(data?.total || data?.users?.length || 0) || 0), meta: 'geanalyseerd' });
      cards.push({ label: 'MFA', value: `${Number(data?.mfaPercentage || 0)}%`, meta: 'dekking' });
      cards.push({ label: 'Geregistreerd', value: String(Number(data?.mfaRegistered || 0) || 0), meta: 'accounts' });
    } else if (sectionName === 'identity' && tabKey === 'guests') {
      cards.push({ label: 'Gasten', value: String(Number(data?.count || data?.guests?.length || 0) || 0), meta: 'accounts' });
      const enabled = (data?.guests || []).filter((item) => item?.accountEnabled !== false).length;
      cards.push({ label: 'Actief', value: String(enabled || 0), meta: 'ingeschakeld' });
    } else if (sectionName === 'identity' && tabKey === 'admin-roles') {
      cards.push({ label: 'Rollen', value: String(Number(data?.roleCount || data?.roles?.length || 0) || 0), meta: 'actief' });
      cards.push({ label: 'Admins', value: String(Number(data?.totalAdmins || 0) || 0), meta: 'uniek' });
    } else if (sectionName === 'identity' && tabKey === 'security-defaults') {
      cards.push({ label: 'Beveiligingsstandaarden', value: typeof data?.securityDefaultsEnabled === 'boolean' ? (data.securityDefaultsEnabled ? 'Aan' : 'Uit') : '—', meta: 'status' });
      cards.push({ label: 'CA-beleid', value: String(Number(data?.caEnabledPolicies || 0) || 0), meta: 'ingeschakeld' });
    } else if (sectionName === 'identity' && tabKey === 'legacy-auth') {
      cards.push({ label: 'Gebruikers', value: String(Number(data?.affectedUsers || data?.users?.length || 0) || 0), meta: 'geraakt' });
      cards.push({ label: 'Periode', value: String(Number(data?.daysChecked || 30) || 30), meta: 'dagen' });
    } else if (sectionName === 'identity' && tabKey === 'ca-policy') {
      const caPolicies = Array.isArray(data?.items) ? data.items : [];
      const caOk = caPolicies.filter((i) => i.status === 'ok').length;
      const caWarn = Number(data?.summary?.warning || 0);
      cards.push({ label: 'CA-policies', value: String(caPolicies.length || 0), meta: 'geanalyseerd' });
      cards.push({ label: 'Actief', value: String(caOk), meta: 'in productie' });
      cards.push({ label: 'Aandacht', value: String(caWarn), meta: 'report-only' });
    } else if (sectionName === 'identity' && tabKey === 'admin-risk') {
      const adminRoles = Array.isArray(data?.items) ? data.items : [];
      const adminWarn = Number(data?.summary?.warning || 0);
      cards.push({ label: 'Rollen', value: String(adminRoles.length || 0), meta: 'geanalyseerd' });
      cards.push({ label: 'Hoge bezetting', value: String(adminWarn), meta: 'aandacht' });
    } else if (sectionName === 'identity' && tabKey === 'break-glass') {
      const bgItems = Array.isArray(data?.items) ? data.items : [];
      const bgIssues = Number(data?.summary?.warning || 0);
      cards.push({ label: 'Accounts', value: String(bgItems.length || 0), meta: 'gedetecteerd' });
      cards.push({ label: 'Aandacht', value: String(bgIssues), meta: 'opvolgen' });
    } else if (sectionName === 'exchange' && tabKey === 'mailboxen') {
      const mailboxes = data?.mailboxes || [];
      const activeCount = mailboxes.filter((item) => item?.accountEnabled === true).length;
      const disabledCount = mailboxes.filter((item) => item?.accountEnabled === false).length;
      const syncedCount = mailboxes.filter((item) => item?.onPremSync).length;
      cards.push({ label: 'Mailboxen', value: String(Number(data?.count || mailboxes.length || 0) || 0), meta: 'tenantbreed' });
      cards.push({ label: 'Actief', value: String(activeCount || 0), meta: 'accounts' });
      cards.push({ label: 'Uitgeschakeld', value: String(disabledCount || 0), meta: 'accounts' });
      cards.push({ label: 'Synchronisatie', value: String(syncedCount || 0), meta: 'hybride' });
    } else if (sectionName === 'exchange' && tabKey === 'forwarding') {
      const forwarding = data?.forwarding || [];
      const externalCount = forwarding.filter((item) => String(item?.forwardTo || '').includes('@')).length;
      cards.push({ label: 'Doorsturen', value: String(Number(data?.count || forwarding.length || 0) || 0), meta: 'actief' });
      cards.push({ label: 'Externe adressen', value: String(externalCount || 0), meta: 'controleren' });
    } else if (sectionName === 'exchange' && tabKey === 'regels') {
      cards.push({ label: 'Regels', value: String(Number(data?.total || data?.rules?.length || 0) || 0), meta: 'totaal' });
      cards.push({ label: 'Verdacht', value: String(Number(data?.suspicious || 0) || 0), meta: 'actie nodig' });
      cards.push({ label: 'Mailboxen', value: String(Number(data?.usersChecked || 0) || 0), meta: 'gecontroleerd' });
    } else if (sectionName === 'apps' && tabKey === 'app-secrets') {
      const secretItems = Array.isArray(data?.items) ? data.items : [];
      cards.push({ label: 'Credentials', value: String(secretItems.length || 0), meta: 'geanalyseerd' });
      cards.push({ label: 'Verlopen', value: String(Number(data?.summary?.critical || 0) || 0), meta: 'kritiek' });
      cards.push({ label: 'Verloopt binnenkort', value: String(Number(data?.summary?.warning || 0) || 0), meta: 'aandacht' });
    } else if (sectionName === 'apps') {
      cards.push({ label: 'Apps', value: String(Number(data?.total || data?.apps?.length || 0) || 0), meta: 'registraties' });
      cards.push({ label: 'Verlopen', value: String(Number(data?.expired || 0) || 0), meta: 'kritiek' });
      cards.push({ label: 'Kritiek', value: String(Number(data?.critical || 0) || 0), meta: 'direct opvolgen' });
      cards.push({ label: 'Waarschuwing', value: String(Number(data?.warning || 0) || 0), meta: 'attentie' });
    } else if (sectionName === 'domains' && tabKey === 'domains-list') {
      cards.push({ label: 'Domeinen', value: String(Number(data?.count || data?.domains?.length || 0) || 0), meta: 'tenantbreed' });
      const initial = (data?.domains || []).filter((item) => item?.isInitial).length;
      cards.push({ label: 'OnMicrosoft', value: String(initial || 0), meta: 'initieel' });
    } else if (sectionName === 'domains' && tabKey === 'domains-analyse') {
      cards.push({ label: 'Score', value: Number.isFinite(Number(data?.score)) ? String(Number(data.score)) : '—', meta: `/ ${Number(data?.maxScore || 100) || 100}` });
      cards.push({ label: 'Label', value: data?.label ? String(data.label) : '—', meta: 'beoordeling' });
      const okChecks = (data?.checks || []).filter((item) => String(item?.status || '').toLowerCase() === 'ok').length;
      cards.push({ label: 'Checks OK', value: String(okChecks || 0), meta: 'DNS' });
    } else {
      if (Number.isFinite(total) && total > 0) {
        cards.push({ label: 'Totaal', value: String(total), meta: collection?.key || 'records' });
      }
      if (Number.isFinite(Number(data?.publicCount || 0)) && Number(data?.publicCount || 0) > 0) {
        cards.push({ label: 'Publiek', value: String(Number(data.publicCount)), meta: 'zichtbaar' });
      }
      if (Number.isFinite(Number(data?.currentScore ?? data?.score))) {
        const score = Number(data.currentScore ?? data.score);
        const max = Number(data?.maxScore || 100);
        cards.push({ label: 'Score', value: String(score), meta: `/ ${max}` });
      }
      if (Number.isFinite(Number(data?.guestCount || 0)) && Number(data?.guestCount || 0) >= 0 && (data?.guestCount || data?.guests)) {
        cards.push({ label: 'Gasten', value: String(Number(data.guestCount || data.guests?.length || 0)), meta: 'accounts' });
      }
    }
    if (cards.length === 0 && collection?.items?.length) {
      cards.push({ label: 'Records', value: String(collection.items.length), meta: collection.key || 'items' });
    }
    return cards.slice(0, 4);
  }

  function renderServiceOverview(sectionName, tabKey, data, collection) {
    const cards = getServiceOverviewCards(sectionName, tabKey, data, collection);
    if (!cards.length) return '';
    return `
      <div class="workspace-service-overview">
        ${cards.map((card) => `
          <article class="workspace-service-card workspace-service-card--${metricTone(card.value, card.label)}">
            <span class="workspace-service-label">${liveEscapeHtml(card.label)}</span>
            <strong class="workspace-service-value">${liveEscapeHtml(card.value)}</strong>
            <span class="workspace-service-meta">${liveEscapeHtml(card.meta || '')}</span>
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderIdentityPatternCards(cards) {
    if (!cards.length) return '';
    return `
      <section class="gb-insights-shell live-identity-shell" aria-label="Werkruimte inzichten">
        <div class="gb-insights-intro">
          <div>
            <p class="gb-insights-kicker">Niveau 2 — Inzichten</p>
            <h3>Gebruik de kaarten als directe ingang naar de belangrijkste gegevens van dit subhoofdstuk.</h3>
          </div>
          <p class="gb-insights-copy">De inhoud hieronder blijft in dezelfde werkkaartstructuur en details openen rechts in het bestaande paneel.</p>
        </div>
        <div class="gb-insight-grid">
          ${cards.map((card, index) => {
            const tone = metricTone(card.value, card.label);
            const statusLabel = tone === 'good' ? 'In orde' : tone === 'warn' ? 'Aandacht' : tone === 'error' ? 'Actie nodig' : 'In beeld';
            return `
              <article class="gb-insight-card${index === 0 ? ' is-accent' : ''} status-${liveEscapeHtml(tone)}">
                <span class="gb-insight-top">
                  <span class="gb-insight-icon" aria-hidden="true">${liveEscapeHtml((card.label || '?').charAt(0).toUpperCase())}</span>
                  <span class="gb-insight-badges">
                    <span class="gb-insight-source">${liveEscapeHtml(card.label || 'Inzicht')}</span>
                    <span class="gb-insight-status status-${liveEscapeHtml(tone)}">${liveEscapeHtml(statusLabel)}</span>
                  </span>
                </span>
                <span class="gb-insight-label">${liveEscapeHtml(card.label || 'Inzicht')}</span>
                <strong>${liveEscapeHtml(card.value ?? '—')}</strong>
                <span class="gb-insight-meta">${liveEscapeHtml(card.meta || 'Geen aanvullende context')}</span>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderIdentityPatternWorkspace(sectionName, tabKey, data, collection) {
    const tab = getTabConfig(sectionName, tabKey) || {};
    const cards = getServiceOverviewCards(sectionName, tabKey, data, collection);
    const bodyHtml = renderSectionBody(sectionName, tabKey, data, collection);
    const totalCount = Number(data?.total || data?.count || (collection?.items?.length || 0));
    const countsHtml = totalCount > 0
      ? `<span class="gb-wc-chip gb-wc-chip--neutral">${liveEscapeHtml(formatNumber(totalCount))} records</span>`
      : '';
    const tone = cards.some((card) => metricTone(card.value, card.label) === 'error')
      ? 'error'
      : cards.some((card) => metricTone(card.value, card.label) === 'warn')
        ? 'warn'
        : 'good';
    return `
      ${renderIdentityPatternCards(cards)}
      <div class="gb-workstack live-workstack">
        <section class="gb-workcard is-open" data-tone="${liveEscapeHtml(tone)}">
          <button type="button" class="gb-workcard-toggle" aria-expanded="true">
            <span class="gb-workcard-headline">
              <span class="gb-workcard-kicker">Werkkaart</span>
              <span class="gb-workcard-title">${liveEscapeHtml(tab.title || 'Overzicht')}</span>
            </span>
            <span class="gb-workcard-counts">${countsHtml}</span>
            <span class="gb-workcard-chevron" aria-hidden="true">⌄</span>
          </button>
          <div class="gb-workcard-body" style="display:block">
            <div class="gb-workcard-body-inner">
              ${bodyHtml}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  const _EMPTY_STATE_MSG = {
    'intune:overzicht':      'Geen Intune-overzicht beschikbaar. Controleer of de tenant Intune-licenties heeft.',
    'intune:apparaten':      'Geen apparaten gevonden. Voer een assessment uit of verifieer dat apparaten zijn ingeschreven.',
    'intune:compliance':     'Geen compliancebeleid gevonden voor deze tenant.',
    'intune:configuratie':   'Geen configuratieprofielen gevonden voor deze tenant.',
    'intune:geschiedenis':   'Geen Intune-historiedata beschikbaar.',
    'backup:overzicht':      'Geen Microsoft 365 Backup-data beschikbaar. Controleer of Backup actief is voor deze tenant.',
    'backup:onedrive':       'Geen OneDrive-backup instellingen gevonden.',
    'backup:exchange':       'Geen Exchange-backup instellingen gevonden.',
    'domains:domains-list':  'Geen domeinen gevonden. Voer een assessment uit om domeindata te laden.',
    'domains:domains-analyse':'Geen domeinanalyse beschikbaar. Ververs de domeinlijst eerst.',
    'exchange:mailboxen':    'Geen mailboxen gevonden. Voer een assessment uit of controleer de Exchange-verbinding.',
    'exchange:forwarding':   'Geen actieve e-mail forwarding gevonden — dit is een goed teken.',
    'exchange:regels':       'Geen inbox-regels gevonden of alle regels zijn normaal.',
    'alerts:auditlog':       'Geen auditloggebeurtenissen gevonden in de geselecteerde periode.',
    'alerts:securescr':      'Geen beveiligingsscore beschikbaar. Ververs of controleer de verbinding.',
    'alerts:signins':        'Geen aanmeldingsactiviteit gevonden in de geselecteerde periode.',
    'compliance:zerotrust':  'Zero Trust Assessment nog niet uitgevoerd. Gebruik de knop om een assessment te starten.',
  };

  function renderTable(collection, sectionName, tabKey) {
    if (!collection?.items?.length) {
      const key = sectionName && tabKey ? `${sectionName}:${tabKey}` : null;
      const msg = (key && _EMPTY_STATE_MSG[key]) || 'Geen records gevonden voor dit onderdeel.';
      return `<p class="live-module-empty">${liveEscapeHtml(msg)}</p>`;
    }
    const sample = collection.items.find((item) => item && typeof item === 'object') || {};
    const columns = Object.keys(sample).slice(0, 8);
    return `
      <div class="assessment-table-wrap">
        <table class="assessment-table">
          <thead>
            <tr>${columns.map((column) => `<th>${liveEscapeHtml(column)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${collection.items.slice(0, 100).map((item) => `
              <tr>
                ${columns.map((column) => `<td>${liveEscapeHtml(normalizeScalar(item[column]))}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const teamsUiState = {
    search: '',
    filter: 'all',
  };

  function applyTeamsFilters() {
    const rows = Array.from(document.querySelectorAll('#teamsSection [data-teams-row="team"]'));
    if (!rows.length) return;
    const query = String(teamsUiState.search || '').trim().toLowerCase();
    const filter = teamsUiState.filter || 'all';
    let visibleCount = 0;
    rows.forEach((row) => {
      const haystack = String(row.dataset.search || '').toLowerCase();
      const visibility = String(row.dataset.visibility || 'private');
      const hasGuests = row.dataset.guests === 'true';
      const dynamic = row.dataset.dynamic === 'true';
      const hasRisk = row.dataset.risk === 'true';
      const matchesQuery = !query || haystack.includes(query);
      const matchesFilter = filter === 'all'
        || (filter === 'private' && visibility !== 'public')
        || (filter === 'public' && visibility === 'public')
        || (filter === 'guests' && hasGuests)
        || (filter === 'dynamic' && dynamic)
        || (filter === 'risk' && hasRisk);
      const visible = matchesQuery && matchesFilter;
      row.style.display = visible ? '' : 'none';
      if (visible) visibleCount += 1;
    });
    const countNode = document.getElementById('teamsVisibleCount');
    if (countNode) countNode.textContent = `${formatNumber(visibleCount)} van ${formatNumber(rows.length)} teams`;
    document.querySelectorAll('#teamsSection [data-teams-filter]').forEach((button) => {
      button.classList.toggle('active', button.dataset.teamsFilter === filter);
    });
  }

  function renderTeamsBody(data) {
    const teams = (data?.teams || []).filter((item) => item && typeof item === 'object');
    const control = getControlPayload(data, 'teams-with-guests');
    if (!teams.length) return '<p class="live-module-empty">Geen Teams-data beschikbaar voor deze tenant.</p>';
    const riskyTeams = getControlAffectedSet(control);
    const guestTotal = teams.reduce((sum, item) => sum + (Number(item.guestCount) || 0), 0);
    const ownerTotal = teams.reduce((sum, item) => sum + (Number(item.ownerCount) || 0), 0);
    const privateCount = teams.filter((item) => String(item.visibility || '').toLowerCase() !== 'public').length;
    const dynamicCount = teams.filter((item) => item.isDynamic).length;
    const workcardCounts = [
      exchangeChip(`${formatNumber(teams.length)} teams`, 'neutral'),
      privateCount ? exchangeChip(`${formatNumber(privateCount)} privaat`, 'ok') : '',
      guestTotal ? exchangeChip(`${formatNumber(guestTotal)} gasten`, 'warn') : '',
      dynamicCount ? exchangeChip(`${formatNumber(dynamicCount)} dynamisch`, 'neutral') : '',
    ].filter(Boolean).join('');
    return `
      ${renderControlSummaryBanner(control, { title: 'Teams met gasten' })}
      <section class="gb-insights-shell ex-identity-shell" aria-label="Teams inzichten">
        <div class="gb-insights-intro">
          <div>
            <p class="gb-insights-kicker">Niveau 2 — Inzichten</p>
            <h3>Open een werkkaart om direct door Teams, eigenaren en gasten te navigeren.</h3>
          </div>
          <p class="gb-insights-copy">De layout volgt dezelfde structuur als Gebruikers & Licenties met snelle filters en rij-details in het rechterpaneel.</p>
        </div>
        <div class="gb-insight-grid">
          <button type="button" class="gb-insight-card is-accent status-good" data-teams-filter="all">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">T</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Teams</span>
                <span class="gb-insight-status status-good">In beeld</span>
              </span>
            </span>
            <span class="gb-insight-label">Alle teams</span>
            <strong>${liveEscapeHtml(formatNumber(teams.length))}</strong>
            <span class="gb-insight-meta">Totaal binnen tenant</span>
          </button>
          <button type="button" class="gb-insight-card status-good" data-teams-filter="private">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">P</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Zichtbaarheid</span>
                <span class="gb-insight-status status-good">Privaat</span>
              </span>
            </span>
            <span class="gb-insight-label">Privaat</span>
            <strong>${liveEscapeHtml(formatNumber(privateCount))}</strong>
            <span class="gb-insight-meta">Niet publiek zichtbaar</span>
          </button>
          <button type="button" class="gb-insight-card ${guestTotal > 0 ? 'status-warn' : 'status-good'}" data-teams-filter="guests">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">G</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Externen</span>
                <span class="gb-insight-status ${guestTotal > 0 ? 'status-warn' : 'status-good'}">${guestTotal > 0 ? 'Aandacht' : 'In orde'}</span>
              </span>
            </span>
            <span class="gb-insight-label">Gastleden</span>
            <strong>${liveEscapeHtml(formatNumber(guestTotal))}</strong>
            <span class="gb-insight-meta">Externe leden in Teams</span>
          </button>
          <button type="button" class="gb-insight-card status-neutral" data-teams-filter="dynamic">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">D</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Automatisering</span>
                <span class="gb-insight-status status-neutral">Dynamisch</span>
              </span>
            </span>
            <span class="gb-insight-label">Dynamische teams</span>
            <strong>${liveEscapeHtml(formatNumber(dynamicCount))}</strong>
            <span class="gb-insight-meta">Membership rules actief</span>
          </button>
        </div>
      </section>
      <div class="gb-workstack ex-workstack">
        <section class="gb-workcard is-open" data-tone="neutral">
          <button type="button" class="gb-workcard-toggle" aria-expanded="true">
            <span class="gb-workcard-headline">
              <span class="gb-workcard-kicker">Werkkaart</span>
              <span class="gb-workcard-title">Teams overzicht</span>
            </span>
            <span class="gb-workcard-counts">${workcardCounts}</span>
            <span class="gb-workcard-chevron" aria-hidden="true">⌄</span>
          </button>
          <div class="gb-workcard-body" style="display:block">
            <div class="gb-workcard-body-inner">
              <div class="gb-toolbar ex-toolbar-identity">
                <input
                  type="search"
                  id="teamsSearchInput"
                  class="gb-search ex-search-identity"
                  placeholder="Zoek op team, e-mail, eigenaar of omschrijving..."
                  value="${liveEscapeHtml(teamsUiState.search)}"
                >
                <div class="gb-filter-tabs ex-filter-tabs-identity">
                  <button type="button" class="gb-filter-tab${teamsUiState.filter === 'all' ? ' active' : ''}" data-teams-filter="all">Alle</button>
                  <button type="button" class="gb-filter-tab${teamsUiState.filter === 'private' ? ' active' : ''}" data-teams-filter="private">Privaat</button>
                  <button type="button" class="gb-filter-tab${teamsUiState.filter === 'public' ? ' active' : ''}" data-teams-filter="public">Publiek</button>
                  <button type="button" class="gb-filter-tab${teamsUiState.filter === 'guests' ? ' active' : ''}" data-teams-filter="guests">Gasten</button>
                  <button type="button" class="gb-filter-tab${teamsUiState.filter === 'dynamic' ? ' active' : ''}" data-teams-filter="dynamic">Dynamisch</button>
                  <button type="button" class="gb-filter-tab${teamsUiState.filter === 'risk' ? ' active' : ''}" data-teams-filter="risk">Aandacht</button>
                </div>
                <div class="gb-toolbar-info" id="teamsVisibleCount">${liveEscapeHtml(formatNumber(teams.length))} van ${liveEscapeHtml(formatNumber(teams.length))} teams</div>
              </div>
              <div class="gb-table-wrap assessment-table-wrap live-entity-table-wrap">
                <table class="gb-table assessment-table live-entity-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Zichtbaarheid</th>
              <th>Leden</th>
              <th>Owners</th>
              <th>Gasten</th>
              <th>Aangemaakt</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${teams.slice(0, 200).map((team) => {
              const visibility = String(team.visibility || 'Private');
              const visibilityClass = visibility.toLowerCase() === 'public' ? 'live-badge-warn' : 'live-badge-ok';
              const riskKey = String(team.mail || team.displayName || team.id || '').trim().toLowerCase();
              const hasGuestRisk = riskyTeams.has(riskKey) || Number(team.guestCount || 0) > 0;
              const detailId = registerDetailEntry({
                kicker: 'Microsoft Teams',
                title: team.displayName || team.mail || 'Teamdetail',
                data: team,
                bodyHtml: typeof window.renderSideRailTemplate === 'function'
                  ? window.renderSideRailTemplate({
                      tone: hasGuestRisk ? 'warn' : 'good',
                      statusLabel: hasGuestRisk ? 'Aandacht' : 'In orde',
                      summaryCards: [
                        { label: 'Zichtbaarheid', value: visibility, meta: team.isDynamic ? 'dynamisch team' : 'standaard team', tone: visibility.toLowerCase() === 'public' ? 'warn' : 'good' },
                        { label: 'Leden', value: formatNumber(team.memberCount || 0), meta: 'teamleden', tone: 'neutral' },
                        { label: 'Owners', value: formatNumber(team.ownerCount || 0), meta: 'eigenaren', tone: 'neutral' },
                        { label: 'Gasten', value: formatNumber(team.guestCount || 0), meta: hasGuestRisk ? 'controle nodig' : 'geen externen', tone: hasGuestRisk ? 'warn' : 'good' },
                      ],
                      sections: [
                        {
                          title: 'Teaminformatie',
                          badge: visibility,
                          tone: visibility.toLowerCase() === 'public' ? 'warn' : 'good',
                          bodyHtml: `
                            <div class="ex-detail-grid">
                              <div class="ex-detail-item"><label>Naam</label><span>${liveEscapeHtml(team.displayName || '—')}</span></div>
                              <div class="ex-detail-item"><label>E-mail</label><span>${liveEscapeHtml(team.mail || '—')}</span></div>
                              <div class="ex-detail-item"><label>Beschrijving</label><span>${liveEscapeHtml(team.description || '—')}</span></div>
                              <div class="ex-detail-item"><label>Aangemaakt</label><span>${liveEscapeHtml(formatDate(team.createdAt))}</span></div>
                              <div class="ex-detail-item"><label>Dynamisch</label><span>${team.isDynamic ? 'Ja' : 'Nee'}</span></div>
                              <div class="ex-detail-item"><label>Gastleden</label><span>${liveEscapeHtml(formatNumber(team.guestCount || 0))}</span></div>
                            </div>`,
                        },
                      ],
                      findings: hasGuestRisk ? [{
                        tone: 'warn',
                        label: 'Aandacht',
                        title: 'Gastgebruikers in team',
                        body: `${formatNumber(team.guestCount || 0)} gastgebruikers gevonden. Controleer of externe toegang nog nodig is.`,
                      }] : [{
                        tone: 'good',
                        label: 'Goed',
                        title: 'Geen gastgebruikers',
                        body: 'Er zijn geen externe gasten voor dit team gedetecteerd.',
                      }],
                      actions: [{
                        title: 'Teamcontrole',
                        body: hasGuestRisk
                          ? 'Controleer team-eigenaren, gastleden en externe samenwerking. Verwijder overbodige gasten.'
                          : 'Controleer alleen periodiek of dit team nog actief en juist beheerd is.',
                      }],
                    })
                  : '',
              });
              return `
                <tr
                  data-teams-row="team"
                  data-visibility="${liveEscapeHtml(visibility.toLowerCase())}"
                  data-guests="${Number(team.guestCount || 0) > 0 ? 'true' : 'false'}"
                  data-dynamic="${team.isDynamic ? 'true' : 'false'}"
                  data-risk="${hasGuestRisk ? 'true' : 'false'}"
                  data-search="${liveEscapeHtml([
                    team.displayName,
                    team.mail,
                    team.description,
                    visibility,
                    String(team.memberCount || 0),
                    String(team.ownerCount || 0),
                    String(team.guestCount || 0),
                  ].filter(Boolean).join(' '))}"
                >
                  <td>
                    <div class="live-entity-main">
                      <strong>${liveEscapeHtml(team.displayName || team.mail || 'Onbekend team')}</strong>
                      <span>${liveEscapeHtml(team.mail || 'Geen teamadres')}</span>
                      ${team.description ? `<p>${liveEscapeHtml(team.description)}</p>` : ''}
                    </div>
                  </td>
                  <td>
                    <div class="live-pill-stack">
                      <span class="live-badge ${visibilityClass}">${liveEscapeHtml(visibility)}</span>
                      ${team.isDynamic ? '<span class="live-badge live-badge-info">Dynamisch</span>' : ''}
                    </div>
                  </td>
                  <td>${liveEscapeHtml(formatNumber(team.memberCount || 0))}</td>
                  <td>${liveEscapeHtml(formatNumber(team.ownerCount || 0))}</td>
                  <td>${liveEscapeHtml(formatNumber(team.guestCount || 0))}</td>
                  <td>${liveEscapeHtml(formatDate(team.createdAt))}</td>
                  <td><button type="button" class="live-detail-btn" data-live-detail-id="${liveEscapeHtml(detailId)}">Meer info</button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function exchangeStatusMeta(value) {
    if (value === true) return { label: 'Actief', className: 'live-badge-ok' };
    if (value === false) return { label: 'Uitgeschakeld', className: 'live-badge-crit' };
    return { label: 'Onbekend', className: 'live-badge-neutral' };
  }

  const exchangeMailboxUiState = {
    search: '',
    filter: 'all',
  };

  function exchangeToneClass(value, mode = 'status') {
    if (mode === 'forwarding') return value > 0 ? 'status-warn' : 'status-good';
    if (value > 0 && mode === 'disabled') return 'status-error';
    if (value > 0 && mode === 'unknown') return 'status-warn';
    return 'status-good';
  }

  function exchangeChip(label, tone = 'neutral') {
    return `<span class="gb-wc-chip gb-wc-chip--${liveEscapeHtml(tone)}">${liveEscapeHtml(label)}</span>`;
  }

  function getControlPayload(data, controlKey) {
    const payload = data?._controls?.[controlKey];
    return payload && typeof payload === 'object' ? payload : null;
  }

  function getControlTotal(data, controlKey) {
    return Number(getControlPayload(data, controlKey)?.summary?.total || 0) || 0;
  }

  function getControlAffectedSet(payload) {
    const values = new Set();
    (payload?.items || []).forEach((item) => {
      (item?.affected_objects || []).forEach((entry) => {
        const normalized = String(entry || '').trim().toLowerCase();
        if (normalized) values.add(normalized);
      });
    });
    return values;
  }

  function asValidDate(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  function ageInDays(value) {
    const parsed = asValidDate(value);
    if (!parsed) return null;
    const diffMs = Date.now() - parsed.getTime();
    return diffMs < 0 ? 0 : Math.floor(diffMs / 86400000);
  }

  function getRecencySla(days, opts = {}) {
    const overdue = Number(opts.overdueDays || 180);
    const warn = Number(opts.warnDays || 90);
    if (days === null) return { label: 'SLA onbekend', className: 'live-badge-neutral' };
    if (days >= overdue) return { label: `Over SLA (${days}d)`, className: 'live-badge-crit' };
    if (days >= warn) return { label: `Binnen 7d (${days}d)`, className: 'live-badge-warn' };
    return { label: `Op schema (${days}d)`, className: 'live-badge-ok' };
  }

  function renderControlSummaryBanner(payload, opts = {}) {
    if (!payload || !Array.isArray(payload.items) || !payload.items.length) return '';
    const title = opts.title || 'Controle';
    const critical = Number(payload.summary?.critical || 0) || 0;
    const warning = Number(payload.summary?.warning || 0) || 0;
    const source = payload.source === 'live' ? 'Live data' : payload.source === 'assessment_snapshot' ? 'Assessment' : 'Niet beschikbaar';
    const tone = critical > 0 ? 'error' : warning > 0 ? 'warn' : 'good';
    const body = critical > 0
      ? `${critical} kritieke en ${warning} aandachtspunt(en) gevonden.`
      : warning > 0
        ? `${warning} aandachtspunt(en) gevonden.`
        : 'Geen directe afwijkingen gevonden.';
    return `
      <div class="snapshot-banner snapshot-banner--${liveEscapeHtml(tone)}">
        <strong>${liveEscapeHtml(title)}</strong> · ${liveEscapeHtml(body)} Bron: ${liveEscapeHtml(source)}.
      </div>
    `;
  }

  function applyExchangeMailboxFilters() {
    const rows = Array.from(document.querySelectorAll('#exchangeSection [data-ex-row="mailbox"]'));
    if (!rows.length) return;
    const query = String(exchangeMailboxUiState.search || '').trim().toLowerCase();
    const filter = exchangeMailboxUiState.filter || 'all';
    let visibleCount = 0;
    rows.forEach((row) => {
      const haystack = String(row.dataset.search || '').toLowerCase();
      const status = String(row.dataset.status || 'unknown');
      const forwarding = row.dataset.forwarding === 'true';
      const riskyRule = row.dataset.ruleRisk === 'true';
      const riskyPermission = row.dataset.permissionRisk === 'true';
      const matchesQuery = !query || haystack.includes(query);
      const matchesFilter = filter === 'all'
        || (filter === 'active' && status === 'active')
        || (filter === 'disabled' && status === 'disabled')
        || (filter === 'unknown' && status === 'unknown')
        || (filter === 'forwarding' && forwarding)
        || (filter === 'rules' && riskyRule)
        || (filter === 'permissions' && riskyPermission);
      const visible = matchesQuery && matchesFilter;
      row.style.display = visible ? '' : 'none';
      if (visible) visibleCount += 1;
    });
    const countNode = document.getElementById('exchangeMailboxVisibleCount');
    if (countNode) countNode.textContent = `${formatNumber(visibleCount)} van ${formatNumber(rows.length)} mailboxen`;
    document.querySelectorAll('#exchangeSection [data-ex-filter]').forEach((button) => {
      button.classList.toggle('active', button.dataset.exFilter === filter);
    });
    updateExchangeBulkSelectionState();
  }

  function updateExchangeBulkSelectionState() {
    const allRows = Array.from(document.querySelectorAll('#exchangeSection [data-ex-row="mailbox"]'));
    const visibleRows = allRows.filter((row) => row.style.display !== 'none');
    const visibleChecks = visibleRows.map((row) => row.querySelector('[data-ex-select]')).filter(Boolean);
    const selectedChecks = Array.from(document.querySelectorAll('#exchangeSection [data-ex-select]:checked'));
    const selectedVisible = visibleChecks.filter((checkbox) => checkbox.checked).length;
    const counter = document.getElementById('exchangeBulkSelectionCount');
    if (counter) counter.textContent = `${formatNumber(selectedChecks.length)} geselecteerd`;
    const master = document.getElementById('exchangeSelectAll');
    if (master) {
      master.checked = visibleChecks.length > 0 && selectedVisible === visibleChecks.length;
      master.indeterminate = selectedVisible > 0 && selectedVisible < visibleChecks.length;
    }
  }

  function renderExchangeMailboxesBody(data) {
    if (typeof window !== 'undefined') window.__denjoyExchangeMailboxContext = data || null;
    const mailboxes = (data?.mailboxes || []).filter((item) => item && typeof item === 'object');
    if (!mailboxes.length) return '<p class="live-module-empty">Geen mailboxen gevonden. Voer een assessment uit of controleer de Exchange-verbinding.</p>';
    const forwardingControl = getControlPayload(data, 'mail-forwarding-detection');
    const rulesControl = getControlPayload(data, 'inbox-rule-risk-detection');
    const permControl = getControlPayload(data, 'mailbox-permission-governance');
    const riskyForwarding = getControlTotal(data, 'mail-forwarding-detection');
    const riskyRules = getControlTotal(data, 'inbox-rule-risk-detection');
    const riskyPermissions = getControlTotal(data, 'mailbox-permission-governance');
    const riskyMailboxes = getControlAffectedSet(forwardingControl);
    const riskyRuleMailboxes = getControlAffectedSet(rulesControl);
    const riskyPermissionMailboxes = getControlAffectedSet(permControl);
    const activeCount = mailboxes.filter((item) => item?.accountEnabled === true).length;
    const disabledCount = mailboxes.filter((item) => item?.accountEnabled === false).length;
    const unknownCount = mailboxes.filter((item) => item?.accountEnabled !== true && item?.accountEnabled !== false).length;
    const forwardingCount = riskyForwarding || mailboxes.filter((item) => item?.forwarding?.enabled).length;
    const openTone = (forwardingCount > 0 || riskyRules > 0 || riskyPermissions > 0 || disabledCount > 0) ? 'error' : unknownCount > 0 ? 'warn' : 'good';
    const isLive = data?._source === 'live';
    const workcardCounts = [
      exchangeChip(`${formatNumber(mailboxes.length)} mailboxen`, 'neutral'),
      activeCount ? exchangeChip(`${formatNumber(activeCount)} actief`, 'ok') : '',
      disabledCount ? exchangeChip(`${formatNumber(disabledCount)} uitgeschakeld`, disabledCount > 2 ? 'error' : 'warn') : '',
      unknownCount ? exchangeChip(`${formatNumber(unknownCount)} onbekend`, 'warn') : '',
      forwardingCount ? exchangeChip(`${formatNumber(forwardingCount)} doorsturen`, 'warn') : '',
      riskyRules ? exchangeChip(`${formatNumber(riskyRules)} regels`, riskyRules > 2 ? 'error' : 'warn') : '',
      riskyPermissions ? exchangeChip(`${formatNumber(riskyPermissions)} rechten`, riskyPermissions > 2 ? 'error' : 'warn') : '',
    ].filter(Boolean).join('');
    return `
      ${renderControlSummaryBanner(forwardingControl, { title: 'Doorstuurcontrole' })}
      ${renderControlSummaryBanner(rulesControl, { title: 'Inboxregelcontrole' })}
      ${renderControlSummaryBanner(permControl, { title: 'Mailboxrechten governance' })}
      <section class="gb-insights-shell ex-identity-shell" aria-label="Exchange inzichten">
        <div class="gb-insights-intro">
          <div>
            <p class="gb-insights-kicker">Niveau 2 — Inzichten</p>
            <h3>Open een werkkaart om direct door te gaan naar mailboxen of verdachte forwarding.</h3>
          </div>
          <p class="gb-insights-copy">Gebruik de kaarten als snelle ingang. Rij-details openen in het bestaande slide-in paneel.</p>
        </div>
        <div class="gb-insight-grid">
          <button type="button" class="gb-insight-card is-accent ${openTone}" data-ex-filter="all">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">M</span>
                <span class="gb-insight-badges">
                <span class="gb-insight-source">${liveEscapeHtml(isLive ? 'Live data' : 'Assessment')}</span>
                <span class="gb-insight-status ${openTone}">${disabledCount > 0 ? 'Actie nodig' : unknownCount > 0 ? 'Aandacht' : 'In orde'}</span>
              </span>
            </span>
            <span class="gb-insight-label">Alle mailboxen</span>
            <strong>${liveEscapeHtml(formatNumber(mailboxes.length))}</strong>
            <span class="gb-insight-meta">Open het totale mailboxoverzicht</span>
          </button>
          <button type="button" class="gb-insight-card ${exchangeToneClass(activeCount)}" data-ex-filter="active">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">A</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Accountstatus</span>
                <span class="gb-insight-status status-good">In orde</span>
              </span>
            </span>
            <span class="gb-insight-label">Actief</span>
            <strong>${liveEscapeHtml(formatNumber(activeCount))}</strong>
            <span class="gb-insight-meta">Toon alleen actieve mailboxen</span>
          </button>
          <button type="button" class="gb-insight-card ${forwardingCount > 0 ? 'status-warn' : 'status-good'}" data-ex-filter="forwarding">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">↗</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Doorsturen</span>
                <span class="gb-insight-status ${forwardingCount > 0 ? 'status-warn' : 'status-good'}">${forwardingCount > 0 ? 'Aandacht' : 'In orde'}</span>
              </span>
            </span>
            <span class="gb-insight-label">Doorsturen actief</span>
            <strong>${liveEscapeHtml(formatNumber(forwardingCount))}</strong>
            <span class="gb-insight-meta">Open mailboxen met actieve forwarding</span>
          </button>
          <button type="button" class="gb-insight-card ${(riskyRules + riskyPermissions) > 0 ? 'status-error' : 'status-good'}" data-ex-filter="permissions">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">P</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Mailboxrechten</span>
                <span class="gb-insight-status ${(riskyRules + riskyPermissions) > 0 ? 'status-error' : 'status-good'}">${(riskyRules + riskyPermissions) > 0 ? 'Actie nodig' : 'In orde'}</span>
              </span>
            </span>
            <span class="gb-insight-label">Rechten met risico</span>
            <strong>${liveEscapeHtml(formatNumber(riskyPermissions))}</strong>
            <span class="gb-insight-meta">Open mailboxen met gedeelde of ruime rechten</span>
          </button>
        </div>
      </section>
      <div class="gb-workstack ex-workstack">
        <section class="gb-workcard is-open" data-tone="${liveEscapeHtml(openTone.replace('status-', '') || 'neutral')}">
          <button type="button" class="gb-workcard-toggle" aria-expanded="true">
            <span class="gb-workcard-headline">
              <span class="gb-workcard-kicker">Werkkaart</span>
              <span class="gb-workcard-title">Mailboxoverzicht</span>
            </span>
            <span class="gb-workcard-counts">${workcardCounts}</span>
            <span class="gb-workcard-chevron" aria-hidden="true">⌄</span>
          </button>
          <div class="gb-workcard-body" style="display:block">
            <div class="gb-workcard-body-inner">
              <div class="gb-toolbar ex-toolbar-identity">
                <input
                  type="search"
                  id="exchangeMailboxSearch"
                  class="gb-search ex-search-identity"
                  placeholder="Zoek op mailbox, UPN of e-mail..."
                  value="${liveEscapeHtml(exchangeMailboxUiState.search)}"
                >
                <div class="gb-filter-tabs ex-filter-tabs-identity">
                  <button type="button" class="gb-filter-tab${exchangeMailboxUiState.filter === 'all' ? ' active' : ''}" data-ex-filter="all">Alle</button>
                  <button type="button" class="gb-filter-tab${exchangeMailboxUiState.filter === 'active' ? ' active' : ''}" data-ex-filter="active">Actief</button>
                  <button type="button" class="gb-filter-tab${exchangeMailboxUiState.filter === 'disabled' ? ' active' : ''}" data-ex-filter="disabled">Uitgeschakeld</button>
                  <button type="button" class="gb-filter-tab${exchangeMailboxUiState.filter === 'unknown' ? ' active' : ''}" data-ex-filter="unknown">Onbekend</button>
                  <button type="button" class="gb-filter-tab${exchangeMailboxUiState.filter === 'forwarding' ? ' active' : ''}" data-ex-filter="forwarding">Doorsturen</button>
                  <button type="button" class="gb-filter-tab${exchangeMailboxUiState.filter === 'rules' ? ' active' : ''}" data-ex-filter="rules">Inboxregels</button>
                  <button type="button" class="gb-filter-tab${exchangeMailboxUiState.filter === 'permissions' ? ' active' : ''}" data-ex-filter="permissions">Rechten</button>
                </div>
                <div class="gb-toolbar-info" id="exchangeMailboxVisibleCount">${liveEscapeHtml(formatNumber(mailboxes.length))} van ${liveEscapeHtml(formatNumber(mailboxes.length))} mailboxen</div>
                <button type="button" class="live-module-refresh live-module-inline-btn" data-ex-bulk-action="select-risk">Selecteer aandacht</button>
                <button type="button" class="live-module-refresh live-module-inline-btn" data-ex-bulk-action="review-selected">Review selectie</button>
                <button type="button" class="live-module-refresh live-module-inline-btn" data-ex-bulk-action="export-selected">Export selectie</button>
                <div class="gb-toolbar-info" id="exchangeBulkSelectionCount">0 geselecteerd</div>
              </div>
              <div class="gb-table-wrap assessment-table-wrap live-entity-table-wrap">
                <table class="gb-table assessment-table live-entity-table">
          <thead>
            <tr>
              <th><input type="checkbox" id="exchangeSelectAll" aria-label="Selecteer zichtbare mailboxen"></th>
              <th>Mailbox</th>
              <th>E-mail</th>
              <th>Severity</th>
              <th>SLA</th>
              <th>Status</th>
              <th>Type</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${mailboxes.slice(0, 250).map((item) => {
              const status = exchangeStatusMeta(item.accountEnabled);
              const typeLabel = item.recipientTypeDetails || (item.onPremSync ? 'Synchronisatie' : 'Mailbox');
              const id = item.id || item.mail || item.primarySmtpAddress || item.upn || '';
              const statusKey = item.accountEnabled === true ? 'active' : item.accountEnabled === false ? 'disabled' : 'unknown';
              const riskKey = String(item.mail || item.primarySmtpAddress || item.upn || item.userPrincipalName || '').trim().toLowerCase();
              const hasForwarding = item?.forwarding?.enabled || riskyMailboxes.has(riskKey);
              const hasRuleRisk = riskyRuleMailboxes.has(riskKey);
              const hasPermissionRisk = riskyPermissionMailboxes.has(riskKey);
              const severityScore = (hasForwarding ? 1 : 0) + (hasRuleRisk ? 1 : 0) + (hasPermissionRisk ? 1 : 0) + (statusKey === 'disabled' ? 1 : 0);
              const severityClass = severityScore >= 2 ? 'live-badge-crit' : severityScore === 1 ? 'live-badge-warn' : 'live-badge-ok';
              const severityLabel = severityScore >= 2 ? 'Kritiek' : severityScore === 1 ? 'Aandacht' : 'In orde';
              const slaLabel = severityScore >= 2 ? 'Binnen 24u' : severityScore === 1 ? 'Binnen 7d' : 'Monitoring';
              const slaClass = severityScore >= 2 ? 'live-badge-crit' : severityScore === 1 ? 'live-badge-warn' : 'live-badge-ok';
              const searchValue = [
                item.displayName,
                item.mail,
                item.primarySmtpAddress,
                item.upn,
                item.userPrincipalName,
                typeLabel,
              ].filter(Boolean).join(' ');
              return `
                <tr
                  data-ex-row="mailbox"
                  data-status="${liveEscapeHtml(statusKey)}"
                  data-forwarding="${hasForwarding ? 'true' : 'false'}"
                  data-rule-risk="${hasRuleRisk ? 'true' : 'false'}"
                  data-permission-risk="${hasPermissionRisk ? 'true' : 'false'}"
                  data-risk="${severityScore > 0 ? 'true' : 'false'}"
                  data-search="${liveEscapeHtml(searchValue)}"
                >
                  <td><input type="checkbox" data-ex-select aria-label="Selecteer mailbox ${liveEscapeHtml(item.displayName || item.mail || 'onbekend')}" data-name="${liveEscapeHtml(item.displayName || item.mail || '')}" data-mail="${liveEscapeHtml(item.mail || item.primarySmtpAddress || '')}" data-severity="${liveEscapeHtml(severityLabel)}" data-risk="${severityScore > 0 ? 'true' : 'false'}"></td>
                  <td>
                    <div class="live-entity-primary">
                      <strong>${liveEscapeHtml(item.displayName || item.mail || 'Mailbox')}</strong>
                        <span class="live-mail-secondary">${liveEscapeHtml(item.upn || item.userPrincipalName || item.mail || '—')}</span>
                    </div>
                  </td>
                  <td class="live-mail-cell">${liveEscapeHtml(item.mail || item.primarySmtpAddress || '—')}</td>
                  <td><span class="live-badge ${severityClass}">${severityLabel}</span></td>
                  <td><span class="live-badge ${slaClass}">${slaLabel}</span></td>
                  <td><span class="live-badge ${liveEscapeHtml(status.className)}">${liveEscapeHtml(status.label)}</span></td>
                  <td>${liveEscapeHtml(typeLabel)}</td>
                  <td><button type="button" class="live-detail-btn" data-exchange-mailbox-detail="${liveEscapeHtml(id)}">Meer info</button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderExchangeForwardingBody(data) {
    const forwarding = (data?.forwarding || []).filter((item) => item && typeof item === 'object');
    const control = getControlPayload(data, 'mail-forwarding-detection');
    if (!forwarding.length) return '<p class="live-module-empty">Geen actieve e-mail forwarding gevonden — dit is een goed teken.</p>';
    const externalCount = forwarding.filter((item) => String(item?.forwardTo || '').includes('@')).length;
    return `
      ${renderControlSummaryBanner(control, { title: 'Doorstuurcontrole' })}
      <div class="live-insight-strip">
        <article class="live-insight-card">
          <span class="live-insight-label">Actief</span>
          <strong>${liveEscapeHtml(formatNumber(forwarding.length))}</strong>
          <span class="live-insight-meta">mailboxen met doorsturen</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Externe adressen</span>
          <strong>${liveEscapeHtml(formatNumber(externalCount))}</strong>
          <span class="live-insight-meta">controleren op juistheid</span>
        </article>
      </div>
      <div class="assessment-table-wrap live-entity-table-wrap">
        <table class="assessment-table live-entity-table">
          <thead>
            <tr>
              <th>Gebruiker</th>
              <th>UPN</th>
              <th>Doorstuurt naar</th>
            </tr>
          </thead>
          <tbody>
            ${forwarding.slice(0, 250).map((item) => `
              <tr>
                <td>${liveEscapeHtml(item.displayName || 'Onbekend')}</td>
                <td>${liveEscapeHtml(item.upn || '—')}</td>
                <td><span class="live-badge live-badge-warn">${liveEscapeHtml(item.forwardTo || '—')}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderExchangeRulesBody(data) {
    const rules = (data?.rules || []).filter((item) => item && typeof item === 'object');
    const control = getControlPayload(data, 'inbox-rule-risk-detection');
    if (!rules.length) {
      return `<p class="live-module-empty">Geen inbox-regels gevonden (${liveEscapeHtml(formatNumber(Number(data?.usersChecked || 0)))} mailboxen gecontroleerd).</p>`;
    }
    const suspiciousCount = rules.filter((item) => item?.suspicious).length;
    const enabledCount = rules.filter((item) => item?.enabled).length;
    return `
      ${renderControlSummaryBanner(control, { title: 'Inboxregelcontrole' })}
      <div class="live-insight-strip">
        <article class="live-insight-card">
          <span class="live-insight-label">Verdacht</span>
          <strong>${liveEscapeHtml(formatNumber(suspiciousCount))}</strong>
          <span class="live-insight-meta">direct controleren</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Actief</span>
          <strong>${liveEscapeHtml(formatNumber(enabledCount))}</strong>
          <span class="live-insight-meta">regels ingeschakeld</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Mailboxen</span>
          <strong>${liveEscapeHtml(formatNumber(Number(data?.usersChecked || 0)))}</strong>
          <span class="live-insight-meta">gecontroleerd</span>
        </article>
      </div>
      <div class="assessment-table-wrap live-entity-table-wrap">
        <table class="assessment-table live-entity-table">
          <thead>
            <tr>
              <th>Gebruiker</th>
              <th>Regel</th>
              <th>Status</th>
              <th>Doorstuurt naar</th>
            </tr>
          </thead>
          <tbody>
            ${rules.slice(0, 250).map((item) => `
              <tr>
                <td>
                  <div class="live-entity-primary">
                    <strong>${liveEscapeHtml(item.userName || 'Onbekend')}</strong>
                    <span>${liveEscapeHtml(item.userUpn || '—')}</span>
                  </div>
                </td>
                <td>${liveEscapeHtml(item.ruleName || 'Onbekende regel')}</td>
                <td><span class="live-badge ${item.suspicious ? 'live-badge-crit' : 'live-badge-ok'}">${liveEscapeHtml(item.suspicious ? 'Actie nodig' : 'In orde')}</span></td>
                <td>${liveEscapeHtml(item.forwardTo || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderControlStatusBadge(status) {
    const cls = status === 'critical' ? 'live-badge-crit' : status === 'warning' ? 'live-badge-warn' : status === 'ok' ? 'live-badge-ok' : 'live-badge-neutral';
    const label = status === 'critical' ? 'Kritiek' : status === 'warning' ? 'Aandacht' : status === 'ok' ? 'OK' : 'Info';
    return `<span class="live-badge ${cls}">${label}</span>`;
  }

  function buildControlDetailBody(controlKey, item) {
    if (!item || typeof item !== 'object' || typeof window.renderSideRailTemplate !== 'function') return '';
    const tone = item.status === 'critical' ? 'error' : item.status === 'warning' ? 'warn' : item.status === 'ok' ? 'good' : 'neutral';
    const evidence = item.evidence && typeof item.evidence === 'object' ? item.evidence : {};
    const affected = Array.isArray(item.affected_objects) ? item.affected_objects.filter(Boolean) : [];
    const evidenceRows = Object.entries(evidence).slice(0, 8);
    return window.renderSideRailTemplate({
      tone,
      statusLabel: item.status || 'info',
      summaryCards: [
        { label: 'Status', value: item.status || 'info', meta: controlKey, tone },
        { label: 'Scope', value: affected.length || 0, meta: 'geraakte objecten', tone: 'neutral' },
        { label: 'Categorie', value: item.category || 'control', meta: item.source || 'data', tone: 'neutral' },
      ],
      sections: [
        {
          title: 'Controle-informatie',
          badge: item.status || 'info',
          tone,
          bodyHtml: `
            <div class="ex-detail-grid">
              <div class="ex-detail-item"><label>Titel</label><span>${liveEscapeHtml(item.title || '—')}</span></div>
              <div class="ex-detail-item"><label>Samenvatting</label><span>${liveEscapeHtml(item.summary || '—')}</span></div>
              <div class="ex-detail-item"><label>Aanbeveling</label><span>${liveEscapeHtml(item.recommended_action || '—')}</span></div>
              <div class="ex-detail-item"><label>Bron</label><span>${liveEscapeHtml(item.source || '—')}</span></div>
            </div>`,
        },
        ...(affected.length ? [{
          title: 'Geraakte objecten',
          badge: `${affected.length}`,
          tone,
          bodyHtml: `<div class="live-token-list">${affected.slice(0, 20).map((entry) => `<span class="live-token">${liveEscapeHtml(entry)}</span>`).join('')}</div>`,
        }] : []),
        ...(evidenceRows.length ? [{
          title: 'Onderbouwing',
          badge: 'Evidence',
          tone: 'neutral',
          bodyHtml: `
            <div class="ex-detail-grid">
              ${evidenceRows.map(([key, value]) => `
                <div class="ex-detail-item">
                  <label>${liveEscapeHtml(humanizeKey(key))}</label>
                  <span>${liveEscapeHtml(normalizeScalar(value))}</span>
                </div>`).join('')}
            </div>`,
        }] : []),
      ],
      findings: [{
        tone,
        label: tone === 'error' ? 'Fout' : tone === 'warn' ? 'Let op' : tone === 'good' ? 'Goed' : 'Info',
        title: item.title || 'Controlebevinding',
        body: item.summary || item.recommended_action || 'Geen aanvullende toelichting beschikbaar.',
      }],
      actions: item.recommended_action ? [{
        title: 'Aanbevolen actie',
        body: item.recommended_action,
      }] : [],
    });
  }

  function renderControlItemsTable(items, controlKeyOrColumns, columnsOrUndefined) {
    // Signature: (items, controlKey, columns) OR legacy (items, columns)
    let controlKey = null;
    let columns = null;
    if (typeof controlKeyOrColumns === 'string') {
      controlKey = controlKeyOrColumns;
      columns = columnsOrUndefined;
    } else {
      columns = controlKeyOrColumns;
    }
    if (!items || !items.length) return '<p class="live-module-empty">Geen bevindingen gevonden.</p>';
    const hasPlaybook = controlKey && typeof window.getPlaybookForControl === 'function' && !!window.getPlaybookForControl(controlKey);
    const hasDetail = !!controlKey;
    const colDefs = columns || [
      { label: 'Onderwerp', fn: (item) => `<strong>${liveEscapeHtml(item.title || '—')}</strong><br><span class="live-small">${liveEscapeHtml(item.summary || '')}</span>` },
      { label: 'Status', fn: (item) => renderControlStatusBadge(item.status) },
      { label: 'Aanbeveling', fn: (item) => liveEscapeHtml(item.recommended_action || '—') },
    ];
    const allCols = [
      ...colDefs,
      ...(hasDetail ? [{
        label: '',
        fn: (item) => {
          const detailId = registerDetailEntry({
            kicker: humanizeKey(controlKey || 'Control'),
            title: item.title || 'Controlebevinding',
            data: item,
            bodyHtml: buildControlDetailBody(controlKey, item),
          });
          return `<button type="button" class="live-detail-btn" data-live-detail-id="${liveEscapeHtml(detailId)}">Meer info</button>`;
        },
      }] : []),
      ...(hasPlaybook ? [{
        label: '',
        fn: (item) => `<button class="live-playbook-btn" data-playbook-key="${liveEscapeHtml(controlKey)}" data-finding-title="${liveEscapeHtml(item.title || '')}" title="Bekijk remediation-handleiding">Playbook</button>`,
      }] : []),
    ];
    const tableHtml = `
      <div class="assessment-table-wrap live-entity-table-wrap">
        <div class="live-table-actions">
          <button type="button" class="live-export-btn" title="Exporteer tabel als CSV-bestand">&#8659; CSV</button>
        </div>
        <table class="assessment-table live-entity-table">
          <thead><tr>${allCols.map((c) => `<th>${liveEscapeHtml(c.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${items.slice(0, 200).map((item) => `<tr>${allCols.map((c) => `<td>${c.fn(item)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    return tableHtml;
  }

  function renderExchangeMailSecurityBody(data) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const permControl = getControlPayload(data, 'mailbox-permission-governance');
    const critical = Number(data?.summary?.critical || 0);
    const warning = Number(data?.summary?.warning || 0);
    const ok = items.filter((i) => i.status === 'ok').length;
    if (!items.length) return '<p class="live-module-empty">Geen e-mail authenticatie-gegevens beschikbaar. Voer eerst een assessment uit.</p>';
    return `
      ${renderControlSummaryBanner(permControl, { title: 'Mailboxrechten governance' })}
      <div class="live-insight-strip">
        <article class="live-insight-card">
          <span class="live-insight-label">Domeinen</span>
          <strong>${liveEscapeHtml(formatNumber(items.length))}</strong>
          <span class="live-insight-meta">gecontroleerd</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Kritiek</span>
          <strong style="color:var(--dj-${critical > 0 ? 'crit' : 'ok'})">${liveEscapeHtml(formatNumber(critical))}</strong>
          <span class="live-insight-meta">SPF/DKIM/DMARC ontbreekt</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Aandacht</span>
          <strong style="color:var(--dj-${warning > 0 ? 'warn' : 'ok'})">${liveEscapeHtml(formatNumber(warning))}</strong>
          <span class="live-insight-meta">gedeeltelijk aanwezig</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">In orde</span>
          <strong style="color:var(--dj-ok)">${liveEscapeHtml(formatNumber(ok))}</strong>
          <span class="live-insight-meta">volledig geconfigureerd</span>
        </article>
      </div>
      ${renderControlItemsTable(items, 'domain-mail-auth', [
        { label: 'Domein', fn: (item) => `<strong>${liveEscapeHtml(item.title || '—')}</strong>` },
        { label: 'SPF / DKIM / DMARC', fn: (item) => liveEscapeHtml(item.summary || '—') },
        { label: 'Status', fn: (item) => renderControlStatusBadge(item.status) },
        { label: 'Aanbeveling', fn: (item) => liveEscapeHtml(item.recommended_action || '—') },
      ])}
    `;
  }

  function renderTeamsSecurityBody(data) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const critical = Number(data?.summary?.critical || 0);
    const warning = Number(data?.summary?.warning || 0);
    const ok = items.filter((i) => i.status === 'ok').length;
    if (!items.length) return '<p class="live-module-empty">Geen Teams beveiligingsgegevens beschikbaar. Voer eerst een assessment uit.</p>';
    return `
      <div class="live-insight-strip">
        <article class="live-insight-card">
          <span class="live-insight-label">Gevonden</span>
          <strong>${liveEscapeHtml(formatNumber(items.length))}</strong>
          <span class="live-insight-meta">bevindingen</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Kritiek</span>
          <strong style="color:var(--dj-${critical > 0 ? 'crit' : 'ok'})">${liveEscapeHtml(formatNumber(critical))}</strong>
          <span class="live-insight-meta">actie vereist</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Aandacht</span>
          <strong style="color:var(--dj-${warning > 0 ? 'warn' : 'ok'})">${liveEscapeHtml(formatNumber(warning))}</strong>
          <span class="live-insight-meta">te reviewen</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">In orde</span>
          <strong style="color:var(--dj-ok)">${liveEscapeHtml(formatNumber(ok))}</strong>
          <span class="live-insight-meta">geen problemen</span>
        </article>
      </div>
      ${renderControlItemsTable(items, 'teams-with-guests', [
        { label: 'Team', fn: (item) => `<strong>${liveEscapeHtml(item.title || '—')}</strong><br><span class="live-small">${liveEscapeHtml(item.summary || '')}</span>` },
        { label: 'Status', fn: (item) => renderControlStatusBadge(item.status) },
        { label: 'Aanbeveling', fn: (item) => liveEscapeHtml(item.recommended_action || '—') },
      ])}
    `;
  }

  function renderSharePointSecurityBody(data) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const critical = Number(data?.summary?.critical || 0);
    const warning = Number(data?.summary?.warning || 0);
    if (!items.length) return '<p class="live-module-empty">Geen SharePoint beveiligingsgegevens beschikbaar. Voer eerst een assessment uit.</p>';
    return `
      <div class="live-insight-strip">
        <article class="live-insight-card">
          <span class="live-insight-label">Bevindingen</span>
          <strong>${liveEscapeHtml(formatNumber(items.length))}</strong>
          <span class="live-insight-meta">sharing-checks</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Kritiek</span>
          <strong style="color:var(--dj-${critical > 0 ? 'crit' : 'ok'})">${liveEscapeHtml(formatNumber(critical))}</strong>
          <span class="live-insight-meta">extern deelrisico</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Aandacht</span>
          <strong style="color:var(--dj-${warning > 0 ? 'warn' : 'ok'})">${liveEscapeHtml(formatNumber(warning))}</strong>
          <span class="live-insight-meta">te reviewen</span>
        </article>
      </div>
      ${renderControlItemsTable(items, 'sharepoint-sharing-risk', [
        { label: 'Bevinding', fn: (item) => `<strong>${liveEscapeHtml(item.title || '—')}</strong><br><span class="live-small">${liveEscapeHtml(item.summary || '')}</span>` },
        { label: 'Status', fn: (item) => renderControlStatusBadge(item.status) },
        { label: 'Aanbeveling', fn: (item) => liveEscapeHtml(item.recommended_action || '—') },
      ])}
    `;
  }

  function renderSharePointSettingsBody(data) {
    if (!data || !Object.keys(data).length) {
      return '<p class="live-module-empty">Geen SharePoint-instellingen beschikbaar. Voer eerst een assessment uit.</p>';
    }
    const sharingMap = {
      ExternalUserAndGuestSharing: 'Iedereen (anon. links toegestaan)',
      ExternalUserSharingOnly: 'Bestaande externe gebruikers',
      ExistingExternalUserSharingOnly: 'Bestaande gastgebruikers',
      Disabled: 'Uitgeschakeld',
    };
    const linkMap = {
      Anyone: 'Iedereen (anonieme link)',
      Company: 'Alleen organisatie',
      Specific: 'Specifieke personen',
    };
    const capability = data?.sharingCapability;
    const isHighRisk = ['ExternalUserAndGuestSharing', 'ExternalUserSharingOnly'].includes(String(capability));
    const guestActive = data?.guestSharingEnabled === true;
    const rows = [
      ['Extern delen', liveEscapeHtml(sharingMap[capability] || String(capability || '—'))],
      ['Gastdelen actief', guestActive ? 'Ja' : (data?.guestSharingEnabled === false ? 'Nee' : '—')],
      ['Standaard deellink', liveEscapeHtml(linkMap[data?.defaultSharingLinkType] || String(data?.defaultSharingLinkType || '—'))],
      ['Anonieme link verloopt', typeof data?.requireAnonymousLinksExpireInDays === 'number' ? `${liveEscapeHtml(String(data.requireAnonymousLinksExpireInDays))} dagen` : '—'],
      ['Domeinbeperking', Array.isArray(data?.sharingAllowedDomainList) && data.sharingAllowedDomainList.length ? liveEscapeHtml(data.sharingAllowedDomainList.slice(0, 4).join(', ')) : 'Geen'],
    ].filter(([, v]) => v !== '—');
    return `
      <div class="live-insight-strip">
        <article class="live-insight-card">
          <span class="live-insight-label">Extern delen</span>
          <strong style="color:var(--dj-${isHighRisk ? 'warn' : 'ok'})">${isHighRisk ? 'Breed' : 'Beperkt'}</strong>
          <span class="live-insight-meta">${liveEscapeHtml(sharingMap[capability] || String(capability || '—'))}</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Gastdelen</span>
          <strong style="color:var(--dj-${guestActive ? 'warn' : 'ok'})">${guestActive ? 'Actief' : 'Uit'}</strong>
          <span class="live-insight-meta">gastgebruikers</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Standaardlink</span>
          <strong>${liveEscapeHtml(linkMap[data?.defaultSharingLinkType] || String(data?.defaultSharingLinkType || '—'))}</strong>
          <span class="live-insight-meta">deellink type</span>
        </article>
      </div>
      <div class="assessment-table-wrap">
        <table class="assessment-table">
          <thead><tr><th>Instelling</th><th>Waarde</th></tr></thead>
          <tbody>
            ${rows.map(([label, value]) => `<tr><td>${liveEscapeHtml(label)}</td><td>${value}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCaPolicyBody(data) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const critical = Number(data?.summary?.critical || 0);
    const warning = Number(data?.summary?.warning || 0);
    const ok = items.filter((i) => i.status === 'ok').length;
    if (!items.length) {
      return '<p class="live-module-empty">Geen Conditional Access gegevens beschikbaar. Voer eerst een assessment uit om CA-policies te analyseren.</p>';
    }
    return `
      <div class="live-insight-strip">
        <article class="live-insight-card">
          <span class="live-insight-label">Policies</span>
          <strong>${liveEscapeHtml(formatNumber(items.length))}</strong>
          <span class="live-insight-meta">geanalyseerd</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Kritiek</span>
          <strong style="color:var(--dj-${critical > 0 ? 'crit' : 'ok'})">${liveEscapeHtml(formatNumber(critical))}</strong>
          <span class="live-insight-meta">ernstige gap</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Aandacht</span>
          <strong style="color:var(--dj-${warning > 0 ? 'warn' : 'ok'})">${liveEscapeHtml(formatNumber(warning))}</strong>
          <span class="live-insight-meta">te reviewen</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">In orde</span>
          <strong style="color:var(--dj-ok)">${liveEscapeHtml(formatNumber(ok))}</strong>
          <span class="live-insight-meta">correct geconfigureerd</span>
        </article>
      </div>
      ${renderControlItemsTable(items, 'ca-policy-export', [
        { label: 'Beleid', fn: (item) => `<strong>${liveEscapeHtml(item.title || '—')}</strong><br><span class="live-small">${liveEscapeHtml(item.summary || '')}</span>` },
        { label: 'Status', fn: (item) => renderControlStatusBadge(item.status) },
        { label: 'Aanbeveling', fn: (item) => liveEscapeHtml(item.recommended_action || '—') },
      ])}
    `;
  }

  function renderAdminRiskBody(data) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const critical = Number(data?.summary?.critical || 0);
    const warning = Number(data?.summary?.warning || 0);
    const ok = items.filter((i) => i.status === 'ok').length;
    if (!items.length) {
      return '<p class="live-module-empty">Geen admin-rolrisico bevindingen beschikbaar. Voer eerst een assessment uit.</p>';
    }
    return `
      <div class="live-insight-strip">
        <article class="live-insight-card">
          <span class="live-insight-label">Bevindingen</span>
          <strong>${liveEscapeHtml(formatNumber(items.length))}</strong>
          <span class="live-insight-meta">rollen gecontroleerd</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Kritiek</span>
          <strong style="color:var(--dj-${critical > 0 ? 'crit' : 'ok'})">${liveEscapeHtml(formatNumber(critical))}</strong>
          <span class="live-insight-meta">directe aandacht</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Aandacht</span>
          <strong style="color:var(--dj-${warning > 0 ? 'warn' : 'ok'})">${liveEscapeHtml(formatNumber(warning))}</strong>
          <span class="live-insight-meta">te reviewen</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">In orde</span>
          <strong style="color:var(--dj-ok)">${liveEscapeHtml(formatNumber(ok))}</strong>
          <span class="live-insight-meta">geen problemen</span>
        </article>
      </div>
      ${renderControlItemsTable(items, 'admin-role-membership', [
        { label: 'Rol / Account', fn: (item) => `<strong>${liveEscapeHtml(item.title || '—')}</strong><br><span class="live-small">${liveEscapeHtml(item.summary || '')}</span>` },
        { label: 'Status', fn: (item) => renderControlStatusBadge(item.status) },
        { label: 'Aanbeveling', fn: (item) => liveEscapeHtml(item.recommended_action || '—') },
      ])}
    `;
  }

  function renderBreakGlassBody(data) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const critical = Number(data?.summary?.critical || 0);
    const warning = Number(data?.summary?.warning || 0);
    if (!items.length) {
      return '<p class="live-module-empty">Geen break-glass accountgegevens beschikbaar. Voer eerst een assessment uit.</p>';
    }
    return `
      <div class="live-insight-strip">
        <article class="live-insight-card">
          <span class="live-insight-label">Bevindingen</span>
          <strong>${liveEscapeHtml(formatNumber(items.length))}</strong>
          <span class="live-insight-meta">noodaccounts gecontroleerd</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Kritiek</span>
          <strong style="color:var(--dj-${critical > 0 ? 'crit' : 'ok'})">${liveEscapeHtml(formatNumber(critical))}</strong>
          <span class="live-insight-meta">configuratiefout</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Aandacht</span>
          <strong style="color:var(--dj-${warning > 0 ? 'warn' : 'ok'})">${liveEscapeHtml(formatNumber(warning))}</strong>
          <span class="live-insight-meta">te verbeteren</span>
        </article>
      </div>
      ${renderControlItemsTable(items, 'break-glass-accounts', [
        { label: 'Account', fn: (item) => `<strong>${liveEscapeHtml(item.title || '—')}</strong><br><span class="live-small">${liveEscapeHtml(item.summary || '')}</span>` },
        { label: 'Status', fn: (item) => renderControlStatusBadge(item.status) },
        { label: 'Aanbeveling', fn: (item) => liveEscapeHtml(item.recommended_action || '—') },
      ])}
    `;
  }

  function renderAppSecretsBody(data) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const critical = Number(data?.summary?.critical || 0);
    const warning = Number(data?.summary?.warning || 0);
    const ok = items.filter((i) => i.status === 'ok').length;
    if (!items.length) {
      return '<p class="live-module-empty">Geen secrets of certificatengegevens beschikbaar. Voer eerst een assessment uit.</p>';
    }
    return `
      <div class="live-insight-strip">
        <article class="live-insight-card">
          <span class="live-insight-label">Apps</span>
          <strong>${liveEscapeHtml(formatNumber(items.length))}</strong>
          <span class="live-insight-meta">credentials gecontroleerd</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Verlopen</span>
          <strong style="color:var(--dj-${critical > 0 ? 'crit' : 'ok'})">${liveEscapeHtml(formatNumber(critical))}</strong>
          <span class="live-insight-meta">secrets of certificaten</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Verloopt binnenkort</span>
          <strong style="color:var(--dj-${warning > 0 ? 'warn' : 'ok'})">${liveEscapeHtml(formatNumber(warning))}</strong>
          <span class="live-insight-meta">binnen 14 dagen</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">In orde</span>
          <strong style="color:var(--dj-ok)">${liveEscapeHtml(formatNumber(ok))}</strong>
          <span class="live-insight-meta">geen problemen</span>
        </article>
      </div>
      ${renderControlItemsTable(items, 'app-secrets-and-certs', [
        { label: 'Applicatie', fn: (item) => `<strong>${liveEscapeHtml(item.title || '—')}</strong><br><span class="live-small">${liveEscapeHtml(item.summary || '')}</span>` },
        { label: 'Status', fn: (item) => renderControlStatusBadge(item.status) },
        { label: 'Aanbeveling', fn: (item) => liveEscapeHtml(item.recommended_action || '—') },
      ])}
    `;
  }

  const GROUP_TYPE_LABELS = {
    Security:           'Beveiligingsgroep',
    Distribution:       'Distributielijst',
    MailEnabledSecurity:'Mail-beveiligd',
    Other:              'Overig',
  };
  const GROUP_TYPE_BADGE = {
    Microsoft365:       'live-badge-info',
    Security:           'live-badge-ok',
    Distribution:       'live-badge-warn',
    MailEnabledSecurity:'live-badge-warn',
    Other:              '',
  };

  const groupsUiState = {
    search: '',
    filter: 'all',
  };

  function updateGroupsBulkSelectionState() {
    const allRows = Array.from(document.querySelectorAll('#teamsSection [data-groups-row="group"]'));
    const visibleRows = allRows.filter((row) => row.style.display !== 'none');
    const visibleChecks = visibleRows.map((row) => row.querySelector('[data-group-select]')).filter(Boolean);
    const selectedChecks = Array.from(document.querySelectorAll('#teamsSection [data-group-select]:checked'));
    const selectedVisible = visibleChecks.filter((checkbox) => checkbox.checked).length;
    const counter = document.getElementById('groupsBulkSelectionCount');
    if (counter) {
      counter.textContent = `${formatNumber(selectedChecks.length)} geselecteerd`;
    }
    const master = document.getElementById('groupsSelectAll');
    if (master) {
      master.checked = visibleChecks.length > 0 && selectedVisible === visibleChecks.length;
      master.indeterminate = selectedVisible > 0 && selectedVisible < visibleChecks.length;
    }
  }

  function applyGroupsFilters() {
    const rows = Array.from(document.querySelectorAll('#teamsSection [data-groups-row="group"]'));
    if (!rows.length) return;
    const query = String(groupsUiState.search || '').trim().toLowerCase();
    const filter = groupsUiState.filter || 'all';
    let visibleCount = 0;
    rows.forEach((row) => {
      const haystack = String(row.dataset.search || '').toLowerCase();
      const typeKey = String(row.dataset.typeKey || 'other');
      const hasGuests = row.dataset.guests === 'true';
      const dynamic = row.dataset.dynamic === 'true';
      const hasRisk = row.dataset.risk === 'true';
      const matchesQuery = !query || haystack.includes(query);
      const matchesFilter = filter === 'all'
        || (filter === 'm365' && typeKey === 'microsoft365')
        || (filter === 'security' && typeKey === 'security')
        || (filter === 'distribution' && (typeKey === 'distribution' || typeKey === 'mailenabledsecurity'))
        || (filter === 'dynamic' && dynamic)
        || (filter === 'guests' && hasGuests)
        || (filter === 'risk' && hasRisk);
      const visible = matchesQuery && matchesFilter;
      row.style.display = visible ? '' : 'none';
      if (visible) visibleCount += 1;
    });
    const countNode = document.getElementById('groupsVisibleCount');
    if (countNode) {
      countNode.textContent = `${formatNumber(visibleCount)} van ${formatNumber(rows.length)} groepen`;
    }
    document.querySelectorAll('#teamsSection [data-groups-filter]').forEach((button) => {
      button.classList.toggle('active', button.dataset.groupsFilter === filter);
    });
    updateGroupsBulkSelectionState();
  }

  function renderGroupsBody(data) {
    const groups = (data?.groups || []).filter((item) => item && typeof item === 'object');
    if (!groups.length) return '<p class="live-module-empty">Geen groepen beschikbaar voor deze tenant.</p>';
    const stats = data?.stats || {};
    const dynamicCount = groups.filter((g) => g.isDynamic).length;
    const guestCount = groups.filter((g) => Number(g.guestCount || 0) > 0).length;
    const ownerlessCount = groups.filter((g) => Number(g.ownerCount || 0) === 0).length;
    const riskyCount = groups.filter((g) => Number(g.guestCount || 0) > 0 || Number(g.ownerCount || 0) === 0).length;
    const sortedGroups = [...groups].sort((a, b) => {
      const riskA = (Number(a.guestCount || 0) > 0 ? 2 : 0) + (Number(a.ownerCount || 0) === 0 ? 3 : 0);
      const riskB = (Number(b.guestCount || 0) > 0 ? 2 : 0) + (Number(b.ownerCount || 0) === 0 ? 3 : 0);
      if (riskA !== riskB) return riskB - riskA;
      const guestsA = Number(a.guestCount || 0);
      const guestsB = Number(b.guestCount || 0);
      if (guestsA !== guestsB) return guestsB - guestsA;
      return Number(b.memberCount || 0) - Number(a.memberCount || 0);
    });
    const workcardCounts = [
      exchangeChip(`${formatNumber(groups.length)} groepen`, 'neutral'),
      riskyCount ? exchangeChip(`${formatNumber(riskyCount)} aandacht`, 'warn') : '',
      dynamicCount ? exchangeChip(`${formatNumber(dynamicCount)} dynamisch`, 'neutral') : '',
      guestCount ? exchangeChip(`${formatNumber(guestCount)} met gasten`, 'warn') : '',
    ].filter(Boolean).join('');
    return `
      <section class="gb-insights-shell ex-identity-shell" aria-label="Groepen inzichten">
        <div class="gb-insights-intro">
          <div>
            <p class="gb-insights-kicker">Niveau 2 — Inzichten</p>
            <h3>Stuur op risico in groepen en open direct detailcontrole in het rechterpaneel.</h3>
          </div>
          <p class="gb-insights-copy">Deze werkkaart gebruikt dezelfde interactie als Teams, Gebruikers en Licenties: snelle filters, zoekopdrachten en prioriteit per rij.</p>
        </div>
        <div class="gb-insight-grid">
          <button type="button" class="gb-insight-card is-accent status-good" data-groups-filter="all">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">G</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Groepen</span>
                <span class="gb-insight-status status-good">In beeld</span>
              </span>
            </span>
            <span class="gb-insight-label">Alle groepen</span>
            <strong>${liveEscapeHtml(formatNumber(groups.length))}</strong>
            <span class="gb-insight-meta">Totaal binnen tenant</span>
          </button>
          <button type="button" class="gb-insight-card status-neutral" data-groups-filter="m365">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">M</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Type</span>
                <span class="gb-insight-status status-neutral">Microsoft 365</span>
              </span>
            </span>
            <span class="gb-insight-label">Unified groepen</span>
            <strong>${liveEscapeHtml(formatNumber(stats.microsoft365 || 0))}</strong>
            <span class="gb-insight-meta">Samenwerking & Teams</span>
          </button>
          <button type="button" class="gb-insight-card ${ownerlessCount > 0 ? 'status-warn' : 'status-good'}" data-groups-filter="risk">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">!</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Risico</span>
                <span class="gb-insight-status ${ownerlessCount > 0 ? 'status-warn' : 'status-good'}">${ownerlessCount > 0 ? 'Aandacht' : 'In orde'}</span>
              </span>
            </span>
            <span class="gb-insight-label">Ownerless of gasten</span>
            <strong>${liveEscapeHtml(formatNumber(riskyCount))}</strong>
            <span class="gb-insight-meta">Eerst reviewen</span>
          </button>
          <button type="button" class="gb-insight-card status-neutral" data-groups-filter="dynamic">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">D</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Automatisering</span>
                <span class="gb-insight-status status-neutral">Dynamisch</span>
              </span>
            </span>
            <span class="gb-insight-label">Dynamische groepen</span>
            <strong>${liveEscapeHtml(formatNumber(dynamicCount))}</strong>
            <span class="gb-insight-meta">Membership rules actief</span>
          </button>
        </div>
      </section>
      <div class="gb-workstack ex-workstack">
        <section class="gb-workcard is-open" data-tone="neutral">
          <button type="button" class="gb-workcard-toggle" aria-expanded="true">
            <span class="gb-workcard-headline">
              <span class="gb-workcard-kicker">Werkkaart</span>
              <span class="gb-workcard-title">Groepen overzicht</span>
            </span>
            <span class="gb-workcard-counts">${workcardCounts}</span>
            <span class="gb-workcard-chevron" aria-hidden="true">⌄</span>
          </button>
          <div class="gb-workcard-body" style="display:block">
            <div class="gb-workcard-body-inner">
              <div class="gb-toolbar ex-toolbar-identity">
                <input
                  type="search"
                  id="groupsSearchInput"
                  class="gb-search ex-search-identity"
                  placeholder="Zoek op groep, e-mail, type of omschrijving..."
                  value="${liveEscapeHtml(groupsUiState.search)}"
                >
                <div class="gb-filter-tabs ex-filter-tabs-identity">
                  <button type="button" class="gb-filter-tab${groupsUiState.filter === 'all' ? ' active' : ''}" data-groups-filter="all">Alle</button>
                  <button type="button" class="gb-filter-tab${groupsUiState.filter === 'm365' ? ' active' : ''}" data-groups-filter="m365">Microsoft 365</button>
                  <button type="button" class="gb-filter-tab${groupsUiState.filter === 'security' ? ' active' : ''}" data-groups-filter="security">Security</button>
                  <button type="button" class="gb-filter-tab${groupsUiState.filter === 'distribution' ? ' active' : ''}" data-groups-filter="distribution">Distributie</button>
                  <button type="button" class="gb-filter-tab${groupsUiState.filter === 'dynamic' ? ' active' : ''}" data-groups-filter="dynamic">Dynamisch</button>
                  <button type="button" class="gb-filter-tab${groupsUiState.filter === 'guests' ? ' active' : ''}" data-groups-filter="guests">Gasten</button>
                  <button type="button" class="gb-filter-tab${groupsUiState.filter === 'risk' ? ' active' : ''}" data-groups-filter="risk">Aandacht</button>
                </div>
                <div class="gb-toolbar-info" id="groupsVisibleCount">${liveEscapeHtml(formatNumber(groups.length))} van ${liveEscapeHtml(formatNumber(groups.length))} groepen</div>
                <button type="button" class="live-module-refresh live-module-inline-btn" data-groups-bulk-action="select-risk">Selecteer aandacht</button>
                <button type="button" class="live-module-refresh live-module-inline-btn" data-groups-bulk-action="review-selected">Review selectie</button>
                <button type="button" class="live-module-refresh live-module-inline-btn" data-groups-bulk-action="export-selected">Export selectie</button>
                <div class="gb-toolbar-info" id="groupsBulkSelectionCount">0 geselecteerd</div>
              </div>
              <div class="gb-table-wrap assessment-table-wrap live-entity-table-wrap">
                <table class="gb-table assessment-table live-entity-table">
          <thead>
            <tr>
              <th><input type="checkbox" id="groupsSelectAll" aria-label="Selecteer zichtbare groepen"></th>
              <th>Groep</th>
              <th>Prioriteit</th>
              <th>Type</th>
              <th>Leden</th>
              <th>Owners</th>
              <th>Gasten</th>
              <th>Aangemaakt</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sortedGroups.slice(0, 300).map((g) => {
              const typeLabel = GROUP_TYPE_LABELS[g.groupType] || g.groupType || 'Onbekend';
              const typeBadge = GROUP_TYPE_BADGE[g.groupType] || '';
              const typeKey = String(g.groupType || 'Other');
              const hasGuests = Number(g.guestCount || 0) > 0;
              const ownerless = Number(g.ownerCount || 0) === 0;
              const riskScore = (hasGuests ? 2 : 0) + (ownerless ? 3 : 0);
              let riskLabel = 'Laag';
              let riskClass = 'live-badge-ok';
              if (riskScore >= 3) {
                riskLabel = hasGuests ? 'Hoog' : 'Aandacht';
                riskClass = hasGuests ? 'live-badge-crit' : 'live-badge-warn';
              } else if (riskScore > 0) {
                riskLabel = 'Middel';
                riskClass = 'live-badge-warn';
              }
              return `
                <tr
                  data-groups-row="group"
                  data-type-key="${liveEscapeHtml(typeKey.toLowerCase())}"
                  data-guests="${hasGuests ? 'true' : 'false'}"
                  data-dynamic="${g.isDynamic ? 'true' : 'false'}"
                  data-risk="${riskScore > 0 ? 'true' : 'false'}"
                  data-search="${liveEscapeHtml([
                    g.displayName,
                    g.mail,
                    g.description,
                    typeLabel,
                    String(g.memberCount || 0),
                    String(g.ownerCount || 0),
                    String(g.guestCount || 0),
                  ].filter(Boolean).join(' '))}"
                >
                  <td><input type="checkbox" data-group-select aria-label="Selecteer groep ${liveEscapeHtml(g.displayName || g.mail || 'onbekend')}" data-group-name="${liveEscapeHtml(g.displayName || '')}" data-group-mail="${liveEscapeHtml(g.mail || '')}" data-group-type="${liveEscapeHtml(typeLabel)}" data-group-risk="${riskScore > 0 ? 'true' : 'false'}"></td>
                  <td>
                    <div class="live-entity-main">
                      <strong>${liveEscapeHtml(g.displayName || 'Onbekende groep')}</strong>
                      <span>${liveEscapeHtml(g.mail || 'Geen e-mailadres')}</span>
                      ${g.description ? `<p>${liveEscapeHtml(g.description)}</p>` : ''}
                    </div>
                  </td>
                  <td><span class="live-badge ${riskClass}">${liveEscapeHtml(riskLabel)}</span></td>
                  <td>
                    <div class="live-pill-stack">
                      <span class="live-badge ${typeBadge}">${liveEscapeHtml(typeLabel)}</span>
                      ${g.isDynamic ? '<span class="live-badge live-badge-info">Dynamisch</span>' : ''}
                    </div>
                  </td>
                  <td>${liveEscapeHtml(formatNumber(g.memberCount || 0))}</td>
                  <td>${liveEscapeHtml(formatNumber(g.ownerCount || 0))}</td>
                  <td>${liveEscapeHtml(formatNumber(g.guestCount || 0))}</td>
                  <td>${liveEscapeHtml(formatDate(g.createdAt))}</td>
                  <td>
                    <button type="button" class="live-detail-btn grp-detail-btn"
                      data-group-id="${liveEscapeHtml(g.id || '')}"
                      data-group-name="${liveEscapeHtml(g.displayName || '')}"
                      data-group-type="${liveEscapeHtml(typeLabel)}"
                      data-group-mail="${liveEscapeHtml(g.mail || '')}"
                      data-member-count="${liveEscapeHtml(String(g.memberCount || 0))}"
                      data-owner-count="${liveEscapeHtml(String(g.ownerCount || 0))}"
                      data-guest-count="${liveEscapeHtml(String(g.guestCount || 0))}"
                      data-is-dynamic="${g.isDynamic ? 'true' : 'false'}"
                      data-created-at="${liveEscapeHtml(g.createdAt || '')}"
                      data-description="${liveEscapeHtml(g.description || '')}">Detail</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  const sharePointSitesUiState = {
    search: '',
    filter: 'all',
  };

  function applySharePointSiteFilters() {
    const rows = Array.from(document.querySelectorAll('#sharepointSection [data-sp-row="site"]'));
    if (!rows.length) return;
    const query = String(sharePointSitesUiState.search || '').trim().toLowerCase();
    const filter = sharePointSitesUiState.filter || 'all';
    let visibleCount = 0;
    rows.forEach((row) => {
      const haystack = String(row.dataset.search || '').toLowerCase();
      const risk = row.dataset.risk === 'true';
      const inactive = row.dataset.inactive === 'true';
      const root = row.dataset.root === 'true';
      const stale = row.dataset.stale === 'true';
      const matchesQuery = !query || haystack.includes(query);
      const matchesFilter = filter === 'all'
        || (filter === 'risk' && risk)
        || (filter === 'inactive' && inactive)
        || (filter === 'root' && root)
        || (filter === 'stale' && stale);
      const visible = matchesQuery && matchesFilter;
      row.style.display = visible ? '' : 'none';
      if (visible) visibleCount += 1;
    });
    const countNode = document.getElementById('sharePointVisibleCount');
    if (countNode) countNode.textContent = `${formatNumber(visibleCount)} van ${formatNumber(rows.length)} sites`;
    document.querySelectorAll('#sharepointSection [data-sp-filter]').forEach((button) => {
      button.classList.toggle('active', button.dataset.spFilter === filter);
    });
    updateSharePointBulkSelectionState();
  }

  function updateSharePointBulkSelectionState() {
    const allRows = Array.from(document.querySelectorAll('#sharepointSection [data-sp-row="site"]'));
    const visibleRows = allRows.filter((row) => row.style.display !== 'none');
    const visibleChecks = visibleRows.map((row) => row.querySelector('[data-sp-select]')).filter(Boolean);
    const selectedChecks = Array.from(document.querySelectorAll('#sharepointSection [data-sp-select]:checked'));
    const selectedVisible = visibleChecks.filter((checkbox) => checkbox.checked).length;
    const counter = document.getElementById('sharePointBulkSelectionCount');
    if (counter) counter.textContent = `${formatNumber(selectedChecks.length)} geselecteerd`;
    const master = document.getElementById('sharePointSelectAll');
    if (master) {
      master.checked = visibleChecks.length > 0 && selectedVisible === visibleChecks.length;
      master.indeterminate = selectedVisible > 0 && selectedVisible < visibleChecks.length;
    }
  }

  function renderSharePointSitesBody(data) {
    const sites = (data?.sites || []).filter((item) => item && typeof item === 'object');
    const control = getControlPayload(data, 'sharepoint-sharing-risk');
    if (!sites.length) return '<p class="live-module-empty">Geen SharePoint-sites beschikbaar voor deze tenant.</p>';
    const isLive = data?._source === 'live';
    const riskySites = getControlAffectedSet(control);
    const inactiveCount = sites.filter((site) => String(site.status || '').toLowerCase() === 'inactief').length;
    const rootCount = sites.filter((site) => !!site.isRootSite).length;
    const staleCount = sites.filter((site) => {
      const days = ageInDays(site.lastModified || site.lastModifiedDateTime);
      return days !== null && days >= 90;
    }).length;
    const riskyCount = sites.filter((site) => {
      const riskKey = String(site.webUrl || site.displayName || site.id || '').trim().toLowerCase();
      return riskySites.has(riskKey);
    }).length;
    const usedPercent = Number(data?.storageUsedPct);
    const progressTone = buildProgressTone(usedPercent);
    const hasLiveCapacity = isLive
      && Number.isFinite(usedPercent)
      && Number.isFinite(Number(data?.totalCapacityGB))
      && Number.isFinite(Number(data?.totalStorageUsedGB));
    const quotaPanel = hasLiveCapacity ? `
      <div class="live-storage-panel">
        <div class="live-storage-panel-head">
          <div>
            <span class="live-storage-kicker">SharePoint Storage Quota</span>
            <h4>Capaciteit & gebruik</h4>
            <p>${liveEscapeHtml(data?.storageCapacityLabel || 'Quotaformule niet beschikbaar')}</p>
          </div>
          <div class="live-storage-percent live-storage-percent--${progressTone}">${liveEscapeHtml(formatPercent(usedPercent))}</div>
        </div>
        <div class="live-storage-grid">
          <article class="live-storage-card">
            <span>Capaciteit</span>
            <strong>${liveEscapeHtml(formatStorageGb(data?.totalCapacityGB))}</strong>
            <small>beschikbaar volgens tenantformule</small>
          </article>
          <article class="live-storage-card">
            <span>Gebruikt</span>
            <strong>${liveEscapeHtml(formatStorageGb(data?.totalStorageUsedGB))}</strong>
            <small>${liveEscapeHtml(formatPercent(usedPercent))} van capaciteit</small>
          </article>
          <article class="live-storage-card">
            <span>Beschikbaar</span>
            <strong>${liveEscapeHtml(formatStorageGb(data?.storageRemainingGB))}</strong>
            <small>${liveEscapeHtml(formatNumber(data?.licenseUnitsForQuota || 0))} licenties meegenomen</small>
          </article>
          <article class="live-storage-card">
            <span>Gemiddeld per site</span>
            <strong>${liveEscapeHtml(formatStorageGb(data?.avgStoragePerSiteGB))}</strong>
            <small>${liveEscapeHtml(formatNumber(data?.sitesWithStorage || 0))} sites met data</small>
          </article>
        </div>
        <div class="live-storage-progress">
          <div class="live-storage-progress-bar">
            <span class="live-storage-progress-fill live-storage-progress-fill--${progressTone}" style="width:${Math.max(0, Math.min(100, usedPercent))}%"></span>
          </div>
          <div class="live-storage-progress-meta">
            <span>${liveEscapeHtml(formatStorageGb(data?.totalStorageUsedGB))} gebruikt</span>
            <span>${liveEscapeHtml(formatStorageGb(data?.totalCapacityGB))} totaal</span>
          </div>
        </div>
      </div>
    ` : '';

    const sortedSites = [...sites].sort((a, b) => {
      const keyA = String(a.webUrl || a.displayName || a.id || '').trim().toLowerCase();
      const keyB = String(b.webUrl || b.displayName || b.id || '').trim().toLowerCase();
      const riskA = (riskySites.has(keyA) ? 2 : 0) + (String(a.status || '').toLowerCase() === 'inactief' ? 1 : 0);
      const riskB = (riskySites.has(keyB) ? 2 : 0) + (String(b.status || '').toLowerCase() === 'inactief' ? 1 : 0);
      if (riskA !== riskB) return riskB - riskA;
      return Number(b.storageUsed || 0) - Number(a.storageUsed || 0);
    });
    const workcardCounts = [
      exchangeChip(`${formatNumber(sites.length)} sites`, 'neutral'),
      riskyCount ? exchangeChip(`${formatNumber(riskyCount)} sharing risico`, 'warn') : '',
      inactiveCount ? exchangeChip(`${formatNumber(inactiveCount)} inactief`, 'warn') : '',
      staleCount ? exchangeChip(`${formatNumber(staleCount)} ouder dan 90d`, 'warn') : '',
    ].filter(Boolean).join('');

    return `
      ${renderControlSummaryBanner(control, { title: 'Externe deling' })}
      ${quotaPanel}
      <section class="gb-insights-shell ex-identity-shell" aria-label="SharePoint inzichten">
        <div class="gb-insights-intro">
          <div>
            <p class="gb-insights-kicker">Niveau 2 — Inzichten</p>
            <h3>Focus op sites met deelrisico, inactiviteit en verouderde status.</h3>
          </div>
          <p class="gb-insights-copy">Deze werkkaart volgt dezelfde navigatielogica als Teams en Groepen met directe filtering en prioritering.</p>
        </div>
        <div class="gb-insight-grid">
          <button type="button" class="gb-insight-card is-accent status-good" data-sp-filter="all">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">S</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Sites</span>
                <span class="gb-insight-status status-good">In beeld</span>
              </span>
            </span>
            <span class="gb-insight-label">Alle sites</span>
            <strong>${liveEscapeHtml(formatNumber(sites.length))}</strong>
            <span class="gb-insight-meta">Totaal in tenant</span>
          </button>
          <button type="button" class="gb-insight-card ${riskyCount > 0 ? 'status-warn' : 'status-good'}" data-sp-filter="risk">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">!</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Delen</span>
                <span class="gb-insight-status ${riskyCount > 0 ? 'status-warn' : 'status-good'}">${riskyCount > 0 ? 'Aandacht' : 'In orde'}</span>
              </span>
            </span>
            <span class="gb-insight-label">Externe sharing risico</span>
            <strong>${liveEscapeHtml(formatNumber(riskyCount))}</strong>
            <span class="gb-insight-meta">Controleer rechten en links</span>
          </button>
          <button type="button" class="gb-insight-card ${inactiveCount > 0 ? 'status-warn' : 'status-good'}" data-sp-filter="inactive">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">I</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Status</span>
                <span class="gb-insight-status ${inactiveCount > 0 ? 'status-warn' : 'status-good'}">${inactiveCount > 0 ? 'Review' : 'In orde'}</span>
              </span>
            </span>
            <span class="gb-insight-label">Inactief</span>
            <strong>${liveEscapeHtml(formatNumber(inactiveCount))}</strong>
            <span class="gb-insight-meta">Mogelijk op te schonen</span>
          </button>
          <button type="button" class="gb-insight-card status-neutral" data-sp-filter="stale">
            <span class="gb-insight-top">
              <span class="gb-insight-icon" aria-hidden="true">90</span>
              <span class="gb-insight-badges">
                <span class="gb-insight-source">Recency</span>
                <span class="gb-insight-status status-neutral">Ouder</span>
              </span>
            </span>
            <span class="gb-insight-label">> 90 dagen geen wijziging</span>
            <strong>${liveEscapeHtml(formatNumber(staleCount))}</strong>
            <span class="gb-insight-meta">Plan reviewcyclus</span>
          </button>
        </div>
      </section>
      <div class="gb-workstack ex-workstack">
        <section class="gb-workcard is-open" data-tone="${riskyCount > 0 ? 'warn' : 'neutral'}">
          <button type="button" class="gb-workcard-toggle" aria-expanded="true">
            <span class="gb-workcard-headline">
              <span class="gb-workcard-kicker">Werkkaart</span>
              <span class="gb-workcard-title">SharePoint sites overzicht</span>
            </span>
            <span class="gb-workcard-counts">${workcardCounts}</span>
            <span class="gb-workcard-chevron" aria-hidden="true">⌄</span>
          </button>
          <div class="gb-workcard-body" style="display:block">
            <div class="gb-workcard-body-inner">
              <div class="gb-toolbar ex-toolbar-identity">
                <input
                  type="search"
                  id="sharePointSitesSearchInput"
                  class="gb-search ex-search-identity"
                  placeholder="Zoek op site, url, type of status..."
                  value="${liveEscapeHtml(sharePointSitesUiState.search)}"
                >
                <div class="gb-filter-tabs ex-filter-tabs-identity">
                  <button type="button" class="gb-filter-tab${sharePointSitesUiState.filter === 'all' ? ' active' : ''}" data-sp-filter="all">Alle</button>
                  <button type="button" class="gb-filter-tab${sharePointSitesUiState.filter === 'risk' ? ' active' : ''}" data-sp-filter="risk">Risico</button>
                  <button type="button" class="gb-filter-tab${sharePointSitesUiState.filter === 'inactive' ? ' active' : ''}" data-sp-filter="inactive">Inactief</button>
                  <button type="button" class="gb-filter-tab${sharePointSitesUiState.filter === 'root' ? ' active' : ''}" data-sp-filter="root">Root sites</button>
                  <button type="button" class="gb-filter-tab${sharePointSitesUiState.filter === 'stale' ? ' active' : ''}" data-sp-filter="stale">> 90 dagen</button>
                </div>
                <div class="gb-toolbar-info" id="sharePointVisibleCount">${liveEscapeHtml(formatNumber(sites.length))} van ${liveEscapeHtml(formatNumber(sites.length))} sites</div>
                <button type="button" class="live-module-refresh live-module-inline-btn" data-sp-bulk-action="select-risk">Selecteer aandacht</button>
                <button type="button" class="live-module-refresh live-module-inline-btn" data-sp-bulk-action="review-selected">Review selectie</button>
                <button type="button" class="live-module-refresh live-module-inline-btn" data-sp-bulk-action="export-selected">Export selectie</button>
                <div class="gb-toolbar-info" id="sharePointBulkSelectionCount">0 geselecteerd</div>
              </div>
              <div class="gb-table-wrap assessment-table-wrap live-entity-table-wrap">
                <table class="gb-table assessment-table live-entity-table">
          <thead>
            <tr>
              <th><input type="checkbox" id="sharePointSelectAll" aria-label="Selecteer zichtbare sites"></th>
              <th>Site</th>
              <th>Severity</th>
              <th>SLA</th>
              <th>Opslag</th>
              <th>Status</th>
              <th>Laatst gewijzigd</th>
              <th>Type</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${sortedSites.slice(0, 200).map((site) => {
              const statusText = String(site.status || 'Onbekend');
              const statusClass = statusText.toLowerCase() === 'inactief' ? 'live-badge-warn' : 'live-badge-ok';
              const storageLabel = site.storageLabel && site.storageLabel !== '—'
                ? String(site.storageLabel)
                : formatStorageGb(site.storageUsed);
              const riskKey = String(site.webUrl || site.displayName || site.id || '').trim().toLowerCase();
              const sharingRisk = riskySites.has(riskKey);
              const isInactive = statusText.toLowerCase() === 'inactief';
              const modifiedDays = ageInDays(site.lastModified || site.lastModifiedDateTime);
              const recencySla = getRecencySla(modifiedDays, { warnDays: 60, overdueDays: 120 });
              const severityClass = sharingRisk ? 'live-badge-crit' : isInactive ? 'live-badge-warn' : 'live-badge-ok';
              const severityLabel = sharingRisk ? 'Kritiek' : isInactive ? 'Aandacht' : 'In orde';
              const detailId = registerDetailEntry({
                kicker: 'Bestanden & Sites',
                title: site.displayName || site.webUrl || 'Sitedetail',
                data: site,
                bodyHtml: typeof window.renderSideRailTemplate === 'function'
                  ? window.renderSideRailTemplate({
                      tone: sharingRisk ? 'warn' : 'good',
                      statusLabel: sharingRisk ? 'Aandacht' : 'In orde',
                      summaryCards: [
                        { label: 'Status', value: statusText, meta: site.isRootSite ? 'rootsite' : 'site', tone: statusText.toLowerCase() === 'inactief' ? 'warn' : 'good' },
                        { label: 'Opslag', value: storageLabel || '—', meta: isLive ? 'live berekend' : 'snapshot', tone: 'neutral' },
                        { label: 'Wijziging', value: formatDate(site.lastModified || site.lastModifiedDateTime), meta: 'laatst gewijzigd', tone: 'neutral' },
                        { label: 'Sharing', value: sharingRisk ? 'Aandacht' : 'In orde', meta: sharingRisk ? 'externe deling signaal' : 'geen extra risico', tone: sharingRisk ? 'warn' : 'good' },
                      ],
                      sections: [
                        {
                          title: 'Site informatie',
                          badge: site.isRootSite ? 'Root site' : 'Site',
                          tone: site.isRootSite ? 'neutral' : 'good',
                          bodyHtml: `
                            <div class="ex-detail-grid">
                              <div class="ex-detail-item"><label>Naam</label><span>${liveEscapeHtml(site.displayName || '—')}</span></div>
                              <div class="ex-detail-item"><label>URL</label><span>${site.webUrl ? `<a href="${liveEscapeHtml(site.webUrl)}" target="_blank" rel="noopener noreferrer">${liveEscapeHtml(site.webUrl)}</a>` : '—'}</span></div>
                              <div class="ex-detail-item"><label>Opslag</label><span>${liveEscapeHtml(storageLabel || '—')}</span></div>
                              <div class="ex-detail-item"><label>Status</label><span>${liveEscapeHtml(statusText)}</span></div>
                              <div class="ex-detail-item"><label>Laatst gewijzigd</label><span>${liveEscapeHtml(formatDate(site.lastModified || site.lastModifiedDateTime))}</span></div>
                              <div class="ex-detail-item"><label>Type</label><span>${site.isRootSite ? 'Root site' : 'Site'}</span></div>
                            </div>`,
                        },
                      ],
                      findings: sharingRisk ? [{
                        tone: 'warn',
                        label: 'Aandacht',
                        title: 'Externe deling of anonimiteit',
                        body: 'Deze site kwam naar voren in de sharing-controle. Controleer externe deling, anonieme links en eigenaarschap.',
                      }] : [{
                        tone: 'good',
                        label: 'Goed',
                        title: 'Geen direct delingsrisico',
                        body: 'Er zijn geen directe verhoogde sharing-signalen voor deze site gevonden.',
                      }],
                      actions: [{
                        title: 'Sitecontrole',
                        body: sharingRisk
                          ? 'Controleer externe deling, anonieme koppelingen en verwijder overbodige toegang.'
                          : 'Controleer periodiek eigenaarschap, delingsbeleid en opslaggebruik.',
                      }],
                    })
                  : '',
              });
              return `
                <tr
                  data-sp-row="site"
                  data-risk="${sharingRisk ? 'true' : 'false'}"
                  data-inactive="${isInactive ? 'true' : 'false'}"
                  data-root="${site.isRootSite ? 'true' : 'false'}"
                  data-stale="${modifiedDays !== null && modifiedDays >= 90 ? 'true' : 'false'}"
                  data-search="${liveEscapeHtml([
                    site.displayName,
                    site.webUrl,
                    statusText,
                    storageLabel,
                    site.isRootSite ? 'root site' : 'site',
                  ].filter(Boolean).join(' '))}"
                >
                  <td><input type="checkbox" data-sp-select aria-label="Selecteer site ${liveEscapeHtml(site.displayName || site.webUrl || 'onbekend')}" data-name="${liveEscapeHtml(site.displayName || site.webUrl || '')}" data-url="${liveEscapeHtml(site.webUrl || '')}" data-severity="${liveEscapeHtml(severityLabel)}" data-risk="${sharingRisk ? 'true' : 'false'}"></td>
                  <td>
                    <div class="live-entity-main">
                      <strong>${liveEscapeHtml(site.displayName || site.webUrl || 'Onbekende site')}</strong>
                      <span>${site.webUrl ? `<a href="${liveEscapeHtml(site.webUrl)}" target="_blank" rel="noopener noreferrer">${liveEscapeHtml(site.webUrl)}</a>` : 'Geen URL beschikbaar'}</span>
                    </div>
                  </td>
                  <td><span class="live-badge ${severityClass}">${severityLabel}</span></td>
                  <td><span class="live-badge ${recencySla.className}">${liveEscapeHtml(sharingRisk ? 'Binnen 24u' : recencySla.label)}</span></td>
                  <td>${liveEscapeHtml(storageLabel || '—')}</td>
                  <td><span class="live-badge ${statusClass}">${liveEscapeHtml(statusText)}</span></td>
                  <td>${liveEscapeHtml(formatDate(site.lastModified || site.lastModifiedDateTime))}</td>
                  <td>${site.isRootSite ? '<span class="live-badge live-badge-info">Root site</span>' : '<span class="live-badge live-badge-neutral">Site</span>'}</td>
                  <td><button type="button" class="live-detail-btn" data-live-detail-id="${liveEscapeHtml(detailId)}">Meer info</button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderAppRegistrationsBody(data) {
    const apps = (data?.apps || data?.items || []).filter((item) => item && typeof item === 'object');
    const control = getControlPayload(data, 'app-secrets-and-certs');
    appRegState.items = apps;
    if (!apps.length) return '<p class="live-module-empty">Geen app-registraties beschikbaar voor deze tenant.</p>';

    const total       = Number(control?.summary?.total || apps.length);
    const expired     = Number(control?.summary?.critical || 0) || apps.filter((a) => {
      const s = (String(a.secretExpirationStatus || '') + String(a.certificateExpirationStatus || '')).toLowerCase();
      return s.includes('verlopen') || s.includes('expired');
    }).length;
    const expiringSoon = Number(control?.summary?.warning || 0) || apps.filter((a) => {
      const s = (String(a.secretExpirationStatus || '') + String(a.certificateExpirationStatus || '')).toLowerCase();
      return !s.includes('verlopen') && !s.includes('expired') && (s.includes('dag') || s.includes('warning') || s.includes('critical'));
    }).length;
    const ok = total - expired - expiringSoon;

    return `
    ${renderControlSummaryBanner(control, { title: 'Secrets & certificaten' })}
    <div class="live-insight-strip" style="margin-bottom:1.25rem">
      <article class="live-insight-card">
        <span class="live-insight-label">Totaal apps</span>
        <strong>${total}</strong>
        <span class="live-insight-meta">app-registraties</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Verlopen</span>
        <strong style="color:var(--dj-${expired > 0 ? 'risk' : 'ok'})">${expired}</strong>
        <span class="live-insight-meta">secrets of certificaten</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Verloopt binnenkort</span>
        <strong style="color:var(--dj-${expiringSoon > 0 ? 'warn' : 'ok'})">${expiringSoon}</strong>
        <span class="live-insight-meta">binnen 14 dagen</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">In orde</span>
        <strong style="color:var(--dj-${ok === total ? 'ok' : 'neutral'})">${ok}</strong>
        <span class="live-insight-meta">geen problemen gevonden</span>
      </article>
    </div>
      <div class="assessment-table-wrap live-entity-table-wrap">
        <table class="assessment-table live-entity-table">
          <thead>
            <tr>
              <th>Applicatie</th>
              <th>Status</th>
              <th>Secrets</th>
              <th>Certificaten</th>
              <th>Permissies</th>
              <th>Actie</th>
            </tr>
          </thead>
          <tbody>
            ${apps.slice(0, 200).map((app) => {
              const secretStatus = String(app.secretExpirationStatus || 'Onbekend');
              const certificateStatus = String(app.certificateExpirationStatus || 'Onbekend');
              const statusText = `${secretStatus} / ${certificateStatus}`.toLowerCase();
              const statusClass = statusText.includes('verlopen') || statusText.includes('expired')
                ? 'live-badge-crit'
                : (statusText.includes('14 dagen') || statusText.includes('critical') || statusText.includes('warning')
                  ? 'live-badge-warn'
                  : 'live-badge-ok');
              return `
                <tr>
                  <td>
                    <div class="live-entity-main">
                      <strong>${liveEscapeHtml(app.displayName || 'Onbekende app')}</strong>
                      <span>${liveEscapeHtml(app.appId || 'Geen appId')}</span>
                      ${app.hasEnterpriseApp ? '<p>Enterprise app aanwezig</p>' : '<p>Alleen app-registratie zichtbaar</p>'}
                    </div>
                  </td>
                  <td><span class="live-badge ${statusClass}">${liveEscapeHtml(secretStatus)}</span></td>
                  <td>${liveEscapeHtml(formatNumber(app.secretCount || 0))}</td>
                  <td>${liveEscapeHtml(formatNumber(app.certificateCount || 0))}</td>
                  <td>${liveEscapeHtml(formatNumber(app.permissionCount || 0))}</td>
                  <td><button type="button" class="live-module-refresh live-module-inline-btn" data-appreg-id="${liveEscapeHtml(app.id || app.appId || '')}">Details</button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function openAppRegistrationModal(appId) {
    const tenantId = selectedTenantId();
    if (!tenantId || !appId) return;

    // Gebruik het Inzichten-paneel in plaats van een modale popup
    if (typeof window.openSideRailDetail === 'function') {
      window.openSideRailDetail('App registratie', 'Laden…');
    }

    try {
      const data = await liveFetchJson(`/api/apps/${tenantId}/registrations/${encodeURIComponent(appId)}`);
      const appTitle = data.displayName || data.appId || 'App registratie';
      const secrets = Array.isArray(data.secrets) ? data.secrets : [];
      const certs = Array.isArray(data.certs) ? data.certs : [];
      const redirects = Array.isArray(data.redirectUris) ? data.redirectUris : [];
      const identifiers = Array.isArray(data.identifierUris) ? data.identifierUris : [];
      const access = Array.isArray(data.requiredResourceAccess) ? data.requiredResourceAccess : [];
      const resolvedPerms = Array.isArray(data.permissions) ? data.permissions : [];
      const permissionRows = resolvedPerms.length
        ? (() => {
            const grouped = {};
            resolvedPerms.forEach((p) => {
              const resource = p.Resource || p.resource || 'Onbekend';
              if (!grouped[resource]) grouped[resource] = [];
              grouped[resource].push({ type: p.Type || p.type || '', name: p.Permission || p.permission || p.value || '?' });
            });
            return Object.entries(grouped).map(([resource, perms]) => `
              <div class="ex-detail-item" style="grid-column:1/-1">
                <label>${liveEscapeHtml(resource)}</label>
                <span>${perms.map((perm) => `${liveEscapeHtml(perm.name)} (${liveEscapeHtml(perm.type || 'scope')})`).join(', ')}</span>
              </div>
            `).join('');
          })()
        : (access.length
          ? access.map((item) => `
              <div class="ex-detail-item" style="grid-column:1/-1">
                <label>${liveEscapeHtml(item.resourceAppId || 'Resource')}</label>
                <span>${liveEscapeHtml(String((item.resourceAccess || []).length || 0))} rechten</span>
              </div>
            `).join('')
          : '<div class="ex-detail-item" style="grid-column:1/-1"><label>API-rechten</label><span>Geen API-rechten gevonden.</span></div>');
      const bodyHtml = typeof window.renderSideRailTemplate === 'function'
        ? window.renderSideRailTemplate({
            tone: certs.length || secrets.length ? 'warn' : 'good',
            statusLabel: certs.length || secrets.length ? 'Aandacht' : 'In orde',
            summaryCards: [
              { label: 'Secrets', value: formatNumber(secrets.length), meta: 'app credentials', tone: secrets.length ? 'warn' : 'good' },
              { label: 'Certificaten', value: formatNumber(certs.length), meta: 'app certs', tone: certs.length ? 'warn' : 'good' },
              { label: 'Redirect URI', value: formatNumber(redirects.length), meta: 'geconfigureerd', tone: 'neutral' },
              { label: 'API-rechten', value: formatNumber(resolvedPerms.length || access.length), meta: 'toestemmingen', tone: 'neutral' },
            ],
            sections: [
              {
                title: 'App metadata',
                badge: data.hasEnterpriseApp ? 'Enterprise app' : 'App registratie',
                tone: data.hasEnterpriseApp ? 'warn' : 'good',
                bodyHtml: `
                  <div class="ex-detail-grid">
                    <div class="ex-detail-item"><label>App ID</label><span>${liveEscapeHtml(data.appId || '—')}</span></div>
                    <div class="ex-detail-item"><label>Audience</label><span>${liveEscapeHtml(data.signInAudience || '—')}</span></div>
                    <div class="ex-detail-item"><label>Aangemaakt</label><span>${liveEscapeHtml(formatDate(data.createdAt))}</span></div>
                    <div class="ex-detail-item"><label>Enterprise app</label><span>${data.hasEnterpriseApp ? 'Ja' : 'Nee'}</span></div>
                  </div>`,
              },
              {
                title: 'Credentials',
                badge: `${secrets.length + certs.length}`,
                tone: certs.length || secrets.length ? 'warn' : 'good',
                bodyHtml: `
                  <div class="ex-detail-grid">
                    ${secrets.length
                      ? secrets.map((secret) => `<div class="ex-detail-item"><label>Secret</label><span>${liveEscapeHtml(secret.hint || secret.keyId || 'Secret')} · ${liveEscapeHtml(secret.statusLabel || '—')}</span></div>`).join('')
                      : '<div class="ex-detail-item"><label>Secrets</label><span>Geen secrets gevonden.</span></div>'}
                    ${certs.length
                      ? certs.map((cert) => `<div class="ex-detail-item"><label>Certificaat</label><span>${liveEscapeHtml(cert.type || cert.keyId || 'Certificaat')} · ${liveEscapeHtml(cert.statusLabel || '—')}</span></div>`).join('')
                      : '<div class="ex-detail-item"><label>Certificaten</label><span>Geen certificaten gevonden.</span></div>'}
                  </div>`,
              },
              {
                title: 'Redirects & permissies',
                badge: 'Graph',
                tone: 'neutral',
                bodyHtml: `
                  <div class="ex-detail-grid">
                    <div class="ex-detail-item" style="grid-column:1/-1"><label>Redirect URI's</label><span>${redirects.length ? redirects.map((uri) => liveEscapeHtml(uri)).join(', ') : "Geen redirect URI's"}</span></div>
                    <div class="ex-detail-item" style="grid-column:1/-1"><label>Identifier URI's</label><span>${identifiers.length ? identifiers.map((uri) => liveEscapeHtml(uri)).join(', ') : "Geen identifier URI's"}</span></div>
                    ${permissionRows}
                  </div>`,
              },
            ],
            findings: [{
              tone: certs.length || secrets.length ? 'warn' : 'good',
              label: certs.length || secrets.length ? 'Aandacht' : 'In orde',
              title: 'App registratie controle',
              body: certs.length || secrets.length
                ? 'Controleer credential-hygiëne, verloopdatums en toegewezen API-permissies.'
                : 'Geen credentials gevonden die directe opvolging vereisen.',
            }],
            actions: [{
              title: 'Aanbevolen actie',
              body: 'Review periodiek credentials en API-machtigingen. Verwijder ongebruikte secrets en beperk broad consent.',
            }],
          })
        : `
            <div class="live-detail-grid">
              <div class="live-detail-card"><span>App ID</span><strong>${liveEscapeHtml(data.appId || '—')}</strong></div>
              <div class="live-detail-card"><span>Audience</span><strong>${liveEscapeHtml(data.signInAudience || '—')}</strong></div>
            </div>
          `;
      if (typeof window.updateSideRailDetail === 'function') {
        window.updateSideRailDetail(appTitle, bodyHtml);
      }
    } catch (error) {
      if (typeof window.updateSideRailDetail === 'function') {
        window.updateSideRailDetail('Fout', `<div class="live-module-error">${liveEscapeHtml(error.message || 'Details laden mislukt.')}</div>`);
      }
    }
  }

  function renderAlertsConfigForm(sectionName, tabKey, data) {
    const cfg = data?.config || {};
    return `
      <div class="live-module-config-card">
        <div class="live-module-config-title">Webhook & e-mail notificaties</div>
        <div class="live-module-form-group">
          <label for="alertsWebhookUrl">Webhook URL</label>
          <input type="url" id="alertsWebhookUrl" class="live-module-input" value="${liveEscapeHtml(cfg.webhook_url || '')}" placeholder="https://outlook.office.com/webhook/...">
        </div>
        <div class="live-module-form-group">
          <label for="alertsWebhookType">Webhook type</label>
          <select id="alertsWebhookType" class="live-module-select">
            <option value="teams"${cfg.webhook_type === 'teams' ? ' selected' : ''}>Microsoft Teams</option>
            <option value="slack"${cfg.webhook_type === 'slack' ? ' selected' : ''}>Slack</option>
            <option value="generic"${cfg.webhook_type === 'generic' ? ' selected' : ''}>Generiek JSON</option>
          </select>
        </div>
        <div class="live-module-form-group">
          <label for="alertsEmailAddr">E-mailadres</label>
          <input type="email" id="alertsEmailAddr" class="live-module-input" value="${liveEscapeHtml(cfg.email_addr || '')}" placeholder="alerts@bedrijf.nl">
        </div>
        <div class="live-module-action-row">
          <button type="button" class="live-module-refresh" data-alerts-action="save">Opslaan</button>
          <button type="button" class="live-module-refresh" data-alerts-action="test">Test webhook</button>
        </div>
        <div id="alertsConfigResult" class="live-module-config-result"></div>
      </div>
    `;
  }

  /* ── Custom renderers per identity tab ── */

  function renderMfaBody(data) {
    const users = data?.users || [];
    if (!users.length) {
      return '<p class="live-module-empty">Geen MFA-data beschikbaar. Controleer UserAuthenticationMethod.Read.All permissie.</p>';
    }
    const formatRegisteredMethods = (user) => {
      const fallback = user?.defaultMfaMethod && user.defaultMfaMethod !== 'none'
        ? user.defaultMfaMethod
        : '';
      const raw = user?.methodsRegistered;
      if (Array.isArray(raw)) {
        const values = raw
          .map((value) => String(value || '').trim())
          .filter(Boolean);
        return values.join(', ') || fallback || '—';
      }
      if (typeof raw === 'string') {
        return raw.trim() || fallback || '—';
      }
      if (raw && typeof raw === 'object') {
        const values = Object.values(raw)
          .flatMap((value) => Array.isArray(value) ? value : [value])
          .map((value) => String(value || '').trim())
          .filter(Boolean);
        return values.join(', ') || fallback || '—';
      }
      return fallback || '—';
    };
    const total       = users.length;
    const mfaCount    = users.filter((u) => u.isMfaRegistered).length;
    const mfaPct      = total > 0 ? Math.round((mfaCount / total) * 100) : 0;
    const adminNoMfa  = users.filter((u) => u.isAdmin && !u.isMfaRegistered).length;
    const passwordless = users.filter((u) => u.isPasswordless).length;
    const mfaTone     = mfaPct >= 90 ? 'ok' : mfaPct >= 70 ? 'warn' : 'risk';
    const adminTone   = adminNoMfa === 0 ? 'ok' : 'risk';

    const alertRow = adminNoMfa > 0
      ? `<div class="live-module-alert-row">Let op: ${adminNoMfa} admin${adminNoMfa > 1 ? 's' : ''} zonder MFA-registratie</div>`
      : '';

    return alertRow + `
    <div class="live-insight-strip" style="margin-bottom:1.25rem">
      <article class="live-insight-card">
        <span class="live-insight-label">MFA-dekking</span>
        <strong style="color:var(--dj-${mfaTone})">${mfaPct}%</strong>
        <span class="live-insight-meta">${mfaCount} van ${total} gebruikers</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Zonder MFA</span>
        <strong style="color:var(--dj-${total - mfaCount > 0 ? 'risk' : 'ok'})">${total - mfaCount}</strong>
        <span class="live-insight-meta">gebruikers niet geregistreerd</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Admins zonder MFA</span>
        <strong style="color:var(--dj-${adminTone})">${adminNoMfa}</strong>
        <span class="live-insight-meta">${adminNoMfa === 0 ? 'Alle admins beveiligd' : 'Direct actie vereist'}</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Wachtwoordloos</span>
        <strong>${passwordless}</strong>
        <span class="live-insight-meta">gebruikers (${total > 0 ? Math.round((passwordless/total)*100) : 0}%)</span>
      </article>
    </div>
      <div class="assessment-table-wrap">
        <table class="assessment-table">
          <thead>
            <tr>
              <th>Gebruiker</th>
              <th>UPN</th>
              <th>MFA</th>
              <th>Standaard methode</th>
              <th>Wachtwoordloos</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            ${users.slice(0, 200).map((u) => `
              <tr>
                <td>${liveEscapeHtml(u.displayName || '—')}</td>
                <td class="live-small">${liveEscapeHtml(u.upn || '—')}</td>
                <td><span class="live-badge ${u.isMfaRegistered ? 'live-badge-ok' : 'live-badge-warn'}">${u.isMfaRegistered ? 'Ja' : 'Nee'}</span></td>
                <td class="live-small">${liveEscapeHtml(formatRegisteredMethods(u))}</td>
                <td><span class="live-badge ${u.isPasswordless ? 'live-badge-ok' : 'live-badge-neutral'}">${u.isPasswordless ? 'Ja' : 'Nee'}</span></td>
                <td>${u.isAdmin ? '<span class="live-badge live-badge-info">Admin</span>' : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderGuestsBody(data) {
    const guests = Array.isArray(data?.guests)
      ? data.guests
      : (Array.isArray(data?.items) ? data.items : []);
    const control = getControlPayload(data, 'guest-user-governance');
    if (!guests.length) return '<p class="live-module-empty">Geen gastaccounts gevonden in deze tenant.</p>';

    const total    = guests.length;
    const active   = guests.filter((g) => g.accountEnabled).length;
    const inactive = total - active;
    const noSignIn = guests.filter((g) => !g.lastSignIn).length;
    const noSignInTone = noSignIn > 0 ? (noSignIn > total * 0.5 ? 'risk' : 'warn') : 'ok';

    return `
    ${renderControlSummaryBanner(control, { title: 'Gastgebruikers governance' })}
    <div class="live-insight-strip" style="margin-bottom:1.25rem">
      <article class="live-insight-card">
        <span class="live-insight-label">Totaal gasten</span>
        <strong>${total}</strong>
        <span class="live-insight-meta">gastaccounts</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Actief</span>
        <strong style="color:var(--dj-${active === total ? 'ok' : 'neutral'})">${active}</strong>
        <span class="live-insight-meta">${inactive} uitgeschakeld</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Nooit aangemeld</span>
        <strong style="color:var(--dj-${noSignInTone})">${noSignIn}</strong>
        <span class="live-insight-meta">geen login-activiteit bekend</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Uitgeschakeld</span>
        <strong style="color:var(--dj-${inactive > 0 ? 'warn' : 'ok'})">${inactive}</strong>
        <span class="live-insight-meta">accounts geblokkeerd</span>
      </article>
    </div>
      <div class="assessment-table-wrap">
        <table class="assessment-table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>E-mail</th>
              <th>Severity</th>
              <th>SLA</th>
              <th>Account</th>
              <th>Uitnodiging</th>
              <th>Aangemaakt</th>
              <th>Laatste aanmelding</th>
            </tr>
          </thead>
          <tbody>
            ${guests.slice(0, 200).map((g) => {
              const created = g.createdAt ? new Date(g.createdAt).toLocaleDateString('nl-NL') : '—';
              const lastSignIn = g.lastSignIn ? new Date(g.lastSignIn).toLocaleDateString('nl-NL') : '—';
              const inactivityDays = ageInDays(g.lastSignIn || g.createdAt);
              const sla = getRecencySla(inactivityDays, { warnDays: 60, overdueDays: 120 });
              const severityClass = !g.accountEnabled || !g.lastSignIn ? 'live-badge-warn' : 'live-badge-ok';
              const severityLabel = !g.accountEnabled ? 'Aandacht' : (!g.lastSignIn ? 'Review' : 'In orde');
              return `
                <tr>
                  <td>${liveEscapeHtml(g.displayName || '—')}</td>
                  <td class="live-small">${liveEscapeHtml(g.mail || g.upn || '—')}</td>
                  <td><span class="live-badge ${severityClass}">${severityLabel}</span></td>
                  <td><span class="live-badge ${sla.className}">${liveEscapeHtml(!g.lastSignIn ? 'Binnen 7d' : sla.label)}</span></td>
                  <td><span class="live-badge ${g.accountEnabled ? 'live-badge-ok' : 'live-badge-warn'}">${g.accountEnabled ? 'Actief' : 'Uitgeschakeld'}</span></td>
                  <td class="live-small">${liveEscapeHtml(g.inviteStatus || '—')}</td>
                  <td>${liveEscapeHtml(created)}</td>
                  <td>${liveEscapeHtml(lastSignIn)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderAdminRolesBody(data) {
    const roles = data?.roles || [];
    const membershipControl = getControlPayload(data, 'admin-role-membership');
    const breakGlassControl = getControlPayload(data, 'break-glass-accounts');
    if (!roles.length) return '<p class="live-module-empty">Geen beheerdersrollen met leden gevonden.</p>';

    const totalAssignments = roles.reduce((sum, r) => sum + (r.memberCount || 0), 0);
    const globalAdminRole  = roles.find((r) => /global.?admin/i.test(r.roleName || ''));
    const globalAdminCount = globalAdminRole ? (globalAdminRole.memberCount || 0) : 0;
    const globalAdminTone  = globalAdminCount <= 2 ? 'ok' : globalAdminCount <= 4 ? 'warn' : 'risk';
    const uniqueRoles      = roles.length;

    return `
    ${renderControlSummaryBanner(membershipControl, { title: 'Rolbezetting' })}
    ${renderControlSummaryBanner(breakGlassControl, { title: 'Break-glass controle' })}
    <div class="live-insight-strip" style="margin-bottom:1.25rem">
      <article class="live-insight-card">
        <span class="live-insight-label">Bezette rollen</span>
        <strong>${uniqueRoles}</strong>
        <span class="live-insight-meta">unieke admin-rollen actief</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Totaal toewijzingen</span>
        <strong>${totalAssignments}</strong>
        <span class="live-insight-meta">admin-accounts in totaal</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Global Admins</span>
        <strong style="color:var(--dj-${globalAdminTone})">${globalAdminCount}</strong>
        <span class="live-insight-meta">${globalAdminCount <= 2 ? 'Aanbevolen aantal' : 'Overweeg reductie'}</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Gem. per rol</span>
        <strong>${uniqueRoles > 0 ? (totalAssignments / uniqueRoles).toFixed(1) : 0}</strong>
        <span class="live-insight-meta">admins per rol gemiddeld</span>
      </article>
    </div>
      <div class="live-roles-grid">
        ${roles.map((role) => `
          <div class="live-role-card">
            <div class="live-role-header">
              <span>${liveEscapeHtml(role.roleName || '—')}</span>
              <span class="live-badge live-badge-info">${role.memberCount || 0} ${role.memberCount === 1 ? 'lid' : 'leden'}</span>
            </div>
            <div class="live-role-members">
              ${(role.members || []).map((m) => `
                <div class="live-role-member">
                  <span>${liveEscapeHtml(m.displayName || '—')}</span>
                  <span class="live-role-member-upn">${liveEscapeHtml(m.upn || '')}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderSecurityDefaultsBody(data) {
    const enabled = data?.securityDefaultsEnabled;
    const rec = data?.recommendation || '';
    const lastMod = data?.lastModifiedAt ? new Date(data.lastModifiedAt).toLocaleDateString('nl-NL') : '—';
    const isWarn = rec.startsWith('Waarschuwing') || rec.startsWith('Let op');
    const statusLabel = enabled === true ? 'Ingeschakeld' : enabled === false ? 'Uitgeschakeld' : '—';
    const statusClass = enabled === true ? 'live-badge-ok' : enabled === false ? 'live-badge-warn' : 'live-badge-neutral';
    return `
      <div class="live-security-defaults-card">
        <div class="live-sd-status">
          <span>Security Defaults</span>
          <span class="live-badge ${statusClass} live-badge-lg">${liveEscapeHtml(statusLabel)}</span>
        </div>
        <div class="live-sd-row">
          <span class="live-sd-label">Laatste wijziging</span>
          <span>${liveEscapeHtml(lastMod)}</span>
        </div>
        <div class="live-sd-row">
          <span class="live-sd-label">Actieve CA-policies</span>
          <span>${data?.caEnabledPolicies ?? '—'}</span>
        </div>
        ${rec ? `<div class="live-sd-recommendation ${isWarn ? 'live-sd-warn' : 'live-sd-ok'}">${liveEscapeHtml(rec)}</div>` : ''}
      </div>
    `;
  }

  function renderLegacyAuthBody(data) {
    const users = data?.users || [];
    const note = data?.note;
    const control = getControlPayload(data, 'legacy-auth-exposure');
    if (!users.length) {
      return `<p class="live-module-empty">${liveEscapeHtml(note || 'Geen legacy-auth activiteit gevonden in de afgelopen 30 dagen.')}</p>`;
    }

    const total      = users.length;
    const totalSignIns = users.reduce((sum, u) => sum + (u.signInCount || 0), 0);
    const uniqueClients = [...new Set(users.flatMap((u) => (u.clients || '').split(',').map((c) => c.trim()).filter(Boolean)))].length;
    const riskTone   = total > 0 ? 'risk' : 'ok';

    return `
    ${renderControlSummaryBanner(control, { title: 'Legacy-auth exposure' })}
    <div class="live-insight-strip" style="margin-bottom:1.25rem">
      <article class="live-insight-card">
        <span class="live-insight-label">Gebruikers legacy-auth</span>
        <strong style="color:var(--dj-${riskTone})">${total}</strong>
        <span class="live-insight-meta">actief in afgelopen 30 dagen</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Totaal aanmeldingen</span>
        <strong style="color:var(--dj-${riskTone})">${totalSignIns}</strong>
        <span class="live-insight-meta">via legacy-protocollen</span>
      </article>
      <article class="live-insight-card">
        <span class="live-insight-label">Unieke clients</span>
        <strong>${uniqueClients}</strong>
        <span class="live-insight-meta">legacy client-typen</span>
      </article>
    </div>
      <div class="assessment-table-wrap">
        <table class="assessment-table">
          <thead>
            <tr>
              <th>Gebruiker</th>
              <th>UPN</th>
              <th>Legacy clients</th>
              <th>Aanmeldingen</th>
              <th>Laatste aanmelding</th>
            </tr>
          </thead>
          <tbody>
            ${users.slice(0, 150).map((u) => {
              const lastSignIn = u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString('nl-NL') : '—';
              return `
                <tr>
                  <td>${liveEscapeHtml(u.displayName || '—')}</td>
                  <td class="live-small">${liveEscapeHtml(u.upn || '—')}</td>
                  <td><span class="live-badge live-badge-warn">${liveEscapeHtml(u.clients || '—')}</span></td>
                  <td>${u.signInCount || 0}</td>
                  <td>${liveEscapeHtml(lastSignIn)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCisBenchmarkBody(data) {
    const items = (data?.items || []).filter((item) => item && typeof item === 'object');
    const summary = data?.summary || {};
    if (!items.length && !summary.total) {
      return '<p class="live-module-empty">Geen CIS-data beschikbaar. Voer een assessment uit met de "-ExportJson" optie.</p>';
    }
    const statusBadge = (status) => {
      const map = { Pass: 'live-badge-ok', Fail: 'live-badge-crit', Warning: 'live-badge-warn', NA: 'live-badge-neutral' };
      const labels = { Pass: 'In orde', Fail: 'Actie vereist', Warning: 'Aandacht vereist', NA: 'Niet van toepassing' };
      return `<span class="live-badge ${map[status] || 'live-badge-neutral'}">${liveEscapeHtml(labels[status] || status)}</span>`;
    };
    const score = Number(summary.score) || 0;
    const progressTone = score >= 70 ? 'ok' : score >= 50 ? 'warn' : 'crit';
    return `
      <div class="live-insight-strip">
        <article class="live-insight-card">
          <span class="live-insight-label">Score</span>
          <strong class="live-storage-percent--${liveEscapeHtml(progressTone)}">${liveEscapeHtml(String(score))}%</strong>
          <span class="live-insight-meta">${liveEscapeHtml(formatNumber(summary.pass || 0))} / ${liveEscapeHtml(formatNumber(summary.total || 0))} controls</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">In orde</span>
          <strong>${liveEscapeHtml(formatNumber(summary.pass || 0))}</strong>
          <span class="live-insight-meta">voldaan</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Actie vereist</span>
          <strong>${liveEscapeHtml(formatNumber(summary.fail || 0))}</strong>
          <span class="live-insight-meta">niet voldaan</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Aandacht vereist</span>
          <strong>${liveEscapeHtml(formatNumber(summary.warning || 0))}</strong>
          <span class="live-insight-meta">aandachtspunt</span>
        </article>
      </div>
      <div class="live-storage-progress" style="margin-bottom:1.5rem">
        <div class="live-storage-progress-bar">
          <span class="live-storage-progress-fill live-storage-progress-fill--${liveEscapeHtml(progressTone)}" style="width:${Math.max(0, Math.min(100, score))}%"></span>
        </div>
        <div class="live-storage-progress-meta">
          <span>${liveEscapeHtml(String(score))}% in orde</span>
          <span>CIS M365 Foundations Benchmark v3.0</span>
        </div>
      </div>
      <div class="assessment-table-wrap live-entity-table-wrap">
        <table class="assessment-table live-entity-table">
          <thead>
            <tr>
              <th>Control</th>
              <th>Level</th>
              <th>Categorie</th>
              <th>Status</th>
              <th>Detail</th>
              <th>NIST</th>
              <th>ISO 27001</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((ctrl) => `
              <tr>
                <td>
                  <div class="live-entity-main">
                    <strong>${liveEscapeHtml(ctrl.Title || '—')}</strong>
                    <span>CIS ${liveEscapeHtml(ctrl.Id || '—')}</span>
                  </div>
                </td>
                <td><span class="live-badge live-badge-info">L${liveEscapeHtml(String(ctrl.Level || '?'))}</span></td>
                <td class="live-small">${liveEscapeHtml(ctrl.Category || '—')}</td>
                <td>${statusBadge(ctrl.Status)}</td>
                <td class="live-small">${liveEscapeHtml(ctrl.Detail || '—')}</td>
                <td class="live-small">${liveEscapeHtml(ctrl.NIST || '—')}</td>
                <td class="live-small">${liveEscapeHtml(ctrl.ISO27001 || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderHybridSyncBody(data) {
    const summary = data?.summary || {};
    const domains = (data?.items || []).filter((item) => item && typeof item === 'object');
    const isHybrid = !!summary.isHybrid;
    const syncStatus = String(summary.lastSyncStatus || 'Unknown');
    const syncStatusLabel = syncStatus === 'OK'
      ? 'In orde'
      : syncStatus === 'Warning'
        ? 'Aandacht vereist'
        : syncStatus === 'Critical'
          ? 'Actie vereist'
          : 'Onbekend';
    const syncStatusClass = syncStatus === 'OK' ? 'live-badge-ok' : syncStatus === 'Warning' ? 'live-badge-warn' : syncStatus === 'Critical' ? 'live-badge-crit' : 'live-badge-neutral';
    const syncAge = summary.lastSyncAgeHours != null ? `${Number(summary.lastSyncAgeHours).toFixed(1)} uur geleden` : '—';
    return `
      <div class="live-insight-strip">
        <article class="live-insight-card">
          <span class="live-insight-label">Type</span>
          <strong>${liveEscapeHtml(isHybrid ? 'Hybride' : 'Alleen cloud')}</strong>
          <span class="live-insight-meta">${liveEscapeHtml(summary.authType || '—')}</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Synchronisatiestatus</span>
          <strong><span class="live-badge ${liveEscapeHtml(syncStatusClass)}">${liveEscapeHtml(syncStatusLabel)}</span></strong>
          <span class="live-insight-meta">${liveEscapeHtml(syncAge)}</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Gesynchroniseerd</span>
          <strong>${liveEscapeHtml(formatNumber(summary.syncedUsers || 0))}</strong>
          <span class="live-insight-meta">${liveEscapeHtml(formatNumber(summary.syncedUsersPercent || 0, 1))}% van ${liveEscapeHtml(formatNumber(summary.totalUsers || 0))}</span>
        </article>
        <article class="live-insight-card">
          <span class="live-insight-label">Cloud-only</span>
          <strong>${liveEscapeHtml(formatNumber(summary.cloudOnlyUsers || 0))}</strong>
          <span class="live-insight-meta">gebruikers zonder on-prem account</span>
        </article>
      </div>
      ${!isHybrid ? '<div class="live-module-empty live-module-empty--spaced">Deze tenant is pure cloud — geen AD Connect configuratie aanwezig.</div>' : ''}
      ${domains.length ? `
        <div class="assessment-table-wrap live-entity-table-wrap">
          <table class="assessment-table live-entity-table">
            <thead>
              <tr>
                <th>Domein</th>
                <th>Auth type</th>
                <th>Geverifieerd</th>
                <th>Standaard</th>
              </tr>
            </thead>
            <tbody>
              ${domains.map((d) => `
                <tr>
                  <td><strong>${liveEscapeHtml(d.Domain || d.domain || '—')}</strong></td>
                  <td><span class="live-badge ${d.AuthType === 'Federated' ? 'live-badge-info' : 'live-badge-neutral'}">${liveEscapeHtml(d.AuthType || 'Managed')}</span></td>
                  <td><span class="live-badge ${d.IsVerified ? 'live-badge-ok' : 'live-badge-warn'}">${d.IsVerified ? 'Ja' : 'Nee'}</span></td>
                  <td>${d.IsDefault ? '<span class="live-badge live-badge-info">Standaard</span>' : ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  }

  // ── Zero Trust Assessment renderer ──────────────────────────────────────────

  const ZT_PILLAR_ICONS = { Identity: '🪪', Devices: '💻', Network: '🌐', Data: '🗄️' };

  function ztScoreColor(pct) {
    if (pct >= 80) return 'var(--color-ok, #22c55e)';
    if (pct >= 50) return 'var(--color-warn, #f59e0b)';
    return 'var(--color-danger, #ef4444)';
  }

  function renderZeroTrustBody(data) {
    const mod     = data?.module || {};
    const results = data?.results || {};
    const report  = data?.last_report || null;

    // Module not installed / no report yet
    if (!mod.installed && !report && !(results && results.controls)) {
      return `
        <div class="live-module-notice" style="max-width:640px;margin:2rem auto">
          <h3 style="margin:0 0 .5rem">Zero Trust Assessment module niet gevonden</h3>
          <p style="color:var(--text-muted);margin:0 0 1.25rem">
            De Microsoft Zero Trust Assessment PowerShell-module is niet geïnstalleerd op de assessmentserver.
            Installeer de module en start daarna een assessment via onderstaande knop.
          </p>
          <pre style="background:var(--surface-raised,#1e2430);padding:.75rem 1rem;border-radius:8px;font-size:.8rem;overflow-x:auto">Install-Module ZeroTrustAssessment -Scope CurrentUser
Connect-ZtAssessment
Invoke-ZtAssessment</pre>
          <button class="live-btn live-btn-primary zt-run-btn" style="margin-top:1.25rem">
            Assessment starten (achtergrond)
          </button>
          <p style="font-size:.75rem;color:var(--text-muted);margin-top:.5rem">
            ⚠️ De assessment kan meerdere uren duren. De pagina kan worden verlaten.
          </p>
        </div>`;
    }

    const summary    = results?.summary  || {};
    const pillars    = results?.pillars  || {};
    const controls   = (results?.controls || []).filter(Boolean);
    const score      = summary.score || 0;
    const tenantName = results?.tenantName || '';
    const execAt     = results?.executedAt || '';
    const reportDate = report?.date
      ? new Date(report.date).toLocaleDateString('nl-NL', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : (execAt ? new Date(execAt).toLocaleDateString('nl-NL', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—');

    const PILLARS = ['Identity', 'Devices', 'Network', 'Data'];

    const pillarCards = PILLARS.map((name) => {
      const pct   = pillars[name] ?? null;
      const icon  = ZT_PILLAR_ICONS[name] || '🔒';
      const color = pct !== null ? ztScoreColor(pct) : 'var(--text-muted)';
      return `
        <div class="live-stat-card" style="min-width:140px">
          <div style="font-size:1.5rem;margin-bottom:.25rem">${icon}</div>
          <div class="live-stat-value" style="color:${color}">${pct !== null ? pct + '%' : '—'}</div>
          <div class="live-stat-label">${liveEscapeHtml(name)}</div>
        </div>`;
    }).join('');

    // Status badge — shows rawStatus (Passed/Failed/Investigate/…) for readability
    const statusBadge = (s, raw) => {
      const map = { Pass: 'live-badge-ok', Fail: 'live-badge-crit', Warning: 'live-badge-warn', NA: 'live-badge-neutral' };
      const cls   = map[s] || 'live-badge-neutral';
      const label = raw || s || 'NA';
      return `<span class="live-badge ${cls}">${liveEscapeHtml(label)}</span>`;
    };

    const overallColor = ztScoreColor(score);

    // Filter pill style (reuse live-badge look + button behaviour)
    const filterPill = (filter, label, active = false) =>
      `<button class="zt-filter-btn${active ? ' zt-filter-active' : ''}" data-zt-filter="${liveEscapeHtml(filter)}"
        style="display:inline-flex;align-items:center;gap:.3rem;padding:.25rem .65rem;border-radius:999px;border:1px solid ${active ? 'var(--color-ok,#22c55e)' : 'rgba(107,114,128,.25)'};background:${active ? 'rgba(34,197,94,.08)' : 'transparent'};cursor:pointer;font-size:.78rem;color:var(--text-secondary,inherit);white-space:nowrap">
        ${label}
      </button>`;

    const failCount = summary.fail    || 0;
    const warnCount = summary.warning || 0;

    const filterRow = controls.length ? `
      <div class="zt-filter-row" style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin-bottom:.85rem">
        ${filterPill('all', `Alle (${controls.length})`, true)}
        ${PILLARS.map(p => {
          const cnt = controls.filter(c => c.pillar === p).length;
          return filterPill(`pillar:${p}`, `${ZT_PILLAR_ICONS[p] || ''} ${p} (${cnt})`);
        }).join('')}
        ${filterPill('status:fail',    `✗ Actie vereist (${failCount})`)}
        ${filterPill('status:warning', `⚠ Aandacht vereist (${warnCount})`)}
      </div>` : '';

    const controlRows = controls.length
      ? controls.map((c, idx) => {
          const hasDetails = !!(c.details    && c.details.trim());
          const hasDesc    = !!(c.description && c.description.trim());
          const hasExpand  = hasDetails || hasDesc;
          const statusKey  = (c.status || 'na').toLowerCase();

          return `
            <tr class="zt-control-row" data-zt-pillar="${liveEscapeHtml(c.pillar || '')}" data-zt-status="${liveEscapeHtml(statusKey)}">
              <td>
                <div style="display:flex;align-items:baseline;gap:.35rem">
                  ${hasExpand
                    ? `<button class="zt-expand-btn" data-zt-target="zt-detail-${idx}"
                         style="background:none;border:none;cursor:pointer;padding:0;color:var(--text-muted);font-size:.7rem;min-width:1rem;flex-shrink:0">▶</button>`
                    : `<span style="display:inline-block;min-width:1rem;flex-shrink:0"></span>`}
                  <span>
                    <strong>${liveEscapeHtml(c.title || '—')}</strong>
                    ${c.testId ? `<span style="font-size:.7rem;color:var(--text-muted);margin-left:.3rem">${liveEscapeHtml(c.testId)}</span>` : ''}
                    ${c.skipped ? `<em style="font-size:.75rem;color:var(--text-muted);margin-left:.3rem">(overgeslagen)</em>` : ''}
                  </span>
                </div>
              </td>
              <td><span class="live-badge live-badge-info">${liveEscapeHtml(c.pillar || '—')}</span></td>
              <td>${statusBadge(c.status, c.rawStatus)}</td>
              <td class="live-small">${liveEscapeHtml(c.category  || '—')}</td>
              <td class="live-small">${liveEscapeHtml(c.riskLevel || '—')}</td>
              <td class="live-small">${liveEscapeHtml(c.license   || '—')}</td>
            </tr>
            ${hasExpand ? `
            <tr id="zt-detail-${idx}" class="zt-detail-row"
                data-zt-pillar="${liveEscapeHtml(c.pillar || '')}" data-zt-status="${liveEscapeHtml(statusKey)}"
                style="display:none">
              <td colspan="6" style="padding:.75rem 1.5rem 1rem;background:var(--surface-raised,#1a1f2b);border-left:3px solid rgba(99,102,241,.35)">
                ${hasDetails ? `
                  <div style="margin-bottom:${hasDesc ? '.75rem' : '0'}">
                    <div style="font-size:.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem">Bevindingen</div>
                    <pre style="margin:0;font-size:.8rem;white-space:pre-wrap;word-break:break-word;color:var(--text-secondary,#cbd5e0);font-family:inherit;line-height:1.55">${liveEscapeHtml(c.details)}</pre>
                  </div>` : ''}
                ${hasDesc ? `
                  <div>
                    <div style="font-size:.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem">Beschrijving &amp; remediatie</div>
                    <pre style="margin:0;font-size:.8rem;white-space:pre-wrap;word-break:break-word;color:var(--text-secondary,#cbd5e0);font-family:inherit;line-height:1.55">${liveEscapeHtml(c.description)}</pre>
                  </div>` : ''}
              </td>
            </tr>` : ''}`;
        }).join('')
      : `<tr><td colspan="6" class="live-empty-row">Geen controls beschikbaar — assessment nog niet uitgevoerd of rapport kon niet worden geparsed.</td></tr>`;

    return `
      <div class="live-insight-strip" style="margin-bottom:1.25rem;display:flex;align-items:center;gap:1.25rem;flex-wrap:wrap">
        <div style="display:contents">
          <div>
            <div style="font-size:.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Overall score</div>
            <div style="font-size:2rem;font-weight:700;color:${overallColor}">${score}%</div>
          </div>
          <div class="live-storage-progress" style="flex:1;min-width:160px">
            <div class="live-storage-progress-bar">
              <span class="live-storage-progress-fill" style="width:${score}%;background:${overallColor}"></span>
            </div>
            <div class="live-storage-progress-meta">
              <span>${summary.pass || 0} pass · ${summary.fail || 0} fail · ${summary.warning || 0} warning</span>
              <span>Laatste run: ${liveEscapeHtml(reportDate)}${tenantName ? ` · ${liveEscapeHtml(tenantName)}` : ''}</span>
            </div>
          </div>
          <button class="live-btn live-btn-secondary zt-run-btn" style="white-space:nowrap">↺ Opnieuw uitvoeren</button>
        </div>
      </div>

      <div class="live-stats-row" style="margin-bottom:1.5rem">
        ${pillarCards}
      </div>

      ${controls.length ? `
      ${filterRow}
      <div class="assessment-table-wrap live-entity-table-wrap">
        <table class="assessment-table live-entity-table">
          <thead><tr>
            <th>Control</th>
            <th>Pillar</th>
            <th>Status</th>
            <th>Categorie</th>
            <th>Risico</th>
            <th>Licentie</th>
          </tr></thead>
          <tbody>${controlRows}</tbody>
        </table>
      </div>` : `
      <div class="live-module-empty">
        <p>Geen controlresultaten beschikbaar.</p>
        ${!controls.length && report ? '<p style="font-size:.8rem;color:var(--text-muted)">Het rapport is gevonden maar kon niet automatisch worden geparsed. Open het volledige rapport via de rapportenpagina.</p>' : ''}
        <button class="live-btn live-btn-primary zt-run-btn" style="margin-top:1rem">Assessment uitvoeren</button>
      </div>`}`;
  }

  // Wire up run button (event delegation)
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.zt-run-btn')) return;
    const tid = (typeof currentTenantId !== 'undefined') ? currentTenantId : null;
    if (!tid) return;
    const btn = e.target.closest('.zt-run-btn');
    btn.disabled = true;
    btn.textContent = 'Starten…';
    fetch(`/api/compliance/${tid}/zerotrust/run`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('denjoy_token') ? { 'Authorization': `Bearer ${localStorage.getItem('denjoy_token')}` } : {}) },
    }).then((r) => r.json()).then((d) => {
      btn.textContent = d.ok ? '✓ Assessment gestart' : '✗ Mislukt';
      if (d.ok) {
        setTimeout(() => { btn.disabled = false; btn.textContent = '↺ Opnieuw uitvoeren'; }, 5000);
        if (typeof window.showToast === 'function') window.showToast('Zero Trust Assessment gestart als achtergrondtaak. Dit kan meerdere uren duren.', 'info');
      }
    }).catch(() => { btn.textContent = '✗ Fout'; btn.disabled = false; });
  });

  // Zero Trust — pillar/status filter buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.zt-filter-btn');
    if (!btn) return;
    const normalizeTitle = (value) => String(value || '')
      .replace(/\s*&\s*/g, ' & ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const sectionLabel = normalizeTitle(window.SECTION_META?.[sectionName]?.title || humanizeKey(sectionName));
    const tabLabel = normalizeTitle(tab.title || humanizeKey(sectionName));

    // Update active styling on sibling buttons
    const row = btn.closest('.zt-filter-row');
    if (row) {
      if (titleEl) titleEl.textContent = tabLabel === sectionLabel ? sectionLabel : `${sectionLabel} · ${tabLabel}`;
      row.querySelectorAll('.zt-filter-btn').forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle('zt-filter-active', isActive);
        b.style.borderColor = isActive ? 'var(--color-ok,#22c55e)' : 'rgba(107,114,128,.25)';
        b.style.background  = isActive ? 'rgba(34,197,94,.08)'      : 'transparent';
      });
    }

    const matchRow = (r) => {
      if (filter === 'all') return true;
      if (filter.startsWith('pillar:'))  return r.dataset.ztPillar  === filter.slice(7);
      if (filter.startsWith('status:'))  return r.dataset.ztStatus  === filter.slice(7);
      return true;
    };

    document.querySelectorAll('.zt-control-row').forEach((r) => {
      r.style.display = matchRow(r) ? '' : 'none';
    });
    // Only show detail rows that were expanded AND pass the filter
    document.querySelectorAll('.zt-detail-row').forEach((r) => {
      r.style.display = (r.dataset.ztExpanded && matchRow(r)) ? '' : 'none';
    });
  });

  // Zero Trust — expand/collapse control detail rows
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.zt-expand-btn');
    if (!btn) return;
    const targetId  = btn.dataset.ztTarget;
    if (!targetId) return;
    const detailRow = document.getElementById(targetId);
    if (!detailRow) return;
    const isOpen = detailRow.style.display !== 'none';
    if (isOpen) {
      detailRow.style.display = 'none';
      delete detailRow.dataset.ztExpanded;
      btn.textContent = '▶';
    } else {
      detailRow.style.display = '';
      detailRow.dataset.ztExpanded = '1';
      btn.textContent = '▼';
    }
  });

  function renderSectionBody(sectionName, tabKey, data, collection) {
    if (sectionName === 'teams' && tabKey === 'teams') return renderTeamsBody(data);
    if (sectionName === 'teams' && tabKey === 'groepen') return renderGroupsBody(data);
    if (sectionName === 'teams' && tabKey === 'teams-security') return renderTeamsSecurityBody(data);
    if (sectionName === 'sharepoint' && tabKey === 'sharepoint-sites') return renderSharePointSitesBody(data);
    if (sectionName === 'sharepoint' && tabKey === 'sharepoint-settings') return renderSharePointSettingsBody(data);
    if (sectionName === 'sharepoint' && tabKey === 'sharepoint-security') return renderSharePointSecurityBody(data);
    if (sectionName === 'compliance' && tabKey === 'cis') return renderCisBenchmarkBody(data);
    if (sectionName === 'compliance' && tabKey === 'zerotrust') return renderZeroTrustBody(data);
    if (sectionName === 'hybrid' && tabKey === 'sync') return renderHybridSyncBody(data);
    if (sectionName === 'exchange') {
      if (tabKey === 'mailboxen') return renderExchangeMailboxesBody(data);
      if (tabKey === 'forwarding') return renderExchangeForwardingBody(data);
      if (tabKey === 'regels') return renderExchangeRulesBody(data);
      if (tabKey === 'mail-security') return renderExchangeMailSecurityBody(data);
    }
    if (sectionName === 'identity') {
      if (tabKey === 'mfa') return renderMfaBody(data);
      if (tabKey === 'guests') return renderGuestsBody(data);
      if (tabKey === 'admin-roles') return renderAdminRolesBody(data);
      if (tabKey === 'security-defaults') return renderSecurityDefaultsBody(data);
      if (tabKey === 'legacy-auth') return renderLegacyAuthBody(data);
      if (tabKey === 'ca-policy') return renderCaPolicyBody(data);
      if (tabKey === 'admin-risk') return renderAdminRiskBody(data);
      if (tabKey === 'break-glass') return renderBreakGlassBody(data);
    }
    if (sectionName === 'apps') {
      if (tabKey === 'registrations') return renderAppRegistrationsBody(data);
      if (tabKey === 'app-secrets') return renderAppSecretsBody(data);
    }
    // Generic fallback: summary + table
    const summary = renderSummary(data);
    const body = collection ? renderTable(collection, sectionName, tabKey) : renderObjectTable(data);
    return summary + body;
  }

  function renderObjectTable(data) {
    const rows = Object.keys(data || {}).slice(0, 20);
    if (!rows.length) return '<p class="live-module-empty">Geen data beschikbaar.</p>';
    return `
      <div class="assessment-table-wrap">
        <table class="assessment-table">
          <thead>
            <tr><th>Veld</th><th>Waarde</th></tr>
          </thead>
          <tbody>
            ${rows.map((key) => `
              <tr>
                <td>${liveEscapeHtml(key)}</td>
                <td>${liveEscapeHtml(normalizeScalar(data[key]))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function _formatRelativeTime(isoStr) {
    if (!isoStr) return null;
    try {
      const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
      if (diff < 60)   return 'zojuist';
      if (diff < 3600) return `${Math.floor(diff / 60)} min geleden`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} uur geleden`;
      return `${Math.floor(diff / 86400)} dag(en) geleden`;
    } catch (_) { return null; }
  }

  function renderSourceInfo(data) {
    const describe = window.denjoyDescribeSourceMeta;
    if (typeof describe !== 'function') return '';
    const info = describe(data || {});
    const ts = data?._generated_at || data?.generated_at || data?.assessment_generated_at || null;
    const rel = _formatRelativeTime(ts);
    const stale = !!data?._stale;
    const syncHtml = rel
      ? `<span class="live-module-sync-time${stale ? ' live-module-sync-stale' : ''}">Sync: ${liveEscapeHtml(rel)}${stale ? ' ⚠ verouderd' : ''}</span>`
      : '';
    return `
      <div class="live-module-source">
        <span class="live-module-source-pill ${liveEscapeHtml(info.className || '')}">${liveEscapeHtml(info.label)}</span>
        <span>${liveEscapeHtml(info.detail)}</span>
        ${syncHtml}
      </div>
    `;
  }

  function renderCapabilityInfo(capability) {
    const describe = window.denjoyDescribeCapabilityStatus;
    if (typeof describe !== 'function' || !capability) return '';
    const info = describe(capability);
    const roles = (capability.extra_roles || []).slice(0, 3).join(', ');
    const consent = (capability.extra_consent || []).slice(0, 3).join(', ');
    return `
      <div class="live-module-capability">
        <div class="live-module-source">
          <span class="live-module-source-pill ${liveEscapeHtml(info.className || '')}">${liveEscapeHtml(info.label)}</span>
          <span>${liveEscapeHtml(info.detail)}</span>
        </div>
        <div class="live-module-capability-grid">
          <article class="live-module-capability-card">
            <span class="live-module-capability-label">Engine</span>
            <strong>${liveEscapeHtml(capability.engine || '—')}</strong>
            <span class="live-module-capability-meta">${liveEscapeHtml(capability.access_method || '—')}</span>
          </article>
          <article class="live-module-capability-card">
            <span class="live-module-capability-label">Rollen</span>
            <strong>${liveEscapeHtml(roles || 'Geen extra rollen')}</strong>
            <span class="live-module-capability-meta">${capability.gdap_required ? 'GDAP betrokken' : 'geen GDAP vereist'}</span>
          </article>
          <article class="live-module-capability-card">
            <span class="live-module-capability-label">Consent</span>
            <strong>${liveEscapeHtml(consent || 'Geen extra consent')}</strong>
            <span class="live-module-capability-meta">${capability.supports_live ? 'live-capable' : 'snapshot-only'}</span>
          </article>
        </div>
      </div>
    `;
  }

  function renderWorkspaceInfoShell(sectionName, tabConfig, data, capability, serviceOverviewHtml = '') {
    const sectionLabel = sectionName === 'identity' ? 'Identiteit & toegang'
      : sectionName === 'alerts' ? 'Security'
      : sectionName === 'exchange' ? 'E-mail & samenwerking'
      : sectionName === 'intune' ? 'Devices'
      : sectionName === 'backup' ? 'Protection'
      : sectionName === 'domains' ? 'Domeinen'
      : sectionName === 'apps' ? 'Apps'
      : sectionName === 'teams' ? 'Samenwerking'
      : sectionName === 'sharepoint' ? 'Samenwerking'
      : sectionName === 'compliance' ? 'Compliance'
      : 'Workspace';
    return `
      <div class="workspace-info-shell">
        <div class="workspace-info-header">
          <span class="workspace-info-kicker">${liveEscapeHtml(sectionLabel)}</span>
          <div class="workspace-info-title-row">
            <div>
              <h3 class="workspace-info-title">${liveEscapeHtml(tabConfig?.title || 'Workspace')}</h3>
              <p class="workspace-info-desc">${liveEscapeHtml(tabConfig?.description || 'Tenant-specifieke werkruimte.')}</p>
            </div>
          </div>
          <div class="workspace-info-band">
            ${renderSourceInfo(data)}
          </div>
        </div>
        ${renderCapabilityInfo(capability)}
        ${serviceOverviewHtml || ''}
      </div>
    `;
  }

  function syncModuleContext(sectionName, tabKey, capability = null, data = null) {
    const setter = window.denjoySetLiveModuleContext;
    if (typeof setter !== 'function') return;
    setter({
      section: sectionName,
      tab: tabKey,
      capability,
      source: data?._source || null,
      stale: !!data?._stale,
    });
  }

  function renderLegacyIntuneBody() {
    return `
      <div class="it-module-shell">
        <div id="itWorkspaceIntro"></div>
        <div id="itWorkspaceSource"></div>
        <div id="itServiceOverview"></div>
        <div class="it-tab-panel" data-it-panel="overzicht">
          <div class="it-topbar">
            <div class="it-counter" id="itSummaryCounter">Live tenantoverzicht</div>
            <button type="button" class="live-module-refresh" id="itBtnRefreshSummary">Overzicht vernieuwen</button>
          </div>
          <div id="itSummaryWrap"></div>
        </div>

        <div class="it-tab-panel" data-it-panel="apparaten" style="display:none">
          <div class="it-topbar">
            <div class="it-search">
              <input type="search" id="itSearchInput" placeholder="Zoek op apparaat, gebruiker of model">
            </div>
            <div class="it-filter-row">
              <button type="button" class="it-filter-tab active" data-filter-os="all">Alle OS</button>
              <button type="button" class="it-filter-tab" data-filter-os="windows">Windows</button>
              <button type="button" class="it-filter-tab" data-filter-os="ios">iOS</button>
              <button type="button" class="it-filter-tab" data-filter-os="android">Android</button>
              <button type="button" class="it-filter-tab" data-filter-os="macos">macOS</button>
              <button type="button" class="it-filter-tab active" data-filter-state="all">Alle statussen</button>
              <button type="button" class="it-filter-tab" data-filter-state="compliant">In orde</button>
              <button type="button" class="it-filter-tab" data-filter-state="noncompliant">Actie vereist</button>
              <button type="button" class="it-filter-tab" data-filter-state="inGracePeriod">Overgangsperiode</button>
              <button type="button" class="live-module-refresh" id="itBtnRefresh">Apparaten vernieuwen</button>
            </div>
          </div>
          <div class="it-subtle-meta" id="itDeviceCount">0 apparaten</div>
          <div class="assessment-table-wrap">
            <table class="assessment-table">
              <thead>
                <tr>
                  <th>Apparaat</th>
                  <th>OS</th>
                  <th>Gebruiker</th>
                  <th>Compliance</th>
                  <th>Laatst gezien</th>
                  <th>Actie</th>
                </tr>
              </thead>
              <tbody id="itDeviceTableBody">
                <tr><td colspan="6" class="it-table-empty">Nog geen apparaten geladen.</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="it-tab-panel" data-it-panel="compliance" style="display:none">
          <div class="it-topbar">
            <div class="it-counter" id="itComplianceCount">Compliance policies</div>
            <button type="button" class="live-module-refresh" id="itBtnRefreshCompliance">Compliance vernieuwen</button>
          </div>
          <div id="itComplianceGrid"></div>
        </div>

        <div class="it-tab-panel" data-it-panel="configuratie" style="display:none">
          <div class="it-topbar">
            <div class="it-counter" id="itConfigCount">Configuratieprofielen</div>
            <button type="button" class="live-module-refresh" id="itBtnRefreshConfig">Configuratie vernieuwen</button>
          </div>
          <div id="itConfigGrid"></div>
        </div>

        <div class="it-tab-panel" data-it-panel="geschiedenis" style="display:none">
          <div class="assessment-table-wrap">
            <table class="assessment-table">
              <thead>
                <tr>
                  <th>Tijdstip</th>
                  <th>Actie</th>
                  <th>Status</th>
                  <th>Uitgevoerd door</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody id="itHistoryBody">
                <tr><td colspan="5" class="it-table-empty">Nog geen geschiedenis geladen.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderLegacyBackupBody() {
    return `
      <div class="bk-module-shell">
        <div id="bkWorkspaceIntro"></div>
        <div id="bkWorkspaceSource"></div>
        <div id="bkServiceOverview"></div>
        <div class="bk-tab-panel" data-bk-panel="overzicht">
          <div class="it-topbar">
            <div class="it-counter">Backupsamenvatting</div>
            <button type="button" class="live-module-refresh" id="bkBtnRefreshSummary">Overzicht vernieuwen</button>
          </div>
          <div id="bkSummaryWrap"></div>
        </div>

        <div class="bk-tab-panel" data-bk-panel="sharepoint" style="display:none">
          <div class="it-topbar">
            <div class="it-counter" id="bkSPCount">— policies</div>
            <button type="button" class="live-module-refresh" id="bkBtnRefreshSP">SharePoint vernieuwen</button>
          </div>
          <div id="bkSPList"></div>
        </div>

        <div class="bk-tab-panel" data-bk-panel="onedrive" style="display:none">
          <div class="it-topbar">
            <div class="it-counter" id="bkODCount">— policies</div>
            <button type="button" class="live-module-refresh" id="bkBtnRefreshOD">OneDrive vernieuwen</button>
          </div>
          <div id="bkODList"></div>
        </div>

        <div class="bk-tab-panel" data-bk-panel="exchange" style="display:none">
          <div class="it-topbar">
            <div class="it-counter" id="bkEXCount">— policies</div>
            <button type="button" class="live-module-refresh" id="bkBtnRefreshEX">Exchange vernieuwen</button>
          </div>
          <div id="bkEXList"></div>
        </div>

        <div class="bk-tab-panel" data-bk-panel="geschiedenis" style="display:none">
          <div class="assessment-table-wrap">
            <table class="assessment-table">
              <thead>
                <tr>
                  <th>Tijdstip</th>
                  <th>Workload</th>
                  <th>Status</th>
                  <th>Uitgevoerd door</th>
                  <th>Resultaat</th>
                </tr>
              </thead>
              <tbody id="bkHistoryBody">
                <tr><td colspan="5" class="bk-empty">Nog geen geschiedenis geladen.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderLegacyAlertsBody() {
    return `
      <div class="al-module-shell">
        <div id="alWorkspaceIntro"></div>
        <div id="alWorkspaceSource"></div>
        <div id="alServiceOverview"></div>
        <div id="alSnapshotBanner" class="snapshot-banner" style="display:none"></div>

        <div class="al-tab-panel" data-al-panel="auditlog">
          <div class="it-topbar">
            <div class="it-counter" id="alAuditCount">0 events</div>
            <button type="button" class="live-module-refresh" id="alBtnRefreshAudit">Auditlog vernieuwen</button>
          </div>
          <div id="alAuditWrap"></div>
        </div>

        <div class="al-tab-panel" data-al-panel="securescr" style="display:none">
          <div class="it-topbar">
            <div class="it-counter">Microsoft Beveiligingsscore</div>
            <button type="button" class="live-module-refresh" id="alBtnRefreshScore">Beveiligingsscore vernieuwen</button>
          </div>
          <div id="alScoreWrap"></div>
        </div>

        <div class="al-tab-panel" data-al-panel="signins" style="display:none">
          <div class="it-topbar">
            <div class="it-counter">Recente aanmeldingen</div>
            <button type="button" class="live-module-refresh" id="alBtnRefreshSignIns">Aanmeldingen vernieuwen</button>
          </div>
          <div id="alSignInsWrap"></div>
        </div>

        <div class="al-tab-panel" data-al-panel="followup" style="display:none">
          <div class="it-topbar">
            <div class="it-counter">Opvolging & reminders</div>
            <button type="button" class="live-module-refresh" id="alBtnRefreshFollowUp">Opvolging verversen</button>
          </div>
          <div id="alFollowUpWrap"></div>
        </div>

        <div class="al-tab-panel" data-al-panel="config" style="display:none">
          <div class="live-module-config-card">
            <div class="live-module-config-title">Webhook & e-mail notificaties</div>
            <div class="live-module-form-group">
              <label for="alWebhookUrl">Webhook URL</label>
              <input type="url" id="alWebhookUrl" class="live-module-input" placeholder="https://outlook.office.com/webhook/...">
            </div>
            <div class="live-module-form-group">
              <label for="alWebhookType">Webhook type</label>
              <select id="alWebhookType" class="live-module-select">
                <option value="teams">Microsoft Teams</option>
                <option value="slack">Slack</option>
                <option value="generic">Generiek JSON</option>
              </select>
            </div>
            <div class="live-module-form-group">
              <label for="alEmailAddr">E-mailadres</label>
              <input type="email" id="alEmailAddr" class="live-module-input" placeholder="alerts@bedrijf.nl">
            </div>
            <div class="live-module-form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500">
                <input type="checkbox" id="alNotifyOnCritical" style="width:16px;height:16px;accent-color:var(--brand-color,#0078d4)">
                Notificeer bij kritieke bevindingen
              </label>
              <p style="margin:4px 0 0 24px;font-size:12px;color:var(--text-muted,#6b7280)">Stuur een webhook zodra er kritieke bevindingen zijn na een assessment-run.</p>
            </div>
            <div class="live-module-form-group">
              <label for="alScoreThreshold">Score-drempel voor notificatie</label>
              <div style="display:flex;align-items:center;gap:10px">
                <input type="range" id="alScoreThreshold" min="0" max="100" step="5" value="60"
                  style="flex:1;accent-color:var(--brand-color,#0078d4)"
                  oninput="document.getElementById('alScoreThresholdVal').textContent=this.value+'%'">
                <span id="alScoreThresholdVal" style="min-width:36px;font-weight:600;font-size:14px">60%</span>
              </div>
              <p style="margin:4px 0 0 0;font-size:12px;color:var(--text-muted,#6b7280)">Stuur ook een notificatie als de score onder deze drempel valt.</p>
            </div>
            <div class="live-module-action-row">
              <button type="button" class="live-module-refresh" id="alBtnSaveConfig">Opslaan</button>
              <button type="button" class="live-module-refresh" id="alBtnTestWebhook">Test webhook</button>
            </div>
            <div id="alConfigResult" class="al-test-result" style="display:none"></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderLegacyExchangeBody() {
    return `
      <div class="ex-module-shell">
        <div id="exWorkspaceSource"></div>
        <div id="exServiceOverview"></div>
        <div class="ex-tab-panel" data-ex-panel="mailboxen">
          <div class="it-topbar">
            <div class="it-search">
              <input type="search" id="exSearchInput" placeholder="Zoek op naam, UPN of e-mail">
            </div>
            <div class="it-filter-row">
              <div class="it-counter" id="exMbxCount">0 mailboxen</div>
              <button type="button" class="live-module-refresh" id="exBtnRefreshMbx">Mailboxen vernieuwen</button>
            </div>
          </div>
          <div class="assessment-table-wrap">
            <table class="assessment-table ex-table">
              <thead>
                <tr>
                  <th>Mailbox</th>
                  <th>E-mail</th>
                  <th>Status</th>
                  <th>Tijdzone</th>
                  <th>Actie</th>
                </tr>
              </thead>
              <tbody id="exMailboxTableBody">
                <tr><td colspan="5" class="ex-table-empty">Nog geen mailboxen geladen.</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="ex-tab-panel" data-ex-panel="forwarding" style="display:none">
          <div class="it-topbar">
            <div class="it-counter" id="exFwdCount">0 actieve forwardings</div>
            <button type="button" class="live-module-refresh" id="exBtnRefreshFwd">Forwarding vernieuwen</button>
          </div>
          <div id="exFwdWrap"></div>
        </div>

        <div class="ex-tab-panel" data-ex-panel="regels" style="display:none">
          <div class="it-topbar">
            <div class="it-counter" id="exRulesCount">0 regels</div>
            <button type="button" class="live-module-refresh" id="exBtnRefreshRules">Regels vernieuwen</button>
          </div>
          <div id="exRulesWrap"></div>
        </div>
      </div>
    `;
  }

  const LEGACY_MODULES = {
    intune: {
      renderBody: renderLegacyIntuneBody,
      load: () => window.loadIntuneSection?.(),
      switchTab: (tabKey) => window.switchIntuneTab?.(tabKey),
    },
    backup: {
      renderBody: renderLegacyBackupBody,
      load: () => window.loadBackupSection?.(),
      switchTab: (tabKey) => window.switchBackupTab?.(tabKey),
    },
    alerts: {
      renderBody: renderLegacyAlertsBody,
      load: () => window.loadAlertsSection?.(),
      switchTab: (tabKey) => window.switchAlertsTab?.(tabKey),
    },
  };

  function renderModuleShell(sectionName, tabKey, innerHtml, noticeHtml = '', shellOpts = {}) {
    const config = getModuleConfig(sectionName);
    const tab = config?.tabs?.[tabKey] || {
      title: humanizeKey(tabKey || sectionName),
      description: `Live gegevens voor ${humanizeKey(tabKey || sectionName)}.`,
    };
    const root = getModuleRoot(sectionName);
    if (!root) return;
    const buttonLabel = shellOpts.buttonLabel || 'Data ophalen';
    const buttonDisabled = shellOpts.buttonDisabled ? ' disabled aria-disabled="true"' : '';
    const toolbarMeta = shellOpts.toolbarMetaHtml || '';
    const infoShell = shellOpts.infoShell || '';
    const compactMode = !!shellOpts.compactMode;
    const inputHtml = tab.input ? `
      <div class="live-module-input-row">
        <label class="live-module-input-label" for="liveModuleInput-${liveEscapeHtml(sectionName)}-${liveEscapeHtml(tabKey)}">${liveEscapeHtml(tab.input.label)}</label>
        <input
          type="text"
          id="liveModuleInput-${liveEscapeHtml(sectionName)}-${liveEscapeHtml(tabKey)}"
          class="live-module-input"
          placeholder="${liveEscapeHtml(tab.input.placeholder || '')}"
        />
      </div>
    ` : '';
    const _sectionMeta = window.SECTION_META || {};
    const _kickerLabel = (_sectionMeta[sectionName] && _sectionMeta[sectionName].title) || sectionName;
    syncWorkspaceHeaderForLiveTab(sectionName, tab);
    root.innerHTML = `
      <div class="live-module-shell">
        <div class="live-module-toolbar">
          ${compactMode ? `
            <div>
              <div class="live-module-kicker">${liveEscapeHtml(_kickerLabel)}</div>
              <h3>${liveEscapeHtml(tab.title)}</h3>
              <p>${liveEscapeHtml(tab.description)}</p>
              ${toolbarMeta}
            </div>
          ` : infoShell ? `<div>${toolbarMeta}</div>` : `
            <div>
              <div class="live-module-kicker">${liveEscapeHtml(_kickerLabel)}</div>
              <h3>${liveEscapeHtml(tab.title)}</h3>
              <p>${liveEscapeHtml(tab.description)}</p>
              ${toolbarMeta}
            </div>
          `}
          <button type="button" class="live-module-refresh" data-live-section="${liveEscapeHtml(sectionName)}" data-live-subtab="${liveEscapeHtml(tabKey)}"${buttonDisabled}>
            ${liveEscapeHtml(buttonLabel)}
          </button>
        </div>
        ${infoShell}
        ${inputHtml}
        ${noticeHtml}
        <div class="live-module-body">
          ${innerHtml}
        </div>
      </div>
    `;
    // Delegated listener for playbook buttons injected by renderControlItemsTable
    root.addEventListener('click', function _playbookDelegate(evt) {
      const btn = evt.target.closest?.('.live-playbook-btn');
      if (!btn) return;
      const key = btn.dataset.playbookKey;
      const title = btn.dataset.findingTitle;
      if (key && typeof window.renderPlaybookModal === 'function') {
        window.renderPlaybookModal(key, { findingTitle: title });
      }
    });
  }

  function renderLegacyModule(sectionName, tabKey) {
    const legacy = LEGACY_MODULES[sectionName];
    if (!legacy) return false;
    const capability = capabilityState.byKey[`${sectionName}:${tabKey}`] || null;

    if (sectionName === 'backup') window._bkLastTenantId = null;
    if (sectionName === 'alerts') window._alLastTid = null;
    if (sectionName === 'exchange') window._exLastTid = null;

    const noticeHtml = sectionName === 'exchange'
      ? ''
      : `
      <div class="live-module-banner">
        Live module met bestaande detailweergave voor dit subhoofdstuk.
      </div>
    `;
    renderModuleShell(sectionName, tabKey, legacy.renderBody(), noticeHtml, {
      buttonDisabled: !!(capability && !capability.supports_live),
      compactMode: true,
    });
    legacy.load();
    legacy.switchTab(tabKey);
    if (sectionName === 'intune') {
      const summaryButton = document.getElementById('itBtnRefreshSummary');
      if (summaryButton) {
        summaryButton.addEventListener('click', () => {
          window.loadIntuneSection?.({ strictLive: true });
          window.switchIntuneTab?.('overzicht');
        });
      }
    }
    return true;
  }

  function renderLoading(sectionName, tabKey) {
    const skBody = window.skeletonCards ? window.skeletonCards(4) : '<p class="live-module-empty">Tenantdata wordt opgehaald...</p>';
    const capability = capabilityState.byKey[`${sectionName}:${tabKey}`] || null;
    renderModuleShell(sectionName, tabKey, skBody, '', {
      buttonDisabled: !!(capability && !capability.supports_live),
      compactMode: true,
    });
  }

  // Helper: Probeer snapshot-data te laden als fallback voor live data
  async function loadSnapshotFallback(sectionName, tabKey, tenantId) {
    try {
      // Kaart section/tab namen naar snapshot payload keys
      const snapshotKeyMap = {
        'gebruikers:users': { section: 'gebruikers', subsection: 'users', field: 'assessment_users' },
        'gebruikers:licenses': { section: 'gebruikers', subsection: 'licenses', field: 'assessment_licenses' },
        'identity:mfa': { section: 'identity', subsection: 'mfa', field: 'assessment_json_identity_mfa' },
        'identity:admin-roles': { section: 'identity', subsection: 'admin-roles', field: 'assessment_json_identity_admin_roles' },
        'teams:teams': { section: 'teams', subsection: 'teams', field: 'assessment_teams' },
        'sharepoint:sharepoint-sites': { section: 'sharepoint', subsection: 'sharepoint-sites', field: 'SharePointSites' },
        'sharepoint:sharepoint-settings': { section: 'sharepoint', subsection: 'sharepoint-settings', field: 'SharePointTenantSettings' },
        'exchange:mailboxen': { section: 'exchange', subsection: 'mailboxes', field: 'assessment_user_mailboxes' },
        'apps:registrations': { section: 'apps', subsection: 'registrations', field: 'assessment_app_registrations' },
        'alerts:auditlog': { section: 'alerts', subsection: 'audit-logs', field: 'assessment_json_alerts_audit_logs' },
      };
      
      const snapshotKey = `${sectionName}:${tabKey}`;
      const mapping = snapshotKeyMap[snapshotKey];
      if (!mapping) return null;
      
      // Haal snapshot op via backend
      const response = await global.apiFetchCached(`/api/tenants/${tenantId}/assessment/snapshot`, {}, 3600);
      if (!response || !response.ok) return null;
      
      const snapshot = response.data || {};
      const field = mapping.field;
      const data = snapshot[field];
      
      if (!data) return null;
      
      // Format terug naar verwachte API-respons
      if (Array.isArray(data)) {
        return { items: data, _source: 'assessment_snapshot' };
      } else if (typeof data === 'object') {
        return Object.assign({}, data, { _source: 'assessment_snapshot' });
      }
      
      return null;
    } catch (_) {
      return null;
    }
  }

  // Helper: Genereer permission-hint voor een section
  function getPermissionHint(sectionName, errorMsg) {
    const sectionHints = {
      'gebruikers': 'Zet rechten in: Directory.Read.All',
      'identity': 'Zet rechten in: Directory.Read.All, UserAuthenticationMethod.Read.All',
      'teams': 'Zet rechten in: Team.ReadBasic.All, TeamMember.Read.All',
      'sharepoint': 'Zet rechten in: Sites.Read.All',
      'exchange': 'Zet rechten in: Mail.Read',
      'apps': 'Zet rechten in: Application.Read.All',
      'intune': 'Zet rechten in: DeviceManagementManagedDevices.Read.All',
      'alerts': 'Zet rechten in: AuditLog.Read.All, Reports.Read.All',
      'domains': 'Zet rechten in: Domain.Read.All',
      'backup': 'Zet rechten in: Mail.Read, Sites.Read.All, OneDrive.Read.All',
      'zerotrust': 'Zet rechten in voor Zero Trust assessment in Instellingen > MSP Admin',
    };
    
    const hint = sectionHints[sectionName] || 'Controleer app-registratie rechten in Instellingen > MSP Admin';
    return `<p style="color: #d97706; margin: 8px 0;">📋 Configuratie nodig:<br>${hint}</p>`;
  }

  function renderError(sectionName, tabKey, message, errorObj) {
    const capability = capabilityState.byKey[`${sectionName}:${tabKey}`] || null;
    const isPermissionError = errorObj && (errorObj.status === 403 || errorObj.status === 401 ||
      (errorObj.message && /permission|unauthorized|forbidden|rechten|onvoldoende|http\s*40[13]|\b40[13]\b/i.test(errorObj.message)));
    
    const errorHtml = `<div class="live-module-error">${liveEscapeHtml(message || 'De gegevens konden niet worden opgehaald. Probeer opnieuw of neem contact op met Denjoy.')}${isPermissionError ? getPermissionHint(sectionName, message) : ''}</div>`;
    
    renderModuleShell(
      sectionName,
      tabKey,
      errorHtml,
      isPermissionError ? '<div class="snapshot-banner">⚠️ Veel rechtenconfiguratie nodig. Controleer Instellingen > MSP Admin > App-registratie.</div>' : '<div class="snapshot-banner">De gegevens konden niet worden opgehaald. Controleer of de tenant correct is gekoppeld, of neem contact op met Denjoy.</div>',
      {
        buttonDisabled: !!(capability && !capability.supports_live),
      }
    );
  }

  function renderData(sectionName, tabKey, data) {
    const capability = capabilityState.byKey[`${sectionName}:${tabKey}`] || null;
    resetDetailState();
    if (data && data.ok === false) {
      renderError(sectionName, tabKey, data.error || 'De gegevens konden niet worden opgehaald. Probeer opnieuw of neem contact op met Denjoy.');
      return;
    }
    const tab = getTabConfig(sectionName, tabKey);
    if (tab?.customType === 'alerts-config') {
      const noticeHtml = '<div class="live-module-banner">Beheer notificatie-uitvoer direct vanuit deze workspace.</div>';
      renderModuleShell(sectionName, tabKey, renderAlertsConfigForm(sectionName, tabKey, data), noticeHtml, {
        buttonDisabled: !!(capability && !capability.supports_live),
      });
      return;
    }
    const collection = extractCollection(data);
    const body = sectionName === 'exchange'
      ? renderSectionBody(sectionName, tabKey, data, collection)
      : renderIdentityPatternWorkspace(sectionName, tabKey, data, collection);
    const noticeHtml = data && data._source === 'assessment_snapshot'
      ? '<div class="snapshot-banner">Gegevens uit laatste assessment. Live data vereist actieve verbinding.</div>'
      : '<div class="live-module-banner">Live tenantdata succesvol opgehaald voor het geselecteerde subhoofdstuk.</div>';
    renderModuleShell(sectionName, tabKey, body, noticeHtml, {
      buttonDisabled: !!(capability && !capability.supports_live),
      compactMode: true,
    });
    if (sectionName === 'teams' && tabKey === 'teams') {
      applyTeamsFilters();
    }
    if (sectionName === 'teams' && tabKey === 'groepen') {
      applyGroupsFilters();
    }
    if (sectionName === 'sharepoint' && tabKey === 'sharepoint-sites') {
      applySharePointSiteFilters();
    }
    if (sectionName === 'exchange' && tabKey === 'mailboxen') {
      applyExchangeMailboxFilters();
    }
  }

  function renderCapabilityBlocked(sectionName, tabKey, capability) {
    const roles = (capability?.extra_roles || []).join(', ');
    const consent = (capability?.extra_consent || []).slice(0, 4).join(', ');
    const reqHtml = (roles || consent) ? `
      <div class="live-module-req-info">
        ${roles ? `<div class="live-module-req-row"><span class="live-module-req-label">Vereiste rollen</span><span class="live-module-req-val">${liveEscapeHtml(roles)}</span></div>` : ''}
        ${consent ? `<div class="live-module-req-row"><span class="live-module-req-label">Graph consent</span><span class="live-module-req-val">${liveEscapeHtml(consent)}</span></div>` : ''}
      </div>` : '';
    const notice = capability?.assessment_available
      ? '<div class="snapshot-banner">Assessment fallback is beschikbaar, maar live ophalen is nog niet gereed.</div>'
      : '<div class="snapshot-banner">Live ophalen is nog niet gereed en er is geen assessment fallback gevonden.</div>';
    renderModuleShell(
      sectionName,
      tabKey,
      `<div class="live-module-empty">${liveEscapeHtml(capability?.status_reason || 'Live data ophalen is nog niet mogelijk voor dit subhoofdstuk.')}</div>${reqHtml}`,
      notice,
      {
        buttonDisabled: true,
        buttonLabel: capability?.assessment_available ? 'Live nog niet gereed' : 'Niet gereed',
      }
    );
  }

  function getInputValues(sectionName, tabKey) {
    const tab = getTabConfig(sectionName, tabKey);
    if (!tab?.input) return {};
    const inputId = `liveModuleInput-${sectionName}-${tabKey}`;
    const value = document.getElementById(inputId)?.value?.trim() || '';
    return { [tab.input.key]: value };
  }

  async function loadLiveModuleSection(sectionName, tabKey, { forceRefresh = false } = {}) {
    const config = getModuleConfig(sectionName);
    if (!config) return;
    const tenantId = selectedTenantId();
    const activeTab = tabKey || config.defaultTab;
    liveState.section = sectionName;
    liveState.tab = activeTab;

    if (typeof setActiveSubnavItem === 'function') setActiveSubnavItem(activeTab);

    if (!tenantId) {
      syncModuleContext(sectionName, activeTab, null, null);
      renderModuleShell(sectionName, activeTab, '<p class="live-module-empty">Selecteer eerst een omgeving via de keuze bovenin om de gegevens te laden.</p>');
      return;
    }

    const tab = config.tabs[activeTab];
    if (!tab) return;
    const requestToken = `${sectionName}:${activeTab}:${tenantId}:${Date.now()}`;
    liveState.requestToken = requestToken;

    const fetchCapability = window.denjoyFetchCapabilityStatus;
    if (typeof fetchCapability === 'function') {
      try {
        capabilityState.byKey[`${sectionName}:${activeTab}`] = await fetchCapability(tenantId, sectionName, activeTab, { forceRefresh });
      } catch (_) {}
    }
    const capability = capabilityState.byKey[`${sectionName}:${activeTab}`] || null;
    syncModuleContext(sectionName, activeTab, capability, null);

    if (capability && (!capability.supports_live || capability.status === 'config_required' || capability.status === 'not_implemented')) {
      renderCapabilityBlocked(sectionName, activeTab, capability);
      return;
    }

    if (renderLegacyModule(sectionName, activeTab)) {
      return;
    }

    const inputs = getInputValues(sectionName, activeTab);
    if (tab.input && !inputs[tab.input.key]) {
      syncModuleContext(sectionName, activeTab, capability, null);
      renderModuleShell(sectionName, activeTab, '<p class="live-module-empty">Vul eerst een waarde in om dit subhoofdstuk live op te halen.</p>');
      return;
    }

    renderLoading(sectionName, activeTab);
    try {
      let apiPath = tab.endpoint(tenantId, inputs);
      if (forceRefresh) {
        apiPath += apiPath.includes('?') ? '&strict_live=1' : '?strict_live=1';
      }
      if (forceRefresh && window.cacheClear) window.cacheClear(apiPath);
      const [data, controls] = await Promise.all([
        liveFetchJson(apiPath, { skipCache: forceRefresh }),
        liveFetchControls(sectionName, activeTab, tenantId, { skipCache: forceRefresh }),
      ]);
      if (liveState.requestToken !== requestToken) return;
      const mergedData = Object.assign({}, data || {}, Object.keys(controls || {}).length ? { _controls: controls } : {});
      syncModuleContext(sectionName, activeTab, capability, mergedData || null);
      renderData(sectionName, activeTab, mergedData || {});
    } catch (error) {
      // Controleer of dit een permission/auth fout is
      const isPermissionError = error.status === 403 || error.status === 401 ||
        (error.message && /permission|unauthorized|forbidden|rechten|onvoldoende|right|http\s*40[13]|\b40[13]\b/i.test(error.message));
      
      if (isPermissionError && !forceRefresh) {
        // Probeer snapshot als fallback te laden
        try {
          const snapshotData = await loadSnapshotFallback(sectionName, activeTab, tenantId);
          if (snapshotData) {
            if (liveState.requestToken !== requestToken) return;
            const mergedData = Object.assign({}, snapshotData || {}, { _source: 'assessment_snapshot', _fallback_reason: 'Live data ontbreekt door rechten/configuratie' });
            syncModuleContext(sectionName, activeTab, capability, mergedData || null);
            renderData(sectionName, activeTab, mergedData || {});
            // Toon bericht over permission issue
            const permissionMsg = `Let op: Live gegevens kunnen niet worden opgehaald (${error.message}). De meest recente assessment-gegevens worden getoond.`;
            if (typeof showToast === 'function') showToast(permissionMsg, 'warning');
            return;
          }
        } catch (_) {
          // Snapshot ook geschonden, ga door naar foutmelding met suggestions
        }
      }
      
      renderError(sectionName, activeTab, error.message || 'De gegevens konden niet worden opgehaald. Probeer opnieuw of neem contact op met Denjoy.', error);
      if (typeof showToast === 'function') showToast(error.message || 'De gegevens konden niet worden opgehaald. Probeer opnieuw.', 'error');
    }
  }

  function switchLiveModuleTab(sectionName, tabKey) {
    loadLiveModuleSection(sectionName, tabKey);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-live-section][data-live-subtab]');
    if (!button) return;
    event.preventDefault();
    // Refresh-knoppen (class live-module-refresh) slaan de cache over
    const isRefresh = button.classList.contains('live-module-refresh');
    loadLiveModuleSection(button.dataset.liveSection, button.dataset.liveSubtab, { forceRefresh: isRefresh });
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-live-detail-id]');
    if (!button) return;
    event.preventDefault();
    openRegisteredDetail(button.dataset.liveDetailId);
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-exchange-mailbox-detail]');
    if (!button) return;
    event.preventDefault();
    if (typeof window.openExchangeMailboxDetail === 'function') {
      window.openExchangeMailboxDetail(button.dataset.exchangeMailboxDetail);
    }
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ex-filter]');
    if (!button) return;
    event.preventDefault();
    exchangeMailboxUiState.filter = button.dataset.exFilter || 'all';
    applyExchangeMailboxFilters();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-teams-filter]');
    if (!button) return;
    event.preventDefault();
    teamsUiState.filter = button.dataset.teamsFilter || 'all';
    applyTeamsFilters();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-groups-filter]');
    if (!button) return;
    event.preventDefault();
    groupsUiState.filter = button.dataset.groupsFilter || 'all';
    applyGroupsFilters();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sp-filter]');
    if (!button) return;
    event.preventDefault();
    sharePointSitesUiState.filter = button.dataset.spFilter || 'all';
    applySharePointSiteFilters();
  });

  const liveInputDebounceTimers = Object.create(null);
  const debounceLiveFilter = (key, fn, wait = 120) => {
    if (liveInputDebounceTimers[key]) clearTimeout(liveInputDebounceTimers[key]);
    liveInputDebounceTimers[key] = setTimeout(() => {
      try {
        fn();
      } finally {
        delete liveInputDebounceTimers[key];
      }
    }, wait);
  };

  document.addEventListener('input', (event) => {
    const input = event.target.closest('#exchangeMailboxSearch');
    if (!input) return;
    exchangeMailboxUiState.search = input.value || '';
    debounceLiveFilter('exchange-search', () => applyExchangeMailboxFilters());
  });

  document.addEventListener('input', (event) => {
    const input = event.target.closest('#teamsSearchInput');
    if (!input) return;
    teamsUiState.search = input.value || '';
    debounceLiveFilter('teams-search', () => applyTeamsFilters());
  });

  document.addEventListener('input', (event) => {
    const input = event.target.closest('#groupsSearchInput');
    if (!input) return;
    groupsUiState.search = input.value || '';
    debounceLiveFilter('groups-search', () => applyGroupsFilters());
  });

  document.addEventListener('input', (event) => {
    const input = event.target.closest('#sharePointSitesSearchInput');
    if (!input) return;
    sharePointSitesUiState.search = input.value || '';
    debounceLiveFilter('sharepoint-search', () => applySharePointSiteFilters());
  });

  const syncVisibleSelection = (rowSelector, checkboxSelector, checked) => {
    const rows = document.querySelectorAll(rowSelector);
    rows.forEach((row) => {
      if (row.style.display === 'none') return;
      const checkbox = row.querySelector(checkboxSelector);
      if (checkbox) checkbox.checked = checked;
    });
  };

  document.addEventListener('change', (event) => {
    const master = event.target.closest('#groupsSelectAll');
    if (!master) return;
    syncVisibleSelection('#teamsSection [data-groups-row="group"]', '[data-group-select]', master.checked);
    updateGroupsBulkSelectionState();
  });

  document.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-group-select]');
    if (!checkbox) return;
    updateGroupsBulkSelectionState();
  });

  document.addEventListener('change', (event) => {
    const master = event.target.closest('#exchangeSelectAll');
    if (!master) return;
    syncVisibleSelection('#exchangeSection [data-ex-row="mailbox"]', '[data-ex-select]', master.checked);
    updateExchangeBulkSelectionState();
  });

  document.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-ex-select]');
    if (!checkbox) return;
    updateExchangeBulkSelectionState();
  });

  document.addEventListener('change', (event) => {
    const master = event.target.closest('#sharePointSelectAll');
    if (!master) return;
    syncVisibleSelection('#sharepointSection [data-sp-row="site"]', '[data-sp-select]', master.checked);
    updateSharePointBulkSelectionState();
  });

  document.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-sp-select]');
    if (!checkbox) return;
    updateSharePointBulkSelectionState();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-groups-bulk-action]');
    if (!button) return;
    event.preventDefault();

    if (button.dataset.groupsBulkAction === 'select-risk') {
      const rows = Array.from(document.querySelectorAll('#teamsSection [data-groups-row="group"]'));
      rows.forEach((row) => {
        const checkbox = row.querySelector('[data-group-select]');
        if (!checkbox) return;
        if (row.style.display === 'none') {
          checkbox.checked = false;
          return;
        }
        checkbox.checked = row.dataset.risk === 'true';
      });
      updateGroupsBulkSelectionState();
      if (typeof window.showToast === 'function') {
        window.showToast('Alle zichtbare risicogroepen zijn geselecteerd.', 'info');
      }
      return;
    }

    const selected = Array.from(document.querySelectorAll('#teamsSection [data-group-select]:checked')).map((checkbox) => ({
      name: checkbox.dataset.groupName || 'Onbekende groep',
      mail: checkbox.dataset.groupMail || '',
      type: checkbox.dataset.groupType || 'Onbekend',
      risk: checkbox.dataset.groupRisk === 'true',
    }));
    if (!selected.length) {
      if (typeof window.showToast === 'function') {
        window.showToast('Selecteer eerst minimaal 1 groep.', 'warning');
      }
      return;
    }

    if (button.dataset.groupsBulkAction === 'review-selected') {
      const riskCount = selected.filter((entry) => entry.risk).length;
      const reviewList = selected.slice(0, 30).map((entry) => `
        <tr>
          <td>${liveEscapeHtml(entry.name)}</td>
          <td>${liveEscapeHtml(entry.type)}</td>
          <td>${entry.risk ? '<span class="live-badge live-badge-warn">Aandacht</span>' : '<span class="live-badge live-badge-ok">In orde</span>'}</td>
        </tr>
      `).join('');
      if (typeof window.openSideRailDetail === 'function') {
        window.openSideRailDetail('Groepen bulkreview', `${selected.length} geselecteerd`);
      }
      if (typeof window.updateSideRailDetail === 'function') {
        window.updateSideRailDetail('Groepen bulkreview', `
          <div class="snapshot-banner snapshot-banner--${riskCount > 0 ? 'warn' : 'good'}">
            <strong>Selectie klaar</strong> · ${liveEscapeHtml(String(selected.length))} groepen geselecteerd, ${liveEscapeHtml(String(riskCount))} met aandacht.
          </div>
          <div class="assessment-table-wrap live-review-table-wrap">
            <table class="assessment-table">
              <thead><tr><th>Groep</th><th>Type</th><th>Prioriteit</th></tr></thead>
              <tbody>${reviewList}</tbody>
            </table>
          </div>
        `);
      }
      return;
    }

    if (button.dataset.groupsBulkAction === 'export-selected') {
      const headers = ['Groep', 'Type', 'E-mail', 'Prioriteit'];
      const rows = selected.map((entry) => [entry.name, entry.type, entry.mail || '', entry.risk ? 'Aandacht' : 'In orde']);
      const esc = (value) => {
        const text = String(value ?? '');
        return (text.includes(',') || text.includes('"') || text.includes('\n'))
          ? `"${text.replace(/"/g, '""')}"`
          : text;
      };
      const csv = [headers, ...rows].map((row) => row.map(esc).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `groepen-selectie-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (typeof window.showToast === 'function') {
        window.showToast(`CSV export klaar (${selected.length} groepen).`, 'success');
      }
    }
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ex-bulk-action]');
    if (!button) return;
    event.preventDefault();

    if (button.dataset.exBulkAction === 'select-risk') {
      const rows = Array.from(document.querySelectorAll('#exchangeSection [data-ex-row="mailbox"]'));
      rows.forEach((row) => {
        const checkbox = row.querySelector('[data-ex-select]');
        if (!checkbox) return;
        if (row.style.display === 'none') {
          checkbox.checked = false;
          return;
        }
        checkbox.checked = row.dataset.risk === 'true';
      });
      updateExchangeBulkSelectionState();
      if (typeof window.showToast === 'function') {
        window.showToast('Alle zichtbare mailboxen met aandacht zijn geselecteerd.', 'info');
      }
      return;
    }

    const selected = Array.from(document.querySelectorAll('#exchangeSection [data-ex-select]:checked')).map((checkbox) => ({
      name: checkbox.dataset.name || 'Mailbox',
      mail: checkbox.dataset.mail || '',
      severity: checkbox.dataset.severity || 'In orde',
      risk: checkbox.dataset.risk === 'true',
    }));
    if (!selected.length) {
      if (typeof window.showToast === 'function') {
        window.showToast('Selecteer eerst minimaal 1 mailbox.', 'warning');
      }
      return;
    }

    if (button.dataset.exBulkAction === 'review-selected') {
      const riskCount = selected.filter((entry) => entry.risk).length;
      const reviewList = selected.slice(0, 40).map((entry) => `
        <tr>
          <td>${liveEscapeHtml(entry.name)}</td>
          <td>${liveEscapeHtml(entry.mail)}</td>
          <td>${entry.risk ? '<span class="live-badge live-badge-warn">Aandacht</span>' : '<span class="live-badge live-badge-ok">In orde</span>'}</td>
        </tr>
      `).join('');
      if (typeof window.openSideRailDetail === 'function') {
        window.openSideRailDetail('Exchange bulkreview', `${selected.length} geselecteerd`);
      }
      if (typeof window.updateSideRailDetail === 'function') {
        window.updateSideRailDetail('Exchange bulkreview', `
          <div class="snapshot-banner snapshot-banner--${riskCount > 0 ? 'warn' : 'good'}">
            <strong>Selectie klaar</strong> · ${liveEscapeHtml(String(selected.length))} mailboxen geselecteerd, ${liveEscapeHtml(String(riskCount))} met aandacht.
          </div>
          <div class="assessment-table-wrap live-review-table-wrap">
            <table class="assessment-table">
              <thead><tr><th>Mailbox</th><th>E-mail</th><th>Prioriteit</th></tr></thead>
              <tbody>${reviewList}</tbody>
            </table>
          </div>
        `);
      }
      return;
    }

    if (button.dataset.exBulkAction === 'export-selected') {
      const headers = ['Mailbox', 'E-mail', 'Severity', 'Prioriteit'];
      const rows = selected.map((entry) => [entry.name, entry.mail, entry.severity, entry.risk ? 'Aandacht' : 'In orde']);
      const esc = (value) => {
        const text = String(value ?? '');
        return (text.includes(',') || text.includes('"') || text.includes('\n'))
          ? `"${text.replace(/"/g, '""')}"`
          : text;
      };
      const csv = [headers, ...rows].map((row) => row.map(esc).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `exchange-selectie-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (typeof window.showToast === 'function') {
        window.showToast(`CSV export klaar (${selected.length} mailboxen).`, 'success');
      }
    }
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sp-bulk-action]');
    if (!button) return;
    event.preventDefault();

    if (button.dataset.spBulkAction === 'select-risk') {
      const rows = Array.from(document.querySelectorAll('#sharepointSection [data-sp-row="site"]'));
      rows.forEach((row) => {
        const checkbox = row.querySelector('[data-sp-select]');
        if (!checkbox) return;
        if (row.style.display === 'none') {
          checkbox.checked = false;
          return;
        }
        checkbox.checked = row.dataset.risk === 'true';
      });
      updateSharePointBulkSelectionState();
      if (typeof window.showToast === 'function') {
        window.showToast('Alle zichtbare risicosites zijn geselecteerd.', 'info');
      }
      return;
    }

    const selected = Array.from(document.querySelectorAll('#sharepointSection [data-sp-select]:checked')).map((checkbox) => ({
      name: checkbox.dataset.name || 'Site',
      url: checkbox.dataset.url || '',
      severity: checkbox.dataset.severity || 'In orde',
      risk: checkbox.dataset.risk === 'true',
    }));
    if (!selected.length) {
      if (typeof window.showToast === 'function') {
        window.showToast('Selecteer eerst minimaal 1 site.', 'warning');
      }
      return;
    }

    if (button.dataset.spBulkAction === 'review-selected') {
      const riskCount = selected.filter((entry) => entry.risk).length;
      const reviewList = selected.slice(0, 40).map((entry) => `
        <tr>
          <td>${liveEscapeHtml(entry.name)}</td>
          <td>${entry.url ? `<a href="${liveEscapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer">${liveEscapeHtml(entry.url)}</a>` : '—'}</td>
          <td>${entry.risk ? '<span class="live-badge live-badge-warn">Aandacht</span>' : '<span class="live-badge live-badge-ok">In orde</span>'}</td>
        </tr>
      `).join('');
      if (typeof window.openSideRailDetail === 'function') {
        window.openSideRailDetail('SharePoint bulkreview', `${selected.length} geselecteerd`);
      }
      if (typeof window.updateSideRailDetail === 'function') {
        window.updateSideRailDetail('SharePoint bulkreview', `
          <div class="snapshot-banner snapshot-banner--${riskCount > 0 ? 'warn' : 'good'}">
            <strong>Selectie klaar</strong> · ${liveEscapeHtml(String(selected.length))} sites geselecteerd, ${liveEscapeHtml(String(riskCount))} met aandacht.
          </div>
          <div class="assessment-table-wrap live-review-table-wrap">
            <table class="assessment-table">
              <thead><tr><th>Site</th><th>URL</th><th>Prioriteit</th></tr></thead>
              <tbody>${reviewList}</tbody>
            </table>
          </div>
        `);
      }
      return;
    }

    if (button.dataset.spBulkAction === 'export-selected') {
      const headers = ['Site', 'URL', 'Severity', 'Prioriteit'];
      const rows = selected.map((entry) => [entry.name, entry.url, entry.severity, entry.risk ? 'Aandacht' : 'In orde']);
      const esc = (value) => {
        const text = String(value ?? '');
        return (text.includes(',') || text.includes('"') || text.includes('\n'))
          ? `"${text.replace(/"/g, '""')}"`
          : text;
      };
      const csv = [headers, ...rows].map((row) => row.map(esc).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sharepoint-selectie-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (typeof window.showToast === 'function') {
        window.showToast(`CSV export klaar (${selected.length} sites).`, 'success');
      }
    }
  });

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-alerts-action]');
    if (!button) return;
    event.preventDefault();
    const tenantId = selectedTenantId();
    if (!tenantId) return;
    const result = document.getElementById('alertsConfigResult');
    const webhook_url = document.getElementById('alertsWebhookUrl')?.value?.trim() || '';
    const webhook_type = document.getElementById('alertsWebhookType')?.value || 'teams';
    const email_addr = document.getElementById('alertsEmailAddr')?.value?.trim() || '';
    try {
      if (button.dataset.alertsAction === 'save') {
        await liveApiRequest(`/api/alerts/${tenantId}/config`, {
          method: 'POST',
          body: JSON.stringify({ webhook_url, webhook_type, email_addr }),
        });
        if (result) result.textContent = 'Configuratie opgeslagen.';
      } else if (button.dataset.alertsAction === 'test') {
        const data = await liveApiRequest(`/api/alerts/${tenantId}/test-webhook`, {
          method: 'POST',
          body: JSON.stringify({ webhook_url, webhook_type }),
        });
        if (result) result.textContent = data.ok ? 'Testbericht verzonden.' : (data.error || 'Test mislukt.');
      }
      if (result) result.className = 'live-module-config-result is-visible';
    } catch (error) {
      if (result) {
        result.textContent = error.message || 'Actie mislukt.';
        result.className = 'live-module-config-result is-visible is-error';
      }
    }
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-appreg-id]');
    if (!button) return;
    event.preventDefault();
    openAppRegistrationModal(button.dataset.appregId);
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.grp-detail-btn');
    if (!button) return;
    event.preventDefault();
    const d = button.dataset;
    const name = d.groupName || d.groupId || 'Groep';
    if (typeof window.openSideRailDetail === 'function') {
      window.openSideRailDetail(d.groupType || 'Groep', name);
    }
    const guestCount = Number(d.guestCount || 0);
    const bodyHtml = typeof window.renderSideRailTemplate === 'function'
      ? window.renderSideRailTemplate({
          tone: guestCount > 0 ? 'warn' : 'good',
          statusLabel: guestCount > 0 ? 'Aandacht' : 'In orde',
          summaryCards: [
            { label: 'Type', value: d.groupType || '—', meta: d.isDynamic === 'true' ? 'dynamisch' : 'statisch', tone: d.isDynamic === 'true' ? 'warn' : 'neutral' },
            { label: 'Leden', value: d.memberCount || '0', meta: 'group members', tone: 'neutral' },
            { label: 'Owners', value: d.ownerCount || '0', meta: 'group owners', tone: 'neutral' },
            { label: 'Gasten', value: d.guestCount || '0', meta: guestCount > 0 ? 'externe toegang' : 'geen externen', tone: guestCount > 0 ? 'warn' : 'good' },
          ],
          sections: [
            {
              title: 'Groepdetails',
              badge: d.groupType || 'Groep',
              tone: guestCount > 0 ? 'warn' : 'good',
              bodyHtml: `
                <div class="ex-detail-grid">
                  <div class="ex-detail-item"><label>Naam</label><span>${liveEscapeHtml(name)}</span></div>
                  <div class="ex-detail-item"><label>E-mail</label><span>${liveEscapeHtml(d.groupMail || '—')}</span></div>
                  <div class="ex-detail-item"><label>Dynamisch</label><span>${d.isDynamic === 'true' ? 'Ja' : 'Nee'}</span></div>
                  <div class="ex-detail-item"><label>Aangemaakt</label><span>${liveEscapeHtml(formatDate(d.createdAt || ''))}</span></div>
                  ${d.description ? `<div class="ex-detail-item" style="grid-column:1/-1"><label>Omschrijving</label><span>${liveEscapeHtml(d.description)}</span></div>` : ''}
                  <div class="ex-detail-item" style="grid-column:1/-1"><label>Object ID</label><span style="font-family:var(--mono,monospace);font-size:0.72rem;word-break:break-all">${liveEscapeHtml(d.groupId || '—')}</span></div>
                </div>`,
            },
          ],
          findings: [{
            tone: guestCount > 0 ? 'warn' : 'good',
            label: guestCount > 0 ? 'Aandacht' : 'In orde',
            title: guestCount > 0 ? 'Gastleden aanwezig' : 'Geen gastleden',
            body: guestCount > 0
              ? 'Controleer periodiek of gastleden nog nodig zijn en of eigenaarschap actueel is.'
              : 'Geen externe gasttoegang in deze groep gevonden.',
          }],
          actions: [{
            title: 'Aanbevolen actie',
            body: 'Valideer eigenaarschap en lidmaatschap, en verwijder overbodige externe toegang.',
          }],
        })
      : `
          <div class="gb-detail-grid">
            <div class="gb-detail-row"><span class="gb-detail-label">Type</span><span>${liveEscapeHtml(d.groupType || '—')}</span></div>
            <div class="gb-detail-row"><span class="gb-detail-label">E-mail</span><span>${liveEscapeHtml(d.groupMail || '—')}</span></div>
          </div>
        `;
    if (typeof window.updateSideRailDetail === 'function') {
      window.updateSideRailDetail(name, bodyHtml);
    }
  });

  // CSV export handler for all live control tables
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.live-export-btn');
    if (!btn) return;
    const wrap = btn.closest('.live-entity-table-wrap');
    if (!wrap) return;
    const table = wrap.querySelector('.live-entity-table');
    if (!table) return;
    const allHeaders = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    // Omit columns with empty header (e.g. playbook button column)
    const colIndexes = allHeaders.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
    const headers = colIndexes.map((i) => allHeaders[i]);
    const rows = [...table.querySelectorAll('tbody tr')].map((row) => {
      const cells = [...row.querySelectorAll('td')];
      return colIndexes.map((i) => (cells[i] ? cells[i].textContent.trim().replace(/\s+/g, ' ') : ''));
    });
    const csvEscape = (val) => {
      const s = String(val ?? '');
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'denjoy-export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, false);

  window.loadLiveModuleSection = loadLiveModuleSection;
  window.switchLiveModuleTab = switchLiveModuleTab;
})();
