"""
Database Layer — Centralized SQLite operations.

Extracted from app.py to:
- Enable testability of database queries
- Facilitate caching layer enhancements
- Improve query debugging and performance analysis
"""

import sqlite3
import threading
import uuid
import os
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import logging
import traceback

logger = logging.getLogger(__name__)


# ============================================================
# PATHS & CONSTANTS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent          # backend-api/
PLATFORM_DIR = BASE_DIR.parent                      # workspace root/

# Desktop/bundled deployments can override paths via environment variables:
_data_dir_env = os.environ.get("M365_DATA_DIR")
_web_dir_env = os.environ.get("M365_WEB_DIR")

STORAGE_DIR = Path(_data_dir_env) if _data_dir_env else BASE_DIR / "storage"
WEB_DIR = Path(_web_dir_env) if _web_dir_env else PLATFORM_DIR / "frontend-portal"
DEFAULT_REPORTS_DIR = STORAGE_DIR / "html"
RUNS_DIR = STORAGE_DIR / "runs"
DB_PATH = STORAGE_DIR / "app.db"
CONFIG_PATH = STORAGE_DIR / "config.json"
SKU_FRIENDLY_MAP_PATH = PLATFORM_DIR / "shared" / "m365-sku-friendly-names.json"
CAPABILITY_MATRIX_PATH = PLATFORM_DIR / "shared" / "denjoy-capability-matrix.json"
MANAGEMENT_HUB_DIR = STORAGE_DIR / "intune_management_hub"


# ============================================================
# UTILITY FUNCTIONS
# ============================================================

