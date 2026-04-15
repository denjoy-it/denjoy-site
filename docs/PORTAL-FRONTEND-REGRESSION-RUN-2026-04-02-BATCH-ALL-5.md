# Portal Frontend Regression Run (Batch All 5) — 2026-04-02

## Scope

Uitvoering van 5 onderdelen in een doorlopende batch:
1. Checklist-gedreven regressiecontrole (automatische subset)
2. Low-risk cleanup in doelmodules
3. Verdere helper-centralisatie voor section/optional async patronen
4. Runtime route checks op kritieke dashboard routes
5. Eindronde diagnostics + smoke check

## Aangepaste bestanden

- frontend-frontend-portal/js/msp/action-dispatch.js
- frontend-frontend-portal/js/msp/onboarding.js
- frontend-frontend-portal/js/msp/results-sections.js
- frontend-frontend-portal/js/msp/refresh-orchestration.js

## Wijzigingen

### 1) action-dispatch.js
- Toegevoegd: `invokeIfFn()` helper.
- Replaced: directe optional-chain calls in switch dispatch met helper-aanroepen.
- Doel: consistente veilige call-dispatch zonder functionele wijziging.

### 2) onboarding.js
- Toegevoegd: `optionalTask()` helper.
- Replaced: meerdere `Promise.allSettled([global.fn?.(), ...])` patronen met expliciete optional task invocations.
- Doel: consistente async orchestration en duidelijkere intent.

### 3) results-sections.js
- Toegevoegd: `invokeIfFn()` helper.
- Replaced: directe `bindActions(...)` call met helper call.
- Doel: klein robustness-patroon in lijn met overige modules.

### 4) refresh-orchestration.js
- Toegevoegd: `getCurrentSection()` helper.
- Toegevoegd: `optionalTask()` helper.
- Replaced: task-opbouw voor refresh-flow met helper-gebaseerde optional async invocations.
- Doel: centrale section-resolutie en uniforme optional async handling.

## Regressiecontrole (automatische subset)

### Route checks
- GET /frontend-frontend-portal/dashboard.html
- GET /frontend-frontend-portal/dashboard.html#overview
- GET /frontend-frontend-portal/dashboard.html#results
- GET /frontend-frontend-portal/dashboard.html#kb
- GET /frontend-frontend-portal/dashboard.html#mspcontrolcenter

Resultaat: alle routes laden en tonen "Tenant Command Center" content.

### Checklist-markers in dashboard.html
- tenantSelect
- tenantPill / tenantPillDropdown
- resultsTabbar
- overviewRefreshButton
- mspccRefreshBtn
- kbhRefreshBtn
- rolesRefreshBtn

Resultaat: alle markers aanwezig.

### Actie-binding referenties
- selectTenantPill, viewRun, deleteRun, cancelJob

Resultaat: bindings aanwezig in module templates.

## Eindvalidatie

### Diagnostics
Geen fouten in:
- frontend-frontend-portal/js/msp/action-dispatch.js
- frontend-frontend-portal/js/msp/onboarding.js
- frontend-frontend-portal/js/msp/results-sections.js
- frontend-frontend-portal/js/msp/refresh-orchestration.js
- frontend-frontend-portal/dashboard.html

### Backend smoke
Command: `backend-api/smoke_check.py --base-url http://127.0.0.1:8787`
Resultaat: geslaagd, exit code 0.

## Opmerking

Volledige handmatige UI-interactie (klikken/tabwissels in live browser) is niet automatisch af te dekken met de beschikbare toolset in deze batch; daarom is een geautomatiseerde regressie-subset uitgevoerd plus volledige syntax/runtime/smoke-validatie.
