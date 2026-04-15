(function initDenjoyMspPortalConfig(global) {
  'use strict';

  // ── Fase 3: QUICK_ACTIONS — begrijpelijke knoplabers ──────────────────────
  const QUICK_ACTIONS = {
    overview: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goResults', label: 'Rapporten bekijken', kind: 'ghost' },
      { id: 'goKb', label: 'Documentatie', kind: 'ghost' },
    ],
    assessment: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goAssessment', label: 'Scan starten', kind: 'primary' },
      { id: 'goResults', label: 'Rapporten bekijken', kind: 'ghost' },
    ],
    results: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'resultsViewer', label: 'Rapportviewer', kind: 'primary' },
      { id: 'resultsActions', label: 'Te ondernemen acties', kind: 'ghost' },
    ],
    herstel: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goRemCatalog', label: 'Herstelcatalogus', kind: 'primary' },
      { id: 'goRemHistory', label: 'Geschiedenis', kind: 'ghost' },
    ],
    gebruikers: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'scanUsersLive', label: 'Gebruikers vernieuwen', kind: 'ghost' },
    ],
    teams: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goTeams', label: 'Teams bekijken', kind: 'primary' },
    ],
    sharepoint: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goSharePointSites', label: 'Sites bekijken', kind: 'primary' },
      { id: 'goSharePointBackup', label: 'Back-up', kind: 'ghost' },
    ],
    identity: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goIdentityMfa', label: 'Inlogbeveiliging', kind: 'primary' },
    ],
    apps: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goAppsRegistrations', label: 'Gekoppelde Apps', kind: 'primary' },
    ],
    azure: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goAzureOverview', label: 'Azure overzicht', kind: 'primary' },
      { id: 'goAzureCosts', label: 'Azure kosten', kind: 'ghost' },
    ],
    platformHub: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goPlatformTenants', label: 'Tenantoverzicht', kind: 'primary' },
      { id: 'goPlatformRoles', label: 'Rollen', kind: 'ghost' },
      { id: 'goPlatformSettings', label: 'Configuratie', kind: 'ghost' },
    ],
    dienstenHub: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goServicesCatalog', label: 'Catalogus', kind: 'primary' },
      { id: 'goServicesSecurity', label: 'Beveiliging', kind: 'ghost' },
      { id: 'goServicesCloud', label: 'Cloud', kind: 'ghost' },
    ],
    securityHub: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goAlertsScore', label: 'Beveiligingsscore', kind: 'primary' },
      { id: 'goSecurityFindings', label: 'Risico’s', kind: 'ghost' },
      { id: 'goSecurityDomains', label: 'Mailsecurity', kind: 'ghost' },
    ],
    compliance: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goComplianceCis', label: 'CIS Normering', kind: 'primary' },
      { id: 'goZeroTrust', label: 'Zero Trust', kind: 'ghost' },
    ],
    intuneManagementHub: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goDevicesHub', label: 'Apparatenoverzicht', kind: 'ghost' },
      { id: 'goDevices', label: 'Apparaatbeheer', kind: 'primary' },
    ],
    baseline: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goBaselines', label: 'Standaardinstellingen', kind: 'primary' },
    ],
    settings: [
      { id: 'refreshWorkspace', label: 'Gegevens vernieuwen', kind: 'secondary' },
      { id: 'goSettingsTenant', label: 'Tenant', kind: 'primary' },
      { id: 'goSettingsGeneral', label: 'Algemeen', kind: 'ghost' },
    ],
  };

  // ── Fase 2: SECTION_META — klantgerichte titels en beschrijvingen ─────────
  const SECTION_META = {
    // Dashboard
    overview: {
      title: 'Mijn Overzicht',
      meta: 'Actuele status van uw Microsoft 365-omgeving in één oogopslag.',
    },
    // Hub-secties
    peopleHub: {
      title: 'Identiteit & Toegang',
      meta: 'Gebruikers, accounts en toegangsbeheer voor uw organisatie.',
    },
    securityHub: {
      title: 'Security Center',
      meta: 'Dagelijkse beveiligingssignalen, openstaande risico\'s en domeinbeveiliging op één plek.',
    },
    collabHub: {
      title: 'Email & Samenwerking',
      meta: 'Overzicht van e-mail, Teams en samenwerking binnen uw organisatie.',
    },
    devicesHub: {
      title: 'Apparaten & Beheer',
      meta: 'Beheerde apparaten, compliancestatus en configuratie op één plek.',
    },
    assessmentHub: {
      title: 'Analyse & Acties',
      meta: 'Beveiligingsscans uitvoeren, resultaten bekijken en bevindingen opvolgen.',
    },
    // Identiteit & Toegang
    gebruikers: {
      title: 'Gebruikers & Licenties',
      meta: 'Overzicht van alle accounts, licenties en toegangsrechten.',
    },
    identity: {
      title: 'Inlogbeveiliging',
      meta: 'Overzicht van MFA-status, gastaccounts en beheerdersrollen.',
    },
    ca: {
      title: 'Toegangsbeleid',
      meta: 'Regels die bepalen wie, wanneer en waarvandaan toegang heeft tot uw omgeving.',
    },
    hybrid: {
      title: 'AD-koppeling',
      meta: 'Status van de koppeling tussen uw lokale Active Directory en Microsoft 365.',
    },
    apps: {
      title: 'Gekoppelde Apps',
      meta: 'Overzicht van gekoppelde applicaties, hun rechten en vervaldatums.',
    },
    // Beveiliging & Naleving
    alerts: {
      title: 'Security Center',
      meta: 'Secure Score, audit, verdachte aanmeldingen en security-signalen voor uw tenant.',
    },
    compliance: {
      title: 'Compliance & Maturity',
      meta: 'CIS-normering en Zero Trust-volwassenheid in één werkruimte.',
    },
    bevindingen: {
      title: 'Security Center',
      meta: 'Werkvoorraad met security-bevindingen en opvolging binnen dezelfde securitywerkruimte.',
    },
    zerotrust: {
      title: 'Compliance & Maturity',
      meta: 'Zero Trust-volwassenheid en pijleranalyse binnen dezelfde compliancewerkruimte.',
    },
    domains: {
      title: 'Security Center',
      meta: 'SPF, DKIM, DMARC en maildomeinbeveiliging als onderdeel van dezelfde securitywerkruimte.',
    },
    // Email & Samenwerking
    exchange: {
      title: 'E-mail & Postvakken',
      meta: 'Overzicht van postvakken, doorstuurregels en verdachte inbox-instellingen.',
    },
    teams: {
      title: 'Microsoft Teams',
      meta: 'Teams-omgeving, leden en risico-indicatoren voor uw organisatie.',
    },
    sharepoint: {
      title: 'Bestanden & Sites',
      meta: 'SharePoint-sites, documenten en samenwerkingsinstellingen.',
    },
    // Apparaten & Beheer
    backup: {
      title: 'Gegevensback-up',
      meta: 'Back-upstatus van uw e-mail, bestanden en Microsoft 365-data.',
    },
    intuneManagementHub: {
      title: 'Beheercockpit',
      meta: 'Centraal beheer- en auditcentrum voor apparaatconfiguratie.',
    },
    intune: {
      title: 'Apparaten & Beheer',
      meta: 'Beheerde apparaten, compliancestatus en configuratieprofielen.',
    },
    // Analyse & Acties
    assessment: {
      title: 'Beveiligingsscan',
      meta: 'Technische beveiligingsscan starten en voortgang volgen.',
    },
    results: {
      title: 'Rapporten & Scores',
      meta: 'Rapporten, scores en aanbevelingen uit uitgevoerde scans.',
    },
    herstel: {
      title: 'Problemen Herstellen',
      meta: 'Automatisch herstel van geconstateerde bevindingen.',
    },
    baseline: {
      title: 'Standaardinstellingen',
      meta: 'De gewenste inrichting van uw omgeving bewaken en afdwingen.',
    },
    // Documentatie
    kb: {
      title: 'Documentatie',
      meta: 'Operationele documentatie, apparaten, contacten en procedures.',
    },
    // MSP Admin
    azure: {
      title: 'Azure',
      meta: 'Centrale Azure-inzichten over abonnementen, resources, meldingen en kosten.',
    },
    platformHub: {
      title: 'Platform',
      meta: 'Platformbeheer voor tenantoverzicht, rollen en configuratie.',
    },
    dienstenHub: {
      title: 'Diensten',
      meta: 'Servicecatalogus met managed, advisory en projectdiensten per klant.',
    },
    mspcontrolcenter: {
      title: 'MSP Control Center',
      meta: 'Multi-tenant operations, goedkeuringen en achtergrondtaken.',
    },
    klantenbeheer: {
      title: 'Klantenbeheer',
      meta: 'Klantkaarten, tenantkoppelingen en onboarding beheren.',
    },
    tenantoverzicht: {
      title: 'Tenantoverzicht',
      meta: 'MSP-breed overzicht van alle gekoppelde tenants en hun status.',
    },
    goedkeuringen: {
      title: 'Goedkeuringen',
      meta: 'Beoordeel en verwerk operationele goedkeuringsverzoeken.',
    },
    kosten: {
      title: 'Kosten',
      meta: 'Kostenmonitoring en snapshotbeheer per tenant.',
    },
    jobmonitor: {
      title: 'Achtergrondtaken',
      meta: 'Volg achtergrondtaken en herstelprocessen.',
    },
    settings: {
      title: 'Instellingen',
      meta: 'Tenant-, beveiligings- en algemene portalinstellingen.',
    },
    portalInfo: {
      title: 'Hoe werkt dit portaal?',
      meta: 'Uitleg over het portaal, de kleurcodes en wat Denjoy voor u doet.',
    },
  };

  const USERS_LICENSES_V2 = true;

  // ── SUBNAV_CONFIG — tab-labels ─────────────────────────────────────────────
  const SUBNAV_CONFIG = {
    results: [
      { resultsPanel: 'viewer', label: 'Rapportviewer' },
      { resultsPanel: 'actions', label: 'Te ondernemen acties' },
      { resultsPanel: 'management', label: 'Beheer' },
      { resultsPanel: 'diff', label: 'Vergelijking' },
    ],
    settings: [
      { settingsTab: 'tenant', label: 'Tenant' },
      { settingsTab: 'roles', label: 'Rollen' },
      { settingsTab: 'general', label: 'Algemeen' },
    ],
    gebruikers: USERS_LICENSES_V2
      ? [
          { gbTab: 'overzicht', label: 'Overzicht' },
          { gbTab: 'gebruikers', label: 'Gebruikers' },
          { gbTab: 'licenties', label: 'Licenties' },
          { gbTab: 'risicos', label: 'Risico\'s' },
        ]
      : [
          { gbTab: 'gebruikers', label: 'Gebruikersoverzicht' },
          { gbTab: 'licenties', label: 'Licentieoverzicht' },
          { gbTab: 'gasten', label: 'Gastgebruikers' },
          { gbTab: 'geschiedenis', label: 'Provisioninggeschiedenis' },
        ],
    kb: [
      { kbTab: 'overview', label: 'Overzicht' },
      { kbTab: 'assets', label: 'Apparaten', countId: 'nbCountAssets' },
      { kbTab: 'vlans', label: 'VLANs', countId: 'nbCountVlans' },
      { kbTab: 'pages', label: 'Documenten', countId: 'nbCountPages' },
      { kbTab: 'contacts', label: 'Contacten', countId: 'nbCountContacts' },
      { kbTab: 'passwords', label: 'Wachtwoorden', countId: 'nbCountPasswords' },
      { kbTab: 'software', label: 'Software', countId: 'nbCountSoftware' },
      { kbTab: 'domains', label: 'Domeinen', countId: 'nbCountDomains' },
      { kbTab: 'appregs', label: 'App Registraties', countId: 'nbCountAppRegs' },
      { kbTab: 'm365', label: 'Microsoft 365' },
      { kbTab: 'changelog', label: 'Wijzigingslog', countId: 'nbCountChangelog' },
    ],
    zerotrust: [
      { ztTab: 'overview', label: 'Overzicht' },
      { ztTab: 'identity', label: 'Identiteit' },
      { ztTab: 'devices', label: 'Apparaten' },
      { ztTab: 'network', label: 'Netwerk' },
      { ztTab: 'data', label: 'Data' },
      { ztTab: 'json', label: 'JSON' },
    ],
    securityHub: [
      { section: 'alerts', liveTab: 'securescr', label: 'Beveiligingsscore' },
      { section: 'alerts', liveTab: 'auditlog', label: 'Audit & Aanmeldingen' },
      { section: 'bevindingen', label: 'Openstaande risico’s' },
      { section: 'domains', liveTab: 'domains-list', label: 'Domeinen & mailsecurity' },
      { section: 'identity', liveTab: 'legacy-auth', label: 'Verouderde login' },
    ],
    alerts: [
      { section: 'alerts', liveTab: 'securescr', label: 'Beveiligingsscore' },
      { section: 'alerts', liveTab: 'auditlog', label: 'Audit & Aanmeldingen' },
      { section: 'bevindingen', label: 'Openstaande risico’s' },
      { section: 'domains', liveTab: 'domains-list', label: 'Domeinen & mailsecurity' },
      { section: 'identity', liveTab: 'legacy-auth', label: 'Verouderde login' },
    ],
    bevindingen: [
      { section: 'alerts', liveTab: 'securescr', label: 'Beveiligingsscore' },
      { section: 'alerts', liveTab: 'auditlog', label: 'Audit & Aanmeldingen' },
      { section: 'bevindingen', label: 'Openstaande risico’s' },
      { section: 'domains', liveTab: 'domains-list', label: 'Domeinen & mailsecurity' },
      { section: 'identity', liveTab: 'legacy-auth', label: 'Verouderde login' },
    ],
    domains: [
      { section: 'alerts', liveTab: 'securescr', label: 'Beveiligingsscore' },
      { section: 'alerts', liveTab: 'auditlog', label: 'Audit & Aanmeldingen' },
      { section: 'bevindingen', label: 'Openstaande risico’s' },
      { section: 'domains', liveTab: 'domains-list', label: 'Domeinen & mailsecurity' },
      { section: 'identity', liveTab: 'legacy-auth', label: 'Verouderde login' },
    ],
    compliance: [
      { section: 'compliance', liveTab: 'cis', label: 'CIS Normering' },
      { section: 'zerotrust', ztTab: 'overview', label: 'Zero Trust' },
      { section: 'zerotrust', ztTab: 'identity', label: 'Identiteit' },
      { section: 'zerotrust', ztTab: 'devices', label: 'Apparaten' },
      { section: 'zerotrust', ztTab: 'network', label: 'Netwerk' },
      { section: 'zerotrust', ztTab: 'data', label: 'Data' },
    ],
    azure: [
      { liveTab: 'overview', label: 'Overzicht' },
      { liveTab: 'subscriptions', label: 'Abonnementen' },
      { liveTab: 'resources', label: 'Resources' },
      { liveTab: 'alerts', label: 'Meldingen' },
      { liveTab: 'costs', label: 'Kosten' },
    ],
    mspcontrolcenter: [
      { section: 'mspcontrolcenter', label: 'Overzicht' },
      { section: 'goedkeuringen', label: 'Goedkeuringen' },
      { section: 'jobmonitor', label: 'Achtergrondtaken' },
      { section: 'results', resultsPanel: 'actions', label: 'Werklijst' },
    ],
    klantenbeheer: [
      { section: 'klantenbeheer', label: 'Klanten' },
      { section: 'tenantoverzicht', label: 'Onboarding' },
      { section: 'settings', settingsTab: 'roles', label: 'Toegangsgaten' },
    ],
    platformHub: [
      { section: 'platformHub', label: 'Overzicht' },
      { section: 'tenantoverzicht', label: 'Tenantoverzicht' },
      { section: 'settings', settingsTab: 'roles', label: 'Rollen' },
      { section: 'settings', settingsTab: 'tenant', label: 'Tenants' },
      { section: 'settings', settingsTab: 'general', label: 'Configuratie' },
    ],
    dienstenHub: [
      { section: 'dienstenHub', label: 'Catalogus' },
      { section: 'identity', liveTab: 'mfa', label: 'Identiteit' },
      { section: 'alerts', liveTab: 'auditlog', label: 'Monitoring' },
      { section: 'azure', liveTab: 'costs', label: 'Cloud' },
      { section: 'assessment', label: 'Beveiligingsscan' },
      { section: 'results', resultsPanel: 'actions', label: 'Rapportage' },
    ],
  };

  // ── Fase 4: NAV_GROUP_SECTIONS — correcte groepsindeling ──────────────────
  // apps → people (Gekoppelde Apps hoort bij Identiteit & Toegang)
  // domains → security (Domeinen & E-mailbeveiliging hoort bij Beveiliging)
  // backup → devices (Gegevensback-up hoort bij Apparaten)
  // collab bevat daarna alleen: exchange, teams, sharepoint
  const NAV_GROUP_SECTIONS = {
    people: [
      'peopleHub',
      { section: 'gebruikers', subItems: USERS_LICENSES_V2 ? ['overzicht', 'gebruikers', 'licenties', 'risicos'] : ['gebruikers', 'licenties', 'geschiedenis'] },
      { section: 'identity', subItems: ['mfa', 'admin-roles', 'legacy-auth'] },
      { section: 'ca', subItems: ['policies'] },
      { section: 'apps', subItems: ['registrations'] },
      { section: 'hybrid', subItems: ['sync'] },
    ],
    security: [
      'securityHub',
      { section: 'compliance', subItems: ['cis'] },
      { section: 'alerts', subItems: ['securescr', 'auditlog', 'signins'], hidden: true },
      { section: 'bevindingen', hidden: true },
      { section: 'zerotrust', subItems: ['overview', 'identity', 'devices', 'network', 'data', 'json'], hidden: true },
      { section: 'domains', subItems: ['domains-list'], hidden: true },
    ],
    collab: [
      'collabHub',
      { section: 'exchange', subItems: ['mailboxen'] },
      { section: 'teams', subItems: ['teams'] },
      { section: 'sharepoint', subItems: ['sharepoint-sites'] },
    ],
    devices: [
      'devicesHub',
      'intuneManagementHub',
      { section: 'intune', subItems: ['overzicht', 'apparaten', 'compliance', 'configuratie'] },
      { section: 'backup', subItems: ['overzicht'] },
    ],
    followup: [
      'assessmentHub',
      'assessment',
      { section: 'results', subItems: ['viewer', 'actions', 'management', 'diff'] },
      'herstel',
      'baseline',
    ],
    kb: [
      { section: 'kb', subItems: ['overview', 'assets', 'vlans', 'pages', 'contacts', 'passwords', 'software', 'domains', 'appregs', 'm365', 'changelog'] },
    ],
    admin: [
      'mspcontrolcenter',
      'klantenbeheer',
      { section: 'azure', subItems: ['overview', 'subscriptions', 'resources', 'alerts', 'costs'] },
      'platformHub',
      'dienstenHub',
      { section: 'tenantoverzicht', hidden: true },
      { section: 'goedkeuringen', hidden: true },
      { section: 'kosten', hidden: true },
      { section: 'jobmonitor', hidden: true },
      { section: 'settings', hidden: true },
    ],
  };

  global.SECTION_META = { ...(global.SECTION_META || {}), ...SECTION_META };
  global.SUBNAV_CONFIG = { ...(global.SUBNAV_CONFIG || {}), ...SUBNAV_CONFIG };
  global.NAV_GROUP_SECTIONS = { ...(global.NAV_GROUP_SECTIONS || {}), ...NAV_GROUP_SECTIONS };
  global.QUICK_ACTIONS = { ...(global.QUICK_ACTIONS || {}), ...QUICK_ACTIONS };

  global.DenjoyMspPortalConfig = {
    QUICK_ACTIONS,
    SECTION_META,
    SUBNAV_CONFIG,
    NAV_GROUP_SECTIONS,
  };
})(window);
