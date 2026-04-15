"""
Tenant management routes dispatcher.
Handles all /api/tenants/* and /api/onboarding/* requests.
"""

import re
import json
from urllib.parse import parse_qs


def dispatch_tenant_get_routes(path, qs, deps, sess=None):
    """
    Dispatch GET /api/tenants requests to appropriate handler.
    
    Args:
        path: Request path
        qs: Query string dict
        deps: Dependencies dict with functions (db_fetchone, list_tenants, etc)
    
    Returns:
        (status_code, response_dict) or None if route not matched
    """
    
    db_fetchone = deps.get("db_fetchone")
    list_tenants = deps.get("list_tenants")
    get_tenant_ops_summary = deps.get("get_tenant_ops_summary")
    get_tenant_auth_profile = deps.get("get_tenant_auth_profile")
    tenant_overview = deps.get("tenant_overview")
    list_runs = deps.get("list_runs")
    run_diff_for_tenant = deps.get("run_diff_for_tenant")
    list_actions = deps.get("list_actions")
    get_tenant_onboarding_status = deps.get("get_tenant_onboarding_status")
    list_subscriptions = deps.get("list_subscriptions")
    list_integrations = deps.get("list_integrations")
    
    if path == "/api/tenants":
        return (200, {"items": list_tenants(sess=sess or {})})
    
    if re.fullmatch(r"/api/tenants/[^/]+", path):
        tenant = db_fetchone("SELECT * FROM tenants WHERE id=?", (path.split("/")[3],))
        if not tenant:
            return (404, {"error": "Tenant niet gevonden", "error_code": "not_found"})
        tenant["ops_summary"] = get_tenant_ops_summary(tenant["id"])
        return (200, tenant)
    
    if re.fullmatch(r"/api/tenants/[^/]+/auth-config", path):
        # Auth check should be done in app.py before calling dispatcher
        tenant_id = path.split("/")[3]
        if not db_fetchone("SELECT id FROM tenants WHERE id=?", (tenant_id,)):
            return (404, {"error": "Tenant niet gevonden", "error_code": "not_found"})
        return (200, get_tenant_auth_profile(tenant_id, include_secret=False))
    
    if re.fullmatch(r"/api/tenants/[^/]+/overview", path):
        tenant_id = path.split("/")[3]
        return (200, tenant_overview(tenant_id))
    
    if re.fullmatch(r"/api/tenants/[^/]+/runs", path):
        tenant_id = path.split("/")[3]
        return (200, {"items": list_runs(tenant_id, 200)})
    
    if re.fullmatch(r"/api/tenants/[^/]+/runs/diff", path):
        tenant_id = path.split("/")[3]
        from_run_id = qs.get("from_run_id", [None])[0]
        to_run_id = qs.get("to_run_id", [None])[0]
        return (200, run_diff_for_tenant(tenant_id, from_run_id, to_run_id))
    
    if re.fullmatch(r"/api/tenants/[^/]+/actions", path):
        tenant_id = path.split("/")[3]
        status = qs.get("status", [None])[0]
        return (200, {"items": list_actions(tenant_id, status)})
    
    if re.fullmatch(r"/api/tenants/[^/]+/onboarding", path):
        tenant_id = path.split("/")[3]
        if not db_fetchone("SELECT id FROM tenants WHERE id=?", (tenant_id,)):
            return (404, {"error": "Tenant niet gevonden", "error_code": "not_found"})
        return (200, get_tenant_onboarding_status(tenant_id))
    
    if re.fullmatch(r"/api/tenants/[^/]+/subscriptions", path):
        tenant_id = path.split("/")[3]
        if not db_fetchone("SELECT id FROM tenants WHERE id=?", (tenant_id,)):
            return (404, {"error": "Tenant niet gevonden", "error_code": "not_found"})
        return (200, {"items": list_subscriptions(tenant_id), "tenant_id": tenant_id})
    
    if re.fullmatch(r"/api/tenants/[^/]+/integrations", path):
        tenant_id = path.split("/")[3]
        if not db_fetchone("SELECT id FROM tenants WHERE id=?", (tenant_id,)):
            return (404, {"error": "Tenant niet gevonden", "error_code": "not_found"})
        return (200, {"items": list_integrations(tenant_id=tenant_id), "tenant_id": tenant_id})
    
    return None


