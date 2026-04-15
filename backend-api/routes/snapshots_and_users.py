"""
Snapshots & Capabilities Routes Dispatcher

Handles snapshot queries, capability status, and related GET operations.
Extracted from app.py for better organization and testability.
"""

import re
import json
from typing import Tuple, Dict, Any, Optional, Callable, List


def dispatch_snapshots_and_capabilities_get_routes(
    path: str,
    qs: Dict[str, list],
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    Route GET requests for snapshots and capability data.
    
    Handles:
    - GET /api/capabilities/[tenant_id] - Tenant capabilities overview
    - GET /api/capabilities/[tenant_id]/[section]/[subsection] - Specific capability status
    - GET /api/tenants/[tenant_id]/assessment/snapshot - Latest assessment snapshot payload
    - GET /api/tenants/[tenant_id]/snapshots - List M365 snapshots with filtering
    - GET /api/tenants/[tenant_id]/snapshots/[section]/[subsection] - Specific M365 snapshot
    - GET /api/tenants/[tenant_id]/azure-snapshots - List Azure resource snapshots
    - GET /api/tenants/[tenant_id]/alert-snapshots - List alert snapshots
    - GET /api/tenants/[tenant_id]/cost-snapshots - List cost snapshots
    - GET /api/cost-snapshots/[snapshot_id] - Specific cost snapshot detail
    
    Args:
        path: Request path
        qs: Query string parameters
        deps: Dependencies dict with:
            - get_tenant_capabilities: Function to get tenant capabilities
            - build_capability_status: Function to build capability status
            - latest_assessment_snapshot_for_tenant: Function to fetch latest assessment snapshot
            - db_fetchone: Database single-row fetch
            - db_fetchall: Database multi-row fetch
            - list_azure_snapshots: Function to list Azure snapshots
            - list_alert_snapshots: Function to list alert snapshots
            - list_cost_snapshots: Function to list cost snapshots
            - get_cost_snapshot: Function to get cost snapshot detail
    
    Returns:
        (http_status, response_dict) or None if route doesn't match
    """
    # Extract injected dependencies
    get_tenant_capabilities = deps.get("get_tenant_capabilities")
    build_capability_status = deps.get("build_capability_status")
    latest_assessment_snapshot_for_tenant = deps.get("latest_assessment_snapshot_for_tenant")
    db_fetchone = deps.get("db_fetchone")
    db_fetchall = deps.get("db_fetchall")
    list_azure_snapshots = deps.get("list_azure_snapshots")
    list_alert_snapshots = deps.get("list_alert_snapshots")
    list_cost_snapshots = deps.get("list_cost_snapshots")
    get_cost_snapshot = deps.get("get_cost_snapshot")
    
    # GET /api/capabilities/[tenant_id] - Tenant capabilities overview
    if re.fullmatch(r"/api/capabilities/[^/]+", path):
        tenant_id = path.split("/")[3]
        return (200, get_tenant_capabilities(tenant_id))
    
    # GET /api/capabilities/[tenant_id]/[section]/[subsection] - Specific capability status
    if re.fullmatch(r"/api/capabilities/[^/]+/[^/]+/[^/]+", path):
        parts = path.split("/")
        tenant_id, section, subsection = parts[3], parts[4], parts[5]
        return (200, {"ok": True, "capability": build_capability_status(tenant_id, section, subsection)})

    # GET /api/tenants/[tenant_id]/assessment/snapshot - Backward-compatible assessment fallback payload
    if re.fullmatch(r"/api/tenants/[^/]+/assessment/snapshot", path):
        tenant_id = path.split("/")[3]
        if not db_fetchone("SELECT id FROM tenants WHERE id=?", (tenant_id,)):
            return (404, {"error": "Tenant niet gevonden", "error_code": "not_found"})
        snapshot = latest_assessment_snapshot_for_tenant(tenant_id) if latest_assessment_snapshot_for_tenant else {}
        if not snapshot:
            return (404, {"ok": False, "error": "Geen assessment snapshot gevonden", "error_code": "not_found"})
        return (200, {"ok": True, "tenant_id": tenant_id, "data": snapshot})
    
    # GET /api/tenants/[tenant_id]/snapshots - List M365 snapshots with filtering
    if re.fullmatch(r"/api/tenants/[^/]+/snapshots", path):
        tenant_id = path.split("/")[3]
        
        # Verify tenant exists
        if not db_fetchone("SELECT id FROM tenants WHERE id=?", (tenant_id,)):
            return (404, {"error": "Tenant niet gevonden", "error_code": "not_found"})
        
        # Build query with optional filters
        section_f = qs.get("section", [None])[0]
        subsection_f = qs.get("subsection", [None])[0]
        where = ["tenant_id=?"]
        params: List[Any] = [tenant_id]
        
        if section_f:
            where.append("section=?")
            params.append(section_f.lower())
        if subsection_f:
            where.append("subsection=?")
            params.append(subsection_f.lower())
        
        rows = db_fetchall(
            f"SELECT id, tenant_id, section, subsection, source_type, generated_at, summary_json, assessment_run_id "
            f"FROM m365_snapshots WHERE {' AND '.join(where)} ORDER BY generated_at DESC LIMIT 200",
            tuple(params),
        )
        
        return (200, {"items": rows, "tenant_id": tenant_id})
    
    # GET /api/tenants/[tenant_id]/snapshots/[section]/[subsection] - Specific M365 snapshot
    if re.fullmatch(r"/api/tenants/[^/]+/snapshots/[^/]+/[^/]+", path):
        parts = path.split("/")
        tenant_id = parts[3]
        section_p = parts[5].lower()
        subsection_p = parts[6].lower()
        
        row = db_fetchone(
            "SELECT * FROM m365_snapshots WHERE tenant_id=? AND section=? AND subsection=? "
            "ORDER BY generated_at DESC LIMIT 1",
            (tenant_id, section_p, subsection_p),
        )
        
        if not row:
            return (404, {"error": "Snapshot niet gevonden", "error_code": "not_found"})
        
        # Parse data_json inline for convenience
        if row.get("data_json"):
            try:
                row = dict(row)
                row["data"] = json.loads(row.pop("data_json"))
            except Exception:
                pass
        
        return (200, row)
    
    # GET /api/tenants/[tenant_id]/azure-snapshots - List Azure resource snapshots
    if re.fullmatch(r"/api/tenants/[^/]+/azure-snapshots", path):
        tid = path.split("/")[3]
        sub_f = qs.get("subscription_id", [None])[0]
        return (200, {"items": list_azure_snapshots(tid, sub_f), "tenant_id": tid})
    
    # GET /api/tenants/[tenant_id]/alert-snapshots - List alert snapshots
    if re.fullmatch(r"/api/tenants/[^/]+/alert-snapshots", path):
        tid = path.split("/")[3]
        atype_f = qs.get("alert_type", [None])[0]
        return (200, {"items": list_alert_snapshots(tid, atype_f), "tenant_id": tid})
    
    # GET /api/tenants/[tenant_id]/cost-snapshots - List cost snapshots
    if re.fullmatch(r"/api/tenants/[^/]+/cost-snapshots", path):
        tid = path.split("/")[3]
        sub_f = qs.get("subscription_id", [None])[0]
        return (200, {"items": list_cost_snapshots(tid, sub_f), "tenant_id": tid})
    
    # GET /api/cost-snapshots/[snapshot_id] - Specific cost snapshot detail
    if re.fullmatch(r"/api/cost-snapshots/[^/]+", path):
        snapshot_id = path.split("/")[3]
        row = get_cost_snapshot(snapshot_id)
        if not row:
            return (404, {"error": "Kostenrecord niet gevonden", "error_code": "not_found"})
        return (200, row)
    
    # Route not matched
    return None


def dispatch_users_get_routes(
    path: str,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    Route GET requests for user management operations.
    
    Handles:
    - GET /api/users - List all users
    - GET /api/users/[user_id] - Get specific user
    
    Args:
        path: Request path
        deps: Dependencies dict with:
            - list_users: Function to list all users
            - get_user: Function to get specific user
    
    Returns:
        (http_status, response_dict) or None if route doesn't match
    """
    # Extract injected dependencies
    list_users = deps.get("list_users")
    get_user = deps.get("get_user")
    
    # GET /api/users - List all users
    if path == "/api/users":
        return (200, {"items": list_users()})
    
    # GET /api/users/[user_id] - Get specific user
    if re.fullmatch(r"/api/users/[^/]+", path):
        u = get_user(path.split("/")[3])
        if not u:
            return (404, {"error": "Gebruiker niet gevonden"})
        return (200, u)
    
    # Route not matched
    return None
