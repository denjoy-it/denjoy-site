"""Incremental API route extractors."""

from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple


def dispatch_customer_get_routes(
    path: str,
    qs: Dict[str, Any],
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Handle GET /api/customers* routes. Returns (status, payload) or None."""
    list_customers = deps["list_customers"]
    get_customer = deps["get_customer"]
    customer_exists = deps["customer_exists"]
    list_customer_services = deps["list_customer_services"]
    list_tenants_for_customer = deps["list_tenants_for_customer"]
    get_customer_health = deps["get_customer_health"]
    get_customer_onboarding_summary = deps["get_customer_onboarding_summary"]
    get_tenant_onboarding_status = deps["get_tenant_onboarding_status"]
    get_customer_finance_summary = deps["get_customer_finance_summary"]
    get_customer_overview = deps["get_customer_overview"]
    list_subscriptions = deps["list_subscriptions"]
    list_user_customer_access = deps["list_user_customer_access"]
    api_error = deps["api_error"]

    if path == "/api/customers":
        status_filter = qs.get("status", [None])[0]
        return 200, {"items": list_customers(status_filter)}

    if re.fullmatch(r"/api/customers/[^/]+/tenants", path):
        cid = path.split("/")[3]
        if not customer_exists(cid):
            http_s, pl = api_error("not_found", "Klant niet gevonden", 404)
            return http_s, pl
        tenants = list_tenants_for_customer(cid)
        return 200, {"items": tenants, "customer_id": cid}

    if re.fullmatch(r"/api/customers/[^/]+", path):
        customer = get_customer(path.split("/")[3])
        if not customer:
            http_s, pl = api_error("not_found", "Klant niet gevonden", 404)
            return http_s, pl
        return 200, customer

    if re.fullmatch(r"/api/customers/[^/]+/services", path):
        cid = path.split("/")[3]
        if not customer_exists(cid):
            http_s, pl = api_error("not_found", "Klant niet gevonden", 404)
            return http_s, pl
        services = list_customer_services(cid)
        return 200, {"items": services, "customer_id": cid}

    if re.fullmatch(r"/api/customers/[^/]+/health", path):
        cid = path.split("/")[3]
        health = get_customer_health(cid)
        if not health:
            http_s, pl = api_error("not_found", "Klant niet gevonden", 404)
            return http_s, pl
        return 200, health

    if re.fullmatch(r"/api/customers/[^/]+/onboarding", path):
        cid = path.split("/")[3]
        if not customer_exists(cid):
            http_s, pl = api_error("not_found", "Klant niet gevonden", 404)
            return http_s, pl
        tenants = list_tenants_for_customer(cid)
        statuses = [get_tenant_onboarding_status(t["id"]) for t in tenants]
        return 200, {
            "customer_id": cid,
            "summary": get_customer_onboarding_summary(cid),
            "tenants": statuses,
        }

    if re.fullmatch(r"/api/customers/[^/]+/finance", path):
        cid = path.split("/")[3]
        if not customer_exists(cid):
            http_s, pl = api_error("not_found", "Klant niet gevonden", 404)
            return http_s, pl
        return 200, get_customer_finance_summary(cid)

    if re.fullmatch(r"/api/customers/[^/]+/overview", path):
        cid = path.split("/")[3]
        if not customer_exists(cid):
            http_s, pl = api_error("not_found", "Klant niet gevonden", 404)
            return http_s, pl
        return 200, get_customer_overview(cid)

    if re.fullmatch(r"/api/customers/[^/]+/subscriptions", path):
        cid = path.split("/")[3]
        if not customer_exists(cid):
            http_s, pl = api_error("not_found", "Klant niet gevonden", 404)
            return http_s, pl
        tenants = list_tenants_for_customer(cid)
        all_subs = []
        for tenant in tenants:
            all_subs.extend(list_subscriptions(tenant["id"]))
        return 200, {"items": all_subs, "customer_id": cid}

    if re.fullmatch(r"/api/customers/[^/]+/access", path):
        cid = path.split("/")[3]
        if not customer_exists(cid):
            http_s, pl = api_error("not_found", "Klant niet gevonden", 404)
            return http_s, pl
        return 200, {"items": list_user_customer_access(customer_id=cid)}

    if re.fullmatch(r"/api/customers/[^/]+/assessments", path):
        cid = path.split("/")[3]
        if not customer_exists(cid):
            http_s, pl = api_error("not_found", "Klant niet gevonden", 404)
            return http_s, pl
        get_customer_assessments = deps["get_customer_assessments"]
        return 200, get_customer_assessments(cid)

    if re.fullmatch(r"/api/customers/[^/]+/azure", path):
        cid = path.split("/")[3]
        if not customer_exists(cid):
            http_s, pl = api_error("not_found", "Klant niet gevonden", 404)
            return http_s, pl
        get_customer_azure_summary = deps["get_customer_azure_summary"]
        try:
            return 200, get_customer_azure_summary(cid)
        except Exception as exc:
            http_s, pl = api_error("azure_summary_error", f"Azure-overzicht mislukt: {exc}", 500)
            return http_s, pl

    return None


def dispatch_customer_post_routes(
    path: str,
    sess: Dict[str, Any],
    read_json,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Handle POST /api/customers* routes. Returns (status, payload) or None."""
    session_can = deps["session_can"]
    create_customer = deps["create_customer"]
    upsert_customer_service = deps["upsert_customer_service"]

    if path == "/api/customers":
        if sess.get("role") != "admin":
            return 403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"}
        return 201, create_customer(read_json())

    if re.fullmatch(r"/api/customers/[^/]+/services", path):
        if not session_can(sess, "customer.write_services"):
            return 403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"}
        cid = path.split("/")[3]
        return 201, upsert_customer_service(cid, read_json())

    return None


def dispatch_customer_patch_routes(
    path: str,
    read_json,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Handle PATCH /api/customers* routes. Returns (status, payload) or None."""
    update_customer = deps["update_customer"]

    if re.fullmatch(r"/api/customers/[^/]+", path):
        return 200, update_customer(path.split("/")[3], read_json())

    return None


def dispatch_customer_delete_routes(
    path: str,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Handle DELETE /api/customers* routes. Returns (status, payload) or None."""
    delete_customer = deps["delete_customer"]

    if re.fullmatch(r"/api/customers/[^/]+", path):
        return 200, delete_customer(path.split("/")[3])

    return None


def dispatch_job_get_routes(
    path: str,
    qs: Dict[str, Any],
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Handle GET /api/jobs* routes."""
    list_jobs = deps["list_jobs"]

    if path == "/api/jobs":
        tid_f = qs.get("tenant_id", [None])[0]
        status_f = qs.get("status", [None])[0]
        limit_f = int(qs.get("limit", ["100"])[0])
        return 200, {"items": list_jobs(tid_f, status_f, limit_f)}

    if re.fullmatch(r"/api/tenants/[^/]+/jobs", path):
        tid = path.split("/")[3]
        status_f = qs.get("status", [None])[0]
        return 200, {"items": list_jobs(tid, status_f)}

    return None


def dispatch_approval_get_routes(
    path: str,
    qs: Dict[str, Any],
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Handle GET /api/approvals routes."""
    list_approvals = deps["list_approvals"]
    list_approval_requests = deps["list_approval_requests"]

    if path == "/api/approvals":
        status_f = qs.get("status", [None])[0]
        limit_f = int(qs.get("limit", ["100"])[0])
        approvals = list_approvals(status=status_f, limit=limit_f)
        requests = list_approval_requests(status=status_f, limit=limit_f)
        normalized_requests = []
        for item in requests:
            metadata = item.get("metadata") or {}
            normalized_requests.append({
                "id": item.get("id"),
                "approval_kind": "request",
                "approval_status": item.get("status"),
                "action_log_id": None,
                "tenant_id": metadata.get("tenant_id"),
                "section": metadata.get("scope_type") or "governance",
                "subsection": metadata.get("customer_name") or metadata.get("scope_label") or metadata.get("scope_id") or item.get("action_key"),
                "action_type": item.get("action_name") or item.get("action_key"),
                "metadata": metadata,
                "requested_by": item.get("requested_by"),
                "requested_at": item.get("requested_at"),
                "approved_by": item.get("approved_by"),
                "approved_at": item.get("approved_at"),
                "reason": item.get("action_description"),
                "action_key": item.get("action_key"),
                "action_name": item.get("action_name"),
            })
        items = approvals + normalized_requests
        items.sort(key=lambda entry: entry.get("requested_at") or "", reverse=True)
        return 200, {"items": items[:limit_f]}

    return None


def dispatch_job_post_routes(
    path: str,
    sess: Dict[str, Any],
    read_json,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Handle POST /api/jobs* routes."""
    session_can = deps["session_can"]
    api_error = deps["api_error"]
    enqueue_job = deps["enqueue_job"]
    cancel_job = deps["cancel_job"]
    create_action_log = deps["create_action_log"]
    db_audit = deps["db_audit"]

    if path == "/api/jobs":
        if not session_can(sess, "jobs.enqueue"):
            return 403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"}
        body = read_json()
        job_type = (body.get("job_type") or "").strip()
        if not job_type:
            http_s, pl = api_error("validation_error", "job_type is verplicht", 400)
            return http_s, pl
        row = enqueue_job(
            job_type,
            tenant_id=body.get("tenant_id") or None,
            payload=body.get("payload") or {},
            priority=int(body.get("priority") or 5),
            scheduled_at=body.get("scheduled_at") or None,
        )
        create_action_log(
            body.get("tenant_id") or None,
            "operations",
            "jobs",
            "job_enqueued",
            {"job_type": job_type, "payload": body.get("payload") or {}},
        )
        db_audit(
            sess.get("email", ""),
            "",
            "job_enqueued",
            "tenant",
            body.get("tenant_id") or "",
            f"job_type={job_type}",
            tenant_id=body.get("tenant_id") or "",
        )
        return 201, row

    if re.fullmatch(r"/api/jobs/[^/]+/cancel", path):
        if not session_can(sess, "jobs.cancel"):
            return 403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"}
        job_id = path.split("/")[3]
        return 200, cancel_job(job_id)

    return None


def dispatch_approval_post_routes(
    path: str,
    sess: Dict[str, Any],
    read_json,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Handle POST /api/approvals* routes."""
    session_can = deps["session_can"]
    api_error = deps["api_error"]
    request_action_approval = deps["request_action_approval"]
    create_approval = deps["create_approval"]
    decide_approval = deps["decide_approval"]
    approval_exists = deps["approval_exists"]

    if path == "/api/approvals/request":
        body = read_json()
        action_key = (body.get("action_key") or "").strip()
        action_name = (body.get("action_name") or "Gevoelige actie").strip()
        action_desc = (body.get("action_description") or "").strip()
        metadata = body.get("metadata") or {}
        if not action_key:
            return 400, {"error": "action_key is verplicht", "error_code": "validation_error"}
        approval = request_action_approval(
            action_key,
            action_name,
            action_desc,
            sess.get("email", "unknown"),
            metadata,
        )
        return 201, {
            "ok": True,
            "approval_id": approval.get("id"),
            "status": approval.get("status"),
            "message": "Goedkeuringsaanvraag ingediend. Wacht op goedkeuring.",
        }

    if path == "/api/approvals":
        if sess.get("role") != "admin":
            return 403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"}
        body = read_json()
        action_log_id = (body.get("action_log_id") or "").strip()
        requested_by = sess.get("email", "")
        reason = body.get("reason") or None
        if not action_log_id:
            http_s, pl = api_error("validation_error", "action_log_id is verplicht", 400)
            return http_s, pl
        return 201, create_approval(action_log_id, requested_by, reason)

    if re.fullmatch(r"/api/approvals/[^/]+/approve", path):
        if not session_can(sess, "approvals.decide"):
            return 403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"}
        appr_id = path.split("/")[3]
        body = read_json()
        if not approval_exists(appr_id):
            return 404, {"error": "Goedkeuring niet gevonden", "error_code": "not_found"}
        return 200, decide_approval(appr_id, "approved", sess.get("email", ""), body.get("reason") or None)

    if re.fullmatch(r"/api/approvals/[^/]+/reject", path):
        if not session_can(sess, "approvals.decide"):
            return 403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"}
        appr_id = path.split("/")[3]
        body = read_json()
        if not approval_exists(appr_id):
            return 404, {"error": "Goedkeuring niet gevonden", "error_code": "not_found"}
        return 200, decide_approval(appr_id, "rejected", sess.get("email", ""), body.get("reason") or None)

    return None


def dispatch_service_get_routes(
    path: str,
    qs: Dict[str, Any],
    sess: Dict[str, Any],
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Handle GET /api/services* routes."""
    list_service_catalog = deps["list_service_catalog"]
    list_service_requests = deps["list_service_requests"]

    if path == "/api/services/catalog":
        category = qs.get("category", [None])[0]
        status = qs.get("status", [None])[0]
        items = list_service_catalog(category=category, status=status)
        return 200, {"items": items, "count": len(items)}

    if path == "/api/services/requests":
        status = qs.get("status", [None])[0]
        customer_id = qs.get("customer_id", [None])[0]
        requested_by = None if (sess or {}).get("role") == "admin" else (sess or {}).get("email")
        items = list_service_requests(status=status, customer_id=customer_id, requested_by=requested_by)
        return 200, {"items": items, "count": len(items)}

    return None


def dispatch_service_post_routes(
    path: str,
    sess: Dict[str, Any],
    read_json,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Handle POST /api/services* routes."""
    create_service_request = deps["create_service_request"]
    update_service_request_status = deps["update_service_request_status"]
    api_error = deps["api_error"]

    if path == "/api/services/requests":
        body = read_json()
        requested_by = (sess or {}).get("email") or "unknown@denjoy.local"
        try:
            created = create_service_request(body, requested_by=requested_by)
            return 201, created
        except ValueError as exc:
            http_s, pl = api_error("validation_error", str(exc), 400)
            return http_s, pl

    if re.fullmatch(r"/api/services/requests/[^/]+/status", path):
        if (sess or {}).get("role") != "admin":
            return 403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"}
        req_id = path.split("/")[4]
        body = read_json()
        try:
            updated = update_service_request_status(
                req_id,
                status=body.get("status"),
                note=body.get("note"),
                decided_by=(sess or {}).get("email") or "admin@denjoy.local",
            )
            return 200, updated
        except ValueError as exc:
            message = str(exc)
            code = 404 if "niet gevonden" in message.lower() else 400
            http_s, pl = api_error("validation_error" if code == 400 else "not_found", message, code)
            return http_s, pl

    return None
