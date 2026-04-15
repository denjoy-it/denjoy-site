# Portal Frontend Regression Checklist (2026-04-02)

Doel: snelle, herhaalbare controle na module-refactors in het portal.

## 1) Basis bereikbaarheid

- Open: `/frontend-frontend-portal/dashboard.html`
- Verwacht:
  - Pagina laadt zonder blank screen.
  - Titel en hoofdnavigatie zichtbaar.
  - Geen directe JavaScript-fout in console tijdens initialisatie.

## 2) Bootstrap en kernflow

- Actie:
  - Hard refresh uitvoeren.
  - Controleren dat default sectie opent.
- Verwacht:
  - Tenant-overzicht zichtbaar.
  - Context rail rendert.
  - Mobile menu toggle werkt op smalle viewport.

## 3) Tenant selectie

- Actie:
  - Wissel tenant via header pill dropdown.
  - Wissel tenant via `tenantSelect` dropdown.
- Verwacht:
  - Hero verdwijnt zodra tenant geselecteerd is.
  - Context en overview cards verversen.
  - Tenant management tabel blijft consistent.

## 4) Overview en aanbevelingen

- Actie:
  - Ga naar Overzicht.
  - Controleer service cards + aanbevelingen.
- Verwacht:
  - Cards tonen fallback of live data zonder crash.
  - Aanbeveling-knoppen geven geen JS-fout.
  - Snelle routes blijven klikbaar.

## 5) Results tabflow

- Actie:
  - Open sectie Resultaten.
  - Klik tabbar: Viewer, Acties, Beheer, Vergelijking.
- Verwacht:
  - Tab state wisselt correct.
  - Geen DOM/functie-fouten op panel switch.
  - Diff panel toont lege/fallback-state of data.

## 6) Hub tegels

- Actie:
  - Open elke hub: People, Security, Collab, Devices, Assessment.
  - Klik meerdere hub tiles.
- Verwacht:
  - Navigatie springt naar juiste sectie/subtab.
  - Meta pills renderen zonder JS errors.

## 7) Knowledge Base subnavigatie

- Actie:
  - Open KB en wissel tabs (overview/assets/vlans/pages/...)
- Verwacht:
  - Subnav labels correct.
  - Telling badges (indien aanwezig) renderen zonder fout.

## 8) MSP operator secties

- Actie:
  - Open MSP Control Center, Goedkeuringen, Jobmonitor, Kosten.
- Verwacht:
  - Tabellen/panels renderen.
  - Filterknoppen en refresh-acties reageren.

## 9) Settings

- Actie:
  - Open Settings tabs: Tenant, Rollen, Algemeen.
  - Test tenant create/update flow met validatie.
- Verwacht:
  - Validatiefouten tonen nette toast.
  - Na succesvolle save wordt data herladen.

## 10) Rolafhankelijke zichtbaarheid

- Actie:
  - Test met admin en non-admin sessie.
- Verwacht:
  - Restricted nav-items tonen/verbergen correct.
  - Geen verboden acties zichtbaar voor niet-toegestane rollen.

## 11) Snelle technische checks

- Local checks in VS Code:
  - `get_errors` op:
    - `frontend-frontend-portal/js/dashboard.js`
    - `frontend-frontend-portal/js/msp/portal-config.js`
    - `frontend-frontend-portal/js/msp/nav-bootstrap.js`
    - `frontend-frontend-portal/js/msp/hub-sections.js`
    - `frontend-frontend-portal/dashboard.html`
- Endpoint smoke:
  - `python3 smoke_check.py --base-url http://127.0.0.1:8787`

## 12) Exit criteria

- Geen compile/syntax errors in bovengenoemde bestanden.
- Dashboard route laadt stabiel.
- Tenant switch + results tabflow + hub tile navigatie werken zonder regressie.
- Geen blocker console errors tijdens primaire user journey.
