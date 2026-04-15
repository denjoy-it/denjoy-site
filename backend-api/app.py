#!/usr/bin/env python3
"""
Denjoy IT Platform — lokale backend server.

Notes:
- Serveert de portal frontend vanuit ../frontend-portal/
- Slaat lokale state op in SQLite onder backend-api/storage/
- Ondersteunt demo-runs en PowerShell script-runs via assessment-engine/
"""

from __future__ import annotations

import hashlib
import html as html_lib
import json
import csv
import copy
import io
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, unquote, urlparse
import logging
import traceback

from services.customer_service import build_customer_finance_summary
from services.kb_service import (
    kb_tid as _kb_tid,
    kb_iid as _kb_iid,
    kb_list_asset_types,
    kb_create_asset_type,
    kb_delete_asset_type,
    kb_get_meta,
    kb_put_meta,
    kb_list_assets,
    kb_create_asset,
    kb_update_asset,
    kb_delete_asset,
    kb_list_vlans,
    kb_create_vlan,
    kb_update_vlan,
    kb_delete_vlan,
    kb_list_pages,
    kb_get_page,
    kb_create_page,
    kb_update_page,
    kb_delete_page,
    kb_list_contacts,
    kb_create_contact,
    kb_update_contact,
    kb_delete_contact,
    kb_list_passwords,
    kb_create_password,
    kb_update_password,
    kb_delete_password,
    kb_list_software,
    kb_create_software,
    kb_update_software,
    kb_delete_software,
    kb_list_domains as _kb_list_domains_raw,
    kb_create_domain,
    kb_update_domain,
    kb_delete_domain,
    kb_get_m365_profile as _kb_get_m365_profile_raw,
    kb_put_m365_profile,
    kb_list_changelog,
    kb_create_changelog,
    kb_update_changelog,
    kb_delete_changelog,
    kb_sync_from_assessment,
)
from services.msp_control_center_service import build_msp_control_center_payload
import services.snapshot_service as _snapshot_svc
import services.powershell_service as _ps_svc
from services.snapshot_service import (
    get_sku_friendly_name,
    find_latest_report_file,
    list_run_html_files,
    find_latest_summary_file,
    _assessment_json_payload,
    _payload_value,
    _assessment_json_report_for_run,
    _assessment_item_coverage,
    _format_assessment_json_cell,
    _rows_from_json_payload,
    _cards_from_json_summary,
    extract_stats_from_summary,
    extract_stats_from_html,
    parse_run_stats,
    _parse_license_overview_from_html,
    _parse_license_assignments_from_html,
    _parse_app_registration_alerts_from_html,
    _parse_domain_dns_checks_from_html,
    _parse_user_mailboxes_from_html,
    _parse_teams_from_html,
    _parse_sharepoint_sites_from_html,
    _parse_onedrive_from_html,
    _parse_sharepoint_settings_from_html,
    _parse_user_overview_counts_from_html,
    _parse_assessment_users_from_html,
    _latest_completed_run_for_tenant,
    _latest_assessment_snapshot_for_tenant,
    _snapshot_as_intune_summary,
    _snapshot_as_intune_devices,
    _snapshot_as_intune_compliance,
    _snapshot_as_intune_config,
    _snapshot_as_users,
    _snapshot_as_licenses,
    _snapshot_as_mailboxes,
    _snapshot_as_mailbox_detail,
    _snapshot_as_ca_policies,
    _snapshot_as_domains,
    _snapshot_as_cis_data,
    _snapshot_as_hybrid_sync,
    _snapshot_as_teams,
    _snapshot_as_sharepoint_sites,
    _snapshot_as_sharepoint_settings,
    _snapshot_as_sharepoint_backup,
    _snapshot_as_onedrive_backup,
    assessment_ui_nav,
    assessment_ui_section,
)
from services.onboarding_service import (
    build_customer_health,
    build_customer_onboarding_summary,
    build_tenant_onboarding_status,
)
from auth_service import (
    action_requires_approval as auth_action_requires_approval,
    build_session_access_profile as auth_build_session_access_profile,
    clear_request_cache as auth_clear_request_cache,
    get_approval_requirement as auth_get_approval_requirement,
    get_user_portal_role_keys as auth_get_user_portal_role_keys,
    session_can as auth_session_can,
    session_can_service as auth_session_can_service,
)
from models.customers import (
    count_active_tenants as model_count_active_tenants,
    count_enabled_services as model_count_enabled_services,
    create_customer_row as model_create_customer_row,
    customer_exists as model_customer_exists,
    delete_customer_row as model_delete_customer_row,
    get_customer_row as model_get_customer_row,
    list_customer_services as model_list_customer_services,
    list_customer_tenants as model_list_customer_tenants,
    list_customers_rows as model_list_customers_rows,
    update_customer_fields as model_update_customer_fields,
    upsert_customer_service_row as model_upsert_customer_service_row,
)
from routes.api import (
    dispatch_approval_get_routes,
    dispatch_approval_post_routes,
    dispatch_customer_delete_routes,
    dispatch_customer_get_routes,
    dispatch_customer_patch_routes,
    dispatch_customer_post_routes,
    dispatch_job_get_routes,
    dispatch_job_post_routes,
    dispatch_service_get_routes,
    dispatch_service_post_routes,
)
from routes.tenants import (
    dispatch_tenant_get_routes,
    dispatch_tenant_post_routes,
)
from routes.operations import (
    dispatch_operations_delete_routes,
    dispatch_operations_get_routes,
    dispatch_operations_post_routes,
)
from routes.comparison_routes import dispatch_comparison_get_routes
from routes.integrations import (
    dispatch_integration_get_routes,
    dispatch_integration_patch_routes,
    dispatch_integration_post_routes,
)
from routes.security import (
    dispatch_security_get_routes,
    dispatch_security_post_routes,
)
from routes.knowledge_base import (
    dispatch_kb_delete_routes,
    dispatch_kb_get_routes,
    dispatch_kb_post_routes,
    dispatch_kb_put_routes,
)
from routes.baselines import (
    dispatch_baseline_delete_routes,
    dispatch_baseline_get_routes,
    dispatch_baseline_patch_routes,
    dispatch_baseline_post_routes,
)
from routes.management_hub import (
    dispatch_management_hub_get_routes,
    dispatch_management_hub_post_routes,
    dispatch_management_hub_delete_routes,
)
from routes.azure import (
    dispatch_azure_get_routes,
    dispatch_azure_post_routes,
)
from routes.app_registrations import (
    dispatch_app_registration_get_routes,
)
from routes.microsoft_services import (
    dispatch_microsoft_services_get_routes,
    dispatch_microsoft_services_post_routes,
)
from routes.intune_policy_mgmt import (
    dispatch_intune_policy_get_routes,
    dispatch_intune_policy_post_routes,
    dispatch_intune_policy_delete_routes,
)
from routes.platform_security import (
    dispatch_platform_security_get_routes,
)
from routes.collaboration_services import (
    dispatch_collaboration_services_get_routes,
    dispatch_collaboration_services_post_routes,
)
from routes.controls import (
    dispatch_controls_get_routes,
)
from routes.user_management import (
    dispatch_user_management_post_routes,
)
from routes.remediation import (
    dispatch_remediation_get_routes,
    dispatch_remediation_post_routes,
)
from routes.snapshots_and_users import (
    dispatch_snapshots_and_capabilities_get_routes,
    dispatch_users_get_routes,
)
from routes.users_and_snapshots import (
    dispatch_users_post_put_delete_routes,
    dispatch_cost_snapshots_mutation_routes,
)
from routes.scheduled_runs import (
    dispatch_scheduled_runs_get_routes,
    dispatch_scheduled_runs_post_routes,
    dispatch_assessment_schedules_get_routes,
    dispatch_assessment_schedules_post_routes,
    dispatch_assessment_schedules_delete_routes,
)
from routes.utility_routes import (
    dispatch_utility_get_routes,
)
from routes.report_upload import (
    dispatch_report_upload_post_routes,
)
from routes.file_serving import (
    dispatch_file_serving_get_routes,
)
from db_layer import (
    get_conn as db_layer_get_conn,
    db_execute as db_layer_execute,
    db_fetchone as db_layer_fetchone,
    db_fetchall as db_layer_fetchall,
    init_db as db_layer_init_db,
    DB_PATH, STORAGE_DIR, WEB_DIR, PLATFORM_DIR, CAPABILITY_MATRIX_PATH,
    now_iso, ensure_dirs, row_to_dict as db_layer_row_to_dict, RUNS_DIR, DEFAULT_REPORTS_DIR,
)
from routes.auth_routes import (
    dispatch_auth_post_routes,
)
from routes.actions import (
    dispatch_actions_post_routes,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ============================================================
# SECURITY CONSTANTS
# ============================================================

# Content-Security-Policy voor HTML-responses
CSP_HEADER = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://alcdn.msauth.net https://alcdn.msftauth.net; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data: https: blob:; "
    "connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com "
    "https://aadcdn.msauth.net https://aadcdn.msftauth.net; "
    "frame-src 'self' blob:; "
    "object-src 'none'; "
    "base-uri 'self';"
)

# In-memory rate limiter (login-pogingen per IP)
_rate_buckets: Dict[str, List[float]] = {}
_rate_lock = threading.Lock()

# Account-level failed-login tracker (per e-mailadres, in-memory)
# Slaat mislukte pogingen op als lijst van timestamps.
# Na MAX_ACCOUNT_FAILURES mislukkingen binnen ACCOUNT_LOCKOUT_WINDOW seconden
# wordt het account voor ACCOUNT_LOCKOUT_DURATION seconden geblokkeerd.
_account_fail_buckets: Dict[str, List[float]] = {}
_account_fail_lock = threading.Lock()
MAX_ACCOUNT_FAILURES = 5          # max pogingen voor lockout
ACCOUNT_LOCKOUT_WINDOW = 300      # observatievenster in seconden (5 min)
ACCOUNT_LOCKOUT_DURATION = 600    # blokkeerduur in seconden (10 min)
_memo_cache: Dict[str, Tuple[float, Any]] = {}
_memo_lock = threading.Lock()
CONFIG_PATH = STORAGE_DIR / "config.json"
SERVICE_CATALOG_PATH = STORAGE_DIR / "service_catalog.json"
SERVICE_REQUESTS_PATH = STORAGE_DIR / "service_requests.json"
SKU_FRIENDLY_MAP_PATH = PLATFORM_DIR / "shared" / "m365-sku-friendly-names.json"
_sku_friendly_map_cache: Optional[Dict[str, str]] = None
_service_catalog_lock = threading.Lock()
CPP_AGENT_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyCloudPolicyPreferences.ps1"
CPP_BOOTSTRAP_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Install-DenjoyCloudPolicyPreferencesAgent.ps1"
CPP_DETECTION_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Test-DenjoyCloudPolicyPreferencesAgent.ps1"
CPP_REMEDIATION_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyCloudPolicyPreferencesRemediation.ps1"
GUARDIAN_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyIntuneGuardian.ps1"

# Request-scoped context caching (elimineert N+1 queries per HTTP request)
_request_context = threading.local()


def _get_request_cache() -> Dict[str, Any]:
    """Haal request-scoped cache op (één per thread/request)."""
    if not hasattr(_request_context, "cache"):
        _request_context.cache = {}
    return _request_context.cache


def _clear_request_cache() -> None:
    """Reset cache na request-verwerking."""
    if hasattr(_request_context, "cache"):
        _request_context.cache.clear()
    auth_clear_request_cache()


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


def load_capability_matrix() -> Dict[str, Any]:
    cached = _memo_get("capability_matrix")
    if isinstance(cached, dict):
        return cached
    try:
        data = json.loads(CAPABILITY_MATRIX_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}
    data.setdefault("defaults", {})
    data.setdefault("modules", [])
    return _memo_set("capability_matrix", data, 60)


# get_sku_friendly_name → imported from services.snapshot_service


def _invalidate_tenant_perf_cache(tenant_id: Optional[str]) -> None:
    if tenant_id:
        for prefix in (
            f"list_runs:{tenant_id}:",
            f"tenant_overview:{tenant_id}",
            f"assessment_nav:{tenant_id}",
            f"assessment_section:{tenant_id}:",
        ):
            _memo_drop_prefix(prefix)
    _memo_drop_prefix("list_runs:None:")


def _check_rate_limit(ip: str, max_attempts: int = 10, window_secs: int = 60) -> bool:
    """True = toegestaan, False = rate limit bereikt."""
    with _rate_lock:
        now = time.time()
        bucket = [t for t in _rate_buckets.get(ip, []) if now - t < window_secs]
        if len(bucket) >= max_attempts:
            _rate_buckets[ip] = bucket
            return False
        bucket.append(now)
        _rate_buckets[ip] = bucket
        return True


def _check_account_lockout(email: str) -> bool:
    """
    Controleer of een e-mailadres tijdelijk geblokkeerd is na te veel mislukte inlogpogingen.
    True = toegestaan, False = account geblokkeerd.
    """
    with _account_fail_lock:
        now = time.time()
        timestamps = [t for t in _account_fail_buckets.get(email, []) if now - t < ACCOUNT_LOCKOUT_WINDOW]
        _account_fail_buckets[email] = timestamps
        if len(timestamps) >= MAX_ACCOUNT_FAILURES:
            # Controleer of de oudste mislukking buiten de blokkeerduur valt
            oldest = timestamps[0] if timestamps else 0
            if now - oldest < ACCOUNT_LOCKOUT_DURATION:
                return False  # Geblokkeerd
            # Blokkeerduur verstreken — reset
            _account_fail_buckets[email] = []
        return True


def _record_account_failure(email: str) -> None:
    """Registreer een mislukte inlogpoging voor een e-mailadres."""
    with _account_fail_lock:
        now = time.time()
        bucket = _account_fail_buckets.get(email, [])
        bucket = [t for t in bucket if now - t < ACCOUNT_LOCKOUT_WINDOW]
        bucket.append(now)
        _account_fail_buckets[email] = bucket


def _management_hub_seed_state(tenant_id: str) -> Dict[str, Any]:
    now = now_iso()
    tenant_label = _management_hub_tenant_label(tenant_id)
    policies = [
        {
            "id": str(uuid.uuid4()),
            "name": "Finance Share",
            "type": "DriveMap",
            "scope": "Users",
            "target": "Finance",
            "status": "active",
            "summary": "Mapt drive F: naar de finance-share.",
            "payload": {
                "driveLetter": "F",
                "remotePath": "\\\\files.denjoy.local\\finance",
                "label": "Finance",
            },
            "created_at": now,
            "updated_at": now,
            "created_by": "admin@denjoy.local",
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Support Shortcut",
            "type": "Shortcut",
            "scope": "Devices",
            "target": "All devices",
            "status": "active",
            "summary": "Plaats snelkoppeling naar Denjoy Support op het bureaublad.",
            "payload": {
                "shortcutName": "Denjoy Support",
                "targetPath": "https://support.denjoy.nl",
                "location": "Desktop",
            },
            "created_at": now,
            "updated_at": now,
            "created_by": "admin@denjoy.local",
        },
    ]
    guardian_events = [
        {
            "id": str(uuid.uuid4()),
            "severity": "warn",
            "category": "Policy",
            "title": "Windows baseline aangepast",
            "actor": "admin@denjoy.local",
            "happened_at": now,
            "detail": f"Een policywijziging voor {tenant_label} is gezien in de Intune audit-feed.",
        },
        {
            "id": str(uuid.uuid4()),
            "severity": "info",
            "category": "Assignment",
            "title": "Nieuwe app-assignment gepubliceerd",
            "actor": "automation@denjoy.local",
            "happened_at": (datetime.now(timezone.utc) - timedelta(minutes=34)).astimezone().isoformat(),
            "detail": "Een nieuwe assignment is naar de devicegroep pilot-workstations gepubliceerd.",
        },
        {
            "id": str(uuid.uuid4()),
            "severity": "risk",
            "category": "Compliance",
            "title": "Compliance policy verwijderd",
            "actor": "servicedesk@denjoy.local",
            "happened_at": (datetime.now(timezone.utc) - timedelta(hours=3)).astimezone().isoformat(),
            "detail": "Guardian markeerde een verwijderde policy als mogelijk change-conflict met bestaande baselines.",
        },
    ]
    return {
        "tenant_id": tenant_id,
        "version": 1,
        "updated_at": now,
        "policies": policies,
        "guardian_events": guardian_events,
    }


def _management_hub_tenant_label(tenant_id: str) -> str:
    tenant = db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,)) or {}
    for key in ("name", "display_name", "company_name", "tenant_name"):
        value = str(tenant.get(key) or "").strip()
        if value:
            return value
    return tenant_id


def _load_management_hub_state(tenant_id: str) -> Dict[str, Any]:
    path = _management_hub_state_path(tenant_id)
    if not path.exists():
        state = _management_hub_seed_state(tenant_id)
        path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
        return state
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data.setdefault("tenant_id", tenant_id)
            data.setdefault("policies", [])
            data.setdefault("guardian_events", [])
            data.setdefault("updated_at", now_iso())
            return data
    except Exception:
        pass
    state = _management_hub_seed_state(tenant_id)
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    return state


def _save_management_hub_state(tenant_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
    state["tenant_id"] = tenant_id
    state["updated_at"] = now_iso()
    _management_hub_state_path(tenant_id).write_text(
        json.dumps(state, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return state


def _normalize_policy_preference(payload: Dict[str, Any]) -> Dict[str, Any]:
    policy_type = str(payload.get("type") or "").strip()
    if policy_type not in {"DriveMap", "Registry", "Shortcut"}:
        raise ValueError("Alleen DriveMap, Registry en Shortcut worden nu ondersteund.")
    name = str(payload.get("name") or "").strip()
    if not name:
        raise ValueError("Naam is verplicht.")
    scope = str(payload.get("scope") or "Devices").strip() or "Devices"
    target = str(payload.get("target") or "").strip() or "Algemene scope"
    status = str(payload.get("status") or "active").strip() or "active"
    summary = str(payload.get("summary") or "").strip()
    raw_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}

    normalized_payload: Dict[str, Any] = {}
    if policy_type == "DriveMap":
        drive_letter = str(raw_payload.get("driveLetter") or payload.get("driveLetter") or "").strip().upper()
        remote_path = str(raw_payload.get("remotePath") or payload.get("remotePath") or "").strip()
        if not drive_letter or not remote_path:
            raise ValueError("DriveMap vereist driveLetter en remotePath.")
        normalized_payload = {
            "driveLetter": drive_letter[:1],
            "remotePath": remote_path,
            "label": str(raw_payload.get("label") or payload.get("label") or "").strip(),
        }
    elif policy_type == "Registry":
        reg_path = str(raw_payload.get("path") or payload.get("path") or "").strip()
        reg_name = str(raw_payload.get("name") or payload.get("registryName") or payload.get("nameField") or "").strip()
        reg_value = raw_payload.get("value", payload.get("value"))
        if not reg_path or not reg_name or reg_value in (None, ""):
            raise ValueError("Registry vereist path, name en value.")
        normalized_payload = {
            "path": reg_path,
            "name": reg_name,
            "value": str(reg_value),
            "propertyType": str(raw_payload.get("propertyType") or payload.get("propertyType") or "String").strip() or "String",
        }
    elif policy_type == "Shortcut":
        shortcut_name = str(raw_payload.get("shortcutName") or payload.get("shortcutName") or "").strip()
        target_path = str(raw_payload.get("targetPath") or payload.get("targetPath") or "").strip()
        if not shortcut_name or not target_path:
            raise ValueError("Shortcut vereist shortcutName en targetPath.")
        normalized_payload = {
            "shortcutName": shortcut_name,
            "targetPath": target_path,
            "location": str(raw_payload.get("location") or payload.get("location") or "Desktop").strip() or "Desktop",
        }

    if not summary:
        if policy_type == "DriveMap":
            summary = f"Mapt drive {normalized_payload['driveLetter']}: naar {normalized_payload['remotePath']}."
        elif policy_type == "Registry":
            summary = f"Zet {normalized_payload['path']}::{normalized_payload['name']} op {normalized_payload['value']}."
        else:
            summary = f"Plaats snelkoppeling {normalized_payload['shortcutName']} naar {normalized_payload['targetPath']}."

    return {
        "name": name,
        "type": policy_type,
        "scope": scope,
        "target": target,
        "status": status,
        "summary": summary,
        "payload": normalized_payload,
    }


def _management_hub_overview(tenant_id: str) -> Dict[str, Any]:
    state = _load_management_hub_state(tenant_id)
    policies = [p for p in state.get("policies") or [] if isinstance(p, dict)]
    events = [e for e in state.get("guardian_events") or [] if isinstance(e, dict)]
    active_policies = sum(1 for item in policies if str(item.get("status") or "").lower() == "active")
    draft_policies = sum(1 for item in policies if str(item.get("status") or "").lower() == "draft")
    policy_types: Dict[str, int] = {}
    for item in policies:
        key = str(item.get("type") or "Unknown")
        policy_types[key] = policy_types.get(key, 0) + 1
    severity_counts: Dict[str, int] = {"info": 0, "warn": 0, "risk": 0}
    for event in events:
        sev = str(event.get("severity") or "info")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1
    return {
        "tenant_id": tenant_id,
        "tenant_label": _management_hub_tenant_label(tenant_id),
        "policy_count": len(policies),
        "active_policy_count": active_policies,
        "draft_policy_count": draft_policies,
        "guardian_event_count": len(events),
        "policy_types": policy_types,
        "severity_counts": severity_counts,
        "updated_at": state.get("updated_at"),
    }


def list_management_hub_policies(tenant_id: str) -> List[Dict[str, Any]]:
    state = _load_management_hub_state(tenant_id)
    items = [item for item in state.get("policies") or [] if isinstance(item, dict)]
    return sorted(items, key=lambda item: str(item.get("updated_at") or item.get("created_at") or ""), reverse=True)


def create_management_hub_policy(tenant_id: str, payload: Dict[str, Any], created_by: str) -> Dict[str, Any]:
    state = _load_management_hub_state(tenant_id)
    normalized = _normalize_policy_preference(payload)
    now = now_iso()
    item = {
        "id": str(uuid.uuid4()),
        "created_at": now,
        "updated_at": now,
        "created_by": created_by or "admin",
        **normalized,
    }
    policies = [p for p in state.get("policies") or [] if isinstance(p, dict)]
    policies.insert(0, item)
    state["policies"] = policies
    events = [e for e in state.get("guardian_events") or [] if isinstance(e, dict)]
    events.insert(0, {
        "id": str(uuid.uuid4()),
        "severity": "info",
        "category": "Policy",
        "title": f"Policy preference toegevoegd: {item['name']}",
        "actor": created_by or "admin",
        "happened_at": now,
        "detail": f"{item['type']} policy opgeslagen voor {item['target']}.",
    })
    state["guardian_events"] = events[:50]
    _save_management_hub_state(tenant_id, state)
    return item


def delete_management_hub_policy(tenant_id: str, policy_id: str, deleted_by: str) -> Dict[str, Any]:
    state = _load_management_hub_state(tenant_id)
    policies = [p for p in state.get("policies") or [] if isinstance(p, dict)]
    remaining = [p for p in policies if p.get("id") != policy_id]
    if len(remaining) == len(policies):
        raise ValueError("Policy preference niet gevonden.")
    deleted = next((p for p in policies if p.get("id") == policy_id), None) or {}
    state["policies"] = remaining
    events = [e for e in state.get("guardian_events") or [] if isinstance(e, dict)]
    events.insert(0, {
        "id": str(uuid.uuid4()),
        "severity": "warn",
        "category": "Policy",
        "title": f"Policy preference verwijderd: {deleted.get('name') or policy_id}",
        "actor": deleted_by or "admin",
        "happened_at": now_iso(),
        "detail": "De policy is uit de Denjoy Control & Audit Center configuratie verwijderd.",
    })
    state["guardian_events"] = events[:50]
    _save_management_hub_state(tenant_id, state)
    return {"ok": True, "deleted_id": policy_id}


def list_management_hub_events(tenant_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    state = _load_management_hub_state(tenant_id)
    items = [item for item in state.get("guardian_events") or [] if isinstance(item, dict)]
    return sorted(items, key=lambda item: str(item.get("happened_at") or ""), reverse=True)[:limit]


def management_hub_client_payload(tenant_id: str, device_id: Optional[str] = None) -> Dict[str, Any]:
    policies = list_management_hub_policies(tenant_id)
    normalized: List[Dict[str, Any]] = []
    for item in policies:
        if str(item.get("status") or "").lower() not in {"active", "draft"}:
            continue
        payload = item.get("payload") if isinstance(item.get("payload"), dict) else {}
        normalized.append({
            "id": item.get("id"),
            "name": item.get("name"),
            "type": item.get("type"),
            "scope": item.get("scope"),
            "target": item.get("target"),
            "status": item.get("status"),
            "summary": item.get("summary"),
            **payload,
        })
    return {
        "tenant_id": tenant_id,
        "tenant_label": _management_hub_tenant_label(tenant_id),
        "device_id": device_id or "",
        "generated_at": now_iso(),
        "policies": normalized,
    }


def _looks_like_guid(value: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", (value or "").strip()))


def _guardian_sync_error_message(raw_output: str, client_secret: str) -> str:
    text = (raw_output or "").strip()
    if "AADSTS7000215" in text or "invalid_client" in text:
        if _looks_like_guid(client_secret):
            return (
                "Live Guardian sync geweigerd door Microsoft Entra: waarschijnlijk is de client secret ID ingevuld "
                "in plaats van de client secret VALUE. Gebruik in het tenant auth-profiel de geheime waarde die je "
                "direct bij het aanmaken van de secret hebt gekregen."
            )
        return (
            "Live Guardian sync geweigerd door Microsoft Entra: de client secret is ongeldig. Controleer dat je de "
            "secret VALUE gebruikt, niet de secret ID, en dat de secret nog niet verlopen is."
        )
    return text or "Guardian sync mislukt."


def _assessment_run_error_message(raw_output: str, client_secret: str) -> str:
    text = (raw_output or "").strip()
    if not text:
        return "Assessment mislukt zonder foutuitvoer."
    if (
        "ClientSecretCredential authentication failed" in text
        or "AADSTS7000215" in text
        or "invalid_client" in text
    ):
        if _looks_like_guid(client_secret):
            return (
                "Assessment-authenticatie naar Microsoft Graph is geweigerd. Waarschijnlijk is in de "
                "tenant-instellingen de client secret ID ingevuld in plaats van de client secret VALUE."
            )
        return (
            "Assessment-authenticatie naar Microsoft Graph is geweigerd. De opgeslagen client secret is "
            "waarschijnlijk ongeldig of verlopen, of admin consent ontbreekt voor deze tenant."
        )
    if "Connection failure" in text and "Connect-MgGraph" in text:
        return (
            "Assessment kon geen Microsoft Graph-sessie openen voor deze tenant. Controleer in Admin > "
            "tenant-instellingen de app-registratie, client secret en admin consent."
        )
    return text.splitlines()[-1][:500]


def fetch_management_hub_guardian_events_live(tenant_id: str, limit: int = 25) -> List[Dict[str, Any]]:
    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    script = GUARDIAN_SCRIPT.resolve()
    if not script.exists():
        raise FileNotFoundError(f"Guardian script niet gevonden: {script}")
    auth_tenant_id = (profile.get("auth_tenant_id") or "").strip()
    client_id = (profile.get("auth_client_id") or "").strip()
    cert_thumb = (profile.get("auth_cert_thumbprint") or "").strip()
    client_secret = (profile.get("auth_client_secret") or "").strip()
    if not auth_tenant_id or not client_id or not (cert_thumb or client_secret):
        raise ValueError("Tenant auth-profiel is niet volledig ingevuld voor live Guardian sync.")

    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(script),
        "-Action", "graph-audit",
        "-TenantId", auth_tenant_id,
        "-ClientId", client_id,
        "-Limit", str(limit),
        "-AsJson",
    ]
    if cert_thumb:
        cmd += ["-CertThumbprint", cert_thumb]
    else:
        cmd += ["-ClientSecret", client_secret]

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        raise RuntimeError(_guardian_sync_error_message(output, client_secret))
    data = json.loads(proc.stdout or "{}")
    items = data.get("items") if isinstance(data, dict) else []
    if not isinstance(items, list):
        items = []
    return items


def sync_management_hub_guardian_events(tenant_id: str, limit: int = 25) -> Dict[str, Any]:
    items = fetch_management_hub_guardian_events_live(tenant_id, limit)

    state = _load_management_hub_state(tenant_id)
    state["guardian_events"] = items
    _save_management_hub_state(tenant_id, state)
    return {
        "ok": True,
        "tenant_id": tenant_id,
        "count": len(items),
        "synced_at": now_iso(),
    }


def validate_management_hub_guardian_auth(tenant_id: str) -> Dict[str, Any]:
    items = fetch_management_hub_guardian_events_live(tenant_id, 1)
    return {
        "ok": True,
        "tenant_id": tenant_id,
        "message": "Tenant-auth voor Intune Guardian is geldig.",
        "sample_count": len(items),
        "validated_at": now_iso(),
    }


def _find_capability_module(section: str) -> Optional[Dict[str, Any]]:
    section_key = (section or "").strip().lower()
    modules = load_capability_matrix().get("modules") or []
    for module in modules:
        if isinstance(module, dict) and str(module.get("section") or "").lower() == section_key:
            return module
    return None


_PORTAL_TAB_ALIASES: Dict[str, str] = {
    "overzicht": "summary",
    "apparaten": "devices",
    "configuratie": "config",
    "geschiedenis": "history",
    "regels": "mailbox-rules",
    "mailboxen": "mailboxes",
    "forwarding": "forwarding",
}


def _find_capability_subsection(section: str, subsection: str) -> Optional[Dict[str, Any]]:
    module = _find_capability_module(section)
    if not module:
        return None
    subsection_key = (subsection or "").strip().lower()
    for item in module.get("subsections") or []:
        if isinstance(item, dict) and str(item.get("key") or "").lower() == subsection_key:
            return item
    # Try Dutch portal tab name → English matrix key alias
    alias_key = _PORTAL_TAB_ALIASES.get(subsection_key)
    if alias_key:
        for item in module.get("subsections") or []:
            if isinstance(item, dict) and str(item.get("key") or "").lower() == alias_key:
                return item
    return None


def _has_auth_profile_config(tenant_id: str) -> bool:
    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    cfg = load_config()
    client_id = (profile.get("auth_client_id") or cfg.get("auth_client_id") or "").strip()
    tenant_auth_id = (profile.get("auth_tenant_id") or cfg.get("auth_tenant_id") or "").strip()
    cert_thumb = (profile.get("auth_cert_thumbprint") or cfg.get("auth_cert_thumbprint") or "").strip()
    client_secret = (profile.get("auth_client_secret") or cfg.get("auth_client_secret") or "").strip()
    return bool(client_id and tenant_auth_id and (cert_thumb or client_secret))


def _connector_available_for_section(section: str) -> bool:
    return (section or "").strip().lower() in {
        "gebruikers", "identity", "apps", "ca", "alerts",
        "intune", "exchange", "teams", "sharepoint",
        "backup", "domains", "compliance", "hybrid",
    }


def _build_capability_status(tenant_id: str, section: str, subsection: str) -> Dict[str, Any]:
    module = _find_capability_module(section)
    sub = _find_capability_subsection(section, subsection)
    
    # Kaart van section/subsection → vereiste permissies
    required_permissions_map = {
        ("gebruikers", "users"): ["Directory.Read.All"],
        ("gebruikers", "licenses"): ["Directory.Read.All", "Organization.Read.All"],
        ("identity", "mfa"): ["UserAuthenticationMethod.Read.All", "Directory.Read.All"],
        ("identity", "admin-roles"): ["RoleManagement.Read.All", "Directory.Read.All"],
        ("teams", "teams"): ["Team.ReadBasic.All", "TeamMember.Read.All"],
        ("sharepoint", "sharepoint-sites"): ["Sites.Read.All"],
        ("sharepoint", "sharepoint-settings"): ["Sites.Read.All"],
        ("exchange", "mailboxes"): ["Mail.Read", "User.Read.All"],
        ("apps", "registrations"): ["Application.Read.All"],
        ("ca", "policies"): ["Policy.Read.ConditionalAccess"],
        ("alerts", "audit-logs"): ["AuditLog.Read.All"],
        ("alerts", "secure-score"): ["Reports.Read.All"],
        ("intune", "devices"): ["DeviceManagementManagedDevices.Read.All"],
        ("backup", "onedrive"): ["Sites.Read.All"],
        ("domains", "domains-list"): ["Domain.Read.All"],
    }
    
    if not module or not sub:
        assessment_snapshot = _latest_assessment_snapshot_for_tenant(tenant_id)
        required_perms = required_permissions_map.get((section, subsection), [])
        return {
            "section": section, "section_label": section.capitalize(),
            "subsection": subsection, "subsection_label": subsection.capitalize(),
            "engine": "unknown", "live_source": None, "access_method": "unknown",
            "overview_supported": False, "supports_live": False,
            "supports_snapshot": True, "assessment_fallback": True, "backend_only": True,
            "gdap_required": False, "gdap_sufficient": False,
            "extra_roles": [], "extra_consent": [], "cache_minutes": 0, "write_supported": False,
            "connector_available": False, "app_registration_ready": False,
            "assessment_available": bool(assessment_snapshot),
            "assessment_generated_at": assessment_snapshot.get("assessment_generated_at") if assessment_snapshot else None,
            "status": "snapshot_only", "status_label": "Snapshot",
            "status_reason": "Capability definitie niet gevonden in matrix — snapshot-only modus.",
            "required_permissions": required_perms,
        }

    supports_live = bool(sub.get("supports_live"))
    connector_available = _connector_available_for_section(section)
    auth_ready = _has_auth_profile_config(tenant_id)
    assessment_snapshot = _latest_assessment_snapshot_for_tenant(tenant_id)
    assessment_available = bool(assessment_snapshot)
    access_method = str(module.get("access_method") or "")
    gdap_required = bool(sub.get("gdap_required"))
    gdap_sufficient = bool(sub.get("gdap_sufficient"))
    required_perms = required_permissions_map.get((str(section or "").lower(), str(subsection or "").lower()), sub.get("required_permissions") or [])

    status = "ready"
    status_label = "Live beschikbaar"
    status_reason = "Connector en basisconfiguratie zijn aanwezig."

    if not supports_live:
        status = "snapshot_only"
        status_label = "Live niet ondersteund"
        status_reason = "Dit onderdeel is bedoeld als historie of portaldata en heeft geen eigen live connector."
    elif not connector_available:
        status = "not_implemented"
        status_label = "Connector nog niet beschikbaar"
        status_reason = "Voor dit onderdeel is de control-plane richting vastgelegd, maar de live connector is nog niet in de huidige portal aangesloten."
    elif access_method == "azure_lighthouse":
        status = "not_implemented"
        status_label = "Azure engine nog niet actief"
        status_reason = "Deze capability hoort bij de Azure-engine en vereist Azure Lighthouse + Azure APIs in een volgende bouwstap."
    elif not auth_ready:
        status = "config_required"
        status_label = "App-configuratie vereist"
        status_reason = f"De tenant heeft nog geen complete app-registratieconfiguratie. Voeg deze permissies toe: {', '.join(required_perms)}"
    elif gdap_required and gdap_sufficient:
        status = "validation_required"
        status_label = "Live via GDAP"
        status_reason = "Basisconfiguratie is aanwezig. Valideer nog wel of de juiste GDAP-relatie, security group en roltoewijzing actief zijn."
    elif access_method == "customer_app_consent_first":
        status = "validation_required"
        status_label = "Live via App Consent"
        status_reason = "Basisconfiguratie is aanwezig. Dit onderdeel werkt het best met customer app consent of een tenant-specifieke app-registratie."
    elif access_method == "hybrid_gdap_or_customer_app":
        status = "validation_required"
        status_label = "Live via hybride toegang"
        status_reason = "Basisconfiguratie is aanwezig. Afhankelijk van workload en tenant zijn GDAP, extra rollen of customer app consent nodig."

    return {
        "section": module.get("section"),
        "section_label": module.get("label"),
        "subsection": sub.get("key"),
        "subsection_label": sub.get("label"),
        "engine": module.get("engine"),
        "live_source": module.get("live_source"),
        "access_method": access_method,
        "overview_supported": bool(module.get("overview_supported")),
        "supports_live": supports_live,
        "supports_snapshot": bool(load_capability_matrix().get("defaults", {}).get("supports_snapshot", True)),
        "assessment_fallback": bool(load_capability_matrix().get("defaults", {}).get("assessment_fallback", True)),
        "backend_only": bool(load_capability_matrix().get("defaults", {}).get("backend_only", True)),
        "gdap_required": gdap_required,
        "gdap_sufficient": gdap_sufficient,
        "extra_roles": list(sub.get("extra_roles") or []),
        "extra_consent": list(sub.get("extra_consent") or []),
        "cache_minutes": int(sub.get("cache_minutes") or 0),
        "write_supported": bool(sub.get("write_supported")),
        "connector_available": connector_available,
        "app_registration_ready": auth_ready,
        "assessment_available": assessment_available,
        "assessment_generated_at": assessment_snapshot.get("assessment_generated_at") if assessment_snapshot else None,
        "status": status,
        "status_label": status_label,
        "status_reason": status_reason,
        "required_permissions": required_perms,
    }


def get_tenant_capabilities(tenant_id: str) -> Dict[str, Any]:
    modules_out: List[Dict[str, Any]] = []
    for module in load_capability_matrix().get("modules") or []:
        if not isinstance(module, dict):
            continue
        subs = []
        for item in module.get("subsections") or []:
            if not isinstance(item, dict):
                continue
            try:
                subs.append(_build_capability_status(tenant_id, str(module.get("section") or ""), str(item.get("key") or "")))
            except ValueError:
                continue
            except Exception as exc:
                assessment_snapshot = _latest_assessment_snapshot_for_tenant(tenant_id)
                subs.append({
                    "section": str(module.get("section") or ""),
                    "section_label": str(module.get("label") or module.get("section") or "").strip() or "Onbekend",
                    "subsection": str(item.get("key") or ""),
                    "subsection_label": str(item.get("label") or item.get("key") or "").strip() or "Onbekend",
                    "engine": module.get("engine"),
                    "live_source": module.get("live_source"),
                    "access_method": str(module.get("access_method") or ""),
                    "overview_supported": bool(module.get("overview_supported")),
                    "supports_live": bool(item.get("supports_live")),
                    "supports_snapshot": True,
                    "assessment_fallback": True,
                    "backend_only": True,
                    "gdap_required": bool(item.get("gdap_required")),
                    "gdap_sufficient": bool(item.get("gdap_sufficient")),
                    "extra_roles": list(item.get("extra_roles") or []),
                    "extra_consent": list(item.get("extra_consent") or []),
                    "cache_minutes": int(item.get("cache_minutes") or 0),
                    "write_supported": bool(item.get("write_supported")),
                    "connector_available": False,
                    "app_registration_ready": False,
                    "assessment_available": bool(assessment_snapshot),
                    "assessment_generated_at": assessment_snapshot.get("assessment_generated_at") if assessment_snapshot else None,
                    "status": "snapshot_only",
                    "status_label": "Beperkte status",
                    "status_reason": f"Capability-check mislukt, fallback gebruikt: {str(exc)}",
                    "required_permissions": list(item.get("required_permissions") or []),
                })
        mod_out = dict(module)
        mod_out["subsections"] = subs
        modules_out.append(mod_out)
    return {"ok": True, "tenant_id": tenant_id, "modules": modules_out}


def ensure_dirs() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    DEFAULT_REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def default_config() -> Dict[str, Any]:
    return {
        "default_run_mode": "demo",
        "assessment_ui_v1": True,
        "script_path": str(PLATFORM_DIR / "assessment-engine" / "Start-LiveAssessment.ps1"),
        # App-registratie authenticatie (optioneel, laat leeg voor interactieve auth)
        "auth_tenant_id":       "",   # Azure Tenant ID (bijv. contoso.onmicrosoft.com)
        "auth_client_id":       "",   # App registratie Client ID
        "auth_cert_thumbprint": "",   # Certificate thumbprint (aanbevolen)
        "auth_client_secret":   "",   # Of client secret (minder veilig)
        # Tenant-specifieke app registratie-profielen (key = tenant_id)
        # Elke entry: {auth_tenant_id, auth_client_id, auth_cert_thumbprint, auth_client_secret}
        "tenant_auth_profiles": {},
    }


def load_config() -> Dict[str, Any]:
    ensure_dirs()
    if not CONFIG_PATH.exists():
        cfg = default_config()
        CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        return cfg
    try:
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        cfg = default_config()
        CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        return cfg
    merged = default_config()
    merged.update(cfg)
    # Env var overrides — secrets should not live in config.json
    _env_secret = os.environ.get("DENJOY_CLIENT_SECRET", "").strip()
    if _env_secret:
        merged["auth_client_secret"] = _env_secret
    _env_tenant = os.environ.get("DENJOY_AUTH_TENANT_ID", "").strip()
    if _env_tenant:
        merged["auth_tenant_id"] = _env_tenant
    _env_client = os.environ.get("DENJOY_AUTH_CLIENT_ID", "").strip()
    if _env_client:
        merged["auth_client_id"] = _env_client
    # Herstel legacy of onveilige scriptpaden automatisch naar het geldige assessment-engine script.
    allowed_dir = (PLATFORM_DIR / "assessment-engine").resolve()
    fallback_script = (allowed_dir / "Start-M365BaselineAssessment.ps1").resolve()
    configured_script = str(merged.get("script_path") or "").strip()
    try:
        resolved_script = Path(configured_script).expanduser().resolve() if configured_script else fallback_script
    except Exception:
        resolved_script = fallback_script
    if not str(resolved_script).startswith(str(allowed_dir)) or not resolved_script.exists():
        merged["script_path"] = str(fallback_script)
    return merged


def save_config(cfg: Dict[str, Any]) -> None:
    ensure_dirs()
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def _default_service_catalog() -> List[Dict[str, Any]]:
    return [
        {"id": "svc-identity-hardening", "name": "Identity Hardening", "category": "Security", "tier": "Managed", "description": "MFA, guests en rolhygiëne continu monitoren.", "price_from": "EUR 199/mnd", "status": "active"},
        {"id": "svc-ca-lifecycle", "name": "Conditional Access Lifecycle", "category": "Security", "tier": "Managed", "description": "Ontwerp, implementatie en onderhoud van CA policies.", "price_from": "EUR 249/mnd", "status": "active"},
        {"id": "svc-secure-score-sprint", "name": "Secure Score Sprint", "category": "Security", "tier": "Project", "description": "Versneld verbetertraject op Secure Score en quick wins.", "price_from": "EUR 1250", "status": "active"},
        {"id": "svc-audit-monitoring", "name": "Audit & Threat Monitoring", "category": "Security", "tier": "Managed", "description": "Detectie op auditlog, sign-ins en verdachte events.", "price_from": "EUR 299/mnd", "status": "active"},
        {"id": "svc-compliance-baseline", "name": "Compliance Baseline", "category": "Compliance", "tier": "Managed", "description": "CIS-baselines met periodieke score-updates en rapportage.", "price_from": "EUR 229/mnd", "status": "active"},
        {"id": "svc-zerotrust-roadmap", "name": "Zero Trust Roadmap", "category": "Advisory", "tier": "Advisory", "description": "Roadmap en maturiteitsgroei over identity, devices en data.", "price_from": "EUR 1850", "status": "active"},
        {"id": "svc-exchange-protection", "name": "Exchange Protection", "category": "Collaboration", "tier": "Managed", "description": "Mailbox controls, forwarding checks en mailflow hardening.", "price_from": "EUR 179/mnd", "status": "active"},
        {"id": "svc-sharepoint-governance", "name": "SharePoint Governance", "category": "Collaboration", "tier": "Managed", "description": "Site-governance, access reviews en databeheer.", "price_from": "EUR 179/mnd", "status": "active"},
        {"id": "svc-backup-continuity", "name": "Backup Continuity", "category": "Continuity", "tier": "Managed", "description": "Backupdekking, restore tests en continuiteitsrapportage.", "price_from": "EUR 159/mnd", "status": "active"},
        {"id": "svc-endpoint-compliance", "name": "Endpoint Compliance", "category": "Device", "tier": "Managed", "description": "Intune compliance en device hardening per klant.", "price_from": "EUR 249/mnd", "status": "active"},
        {"id": "svc-azure-cost-opt", "name": "Azure Cost Optimization", "category": "Cloud", "tier": "Managed", "description": "Kosteninzichten, tagging en besparingsoptimalisatie.", "price_from": "EUR 299/mnd", "status": "active"},
        {"id": "svc-azure-governance", "name": "Azure Resource Governance", "category": "Cloud", "tier": "Managed", "description": "Governance op subscriptions, resources en alerts.", "price_from": "EUR 329/mnd", "status": "active"},
        {"id": "svc-assessment-as-a-service", "name": "Assessment as a Service", "category": "Assessment", "tier": "Managed", "description": "Periodieke assessments met score en verbeterplan.", "price_from": "EUR 299/mnd", "status": "active"},
        {"id": "svc-remediation-factory", "name": "Remediation Factory", "category": "Operations", "tier": "Project", "description": "Planmatige uitvoering van verbeteracties en hardening.", "price_from": "EUR 95/uur", "status": "active"},
        {"id": "svc-executive-reporting", "name": "Executive Reporting", "category": "Advisory", "tier": "Managed", "description": "QBR-ready rapportage en voortgangscommunicatie.", "price_from": "EUR 149/mnd", "status": "active"},
        {"id": "svc-onboarding-fastlane", "name": "Onboarding Fastlane", "category": "Onboarding", "tier": "Project", "description": "Versnelde onboarding voor nieuwe klanten en tenants.", "price_from": "EUR 1450", "status": "active"},
    ]


def _read_json_list(path: Path, default_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ensure_dirs()
    if not path.exists():
        path.write_text(json.dumps(default_items, indent=2, ensure_ascii=False), encoding="utf-8")
        return copy.deepcopy(default_items)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            return [item for item in raw if isinstance(item, dict)]
    except Exception:
        pass
    path.write_text(json.dumps(default_items, indent=2, ensure_ascii=False), encoding="utf-8")
    return copy.deepcopy(default_items)


def _write_json_list(path: Path, rows: List[Dict[str, Any]]) -> None:
    ensure_dirs()
    path.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")


def list_service_catalog(category: Optional[str] = None, status: Optional[str] = "active") -> List[Dict[str, Any]]:
    with _service_catalog_lock:
        items = _read_json_list(SERVICE_CATALOG_PATH, _default_service_catalog())
    category_norm = (category or "").strip().lower()
    status_norm = (status or "").strip().lower()
    out: List[Dict[str, Any]] = []
    for item in items:
        if category_norm and str(item.get("category") or "").strip().lower() != category_norm:
            continue
        if status_norm and str(item.get("status") or "active").strip().lower() != status_norm:
            continue
        out.append(item)
    out.sort(key=lambda row: (str(row.get("category") or ""), str(row.get("name") or "")))
    return out


def list_service_requests(
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    requested_by: Optional[str] = None,
) -> List[Dict[str, Any]]:
    with _service_catalog_lock:
        rows = _read_json_list(SERVICE_REQUESTS_PATH, [])
    status_norm = (status or "").strip().lower()
    customer_norm = (customer_id or "").strip().lower()
    requester_norm = (requested_by or "").strip().lower()
    out: List[Dict[str, Any]] = []
    for row in rows:
        if status_norm and str(row.get("status") or "").strip().lower() != status_norm:
            continue
        if customer_norm and str(row.get("customer_id") or "").strip().lower() != customer_norm:
            continue
        if requester_norm and str(row.get("requested_by") or "").strip().lower() != requester_norm:
            continue
        out.append(row)
    out.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    return out


def create_service_request(payload: Dict[str, Any], requested_by: str) -> Dict[str, Any]:
    service_id = str(payload.get("service_id") or "").strip()
    customer_id = str(payload.get("customer_id") or "").strip()
    customer_name = str(payload.get("customer_name") or "").strip()
    note = str(payload.get("note") or "").strip()
    priority = str(payload.get("priority") or "normal").strip().lower()
    if priority not in {"low", "normal", "high", "urgent"}:
        priority = "normal"
    if not service_id:
        raise ValueError("service_id is verplicht")
    if not customer_id and not customer_name:
        raise ValueError("customer_id of customer_name is verplicht")

    catalog = list_service_catalog(status=None)
    match = next((item for item in catalog if str(item.get("id") or "") == service_id), None)
    if not match:
        raise ValueError("Geselecteerde dienst bestaat niet")

    request_row = {
        "id": str(uuid.uuid4()),
        "service_id": service_id,
        "service_name": str(match.get("name") or service_id),
        "category": str(match.get("category") or "Onbekend"),
        "customer_id": customer_id or None,
        "customer_name": customer_name or None,
        "priority": priority,
        "status": "new",
        "note": note or None,
        "requested_by": requested_by,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "decided_by": None,
        "decision_note": None,
    }

    with _service_catalog_lock:
        rows = _read_json_list(SERVICE_REQUESTS_PATH, [])
        rows.append(request_row)
        _write_json_list(SERVICE_REQUESTS_PATH, rows)
    return request_row


def update_service_request_status(req_id: str, status: Any, note: Any, decided_by: str) -> Dict[str, Any]:
    next_status = str(status or "").strip().lower()
    if next_status not in {"new", "in_review", "approved", "rejected", "scheduled", "delivered"}:
        raise ValueError("Ongeldige status")

    with _service_catalog_lock:
        rows = _read_json_list(SERVICE_REQUESTS_PATH, [])
        idx = next((i for i, row in enumerate(rows) if str(row.get("id") or "") == req_id), None)
        if idx is None:
            raise ValueError("Service aanvraag niet gevonden")
        row = dict(rows[idx])
        row["status"] = next_status
        row["updated_at"] = now_iso()
        row["decided_by"] = decided_by
        row["decision_note"] = str(note or "").strip() or None
        rows[idx] = row
        _write_json_list(SERVICE_REQUESTS_PATH, rows)
    return row


def get_tenant_auth_profile(tenant_id: str, include_secret: bool = False) -> Dict[str, Any]:
    cfg = load_config()
    profiles = cfg.get("tenant_auth_profiles") if isinstance(cfg.get("tenant_auth_profiles"), dict) else {}
    profile = profiles.get(tenant_id) if isinstance(profiles, dict) else None
    profile = profile if isinstance(profile, dict) else {}
    effective = _select_effective_assessment_auth(cfg, profile)
    result = {
        "auth_tenant_id": (effective.get("tenant_id") or "").strip(),
        "auth_client_id": (effective.get("client_id") or "").strip(),
        "auth_cert_thumbprint": (effective.get("cert_thumbprint") or "").strip(),
    }
    if include_secret:
        result["auth_client_secret"] = (effective.get("client_secret") or "").strip()
    return result


def get_explicit_tenant_auth_profile(tenant_id: str, include_secret: bool = False) -> Dict[str, Any]:
    cfg = load_config()
    profiles = cfg.get("tenant_auth_profiles") if isinstance(cfg.get("tenant_auth_profiles"), dict) else {}
    raw = profiles.get(tenant_id) if isinstance(profiles, dict) else None
    profile = raw if isinstance(raw, dict) else {}
    result = {
        "auth_tenant_id": (profile.get("auth_tenant_id") or "").strip(),
        "auth_client_id": (profile.get("auth_client_id") or "").strip(),
        "auth_cert_thumbprint": (profile.get("auth_cert_thumbprint") or "").strip(),
    }
    if include_secret:
        result["auth_client_secret"] = (profile.get("auth_client_secret") or "").strip()
    return result


def tenant_has_required_auth_profile(tenant_id: str) -> bool:
    profile = get_explicit_tenant_auth_profile(tenant_id, include_secret=True)
    tenant_auth_id = (profile.get("auth_tenant_id") or "").strip()
    client_id = (profile.get("auth_client_id") or "").strip()
    cert_thumb = (profile.get("auth_cert_thumbprint") or "").strip()
    client_secret = (profile.get("auth_client_secret") or "").strip()
    return bool(tenant_auth_id and client_id and (cert_thumb or client_secret))


def _select_effective_assessment_auth(
    cfg: Dict[str, Any],
    tenant_profile: Dict[str, Any],
) -> Dict[str, str]:
    global_tenant_id = (cfg.get("auth_tenant_id") or "").strip()
    global_client_id = (cfg.get("auth_client_id") or "").strip()
    global_cert = (cfg.get("auth_cert_thumbprint") or "").strip()
    global_secret = (cfg.get("auth_client_secret") or "").strip()

    profile_tenant_id = (tenant_profile.get("auth_tenant_id") or "").strip()
    profile_client_id = (tenant_profile.get("auth_client_id") or "").strip()
    profile_cert = (tenant_profile.get("auth_cert_thumbprint") or "").strip()
    profile_secret = (tenant_profile.get("auth_client_secret") or "").strip()

    # Als tenant-profiel en globale config exact dezelfde app-registratie beschrijven,
    # dan nemen we de globale secret/cert als bron van waarheid. Dit voorkomt dat een
    # verouderde tenant-override dezelfde appregistratie onnodig stuk maakt.
    same_registration = (
        profile_tenant_id
        and profile_client_id
        and global_tenant_id
        and global_client_id
        and profile_tenant_id.lower() == global_tenant_id.lower()
        and profile_client_id.lower() == global_client_id.lower()
    )
    if same_registration:
        return {
            "tenant_id": profile_tenant_id or global_tenant_id,
            "client_id": profile_client_id or global_client_id,
            "cert_thumbprint": global_cert or profile_cert,
            "client_secret": global_secret or profile_secret,
            "source": "global-shared-registration",
        }

    return {
        "tenant_id": profile_tenant_id or global_tenant_id,
        "client_id": profile_client_id or global_client_id,
        "cert_thumbprint": profile_cert or global_cert,
        "client_secret": profile_secret or global_secret,
        "source": "tenant-profile" if (profile_tenant_id or profile_client_id or profile_cert or profile_secret) else "global",
    }


def save_tenant_auth_profile(tenant_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    tenant = db_fetchone("SELECT id, tenant_guid FROM tenants WHERE id=?", (tenant_id,))
    if not tenant:
        raise ValueError("Tenant niet gevonden")

    cfg = load_config()
    profiles = cfg.get("tenant_auth_profiles") if isinstance(cfg.get("tenant_auth_profiles"), dict) else {}
    profile = profiles.get(tenant_id) if isinstance(profiles.get(tenant_id), dict) else {}

    auth_tenant_id = (payload.get("auth_tenant_id") or "").strip()
    auth_client_id = (payload.get("auth_client_id") or "").strip()
    auth_cert_thumbprint = (payload.get("auth_cert_thumbprint") or "").strip()

    tenant_guid = (tenant.get("tenant_guid") or "").strip()
    if tenant_guid and auth_tenant_id and tenant_guid.lower() != auth_tenant_id.lower():
        raise ValueError("App-registratie Tenant ID moet overeenkomen met de tenant GUID van de geselecteerde tenant.")

    # Secret alleen vervangen als expliciet meegegeven; leeg veld betekent 'ongewijzigd laten'.
    if "auth_client_secret" in payload:
        incoming_secret = (payload.get("auth_client_secret") or "").strip()
        if incoming_secret:
            profile["auth_client_secret"] = incoming_secret

    profile["auth_tenant_id"] = auth_tenant_id
    profile["auth_client_id"] = auth_client_id
    profile["auth_cert_thumbprint"] = auth_cert_thumbprint

    profiles[tenant_id] = profile
    cfg["tenant_auth_profiles"] = profiles
    save_config(cfg)
    return get_tenant_auth_profile(tenant_id, include_secret=False)


def get_conn() -> sqlite3.Connection:
    return db_layer_get_conn()


def init_db() -> None:
    db_layer_init_db()
    return
    conn = get_conn()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS tenants (
            id TEXT PRIMARY KEY,
            customer_name TEXT NOT NULL,
            tenant_name TEXT NOT NULL,
            tenant_guid TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            owner_primary TEXT,
            owner_backup TEXT,
            tags_csv TEXT,
            risk_profile TEXT NOT NULL DEFAULT 'standard',
            notes TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS assessment_runs (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            status TEXT NOT NULL,
            run_mode TEXT NOT NULL,
            scan_type TEXT NOT NULL,
            phases_csv TEXT,
            started_by TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            exit_code INTEGER,
            score_overall INTEGER,
            critical_count INTEGER DEFAULT 0,
            warning_count INTEGER DEFAULT 0,
            info_count INTEGER DEFAULT 0,
            report_path TEXT,
            snapshot_path TEXT,
            report_filename TEXT,
            is_archived INTEGER NOT NULL DEFAULT 0,
            archived_at TEXT,
            archive_reason TEXT,
            error_message TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS finding_actions (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            run_id TEXT,
            finding_key TEXT NOT NULL,
            title TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'warning',
            owner TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            due_date TEXT,
            notes TEXT,
            evidence TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            closed_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (run_id) REFERENCES assessment_runs(id)
        );

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'klant',
            display_name TEXT,
            linked_tenant_id TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            email TEXT NOT NULL,
            display_name TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            user_email TEXT,
            user_ip TEXT,
            action TEXT NOT NULL,
            resource_type TEXT,
            resource_id TEXT,
            detail TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS remediation_history (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            remediation_id TEXT NOT NULL,
            title TEXT NOT NULL,
            executed_by TEXT,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            dry_run INTEGER NOT NULL DEFAULT 0,
            params_json TEXT,
            result_json TEXT,
            error_message TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS provisioning_history (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            action TEXT NOT NULL,
            target_upn TEXT,
            target_display_name TEXT,
            executed_by TEXT,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            dry_run INTEGER NOT NULL DEFAULT 0,
            params_json TEXT,
            result_json TEXT,
            error_message TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS baselines (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            source_tenant_id TEXT,
            source_tenant_name TEXT,
            config_json TEXT NOT NULL,
            created_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS baseline_assignments (
            id TEXT PRIMARY KEY,
            baseline_id TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            assigned_by TEXT,
            assigned_at TEXT NOT NULL,
            last_checked_at TEXT,
            last_applied_at TEXT,
            compliance_score INTEGER,
            compliance_json TEXT,
            status TEXT NOT NULL DEFAULT 'assigned',
            FOREIGN KEY (baseline_id) REFERENCES baselines(id),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            UNIQUE(baseline_id, tenant_id)
        );

        CREATE TABLE IF NOT EXISTS baseline_history (
            id TEXT PRIMARY KEY,
            baseline_id TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            action TEXT NOT NULL,
            executed_by TEXT,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            dry_run INTEGER NOT NULL DEFAULT 0,
            result_json TEXT,
            error_message TEXT,
            FOREIGN KEY (baseline_id) REFERENCES baselines(id),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE TABLE IF NOT EXISTS intune_scan_history (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            action TEXT NOT NULL,
            executed_by TEXT,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            dry_run INTEGER NOT NULL DEFAULT 0,
            result_json TEXT,
            error_message TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE TABLE IF NOT EXISTS backup_history (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            action TEXT NOT NULL,
            executed_by TEXT,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            result_json TEXT,
            error_message TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE TABLE IF NOT EXISTS ca_history (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            action TEXT NOT NULL,
            policy_id TEXT,
            executed_by TEXT,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            result_json TEXT,
            error_message TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        CREATE TABLE IF NOT EXISTS alert_config (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL UNIQUE,
            webhook_url TEXT,
            webhook_type TEXT NOT NULL DEFAULT 'teams',
            email_addr TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scan_findings (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            domain TEXT NOT NULL,
            control TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'info',
            finding TEXT,
            impact TEXT NOT NULL DEFAULT 'low',
            recommendation TEXT,
            service TEXT,
            metric_value REAL,
            raw_json TEXT,
            scanned_at TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        -- ── Fase 3: MSP control plane tabellen ─────────────────────────────────
        CREATE TABLE IF NOT EXISTS customers (
            id                    TEXT PRIMARY KEY,
            name                  TEXT NOT NULL,
            status                TEXT NOT NULL DEFAULT 'active',
            primary_contact_name  TEXT,
            primary_contact_email TEXT,
            service_tier          TEXT,
            support_model         TEXT,
            renewal_date          TEXT,
            sla_name              TEXT,
            notes                 TEXT,
            created_at            TEXT NOT NULL,
            updated_at            TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS customer_services (
            id           TEXT PRIMARY KEY,
            customer_id  TEXT NOT NULL,
            service_key  TEXT NOT NULL,
            is_enabled   INTEGER NOT NULL DEFAULT 1,
            onboarded_at TEXT,
            notes        TEXT,
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            UNIQUE(customer_id, service_key)
        );

        CREATE TABLE IF NOT EXISTS integrations (
            id                         TEXT PRIMARY KEY,
            tenant_id                  TEXT,
            integration_type           TEXT NOT NULL,
            status                     TEXT NOT NULL DEFAULT 'unknown',
            auth_mode                  TEXT,
            gdap_status                TEXT,
            lighthouse_status          TEXT,
            app_registration_status    TEXT,
            certificate_status         TEXT,
            last_validated_at          TEXT,
            details_json               TEXT,
            created_at                 TEXT NOT NULL,
            updated_at                 TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS m365_snapshots (
            id                TEXT PRIMARY KEY,
            tenant_id         TEXT NOT NULL,
            section           TEXT NOT NULL,
            subsection        TEXT NOT NULL,
            source_type       TEXT NOT NULL DEFAULT 'assessment',
            generated_at      TEXT NOT NULL,
            stale_after_at    TEXT,
            data_json         TEXT,
            summary_json      TEXT,
            assessment_run_id TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (assessment_run_id) REFERENCES assessment_runs(id)
        );

        CREATE TABLE IF NOT EXISTS action_logs (
            id             TEXT PRIMARY KEY,
            portal_user_id TEXT,
            tenant_id      TEXT,
            engine         TEXT,
            section        TEXT,
            subsection     TEXT,
            action_type    TEXT NOT NULL,
            target_id      TEXT,
            result         TEXT NOT NULL DEFAULT 'success',
            error_message  TEXT,
            metadata_json  TEXT,
            created_at     TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS approvals (
            id              TEXT PRIMARY KEY,
            action_log_id   TEXT NOT NULL,
            approval_status TEXT NOT NULL DEFAULT 'pending',
            requested_by    TEXT,
            approved_by     TEXT,
            requested_at    TEXT NOT NULL,
            approved_at     TEXT,
            reason          TEXT,
            FOREIGN KEY (action_log_id) REFERENCES action_logs(id)
        );

        -- ── Fase 6: Rollen en klant-toegangsmodel ─────────────────────────────
        CREATE TABLE IF NOT EXISTS portal_roles (
            id          TEXT PRIMARY KEY,
            role_key    TEXT NOT NULL UNIQUE,
            label       TEXT NOT NULL,
            description TEXT,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_customer_access (
            id             TEXT PRIMARY KEY,
            portal_user_id TEXT NOT NULL,
            customer_id    TEXT NOT NULL,
            portal_role_id TEXT NOT NULL,
            scope          TEXT,
            granted_by     TEXT,
            granted_at     TEXT NOT NULL,
            expires_at     TEXT,
            FOREIGN KEY (portal_user_id) REFERENCES users(id),
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            FOREIGN KEY (portal_role_id) REFERENCES portal_roles(id),
            UNIQUE(portal_user_id, customer_id)
        );

        -- ── Fase 4: Azure subscriptions registry ──────────────────────────────
        CREATE TABLE IF NOT EXISTS subscriptions (
            id                    TEXT PRIMARY KEY,
            tenant_id             TEXT NOT NULL,
            azure_subscription_id TEXT NOT NULL,
            display_name          TEXT,
            state                 TEXT NOT NULL DEFAULT 'active',
            lighthouse_onboarded  INTEGER NOT NULL DEFAULT 0,
            management_group      TEXT,
            created_at            TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            UNIQUE(tenant_id, azure_subscription_id)
        );

        -- ── Fase 4: Azure snapshot tabellen ───────────────────────────────────
        CREATE TABLE IF NOT EXISTS azure_resource_snapshots (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            subscription_id TEXT,
            section         TEXT NOT NULL,
            subsection      TEXT NOT NULL,
            generated_at    TEXT NOT NULL,
            stale_after_at  TEXT,
            data_json       TEXT,
            summary_json    TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS alert_snapshots (
            id           TEXT PRIMARY KEY,
            tenant_id    TEXT NOT NULL,
            alert_type   TEXT NOT NULL,
            generated_at TEXT NOT NULL,
            data_json    TEXT,
            summary_json TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS cost_snapshots (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            subscription_id TEXT,
            period_start    TEXT NOT NULL,
            period_end      TEXT NOT NULL,
            generated_at    TEXT NOT NULL,
            data_json       TEXT,
            summary_json    TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        -- ── Fase 7: Job queue voor assessment en live retrieval ────────────────
        CREATE TABLE IF NOT EXISTS job_queue (
            id                TEXT PRIMARY KEY,
            job_type          TEXT NOT NULL,
            tenant_id         TEXT,
            payload_json      TEXT,
            status            TEXT NOT NULL DEFAULT 'pending',
            priority          INTEGER NOT NULL DEFAULT 5,
            attempt_count     INTEGER NOT NULL DEFAULT 0,
            max_attempts      INTEGER NOT NULL DEFAULT 3,
            scheduled_at      TEXT NOT NULL,
            started_at        TEXT,
            completed_at      TEXT,
            error_message     TEXT,
            result_json       TEXT,
            depends_on_job_id TEXT,
            workflow_id       TEXT,
            progress_steps    TEXT,
            current_step      INTEGER DEFAULT 0,
            created_at        TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (depends_on_job_id) REFERENCES job_queue(id)
        );

        CREATE TABLE IF NOT EXISTS service_access_policies (
            id              TEXT PRIMARY KEY,
            customer_id     TEXT NOT NULL,
            service_key     TEXT NOT NULL,
            role_key        TEXT NOT NULL,
            can_read        INTEGER NOT NULL DEFAULT 0,
            can_write       INTEGER NOT NULL DEFAULT 0,
            can_approve     INTEGER NOT NULL DEFAULT 0,
            granted_by      TEXT,
            granted_at      TEXT NOT NULL,
            expires_at      TEXT,
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            UNIQUE(customer_id, service_key, role_key)
        );

        CREATE TABLE IF NOT EXISTS approval_policies (
            id                TEXT PRIMARY KEY,
            action_key        TEXT NOT NULL UNIQUE,
            requires_approval INTEGER NOT NULL DEFAULT 0,
            min_approvers     INTEGER NOT NULL DEFAULT 1,
            allowed_roles     TEXT,
            created_at        TEXT NOT NULL
        );

        -- Approval requests: for frontend to request approval on sensitive write actions
        CREATE TABLE IF NOT EXISTS approval_requests (
            id                  TEXT PRIMARY KEY,
            action_key          TEXT NOT NULL,
            action_name         TEXT,
            action_description  TEXT,
            metadata_json       TEXT,
            requested_by        TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'pending',
            approved_by         TEXT,
            requested_at        TEXT NOT NULL,
            approved_at         TEXT,
            expires_at          TEXT,
            FOREIGN KEY (requested_by) REFERENCES users(email)
        );
        """
    )
    # Lightweight schema migration for existing local DBs.
    tenant_cols = {r[1] for r in cur.execute("PRAGMA table_info(tenants)").fetchall()}
    if "status" not in tenant_cols:
        cur.execute("ALTER TABLE tenants ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
    if "owner_primary" not in tenant_cols:
        cur.execute("ALTER TABLE tenants ADD COLUMN owner_primary TEXT")
    if "owner_backup" not in tenant_cols:
        cur.execute("ALTER TABLE tenants ADD COLUMN owner_backup TEXT")
    if "tags_csv" not in tenant_cols:
        cur.execute("ALTER TABLE tenants ADD COLUMN tags_csv TEXT")
    if "risk_profile" not in tenant_cols:
        cur.execute("ALTER TABLE tenants ADD COLUMN risk_profile TEXT NOT NULL DEFAULT 'standard'")
    approval_request_cols = {r[1] for r in cur.execute("PRAGMA table_info(approval_requests)").fetchall()}
    if "metadata_json" not in approval_request_cols:
        cur.execute("ALTER TABLE approval_requests ADD COLUMN metadata_json TEXT")
    run_cols = {r[1] for r in cur.execute("PRAGMA table_info(assessment_runs)").fetchall()}
    if "is_archived" not in run_cols:
        cur.execute("ALTER TABLE assessment_runs ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0")
    if "archived_at" not in run_cols:
        cur.execute("ALTER TABLE assessment_runs ADD COLUMN archived_at TEXT")
    if "archive_reason" not in run_cols:
        cur.execute("ALTER TABLE assessment_runs ADD COLUMN archive_reason TEXT")
    job_cols = {r[1] for r in cur.execute("PRAGMA table_info(job_queue)").fetchall()}
    if "depends_on_job_id" not in job_cols:
        cur.execute("ALTER TABLE job_queue ADD COLUMN depends_on_job_id TEXT REFERENCES job_queue(id)")
    if "workflow_id" not in job_cols:
        cur.execute("ALTER TABLE job_queue ADD COLUMN workflow_id TEXT")
    if "progress_steps" not in job_cols:
        cur.execute("ALTER TABLE job_queue ADD COLUMN progress_steps TEXT")
    if "current_step" not in job_cols:
        cur.execute("ALTER TABLE job_queue ADD COLUMN current_step INTEGER DEFAULT 0")
    action_cols = {r[1] for r in cur.execute("PRAGMA table_info(finding_actions)").fetchall()}
    if "kb_asset_id" not in action_cols:
        cur.execute("ALTER TABLE finding_actions ADD COLUMN kb_asset_id INTEGER")
    if "kb_asset_name" not in action_cols:
        cur.execute("ALTER TABLE finding_actions ADD COLUMN kb_asset_name TEXT")
    audit_cols = {r[1] for r in cur.execute("PRAGMA table_info(audit_logs)").fetchall()}
    if "tenant_id" not in audit_cols:
        cur.execute("ALTER TABLE audit_logs ADD COLUMN tenant_id TEXT")
    # Fase 3 — customer_id op tenants (optionele koppeling aan customers tabel)
    tenant_cols_v2 = {r[1] for r in cur.execute("PRAGMA table_info(tenants)").fetchall()}
    if "customer_id" not in tenant_cols_v2:
        cur.execute("ALTER TABLE tenants ADD COLUMN customer_id TEXT REFERENCES customers(id)")
    # Fase 6 — extra kolommen op users tabel
    user_cols = {r[1] for r in cur.execute("PRAGMA table_info(users)").fetchall()}
    if "last_login_at" not in user_cols:
        cur.execute("ALTER TABLE users ADD COLUMN last_login_at TEXT")
    if "entra_object_id" not in user_cols:
        cur.execute("ALTER TABLE users ADD COLUMN entra_object_id TEXT")
    customer_cols = {r[1] for r in cur.execute("PRAGMA table_info(customers)").fetchall()}
    if "service_tier" not in customer_cols:
        cur.execute("ALTER TABLE customers ADD COLUMN service_tier TEXT")
    if "support_model" not in customer_cols:
        cur.execute("ALTER TABLE customers ADD COLUMN support_model TEXT")
    if "renewal_date" not in customer_cols:
        cur.execute("ALTER TABLE customers ADD COLUMN renewal_date TEXT")
    if "sla_name" not in customer_cols:
        cur.execute("ALTER TABLE customers ADD COLUMN sla_name TEXT")
    # Fase 5 migration — backup_history tabel aanmaken als die nog niet bestaat
    existing_tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    if "backup_history" not in existing_tables:
        cur.execute("""
            CREATE TABLE backup_history (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                action TEXT NOT NULL,
                executed_by TEXT,
                executed_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'success',
                result_json TEXT,
                error_message TEXT,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            )
        """)
    # ── Performance indexes (idempotent) ──────────────────────────────────────
    cur.executescript("""
        CREATE INDEX IF NOT EXISTS idx_runs_tenant_status
            ON assessment_runs(tenant_id, status);
        CREATE INDEX IF NOT EXISTS idx_runs_tenant_completed
            ON assessment_runs(tenant_id, completed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_actions_run
            ON finding_actions(run_id);
        CREATE INDEX IF NOT EXISTS idx_actions_tenant
            ON finding_actions(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_remediation_tenant
            ON remediation_history(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_ca_history_tenant
            ON ca_history(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_backup_history_tenant
            ON backup_history(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant
            ON audit_logs(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_ts
            ON audit_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_sessions_user
            ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires
            ON sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_baseline_assignments_tenant
            ON baseline_assignments(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_baseline_assignments_baseline
            ON baseline_assignments(baseline_id);
        CREATE INDEX IF NOT EXISTS idx_scan_findings_tenant_at
            ON scan_findings(tenant_id, scanned_at DESC);
        CREATE INDEX IF NOT EXISTS idx_scan_findings_domain
            ON scan_findings(domain, status);
        CREATE INDEX IF NOT EXISTS idx_scan_findings_control
            ON scan_findings(tenant_id, domain, control);
        CREATE INDEX IF NOT EXISTS idx_m365_snapshots_tenant_section
            ON m365_snapshots(tenant_id, section, subsection);
        CREATE INDEX IF NOT EXISTS idx_m365_snapshots_generated
            ON m365_snapshots(tenant_id, generated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_action_logs_tenant
            ON action_logs(tenant_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_integrations_tenant
            ON integrations(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_customers_status
            ON customers(status);
        CREATE INDEX IF NOT EXISTS idx_user_customer_access_user
            ON user_customer_access(portal_user_id);
        CREATE INDEX IF NOT EXISTS idx_user_customer_access_customer
            ON user_customer_access(customer_id);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant
            ON subscriptions(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_azure_snapshots_tenant
            ON azure_resource_snapshots(tenant_id, section, subsection);
        CREATE INDEX IF NOT EXISTS idx_alert_snapshots_tenant
            ON alert_snapshots(tenant_id, alert_type);
        CREATE INDEX IF NOT EXISTS idx_cost_snapshots_tenant
            ON cost_snapshots(tenant_id, period_start DESC);
        CREATE INDEX IF NOT EXISTS idx_job_queue_status
            ON job_queue(status, scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_job_queue_tenant
            ON job_queue(tenant_id, status);
        CREATE INDEX IF NOT EXISTS idx_job_queue_depends
            ON job_queue(depends_on_job_id, status);
        CREATE INDEX IF NOT EXISTS idx_job_queue_workflow
            ON job_queue(workflow_id, status);
        CREATE INDEX IF NOT EXISTS idx_service_access_customer
            ON service_access_policies(customer_id, service_key);
        CREATE INDEX IF NOT EXISTS idx_service_access_role
            ON service_access_policies(role_key);
        CREATE INDEX IF NOT EXISTS idx_approval_policies_action
            ON approval_policies(action_key);
        CREATE INDEX IF NOT EXISTS idx_service_access_expires
            ON service_access_policies(customer_id, expires_at);
        CREATE INDEX IF NOT EXISTS idx_user_customer_expires
            ON user_customer_access(customer_id, expires_at);
        CREATE INDEX IF NOT EXISTS idx_approval_requests_status
            ON approval_requests(status, requested_at DESC);
        CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_by
            ON approval_requests(requested_by, status);
        CREATE INDEX IF NOT EXISTS idx_approval_requests_action
            ON approval_requests(action_key, status);
        
        -- Materialized View Tables (for performance pre-computation)
        CREATE TABLE IF NOT EXISTS materialized_views_metadata (
            view_name       TEXT PRIMARY KEY,
            last_refreshed  TEXT,
            row_count       INTEGER,
            refresh_seconds INTEGER DEFAULT 300
        );
        
        CREATE TABLE IF NOT EXISTS tenant_health_aggregate (
            tenant_id               TEXT PRIMARY KEY,
            health_score            REAL,
            mfa_coverage_pct        REAL,
            ca_enabled              INTEGER,
            secure_score_pct        REAL,
            licenses_assigned       INTEGER,
            users_active            INTEGER,
            assessment_generated_at TEXT,
            last_updated            TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS customer_cost_summary (
            customer_id         TEXT PRIMARY KEY,
            total_licenses      INTEGER DEFAULT 0,
            total_monthly_cost  REAL DEFAULT 0.0,
            cost_per_license    REAL DEFAULT 0.0,
            period_start        TEXT,
            period_end          TEXT,
            last_updated        TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS assessment_run_stats (
            tenant_id         TEXT PRIMARY KEY,
            last_run_id       TEXT,
            last_run_status   TEXT,
            run_count         INTEGER DEFAULT 0,
            avg_duration_mins REAL DEFAULT 0.0,
            last_run_at       TEXT,
            last_updated      TEXT NOT NULL
        );
    
    """)
    conn.commit()
    # Seed standaard portal_roles als die nog niet bestaan
    _default_roles = [
        ("msp_super_admin", "MSP Super Admin", "Volledige platformtoegang"),
        ("engineer",        "Engineer",         "Operationele toegang, acties uitvoeren"),
        ("monitoring_operator", "Monitoring Operator", "Lezen en monitoring, geen schrijftoegang"),
        ("billing_analyst", "Billing Analyst",  "Toegang tot kosten- en licentiedata"),
        ("read_only",       "Alleen lezen",      "Read-only toegang tot alle modules"),
    ]
    for rkey, rlabel, rdesc in _default_roles:
        existing = cur.execute("SELECT id FROM portal_roles WHERE role_key=?", (rkey,)).fetchone()
        if not existing:
            cur.execute(
                "INSERT INTO portal_roles (id, role_key, label, description, created_at) VALUES (?,?,?,?,?)",
                (str(uuid.uuid4()), rkey, rlabel, rdesc, now_iso()),
            )
    conn.commit()
    # Seed default approval policies
    _default_approval_policies = [
        ("customer.access.manage", 1, 1, "msp_super_admin"),
        ("onboarding.plan.launch", 1, 1, "msp_super_admin"),
        ("azure.operations.request", 1, 1, "msp_super_admin"),
        ("integrations.write", 0, 0, ""),
        ("jobs.enqueue", 0, 0, ""),
    ]
    for action_key, requires_app, min_app, allowed_roles in _default_approval_policies:
        existing = cur.execute("SELECT id FROM approval_policies WHERE action_key=?", (action_key,)).fetchone()
        if not existing:
            cur.execute(
                "INSERT INTO approval_policies (id, action_key, requires_approval, min_approvers, allowed_roles, created_at) VALUES (?,?,?,?,?,?)",
                (str(uuid.uuid4()), action_key, requires_app, min_app, allowed_roles, now_iso()),
            )
    conn.commit()
    count = cur.execute("SELECT COUNT(*) FROM tenants").fetchone()[0]
    if count == 0:
        tenant_id = str(uuid.uuid4())
        ts = now_iso()
        cur.execute(
            """
            INSERT INTO tenants (id, customer_name, tenant_name, tenant_guid, notes, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                tenant_id,
                "Lokale Demo Klant",
                "Lokale Tenant",
                None,
                "Aangemaakt voor lokale MVP",
                ts,
                ts,
            ),
        )
        conn.commit()
    conn.close()


# ============================================================
# AUTH HELPERS
# ============================================================

def _hash_pw(password: str, salt: str = None):
    """Hashing met PBKDF2-SHA256. Geeft (hash_hex, salt) terug."""
    if salt is None:
        salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return h.hex(), salt

def _verify_pw(password: str, stored_hash: str, salt: str) -> bool:
    h, _ = _hash_pw(password, salt)
    return secrets.compare_digest(h, stored_hash)

SESSION_HOURS = int(os.environ.get("DENJOY_SESSION_HOURS", "1"))


def _create_session(user_id: str, role: str, email: str, display_name: str) -> str:
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)).astimezone().isoformat()
    db_execute(
        "INSERT INTO sessions (token,user_id,role,email,display_name,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
        (token, user_id, role, email, display_name or "", now_iso(), expires)
    )
    # Opschonen verlopen sessies
    try:
        db_execute("DELETE FROM sessions WHERE expires_at < ?", (now_iso(),))
    except Exception as exc:
        logger.warning("Sessie-opschonen mislukt: %s", exc)
    return token

def _verify_session(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    row = db_fetchone("SELECT * FROM sessions WHERE token=?", (token,))
    if not row:
        return None
    if row["expires_at"] < now_iso():
        db_execute("DELETE FROM sessions WHERE token=?", (token,))
        return None
    return dict(row)

def ensure_admin_user() -> None:
    """
    Garandeert dat het lokale admin-account altijd bestaat en up-to-date is.
    Env vars overschrijven de ingebouwde standaardwaarden (voor productie).
    """
    admin_email = os.environ.get("DENJOY_ADMIN_EMAIL", "schiphorst.d@gmail.com").strip().lower()
    admin_pw    = os.environ.get("DENJOY_ADMIN_PASSWORD", "B3@uty104").strip()
    admin_name  = os.environ.get("DENJOY_ADMIN_NAME", "Dennis Schiphorst").strip()

    pw_hash, salt = _hash_pw(admin_pw)
    existing = db_fetchone("SELECT id FROM users WHERE email=?", (admin_email,))
    if existing:
        # Altijd wachtwoord + rol bijwerken zodat inloggen gegarandeerd werkt
        db_execute(
            "UPDATE users SET password_hash=?, salt=?, role='admin', is_active=1 WHERE email=?",
            (pw_hash, salt, admin_email)
        )
    else:
        db_execute(
            "INSERT INTO users (id,email,password_hash,salt,role,display_name,is_active,created_at) "
            "VALUES (?,?,?,?,?,?,1,?)",
            (str(uuid.uuid4()), admin_email, pw_hash, salt, "admin", admin_name, now_iso())
        )
    logger.info("Admin-account gereed: %s", admin_email)

def _get_session_from_request(handler) -> Optional[Dict[str, Any]]:
    """Haal sessie op uit Authorization of Cookie header."""
    auth = handler.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return _verify_session(auth[7:])
    cookie = handler.headers.get("Cookie", "")
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith("denjoy_session="):
            return _verify_session(part[15:])
    return None


def _check_csrf(handler) -> bool:
    """Valideer CSRF token voor state-muterende requests."""
    sess = _get_session_from_request(handler)
    if not sess:
        return False
    provided = (handler.headers.get("X-CSRF-Token") or "").strip()
    expected = str(sess.get("token") or "")
    if not provided or not expected:
        return False
    return secrets.compare_digest(provided, expected)


_PORTAL_MSP_READ_ROLES = frozenset({
    "msp_super_admin",
    "engineer",
    "monitoring_operator",
    "billing_analyst",
    "read_only",
})
_PORTAL_MSP_WRITE_ROLES = frozenset({
    "msp_super_admin",
    "engineer",
})
_PORTAL_KB_READ_ROLES = frozenset({
    "msp_super_admin",
    "engineer",
})
_PORTAL_KB_WRITE_ROLES = frozenset({
    "msp_super_admin",
    "engineer",
})


def _get_user_portal_role_keys(email: str) -> List[str]:
        return auth_get_user_portal_role_keys(email)


def _build_session_access_profile(sess: Dict[str, Any]) -> Dict[str, Any]:
    return auth_build_session_access_profile(sess)


_PORTAL_ACTION_ROLE_MATRIX: Dict[str, frozenset[str]] = {
    "customer.write_services": frozenset({"msp_super_admin", "engineer"}),
    "customer.access.manage": frozenset({"msp_super_admin"}),
    "onboarding.approval.request": frozenset({"msp_super_admin", "engineer"}),
    "onboarding.plan.launch": frozenset({"msp_super_admin", "engineer"}),
    "approvals.decide": frozenset({"msp_super_admin", "engineer"}),
    "integrations.write": frozenset({"msp_super_admin", "engineer"}),
    "azure.operations.request": frozenset({"msp_super_admin", "engineer"}),
    "jobs.enqueue": frozenset({"msp_super_admin", "engineer"}),
    "jobs.cancel": frozenset({"msp_super_admin", "engineer"}),
    "cost_snapshots.write": frozenset({"msp_super_admin", "engineer"}),
    "cost_snapshots.delete": frozenset({"msp_super_admin", "engineer"}),
}


def _session_can(sess: Dict[str, Any], action_key: str) -> bool:
    return auth_session_can(sess, action_key)


def _session_can_service(sess: Dict[str, Any], customer_id: str, service_key: str, operation: str = "read") -> bool:
    return auth_session_can_service(sess, customer_id, service_key, operation)


def _action_requires_approval(action_key: str) -> bool:
    return auth_action_requires_approval(action_key)


def _get_approval_requirement(action_key: str) -> Optional[Dict[str, Any]]:
    return auth_get_approval_requirement(action_key)


def _enqueue_job_with_dependency(
    job_type: str,
    tenant_id: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    depends_on_job_id: Optional[str] = None,
    workflow_id: Optional[str] = None,
    progress_steps: Optional[List[str]] = None,
    priority: int = 5,
    scheduled_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Enqueue job with optional dependency and progress tracking."""
    job_id = str(uuid.uuid4())
    now = now_iso()
    if not scheduled_at:
        scheduled_at = now
    
    payload_json = json.dumps(payload or {}, ensure_ascii=False)
    progress_steps_json = json.dumps(progress_steps or [], ensure_ascii=False) if progress_steps else None
    
    db_execute(
        """
        INSERT INTO job_queue (
            id, job_type, tenant_id, payload_json, status, priority,
            depends_on_job_id, workflow_id, progress_steps, current_step,
            scheduled_at, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            job_id, job_type, tenant_id, payload_json, "pending", priority,
            depends_on_job_id, workflow_id, progress_steps_json, 0,
            scheduled_at, now
        )
    )
    
    return db_fetchone("SELECT * FROM job_queue WHERE id=?", (job_id,)) or {}


def _check_job_dependency(job_id: str) -> bool:
    """Check if job's dependency is met (completed)."""
    job = db_fetchone("SELECT depends_on_job_id FROM job_queue WHERE id=?", (job_id,))
    if not job or not job.get("depends_on_job_id"):
        return True  # No dependency
    
    dep_job = db_fetchone("SELECT status FROM job_queue WHERE id=?", (job["depends_on_job_id"],))
    if not dep_job:
        return False  # Dependency not found
    
    return dep_job.get("status") == "completed"


def _update_job_progress(job_id: str, step_index: int, step_name: Optional[str] = None) -> None:
    """Update job progress tracking."""
    db_execute(
        "UPDATE job_queue SET current_step=? WHERE id=?",
        (step_index, job_id)
    )
    if step_name:
        logger.info("JobDispatcher: job %s progressed to step %d (%s)", job_id, step_index, step_name)


# ── Materialized Views (Performance Pre-Computation) ────────────────────────

def refresh_materialized_view_tenant_health() -> int:
    """Refresh pre-computed tenant health scores."""
    count = 0
    for tenant in db_fetchall("SELECT id FROM tenants"):
        tid = tenant["id"]
        snapshot = _latest_assessment_snapshot_for_tenant(tid)
        health = get_tenant_onboarding_status(tid)
        
        db_execute(
            """
            INSERT OR REPLACE INTO tenant_health_aggregate 
            (tenant_id, health_score, mfa_coverage_pct, ca_enabled, secure_score_pct, 
             licenses_assigned, users_active, assessment_generated_at, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                tid,
                health.get("health_score") or 0.0,
                (snapshot.get("mfa_coverage") or 0),
                (1 if snapshot.get("conditional_access") else 0),
                (snapshot.get("secure_score_percentage") or 0),
                len(snapshot.get("assessment_users") or []),
                len(snapshot.get("assessment_users") or []),
                snapshot.get("assessment_generated_at"),
                now_iso(),
            )
        )
        count += 1
    
    db_execute(
        "INSERT OR REPLACE INTO materialized_views_metadata (view_name, last_refreshed, row_count) VALUES (?, ?, ?)",
        ("tenant_health_aggregate", now_iso(), count)
    )
    logger.info("Refreshed tenant_health_aggregate: %d rows", count)
    return count


def refresh_materialized_view_customer_costs() -> int:
    """Refresh pre-computed customer cost summaries."""
    def _snapshot_metrics(snapshot: Dict[str, Any]) -> Tuple[float, int]:
        try:
            summary = json.loads(snapshot.get("summary_json") or "{}")
        except Exception:
            summary = {}
        total_cost = float(
            summary.get("total_cost")
            or summary.get("totalCost")
            or summary.get("total_monthly_cost")
            or snapshot.get("total_monthly_cost")
            or 0
        )
        total_licenses = int(
            summary.get("licenses_count")
            or summary.get("license_count")
            or summary.get("assigned_licenses")
            or snapshot.get("licenses_count")
            or 0
        )
        return total_cost, total_licenses

    count = 0
    for customer in db_fetchall("SELECT id FROM customers"):
        cid = customer["id"]
        customer_row = db_fetchone("SELECT id, name FROM customers WHERE id=?", (cid,)) or {}
        try:
            snapshots = db_fetchall(
                """
                SELECT cs.*
                FROM cost_snapshots cs
                INNER JOIN tenants t ON t.id = cs.tenant_id
                WHERE t.customer_id=?
                  AND t.is_active=1
                ORDER BY cs.period_start DESC, cs.generated_at DESC
                LIMIT 12
                """,
                (cid,)
            )
        except sqlite3.OperationalError as exc:
            if "customer_id" not in str(exc).lower():
                raise
            customer_name = str(customer_row.get("name") or "").strip()
            snapshots = db_fetchall(
                """
                SELECT cs.*
                FROM cost_snapshots cs
                INNER JOIN tenants t ON t.id = cs.tenant_id
                WHERE t.customer_name=?
                  AND t.is_active=1
                ORDER BY cs.period_start DESC, cs.generated_at DESC
                LIMIT 12
                """,
                (customer_name,)
            ) if customer_name else []

        parsed_metrics = [_snapshot_metrics(snapshot) for snapshot in snapshots]
        total_cost = sum(item[0] for item in parsed_metrics) / max(len(parsed_metrics), 1)
        total_licenses = sum(item[1] for item in parsed_metrics) / max(len(parsed_metrics), 1)
        cost_per_license = total_cost / max(total_licenses, 1) if total_licenses > 0 else 0

        latest_period = snapshots[0] if snapshots else {}

        db_execute(
            """
            INSERT OR REPLACE INTO customer_cost_summary
            (customer_id, total_licenses, total_monthly_cost, cost_per_license, 
             period_start, period_end, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                cid,
                int(total_licenses),
                total_cost,
                cost_per_license,
                latest_period.get("period_start"),
                latest_period.get("period_end"),
                now_iso(),
            )
        )
        count += 1
    
    db_execute(
        "INSERT OR REPLACE INTO materialized_views_metadata (view_name, last_refreshed, row_count) VALUES (?, ?, ?)",
        ("customer_cost_summary", now_iso(), count)
    )
    logger.info("Refreshed customer_cost_summary: %d rows", count)
    return count


def refresh_materialized_view_assessment_stats() -> int:
    """Refresh pre-computed assessment run statistics."""
    count = 0
    for tenant in db_fetchall("SELECT id FROM tenants"):
        tid = tenant["id"]
        latest_run = _latest_completed_run_for_tenant(tid)
        all_runs = db_fetchall(
            "SELECT * FROM assessment_runs WHERE tenant_id=? AND status='completed' ORDER BY completed_at DESC LIMIT 30",
            (tid,)
        )
        
        durations = []
        for run in all_runs:
            try:
                started = datetime.fromisoformat(run.get("started_at", ""))
                completed = datetime.fromisoformat(run.get("completed_at", ""))
                duration_mins = (completed - started).total_seconds() / 60
                durations.append(duration_mins)
            except:
                pass
        
        avg_duration = sum(durations) / len(durations) if durations else 0
        
        db_execute(
            """
            INSERT OR REPLACE INTO assessment_run_stats
            (tenant_id, last_run_id, last_run_status, run_count, avg_duration_mins, last_run_at, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                tid,
                latest_run.get("id") if latest_run else None,
                latest_run.get("status") if latest_run else None,
                len(all_runs),
                avg_duration,
                latest_run.get("completed_at") if latest_run else None,
                now_iso(),
            )
        )
        count += 1
    
    db_execute(
        "INSERT OR REPLACE INTO materialized_views_metadata (view_name, last_refreshed, row_count) VALUES (?, ?, ?)",
        ("assessment_run_stats", now_iso(), count)
    )
    logger.info("Refreshed assessment_run_stats: %d rows", count)
    return count


def refresh_all_materialized_views() -> Dict[str, int]:
    """Refresh all materialized views."""
    return {
        "tenant_health_aggregate": refresh_materialized_view_tenant_health(),
        "customer_cost_summary": refresh_materialized_view_customer_costs(),
        "assessment_run_stats": refresh_materialized_view_assessment_stats(),
    }


# API-paden die geen sessie vereisen
_OPEN_API_PATHS = frozenset({
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/microsoft",
    "/api/auth/verify",
    "/api/auth/csrf-token",
    "/api/auth/msal-config",
    "/api/health",
    "/api/upload-report",   # PowerShell scripts uploaden rapporten zonder sessie-token
})


def _check_api_access(handler, path: str) -> Optional[Dict[str, Any]]:
    """
    Controleert authenticatie en autorisatie voor /api/* routes.
    Geeft sessie dict terug bij succes.
    Stuurt 401/403 en geeft None terug bij falen.
    """
    if path in _OPEN_API_PATHS or not path.startswith("/api/"):
        return {}  # Geen check nodig — leeg dict als sentinel

    sess = _get_session_from_request(handler)
    if not sess:
        handler._json(401, {"error": "Niet ingelogd.", "error_code": "unauthorized"})
        return None

    method = str(getattr(handler, "command", "GET") or "GET").upper()
    access = _build_session_access_profile(sess)
    sess["_portal_role_keys"] = access["portal_role_keys"]
    sess["_access"] = access
    is_admin = sess.get("role") == "admin"

    def _deny() -> Optional[Dict[str, Any]]:
        handler._json(403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"})
        return None

    # Kennisbank is alleen voor administrator of expliciete portalrol.
    if path.startswith("/api/kb/"):
        if method == "GET":
            if not access["kb_access"]:
                return _deny()
        else:
            # Assessment->KB synchronisatie is toegestaan voor KB-toegang,
            # ook als de gebruiker geen volledige KB write-rol heeft.
            if re.fullmatch(r"/api/kb/[^/]+/sync-assessment", path):
                if not access["kb_access"]:
                    return _deny()
            elif not access["kb_write"]:
                return _deny()

    # Klantaccounts mogen tenant-gebonden capabilities en controls voor hun eigen
    # gekoppelde tenant lezen, zodat overview/insights gevuld blijven.
    if method == "GET" and re.fullmatch(r"/api/capabilities/[^/]+(?:/[^/]+(?:/[^/]+)?)?", path):
        req_tid = path.split("/")[3]
        if access["msp_admin"]:
            return sess
        user_row = db_fetchone("SELECT linked_tenant_id FROM users WHERE email=?", (sess["email"],))
        if not user_row or user_row["linked_tenant_id"] != req_tid:
            return _deny()
        return sess

    if method == "GET" and re.fullmatch(r"/api/controls/[^/]+/[^/]+", path):
        req_tid = path.split("/")[3]
        if access["msp_admin"]:
            return sess
        user_row = db_fetchone("SELECT linked_tenant_id FROM users WHERE email=?", (sess["email"],))
        if not user_row or user_row["linked_tenant_id"] != req_tid:
            return _deny()
        return sess

    # MSP Admin / control-plane routes mogen ook via portalrollen gelezen worden.
    _msp_read_prefixes = (
        "/api/msp",
        "/api/customers",
        "/api/approvals",
        "/api/jobs",
        "/api/audit",
        "/api/capabilities",
        "/api/azure",
    )
    if method == "GET" and any(path.startswith(prefix) for prefix in _msp_read_prefixes):
        if not access["msp_admin"]:
            return _deny()

    if path.startswith("/api/integrations"):
        if method == "GET":
            if not access["msp_admin"]:
                return _deny()
        else:
            if not access["msp_write"]:
                return _deny()

    if path.startswith("/api/baselines"):
        if method == "GET":
            if not access["msp_admin"]:
                return _deny()
        else:
            if not access["msp_write"] and not is_admin:
                return _deny()

    # Tenant selector feed is beperkt tot admin of expliciet geautoriseerde portalrol.
    if path == "/api/tenants" and method == "GET":
        if not (is_admin or access.get("tenant_selector_access")):
            return _deny()

    # Tenant-gebonden M365 leesroutes mogen ook voor gekoppelde klantaccounts.
    if method == "GET" and re.fullmatch(r"/api/m365/[^/]+(?:/users(?:/[^/]+)?|/licenses|/provisioning-history)", path):
        req_tid = path.split("/")[3]
        if access["msp_admin"]:
            return sess
        user_row = db_fetchone("SELECT linked_tenant_id FROM users WHERE email=?", (sess["email"],))
        if not user_row or user_row["linked_tenant_id"] != req_tid:
            return _deny()
        return sess

    # Config blijft admin-only. Assessment-runs starten volgt de jobs.enqueue permissie.
    if path == "/api/runs" and method == "POST":
        if not _session_can(sess, "jobs.enqueue"):
            return _deny()

    # Admin-only routes: config en overige beheer-endpoints
    _admin_paths = {"/api/config"}
    _admin_prefix = ("/api/users", "/api/remediate", "/api/m365", "/api/intune", "/api/backup",
                     "/api/ca", "/api/domains", "/api/alerts", "/api/exchange", "/api/identity",
                     "/api/apps", "/api/collaboration", "/api/portal-roles")
    if path in _admin_paths or any(path.startswith(p) for p in _admin_prefix):
        if not is_admin:
            return _deny()

    # Tenant-scoped routes: klanten mogen alleen hun eigen tenant benaderen.
    # Portalrollen binnen MSP Admin mogen tenantcontexten ook lezen voor gekoppelde workflows.
    _tid_m = re.match(r"/api/(?:tenants|assessment|kb|identity|apps|collaboration|azure)/([^/]+)(?:/|$)", path)
    if _tid_m and not is_admin:
        if access["msp_admin"] or access["kb_access"]:
            return sess
        req_tid = _tid_m.group(1)
        user_row = db_fetchone("SELECT linked_tenant_id FROM users WHERE email=?", (sess["email"],))
        if not user_row or user_row["linked_tenant_id"] != req_tid:
            handler._json(403, {"error": "Geen toegang tot deze tenant.", "error_code": "forbidden"})
            return None

    return sess


def row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return db_layer_row_to_dict(row)


def db_fetchall(sql: str, params: Tuple[Any, ...] = ()) -> List[Dict[str, Any]]:
    return db_layer_fetchall(sql, params)


def db_fetchone(sql: str, params: Tuple[Any, ...] = ()) -> Optional[Dict[str, Any]]:
    return db_layer_fetchone(sql, params)


def db_execute(sql: str, params: Tuple[Any, ...] = ()) -> int:
    """Voert een write-query uit en retourneert het aantal gewijzigde rijen."""
    return db_layer_execute(sql, params)


def db_audit(
    email: str,
    ip: str,
    action: str,
    resource_type: str = "",
    resource_id: str = "",
    detail: str = "",
    tenant_id: str = "",
) -> None:
    """Schrijft een audit-event. Mag nooit de hoofdflow blokkeren."""
    try:
        db_execute(
            "INSERT INTO audit_logs (id,user_email,user_ip,action,resource_type,resource_id,detail,tenant_id,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), email or "", ip or "", action, resource_type or "", resource_id or "", detail or "", tenant_id or "", now_iso()),
        )
    except Exception:
        pass


def create_action_log(
    tenant_id: Optional[str],
    section: str,
    subsection: str,
    action_type: str,
    metadata: Optional[Dict[str, Any]] = None,
    portal_user_id: Optional[str] = None,
    result: str = "success",
    error_message: Optional[str] = None,
    engine: str = "portal",
) -> Dict[str, Any]:
    aid = str(uuid.uuid4())
    db_execute(
        "INSERT INTO action_logs (id, portal_user_id, tenant_id, engine, section, subsection, action_type, target_id, result, error_message, metadata_json, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            aid,
            portal_user_id,
            tenant_id,
            engine,
            section,
            subsection,
            action_type,
            None,
            result,
            error_message,
            json.dumps(metadata or {}, ensure_ascii=False),
            now_iso(),
        ),
    )
    return db_fetchone("SELECT * FROM action_logs WHERE id=?", (aid,)) or {}


def list_audit_logs(
    tenant_id: Optional[str] = None,
    user_email: Optional[str] = None,
    action: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """Retourneert audit_logs met optionele filters."""
    clauses: List[str] = []
    params: List[Any] = []
    if tenant_id:
        clauses.append("tenant_id=?")
        params.append(tenant_id)
    if user_email:
        clauses.append("lower(user_email) LIKE ?")
        params.append(f"%{user_email.lower()}%")
    if action:
        clauses.append("action LIKE ?")
        params.append(f"%{action}%")
    if date_from:
        clauses.append("created_at >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("created_at <= ?")
        params.append(date_to)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    limit = min(max(1, limit), 1000)
    return db_fetchall(
        f"SELECT * FROM audit_logs {where} ORDER BY created_at DESC LIMIT ?",
        tuple(params) + (limit,),
    )


def append_run_log(run_id: str, message: str) -> None:
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    log_path = run_dir / "run.log"
    stamp = datetime.now().strftime("%H:%M:%S")
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(f"[{stamp}] {message}\n")


def update_run(run_id: str, **fields: Any) -> None:
    if not fields:
        return
    keys = list(fields.keys())
    sql = "UPDATE assessment_runs SET " + ", ".join([f"{k}=?" for k in keys]) + " WHERE id=?"
    vals = [fields[k] for k in keys] + [run_id]
    db_execute(sql, tuple(vals))


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw)
    except Exception:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _release_stale_assessment_runs_for_tenant(tenant_id: str) -> None:
    rows = db_fetchall(
        "SELECT id, status, started_at FROM assessment_runs WHERE tenant_id=? AND status IN ('queued','running')",
        (tenant_id,),
    )
    if not rows:
        return
    now_dt = datetime.now(timezone.utc)
    queue_timeout = timedelta(minutes=20)
    running_timeout = timedelta(minutes=90)
    for row in rows:
        started_at = _parse_iso_datetime(row.get("started_at"))
        if not started_at:
            continue
        age = now_dt - started_at.astimezone(timezone.utc)
        status = str(row.get("status") or "").lower()
        timed_out = (
            (status == "queued" and age > queue_timeout)
            or (status == "running" and age > running_timeout)
        )
        if not timed_out:
            continue
        update_run(
            row["id"],
            status="failed",
            completed_at=now_iso(),
            error_message=f"Automatisch vrijgegeven na vastgelopen {status}-run ({int(age.total_seconds() // 60)} min oud).",
        )
        append_run_log(
            row["id"],
            f"Run automatisch vrijgegeven: status={status}, leeftijd={int(age.total_seconds() // 60)} min.",
        )


def phase_skip_flags(phases: List[str]) -> List[str]:
    selected = set(phases)
    flags: List[str] = []
    for i in range(1, 7):
        if f"phase{i}" not in selected:
            flags.append(f"-SkipPhase{i}")
    return flags


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


def export_run_as_pdf(run_id: str) -> bytes:
    """Converteer het HTML-assessment-rapport van een run naar PDF-bytes via WeasyPrint."""
    from weasyprint import HTML as WP_HTML
    run_dir = RUNS_DIR / run_id
    report_path = find_latest_report_file(run_dir)
    if not report_path or not report_path.exists():
        raise FileNotFoundError(f"Geen HTML-rapport gevonden voor run {run_id}")
    return WP_HTML(filename=str(report_path)).write_pdf()


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


# ── PS service dependency injection ──────────────────────────────────────────
_ps_svc._get_tenant_auth_profile_fn = get_tenant_auth_profile  # type: ignore[attr-defined]
_ps_svc._load_config_fn = load_config  # type: ignore[attr-defined]
_ps_svc._db_audit_fn = db_audit  # type: ignore[attr-defined]
_ps_svc._find_latest_summary_file_fn = find_latest_summary_file  # type: ignore[attr-defined]
# ─────────────────────────────────────────────────────────────────────────────


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


def _assessment_json_report_for_run(run_id: str) -> Dict[str, Any]:
    run = get_run(run_id)
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
        capability = _build_capability_status(tenant_id, section, subsection)
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
    has_live_sites = len(site_items) > 0

    total_sites = int(len(site_items) if has_live_sites else (payload_summary.get("totalSites") or 0))
    inactive_sites = int(
        sum(1 for item in site_items if bool(item.get("isInactive")) or str(item.get("status") or "").lower() == "inactief")
        if has_live_sites
        else (payload_summary.get("inactiveSites") or 0)
    )
    sites_with_storage = int(
        sum(1 for item in site_items if _sharepoint_storage_to_gb(item.get("storageUsed")) > 0)
        if has_live_sites
        else (payload_summary.get("sitesWithStorage") or 0)
    )

    total_storage_used_gb = payload_summary.get("totalStorageUsedGB")
    if has_live_sites:
        total_storage_used_gb = sum(_sharepoint_storage_to_gb(item.get("storageUsed")) for item in site_items)
    elif total_storage_used_gb in (None, ""):
        total_storage_used_gb = 0
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


def _api_error(code: str, message: str, http_status: int = 400) -> Tuple[int, Dict[str, Any]]:
    """Gestandaardiseerde foutrespons met error_code.
    Codes: unauthorized, forbidden, not_found, validation_error,
           config_required, not_implemented, connector_unavailable,
           assessment_only, external_api_error, internal_error
    """
    return http_status, {"ok": False, "error": message, "error_code": code}


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
    user_index: Dict[str, Dict[str, Any]] = {}
    for user in (snap.get("assessment_users") or []):
        if not isinstance(user, dict):
            continue
        keys = {
            str(user.get("userPrincipalName") or "").strip().lower(),
            str(user.get("mail") or "").strip().lower(),
        }
        for key in keys:
            if key:
                user_index[key] = user
    payload = _assessment_json_payload(snap, "exchange", "mailboxes")
    if isinstance(payload, dict):
        result = []
        for m in payload.get("items") or []:
            if not isinstance(m, dict):
                continue
            smtp = _payload_value(m, "PrimarySmtpAddress", "primarySmtpAddress", "Mail", "mail", default="")
            lookup_key = str(smtp or _payload_value(m, "UserPrincipalName", "userPrincipalName", default="") or "").strip().lower()
            user_info = user_index.get(lookup_key) or {}
            enabled_value = user_info.get("accountEnabled")
            if enabled_value is None:
                enabled_value = True
            result.append({
                "id": smtp or _payload_value(m, "DisplayName", "displayName", default=""),
                "displayName": _payload_value(m, "DisplayName", "displayName", default=smtp),
                "primarySmtpAddress": smtp,
                "mail": smtp,
                "upn": lookup_key or smtp,
                "accountEnabled": enabled_value,
                "recipientTypeDetails": _payload_value(m, "RecipientTypeDetails", "recipientTypeDetails", default="UserMailbox"),
                "whenCreated": _payload_value(m, "WhenCreated", "whenCreated", "CreatedDateTime", "createdDateTime"),
            })
        if result:
            return result
    result = []
    for m in (snap.get("assessment_user_mailboxes") or []):
        if not isinstance(m, dict):
            continue
        smtp = m.get("PrimarySmtpAddress") or ""
        user_info = user_index.get(str(smtp).strip().lower()) or {}
        enabled_value = user_info.get("accountEnabled")
        if enabled_value is None:
            enabled_value = True
        result.append({
            "id": smtp,
            "displayName": m.get("DisplayName") or "",
            "primarySmtpAddress": smtp,
            "mail": smtp,
            "upn": smtp,
            "accountEnabled": enabled_value,
            "recipientTypeDetails": "UserMailbox",
            "whenCreated": m.get("WhenCreated"),
        })
    return result


def _snapshot_as_mailbox_detail(tid: str, uid: str) -> Optional[Dict[str, Any]]:
    """Looks up a single mailbox from snapshot by id or email, returns detail-shape or None."""
    snap = _latest_assessment_snapshot_for_tenant(tid)
    user_index: Dict[str, Dict[str, Any]] = {}
    for user in (snap.get("assessment_users") or []):
        if not isinstance(user, dict):
            continue
        keys = {
            str(user.get("userPrincipalName") or "").strip().lower(),
            str(user.get("mail") or "").strip().lower(),
        }
        for key in keys:
            if key:
                user_index[key] = user
    for m in (snap.get("assessment_user_mailboxes") or []):
        if not isinstance(m, dict):
            continue
        smtp = m.get("PrimarySmtpAddress") or ""
        name = m.get("DisplayName") or ""
        if smtp.lower() == uid.lower() or name.lower() == uid.lower():
            user_info = user_index.get(smtp.lower()) or {}
            return {
                "ok": True,
                "id": smtp,
                "displayName": name,
                "mail": smtp,
                "upn": smtp,
                "department": user_info.get("department"),
                "jobTitle": user_info.get("jobTitle"),
                "office": user_info.get("officeLocation"),
                "mobile": user_info.get("mobilePhone"),
                "accountEnabled": user_info.get("accountEnabled", True),
                "timezone": None,
                "language": user_info.get("preferredLanguage"),
                "autoReply": {"status": "disabled"},
                "forwarding": {"enabled": False, "address": None},
                "_source": "assessment_snapshot",
            }
    return None


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


_ZT_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-ZeroTrustAssessment.ps1"


def _run_zerotrust_ps(tenant_id: str, action: str, output_folder: str = "", force_interactive: bool = False) -> Dict[str, Any]:
    """Roept de Zero Trust Assessment PS wrapper aan."""
    profile = _zt_auth_profile_summary(tenant_id)
    ps_script = _ZT_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"ZeroTrust script niet gevonden: {ps_script}")
    pwsh = shutil.which("pwsh") or shutil.which("powershell")
    if not pwsh:
        raise RuntimeError("PowerShell niet gevonden")
    cmd = [pwsh, "-NoProfile", "-File", str(ps_script), "-Action", action]
    if action != "run":
        cmd.insert(1, "-NonInteractive")
    if profile.get("tenant_id"):
        cmd += ["-TenantId", profile["tenant_id"]]
    if profile.get("client_id"):
        cmd += ["-ClientId", profile["client_id"]]
    if output_folder:
        cmd += ["-OutputFolder", output_folder]
    if force_interactive:
        cmd += ["-ForceInteractive"]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=86400,
            cwd=str(PLATFORM_DIR / "assessment-engine"),
        )
        output = (proc.stdout or "") + (proc.stderr or "")
        if "##RESULT##" in output:
            return json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Timeout: assessment duurt te lang"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    return {"ok": False, "error": "Geen output van PS script"}


ZT_REFERENCE_PERMISSIONS = {
    "AuditLog.Read.All",
    "CrossTenantInformation.ReadBasic.All",
    "DeviceManagementApps.Read.All",
    "DeviceManagementConfiguration.Read.All",
    "DeviceManagementManagedDevices.Read.All",
    "DeviceManagementRBAC.Read.All",
    "DeviceManagementServiceConfig.Read.All",
    "Directory.Read.All",
    "DirectoryRecommendations.Read.All",
    "EntitlementManagement.Read.All",
    "IdentityRiskEvent.Read.All",
    "IdentityRiskyUser.Read.All",
    "IdentityRiskyServicePrincipal.Read.All",
    "NetworkAccess.Read.All",
    "Policy.Read.All",
    "Policy.Read.ConditionalAccess",
    "Policy.Read.PermissionGrant",
    "PrivilegedAccess.Read.AzureAD",
    "Reports.Read.All",
    "RoleManagement.Read.All",
    "UserAuthenticationMethod.Read.All",
}


def _zt_auth_profile_summary(tenant_id: str) -> Dict[str, Any]:
    cfg = load_config()
    tenant_auth_id = (cfg.get("auth_tenant_id") or "").strip()
    client_id = (cfg.get("auth_client_id") or "").strip()
    source = "msp_admin" if (tenant_auth_id or client_id) else "none"
    app_auth_ready = bool(client_id and tenant_auth_id)
    return {
        "tenant_id": tenant_auth_id,
        "client_id": client_id,
        "source": source,
        "app_auth_ready": app_auth_ready,
        "preferred_auth_mode": "app" if app_auth_ready else "interactive",
        "fallback_reason": "" if app_auth_ready else "Er is nog geen complete MSP Admin app-registratie gekoppeld voor Zero Trust.",
        "auth_note": (
            "Zero Trust gebruikt de app-registratie uit MSP Admin voor tenant- en clientkoppeling. Authenticatie verloopt in deze flow via browser-login; certificaat-thumbprints worden voor Zero Trust niet gebruikt."
            if app_auth_ready else
            "Koppel eerst Tenant ID en Client ID in MSP Admin om de Zero Trust app-registratie te gebruiken."
        ),
    }


def _zt_linked_app_registration(tenant_id: str, client_id: str) -> Dict[str, Any]:
    client_id = (client_id or "").strip()
    if not client_id:
        return {}

    try:
        data = _run_appregs_ps(tenant_id, "get-appreg", {"app_id": client_id})
        if isinstance(data, dict) and data.get("ok") is not False:
            return data
    except Exception:
        pass

    snap = _latest_assessment_snapshot_for_tenant(tenant_id)
    payload = _assessment_json_payload(snap, "apps", "registrations")
    if isinstance(payload, dict):
        for item in payload.get("items") or []:
            if not isinstance(item, dict):
                continue
            if (_payload_value(item, "AppId", "appId", default="") or "").lower() != client_id.lower():
                continue
            perms = _payload_value(item, "Permissions", "permissions", default=None)
            return _attach_source_meta({
                "ok": True,
                "displayName": _payload_value(item, "DisplayName", "displayName", default=""),
                "appId": _payload_value(item, "AppId", "appId", default=""),
                "signInAudience": None,
                "createdAt": _payload_value(item, "CreatedDateTime", "createdAt"),
                "hasEnterpriseApp": bool(_payload_value(item, "HasEnterpriseApp", "hasEnterpriseApp", default=False)),
                "secrets": ([{"hint": "•••", "statusLabel": _payload_value(item, "SecretExpirationStatus", "secretExpirationStatus")}]
                            if int(_payload_value(item, "SecretCount", "secretCount", default=0) or 0) > 0 else []),
                "certs": ([{"type": "Certificate", "statusLabel": _payload_value(item, "CertificateExpirationStatus", "certificateExpirationStatus")}]
                          if int(_payload_value(item, "CertificateCount", "certificateCount", default=0) or 0) > 0 else []),
                "redirectUris": [],
                "identifierUris": [],
                "requiredResourceAccess": [],
                "permissions": list(perms) if isinstance(perms, list) else [],
            }, "assessment_snapshot", tenant_id=tenant_id)
    return {}


def _zt_permission_summary(app_data: Dict[str, Any]) -> Dict[str, Any]:
    permissions = app_data.get("permissions") if isinstance(app_data, dict) else None
    normalized = []
    seen = set()
    for item in permissions or []:
        if not isinstance(item, dict):
            continue
        name = (item.get("Permission") or item.get("permission") or item.get("value") or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append({
            "resource": (item.get("Resource") or item.get("resource") or "Onbekend").strip(),
            "type": (item.get("Type") or item.get("type") or "").strip(),
            "permission": name,
            "is_reference": name in ZT_REFERENCE_PERMISSIONS,
        })

    configured_names = {item["permission"] for item in normalized}
    missing_reference = sorted(ZT_REFERENCE_PERMISSIONS - configured_names)
    additional_permissions = [item for item in normalized if not item["is_reference"]]

    return {
        "reference_permissions": sorted(ZT_REFERENCE_PERMISSIONS),
        "configured_permissions": normalized,
        "configured_count": len(normalized),
        "reference_count": len(ZT_REFERENCE_PERMISSIONS),
        "additional_permissions": additional_permissions,
        "additional_count": len(additional_permissions),
        "has_additional_permissions": bool(additional_permissions),
        "missing_reference_permissions": missing_reference,
        "missing_reference_count": len(missing_reference),
        "reference_note": "Vergelijking op basis van de Microsoft Learn Zero Trust Assessment permissielijst voor Connect-ZtAssessment.",
    }


def _zt_output_folder(tenant_id: str) -> str:
    """Standaard outputpad voor ZT-rapporten per tenant (binnen storage — schrijfbaar door service)."""
    base = STORAGE_DIR / "zerotrust_reports" / tenant_id
    base.mkdir(parents=True, exist_ok=True)
    return str(base)


def _zt_status_path(tenant_id: str) -> Path:
    return Path(_zt_output_folder(tenant_id)) / "_status.json"


def _zt_log_path(tenant_id: str) -> Path:
    return Path(_zt_output_folder(tenant_id)) / "zerotrust.log"


def _zt_write_status(tenant_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(payload or {})
    data["updated_at"] = now_iso()
    path = _zt_status_path(tenant_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def _zt_read_status(tenant_id: str) -> Dict[str, Any]:
    path = _zt_status_path(tenant_id)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _zt_append_log(tenant_id: str, message: str) -> None:
    path = _zt_log_path(tenant_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%H:%M:%S")
    with path.open("a", encoding="utf-8") as fh:
        fh.write(f"[{stamp}] {message}\n")


def _zt_tail_log(tenant_id: str, limit: int = 40) -> List[str]:
    path = _zt_log_path(tenant_id)
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        return lines[-max(1, min(limit, 200)):]
    except Exception:
        return []


def _zt_clear_log(tenant_id: str) -> None:
    path = _zt_log_path(tenant_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("", encoding="utf-8")


def _run_zerotrust_worker(tenant_id: str, action: str, output_folder: str = "", force_interactive: bool = False) -> Dict[str, Any]:
    profile = _zt_auth_profile_summary(tenant_id)
    ps_script = _ZT_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"ZeroTrust script niet gevonden: {ps_script}")
    pwsh = shutil.which("pwsh") or shutil.which("powershell")
    if not pwsh:
        raise RuntimeError("PowerShell niet gevonden")

    cmd = [pwsh, "-NoProfile", "-File", str(ps_script), "-Action", action]
    if action != "run":
        cmd.insert(1, "-NonInteractive")
    if profile.get("tenant_id"):
        cmd += ["-TenantId", profile["tenant_id"]]
    if profile.get("client_id"):
        cmd += ["-ClientId", profile["client_id"]]
    if output_folder:
        cmd += ["-OutputFolder", output_folder]
    if force_interactive:
        cmd += ["-ForceInteractive"]

    _zt_clear_log(tenant_id)
    _zt_append_log(tenant_id, f"Actie gestart: {action}")
    if force_interactive:
        _zt_append_log(tenant_id, "Interactieve browser-login is afgedwongen voor deze run.")
    _zt_append_log(tenant_id, "Command: " + " ".join(cmd))

    result_payload: Dict[str, Any] = {}
    output_lines: List[str] = []
    proc = None
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(PLATFORM_DIR / "assessment-engine"),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert proc.stdout is not None
        for raw_line in proc.stdout:
            line = raw_line.rstrip("\r\n")
            output_lines.append(line)
            if line.startswith("##RESULT##"):
                try:
                    result_payload = json.loads(line.split("##RESULT##", 1)[1].strip())
                except Exception:
                    result_payload = {"ok": False, "error": "Kon JSON-resultaat niet parsen."}
                continue
            if line.strip():
                _zt_append_log(tenant_id, line)

        rc = proc.wait(timeout=86400)
        _zt_append_log(tenant_id, f"Proces voltooid met exit code {rc}")
        if not result_payload:
            combined = "\n".join(output_lines[-20:])
            result_payload = {
                "ok": False,
                "error": "Geen output van PS script",
                "returncode": rc,
                "output_tail": combined,
            }
        return result_payload
    except subprocess.TimeoutExpired:
        if proc:
            proc.kill()
        _zt_append_log(tenant_id, "Timeout: assessment duurt te lang")
        return {"ok": False, "error": "Timeout: assessment duurt te lang"}
    except Exception as e:
        _zt_append_log(tenant_id, f"Fout: {e}")
        return {"ok": False, "error": str(e)}


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
            storage_gb = _payload_value(item, "StorageUsedGB", "storageUsedGB", "StorageUsed", "storageUsed")
            storage_gb = _sharepoint_storage_to_gb(storage_gb)
            storage_label = "—"
            if storage_gb not in (None, ""):
                storage_label = f"{storage_gb} GB"
            is_inactive = bool(_payload_value(item, "IsInactive", "isInactive", default=False))
            result.append({
                "id": _payload_value(item, "Id", "id", "WebUrl", "webUrl", "DisplayName", "displayName", default=""),
                "displayName": _payload_value(item, "DisplayName", "displayName", default=""),
                "webUrl": _payload_value(item, "WebUrl", "webUrl"),
                "createdAt": _payload_value(item, "CreatedDateTime", "createdDateTime"),
                "lastModified": _payload_value(item, "LastModifiedDateTime", "lastModifiedDateTime"),
                "isRootSite": bool(_payload_value(item, "IsRootSite", "isRootSite", default=False)),
                "storageUsed": storage_gb,
                "storageLabel": storage_label,
                "status": "Inactief" if is_inactive else "Actief",
                "isInactive": is_inactive,
            })
        if result:
            return result
    raw = _snapshot_raw(tid)
    items = raw.get("SharePointSites") or []
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        storage_gb = _sharepoint_storage_to_gb(item.get("StorageUsedGB") if item.get("StorageUsedGB") not in (None, "") else item.get("storageUsed"))
        storage_label = "—"
        if storage_gb not in (None, ""):
            storage_label = f"{storage_gb} GB"
        is_inactive = bool(item.get("IsInactive")) if item.get("IsInactive") is not None else (str(item.get("status") or "").lower() == "inactief")
        result.append({
            "id": item.get("Id") or item.get("id") or item.get("WebUrl") or item.get("DisplayName") or "",
            "displayName": item.get("DisplayName") or item.get("displayName") or "",
            "webUrl": item.get("WebUrl") or item.get("webUrl"),
            "createdAt": item.get("CreatedDateTime") or item.get("createdDateTime"),
            "lastModified": item.get("LastModifiedDateTime") or item.get("lastModifiedDateTime"),
            "isRootSite": bool(item.get("IsRootSite")) if item.get("IsRootSite") is not None else False,
            "storageUsed": storage_gb,
            "storageLabel": storage_label,
            "status": "Inactief" if is_inactive else "Actief",
            "isInactive": is_inactive,
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
        "enabled": bool(load_config().get("assessment_ui_v1", True)),
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


def gather_artifacts(run_id: str, run_dir: Path) -> Dict[str, Optional[str]]:
    report = find_latest_report_file(run_dir)
    summary = find_latest_summary_file(run_dir)
    result = {"report_path": None, "snapshot_path": None, "report_filename": None, "json_manifest_path": None}
    if report:
        rel = report.relative_to(run_dir).as_posix()
        result["report_path"] = f"/reports/{run_id}/{rel}"
        result["report_filename"] = report.name
    if summary:
        rel = summary.relative_to(run_dir).as_posix()
        result["snapshot_path"] = f"/reports/{run_id}/{rel}"
    result["json_manifest_path"] = _run_json_manifest_path(run_dir)
    return result


def associate_run_to_tenant_by_summary(run_id: str, stats: Dict[str, Any]) -> None:
    """Bind/merge run to tenant based on snapshot TenantId (summary JSON)."""
    parsed_tenant_id = (stats.get("tenantId") or "").strip() if isinstance(stats, dict) else ""
    parsed_tenant_name = (stats.get("tenantName") or "").strip() if isinstance(stats, dict) else ""
    if not parsed_tenant_id:
        return

    run = db_fetchone("SELECT * FROM assessment_runs WHERE id=?", (run_id,))
    if not run:
        return
    original_tenant_id = run.get("tenant_id")
    current_tenant = db_fetchone("SELECT * FROM tenants WHERE id=?", (run["tenant_id"],))
    if not current_tenant:
        return

    current_guid = (current_tenant.get("tenant_guid") or "").strip()

    # Case 1: current tenant has no GUID yet -> enrich it
    if not current_guid:
        db_execute(
            "UPDATE tenants SET tenant_guid=?, tenant_name=COALESCE(NULLIF(?, ''), tenant_name), updated_at=? WHERE id=?",
            (parsed_tenant_id, parsed_tenant_name, now_iso(), current_tenant["id"]),
        )
        _invalidate_tenant_perf_cache(current_tenant["id"])
        return

    # Case 2: current tenant already matches parsed tenant GUID -> optional name refresh
    if current_guid.lower() == parsed_tenant_id.lower():
        if parsed_tenant_name and parsed_tenant_name != current_tenant.get("tenant_name"):
            db_execute(
                "UPDATE tenants SET tenant_name=?, updated_at=? WHERE id=?",
                (parsed_tenant_name, now_iso(), current_tenant["id"]),
            )
            _invalidate_tenant_perf_cache(current_tenant["id"])
        return

    # Case 3: mismatch -> look for existing tenant with parsed GUID and move run there
    existing = db_fetchone("SELECT * FROM tenants WHERE lower(COALESCE(tenant_guid,''))=lower(?) LIMIT 1", (parsed_tenant_id,))
    if existing:
        db_execute("UPDATE assessment_runs SET tenant_id=? WHERE id=?", (existing["id"], run_id))
        _invalidate_tenant_perf_cache(original_tenant_id)
        _invalidate_tenant_perf_cache(existing["id"])
        return

    # Case 4: no matching tenant exists -> create one and move run
    new_tenant = create_tenant(
        {
            "customer_name": parsed_tenant_name or "Auto-detected tenant",
            "tenant_name": parsed_tenant_name or "Auto-detected tenant",
            "tenant_guid": parsed_tenant_id,
            "notes": "Automatisch aangemaakt op basis van gegenereerd rapport (TenantId match).",
        }
    )
    if new_tenant and new_tenant.get("id"):
        db_execute("UPDATE assessment_runs SET tenant_id=? WHERE id=?", (new_tenant["id"], run_id))
        _invalidate_tenant_perf_cache(original_tenant_id)
        _invalidate_tenant_perf_cache(new_tenant["id"])


def import_run_snapshots_to_db(run_id: str) -> int:
    """After a completed run, import all portal JSON payloads into m365_snapshots.

    Returns the number of snapshots written.
    """
    run = db_fetchone("SELECT tenant_id, completed_at FROM assessment_runs WHERE id=?", (run_id,))
    if not run or not run.get("tenant_id"):
        return 0
    tenant_id = run["tenant_id"]
    generated_at = run.get("completed_at") or now_iso()
    run_dir = RUNS_DIR / run_id
    payloads = _load_assessment_json_payloads(run_dir)
    if not payloads:
        return 0
    written = 0
    for (section, subsection), payload in payloads.items():
        snap_id = str(uuid.uuid4())
        # Build a lightweight summary: top-level string/int values only
        summary: Dict[str, Any] = {
            k: v for k, v in payload.items()
            if isinstance(v, (str, int, float, bool)) and k not in ("_source", "_generated_at", "_stale")
        }
        db_execute(
            "INSERT OR REPLACE INTO m365_snapshots "
            "(id, tenant_id, section, subsection, source_type, generated_at, data_json, summary_json, assessment_run_id) "
            "VALUES (?, ?, ?, ?, 'assessment', ?, ?, ?, ?)",
            (
                snap_id, tenant_id, section, subsection,
                generated_at,
                json.dumps(payload, ensure_ascii=False),
                json.dumps(summary, ensure_ascii=False),
                run_id,
            ),
        )
        written += 1
    logger.info("import_run_snapshots_to_db: %d snapshots written for run %s (tenant %s)", written, run_id, tenant_id)
    return written


# =============================================================================
# KB (Knowledge Base) — thin wrappers rond services/kb_service.py
# =============================================================================
# Alle KB-logica is verplaatst naar services/kb_service.py.
# Deze wrappers voegen app-niveau context toe (snapshot + sku lookup)
# voor de twee functies die dat nodig hebben.

def kb_list_domains(tid: str) -> List[Dict[str, Any]]:
    """KB-domeinen verrijkt met assessment DNS-checks."""
    return _kb_list_domains_raw(tid, get_snapshot=_latest_assessment_snapshot_for_tenant)


def kb_get_m365_profile(tid: str) -> Dict[str, Any]:
    """M365-profiel verrijkt met assessment-snapshot en SKU-namen."""
    return _kb_get_m365_profile_raw(
        tid,
        get_snapshot=_latest_assessment_snapshot_for_tenant,
        get_sku_friendly_name=get_sku_friendly_name,
    )


# =============================================================================

# ══════════════════════════════════════════════════════════════════════════════
# REMEDIATION — catalogus, uitvoering en geschiedenis
# ══════════════════════════════════════════════════════════════════════════════

REMEDIATION_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "enable-security-defaults",
        "title": "Security Defaults inschakelen",
        "description": "Schakelt Microsoft Security Defaults in voor de tenant. Vereist MFA voor alle gebruikers en blokkeert legacy authenticatie. Incompatibel met bestaande Conditional Access policies.",
        "category": "identity",
        "category_label": "Identiteit & Toegang",
        "severity": "critical",
        "risk": "low",
        "risk_label": "Laag risico",
        "dry_run_supported": True,
        "params_schema": [],
        "graph_endpoint": "PATCH /policies/identitySecurityDefaultsEnforcementPolicy",
        "permissions_required": ["Policy.ReadWrite.ConditionalAccess"],
        "tags": ["mfa", "baseline", "security-defaults"],
    },
    {
        "id": "block-legacy-auth",
        "title": "Legacy authenticatie blokkeren (CA Policy)",
        "description": "Maakt een Conditional Access policy aan die SMTP, POP3, IMAP en andere legacy protocollen blokkeert voor alle gebruikers. Controleer eerst of geen kritieke systemen hiervan afhankelijk zijn.",
        "category": "identity",
        "category_label": "Identiteit & Toegang",
        "severity": "critical",
        "risk": "medium",
        "risk_label": "Middel risico",
        "dry_run_supported": True,
        "params_schema": [],
        "graph_endpoint": "POST /identity/conditionalAccess/policies",
        "permissions_required": ["Policy.ReadWrite.ConditionalAccess"],
        "tags": ["legacy-auth", "ca-policy"],
    },
    {
        "id": "require-mfa-all-users",
        "title": "MFA vereisen voor alle gebruikers (CA Policy)",
        "description": "Maakt een Conditional Access policy aan die multifactorauthenticatie verplicht stelt voor alle gebruikers bij alle cloud-apps. Zorg dat alle gebruikers MFA al hebben ingesteld voor activatie.",
        "category": "identity",
        "category_label": "Identiteit & Toegang",
        "severity": "critical",
        "risk": "medium",
        "risk_label": "Middel risico",
        "dry_run_supported": True,
        "params_schema": [],
        "graph_endpoint": "POST /identity/conditionalAccess/policies",
        "permissions_required": ["Policy.ReadWrite.ConditionalAccess"],
        "tags": ["mfa", "ca-policy", "all-users"],
    },
    {
        "id": "revoke-user-sessions",
        "title": "Alle sessies intrekken voor gebruiker",
        "description": "Forceert uitloggen van alle actieve sessies voor een opgegeven gebruiker. Gebruik bij verdachte activiteit, gecompromitteerd account of offboarding.",
        "category": "identity",
        "category_label": "Identiteit & Toegang",
        "severity": "warning",
        "risk": "low",
        "risk_label": "Laag risico",
        "dry_run_supported": True,
        "params_schema": [
            {"name": "user_upn", "label": "Gebruiker (UPN/e-mail)", "type": "text", "required": True, "placeholder": "gebruiker@bedrijf.nl"},
        ],
        "graph_endpoint": "POST /users/{id}/revokeSignInSessions",
        "permissions_required": ["User.ReadWrite.All"],
        "tags": ["sessions", "offboarding", "incident-response"],
    },
    {
        "id": "disable-user",
        "title": "Gebruikersaccount blokkeren",
        "description": "Blokkeert het opgegeven account zodat de gebruiker niet meer kan inloggen. Het account blijft intact voor auditing en mailbox-delegatie.",
        "category": "identity",
        "category_label": "Identiteit & Toegang",
        "severity": "warning",
        "risk": "medium",
        "risk_label": "Middel risico",
        "dry_run_supported": True,
        "params_schema": [
            {"name": "user_upn", "label": "Gebruiker (UPN/e-mail)", "type": "text", "required": True, "placeholder": "gebruiker@bedrijf.nl"},
        ],
        "graph_endpoint": "PATCH /users/{id}",
        "permissions_required": ["User.ReadWrite.All"],
        "tags": ["account", "offboarding", "incident-response"],
    },
    {
        "id": "enable-modern-auth",
        "title": "Modern authenticatie inschakelen (Exchange)",
        "description": "Schakelt moderne authenticatie in voor Exchange Online. Vereist voor MFA-ondersteuning in oudere Outlook-clients. Vereist Exchange Online PowerShell — zie instructies.",
        "category": "mail",
        "category_label": "E-mail & Beveiliging",
        "severity": "warning",
        "risk": "low",
        "risk_label": "Laag risico",
        "dry_run_supported": True,
        "params_schema": [],
        "graph_endpoint": "Exchange Online PowerShell",
        "permissions_required": ["Exchange.ManageAsApp"],
        "tags": ["email", "modern-auth", "exchange"],
    },
    {
        "id": "set-outbound-spam-filter",
        "title": "Uitgaand spamfilter aanscherpen",
        "description": "Configureert het uitgaande spamfilter in Exchange Online om mailmisbruik te detecteren. Vereist Exchange Online PowerShell — zie instructies.",
        "category": "mail",
        "category_label": "E-mail & Beveiliging",
        "severity": "warning",
        "risk": "low",
        "risk_label": "Laag risico",
        "dry_run_supported": True,
        "params_schema": [],
        "graph_endpoint": "Exchange Online PowerShell",
        "permissions_required": ["Exchange.ManageAsApp"],
        "tags": ["email", "spam", "exchange"],
    },
    {
        "id": "restrict-guest-invitations",
        "title": "Gastuitnodigingen beperken tot admins",
        "description": "Past het autorisatiebeleid aan zodat alleen beheerders externe gastgebruikers kunnen uitnodigen. Voorkomt dat medewerkers onbeheerd externe toegang verlenen.",
        "category": "identity",
        "category_label": "Identiteit & Toegang",
        "severity": "warning",
        "risk": "low",
        "risk_label": "Laag risico",
        "dry_run_supported": True,
        "params_schema": [],
        "graph_endpoint": "PATCH /policies/authorizationPolicy",
        "permissions_required": ["Policy.ReadWrite.Authorization"],
        "tags": ["guests", "external-access", "governance"],
    },
    {
        "id": "enable-sspr",
        "title": "Self-Service Password Reset (SSPR) inschakelen",
        "description": "Schakelt Self-Service Password Reset in voor alle gebruikers via het authenticatiemethodenbeleid. Vermindert helpdeskbelasting en geeft gebruikers controle over hun eigen wachtwoord.",
        "category": "identity",
        "category_label": "Identiteit & Toegang",
        "severity": "info",
        "risk": "low",
        "risk_label": "Laag risico",
        "dry_run_supported": True,
        "params_schema": [],
        "graph_endpoint": "PATCH /policies/authenticationMethodsPolicy",
        "permissions_required": ["Policy.ReadWrite.AuthenticationMethod"],
        "tags": ["sspr", "password-reset", "self-service"],
    },
    {
        "id": "require-mfa-admins",
        "title": "MFA vereisen voor beheerders (CA Policy)",
        "description": "Maakt een Conditional Access policy aan die MFA verplicht stelt voor alle gebruikers met een beheerdersrol. Minder ingrijpend dan MFA voor alle gebruikers — ideale eerste stap.",
        "category": "identity",
        "category_label": "Identiteit & Toegang",
        "severity": "critical",
        "risk": "low",
        "risk_label": "Laag risico",
        "dry_run_supported": True,
        "params_schema": [],
        "graph_endpoint": "POST /identity/conditionalAccess/policies",
        "permissions_required": ["Policy.ReadWrite.ConditionalAccess"],
        "tags": ["mfa", "admins", "ca-policy", "privileged"],
    },
]

_REMEDIATION_BY_ID: Dict[str, Dict[str, Any]] = {r["id"]: r for r in REMEDIATION_CATALOG}


def get_remediation_catalog(category: Optional[str] = None) -> List[Dict[str, Any]]:
    if category:
        return [r for r in REMEDIATION_CATALOG if r.get("category") == category]
    return list(REMEDIATION_CATALOG)


def list_remediation_history(tenant_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    rows = db_fetchall(
        "SELECT * FROM remediation_history WHERE tenant_id=? ORDER BY executed_at DESC LIMIT ?",
        (tenant_id, limit),
    )
    for r in rows:
        try:
            r["result"] = json.loads(r.get("result_json") or "{}")
        except Exception:
            r["result"] = {}
    return rows


def execute_remediation(
    tenant_id: str,
    remediation_id: str,
    params: Dict[str, Any],
    dry_run: bool,
    executed_by: str,
) -> Dict[str, Any]:
    """
    Voert een remediation uit via PowerShell/Graph API.
    Logt het resultaat in remediation_history.
    """
    remediation = _REMEDIATION_BY_ID.get(remediation_id)
    if not remediation:
        raise ValueError(f"Onbekende remediation-ID: {remediation_id}")
    if dry_run and not remediation.get("dry_run_supported"):
        raise ValueError(f"Dry-run wordt niet ondersteund voor: {remediation_id}")

    tenant = db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,))
    if not tenant:
        raise ValueError("Tenant niet gevonden")

    tenant_guid = (tenant.get("tenant_guid") or "").strip()
    if not tenant_guid:
        raise ValueError(
            "Tenant GUID niet geconfigureerd. "
            "Vul de Tenant GUID in bij Admin > Tenants voordat je remediations uitvoert."
        )

    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    cfg = load_config()
    client_id   = (profile.get("auth_client_id") or cfg.get("auth_client_id") or "").strip()
    cert_thumb  = (profile.get("auth_cert_thumbprint") or cfg.get("auth_cert_thumbprint") or "").strip()
    client_sec  = (profile.get("auth_client_secret") or cfg.get("auth_client_secret") or "").strip()

    if not client_id:
        raise ValueError(
            "App-registratie (Client ID) niet geconfigureerd. "
            "Stel dit in via Admin > Tenant-instellingen."
        )

    ps_script = (PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyRemediation.ps1").resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Remediation-script niet gevonden: {ps_script}")

    pwsh = shutil.which("pwsh") or shutil.which("powershell")
    if not pwsh:
        raise RuntimeError("PowerShell niet gevonden op dit systeem.")

    params_json_str = json.dumps(params, ensure_ascii=False)

    cmd = [
        pwsh, "-NoLogo", "-NoProfile", "-NonInteractive",
        "-File", str(ps_script),
        "-RemediationId", remediation_id,
        "-TenantId", tenant_guid,
        "-ClientId", client_id,
        "-ParamsJson", params_json_str,
    ]
    if cert_thumb:
        cmd += ["-CertThumbprint", cert_thumb]
    if dry_run:
        cmd.append("-DryRun")

    env = os.environ.copy()
    if client_sec and not cert_thumb:
        env["M365_CLIENT_SECRET"] = client_sec

    result_data: Dict[str, Any] = {}
    error_message: Optional[str] = None
    status = "success"

    try:
        proc = subprocess.run(
            cmd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        output = (proc.stdout or "").strip()
        if proc.returncode != 0:
            status = "failed"
            error_message = output[-2000:] if output else f"PowerShell exit code {proc.returncode}"
        else:
            marker = "##RESULT##"
            if marker in output:
                json_part = output[output.rfind(marker) + len(marker):].strip()
                try:
                    result_data = json.loads(json_part)
                except Exception:
                    result_data = {"raw_output": output[-500:]}
            else:
                result_data = {"output": output[-500:]}
    except subprocess.TimeoutExpired:
        status = "failed"
        error_message = "Remediation timed out (120s)"
    except Exception as exc:
        status = "failed"
        error_message = str(exc)

    final_status = status
    if dry_run and status == "success":
        final_status = "dry_run"

    history_id = str(uuid.uuid4())
    db_execute(
        """
        INSERT INTO remediation_history
        (id, tenant_id, remediation_id, title, executed_by, executed_at,
         status, dry_run, params_json, result_json, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            history_id, tenant_id, remediation_id, remediation["title"],
            executed_by, now_iso(), final_status, 1 if dry_run else 0,
            params_json_str,
            json.dumps(result_data, ensure_ascii=False) if result_data else None,
            error_message,
        ),
    )

    db_audit(
        executed_by, "", "remediation_executed",
        "tenant", tenant_id,
        f"remediation_id={remediation_id} dry_run={dry_run} status={final_status}",
    )

    ok = (status == "success")
    msg = (result_data.get("message") if isinstance(result_data, dict) else None) \
          or (error_message if not ok else f"{remediation['title']} uitgevoerd.")

    return {
        "ok": ok,
        "message": msg,
        "history_id": history_id,
        "result": result_data if ok else {},
    }


# ══════════════════════════════════════════════════════════════════════════════
# USER MANAGEMENT — gebruikers beheer via Graph API (Fase 2)
# ══════════════════════════════════════════════════════════════════════════════

_USER_MGMT_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyUserManagement.ps1"


def _run_user_mgmt(
    tenant_id: str,
    action: str,
    params: Dict[str, Any],
    dry_run: bool = False,
    executed_by: str = "admin",
) -> Dict[str, Any]:
    """Voert een user-management actie uit via PowerShell en logt het resultaat."""
    tenant = db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,))
    if not tenant:
        raise ValueError("Tenant niet gevonden")

    tenant_guid = (tenant.get("tenant_guid") or "").strip()
    if not tenant_guid:
        raise ValueError(
            "Tenant GUID niet geconfigureerd. "
            "Vul de Tenant GUID in bij Admin > Tenants."
        )

    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    cfg = load_config()
    client_id  = (profile.get("auth_client_id") or cfg.get("auth_client_id") or "").strip()
    cert_thumb = (profile.get("auth_cert_thumbprint") or cfg.get("auth_cert_thumbprint") or "").strip()
    client_sec = (profile.get("auth_client_secret") or cfg.get("auth_client_secret") or "").strip()

    if not client_id:
        raise ValueError(
            "App-registratie (Client ID) niet geconfigureerd. "
            "Stel dit in via Admin > Tenant-instellingen."
        )

    ps_script = _USER_MGMT_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"User-management script niet gevonden: {ps_script}")

    pwsh = shutil.which("pwsh") or shutil.which("powershell")
    if not pwsh:
        raise RuntimeError("PowerShell niet gevonden op dit systeem.")

    params_json_str = json.dumps(params, ensure_ascii=False)

    cmd = [
        pwsh, "-NoLogo", "-NoProfile", "-NonInteractive",
        "-File", str(ps_script),
        "-Action", action,
        "-TenantId", tenant_guid,
        "-ClientId", client_id,
        "-ParamsJson", params_json_str,
    ]
    if cert_thumb:
        cmd += ["-CertThumbprint", cert_thumb]
    if client_sec and not cert_thumb:
        cmd += ["-ClientSecret", client_sec]
    if dry_run:
        cmd.append("-DryRun")

    result_data: Dict[str, Any] = {}
    error_message: Optional[str] = None
    status = "success"

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        output = (proc.stdout or "").strip()
        if proc.returncode != 0:
            status = "failed"
            error_message = output[-2000:] if output else f"PowerShell exit code {proc.returncode}"
        else:
            marker = "##RESULT##"
            if marker in output:
                json_part = output[output.rfind(marker) + len(marker):].strip()
                try:
                    result_data = json.loads(json_part)
                except Exception:
                    result_data = {"raw_output": output[-500:]}
            else:
                result_data = {"output": output[-500:]}
    except subprocess.TimeoutExpired:
        status = "failed"
        error_message = "Actie timed out (120s)"
    except Exception as exc:
        status = "failed"
        error_message = str(exc)

    # Schrijf/muteer-acties loggen in provisioning_history
    if action in ("create-user", "offboard-user"):
        final_status = "dry_run" if (dry_run and status == "success") else status
        target_upn = params.get("userPrincipalName") or params.get("user_id") or ""
        target_display = params.get("displayName") or params.get("display_name") or target_upn
        db_execute(
            """
            INSERT INTO provisioning_history
            (id, tenant_id, action, target_upn, target_display_name, executed_by, executed_at,
             status, dry_run, params_json, result_json, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()), tenant_id, action, target_upn, target_display,
                executed_by, now_iso(), final_status, 1 if dry_run else 0,
                params_json_str,
                json.dumps(result_data, ensure_ascii=False) if result_data else None,
                error_message,
            ),
        )
        db_audit(
            executed_by, "", f"user_mgmt_{action}",
            "tenant", tenant_id,
            f"action={action} target={target_upn} dry_run={dry_run} status={final_status}",
        )

    ok = (status == "success")
    return {
        "ok": ok,
        "result": result_data if ok else {},
        "error": error_message if not ok else None,
    }


def list_provisioning_history(tenant_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    rows = db_fetchall(
        """SELECT * FROM provisioning_history
           WHERE tenant_id=? ORDER BY executed_at DESC LIMIT ?""",
        (tenant_id, limit),
    )
    for r in rows:
        try:
            r["result"] = json.loads(r.get("result_json") or "{}")
        except Exception:
            r["result"] = {}
    return rows


# ══════════════════════════════════════════════════════════════════════════════
# BASELINE & GOLD TENANT — Desired State Engine (Fase 3)
# ══════════════════════════════════════════════════════════════════════════════

_BASELINE_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyBaseline.ps1"


def _run_baseline_ps(
    tenant_id: str,
    action: str,
    params: Dict[str, Any],
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Voert een baseline-actie uit via PowerShell."""
    tenant = db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,))
    if not tenant:
        raise ValueError("Tenant niet gevonden")
    tenant_guid = (tenant.get("tenant_guid") or "").strip()
    if not tenant_guid:
        raise ValueError("Tenant GUID niet geconfigureerd.")

    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    cfg = load_config()
    client_id  = (profile.get("auth_client_id") or cfg.get("auth_client_id") or "").strip()
    cert_thumb = (profile.get("auth_cert_thumbprint") or cfg.get("auth_cert_thumbprint") or "").strip()
    client_sec = (profile.get("auth_client_secret") or cfg.get("auth_client_secret") or "").strip()

    if not client_id:
        raise ValueError("App-registratie (Client ID) niet geconfigureerd.")

    ps_script = _BASELINE_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Baseline-script niet gevonden: {ps_script}")

    pwsh = shutil.which("pwsh") or shutil.which("powershell")
    if not pwsh:
        raise RuntimeError("PowerShell niet gevonden.")

    params_json_str = json.dumps(params, ensure_ascii=False)
    cmd = [
        pwsh, "-NoLogo", "-NoProfile", "-NonInteractive",
        "-File", str(ps_script),
        "-Action", action,
        "-TenantId", tenant_guid,
        "-ClientId", client_id,
        "-ParamsJson", params_json_str,
    ]
    if cert_thumb:
        cmd += ["-CertThumbprint", cert_thumb]
    if client_sec and not cert_thumb:
        cmd += ["-ClientSecret", client_sec]
    if dry_run:
        cmd.append("-DryRun")

    result_data: Dict[str, Any] = {}
    error_message: Optional[str] = None
    status = "success"

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", timeout=180,
        )
        output = (proc.stdout or "").strip()
        if proc.returncode != 0:
            status = "failed"
            error_message = output[-2000:] if output else f"Exit code {proc.returncode}"
        else:
            marker = "##RESULT##"
            if marker in output:
                json_part = output[output.rfind(marker) + len(marker):].strip()
                try:
                    result_data = json.loads(json_part)
                except Exception:
                    result_data = {"raw_output": output[-500:]}
            else:
                result_data = {"output": output[-500:]}
    except subprocess.TimeoutExpired:
        status = "failed"
        error_message = "Baseline actie timed out (180s)"
    except Exception as exc:
        status = "failed"
        error_message = str(exc)

    return {"ok": status == "success", "result": result_data, "error": error_message}


# ── CRUD voor baselines ───────────────────────────────────────────────────────

def list_baselines() -> List[Dict[str, Any]]:
    rows = db_fetchall("SELECT * FROM baselines ORDER BY created_at DESC")
    for r in rows:
        try:
            cfg = json.loads(r.get("config_json") or "{}")
            cats = list(cfg.get("categories", {}).keys())
            r["categories"] = cats
            r["category_count"] = len(cats)
        except Exception:
            r["categories"] = []
            r["category_count"] = 0
        r.pop("config_json", None)   # Niet meesturen in lijstoverzicht
    return rows


def get_baseline(baseline_id: str) -> Optional[Dict[str, Any]]:
    row = db_fetchone("SELECT * FROM baselines WHERE id=?", (baseline_id,))
    if not row:
        return None
    try:
        row["config"] = json.loads(row.get("config_json") or "{}")
    except Exception:
        row["config"] = {}
    return row


def create_baseline(
    name: str,
    description: str,
    config: Dict[str, Any],
    source_tenant_id: Optional[str],
    source_tenant_name: Optional[str],
    created_by: str,
) -> Dict[str, Any]:
    if not name.strip():
        raise ValueError("Naam is verplicht")
    bid = str(uuid.uuid4())
    now = now_iso()
    db_execute(
        """INSERT INTO baselines
           (id, name, description, source_tenant_id, source_tenant_name,
            config_json, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (bid, name.strip(), description or "", source_tenant_id, source_tenant_name,
         json.dumps(config, ensure_ascii=False), created_by, now, now),
    )
    return get_baseline(bid)


def update_baseline(baseline_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    row = db_fetchone("SELECT id FROM baselines WHERE id=?", (baseline_id,))
    if not row:
        raise ValueError("Baseline niet gevonden")
    fields, vals = [], []
    if "name" in payload:
        fields.append("name=?"); vals.append(payload["name"].strip())
    if "description" in payload:
        fields.append("description=?"); vals.append(payload.get("description") or "")
    if "config" in payload:
        fields.append("config_json=?"); vals.append(json.dumps(payload["config"], ensure_ascii=False))
    if not fields:
        return get_baseline(baseline_id)
    fields.append("updated_at=?"); vals.append(now_iso())
    vals.append(baseline_id)
    db_execute(f"UPDATE baselines SET {', '.join(fields)} WHERE id=?", tuple(vals))
    return get_baseline(baseline_id)


def delete_baseline(baseline_id: str) -> Dict[str, Any]:
    row = db_fetchone("SELECT id FROM baselines WHERE id=?", (baseline_id,))
    if not row:
        raise ValueError("Baseline niet gevonden")
    db_execute("DELETE FROM baseline_assignments WHERE baseline_id=?", (baseline_id,))
    db_execute("DELETE FROM baseline_history WHERE baseline_id=?", (baseline_id,))
    db_execute("DELETE FROM baselines WHERE id=?", (baseline_id,))
    return {"ok": True}


# ── Assignments ───────────────────────────────────────────────────────────────

def list_assignments(baseline_id: Optional[str] = None, tenant_id: Optional[str] = None) -> List[Dict[str, Any]]:
    if baseline_id:
        rows = db_fetchall(
            """SELECT ba.*, b.name as baseline_name, t.customer_name as tenant_name
               FROM baseline_assignments ba
               JOIN baselines b ON ba.baseline_id = b.id
               JOIN tenants t ON ba.tenant_id = t.id
               WHERE ba.baseline_id=? ORDER BY ba.assigned_at DESC""",
            (baseline_id,)
        )
    elif tenant_id:
        rows = db_fetchall(
            """SELECT ba.*, b.name as baseline_name, t.customer_name as tenant_name
               FROM baseline_assignments ba
               JOIN baselines b ON ba.baseline_id = b.id
               JOIN tenants t ON ba.tenant_id = t.id
               WHERE ba.tenant_id=? ORDER BY ba.assigned_at DESC""",
            (tenant_id,)
        )
    else:
        rows = db_fetchall(
            """SELECT ba.*, b.name as baseline_name, t.customer_name as tenant_name
               FROM baseline_assignments ba
               JOIN baselines b ON ba.baseline_id = b.id
               JOIN tenants t ON ba.tenant_id = t.id
               ORDER BY ba.assigned_at DESC"""
        )
    for r in rows:
        try:
            r["compliance"] = json.loads(r.get("compliance_json") or "{}")
        except Exception:
            r["compliance"] = {}
    return rows


def assign_baseline(baseline_id: str, tenant_id: str, assigned_by: str) -> Dict[str, Any]:
    if not db_fetchone("SELECT id FROM baselines WHERE id=?", (baseline_id,)):
        raise ValueError("Baseline niet gevonden")
    if not db_fetchone("SELECT id FROM tenants WHERE id=?", (tenant_id,)):
        raise ValueError("Tenant niet gevonden")
    existing = db_fetchone(
        "SELECT id FROM baseline_assignments WHERE baseline_id=? AND tenant_id=?",
        (baseline_id, tenant_id)
    )
    if existing:
        raise ValueError("Baseline is al gekoppeld aan deze tenant")
    aid = str(uuid.uuid4())
    db_execute(
        """INSERT INTO baseline_assignments
           (id, baseline_id, tenant_id, assigned_by, assigned_at, status)
           VALUES (?, ?, ?, ?, ?, 'assigned')""",
        (aid, baseline_id, tenant_id, assigned_by, now_iso()),
    )
    create_action_log(
        tenant_id,
        "onboarding",
        "baseline",
        "baseline_assigned",
        {"baseline_id": baseline_id, "assigned_by": assigned_by},
    )
    db_audit(assigned_by, "", "baseline_assigned", "tenant", tenant_id, f"baseline_id={baseline_id}", tenant_id=tenant_id)
    return db_fetchone("SELECT * FROM baseline_assignments WHERE id=?", (aid,))


def unassign_baseline(baseline_id: str, tenant_id: str) -> Dict[str, Any]:
    db_execute(
        "DELETE FROM baseline_assignments WHERE baseline_id=? AND tenant_id=?",
        (baseline_id, tenant_id)
    )
    return {"ok": True}


def check_baseline_compliance(baseline_id: str, tenant_id: str, executed_by: str) -> Dict[str, Any]:
    baseline = get_baseline(baseline_id)
    if not baseline:
        raise ValueError("Baseline niet gevonden")

    config = baseline.get("config") or {}
    result = _run_baseline_ps(tenant_id, "compare-baseline", {"baseline_json": json.dumps(config, ensure_ascii=False)})

    compliance_data = result.get("result", {}) if result["ok"] else {}
    score = compliance_data.get("score", 0) if result["ok"] else 0
    status = "compliant" if score == 100 else ("non_compliant" if score < 80 else "partial")

    now = now_iso()
    db_execute(
        """UPDATE baseline_assignments
           SET last_checked_at=?, compliance_score=?, compliance_json=?, status=?
           WHERE baseline_id=? AND tenant_id=?""",
        (now, score, json.dumps(compliance_data, ensure_ascii=False), status, baseline_id, tenant_id),
    )
    db_execute(
        """INSERT INTO baseline_history
           (id, baseline_id, tenant_id, action, executed_by, executed_at, status, dry_run, result_json, error_message)
           VALUES (?, ?, ?, 'check', ?, ?, ?, 0, ?, ?)""",
        (str(uuid.uuid4()), baseline_id, tenant_id, executed_by, now,
         "success" if result["ok"] else "failed",
         json.dumps(compliance_data, ensure_ascii=False),
         result.get("error")),
    )
    db_audit(executed_by, "", "baseline_check", "tenant", tenant_id,
             f"baseline_id={baseline_id} score={score}")
    return {"ok": result["ok"], "score": score, "status": status, "compliance": compliance_data, "error": result.get("error")}


def apply_baseline_to_tenant(baseline_id: str, tenant_id: str, dry_run: bool, executed_by: str) -> Dict[str, Any]:
    baseline = get_baseline(baseline_id)
    if not baseline:
        raise ValueError("Baseline niet gevonden")

    config = baseline.get("config") or {}
    result = _run_baseline_ps(tenant_id, "apply-baseline", {"baseline_json": json.dumps(config, ensure_ascii=False)}, dry_run)

    result_data = result.get("result", {})
    final_status = "dry_run" if dry_run else ("success" if result["ok"] else "failed")

    now = now_iso()
    if not dry_run and result["ok"]:
        db_execute(
            "UPDATE baseline_assignments SET last_applied_at=?, status='applied' WHERE baseline_id=? AND tenant_id=?",
            (now, baseline_id, tenant_id),
        )
    db_execute(
        """INSERT INTO baseline_history
           (id, baseline_id, tenant_id, action, executed_by, executed_at, status, dry_run, result_json, error_message)
           VALUES (?, ?, ?, 'apply', ?, ?, ?, ?, ?, ?)""",
        (str(uuid.uuid4()), baseline_id, tenant_id, executed_by, now,
         final_status, 1 if dry_run else 0,
         json.dumps(result_data, ensure_ascii=False),
         result.get("error")),
    )
    db_audit(executed_by, "", "baseline_apply", "tenant", tenant_id,
             f"baseline_id={baseline_id} dry_run={dry_run} status={final_status}")
    return {"ok": result["ok"], "result": result_data, "error": result.get("error")}


def list_baseline_history(baseline_id: Optional[str] = None, tenant_id: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    if baseline_id and tenant_id:
        rows = db_fetchall(
            "SELECT * FROM baseline_history WHERE baseline_id=? AND tenant_id=? ORDER BY executed_at DESC LIMIT ?",
            (baseline_id, tenant_id, limit)
        )
    elif baseline_id:
        rows = db_fetchall(
            "SELECT * FROM baseline_history WHERE baseline_id=? ORDER BY executed_at DESC LIMIT ?",
            (baseline_id, limit)
        )
    else:
        rows = db_fetchall(
            "SELECT * FROM baseline_history ORDER BY executed_at DESC LIMIT ?",
            (limit,)
        )
    for r in rows:
        try:
            r["result"] = json.loads(r.get("result_json") or "{}")
        except Exception:
            r["result"] = {}
    return rows


# ── Intune / Device Management (Fase 4) ──────────────────────────────────────

_INTUNE_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyIntune.ps1"


def _run_intune_ps(tenant_id: str, action: str, params: Dict[str, Any], dry_run: bool = False, executed_by: str = "system") -> Dict[str, Any]:
    """Voer een Intune PS-actie uit en log naar intune_scan_history."""
    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _INTUNE_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Intune script niet gevonden: {ps_script}")

    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId",  profile["auth_tenant_id"],
        "-ClientId",  profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    if dry_run:
        cmd.append("-DryRun")

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    logger.info("[Intune] action=%s tenant=%s dry_run=%s exit=%s", action, tenant_id, dry_run, proc.returncode)

    result: Dict[str, Any] = {}
    if "##RESULT##" in output:
        try:
            result = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
        except Exception:
            result = {"ok": False, "error": "Kon resultaat niet parsen"}
    else:
        result = {"ok": False, "error": output[-500:] if output else "Geen output"}

    # Log in history
    final_status = "dry_run" if dry_run else ("success" if result.get("ok") else "failed")
    err_msg = result.get("error") if not result.get("ok") else None
    db_execute(
        "INSERT INTO intune_scan_history (id,tenant_id,action,executed_by,executed_at,status,dry_run,result_json,error_message) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (str(uuid.uuid4()), tenant_id, action, executed_by, now_iso(), final_status, int(dry_run),
         json.dumps(result), err_msg)
    )
    return result


def list_intune_history(tenant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    return db_fetchall(
        "SELECT * FROM intune_scan_history WHERE tenant_id=? ORDER BY executed_at DESC LIMIT ?",
        (tenant_id, limit)
    )


# ── Backup Module (Fase 5) ────────────────────────────────────────────────────

_BACKUP_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyBackup.ps1"


def _run_backup_ps(tenant_id: str, action: str, executed_by: str = "system") -> Dict[str, Any]:
    """Voer een Backup PS-actie uit en log naar backup_history."""
    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _BACKUP_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Backup script niet gevonden: {ps_script}")

    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId",  profile["auth_tenant_id"],
        "-ClientId",  profile["auth_client_id"],
        "-ParamsJson", "{}",
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    output = proc.stdout + proc.stderr
    logger.info("[Backup] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)

    result: Dict[str, Any] = {}
    if "##RESULT##" in output:
        try:
            result = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
        except Exception:
            result = {"ok": False, "error": "Kon resultaat niet parsen"}
    else:
        result = {"ok": False, "error": output[-500:] if output else "Geen output"}

    final_status = "success" if result.get("ok") else "failed"
    err_msg = result.get("error") if not result.get("ok") else None
    db_execute(
        "INSERT INTO backup_history (id,tenant_id,action,executed_by,executed_at,status,result_json,error_message) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (str(uuid.uuid4()), tenant_id, action, executed_by, now_iso(), final_status,
         json.dumps(result), err_msg)
    )
    return result


def list_backup_history(tenant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    return db_fetchall(
        "SELECT * FROM backup_history WHERE tenant_id=? ORDER BY executed_at DESC LIMIT ?",
        (tenant_id, limit)
    )


# ── Conditional Access (Fase 6) ───────────────────────────────────────────────

_CA_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyCa.ps1"


def _run_ca_ps(tenant_id: str, action: str, params: Dict[str, Any], dry_run: bool = False, executed_by: str = "system") -> Dict[str, Any]:
    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _CA_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"CA script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    if dry_run:
        cmd.append("-DryRun")
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    output = proc.stdout + proc.stderr
    logger.info("[CA] action=%s tenant=%s dry_run=%s exit=%s", action, tenant_id, dry_run, proc.returncode)
    result: Dict[str, Any] = {}
    if "##RESULT##" in output:
        try:
            result = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            if action == "list-policies" and not dry_run:
                threading.Thread(target=_persist_live_findings, args=(tenant_id, "ca", action, result), daemon=True).start()
        except Exception:
            result = {"ok": False, "error": "Parse fout"}
    else:
        result = {"ok": False, "error": output[-500:] if output else "Geen output"}
    final_status = "dry_run" if dry_run else ("success" if result.get("ok") else "failed")
    policy_id = params.get("policy_id")
    db_execute(
        "INSERT INTO ca_history (id,tenant_id,action,policy_id,executed_by,executed_at,status,result_json,error_message) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (str(uuid.uuid4()), tenant_id, action, policy_id, executed_by, now_iso(), final_status,
         json.dumps(result), result.get("error") if not result.get("ok") else None)
    )
    return result


def list_ca_history(tenant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    return db_fetchall(
        "SELECT * FROM ca_history WHERE tenant_id=? ORDER BY executed_at DESC LIMIT ?",
        (tenant_id, limit)
    )


# ── Domains Analyser (Fase 7) ─────────────────────────────────────────────────

_DOMAINS_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyDomains.ps1"


def _run_domains_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _DOMAINS_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Domains script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    output = proc.stdout + proc.stderr
    logger.info("[Domains] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            return json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


# ── Alerts & Audit Logs (Fase 8) ──────────────────────────────────────────────

_ALERTS_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyAlerts.ps1"


def _run_alerts_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _ALERTS_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Alerts script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    output = proc.stdout + proc.stderr
    logger.info("[Alerts] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            return json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


def get_alert_config(tenant_id: str) -> Dict[str, Any]:
    rows = db_fetchall("SELECT * FROM alert_config WHERE tenant_id=?", (tenant_id,))
    return rows[0] if rows else {}


def upsert_alert_config(
    tenant_id: str,
    webhook_url: str,
    webhook_type: str,
    email_addr: str,
    notify_on_critical: bool = True,
    score_threshold: int = 60,
) -> None:
    existing = get_alert_config(tenant_id)
    if existing:
        db_execute(
            "UPDATE alert_config SET webhook_url=?,webhook_type=?,email_addr=?,"
            "notify_on_critical=?,score_threshold=?,updated_at=? WHERE tenant_id=?",
            (webhook_url, webhook_type, email_addr,
             int(notify_on_critical), int(score_threshold), now_iso(), tenant_id)
        )
    else:
        db_execute(
            "INSERT INTO alert_config (id,tenant_id,webhook_url,webhook_type,email_addr,"
            "notify_on_critical,score_threshold,updated_at) VALUES (?,?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), tenant_id, webhook_url, webhook_type, email_addr,
             int(notify_on_critical), int(score_threshold), now_iso())
        )


def _fire_webhook_on_run_completion(tenant_id: str, run_id: str) -> None:
    """
    Stuur een webhook als een assessment-run kritieke bevindingen heeft of onder de
    score-drempel valt. Dedupliceert via notification_log (één melding per run).
    """
    try:
        cfg = get_alert_config(tenant_id)
        if not cfg or not cfg.get("webhook_url"):
            return
        if not int(cfg.get("notify_on_critical", 1)):
            return

        # Deduplicatie: al eerder gemeld voor deze run?
        existing = db_fetchone(
            "SELECT id FROM notification_log WHERE run_id=? AND event_type=?",
            (run_id, "run_completed_critical"),
        )
        if existing:
            return

        run = db_fetchone("SELECT * FROM assessment_runs WHERE id=?", (run_id,))
        if not run:
            return

        critical_count = int(run.get("critical_count") or 0)
        score = run.get("score_overall")
        threshold = int(cfg.get("score_threshold", 60))

        should_fire = critical_count > 0 or (score is not None and float(score) < threshold)
        if not should_fire:
            return

        # Registreer in notification_log
        db_execute(
            "INSERT INTO notification_log (id,tenant_id,event_type,run_id,fired_at) VALUES (?,?,?,?,?)",
            (str(uuid.uuid4()), tenant_id, "run_completed_critical", run_id, now_iso()),
        )

        tenant = db_fetchone("SELECT display_name, name FROM tenants WHERE id=?", (tenant_id,))
        tenant_label = (tenant or {}).get("display_name") or (tenant or {}).get("name") or tenant_id

        _fire_webhook_for_tenant(tenant_id, "run_completed_critical", {
            "title": f"⚠️ Assessment voltooid — kritieke bevindingen bij {tenant_label}",
            "message": (
                f"{critical_count} kritieke bevinding(en) gevonden. "
                f"Score: {round(float(score), 1) if score is not None else 'onbekend'}/100."
            ),
            "facts": {
                "Tenant": tenant_label,
                "Run ID": run_id,
                "Score": f"{round(float(score), 1)}/100" if score is not None else "–",
                "Kritiek": str(critical_count),
                "Waarschuwingen": str(run.get("warning_count") or 0),
            },
            "event": "run_completed_critical",
        })
    except Exception as exc:
        logger.warning("Webhook bij run-completion mislukt (run=%s): %s", run_id, exc)


def _fire_webhook_for_tenant(tenant_id: str, event: str, payload_data: Dict[str, Any]) -> None:
    """Stuurt een webhook naar alle geconfigureerde kanalen voor deze tenant (fire-and-forget)."""
    import threading
    cfg = get_alert_config(tenant_id)
    if not cfg or not cfg.get("webhook_url"):
        return
    webhook_url  = cfg["webhook_url"]
    webhook_type = cfg.get("webhook_type", "teams")

    def _send() -> None:
        try:
            import urllib.request
            if webhook_type == "teams":
                body_dict: Dict[str, Any] = {
                    "@type": "MessageCard", "@context": "http://schema.org/extensions",
                    "themeColor": "FF6B2B",
                    "summary": payload_data.get("title", event),
                    "title": f"🔔 Denjoy IT — {payload_data.get('title', event)}",
                    "text": payload_data.get("message", ""),
                    "sections": [{"facts": [{"name": k, "value": str(v)} for k, v in payload_data.get("facts", {}).items()]}],
                }
            elif webhook_type == "slack":
                facts_text = "\n".join(f"*{k}:* {v}" for k, v in payload_data.get("facts", {}).items())
                body_dict = {"text": f"🔔 *Denjoy IT — {payload_data.get('title', event)}*\n{payload_data.get('message', '')}\n{facts_text}"}
            else:
                body_dict = {"source": "denjoy", "event": event, **payload_data}
            body = json.dumps(body_dict).encode()
            req = urllib.request.Request(webhook_url, data=body, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=10):
                pass
        except Exception as exc:
            logger.warning("Webhook fire mislukt voor tenant %s event %s: %s", tenant_id, event, exc)

    threading.Thread(target=_send, daemon=True).start()


def send_test_webhook(webhook_url: str, webhook_type: str) -> Dict[str, Any]:
    import urllib.request
    payload: Dict[str, Any] = {}
    if webhook_type == "teams":
        payload = {"@type": "MessageCard", "@context": "http://schema.org/extensions",
                   "summary": "Denjoy Test", "themeColor": "0078D7",
                   "title": "✅ Denjoy IT Platform — Test melding",
                   "text": "Webhook verbinding succesvol geconfigureerd."}
    elif webhook_type == "slack":
        payload = {"text": "✅ *Denjoy IT Platform* — Test melding\nWebhook verbinding succesvol geconfigureerd."}
    else:
        payload = {"source": "denjoy", "event": "test", "message": "Webhook verbinding succesvol."}
    body = json.dumps(payload).encode()
    req = urllib.request.Request(webhook_url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"ok": True, "status": resp.status}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


# ── Exchange & Email (Fase 9) ─────────────────────────────────────────────────

_EXCHANGE_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyExchange.ps1"


def _run_exchange_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    tenant = db_fetchone("SELECT tenant_guid FROM tenants WHERE id=?", (tenant_id,)) or {}
    tenant_guid = (tenant.get("tenant_guid") or "").strip()
    profile = get_explicit_tenant_auth_profile(tenant_id, include_secret=True)
    auth_tenant_id = (profile.get("auth_tenant_id") or "").strip()
    auth_client_id = (profile.get("auth_client_id") or "").strip()
    auth_cert_thumbprint = (profile.get("auth_cert_thumbprint") or "").strip()
    auth_client_secret = (profile.get("auth_client_secret") or "").strip()
    if not auth_tenant_id or not auth_client_id or not (auth_cert_thumbprint or auth_client_secret):
        return {
            "ok": False,
            "error": (
                "Voor deze tenant ontbreekt een volledige tenant-specifieke app-registratie. "
                "Vul auth_tenant_id, auth_client_id en een certificaat of client secret in."
            ),
        }
    if tenant_guid and auth_tenant_id.lower() != tenant_guid.lower():
        return {
            "ok": False,
            "error": (
                "De ingestelde app-registratie hoort niet bij de geselecteerde tenant. "
                "Werk de tenant-authconfig bij zodat auth_tenant_id overeenkomt met de tenant GUID."
            ),
        }
    ps_script = _EXCHANGE_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Exchange script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", auth_tenant_id,
        "-ClientId", auth_client_id,
        "-ParamsJson", json.dumps(params),
    ]
    if auth_cert_thumbprint:
        cmd += ["-CertThumbprint", auth_cert_thumbprint]
    elif auth_client_secret:
        cmd += ["-ClientSecret", auth_client_secret]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    logger.info("[Exchange] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            data = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            threading.Thread(target=_persist_live_findings, args=(tenant_id, "exchange", action, data), daemon=True).start()
            return data
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


# ── Identiteit & Toegang ──────────────────────────────────────────────────────

# ═══════════════════════════════════════════════════════════════
# SCAN FINDINGS — extractors en persistentie
# ═══════════════════════════════════════════════════════════════

def _status_from_pct(pct: float, ok_threshold: float = 95.0, warn_threshold: float = 75.0) -> str:
    if pct >= ok_threshold:
        return "ok"
    if pct >= warn_threshold:
        return "warning"
    return "critical"

def _impact_from_status(status: str) -> str:
    return {"ok": "low", "warning": "high", "critical": "critical", "info": "low"}.get(status, "medium")

def _extract_identity_mfa(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    total = int(data.get("total") or 0)
    registered = int(data.get("mfaRegistered") or 0)
    pct = float(data.get("mfaPercentage") or 0)
    status = _status_from_pct(pct)
    recs = {
        "ok": "MFA-dekking is goed. Overweeg passwordless uitrol (Microsoft Authenticator + FIDO2).",
        "warning": "Verhoog MFA-dekking. Gebruik een CA-policy om MFA te vereisen voor alle gebruikers.",
        "critical": "Kritiek: implementeer direct een CA-policy die MFA vereist. Alle accounts zijn kwetsbaar.",
    }
    findings.append({"control": "mfa-coverage", "title": "MFA-registratie gebruikers",
        "status": status, "impact": _impact_from_status(status),
        "finding": f"{registered}/{total} gebruikers MFA-geregistreerd ({pct}%)",
        "recommendation": recs[status], "service": "Identity Beheer", "metric_value": pct})
    users = data.get("users") or []
    admin_no_mfa = [u for u in users if u.get("isAdmin") and not u.get("isMfaRegistered")]
    if admin_no_mfa:
        findings.append({"control": "admin-mfa", "title": f"Admins zonder MFA ({len(admin_no_mfa)})",
            "status": "critical", "impact": "critical",
            "finding": f"{len(admin_no_mfa)} beheerdersaccount(s) zonder MFA-registratie gedetecteerd",
            "recommendation": "Vereis direct MFA voor alle beheerdersaccounts via CA-policy.",
            "service": "Identity Beheer", "metric_value": float(len(admin_no_mfa))})
    elif total > 0:
        findings.append({"control": "admin-mfa", "title": "Admin MFA-dekking",
            "status": "ok", "impact": "low",
            "finding": "Alle beheerdersaccounts hebben MFA geregistreerd",
            "recommendation": "Handhaven.", "service": "Identity Beheer", "metric_value": 0.0})
    return findings

def _extract_identity_guests(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    guests = data.get("guests") or []
    total = int(data.get("count") or len(guests))
    if total == 0:
        return [{"control": "guest-accounts", "title": "Gastaccounts",
            "status": "ok", "impact": "low",
            "finding": "Geen gastgebruikers gevonden in de tenant",
            "recommendation": "Geen actie vereist.", "service": "Identity Beheer", "metric_value": 0.0}]
    disabled = sum(1 for g in guests if not g.get("accountEnabled"))
    status = "ok" if total <= 20 else ("warning" if total <= 100 else "critical")
    return [{"control": "guest-accounts", "title": f"Gastaccounts ({total})",
        "status": status, "impact": _impact_from_status(status),
        "finding": f"{total} gastgebruikers aanwezig, {disabled} uitgeschakeld",
        "recommendation": "Review gastaccounts regelmatig. Verwijder inactieve gasten of gebruik Azure AD Access Reviews.",
        "service": "Identity Beheer", "metric_value": float(total)}]

def _extract_identity_security_defaults(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    enabled = data.get("securityDefaultsEnabled")
    ca_count = int(data.get("caEnabledPolicies") or 0)
    rec = data.get("recommendation") or ""
    if enabled is True and ca_count == 0:
        status, finding = "ok", "Security Defaults ingeschakeld (geen conflicterende CA-policies)"
    elif enabled is False and ca_count >= 3:
        status, finding = "ok", f"Security Defaults uitgeschakeld — {ca_count} CA-policies actief (correct)"
    elif enabled is False and ca_count == 0:
        status, finding = "critical", "Security Defaults uitgeschakeld én geen CA-policies actief"
    else:
        status, finding = "warning", f"Security Defaults: {'aan' if enabled else 'uit'}, {ca_count} CA-policies"
    return [{"control": "security-defaults", "title": "Security Defaults status",
        "status": status, "impact": _impact_from_status(status), "finding": finding,
        "recommendation": rec or "Zorg dat óf Security Defaults óf CA-policies actief zijn — niet beide.",
        "service": "Zero Trust Baseline", "metric_value": float(ca_count)}]

def _extract_identity_legacy_auth(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    users = data.get("users") or []
    count = int(data.get("affectedUsers") or len(users))
    if count == 0:
        return [{"control": "legacy-auth", "title": "Legacy authenticatie",
            "status": "ok", "impact": "low",
            "finding": "Geen legacy-auth activiteit gevonden (afgelopen 30 dagen)",
            "recommendation": "Handhaven. Overweeg een CA-policy om legacy auth expliciet te blokkeren.",
            "service": "Zero Trust Baseline", "metric_value": 0.0}]
    return [{"control": "legacy-auth", "title": f"Legacy auth actief ({count} gebruikers)",
        "status": "critical", "impact": "critical",
        "finding": f"{count} gebruiker(s) met legacy-auth activiteit in de afgelopen 30 dagen",
        "recommendation": "Blokkeer legacy authenticatie via CA-policy. Legacy clients omzeilen MFA.",
        "service": "Zero Trust Baseline", "metric_value": float(count)}]

def _extract_identity_admin_roles(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    roles = data.get("roles") or []
    total_admins = int(data.get("totalAdmins") or 0)
    role_count = int(data.get("roleCount") or len(roles))
    if total_admins < 2:
        status = "critical"
    elif total_admins > 6:
        status = "warning"
    else:
        status = "ok"
    return [{"control": "admin-roles", "title": f"Beheerdersrollen ({role_count} rollen, {total_admins} admins)",
        "status": status, "impact": _impact_from_status(status),
        "finding": f"{role_count} actieve directoryrolls met in totaal {total_admins} unieke admins",
        "recommendation": "Houd het aantal Global Admins beperkt (2–4). Gebruik privileged roles zo minimaal mogelijk.",
        "service": "Identity Beheer", "metric_value": float(total_admins)}]

def _extract_appregs(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    apps = data.get("apps") or []
    total = int(data.get("total") or len(apps))
    expired = int(data.get("expired") or 0)
    critical_n = int(data.get("critical") or 0)
    warning_n = int(data.get("warning") or 0)
    if expired > 0:
        findings.append({"control": "appregs-expired", "title": f"Verlopen secrets/certs ({expired})",
            "status": "critical", "impact": "critical",
            "finding": f"{expired} app-registratie(s) met verlopen secret of certificaat",
            "recommendation": "Vernieuw direct alle verlopen secrets en certificaten om uitval te voorkomen.",
            "service": "App Registraties", "metric_value": float(expired)})
    if critical_n > 0:
        findings.append({"control": "appregs-expiring-soon", "title": f"Secrets verlopen binnen 14 dagen ({critical_n})",
            "status": "critical", "impact": "high",
            "finding": f"{critical_n} app-registratie(s) met secret/cert dat binnen 14 dagen verloopt",
            "recommendation": "Vernieuw deze secrets/certs op zeer korte termijn.",
            "service": "App Registraties", "metric_value": float(critical_n)})
    if warning_n > 0:
        findings.append({"control": "appregs-expiring-warning", "title": f"Secrets verlopen binnen 30 dagen ({warning_n})",
            "status": "warning", "impact": "medium",
            "finding": f"{warning_n} app-registratie(s) met secret/cert dat binnen 30 dagen verloopt",
            "recommendation": "Plan het vernieuwen van deze secrets/certs.",
            "service": "App Registraties", "metric_value": float(warning_n)})
    if not findings:
        findings.append({"control": "appregs-status", "title": f"App registraties ({total})",
            "status": "ok", "impact": "low",
            "finding": f"{total} app-registratie(s) — geen verlopen of bijna-verlopen secrets",
            "recommendation": "Blijf secrets en certificaten monitoren voor verval.",
            "service": "App Registraties", "metric_value": float(total)})
    return findings

def _extract_exchange_forwarding(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    items = data.get("forwarding") or data.get("items") or []
    count = len(items)
    if count == 0:
        return [{"control": "exchange-forwarding", "title": "Externe e-mail forwarding",
            "status": "ok", "impact": "low",
            "finding": "Geen actieve externe e-mail forwardings gevonden",
            "recommendation": "Handhaven. Monitor forwarding rules regelmatig.",
            "service": "Exchange", "metric_value": 0.0}]
    return [{"control": "exchange-forwarding", "title": f"Externe forwarding actief ({count})",
        "status": "critical", "impact": "critical",
        "finding": f"{count} mailbox(en) stuurt e-mail extern door — potentieel dataverlies",
        "recommendation": "Blokkeer automatisch extern doorsturen via transport rule. Review deze forwardings direct.",
        "service": "Exchange", "metric_value": float(count)}]

def _extract_exchange_rules(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    suspicious = int(data.get("suspicious") or 0)
    total = int(data.get("total") or 0)
    if suspicious == 0:
        return [{"control": "exchange-inbox-rules", "title": "Verdachte inboxregels",
            "status": "ok", "impact": "low",
            "finding": f"Geen verdachte inboxregels gevonden ({total} regels gecontroleerd)",
            "recommendation": "Blijf inboxregels periodiek monitoren.",
            "service": "Exchange", "metric_value": 0.0}]
    return [{"control": "exchange-inbox-rules", "title": f"Verdachte inboxregels ({suspicious})",
        "status": "critical", "impact": "critical",
        "finding": f"{suspicious} verdachte inboxregel(s) gedetecteerd van {total} totaal",
        "recommendation": "Onderzoek en verwijder verdachte inboxregels. Dit kan wijzen op een gehackt account.",
        "service": "Exchange", "metric_value": float(suspicious)}]

def _extract_ca_policies(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    policies = data.get("policies") or []
    enabled = sum(1 for p in policies if (p.get("state") or "").lower() == "enabled")
    report_only = sum(1 for p in policies if (p.get("state") or "").lower() in ("enabledforreportingbutnotenforcingleway", "reportonly"))
    total = len(policies)
    if enabled >= 3:
        status = "ok"
    elif enabled >= 1:
        status = "warning"
    else:
        status = "critical"
    return [{"control": "ca-policies", "title": f"Conditional Access policies ({enabled} actief)",
        "status": status, "impact": _impact_from_status(status),
        "finding": f"{enabled} actieve CA-policies van {total} totaal ({report_only} report-only)",
        "recommendation": (
            "Goede CA-coverage. Controleer of MFA, legacy-auth blokkering en admin-bescherming zijn opgenomen." if status == "ok"
            else "Breid CA-policies uit. Implementeer minimaal: MFA voor alle users, legacy auth blokkering, admin bescherming."
            if status == "warning"
            else "Geen CA-policies actief! Implementeer direct minimale CA-bescherming."
        ),
        "service": "Zero Trust Baseline", "metric_value": float(enabled)}]

def _extract_teams(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    teams = data.get("teams") or []
    total = int(data.get("count") or len(teams))
    public = int(data.get("publicCount") or sum(1 for t in teams if (t.get("visibility") or "").lower() == "public"))
    pct_public = (public / total * 100) if total > 0 else 0
    status = "ok" if pct_public < 20 else ("warning" if pct_public < 50 else "critical")
    return [{"control": "teams-public", "title": f"Teams ({total} totaal, {public} publiek)",
        "status": status, "impact": _impact_from_status(status),
        "finding": f"{public}/{total} Teams zijn publiek zichtbaar ({pct_public:.0f}%)",
        "recommendation": "Gebruik bij voorkeur Private Teams. Review publieke Teams op gevoelige inhoud.",
        "service": "Samenwerking", "metric_value": float(public)}]

def _extract_sharepoint_settings(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    sharing = str(data.get("sharingCapability") or "unknown").lower()
    if sharing in ("disabled", "existingexternalusersharingonly"):
        status = "ok"
    elif sharing in ("externalusersharingonly",):
        status = "warning"
    elif sharing in ("externaluserandguestsharing",):
        status = "critical"
    else:
        status = "info"
    return [{"control": "sharepoint-sharing", "title": "SharePoint externe sharing",
        "status": status, "impact": _impact_from_status(status),
        "finding": f"Sharingsniveau: {data.get('sharingCapability') or 'Onbekend'}",
        "recommendation": "Beperk extern delen tot 'Existing external users' of 'Disabled'. Voorkom anonieme links.",
        "service": "Samenwerking", "metric_value": None}]

# Map van (domain, action) → extractorfunctie
_FINDING_EXTRACTORS: Dict[Tuple[str, str], Any] = {
    ("identity", "list-mfa"):               _extract_identity_mfa,
    ("identity", "list-guests"):            _extract_identity_guests,
    ("identity", "get-security-defaults"):  _extract_identity_security_defaults,
    ("identity", "list-legacy-auth"):       _extract_identity_legacy_auth,
    ("identity", "list-admin-roles"):       _extract_identity_admin_roles,
    ("apps", "list-appregs"):              _extract_appregs,
    ("exchange", "list-forwarding"):        _extract_exchange_forwarding,
    ("exchange", "list-mailbox-rules"):     _extract_exchange_rules,
    ("ca", "list-policies"):               _extract_ca_policies,
    ("collaboration", "list-teams"):        _extract_teams,
    ("collaboration", "get-sharepoint-settings"): _extract_sharepoint_settings,
}


def _persist_live_findings(tenant_id: str, domain: str, action: str, data: Dict[str, Any]) -> None:
    """Sla gestructureerde bevindingen op in scan_findings na een succesvolle PS-run."""
    if not data or data.get("ok") is False:
        return
    extractor = _FINDING_EXTRACTORS.get((domain, action))
    if not extractor:
        return
    try:
        findings = extractor(data)
    except Exception as e:
        logger.warning("[findings] Extractor %s/%s fout: %s", domain, action, e)
        return
    if not findings:
        return
    ts = now_iso()
    raw_json = json.dumps(data, ensure_ascii=False)[:8000]  # cap op 8KB
    conn = get_conn()
    try:
        with conn:
            conn.executemany(
                """
                INSERT INTO scan_findings
                    (id, tenant_id, domain, control, title, status, finding,
                     impact, recommendation, service, metric_value, raw_json, scanned_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                [
                    (
                        str(uuid.uuid4()), tenant_id, domain,
                        f["control"], f["title"], f["status"], f.get("finding"),
                        f.get("impact", "low"), f.get("recommendation"),
                        f.get("service"), f.get("metric_value"),
                        raw_json if i == 0 else None, ts,
                    )
                    for i, f in enumerate(findings)
                ],
            )
    except Exception as e:
        logger.warning("[findings] DB write fout tenant=%s domain=%s: %s", tenant_id, domain, e)
    finally:
        conn.close()


def _persist_snapshot_findings(tenant_id: str, run_id: str) -> int:
    """
    Leid gestructureerde scan_findings af uit de summary.json van een assessment-run.
    Gebruikt dezelfde scan_findings tabel als _persist_live_findings.
    Retourneert het aantal geschreven findings.
    """
    # Idempotence: voorkom dubbele import van dezelfde run voor dezelfde tenant.
    if _has_snapshot_findings_for_run(tenant_id, run_id):
        return 0

    run_dir = RUNS_DIR / run_id
    summary_file = find_latest_summary_file(run_dir)
    if not summary_file or not summary_file.exists():
        return 0
    try:
        snap = json.loads(summary_file.read_text(encoding="utf-8"))
    except Exception:
        return 0
    if not isinstance(snap, dict):
        return 0

    metrics = snap.get("Metrics") or {}
    ts = snap.get("GeneratedAt") or now_iso()
    raw_json = json.dumps({"source": "snapshot", "run_id": run_id}, ensure_ascii=False)
    findings: List[Dict[str, Any]] = []

    def _pct_status(pct, ok_thresh=90, warn_thresh=75):
        if pct is None:
            return "info"
        if pct >= ok_thresh:
            return "ok"
        if pct >= warn_thresh:
            return "warning"
        return "critical"

    def _inv_pct_status(count, warn_thresh=1, crit_thresh=5):
        """Status voor telling waarbij 0 = OK."""
        if count is None:
            return "info"
        if count == 0:
            return "ok"
        if count <= warn_thresh:
            return "warning"
        return "critical"

    # ── Identity & MFA ────────────────────────────────────────────────────────
    mfa_pct = metrics.get("MfaCoveragePct")
    if mfa_pct is not None:
        status = _pct_status(mfa_pct, ok_thresh=95, warn_thresh=75)
        missing = metrics.get("MfaMissing", 0)
        findings.append({
            "domain": "identity", "control": "mfa-coverage",
            "title": "MFA-registratie dekking",
            "status": status,
            "finding": f"{mfa_pct}% MFA-dekking ({missing} gebruikers zonder MFA)",
            "impact": "high" if status == "critical" else ("medium" if status == "warning" else "low"),
            "recommendation": (
                "Verplicht MFA via Conditional Access voor alle gebruikers."
                if status != "ok" else None
            ),
            "service": "Identity Beheer",
            "metric_value": mfa_pct,
        })

    ca_enabled = metrics.get("CAEnabled")
    if ca_enabled is not None:
        ca_count = int(ca_enabled)
        status = "ok" if ca_count >= 3 else ("warning" if ca_count >= 1 else "critical")
        findings.append({
            "domain": "identity", "control": "ca-policies",
            "title": "Conditional Access policies",
            "status": status,
            "finding": f"{ca_count} actieve Conditional Access policy/policies",
            "impact": "high" if status == "critical" else ("medium" if status == "warning" else "low"),
            "recommendation": (
                "Implementeer minimaal 3 CA-policies: MFA, admin-bescherming en legacy auth blokkade."
                if status != "ok" else None
            ),
            "service": "Zero Trust Baseline",
            "metric_value": float(ca_count),
        })

    # ── Security Baseline ─────────────────────────────────────────────────────
    score_pct = metrics.get("SecureScorePct")
    if score_pct is not None:
        status = _pct_status(score_pct, ok_thresh=70, warn_thresh=50)
        findings.append({
            "domain": "identity", "control": "secure-score",
            "title": "Microsoft Secure Score",
            "status": status,
            "finding": f"Secure Score: {score_pct}%",
            "impact": "high" if status == "critical" else ("medium" if status == "warning" else "low"),
            "recommendation": (
                "Voer de top Secure Score aanbevelingen uit in het Microsoft 365 Defender portal."
                if status != "ok" else None
            ),
            "service": "Security Monitoring",
            "metric_value": score_pct,
        })

    alerts_high = metrics.get("AlertsHigh")
    if alerts_high is not None:
        status = _inv_pct_status(int(alerts_high), warn_thresh=0, crit_thresh=1)
        if status == "ok":
            status = "ok"  # 0 high alerts is OK
        else:
            status = "critical"
        findings.append({
            "domain": "identity", "control": "security-alerts-high",
            "title": "Hoge prioriteit beveiligingsalarmen",
            "status": status,
            "finding": f"{alerts_high} hoge prioriteitsalarmen actief",
            "impact": "high" if int(alerts_high) > 0 else "low",
            "recommendation": (
                "Onderzoek en verhelp direct alle hoge prioriteitsalarmen in Microsoft 365 Defender."
                if int(alerts_high) > 0 else None
            ),
            "service": "Security Monitoring",
            "metric_value": float(alerts_high),
        })

    alerts_medium = metrics.get("AlertsMedium")
    if alerts_medium is not None:
        a = int(alerts_medium)
        status = "ok" if a == 0 else ("warning" if a <= 5 else "critical")
        findings.append({
            "domain": "identity", "control": "security-alerts-medium",
            "title": "Gemiddelde prioriteit beveiligingsalarmen",
            "status": status,
            "finding": f"{a} gemiddelde prioriteitsalarmen actief",
            "impact": "medium" if a > 0 else "low",
            "recommendation": (
                "Bekijk en prioriteer gemiddelde alarmen; zorg dat er geen achterstanden ontstaan."
                if a > 0 else None
            ),
            "service": "Security Monitoring",
            "metric_value": float(a),
        })

    # ── Device Compliance ─────────────────────────────────────────────────────
    intune_pct = metrics.get("IntuneCompliancePct")
    if intune_pct is not None:
        status = _pct_status(intune_pct, ok_thresh=95, warn_thresh=75)
        findings.append({
            "domain": "collaboration", "control": "intune-compliance",
            "title": "Intune device compliance dekking",
            "status": status,
            "finding": f"{intune_pct}% van beheerde apparaten is compliant",
            "impact": "high" if status == "critical" else ("medium" if status == "warning" else "low"),
            "recommendation": (
                "Stel compliance policies in en herstel non-compliant apparaten via Intune."
                if status != "ok" else None
            ),
            "service": "Modern Device Management",
            "metric_value": intune_pct,
        })

    # ── License utilization ────────────────────────────────────────────────────
    licenses = snap.get("Licenses") or []
    low_util = [
        lic for lic in licenses
        if isinstance(lic, dict)
        and (lic.get("Total") or 0) > 5
        and (lic.get("Utilization") or 100) < 80
    ]
    if licenses:
        status = "ok" if not low_util else ("warning" if len(low_util) <= 2 else "critical")
        findings.append({
            "domain": "collaboration", "control": "license-efficiency",
            "title": "Licentie-efficiëntie",
            "status": status,
            "finding": (
                f"{len(low_util)} licentietypen met lage bezettingsgraad (<80%) van de {len(licenses)} totaal"
                if low_util else f"Alle {len(licenses)} licentietypen hebben voldoende bezettingsgraad"
            ),
            "impact": "medium" if low_util else "low",
            "recommendation": (
                "Verlaag het aantal licenties voor onderbenutte SKU's of herverdelens ze naar actieve gebruikers."
                if low_util else None
            ),
            "service": "Licentie Optimalisatie",
            "metric_value": float(len(low_util)),
        })

    # ── App Registrations ─────────────────────────────────────────────────────
    app_regs = snap.get("AppRegistrations") or []
    expired_secrets = [
        a for a in app_regs
        if isinstance(a, dict) and "Expired" in str(a.get("SecretExpirationStatus") or "")
    ]
    expiring_soon = [
        a for a in app_regs
        if isinstance(a, dict) and "soon" in str(a.get("SecretExpirationStatus") or "").lower()
    ]
    if app_regs:
        status = "ok" if not expired_secrets else "critical"
        if status == "ok" and expiring_soon:
            status = "warning"
        findings.append({
            "domain": "appregs", "control": "appreg-secrets",
            "title": "App registraties — secrets & certificaten",
            "status": status,
            "finding": (
                f"{len(expired_secrets)} verlopen secret(s), {len(expiring_soon)} verloopt binnenkort "
                f"van de {len(app_regs)} app registraties"
                if (expired_secrets or expiring_soon) else
                f"Alle {len(app_regs)} app registraties hebben geldige credentials"
            ),
            "impact": "high" if expired_secrets else ("medium" if expiring_soon else "low"),
            "recommendation": (
                "Vernieuw verlopen secrets/certificaten voor app registraties direct."
                if expired_secrets else (
                    "Vernieuw binnenkort verlopende secrets/certificaten proactief."
                    if expiring_soon else None
                )
            ),
            "service": "App Beheer",
            "metric_value": float(len(expired_secrets)),
        })

    if not findings:
        return 0

    conn = get_conn()
    try:
        with conn:
            conn.executemany(
                """
                INSERT INTO scan_findings
                    (id, tenant_id, domain, control, title, status, finding,
                     impact, recommendation, service, metric_value, raw_json, scanned_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                [
                    (
                        str(uuid.uuid4()), tenant_id,
                        f["domain"], f["control"], f["title"], f["status"],
                        f.get("finding"), f.get("impact", "low"),
                        f.get("recommendation"), f.get("service"),
                        f.get("metric_value"), raw_json if i == 0 else None, ts,
                    )
                    for i, f in enumerate(findings)
                ],
            )
        return len(findings)
    except Exception as e:
        logger.warning("[snapshot_findings] DB write fout tenant=%s run=%s: %s", tenant_id, run_id, e)
        return 0
    finally:
        conn.close()


def _has_snapshot_findings_for_run(tenant_id: str, run_id: str) -> bool:
    marker = f'"run_id": "{run_id}"'
    conn = get_conn()
    try:
        row = conn.execute(
            """
            SELECT 1
            FROM scan_findings
            WHERE tenant_id = ?
              AND raw_json IS NOT NULL
              AND raw_json LIKE ?
            LIMIT 1
            """,
            (tenant_id, f"%{marker}%"),
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def _get_tenant_health_score(tenant_id: str) -> Dict[str, Any]:
    """Bereken health score op basis van meest recente findings per control."""
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT f.domain, f.control, f.status, f.impact, f.title, f.scanned_at
            FROM scan_findings f
            INNER JOIN (
                SELECT domain, control, MAX(scanned_at) AS max_at
                FROM scan_findings WHERE tenant_id=?
                GROUP BY domain, control
            ) latest ON f.domain=latest.domain AND f.control=latest.control AND f.scanned_at=latest.max_at
            WHERE f.tenant_id=?
            ORDER BY f.domain, f.control
            """,
            (tenant_id, tenant_id),
        ).fetchall()
        findings = [dict(r) for r in rows]
        total = len(findings)
        ok_count = sum(1 for f in findings if f["status"] == "ok")
        warn_count = sum(1 for f in findings if f["status"] == "warning")
        crit_count = sum(1 for f in findings if f["status"] == "critical")
        score = round((ok_count * 1.0 + warn_count * 0.5) / total * 100) if total else None
        return {
            "ok": True, "tenant_id": tenant_id,
            "score": score,
            "total": total, "ok_count": ok_count,
            "warning_count": warn_count, "critical_count": crit_count,
            "findings": findings,
        }
    finally:
        conn.close()


def compare_tenants(tid1: str, tid2: str) -> Dict[str, Any]:
    """Vergelijk twee tenants op basis van hun laatste assessment-snapshot."""

    def _tenant_summary(tid: str) -> Dict[str, Any]:
        score_data = _get_tenant_health_score(tid)
        run = _latest_completed_run_for_tenant(tid)
        snap = _latest_assessment_snapshot_for_tenant(tid)
        users = _snapshot_as_users(tid)
        licenses = _snapshot_as_licenses(tid)
        intune = _snapshot_as_intune_summary(tid)
        ca = _snapshot_as_ca_policies(tid)
        domains = _snapshot_as_domains(tid)
        mailboxes = _snapshot_as_mailboxes(tid)

        total_users = len(users) if isinstance(users, list) else 0
        mfa_users = sum(1 for u in (users or []) if u.get("mfa_enabled")) if isinstance(users, list) else 0
        admin_users = sum(1 for u in (users or []) if u.get("is_admin")) if isinstance(users, list) else 0
        active_ca = sum(1 for p in (ca or []) if p.get("state") in {"enabled", "enabledForReportingButNotEnforced"}) if isinstance(ca, list) else 0
        domain_count = len(domains) if isinstance(domains, list) else 0
        forwarding_count = sum(1 for m in (mailboxes or []) if m.get("external_forwarding")) if isinstance(mailboxes, list) else 0

        return {
            "tenant_id": tid,
            "score": score_data,
            "critical_count": (run or {}).get("critical_count") or 0,
            "warning_count": (run or {}).get("warning_count") or 0,
            "last_run_at": (run or {}).get("completed_at"),
            "total_users": total_users,
            "mfa_users": mfa_users,
            "mfa_pct": round(mfa_users / total_users * 100) if total_users else 0,
            "admin_users": admin_users,
            "total_licenses": len(licenses) if isinstance(licenses, list) else 0,
            "active_ca_policies": active_ca,
            "domain_count": domain_count,
            "mailboxes_with_forwarding": forwarding_count,
            "intune_compliance_pct": (intune or {}).get("compliant_pct") if intune else None,
            "intune_device_count": (intune or {}).get("total_devices") if intune else None,
        }

    tenant_a = _tenant_summary(tid1)
    tenant_b = _tenant_summary(tid2)

    # Bereken delta's
    def _delta(key: str) -> Optional[float]:
        a = tenant_a.get(key)
        b = tenant_b.get(key)
        if a is None or b is None:
            return None
        try:
            return round(float(b) - float(a), 1)
        except (TypeError, ValueError):
            return None

    delta_keys = ["score", "critical_count", "warning_count", "mfa_pct",
                  "admin_users", "active_ca_policies", "mailboxes_with_forwarding",
                  "intune_compliance_pct"]
    deltas = {k: _delta(k) for k in delta_keys}

    return {
        "tenant_a": tenant_a,
        "tenant_b": tenant_b,
        "deltas": deltas,
        "generated_at": now_iso(),
    }


def _get_findings_trend(tenant_id: str, days: int = 30) -> List[Dict[str, Any]]:
    """Dagelijks gemiddelde health score voor trends-grafiek."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT
                substr(scanned_at, 1, 10) AS day,
                COUNT(*) AS total,
                SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) AS ok_count,
                SUM(CASE WHEN status='warning' THEN 1 ELSE 0 END) AS warn_count,
                SUM(CASE WHEN status='critical' THEN 1 ELSE 0 END) AS crit_count
            FROM scan_findings
            WHERE tenant_id=? AND scanned_at >= ?
            GROUP BY day
            ORDER BY day ASC
            """,
            (tenant_id, cutoff),
        ).fetchall()
        result = []
        for r in rows:
            total = r["total"] or 1
            score = round((r["ok_count"] * 1.0 + r["warn_count"] * 0.5) / total * 100)
            result.append({"date": r["day"], "score": score,
                "ok": r["ok_count"], "warning": r["warn_count"], "critical": r["crit_count"]})
        return result
    finally:
        conn.close()


_IDENTITY_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyIdentity.ps1"


def _run_identity_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _IDENTITY_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Identity script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    logger.info("[Identity] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            data = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            threading.Thread(target=_persist_live_findings, args=(tenant_id, "identity", action, data), daemon=True).start()
            return data
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


# ── Hybrid Identity ───────────────────────────────────────────────────────────

_HYBRID_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyHybrid.ps1"


def _run_hybrid_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _HYBRID_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Hybrid script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    logger.info("[Hybrid] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            data = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            threading.Thread(target=_persist_live_findings, args=(tenant_id, "hybrid", action, data), daemon=True).start()
            return data
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


# ── CIS Compliance ────────────────────────────────────────────────────────────

_CIS_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyCis.ps1"


def _run_cis_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _CIS_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"CIS script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    output = proc.stdout + proc.stderr
    logger.info("[CIS] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            data = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            threading.Thread(target=_persist_live_findings, args=(tenant_id, "compliance", action, data), daemon=True).start()
            return data
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


# ── App Registraties ──────────────────────────────────────────────────────────

_APPREGS_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyApps.ps1"


def _run_appregs_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _APPREGS_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"AppRegs script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    logger.info("[AppRegs] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            data = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            threading.Thread(target=_persist_live_findings, args=(tenant_id, "apps", action, data), daemon=True).start()
            return data
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


# ── Samenwerking: SharePoint & Teams ─────────────────────────────────────────

_COLLAB_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyCollaboration.ps1"


def _run_collab_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _COLLAB_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Collaboration script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    logger.info("[Collab] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            data = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            threading.Thread(target=_persist_live_findings, args=(tenant_id, "collaboration", action, data), daemon=True).start()
            return data
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


class RunManager:
    def __init__(self) -> None:
        self._active_procs: Dict[str, "subprocess.Popen[str]"] = {}
        self._stop_requested: set = set()
        self._lock = threading.Lock()

    def start(self, run_id: str, phases: List[str], run_mode: str, scan_type: str = "full") -> None:
        t = threading.Thread(target=self._worker, args=(run_id, phases, run_mode, scan_type), daemon=True)
        t.start()

    def stop(self, run_id: str) -> bool:
        """Stuur SIGTERM naar het actieve proces voor deze run. Retourneert True als gevonden."""
        with self._lock:
            proc = self._active_procs.get(run_id)
            self._stop_requested.add(run_id)
        if not proc:
            return False
        try:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        except Exception:
            pass
        self._run_disconnect_cleanup(run_id)
        return True

    def _run_disconnect_cleanup(self, run_id: str) -> None:
        """Best-effort cleanup for terminated runs where script finally may not complete."""
        try:
            stop_script = (PLATFORM_DIR / "assessment-engine" / "Stop-M365BaselineAssessment.ps1").resolve()
            if not stop_script.exists():
                append_run_log(run_id, "Stop cleanup script not found; skipping disconnect cleanup.")
                return
            pwsh = shutil.which("pwsh") or shutil.which("powershell")
            if not pwsh:
                append_run_log(run_id, "PowerShell not found; skipping disconnect cleanup.")
                return

            cmd = [pwsh, "-NoLogo", "-NoProfile", "-NonInteractive", "-File", str(stop_script)]
            append_run_log(run_id, "Running forced disconnect cleanup...")
            proc = subprocess.run(
                cmd,
                cwd=str(PLATFORM_DIR / "assessment-engine"),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=45,
            )
            output = (proc.stdout or "").strip()
            if output:
                for line in output.splitlines()[-80:]:
                    append_run_log(run_id, f"[cleanup] {line}")
            append_run_log(run_id, f"Forced disconnect cleanup exit code: {proc.returncode}")
        except subprocess.TimeoutExpired:
            append_run_log(run_id, "Forced disconnect cleanup timed out.")
        except Exception as exc:
            append_run_log(run_id, f"Forced disconnect cleanup failed: {exc}")

    def _register_proc(self, run_id: str, proc: "subprocess.Popen[str]") -> None:
        with self._lock:
            self._active_procs[run_id] = proc

    def _unregister_proc(self, run_id: str) -> None:
        with self._lock:
            self._active_procs.pop(run_id, None)

    def _was_stop_requested(self, run_id: str) -> bool:
        with self._lock:
            return run_id in self._stop_requested

    def _clear_stop_flag(self, run_id: str) -> None:
        with self._lock:
            self._stop_requested.discard(run_id)

    def _worker(self, run_id: str, phases: List[str], run_mode: str, scan_type: str = "full") -> None:
        run_dir = RUNS_DIR / run_id
        (run_dir / "_snapshots").mkdir(parents=True, exist_ok=True)
        update_run(run_id, status="running")
        append_run_log(run_id, f"Run mode: {run_mode}")
        append_run_log(run_id, f"Scan type: {scan_type}")
        append_run_log(run_id, f"Phases: {', '.join(phases)}")
        try:
            if run_mode == "script":
                self._run_script(run_id, phases, run_dir)
            else:
                self._run_demo(run_id, phases, run_dir)

            artifacts = gather_artifacts(run_id, run_dir)
            stats = parse_run_stats(run_dir)
            associate_run_to_tenant_by_summary(run_id, stats)
            update_run(
                run_id,
                status="completed",
                completed_at=now_iso(),
                exit_code=0,
                report_path=artifacts["report_path"],
                snapshot_path=artifacts["snapshot_path"],
                report_filename=artifacts["report_filename"],
                score_overall=stats.get("scoreOverall"),
                critical_count=stats.get("criticalIssues") or 0,
                warning_count=stats.get("warnings") or 0,
                info_count=stats.get("infoItems") or 0,
            )
            append_run_log(run_id, "Run completed.")
            try:
                snap_count = import_run_snapshots_to_db(run_id)
                if snap_count:
                    append_run_log(run_id, f"{snap_count} portal JSON snapshots opgeslagen in database.")
            except Exception as snap_exc:
                logger.warning("Snapshot import mislukt voor run %s: %s", run_id, snap_exc)
            # Bevindingen uit summary.json opslaan in scan_findings (voor Bevindingen & Health sectie)
            try:
                run_meta = db_fetchone("SELECT tenant_id FROM assessment_runs WHERE id=?", (run_id,))
                if run_meta and run_meta.get("tenant_id"):
                    def _bg_persist_snapshot():
                        n = _persist_snapshot_findings(run_meta["tenant_id"], run_id)
                        if n:
                            append_run_log(run_id, f"{n} assessment-bevindingen opgeslagen in scan_findings.")
                    import threading as _threading
                    _threading.Thread(target=_bg_persist_snapshot, daemon=True).start()
            except Exception as sf_exc:
                logger.warning("Snapshot findings import mislukt voor run %s: %s", run_id, sf_exc)
            # Webhook notificatie na voltooide assessment (met deduplicatie + drempel)
            try:
                run_meta = db_fetchone("SELECT tenant_id FROM assessment_runs WHERE id=?", (run_id,))
                if run_meta and run_meta.get("tenant_id"):
                    _fire_webhook_on_run_completion(run_meta["tenant_id"], run_id)
            except Exception as wh_exc:
                logger.warning("Webhook na assessment mislukt: %s", wh_exc)
        except Exception as exc:
            cancelled = self._was_stop_requested(run_id)
            self._clear_stop_flag(run_id)
            status = "cancelled" if cancelled else "failed"
            update_run(
                run_id,
                status=status,
                completed_at=now_iso(),
                exit_code=1,
                error_message=str(exc),
            )
            append_run_log(run_id, f"Run {status}: {exc}")

    def _run_demo(self, run_id: str, phases: List[str], run_dir: Path) -> None:
        labels = {
            "phase1": "Users",
            "phase2": "Collaboration",
            "phase3": "Compliance",
            "phase4": "Security",
            "phase5": "Intune",
            "phase6": "Azure",
        }
        for p in phases:
            append_run_log(run_id, f"Starting {p} ({labels.get(p, p)})")
            time.sleep(0.7)
            append_run_log(run_id, f"Completed {p}")

        src_report = DEFAULT_REPORTS_DIR / "M365-Complete-Baseline-latest.html"
        src_summary = DEFAULT_REPORTS_DIR / "_snapshots" / "M365-Complete-Baseline-latest.summary.json"
        run_stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        if src_report.exists():
            unique_report_name = f"M365-Complete-Baseline-{run_stamp}-{run_id[:8]}.html"
            shutil.copy2(src_report, run_dir / unique_report_name)
            # Convenience copy for quick open/debug (kept in same run dir)
            shutil.copy2(src_report, run_dir / "M365-Complete-Baseline-latest.html")
        else:
            demo_html = (
                "<!doctype html><html><head><meta charset='utf-8'><title>Demo report</title></head>"
                "<body><div class='tenant-name'>Lokale Tenant</div><h1>Demo assessment</h1></body></html>"
            )
            unique_report_name = f"M365-Complete-Baseline-{run_stamp}-{run_id[:8]}.html"
            (run_dir / unique_report_name).write_text(demo_html, encoding="utf-8")
            (run_dir / "M365-Complete-Baseline-latest.html").write_text(demo_html, encoding="utf-8")
        if src_summary.exists():
            (run_dir / "_snapshots").mkdir(exist_ok=True)
            unique_summary_name = f"M365-Complete-Baseline-{run_stamp}-{run_id[:8]}.summary.json"
            shutil.copy2(src_summary, run_dir / "_snapshots" / unique_summary_name)
            shutil.copy2(src_summary, run_dir / "_snapshots" / "M365-Complete-Baseline-latest.summary.json")
        append_run_log(run_id, "Demo artifacts generated.")

    def _run_script(self, run_id: str, phases: List[str], run_dir: Path) -> None:
        cfg = load_config()
        script_path = Path(cfg.get("script_path") or "").expanduser().resolve()
        # Whitelist: alleen scripts binnen de assessment-map zijn toegestaan
        _allowed_dir = (PLATFORM_DIR / "assessment-engine").resolve()
        if not str(script_path).startswith(str(_allowed_dir)):
            raise ValueError(f"Script-pad staat niet op de whitelist: {script_path}")
        if not script_path.exists():
            raise RuntimeError(f"Script not found: {script_path}")
        pwsh = shutil.which("pwsh") or shutil.which("powershell")
        if not pwsh:
            raise RuntimeError("PowerShell (pwsh/powershell) not found")

        cmd = [pwsh, "-NoLogo", "-NoProfile", "-NonInteractive", "-File", str(script_path),
               "-OutputPath", str(run_dir),
               "-ExportCsv", "-ExportJson"]        # assessment exports voor CSV + portal JSON
        cmd.extend(phase_skip_flags(phases))

        # Assessments horen altijd de expliciete app-registratie van de geselecteerde tenant te gebruiken.
        run = db_fetchone("SELECT tenant_id FROM assessment_runs WHERE id=?", (run_id,)) or {}
        tenant_row = db_fetchone("SELECT customer_name, tenant_name, tenant_guid FROM tenants WHERE id=?", (run.get("tenant_id") or "",)) or {}
        tenant_guid_from_selection = (tenant_row.get("tenant_guid") or "").strip()
        tenant_id_for_profile = (run.get("tenant_id") or "").strip()
        tenant_profile = get_explicit_tenant_auth_profile(tenant_id_for_profile, include_secret=True) if tenant_id_for_profile else {}
        tenant_id_profile = (tenant_profile.get("auth_tenant_id") or "").strip()
        if not tenant_profile or not tenant_has_required_auth_profile(tenant_id_for_profile):
            raise RuntimeError(
                "Voor deze tenant ontbreekt een volledige tenant-specifieke app-registratie. "
                "Stel die eerst in voordat je een assessment start."
            )
        if tenant_guid_from_selection and tenant_id_profile and tenant_guid_from_selection.lower() != tenant_id_profile.lower():
            raise RuntimeError(
                "Tenant-profiel auth_tenant_id komt niet overeen met de geselecteerde tenant GUID. "
                "Werk de app-registratie in Admin > tenant-instellingen bij."
            )

        effective_auth = _select_effective_assessment_auth(cfg, tenant_profile)

        tenant_id = (effective_auth.get("tenant_id") or "").strip()
        if not tenant_id:
            raise RuntimeError("Geen TenantId beschikbaar voor tenant-specifieke script-authenticatie.")
        client_id   = (effective_auth.get("client_id") or "").strip()
        cert_thumb  = (effective_auth.get("cert_thumbprint") or "").strip()
        client_sec  = (effective_auth.get("client_secret") or "").strip()

        # env aanmaken vóór gebruik (fix: was na de client_sec blok)
        env = os.environ.copy()
        env["M365_BASELINE_NONINTERACTIVE"] = "1"
        env["CI"] = env.get("CI", "1")

        if tenant_id:
            cmd += ["-TenantId", tenant_id]
        if client_id:
            cmd += ["-ClientId", client_id]
        if cert_thumb:
            cmd += ["-CertThumbprint", cert_thumb]
        elif client_sec:
            # Client secret alleen via omgevingsvariabele (niet als command-arg).
            # Start-M365BaselineAssessment.ps1 converteert dit naar SecureString.
            env["M365_CLIENT_SECRET"] = client_sec
        append_run_log(run_id, f"Auth source: {effective_auth.get('source') or 'unknown'}")
        append_run_log(run_id, "Starting PowerShell assessment.")
        append_run_log(run_id, "Command: " + " ".join(cmd))
        proc = subprocess.Popen(
            cmd,
            cwd=str(PLATFORM_DIR / "assessment-engine"),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            universal_newlines=True,
            bufsize=1,
        )
        self._register_proc(run_id, proc)
        try:
            assert proc.stdout is not None
            output_tail: List[str] = []
            for line in proc.stdout:
                line = line.rstrip()
                if line:
                    output_tail.append(line)
                    if len(output_tail) > 120:
                        output_tail = output_tail[-120:]
                    append_run_log(run_id, line)
            proc.stdout.close()
        finally:
            self._unregister_proc(run_id)
        rc = proc.wait()
        append_run_log(run_id, f"PowerShell process exited with code {rc}")
        if rc != 0:
            raise RuntimeError(_assessment_run_error_message("\n".join(output_tail), client_sec))


RUN_MANAGER = RunManager()


# ══════════════════════════════════════════════════════════════════════════════
# SCHEDULED ASSESSMENTS CRUD
# ══════════════════════════════════════════════════════════════════════════════

def list_assessment_schedules() -> List[Dict[str, Any]]:
    """Geeft alle recurring assessment-schedules terug."""
    return db_fetchall(
        "SELECT * FROM assessment_schedules ORDER BY tenant_id ASC"
    )


def get_assessment_schedule(tenant_id: str) -> Optional[Dict[str, Any]]:
    """Geeft het schedule voor één tenant, of None als er geen is."""
    return db_fetchone(
        "SELECT * FROM assessment_schedules WHERE tenant_id=?",
        (tenant_id,),
    )


def upsert_assessment_schedule(tenant_id: str, payload: Dict[str, Any], created_by: str) -> Dict[str, Any]:
    """Maakt of overschrijft het recurring schedule voor een tenant.

    payload keys (allen optioneel):
      interval_hours : int  (default 168 = wekelijks)
      phases_csv     : str  (komma-gescheiden fase-namen)
      run_mode       : str  ('live' | 'demo')
      enabled        : bool
    """
    now = now_iso()
    interval = int(payload.get("interval_hours") or 168)
    phases = (payload.get("phases_csv") or
              "users,collaboration,compliance,security,intune,azure").strip()
    run_mode = (payload.get("run_mode") or "live").strip()
    enabled = 1 if payload.get("enabled", True) else 0

    # Bereken next_run_at
    from datetime import datetime, timezone, timedelta
    next_run_dt = datetime.now(timezone.utc) + timedelta(hours=interval)
    next_run_at = next_run_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    existing = db_fetchone(
        "SELECT id, created_at FROM assessment_schedules WHERE tenant_id=?",
        (tenant_id,),
    )
    if existing:
        db_execute(
            """UPDATE assessment_schedules
               SET enabled=?, interval_hours=?, phases_csv=?, run_mode=?,
                   next_run_at=?, updated_at=?
               WHERE tenant_id=?""",
            (enabled, interval, phases, run_mode, next_run_at, now, tenant_id),
        )
        schedule_id = existing["id"]
    else:
        schedule_id = str(uuid.uuid4())
        db_execute(
            """INSERT INTO assessment_schedules
               (id, tenant_id, enabled, interval_hours, phases_csv, run_mode,
                last_run_at, next_run_at, created_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,NULL,?,?,?,?)""",
            (schedule_id, tenant_id, enabled, interval, phases, run_mode,
             next_run_at, created_by, now, now),
        )
    return get_assessment_schedule(tenant_id) or {}


def delete_assessment_schedule(tenant_id: str) -> bool:
    """Verwijdert het schedule voor een tenant. Retourneert True als verwijderd."""
    existing = db_fetchone(
        "SELECT id FROM assessment_schedules WHERE tenant_id=?",
        (tenant_id,),
    )
    if not existing:
        return False
    db_execute("DELETE FROM assessment_schedules WHERE tenant_id=?", (tenant_id,))
    return True


def check_and_fire_due_schedules() -> None:
    """Controleert alle enabled schedules en enqueued een job voor schedules waarvan next_run_at <= nu.

    Wordt aangeroepen vanuit JobDispatcher._loop() bij elke poll.
    """
    from datetime import datetime, timezone, timedelta
    now = now_iso()
    due = db_fetchall(
        "SELECT * FROM assessment_schedules WHERE enabled=1 AND next_run_at<=?",
        (now,),
    )
    for sched in due:
        tid = sched["tenant_id"]
        interval_hours = int(sched.get("interval_hours") or 168)
        phases_csv = sched.get("phases_csv") or "users,collaboration,compliance,security,intune,azure"
        phases = [p.strip() for p in phases_csv.split(",") if p.strip()]
        run_mode = sched.get("run_mode") or "live"

        # Enqueue assessment job
        try:
            enqueue_job(
                "assessment_run",
                tenant_id=tid,
                payload={
                    "phases": phases,
                    "run_mode": run_mode,
                    "scan_type": "full",
                    "started_by": "assessment-scheduler",
                },
            )
        except Exception as exc:
            logger.warning("check_and_fire_due_schedules: enqueue mislukt voor %s: %s", tid, exc)

        # Bereken next_run_at en update last_run_at
        next_run_dt = datetime.now(timezone.utc) + timedelta(hours=interval_hours)
        next_run_at = next_run_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        db_execute(
            "UPDATE assessment_schedules SET last_run_at=?, next_run_at=?, updated_at=? WHERE tenant_id=?",
            (now, next_run_at, now, tid),
        )
        logger.info("Scheduled assessment gestart voor tenant %s, volgende run: %s", tid, next_run_at)


# ══════════════════════════════════════════════════════════════════════════════
# JOB QUEUE DISPATCHER
# ══════════════════════════════════════════════════════════════════════════════

class JobDispatcher:
    """Achtergrondthread die pending jobs uit job_queue oppakt en uitvoert.

    Ondersteunde job_types:
      - assessment_run : start een assessment voor tenant_id (payload: phases, run_mode, scan_type)
      - snapshot_import: importeer portal JSON van een run_id in m365_snapshots
      - findings_refresh: importeer snapshot-findings opnieuw
      - guardian_sync: synchroniseer Intune Guardian events
      - retention_apply: pas retentiebeleid toe
      - tenant_refresh: voer een lichte control-plane refresh uit
    """

    _POLL_INTERVAL = 15  # seconden tussen polls

    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._maintenance_counter = 0

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="job-dispatcher")
        self._thread.start()
        logger.info("JobDispatcher gestart.")

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.wait(self._POLL_INTERVAL):
            try:
                self._poll()

                # Controleer recurring assessment-schedules
                try:
                    check_and_fire_due_schedules()
                except Exception:
                    logger.warning("check_and_fire_due_schedules fout: %s", traceback.format_exc())

                # Refresh materialized views every 20 polls (300 seconds / 5 minutes)
                self._maintenance_counter += 1
                if self._maintenance_counter >= 20:
                    self._maintenance_counter = 0
                    try:
                        refresh_all_materialized_views()
                    except Exception:
                        logger.warning("Materialized view refresh-fout: %s", traceback.format_exc())
            except Exception:
                logger.error("JobDispatcher poll-fout: %s", traceback.format_exc())

    def _poll(self) -> None:
        now = now_iso()
        rows = db_fetchall(
            "SELECT * FROM job_queue WHERE status='pending' AND scheduled_at<=? "
            "ORDER BY priority ASC, scheduled_at ASC LIMIT 5",
            (now,),
        )
        for row in rows:
            job_id = row["id"]
            
            # Check if dependency is met
            if not _check_job_dependency(job_id):
                logger.info("JobDispatcher: job %s waiting for dependency to complete", job_id)
                continue
            
            # Claim de job (optimistic locking via status update)
            updated = db_execute(
                "UPDATE job_queue SET status='running', started_at=?, attempt_count=attempt_count+1 "
                "WHERE id=? AND status='pending'",
                (now, job_id),
            )
            if not updated:
                continue  # al geclaimd door andere thread
            logger.info("JobDispatcher: job %s (%s) gestart.", job_id, row["job_type"])
            threading.Thread(
                target=self._run_job,
                args=(dict(row),),
                daemon=True,
                name=f"job-{job_id[:8]}",
            ).start()

    def _run_job(self, row: Dict[str, Any]) -> None:
        job_id = row["id"]
        job_type = row["job_type"]
        tenant_id = row.get("tenant_id")
        payload: Dict[str, Any] = {}
        try:
            payload = json.loads(row.get("payload_json") or "{}")
        except Exception:
            pass
        
        # Parse progress steps if available
        progress_steps = []
        try:
            if row.get("progress_steps"):
                progress_steps = json.loads(row["progress_steps"])
        except Exception:
            pass
        
        try:
            _update_job_progress(job_id, 0, progress_steps[0] if progress_steps else "started")
            result = self._dispatch(job_type, tenant_id, payload)
            db_execute(
                "UPDATE job_queue SET status='completed', completed_at=?, result_json=? WHERE id=?",
                (now_iso(), json.dumps(result, ensure_ascii=False), job_id),
            )
            _update_job_progress(job_id, len(progress_steps), "completed")
            logger.info("JobDispatcher: job %s voltooid.", job_id)
        except Exception as exc:
            attempt = int(db_fetchone("SELECT attempt_count FROM job_queue WHERE id=?", (job_id,))["attempt_count"] or 1)
            max_att = int(row.get("max_attempts") or 3)
            next_status = "pending" if attempt < max_att else "failed"
            next_scheduled = now_iso() if next_status == "pending" else None
            db_execute(
                "UPDATE job_queue SET status=?, error_message=?, completed_at=?, scheduled_at=COALESCE(?,scheduled_at) WHERE id=?",
                (next_status, str(exc), now_iso() if next_status == "failed" else None, next_scheduled, job_id),
            )
            logger.error("JobDispatcher: job %s mislukt (poging %d/%d): %s", job_id, attempt, max_att, exc)

    def _dispatch(self, job_type: str, tenant_id: Optional[str], payload: Dict[str, Any]) -> Dict[str, Any]:
        if job_type == "assessment_run":
            if not tenant_id:
                raise ValueError("tenant_id vereist voor assessment_run job")
            result = create_run({
                "tenant_id": tenant_id,
                "phases": payload.get("phases") or [f"phase{i}" for i in range(1, 7)],
                "run_mode": payload.get("run_mode") or load_config().get("default_run_mode") or "demo",
                "scan_type": payload.get("scan_type") or "full",
                "started_by": payload.get("started_by") or "job-dispatcher",
            })
            return {"run_id": result.get("id"), "status": "started"}

        if job_type == "snapshot_import":
            run_id = payload.get("run_id")
            if not run_id:
                raise ValueError("run_id vereist voor snapshot_import job")
            count = import_run_snapshots_to_db(run_id)
            return {"snapshots_written": count}

        if job_type == "findings_refresh":
            if not tenant_id:
                raise ValueError("tenant_id vereist voor findings_refresh job")
            run_id = payload.get("run_id")
            if not run_id:
                latest = _latest_completed_run_for_tenant(tenant_id)
                if not latest:
                    raise ValueError("Geen voltooide assessment-run beschikbaar voor findings_refresh")
                run_id = latest["id"]
            count = _persist_snapshot_findings(tenant_id, run_id)
            return {"tenant_id": tenant_id, "run_id": run_id, "findings_written": count}

        if job_type == "guardian_sync":
            if not tenant_id:
                raise ValueError("tenant_id vereist voor guardian_sync job")
            limit = int(payload.get("limit") or 25)
            return sync_management_hub_guardian_events(tenant_id, limit)

        if job_type == "retention_apply":
            keep_latest = int(payload.get("keep_latest") or 10)
            keep_days = int(payload.get("keep_days") or 90)
            return apply_retention_policy(tenant_id, keep_latest, keep_days)

        if job_type == "tenant_refresh":
            if not tenant_id:
                raise ValueError("tenant_id vereist voor tenant_refresh job")
            latest = _latest_completed_run_for_tenant(tenant_id)
            findings_result = None
            if latest:
                try:
                    findings_result = {
                        "run_id": latest["id"],
                        "findings_written": _persist_snapshot_findings(tenant_id, latest["id"]),
                    }
                except Exception as exc:
                    findings_result = {"error": str(exc)}
            return {
                "tenant_id": tenant_id,
                "ops_summary": get_tenant_ops_summary(tenant_id),
                "findings_refresh": findings_result,
            }

        raise ValueError(f"Onbekend job_type: {job_type!r}")


JOB_DISPATCHER = JobDispatcher()


# ══════════════════════════════════════════════════════════════════════════════
# USER MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

_GOD_ADMIN_EMAIL = os.environ.get("DENJOY_ADMIN_EMAIL", "schiphorst.d@gmail.com").strip().lower()


def list_users() -> List[Dict[str, Any]]:
    rows = db_fetchall(
        "SELECT id, email, role, display_name, linked_tenant_id, is_active, created_at, last_login_at "
        "FROM users ORDER BY role DESC, created_at ASC"
    )
    result = []
    for r in rows:
        d = dict(r)
        try:
            d["linked_tenant_id"] = _sync_user_linked_tenant_from_access(d["id"])
        except Exception:
            d["linked_tenant_id"] = d.get("linked_tenant_id")
        d["is_god_admin"] = (d["email"].lower() == _GOD_ADMIN_EMAIL)
        result.append(d)
    return result


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    row = db_fetchone(
        "SELECT id, email, role, display_name, linked_tenant_id, is_active, created_at "
        "FROM users WHERE id=?", (user_id,)
    )
    if not row:
        return None
    d = dict(row)
    try:
        d["linked_tenant_id"] = _sync_user_linked_tenant_from_access(d["id"])
    except Exception:
        d["linked_tenant_id"] = d.get("linked_tenant_id")
    d["is_god_admin"] = (d["email"].lower() == _GOD_ADMIN_EMAIL)
    return d


def create_user_account(payload: Dict[str, Any]) -> Dict[str, Any]:
    email = (payload.get("email") or "").strip().lower()
    password = (payload.get("password") or "").strip()
    role = (payload.get("role") or "klant").strip()
    display_name = (payload.get("display_name") or "").strip()
    linked_tenant_id = payload.get("linked_tenant_id") or None

    if not email:
        raise ValueError("E-mailadres is verplicht.")
    if not password:
        raise ValueError("Wachtwoord is verplicht.")
    if len(password) < 8:
        raise ValueError("Wachtwoord moet minimaal 8 tekens zijn.")
    if role not in ("admin", "klant", "security"):
        raise ValueError("Ongeldige rol — kies 'admin', 'security' of 'klant'.")
    if db_fetchone("SELECT id FROM users WHERE lower(email)=?", (email,)):
        raise ValueError(f"E-mailadres '{email}' bestaat al.")

    pw_hash, salt = _hash_pw(password)
    uid = str(uuid.uuid4())
    db_execute(
        "INSERT INTO users (id, email, password_hash, salt, role, display_name, "
        "linked_tenant_id, is_active, created_at) VALUES (?,?,?,?,?,?,?,1,?)",
        (uid, email, pw_hash, salt, role, display_name, linked_tenant_id, now_iso())
    )
    return get_user(uid)


def update_user_account(user_id: str, payload: Dict[str, Any], requesting_email: str) -> Dict[str, Any]:
    user = get_user(user_id)
    if not user:
        raise ValueError("Gebruiker niet gevonden.")

    is_god = user["email"].lower() == _GOD_ADMIN_EMAIL
    updates: Dict[str, Any] = {}

    if "display_name" in payload:
        updates["display_name"] = (payload["display_name"] or "").strip()
    if "role" in payload:
        if is_god:
            raise ValueError("De rol van het God-Admin account kan niet worden gewijzigd.")
        if payload["role"] not in ("admin", "klant", "security"):
            raise ValueError("Ongeldige rol.")
        updates["role"] = payload["role"]
    if "linked_tenant_id" in payload:
        updates["linked_tenant_id"] = payload["linked_tenant_id"] or None
    if "is_active" in payload:
        if is_god and not payload["is_active"]:
            raise ValueError("Het God-Admin account kan niet worden gedeactiveerd.")
        updates["is_active"] = 1 if payload["is_active"] else 0
    if "password" in payload and payload["password"]:
        pw = payload["password"].strip()
        if len(pw) < 8:
            raise ValueError("Wachtwoord moet minimaal 8 tekens zijn.")
        pw_hash, salt = _hash_pw(pw)
        updates["password_hash"] = pw_hash
        updates["salt"] = salt

    if not updates:
        return user

    set_clause = ", ".join(f"{k}=?" for k in updates)
    db_execute(f"UPDATE users SET {set_clause} WHERE id=?", list(updates.values()) + [user_id])
    return get_user(user_id)


def delete_user_account(user_id: str, requesting_email: str) -> Dict[str, Any]:
    user = get_user(user_id)
    if not user:
        raise ValueError("Gebruiker niet gevonden.")
    if user["email"].lower() == _GOD_ADMIN_EMAIL:
        raise ValueError("Het God-Admin account kan niet worden verwijderd.")
    if user["email"].lower() == requesting_email.lower():
        raise ValueError("Je kunt je eigen account niet verwijderen.")
    # Verwijder actieve sessies van deze gebruiker
    db_execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
    db_execute("DELETE FROM users WHERE id=?", (user_id,))
    return {"ok": True, "deleted_id": user_id}


# ══════════════════════════════════════════════════════════════════════════════


def list_tenants(sess: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    if not sess or str(sess.get("role") or "") == "admin":
        tenants = db_fetchall("SELECT * FROM tenants WHERE is_active=1 ORDER BY customer_name, tenant_name")
    else:
        email = str(sess.get("email") or "").strip().lower()
        user = db_fetchone("SELECT id, linked_tenant_id FROM users WHERE lower(email)=?", (email,)) if email else None
        if not user:
            return []

        customer_ids = [
            str(row.get("customer_id") or "").strip()
            for row in db_fetchall(
                """
                SELECT DISTINCT customer_id
                FROM user_customer_access
                WHERE portal_user_id=?
                  AND (
                    expires_at IS NULL
                    OR expires_at=''
                    OR expires_at > ?
                  )
                """,
                (user["id"], now_iso()),
            )
            if row.get("customer_id")
        ]

        linked_tenant_id = str(user.get("linked_tenant_id") or "").strip()
        tenants: List[Dict[str, Any]] = []
        if customer_ids:
            placeholders = ",".join(["?"] * len(customer_ids))
            tenants = db_fetchall(
                f"SELECT * FROM tenants WHERE is_active=1 AND customer_id IN ({placeholders}) ORDER BY customer_name, tenant_name",
                tuple(customer_ids),
            )

        if linked_tenant_id and not any(t.get("id") == linked_tenant_id for t in tenants):
            linked_tenant = db_fetchone(
                "SELECT * FROM tenants WHERE is_active=1 AND id=?",
                (linked_tenant_id,),
            )
            if linked_tenant:
                tenants.append(linked_tenant)

    for t in tenants:
        latest = db_fetchone("SELECT * FROM assessment_runs WHERE tenant_id=? ORDER BY started_at DESC LIMIT 1", (t["id"],))
        t["latest_run"] = latest
        t["ops_summary"] = get_tenant_ops_summary(t["id"])
    return tenants


def update_tenant(tenant_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    tenant = db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,))
    if not tenant:
        raise ValueError("Tenant niet gevonden")

    allowed = {
        "customer_id",
        "customer_name",
        "tenant_name",
        "tenant_guid",
        "status",
        "owner_primary",
        "owner_backup",
        "tags_csv",
        "risk_profile",
        "notes",
    }
    fields: Dict[str, Any] = {}
    for k, v in payload.items():
        if k not in allowed:
            continue
        if isinstance(v, str):
            value = v.strip()
            if k == "customer_id":
                fields[k] = value or None
            else:
                fields[k] = value
        else:
            fields[k] = v
    if "customer_id" in fields and fields["customer_id"]:
        customer = db_fetchone("SELECT id, name FROM customers WHERE id=?", (fields["customer_id"],))
        if not customer:
            raise ValueError("Gekoppelde klant niet gevonden")
        if not payload.get("customer_name"):
            fields["customer_name"] = str(customer.get("name") or tenant.get("customer_name") or "").strip() or tenant.get("customer_name")
    if "status" in fields and fields["status"] not in {"active", "onboarding", "paused", "offboarded"}:
        raise ValueError("Ongeldige status")
    if "risk_profile" in fields and fields["risk_profile"] not in {"low", "standard", "high", "critical"}:
        raise ValueError("Ongeldig risicoprofiel")
    fields["updated_at"] = now_iso()

    keys = list(fields.keys())
    if keys:
        sql = "UPDATE tenants SET " + ", ".join([f"{k}=?" for k in keys]) + " WHERE id=?"
        vals = [fields[k] for k in keys] + [tenant_id]
        db_execute(sql, tuple(vals))
    _invalidate_tenant_perf_cache(tenant_id)
    return db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,)) or {}


# ── Customer CRUD (Fase 3) ────────────────────────────────────────────────────

def list_customers(status: Optional[str] = None) -> List[Dict[str, Any]]:
    """Lijst alle klanten, optioneel gefilterd op status."""
    rows = model_list_customers_rows(status)
    for c in rows:
        c["tenant_count"] = model_count_active_tenants(c["id"])
        c["service_count"] = model_count_enabled_services(c["id"])
        c["health_summary"] = get_customer_health(c["id"]).get("summary", {})
        c["onboarding_summary"] = get_customer_onboarding_summary(c["id"])
    return rows


def get_customer(customer_id: str) -> Optional[Dict[str, Any]]:
    """Haalt één klant op inclusief gekoppelde tenants en services."""
    c = model_get_customer_row(customer_id)
    if not c:
        return None
    c["tenants"] = _list_customer_tenants_with_fallback(customer_id)
    c["services"] = model_list_customer_services(customer_id)
    c["health_summary"] = get_customer_health(customer_id).get("summary", {})
    c["onboarding_summary"] = get_customer_onboarding_summary(customer_id)
    return c


def _auto_link_customer_tenants(customer_id: str, customer_name: str) -> None:
    name = str(customer_name or "").strip()
    if not customer_id or not name:
        return
    normalized = name.lower()
    exact_matches = db_fetchall(
        """
        SELECT id, tenant_name, customer_name
        FROM tenants
        WHERE is_active=1
          AND (customer_id IS NULL OR TRIM(customer_id)='')
          AND (
            LOWER(TRIM(COALESCE(tenant_name, ''))) = ?
            OR LOWER(TRIM(COALESCE(customer_name, ''))) = ?
          )
        ORDER BY tenant_name
        """,
        (normalized, normalized),
    )
    for tenant in exact_matches:
        db_execute(
            "UPDATE tenants SET customer_id=?, customer_name=?, updated_at=? WHERE id=?",
            (customer_id, name, now_iso(), tenant["id"]),
        )
        _invalidate_tenant_perf_cache(tenant["id"])


def _list_customer_tenants_with_fallback(customer_id: str) -> List[Dict[str, Any]]:
    tenants = db_fetchall(
        "SELECT id, tenant_name, tenant_guid, status, customer_id, customer_name FROM tenants WHERE customer_id=? AND is_active=1 ORDER BY tenant_name",
        (customer_id,),
    )
    if tenants:
        return tenants
    customer = model_get_customer_row(customer_id)
    customer_name = str((customer or {}).get("name") or "").strip().lower()
    if not customer_name:
        return []
    return db_fetchall(
        """
        SELECT id, tenant_name, tenant_guid, status, customer_id, customer_name
        FROM tenants
        WHERE is_active=1
          AND (customer_id IS NULL OR TRIM(customer_id)='')
          AND (
            LOWER(TRIM(COALESCE(tenant_name, ''))) = ?
            OR LOWER(TRIM(COALESCE(customer_name, ''))) = ?
          )
        ORDER BY tenant_name
        """,
        (customer_name, customer_name),
    )


def create_customer(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Maakt een nieuwe klantkaart aan."""
    cid = model_create_customer_row(payload)
    _auto_link_customer_tenants(cid, str(payload.get("name") or ""))
    return get_customer(cid) or {}


def update_customer(customer_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Werkt een bestaande klantkaart bij."""
    model_update_customer_fields(customer_id, payload)
    updated = model_get_customer_row(customer_id) or {}
    _auto_link_customer_tenants(customer_id, str(updated.get("name") or payload.get("name") or ""))
    return get_customer(customer_id) or {}


def upsert_customer_service(customer_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    _, row = model_upsert_customer_service_row(customer_id, payload)
    service_key = str(row.get("service_key") or "")
    is_enabled = int(row.get("is_enabled") or 0)
    onboarded_at = row.get("onboarded_at")
    create_action_log(
        None,
        "customers",
        "services",
        "customer_service_upsert",
        {
            "customer_id": customer_id,
            "service_key": service_key,
            "is_enabled": bool(is_enabled),
            "onboarded_at": onboarded_at,
        },
    )
    return row


def launch_onboarding_job_chain(tenant_id: str, plan_key: str, requested_by: str = "") -> Dict[str, Any]:
    if not db_fetchone("SELECT id FROM tenants WHERE id=?", (tenant_id,)):
        raise ValueError("Tenant niet gevonden")
    supported_plans = {
        "readiness": [
            ("tenant_refresh", {}),
            ("guardian_sync", {"limit": 25}),
            ("assessment_run", {"phases": ["phase1", "phase3", "phase5"], "run_mode": "demo", "scan_type": "full", "started_by": requested_by or "portal"}),
        ],
        "baseline": [
            ("tenant_refresh", {}),
            ("assessment_run", {"phases": ["phase3", "phase5"], "run_mode": "demo", "scan_type": "full", "started_by": requested_by or "portal"}),
            ("findings_refresh", {}),
        ],
        "operations": [
            ("tenant_refresh", {}),
            ("guardian_sync", {"limit": 25}),
            ("findings_refresh", {}),
            ("retention_apply", {}),
        ],
    }
    plan = supported_plans.get(plan_key)
    if not plan:
        raise ValueError("Onbekend onboardingplan")
    chain_id = str(uuid.uuid4())
    jobs: List[Dict[str, Any]] = []
    for index, (job_type, payload) in enumerate(plan):
        enriched_payload = dict(payload or {})
        enriched_payload["chain_id"] = chain_id
        enriched_payload["chain_plan"] = plan_key
        enriched_payload["chain_step"] = index + 1
        enriched_payload["chain_total"] = len(plan)
        row = enqueue_job(job_type, tenant_id=tenant_id, payload=enriched_payload, priority=5)
        create_action_log(
            tenant_id,
            "operations",
            "onboarding",
            "job_chain_enqueued",
            {"chain_id": chain_id, "plan_key": plan_key, "job_type": job_type, "step": index + 1},
        )
        jobs.append(row)
    db_audit(requested_by or "portal", "", "job_chain_enqueued", "tenant", tenant_id, f"plan={plan_key}", tenant_id=tenant_id)
    return {"ok": True, "tenant_id": tenant_id, "plan_key": plan_key, "chain_id": chain_id, "jobs": jobs}


def delete_customer(customer_id: str) -> Dict[str, Any]:
    """Verwijdert een klant. Mislukt als er nog actieve tenants gekoppeld zijn."""
    if not model_customer_exists(customer_id):
        raise ValueError("Klant niet gevonden")
    if model_count_active_tenants(customer_id) > 0:
        raise ValueError("Klant heeft nog actieve tenants — ontkoppel of deactiveer tenants eerst")
    model_delete_customer_row(customer_id)
    return {"id": customer_id, "deleted": True}


# ── Portal Roles ──────────────────────────────────────────────────────────────

def list_portal_roles() -> List[Dict[str, Any]]:
    return db_fetchall("SELECT * FROM portal_roles ORDER BY role_key")


# ── User Customer Access ──────────────────────────────────────────────────────

def list_user_customer_access(customer_id: Optional[str] = None,
                               user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    if customer_id and user_id:
        rows = db_fetchall("SELECT * FROM user_customer_access WHERE customer_id=? AND portal_user_id=?",
                           (customer_id, user_id))
    elif customer_id:
        rows = db_fetchall("SELECT * FROM user_customer_access WHERE customer_id=?", (customer_id,))
    elif user_id:
        rows = db_fetchall("SELECT * FROM user_customer_access WHERE portal_user_id=?", (user_id,))
    else:
        rows = db_fetchall("SELECT * FROM user_customer_access")
    return rows


def _active_tenants_for_customer(customer_id: str) -> List[Dict[str, Any]]:
    if not customer_id:
        return []
    return db_fetchall(
        "SELECT id, customer_id, customer_name, tenant_name "
        "FROM tenants WHERE is_active=1 AND customer_id=? ORDER BY customer_name, tenant_name",
        (customer_id,),
    )


def _normalize_access_scope(scope: Optional[Any]) -> str:
    if scope is None:
        return ""
    if isinstance(scope, str):
        return scope.strip()
    try:
        return json.dumps(scope, ensure_ascii=False)
    except Exception:
        return ""


def _parse_access_scope(scope: Optional[Any]) -> Dict[str, Any]:
    if isinstance(scope, dict):
        return scope
    raw = str(scope or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _sync_user_linked_tenant_from_access(user_id: str, preferred_customer_id: Optional[str] = None) -> Optional[str]:
    user = db_fetchone("SELECT id, linked_tenant_id FROM users WHERE id=?", (user_id,))
    if not user:
        raise ValueError("Gebruiker niet gevonden")

    access_rows = db_fetchall(
        """
        SELECT DISTINCT uca.customer_id, t.id AS tenant_id
        FROM user_customer_access uca
        LEFT JOIN tenants t ON t.customer_id = uca.customer_id AND t.is_active=1
        WHERE uca.portal_user_id=?
          AND (
            uca.expires_at IS NULL
            OR uca.expires_at=''
            OR uca.expires_at > ?
          )
        """,
        (user_id, now_iso()),
    )
    accessible_tenant_ids = [str(row.get("tenant_id") or "").strip() for row in access_rows if row.get("tenant_id")]
    current_linked = str(user.get("linked_tenant_id") or "").strip()

    preferred_tenant_ids: List[str] = []
    if preferred_customer_id:
        preferred_tenant_ids = [
            str(row.get("id") or "").strip()
            for row in _active_tenants_for_customer(preferred_customer_id)
            if row.get("id")
        ]

    new_linked_tenant_id: Optional[str] = None
    if len(preferred_tenant_ids) == 1 and (not current_linked or current_linked in preferred_tenant_ids or current_linked not in accessible_tenant_ids):
        new_linked_tenant_id = preferred_tenant_ids[0]
    elif current_linked and current_linked in accessible_tenant_ids:
        new_linked_tenant_id = current_linked
    else:
        unique_accessible = sorted(set(accessible_tenant_ids))
        if len(unique_accessible) == 1:
            new_linked_tenant_id = unique_accessible[0]

    db_execute("UPDATE users SET linked_tenant_id=? WHERE id=?", (new_linked_tenant_id, user_id))
    return new_linked_tenant_id


def grant_customer_access(customer_id: str, user_id: str, role_key: str,
                           granted_by: str = "", expires_at: Optional[str] = None,
                           scope: Optional[Any] = None) -> Dict[str, Any]:
    role = db_fetchone("SELECT id FROM portal_roles WHERE role_key=?", (role_key,))
    if not role:
        raise ValueError(f"Onbekende rol: {role_key}")
    if not db_fetchone("SELECT id FROM customers WHERE id=?", (customer_id,)):
        raise ValueError("Klant niet gevonden")
    if not db_fetchone("SELECT id FROM users WHERE id=?", (user_id,)):
        raise ValueError("Gebruiker niet gevonden")
    aid = str(uuid.uuid4())
    db_execute(
        "INSERT OR REPLACE INTO user_customer_access "
        "(id, portal_user_id, customer_id, portal_role_id, scope, granted_by, granted_at, expires_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (aid, user_id, customer_id, role["id"], _normalize_access_scope(scope), granted_by, now_iso(), expires_at),
    )
    row = db_fetchone("SELECT * FROM user_customer_access WHERE id=?", (aid,)) or {}
    row["linked_tenant_id"] = _sync_user_linked_tenant_from_access(user_id, customer_id)
    return row


def revoke_customer_access(customer_id: str, user_id: str) -> Dict[str, Any]:
    row = db_fetchone(
        "SELECT id FROM user_customer_access WHERE customer_id=? AND portal_user_id=?",
        (customer_id, user_id),
    )
    if not row:
        raise ValueError("Toegangstoewijzing niet gevonden")
    db_execute("DELETE FROM user_customer_access WHERE id=?", (row["id"],))
    linked_tenant_id = _sync_user_linked_tenant_from_access(user_id)
    return {
        "ok": True,
        "deleted": True,
        "customer_id": customer_id,
        "user_id": user_id,
        "linked_tenant_id": linked_tenant_id,
    }


# ── Integrations CRUD ─────────────────────────────────────────────────────────

def list_integrations(tenant_id: Optional[str] = None) -> List[Dict[str, Any]]:
    if tenant_id:
        return db_fetchall("SELECT * FROM integrations WHERE tenant_id=? ORDER BY integration_type",
                           (tenant_id,))
    return db_fetchall("SELECT * FROM integrations ORDER BY tenant_id, integration_type")


def get_integration(integration_id: str) -> Optional[Dict[str, Any]]:
    return db_fetchone("SELECT * FROM integrations WHERE id=?", (integration_id,))


def upsert_integration(tenant_id: str, integration_type: str,
                       payload: Dict[str, Any]) -> Dict[str, Any]:
    existing = db_fetchone(
        "SELECT id FROM integrations WHERE tenant_id=? AND integration_type=?",
        (tenant_id, integration_type),
    )
    ts = now_iso()
    allowed = {"status", "auth_mode", "gdap_status", "lighthouse_status",
               "app_registration_status", "certificate_status", "last_validated_at", "details_json"}
    fields: Dict[str, Any] = {k: v for k, v in payload.items() if k in allowed}
    if existing:
        fields["updated_at"] = ts
        sql = "UPDATE integrations SET " + ", ".join(f"{k}=?" for k in fields) + " WHERE id=?"
        db_execute(sql, tuple(fields.values()) + (existing["id"],))
        row = db_fetchone("SELECT * FROM integrations WHERE id=?", (existing["id"],)) or {}
        create_action_log(
            tenant_id,
            "onboarding",
            "integrations",
            "integration_updated",
            {"integration_type": integration_type, "status": row.get("status"), "fields": sorted(list(fields.keys()))},
        )
        return row
    iid = str(uuid.uuid4())
    db_execute(
        "INSERT INTO integrations (id, tenant_id, integration_type, status, auth_mode, "
        "gdap_status, lighthouse_status, app_registration_status, certificate_status, "
        "last_validated_at, details_json, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (iid, tenant_id, integration_type,
         fields.get("status", "unknown"), fields.get("auth_mode"),
         fields.get("gdap_status"), fields.get("lighthouse_status"),
         fields.get("app_registration_status"), fields.get("certificate_status"),
         fields.get("last_validated_at"), fields.get("details_json"), ts, ts),
    )
    row = db_fetchone("SELECT * FROM integrations WHERE id=?", (iid,)) or {}
    create_action_log(
        tenant_id,
        "onboarding",
        "integrations",
        "integration_created",
        {"integration_type": integration_type, "status": row.get("status")},
    )
    return row


# ── Subscriptions (Azure) ─────────────────────────────────────────────────────

def list_subscriptions(tenant_id: str) -> List[Dict[str, Any]]:
    return db_fetchall(
        "SELECT * FROM subscriptions WHERE tenant_id=? ORDER BY display_name", (tenant_id,)
    )


def upsert_subscription(tenant_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    azure_sub_id = (payload.get("azure_subscription_id") or "").strip()
    if not azure_sub_id:
        raise ValueError("azure_subscription_id is verplicht")
    existing = db_fetchone(
        "SELECT id FROM subscriptions WHERE tenant_id=? AND azure_subscription_id=?",
        (tenant_id, azure_sub_id),
    )
    ts = now_iso()
    if existing:
        db_execute(
            "UPDATE subscriptions SET display_name=?, state=?, lighthouse_onboarded=?, "
            "management_group=? WHERE id=?",
            (payload.get("display_name"), payload.get("state", "active"),
             1 if payload.get("lighthouse_onboarded") else 0,
             payload.get("management_group"), existing["id"]),
        )
        return db_fetchone("SELECT * FROM subscriptions WHERE id=?", (existing["id"],)) or {}
    sid = str(uuid.uuid4())
    db_execute(
        "INSERT INTO subscriptions (id, tenant_id, azure_subscription_id, display_name, "
        "state, lighthouse_onboarded, management_group, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (sid, tenant_id, azure_sub_id, payload.get("display_name"),
         payload.get("state", "active"),
         1 if payload.get("lighthouse_onboarded") else 0,
         payload.get("management_group"), ts),
    )
    return db_fetchone("SELECT * FROM subscriptions WHERE id=?", (sid,)) or {}


# ── Approval Workflow ─────────────────────────────────────────────────────────

def create_approval(action_log_id: str, requested_by: str,
                    reason: Optional[str] = None) -> Dict[str, Any]:
    if not db_fetchone("SELECT id FROM action_logs WHERE id=?", (action_log_id,)):
        raise ValueError("action_log niet gevonden")
    existing = db_fetchone("SELECT id FROM approvals WHERE action_log_id=?", (action_log_id,))
    if existing:
        raise ValueError("Er is al een approval-verzoek voor deze actie")
    aid = str(uuid.uuid4())
    db_execute(
        "INSERT INTO approvals (id, action_log_id, approval_status, requested_by, requested_at, reason) "
        "VALUES (?, ?, 'pending', ?, ?, ?)",
        (aid, action_log_id, requested_by, now_iso(), reason),
    )
    return db_fetchone("SELECT * FROM approvals WHERE id=?", (aid,)) or {}


def _ensure_approval_request_schema() -> None:
    cols = {row[1] for row in get_conn().execute("PRAGMA table_info(approval_requests)").fetchall()}
    if "metadata_json" not in cols:
        get_conn().execute("ALTER TABLE approval_requests ADD COLUMN metadata_json TEXT")
        get_conn().commit()


def request_action_approval(
    action_key: str,
    action_name: str,
    action_description: str,
    requested_by: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Request approval for a sensitive action (no action_log tied)."""
    if not requested_by:
        raise ValueError("requested_by is verplicht")
    _ensure_approval_request_schema()
    metadata_json = json.dumps(metadata or {})
    rid = str(uuid.uuid4())
    db_execute(
        "INSERT INTO approval_requests (id, action_key, action_name, action_description, metadata_json, requested_by, status, requested_at) "
        "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
        (rid, action_key, action_name, action_description, metadata_json, requested_by, now_iso()),
    )
    return db_fetchone("SELECT * FROM approval_requests WHERE id=?", (rid,)) or {}


def request_onboarding_approval(
    tenant_id: str,
    subsection: str,
    action_type: str,
    requested_by: str,
    reason: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    action_log = create_action_log(
        tenant_id,
        "onboarding",
        subsection,
        action_type,
        metadata or {},
        result="pending",
    )
    approval = create_approval(action_log.get("id") or "", requested_by, reason)
    db_audit(
        requested_by,
        "",
        "approval_requested",
        "tenant",
        tenant_id,
        f"subsection={subsection} action_type={action_type}",
        tenant_id=tenant_id,
    )
    return {
        "ok": True,
        "approval": approval,
        "action_log": action_log,
    }


def list_approvals(status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    if status:
        rows = db_fetchall(
            "SELECT ap.*, al.tenant_id, al.section, al.subsection, al.action_type, al.metadata_json "
            "FROM approvals ap LEFT JOIN action_logs al ON al.id=ap.action_log_id "
            "WHERE ap.approval_status=? ORDER BY ap.requested_at DESC LIMIT ?",
            (status, min(limit, 500)),
        )
    else:
        rows = db_fetchall(
            "SELECT ap.*, al.tenant_id, al.section, al.subsection, al.action_type, al.metadata_json "
            "FROM approvals ap LEFT JOIN action_logs al ON al.id=ap.action_log_id "
            "ORDER BY ap.requested_at DESC LIMIT ?",
            (min(limit, 500),),
        )
    for row in rows:
        try:
            row["metadata"] = json.loads(row.get("metadata_json") or "{}")
        except Exception:
            row["metadata"] = {}
    return rows


def list_approval_requests(status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    _ensure_approval_request_schema()
    if status:
        rows = db_fetchall(
            "SELECT id, action_key, action_name, action_description, metadata_json, requested_by, status, approved_by, requested_at, approved_at, expires_at "
            "FROM approval_requests WHERE status=? ORDER BY requested_at DESC LIMIT ?",
            (status, min(limit, 500)),
        )
    else:
        rows = db_fetchall(
            "SELECT id, action_key, action_name, action_description, metadata_json, requested_by, status, approved_by, requested_at, approved_at, expires_at "
            "FROM approval_requests ORDER BY requested_at DESC LIMIT ?",
            (min(limit, 500),),
        )
    for row in rows:
        try:
            row["metadata"] = json.loads(row.get("metadata_json") or "{}")
        except Exception:
            row["metadata"] = {}
    return rows


def decide_approval(approval_id: str, decision: str,
                    decided_by: str, reason: Optional[str] = None) -> Dict[str, Any]:
    ap = db_fetchone("SELECT * FROM approvals WHERE id=?", (approval_id,))
    if not ap:
        raise ValueError("Approval niet gevonden")
    if ap["approval_status"] != "pending":
        raise ValueError(f"Approval is al afgehandeld: {ap['approval_status']}")
    if decision not in ("approved", "rejected"):
        raise ValueError("decision moet 'approved' of 'rejected' zijn")
    db_execute(
        "UPDATE approvals SET approval_status=?, approved_by=?, approved_at=?, reason=? WHERE id=?",
        (decision, decided_by, now_iso(), reason or ap["reason"], approval_id),
    )
    return db_fetchone("SELECT * FROM approvals WHERE id=?", (approval_id,)) or {}


def _execute_approval_request(req: Dict[str, Any], decided_by: str) -> Dict[str, Any]:
    _ensure_approval_request_schema()
    metadata = {}
    try:
        metadata = json.loads(req.get("metadata_json") or "{}")
    except Exception:
        metadata = {}
    action_key = str(req.get("action_key") or "").strip()
    if action_key == "customer.access.manage":
        customer_id = str(metadata.get("customer_id") or "").strip()
        user_id = str(metadata.get("user_id") or "").strip()
        role_key = str(metadata.get("role_key") or "read_only").strip() or "read_only"
        scope = metadata.get("scope") or {}
        if not customer_id or not user_id:
            raise ValueError("Approval request mist customer_id of user_id")
        result = grant_customer_access(customer_id, user_id, role_key, decided_by, scope=scope)
        create_action_log(
            None,
            "customers",
            "access",
            "approval_request_executed",
            {
                "customer_id": customer_id,
                "approval_request_id": req.get("id"),
                "user_id": user_id,
                "role_key": role_key,
                "scope": scope,
                "requested_by": req.get("requested_by"),
            },
            result="success",
        )
        db_audit(
            decided_by,
            "",
            "customer_access_approved",
            "customer",
            customer_id,
            f"user_id={user_id} role_key={role_key}",
            tenant_id="",
        )
        return result
    raise ValueError(f"Niet-uitvoerbare approval request: {action_key}")


def approval_exists(approval_id: str) -> bool:
    return bool(
        db_fetchone("SELECT id FROM approvals WHERE id=?", (approval_id,))
        or db_fetchone("SELECT id FROM approval_requests WHERE id=?", (approval_id,))
    )


def decide_any_approval(approval_id: str, decision: str,
                        decided_by: str, reason: Optional[str] = None) -> Dict[str, Any]:
    _ensure_approval_request_schema()
    req = db_fetchone("SELECT * FROM approval_requests WHERE id=?", (approval_id,))
    if req:
        if req["status"] != "pending":
            raise ValueError(f"Approval request is al afgehandeld: {req['status']}")
        if decision not in ("approved", "rejected"):
            raise ValueError("decision moet 'approved' of 'rejected' zijn")
        execution_result = None
        if decision == "approved":
            execution_result = _execute_approval_request(req, decided_by)
        db_execute(
            "UPDATE approval_requests SET status=?, approved_by=?, approved_at=? WHERE id=?",
            (decision, decided_by, now_iso(), approval_id),
        )
        updated = db_fetchone("SELECT * FROM approval_requests WHERE id=?", (approval_id,)) or {}
        try:
            updated["metadata"] = json.loads(updated.get("metadata_json") or "{}")
        except Exception:
            updated["metadata"] = {}
        if execution_result is not None:
            updated["execution_result"] = execution_result
        updated["approval_status"] = updated.get("status")
        updated["approval_kind"] = "request"
        return updated
    return decide_approval(approval_id, decision, decided_by, reason)


# ── Customer Health ───────────────────────────────────────────────────────────

def get_customer_health(customer_id: str) -> Dict[str, Any]:
    """Samengevat health-overzicht per klant op basis van beschikbare data."""
    c = db_fetchone("SELECT * FROM customers WHERE id=?", (customer_id,))
    if not c:
        raise ValueError("Klant niet gevonden")
    tenants = _list_customer_tenants_with_fallback(customer_id)
    def _last_run(tid: str) -> Dict[str, Any]:
        return db_fetchone(
            "SELECT completed_at, score_overall, critical_count, warning_count "
            "FROM assessment_runs WHERE tenant_id=? AND status='completed' "
            "ORDER BY completed_at DESC LIMIT 1",
            (tid,),
        )

    def _integrations(tid: str) -> List[Dict[str, Any]]:
        return db_fetchall(
            "SELECT integration_type, status, gdap_status FROM integrations WHERE tenant_id=?",
            (tid,),
        )

    return build_customer_health(
        c,
        tenants,
        _last_run,
        _integrations,
        get_tenant_onboarding_status,
        get_tenant_ops_summary,
        now_iso,
    )


# ── Tenant Onboarding Status ──────────────────────────────────────────────────

def get_tenant_onboarding_status(tenant_id: str) -> Dict[str, Any]:
    """Bepaalt de onboarding-voortgang voor een tenant op basis van bekende data."""
    t = db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,))
    if not t:
        raise ValueError("Tenant niet gevonden")
    customer_services = db_fetchall(
        "SELECT service_key, is_enabled FROM customer_services WHERE customer_id=?",
        (t.get("customer_id"),),
    ) if t.get("customer_id") else []
    integrations = {
        r["integration_type"]: r
        for r in db_fetchall("SELECT * FROM integrations WHERE tenant_id=?", (tenant_id,))
    }
    auth_ready = _has_auth_profile_config(tenant_id)
    kb_summary = _tenant_kb_summary(tenant_id)
    last_run = db_fetchone(
        "SELECT id, completed_at FROM assessment_runs WHERE tenant_id=? AND status='completed' "
        "ORDER BY completed_at DESC LIMIT 1",
        (tenant_id,),
    )
    return build_tenant_onboarding_status(
        t,
        customer_services,
        integrations,
        auth_ready,
        kb_summary,
        last_run or {},
        now_iso,
    )


def _tenant_capability_summary(tenant_id: str) -> Dict[str, Any]:
    try:
        capability_data = get_tenant_capabilities(tenant_id)
    except Exception:
        capability_data = {"modules": []}
    counts = {
        "ready": 0,
        "validation_required": 0,
        "config_required": 0,
        "snapshot_only": 0,
        "not_implemented": 0,
    }
    for module in capability_data.get("modules") or []:
        for item in module.get("subsections") or []:
            status = str(item.get("status") or "").strip()
            if status in counts:
                counts[status] += 1
    total = sum(counts.values())
    live_ready = counts["ready"] + counts["validation_required"]
    return {
        **counts,
        "total": total,
        "live_ready": live_ready,
        "coverage_pct": round((live_ready / total) * 100) if total else 0,
    }


def _tenant_job_summary(tenant_id: str) -> Dict[str, Any]:
    rows = db_fetchall(
        "SELECT status, COUNT(*) AS cnt FROM job_queue WHERE tenant_id=? GROUP BY status",
        (tenant_id,),
    )
    counts = {str(r.get("status") or ""): int(r.get("cnt") or 0) for r in rows}
    return {
        "pending": counts.get("pending", 0),
        "running": counts.get("running", 0),
        "failed": counts.get("failed", 0),
        "completed": counts.get("completed", 0),
        "cancelled": counts.get("cancelled", 0),
        "total": sum(counts.values()),
    }


def _tenant_kb_summary(tenant_id: str) -> Dict[str, Any]:
    try:
        assets = len(kb_list_assets(tenant_id))
        pages = len(kb_list_pages(tenant_id))
        contacts = len(kb_list_contacts(tenant_id))
        software = len(kb_list_software(tenant_id))
        domains = len(kb_list_domains(tenant_id))
        changes = len(kb_list_changelog(tenant_id))
    except Exception:
        assets = pages = contacts = software = domains = changes = 0
    return {
        "assets": assets,
        "pages": pages,
        "contacts": contacts,
        "software": software,
        "domains": domains,
        "changes": changes,
    }


def get_tenant_ops_summary(tenant_id: str) -> Dict[str, Any]:
    snapshot = _latest_assessment_snapshot_for_tenant(tenant_id)
    last_run = db_fetchone(
        "SELECT completed_at, score_overall, critical_count, warning_count, info_count "
        "FROM assessment_runs WHERE tenant_id=? AND status='completed' "
        "ORDER BY completed_at DESC LIMIT 1",
        (tenant_id,),
    ) or {}
    onboarding = get_tenant_onboarding_status(tenant_id)
    capability_summary = _tenant_capability_summary(tenant_id)
    job_summary = _tenant_job_summary(tenant_id)
    kb_summary = _tenant_kb_summary(tenant_id)
    integrations = list_integrations(tenant_id)
    integration_ready = sum(1 for item in integrations if str(item.get("status") or "").lower() == "active")
    return {
        "onboarding": onboarding,
        "capability_summary": capability_summary,
        "job_summary": job_summary,
        "kb_summary": kb_summary,
        "integration_summary": {
            "total": len(integrations),
            "active": integration_ready,
        },
        "assessment_summary": {
            "score": last_run.get("score_overall"),
            "critical_count": int(last_run.get("critical_count") or 0),
            "warning_count": int(last_run.get("warning_count") or 0),
            "info_count": int(last_run.get("info_count") or 0),
            "completed_at": last_run.get("completed_at"),
            "mfa_coverage": snapshot.get("mfa_coverage"),
            "secure_score_percentage": snapshot.get("secure_score_percentage"),
        },
    }


def get_customer_onboarding_summary(customer_id: str) -> Dict[str, Any]:
    tenants = _list_customer_tenants_with_fallback(customer_id)
    statuses = [get_tenant_onboarding_status(t["id"]) for t in tenants]
    return build_customer_onboarding_summary(statuses)


def get_customer_finance_summary(customer_id: str) -> Dict[str, Any]:
    c = db_fetchone("SELECT * FROM customers WHERE id=?", (customer_id,))
    if not c:
        raise ValueError("Klant niet gevonden")
    tenants = _list_customer_tenants_with_fallback(customer_id)
    onboarding = get_customer_onboarding_summary(customer_id)

    # Batch-load subscriptions en cost_snapshots in 2 queries i.p.v. N+N
    tenant_ids = [t["id"] for t in tenants]
    if tenant_ids:
        placeholders = ",".join("?" * len(tenant_ids))
        _all_subs = db_fetchall(
            f"SELECT * FROM subscriptions WHERE tenant_id IN ({placeholders})",
            tuple(tenant_ids),
        )
        _all_snaps = db_fetchall(
            f"SELECT * FROM cost_snapshots WHERE tenant_id IN ({placeholders}) "
            f"ORDER BY generated_at DESC",
            tuple(tenant_ids),
        )
    else:
        _all_subs, _all_snaps = [], []

    from collections import defaultdict
    _subs_by_tenant: Dict[str, List] = defaultdict(list)
    for s in _all_subs:
        _subs_by_tenant[s["tenant_id"]].append(s)
    _snaps_by_tenant: Dict[str, List] = defaultdict(list)
    for s in _all_snaps:
        _snaps_by_tenant[s["tenant_id"]].append(s)

    return build_customer_finance_summary(
        c,
        tenants,
        onboarding,
        lambda tid: _subs_by_tenant.get(tid, []),
        lambda tid: _snaps_by_tenant.get(tid, []),
        now_iso,
    )


def get_customer_overview(customer_id: str) -> Dict[str, Any]:
    customer = get_customer(customer_id)
    if not customer:
        raise ValueError("Klant niet gevonden")

    tenants = customer.get("tenants") or []
    onboarding = {
        "customer_id": customer_id,
        "summary": get_customer_onboarding_summary(customer_id),
        "tenants": [get_tenant_onboarding_status(t["id"]) for t in tenants],
    }
    health = get_customer_health(customer_id)
    finance = get_customer_finance_summary(customer_id)

    tenant_trends: Dict[str, List[Dict[str, Any]]] = {}
    avg_trend: List[Dict[str, Any]] = []
    bucket: Dict[str, Dict[str, float]] = {}

    for tenant in tenants:
        tid = str(tenant.get("id") or "")
        if not tid:
            continue
        trend = _get_findings_trend(tid, days=30)
        tenant_trends[tid] = trend
        for item in trend:
            day = str(item.get("date") or "")
            if not day:
                continue
            row = bucket.setdefault(day, {"sum": 0.0, "count": 0.0})
            row["sum"] += float(item.get("score") or 0)
            row["count"] += 1.0

    for day in sorted(bucket.keys()):
        row = bucket[day]
        if row["count"] <= 0:
            continue
        avg_trend.append({
            "date": day,
            "score": round(row["sum"] / row["count"]),
            "tenants": int(row["count"]),
        })

    return {
        "customer": {
            "id": customer.get("id"),
            "name": customer.get("name"),
            "status": customer.get("status"),
            "service_tier": customer.get("service_tier"),
            "support_model": customer.get("support_model"),
            "sla_name": customer.get("sla_name"),
            "renewal_date": customer.get("renewal_date"),
            "primary_contact_name": customer.get("primary_contact_name"),
            "primary_contact_email": customer.get("primary_contact_email"),
            "tenant_count": len(tenants),
            "service_count": len(customer.get("services") or []),
        },
        "health": health,
        "onboarding": onboarding,
        "finance": finance,
        "signals": {
            "avg_trend_30d": avg_trend,
            "tenant_trends_30d": tenant_trends,
        },
        "generated_at": now_iso(),
    }


def get_customer_assessments(customer_id: str) -> Dict[str, Any]:
    """Aggregate assessment run history per tenant for a given customer (Sprint B)."""
    customer = get_customer(customer_id)
    if not customer:
        raise ValueError("Klant niet gevonden")
    tenants = customer.get("tenants") or []
    tenant_items: List[Dict[str, Any]] = []
    total_runs = 0
    active_runs = 0
    all_scores: List[int] = []
    total_critical = 0
    total_warning = 0

    for tenant in tenants:
        tid = str(tenant.get("id") or "")
        if not tid:
            continue
        runs = list_runs(tid, 10)
        latest = _latest_completed_run_for_tenant(tid)
        active_run = next((r for r in runs if str(r.get("status") or "") in {"queued", "running"}), None)
        findings_summary = _get_tenant_health_score(tid)

        open_cnt_row = db_fetchone(
            "SELECT COUNT(*) AS cnt FROM finding_actions WHERE tenant_id=? AND status='open'",
            (tid,),
        ) or {}
        open_actions = int(open_cnt_row.get("cnt") or 0)

        active_runs += sum(1 for r in runs if str(r.get("status") or "") in {"queued", "running"})
        total_runs += len(runs)

        if latest:
            score = latest.get("score_overall")
            if score is not None:
                all_scores.append(int(score))
            total_critical += int(latest.get("critical_count") or 0)
            total_warning += int(latest.get("warning_count") or 0)

        lifecycle_state = "not_started"
        if active_run:
            lifecycle_state = str(active_run.get("status") or "queued")
        elif latest:
            lifecycle_state = "completed_with_findings" if int(findings_summary.get("total") or 0) > 0 else "completed_without_findings"

        latest_payload = None
        if latest:
            latest_payload = {
                "id": latest.get("id"),
                "status": latest.get("status"),
                "run_mode": latest.get("run_mode"),
                "scan_type": latest.get("scan_type"),
                "score_overall": latest.get("score_overall"),
                "critical_count": int(latest.get("critical_count") or 0),
                "warning_count": int(latest.get("warning_count") or 0),
                "info_count": int(latest.get("info_count") or 0),
                "started_at": latest.get("started_at"),
                "completed_at": latest.get("completed_at"),
                "report_path": latest.get("report_path"),
            }

        active_payload = None
        if active_run:
            active_payload = {
                "id": active_run.get("id"),
                "status": active_run.get("status"),
                "run_mode": active_run.get("run_mode"),
                "started_at": active_run.get("started_at"),
            }

        tenant_items.append({
            "tenant_id": tid,
            "tenant_name": tenant.get("tenant_name") or tenant.get("customer_name") or tid,
            "latest_run": latest_payload,
            "active_run": active_payload,
            "lifecycle_state": lifecycle_state,
            "findings_summary": {
                "total": int(findings_summary.get("total") or 0),
                "critical_count": int(findings_summary.get("critical_count") or 0),
                "warning_count": int(findings_summary.get("warning_count") or 0),
                "score": findings_summary.get("score"),
            },
            "run_count": len(runs),
            "open_actions": open_actions,
            "runs": [
                {
                    "id": r.get("id"),
                    "status": r.get("status"),
                    "run_mode": r.get("run_mode"),
                    "scan_type": r.get("scan_type"),
                    "score_overall": r.get("score_overall"),
                    "critical_count": int(r.get("critical_count") or 0),
                    "warning_count": int(r.get("warning_count") or 0),
                    "info_count": int(r.get("info_count") or 0),
                    "started_at": r.get("started_at"),
                    "completed_at": r.get("completed_at"),
                }
                for r in runs
            ],
        })

    avg_score = round(sum(all_scores) / len(all_scores)) if all_scores else None
    tenants_assessed = sum(1 for t in tenant_items if t.get("latest_run") is not None)

    return {
        "ok": True,
        "customer_id": customer_id,
        "tenants": tenant_items,
        "summary": {
            "tenant_count": len(tenants),
            "tenants_assessed": tenants_assessed,
            "active_runs": active_runs,
            "total_runs": total_runs,
            "avg_score": avg_score,
            "total_critical": total_critical,
            "total_warning": total_warning,
        },
        "generated_at": now_iso(),
    }


def get_customer_azure_summary(customer_id: str) -> Dict[str, Any]:
    """Aggregate Azure read-only data per tenant for a customer."""
    started_at = time.time()
    customer = get_customer(customer_id)
    if not customer:
        raise ValueError("Klant niet gevonden")

    tenants = customer.get("tenants") or []
    tenant_items: List[Dict[str, Any]] = []
    tenant_errors: List[Dict[str, str]] = []
    totals = {
        "subscription_count": 0,
        "lighthouse_onboarded": 0,
        "resource_snapshot_count": 0,
        "alert_snapshot_count": 0,
        "cost_snapshot_count": 0,
        "latest_total_cost": 0.0,
    }

    logger.info(
        "customer_azure_summary_start customer_id=%s tenant_count=%s",
        customer_id,
        len(tenants),
    )

    for tenant in tenants:
        tid = str(tenant.get("id") or "")
        if not tid:
            continue
        try:
            subscriptions = list_subscriptions(tid)
            resources = list_azure_snapshots(tid)
            alerts = list_alert_snapshots(tid)
            costs = list_cost_snapshots(tid)
            latest_cost = costs[0] if costs else None

            latest_cost_amount = 0.0
            latest_cost_currency = "EUR"
            if latest_cost:
                try:
                    summary_obj = json.loads(latest_cost.get("summary_json") or "{}")
                except Exception:
                    summary_obj = {}
                raw_total_cost = summary_obj.get("total_cost")
                if raw_total_cost is None:
                    raw_total_cost = summary_obj.get("totalCost")
                try:
                    latest_cost_amount = float(raw_total_cost or 0.0)
                except (TypeError, ValueError):
                    latest_cost_amount = 0.0
                latest_cost_currency = str(summary_obj.get("currency") or "EUR")

            sub_count = len(subscriptions)
            lighthouse_count = sum(1 for item in subscriptions if int(item.get("lighthouse_onboarded") or 0) == 1)
            resource_count = len(resources)
            alert_count = len(alerts)
            cost_count = len(costs)

            totals["subscription_count"] += sub_count
            totals["lighthouse_onboarded"] += lighthouse_count
            totals["resource_snapshot_count"] += resource_count
            totals["alert_snapshot_count"] += alert_count
            totals["cost_snapshot_count"] += cost_count
            totals["latest_total_cost"] += latest_cost_amount

            tenant_items.append({
                "tenant_id": tid,
                "tenant_name": tenant.get("tenant_name") or tenant.get("customer_name") or tid,
                "subscription_count": sub_count,
                "lighthouse_onboarded": lighthouse_count,
                "resource_snapshot_count": resource_count,
                "alert_snapshot_count": alert_count,
                "cost_snapshot_count": cost_count,
                "latest_cost": {
                    "amount": latest_cost_amount,
                    "currency": latest_cost_currency,
                    "period_start": latest_cost.get("period_start") if latest_cost else None,
                    "period_end": latest_cost.get("period_end") if latest_cost else None,
                    "generated_at": latest_cost.get("generated_at") if latest_cost else None,
                },
                "latest_cost_period": {
                    "period_start": latest_cost.get("period_start") if latest_cost else None,
                    "period_end": latest_cost.get("period_end") if latest_cost else None,
                },
            })
        except Exception as exc:
            logger.warning(
                "customer_azure_summary_tenant_error customer_id=%s tenant_id=%s error=%s",
                customer_id,
                tid,
                str(exc),
            )
            tenant_errors.append({"tenant_id": tid, "error": str(exc)})

    payload = {
        "ok": True,
        "customer_id": customer_id,
        "tenants": tenant_items,
        "summary": {
            "tenant_count": len(tenants),
            **totals,
            "latest_total_cost": round(float(totals.get("latest_total_cost") or 0.0), 2),
        },
        "generated_at": now_iso(),
    }

    if tenant_errors:
        payload["errors"] = tenant_errors

    logger.info(
        "customer_azure_summary_done customer_id=%s tenant_items=%s errors=%s duration_ms=%s",
        customer_id,
        len(tenant_items),
        len(tenant_errors),
        int((time.time() - started_at) * 1000),
    )
    return payload


def _parse_iso_dateish(value: Any) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        if len(raw) == 10:
            return datetime.fromisoformat(raw).replace(tzinfo=timezone.utc)
        parsed = datetime.fromisoformat(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def get_msp_control_center_payload(tenant_id: Optional[str] = None) -> Dict[str, Any]:
    customers = list_customers()
    tenants = list_tenants(tenant_id=tenant_id) if tenant_id else list_tenants()
    pending_approvals = list_approvals("pending", limit=8, tenant_id=tenant_id)
    pending_approval_requests = list_approval_requests("pending", limit=8, tenant_id=tenant_id)
    recent_jobs = list_jobs(status=None, limit=20, tenant_id=tenant_id)
    jobs = [j for j in recent_jobs if str(j.get("status") or "") in {"pending", "running", "failed"}]
    all_actions = list_msp_actions(status="all", owner=None, limit=500, tenant_id=tenant_id)
    payload = build_msp_control_center_payload(
        customers,
        tenants,
        pending_approvals,
        jobs,
        all_actions,
        get_customer_finance_summary,
        _parse_iso_dateish,
        now_iso,
    )
    payload["approval_requests"] = pending_approval_requests[:6]
    payload["jobs_recent"] = recent_jobs[:8]
    payload.setdefault("summary", {})
    payload["summary"]["pending_approval_requests"] = len(pending_approval_requests)
    if not payload.get("approvals") and pending_approval_requests:
        payload["priorities"] = [{
            "tone": "urgent",
            "title": "Approval requests wachten op beoordeling",
            "detail": f"{len(pending_approval_requests)} approval request(s) staan nog open in de governance-laag.",
            "action": {"type": "section", "section": "mspcontrolcenter", "label": "Open reminders"},
        }] + list(payload.get("priorities") or [])
    return payload


# ── Azure Resource Snapshots ──────────────────────────────────────────────────
def list_azure_snapshots(tenant_id: str, subscription_id: Optional[str] = None) -> List[Dict[str, Any]]:
    if subscription_id:
        return db_fetchall(
            "SELECT id, tenant_id, subscription_id, section, subsection, generated_at, summary_json "
            "FROM azure_resource_snapshots WHERE tenant_id=? AND subscription_id=? ORDER BY generated_at DESC",
            (tenant_id, subscription_id),
        )
    return db_fetchall(
        "SELECT id, tenant_id, subscription_id, section, subsection, generated_at, summary_json "
        "FROM azure_resource_snapshots WHERE tenant_id=? ORDER BY generated_at DESC LIMIT 200",
        (tenant_id,),
    )


def upsert_azure_snapshot(tenant_id: str, section: str, subsection: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    subscription_id = (payload.get("subscription_id") or "").strip() or None
    snap_id = str(uuid.uuid4())
    summary = {k: v for k, v in payload.items() if isinstance(v, (str, int, float, bool)) and k != "data"}
    db_execute(
        "INSERT OR REPLACE INTO azure_resource_snapshots "
        "(id, tenant_id, subscription_id, section, subsection, generated_at, stale_after_at, data_json, summary_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            snap_id, tenant_id, subscription_id,
            section.lower(), subsection.lower(),
            now_iso(),
            payload.get("stale_after_at") or None,
            json.dumps(payload.get("data") or payload, ensure_ascii=False),
            json.dumps(summary, ensure_ascii=False),
        ),
    )
    return db_fetchone("SELECT * FROM azure_resource_snapshots WHERE id=?", (snap_id,)) or {}


# ── Alert Snapshots ───────────────────────────────────────────────────────────
def list_alert_snapshots(tenant_id: str, alert_type: Optional[str] = None) -> List[Dict[str, Any]]:
    if alert_type:
        return db_fetchall(
            "SELECT id, tenant_id, alert_type, generated_at, summary_json "
            "FROM alert_snapshots WHERE tenant_id=? AND alert_type=? ORDER BY generated_at DESC LIMIT 100",
            (tenant_id, alert_type),
        )
    return db_fetchall(
        "SELECT id, tenant_id, alert_type, generated_at, summary_json "
        "FROM alert_snapshots WHERE tenant_id=? ORDER BY generated_at DESC LIMIT 200",
        (tenant_id,),
    )


def upsert_alert_snapshot(tenant_id: str, alert_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    snap_id = str(uuid.uuid4())
    summary = {k: v for k, v in payload.items() if isinstance(v, (str, int, float, bool)) and k != "data"}
    db_execute(
        "INSERT OR REPLACE INTO alert_snapshots "
        "(id, tenant_id, alert_type, generated_at, data_json, summary_json) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            snap_id, tenant_id, alert_type.lower(),
            now_iso(),
            json.dumps(payload.get("data") or payload, ensure_ascii=False),
            json.dumps(summary, ensure_ascii=False),
        ),
    )
    return db_fetchone("SELECT * FROM alert_snapshots WHERE id=?", (snap_id,)) or {}


# ── Cost Snapshots ────────────────────────────────────────────────────────────
def list_cost_snapshots(tenant_id: str, subscription_id: Optional[str] = None) -> List[Dict[str, Any]]:
    if subscription_id:
        return db_fetchall(
            "SELECT id, tenant_id, subscription_id, period_start, period_end, generated_at, summary_json "
            "FROM cost_snapshots WHERE tenant_id=? AND subscription_id=? ORDER BY period_start DESC LIMIT 24",
            (tenant_id, subscription_id),
        )
    return db_fetchall(
        "SELECT id, tenant_id, subscription_id, period_start, period_end, generated_at, summary_json "
        "FROM cost_snapshots WHERE tenant_id=? ORDER BY period_start DESC LIMIT 48",
        (tenant_id,),
    )


def get_cost_snapshot(snapshot_id: str) -> Optional[Dict[str, Any]]:
    return db_fetchone(
        "SELECT id, tenant_id, subscription_id, period_start, period_end, generated_at, data_json, summary_json "
        "FROM cost_snapshots WHERE id=?",
        (snapshot_id,),
    )


def upsert_cost_snapshot(tenant_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    period_start = (payload.get("period_start") or "").strip()
    period_end = (payload.get("period_end") or "").strip()
    if not period_start or not period_end:
        raise ValueError("period_start en period_end zijn verplicht")
    subscription_id = (payload.get("subscription_id") or "").strip() or None
    snap_id = str(uuid.uuid4())
    summary = {k: v for k, v in payload.items() if isinstance(v, (str, int, float, bool)) and k not in ("data", "period_start", "period_end")}
    db_execute(
        "INSERT OR REPLACE INTO cost_snapshots "
        "(id, tenant_id, subscription_id, period_start, period_end, generated_at, data_json, summary_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            snap_id, tenant_id, subscription_id,
            period_start, period_end,
            now_iso(),
            json.dumps(payload.get("data") or payload, ensure_ascii=False),
            json.dumps(summary, ensure_ascii=False),
        ),
    )
    return db_fetchone("SELECT * FROM cost_snapshots WHERE id=?", (snap_id,)) or {}


def update_cost_snapshot(snapshot_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    current = get_cost_snapshot(snapshot_id)
    if not current:
        raise ValueError("Kostenrecord niet gevonden")
    tenant_id = current["tenant_id"]
    period_start = (payload.get("period_start") or current.get("period_start") or "").strip()
    period_end = (payload.get("period_end") or current.get("period_end") or "").strip()
    if not period_start or not period_end:
        raise ValueError("period_start en period_end zijn verplicht")
    subscription_id = (payload.get("subscription_id") or current.get("subscription_id") or "").strip() or None
    existing_data = {}
    existing_summary = {}
    try:
        existing_data = json.loads(current.get("data_json") or "{}")
    except Exception:
        existing_data = {}
    try:
        existing_summary = json.loads(current.get("summary_json") or "{}")
    except Exception:
        existing_summary = {}
    merged_data = {**existing_data, **(payload.get("data") or {}), **payload}
    summary = {
        **existing_summary,
        **{k: v for k, v in payload.items() if isinstance(v, (str, int, float, bool)) and k not in ("data", "period_start", "period_end")},
    }
    db_execute(
        "UPDATE cost_snapshots SET tenant_id=?, subscription_id=?, period_start=?, period_end=?, generated_at=?, data_json=?, summary_json=? WHERE id=?",
        (
            tenant_id,
            subscription_id,
            period_start,
            period_end,
            now_iso(),
            json.dumps(merged_data, ensure_ascii=False),
            json.dumps(summary, ensure_ascii=False),
            snapshot_id,
        ),
    )
    return db_fetchone("SELECT * FROM cost_snapshots WHERE id=?", (snapshot_id,)) or {}


def delete_cost_snapshot(snapshot_id: str) -> Dict[str, Any]:
    row = get_cost_snapshot(snapshot_id)
    if not row:
        raise ValueError("Kostenrecord niet gevonden")
    db_execute("DELETE FROM cost_snapshots WHERE id=?", (snapshot_id,))
    return {"deleted": True, "id": snapshot_id, "tenant_id": row.get("tenant_id")}


# ── Job Queue ─────────────────────────────────────────────────────────────────
def enqueue_job(job_type: str, tenant_id: Optional[str] = None,
                payload: Optional[Dict[str, Any]] = None, priority: int = 5,
                scheduled_at: Optional[str] = None) -> Dict[str, Any]:
    job_id = str(uuid.uuid4())
    db_execute(
        "INSERT INTO job_queue (id, job_type, tenant_id, payload_json, status, priority, "
        "attempt_count, max_attempts, scheduled_at, created_at) VALUES (?,?,?,?,?,?,0,3,?,?)",
        (
            job_id, job_type, tenant_id,
            json.dumps(payload or {}, ensure_ascii=False),
            "pending", priority,
            scheduled_at or now_iso(),
            now_iso(),
        ),
    )
    return db_fetchone("SELECT * FROM job_queue WHERE id=?", (job_id,)) or {}


def list_jobs(tenant_id: Optional[str] = None, status: Optional[str] = None,
              limit: int = 100) -> List[Dict[str, Any]]:
    where: List[str] = []
    params: List[Any] = []
    if tenant_id:
        where.append("tenant_id=?"); params.append(tenant_id)
    if status:
        where.append("status=?"); params.append(status)
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    return db_fetchall(
        f"SELECT id, job_type, tenant_id, status, priority, attempt_count, "
        f"scheduled_at, started_at, completed_at, error_message, result_json, payload_json, created_at "
        f"FROM job_queue {clause} ORDER BY priority ASC, scheduled_at ASC LIMIT ?",
        tuple(params) + (limit,),
    )


def cancel_job(job_id: str) -> Dict[str, Any]:
    row = db_fetchone("SELECT * FROM job_queue WHERE id=?", (job_id,))
    if not row:
        raise ValueError("Job niet gevonden")
    if row["status"] not in ("pending", "failed"):
        raise ValueError(f"Job kan niet worden geannuleerd met status '{row['status']}'")
    db_execute("UPDATE job_queue SET status='cancelled', completed_at=? WHERE id=?",
               (now_iso(), job_id))
    return db_fetchone("SELECT * FROM job_queue WHERE id=?", (job_id,)) or {}


def ensure_demo_tenant_if_empty() -> None:
    row = db_fetchone("SELECT COUNT(*) AS cnt FROM tenants WHERE is_active=1")
    cnt = int((row or {}).get("cnt") or 0)
    if cnt > 0:
        return
    tenant_id = str(uuid.uuid4())
    ts = now_iso()
    db_execute(
        """
        INSERT INTO tenants
        (id, customer_name, tenant_name, tenant_guid, status, owner_primary, owner_backup, tags_csv, risk_profile, notes, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', NULL, NULL, NULL, 'standard', ?, 1, ?, ?)
        """,
        (tenant_id, "Lokale Demo Klant", "Lokale Tenant", None, "Automatisch aangemaakt na verwijderen laatste tenant.", ts, ts),
    )


def delete_tenant(tenant_id: str, mode: str = "soft") -> Dict[str, Any]:
    tenant = db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,))
    if not tenant:
        raise ValueError("Tenant niet gevonden")
    mode = (mode or "soft").strip().lower()
    if mode not in {"soft", "hard"}:
        mode = "soft"

    if mode == "soft":
        db_execute(
            "UPDATE tenants SET is_active=0, status='offboarded', updated_at=? WHERE id=?",
            (now_iso(), tenant_id),
        )
        _invalidate_tenant_perf_cache(tenant_id)
        ensure_demo_tenant_if_empty()
        return {"id": tenant_id, "deleted": True, "mode": "soft"}

    # Hard delete: transactioneel en lock-safe alle tenant-afhankelijke data verwijderen.
    conn = get_conn()
    run_ids: List[str] = []
    removed_runs = 0

    # Tabellen met directe tenant_id-relatie (incl. non-FK cache/materialized tabellen).
    tenant_delete_tables = [
        "finding_actions",
        "remediation_history",
        "provisioning_history",
        "baseline_assignments",
        "baseline_history",
        "intune_scan_history",
        "backup_history",
        "ca_history",
        "scan_findings",
        "integrations",
        "m365_snapshots",
        "subscriptions",
        "azure_resource_snapshots",
        "alert_snapshots",
        "cost_snapshots",
        "job_queue",
        "assessment_schedules",
        "notification_log",
        "tenant_health_aggregate",
        "assessment_run_stats",
    ]

    max_attempts = 4
    for attempt in range(1, max_attempts + 1):
        try:
            conn.execute("PRAGMA busy_timeout = 8000")
            conn.execute("BEGIN IMMEDIATE")

            run_rows = conn.execute(
                "SELECT id FROM assessment_runs WHERE tenant_id=?",
                (tenant_id,),
            ).fetchall()
            run_ids = [str(r["id"]) for r in run_rows if r and r["id"]]
            removed_runs = len(run_ids)

            # approvals verwijzen naar action_logs zonder tenant_id; eerst die children opruimen.
            action_log_rows = conn.execute(
                "SELECT id FROM action_logs WHERE tenant_id=?",
                (tenant_id,),
            ).fetchall()
            action_log_ids = [str(r["id"]) for r in action_log_rows if r and r["id"]]
            if action_log_ids:
                conn.executemany(
                    "DELETE FROM approvals WHERE action_log_id=?",
                    [(aid,) for aid in action_log_ids],
                )

            # Child rows van runs eerst verwijderen.
            if run_ids:
                conn.executemany(
                    "DELETE FROM finding_actions WHERE run_id=?",
                    [(rid,) for rid in run_ids],
                )
                conn.executemany(
                    "DELETE FROM m365_snapshots WHERE assessment_run_id=?",
                    [(rid,) for rid in run_ids],
                )

            # Opschonen van alle tenant-gebaseerde tabellen.
            existing_tables = {
                str(r["name"])
                for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
                if r and r["name"]
            }
            for table in tenant_delete_tables:
                if table in existing_tables:
                    conn.execute(f"DELETE FROM {table} WHERE tenant_id=?", (tenant_id,))

            # assessment runs pas na afhankelijke tabellen verwijderen.
            conn.execute("DELETE FROM assessment_runs WHERE tenant_id=?", (tenant_id,))
            # users houden, maar tenant-koppeling losmaken.
            conn.execute(
                "UPDATE users SET linked_tenant_id=NULL WHERE linked_tenant_id=?",
                (tenant_id,),
            )
            conn.execute("DELETE FROM tenants WHERE id=?", (tenant_id,))
            conn.commit()
            break
        except sqlite3.OperationalError as exc:
            try:
                conn.rollback()
            except Exception:
                pass
            if "database is locked" in str(exc).lower() and attempt < max_attempts:
                # Korte backoff om concurrent writes te laten afronden.
                time.sleep(0.25 * attempt)
                continue
            raise
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            raise

    for run_id in run_ids:
        run_dir = RUNS_DIR / run_id
        if run_dir.exists():
            shutil.rmtree(run_dir, ignore_errors=True)

    _invalidate_tenant_perf_cache(tenant_id)
    ensure_demo_tenant_if_empty()
    return {"id": tenant_id, "deleted": True, "mode": "hard", "removed_runs": removed_runs}


def list_reports(
    tenant_id: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
    archived: str = "exclude",
    limit: int = 300,
) -> List[Dict[str, Any]]:
    sql = """
    SELECT r.*, t.customer_name, t.tenant_name, t.tenant_guid, t.status AS tenant_status
    FROM assessment_runs r
    JOIN tenants t ON t.id = r.tenant_id
    WHERE r.report_path IS NOT NULL
    """
    params: List[Any] = []
    if tenant_id:
        sql += " AND r.tenant_id=?"
        params.append(tenant_id)
    if status:
        sql += " AND r.status=?"
        params.append(status)
    if date_from:
        sql += " AND COALESCE(r.completed_at, r.started_at) >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND COALESCE(r.completed_at, r.started_at) <= ?"
        params.append(date_to)
    if q:
        like = f"%{q}%"
        sql += " AND (t.tenant_name LIKE ? OR t.customer_name LIKE ? OR r.id LIKE ? OR COALESCE(r.report_filename,'') LIKE ?)"
        params.extend([like, like, like, like])
    if archived == "only":
        sql += " AND COALESCE(r.is_archived, 0)=1"
    elif archived == "include":
        pass
    else:
        sql += " AND COALESCE(r.is_archived, 0)=0"
    sql += " ORDER BY COALESCE(r.completed_at, r.started_at) DESC LIMIT ?"
    params.append(limit)

    rows = db_fetchall(sql, tuple(params))
    for r in rows:
        r["phases"] = [p for p in (r.get("phases_csv") or "").split(",") if p]
    return rows


def archive_run(run_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
    row = db_fetchone("SELECT * FROM assessment_runs WHERE id=?", (run_id,))
    if not row:
        raise ValueError("Run niet gevonden")
    db_execute(
        "UPDATE assessment_runs SET is_archived=1, archived_at=?, archive_reason=? WHERE id=?",
        (now_iso(), (reason or "Handmatig gearchiveerd").strip(), run_id),
    )
    _invalidate_tenant_perf_cache(row.get("tenant_id"))
    return get_run(run_id) or {}


def restore_run(run_id: str) -> Dict[str, Any]:
    row = db_fetchone("SELECT * FROM assessment_runs WHERE id=?", (run_id,))
    if not row:
        raise ValueError("Run niet gevonden")
    db_execute(
        "UPDATE assessment_runs SET is_archived=0, archived_at=NULL, archive_reason=NULL WHERE id=?",
        (run_id,),
    )
    _invalidate_tenant_perf_cache(row.get("tenant_id"))
    return get_run(run_id) or {}


def apply_retention_policy(tenant_id: Optional[str], keep_latest: int, keep_days: int) -> Dict[str, Any]:
    keep_latest = max(0, int(keep_latest))
    keep_days = max(0, int(keep_days))
    rows = list_reports(tenant_id=tenant_id, archived="exclude", limit=5000)
    now_ts = datetime.now(timezone.utc)
    threshold_sec = keep_days * 86400
    to_archive: List[str] = []

    by_tenant: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        by_tenant.setdefault(r["tenant_id"], []).append(r)

    for _, tenant_rows in by_tenant.items():
        for idx, r in enumerate(tenant_rows):
            ts_raw = r.get("completed_at") or r.get("started_at")
            age_match = False
            if ts_raw:
                try:
                    ts = datetime.fromisoformat(ts_raw)
                    age_sec = (now_ts - ts).total_seconds()
                    age_match = threshold_sec > 0 and age_sec >= threshold_sec
                except Exception:
                    age_match = False
            index_match = keep_latest > 0 and idx >= keep_latest
            if (keep_latest == 0 or index_match) or age_match:
                to_archive.append(r["id"])

    archived_count = 0
    for run_id in sorted(set(to_archive)):
        archive_run(run_id, reason=f"Retention policy: keep_latest={keep_latest}, keep_days={keep_days}")
        archived_count += 1

    return {
        "scanned": len(rows),
        "archived": archived_count,
        "keep_latest": keep_latest,
        "keep_days": keep_days,
        "tenant_id": tenant_id,
    }


def reports_csv(rows: List[Dict[str, Any]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "run_id",
            "tenant_name",
            "customer_name",
            "tenant_guid",
            "tenant_status",
            "run_status",
            "run_mode",
            "started_at",
            "completed_at",
            "score_overall",
            "critical_count",
            "warning_count",
            "info_count",
            "phases",
            "report_path",
            "report_filename",
        ]
    )
    for r in rows:
        writer.writerow(
            [
                r.get("id"),
                r.get("tenant_name"),
                r.get("customer_name"),
                r.get("tenant_guid"),
                r.get("tenant_status"),
                r.get("status"),
                r.get("run_mode"),
                r.get("started_at"),
                r.get("completed_at"),
                r.get("score_overall"),
                r.get("critical_count"),
                r.get("warning_count"),
                r.get("info_count"),
                ",".join(r.get("phases") or []),
                r.get("report_path"),
                r.get("report_filename"),
            ]
        )
    return output.getvalue()


def run_diff_for_tenant(tenant_id: str, from_run_id: Optional[str], to_run_id: Optional[str]) -> Dict[str, Any]:
    if from_run_id and to_run_id:
        older = get_run(from_run_id)
        newer = get_run(to_run_id)
        if not older or not newer:
            raise ValueError("Run(s) niet gevonden")
    else:
        recent = list_reports(tenant_id=tenant_id, limit=2)
        if len(recent) < 2:
            return {"hasDiff": False}
        newer, older = recent[0], recent[1]

    if older.get("tenant_id") != tenant_id or newer.get("tenant_id") != tenant_id:
        raise ValueError("Runs horen niet bij deze tenant")

    def n(v: Any) -> int:
        return int(v or 0)

    delta_score = n(newer.get("score_overall")) - n(older.get("score_overall"))
    delta_critical = n(newer.get("critical_count")) - n(older.get("critical_count"))
    delta_warning = n(newer.get("warning_count")) - n(older.get("warning_count"))
    delta_info = n(newer.get("info_count")) - n(older.get("info_count"))

    trend = "stable"
    if delta_score > 0 or delta_critical < 0:
        trend = "improved"
    elif delta_score < 0 or delta_critical > 0:
        trend = "worsened"

    return {
        "hasDiff": True,
        "trend": trend,
        "from": {
            "run_id": older.get("id"),
            "completed_at": older.get("completed_at") or older.get("started_at"),
            "score_overall": older.get("score_overall"),
            "critical_count": older.get("critical_count"),
            "warning_count": older.get("warning_count"),
            "info_count": older.get("info_count"),
        },
        "to": {
            "run_id": newer.get("id"),
            "completed_at": newer.get("completed_at") or newer.get("started_at"),
            "score_overall": newer.get("score_overall"),
            "critical_count": newer.get("critical_count"),
            "warning_count": newer.get("warning_count"),
            "info_count": newer.get("info_count"),
        },
        "delta": {
            "score_overall": delta_score,
            "critical_count": delta_critical,
            "warning_count": delta_warning,
            "info_count": delta_info,
        },
    }


def list_actions(tenant_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
    sql = "SELECT * FROM finding_actions WHERE tenant_id=?"
    params: List[Any] = [tenant_id]
    if status and status != "all":
        sql += " AND status=?"
        params.append(status)
    sql += " ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END, due_date IS NULL, due_date, updated_at DESC"
    return [_enrich_action_row(dict(row)) for row in db_fetchall(sql, tuple(params))]


def list_msp_actions(status: Optional[str] = None, owner: Optional[str] = None, limit: int = 150) -> List[Dict[str, Any]]:
    sql = (
        "SELECT fa.*, t.customer_name, t.tenant_name "
        "FROM finding_actions fa "
        "LEFT JOIN tenants t ON t.id=fa.tenant_id "
        "WHERE 1=1"
    )
    params: List[Any] = []
    if status and status != "all":
        sql += " AND fa.status=?"
        params.append(status)
    if owner:
        sql += " AND lower(COALESCE(fa.owner,'')) LIKE ?"
        params.append(f"%{str(owner).strip().lower()}%")
    sql += (
        " ORDER BY CASE fa.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END, "
        "fa.due_date IS NULL, fa.due_date, fa.updated_at DESC LIMIT ?"
    )
    params.append(min(max(int(limit or 150), 1), 500))
    return [_enrich_action_row(dict(row)) for row in db_fetchall(sql, tuple(params))]


def _action_default_due_date(severity: str) -> str:
    days = {"critical": 1, "warning": 7, "info": 14}.get(str(severity or "").strip().lower(), 7)
    return (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat()


def _enrich_action_row(row: Dict[str, Any]) -> Dict[str, Any]:
    status = str(row.get("status") or "open")
    severity = str(row.get("severity") or "warning")
    due_date = str(row.get("due_date") or "").strip()
    row["sla_target_days"] = {"critical": 1, "warning": 7, "info": 14}.get(severity, 7)
    row["sla_label"] = {"critical": "Binnen 24 uur", "warning": "Binnen 7 dagen", "info": "Binnen 14 dagen"}.get(severity, "Binnen 7 dagen")
    row["is_closed"] = status in {"done", "accepted"}
    row["is_overdue"] = False
    row["days_until_due"] = None
    row["sla_state"] = "no_due_date" if not due_date else "planned"
    if due_date:
        try:
            target = datetime.fromisoformat(due_date).date()
            today = datetime.now(timezone.utc).date()
            days_left = (target - today).days
            row["days_until_due"] = days_left
            if row["is_closed"]:
                row["sla_state"] = "closed"
            elif days_left < 0:
                row["is_overdue"] = True
                row["sla_state"] = "overdue"
            elif days_left <= 1:
                row["sla_state"] = "due_soon"
            else:
                row["sla_state"] = "on_track"
        except Exception:
            row["sla_state"] = "planned"
    elif row["is_closed"]:
        row["sla_state"] = "closed"
    return row


def create_action(payload: Dict[str, Any]) -> Dict[str, Any]:
    tenant_id = (payload.get("tenant_id") or "").strip()
    if not tenant_id:
        raise ValueError("tenant_id is verplicht")
    if not db_fetchone("SELECT id FROM tenants WHERE id=?", (tenant_id,)):
        raise ValueError("Tenant niet gevonden")

    action_id = str(uuid.uuid4())
    ts = now_iso()
    status = (payload.get("status") or "open").strip()
    if status not in {"open", "in_progress", "done", "accepted"}:
        status = "open"
    severity = (payload.get("severity") or "warning").strip()
    if severity not in {"critical", "warning", "info"}:
        severity = "warning"

    kb_asset_id = payload.get("kb_asset_id") or None
    kb_asset_name = (payload.get("kb_asset_name") or "").strip() or None
    db_execute(
        """
        INSERT INTO finding_actions
        (id, tenant_id, run_id, finding_key, title, severity, owner, status, due_date, notes, evidence, kb_asset_id, kb_asset_name, created_at, updated_at, closed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            action_id,
            tenant_id,
            (payload.get("run_id") or "").strip() or None,
            (payload.get("finding_key") or "").strip() or f"manual-{action_id[:8]}",
            (payload.get("title") or "").strip() or "Nieuwe actie",
            severity,
            (payload.get("owner") or "").strip() or None,
            status,
            (payload.get("due_date") or "").strip() or _action_default_due_date(severity),
            (payload.get("notes") or "").strip() or None,
            (payload.get("evidence") or "").strip() or None,
            int(kb_asset_id) if kb_asset_id is not None else None,
            kb_asset_name,
            ts,
            ts,
            ts if status == "done" else None,
        ),
    )
    row = db_fetchone("SELECT * FROM finding_actions WHERE id=?", (action_id,)) or {}
    return _enrich_action_row(dict(row)) if row else {}


def update_action(action_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    row = db_fetchone("SELECT * FROM finding_actions WHERE id=?", (action_id,))
    if not row:
        raise ValueError("Actie niet gevonden")
    allowed = {"owner", "status", "due_date", "notes", "evidence", "title", "severity", "kb_asset_id", "kb_asset_name"}
    fields: Dict[str, Any] = {}
    for k, v in payload.items():
        if k not in allowed:
            continue
        fields[k] = v.strip() if isinstance(v, str) else v
    if "status" in fields and fields["status"] not in {"open", "in_progress", "done", "accepted"}:
        raise ValueError("Ongeldige status")
    if "severity" in fields and fields["severity"] not in {"critical", "warning", "info"}:
        raise ValueError("Ongeldige severity")
    if fields.get("status") == "done":
        fields["closed_at"] = now_iso()
    elif "status" in fields:
        fields["closed_at"] = None
    fields["updated_at"] = now_iso()

    keys = list(fields.keys())
    if keys:
        sql = "UPDATE finding_actions SET " + ", ".join([f"{k}=?" for k in keys]) + " WHERE id=?"
        vals = [fields[k] for k in keys] + [action_id]
        db_execute(sql, tuple(vals))
    row = db_fetchone("SELECT * FROM finding_actions WHERE id=?", (action_id,)) or {}
    return _enrich_action_row(dict(row)) if row else {}


def list_actions_for_asset(tenant_id: str, asset_id: int) -> List[Dict[str, Any]]:
    """Geef alle bevindingen terug die gekoppeld zijn aan een specifiek KB-asset."""
    return [_enrich_action_row(dict(row)) for row in db_fetchall(
        "SELECT * FROM finding_actions WHERE tenant_id=? AND kb_asset_id=? "
        "ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END, updated_at DESC",
        (tenant_id, asset_id),
    )]


def _finding_key(domain: str, control: str) -> str:
    return f"{(domain or '').strip().lower()}:{(control or '').strip().lower()}"


def list_actions_for_finding(tenant_id: str, domain: str, control: str) -> List[Dict[str, Any]]:
    key = _finding_key(domain, control)
    return [_enrich_action_row(dict(row)) for row in db_fetchall(
        "SELECT * FROM finding_actions WHERE tenant_id=? AND lower(finding_key)=? "
        "ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END, updated_at DESC",
        (tenant_id, key),
    )]


def _tokenize_finding_text(*parts: Any) -> List[str]:
    raw = " ".join(str(part or "") for part in parts).lower()
    tokens = re.findall(r"[a-z0-9][a-z0-9._:-]{2,}", raw)
    stop = {
        "the", "and", "een", "voor", "with", "zonder", "geen", "tenant", "users", "user",
        "beleid", "status", "count", "de", "het", "van", "een", "via", "naar", "over",
        "microsoft", "control", "warning", "critical", "info",
    }
    return [token for token in tokens if token not in stop]


def _score_text_match(text: str, tokens: List[str]) -> int:
    hay = (text or "").lower()
    score = 0
    for token in tokens:
        if token and token in hay:
            score += 1
    return score


def suggest_kb_for_finding(tenant_id: str, finding: Dict[str, Any]) -> Dict[str, Any]:
    domain = str(finding.get("domain") or "")
    control = str(finding.get("control") or "")
    title = str(finding.get("title") or "")
    finding_text = str(finding.get("finding") or "")
    recommendation = str(finding.get("recommendation") or "")
    tokens = _tokenize_finding_text(domain, control, title, finding_text, recommendation)

    assets_out: List[Dict[str, Any]] = []
    for asset in kb_list_assets(tenant_id):
        score = _score_text_match(
            " ".join([
                str(asset.get("name") or ""),
                str(asset.get("hostname") or ""),
                str(asset.get("location") or ""),
                str(asset.get("vendor") or ""),
                str(asset.get("model") or ""),
                str(asset.get("type_name") or ""),
                str(asset.get("notes") or ""),
            ]),
            tokens,
        )
        if domain == "exchange" and "mail" in str(asset.get("type_name") or "").lower():
            score += 2
        if domain == "identity" and ("entra" in str(asset.get("notes") or "").lower() or "identity" in str(asset.get("name") or "").lower()):
            score += 2
        if domain == "collaboration" and any(word in str(asset.get("notes") or "").lower() for word in ("teams", "sharepoint", "onedrive")):
            score += 2
        if score > 0:
            assets_out.append({
                "id": asset.get("id"),
                "name": asset.get("name"),
                "type_name": asset.get("type_name"),
                "location": asset.get("location"),
                "score": score,
            })
    assets_out.sort(key=lambda item: (-int(item.get("score") or 0), str(item.get("name") or "")))

    pages_out: List[Dict[str, Any]] = []
    for page in kb_list_pages(tenant_id):
        score = _score_text_match(
            " ".join([
                str(page.get("title") or ""),
                str(page.get("category") or ""),
            ]),
            tokens,
        )
        if score > 0:
            pages_out.append({
                "id": page.get("id"),
                "title": page.get("title"),
                "category": page.get("category"),
                "score": score,
            })
    pages_out.sort(key=lambda item: (-int(item.get("score") or 0), str(item.get("title") or "")))

    changes_out: List[Dict[str, Any]] = []
    for item in kb_list_changelog(tenant_id):
        score = _score_text_match(
            " ".join([
                str(item.get("action") or ""),
                str(item.get("category") or ""),
                str(item.get("ref") or ""),
                str(item.get("notes") or ""),
            ]),
            tokens,
        )
        if score > 0:
            changes_out.append({
                "id": item.get("id"),
                "action": item.get("action"),
                "category": item.get("category"),
                "change_date": item.get("change_date"),
                "score": score,
            })
    changes_out.sort(key=lambda item: (-int(item.get("score") or 0), str(item.get("change_date") or "")))

    actions = list_actions_for_finding(tenant_id, domain, control)

    return {
        "finding_key": _finding_key(domain, control),
        "assets": assets_out[:5],
        "pages": pages_out[:5],
        "changes": changes_out[:5],
        "actions": actions,
    }


def _playbook_title_for_finding(finding: Dict[str, Any]) -> str:
    domain = str(finding.get("domain") or "").strip().lower()
    control = str(finding.get("control") or "").strip()
    title = str(finding.get("title") or finding.get("finding") or "").strip()
    hay = f"{domain} {control} {title}".lower()

    if "mfa" in hay:
        return "Runbook - MFA dekking herstellen"
    if "conditional access" in hay or domain == "ca":
        return "Runbook - Conditional Access afwijking onderzoeken"
    if "legacy" in hay:
        return "Runbook - Legacy authenticatie blokkeren"
    if domain == "appregs" or "app" in hay:
        return "Runbook - App-registratie risico beoordelen"
    if domain == "exchange":
        return "Runbook - Exchange configuratie corrigeren"
    if domain == "collaboration":
        return "Runbook - Samenwerkingsinstelling corrigeren"
    if domain == "identity":
        return "Runbook - Identity controle herstellen"
    return f"Runbook - {control or domain or 'Bevinding'}"


def _playbook_summary_for_finding(finding: Dict[str, Any]) -> str:
    domain = str(finding.get("domain") or "").strip().lower()
    control = str(finding.get("control") or "").strip()
    if domain == "ca":
        return "Stappenplan voor analyse, impactbepaling en herstel van Conditional Access-afwijkingen."
    if domain == "appregs":
        return "Procedure voor het beoordelen van app-registraties, secrets, permissies en eigenaarschap."
    if domain == "exchange":
        return "Procedure voor Exchange-gerelateerde bevindingen, mailboxbeveiliging en tenantvalidatie."
    if domain == "collaboration":
        return "Procedure voor Teams, SharePoint en OneDrive-afwijkingen inclusief validatie en nazorg."
    if domain == "identity":
        return "Procedure voor identiteitsafwijkingen zoals MFA, rollen, gasten en legacy auth."
    return f"Stappenplan om de bevinding {control or 'te analyseren en te herstellen'}."


def _playbook_content_for_finding(tenant_id: str, finding: Dict[str, Any]) -> str:
    tenant_label = _management_hub_tenant_label(tenant_id)
    domain = str(finding.get("domain") or "").strip()
    control = str(finding.get("control") or "").strip()
    title = str(finding.get("title") or finding.get("finding") or "").strip()
    finding_text = str(finding.get("finding") or "").strip()
    recommendation = str(finding.get("recommendation") or "").strip()
    status = str(finding.get("status") or "").strip()

    return "\n".join([
        f"# {_playbook_title_for_finding(finding)}",
        "",
        "## Context",
        f"- Tenant: {tenant_label}",
        f"- Domein: {domain or 'Onbekend'}",
        f"- Control: {control or 'Onbekend'}",
        f"- Status: {status or 'Onbekend'}",
        "",
        "## Bevinding",
        f"{title or control or 'Geen titel beschikbaar.'}",
        "",
        finding_text or "Geen extra bevindingstekst beschikbaar.",
        "",
        "## Aanbevolen herstelrichting",
        recommendation or "Voer validatie uit, bepaal impact, herstel de instelling en leg de wijziging vast in changelog en opvolging.",
        "",
        "## Analysechecklist",
        "- Bevestig of de bevinding nog actueel is in de tenant.",
        "- Controleer welke policy, app, rol of workload direct geraakt wordt.",
        "- Bepaal of er overlap of conflict is met bestaande Intune-, CA- of tenantinstellingen.",
        "- Controleer of de wijziging gepland was via changelog, jobmonitor of approvals.",
        "",
        "## Herstelstappen",
        "- Open de relevante beheerpagina in het portaal en valideer de actuele configuratie.",
        "- Vergelijk de huidige staat met de gewenste baseline of tenantafspraak.",
        "- Pas de benodigde wijziging gecontroleerd toe.",
        "- Registreer eigenaar, change-notitie en verwachte uitkomst.",
        "- Plan indien nodig een refresh, sync of nieuwe assessment-run.",
        "",
        "## Validatie",
        "- Controleer na herstel of de bevinding uit de volgende scan verdwijnt.",
        "- Controleer of gekoppelde gebruikers, apparaten of workloads weer compliant zijn.",
        "- Werk KB, changelog en eventuele vervolgactie bij.",
        "",
        "## Notities",
        "- Voeg hier tenant-specifieke uitzonderingen, screenshots of beslissingen toe.",
    ])


def suggest_playbooks_for_finding(tenant_id: str, finding: Dict[str, Any]) -> Dict[str, Any]:
    domain = str(finding.get("domain") or "")
    control = str(finding.get("control") or "")
    title = str(finding.get("title") or "")
    finding_text = str(finding.get("finding") or "")
    recommendation = str(finding.get("recommendation") or "")
    tokens = _tokenize_finding_text(domain, control, title, finding_text, recommendation)

    procedure_pages: List[Dict[str, Any]] = []
    for page in kb_list_pages(tenant_id):
        if str(page.get("category") or "") != "procedures":
            continue
        score = _score_text_match(
            " ".join([
                str(page.get("title") or ""),
                str(page.get("category") or ""),
            ]),
            tokens,
        )
        target_title = _playbook_title_for_finding(finding).lower()
        if str(page.get("title") or "").strip().lower() == target_title:
            score += 5
        if score > 0:
            procedure_pages.append({
                "id": page.get("id"),
                "title": page.get("title"),
                "category": page.get("category"),
                "score": score,
                "kind": "existing",
            })
    procedure_pages.sort(key=lambda item: (-int(item.get("score") or 0), str(item.get("title") or "")))

    blueprint = {
        "kind": "template",
        "title": _playbook_title_for_finding(finding),
        "summary": _playbook_summary_for_finding(finding),
        "category": "procedures",
        "content_preview": _playbook_content_for_finding(tenant_id, finding).split("\n")[:8],
    }
    return {
        "existing": procedure_pages[:5],
        "template": blueprint,
    }


def create_or_get_playbook_page(tenant_id: str, finding: Dict[str, Any]) -> Dict[str, Any]:
    target_title = _playbook_title_for_finding(finding).strip()
    existing = None
    for page in kb_list_pages(tenant_id):
        if str(page.get("category") or "") == "procedures" and str(page.get("title") or "").strip().lower() == target_title.lower():
            existing = kb_get_page(tenant_id, int(page["id"]))
            break
    if existing:
        return {"created": False, "page": existing}
    page = kb_create_page(tenant_id, {
        "title": target_title,
        "category": "procedures",
        "order_index": 0,
        "content": _playbook_content_for_finding(tenant_id, finding),
    })
    return {"created": True, "page": page}


def list_runs(tenant_id: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    cache_key = f"list_runs:{tenant_id}:{limit}"
    cached = _memo_get(cache_key)
    if cached is not None:
        return cached
    if tenant_id:
        sql = """
        SELECT r.*, t.customer_name, t.tenant_name
        FROM assessment_runs r
        JOIN tenants t ON t.id = r.tenant_id
        WHERE tenant_id=?
        ORDER BY started_at DESC LIMIT ?
        """
        rows = db_fetchall(sql, (tenant_id, limit))
    else:
        sql = """
        SELECT r.*, t.customer_name, t.tenant_name
        FROM assessment_runs r
        JOIN tenants t ON t.id = r.tenant_id
        ORDER BY started_at DESC LIMIT ?
        """
        rows = db_fetchall(sql, (limit,))
    for r in rows:
        r["phases"] = [p for p in (r.get("phases_csv") or "").split(",") if p]
        r["json_manifest_path"] = _run_json_manifest_path(RUNS_DIR / r["id"])
    return _memo_set(cache_key, rows, 15)


def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    row = db_fetchone(
        """
        SELECT r.*, t.customer_name, t.tenant_name
        FROM assessment_runs r
        JOIN tenants t ON t.id = r.tenant_id
        WHERE r.id=?
        """,
        (run_id,),
    )
    if row:
        row["phases"] = [p for p in (row.get("phases_csv") or "").split(",") if p]
        row["json_manifest_path"] = _run_json_manifest_path(RUNS_DIR / row["id"])
    return row


# ── Snapshot service dependency injection ──
_snapshot_svc._get_run_fn = get_run
_snapshot_svc._get_build_capability_status_fn = _build_capability_status
_snapshot_svc._get_load_config_fn = load_config


def tenant_overview(tenant_id: str) -> Dict[str, Any]:
    cache_key = f"tenant_overview:{tenant_id}"
    cached = _memo_get(cache_key)
    if cached is not None:
        return cached
    tenant = db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,))
    if not tenant:
        return {"hasData": False}
    latest = _latest_completed_run_for_tenant(tenant_id)
    if not latest:
        return _memo_set(cache_key, {"hasData": False, "tenantName": tenant["tenant_name"], "tenantId": tenant.get("tenant_guid") or tenant["id"]}, 15)
    run_dir = RUNS_DIR / latest["id"]
    stats = parse_run_stats(run_dir)
    result = {
        "hasData": True,
        "tenantName": stats.get("tenantName") or tenant["tenant_name"],
        "tenantId": stats.get("tenantId") or tenant.get("tenant_guid") or tenant["id"],
        "reportDate": stats.get("reportDate") or latest.get("completed_at") or latest.get("started_at"),
        "reportId": stats.get("reportId") or latest["id"],
        "criticalIssues": latest.get("critical_count") or stats.get("criticalIssues") or 0,
        "warnings": latest.get("warning_count") or stats.get("warnings") or 0,
        "infoItems": latest.get("info_count") or stats.get("infoItems") or 0,
        "mfaCoverage": stats.get("mfaCoverage"),
        "usersWithoutMFA": stats.get("usersWithoutMFA"),
        "caPolicies": stats.get("caPolicies"),
        "secureScorePercentage": stats.get("secureScorePercentage"),
        "scoreOverall": latest.get("score_overall"),
        "reportPath": latest.get("report_path"),
        "latestRunStatus": latest.get("status"),
        "secureScoreCurrent": stats.get("secureScorePercentage"),
        "secureScoreMax": 100 if stats.get("secureScorePercentage") is not None else None,
    }
    return _memo_set(cache_key, result, 15)


def create_tenant(payload: Dict[str, Any]) -> Dict[str, Any]:
    tenant_id = str(uuid.uuid4())
    ts = now_iso()
    customer_id = (payload.get("customer_id") or payload.get("customerId") or "").strip() or None
    customer = db_fetchone("SELECT id, name FROM customers WHERE id=?", (customer_id,)) if customer_id else None
    if customer_id and not customer:
        raise ValueError("Gekoppelde klant niet gevonden")
    customer_name = (payload.get("customer_name") or payload.get("customerName") or "").strip() or "Lokale Klant"
    if customer:
        customer_name = str(customer.get("name") or customer_name).strip() or customer_name
    tenant_name = (payload.get("tenant_name") or payload.get("tenantName") or "").strip() or customer_name
    tenant_guid = (payload.get("tenant_guid") or payload.get("tenantGuid") or "").strip() or None
    status = (payload.get("status") or "active").strip()
    if status not in {"active", "onboarding", "paused", "offboarded"}:
        status = "active"
    owner_primary = (payload.get("owner_primary") or "").strip() or None
    owner_backup = (payload.get("owner_backup") or "").strip() or None
    tags_csv = (payload.get("tags_csv") or "").strip() or None
    risk_profile = (payload.get("risk_profile") or "standard").strip()
    if risk_profile not in {"low", "standard", "high", "critical"}:
        risk_profile = "standard"
    notes = (payload.get("notes") or "").strip() or None
    db_execute(
        "INSERT INTO tenants (id, customer_id, customer_name, tenant_name, tenant_guid, status, owner_primary, owner_backup, tags_csv, risk_profile, notes, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
        (tenant_id, customer_id, customer_name, tenant_name, tenant_guid, status, owner_primary, owner_backup, tags_csv, risk_profile, notes, ts, ts),
    )
    _invalidate_tenant_perf_cache(tenant_id)
    return db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,)) or {}


def create_run(payload: Dict[str, Any]) -> Dict[str, Any]:
    tenant_id = payload.get("tenant_id") or payload.get("tenantId")
    if not tenant_id:
        raise ValueError("tenant_id is verplicht")
    tenant = db_fetchone("SELECT id, customer_name, tenant_name, tenant_guid FROM tenants WHERE id=?", (tenant_id,))
    if not tenant:
        raise ValueError("Tenant niet gevonden")
    _release_stale_assessment_runs_for_tenant(tenant_id)
    # Voorkom concurrent runs voor dezelfde tenant
    active = db_fetchone(
        "SELECT id FROM assessment_runs WHERE tenant_id=? AND status IN ('queued','running') LIMIT 1",
        (tenant_id,),
    )
    if active:
        raise ValueError(f"Er loopt al een actief assessment voor deze tenant (run: {active['id'][:8]}…)")

    scan_type = str(payload.get("scan_type") or "full")
    phases = payload.get("phases") or [f"phase{i}" for i in range(1, 7)]
    if not isinstance(phases, list):
        raise ValueError("phases moet een array zijn")
    phases = [str(p) for p in phases if re.fullmatch(r"phase[1-6]", str(p))]
    if not phases:
        raise ValueError("Geen geldige phases opgegeven")
    cfg = load_config()
    run_mode = str(payload.get("run_mode") or payload.get("runMode") or cfg.get("default_run_mode") or "demo")
    if run_mode not in {"demo", "script"}:
        run_mode = "demo"

    # Tenant-veiligheid: voorkom dat een run start met context van een andere tenant
    selected_tenant_guid = (tenant.get("tenant_guid") or "").strip().lower()
    request_auth_tenant = str(payload.get("auth_tenant_id") or payload.get("authTenantId") or "").strip().lower()
    if run_mode == "script":
        if not selected_tenant_guid:
            raise ValueError(
                "Voor script-runs is tenant_guid verplicht op de geselecteerde tenant. "
                "Vul de Tenant GUID in bij Tenant-instellingen voordat je de assessment start."
            )
        if not tenant_has_required_auth_profile(tenant_id):
            raise ValueError(
                "Voor deze tenant is nog geen volledige tenant-specifieke app-registratie ingesteld. "
                "Vul per tenant de auth_tenant_id, auth_client_id en een certificaat of client secret in."
            )
        if request_auth_tenant and request_auth_tenant != selected_tenant_guid:
            raise ValueError(
                "Je bent aangemeld op een andere tenant dan de geselecteerde tenant. "
                "Wissel Microsoft-tenant en start daarna opnieuw."
            )

    run_id = str(uuid.uuid4())
    db_execute(
        """
        INSERT INTO assessment_runs (id, tenant_id, status, run_mode, scan_type, phases_csv, started_by, started_at)
        VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            tenant_id,
            run_mode,
            scan_type,
            ",".join(phases),
            str(payload.get("started_by") or "local-user"),
            now_iso(),
        ),
    )
    append_run_log(run_id, "Run queued.")
    RUN_MANAGER.start(run_id, phases, run_mode, scan_type)
    _invalidate_tenant_perf_cache(tenant_id)
    return get_run(run_id) or {"id": run_id}


def delete_run(run_id: str) -> Dict[str, Any]:
    run = db_fetchone("SELECT * FROM assessment_runs WHERE id=?", (run_id,))
    if not run:
        raise ValueError("Run niet gevonden")
    db_execute("DELETE FROM finding_actions WHERE run_id=?", (run_id,))
    db_execute("DELETE FROM assessment_runs WHERE id=?", (run_id,))
    run_dir = RUNS_DIR / run_id
    if run_dir.exists():
        shutil.rmtree(run_dir, ignore_errors=True)
    _invalidate_tenant_perf_cache(run.get("tenant_id"))
    return {"id": run_id, "deleted": True}


class Handler(BaseHTTPRequestHandler):
    # Geen versie-info in de Server header blootstellen
    server_version = ""
    sys_version = ""

    def log_message(self, fmt: str, *args: Any) -> None:
        logger.info(fmt, *args)

    def _json(self, status: int, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("X-XSS-Protection", "1; mode=block")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            logger.info("Client disconnected before JSON response could be written: %s", self.path)
            return

    def _read_json(self) -> Dict[str, Any]:
        size = int(self.headers.get("Content-Length", "0") or "0")
        data = self.rfile.read(size) if size else b"{}"
        return json.loads(data.decode("utf-8")) if data else {}

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        _sess = None
        try:
            # ── Sessie / autorisatie-check ──
            if path.startswith("/api/") and path not in _OPEN_API_PATHS:
                _sess = _check_api_access(self, path)
                if _sess is None:
                    return  # 401/403 al verzonden

            # ── Utility & System routes (GET) ──────────────────────────────────
            utility_get_route = dispatch_utility_get_routes(
                path,
                _get_session_from_request(self) if path.startswith("/api/") and path in _OPEN_API_PATHS else _sess,
                {
                    "load_config": load_config,
                    "_build_session_access_profile": _build_session_access_profile,
                    "list_portal_roles": list_portal_roles,
                    "db_fetchall": db_fetchall,
                    "db_fetchone": db_fetchone,
                    "get_tenant_onboarding_status": get_tenant_onboarding_status,
                    "PLATFORM_DIR": PLATFORM_DIR,
                    "list_audit_logs": list_audit_logs,
                    "now_iso": now_iso,
                    "_tenant_job_summary": _tenant_job_summary,
                    "_latest_completed_run_for_tenant": _latest_completed_run_for_tenant,
                    "get_msp_control_center_payload": get_msp_control_center_payload,
                    "list_msp_actions": list_msp_actions,
                },
                qs,
            )
            if utility_get_route is not None:
                return self._json(utility_get_route[0], utility_get_route[1])
            
            # ── Capabilities & Users routes (GET) ──
            capabilities_users_get_route = dispatch_snapshots_and_capabilities_get_routes(
                path,
                qs,
                {
                    "get_tenant_capabilities": get_tenant_capabilities,
                    "build_capability_status": _build_capability_status,
                    "latest_assessment_snapshot_for_tenant": _latest_assessment_snapshot_for_tenant,
                    "db_fetchone": db_fetchone,
                    "db_fetchall": db_fetchall,
                    "list_azure_snapshots": list_azure_snapshots,
                    "list_alert_snapshots": list_alert_snapshots,
                    "list_cost_snapshots": list_cost_snapshots,
                    "get_cost_snapshot": get_cost_snapshot,
                },
            )
            if capabilities_users_get_route is not None:
                return self._json(capabilities_users_get_route[0], capabilities_users_get_route[1])
            
            # ── Users GET routes ──
            users_get_route = dispatch_users_get_routes(
                path,
                {
                    "list_users": list_users,
                    "get_user": get_user,
                },
            )
            if users_get_route is not None:
                return self._json(users_get_route[0], users_get_route[1])
            
            # ── Tenant routes ─────────────────────────────────────────────
            tenant_get_route = dispatch_tenant_get_routes(
                path,
                qs,
                {
                    "db_fetchone": db_fetchone,
                    "list_tenants": list_tenants,
                    "get_tenant_ops_summary": get_tenant_ops_summary,
                    "get_tenant_auth_profile": get_tenant_auth_profile,
                    "tenant_overview": tenant_overview,
                    "list_runs": list_runs,
                    "run_diff_for_tenant": run_diff_for_tenant,
                    "list_actions": list_actions,
                    "get_tenant_onboarding_status": get_tenant_onboarding_status,
                    "list_subscriptions": list_subscriptions,
                    "list_integrations": list_integrations,
                },
                sess=_sess,
            )
            if tenant_get_route is not None:
                http_s, pl = tenant_get_route
                # Auth check for auth-config endpoints
                if re.fullmatch(r"/api/tenants/[^/]+/auth-config", path) and _sess.get("role") != "admin":
                    return self._json(403, {"error": "Onvoldoende rechten."})
                return self._json(http_s, pl)
            management_hub_get_route = dispatch_management_hub_get_routes(
                path,
                qs,
                {
                    "management_hub_overview": _management_hub_overview,
                    "list_management_hub_policies": list_management_hub_policies,
                    "management_hub_client_payload": management_hub_client_payload,
                    "management_hub_tenant_label": _management_hub_tenant_label,
                    "now_iso": now_iso,
                    "list_management_hub_events": list_management_hub_events,
                    "cpp_agent_script": CPP_AGENT_SCRIPT,
                    "cpp_bootstrap_script": CPP_BOOTSTRAP_SCRIPT,
                    "cpp_detection_script": CPP_DETECTION_SCRIPT,
                    "cpp_remediation_script": CPP_REMEDIATION_SCRIPT,
                    "guardian_script": GUARDIAN_SCRIPT,
                },
            )
            if management_hub_get_route is not None:
                if callable(management_hub_get_route):
                    return management_hub_get_route(self)
                return self._json(management_hub_get_route[0], management_hub_get_route[1])
            
            # ── Scheduled Runs routes (GET) ────────────────────────────────────
            scheduled_runs_get_route = dispatch_scheduled_runs_get_routes(
                path,
                {
                    "db_fetchall": db_fetchall,
                },
            )
            if scheduled_runs_get_route is not None:
                return self._json(scheduled_runs_get_route[0], scheduled_runs_get_route[1])

            assessment_schedules_get_route = dispatch_assessment_schedules_get_routes(path, deps={
                "list_assessment_schedules": list_assessment_schedules,
                "get_assessment_schedule": get_assessment_schedule,
            })
            if assessment_schedules_get_route is not None:
                return self._json(assessment_schedules_get_route[0], assessment_schedules_get_route[1])

            job_get_route = dispatch_job_get_routes(
                path,
                qs,
                {"list_jobs": list_jobs},
            )
            if job_get_route is not None:
                return self._json(job_get_route[0], job_get_route[1])
            service_get_route = dispatch_service_get_routes(
                path,
                qs,
                _sess or {},
                {
                    "list_service_catalog": list_service_catalog,
                    "list_service_requests": list_service_requests,
                },
            )
            if service_get_route is not None:
                return self._json(service_get_route[0], service_get_route[1])
            customer_get_route = dispatch_customer_get_routes(
                path,
                qs,
                {
                    "list_customers": list_customers,
                    "get_customer": get_customer,
                    "customer_exists": model_customer_exists,
                    "list_customer_services": model_list_customer_services,
                    "list_tenants_for_customer": lambda cid: db_fetchall(
                        "SELECT * FROM tenants WHERE customer_id=? AND is_active=1 ORDER BY tenant_name",
                        (cid,),
                    ),
                    "get_customer_health": get_customer_health,
                    "get_customer_onboarding_summary": get_customer_onboarding_summary,
                    "get_tenant_onboarding_status": get_tenant_onboarding_status,
                    "get_customer_finance_summary": get_customer_finance_summary,
                    "get_customer_overview": get_customer_overview,
                    "get_customer_assessments": get_customer_assessments,
                    "get_customer_azure_summary": get_customer_azure_summary,
                    "list_subscriptions": list_subscriptions,
                    "list_user_customer_access": list_user_customer_access,
                    "api_error": _api_error,
                },
            )
            if customer_get_route is not None:
                return self._json(customer_get_route[0], customer_get_route[1])

            # ── Azure routes (GET) ────────────────────────────────────────
            azure_get_route = dispatch_azure_get_routes(
                path,
                {
                    "list_subscriptions": list_subscriptions,
                    "list_azure_snapshots": list_azure_snapshots,
                    "list_alert_snapshots": list_alert_snapshots,
                    "list_cost_snapshots": list_cost_snapshots,
                    "api_error": _api_error,
                },
            )
            if azure_get_route is not None:
                return self._json(azure_get_route[0], azure_get_route[1])

            approval_get_route = dispatch_approval_get_routes(
                path,
                qs,
                {
                    "list_approvals": list_approvals,
                    "list_approval_requests": list_approval_requests,
                },
            )
            if approval_get_route is not None:
                return self._json(approval_get_route[0], approval_get_route[1])
            integration_get_route = dispatch_integration_get_routes(
                path,
                {
                    "list_integrations": list_integrations,
                },
            )
            if integration_get_route is not None:
                return self._json(integration_get_route[0], integration_get_route[1])
            
            operations_get_route = dispatch_operations_get_routes(
                path,
                qs,
                {
                    "list_runs": list_runs,
                    "get_run": get_run,
                    "assessment_json_report_for_run": _assessment_json_report_for_run,
                    "runs_dir": RUNS_DIR,
                    "list_run_html_files": list_run_html_files,
                    "list_reports": list_reports,
                    "reports_csv": reports_csv,
                    "tenant_overview": tenant_overview,
                    "list_tenants": list_tenants,
                    "get_tenant_health_score": _get_tenant_health_score,
                    "get_findings_trend": _get_findings_trend,
                    "get_conn": get_conn,
                    "suggest_kb_for_finding": suggest_kb_for_finding,
                    "suggest_playbooks_for_finding": suggest_playbooks_for_finding,
                    "export_run_as_pdf": export_run_as_pdf,
                },
            )
            if operations_get_route is not None:
                if callable(operations_get_route):
                    return operations_get_route(self)
                return self._json(operations_get_route[0], operations_get_route[1])

            result = dispatch_comparison_get_routes(path, deps={
                "compare_tenants": compare_tenants,
            })
            if result: return self._json(*result)

            # ── Remediation routes (GET) ──
            remediation_get_route = dispatch_remediation_get_routes(
                path,
                qs,
                {
                    "get_remediation_catalog": get_remediation_catalog,
                    "list_remediation_history": list_remediation_history,
                },
            )
            if remediation_get_route is not None:
                return self._json(remediation_get_route[0], remediation_get_route[1])

            # ── User Management routes (GET) ──
            if re.fullmatch(r"/api/m365/[^/]+/users", path):
                tenant_id = path.split("/")[3]
                filter_q = qs.get("filter", [None])[0]
                strict_live = qs.get("strict_live", ["0"])[0] in {"1", "true", "yes"}
                live_error = None
                try:
                    result = _run_user_mgmt(tenant_id, "list-users", {"filter": filter_q})
                    r = result.get("result") or {}
                    if result.get("ok") and r.get("ok") is not False and r.get("users"):
                        r["users"] = [_normalize_user_license_payload(u) for u in (r.get("users") or []) if isinstance(u, dict)]
                        return self._json(200, r)
                    live_error = (r.get("error") if isinstance(r, dict) else None) or result.get("message")
                except Exception as exc:
                    live_error = str(exc)
                if strict_live:
                    return self._json(502, {"error": live_error or "Live gebruikersscan mislukt. Controleer tenantverbinding of app-autorisatie en probeer opnieuw."})
                # Fallback: serve from assessment snapshot
                snap = _latest_assessment_snapshot_for_tenant(tenant_id)
                users = _snapshot_as_users(tenant_id)
                if users:
                    return self._json(200, {
                        "ok": True,
                        "users": users,
                        "counts": snap.get("assessment_user_counts") or {},
                        "_source": "assessment_snapshot",
                    })
                return self._json(502, {"error": "Geen gebruikersdata beschikbaar. Voer een assessment uit of controleer de tenant auth-configuratie."})
            if re.fullmatch(r"/api/m365/[^/]+/users/[^/]+", path):
                parts = path.split("/")
                tenant_id = parts[3]; user_id = parts[5]
                try:
                    result = _run_user_mgmt(tenant_id, "get-user", {"user_id": user_id})
                    if result.get("ok"):
                        payload = result["result"] or {}
                        if isinstance(payload.get("user"), dict):
                            payload["user"] = _normalize_user_license_payload(payload["user"])
                        return self._json(200, payload)
                except Exception:
                    pass
                for user in _snapshot_as_users(tenant_id):
                    if not isinstance(user, dict):
                        continue
                    if user.get("id") == user_id or user.get("userPrincipalName") == user_id:
                        return self._json(200, {"ok": True, "user": user, "_source": "assessment_snapshot"})
                return self._json(404, {"error": "Gebruikersdetail niet beschikbaar"})
            if re.fullmatch(r"/api/m365/[^/]+/licenses", path):
                tenant_id = path.split("/")[3]
                try:
                    result = _run_user_mgmt(tenant_id, "list-licenses", {})
                    r = result.get("result") or {}
                    if result.get("ok") and r.get("ok") is not False and r.get("licenses"):
                        r["licenses"] = [_normalize_license_payload(lic) for lic in (r.get("licenses") or []) if isinstance(lic, dict)]
                        return self._json(200, r)
                except Exception:
                    pass
                # Fallback: serve from assessment snapshot
                licenses = _snapshot_as_licenses(tenant_id)
                if licenses:
                    return self._json(200, _attach_source_meta({"ok": True, "licenses": licenses}, "assessment_snapshot", tenant_id=tenant_id))
                return self._json(502, {"error": "Geen licentiedata beschikbaar. Voer een assessment uit."})
            if re.fullmatch(r"/api/m365/[^/]+/provisioning-history", path):
                tenant_id = path.split("/")[3]
                limit = int(qs.get("limit", ["100"])[0])
                return self._json(200, {"items": list_provisioning_history(tenant_id, limit)})

            baseline_get_route = dispatch_baseline_get_routes(
                path,
                qs,
                {
                    "list_baselines": list_baselines,
                    "get_baseline": get_baseline,
                    "list_assignments": list_assignments,
                    "list_baseline_history": list_baseline_history,
                },
            )
            if baseline_get_route is not None:
                return self._json(baseline_get_route[0], baseline_get_route[1])
            microsoft_services_get_route = dispatch_microsoft_services_get_routes(
                path,
                qs,
                {
                    "run_intune_ps": _run_intune_ps,
                    "snapshot_as_intune_devices": _snapshot_as_intune_devices,
                    "snapshot_as_intune_compliance": _snapshot_as_intune_compliance,
                    "snapshot_as_intune_config": _snapshot_as_intune_config,
                    "snapshot_as_intune_summary": _snapshot_as_intune_summary,
                    "list_intune_history": list_intune_history,
                    "run_backup_ps": _run_backup_ps,
                    "snapshot_as_sharepoint_sites": _snapshot_as_sharepoint_sites,
                    "snapshot_as_sharepoint_backup": _snapshot_as_sharepoint_backup,
                    "snapshot_as_onedrive_backup": _snapshot_as_onedrive_backup,
                    "list_backup_history": list_backup_history,
                    "run_ca_ps": _run_ca_ps,
                    "snapshot_as_ca_policies": _snapshot_as_ca_policies,
                    "list_ca_history": list_ca_history,
                    "attach_source_meta": _attach_source_meta,
                },
            )
            if microsoft_services_get_route is not None:
                return self._json(microsoft_services_get_route[0], microsoft_services_get_route[1])

            intune_policy_get_route = dispatch_intune_policy_get_routes(
                path,
                qs,
                _sess or {},
                {
                    "db_fetchone": db_fetchone,
                    "session_can_service": _session_can_service,
                    "get_tenant_auth_profile": get_tenant_auth_profile,
                },
            )
            if intune_policy_get_route is not None:
                return self._json(intune_policy_get_route[0], intune_policy_get_route[1])

            platform_security_get_route = dispatch_platform_security_get_routes(
                path,
                qs,
                {
                    "run_cis_ps": _run_cis_ps,
                    "snapshot_as_cis_data": _snapshot_as_cis_data,
                    "run_hybrid_ps": _run_hybrid_ps,
                    "snapshot_as_hybrid_sync": _snapshot_as_hybrid_sync,
                    "run_domains_ps": _run_domains_ps,
                    "snapshot_as_domains": _snapshot_as_domains,
                    "run_identity_ps": _run_identity_ps,
                    "latest_assessment_snapshot_for_tenant": _latest_assessment_snapshot_for_tenant,
                    "assessment_json_payload": _assessment_json_payload,
                    "payload_value": _payload_value,
                    "snapshot_raw_metrics": _snapshot_raw_metrics,
                    "snapshot_as_users": _snapshot_as_users,
                    "attach_source_meta": _attach_source_meta,
                    "logger": logger,
                },
            )
            if platform_security_get_route is not None:
                return self._json(platform_security_get_route[0], platform_security_get_route[1])

            security_get_route = dispatch_security_get_routes(
                path,
                {
                    "zt_output_folder": _zt_output_folder,
                    "zt_read_status": _zt_read_status,
                    "zt_tail_log": _zt_tail_log,
                    "zt_auth_profile_summary": _zt_auth_profile_summary,
                    "zt_linked_app_registration": _zt_linked_app_registration,
                    "zt_permission_summary": _zt_permission_summary,
                    "run_zerotrust_ps": _run_zerotrust_ps,
                },
            )
            if security_get_route is not None:
                return self._json(security_get_route[0], security_get_route[1])

            collaboration_services_get_route = dispatch_collaboration_services_get_routes(
                path,
                qs,
                {
                    "run_collab_ps": _run_collab_ps,
                    "build_sharepoint_capacity_summary": _build_sharepoint_capacity_summary,
                    "snapshot_as_sharepoint_sites": _snapshot_as_sharepoint_sites,
                    "snapshot_as_sharepoint_settings": _snapshot_as_sharepoint_settings,
                    "snapshot_as_teams": _snapshot_as_teams,
                    "run_alerts_ps": _run_alerts_ps,
                    "latest_assessment_snapshot_for_tenant": _latest_assessment_snapshot_for_tenant,
                    "assessment_json_payload": _assessment_json_payload,
                    "payload_value": _payload_value,
                    "snapshot_raw_metrics": _snapshot_raw_metrics,
                    "get_alert_config": get_alert_config,
                    "run_exchange_ps": _run_exchange_ps,
                    "snapshot_as_mailboxes": _snapshot_as_mailboxes,
                    "snapshot_as_mailbox_detail": _snapshot_as_mailbox_detail,
                    "attach_source_meta": _attach_source_meta,
                    "list_actions": list_actions,
                },
            )
            if collaboration_services_get_route is not None:
                return self._json(collaboration_services_get_route[0], collaboration_services_get_route[1])

            controls_get_route = dispatch_controls_get_routes(
                path,
                qs,
                {
                    "run_identity_ps": _run_identity_ps,
                    "run_collab_ps": _run_collab_ps,
                    "run_exchange_ps": _run_exchange_ps,
                    "run_ca_ps": _run_ca_ps,
                    "run_appregs_ps": _run_appregs_ps,
                    "latest_assessment_snapshot_for_tenant": _latest_assessment_snapshot_for_tenant,
                    "assessment_json_payload": _assessment_json_payload,
                    "payload_value": _payload_value,
                    "snapshot_as_users": _snapshot_as_users,
                    "snapshot_as_ca_policies": _snapshot_as_ca_policies,
                    "snapshot_as_teams": _snapshot_as_teams,
                    "snapshot_as_sharepoint_settings": _snapshot_as_sharepoint_settings,
                    "db_fetchone": db_fetchone,
                    "now_iso": now_iso,
                },
            )
            if controls_get_route is not None:
                return self._json(controls_get_route[0], controls_get_route[1])

            app_registration_get_route = dispatch_app_registration_get_routes(
                path,
                {
                    "run_appregs_ps": _run_appregs_ps,
                    "latest_assessment_snapshot_for_tenant": _latest_assessment_snapshot_for_tenant,
                    "assessment_json_payload": _assessment_json_payload,
                    "payload_value": _payload_value,
                    "attach_source_meta": _attach_source_meta,
                },
            )
            if app_registration_get_route is not None:
                return self._json(app_registration_get_route[0], app_registration_get_route[1])

            kb_get_route = dispatch_kb_get_routes(
                path,
                qs,
                {
                    "kb_tid": _kb_tid,
                    "kb_iid": _kb_iid,
                    "kb_list_asset_types": kb_list_asset_types,
                    "kb_get_meta": kb_get_meta,
                    "kb_list_assets": kb_list_assets,
                    "list_actions_for_asset": list_actions_for_asset,
                    "kb_list_vlans": kb_list_vlans,
                    "kb_list_pages": kb_list_pages,
                    "kb_get_page": kb_get_page,
                    "kb_list_contacts": kb_list_contacts,
                    "kb_list_passwords": kb_list_passwords,
                    "kb_list_software": kb_list_software,
                    "kb_list_domains": kb_list_domains,
                    "latest_assessment_snapshot_for_tenant": _latest_assessment_snapshot_for_tenant,
                    "assessment_json_payload": _assessment_json_payload,
                    "payload_value": _payload_value,
                    "kb_get_m365_profile": kb_get_m365_profile,
                    "kb_list_changelog": kb_list_changelog,
                },
            )
            if kb_get_route is not None:
                return self._json(kb_get_route[0], kb_get_route[1])
            
            # ── File Serving routes (static files, portal, reports) ──────────
            file_serving_handled = dispatch_file_serving_get_routes(
                path,
                self,
                WEB_DIR,
                PLATFORM_DIR,
                RUNS_DIR,
                CSP_HEADER,
            )
            if file_serving_handled:
                return  # Handler method was called by dispatcher
        except Exception as exc:
            logger.error("500 in GET %s: %s", path, traceback.format_exc())
            return self._json(500, {"error": "Interne serverfout."})
        finally:
            _clear_request_cache()  # Ruim per-request cache op

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        _sess = None
        # CSRF-check voor alle state-muterende endpoints buiten initiële auth
        if path not in ("/api/auth/login", "/api/auth/microsoft", "/api/auth/logout"):
            if not _check_csrf(self):
                return self._json(403, {"error": "CSRF validatie mislukt."})
        # ── Sessie / autorisatie-check ──
        if path.startswith("/api/") and path not in _OPEN_API_PATHS:
            _sess = _check_api_access(self, path)
            if _sess is None:
                return  # 401/403 al verzonden
        try:
            auth_post_result = dispatch_auth_post_routes(
                path,
                self._read_json,
                self.client_address,
                {
                    "db_fetchone": db_fetchone,
                    "db_execute": db_execute,
                    "db_audit": db_audit,
                    "_check_rate_limit": _check_rate_limit,
                    "_check_account_lockout": _check_account_lockout,
                    "_record_account_failure": _record_account_failure,
                    "_verify_pw": _verify_pw,
                    "_hash_pw": _hash_pw,
                    "_create_session": _create_session,
                    "_get_session_from_request": _get_session_from_request,
                    "now_iso": now_iso,
                    "request_handler": self,
                    "config": load_config(),
                },
            )
            if auth_post_result is not None:
                if isinstance(auth_post_result, dict) and "response" in auth_post_result:
                    self.send_response(auth_post_result["response"])
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("X-Content-Type-Options", "nosniff")
                    self.send_header("X-Frame-Options", "DENY")
                    self.send_header("X-XSS-Protection", "1; mode=block")
                    for header_name, header_value in auth_post_result.get("headers", {}).items():
                        self.send_header(header_name, header_value)
                    body_bytes = json.dumps(auth_post_result["json_body"]).encode()
                    self.send_header("Content-Length", str(len(body_bytes)))
                    self.end_headers()
                    self.wfile.write(body_bytes)
                    return
                return self._json(auth_post_result[0], auth_post_result[1])
            management_hub_post_route = dispatch_management_hub_post_routes(
                path,
                _sess,
                self._read_json,
                {
                    "create_management_hub_policy": create_management_hub_policy,
                    "sync_management_hub_guardian_events": sync_management_hub_guardian_events,
                    "validate_management_hub_guardian_auth": validate_management_hub_guardian_auth,
                    "delete_management_hub_policy": delete_management_hub_policy,
                },
            )
            if management_hub_post_route is not None:
                return self._json(management_hub_post_route[0], management_hub_post_route[1])
            # ── Tenant routes (POST) ──────────────────────────────────────────
            tenant_post_route = dispatch_tenant_post_routes(
                path,
                _sess,
                self._read_json,
                {
                    "db_fetchone": db_fetchone,
                    "create_tenant": create_tenant,
                    "save_tenant_auth_profile": save_tenant_auth_profile,
                    "delete_tenant": delete_tenant,
                    "upsert_subscription": upsert_subscription,
                    "upsert_azure_snapshot": upsert_azure_snapshot,
                    "upsert_alert_snapshot": upsert_alert_snapshot,
                    "upsert_cost_snapshot": upsert_cost_snapshot,
                    "update_cost_snapshot": update_cost_snapshot,
                    "request_onboarding_approval": request_onboarding_approval,
                    "launch_onboarding_job_chain": launch_onboarding_job_chain,
                    "action_requires_approval": _action_requires_approval,
                    "create_action_log": create_action_log,
                    "session_can": _session_can,
                    "api_error": _api_error,
                },
            )
            if tenant_post_route is not None:
                http_s, pl = tenant_post_route
                # Auth check for auth-config and subscriptions endpoints
                if re.fullmatch(r"/api/tenants/[^/]+/auth-config", path) and _sess.get("role") != "admin":
                    return self._json(403, {"error": "Onvoldoende rechten."})
                if re.fullmatch(r"/api/tenants/[^/]+/subscriptions", path) and _sess.get("role") != "admin":
                    return self._json(403, {"error": "Onvoldoende rechten."})
                # Auth check for onboarding endpoints
                if re.fullmatch(r"/api/onboarding/[^/]+/approval", path) and not _session_can(_sess, "onboarding.approval.request"):
                    return self._json(403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"})
                if re.fullmatch(r"/api/onboarding/[^/]+/launch-plan", path) and not _session_can(_sess, "onboarding.plan.launch"):
                    return self._json(403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"})
                return self._json(http_s, pl)
            customer_post_route = dispatch_customer_post_routes(
                path,
                _sess,
                self._read_json,
                {
                    "session_can": _session_can,
                    "create_customer": create_customer,
                    "upsert_customer_service": upsert_customer_service,
                },
            )
            if customer_post_route is not None:
                return self._json(customer_post_route[0], customer_post_route[1])
            azure_post_route = dispatch_azure_post_routes(
                path,
                _sess,
                self._read_json,
                {
                    "session_can": _session_can,
                    "create_action_log": create_action_log,
                    "create_approval": create_approval,
                    "db_audit": db_audit,
                    "api_error": _api_error,
                },
            )
            if azure_post_route is not None:
                return self._json(azure_post_route[0], azure_post_route[1])
            approval_post_route = dispatch_approval_post_routes(
                path,
                _sess,
                self._read_json,
                {
                    "session_can": _session_can,
                    "api_error": _api_error,
                    "request_action_approval": request_action_approval,
                    "create_approval": create_approval,
                    "decide_approval": decide_any_approval,
                    "approval_exists": approval_exists,
                },
            )
            if approval_post_route is not None:
                return self._json(approval_post_route[0], approval_post_route[1])
            job_post_route = dispatch_job_post_routes(
                path,
                _sess,
                self._read_json,
                {
                    "session_can": _session_can,
                    "api_error": _api_error,
                    "enqueue_job": enqueue_job,
                    "cancel_job": cancel_job,
                    "create_action_log": create_action_log,
                    "db_audit": db_audit,
                },
            )
            if job_post_route is not None:
                return self._json(job_post_route[0], job_post_route[1])
            service_post_route = dispatch_service_post_routes(
                path,
                _sess or {},
                self._read_json,
                {
                    "create_service_request": create_service_request,
                    "update_service_request_status": update_service_request_status,
                    "api_error": _api_error,
                },
            )
            if service_post_route is not None:
                return self._json(service_post_route[0], service_post_route[1])
            integration_post_route = dispatch_integration_post_routes(
                path,
                _sess,
                self._read_json,
                {
                    "session_can": _session_can,
                    "db_fetchone": db_fetchone,
                    "upsert_integration": upsert_integration,
                },
            )
            if integration_post_route is not None:
                return self._json(integration_post_route[0], integration_post_route[1])
            # ── Customer access (POST) ────────────────────────────────────────
            if re.fullmatch(r"/api/customers/[^/]+/access/[^/]+", path):
                if not _session_can(_sess, "customer.access.manage"):
                    return self._json(403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"})
                parts = path.split("/")
                cid = parts[3]
                uid = parts[5]
                body = self._read_json()
                role_key = (body.get("role_key") or "read_only").strip()
                documentation_enabled = bool(body.get("documentation_enabled"))
                access_scope = {
                    "documentation_enabled": documentation_enabled,
                }
                if not db_fetchone("SELECT id FROM customers WHERE id=?", (cid,)):
                    http_s, pl = _api_error("not_found", "Klant niet gevonden", 404)
                    return self._json(http_s, pl)
                if not db_fetchone("SELECT id FROM users WHERE id=?", (uid,)):
                    http_s, pl = _api_error("not_found", "Gebruiker niet gevonden", 404)
                    return self._json(http_s, pl)
                
                # Check approval requirement for customer.access.manage
                if _action_requires_approval("customer.access.manage"):
                    approval_id = body.get("approval_id", "").strip()
                    if not approval_id:
                        customer = db_fetchone("SELECT id, name FROM customers WHERE id=?", (cid,)) or {}
                        user = db_fetchone("SELECT id, display_name, email FROM users WHERE id=?", (uid,)) or {}
                        return self._json(402, {
                            "error": "Goedkeuring vereist voor deze actie",
                            "error_code": "approval_required",
                            "action_key": "customer.access.manage",
                            "action_name": "Klanttoegang toewijzen",
                            "action_description": f"Ken rol '{role_key}' toe aan {user.get('display_name') or user.get('email') or uid} voor {customer.get('name') or cid}{' met Documentatie-module' if documentation_enabled else ''}.",
                            "metadata": {
                                "customer_id": cid,
                                "customer_name": customer.get("name") or cid,
                                "user_id": uid,
                                "user_label": user.get("display_name") or user.get("email") or uid,
                                "role_key": role_key,
                                "scope": access_scope,
                            },
                        })
                    appr = db_fetchone("SELECT * FROM approvals WHERE id=? AND approval_status='approved'", (approval_id,))
                    if not appr:
                        return self._json(402, {
                            "error": "Goedkeuring niet goedgekeurd of niet gevonden",
                            "error_code": "approval_not_approved"
                        })
                    create_action_log(cid, "customers", "access", "approval_validated", {"approval_id": approval_id, "user_id": uid, "role_key": role_key})
                
                return self._json(201, grant_customer_access(cid, uid, role_key, _sess.get("email", ""), scope=access_scope))
            actions_post_route = dispatch_actions_post_routes(
                path,
                self._read_json,
                {
                    "create_action": create_action,
                },
            )
            if actions_post_route is not None:
                return self._json(actions_post_route[0], actions_post_route[1])
            
            operations_post_route = dispatch_operations_post_routes(
                path,
                self._read_json,
                self.client_address[0],
                {
                    "latest_completed_run_for_tenant": _latest_completed_run_for_tenant,
                    "persist_snapshot_findings": _persist_snapshot_findings,
                    "has_snapshot_findings_for_run": _has_snapshot_findings_for_run,
                    "create_or_get_playbook_page": create_or_get_playbook_page,
                    "run_manager": RUN_MANAGER,
                    "append_run_log": append_run_log,
                    "delete_run": delete_run,
                    "archive_run": archive_run,
                    "restore_run": restore_run,
                    "apply_retention_policy": apply_retention_policy,
                    "check_rate_limit": _check_rate_limit,
                    "create_run": create_run,
                },
            )
            if operations_post_route is not None:
                return self._json(operations_post_route[0], operations_post_route[1])
            
            # ── Scheduled Runs routes (POST) ───────────────────────────────────
            scheduled_runs_post_route = dispatch_scheduled_runs_post_routes(
                path,
                self._read_json,
                _sess,
                {
                    "enqueue_job": enqueue_job,
                    "load_config": load_config,
                },
            )
            if scheduled_runs_post_route is not None:
                return self._json(scheduled_runs_post_route[0], scheduled_runs_post_route[1])

            assessment_schedules_post_route = dispatch_assessment_schedules_post_routes(path, self._read_json, _sess, deps={
                "upsert_assessment_schedule": upsert_assessment_schedule,
            })
            if assessment_schedules_post_route is not None:
                return self._json(assessment_schedules_post_route[0], assessment_schedules_post_route[1])

            security_post_route = dispatch_security_post_routes(
                path,
                self._read_json,
                {
                    "zt_output_folder": _zt_output_folder,
                    "zt_write_status": _zt_write_status,
                    "zt_append_log": _zt_append_log,
                    "zt_auth_profile_summary": _zt_auth_profile_summary,
                    "run_zerotrust_worker": _run_zerotrust_worker,
                    "now_iso": now_iso,
                    "threading": threading,
                },
            )
            if security_post_route is not None:
                return self._json(security_post_route[0], security_post_route[1])
            
            # ── Users POST/PATCH/DELETE routes ──
            users_mutation_route = dispatch_users_post_put_delete_routes(
                path,
                "POST",
                self._read_json,
                _sess,
                {
                    "create_user_account": create_user_account,
                    "update_user_account": update_user_account,
                    "delete_user_account": delete_user_account,
                },
            )
            if users_mutation_route is not None:
                return self._json(users_mutation_route[0], users_mutation_route[1])
            
            # ── Config ──
            if path == "/api/config":
                payload = self._read_json()
                cfg = load_config()
                for k in ("default_run_mode", "script_path",
                          "auth_tenant_id", "auth_client_id",
                          "auth_cert_thumbprint", "auth_client_secret",
                          "assessment_ui_v1"):
                    if k in payload:
                        cfg[k] = payload[k]
                save_config(cfg)
                # Geef config terug zonder geheimen
                safe = {k: v for k, v in cfg.items() if k not in ("auth_client_secret",)}
                return self._json(200, safe)
            
            # ── Remediation routes (POST) ──
            remediation_post_route = dispatch_remediation_post_routes(
                path,
                self._read_json,
                _sess,
                self.client_address,
                {
                    "execute_remediation": execute_remediation,
                    "check_rate_limit": _check_rate_limit,
                },
            )
            if remediation_post_route is not None:
                return self._json(remediation_post_route[0], remediation_post_route[1])
            
            # ── User Management routes (POST) ──
            user_management_post_route = dispatch_user_management_post_routes(
                path,
                self._read_json,
                _sess,
                {
                    "run_user_mgmt": _run_user_mgmt,
                },
            )
            if user_management_post_route is not None:
                return self._json(user_management_post_route[0], user_management_post_route[1])

            baseline_post_route = dispatch_baseline_post_routes(
                path,
                _sess,
                self._read_json,
                {
                    "create_baseline": create_baseline,
                    "run_baseline_ps": _run_baseline_ps,
                    "db_fetchone": db_fetchone,
                    "assign_baseline": assign_baseline,
                    "check_baseline_compliance": check_baseline_compliance,
                    "apply_baseline_to_tenant": apply_baseline_to_tenant,
                },
            )
            if baseline_post_route is not None:
                return self._json(baseline_post_route[0], baseline_post_route[1])

            kb_post_route = dispatch_kb_post_routes(
                path,
                self._read_json,
                {
                    "kb_tid": _kb_tid,
                    "kb_create_asset_type": kb_create_asset_type,
                    "kb_create_asset": kb_create_asset,
                    "kb_create_vlan": kb_create_vlan,
                    "kb_create_page": kb_create_page,
                    "kb_create_contact": kb_create_contact,
                    "kb_create_password": kb_create_password,
                    "kb_create_software": kb_create_software,
                    "kb_create_domain": kb_create_domain,
                    "kb_create_changelog": kb_create_changelog,
                    "kb_sync_from_assessment": lambda tid, force=False: kb_sync_from_assessment(
                        tid,
                        force=force,
                        get_snapshot=_latest_assessment_snapshot_for_tenant,
                        get_sku_friendly_name=get_sku_friendly_name,
                    ),
                },
            )
            if kb_post_route is not None:
                return self._json(kb_post_route[0], kb_post_route[1])
            microsoft_services_post_route = dispatch_microsoft_services_post_routes(
                path,
                _sess,
                self._read_json,
                {
                    "run_intune_ps": _run_intune_ps,
                    "run_ca_ps": _run_ca_ps,
                },
            )
            if microsoft_services_post_route is not None:
                return self._json(microsoft_services_post_route[0], microsoft_services_post_route[1])

            intune_policy_post_route = dispatch_intune_policy_post_routes(
                path,
                _sess or {},
                self._read_json,
                {
                    "db_fetchone": db_fetchone,
                    "session_can_service": _session_can_service,
                    "get_tenant_auth_profile": get_tenant_auth_profile,
                    "run_intune_ps": _run_intune_ps,
                },
            )
            if intune_policy_post_route is not None:
                return self._json(intune_policy_post_route[0], intune_policy_post_route[1])

            collaboration_services_post_route = dispatch_collaboration_services_post_routes(
                path,
                self._read_json,
                {
                    "upsert_alert_config": upsert_alert_config,
                    "send_test_webhook": send_test_webhook,
                },
            )
            if collaboration_services_post_route is not None:
                return self._json(collaboration_services_post_route[0], collaboration_services_post_route[1])

            report_upload_post_route = dispatch_report_upload_post_routes(
                path,
                self._read_json,
                {
                    "DEFAULT_REPORTS_DIR": DEFAULT_REPORTS_DIR,
                },
            )
            if report_upload_post_route is not None:
                return self._json(report_upload_post_route[0], report_upload_post_route[1])

            return self._json(404, {"error": "Niet gevonden"})
        except ValueError as exc:
            return self._json(400, {"error": str(exc)})
        except Exception as exc:
            logger.error("500 in POST %s: %s", path, traceback.format_exc())
            return self._json(500, {"error": "Interne serverfout."})
        finally:
            _clear_request_cache()  # Ruim per-request cache op

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if not _check_csrf(self):
            return self._json(403, {"error": "CSRF validatie mislukt."})
        _sess = _check_api_access(self, path)
        if _sess is None:
            return
        try:
            if re.fullmatch(r"/api/tenants/[^/]+", path):
                tenant_id = path.split("/")[3]
                mode = parse_qs(parsed.query).get("mode", ["soft"])[0]
                return self._json(200, delete_tenant(tenant_id, mode))
            customer_delete_route = dispatch_customer_delete_routes(
                path,
                {"delete_customer": delete_customer},
            )
            if customer_delete_route is not None:
                return self._json(customer_delete_route[0], customer_delete_route[1])
            if re.fullmatch(r"/api/customers/[^/]+/access/[^/]+", path):
                if not _session_can(_sess, "customer.access.manage"):
                    return self._json(403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"})
                parts = path.split("/")
                cid = parts[3]
                uid = parts[5]
                result = revoke_customer_access(cid, uid)
                if not result.get("ok"):
                    return self._json(404, {"error": "Toegang niet gevonden", "error_code": "not_found"})
                return self._json(200, result)
            
            # ── Users & Cost Snapshots DELETE ──
            users_cost_delete_route = dispatch_users_post_put_delete_routes(
                path,
                "DELETE",
                self._read_json,
                _sess,
                {
                    "create_user_account": create_user_account,
                    "update_user_account": update_user_account,
                    "delete_user_account": delete_user_account,
                },
            )
            if users_cost_delete_route is not None:
                return self._json(users_cost_delete_route[0], users_cost_delete_route[1])
            
            cost_snapshots_delete_route = dispatch_cost_snapshots_mutation_routes(
                path,
                "DELETE",
                self._read_json,
                _sess,
                {
                    "session_can": _session_can,
                    "delete_cost_snapshot": delete_cost_snapshot,
                },
            )
            if cost_snapshots_delete_route is not None:
                return self._json(cost_snapshots_delete_route[0], cost_snapshots_delete_route[1])
            
            operations_delete_route = dispatch_operations_delete_routes(
                path,
                {
                    "delete_run": delete_run,
                },
            )
            if operations_delete_route is not None:
                return self._json(operations_delete_route[0], operations_delete_route[1])

            assessment_schedules_delete_route = dispatch_assessment_schedules_delete_routes(path, deps={
                "delete_assessment_schedule": delete_assessment_schedule,
            })
            if assessment_schedules_delete_route is not None:
                return self._json(assessment_schedules_delete_route[0], assessment_schedules_delete_route[1])

            baseline_delete_route = dispatch_baseline_delete_routes(
                path,
                {
                    "delete_baseline": delete_baseline,
                    "unassign_baseline": unassign_baseline,
                },
            )
            if baseline_delete_route is not None:
                return self._json(baseline_delete_route[0], baseline_delete_route[1])
            kb_delete_route = dispatch_kb_delete_routes(
                path,
                {
                    "kb_tid": _kb_tid,
                    "kb_iid": _kb_iid,
                    "kb_delete_asset_type": kb_delete_asset_type,
                    "kb_delete_asset": kb_delete_asset,
                    "kb_delete_vlan": kb_delete_vlan,
                    "kb_delete_page": kb_delete_page,
                    "kb_delete_contact": kb_delete_contact,
                    "kb_delete_password": kb_delete_password,
                    "kb_delete_software": kb_delete_software,
                    "kb_delete_domain": kb_delete_domain,
                    "kb_delete_changelog": kb_delete_changelog,
                },
            )
            if kb_delete_route is not None:
                return self._json(kb_delete_route[0], kb_delete_route[1])

            intune_policy_delete_route = dispatch_intune_policy_delete_routes(
                path,
                _sess or {},
                parse_qs(parsed.query),
                {
                    "db_fetchone": db_fetchone,
                    "session_can_service": _session_can_service,
                    "get_tenant_auth_profile": get_tenant_auth_profile,
                    "run_intune_ps": _run_intune_ps,
                },
            )
            if intune_policy_delete_route is not None:
                return self._json(intune_policy_delete_route[0], intune_policy_delete_route[1])

            mgmt_hub_delete_route = dispatch_management_hub_delete_routes(
                path,
                _sess,
                {
                    "delete_management_hub_policy": delete_management_hub_policy,
                },
            )
            if mgmt_hub_delete_route is not None:
                return self._json(mgmt_hub_delete_route[0], mgmt_hub_delete_route[1])

            return self._json(404, {"error": "Niet gevonden"})
        except ValueError as exc:
            return self._json(400, {"error": str(exc)})
        except Exception as exc:
            logger.error("500 in DELETE %s: %s", path, traceback.format_exc())
            return self._json(500, {"error": "Interne serverfout."})

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if not _check_csrf(self):
            return self._json(403, {"error": "CSRF validatie mislukt."})
        _sess = _check_api_access(self, path)
        if _sess is None:
            return
        try:
            if re.fullmatch(r"/api/tenants/[^/]+", path):
                tenant_id = path.split("/")[3]
                return self._json(200, update_tenant(tenant_id, self._read_json()))
            
            # ── Users PATCH ──
            users_patch_route = dispatch_users_post_put_delete_routes(
                path,
                "PATCH",
                self._read_json,
                _sess,
                {
                    "create_user_account": create_user_account,
                    "update_user_account": update_user_account,
                    "delete_user_account": delete_user_account,
                },
            )
            if users_patch_route is not None:
                return self._json(users_patch_route[0], users_patch_route[1])
            
            if re.fullmatch(r"/api/actions/[^/]+", path):
                action_id = path.split("/")[3]
                return self._json(200, update_action(action_id, self._read_json()))
            baseline_patch_route = dispatch_baseline_patch_routes(
                path,
                self._read_json,
                {
                    "update_baseline": update_baseline,
                },
            )
            if baseline_patch_route is not None:
                return self._json(baseline_patch_route[0], baseline_patch_route[1])
            customer_patch_route = dispatch_customer_patch_routes(
                path,
                self._read_json,
                {"update_customer": update_customer},
            )
            if customer_patch_route is not None:
                return self._json(customer_patch_route[0], customer_patch_route[1])
            
            # ── Cost Snapshots PATCH ──
            cost_snapshots_patch_route = dispatch_cost_snapshots_mutation_routes(
                path,
                "PATCH",
                self._read_json,
                _sess,
                {
                    "session_can": _session_can,
                    "delete_cost_snapshot": delete_cost_snapshot,
                },
            )
            if cost_snapshots_patch_route is not None:
                return self._json(cost_snapshots_patch_route[0], cost_snapshots_patch_route[1])
            
            integration_patch_route = dispatch_integration_patch_routes(
                path,
                self._read_json,
                {
                    "get_integration": get_integration,
                    "upsert_integration": upsert_integration,
                },
            )
            if integration_patch_route is not None:
                return self._json(integration_patch_route[0], integration_patch_route[1])
            return self._json(404, {"error": "Niet gevonden"})
        except ValueError as exc:
            return self._json(400, {"error": str(exc)})
        except Exception as exc:
            logger.error("500 in PATCH %s: %s", path, traceback.format_exc())
            return self._json(500, {"error": "Interne serverfout."})

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if not _check_csrf(self):
            return self._json(403, {"error": "CSRF validatie mislukt."})
        _sess = _check_api_access(self, path)
        if _sess is None:
            return
        try:
            kb_put_route = dispatch_kb_put_routes(
                path,
                self._read_json,
                {
                    "kb_tid": _kb_tid,
                    "kb_iid": _kb_iid,
                    "kb_put_meta": kb_put_meta,
                    "kb_update_asset": kb_update_asset,
                    "kb_update_vlan": kb_update_vlan,
                    "kb_update_page": kb_update_page,
                    "kb_update_contact": kb_update_contact,
                    "kb_update_password": kb_update_password,
                    "kb_update_software": kb_update_software,
                    "kb_update_domain": kb_update_domain,
                    "kb_put_m365_profile": kb_put_m365_profile,
                    "kb_update_changelog": kb_update_changelog,
                },
            )
            if kb_put_route is not None:
                return self._json(kb_put_route[0], kb_put_route[1])
            return self._json(404, {"error": "Niet gevonden"})
        except ValueError as exc:
            return self._json(400, {"error": str(exc)})
        except Exception as exc:
            logger.error("500 in PUT %s: %s", path, traceback.format_exc())
            return self._json(500, {"error": "Interne serverfout."})


def run(host: str = "127.0.0.1", port: int = 8787) -> None:
    ensure_dirs()
    init_db()
    ensure_admin_user()
    if not WEB_DIR.exists():
        raise SystemExit(f"Web folder not found: {WEB_DIR}")
    print(f"Platform dir: {PLATFORM_DIR}")
    print(f"Web dir     : {WEB_DIR}")
    print(f"Storage dir : {STORAGE_DIR}")
    print(f"Open        : http://{host}:{port}")
    JOB_DISPATCHER.start()
    server = ThreadingHTTPServer((host, port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        JOB_DISPATCHER.stop()
        server.server_close()


if __name__ == "__main__":
    run(
        host=os.environ.get("M365_LOCAL_WEBAPP_HOST", "127.0.0.1"),
        port=int(os.environ.get("M365_LOCAL_WEBAPP_PORT", "8787")),
    )
