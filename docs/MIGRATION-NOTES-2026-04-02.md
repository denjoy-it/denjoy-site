# Migration Notes - Repository Reorganisatie (2 april 2026)

Dit document vat de structuurmigratie samen en geeft een snelle referentie voor ontwikkelaars en operations.

## Doel

De repository is heringericht naar een duidelijkere structuur voor MSP-doorontwikkeling, zonder functionele regressie in de bestaande kernflow.

## Oude naar nieuwe paden

| Oud | Nieuw | Opmerking |
|---|---|---|
| `backend/` | `backend-api/` | Python backend + storage |
| `portal/` | `frontend-portal/` | Ingelogde portal frontend |
| `assessment/` | `assessment-engine/` | PowerShell assessment engine |
| root html/css/js | `frontend-site/` | Publieke website |
| `backend/storage/config.json` | `backend-api/storage/config.json` | Runtime/config pad |

## Belangrijkste code-aanpassingen

- Runtime padverwijzingen in backend zijn aangepast naar de nieuwe mapnamen.
- Default webpad is aangepast naar `frontend-portal`.
- File serving voor site/assessment templates wijst nu naar `frontend-site` en `assessment-engine`.
- Deploy scripts en setup-documentatie gebruiken de nieuwe mapnamen.

## Team-impact

### Voor developers

- Start backend vanuit: `backend-api/`
- Smoke check script staat in: `backend-api/smoke_check.py`
- Portal assets staan in: `frontend-portal/`
- Publieke site assets staan in: `frontend-site/`

### Voor deployment

- Script en systemd-referenties zijn gemigreerd naar `backend-api`, `frontend-portal`, `assessment-engine`.
- Config reset scripts schrijven nu naar `backend-api/storage/config.json`.

## Snelle validatie

```bash
python3 /pad/naar/repo/backend-api/app.py
python3 /pad/naar/repo/backend-api/smoke_check.py --base-url http://127.0.0.1:8787
```

## Controlelijst

- [ ] Geen operationele scripts verwijzen nog naar oude paden.
- [ ] Lokale backend start vanaf `backend-api/app.py`.
- [ ] Portal laadt via de nieuwe frontend-mapstructuur.
- [ ] Assessment scripts draaien vanuit `assessment-engine`.

## Scope

Deze migratie-notitie is bedoeld als snelle referentie. Diepere architectuur- en roadmapdetails blijven in de bestaande documentatie onder `docs/`.
