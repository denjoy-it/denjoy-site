"""Auth and authorization service helpers."""

from __future__ import annotations

import threading
from typing import Any, Dict, List, Optional
import json

from db_layer import db_fetchall, db_fetchone, now_iso


_request_context = threading.local()


def _get_request_cache() -> Dict[str, Any]:
    if not hasattr(_request_context, "cache"):
        _request_context.cache = {}
    return _request_context.cache


def clear_request_cache() -> None:
    if hasattr(_request_context, "cache"):
        _request_context.cache.clear()


PORTAL_MSP_READ_ROLES = frozenset({
    "msp_super_admin",
    "engineer",
    "monitoring_operator",
    "billing_analyst",
    "read_only",
})
PORTAL_MSP_WRITE_ROLES = frozenset({
    "msp_super_admin",
    "engineer",
})
PORTAL_TENANT_SELECTOR_ROLES = frozenset({
    "msp_super_admin",
})
PORTAL_KB_READ_ROLES = frozenset({
    "msp_super_admin",
    "engineer",
})
PORTAL_KB_WRITE_ROLES = frozenset({
    "msp_super_admin",
    "engineer",
})


PORTAL_ACTION_ROLE_MATRIX: Dict[str, frozenset[str]] = {
    "customer.write_services": frozenset({"msp_super_admin", "engineer"}),
    "customer.access.manage": frozenset({"msp_super_admin"}),
    "onboarding.approval.request": frozenset({"msp_super_admin", "engineer"}),
    "onboarding.plan.launch": frozenset({"msp_super_admin", "engineer"}),
    "approvals.decide": frozenset({"msp_super_admin", "engineer"}),
    "integrations.write": frozenset({"msp_super_admin", "engineer"}),
    "azure.operations.request": frozenset({"msp_super_admin", "engineer"}),
    "jobs.enqueue": frozenset({"msp_super_admin", "engineer"}),
    "jobs.cancel": frozenset({"msp_super_admin", "engineer"}),
    "cost_snapshots.write": frozenset({"msp_super_admin", "engineer"}),
    "cost_snapshots.delete": frozenset({"msp_super_admin", "engineer"}),
}


def get_user_portal_role_keys(email: str) -> List[str]:
    if not email:
        return []
    rows = db_fetchall(
        """
        SELECT DISTINCT pr.role_key
        FROM users u
        INNER JOIN user_customer_access uca ON uca.portal_user_id = u.id
        INNER JOIN portal_roles pr ON pr.id = uca.portal_role_id
        WHERE lower(u.email)=?
          AND (
            uca.expires_at IS NULL
            OR uca.expires_at=''
            OR uca.expires_at > ?
          )
        ORDER BY pr.role_key
        """,
        (email.strip().lower(), now_iso()),
    )
    return [str(row.get("role_key") or "").strip() for row in rows if row.get("role_key")]


def _get_active_user_access_rows(email: str) -> List[Dict[str, Any]]:
    if not email:
        return []
    return db_fetchall(
        """
        SELECT uca.scope, uca.customer_id, pr.role_key
        FROM users u
        INNER JOIN user_customer_access uca ON uca.portal_user_id = u.id
        INNER JOIN portal_roles pr ON pr.id = uca.portal_role_id
        WHERE lower(u.email)=?
          AND (
            uca.expires_at IS NULL
            OR uca.expires_at=''
            OR uca.expires_at > ?
          )
        """,
        (email.strip().lower(), now_iso()),
    )


def _scope_has_documentation(scope: Any) -> bool:
    if isinstance(scope, dict):
        parsed = scope
    else:
        raw = str(scope or "").strip()
        if not raw:
            return False
        try:
            parsed = json.loads(raw)
        except Exception:
            return False
    return bool(parsed.get("documentation_enabled"))


