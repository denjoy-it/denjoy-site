# MSP Portal Refactor Plan — 1 april 2026

## Doel

Dit plan vertaalt de huidige Denjoy-portal naar een concrete refactorvolgorde, zodat de bestaande functionaliteit behouden blijft maar de codebase beheersbaar wordt voor verdere MSP-uitbouw.

Uitgangspunt voor deze fase:

- focus ligt op structuur, onderhoudbaarheid en schaalbaarheid
- security hardening en secret-management worden bewust later opgepakt
- de bestaande portalstructuur blijft inhoudelijk intact

Dit document bouwt voort op:

- [docs/MSP-PORTAL-GAP-ANALYSIS-2026-04-01.md](/Users/demac/Downloads/Denjoy-it-site-main-2/docs/MSP-PORTAL-GAP-ANALYSIS-2026-04-01.md)
- [docs/DENJOY-MSP-CONTROL-PLANE-BLUEPRINT.md](/Users/demac/Downloads/Denjoy-it-site-main-2/docs/DENJOY-MSP-CONTROL-PLANE-BLUEPRINT.md)

## Samenvatting

De informatiearchitectuur van Denjoy is goed. De gebruiker ziet een logisch portaal:

- `Overzicht`
- domeinhubs voor `Identity`, `Security`, `Samenwerking`, `Apparaten`
- `Kennisbank`
- `MSP Admin`
- `MSP Control Center`

De grootste knelpunten zitten daarom niet in de menu-opzet, maar in de code-organisatie:

- [backend-api/app.py](/Users/demac/Downloads/Denjoy-it-site-main-2/backend-api/app.py) is te groot en combineert routing, access, businesslogica en persistence
- [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js) is te veel tegelijk: shell, router, overview, MSP admin, klantdetail, rollen, jobs en control center
- [frontend-portal/dashboard.html](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/dashboard.html) bevat te veel secties in één document

Advies:

1. behoud de huidige navigatiestructuur
2. splits de codebase op per domein en per platformlaag
3. verplaats generieke shelllogica naar gedeelde modules
4. maak `MSP Admin` en `Control Center` technisch echt aparte domeinen

## Huidige hotspots

### Frontend

- [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js): `7.336` regels
- [frontend-portal/js/kb.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/kb.js): `2.527` regels
- [frontend-portal/js/live-modules.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/live-modules.js): `2.431` regels
- [frontend-portal/dashboard.html](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/dashboard.html): `2.994` regels

Belangrijke concentraties in `dashboard.js`:

