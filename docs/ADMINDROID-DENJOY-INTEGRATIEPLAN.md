# ADMINDROID-DENJOY-INTEGRATIEPLAN

## Samenvatting

Dit plan beschrijft hoe Denjoy geselecteerde waardevolle controles en rapporten uit de AdminDroid-/PowerShell-richting kan opnemen zonder losse scripts direct aan de UI te hangen. De kern is een vaste lagenarchitectuur:

1. `Scriptlaag` voor tenant-aware dataverzameling
2. `Normalisatielaag` voor een Denjoy-datamodel
3. `API-laag` voor live + snapshot endpoints
4. `UI-laag` voor weergave in het bestaande Denjoy-patroon

Doel is dat nieuwe security-, governance- en collaborationdata overal op dezelfde manier zichtbaar wordt in de portal: signaalbalk, insight-cards, werkkaarten en detailrail.

## Uitvoeringsstatus (2026-04-10)

- [x] Centrale control-contractlaag met uniforme JSON-structuur (`ok`, `source`, `captured_at`, `summary`, `items`, `errors`).
- [x] 12 v1-controls geïmplementeerd in backend control service.
- [x] Tenant-aware auth-afdwinging voor live acties (geen stille verkeerde-tenant fallback).
- [x] Exchange controls gekoppeld aan werkkaarten, filters en detailrail (`forwarding`, `inboxregels`, `mailboxrechten`).
- [x] Teams/SharePoint controls gekoppeld aan live modules met detailrails.
- [x] Security Center / Compliance & Maturity hergroepeerd in navigatie.
- [x] Responsive verbetering `Documentatie` hoofdstuk (breedte, grid, kaartschaling).
- [x] Hard delete tenant robuust gemaakt (transactioneel + lock retry + FK-veilige volgorde).
- [x] Geautomatiseerde control-matrix smoke toegevoegd (`backend-api/tests/control_matrix_smoke.py`) voor 12 controls over `live`, `snapshot` en `strict_live` contract-validatie.
- [x] Uniforme verdiepte detailrail-opbouw voor alle resterende modules op hetzelfde niveau als `Gebruikers & Licenties`.
- [x] Alerts/reminders/opvolgstatus productierijp gemaakt in Alerts-werkruimte (`Opvolging` tab, SLA-tellingen, status-updates, handmatige opvolgactie, CSRF-veilige writes).

## Implementatieplan

### 1. Centrale integratie-architectuur

- Voeg een vaste integratiecontractlaag toe voor externe of afgeleide controles.
- Elke controle krijgt:
  - een unieke `control_key`
  - een `domain` zoals `identity`, `exchange`, `teams`, `sharepoint`, `apps`, `domains`, `security`
  - een `mode`: `live`, `snapshot`, `hybrid`
  - een vaste JSON-uitvoer
- Gebruik een Denjoy-normalisatieformaat voor alle nieuwe controles:
  - `status`
  - `severity`
  - `title`
  - `summary`
  - `affected_objects`
  - `recommended_action`
  - `source`
  - `captured_at`
  - `control_key`
  - `tenant_id`
  - `category`
  - `evidence`
- Laat scripts nooit direct HTML of CSV aan de portal leveren; HTML/CSV blijft optioneel exportmateriaal, JSON is de primaire bron.

### 2. Scriptlaag

- Bouw per geselecteerd script een Denjoy-wrapper in de assessment-engine of serviceslaag.
- Iedere wrapper accepteert vaste input:
  - `tenant_id`
  - `auth_context`
  - `strict_live`
  - optionele filters
- Iedere wrapper geeft alleen een voorspelbare objectstructuur terug.
- Voeg timeouts, duidelijke foutcodes en fallbackgedrag toe.
- Laat wrappers expliciet tenant-aware authenticatie gebruiken:
  - altijd de appregistratie van de geselecteerde tenant
  - geen stille globale fallback
- Splits scripts functioneel op in:
  - `inventory controls`
  - `risk controls`
  - `governance controls`
  - `activity controls`

### 3. Shortlist v1 controles

Implementeer eerst deze 12 controles, omdat ze direct passen in de huidige Denjoy-informatiearchitectuur:

#### Identiteit & Toegang

- `admin-role-membership`
  - alle privileged rollen en leden
  - landt in `Beheerdersrollen`
