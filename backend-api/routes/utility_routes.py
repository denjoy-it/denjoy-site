"""
Utility & System Routes Dispatcher

Handles system-level routes like health checks, auth verification, config, etc.
Extracted from app.py for better organization and testability.
"""

import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Tuple, Dict, Any, Optional, Callable


def dispatch_utility_get_routes(
    path: str,
    session: Optional[Dict[str, Any]],
    deps: Dict[str, Any],
    qs: Optional[Dict[str, list]] = None,
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    Route GET requests for utility and system endpoints.
    
    Handles:
    - GET /api/auth/verify - Session verification  
    - GET /api/health - Health check
    - GET /api/auth/msal-config - MSAL configuration
    - GET /api/auth/csrf-token - CSRF token generation
    - GET /api/config - Load app configuration
    - GET /api/portal-roles - List portal roles
    - GET /api/user-access - User access details
    - GET /api/audit - Audit log retrieval
    - GET /api/msp/aggregate - MSP aggregate data
    - GET /api/msp/control-center - MSP control center
    - GET /api/msp/actions - MSP actions
    
    Args:
        path: Request path
        session: Session data (user, email, role) or None
        deps: Dependencies dict with various functions
        qs: Query string parameters dict
    
    Returns:
        (http_status, response_dict) or None if route doesn't match
    """
    if qs is None:
        qs = {}
    # Extract injected dependencies
    load_config = deps.get("load_config")
    _build_session_access_profile = deps.get("_build_session_access_profile")
    list_portal_roles = deps.get("list_portal_roles")
    db_fetchall = deps.get("db_fetchall")
    db_fetchone = deps.get("db_fetchone")
    get_tenant_onboarding_status = deps.get("get_tenant_onboarding_status")
    get_tenant_ops_summary = deps.get("get_tenant_ops_summary")
    _tenant_job_summary = deps.get("_tenant_job_summary")
    list_msp_aggregates = deps.get("list_msp_aggregates")
    list_mcp_server_status = deps.get("list_mcp_server_status")
    list_actions = deps.get("list_actions")
    now_iso = deps.get("now_iso")
    PLATFORM_DIR = deps.get("PLATFORM_DIR")
    list_audit_logs = deps.get("list_audit_logs")
    _latest_completed_run_for_tenant = deps.get("_latest_completed_run_for_tenant")
    get_msp_control_center_payload = deps.get("get_msp_control_center_payload")
    list_msp_actions = deps.get("list_msp_actions")
    db_fetchone = deps.get("db_fetchone")
    
    # GET /api/auth/verify - Session verification
    if path == "/api/auth/verify":
        if session:
            access = _build_session_access_profile(session)
            user = db_fetchone("SELECT linked_tenant_id FROM users WHERE lower(email)=?", (str(session.get("email") or "").strip().lower(),)) if db_fetchone else None
            return (200, {
                "ok": True,
                "role": session["role"],
                "email": session["email"],
                "display_name": session["display_name"],
                "linked_tenant_id": (user or {}).get("linked_tenant_id"),
                "portal_role_keys": access["portal_role_keys"],
                "access": {
                    "msp_admin": access["msp_admin"],
                    "msp_power": access["msp_power"],
                    "tenant_selector": access.get("tenant_selector_access", False),
                    "kb": access["kb_access"],
                    "kb_write": access["kb_write"],
                },
            })
        return (401, {"ok": False, "error": "Niet ingelogd"})
    
    # GET /api/health - Health check
    if path == "/api/health":
        return (200, {"ok": True})
    
    # GET /api/auth/msal-config - MSAL configuration (requires active session)
    if path == "/api/auth/msal-config":
        if not session:
            return (401, {"ok": False, "error": "Niet ingelogd"})
        cfg = load_config()
        return (200, {
            "auth_client_id": cfg.get("auth_client_id", ""),
            "auth_tenant_id": cfg.get("auth_tenant_id", ""),
        })
    
    # GET /api/auth/csrf-token - CSRF token generation (unique token, not session reuse)
    if path == "/api/auth/csrf-token":
        return (200, {"csrf_token": secrets.token_urlsafe(32)})
    
    # GET /api/config - Load app configuration
    if path == "/api/config":
        return (200, load_config())
    
    # GET /api/portal-roles - List portal roles
    if path == "/api/portal-roles":
        return (200, {"items": list_portal_roles()})
    
    # GET /api/user-access - User access details  
    if path == "/api/user-access":
        rows = db_fetchall(
            """
            SELECT
                uca.id,
                uca.portal_user_id,
                uca.customer_id,
                uca.portal_role_id,
                uca.scope,
                uca.granted_by,
                uca.granted_at,
                uca.expires_at,
                pr.role_key,
                pr.label AS portal_role_label
            FROM user_customer_access uca
            LEFT JOIN portal_roles pr ON pr.id = uca.portal_role_id
            ORDER BY uca.granted_at DESC
            LIMIT 250
            """
        )
        return (200, {"items": rows})
    
    # GET /api/audit - Audit log retrieval (requires authenticated admin session)
    if path == "/api/audit":
        if not session:
            return (401, {"ok": False, "error": "Niet ingelogd"})
        if session.get("role") not in ("admin", "god"):
            return (403, {"ok": False, "error": "Onvoldoende rechten.", "error_code": "forbidden"})
        logs = list_audit_logs(
            tenant_id=qs.get("tenant_id", [None])[0],
            user_email=qs.get("user_email", [None])[0],
            action=qs.get("action", [None])[0],
            date_from=qs.get("from", [None])[0],
            date_to=qs.get("to", [None])[0],
            limit=int(qs.get("limit", ["200"])[0]),
        )
        return (200, {"items": logs, "count": len(logs), "_generated_at": now_iso()})
    
    # GET /api/msp/aggregate - MSP aggregate data (optional tenant_id for single-tenant view)
    if path == "/api/msp/aggregate":
        tenant_id = qs.get("tenant_id", [None])[0] if qs else None
        if tenant_id:
            rows = db_fetchall("SELECT id FROM tenants WHERE is_active=1 AND id=?", (tenant_id,))
        else:
            rows = db_fetchall("SELECT id FROM tenants WHERE is_active=1")
        total = len(rows)
        critical_tenants, no_assess, scores = 0, 0, []
        ready_tenants, auth_ready_tenants = 0, 0
        pending_jobs, failed_jobs = 0, 0
        
        for r in rows:
            tid_agg = r["id"]
            onboarding = get_tenant_onboarding_status(tid_agg)
            jobs = _tenant_job_summary(tid_agg)
            
            if onboarding.get("completion_pct", 0) >= 75:
                ready_tenants += 1
            if onboarding.get("auth_ready"):
                auth_ready_tenants += 1
            
            pending_jobs += int(jobs.get("pending") or 0) + int(jobs.get("running") or 0)
            failed_jobs += int(jobs.get("failed") or 0)
            
            run = _latest_completed_run_for_tenant(tid_agg)
            if not run:
                no_assess += 1
                continue
            if (run.get("critical_count") or 0) > 0:
                critical_tenants += 1
            sc = run.get("score_overall")
            if sc is not None:
                scores.append(float(sc))
        
        avg_score = round(sum(scores) / len(scores), 1) if scores else None
        
        # Tenants zonder assessment in afgelopen 30 dagen
        threshold = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        stale_rows = db_fetchall(
            "SELECT id FROM tenants WHERE is_active=1 AND id NOT IN "
            "(SELECT tenant_id FROM assessment_runs WHERE status='completed' AND completed_at>=?)",
            (threshold,),
        )
        stale_count = len(stale_rows)
        
        return (200, {
            "total_tenants": total,
            "tenants_with_critical": critical_tenants,
            "tenants_no_assessment": no_assess,
            "tenants_stale_assessment": stale_count,
            "tenants_ready": ready_tenants,
            "tenants_auth_ready": auth_ready_tenants,
            "jobs_pending_or_running": pending_jobs,
            "jobs_failed": failed_jobs,
            "avg_score": avg_score,
            "assessed_count": len(scores),
        })
    
    # GET /api/msp/control-center - MSP control center (optional tenant_id for single-tenant view)
    if path == "/api/msp/control-center":
        # Permission check
        if session:
            if not (session.get("role") == "admin" or (session.get("_access") or {}).get("msp_admin")):
                return (403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"})
        tenant_id = qs.get("tenant_id", [None])[0] if qs else None
        return (200, get_msp_control_center_payload(tenant_id=tenant_id))

    # GET /api/msp/security-exceptions - Kritieke security bevindingen cross-tenant
    if path == "/api/msp/security-exceptions":
        if session:
            if not (session.get("role") == "admin" or (session.get("_access") or {}).get("msp_admin")):
                return (403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"})
        limit = int(qs.get("limit", ["40"])[0])
        rows = db_fetchall(
            """
            SELECT sf.tenant_id, sf.control, sf.title, sf.status, sf.finding,
                   sf.impact, sf.recommendation, sf.scanned_at,
                   t.tenant_name AS tenant_name
            FROM scan_findings sf
            LEFT JOIN tenants t ON t.id = sf.tenant_id
            WHERE sf.status IN ('critical', 'warning')
            ORDER BY
                CASE sf.status WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                sf.scanned_at DESC
            LIMIT ?
            """,
            (limit,),
        ) if callable(db_fetchall) else []
        exceptions = [
            {
                "tenant_id": row.get("tenant_id", ""),
                "tenant_name": row.get("tenant_name") or row.get("tenant_id", ""),
                "control": row.get("control", ""),
                "title": row.get("title", ""),
                "status": row.get("status", "info"),
                "finding": row.get("finding", ""),
                "impact": row.get("impact", "low"),
                "recommendation": row.get("recommendation", ""),
                "scanned_at": row.get("scanned_at", ""),
            }
            for row in (rows or [])
        ]
        return (200, {"ok": True, "items": exceptions, "total": len(exceptions)})
    
    # GET /api/msp/actions - MSP actions
    if path == "/api/msp/actions":
        # Permission check
        if session:
            if not (session.get("role") == "admin" or (session.get("_access") or {}).get("msp_admin")):
                return (403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"})
        status = qs.get("status", [None])[0]
        owner = qs.get("owner", [None])[0]
        limit = int(qs.get("limit", ["150"])[0])
        return (200, {"items": list_msp_actions(status=status, owner=owner, limit=limit)})
    
    # Route not matched
    return None
