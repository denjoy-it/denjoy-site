"""
Denjoy IT Platform — Snapshot Service
Extracts and transforms assessment snapshot data for the API layer.
"""
from __future__ import annotations

import copy
import json
import re
import threading
import time
import html as html_lib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from db_layer import (
    db_fetchone,
    db_execute,
    db_fetchall,
    RUNS_DIR,
    STORAGE_DIR,
    PLATFORM_DIR,
    CAPABILITY_MATRIX_PATH,
    SKU_FRIENDLY_MAP_PATH,
    now_iso,
)

# ── Module-level state (mirrors app.py module-level globals) ──

_memo_cache: Dict[str, Tuple[float, Any]] = {}
_memo_lock = threading.Lock()
_sku_friendly_map_cache: Optional[Dict[str, str]] = None
_request_context = threading.local()


# ── Internal helpers ──────────────────────────────────────────


def _get_request_cache() -> Dict[str, Any]:
    """Haal request-scoped cache op (één per thread/request)."""
    if not hasattr(_request_context, "cache"):
        _request_context.cache = {}
    return _request_context.cache


def _memo_get(key: str) -> Any:
    with _memo_lock:
        entry = _memo_cache.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if time.time() >= expires_at:
            _memo_cache.pop(key, None)
            return None
        return copy.deepcopy(value)


def _memo_set(key: str, value: Any, ttl_seconds: float) -> Any:
    with _memo_lock:
        _memo_cache[key] = (time.time() + max(float(ttl_seconds), 0.1), copy.deepcopy(value))
    return value


def _memo_drop_prefix(prefix: str) -> None:
    with _memo_lock:
        for key in [key for key in _memo_cache.keys() if key.startswith(prefix)]:
            _memo_cache.pop(key, None)


def _load_sku_friendly_map() -> Dict[str, str]:
    global _sku_friendly_map_cache
    if _sku_friendly_map_cache is not None:
        return _sku_friendly_map_cache
    try:
        data = json.loads(SKU_FRIENDLY_MAP_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            _sku_friendly_map_cache = {str(k): str(v) for k, v in data.items()}
        else:
            _sku_friendly_map_cache = {}
    except Exception:
        _sku_friendly_map_cache = {}
    return _sku_friendly_map_cache


def get_sku_friendly_name(raw: str) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    friendly_map = _load_sku_friendly_map()
    return friendly_map.get(value) or friendly_map.get(value.upper()) or value


# ── File finders ─────────────────────────────────────────────


def find_latest_report_file(run_dir: Path) -> Optional[Path]:
    def _safe_mtime(path: Path) -> float:
        try:
            return path.stat().st_mtime
        except (FileNotFoundError, OSError):
            return -1.0

    files = sorted(
        [p for p in run_dir.glob("M365-Complete-Baseline-*.html") if _safe_mtime(p) >= 0],
        key=_safe_mtime,
        reverse=True,
    )
    if files:
        # Prefer a timestamped report over the convenience "latest" copy/symlink
        for f in files:
            if "latest" not in f.name.lower():
                return f
        return files[0]
    demo = sorted(
        [p for p in run_dir.glob("*.html") if _safe_mtime(p) >= 0],
        key=_safe_mtime,
        reverse=True,
    )
    return demo[0] if demo else None


def list_run_html_files(run_dir: Path) -> List[Dict[str, str]]:
    """Geeft HTML-bestanden in de run-directory terug."""
    result = []
    for f in sorted(run_dir.glob("M365-Complete-Baseline-*.html")):
        if "latest" not in f.name.lower():
            result.append({"name": f.stem, "path": f.name})
            break
    return result


def find_latest_summary_file(run_dir: Path) -> Optional[Path]:
    snap_dir = run_dir / "_snapshots"
    if not snap_dir.exists():
        return None

    def _safe_mtime(path: Path) -> float:
        try:
            return path.stat().st_mtime
        except (FileNotFoundError, OSError):
            return -1.0

    latest = snap_dir / "M365-Complete-Baseline-latest.summary.json"
    files = sorted(
        [p for p in snap_dir.glob("*.summary.json") if _safe_mtime(p) >= 0],
        key=_safe_mtime,
        reverse=True,
    )
    if files:
        for f in files:
            if "latest" not in f.name.lower():
                return f
        return files[0]
    if latest.exists():
        return latest
    return None


def find_latest_json_manifest_file(run_dir: Path) -> Optional[Path]:
    json_dir = run_dir / "json"
    manifest = json_dir / "manifest.json"
    if manifest.exists():
        return manifest
    return None


def _safe_json_load(path: Path) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _load_assessment_json_payloads(run_dir: Path) -> Dict[Tuple[str, str], Dict[str, Any]]:
    manifest_file = find_latest_json_manifest_file(run_dir)
    if not manifest_file:
        return {}
    manifest = _safe_json_load(manifest_file)
    payloads: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for item in manifest.get("files") or []:
        if not isinstance(item, dict):
            continue
        section = str(item.get("section") or "").strip().lower()
        subsection = str(item.get("subsection") or "").strip().lower()
        relative = str(item.get("relative") or "").strip()
        if not section or not subsection or not relative:
            continue
        payload_file = (manifest_file.parent / relative).resolve()
        if not payload_file.exists():
            continue
        payload = _safe_json_load(payload_file)
        if payload:
            payloads[(section, subsection)] = payload
    return payloads


def _assessment_json_payload(snapshot: Dict[str, Any], section: str, subsection: str) -> Optional[Dict[str, Any]]:
    payloads = snapshot.get("assessment_json_payloads") or {}
    return payloads.get(((section or "").strip().lower(), (subsection or "").strip().lower()))


def _payload_value(item: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    if not isinstance(item, dict):
        return default
    for key in keys:
        if key in item and item.get(key) not in (None, ""):
            return item.get(key)
    return default


# ── JSON phase definitions ────────────────────────────────────

JSON_PHASE_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "number": 1,
        "id": "phase1",
        "nav_label": "Identiteit",
        "title": "Phase 1: Users, Licensing & Security Basics",
        "pairs": [("gebruikers", "users"), ("gebruikers", "licenses"), ("identity", "mfa")],
    },
    {
        "number": 2,
        "id": "phase2",
        "nav_label": "Samenwerking",
        "title": "Phase 2: Collaboration & Storage",
        "pairs": [("teams", "teams"), ("sharepoint", "sharepoint-sites"), ("sharepoint", "sharepoint-settings"), ("backup", "onedrive"), ("exchange", "mailboxes")],
    },
    {
        "number": 3,
        "id": "phase3",
        "nav_label": "Compliance",
        "title": "Phase 3: Compliance & Security Policies",
        "pairs": [("ca", "policies"), ("apps", "registrations")],
    },
    {
        "number": 4,
        "id": "phase4",
        "nav_label": "Advanced Security",
        "title": "Phase 4: Advanced Security & Compliance",
        "pairs": [("alerts", "secure-score"), ("alerts", "audit-logs"), ("identity", "admin-roles")],
    },
    {
        "number": 5,
        "id": "phase5",
        "nav_label": "Intune",
        "title": "Phase 5: Intune Configuration",
        "pairs": [("intune", "summary"), ("intune", "devices"), ("intune", "compliance"), ("intune", "config")],
    },
    {
        "number": 6,
        "id": "phase6",
        "nav_label": "Azure",
        "title": "Phase 6: Azure Infrastructure",
        "pairs": [("azure", "subscriptions"), ("azure", "resources"), ("azure", "alerts")],
    },
]


def _run_json_manifest_path(run_dir: Path) -> Optional[str]:
    manifest = find_latest_json_manifest_file(run_dir)
    if not manifest:
        return None
    rel = manifest.relative_to(run_dir).as_posix()
    return f"/reports/{run_dir.name}/{rel}"


def _build_json_phase_summary(payloads: List[Dict[str, Any]]) -> str:
    if not payloads:
        return "Geen JSON-payloads beschikbaar."
    labels = [str(p.get("label") or f"{p.get('section')}/{p.get('subsection')}") for p in payloads if isinstance(p, dict)]
    if len(labels) == 1:
        return f"1 onderdeel beschikbaar: {labels[0]}."
    return f"{len(labels)} onderdelen beschikbaar: {', '.join(labels[:3])}{' …' if len(labels) > 3 else ''}."


_get_run_fn: Optional[Any] = None  # Set by app.py: snapshot_service._get_run_fn = get_run
_get_build_capability_status_fn: Optional[Any] = None  # Set by app.py: snapshot_service._get_build_capability_status_fn = _build_capability_status
_get_load_config_fn: Optional[Any] = None  # Set by app.py: snapshot_service._get_load_config_fn = load_config


def _assessment_json_report_for_run(run_id: str) -> Dict[str, Any]:
    get_run = _get_run_fn
    run = get_run(run_id) if get_run else None  # type: ignore[misc]
    if not run:
        raise ValueError("Run niet gevonden")
    run_dir = RUNS_DIR / run_id
    payloads = _load_assessment_json_payloads(run_dir)
    if not payloads:
        return {"ok": False, "error": "Geen assessment JSON beschikbaar voor deze run"}
    manifest_path = _run_json_manifest_path(run_dir)
    snapshot = _latest_assessment_snapshot_for_tenant(run["tenant_id"])
    generated_at = None
    if manifest_path:
        manifest_file = find_latest_json_manifest_file(run_dir)
        manifest = _safe_json_load(manifest_file) if manifest_file else {}
        generated_at = manifest.get("generated_at")
    phases = []
    for phase_def in JSON_PHASE_DEFINITIONS:
        phase_payloads = []
        for section, subsection in phase_def["pairs"]:
            payload = payloads.get((section, subsection))
            if payload:
                phase_payloads.append(payload)
        if not phase_payloads:
            continue
        score = None
        if phase_def["number"] == 1:
            score = snapshot.get("mfa_coverage")
        elif phase_def["number"] == 4:
            score = snapshot.get("secure_score_percentage")
        phase_items = 0
        for payload in phase_payloads:
            phase_items += len(payload.get("items") or [])
        phases.append({
            "id": phase_def["id"],
            "number": phase_def["number"],
            "navLabel": phase_def["nav_label"],
            "renderLabel": phase_def["title"],
            "summary": _build_json_phase_summary(phase_payloads),
            "score": score,
            "critical": 0,
            "warning": 0,
            "info": phase_items,
            "payloads": phase_payloads,
        })
    return {
        "ok": True,
        "run_id": run_id,
        "tenant_id": run.get("tenant_id"),
        "tenant_name": run.get("tenant_name"),
        "customer_name": run.get("customer_name"),
        "generated_at": generated_at or snapshot.get("assessment_generated_at") or run.get("completed_at") or run.get("started_at"),
        "manifest_path": manifest_path,
        "phases": phases,
    }


def _assessment_nav_sort_key(section: str, subsection: str) -> Tuple[int, int, str]:
    for phase in JSON_PHASE_DEFINITIONS:
        for idx, pair in enumerate(phase["pairs"]):
            if pair == (section, subsection):
                return (phase["number"], idx, f"{section}:{subsection}")
    return (999, 999, f"{section}:{subsection}")


