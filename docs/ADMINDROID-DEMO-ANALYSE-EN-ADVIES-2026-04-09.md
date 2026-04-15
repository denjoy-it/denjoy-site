# AdminDroid Demo Analyse en Advies voor Denjoy Portal

Datum: 9 april 2026

## Doel

Deze notitie vertaalt de sterke punten uit de publieke AdminDroid demo en officiële featurecommunicatie naar een praktisch advies voor Denjoy Portal.

De centrale vraag is:

- wat voegt AdminDroid inhoudelijk toe
- welke onderdelen zijn zinvol voor Denjoy
- welke onderdelen passen juist minder goed bij de Denjoy-richting als MSP control plane

## Korte conclusie

AdminDroid is sterk in:

- zeer brede rapportage
- klikbare drilldowns vanuit dashboards
- alerting en follow-up
- delegatie van beheeracties
- planning, scheduling en operationele opvolging

Denjoy is in de huidige architectuur al sterker gepositioneerd op:

- MSP control-plane denken
- tenantcontext
- capability-status
- live versus snapshot-bronlogica
- onboarding, jobs en approvals als operationeel model

Daarom is het advies:

- neem de beste operationele UX-principes van AdminDroid over
- neem niet de volledige report-catalogus of generieke breedte over
- versterk Denjoy vooral op actiegedreven dashboards, saved views, delegatie, reminders en cross-tenant prioritering

## Wat AdminDroid duidelijk goed doet

### 1. Van rapport naar actie

AdminDroid behandelt rapportages niet alleen als managementoutput, maar als startpunt voor beheeracties. Het sterke patroon is:

- een getal of signaal in dashboard
- klik naar gefilterde detailweergave
- van daaruit opvolgen, exporteren of delegeren

Voor Denjoy is dit relevant omdat de portal al veel signaaldata heeft, maar de laatste stap van inzicht naar vaste operator-flow nog verder kan worden aangescherpt.

### 2. Veel drilldowns zonder contextverlies

AdminDroid maakt het gemakkelijk om van een totaalbeeld naar een concrete subset te gaan, bijvoorbeeld:

- mailbox issues
- MFA-uitzonderingen
- verdachte aanmeldingen
- gebruikers of groepen met afwijkingen

Die manier van werken is waardevol voor operators omdat je niet eerst zelf filters hoeft te bouwen.

### 3. Delegatie en rolafbakening

Een belangrijk sterk punt is dat AdminDroid beheer en opvolging niet alleen voor globale admins ontwerpt, maar ook voor gedelegeerde of beperkte rollen.

Dat is exact relevant voor Denjoy, omdat een MSP-portal in de praktijk niet kan leunen op alleen `admin` of brede roltoegang.

### 4. Alerting, reminders en follow-up

AdminDroid maakt van signalering een proces:

- afwijking detecteren
- alert genereren
- herinnering of follow-up plannen
- opvolging zichtbaar maken

Voor Denjoy is dit belangrijk omdat jullie portal al jobs, approvals en actions kent, maar nog sterker kan worden in automatische opvolgpatronen.

### 5. Cross-tenant beheerdenken

De waarde van AdminDroid zit niet alleen in tenantinzichten, maar ook in centrale beheersbaarheid over meerdere omgevingen heen.

Dat sluit goed aan op Denjoy als MSP control plane.

## Wat Denjoy al heeft dat goed aansluit

De bestaande codebase laat zien dat veel fundament al aanwezig is.

Relevante onderdelen:

- overzicht en aanbevelingen in [frontend-portal/js/msp/overview.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-portal/js/msp/overview.js)
- tenant health cockpit in [frontend-portal/js/msp/tenant-health.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-portal/js/msp/tenant-health.js)
- servicehub in [frontend-portal/js/msp/services-hub.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-portal/js/msp/services-hub.js)
- rollen en toegang in [frontend-portal/js/msp/roles-access.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-portal/js/msp/roles-access.js)
- jobmonitor in [frontend-portal/js/msp/jobs.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-portal/js/msp/jobs.js)
- approvals in [frontend-portal/js/msp/approvals.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-portal/js/msp/approvals.js)
- MSP control center in [frontend-portal/js/msp/control-center.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-portal/js/msp/control-center.js)

