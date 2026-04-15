"""Azure route dispatcher — tenant-scoped read-only and guarded action endpoints."""

from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple


def dispatch_azure_get_routes(path: str, deps: Dict[str, Any]) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Handle GET /api/azure* routes."""
    api_error = deps.get("api_error")
    list_subscriptions = deps.get("list_subscriptions")
    list_azure_snapshots = deps.get("list_azure_snapshots")
    list_alert_snapshots = deps.get("list_alert_snapshots")
    list_cost_snapshots = deps.get("list_cost_snapshots")

    if path == "/api/azure/health":
        return 200, {"ok": True, "scope": "azure", "implemented": True}

    # GET /api/azure/{tenant_id}/subscriptions
    if re.fullmatch(r"/api/azure/[^/]+/subscriptions", path):
        tenant_id = path.split("/")[3]
        items = list_subscriptions(tenant_id) if list_subscriptions else []
        return 200, {"ok": True, "tenant_id": tenant_id, "items": items, "count": len(items)}

    # GET /api/azure/{tenant_id}/resources
    if re.fullmatch(r"/api/azure/[^/]+/resources", path):
        tenant_id = path.split("/")[3]
        items = list_azure_snapshots(tenant_id) if list_azure_snapshots else []
        return 200, {"ok": True, "tenant_id": tenant_id, "items": items, "count": len(items)}

    # GET /api/azure/{tenant_id}/alerts
    if re.fullmatch(r"/api/azure/[^/]+/alerts", path):
        tenant_id = path.split("/")[3]
        items = list_alert_snapshots(tenant_id) if list_alert_snapshots else []
        return 200, {"ok": True, "tenant_id": tenant_id, "items": items, "count": len(items)}

    # GET /api/azure/{tenant_id}/costs
    if re.fullmatch(r"/api/azure/[^/]+/costs", path):
        tenant_id = path.split("/")[3]
        items = list_cost_snapshots(tenant_id) if list_cost_snapshots else []
        return 200, {"ok": True, "tenant_id": tenant_id, "items": items, "count": len(items)}

    # GET /api/azure/{tenant_id}/summary  — aggregate all azure data for a tenant
    if re.fullmatch(r"/api/azure/[^/]+/summary", path):
        tenant_id = path.split("/")[3]
        subscriptions = list_subscriptions(tenant_id) if list_subscriptions else []
        resources = list_azure_snapshots(tenant_id) if list_azure_snapshots else []
        alerts = list_alert_snapshots(tenant_id) if list_alert_snapshots else []
        costs = list_cost_snapshots(tenant_id) if list_cost_snapshots else []
        latest_cost = costs[0] if costs else None
        return 200, {
            "ok": True,
            "tenant_id": tenant_id,
            "subscription_count": len(subscriptions),
            "lighthouse_onboarded": sum(1 for s in subscriptions if s.get("lighthouse_onboarded")),
            "resource_snapshot_count": len(resources),
            "alert_snapshot_count": len(alerts),
            "cost_snapshot_count": len(costs),
            "latest_cost_period": (
                {"period_start": latest_cost.get("period_start"), "period_end": latest_cost.get("period_end")}
                if latest_cost else None
            ),
        }

    return None


def dispatch_azure_post_routes(
    path: str,
    sess: Dict[str, Any],
    read_json,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Handle POST /api/azure* routes."""
    session_can = deps.get("session_can")
    create_action_log = deps.get("create_action_log")
    create_approval = deps.get("create_approval")
    db_audit = deps.get("db_audit")
    api_error = deps.get("api_error")

    vm_match = re.fullmatch(r"/api/azure/([^/]+)/vm/(start|stop|restart)", path)
    if vm_match:
        if not session_can or not session_can(sess, "azure.operations.request"):
            return 403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"}

        tenant_id, operation = vm_match.groups()
        body = read_json()
        vm_name = str(body.get("vm_name") or "").strip()
        resource_group = str(body.get("resource_group") or "").strip()
        subscription_id = str(body.get("subscription_id") or "").strip()
        reason = str(body.get("reason") or "").strip()
        if not vm_name or not resource_group:
            if api_error:
                return api_error("validation_error", "vm_name en resource_group zijn verplicht", 400)
            return 400, {"error": "vm_name en resource_group zijn verplicht", "error_code": "validation_error"}

        metadata = {
            "operation": operation,
            "subscription_id": subscription_id,
            "resource_group": resource_group,
            "vm_name": vm_name,
            "reason": reason,
            "execution_mode": "approval_required",
        }
        action_log = create_action_log(
            tenant_id,
            "azure",
            "virtual-machines",
            f"vm_{operation}_requested",
            metadata,
            result="pending",
        )
        approval = create_approval(
            action_log.get("id") or "",
            sess.get("email", "unknown"),
            reason or f"Azure VM {operation} aangevraagd voor {vm_name}",
        )
        if db_audit:
            db_audit(
                sess.get("email", ""),
                "",
                f"azure_vm_{operation}_approval_requested",
                "tenant",
                tenant_id,
                f"vm={vm_name} rg={resource_group} subscription={subscription_id or '-'}",
                tenant_id=tenant_id,
            )
        return 202, {
            "ok": True,
            "tenant_id": tenant_id,
            "operation": operation,
            "mode": "approval_required",
            "message": "Azure-actie is vastgelegd en wacht op goedkeuring.",
            "action_log": action_log,
            "approval": approval,
        }

    return None
