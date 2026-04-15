from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set


def build_customer_finance_summary(
    customer: Dict[str, Any],
    tenants: List[Dict[str, Any]],
    onboarding: Dict[str, Any],
    list_subscriptions: Callable[[str], List[Dict[str, Any]]],
    list_cost_snapshots: Callable[[str], List[Dict[str, Any]]],
    now_iso: Callable[[], str],
) -> Dict[str, Any]:
    total_subscriptions = 0
    lighthouse_onboarded = 0
    latest_total_cost = 0.0
    currencies: Set[str] = set()
    stale_cost_snapshots = 0
    tenant_rows: List[Dict[str, Any]] = []

    for tenant in tenants:
        subs = list_subscriptions(tenant["id"])
        snaps = list_cost_snapshots(tenant["id"])
        total_subscriptions += len(subs)
        lighthouse_onboarded += sum(1 for sub in subs if int(sub.get("lighthouse_onboarded") or 0) == 1)
        latest_cost = 0.0
        latest_currency = "EUR"
        generated_at: Optional[str] = None
        if snaps:
            generated_at = snaps[0].get("generated_at")
            try:
                summary = json.loads(snaps[0].get("summary_json") or "{}")
            except Exception:
                summary = {}
            latest_cost = float(summary.get("total_cost") or summary.get("totalCost") or 0.0)
            latest_currency = str(summary.get("currency") or "EUR")
            currencies.add(latest_currency)
            try:
                generated_dt = datetime.fromisoformat(str(generated_at))
                if generated_dt.tzinfo is None:
                    generated_dt = generated_dt.replace(tzinfo=timezone.utc)
                if (datetime.now(timezone.utc) - generated_dt.astimezone(timezone.utc)).days > 31:
                    stale_cost_snapshots += 1
            except Exception:
                pass
        latest_total_cost += latest_cost
        tenant_rows.append({
            "tenant_id": tenant["id"],
            "tenant_name": tenant["tenant_name"],
            "subscription_count": len(subs),
            "lighthouse_onboarded": sum(1 for sub in subs if int(sub.get("lighthouse_onboarded") or 0) == 1),
            "latest_cost": round(latest_cost, 2),
            "currency": latest_currency,
            "generated_at": generated_at,
        })

    return {
        "customer_id": customer["id"],
        "customer_name": customer["name"],
        "summary": {
            "tenant_count": len(tenants),
            "subscription_count": total_subscriptions,
            "lighthouse_onboarded": lighthouse_onboarded,
            "latest_total_cost": round(latest_total_cost, 2),
            "currencies": sorted(currencies) or ["EUR"],
            "service_gap": max(int(onboarding.get("enabled_services") or 0) - total_subscriptions, 0),
            "stale_cost_snapshots": stale_cost_snapshots,
        },
        "tenants": tenant_rows,
        "_generated_at": now_iso(),
    }