Ook de documentatie zit inhoudelijk op dezelfde lijn:

- [docs/MSP-PORTAL-GAP-ANALYSIS-2026-04-01.md](/Users/demac/Downloads/Denjoy-it-site-main-2/docs/MSP-PORTAL-GAP-ANALYSIS-2026-04-01.md)
- [docs/DENJOY-MSP-CONTROL-PLANE-BLUEPRINT.md](/Users/demac/Downloads/Denjoy-it-site-main-2/docs/DENJOY-MSP-CONTROL-PLANE-BLUEPRINT.md)
- [docs/Fase 5: Frontend-Architectuur en Gebruikersinterface.md](/Users/demac/Downloads/Denjoy-it-site-main-2/docs/Fase%205:%20Frontend-Architectuur%20en%20Gebruikersinterface.md)

## Advies voor Denjoy

## Must Have

### 1. Klikbare operator-drilldowns op alle kernkaarten

Doel:

- elk dashboardcijfer moet naar een directe, gefilterde werkweergave leiden

Voorbeelden:

- `3 gebruikers zonder MFA` opent direct de relevante lijst
- `5 failed jobs` opent jobmonitor gefilterd op tenant en status
- `snapshot-only capabilities` opent tenant/capabilitydetail
- `kritieke bevindingen` opent actielijst of findingsweergave

Waarom dit prioriteit heeft:

- dit geeft meteen AdminDroid-achtige bruikbaarheid
- dit verhoogt operationele snelheid zonder nieuwe enginebouw

Beste landingsplek:

- overview
- tenant health
- control center

### 2. Saved views en vaste filtersets

Doel:

- operators hoeven niet steeds dezelfde filters opnieuw op te bouwen

Aanbevolen saved views:

- tenants met kritieke bevindingen
- tenants met mislukte jobs
- tenants zonder auth-ready status
- snapshot-only tenants
- MFA-uitzonderingen
- appregistraties met risico of expiratie

Waarom dit belangrijk is:

- dit maakt dashboards dagelijks bruikbaar
- dit vertaalt rapportage naar werkvoorraad

### 3. Fijnmazige delegatie per klant, module en actie

Doel:

- toegang niet alleen op gebruikersniveau, maar op werkelijke MSP-scope

Minimaal nodig:

- `view`
- `operate`
- `approve`
- `billing`
- `onboarding`
- `security`

Extra advies:

- voeg een duidelijke matrix toe: gebruiker of rol -> klant -> module -> actie
- voeg een `view as` of `effective access preview` toe in rollenbeheer

Beste startpunt:

- [frontend-portal/js/msp/roles-access.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-portal/js/msp/roles-access.js)

### 4. Alerting en reminders koppelen aan jobs en approvals

Doel:

- signalen automatisch omzetten in opvolgbare processen

Voorbeelden:

- mislukte job langer dan x uur open -> reminder
- approval ouder dan x dagen -> escalatie
- onboarding blijft onder drempel -> taak voor engineer
- capability verandert van live naar fallback -> attentiesignaal

Waarom dit sterk toevoegt:

- dit maakt Denjoy meer proactief
- dit verlaagt handmatige controlelast

Beste startpunt:

- [frontend-portal/js/msp/jobs.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-portal/js/msp/jobs.js)
- [frontend-portal/js/msp/approvals.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-portal/js/msp/approvals.js)

## Should Have

### 5. Cross-tenant exception center

Doel:

- niet alleen dashboards tonen, maar een centrale uitzonderingsweergave voor de hele MSP-operatie

Inhoud:

- top risico-tenants
- tenants met onboardingblokkades
- tenants met auth-issues
- tenants met open approvals
- tenants met stale data of alleen snapshots

Waarom:

- AdminDroid is sterk in centrale zichtbaarheid
- Denjoy kan dit beter doen door capability-status, onboarding en jobs samen te brengen

