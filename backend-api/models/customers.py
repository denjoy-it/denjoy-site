"""Customer persistence model helpers."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional, Tuple

from db_layer import db_execute, db_fetchall, db_fetchone, now_iso


_ALLOWED_CUSTOMER_STATUSES = {"active", "onboarding", "paused", "offboarded"}


def list_customers_rows(status: Optional[str] = None) -> List[Dict[str, Any]]:
    if status:
        return db_fetchall("SELECT * FROM customers WHERE status=? ORDER BY name", (status,))
    return db_fetchall("SELECT * FROM customers ORDER BY name")


def get_customer_row(customer_id: str) -> Optional[Dict[str, Any]]:
    return db_fetchone("SELECT * FROM customers WHERE id=?", (customer_id,))


def customer_exists(customer_id: str) -> bool:
    return bool(db_fetchone("SELECT id FROM customers WHERE id=?", (customer_id,)))


def count_active_tenants(customer_id: str) -> int:
    row = db_fetchone("SELECT COUNT(*) AS cnt FROM tenants WHERE customer_id=? AND is_active=1", (customer_id,))
    return int((row or {}).get("cnt") or 0)


def count_enabled_services(customer_id: str) -> int:
    row = db_fetchone(
        "SELECT COUNT(*) AS cnt FROM customer_services WHERE customer_id=? AND is_enabled=1",
        (customer_id,),
    )
    return int((row or {}).get("cnt") or 0)


def list_customer_tenants(customer_id: str) -> List[Dict[str, Any]]:
    return db_fetchall(
        "SELECT id, tenant_name, tenant_guid, status FROM tenants WHERE customer_id=? AND is_active=1",
        (customer_id,),
    )


def list_customer_services(customer_id: str) -> List[Dict[str, Any]]:
    return db_fetchall(
        "SELECT * FROM customer_services WHERE customer_id=? ORDER BY service_key",
        (customer_id,),
    )


def create_customer_row(payload: Dict[str, Any]) -> str:
    name = (payload.get("name") or "").strip()
    if not name:
        raise ValueError("name is verplicht")

    status = (payload.get("status") or "active").strip()
    if status not in _ALLOWED_CUSTOMER_STATUSES:
        status = "active"

    cid = str(uuid.uuid4())
    ts = now_iso()

    db_execute(
        "INSERT INTO customers (id, name, status, primary_contact_name, primary_contact_email, service_tier, support_model, renewal_date, sla_name, notes, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            cid,
            name,
            status,
            (payload.get("primary_contact_name") or "").strip() or None,
            (payload.get("primary_contact_email") or "").strip() or None,
            (payload.get("service_tier") or "").strip() or None,
            (payload.get("support_model") or "").strip() or None,
            (payload.get("renewal_date") or "").strip() or None,
            (payload.get("sla_name") or "").strip() or None,
            (payload.get("notes") or "").strip() or None,
            ts,
            ts,
        ),
    )

    return cid


def update_customer_fields(customer_id: str, payload: Dict[str, Any]) -> bool:
    if not customer_exists(customer_id):
        raise ValueError("Klant niet gevonden")

    allowed = {
        "name",
        "status",
        "primary_contact_name",
        "primary_contact_email",
        "service_tier",
        "support_model",
        "renewal_date",
        "sla_name",
        "notes",
    }
    fields: Dict[str, Any] = {}
    for key, value in payload.items():
        if key not in allowed:
            continue
        fields[key] = value.strip() if isinstance(value, str) else value

    if "status" in fields and fields["status"] not in _ALLOWED_CUSTOMER_STATUSES:
        raise ValueError("Ongeldige status")

    if not fields:
        return False

    fields["updated_at"] = now_iso()
    sql = "UPDATE customers SET " + ", ".join(f"{key}=?" for key in fields) + " WHERE id=?"
    db_execute(sql, tuple(fields.values()) + (customer_id,))
    return True


def upsert_customer_service_row(customer_id: str, payload: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    if not customer_exists(customer_id):
        raise ValueError("Klant niet gevonden")

    service_key = str(payload.get("service_key") or "").strip()
    if not service_key:
        raise ValueError("service_key is verplicht")

    existing = db_fetchone(
        "SELECT * FROM customer_services WHERE customer_id=? AND service_key=?",
        (customer_id, service_key),
    ) or {}

    sid = str(existing.get("id") or uuid.uuid4())
    is_enabled = 1 if payload.get("is_enabled", existing.get("is_enabled", 1)) else 0
    onboarded_at = payload["onboarded_at"] if "onboarded_at" in payload else existing.get("onboarded_at")
    notes = (payload.get("notes") if "notes" in payload else existing.get("notes")) or None

    db_execute(
        "INSERT OR REPLACE INTO customer_services (id, customer_id, service_key, is_enabled, onboarded_at, notes) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (sid, customer_id, service_key, is_enabled, onboarded_at, notes),
    )

    row = db_fetchone("SELECT * FROM customer_services WHERE id=?", (sid,)) or {}
    return sid, row


def delete_customer_row(customer_id: str) -> None:
    db_execute("DELETE FROM customer_services WHERE customer_id=?", (customer_id,))
    db_execute("DELETE FROM customers WHERE id=?", (customer_id,))