def _assessment_portal_target(section: str, subsection: str) -> Optional[Dict[str, Any]]:
    section_key = (section or "").strip().lower()
    subsection_key = (subsection or "").strip().lower()

    if section_key == "gebruikers":
        tab_map = {
            "users": ("gbTab", "gebruikers"),
            "licenses": ("gbTab", "licenties"),
            "history": ("gbTab", "geschiedenis"),
        }
        mapped = tab_map.get(subsection_key)
        if mapped:
            return {"section": "gebruikers", "tab_type": mapped[0], "tab_key": mapped[1]}
        return {"section": "gebruikers"}

    if section_key == "ca":
        tab_map = {
            "policies": ("caTab", "policies"),
            "named-locations": ("caTab", "locations"),
            "history": ("caTab", "geschiedenis"),
        }
        mapped = tab_map.get(subsection_key)
        if mapped:
            return {"section": "ca", "tab_type": mapped[0], "tab_key": mapped[1]}
        return {"section": "ca"}

    if section_key in {"teams", "sharepoint", "identity", "apps"}:
        return {"section": section_key, "tab_type": "liveTab", "tab_key": subsection_key}

    if section_key == "domains":
        tab_map = {
            "domains-list": "domains-list",
            "domains-analyse": "domains-analyse",
        }
        if subsection_key in tab_map:
            return {"section": "domains", "tab_type": "liveTab", "tab_key": tab_map[subsection_key]}
        return {"section": "domains"}

    if section_key == "exchange":
        tab_map = {
            "mailboxes": "mailboxen",
            "forwarding": "forwarding",
            "mailbox-rules": "regels",
        }
        if subsection_key in tab_map:
            return {"section": "exchange", "tab_type": "liveTab", "tab_key": tab_map[subsection_key]}
        return {"section": "exchange"}

    if section_key == "intune":
        tab_map = {
            "summary": "overzicht",
            "devices": "apparaten",
            "compliance": "compliance",
            "config": "configuratie",
            "history": "geschiedenis",
        }
        if subsection_key in tab_map:
            return {"section": "intune", "tab_type": "liveTab", "tab_key": tab_map[subsection_key]}
        return {"section": "intune"}

    if section_key == "backup":
        tab_map = {
            "summary": "overzicht",
            "onedrive": "onedrive",
            "exchange": "exchange",
            "sharepoint": "sharepoint",
            "history": "geschiedenis",
        }
        if subsection_key in tab_map:
            return {"section": "backup", "tab_type": "liveTab", "tab_key": tab_map[subsection_key]}
        return {"section": "backup"}

    if section_key == "alerts":
        tab_map = {
            "audit-logs": "auditlog",
            "secure-score": "securescr",
            "sign-ins": "signins",
            "notifications": "config",
        }
        if subsection_key in tab_map:
            return {"section": "alerts", "tab_type": "liveTab", "tab_key": tab_map[subsection_key]}
        return {"section": "alerts"}

    return None


def _assessment_item_coverage(tenant_id: str, section: str, subsection: str) -> Dict[str, Any]:
    target = _assessment_portal_target(section, subsection)
    capability = None
    try:
        fn = _get_build_capability_status_fn  # injected by app.py
        capability = fn(tenant_id, section, subsection) if fn else None
    except Exception:
        capability = None

    if capability:
        status = str(capability.get("status") or "unknown")
        if target and status in {"ready", "validation_required", "config_required"}:
            bucket = "live_workspace"
            bucket_label = "Live in portal"
            detail = capability.get("status_reason") or "Deze dataset heeft een portal-workspace met live connector."
        elif target and status == "snapshot_only":
            bucket = "snapshot_workspace"
            bucket_label = "Snapshot in portal"
            detail = capability.get("status_reason") or "Dit onderdeel gebruikt assessmentdata in plaats van live data."
        elif not target and bool(capability.get("supports_live")):
            bucket = "live_backend_only"
            bucket_label = "Live connector, workspace ontbreekt"
            detail = "De backend/capability is aanwezig, maar er is nog geen aparte workspace in de portal."
        elif status == "snapshot_only":
            bucket = "snapshot_only"
            bucket_label = "Alleen snapshot"
            detail = capability.get("status_reason") or "Dit onderdeel is nu alleen beschikbaar vanuit assessmentdata."
        else:
            bucket = "not_available"
            bucket_label = capability.get("status_label") or "Nog niet gekoppeld"
            detail = capability.get("status_reason") or "Dit onderdeel vraagt nog extra bouw of configuratie."
        return {
            "bucket": bucket,
            "bucket_label": bucket_label,
            "detail": detail,
            "workspace_available": bool(target),
            "open_target": target,
            "capability": capability,
        }

    return {
        "bucket": "report_only",
        "bucket_label": "Alleen rapport",
        "detail": "Dit onderdeel is wel in de assessment-output gevonden, maar nog niet gekoppeld aan een capability-profiel of workspace.",
        "workspace_available": bool(target),
        "open_target": target,
        "capability": None,
    }


def _format_assessment_json_cell(value: Any) -> str:
    if value in (None, ""):
        return "—"
    if isinstance(value, list):
        if not value:
            return "—"
        parts = []
        for item in value:
            if isinstance(item, dict):
                label = item.get("displayName") or item.get("DisplayName") or item.get("userPrincipalName") or item.get("UserPrincipalName")
                parts.append(str(label or json.dumps(item, ensure_ascii=False)))
            else:
                parts.append(str(item))
        return ", ".join(parts)
    if isinstance(value, dict):
        label = value.get("displayName") or value.get("DisplayName") or value.get("userPrincipalName") or value.get("UserPrincipalName")
        return str(label or json.dumps(value, ensure_ascii=False))
    return str(value)