- `break-glass-accounts`
  - detectie en status van noodaccounts
  - landt in `Beheerdersrollen` of nieuwe subkaart `Break-glass`
- `guest-user-governance`
  - gasten, externe accounts, dormant guests
  - landt in `Gebruikers & Licenties > Gastgebruikers`
- `app-secrets-and-certs`
  - verlopen of bijna verlopende secrets/certificaten
  - landt in `Gekoppelde Apps`

#### Toegangsbeleid

- `ca-policy-export`
  - volledige CA-policy details
  - landt in `Toegangsbeleid`
- `legacy-auth-exposure`
  - policies / gebruikers met legacy auth risico
  - landt in `Toegangsbeleid` en `Security Center`

#### E-mail & Samenwerking

- `mail-forwarding-detection`
  - externe forwarding
  - landt in `E-mail & Postvakken`
- `inbox-rule-risk-detection`
  - verdachte inboxregels
  - landt in `E-mail & Postvakken`
- `mailbox-permission-governance`
  - full access / send-as / send-on-behalf
  - landt in `E-mail & Postvakken`
- `teams-with-guests`
  - Teams met gasten of externen
  - landt in `Microsoft Teams`
- `sharepoint-sharing-risk`
  - externe deling / anonieme links
  - landt in `Bestanden & Sites`

#### Beveiliging & Naleving

- `domain-mail-auth`
  - SPF/DKIM/DMARC status
  - landt in `Security Center`

### 4. Mapping naar portalhoofdstukken

#### Gebruikers & Licenties

- Voeg binnen dezelfde werkruimte subweergaven toe voor:
  - `Gebruikersoverzicht`
  - `Licentieoverzicht`
  - `Gastgebruikers`
- Laat nieuwe guest governance-data de bestaande kaarten, filters en detailrail voeden.
- Werkkaartpatroon:
  - `Gebruikerslijst`
  - `Gastgebruikers`
  - `Licentiegebruik`
  - `Provisioninggeschiedenis`

#### Toegangsbeleid

- Gebruik deze werkruimte voor alles rond Conditional Access.
- Voeg nieuwe gegevens toe als:
  - policy inventory
  - report-only policies
  - legacy auth exposure
  - trusted locations
- Detailrail toont:
  - policyvoorwaarden
  - betrokken gebruikers/apps
  - grant/session controls
  - aanbevolen actie

#### Gekoppelde Apps

- Gebruik deze werkruimte voor:
  - app secrets
  - certificaten
  - risky app registrations
  - consent signalen
- Voeg filters toe:
  - `Verloopt binnenkort`
  - `Verlopen`
  - `Breed geconsent`
  - `Privileged`

#### E-mail & Postvakken

- Gebruik exact hetzelfde patroon als `Gebruikers & Licenties`.
- Werkkaarten:
  - `Mailboxoverzicht`
  - `Doorsturen`
  - `Inboxregels`
  - `Mailboxrechten`
- Insight-cards:
  - `Alle mailboxen`
  - `Doorsturen actief`
  - `Verdachte regels`
  - `Mailboxrechten met risico`
- Detailrail toont:
  - mailboxinformatie
  - forwarding
  - inboxregels
  - delegaties
  - aanbevolen actie

#### Microsoft Teams

- Werkkaarten:
  - `Teams-overzicht`
  - `Teams met gasten`
  - `Externe toegang`
  - `Archivering / inactiviteit`
- Detailrail toont:
  - team-eigenaren
  - gastgebruikers
  - kanaaltype
  - inactiviteit
  - aanbevolen vervolgactie

#### Bestanden & Sites

- Werkkaarten:
  - `Sites-overzicht`
  - `Externe deling`
  - `Anonieme links`
  - `Sites met verhoogd risico`
- Detailrail toont:
  - site-eigenaren
  - sharing policy
  - guest links
  - aanbevelingen

#### Security Center

- Gebruik deze werkruimte voor operationele signalering.
- Werkkaarten:
  - `Beveiligingsscore`
  - `Openstaande risico’s`
  - `Verouderde login`
  - `Domeinen & mailsecurity`
- Nieuwe controles voeden direct previewinhoud in werkkaarten, niet alleen doorverwijzingen.

### 5. API- en backendwijzigingen

- Voeg per control een backendservice of wrapperroute toe.
- Gebruik per control twee modi:
  - `live`
  - `snapshot`