def now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format (with timezone)."""
    return datetime.now(timezone.utc).astimezone().isoformat()


def ensure_dirs() -> None:
    """Ensure all required storage directories exist."""
    for path in [STORAGE_DIR, DEFAULT_REPORTS_DIR, RUNS_DIR, MANAGEMENT_HUB_DIR]:
        path.mkdir(parents=True, exist_ok=True)


def row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    """Convert sqlite3.Row to dictionary."""
    return {k: row[k] for k in row.keys()}


# ============================================================
# DATABASE CONNECTION & OPERATIONS
# ============================================================

# Thread-local storage voor hergebruik van database-connecties.
# Elke thread (request) krijgt één persistente connectie i.p.v. open/close per query.
_thread_local = threading.local()


def get_conn() -> sqlite3.Connection:
    """Get a thread-local database connection with row factory.

    The connection is created once per thread and reused for subsequent queries,
    eliminating the overhead of opening/closing a connection on every call.
    """
    ensure_dirs()
    conn = getattr(_thread_local, "conn", None)
    if conn is not None:
        try:
            conn.execute("SELECT 1")
        except sqlite3.ProgrammingError:
            # Een oudere codepad kan de thread-local connectie al hebben gesloten.
            # Herstel transparant zodat background threads niet blijven hangen op
            # "Cannot operate on a closed database."
            conn = None
            _thread_local.conn = None
    if conn is None:
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")   # betere concurrent read/write
        conn.execute("PRAGMA foreign_keys=ON")    # enforce FK constraints
        _thread_local.conn = conn
    return conn


def db_fetchall(sql: str, params: Tuple[Any, ...] = ()) -> List[Dict[str, Any]]:
    """Execute SELECT query and return list of result rows as dicts."""
    rows = get_conn().execute(sql, params).fetchall()
    return [row_to_dict(r) for r in rows]


def db_fetchone(sql: str, params: Tuple[Any, ...] = ()) -> Optional[Dict[str, Any]]:
    """Execute SELECT query and return single result row or None."""
    row = get_conn().execute(sql, params).fetchone()
    return row_to_dict(row) if row else None


def db_execute(sql: str, params: Tuple[Any, ...] = ()) -> int:
    """Execute write query (INSERT, UPDATE, DELETE) and return rows affected."""
    conn = get_conn()
    cur = conn.execute(sql, params)
    conn.commit()
    return cur.rowcount


# ============================================================
# DATABASE INITIALIZATION & SCHEMA
# ============================================================

def init_db() -> None:
    """Initialize database schema with all tables, indices, and seed data."""
    conn = get_conn()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS tenants (
            id TEXT PRIMARY KEY,
            customer_name TEXT NOT NULL,
            tenant_name TEXT NOT NULL,
            tenant_guid TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            owner_primary TEXT,
            owner_backup TEXT,
            tags_csv TEXT,
            risk_profile TEXT NOT NULL DEFAULT 'standard',
            notes TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS assessment_runs (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            status TEXT NOT NULL,
            run_mode TEXT NOT NULL,
            scan_type TEXT NOT NULL,
            phases_csv TEXT,
            started_by TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            exit_code INTEGER,
            score_overall INTEGER,
            critical_count INTEGER DEFAULT 0,
            warning_count INTEGER DEFAULT 0,
            info_count INTEGER DEFAULT 0,
            report_path TEXT,
            snapshot_path TEXT,
            report_filename TEXT,
            is_archived INTEGER NOT NULL DEFAULT 0,
            archived_at TEXT,
            archive_reason TEXT,
            error_message TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS finding_actions (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            run_id TEXT,
            finding_key TEXT NOT NULL,
            title TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'warning',
            owner TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            due_date TEXT,
            notes TEXT,
            evidence TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            closed_at TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (run_id) REFERENCES assessment_runs(id)
        );

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'klant',
            display_name TEXT,
            linked_tenant_id TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            email TEXT NOT NULL,
            display_name TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            user_email TEXT,
            user_ip TEXT,
            action TEXT NOT NULL,
            resource_type TEXT,
            resource_id TEXT,
            detail TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS remediation_history (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            remediation_id TEXT NOT NULL,
            title TEXT NOT NULL,
            executed_by TEXT,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            dry_run INTEGER NOT NULL DEFAULT 0,
            params_json TEXT,
            result_json TEXT,
            error_message TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS provisioning_history (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            action TEXT NOT NULL,
            target_upn TEXT,
            target_display_name TEXT,
            executed_by TEXT,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            dry_run INTEGER NOT NULL DEFAULT 0,
            params_json TEXT,
            result_json TEXT,
            error_message TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS baselines (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            source_tenant_id TEXT,
            source_tenant_name TEXT,
            config_json TEXT NOT NULL,
            created_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS baseline_assignments (
            id TEXT PRIMARY KEY,
            baseline_id TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            assigned_by TEXT,
            assigned_at TEXT NOT NULL,
            last_checked_at TEXT,
            last_applied_at TEXT,
            compliance_score INTEGER,
            compliance_json TEXT,
            status TEXT NOT NULL DEFAULT 'assigned',
            FOREIGN KEY (baseline_id) REFERENCES baselines(id),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            UNIQUE(baseline_id, tenant_id)
        );

        CREATE TABLE IF NOT EXISTS baseline_history (
            id TEXT PRIMARY KEY,
            baseline_id TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            action TEXT NOT NULL,
            executed_by TEXT,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            dry_run INTEGER NOT NULL DEFAULT 0,
            result_json TEXT,
            error_message TEXT,
            FOREIGN KEY (baseline_id) REFERENCES baselines(id),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        
        CREATE TABLE IF NOT EXISTS intune_scan_history (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            action TEXT NOT NULL,
            executed_by TEXT,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            dry_run INTEGER NOT NULL DEFAULT 0,
            result_json TEXT,
            error_message TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        
        CREATE TABLE IF NOT EXISTS backup_history (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            action TEXT NOT NULL,
            executed_by TEXT,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            result_json TEXT,
            error_message TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        
        CREATE TABLE IF NOT EXISTS ca_history (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            action TEXT NOT NULL,
            policy_id TEXT,
            executed_by TEXT,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            result_json TEXT,
            error_message TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );
        
        CREATE TABLE IF NOT EXISTS alert_config (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL UNIQUE,
            webhook_url TEXT,
            webhook_type TEXT NOT NULL DEFAULT 'teams',
            email_addr TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scan_findings (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            domain TEXT NOT NULL,
            control TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'info',
            finding TEXT,
            impact TEXT NOT NULL DEFAULT 'low',
            recommendation TEXT,
            service TEXT,
            metric_value REAL,
            raw_json TEXT,
            scanned_at TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        -- ── Fase 3: MSP control plane tabellen ─────────────────────────────────
        CREATE TABLE IF NOT EXISTS customers (
            id                    TEXT PRIMARY KEY,
            name                  TEXT NOT NULL,
            status                TEXT NOT NULL DEFAULT 'active',
            primary_contact_name  TEXT,
            primary_contact_email TEXT,
            service_tier          TEXT,
            support_model         TEXT,
            renewal_date          TEXT,
            sla_name              TEXT,
            notes                 TEXT,
            created_at            TEXT NOT NULL,
            updated_at            TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS customer_services (
            id           TEXT PRIMARY KEY,
            customer_id  TEXT NOT NULL,
            service_key  TEXT NOT NULL,
            is_enabled   INTEGER NOT NULL DEFAULT 1,
            onboarded_at TEXT,
            notes        TEXT,
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            UNIQUE(customer_id, service_key)
        );

        CREATE TABLE IF NOT EXISTS integrations (
            id                         TEXT PRIMARY KEY,
            tenant_id                  TEXT,
            integration_type           TEXT NOT NULL,
            status                     TEXT NOT NULL DEFAULT 'unknown',
            auth_mode                  TEXT,
            gdap_status                TEXT,
            lighthouse_status          TEXT,
            app_registration_status    TEXT,
            certificate_status         TEXT,
            last_validated_at          TEXT,
            details_json               TEXT,
            created_at                 TEXT NOT NULL,
            updated_at                 TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS m365_snapshots (
            id                TEXT PRIMARY KEY,
            tenant_id         TEXT NOT NULL,
            section           TEXT NOT NULL,
            subsection        TEXT NOT NULL,
            source_type       TEXT NOT NULL DEFAULT 'assessment',
            generated_at      TEXT NOT NULL,
            stale_after_at    TEXT,
            data_json         TEXT,
            summary_json      TEXT,
            assessment_run_id TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (assessment_run_id) REFERENCES assessment_runs(id)
        );

        CREATE TABLE IF NOT EXISTS action_logs (
            id             TEXT PRIMARY KEY,
            portal_user_id TEXT,
            tenant_id      TEXT,
            engine         TEXT,
            section        TEXT,
            subsection     TEXT,
            action_type    TEXT NOT NULL,
            target_id      TEXT,
            result         TEXT NOT NULL DEFAULT 'success',
            error_message  TEXT,
            metadata_json  TEXT,
            created_at     TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS approvals (
            id              TEXT PRIMARY KEY,
            action_log_id   TEXT NOT NULL,
            approval_status TEXT NOT NULL DEFAULT 'pending',
            requested_by    TEXT,
            approved_by     TEXT,
            requested_at    TEXT NOT NULL,
            approved_at     TEXT,
            reason          TEXT,
            FOREIGN KEY (action_log_id) REFERENCES action_logs(id)
        );

        -- ── Fase 6: Rollen en klant-toegangsmodel ─────────────────────────────
        CREATE TABLE IF NOT EXISTS portal_roles (
            id          TEXT PRIMARY KEY,
            role_key    TEXT NOT NULL UNIQUE,
            label       TEXT NOT NULL,
            description TEXT,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_customer_access (
            id             TEXT PRIMARY KEY,
            portal_user_id TEXT NOT NULL,
            customer_id    TEXT NOT NULL,
            portal_role_id TEXT NOT NULL,
            scope          TEXT,
            granted_by     TEXT,
            granted_at     TEXT NOT NULL,
            expires_at     TEXT,
            FOREIGN KEY (portal_user_id) REFERENCES users(id),
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            FOREIGN KEY (portal_role_id) REFERENCES portal_roles(id),
            UNIQUE(portal_user_id, customer_id)
        );

        -- ── Fase 4: Azure subscriptions registry ──────────────────────────────
        CREATE TABLE IF NOT EXISTS subscriptions (
            id                    TEXT PRIMARY KEY,
            tenant_id             TEXT NOT NULL,
            azure_subscription_id TEXT NOT NULL,
            display_name          TEXT,
            state                 TEXT NOT NULL DEFAULT 'active',
            lighthouse_onboarded  INTEGER NOT NULL DEFAULT 0,
            management_group      TEXT,
            created_at            TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            UNIQUE(tenant_id, azure_subscription_id)
        );

        -- ── Fase 4: Azure snapshot tabellen ───────────────────────────────────
        CREATE TABLE IF NOT EXISTS azure_resource_snapshots (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            subscription_id TEXT,
            section         TEXT NOT NULL,
            subsection      TEXT NOT NULL,
            generated_at    TEXT NOT NULL,
            stale_after_at  TEXT,
            data_json       TEXT,
            summary_json    TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS alert_snapshots (
            id           TEXT PRIMARY KEY,
            tenant_id    TEXT NOT NULL,
            alert_type   TEXT NOT NULL,
            generated_at TEXT NOT NULL,
            data_json    TEXT,
            summary_json TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        CREATE TABLE IF NOT EXISTS cost_snapshots (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            subscription_id TEXT,
            period_start    TEXT NOT NULL,
            period_end      TEXT NOT NULL,
            generated_at    TEXT NOT NULL,
            data_json       TEXT,
            summary_json    TEXT,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
        );

        -- ── Fase 7: Job queue voor assessment en live retrieval ────────────────
        CREATE TABLE IF NOT EXISTS job_queue (
            id                TEXT PRIMARY KEY,
            job_type          TEXT NOT NULL,
            tenant_id         TEXT,
            payload_json      TEXT,
            status            TEXT NOT NULL DEFAULT 'pending',
            priority          INTEGER NOT NULL DEFAULT 5,
            attempt_count     INTEGER NOT NULL DEFAULT 0,
            max_attempts      INTEGER NOT NULL DEFAULT 3,
            scheduled_at      TEXT NOT NULL,
            started_at        TEXT,
            completed_at      TEXT,
            error_message     TEXT,
            result_json       TEXT,
            depends_on_job_id TEXT,
            workflow_id       TEXT,
            progress_steps    TEXT,
            current_step      INTEGER DEFAULT 0,
            created_at        TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id),
            FOREIGN KEY (depends_on_job_id) REFERENCES job_queue(id)
        );

        CREATE TABLE IF NOT EXISTS service_access_policies (
            id              TEXT PRIMARY KEY,
            customer_id     TEXT NOT NULL,
            service_key     TEXT NOT NULL,
            role_key        TEXT NOT NULL,
            can_read        INTEGER NOT NULL DEFAULT 0,
            can_write       INTEGER NOT NULL DEFAULT 0,
            can_approve     INTEGER NOT NULL DEFAULT 0,
            granted_by      TEXT,
            granted_at      TEXT NOT NULL,
            expires_at      TEXT,
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            UNIQUE(customer_id, service_key, role_key)
        );

        CREATE TABLE IF NOT EXISTS approval_policies (
            id                TEXT PRIMARY KEY,
            action_key        TEXT NOT NULL UNIQUE,
            requires_approval INTEGER NOT NULL DEFAULT 0,
            min_approvers     INTEGER NOT NULL DEFAULT 1,
            allowed_roles     TEXT,
            created_at        TEXT NOT NULL
        );

        -- Approval requests: for frontend to request approval on sensitive write actions
        CREATE TABLE IF NOT EXISTS approval_requests (
            id                  TEXT PRIMARY KEY,
            action_key          TEXT NOT NULL,
            action_name         TEXT,
            action_description  TEXT,
            requested_by        TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'pending',
            approved_by         TEXT,
            requested_at        TEXT NOT NULL,
            approved_at         TEXT,
            expires_at          TEXT,
            FOREIGN KEY (requested_by) REFERENCES users(email)
        );
        """
    )
    
    # ── Lightweight schema migration for existing local DBs ────────────────────
    tenant_cols = {r[1] for r in cur.execute("PRAGMA table_info(tenants)").fetchall()}
    if "status" not in tenant_cols:
        cur.execute("ALTER TABLE tenants ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
    if "owner_primary" not in tenant_cols:
        cur.execute("ALTER TABLE tenants ADD COLUMN owner_primary TEXT")
    if "owner_backup" not in tenant_cols:
        cur.execute("ALTER TABLE tenants ADD COLUMN owner_backup TEXT")
    if "tags_csv" not in tenant_cols:
        cur.execute("ALTER TABLE tenants ADD COLUMN tags_csv TEXT")
    if "risk_profile" not in tenant_cols:
        cur.execute("ALTER TABLE tenants ADD COLUMN risk_profile TEXT NOT NULL DEFAULT 'standard'")
    
    run_cols = {r[1] for r in cur.execute("PRAGMA table_info(assessment_runs)").fetchall()}
    if "is_archived" not in run_cols:
        cur.execute("ALTER TABLE assessment_runs ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0")
    if "archived_at" not in run_cols:
        cur.execute("ALTER TABLE assessment_runs ADD COLUMN archived_at TEXT")
    if "archive_reason" not in run_cols:
        cur.execute("ALTER TABLE assessment_runs ADD COLUMN archive_reason TEXT")
    
    job_cols = {r[1] for r in cur.execute("PRAGMA table_info(job_queue)").fetchall()}
    if "depends_on_job_id" not in job_cols:
        cur.execute("ALTER TABLE job_queue ADD COLUMN depends_on_job_id TEXT REFERENCES job_queue(id)")
    if "workflow_id" not in job_cols:
        cur.execute("ALTER TABLE job_queue ADD COLUMN workflow_id TEXT")
    if "progress_steps" not in job_cols:
        cur.execute("ALTER TABLE job_queue ADD COLUMN progress_steps TEXT")
    if "current_step" not in job_cols:
        cur.execute("ALTER TABLE job_queue ADD COLUMN current_step INTEGER DEFAULT 0")
    
    action_cols = {r[1] for r in cur.execute("PRAGMA table_info(finding_actions)").fetchall()}
    if "kb_asset_id" not in action_cols:
        cur.execute("ALTER TABLE finding_actions ADD COLUMN kb_asset_id INTEGER")
    if "kb_asset_name" not in action_cols:
        cur.execute("ALTER TABLE finding_actions ADD COLUMN kb_asset_name TEXT")
    
    audit_cols = {r[1] for r in cur.execute("PRAGMA table_info(audit_logs)").fetchall()}
    if "tenant_id" not in audit_cols:
        cur.execute("ALTER TABLE audit_logs ADD COLUMN tenant_id TEXT")
    
    # Fase 3 — customer_id on tenants (optional coupling to customers table)
    tenant_cols_v2 = {r[1] for r in cur.execute("PRAGMA table_info(tenants)").fetchall()}
    if "customer_id" not in tenant_cols_v2:
        cur.execute("ALTER TABLE tenants ADD COLUMN customer_id TEXT REFERENCES customers(id)")
    
    # Fase 6 — extra columns on users table
    user_cols = {r[1] for r in cur.execute("PRAGMA table_info(users)").fetchall()}
    if "last_login_at" not in user_cols:
        cur.execute("ALTER TABLE users ADD COLUMN last_login_at TEXT")
    if "entra_object_id" not in user_cols:
        cur.execute("ALTER TABLE users ADD COLUMN entra_object_id TEXT")
    
    customer_cols = {r[1] for r in cur.execute("PRAGMA table_info(customers)").fetchall()}
    if "service_tier" not in customer_cols:
        cur.execute("ALTER TABLE customers ADD COLUMN service_tier TEXT")
    if "support_model" not in customer_cols:
        cur.execute("ALTER TABLE customers ADD COLUMN support_model TEXT")
    if "renewal_date" not in customer_cols:
        cur.execute("ALTER TABLE customers ADD COLUMN renewal_date TEXT")
    if "sla_name" not in customer_cols:
        cur.execute("ALTER TABLE customers ADD COLUMN sla_name TEXT")

    # alert_config: webhook notification drempelwaarden
    alert_config_cols = {r[1] for r in cur.execute("PRAGMA table_info(alert_config)").fetchall()}
    if "notify_on_critical" not in alert_config_cols:
        cur.execute("ALTER TABLE alert_config ADD COLUMN notify_on_critical INTEGER NOT NULL DEFAULT 1")
    if "score_threshold" not in alert_config_cols:
        cur.execute("ALTER TABLE alert_config ADD COLUMN score_threshold INTEGER NOT NULL DEFAULT 60")

    # ── Performance indexes (idempotent) ──────────────────────────────────────
    cur.executescript("""
        CREATE INDEX IF NOT EXISTS idx_runs_tenant_status
            ON assessment_runs(tenant_id, status);
        CREATE INDEX IF NOT EXISTS idx_runs_tenant_completed
            ON assessment_runs(tenant_id, completed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_actions_run
            ON finding_actions(run_id);
        CREATE INDEX IF NOT EXISTS idx_actions_tenant
            ON finding_actions(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_remediation_tenant
            ON remediation_history(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_ca_history_tenant
            ON ca_history(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_backup_history_tenant
            ON backup_history(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant
            ON audit_logs(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_ts
            ON audit_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_sessions_user
            ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires
            ON sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_baseline_assignments_tenant
            ON baseline_assignments(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_baseline_assignments_baseline
            ON baseline_assignments(baseline_id);
        CREATE INDEX IF NOT EXISTS idx_scan_findings_tenant_at
            ON scan_findings(tenant_id, scanned_at DESC);
        CREATE INDEX IF NOT EXISTS idx_scan_findings_domain
            ON scan_findings(domain, status);
        CREATE INDEX IF NOT EXISTS idx_scan_findings_control
            ON scan_findings(tenant_id, domain, control);
        CREATE INDEX IF NOT EXISTS idx_m365_snapshots_tenant_section
            ON m365_snapshots(tenant_id, section, subsection);
        CREATE INDEX IF NOT EXISTS idx_m365_snapshots_generated
            ON m365_snapshots(tenant_id, generated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_action_logs_tenant
            ON action_logs(tenant_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_integrations_tenant
            ON integrations(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_customers_status
            ON customers(status);
        CREATE INDEX IF NOT EXISTS idx_user_customer_access_user
            ON user_customer_access(portal_user_id);
        CREATE INDEX IF NOT EXISTS idx_user_customer_access_customer
            ON user_customer_access(customer_id);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant
            ON subscriptions(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_azure_snapshots_tenant
            ON azure_resource_snapshots(tenant_id, section, subsection);
        CREATE INDEX IF NOT EXISTS idx_alert_snapshots_tenant
            ON alert_snapshots(tenant_id, alert_type);
        CREATE INDEX IF NOT EXISTS idx_cost_snapshots_tenant
            ON cost_snapshots(tenant_id, period_start DESC);
        CREATE INDEX IF NOT EXISTS idx_job_queue_status
            ON job_queue(status, scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_job_queue_tenant
            ON job_queue(tenant_id, status);
        CREATE INDEX IF NOT EXISTS idx_job_queue_depends
            ON job_queue(depends_on_job_id, status);
        CREATE INDEX IF NOT EXISTS idx_job_queue_workflow
            ON job_queue(workflow_id, status);
        CREATE INDEX IF NOT EXISTS idx_service_access_customer
            ON service_access_policies(customer_id, service_key);
        CREATE INDEX IF NOT EXISTS idx_service_access_role
            ON service_access_policies(role_key);
        CREATE INDEX IF NOT EXISTS idx_approval_policies_action
            ON approval_policies(action_key);
        CREATE INDEX IF NOT EXISTS idx_service_access_expires
            ON service_access_policies(customer_id, expires_at);
        CREATE INDEX IF NOT EXISTS idx_user_customer_expires
            ON user_customer_access(customer_id, expires_at);
        CREATE INDEX IF NOT EXISTS idx_approval_requests_status
            ON approval_requests(status, requested_at DESC);
        CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_by
            ON approval_requests(requested_by, status);
        CREATE INDEX IF NOT EXISTS idx_approval_requests_action
            ON approval_requests(action_key, status);
        
        -- Materialized View Tables (for performance pre-computation)
        CREATE TABLE IF NOT EXISTS materialized_views_metadata (
            view_name       TEXT PRIMARY KEY,
            last_refreshed  TEXT,
            row_count       INTEGER,
            refresh_seconds INTEGER DEFAULT 300
        );
        
        CREATE TABLE IF NOT EXISTS tenant_health_aggregate (
            tenant_id               TEXT PRIMARY KEY,
            health_score            REAL,
            mfa_coverage_pct        REAL,
            ca_enabled              INTEGER,
            secure_score_pct        REAL,
            licenses_assigned       INTEGER,
            users_active            INTEGER,
            assessment_generated_at TEXT,
            last_updated            TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS customer_cost_summary (
            customer_id         TEXT PRIMARY KEY,
            total_licenses      INTEGER DEFAULT 0,
            total_monthly_cost  REAL DEFAULT 0.0,
            cost_per_license    REAL DEFAULT 0.0,
            period_start        TEXT,
            period_end          TEXT,
            last_updated        TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS assessment_run_stats (
            tenant_id         TEXT PRIMARY KEY,
            last_run_id       TEXT,
            last_run_status   TEXT,
            run_count         INTEGER DEFAULT 0,
            avg_duration_mins REAL DEFAULT 0.0,
            last_run_at       TEXT,
            last_updated      TEXT NOT NULL
        );

        -- Webhook notification deduplicatie log
        CREATE TABLE IF NOT EXISTS notification_log (
            id         TEXT PRIMARY KEY,
            tenant_id  TEXT NOT NULL,
            event_type TEXT NOT NULL,
            run_id     TEXT,
            fired_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notification_log_tenant
            ON notification_log(tenant_id, event_type, fired_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notification_log_run
            ON notification_log(run_id);

        -- Scheduled assessment configuratie per tenant
        CREATE TABLE IF NOT EXISTS assessment_schedules (
            id             TEXT PRIMARY KEY,
            tenant_id      TEXT NOT NULL UNIQUE,
            enabled        INTEGER NOT NULL DEFAULT 1,
            interval_hours INTEGER NOT NULL DEFAULT 168,
            phases_csv     TEXT NOT NULL DEFAULT 'users,collaboration,compliance,security,intune,azure',
            run_mode       TEXT NOT NULL DEFAULT 'live',
            last_run_at    TEXT,
            next_run_at    TEXT NOT NULL,
            created_by     TEXT NOT NULL,
            created_at     TEXT NOT NULL,
            updated_at     TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_assessment_schedules_next
            ON assessment_schedules(next_run_at, enabled);
    """)
    
    conn.commit()
    
    # ── Seed default portal_roles if they don't exist ─────────────────────────
    _default_roles = [
        ("msp_super_admin", "MSP Super Admin", "Volledige platformtoegang"),
        ("engineer", "Engineer", "Operationele toegang, acties uitvoeren"),
        ("monitoring_operator", "Monitoring Operator", "Lezen en monitoring, geen schrijftoegang"),
        ("billing_analyst", "Billing Analyst", "Toegang tot kosten- en licentiedata"),
        ("read_only", "Alleen lezen", "Read-only toegang tot alle modules"),
    ]
    
    for rkey, rlabel, rdesc in _default_roles:
        existing = cur.execute("SELECT id FROM portal_roles WHERE role_key=?", (rkey,)).fetchone()
        if not existing:
            cur.execute(
                "INSERT INTO portal_roles (id, role_key, label, description, created_at) VALUES (?,?,?,?,?)",
                (str(uuid.uuid4()), rkey, rlabel, rdesc, now_iso()),
            )
    
    conn.commit()

    # ── Seed service_access_policies for intune_policy_mgmt ──────────────────
    # Grants default access by role key — customer-specific overrides can be added via admin UI.
    # NOTE: these are global defaults keyed on ("__default__", service_key, role_key).
    # For per-customer grants the admin must insert rows with the real customer_id.
    _default_sap = [
        ("msp_super_admin", 1, 1, 1),  # read + write + approve
        ("engineer",        1, 0, 0),  # read only
    ]
    for role_key, can_r, can_w, can_a in _default_sap:
        existing = cur.execute(
            "SELECT id FROM service_access_policies WHERE customer_id=? AND service_key=? AND role_key=?",
            ("__default__", "intune_policy_mgmt", role_key),
        ).fetchone()
        if not existing:
            cur.execute(
                """
                INSERT INTO service_access_policies
                  (id, customer_id, service_key, role_key, can_read, can_write, can_approve, granted_by, granted_at)
                VALUES (?,?,?,?,?,?,?,?,?)
                """,
                (str(uuid.uuid4()), "__default__", "intune_policy_mgmt", role_key, can_r, can_w, can_a, "system", now_iso()),
            )

    conn.commit()

    # ── Seed default approval policies ───────────────────────────────────────
    _default_approval_policies = [
        ("customer.access.manage", 1, 1, "msp_super_admin"),
        ("onboarding.plan.launch", 1, 1, "msp_super_admin"),
        ("integrations.write", 0, 0, ""),
        ("jobs.enqueue", 0, 0, ""),
    ]
    
    for action_key, requires_app, min_app, allowed_roles in _default_approval_policies:
        existing = cur.execute("SELECT id FROM approval_policies WHERE action_key=?", (action_key,)).fetchone()
        if not existing:
            cur.execute(
                "INSERT INTO approval_policies (id, action_key, requires_approval, min_approvers, allowed_roles, created_at) VALUES (?,?,?,?,?,?)",
                (str(uuid.uuid4()), action_key, requires_app, min_app, allowed_roles, now_iso()),
            )
    
    conn.commit()
    
    # ── Seed demo tenant if database is empty ────────────────────────────────
    count = cur.execute("SELECT COUNT(*) FROM tenants").fetchone()[0]
    if count == 0:
        tenant_id = str(uuid.uuid4())
        ts = now_iso()
        cur.execute(
            """
            INSERT INTO tenants (id, customer_name, tenant_name, tenant_guid, notes, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                tenant_id,
                "Lokale Demo Klant",
                "Lokale Tenant",
                None,
                "Aangemaakt voor lokale MVP",
                ts,
                ts,
            ),
        )
        conn.commit()

    logger.info("Database initialized successfully at %s", DB_PATH)