def dispatch_tenant_post_routes(path, sess, read_json, deps):
    """
    Dispatch POST /api/tenants requests to appropriate handler.
    
    Args:
        path: Request path
        sess: Session dict
        read_json: Function to read request body JSON
        deps: Dependencies dict with functions (create_tenant, save_tenant_auth_profile, etc)
    
    Returns:
        (status_code, response_dict) or None if route not matched
    """
    
    db_fetchone = deps.get("db_fetchone")
    create_tenant = deps.get("create_tenant")
    save_tenant_auth_profile = deps.get("save_tenant_auth_profile")
    delete_tenant = deps.get("delete_tenant")
    upsert_subscription = deps.get("upsert_subscription")
    upsert_azure_snapshot = deps.get("upsert_azure_snapshot")
    upsert_alert_snapshot = deps.get("upsert_alert_snapshot")
    upsert_cost_snapshot = deps.get("upsert_cost_snapshot")
    update_cost_snapshot = deps.get("update_cost_snapshot")
    request_onboarding_approval = deps.get("request_onboarding_approval")
    launch_onboarding_job_chain = deps.get("launch_onboarding_job_chain")
    action_requires_approval = deps.get("action_requires_approval")
    create_action_log = deps.get("create_action_log")
    session_can = deps.get("session_can")
    api_error = deps.get("api_error")
    
    if path == "/api/tenants":
        return (201, create_tenant(read_json()))
    
    if re.fullmatch(r"/api/tenants/[^/]+/auth-config", path):
        # Auth check should be done in app.py before calling dispatcher
        tenant_id = path.split("/")[3]
        return (200, save_tenant_auth_profile(tenant_id, read_json()))
    
    if re.fullmatch(r"/api/tenants/[^/]+/delete", path):
        tenant_id = path.split("/")[3]
        payload = read_json()
        mode = payload.get("mode") or "soft"
        return (200, delete_tenant(tenant_id, mode))
    
    if re.fullmatch(r"/api/tenants/[^/]+/subscriptions", path):
        # Auth check should be done in app.py (role == admin)
        tenant_id = path.split("/")[3]
        if not db_fetchone("SELECT id FROM tenants WHERE id=?", (tenant_id,)):
            return (404, {"error": "Tenant niet gevonden", "error_code": "not_found"})
        return (201, upsert_subscription(tenant_id, read_json()))
    
    if re.fullmatch(r"/api/tenants/[^/]+/azure-snapshots/[^/]+/[^/]+", path):
        parts = path.split("/")
        tid = parts[3]
        sec = parts[5]
        sub = parts[6]
        return (201, upsert_azure_snapshot(tid, sec, sub, read_json()))
    
    if re.fullmatch(r"/api/tenants/[^/]+/alert-snapshots/[^/]+", path):
        parts = path.split("/")
        tid = parts[3]
        atype = parts[5]
        return (201, upsert_alert_snapshot(tid, atype, read_json()))
    
    if re.fullmatch(r"/api/tenants/[^/]+/cost-snapshots", path):
        tid = path.split("/")[3]
        return (201, upsert_cost_snapshot(tid, read_json()))
    
    if re.fullmatch(r"/api/cost-snapshots/[^/]+", path):
        snapshot_id = path.split("/")[3]
        row = update_cost_snapshot(snapshot_id, read_json())
        return (200, row)
    
    if re.fullmatch(r"/api/onboarding/[^/]+/approval", path):
        # Auth check should be done in app.py before calling dispatcher
        tenant_id = path.split("/")[3]
        body = read_json()
        subsection = (body.get("subsection") or "workflow").strip()
        action_type = (body.get("action_type") or "").strip()
        if not action_type:
            return (400, {"error": "action_type is verplicht", "error_code": "validation_error"})
        return (201, request_onboarding_approval(
            tenant_id,
            subsection,
            action_type,
            sess.get("email", ""),
            body.get("reason") or None,
            body.get("metadata") or {},
        ))
    
    if re.fullmatch(r"/api/onboarding/[^/]+/launch-plan", path):
        # Auth check should be done in app.py before calling dispatcher
        tenant_id = path.split("/")[3]
        body = read_json()
        plan_key = (body.get("plan_key") or "").strip()
        if not plan_key:
            return (400, {"error": "plan_key is verplicht", "error_code": "validation_error"})
        
        # Check approval requirement for onboarding.plan.launch
        if action_requires_approval("onboarding.plan.launch"):
            approval_id = body.get("approval_id", "").strip()
            if not approval_id:
                return (402, {
                    "error": "Goedkeuring vereist voor deze actie",
                    "error_code": "approval_required",
                    "action_key": "onboarding.plan.launch"
                })
            appr = db_fetchone("SELECT * FROM approvals WHERE id=? AND approval_status='approved'", (approval_id,))
            if not appr:
                return (402, {
                    "error": "Goedkeuring niet goedgekeurd of niet gevonden",
                    "error_code": "approval_not_approved"
                })
            create_action_log(tenant_id, "onboarding", "launch-plan", "approval_validated", {"approval_id": approval_id})
        
        return (201, launch_onboarding_job_chain(tenant_id, plan_key, sess.get("email", "")))
    
    return None