def _rows_from_json_payload(payload: Dict[str, Any]) -> Tuple[List[str], List[Dict[str, str]]]:
    items = payload.get("items") or []
    if not isinstance(items, list) or not items:
        return ([], [])
    columns: List[str] = []
    for item in items:
        if isinstance(item, dict):
            for key in item.keys():
                if key not in columns:
                    columns.append(str(key))
    rows: List[Dict[str, str]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        row = {str(column): _format_assessment_json_cell(item.get(column)) for column in columns}
        rows.append(row)
    return (columns, rows)


def _cards_from_json_summary(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    summary = payload.get("summary") or {}
    if not isinstance(summary, dict):
        return []
    cards = []
    for key, value in summary.items():
        if value in (None, ""):
            continue
        cards.append({"label": str(key), "value": _format_assessment_json_cell(value), "tone": "default"})
    return cards[:8]


# ── Stats extraction ──────────────────────────────────────────


def extract_stats_from_summary(path: Path) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    totals = data.get("Totals") or {}
    metrics = data.get("Metrics") or {}
    licenses = data.get("Licenses") or []
    app_registrations = data.get("AppRegistrations") or []
    domain_dns_checks = data.get("DomainDnsChecks") or []
    licenses_total = sum(int(item.get("Total") or 0) for item in licenses if isinstance(item, dict))
    licenses_used = sum(int(item.get("Consumed") or 0) for item in licenses if isinstance(item, dict))
    return {
        "tenantName": data.get("TenantName"),
        "tenantId": data.get("TenantId"),
        "reportId": data.get("AssessmentId"),
        "reportDate": data.get("GeneratedAt"),
        "criticalIssues": totals.get("Critical", 0),
        "warnings": totals.get("Warning", 0),
        "infoItems": totals.get("Info", 0),
        "scoreOverall": totals.get("Score"),
        "mfaCoverage": metrics.get("MfaCoveragePct"),
        "usersWithoutMFA": metrics.get("MfaMissing"),
        "caPolicies": metrics.get("CAEnabled"),
        "secureScorePercentage": metrics.get("SecureScorePct"),
        "licenses": licenses,
        "licensesTotal": licenses_total,
        "licensesUsed": licenses_used,
        "appRegistrations": app_registrations,
        "domainDnsChecks": domain_dns_checks,
    }


def extract_stats_from_html(path: Path) -> Dict[str, Any]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return {}
    stats: Dict[str, Any] = {}
    patterns = {
        "totalUsers": r"Totaal Gebruikers</div></div></div><div class='stat-card'><div class='stat-number'>(\d+)</div>"  # not reliable
    }
    tenant_match = re.search(r"tenant-name['\"]>\s*([^<]+)</", html, re.I)
    if tenant_match:
        stats["tenantName"] = tenant_match.group(1).strip()
    score_pct = re.search(r"Overall Score</h3>\s*<p class=['\"]stat-value['\"]>(\d+)%</p>", html, re.I)
    if score_pct:
        stats["secureScorePercentage"] = int(score_pct.group(1))
    return stats


def parse_run_stats(run_dir: Path) -> Dict[str, Any]:
    s = find_latest_summary_file(run_dir)
    if s:
        data = extract_stats_from_summary(s)
        if data:
            return data
    r = find_latest_report_file(run_dir)
    if r:
        return extract_stats_from_html(r)
    return {}


# ── HTML parsers ──────────────────────────────────────────────


def _parse_license_overview_from_html(path: Path) -> List[Dict[str, Any]]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []
    pattern = re.compile(
        r'<h3 class="heading-25">([^<]+)</h3>\s*'
        r'<div class="alert alert-info alert-info-soft">\s*'
        r'<strong>Totaal:</strong>\s*(\d+)\s*&nbsp;\s*\|\s*&nbsp;\s*'
        r'<strong>Gebruikt:</strong>\s*(\d+)\s*&nbsp;\s*\|\s*&nbsp;\s*'
        r'<strong>Beschikbaar:</strong>\s*(\d+)\s*&nbsp;\s*\|\s*&nbsp;\s*'
        r'<strong>Benutting:</strong>\s*([\d.]+)%',
        re.I,
    )
    licenses: List[Dict[str, Any]] = []
    for sku, total, consumed, available, utilization in pattern.findall(html):
        licenses.append({
            "SkuPartNumber": sku.strip(),
            "Total": int(total),
            "Consumed": int(consumed),
            "Available": int(available),
            "Utilization": float(utilization),
        })
    return licenses


def _parse_license_assignments_from_html(path: Path) -> Dict[str, List[Dict[str, str]]]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return {}

    section_match = re.search(
        r"<h2 class=\"section-title\">.*?Licentie Overzicht</h2>(.*?)</div>\s*<div class=\"section section-advice-panel\">",
        html,
        re.I | re.S,
    )
    if not section_match:
        return {}
    section_html = section_match.group(1)

    assignments: Dict[str, List[Dict[str, str]]] = {}
    block_pattern = re.compile(
        r'<h3 class="heading-25">([^<]+)</h3>\s*'
        r'<div class="alert alert-info alert-info-soft">.*?</div>\s*'
        r'(?:<div class="table-container">\s*<table>.*?<tbody>(.*?)</tbody>\s*</table></div>|<p class=[\'"]text-muted-italic mb-20[\'"]>Geen gebruikers toegewezen aan deze licentie\.</p>)',
        re.I | re.S,
    )
    for sku_name, rows_html in block_pattern.findall(section_html):
        rows: List[Dict[str, str]] = []
        for upn, display_name in re.findall(r"<tr><td>([^<]+)</td><td>([^<]+)</td></tr>", rows_html or "", re.I):
            rows.append({
                "UserPrincipalName": upn.strip(),
                "DisplayName": display_name.strip(),
            })
        for alias in _license_key_aliases(sku_name.strip()):
            assignments[alias] = rows
    return assignments


def _parse_app_registration_alerts_from_html(path: Path) -> List[Dict[str, Any]]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []
    pattern = re.compile(
        r"<tr class='appreg-row[^']*'><td class='cell-pad-strong'>([^<]+)</td><td class='cell-pad-muted'>([^<]+)</td>"
        r"<td class='cell-pad'><strong>(\d+) secret\(s\)</strong><br><span class='perm-resource-title'>([^<]+)</span>(?:<br><span class='text-muted-sm2'>([^<]+)</span>)?</td>"
        r"<td class='cell-pad'><strong>(\d+) cert\(s\)</strong><br><span class='perm-resource-title'>([^<]+)</span>(?:<br><span class='text-muted-sm2'>([^<]+)</span>)?</td>",
        re.I,
    )
    items: List[Dict[str, Any]] = []
    for match in pattern.findall(html):
        display_name, created, secret_count, secret_status, secret_date, cert_count, cert_status, cert_date = match
        items.append({
            "DisplayName": display_name.strip(),
            "CreatedDateTime": created.strip(),
            "SecretCount": int(secret_count),
            "SecretExpirationStatus": secret_status.strip(),
            "SecretExpiration": secret_date.strip() if secret_date else None,
            "CertificateCount": int(cert_count),
            "CertificateExpirationStatus": cert_status.strip(),
            "CertificateExpiration": cert_date.strip() if cert_date else None,
        })
    return items


def _parse_domain_dns_checks_from_html(path: Path) -> List[Dict[str, Any]]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []
    match = re.search(
        r"DNS Records \(SPF/DKIM/DMARC\)</h3><div class='table-container'><table[^>]*>.*?<tbody>(.*?)</tbody></table>",
        html,
        re.I | re.S,
    )
    if not match:
        return []
    body = match.group(1)
    rows = re.findall(r"<tr><td>([^<]+)</td><td>([^<]+)</td><td>([^<]+)</td><td>([^<]+)</td></tr>", body, re.I)
    return [{"Domain": d.strip(), "SPF": spf.strip(), "DMARC": dmarc.strip(), "DKIM": dkim.strip()} for d, spf, dmarc, dkim in rows]


def _parse_user_mailboxes_from_html(path: Path) -> List[Dict[str, Any]]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []
    match = re.search(
        r"User Mailboxes \(\d+\)</h3><div class='table-search-wrap'>.*?<tbody>(.*?)</tbody></table>",
        html,
        re.I | re.S,
    )
    if not match:
        return []
    body = match.group(1)
    rows = re.findall(r"<tr><td>([^<]+)</td><td>([^<]+)</td><td>([^<]+)</td></tr>", body, re.I)
    result = []
    for email, display_name, created in rows:
        result.append({
            "PrimarySmtpAddress": email.strip(),
            "DisplayName": display_name.strip(),
            "WhenCreated": created.strip(),
        })
    return result


def _parse_shared_mailboxes_from_html(path: Path) -> List[Dict[str, Any]]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []
    match = re.search(
        r"Shared Mailboxes \(\d+\)</h3><div class='table-search-wrap'>.*?<tbody>(.*?)</tbody></table>",
        html,
        re.I | re.S,
    )
    if not match:
        return []
    body = match.group(1)
    rows = re.findall(r"<tr><td>([^<]+)</td><td>([^<]+)</td><td>([^<]+)</td><td>([^<]+)</td><td>([^<]+)</td><td>([^<]+)</td></tr>", body, re.I)
    result = []
    for email, display_name, full_access, send_as, send_on_behalf, created in rows:
        result.append({
            "PrimarySmtpAddress": email.strip(),
            "DisplayName": display_name.strip(),
            "FullAccessCount": int(re.sub(r"[^\d]", "", full_access or "") or "0"),
            "SendAsCount": int(re.sub(r"[^\d]", "", send_as or "") or "0"),
            "SendOnBehalfCount": int(re.sub(r"[^\d]", "", send_on_behalf or "") or "0"),
            "WhenCreated": created.strip(),
        })
    return result


def _parse_teams_from_html(path: Path) -> List[Dict[str, Any]]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []
    match = re.search(
        r"Microsoft Teams \(\d+\)</h3>.*?<tbody>(.*?)</tbody></table>",
        html,
        re.I | re.S,
    )
    if not match:
        return []
    body = match.group(1)
    result: List[Dict[str, Any]] = []
    for row_html in re.findall(r"<tr>(.*?)</tr>", body, re.I | re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.I | re.S)
        if len(cells) < 4:
            continue
        mail = _strip_html_fragment(cells[0])
        display_name = _strip_html_fragment(cells[1])
        member_count_raw = _strip_html_fragment(cells[2])
        created = _strip_html_fragment(cells[3])
        try:
            member_count = int(re.sub(r"[^\d]", "", member_count_raw) or "0")
        except Exception:
            member_count = 0
        result.append({
            "id": mail or display_name,
            "mail": mail,
            "displayName": display_name or mail,
            "memberCount": member_count,
            "createdAt": created or None,
            "visibility": None,
            "ownerCount": 0,
            "isDynamic": False,
        })
    return result


def _parse_sharepoint_sites_from_html(path: Path) -> List[Dict[str, Any]]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []
    match = re.search(
        r"Top 10 Grootste Sites</h4>.*?<tbody>(.*?)</tbody></table>",
        html,
        re.I | re.S,
    )
    if not match:
        return []
    body = match.group(1)
    result: List[Dict[str, Any]] = []
    for row_html in re.findall(r"<tr>(.*?)</tr>", body, re.I | re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.I | re.S)
        if len(cells) < 4:
            continue
        site_html, storage_html, status_html, modified_html = cells[:4]
        url_match = re.search(r"href=['\"]([^'\"]+)['\"]", site_html, re.I)
        result.append({
            "id": url_match.group(1).strip() if url_match else _strip_html_fragment(site_html),
            "displayName": _strip_html_fragment(site_html),
            "webUrl": url_match.group(1).strip() if url_match else None,
            "storageUsed": None,
            "storageLabel": f"{_strip_html_fragment(storage_html)} GB" if _strip_html_fragment(storage_html) else "—",
            "lastModified": _strip_html_fragment(modified_html) or None,
            "status": _strip_html_fragment(status_html) or None,
        })
    return result


def _parse_onedrive_from_html(path: Path) -> List[Dict[str, Any]]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []
    match = re.search(
        r"Top 5 Grootste OneDrive Sites</h4>.*?<tbody>(.*?)</tbody></table>",
        html,
        re.I | re.S,
    )
    if not match:
        return []
    body = match.group(1)
    result: List[Dict[str, Any]] = []
    for row_html in re.findall(r"<tr>(.*?)</tr>", body, re.I | re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.I | re.S)
        if len(cells) < 3:
            continue
        owner_html, storage_html, modified_html = cells[:3]
        result.append({
            "driveId": _strip_html_fragment(owner_html),
            "ownerName": _strip_html_fragment(owner_html),
            "status": "assessment_snapshot",
            "storageGB": _strip_html_fragment(storage_html),
            "modified": _strip_html_fragment(modified_html) or None,
        })
    return result


def _parse_sharepoint_settings_from_html(path: Path) -> Dict[str, Any]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return {}
    match = re.search(
        r"SharePoint Tenant Sharing Settings</h4>.*?<tbody>(.*?)</tbody></table>",
        html,
        re.I | re.S,
    )
    if not match:
        return {}
    settings_rows = re.findall(r"<tr><td>(.*?)</td><td>(.*?)</td></tr>", match.group(1), re.I | re.S)
    mapped: Dict[str, Any] = {}
    for key_html, value_html in settings_rows:
        key = _strip_html_fragment(key_html).lower()
        value = _strip_html_fragment(value_html)
        if "external sharing capability" in key:
            mapped["sharingCapability"] = value
            mapped["guestSharingEnabled"] = value.lower() not in {"disabled", "uitgeschakeld", "nee"}
        elif "default link permission" in key:
            mapped["defaultLinkPermission"] = value
        elif "loop default sharing scope" in key:
            mapped["defaultSharingLinkType"] = value
    return mapped


def _strip_html_fragment(value: str) -> str:
    text = re.sub(r"<[^>]+>", "", value or "")
    return html_lib.unescape(text).strip()


def _friendly_license_name(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    text = re.sub(r"^MICROSOFT_", "", text, flags=re.I)
    text = re.sub(r"^STANDARD_", "", text, flags=re.I)
    text = re.sub(r"^PREMIUM_", "", text, flags=re.I)
    text = re.sub(r"_+", " ", text).strip().lower()
    return " ".join(part.capitalize() for part in text.split())


def _license_key_aliases(value: str) -> List[str]:
    raw = (value or "").strip()
    aliases: List[str] = []
    friendly = get_sku_friendly_name(raw)
    for candidate in [raw, raw.upper(), friendly, friendly.upper(), _friendly_license_name(raw), _friendly_license_name(raw).upper()]:
        if candidate and candidate not in aliases:
            aliases.append(candidate)
    return aliases


def _parse_user_overview_counts_from_html(path: Path) -> Dict[str, int]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return {}
    counts: Dict[str, int] = {}
    pattern = re.compile(
        r"stat-number[\"']>(\d+)</div>\s*<div class=['\"]stat-label['\"]>([^<]+)</div>",
        re.I,
    )
    label_map = {
        "totaal gebruikers": "total",
        "actieve gebruikers": "active",
        "uitgeschakelde gebruikers": "disabled",
        "guest gebruikers": "guest",
    }
    for number, label in pattern.findall(html):
        normalized = label.strip().lower()
        key = label_map.get(normalized)
        if key:
            counts[key] = int(number)
    return counts


def _parse_assessment_users_from_html(path: Path) -> List[Dict[str, Any]]:
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []

    overview_match = re.search(
        r"<h2 class=\"section-title\">.*?Gebruikers Overzicht</h2>(.*?)</div>\s*<!-- End Overview Section -->",
        html,
        re.I | re.S,
    )
    if not overview_match:
        return []
    overview_html = overview_match.group(1)

    users: List[Dict[str, Any]] = []

    def _extract_rows(section_label: str, enabled: bool) -> None:
        match = re.search(
            rf"{section_label}\s*\(\d+\)</h3>.*?<tbody>(.*?)</tbody>",
            overview_html,
            re.I | re.S,
        )
        if not match:
            return
        body = match.group(1)
        for row_html in re.findall(r"<tr>(.*?)</tr>", body, re.I | re.S):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.I | re.S)
            if len(cells) < 2:
                continue
            upn = _strip_html_fragment(cells[0])
            display_name = _strip_html_fragment(cells[1]) or upn
            last_sign_in = _strip_html_fragment(cells[3]) if len(cells) > 3 else None
            users.append({
                "id": upn or display_name,
                "displayName": display_name,
                "userPrincipalName": upn,
                "mail": upn,
                "accountEnabled": enabled,
                "createdDateTime": None,
                "department": None,
                "jobTitle": None,
                "lastSignIn": last_sign_in if last_sign_in and last_sign_in != "—" else None,
                "userType": "Guest" if "#ext#" in (upn or "").lower() else "Member",
            })

    _extract_rows("Actieve gebruikers", True)
    _extract_rows("Uitgeschakelde gebruikers", False)
    return users


def _valid_domain_dns_checks(items: Any) -> bool:
    if not isinstance(items, list) or not items:
        return False
    return any(isinstance(item, dict) and (item.get("Domain") or item.get("domain")) for item in items)


# ── Core snapshot functions ───────────────────────────────────


def _latest_completed_run_for_tenant(tid: str) -> Optional[Dict[str, Any]]:
    return db_fetchone(
        """
        SELECT * FROM assessment_runs
        WHERE tenant_id=? AND status='completed'
        ORDER BY is_archived ASC, COALESCE(completed_at, started_at) DESC
        LIMIT 1
        """,
        (tid,),
    )


def _latest_assessment_snapshot_for_tenant(tid: str) -> Dict[str, Any]:
    # Request-scoped cache (elimineer dupe werk binnen één HTTP request)
    cache = _get_request_cache()
    cache_key = f"snapshot:{tid}"
    if cache_key in cache:
        return cache[cache_key]

    run = _latest_completed_run_for_tenant(tid)
    if not run:
        cache[cache_key] = {}
        return {}
    run_dir = RUNS_DIR / run["id"]
    summary_file = find_latest_summary_file(run_dir)
    report_file = find_latest_report_file(run_dir)
    assessment_json_payloads = _load_assessment_json_payloads(run_dir)
    snapshot: Dict[str, Any] = {}
    if summary_file and summary_file.exists():
        try:
            snapshot = json.loads(summary_file.read_text(encoding="utf-8"))
        except Exception:
            snapshot = {}
    licenses = snapshot.get("Licenses") if isinstance(snapshot, dict) else None
    app_registrations = snapshot.get("AppRegistrations") if isinstance(snapshot, dict) else None
    domain_dns_checks = snapshot.get("DomainDnsChecks") if isinstance(snapshot, dict) else None
    user_mailboxes = snapshot.get("UserMailboxes") if isinstance(snapshot, dict) else None
    shared_mailboxes = snapshot.get("SharedMailboxes") if isinstance(snapshot, dict) else None
    teams = snapshot.get("Teams") if isinstance(snapshot, dict) else None
    assessment_users = None
    user_overview_counts = None
    license_assignments = None
    if not licenses and report_file and report_file.exists():
        licenses = _parse_license_overview_from_html(report_file)
    if not app_registrations and report_file and report_file.exists():
        app_registrations = _parse_app_registration_alerts_from_html(report_file)
    if (not _valid_domain_dns_checks(domain_dns_checks)) and report_file and report_file.exists():
        domain_dns_checks = _parse_domain_dns_checks_from_html(report_file)
    if not user_mailboxes and report_file and report_file.exists():
        user_mailboxes = _parse_user_mailboxes_from_html(report_file)
    if not shared_mailboxes and report_file and report_file.exists():
        shared_mailboxes = _parse_shared_mailboxes_from_html(report_file)
    if not teams and report_file and report_file.exists():
        teams = _parse_teams_from_html(report_file)
    if report_file and report_file.exists():
        assessment_users = _parse_assessment_users_from_html(report_file)
        user_overview_counts = _parse_user_overview_counts_from_html(report_file)
        license_assignments = _parse_license_assignments_from_html(report_file)
    users_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "gebruikers", "users")
    licenses_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "gebruikers", "licenses")
    teams_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "teams", "teams")
    sharepoint_sites_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "sharepoint", "sharepoint-sites")
    sharepoint_settings_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "sharepoint", "sharepoint-settings")
    onedrive_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "backup", "onedrive")
    ca_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "ca", "policies")
    apps_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "apps", "registrations")
    intune_summary_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "intune", "summary")
    intune_devices_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "intune", "devices")
    intune_compliance_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "intune", "compliance")
    intune_config_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "intune", "config")
    exchange_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "exchange", "mailboxes")
    alerts_score_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "alerts", "secure-score")
    alerts_audit_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "alerts", "audit-logs")
    identity_mfa_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "identity", "mfa")
    identity_admin_payload = _assessment_json_payload({"assessment_json_payloads": assessment_json_payloads}, "identity", "admin-roles")
    if not assessment_users and isinstance(users_payload, dict):
        assessment_users = users_payload.get("items") or []
    if not user_overview_counts and isinstance(users_payload, dict):
        user_overview_counts = users_payload.get("summary") or {}
    if not licenses and isinstance(licenses_payload, dict):
        licenses = licenses_payload.get("items") or []
    if not teams and isinstance(teams_payload, dict):
        teams = teams_payload.get("items") or []
    if not snapshot.get("SharePointSites") and isinstance(sharepoint_sites_payload, dict):
        snapshot["SharePointSites"] = sharepoint_sites_payload.get("items") or []
    if not snapshot.get("SharePointTenantSettings") and isinstance(sharepoint_settings_payload, dict):
        snapshot["SharePointTenantSettings"] = sharepoint_settings_payload.get("summary") or {}
    if not snapshot.get("Top5OneDriveBySize") and isinstance(onedrive_payload, dict):
        snapshot["Top5OneDriveBySize"] = onedrive_payload.get("items") or []
    if not snapshot.get("CAPolicies") and isinstance(ca_payload, dict):
        snapshot["CAPolicies"] = ca_payload.get("items") or []
    if not snapshot.get("AppRegistrations") and isinstance(apps_payload, dict):
        snapshot["AppRegistrations"] = apps_payload.get("items") or []
    if not snapshot.get("IntuneDevices") and isinstance(intune_devices_payload, dict):
        snapshot["IntuneDevices"] = intune_devices_payload.get("items") or []
    if not snapshot.get("IntuneCompliance") and isinstance(intune_compliance_payload, dict):
        snapshot["IntuneCompliance"] = intune_compliance_payload.get("items") or []
    if not snapshot.get("IntuneConfigProfiles") and isinstance(intune_config_payload, dict):
        snapshot["IntuneConfigProfiles"] = intune_config_payload.get("items") or []
    if not snapshot.get("UserMailboxes") and isinstance(exchange_payload, dict):
        snapshot["UserMailboxes"] = exchange_payload.get("items") or []
    metrics = snapshot.get("Metrics") if isinstance(snapshot, dict) else {}
    if isinstance(metrics, dict):
        if isinstance(identity_mfa_payload, dict):
            mfa_summary = identity_mfa_payload.get("summary") or {}
            if metrics.get("MfaCoveragePct") is None and mfa_summary.get("mfaCoveragePct") is not None:
                metrics["MfaCoveragePct"] = mfa_summary.get("mfaCoveragePct")
            if metrics.get("MfaMissing") is None and mfa_summary.get("usersWithoutMfa") is not None:
                metrics["MfaMissing"] = mfa_summary.get("usersWithoutMfa")
        if isinstance(ca_payload, dict):
            ca_summary = ca_payload.get("summary") or {}
            if metrics.get("CAEnabled") is None and ca_summary.get("enabled") is not None:
                metrics["CAEnabled"] = ca_summary.get("enabled")
        if isinstance(alerts_score_payload, dict):
            score_summary = alerts_score_payload.get("summary") or {}
            if metrics.get("SecureScorePct") is None and score_summary.get("percentage") is not None:
                metrics["SecureScorePct"] = score_summary.get("percentage")
    licenses = licenses or []
    app_registrations = app_registrations or []
    domain_dns_checks = domain_dns_checks or []
    user_mailboxes = user_mailboxes or []
    shared_mailboxes = shared_mailboxes or []
    teams = teams or []
    license_assignments = license_assignments or {}
    for item in licenses:
        if not isinstance(item, dict):
            continue
        sku = (item.get("SkuPartNumber") or "").strip()
        assigned_users: List[Dict[str, str]] = []
        for alias in _license_key_aliases(sku):
            if alias in license_assignments:
                assigned_users = license_assignments.get(alias, [])
                break
        item["AssignedUsers"] = assigned_users
    total = sum(int(item.get("Total") or 0) for item in licenses if isinstance(item, dict))
    used = sum(int(item.get("Consumed") or 0) for item in licenses if isinstance(item, dict))
    license_type = None
    if len(licenses) == 1 and isinstance(licenses[0], dict):
        license_type = licenses[0].get("displayName") or licenses[0].get("SkuPartNumber")
    elif licenses:
        license_type = f"{len(licenses)} licentietypen"
    mfa = None
    if isinstance(metrics, dict) and metrics.get("MfaCoveragePct") is not None:
        mfa = f"{metrics.get('MfaCoveragePct')}% dekking"
    snapshot_result = {
        "tenant_name": snapshot.get("TenantName") if isinstance(snapshot, dict) else None,
        "tenant_id": snapshot.get("TenantId") if isinstance(snapshot, dict) else None,
        "license_type": license_type,
        "licenses_total": total or None,
        "licenses_used": used or None,
        "mfa": mfa,
        "mfa_coverage": (metrics or {}).get("MfaCoveragePct"),
        "users_without_mfa": (metrics or {}).get("MfaMissing"),
        "ca_policies": (metrics or {}).get("CAEnabled"),
        "secure_score_percentage": (metrics or {}).get("SecureScorePct"),
        "conditional_access": int((metrics or {}).get("CAEnabled") or 0) > 0,
        "assessment_generated_at": snapshot.get("GeneratedAt") if isinstance(snapshot, dict) else None,
        "assessment_report_id": snapshot.get("AssessmentId") if isinstance(snapshot, dict) else None,
        "assessment_licenses": licenses,
        "assessment_app_registrations": app_registrations,
        "assessment_domain_dns_checks": domain_dns_checks,
        "assessment_user_mailboxes": user_mailboxes,
        "assessment_shared_mailboxes": shared_mailboxes,
        "assessment_teams": teams,
        "assessment_users": assessment_users or [],
        "assessment_user_counts": user_overview_counts or {},
        "assessment_license_assignments": license_assignments,
        "assessment_json_payloads": assessment_json_payloads,
        "assessment_json_identity_mfa": identity_mfa_payload or {},
        "assessment_json_identity_admin_roles": identity_admin_payload or {},
        "assessment_json_alerts_audit_logs": alerts_audit_payload or {},
    }

    # Cache per request
    cache = _get_request_cache()
    cache[f"snapshot:{tid}"] = snapshot_result
    return snapshot_result


