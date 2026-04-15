from __future__ import annotations

from typing import Any, Callable, Dict, List


def build_tenant_onboarding_status(
    tenant: Dict[str, Any],
    customer_services: List[Dict[str, Any]],
    integrations: Dict[str, Dict[str, Any]],
    auth_ready: bool,
    kb_summary: Dict[str, Any],
    last_run: Dict[str, Any],
    now_iso: Callable[[], str],
) -> Dict[str, Any]:
    has_gdap = integrations.get("gdap", {}).get("gdap_status") == "active"
    has_app = integrations.get("customer_app", {}).get("app_registration_status") == "active"
    has_lighthouse = integrations.get("lighthouse", {}).get("lighthouse_status") == "active"
    kb_ready = bool((kb_summary.get("assets") or 0) > 0 or (kb_summary.get("pages") or 0) > 0 or (kb_summary.get("contacts") or 0) > 0)
    has_service_mapping = any(int(s.get("is_enabled") or 0) == 1 for s in customer_services)
    enabled_services = [s for s in customer_services if int(s.get("is_enabled") or 0) == 1]

    steps = [
        {"key": "tenant_registered", "label": "Tenant geregistreerd", "done": bool(tenant.get("tenant_guid")), "required": True},
        {"key": "auth_profile_ready", "label": "Auth-profiel gekoppeld", "done": auth_ready, "required": True},
        {"key": "service_mapping", "label": "Services gekoppeld", "done": has_service_mapping, "required": True},
        {"key": "kb_baseline", "label": "KB-basis gevuld", "done": kb_ready, "required": True},
        {"key": "assessment_run", "label": "Eerste assessment uitgevoerd", "done": bool(last_run), "required": True},
        {"key": "gdap_configured", "label": "GDAP-relatie geconfigureerd", "done": has_gdap, "required": False},
        {"key": "app_registered", "label": "App-registratie geconfigureerd", "done": has_app, "required": False},
        {"key": "lighthouse_onboarded", "label": "Azure Lighthouse geconfigureerd", "done": has_lighthouse, "required": False},
    ]
    required_steps = [s for s in steps if s.get("required")]
    done_count = sum(1 for s in required_steps if s["done"])
    next_actions = [s["label"] for s in required_steps if not s.get("done")]
    service_items: List[Dict[str, Any]] = []
    service_done_count = 0
    for row in enabled_services:
        service_key = str(row.get("service_key") or "")
        onboarded_at = row.get("onboarded_at")
        status = "ready" if onboarded_at else ("in_progress" if auth_ready else "pending")
        if status == "ready":
            service_done_count += 1
        service_items.append({
            "service_key": service_key,
            "enabled": True,
            "onboarded_at": onboarded_at,
            "status": status,
            "status_label": (
                "Gereed" if status == "ready"
                else "In uitvoering" if status == "in_progress"
                else "Nog starten"
            ),
        })

    return {
        "tenant_id": tenant["id"],
        "tenant_name": tenant["tenant_name"],
        "completion_pct": round((done_count / len(required_steps)) * 100) if required_steps else 0,
        "steps": steps,
        "next_actions": next_actions[:4],
        "last_assessment_at": last_run["completed_at"] if last_run else None,
        "auth_ready": auth_ready,
        "services_ready": has_service_mapping,
        "service_items": service_items,
        "service_summary": {
            "enabled": len(enabled_services),
            "ready": service_done_count,
            "pending": max(len(enabled_services) - service_done_count, 0),
        },
        "kb_ready": kb_ready,
        "optional_completed": sum(1 for s in steps if not s.get("required") and s.get("done")),
        "_generated_at": now_iso(),
    }


def build_customer_onboarding_summary(statuses: List[Dict[str, Any]]) -> Dict[str, Any]:
    completion_values = [int(item.get("completion_pct") or 0) for item in statuses]
    ready_count = sum(1 for item in statuses if int(item.get("completion_pct") or 0) >= 75)
    enabled_services = sum(int(item.get("service_summary", {}).get("enabled") or 0) for item in statuses)
    ready_services = sum(int(item.get("service_summary", {}).get("ready") or 0) for item in statuses)
    return {
        "tenant_count": len(statuses),
        "ready_count": ready_count,
        "avg_completion_pct": round(sum(completion_values) / len(completion_values)) if completion_values else 0,
        "enabled_services": enabled_services,
        "ready_services": ready_services,
    }


def build_customer_health(
    customer: Dict[str, Any],
    tenants: List[Dict[str, Any]],
    get_last_run: Callable[[str], Dict[str, Any]],
    get_integrations: Callable[[str], List[Dict[str, Any]]],
    get_onboarding: Callable[[str], Dict[str, Any]],
    get_ops_summary: Callable[[str], Dict[str, Any]],
    now_iso: Callable[[], str],
) -> Dict[str, Any]:
    health: Dict[str, Any] = {
        "customer_id": customer["id"],
        "customer_name": customer["name"],
        "status": customer["status"],
        "tenant_count": len(tenants),
        "tenants": [],
        "_generated_at": now_iso(),
    }
    score_values: List[float] = []
    tenants_with_critical = 0
    tenants_ready = 0
    pending_jobs = 0
    failed_jobs = 0
    total_assets = 0
    total_pages = 0

    for tenant in tenants:
        tid = tenant["id"]
        last_run = get_last_run(tid)
        integrations = get_integrations(tid)
        onboarding = get_onboarding(tid)
        ops_summary = get_ops_summary(tid)
        if isinstance(last_run, dict) and last_run.get("score_overall") is not None:
            score_values.append(float(last_run.get("score_overall") or 0))
        if int((last_run or {}).get("critical_count") or 0) > 0:
            tenants_with_critical += 1
        if int(onboarding.get("completion_pct") or 0) >= 75:
            tenants_ready += 1
        pending_jobs += int((ops_summary.get("job_summary") or {}).get("pending") or 0)
        pending_jobs += int((ops_summary.get("job_summary") or {}).get("running") or 0)
        failed_jobs += int((ops_summary.get("job_summary") or {}).get("failed") or 0)
        total_assets += int((ops_summary.get("kb_summary") or {}).get("assets") or 0)
        total_pages += int((ops_summary.get("kb_summary") or {}).get("pages") or 0)
        health["tenants"].append({
            "tenant_id": tid,
            "tenant_name": tenant["tenant_name"],
            "status": tenant["status"],
            "last_assessment": last_run,
            "integrations": integrations,
            "onboarding": onboarding,
            "ops_summary": ops_summary,
        })

    health["summary"] = {
        "avg_score": round(sum(score_values) / len(score_values), 1) if score_values else None,
        "tenants_with_critical": tenants_with_critical,
        "ready_tenants": tenants_ready,
        "pending_jobs": pending_jobs,
        "failed_jobs": failed_jobs,
        "kb_assets": total_assets,
        "kb_pages": total_pages,
    }
    return health
