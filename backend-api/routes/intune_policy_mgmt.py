"""
Intune Policy Management routes — Browse, Export, Import, Compare, Assignments.

All routes are gated by service_access_policies with service_key="intune_policy_mgmt".
Read operations require can_read=1, write operations require can_write=1,
import/bulk-copy/delete require can_approve=1.

Authentication flow:
  - Reads: Python Graph API (client_credentials) via graph_service.py
  - Writes (import/bulk-copy): delegated to PowerShell via run_intune_ps
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from services.graph_service import (
    OBJECT_TYPE_ENDPOINTS,
    get_summary,
    get_token,
    list_all_assignments,
    list_object_assignments,
    list_objects,
    get_object as graph_get_object,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ts() -> str:
    """Compact timestamp for file names."""
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


def _get_customer_id(tenant_id: str, db_fetchone: Any) -> Optional[str]:
    row = db_fetchone("SELECT customer_id FROM tenants WHERE id=?", (tenant_id,))
    return row.get("customer_id") if row else None


def _check_read(sess: Dict, tenant_id: str, db_fetchone: Any, session_can_service: Any) -> Optional[tuple]:
    """Returns (403, error_dict) if access denied, else None."""
    if str(sess.get("role") or "") == "admin":
        return None
    customer_id = _get_customer_id(tenant_id, db_fetchone)
    if not customer_id:
        return (404, {"error": "Tenant niet gevonden"})
    if not session_can_service(sess, customer_id, "intune_policy_mgmt", "read"):
        return (403, {"error": "Geen toegang tot Intune Policy Beheer voor deze tenant.", "error_code": "forbidden"})
    return None


def _check_write(sess: Dict, tenant_id: str, db_fetchone: Any, session_can_service: Any) -> Optional[tuple]:
    if str(sess.get("role") or "") == "admin":
        return None
    customer_id = _get_customer_id(tenant_id, db_fetchone)
    if not customer_id:
        return (404, {"error": "Tenant niet gevonden"})
    if not session_can_service(sess, customer_id, "intune_policy_mgmt", "write"):
        return (403, {"error": "Schrijfrechten vereist voor deze actie.", "error_code": "forbidden"})
    return None


def _check_approve(sess: Dict, tenant_id: str, db_fetchone: Any, session_can_service: Any) -> Optional[tuple]:
    if str(sess.get("role") or "") == "admin":
        return None
    customer_id = _get_customer_id(tenant_id, db_fetchone)
    if not customer_id:
        return (404, {"error": "Tenant niet gevonden"})
    if not session_can_service(sess, customer_id, "intune_policy_mgmt", "approve"):
        return (403, {"error": "Goedkeuringsrechten vereist voor import/bulk-operaties.", "error_code": "forbidden"})
    return None


def _get_auth(tenant_id: str, get_tenant_auth_profile: Any) -> Dict[str, str]:
    return get_tenant_auth_profile(tenant_id, include_secret=True)


def _diff_objects(source_items: List[Dict], target_items: List[Dict]) -> List[Dict]:
    """
    Server-side diff: compare two lists by displayName.
    Returns list of diff entries per object:
      status: "identical" | "modified" | "source_only" | "target_only"
    """
    source_map = {
        (item.get("displayName") or item.get("name") or item.get("id", "")): item
        for item in source_items
    }
    target_map = {
        (item.get("displayName") or item.get("name") or item.get("id", "")): item
        for item in target_items
    }

    results = []
    all_keys = sorted(set(source_map) | set(target_map))
    for key in all_keys:
        s = source_map.get(key)
        t = target_map.get(key)
        if s and t:
            # Simple change detection: compare a selection of scalar fields
            changed_fields = []
            for field in ("description", "state", "lastModifiedDateTime", "version"):
                sv = s.get(field)
                tv = t.get(field)
                if sv != tv:
                    changed_fields.append({"field": field, "source": sv, "target": tv})
            status = "modified" if changed_fields else "identical"
            results.append({
                "displayName": key,
                "status": status,
                "changes": changed_fields,
                "source_id": s.get("id"),
                "target_id": t.get("id"),
            })
        elif s:
            results.append({"displayName": key, "status": "source_only", "source_id": s.get("id"), "target_id": None, "changes": []})
        else:
            results.append({"displayName": key, "status": "target_only", "source_id": None, "target_id": t.get("id") if t else None, "changes": []})
    return results


# ─────────────────────────────────────────────────────────────
# GET dispatcher
# ─────────────────────────────────────────────────────────────

def dispatch_intune_policy_get_routes(path: str, qs: Dict, sess: Dict, deps: Dict):
    """
    Returns (status_code, payload) or None if no route matched.
    """
    db_fetchone = deps["db_fetchone"]
    session_can_service = deps["session_can_service"]
    get_tenant_auth_profile = deps["get_tenant_auth_profile"]

    # GET /api/intune-policy/{tenant_id}/summary
    if re.fullmatch(r"/api/intune-policy/[^/]+/summary", path):
        tenant_id = path.split("/")[3]
        denied = _check_read(sess, tenant_id, db_fetchone, session_can_service)
        if denied:
            return denied
        try:
            auth = _get_auth(tenant_id, get_tenant_auth_profile)
            counts = get_summary(auth)
            return (200, {"ok": True, "tenant_id": tenant_id, "counts": counts, "retrieved_at": _now_iso()})
        except ValueError as exc:
            return (200, {"ok": False, "error": str(exc), "counts": {}, "tenant_id": tenant_id})
        except Exception as exc:
            return (502, {"ok": False, "error": f"Graph API onbereikbaar: {exc}"})

    # GET /api/intune-policy/{tenant_id}/objects?type=...
    if re.fullmatch(r"/api/intune-policy/[^/]+/objects", path):
        tenant_id = path.split("/")[3]
        obj_type = (qs.get("type", [None])[0] or "").strip()
        denied = _check_read(sess, tenant_id, db_fetchone, session_can_service)
        if denied:
            return denied
        if not obj_type or obj_type not in OBJECT_TYPE_ENDPOINTS:
            return (400, {"error": f"Onbekend of ontbrekend type. Kies uit: {', '.join(OBJECT_TYPE_ENDPOINTS)}"})
        try:
            auth = _get_auth(tenant_id, get_tenant_auth_profile)
            items = list_objects(auth, obj_type)
            return (200, {"ok": True, "type": obj_type, "items": items, "count": len(items)})
        except ValueError as exc:
            return (200, {"ok": False, "type": obj_type, "error": str(exc), "items": []})
        except Exception as exc:
            return (502, {"ok": False, "error": str(exc)})

    # GET /api/intune-policy/{tenant_id}/objects/{id}?type=...
    if re.fullmatch(r"/api/intune-policy/[^/]+/objects/[^/]+", path):
        parts = path.split("/")
        tenant_id, obj_id = parts[3], parts[5]
        obj_type = (qs.get("type", [None])[0] or "").strip()
        denied = _check_read(sess, tenant_id, db_fetchone, session_can_service)
        if denied:
            return denied
        if not obj_type or obj_type not in OBJECT_TYPE_ENDPOINTS:
            return (400, {"error": "type parameter vereist"})
        try:
            auth = _get_auth(tenant_id, get_tenant_auth_profile)
            obj = graph_get_object(auth, obj_type, obj_id)
            assignments = list_object_assignments(auth, obj_type, obj_id)
            return (200, {"ok": True, "type": obj_type, "object": obj, "assignments": assignments})
        except Exception as exc:
            return (502, {"ok": False, "error": str(exc)})

    # GET /api/intune-policy/{tenant_id}/assignments
    if re.fullmatch(r"/api/intune-policy/[^/]+/assignments", path):
        tenant_id = path.split("/")[3]
        denied = _check_read(sess, tenant_id, db_fetchone, session_can_service)
        if denied:
            return denied
        try:
            auth = _get_auth(tenant_id, get_tenant_auth_profile)
            group_map = list_all_assignments(auth)
            return (200, {"ok": True, "assignments_by_group": group_map, "group_count": len(group_map)})
        except ValueError as exc:
            return (200, {"ok": False, "error": str(exc), "assignments_by_group": {}})
        except Exception as exc:
            return (502, {"ok": False, "error": str(exc)})

    # GET /api/intune-policy/{tenant_id}/export?types=compliance,scripts,...
    if re.fullmatch(r"/api/intune-policy/[^/]+/export", path):
        tenant_id = path.split("/")[3]
        denied = _check_read(sess, tenant_id, db_fetchone, session_can_service)
        if denied:
            return denied
        types_param = (qs.get("types", [None])[0] or "").strip()
        requested_types = [t.strip() for t in types_param.split(",") if t.strip()] if types_param else list(OBJECT_TYPE_ENDPOINTS)
        invalid = [t for t in requested_types if t not in OBJECT_TYPE_ENDPOINTS]
        if invalid:
            return (400, {"error": f"Onbekende types: {', '.join(invalid)}"})
        try:
            auth = _get_auth(tenant_id, get_tenant_auth_profile)
            ts = _ts()
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                manifest = {"tenant_id": tenant_id, "exported_at": _now_iso(), "types": {}}
                for obj_type in requested_types:
                    try:
                        items = list_objects(auth, obj_type)
                        filename = f"{obj_type}_{ts}.json"
                        zf.writestr(filename, json.dumps(items, indent=2, ensure_ascii=False))
                        manifest["types"][obj_type] = {"count": len(items), "file": filename}
                    except Exception as exc:
                        manifest["types"][obj_type] = {"error": str(exc)}
                zf.writestr("manifest.json", json.dumps(manifest, indent=2))
            zip_bytes = buf.getvalue()
            # Return as base64-encoded payload; frontend will trigger download
            import base64
            return (200, {
                "ok": True,
                "filename": f"intune_export_{tenant_id}_{ts}.zip",
                "content_type": "application/zip",
                "data_base64": base64.b64encode(zip_bytes).decode(),
                "manifest": manifest,
            })
        except ValueError as exc:
            return (200, {"ok": False, "error": str(exc)})
        except Exception as exc:
            return (502, {"ok": False, "error": str(exc)})

    return None


# ─────────────────────────────────────────────────────────────
# POST dispatcher
# ─────────────────────────────────────────────────────────────

def dispatch_intune_policy_post_routes(path: str, sess: Dict, read_json, deps: Dict):
    """
    Returns (status_code, payload) or None if no route matched.
    """
    db_fetchone = deps["db_fetchone"]
    session_can_service = deps["session_can_service"]
    get_tenant_auth_profile = deps["get_tenant_auth_profile"]
    run_intune_ps = deps.get("run_intune_ps")

    # POST /api/intune-policy/compare
    if path == "/api/intune-policy/compare":
        if str(sess.get("role") or "") != "admin":
            # Need read on source tenant at minimum; allow if admin or at least one of the two tenants is accessible
            pass  # Full check happens per tenant below
        payload = read_json()
        source_tid = (payload.get("source_tenant_id") or "").strip()
        target_tid = (payload.get("target_tenant_id") or "").strip()
        types_param = payload.get("types") or list(OBJECT_TYPE_ENDPOINTS)
        if isinstance(types_param, str):
            types_param = [t.strip() for t in types_param.split(",") if t.strip()]

        if not source_tid or not target_tid:
            return (400, {"error": "source_tenant_id en target_tenant_id zijn vereist"})
        invalid = [t for t in types_param if t not in OBJECT_TYPE_ENDPOINTS]
        if invalid:
            return (400, {"error": f"Onbekende types: {', '.join(invalid)}"})

        denied = _check_read(sess, source_tid, db_fetchone, session_can_service)
        if denied:
            return denied

        try:
            src_auth = _get_auth(source_tid, get_tenant_auth_profile)
            tgt_auth = _get_auth(target_tid, get_tenant_auth_profile)
            results: Dict[str, Any] = {}
            for obj_type in types_param:
                try:
                    src_items = list_objects(src_auth, obj_type)
                    tgt_items = list_objects(tgt_auth, obj_type)
                    results[obj_type] = {
                        "diff": _diff_objects(src_items, tgt_items),
                        "source_count": len(src_items),
                        "target_count": len(tgt_items),
                    }
                except Exception as exc:
                    results[obj_type] = {"error": str(exc)}
            return (200, {
                "ok": True,
                "source_tenant_id": source_tid,
                "target_tenant_id": target_tid,
                "compared_at": _now_iso(),
                "results": results,
            })
        except ValueError as exc:
            return (200, {"ok": False, "error": str(exc)})
        except Exception as exc:
            return (502, {"ok": False, "error": str(exc)})

    # POST /api/intune-policy/{tenant_id}/import
    if re.fullmatch(r"/api/intune-policy/[^/]+/import", path):
        tenant_id = path.split("/")[3]
        denied = _check_approve(sess, tenant_id, db_fetchone, session_can_service)
        if denied:
            return denied
        payload = read_json()
        dry_run = bool(payload.pop("dry_run", False))
        if not run_intune_ps:
            return (501, {"error": "Import vereist een geconfigureerde PowerShell-brug (run_intune_ps)."})
        try:
            result = run_intune_ps(
                tenant_id,
                "import-policies",
                payload,
                dry_run,
                executed_by=sess.get("email", "admin"),
            )
            if not result.get("ok"):
                return (502, {"error": result.get("error", "Import mislukt via PowerShell.")})
            return (200, result)
        except Exception as exc:
            return (502, {"ok": False, "error": str(exc)})

    # POST /api/intune-policy/{tenant_id}/bulk-copy
    if re.fullmatch(r"/api/intune-policy/[^/]+/bulk-copy", path):
        tenant_id = path.split("/")[3]
        denied = _check_approve(sess, tenant_id, db_fetchone, session_can_service)
        if denied:
            return denied
        payload = read_json()
        dry_run = bool(payload.pop("dry_run", False))
        if not run_intune_ps:
            return (501, {"error": "Bulk-copy vereist een geconfigureerde PowerShell-brug (run_intune_ps)."})
        try:
            result = run_intune_ps(
                tenant_id,
                "bulk-copy-policies",
                payload,
                dry_run,
                executed_by=sess.get("email", "admin"),
            )
            if not result.get("ok"):
                return (502, {"error": result.get("error", "Bulk-copy mislukt.")})
            return (200, result)
        except Exception as exc:
            return (502, {"ok": False, "error": str(exc)})

    return None


# ─────────────────────────────────────────────────────────────
# DELETE dispatcher
# ─────────────────────────────────────────────────────────────

def dispatch_intune_policy_delete_routes(path: str, sess: Dict, qs: Dict, deps: Dict):
    """
    Returns (status_code, payload) or None if no route matched.
    """
    db_fetchone = deps["db_fetchone"]
    session_can_service = deps["session_can_service"]
    get_tenant_auth_profile = deps["get_tenant_auth_profile"]
    run_intune_ps = deps.get("run_intune_ps")

    # DELETE /api/intune-policy/{tenant_id}/objects/{id}?type=...
    if re.fullmatch(r"/api/intune-policy/[^/]+/objects/[^/]+", path):
        parts = path.split("/")
        tenant_id, obj_id = parts[3], parts[5]
        obj_type = (qs.get("type", [None])[0] or "").strip()
        denied = _check_write(sess, tenant_id, db_fetchone, session_can_service)
        if denied:
            return denied
        if not obj_type:
            return (400, {"error": "type parameter vereist"})
        if not run_intune_ps:
            return (501, {"error": "Delete vereist een geconfigureerde PowerShell-brug (run_intune_ps)."})
        try:
            result = run_intune_ps(
                tenant_id,
                "delete-policy",
                {"object_type": obj_type, "object_id": obj_id},
                False,
                executed_by=sess.get("email", "admin"),
            )
            if not result.get("ok"):
                return (502, {"error": result.get("error", "Verwijderen mislukt.")})
            return (200, result)
        except Exception as exc:
            return (502, {"ok": False, "error": str(exc)})

    return None