Beste landingsplek:

- [frontend-portal/js/msp/control-center.js](/Users/demac/Downloads/Denjoy-it-site-main-2/frontend-portal/js/msp/control-center.js)

### 6. Actiefeed per tenant

Doel:

- één chronologische operatorfeed met:
- scans
- approvals
- jobs
- configuratiewijzigingen
- onboardingevents

Waarom:

- operators begrijpen sneller wat er net gebeurd is
- dit voorkomt contextwissels tussen modules

### 7. Slimme aanbevelingen met vaste playbooks

Doel:

- aanbevelingen niet alleen tonen, maar standaard vervolgstappen aanbieden

Voorbeeld:

- `MFA coverage laag` -> open identitylijst, maak taak, vraag approval, plan refresh
- `Guardian sync failed` -> open jobdetail, plan retry, wijs eigenaar toe

Jullie overview heeft hier al een basis voor; dat kan verder worden geformaliseerd.

## Later

### 8. Rapportbibliotheek uitbreiden, maar selectief

Advies:

- niet proberen om AdminDroid in rapportbreedte te evenaren
- alleen rapporten toevoegen die direct bijdragen aan MSP-werkprocessen

Goede kandidaten:

- executive samenvatting per klant
- operations exceptions rapport
- onboarding readiness rapport
- capability readiness rapport

Niet direct nodig:

- grote catalogus met tientallen losse statistiekrapporten zonder operationele follow-up

### 9. Bulkacties alleen waar workflow en audit al kloppen

AdminDroid laat zien dat bulkbeheer waardevol kan zijn, maar voor Denjoy moet dit pas komen wanneer:

- rechtenmodel klopt
- approvals goed werken
- audittrail volledig is

Dus:

- eerst governance en workflow
- daarna bulk write-acties

## Wat ik niet zou overnemen

### 1. Een gigantische report-catalogus

Dat maakt Denjoy snel breed maar minder scherp.

Denjoy moet eerder sturen op:

- wat vraagt aandacht
- wat moet nu gebeuren
- wie is eigenaar
- wat blokkeert voortgang

### 2. Rapport-first in plaats van control-plane-first

AdminDroid komt van oorsprong sterk uit rapportage. Denjoy moet vasthouden aan de control-plane richting:

- tenantcontext
- capability context
- bronstatus
- actionability

### 3. Overmatige functionele breedte buiten propositie

Bijvoorbeeld brede on-prem AD-management-ambitie zou de focus kunnen verdunnen als dat geen kern van Denjoy wordt.

## Aanbevolen roadmapvolgorde

### Fase 1

- klikbare drilldowns op overview, tenant health en control center
- saved views voor operatorflows
- extra filter- en routingpatronen naar bestaande modules

### Fase 2

- fijnmazige rol- en actiematrix
- effective access preview
- reminders en escalaties op jobs, approvals en onboarding

### Fase 3

- cross-tenant exception center
- tenant activity feed
- gestandaardiseerde playbooks per aanbeveling

### Fase 4

- selectieve operationele rapporten
- bulkacties voor goed afgebakende use cases

## Praktisch eindoordeel

Ja, er zijn duidelijke onderdelen uit AdminDroid die Denjoy Portal sterker maken.

De grootste toegevoegde waarde zit niet in meer rapportpagina's, maar in:

- snellere drilldown
- betere delegatie
- saved views
- reminders en opvolging
- centrale uitzonderingssturing over alle tenants heen

Dat past goed bij de huidige Denjoy-richting en versterkt precies de gebieden waar de portal van "goed inzichtelijk" naar "dagelijks operationeel onmisbaar" kan groeien.

## Bronnen

- AdminDroid demo homepage, versie-informatie en releasedatum: https://demo.admindroid.com/
- AdminDroid newsroom over alerting: https://admindroid.com/newsroom/admindroid-announces-alerting-capability-to-safeguard-microsoft365-infrastructures
- Denjoy code en documentatie in deze repository