- `NAV_GROUP_SECTIONS` in [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js#L970)
- `updateWorkspaceHeader` in [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js#L1189)
- `renderContextRail` in [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js#L1432)
- `showSection` in [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js#L1711)
- `loadMspControlCenter` in [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js#L4356)
- `bootstrap` in [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js#L4752)
- `loadKlantenbeheer` in [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js#L5143)
- `loadGoedkeuringen` in [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js#L6246)
- `loadKostenSection` in [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js#L6363)
- `loadJobMonitor` in [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js#L6461)
- `loadRolesTab` in [frontend-portal/js/dashboard.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/js/dashboard.js#L6817)

### Backend

- [backend-api/app.py](/Users/demac/Downloads/Denjoy-it-site-main-2/backend-api/app.py): `11.998` regels

Belangrijke concentraties:

- access-guard in [backend-api/app.py](/Users/demac/Downloads/Denjoy-it-site-main-2/backend-api/app.py#L1608)
- customer health in [backend-api/app.py](/Users/demac/Downloads/Denjoy-it-site-main-2/backend-api/app.py#L7970)
- onboarding summary in [backend-api/app.py](/Users/demac/Downloads/Denjoy-it-site-main-2/backend-api/app.py#L8219)
- finance summary in [backend-api/app.py](/Users/demac/Downloads/Denjoy-it-site-main-2/backend-api/app.py#L8238)
- MSP Control Center payload in [backend-api/app.py](/Users/demac/Downloads/Denjoy-it-site-main-2/backend-api/app.py#L8320)
- request handler in [backend-api/app.py](/Users/demac/Downloads/Denjoy-it-site-main-2/backend-api/app.py#L9593)

## Gewenste doelarchitectuur

### Frontendlagen

#### 1. Shell layer

Verantwoordelijk voor:

- globale navigatie
- header
- context rail
- rolzichtbaarheid
- routewissels
- notificaties

Aanbevolen bestanden:

- `frontend-frontend-portal/js/shell/navigation.js`
- `frontend-frontend-portal/js/shell/header.js`
- `frontend-frontend-portal/js/shell/context-rail.js`
- `frontend-frontend-portal/js/shell/access.js`
- `frontend-frontend-portal/js/shell/router.js`

#### 2. Shared platform layer

Verantwoordelijk voor:

- `apiFetch`
- `apiFetchCached`
- cache invalidation
- centrale state
- formatting helpers
- side-rail templates

Aanbevolen bestanden:

- `frontend-frontend-portal/js/shared/api.js`
- `frontend-frontend-portal/js/shared/cache.js`
- `frontend-frontend-portal/js/shared/state.js`
- `frontend-frontend-portal/js/shared/ui.js`
- `frontend-frontend-portal/js/shared/formatters.js`

#### 3. Workspace layer

Per hoofdgroep een eigen module:

- `frontend-frontend-portal/js/workspaces/overview.js`
- `frontend-frontend-portal/js/workspaces/hubs.js`
- `frontend-frontend-portal/js/workspaces/results.js`
- `frontend-frontend-portal/js/workspaces/assessment.js`
- `frontend-frontend-portal/js/workspaces/kb.js`

#### 4. MSP Admin layer

Opsplitsen in:

- `frontend-frontend-portal/js/msp/control-center.js`
- `frontend-frontend-portal/js/msp/customers.js`
- `frontend-frontend-portal/js/msp/roles-access.js`
- `frontend-frontend-portal/js/msp/approvals.js`
- `frontend-frontend-portal/js/msp/jobs.js`
- `frontend-frontend-portal/js/msp/billing.js`
- `frontend-frontend-portal/js/msp/onboarding.js`

#### 5. Live domain layer

Huidige richting is al goed, maar verder aanscherpen:

- `frontend-frontend-portal/js/live/identity.js`
- `frontend-frontend-portal/js/live/security.js`
- `frontend-frontend-portal/js/live/collaboration.js`
- `frontend-frontend-portal/js/live/devices.js`
- `frontend-frontend-portal/js/live/alerts.js`
- `frontend-frontend-portal/js/live/exchange.js`
- `frontend-frontend-portal/js/live/backup.js`

### Backendlagen

#### 1. HTTP/router layer

Alleen verantwoordelijk voor:

- request parsing
- auth/session bootstrap
- route dispatch
- response serialisatie

Aanbevolen map:

- `backend-api/routes/`

Met bijvoorbeeld:

- `backend-api/routes/auth.py`
- `backend-api/routes/customers.py`
- `backend-api/routes/msp.py`
- `backend-api/routes/jobs.py`
- `backend-api/routes/approvals.py`
- `backend-api/routes/kb.py`
- `backend-api/routes/reports.py`

#### 2. Service layer

Businesslogica verplaatsen naar:

- `backend-api/services/customer_service.py`
- `backend-api/services/onboarding_service.py`
- `backend-api/services/capability_service.py`
- `backend-api/services/msp_control_center_service.py`
- `backend-api/services/approval_service.py`
- `backend-api/services/job_service.py`
- `backend-api/services/kb_service.py`
- `backend-api/services/finance_service.py`

#### 3. Access/policy layer

Losse policies voor:

- section access
- action access
- KB write/read
- MSP read/write

Aanbevolen:

- `backend-api/access/policies.py`
- `backend-api/access/session_access.py`

#### 4. Storage/repository layer

Voor database-reads en writes:

- `backend-api/repos/customers.py`
- `backend-api/repos/tenants.py`
- `backend-api/repos/jobs.py`
- `backend-api/repos/approvals.py`
- `backend-api/repos/kb.py`

## Refactorvolgorde

### Fase 1. Stabiliseren zonder gedrag te wijzigen

Doel:

- eerst structuur winnen zonder UI of API-contract te breken

Aanpak:

- verplaats generieke frontend helpers uit `dashboard.js` naar `shared`
- verplaats shellfuncties uit `dashboard.js` naar `shell`
- laat bestaande functies tijdelijk re-exporteren zodat oude calls blijven werken
- maak in de backend eerst een dunne route-dispatchlaag bovenop bestaande logica

Concreet eerst doen:

- `apiFetch`, `apiFetchCached`, cache invalidation
- notificaties
- context rail renderers
- role/access helpers

Succescriterium:

- de portal werkt hetzelfde
- `dashboard.js` verliest de eerste 15-20% aan generieke code

### Fase 2. MSP Admin uit `dashboard.js` trekken

Doel:

- MSP Admin als echt eigen domein behandelen

Aanpak:

- verplaats:
  - `loadMspControlCenter`
  - `loadKlantenbeheer`
  - `loadGoedkeuringen`
  - `loadKostenSection`
  - `loadJobMonitor`
  - `loadRolesTab`
- maak één centrale `msp/index.js` die submodules registreert

Concreet:

- `frontend-frontend-portal/js/msp/control-center.js`
- `frontend-frontend-portal/js/msp/customers.js`
- `frontend-frontend-portal/js/msp/approvals.js`
- `frontend-frontend-portal/js/msp/jobs.js`
- `frontend-frontend-portal/js/msp/roles-access.js`
- `frontend-frontend-portal/js/msp/billing.js`

Succescriterium:

- alle MSP Admin schermen blijven werken
- `dashboard.js` verliest de zwaarste beheerlogica

### Fase 3. HTML-shell opdelen

Doel:

- [frontend-portal/dashboard.html](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-frontend-portal/dashboard.html) kleiner en veiliger maken om te onderhouden

Aanpak:

- splits markup logisch op in:
  - shell/nav
  - overview
  - hubs
  - MSP Admin
  - settings
  - knowledge base
- als partials nog te zwaar zijn, gebruik dan ten minste `<template>` blokken of server-side include-achtige opbouw

Concreet:

- `frontend-frontend-portal/partials/nav.html`
- `frontend-frontend-portal/partials/overview.html`
- `frontend-frontend-portal/partials/msp-admin.html`
- `frontend-frontend-portal/partials/settings.html`

Succescriterium:

- minder DOM-rommel in één document
- duidelijkere ownership per scherm

### Fase 4. Backend opdelen per domein

Doel:

- businesslogica uit [backend-api/app.py](/Users/demac/Downloads/Denjoy-it-site-main-2/backend-api/app.py) halen

Aanpak:

- begin met read-heavy en MSP-zware stukken:
  - customers
  - control center
  - finance
  - jobs
  - approvals
- laat `app.py` tijdelijk alleen routeren

Concreet eerst doen:

- `get_customer_health`
- `get_customer_onboarding_summary`
- `get_customer_finance_summary`
- `get_msp_control_center_payload`
- approval/job routes

Succescriterium:

- `app.py` wordt hoofdzakelijk route dispatcher
- servicefuncties zijn los testbaar

### Fase 5. Router en sectieregister moderniseren

Doel:

- de `showSection()`-groei afremmen

Aanpak:

- maak een `SECTION_REGISTRY`
- laat elke sectie een kleine loader exporteren
- `showSection()` kiest alleen nog een module en geeft context door

Voorbeeld:

```javascript
const SECTION_REGISTRY = {
  overview: { load: loadOverviewSection, group: 'dashboard' },
  klantenbeheer: { load: loadCustomersSection, group: 'msp' },
  goedkeuringen: { load: loadApprovalsSection, group: 'msp' },
};
```

Succescriterium:

- nieuwe secties hoeven niet meer in één grote switch te landen

### Fase 6. Data- en capabilitylaag standaardiseren

Doel:

- alle werkruimtes laten werken met hetzelfde capability- en bronstatusmodel

Aanpak:

- normaliseer per tenant/module:
  - `source_status`
  - `capability_status`
  - `supports_live`
  - `supports_snapshot`
  - `write_supported`
- gebruik dit model in overview, hubs, MSP admin en live modules

Succescriterium:

- consistente meldingen op alle pagina’s
- minder handgemaakte uitzonderingen

### Fase 7. Kennisbank en operations nauwer koppelen

Doel:

- KB, bevindingen, onboarding en MSP Admin als één operationele keten laten werken

Aanpak:

- standaard crosslinks toevoegen tussen:
  - klanten
  - tenants
  - app registraties
  - findings
  - runbooks
  - approvals
  - jobs
- maak hiervoor een kleine relation-helperlaag

Succescriterium:

- gebruikers hoeven minder te springen tussen losse schermen

## Praktische aanbeveling voor de eerstvolgende sprint

Als we dit slim willen aanpakken, zou ik de volgende sprint niet te breed maken.

Beste eerste sprint:

1. `shared/api.js` en `shared/cache.js` uit `dashboard.js` halen
2. `shell/access.js` en `shell/router.js` uit `dashboard.js` halen
3. `msp/control-center.js` en `msp/customers.js` los trekken
4. `backend-api/services/customer_service.py` en `backend-api/services/msp_control_center_service.py` introduceren

Dat geeft meteen winst op:

- leesbaarheid
- testbaarheid
- uitbreidbaarheid
- regressierisico

zonder dat we meteen de hele portal moeten herbouwen.

## Wat ik expliciet niet adviseer

- de menu-structuur volledig omgooien
- alles herschrijven naar een nieuw framework terwijl de huidige portal al functioneel breed is
- eerst nieuwe features blijven stapelen bovenop de huidige monolieten
- security naar voren trekken als dat de huidige refactor vertraagt, zolang dit nog lokale testfase is

## Eindadvies

De portal is inhoudelijk goed georganiseerd voor een MSP.

Mijn advies is daarom:

- **niet** opnieuw nadenken over de informatiearchitectuur
- **wel** nu doelgericht de technische architectuur eronder refactoren

Kort gezegd:

- de UX-structuur behouden
- de code-structuur opsplitsen
- `MSP Admin` en `Control Center` als eerste technische domeinen losmaken
- daarna pas verder bouwen op die nieuwe basis
