from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List


def build_msp_control_center_payload(
    customers: List[Dict[str, Any]],
    tenants: List[Dict[str, Any]],
    pending_approvals: List[Dict[str, Any]],
    jobs: List[Dict[str, Any]],
    all_actions: List[Dict[str, Any]],
    get_customer_finance_summary: Callable[[str], Dict[str, Any]],
    parse_iso_dateish: Callable[[Any], Any],
    now_iso: Callable[[], str],
) -> Dict[str, Any]:
    threshold = datetime.now(timezone.utc) - timedelta(days=30)
    total_tenants = len(tenants)
    avg_scores: List[float] = []
    critical_tenants = 0
    ready_tenants = 0
    auth_ready_tenants = 0
    tenants_no_assessment = 0
    pending_job_count = 0
    failed_job_count = 0
    stale_tenants: List[Dict[str, Any]] = []

    for tenant in tenants:
        latest_run = tenant.get("latest_run") or {}
        ops_summary = tenant.get("ops_summary") or {}
        onboarding = ops_summary.get("onboarding") or {}
        capability = ops_summary.get("capability_summary") or {}
        job_summary = ops_summary.get("job_summary") or {}
        assessment = ops_summary.get("assessment_summary") or {}
        completed_at = parse_iso_dateish(latest_run.get("completed_at"))

        if onboarding.get("completion_pct", 0) >= 75:
            ready_tenants += 1
        if onboarding.get("auth_ready"):
            auth_ready_tenants += 1
        pending_job_count += int(job_summary.get("pending") or 0) + int(job_summary.get("running") or 0)
        failed_job_count += int(job_summary.get("failed") or 0)

        score = latest_run.get("score_overall")
        if score is None:
            tenants_no_assessment += 1
        else:
            avg_scores.append(float(score))
        if int(assessment.get("critical_count") or 0) > 0:
            critical_tenants += 1

        reasons: List[str] = []
        if not latest_run:
            reasons.append("geen assessment")
        elif not completed_at or completed_at < threshold:
            reasons.append("assessment verouderd")
        if int(onboarding.get("completion_pct") or 0) < 75:
            reasons.append("onboarding onvolledig")
        if int(job_summary.get("failed") or 0) > 0:
            reasons.append("mislukte jobs")
        if int(capability.get("config_required") or 0) > 0:
            reasons.append("configuratie nodig")
        if reasons:
            stale_tenants.append({
                "tenant_id": tenant["id"],
                "tenant_name": tenant.get("tenant_name"),
                "customer_name": tenant.get("customer_name"),
                "last_assessment_at": latest_run.get("completed_at"),
                "completion_pct": int(onboarding.get("completion_pct") or 0),
                "critical_count": int(assessment.get("critical_count") or 0),
                "failed_jobs": int(job_summary.get("failed") or 0),
                "reasons": reasons,
            })

    customer_rows: List[Dict[str, Any]] = []
    renewals: List[Dict[str, Any]] = []
    total_cost = 0.0
    total_subscriptions = 0
    customers_at_risk = 0
    for customer in customers:
        health = customer.get("health_summary") or {}
        onboarding = customer.get("onboarding_summary") or {}
        finance = get_customer_finance_summary(customer["id"]).get("summary") or {}
        avg_completion = int(onboarding.get("avg_completion_pct") or 0)
        critical_count = int(health.get("tenants_with_critical") or 0)
        failed_count = int(health.get("failed_jobs") or 0)
        latest_cost = float(finance.get("latest_total_cost") or 0.0)
        total_cost += latest_cost
        total_subscriptions += int(finance.get("subscription_count") or 0)

        attention_score = 0
        if critical_count > 0:
            attention_score += 40
        if failed_count > 0:
            attention_score += 25
        if avg_completion < 75:
            attention_score += 20
        if int(customer.get("tenant_count") or 0) == 0:
            attention_score += 15
        if int(onboarding.get("enabled_services") or 0) == 0:
            attention_score += 10
        if attention_score >= 40:
            customers_at_risk += 1

        renewal_days = None
        renewal_at = parse_iso_dateish(customer.get("renewal_date"))
        if renewal_at:
            renewal_days = (renewal_at.date() - datetime.now(timezone.utc).date()).days
            renewals.append({
                "customer_id": customer["id"],
                "customer_name": customer.get("name"),
                "renewal_date": customer.get("renewal_date"),
                "days_until": renewal_days,
                "service_tier": customer.get("service_tier"),
                "sla_name": customer.get("sla_name"),
                "latest_total_cost": round(latest_cost, 2),
            })

        customer_rows.append({
            "customer_id": customer["id"],
            "customer_name": customer.get("name"),
            "status": customer.get("status"),
            "tenant_count": int(customer.get("tenant_count") or 0),
            "service_count": int(customer.get("service_count") or 0),
            "ready_services": int(onboarding.get("ready_services") or 0),
            "enabled_services": int(onboarding.get("enabled_services") or 0),
            "avg_completion_pct": avg_completion,
            "avg_score": health.get("avg_score"),
            "critical_tenants": critical_count,
            "failed_jobs": failed_count,
            "pending_jobs": int(health.get("pending_jobs") or 0),
            "service_tier": customer.get("service_tier"),
            "support_model": customer.get("support_model"),
            "sla_name": customer.get("sla_name"),
            "renewal_date": customer.get("renewal_date"),
            "renewal_days": renewal_days,
            "subscription_count": int(finance.get("subscription_count") or 0),
            "latest_total_cost": round(latest_cost, 2),
            "stale_cost_snapshots": int(finance.get("stale_cost_snapshots") or 0),
            "attention_score": attention_score,
        })

    stale_tenants.sort(key=lambda item: (
        -int(item.get("critical_count") or 0),
        -int(item.get("failed_jobs") or 0),
        int(item.get("completion_pct") or 0),
    ))
    customer_rows.sort(key=lambda item: (
        -int(item.get("attention_score") or 0),
        -int(item.get("critical_tenants") or 0),
        -int(item.get("failed_jobs") or 0),
        int(item.get("avg_completion_pct") or 0),
    ))
    renewals.sort(key=lambda item: 99999 if item.get("days_until") is None else int(item.get("days_until")))

    owner_summary_map: Dict[str, Dict[str, Any]] = {}
    for action in all_actions:
        owner_key = str(action.get("owner") or "").strip() or "Niet toegewezen"
        entry = owner_summary_map.setdefault(owner_key, {
            "owner": owner_key,
            "total": 0,
            "open": 0,
            "in_progress": 0,
            "done": 0,
            "accepted": 0,
            "overdue": 0,
            "due_today": 0,
            "critical": 0,
        })
        status = str(action.get("status") or "open")
        entry["total"] += 1
        if status in {"open", "in_progress", "done", "accepted"}:
            entry[status] += 1
        if action.get("is_overdue"):
            entry["overdue"] += 1
        if action.get("days_until_due") == 0:
            entry["due_today"] += 1
        if str(action.get("severity") or "") == "critical":
            entry["critical"] += 1

    owner_summaries = list(owner_summary_map.values())
    owner_summaries.sort(key=lambda item: (
        -int(item.get("overdue") or 0),
        -int(item.get("critical") or 0),
        -int(item.get("open") or 0),
        -int(item.get("in_progress") or 0),
        str(item.get("owner") or ""),
    ))

    priorities: List[Dict[str, Any]] = []
    if pending_approvals:
        priorities.append({
            "tone": "urgent",
            "title": "Goedkeuringen wachten op besluit",
            "detail": f"{len(pending_approvals)} openstaande approval(s) blokkeren voortgang of governance.",
            "action": {"type": "section", "section": "goedkeuringen", "label": "Open approvals"},
        })
    if failed_job_count > 0:
        priorities.append({
            "tone": "warn",
            "title": "Mislukte jobs vragen aandacht",
            "detail": f"{failed_job_count} job(s) staan op failed en vragen handmatige opvolging.",
            "action": {"type": "section", "section": "jobmonitor", "label": "Bekijk jobs"},
        })
    if stale_tenants:
        top_tenant = stale_tenants[0]
        priorities.append({
            "tone": "warn",
            "title": "Tenant vraagt directe opvolging",
            "detail": f"{top_tenant.get('customer_name')}: {top_tenant.get('tenant_name')} heeft {', '.join(top_tenant.get('reasons') or [])}.",
            "action": {"type": "tenant_onboarding", "tenant_id": top_tenant.get("tenant_id"), "tenant_name": top_tenant.get("tenant_name"), "label": "Open onboarding"},
        })
    if customer_rows:
        top_customer = customer_rows[0]
        priorities.append({
            "tone": "info" if int(top_customer.get("attention_score") or 0) < 40 else "warn",
            "title": "Klant met hoogste aandachtsscore",
            "detail": f"{top_customer.get('customer_name')} · readiness {top_customer.get('avg_completion_pct')}% · {top_customer.get('critical_tenants')} kritieke tenant(s).",
            "action": {"type": "customer", "customer_id": top_customer.get("customer_id"), "label": "Open klantdetail"},
        })
    if renewals:
        top_renewal = renewals[0]
        priorities.append({
            "tone": "warn" if (top_renewal.get("days_until") or 99999) <= 30 else "info",
            "title": "Contract/renewal komt eraan",
            "detail": f"{top_renewal.get('customer_name')} verloopt over {top_renewal.get('days_until')} dag(en).",
            "action": {"type": "customer_edit", "customer_id": top_renewal.get("customer_id"), "label": "Open klantkaart"},
        })

    return {
        "generated_at": now_iso(),
        "summary": {
            "total_customers": len(customers),
            "active_customers": sum(1 for item in customers if str(item.get("status") or "") == "active"),
            "customers_at_risk": customers_at_risk,
            "total_tenants": total_tenants,
            "avg_score": round(sum(avg_scores) / len(avg_scores), 1) if avg_scores else None,
            "critical_tenants": critical_tenants,
            "ready_tenants": ready_tenants,
            "auth_ready_tenants": auth_ready_tenants,
            "pending_approvals": len(pending_approvals),
            "pending_jobs": pending_job_count,
            "failed_jobs": failed_job_count,
            "stale_tenants": len(stale_tenants),
            "total_subscriptions": total_subscriptions,
            "latest_total_cost": round(total_cost, 2),
            "renewals_60d": sum(1 for item in renewals if item.get("days_until") is not None and int(item.get("days_until")) <= 60),
            "tenants_no_assessment": tenants_no_assessment,
        },
        "priorities": priorities[:6],
        "customers": customer_rows[:8],
        "approvals": pending_approvals[:6],
        "jobs": jobs[:8],
        "owner_summaries": owner_summaries[:8],
        "renewals": renewals[:6],
        "stale_tenants": stale_tenants[:8],
    }