def _snapshot_raw(tid: str) -> Dict[str, Any]:
    """Returns the full raw snapshot dict for the latest completed assessment run."""
    run = _latest_completed_run_for_tenant(tid)
    if not run:
        return {}
    run_dir = RUNS_DIR / run["id"]
    s = find_latest_summary_file(run_dir)
    data = _safe_json_load(s) if s and s.exists() else {}
    data["_assessment_json_payloads"] = _load_assessment_json_payloads(run_dir)
    return data if isinstance(data, dict) else {}


def _snapshot_raw_metrics(tid: str) -> Dict[str, Any]:
    """Returns the Metrics dict from the latest assessment snapshot, or {}."""
    return _snapshot_raw(tid).get("Metrics") or {}


def _sharepoint_storage_to_gb(value: Any) -> float:
    """Normaliseert storagewaarden uit live bytes of snapshot-GB naar GB."""
    if value in (None, "", "—"):
        return 0.0
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    # Live Graph-data komt in bytes terug; snapshotdata meestal al in GB.
    if number > 1024 * 1024 * 1024:
        return round(number / (1024 ** 3), 2)
    return round(number, 2)


def _build_sharepoint_capacity_summary(tid: str, sites: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Bouwt dezelfde quota/capaciteitssamenvatting als in het HTML-rapport."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    payload = _assessment_json_payload(snap, "sharepoint", "sharepoint-sites")
    payload_summary = payload.get("summary") if isinstance(payload, dict) else {}
    payload_summary = payload_summary if isinstance(payload_summary, dict) else {}
    site_items = [item for item in (sites or []) if isinstance(item, dict)]

    total_sites = int(payload_summary.get("totalSites") or len(site_items) or 0)
    inactive_sites = int(
        payload_summary.get("inactiveSites")
        or sum(1 for item in site_items if bool(item.get("isInactive")) or str(item.get("status") or "").lower() == "inactief")
    )
    sites_with_storage = int(
        payload_summary.get("sitesWithStorage")
        or sum(1 for item in site_items if _sharepoint_storage_to_gb(item.get("storageUsed")) > 0)
    )

    total_storage_used_gb = payload_summary.get("totalStorageUsedGB")
    if total_storage_used_gb in (None, ""):
        total_storage_used_gb = sum(_sharepoint_storage_to_gb(item.get("storageUsed")) for item in site_items)
    total_storage_used_gb = round(float(total_storage_used_gb or 0), 2)

    # Sum all consumed licenses across all SKUs (matches PowerShell report formula)
    licenses_total = int(snap.get("licenses_total") or sum(
        int(lic.get("Consumed") or 0) for lic in (snap.get("Licenses") or [])
    ) or 0)
    base_storage_gb = 1024
    storage_per_license_gb = 10
    bonus_storage_gb = 0
    total_capacity_gb = round(base_storage_gb + (licenses_total * storage_per_license_gb) + bonus_storage_gb, 2)
    storage_remaining_gb = round(total_capacity_gb - total_storage_used_gb, 2)
    storage_used_pct = round((total_storage_used_gb / total_capacity_gb) * 100, 1) if total_capacity_gb > 0 else 0.0
    avg_per_site_gb = round((total_storage_used_gb / sites_with_storage), 2) if sites_with_storage > 0 else 0.0

    capacity_label = f"{base_storage_gb} GB base + {licenses_total} licenses x {storage_per_license_gb} GB"
    if bonus_storage_gb > 0:
        capacity_label += f" + {round(bonus_storage_gb, 0)} GB bonus"

    return {
        "totalSites": total_sites,
        "inactiveSites": inactive_sites,
        "sitesWithStorage": sites_with_storage,
        "totalStorageUsedGB": total_storage_used_gb,
        "totalCapacityGB": total_capacity_gb,
        "storageRemainingGB": storage_remaining_gb,
        "storageUsedPct": storage_used_pct,
        "avgStoragePerSiteGB": avg_per_site_gb,
        "storageCapacityLabel": capacity_label,
        "storageQuotaFormula": "1 TB + (licenses x 10 GB)",
        "licenseUnitsForQuota": licenses_total,
    }


def _parse_iso_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _attach_source_meta(payload: Dict[str, Any], source: str = "live", generated_at: Optional[str] = None, tenant_id: Optional[str] = None) -> Dict[str, Any]:
    item = dict(payload or {})
    item["_source"] = source
    if generated_at is None and source == "assessment_snapshot" and tenant_id:
        generated_at = _latest_assessment_snapshot_for_tenant(tenant_id).get("assessment_generated_at")
    if generated_at is None and source == "live":
        generated_at = now_iso()
    if generated_at:
        item["_generated_at"] = generated_at
    if source == "assessment_snapshot":
        dt = _parse_iso_dt(generated_at)
        if dt is not None:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            age = datetime.now(timezone.utc) - dt.astimezone(timezone.utc)
            item["_stale"] = age > timedelta(minutes=30)
    else:
        item["_stale"] = False
    return item


# ── Snapshot-as-* transformation functions ───────────────────


def _snapshot_as_intune_summary(tid: str) -> Optional[Dict[str, Any]]:
    """Returns Intune summary from snapshot IntuneSummary + DevicesByOS, or None."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    payload = _assessment_json_payload(snap, "intune", "summary")
    if isinstance(payload, dict):
        summary = payload.get("summary") or {}
        by_os = {}
        for entry in payload.get("items") or []:
            if not isinstance(entry, dict):
                continue
            name = _payload_value(entry, "Name", "name", default="Unknown")
            count = int(_payload_value(entry, "Count", "count", default=0) or 0)
            by_os[str(name)] = {"total": count, "compliant": 0}
        return {
            "ok": True,
            "score": round(float(summary.get("compliancePercentage") or 0)),
            "total": int(summary.get("totalDevices") or 0),
            "compliantCount": int(summary.get("compliantDevices") or 0),
            "byOs": by_os,
            "_source": "assessment_snapshot",
        }
    raw = _snapshot_raw(tid)
    summary = raw.get("IntuneSummary") or {}
    if not summary:
        metrics = raw.get("Metrics") or {}
        pct = metrics.get("IntuneCompliancePct")
        if pct is None:
            return None
        return {"ok": True, "score": round(float(pct)), "total": 0, "compliantCount": 0, "byOs": {}, "_source": "assessment_snapshot"}
    total = int(summary.get("TotalDevices") or 0)
    compliant = int(summary.get("CompliantDevices") or 0)
    score = int(summary.get("CompliancePercentage") or 0)
    by_os_raw = raw.get("IntuneDevicesByOS") or []
    by_os = {}
    for entry in by_os_raw:
        if isinstance(entry, dict):
            name = entry.get("Name") or entry.get("name") or "Unknown"
            count = int(entry.get("Count") or entry.get("count") or 0)
            by_os[name] = {"total": count, "compliant": 0}
    return {"ok": True, "score": score, "total": total, "compliantCount": compliant, "byOs": by_os, "_source": "assessment_snapshot"}


def _snapshot_as_intune_devices(tid: str) -> List[Dict[str, Any]]:
    """Returns Intune device list from snapshot."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    payload = _assessment_json_payload(snap, "intune", "devices")
    if isinstance(payload, dict):
        result = []
        for d in payload.get("items") or []:
            if not isinstance(d, dict):
                continue
            result.append({
                "id": _payload_value(d, "Id", "id", "DeviceName", "deviceName", default=""),
                "deviceName": _payload_value(d, "DeviceName", "deviceName", default=""),
                "operatingSystem": _payload_value(d, "OperatingSystem", "operatingSystem", default=""),
                "osVersion": _payload_value(d, "OsVersion", "osVersion", default=""),
                "complianceState": _payload_value(d, "ComplianceState", "complianceState", default="unknown"),
                "userPrincipalName": _payload_value(d, "UserPrincipalName", "userPrincipalName", default=""),
                "userDisplayName": _payload_value(d, "UserDisplayName", "userDisplayName", default=""),
                "lastSyncDateTime": _payload_value(d, "LastSyncDateTime", "lastSyncDateTime"),
                "enrolledDateTime": _payload_value(d, "EnrolledDateTime", "enrolledDateTime"),
                "manufacturer": _payload_value(d, "Manufacturer", "manufacturer", default=""),
                "model": _payload_value(d, "Model", "model", default=""),
            })
        return result
    raw = _snapshot_raw(tid)
    devices = raw.get("IntuneDevices") or []
    result = []
    for d in devices:
        if not isinstance(d, dict):
            continue
        result.append({
            "id": d.get("Id") or d.get("id") or "",
            "deviceName": d.get("DeviceName") or d.get("deviceName") or "",
            "operatingSystem": d.get("OperatingSystem") or d.get("operatingSystem") or "",
            "osVersion": d.get("OsVersion") or d.get("osVersion") or "",
            "complianceState": d.get("ComplianceState") or d.get("complianceState") or "unknown",
            "userPrincipalName": d.get("UserPrincipalName") or d.get("userPrincipalName") or "",
            "userDisplayName": d.get("UserDisplayName") or d.get("userDisplayName") or "",
            "lastSyncDateTime": d.get("LastSyncDateTime") or d.get("lastSyncDateTime"),
            "enrolledDateTime": d.get("EnrolledDateTime") or d.get("enrolledDateTime"),
            "manufacturer": d.get("Manufacturer") or d.get("manufacturer") or "",
            "model": d.get("Model") or d.get("model") or "",
        })
    return result


def _snapshot_as_intune_compliance(tid: str) -> List[Dict[str, Any]]:
    """Returns compliance policies from snapshot."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    payload = _assessment_json_payload(snap, "intune", "compliance")
    if isinstance(payload, dict):
        result = []
        for p in payload.get("items") or []:
            if not isinstance(p, dict):
                continue
            result.append({
                "id": _payload_value(p, "Id", "id", "DisplayName", "displayName", default=""),
                "displayName": _payload_value(p, "DisplayName", "displayName", default=""),
                "platform": _payload_value(p, "Platform", "platform", default=""),
                "createdDateTime": _payload_value(p, "CreatedDateTime", "createdDateTime"),
                "lastModifiedDateTime": _payload_value(p, "LastModifiedDateTime", "lastModifiedDateTime"),
            })
        return result
    raw = _snapshot_raw(tid)
    items = raw.get("IntuneCompliance") or []
    result = []
    for p in items:
        if not isinstance(p, dict):
            continue
        result.append({
            "id": p.get("Id") or p.get("id") or "",
            "displayName": p.get("DisplayName") or p.get("displayName") or "",
            "platform": p.get("Platform") or p.get("platform") or "",
            "createdDateTime": p.get("CreatedDateTime") or p.get("createdDateTime"),
            "lastModifiedDateTime": p.get("LastModifiedDateTime") or p.get("lastModifiedDateTime"),
        })
    return result


def _snapshot_as_intune_config(tid: str) -> List[Dict[str, Any]]:
    """Returns config profiles from snapshot."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    payload = _assessment_json_payload(snap, "intune", "config")
    if isinstance(payload, dict):
        result = []
        for p in payload.get("items") or []:
            if not isinstance(p, dict):
                continue
            plat = _payload_value(p, "Platform", "platform", default="")
            result.append({
                "id": _payload_value(p, "Id", "id", "DisplayName", "displayName", default=""),
                "displayName": _payload_value(p, "DisplayName", "displayName", default=""),
                "platform": plat,
                "platforms": plat,
                "createdDateTime": _payload_value(p, "CreatedDateTime", "createdDateTime"),
                "lastModifiedDateTime": _payload_value(p, "LastModifiedDateTime", "lastModifiedDateTime"),
                "isAssigned": False,
                "type": "legacy",
            })
        return result
    raw = _snapshot_raw(tid)
    items = raw.get("IntuneConfigProfiles") or []
    result = []
    for p in items:
        if not isinstance(p, dict):
            continue
        plat = p.get("Platform") or p.get("platform") or ""
        result.append({
            "id": p.get("Id") or p.get("id") or "",
            "displayName": p.get("DisplayName") or p.get("displayName") or "",
            "platform": plat,
            "platforms": plat,
            "createdDateTime": p.get("CreatedDateTime") or p.get("createdDateTime"),
            "lastModifiedDateTime": p.get("LastModifiedDateTime") or p.get("lastModifiedDateTime"),
            "isAssigned": False,
            "type": "legacy",
        })
    return result


def _snapshot_as_users(tid: str) -> List[Dict[str, Any]]:
    """Maps snapshot assessment users → user objects expected by gebruikers.js."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    users_payload = _assessment_json_payload(snap, "gebruikers", "users")
    licenses_payload = _assessment_json_payload(snap, "gebruikers", "licenses")
    mfa_payload = _assessment_json_payload(snap, "identity", "mfa")

    # Build MFA lookup: UPN → True (registered) / False (not registered)
    mfa_registered_upns: set = set()
    if isinstance(mfa_payload, dict):
        for item in mfa_payload.get("items") or []:
            if not isinstance(item, dict):
                continue
            if _payload_value(item, "mfaRegistered", "MfaRegistered", default=False):
                upn = str(_payload_value(item, "userPrincipalName", "UPN", default="") or "").strip().lower()
                if upn:
                    mfa_registered_upns.add(upn)

    if isinstance(users_payload, dict):
        license_map: Dict[str, List[str]] = {}
        license_sku_map: Dict[str, List[str]] = {}
        if isinstance(licenses_payload, dict):
            for lic in licenses_payload.get("items") or []:
                if not isinstance(lic, dict):
                    continue
                sku = str(_payload_value(lic, "skuPartNumber", "SkuPartNumber", default="") or "").strip()
                display_name = str(_payload_value(lic, "displayName", "DisplayName", default=sku) or sku)
                for assigned_user in lic.get("assignedUsers") or lic.get("AssignedUsers") or []:
                    if not isinstance(assigned_user, dict):
                        continue
                    upn = str(_payload_value(assigned_user, "userPrincipalName", "UserPrincipalName", default="") or "").strip()
                    if not upn:
                        continue
                    if display_name:
                        license_map.setdefault(upn, []).append(display_name)
                    if sku:
                        license_sku_map.setdefault(upn, []).append(sku)
        result = []
        for user in users_payload.get("items") or []:
            if not isinstance(user, dict):
                continue
            upn = str(_payload_value(user, "userPrincipalName", "UserPrincipalName", "mail", "Mail", default="") or "").strip()
            licenses = license_map.get(upn, [])
            sku_ids = license_sku_map.get(upn, [])
            on_prem = _payload_value(user, "onPremisesSyncEnabled", "OnPremisesSyncEnabled", default=False)
            mfa_methods = ["MFA geregistreerd (snapshot)"] if upn.lower() in mfa_registered_upns else []
            result.append({
                "id": _payload_value(user, "id", "Id", "userPrincipalName", "UserPrincipalName", default=upn),
                "displayName": _payload_value(user, "displayName", "DisplayName", default=upn),
                "userPrincipalName": upn,
                "mail": _payload_value(user, "mail", "Mail", default=upn),
                "accountEnabled": bool(_payload_value(user, "accountEnabled", "AccountEnabled", default=True)),
                "userType": _payload_value(user, "userType", "UserType", default="Member"),
                "createdDateTime": _payload_value(user, "createdDateTime", "CreatedDateTime"),
                "department": _payload_value(user, "department", "Department"),
                "jobTitle": _payload_value(user, "jobTitle", "JobTitle"),
                "officeLocation": _payload_value(user, "officeLocation", "OfficeLocation"),
                "preferredLanguage": _payload_value(user, "preferredLanguage", "PreferredLanguage"),
                "onPremisesSyncEnabled": bool(on_prem) if on_prem is not None else False,
                "licenses": licenses,
                "licenseSkuIds": sku_ids,
                "licenseCount": int(_payload_value(user, "licenseCount", "LicenseCount", default=len(licenses)) or 0),
                "mfaMethods": mfa_methods,
                "groups": [],
            })
        if result:
            return result
    licenses = snap.get("assessment_licenses") or []
    sku_to_users: Dict[str, List[Dict[str, str]]] = {}
    upn_to_licenses: Dict[str, List[str]] = {}
    upn_to_sku_ids: Dict[str, List[str]] = {}
    for lic in licenses:
        if not isinstance(lic, dict):
            continue
        sku = (lic.get("SkuPartNumber") or "").strip()
        assigned_users = [u for u in (lic.get("AssignedUsers") or []) if isinstance(u, dict)]
        if not sku:
            continue
        sku_to_users[sku] = assigned_users
        for user in assigned_users:
            upn = (user.get("UserPrincipalName") or "").strip()
            if not upn:
                continue
            upn_to_licenses.setdefault(upn, []).append(sku)
            upn_to_sku_ids.setdefault(upn, []).append(sku)
    assessment_users = snap.get("assessment_users") or []
    if isinstance(assessment_users, list) and assessment_users:
        enriched = []
        for user in assessment_users:
            if not isinstance(user, dict):
                continue
            upn = (user.get("userPrincipalName") or "").strip()
            item = dict(user)
            item["licenses"] = [get_sku_friendly_name(sku) for sku in upn_to_licenses.get(upn, [])]
            item["licenseSkuIds"] = upn_to_sku_ids.get(upn, [])
            item["licenseCount"] = len(item["licenses"])
            if "mfaMethods" not in item:
                item["mfaMethods"] = ["MFA geregistreerd (snapshot)"] if upn.lower() in mfa_registered_upns else []
            if "groups" not in item:
                item["groups"] = []
            if "onPremisesSyncEnabled" not in item:
                item["onPremisesSyncEnabled"] = False
            enriched.append(item)
        return enriched
    users = []
    for m in (snap.get("assessment_user_mailboxes") or []):
        if not isinstance(m, dict):
            continue
        upn = m.get("PrimarySmtpAddress") or ""
        users.append({
            "id": upn,
            "displayName": m.get("DisplayName") or upn,
            "userPrincipalName": upn,
            "mail": upn,
            "accountEnabled": True,
            "createdDateTime": m.get("WhenCreated"),
            "department": None,
            "jobTitle": None,
            "licenses": [get_sku_friendly_name(sku) for sku in upn_to_licenses.get(upn, [])],
            "licenseSkuIds": upn_to_sku_ids.get(upn, []),
            "licenseCount": len(upn_to_licenses.get(upn, [])),
        })
    return users


def _snapshot_as_licenses(tid: str) -> List[Dict[str, Any]]:
    """Maps snapshot Licenses → license objects expected by gebruikers.js."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    payload = _assessment_json_payload(snap, "gebruikers", "licenses")
    if isinstance(payload, dict):
        licenses = []
        for l in payload.get("items") or []:
            if not isinstance(l, dict):
                continue
            sku = str(_payload_value(l, "skuPartNumber", "SkuPartNumber", "skuId", "SkuId", default="") or "")
            assigned_users = []
            for user in l.get("assignedUsers") or l.get("AssignedUsers") or []:
                if not isinstance(user, dict):
                    continue
                assigned_users.append({
                    "displayName": _payload_value(user, "displayName", "DisplayName", default=""),
                    "userPrincipalName": _payload_value(user, "userPrincipalName", "UserPrincipalName", default=""),
                })
            licenses.append({
                "skuId": sku,
                "skuPartNumber": sku,
                "displayName": _payload_value(l, "displayName", "DisplayName", default=get_sku_friendly_name(sku)),
                "enabled": int(_payload_value(l, "total", "Total", default=0) or 0),
                "consumed": int(_payload_value(l, "consumed", "Consumed", default=0) or 0),
                "available": int(_payload_value(l, "available", "Available", default=0) or 0),
                "utilization": _payload_value(l, "utilization", "Utilization"),
                "assignedUsers": assigned_users,
            })
        if licenses:
            return licenses
    licenses = []
    for l in (snap.get("assessment_licenses") or []):
        if not isinstance(l, dict):
            continue
        sku = l.get("SkuPartNumber") or ""
        licenses.append({
            "skuId": sku,
            "skuPartNumber": sku,
            "displayName": get_sku_friendly_name(sku),
            "enabled": int(l.get("Total") or 0),
            "consumed": int(l.get("Consumed") or 0),
            "available": int(l.get("Available") or 0),
        })
    return licenses


def _normalize_user_license_payload(user: Dict[str, Any]) -> Dict[str, Any]:
    item = dict(user or {})
    raw_licenses = item.get("licenses") or []
    if isinstance(raw_licenses, list):
        item["licenses"] = [get_sku_friendly_name(str(lic)) for lic in raw_licenses]
    raw_sku = item.get("licenseSkuIds") or []
    if isinstance(raw_sku, list):
        item["licenseSkuIds"] = [str(sku) for sku in raw_sku]
    if "licenseCount" not in item:
        item["licenseCount"] = len(item.get("licenseSkuIds") or item.get("licenses") or [])
    return item


def _normalize_license_payload(license_item: Dict[str, Any]) -> Dict[str, Any]:
    item = dict(license_item or {})
    sku = str(item.get("skuPartNumber") or item.get("skuId") or "").strip()
    item["displayName"] = get_sku_friendly_name(sku)
    return item


def _snapshot_as_mailboxes(tid: str) -> List[Dict[str, Any]]:
    """Maps snapshot UserMailboxes → basic Exchange mailbox objects."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    payload = _assessment_json_payload(snap, "exchange", "mailboxes")
    if isinstance(payload, dict):
        result = []
        for m in payload.get("items") or []:
            if not isinstance(m, dict):
                continue
            smtp = _payload_value(m, "PrimarySmtpAddress", "primarySmtpAddress", "Mail", "mail", default="")
            result.append({
                "id": smtp or _payload_value(m, "DisplayName", "displayName", default=""),
                "displayName": _payload_value(m, "DisplayName", "displayName", default=smtp),
                "primarySmtpAddress": smtp,
                "recipientTypeDetails": _payload_value(m, "RecipientTypeDetails", "recipientTypeDetails", default="UserMailbox"),
                "whenCreated": _payload_value(m, "WhenCreated", "whenCreated", "CreatedDateTime", "createdDateTime"),
            })
        if result:
            return result
    result = []
    for m in (snap.get("assessment_user_mailboxes") or []):
        if not isinstance(m, dict):
            continue
        result.append({
            "id": m.get("PrimarySmtpAddress") or "",
            "displayName": m.get("DisplayName") or "",
            "primarySmtpAddress": m.get("PrimarySmtpAddress") or "",
            "recipientTypeDetails": "UserMailbox",
            "whenCreated": m.get("WhenCreated"),
        })
    return result


def _snapshot_as_mailbox_detail(tid: str, uid: str) -> Optional[Dict[str, Any]]:
    """Looks up a single mailbox from snapshot by id or email, returns detail-shape or None."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    for m in (snap.get("assessment_user_mailboxes") or []):
        if not isinstance(m, dict):
            continue
        smtp = m.get("PrimarySmtpAddress") or ""
        name = m.get("DisplayName") or ""
        if smtp.lower() == uid.lower() or name.lower() == uid.lower():
            return {
                "ok": True,
                "id": smtp,
                "displayName": name,
                "mail": smtp,
                "upn": smtp,
                "department": None,
                "jobTitle": None,
                "office": None,
                "mobile": None,
                "timezone": None,
                "language": None,
                "autoReply": {"status": "disabled"},
                "forwarding": {"enabled": False, "address": None},
                "_source": "assessment_snapshot",
            }
    return None


def _snapshot_as_shared_mailboxes(tid: str) -> List[Dict[str, Any]]:
    snap = _latest_assessment_snapshot_for_tenant(tid)
    result = []
    for m in (snap.get("assessment_shared_mailboxes") or []):
        if not isinstance(m, dict):
            continue
        smtp = m.get("PrimarySmtpAddress") or ""
        result.append({
            "id": smtp or m.get("DisplayName") or "",
            "displayName": m.get("DisplayName") or smtp,
            "mail": smtp,
            "upn": smtp,
            "recipientTypeDetails": "SharedMailbox",
            "fullAccessCount": int(m.get("FullAccessCount") or 0),
            "sendAsCount": int(m.get("SendAsCount") or 0),
            "sendOnBehalfCount": int(m.get("SendOnBehalfCount") or 0),
            "whenCreated": m.get("WhenCreated"),
        })
    return result


def _snapshot_as_ca_policies(tid: str) -> List[Dict[str, Any]]:
    """Maps snapshot CAPolicies → CA policy objects expected by ca.js."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    payload = _assessment_json_payload(snap, "ca", "policies")
    if isinstance(payload, dict):
        result = []
        for p in payload.get("items") or []:
            if not isinstance(p, dict):
                continue
            state = str(_payload_value(p, "State", "state", default="unknown") or "unknown").lower()
            result.append({
                "id": _payload_value(p, "Id", "id", default=""),
                "displayName": _payload_value(p, "DisplayName", "displayName", default=""),
                "state": state,
                "createdAt": _payload_value(p, "CreatedDateTime", "createdDateTime", "CreatedAt", "createdAt"),
                "modifiedAt": _payload_value(p, "ModifiedDateTime", "modifiedDateTime", "ModifiedAt", "modifiedAt"),
                "userScope": "—",
                "appScope": "—",
                "grantControl": "Geen",
                "sessionCtrl": "Nee",
            })
        if result:
            return result
    raw = _snapshot_raw(tid)
    items = raw.get("CAPolicies") or []
    result = []
    for p in items:
        if not isinstance(p, dict):
            continue
        result.append({
            "id": p.get("Id") or "",
            "displayName": p.get("DisplayName") or "",
            "state": p.get("State") or "unknown",
            "createdAt": p.get("CreatedAt"),
            "modifiedAt": p.get("ModifiedAt"),
            "userScope": p.get("UserScope") or "—",
            "appScope": p.get("AppScope") or "—",
            "grantControl": p.get("GrantControl") or "Geen",
            "sessionCtrl": p.get("SessionCtrl") or "Nee",
        })
    return result


def _snapshot_as_domains(tid: str) -> List[Dict[str, Any]]:
    """Maps snapshot DomainDnsChecks → basic domain list expected by domains.js."""
    raw = _snapshot_raw(tid)
    items = raw.get("DomainDnsChecks") or []
    result = []
    for d in items:
        if not isinstance(d, dict):
            continue
        domain_name = d.get("Domain") or d.get("domain")
        if not domain_name:
            continue
        result.append({
            "id": domain_name,
            "isDefault": False,
            "isVerified": True,
            "isInitial": domain_name.lower().endswith(".onmicrosoft.com"),
            "supportedServices": [],
        })
    return result


def _snapshot_as_cis_data(tid: str) -> Optional[Dict[str, Any]]:
    """Reads CIS benchmark results from assessment JSON payload."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    return _assessment_json_payload(snap, "compliance", "cis")


def _snapshot_as_hybrid_sync(tid: str) -> Optional[Dict[str, Any]]:
    """Reads Hybrid Identity sync data from assessment JSON payload."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    return _assessment_json_payload(snap, "hybrid", "sync")


def _snapshot_as_teams(tid: str) -> List[Dict[str, Any]]:
    """Maps snapshot Teams → basic team list expected by the Teams workspace."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    payload = _assessment_json_payload(snap, "teams", "teams")
    if isinstance(payload, dict):
        result = []
        for item in payload.get("items") or []:
            if not isinstance(item, dict):
                continue
            mail = _payload_value(item, "Mail", "mail", default="")
            result.append({
                "id": _payload_value(item, "Id", "id", "Mail", "mail", "DisplayName", "displayName", default=""),
                "mail": mail,
                "displayName": _payload_value(item, "DisplayName", "displayName", default=mail),
                "memberCount": int(_payload_value(item, "MemberCount", "memberCount", default=0) or 0),
                "createdAt": _payload_value(item, "CreatedDateTime", "createdDateTime", "CreatedAt", "createdAt"),
                "visibility": _payload_value(item, "Visibility", "visibility"),
                "ownerCount": int(_payload_value(item, "OwnerCount", "ownerCount", default=0) or 0),
                "isDynamic": bool(_payload_value(item, "IsDynamic", "isDynamic", default=False)),
            })
        if result:
            return result
    result = []
    for item in (snap.get("assessment_teams") or []):
        if not isinstance(item, dict):
            continue
        result.append({
            "id": item.get("id") or item.get("mail") or item.get("displayName") or "",
            "mail": item.get("mail") or "",
            "displayName": item.get("displayName") or item.get("mail") or "",
            "memberCount": int(item.get("memberCount") or 0),
            "createdAt": item.get("createdAt"),
            "visibility": item.get("visibility"),
            "ownerCount": int(item.get("ownerCount") or 0),
            "isDynamic": bool(item.get("isDynamic")) if item.get("isDynamic") is not None else False,
        })
    return result


def _snapshot_as_sharepoint_sites(tid: str) -> List[Dict[str, Any]]:
    """Maps snapshot SharePoint data → site list expected by the SharePoint workspace."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    payload = _assessment_json_payload(snap, "sharepoint", "sharepoint-sites")
    if isinstance(payload, dict):
        result = []
        for item in payload.get("items") or []:
            if not isinstance(item, dict):
                continue
            storage_gb = _payload_value(item, "StorageUsedGB", "storageUsedGB")
            storage_label = "—"
            if storage_gb not in (None, ""):
                storage_label = f"{storage_gb} GB"
            result.append({
                "id": _payload_value(item, "Id", "id", "WebUrl", "webUrl", "DisplayName", "displayName", default=""),
                "displayName": _payload_value(item, "DisplayName", "displayName", default=""),
                "webUrl": _payload_value(item, "WebUrl", "webUrl"),
                "createdAt": _payload_value(item, "CreatedDateTime", "createdDateTime"),
                "lastModified": _payload_value(item, "LastModifiedDateTime", "lastModifiedDateTime"),
                "isRootSite": bool(_payload_value(item, "IsRootSite", "isRootSite", default=False)),
                "storageUsed": storage_gb,
                "storageLabel": storage_label,
                "status": "Inactief" if bool(_payload_value(item, "IsInactive", "isInactive", default=False)) else "Actief",
            })
        if result:
            return result
    raw = _snapshot_raw(tid)
    items = raw.get("SharePointSites") or []
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        storage_gb = item.get("StorageUsedGB")
        storage_label = "—"
        if storage_gb not in (None, ""):
            storage_label = f"{storage_gb} GB"
        result.append({
            "id": item.get("Id") or item.get("id") or item.get("WebUrl") or item.get("DisplayName") or "",
            "displayName": item.get("DisplayName") or item.get("displayName") or "",
            "webUrl": item.get("WebUrl") or item.get("webUrl"),
            "createdAt": item.get("CreatedDateTime") or item.get("createdDateTime"),
            "lastModified": item.get("LastModifiedDateTime") or item.get("lastModifiedDateTime"),
            "isRootSite": bool(item.get("IsRootSite")) if item.get("IsRootSite") is not None else False,
            "storageUsed": storage_gb,
            "storageLabel": storage_label,
            "status": "Inactief" if item.get("IsInactive") else "Actief",
        })
    if result:
        return result
    run = db_fetchone(
        "SELECT * FROM assessment_runs WHERE tenant_id=? ORDER BY is_archived ASC, COALESCE(completed_at, started_at) DESC LIMIT 1",
        (tid,),
    )
    if not run:
        return []
    report_file = find_latest_report_file(RUNS_DIR / run["id"])
    if not report_file or not report_file.exists():
        return []
    return _parse_sharepoint_sites_from_html(report_file)


def _snapshot_as_sharepoint_settings(tid: str) -> Optional[Dict[str, Any]]:
    snap = _latest_assessment_snapshot_for_tenant(tid)
    payload = _assessment_json_payload(snap, "sharepoint", "sharepoint-settings")
    if isinstance(payload, dict):
        summary = payload.get("summary") or {}
        notes = payload.get("meta", {}).get("notes") or []
        note_text = notes[0] if notes else ""
        return {
            "ok": True,
            "sharingCapability": note_text or summary.get("sharingCapability"),
            "defaultLinkPermission": _payload_value(summary, "defaultLinkPermission", "DefaultLinkPermission"),
            "defaultSharingLinkType": _payload_value(summary, "defaultSharingLinkType", "DefaultSharingLinkType"),
            "guestSharingEnabled": bool(summary.get("tenantSettingsAvailable")),
            "_source": "assessment_snapshot",
        }
    raw = _snapshot_raw(tid)
    settings = raw.get("SharePointTenantSettings")
    if isinstance(settings, dict):
        return {
            "ok": True,
            "sharingCapability": settings.get("ExternalSharing") or settings.get("sharingCapability"),
            "defaultLinkPermission": settings.get("DefaultLinkPermission") or settings.get("defaultLinkPermission"),
            "defaultSharingLinkType": settings.get("LoopDefaultSharingLinkScope") or settings.get("defaultSharingLinkType"),
            "guestSharingEnabled": settings.get("ExternalSharing", "").lower() not in {"disabled", "uitgeschakeld", "nee"},
            "_source": "assessment_snapshot",
        }
    run = db_fetchone(
        "SELECT * FROM assessment_runs WHERE tenant_id=? ORDER BY is_archived ASC, COALESCE(completed_at, started_at) DESC LIMIT 1",
        (tid,),
    )
    if not run:
        return None
    report_file = find_latest_report_file(RUNS_DIR / run["id"])
    if not report_file or not report_file.exists():
        return None
    parsed = _parse_sharepoint_settings_from_html(report_file)
    if not parsed:
        return None
    parsed["ok"] = True
    parsed["_source"] = "assessment_snapshot"
    return parsed


def _snapshot_as_sharepoint_backup(tid: str) -> Dict[str, Any]:
    sites = _snapshot_as_sharepoint_sites(tid)
    if not sites:
        return {"ok": True, "policies": [], "count": 0, "note": "Geen SharePoint assessmentdata beschikbaar.", "_source": "assessment_snapshot"}
    return {
        "ok": True,
        "policies": [{
            "id": "assessment-sharepoint",
            "displayName": "Assessment SharePoint sites",
            "status": "assessment_snapshot",
            "createdAt": _latest_assessment_snapshot_for_tenant(tid).get("assessment_generated_at"),
            "retentionPeriodInDays": 0,
            "siteCount": len(sites),
            "sites": [
                {
                    "siteId": site.get("id"),
                    "siteName": site.get("displayName"),
                    "siteUrl": site.get("webUrl"),
                    "status": site.get("status") or "assessment_snapshot",
                }
                for site in sites
            ],
        }],
        "count": 1,
        "_source": "assessment_snapshot",
        "note": "Gegevens uit laatste assessment; geen live M365 Backup-policydata.",
    }


def _snapshot_as_onedrive_backup(tid: str) -> Dict[str, Any]:
    snap = _latest_assessment_snapshot_for_tenant(tid)
    payload = _assessment_json_payload(snap, "backup", "onedrive")
    if isinstance(payload, dict):
        drives = []
        for item in payload.get("items") or []:
            if not isinstance(item, dict):
                continue
            owner_name = _payload_value(item, "OwnerDisplayName", "ownerDisplayName", "OwnerPrincipalName", "ownerPrincipalName", default="")
            drives.append({
                "driveId": _payload_value(item, "OwnerPrincipalName", "ownerPrincipalName", "Url", "url", default=""),
                "ownerName": owner_name,
                "status": "assessment_snapshot",
                "storageGB": _payload_value(item, "StorageUsedGB", "storageUsedGB", default=0) or 0,
                "modified": _payload_value(item, "LastModifiedDateTime", "lastModifiedDateTime"),
            })
        if drives:
            return {
                "ok": True,
                "policies": [{
                    "id": "assessment-onedrive",
                    "displayName": "Assessment OneDrive sites",
                    "status": "assessment_snapshot",
                    "createdAt": snap.get("assessment_generated_at"),
                    "retentionPeriodInDays": 0,
                    "driveCount": len(drives),
                    "drives": drives,
                }],
                "count": 1,
                "_source": "assessment_snapshot",
                "note": "Gegevens uit laatste assessment; geen live M365 Backup-policydata.",
            }
    raw = _snapshot_raw(tid)
    drives_raw = raw.get("Top5OneDriveBySize") or []
    drives = []
    for item in drives_raw:
        if not isinstance(item, dict):
            continue
        drives.append({
            "driveId": item.get("Owner") or item.get("owner") or "",
            "ownerName": item.get("Owner") or item.get("owner") or "",
            "status": "assessment_snapshot",
            "storageGB": item.get("StorageUsedGB") or item.get("storageGB") or 0,
            "modified": item.get("LastModifiedDateTime") or item.get("lastModifiedDateTime"),
        })
    if not drives:
        run = db_fetchone(
            "SELECT * FROM assessment_runs WHERE tenant_id=? ORDER BY is_archived ASC, COALESCE(completed_at, started_at) DESC LIMIT 1",
            (tid,),
        )
        report_file = find_latest_report_file(RUNS_DIR / run["id"]) if run else None
        if report_file and report_file.exists():
            drives = _parse_onedrive_from_html(report_file)
    if not drives:
        return {"ok": True, "policies": [], "count": 0, "note": "Geen OneDrive assessmentdata beschikbaar.", "_source": "assessment_snapshot"}
    return {
        "ok": True,
        "policies": [{
            "id": "assessment-onedrive",
            "displayName": "Assessment OneDrive sites",
            "status": "assessment_snapshot",
            "createdAt": _latest_assessment_snapshot_for_tenant(tid).get("assessment_generated_at"),
            "retentionPeriodInDays": 0,
            "driveCount": len(drives),
            "drives": drives,
        }],
        "count": 1,
        "_source": "assessment_snapshot",
        "note": "Gegevens uit laatste assessment; geen live M365 Backup-policydata.",
    }


# ── Assessment UI functions ───────────────────────────────────


def assessment_ui_nav(tenant_id: str) -> Dict[str, Any]:
    cache_key = f"assessment_nav:{tenant_id}"
    cached = _memo_get(cache_key)
    if cached is not None:
        return cached
    tenant = db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,))
    if not tenant:
        raise ValueError("Tenant niet gevonden")
    run = _latest_completed_run_for_tenant(tenant_id)
    snapshot = _latest_assessment_snapshot_for_tenant(tenant_id)
    json_payloads = snapshot.get("assessment_json_payloads") or {}
    users = [u for u in (snapshot.get("assessment_user_mailboxes") or []) if isinstance(u, dict)]
    domains = [d for d in (snapshot.get("assessment_domain_dns_checks") or []) if isinstance(d, dict) and (d.get("Domain") or d.get("domain"))]
    app_regs = [a for a in (snapshot.get("assessment_app_registrations") or []) if isinstance(a, dict)]
    licenses = [l for l in (snapshot.get("assessment_licenses") or []) if isinstance(l, dict)]
    if json_payloads:
        dynamic_items = [{"key": "summary", "label": "Overzicht", "count": None}]
        ordered = sorted(json_payloads.items(), key=lambda kv: _assessment_nav_sort_key(kv[0][0], kv[0][1]))
        for (section, subsection), payload in ordered:
            if not isinstance(payload, dict):
                continue
            coverage = _assessment_item_coverage(tenant_id, section, subsection)
            dynamic_items.append({
                "key": f"{section}:{subsection}",
                "label": payload.get("label") or f"{section} / {subsection}",
                "count": len(payload.get("items") or []),
                "coverage": coverage,
            })
        items = dynamic_items
    else:
        items = [
            {"key": "summary", "label": "Overzicht", "count": None},
            {"key": "users", "label": "Gebruikers", "count": len(users)} if users else None,
            {"key": "licenses", "label": "Licenties", "count": len(licenses)} if licenses else None,
            {"key": "appregs", "label": "App Registraties", "count": len(app_regs)} if app_regs else None,
            {"key": "domains_dns", "label": "Domeinen & DNS", "count": len(domains)} if domains else None,
            {"key": "mfa_ca", "label": "MFA / CA", "count": snapshot.get("users_without_mfa")} if snapshot.get("mfa_coverage") is not None or snapshot.get("ca_policies") is not None else None,
        ]
    result = {
        "enabled": bool((_get_load_config_fn() if _get_load_config_fn else lambda: {})().get("assessment_ui_v1", True)),
        "tenant_name": tenant.get("tenant_name") or tenant.get("customer_name"),
        "tenant_id": tenant.get("id"),
        "latest_run_id": run.get("id") if run else None,
        "latest_report_path": run.get("report_path") if run else None,
        "generated_at": snapshot.get("assessment_generated_at"),
        "score": run.get("score_overall") if run else None,
        "critical_count": run.get("critical_count") if run else 0,
        "warning_count": run.get("warning_count") if run else 0,
        "info_count": run.get("info_count") if run else 0,
        "items": [item for item in items if item],
    }
    return _memo_set(cache_key, result, 20)


def assessment_ui_section(tenant_id: str, section_key: str) -> Dict[str, Any]:
    cache_key = f"assessment_section:{tenant_id}:{section_key}"
    cached = _memo_get(cache_key)
    if cached is not None:
        return cached
    bundle = assessment_ui_nav(tenant_id)
    snapshot = _latest_assessment_snapshot_for_tenant(tenant_id)
    json_payloads = snapshot.get("assessment_json_payloads") or {}
    users = [u for u in (snapshot.get("assessment_user_mailboxes") or []) if isinstance(u, dict)]
    licenses = [l for l in (snapshot.get("assessment_licenses") or []) if isinstance(l, dict)]
    app_regs = [a for a in (snapshot.get("assessment_app_registrations") or []) if isinstance(a, dict)]
    domains = [d for d in (snapshot.get("assessment_domain_dns_checks") or []) if isinstance(d, dict) and (d.get("Domain") or d.get("domain"))]
    common = {
        "tenant_name": bundle["tenant_name"],
        "generated_at": bundle["generated_at"],
        "latest_run_id": bundle["latest_run_id"],
    }
    if section_key == "summary" and json_payloads:
        bars = []
        ordered = sorted(json_payloads.items(), key=lambda kv: _assessment_nav_sort_key(kv[0][0], kv[0][1]))
        for (_section, _subsection), payload in ordered:
            if not isinstance(payload, dict):
                continue
            bars.append({
                "label": payload.get("label") or f"{_section}:{_subsection}",
                "value": len(payload.get("items") or []),
                "max": max(len(payload.get("items") or []), 1),
            })
        result = {
            **common,
            "key": "summary",
            "title": "Assessment overzicht",
            "cards": [
                {"label": "JSON onderdelen", "value": len(json_payloads), "tone": "default"},
                {"label": "Secure Score", "value": f"{round(snapshot['secure_score_percentage'])}%" if snapshot.get("secure_score_percentage") is not None else "—", "tone": "success"},
                {"label": "MFA Coverage", "value": f"{round(snapshot['mfa_coverage'])}%" if snapshot.get("mfa_coverage") is not None else "—", "tone": "success"},
                {"label": "Open Alerts", "value": bundle["critical_count"] + bundle["warning_count"], "tone": "warn"},
            ],
            "bars": bars[:12],
        }
        return _memo_set(cache_key, result, 20)
    if ":" in section_key and json_payloads:
        section, subsection = section_key.split(":", 1)
        payload = json_payloads.get((section, subsection))
        if isinstance(payload, dict):
            columns, rows = _rows_from_json_payload(payload)
            coverage = _assessment_item_coverage(tenant_id, section, subsection)
            result = {
                **common,
                "key": section_key,
                "title": payload.get("label") or f"{section} / {subsection}",
                "cards": _cards_from_json_summary(payload),
                "columns": columns,
                "rows": rows,
                "coverage": coverage,
            }
            return _memo_set(cache_key, result, 20)
    if section_key == "summary":
        result = {
            **common,
            "key": "summary",
            "title": "Assessment overzicht",
            "cards": [
                {"label": "Secure Score", "value": f"{round(snapshot['secure_score_percentage'])}%" if snapshot.get("secure_score_percentage") is not None else "—", "tone": "success"},
                {"label": "MFA Coverage", "value": f"{round(snapshot['mfa_coverage'])}%" if snapshot.get("mfa_coverage") is not None else "—", "tone": "success"},
                {"label": "Open Alerts", "value": bundle["critical_count"] + bundle["warning_count"], "tone": "warn"},
                {"label": "CA Policies", "value": snapshot.get("ca_policies") or 0, "tone": "default"},
            ],
            "bars": [
                {"label": "Gebruikers", "value": len(users), "max": max(len(users), 1)},
                {"label": "Licenties", "value": len(licenses), "max": max(len(licenses), 1)},
                {"label": "App Registraties", "value": len(app_regs), "max": max(len(app_regs), 1)},
                {"label": "Tenantdomeinen", "value": len(domains), "max": max(len(domains), 1)},
            ],
        }
        return _memo_set(cache_key, result, 20)
    if section_key == "users":
        rows = [{"name": u.get("DisplayName"), "email": u.get("PrimarySmtpAddress"), "created": u.get("WhenCreated")} for u in users]
        return _memo_set(cache_key, {**common, "key": "users", "title": "Gebruikers", "columns": ["Naam", "E-mail", "Aangemaakt"], "rows": rows}, 20)
    if section_key == "licenses":
        rows = [{"sku": l.get("SkuPartNumber"), "total": l.get("Total"), "used": l.get("Consumed"), "available": l.get("Available"), "utilization": f"{l.get('Utilization')}%"} for l in licenses]
        return _memo_set(cache_key, {**common, "key": "licenses", "title": "Licenties", "columns": ["SKU", "Totaal", "Gebruikt", "Beschikbaar", "Benutting"], "rows": rows}, 20)
    if section_key == "appregs":
        rows = [{"name": a.get("DisplayName"), "secret": a.get("SecretExpirationStatus"), "secret_expiry": a.get("SecretExpiration"), "certificate": a.get("CertificateExpirationStatus"), "permission_count": a.get("PermissionCount")} for a in app_regs]
        return _memo_set(cache_key, {**common, "key": "appregs", "title": "App Registraties", "columns": ["Naam", "Secret", "Secret verval", "Certificaat", "Permissies"], "rows": rows}, 20)
    if section_key == "domains_dns":
        rows = [{"domain": d.get("Domain") or d.get("domain"), "spf": d.get("SPF") or d.get("spf"), "dmarc": d.get("DMARC") or d.get("dmarc"), "dkim": d.get("DKIM") or d.get("dkim")} for d in domains]
        return _memo_set(cache_key, {**common, "key": "domains_dns", "title": "Domeinen & DNS", "columns": ["Domein", "SPF", "DMARC", "DKIM"], "rows": rows}, 20)
    if section_key == "mfa_ca":
        result = {
            **common,
            "key": "mfa_ca",
            "title": "MFA / Conditional Access",
            "cards": [
                {"label": "MFA Coverage", "value": f"{round(snapshot['mfa_coverage'])}%" if snapshot.get("mfa_coverage") is not None else "—", "tone": "success"},
                {"label": "Gebruikers zonder MFA", "value": snapshot.get("users_without_mfa") or 0, "tone": "warn"},
                {"label": "CA Policies", "value": snapshot.get("ca_policies") or 0, "tone": "default"},
                {"label": "Conditional Access", "value": "Actief" if snapshot.get("conditional_access") else "Niet actief", "tone": "default"},
            ],
        }
        return _memo_set(cache_key, result, 20)
    raise ValueError("Assessment onderdeel niet gevonden")