- Voeg centrale normalisatiehelpers toe in backend/services of routes.
- Elke route retourneert:
  - `ok`
  - `source`
  - `captured_at`
  - `items`
  - `summary`
  - `errors`
- Gebruik consistente fouttypen:
  - `auth_missing`
  - `auth_mismatch`
  - `permission_missing`
  - `live_unavailable`
  - `data_partial`
- Laat snapshotimport deze nieuwe controltypes ook persistent opslaan zodat assessmentresultaten en live data dezelfde UI kunnen voeden.

### 6. UI-standaard

- Nieuwe data moet altijd in het bestaande Denjoy-patroon landen.
- Geen nieuwe losse paginaformats toevoegen.
- Per hoofdstuk:
  - titel + acties
  - signal bar
  - compacte insight-cards
  - uitklapbare werkkaarten
  - detailrail rechts
- Gebruik overal dezelfde semantiek:
  - groen = `In orde`
  - oranje = `Aandacht`
  - rood = `Actie nodig`
  - grijs = `Niet beschikbaar`
- Laat iedere nieuwe werkkaart echte previewinhoud tonen, niet alleen knoppen.
- Voeg actieve filters en tellers toe:
  - bijvoorbeeld `12 van 265 mailboxen`
  - `4 van 18 admins`
- Zorg dat alles responsive blijft op desktop, laptop en smallere breedtes.

### 7. Prioritering

#### Fase 1

- `mail-forwarding-detection`
- `inbox-rule-risk-detection`
- `ca-policy-export`
- `guest-user-governance`
- `app-secrets-and-certs`

#### Fase 2

- `mailbox-permission-governance`
- `teams-with-guests`
- `sharepoint-sharing-risk`
- `legacy-auth-exposure`
- `break-glass-accounts`

#### Fase 3

- `admin-role-membership`
- verdieping van explorer/detailrails
- alerts/reminders/opvolgstatus

## Interfaces en datacontracten

### Control output contract

Elke control levert minimaal:

```json
{
  "ok": true,
  "control_key": "mail-forwarding-detection",
  "tenant_id": "uuid",
  "source": "live",
  "captured_at": "2026-04-09T08:00:00Z",
  "summary": {
    "total": 12,
    "warning": 3,
    "critical": 1
  },
  "items": [
    {
      "status": "warning",
      "severity": "medium",
      "title": "Mailbox forwarding extern",
      "summary": "forwarding naar extern domein",
      "affected_objects": ["user@tenant.nl"],
      "recommended_action": "controleer forwarding en bevestig legitimiteit",
      "category": "exchange",
      "evidence": {}
    }
  ],
  "errors": []
}
```

### UI mapping contract

- `summary` voedt insight-cards
- `items` voedt werkkaarten/tabellen
- objectvelden voeden detailrail
- `source` en `captured_at` worden zichtbaar in UI

## Testplan

### Backend

- matrix-check commando: `python3 backend-api/tests/control_matrix_smoke.py`
- controle per tenant gebruikt alleen die tenant-authconfig
- ontbrekende authconfig geeft expliciete fout
- live en snapshot output hebben hetzelfde shape
- partial data breekt route niet
- permissionsfouten worden duidelijk teruggegeven

### Frontend

- elke nieuwe control rendert in bestaande hoofdstukken zonder nieuw layouttype
- filters werken op nieuwe datasets
- detailrail opent voor nieuwe objecttypes
- bronlabels tonen correct `Live data`, `Assessment` of `Snapshot`
- tenantwissel reset state correct

### Integratie

- geselecteerde tenant A gebruikt tenant A appregistratie
- geselecteerde tenant B gebruikt tenant B appregistratie
- mailbox-, guest- en CA-data landen in juiste werkruimtes
- assessmentsnapshot voedt dezelfde werkkaarten als live data
- lange tabellen en detailvelden blijven responsive

## Aannames en defaults

- Documentlocatie voor dit plan: `docs/ADMINDROID-DENJOY-INTEGRATIEPLAN.md`
- `Conditional Access` blijft onder `Identiteit & Toegang`
- `Security Center` blijft de operationele securitywerkruimte
- `Compliance & Maturity` blijft voor CIS/Zero Trust en soortgelijke normering
- Code uit externe repos wordt niet blind overgenomen; logica wordt herschreven of gewrapt naar Denjoy-standaard
- Externe scripts worden pas letterlijk hergebruikt als licentie en onderhoudsrisico duidelijk zijn
