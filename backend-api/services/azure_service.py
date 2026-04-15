"""Azure service scaffolding for MSP control-plane endpoints."""

from __future__ import annotations

from typing import Any, Dict, List


class AzureService:
    """Minimal Azure service placeholder used for route planning."""

    def list_subscriptions(self) -> List[Dict[str, Any]]:
        return []

    def list_resources(self, subscription_id: str) -> List[Dict[str, Any]]:
        return []

    def list_alerts(self, subscription_id: str) -> List[Dict[str, Any]]:
        return []

    def get_cost_summary(self, subscription_id: str) -> Dict[str, Any]:
        return {
            "subscription_id": subscription_id,
            "currency": "EUR",
            "total": 0,
            "implemented": False,
        }

    def vm_power_action(self, subscription_id: str, vm_id: str, action: str) -> Dict[str, Any]:
        return {
            "subscription_id": subscription_id,
            "vm_id": vm_id,
            "action": action,
            "accepted": False,
            "implemented": False,
        }