def build_session_access_profile(sess: Dict[str, Any]) -> Dict[str, Any]:
    email = sess.get("email", "")
    role_keys = get_user_portal_role_keys(email)
    access_rows = _get_active_user_access_rows(email)
    role_key_set = set(role_keys)
    is_admin = sess.get("role") == "admin"
    is_customer_profile = str(sess.get("role") or "") == "klant"
    documentation_enabled = any(_scope_has_documentation(row.get("scope")) for row in access_rows)
    return {
        "portal_role_keys": role_keys,
        "msp_admin": is_admin if is_customer_profile else (is_admin or bool(role_key_set & PORTAL_MSP_READ_ROLES)),
        "msp_write": is_admin if is_customer_profile else (is_admin or bool(role_key_set & PORTAL_MSP_WRITE_ROLES)),
        "msp_power": is_admin if is_customer_profile else (is_admin or "msp_super_admin" in role_key_set),
        "tenant_selector_access": is_admin if is_customer_profile else (is_admin or bool(role_key_set & PORTAL_TENANT_SELECTOR_ROLES)),
        "kb_access": is_admin or documentation_enabled or (False if is_customer_profile else bool(role_key_set & PORTAL_KB_READ_ROLES)),
        "kb_write": is_admin if is_customer_profile else (is_admin or bool(role_key_set & PORTAL_KB_WRITE_ROLES)),
        "documentation_enabled": documentation_enabled,
        "customer_profile": is_customer_profile,
    }


def session_can(sess: Dict[str, Any], action_key: str) -> bool:
    if str(sess.get("role") or "") == "admin":
        return True
    access = sess.get("_access") or {}
    role_keys = set(access.get("portal_role_keys") or sess.get("_portal_role_keys") or [])
    allowed = PORTAL_ACTION_ROLE_MATRIX.get(action_key)
    if allowed is None:
        return bool(access.get("msp_write"))
    return bool(role_keys & set(allowed))


def session_can_service(sess: Dict[str, Any], customer_id: str, service_key: str, operation: str = "read") -> bool:
    if str(sess.get("role") or "") == "admin":
        return True

    email = sess.get("email", "")
    if not email or not customer_id or not service_key:
        return False

    user = db_fetchone("SELECT id FROM users WHERE email=?", (email,))
    if not user:
        return False

    user_id = user["id"]
    access = sess.get("_access") or {}
    role_keys = set(access.get("portal_role_keys") or sess.get("_portal_role_keys") or [])

    has_customer_access = any(
        db_fetchone(
            "SELECT id FROM user_customer_access WHERE portal_user_id=? AND customer_id=? AND (expires_at IS NULL OR expires_at > ?)",
            (user_id, customer_id, now_iso()),
        )
        for _ in [1]
    )
    if not has_customer_access and not role_keys:
        return False

    cache = _get_request_cache()
    cache_key = f"service_policies:{customer_id}"
    if cache_key not in cache:
        cache[cache_key] = db_fetchall(
            "SELECT * FROM service_access_policies WHERE customer_id=? AND (expires_at IS NULL OR expires_at > ?)",
            (customer_id, now_iso()),
        )

    all_policies = cache[cache_key]
    policies = [
        p for p in all_policies if p.get("service_key") == service_key and p.get("role_key") in role_keys
    ]

    # Fall back to global default policies (customer_id = "__default__") if no customer-specific grant exists
    if not policies:
        default_key = f"service_policies:__default__"
        if default_key not in cache:
            cache[default_key] = db_fetchall(
                "SELECT * FROM service_access_policies WHERE customer_id='__default__' AND (expires_at IS NULL OR expires_at > ?)",
                (now_iso(),),
            )
        policies = [
            p for p in cache[default_key]
            if p.get("service_key") == service_key and p.get("role_key") in role_keys
        ]

    if not policies:
        return False

    if operation == "read":
        return any(p.get("can_read") for p in policies)
    if operation == "write":
        return any(p.get("can_write") for p in policies)
    if operation == "approve":
        return any(p.get("can_approve") for p in policies)

    return False


def action_requires_approval(action_key: str) -> bool:
    cache = _get_request_cache()
    if "approval_policies" not in cache:
        cache["approval_policies"] = {
            row["action_key"]: row for row in db_fetchall("SELECT * FROM approval_policies")
        }

    policy = cache["approval_policies"].get(action_key)
    if policy:
        return bool(policy.get("requires_approval"))
    return False


def get_approval_requirement(action_key: str) -> Optional[Dict[str, Any]]:
    cache = _get_request_cache()
    if "approval_policies" not in cache:
        cache["approval_policies"] = {
            row["action_key"]: row for row in db_fetchall("SELECT * FROM approval_policies")
        }

    return cache["approval_policies"].get(action_key)
