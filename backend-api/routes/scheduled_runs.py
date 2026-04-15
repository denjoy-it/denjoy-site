"""
Scheduled Runs & Assessment Schedules Routes

Handles one-time scheduled jobs AND recurring assessment schedule management.
"""

import re
import json
import uuid
from typing import Tuple, Dict, Any, Optional, Callable, List


# ── One-time Scheduled Runs ──────────────────────────────────────────────────

def dispatch_scheduled_runs_get_routes(
    path: str,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """GET routes voor eenmalige geplande runs."""
    db_fetchall = deps.get("db_fetchall")

    if path == "/api/scheduled-runs":
        items = db_fetchall(
            "SELECT id, job_type, tenant_id, status, scheduled_at, created_at, payload_json "
            "FROM job_queue WHERE job_type='assessment_run' ORDER BY scheduled_at ASC LIMIT 100"
        )
        for item in items:
            try:
                item["payload"] = json.loads(item.pop("payload_json") or "{}")
            except Exception:
                item["payload"] = {}
        return (200, {"items": items})

    return None


def dispatch_scheduled_runs_post_routes(
    path: str,
    read_json: Callable,
    session: Dict[str, Any],
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """POST routes voor eenmalige geplande runs."""
    enqueue_job = deps.get("enqueue_job")
    load_config = deps.get("load_config")

    if path == "/api/scheduled-runs":
        body = read_json()
        tid = (body.get("tenant_id") or "").strip()
        sched = (body.get("scheduled_at") or "").strip()
        phases = body.get("phases") or []

        if not tid or not sched:
            return (400, {"error": "tenant_id en scheduled_at zijn verplicht", "error_code": "validation_error"})

        job = enqueue_job(
            "assessment_run",
            tenant_id=tid,
            payload={
                "phases": phases,
                "note": body.get("note", ""),
                "run_mode": body.get("run_mode") or load_config().get("default_run_mode") or "demo",
                "scan_type": body.get("scan_type") or "full",
                "started_by": session.get("email", "job-scheduler"),
            },
            scheduled_at=sched,
        )
        return (201, {"ok": True, "job": job})

    return None


# ── Recurring Assessment Schedules ───────────────────────────────────────────

def dispatch_assessment_schedules_get_routes(
    path: str,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    GET /api/assessment-schedules              — alle schedules
    GET /api/assessment-schedules/{tenant_id}  — één schedule
    """
    list_assessment_schedules = deps.get("list_assessment_schedules")
    get_assessment_schedule = deps.get("get_assessment_schedule")

    if path == "/api/assessment-schedules":
        items = list_assessment_schedules() if list_assessment_schedules else []
        return (200, {"items": items})

    m = re.fullmatch(r"/api/assessment-schedules/([^/]+)", path)
    if m:
        tid = m.group(1)
        schedule = get_assessment_schedule(tid) if get_assessment_schedule else None
        if not schedule:
            return (404, {"error": "Geen schedule gevonden voor deze tenant"})
        return (200, {"schedule": schedule})

    return None


def dispatch_assessment_schedules_post_routes(
    path: str,
    read_json: Callable,
    session: Dict[str, Any],
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    POST /api/assessment-schedules/{tenant_id} — aanmaken/bijwerken schedule
    """
    upsert_assessment_schedule = deps.get("upsert_assessment_schedule")

    m = re.fullmatch(r"/api/assessment-schedules/([^/]+)", path)
    if m:
        tid = m.group(1)
        body = read_json()
        created_by = session.get("email", "portal")

        if not upsert_assessment_schedule:
            return (500, {"error": "upsert_assessment_schedule niet geconfigureerd"})

        # Validatie interval_hours
        interval = body.get("interval_hours")
        if interval is not None:
            try:
                interval = int(interval)
                if interval < 1 or interval > 8760:
                    return (400, {"error": "interval_hours moet tussen 1 en 8760 liggen"})
            except (ValueError, TypeError):
                return (400, {"error": "interval_hours moet een getal zijn"})

        schedule = upsert_assessment_schedule(tid, body, created_by)
        return (200, {"ok": True, "schedule": schedule})

    return None


def dispatch_assessment_schedules_delete_routes(
    path: str,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    DELETE /api/assessment-schedules/{tenant_id} — schedule verwijderen
    """
    delete_assessment_schedule = deps.get("delete_assessment_schedule")

    m = re.fullmatch(r"/api/assessment-schedules/([^/]+)", path)
    if m:
        tid = m.group(1)
        if not delete_assessment_schedule:
            return (500, {"error": "delete_assessment_schedule niet geconfigureerd"})
        deleted = delete_assessment_schedule(tid)
        if not deleted:
            return (404, {"error": "Geen schedule gevonden voor deze tenant"})
        return (200, {"ok": True, "deleted": True})

    return None
