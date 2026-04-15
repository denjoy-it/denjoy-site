"""Audit logging helper service."""

from __future__ import annotations

from typing import Any, Dict, Optional

from db_layer import db_execute, now_iso


class AuditService:
    """Small wrapper around the audit_logs table for explicit logging calls."""

    def log_event(
        self,
        action: str,
        user_email: Optional[str] = None,
        user_ip: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        detail: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> int:
        return db_execute(
            "INSERT INTO audit_logs (id,user_email,user_ip,action,resource_type,resource_id,detail,tenant_id,created_at) "
            "VALUES (lower(hex(randomblob(16))),?,?,?,?,?,?,?,?)",
            (user_email, user_ip, action, resource_type, resource_id, detail, tenant_id, now_iso()),
        )

    def build_event_payload(self, action: str, detail: Optional[str] = None) -> Dict[str, Any]:
        return {"action": action, "detail": detail, "ts": now_iso()}
