"""
Denjoy IT Platform — PowerShell Service
Handles PowerShell script execution, findings persistence, and health scoring.
"""
from __future__ import annotations

import json
import logging
import subprocess
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from db_layer import (
    db_execute,
    db_fetchall,
    db_fetchone,
    get_conn,
    PLATFORM_DIR,
    RUNS_DIR,
    STORAGE_DIR,
    now_iso,
)

logger = logging.getLogger(__name__)

# ── Dependency injection slots (set from app.py after import) ─────────────────
# app.py must do:
#   import services.powershell_service as _ps_svc
#   _ps_svc._get_tenant_auth_profile_fn = get_tenant_auth_profile
#   _ps_svc._load_config_fn = load_config
#   _ps_svc._db_audit_fn = db_audit
#   _ps_svc._find_latest_summary_file_fn = find_latest_summary_file

_get_tenant_auth_profile_fn: Optional[Callable[..., Any]] = None
_load_config_fn: Optional[Callable[..., Any]] = None
_db_audit_fn: Optional[Callable[..., Any]] = None
_find_latest_summary_file_fn: Optional[Callable[..., Any]] = None


def _get_tenant_auth_profile(tenant_id: str, include_secret: bool = False) -> Dict[str, Any]:
    if _get_tenant_auth_profile_fn is None:
        raise RuntimeError("_get_tenant_auth_profile_fn not injected into powershell_service")
    return _get_tenant_auth_profile_fn(tenant_id, include_secret=include_secret)


def _load_config() -> Dict[str, Any]:
    if _load_config_fn is None:
        raise RuntimeError("_load_config_fn not injected into powershell_service")
    return _load_config_fn()


def _db_audit(*args: Any, **kwargs: Any) -> None:
    if _db_audit_fn is not None:
        _db_audit_fn(*args, **kwargs)


def _find_latest_summary_file(run_dir: Path) -> Optional[Path]:
    if _find_latest_summary_file_fn is None:
        return None
    return _find_latest_summary_file_fn(run_dir)


# ── Script paths ──────────────────────────────────────────────────────────────

_USER_MGMT_SCRIPT = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyUserManagement.ps1"
_BASELINE_SCRIPT  = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyBaseline.ps1"
_INTUNE_SCRIPT    = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyIntune.ps1"
_BACKUP_SCRIPT    = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyBackup.ps1"
_CA_SCRIPT        = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyCa.ps1"
_DOMAINS_SCRIPT   = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyDomains.ps1"
_ALERTS_SCRIPT    = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyAlerts.ps1"
_EXCHANGE_SCRIPT  = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyExchange.ps1"
_IDENTITY_SCRIPT  = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyIdentity.ps1"
_HYBRID_SCRIPT    = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyHybrid.ps1"
_CIS_SCRIPT       = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyCis.ps1"
_APPREGS_SCRIPT   = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyApps.ps1"
_COLLAB_SCRIPT    = PLATFORM_DIR / "assessment-engine" / "Invoke-DenjoyCollaboration.ps1"


# ══════════════════════════════════════════════════════════════════════════════
# User Management
# ══════════════════════════════════════════════════════════════════════════════

def _run_user_mgmt(
    tenant_id: str,
    action: str,
    params: Dict[str, Any],
    dry_run: bool = False,
    executed_by: str = "admin",
) -> Dict[str, Any]:
    """Voert een user-management actie uit via PowerShell en logt het resultaat."""
    import shutil

    tenant = db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,))
    if not tenant:
        raise ValueError("Tenant niet gevonden")

    tenant_guid = (tenant.get("tenant_guid") or "").strip()
    if not tenant_guid:
        raise ValueError(
            "Tenant GUID niet geconfigureerd. "
            "Vul de Tenant GUID in bij Admin > Tenants."
        )

    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    cfg = _load_config()
    client_id  = (profile.get("auth_client_id") or cfg.get("auth_client_id") or "").strip()
    cert_thumb = (profile.get("auth_cert_thumbprint") or cfg.get("auth_cert_thumbprint") or "").strip()
    client_sec = (profile.get("auth_client_secret") or cfg.get("auth_client_secret") or "").strip()

    if not client_id:
        raise ValueError(
            "App-registratie (Client ID) niet geconfigureerd. "
            "Stel dit in via Admin > Tenant-instellingen."
        )

    ps_script = _USER_MGMT_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"User-management script niet gevonden: {ps_script}")

    pwsh = shutil.which("pwsh") or shutil.which("powershell")
    if not pwsh:
        raise RuntimeError("PowerShell niet gevonden op dit systeem.")

    params_json_str = json.dumps(params, ensure_ascii=False)

    cmd = [
        pwsh, "-NoLogo", "-NoProfile", "-NonInteractive",
        "-File", str(ps_script),
        "-Action", action,
        "-TenantId", tenant_guid,
        "-ClientId", client_id,
        "-ParamsJson", params_json_str,
    ]
    if cert_thumb:
        cmd += ["-CertThumbprint", cert_thumb]
    if client_sec and not cert_thumb:
        cmd += ["-ClientSecret", client_sec]
    if dry_run:
        cmd.append("-DryRun")

    result_data: Dict[str, Any] = {}
    error_message: Optional[str] = None
    status = "success"

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        output = (proc.stdout or "").strip()
        if proc.returncode != 0:
            status = "failed"
            error_message = output[-2000:] if output else f"PowerShell exit code {proc.returncode}"
        else:
            marker = "##RESULT##"
            if marker in output:
                json_part = output[output.rfind(marker) + len(marker):].strip()
                try:
                    result_data = json.loads(json_part)
                except Exception:
                    result_data = {"raw_output": output[-500:]}
            else:
                result_data = {"output": output[-500:]}
    except subprocess.TimeoutExpired:
        status = "failed"
        error_message = "Actie timed out (120s)"
    except Exception as exc:
        status = "failed"
        error_message = str(exc)

    # Schrijf/muteer-acties loggen in provisioning_history
    if action in ("create-user", "offboard-user"):
        final_status = "dry_run" if (dry_run and status == "success") else status
        target_upn = params.get("userPrincipalName") or params.get("user_id") or ""
        target_display = params.get("displayName") or params.get("display_name") or target_upn
        db_execute(
            """
            INSERT INTO provisioning_history
            (id, tenant_id, action, target_upn, target_display_name, executed_by, executed_at,
             status, dry_run, params_json, result_json, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()), tenant_id, action, target_upn, target_display,
                executed_by, now_iso(), final_status, 1 if dry_run else 0,
                params_json_str,
                json.dumps(result_data, ensure_ascii=False) if result_data else None,
                error_message,
            ),
        )
        _db_audit(
            executed_by, "", f"user_mgmt_{action}",
            "tenant", tenant_id,
            f"action={action} target={target_upn} dry_run={dry_run} status={final_status}",
        )

    ok = (status == "success")
    return {
        "ok": ok,
        "result": result_data if ok else {},
        "error": error_message if not ok else None,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Baseline & Gold Tenant
# ══════════════════════════════════════════════════════════════════════════════

def _run_baseline_ps(
    tenant_id: str,
    action: str,
    params: Dict[str, Any],
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Voert een baseline-actie uit via PowerShell."""
    import shutil

    tenant = db_fetchone("SELECT * FROM tenants WHERE id=?", (tenant_id,))
    if not tenant:
        raise ValueError("Tenant niet gevonden")
    tenant_guid = (tenant.get("tenant_guid") or "").strip()
    if not tenant_guid:
        raise ValueError("Tenant GUID niet geconfigureerd.")

    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    cfg = _load_config()
    client_id  = (profile.get("auth_client_id") or cfg.get("auth_client_id") or "").strip()
    cert_thumb = (profile.get("auth_cert_thumbprint") or cfg.get("auth_cert_thumbprint") or "").strip()
    client_sec = (profile.get("auth_client_secret") or cfg.get("auth_client_secret") or "").strip()

    if not client_id:
        raise ValueError("App-registratie (Client ID) niet geconfigureerd.")

    ps_script = _BASELINE_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Baseline-script niet gevonden: {ps_script}")

    pwsh = shutil.which("pwsh") or shutil.which("powershell")
    if not pwsh:
        raise RuntimeError("PowerShell niet gevonden.")

    params_json_str = json.dumps(params, ensure_ascii=False)
    cmd = [
        pwsh, "-NoLogo", "-NoProfile", "-NonInteractive",
        "-File", str(ps_script),
        "-Action", action,
        "-TenantId", tenant_guid,
        "-ClientId", client_id,
        "-ParamsJson", params_json_str,
    ]
    if cert_thumb:
        cmd += ["-CertThumbprint", cert_thumb]
    if client_sec and not cert_thumb:
        cmd += ["-ClientSecret", client_sec]
    if dry_run:
        cmd.append("-DryRun")

    result_data: Dict[str, Any] = {}
    error_message: Optional[str] = None
    status = "success"

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", timeout=180,
        )
        output = (proc.stdout or "").strip()
        if proc.returncode != 0:
            status = "failed"
            error_message = output[-2000:] if output else f"Exit code {proc.returncode}"
        else:
            marker = "##RESULT##"
            if marker in output:
                json_part = output[output.rfind(marker) + len(marker):].strip()
                try:
                    result_data = json.loads(json_part)
                except Exception:
                    result_data = {"raw_output": output[-500:]}
            else:
                result_data = {"output": output[-500:]}
    except subprocess.TimeoutExpired:
        status = "failed"
        error_message = "Baseline actie timed out (180s)"
    except Exception as exc:
        status = "failed"
        error_message = str(exc)

    return {"ok": status == "success", "result": result_data, "error": error_message}


# ══════════════════════════════════════════════════════════════════════════════
# Intune
# ══════════════════════════════════════════════════════════════════════════════

def _run_intune_ps(tenant_id: str, action: str, params: Dict[str, Any], dry_run: bool = False, executed_by: str = "system") -> Dict[str, Any]:
    """Voer een Intune PS-actie uit en log naar intune_scan_history."""
    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _INTUNE_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Intune script niet gevonden: {ps_script}")

    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId",  profile["auth_tenant_id"],
        "-ClientId",  profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    if dry_run:
        cmd.append("-DryRun")

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    logger.info("[Intune] action=%s tenant=%s dry_run=%s exit=%s", action, tenant_id, dry_run, proc.returncode)

    result: Dict[str, Any] = {}
    if "##RESULT##" in output:
        try:
            result = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
        except Exception:
            result = {"ok": False, "error": "Kon resultaat niet parsen"}
    else:
        result = {"ok": False, "error": output[-500:] if output else "Geen output"}

    # Log in history
    final_status = "dry_run" if dry_run else ("success" if result.get("ok") else "failed")
    err_msg = result.get("error") if not result.get("ok") else None
    db_execute(
        "INSERT INTO intune_scan_history (id,tenant_id,action,executed_by,executed_at,status,dry_run,result_json,error_message) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (str(uuid.uuid4()), tenant_id, action, executed_by, now_iso(), final_status, int(dry_run),
         json.dumps(result), err_msg)
    )
    return result


# ══════════════════════════════════════════════════════════════════════════════
# Backup
# ══════════════════════════════════════════════════════════════════════════════

def _run_backup_ps(tenant_id: str, action: str, executed_by: str = "system") -> Dict[str, Any]:
    """Voer een Backup PS-actie uit en log naar backup_history."""
    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _BACKUP_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Backup script niet gevonden: {ps_script}")

    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId",  profile["auth_tenant_id"],
        "-ClientId",  profile["auth_client_id"],
        "-ParamsJson", "{}",
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    output = proc.stdout + proc.stderr
    logger.info("[Backup] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)

    result: Dict[str, Any] = {}
    if "##RESULT##" in output:
        try:
            result = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
        except Exception:
            result = {"ok": False, "error": "Kon resultaat niet parsen"}
    else:
        result = {"ok": False, "error": output[-500:] if output else "Geen output"}

    final_status = "success" if result.get("ok") else "failed"
    err_msg = result.get("error") if not result.get("ok") else None
    db_execute(
        "INSERT INTO backup_history (id,tenant_id,action,executed_by,executed_at,status,result_json,error_message) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (str(uuid.uuid4()), tenant_id, action, executed_by, now_iso(), final_status,
         json.dumps(result), err_msg)
    )
    return result


# ══════════════════════════════════════════════════════════════════════════════
# Conditional Access
# ══════════════════════════════════════════════════════════════════════════════

def _run_ca_ps(tenant_id: str, action: str, params: Dict[str, Any], dry_run: bool = False, executed_by: str = "system") -> Dict[str, Any]:
    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _CA_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"CA script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    if dry_run:
        cmd.append("-DryRun")
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    output = proc.stdout + proc.stderr
    logger.info("[CA] action=%s tenant=%s dry_run=%s exit=%s", action, tenant_id, dry_run, proc.returncode)
    result: Dict[str, Any] = {}
    if "##RESULT##" in output:
        try:
            result = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            if action == "list-policies" and not dry_run:
                threading.Thread(target=_persist_live_findings, args=(tenant_id, "ca", action, result), daemon=True).start()
        except Exception:
            result = {"ok": False, "error": "Parse fout"}
    else:
        result = {"ok": False, "error": output[-500:] if output else "Geen output"}
    final_status = "dry_run" if dry_run else ("success" if result.get("ok") else "failed")
    policy_id = params.get("policy_id")
    db_execute(
        "INSERT INTO ca_history (id,tenant_id,action,policy_id,executed_by,executed_at,status,result_json,error_message) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (str(uuid.uuid4()), tenant_id, action, policy_id, executed_by, now_iso(), final_status,
         json.dumps(result), result.get("error") if not result.get("ok") else None)
    )
    return result


# ══════════════════════════════════════════════════════════════════════════════
# Domains Analyser
# ══════════════════════════════════════════════════════════════════════════════

def _run_domains_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _DOMAINS_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Domains script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    output = proc.stdout + proc.stderr
    logger.info("[Domains] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            return json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


# ══════════════════════════════════════════════════════════════════════════════
# Alerts & Audit Logs
# ══════════════════════════════════════════════════════════════════════════════

def _run_alerts_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _ALERTS_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Alerts script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    output = proc.stdout + proc.stderr
    logger.info("[Alerts] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            return json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


# ══════════════════════════════════════════════════════════════════════════════
# Exchange
# ══════════════════════════════════════════════════════════════════════════════

def _run_exchange_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _EXCHANGE_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Exchange script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    logger.info("[Exchange] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            data = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            threading.Thread(target=_persist_live_findings, args=(tenant_id, "exchange", action, data), daemon=True).start()
            return data
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


# ══════════════════════════════════════════════════════════════════════════════
# SCAN FINDINGS — extractors
# ══════════════════════════════════════════════════════════════════════════════

def _status_from_pct(pct: float, ok_threshold: float = 95.0, warn_threshold: float = 75.0) -> str:
    if pct >= ok_threshold:
        return "ok"
    if pct >= warn_threshold:
        return "warning"
    return "critical"


def _impact_from_status(status: str) -> str:
    return {"ok": "low", "warning": "high", "critical": "critical", "info": "low"}.get(status, "medium")


def _extract_identity_mfa(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    total = int(data.get("total") or 0)
    registered = int(data.get("mfaRegistered") or 0)
    pct = float(data.get("mfaPercentage") or 0)
    status = _status_from_pct(pct)
    recs = {
        "ok": "MFA-dekking is goed. Overweeg passwordless uitrol (Microsoft Authenticator + FIDO2).",
        "warning": "Verhoog MFA-dekking. Gebruik een CA-policy om MFA te vereisen voor alle gebruikers.",
        "critical": "Kritiek: implementeer direct een CA-policy die MFA vereist. Alle accounts zijn kwetsbaar.",
    }
    findings.append({"control": "mfa-coverage", "title": "MFA-registratie gebruikers",
        "status": status, "impact": _impact_from_status(status),
        "finding": f"{registered}/{total} gebruikers MFA-geregistreerd ({pct}%)",
        "recommendation": recs[status], "service": "Identity Beheer", "metric_value": pct})
    users = data.get("users") or []
    admin_no_mfa = [u for u in users if u.get("isAdmin") and not u.get("isMfaRegistered")]
    if admin_no_mfa:
        findings.append({"control": "admin-mfa", "title": f"Admins zonder MFA ({len(admin_no_mfa)})",
            "status": "critical", "impact": "critical",
            "finding": f"{len(admin_no_mfa)} beheerdersaccount(s) zonder MFA-registratie gedetecteerd",
            "recommendation": "Vereis direct MFA voor alle beheerdersaccounts via CA-policy.",
            "service": "Identity Beheer", "metric_value": float(len(admin_no_mfa))})
    elif total > 0:
        findings.append({"control": "admin-mfa", "title": "Admin MFA-dekking",
            "status": "ok", "impact": "low",
            "finding": "Alle beheerdersaccounts hebben MFA geregistreerd",
            "recommendation": "Handhaven.", "service": "Identity Beheer", "metric_value": 0.0})
    return findings


def _extract_identity_guests(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    guests = data.get("guests") or []
    total = int(data.get("count") or len(guests))
    if total == 0:
        return [{"control": "guest-accounts", "title": "Gastaccounts",
            "status": "ok", "impact": "low",
            "finding": "Geen gastgebruikers gevonden in de tenant",
            "recommendation": "Geen actie vereist.", "service": "Identity Beheer", "metric_value": 0.0}]
    disabled = sum(1 for g in guests if not g.get("accountEnabled"))
    status = "ok" if total <= 20 else ("warning" if total <= 100 else "critical")
    return [{"control": "guest-accounts", "title": f"Gastaccounts ({total})",
        "status": status, "impact": _impact_from_status(status),
        "finding": f"{total} gastgebruikers aanwezig, {disabled} uitgeschakeld",
        "recommendation": "Review gastaccounts regelmatig. Verwijder inactieve gasten of gebruik Azure AD Access Reviews.",
        "service": "Identity Beheer", "metric_value": float(total)}]


def _extract_identity_security_defaults(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    enabled = data.get("securityDefaultsEnabled")
    ca_count = int(data.get("caEnabledPolicies") or 0)
    rec = data.get("recommendation") or ""
    if enabled is True and ca_count == 0:
        status, finding = "ok", "Security Defaults ingeschakeld (geen conflicterende CA-policies)"
    elif enabled is False and ca_count >= 3:
        status, finding = "ok", f"Security Defaults uitgeschakeld — {ca_count} CA-policies actief (correct)"
    elif enabled is False and ca_count == 0:
        status, finding = "critical", "Security Defaults uitgeschakeld én geen CA-policies actief"
    else:
        status, finding = "warning", f"Security Defaults: {'aan' if enabled else 'uit'}, {ca_count} CA-policies"
    return [{"control": "security-defaults", "title": "Security Defaults status",
        "status": status, "impact": _impact_from_status(status), "finding": finding,
        "recommendation": rec or "Zorg dat óf Security Defaults óf CA-policies actief zijn — niet beide.",
        "service": "Zero Trust Baseline", "metric_value": float(ca_count)}]


def _extract_identity_legacy_auth(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    users = data.get("users") or []
    count = int(data.get("affectedUsers") or len(users))
    if count == 0:
        return [{"control": "legacy-auth", "title": "Legacy authenticatie",
            "status": "ok", "impact": "low",
            "finding": "Geen legacy-auth activiteit gevonden (afgelopen 30 dagen)",
            "recommendation": "Handhaven. Overweeg een CA-policy om legacy auth expliciet te blokkeren.",
            "service": "Zero Trust Baseline", "metric_value": 0.0}]
    return [{"control": "legacy-auth", "title": f"Legacy auth actief ({count} gebruikers)",
        "status": "critical", "impact": "critical",
        "finding": f"{count} gebruiker(s) met legacy-auth activiteit in de afgelopen 30 dagen",
        "recommendation": "Blokkeer legacy authenticatie via CA-policy. Legacy clients omzeilen MFA.",
        "service": "Zero Trust Baseline", "metric_value": float(count)}]


def _extract_identity_admin_roles(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    roles = data.get("roles") or []
    total_admins = int(data.get("totalAdmins") or 0)
    role_count = int(data.get("roleCount") or len(roles))
    if total_admins < 2:
        status = "critical"
    elif total_admins > 6:
        status = "warning"
    else:
        status = "ok"
    return [{"control": "admin-roles", "title": f"Beheerdersrollen ({role_count} rollen, {total_admins} admins)",
        "status": status, "impact": _impact_from_status(status),
        "finding": f"{role_count} actieve directoryrolls met in totaal {total_admins} unieke admins",
        "recommendation": "Houd het aantal Global Admins beperkt (2–4). Gebruik privileged roles zo minimaal mogelijk.",
        "service": "Identity Beheer", "metric_value": float(total_admins)}]


def _extract_appregs(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    apps = data.get("apps") or []
    total = int(data.get("total") or len(apps))
    expired = int(data.get("expired") or 0)
    critical_n = int(data.get("critical") or 0)
    warning_n = int(data.get("warning") or 0)
    if expired > 0:
        findings.append({"control": "appregs-expired", "title": f"Verlopen secrets/certs ({expired})",
            "status": "critical", "impact": "critical",
            "finding": f"{expired} app-registratie(s) met verlopen secret of certificaat",
            "recommendation": "Vernieuw direct alle verlopen secrets en certificaten om uitval te voorkomen.",
            "service": "App Registraties", "metric_value": float(expired)})
    if critical_n > 0:
        findings.append({"control": "appregs-expiring-soon", "title": f"Secrets verlopen binnen 14 dagen ({critical_n})",
            "status": "critical", "impact": "high",
            "finding": f"{critical_n} app-registratie(s) met secret/cert dat binnen 14 dagen verloopt",
            "recommendation": "Vernieuw deze secrets/certs op zeer korte termijn.",
            "service": "App Registraties", "metric_value": float(critical_n)})
    if warning_n > 0:
        findings.append({"control": "appregs-expiring-warning", "title": f"Secrets verlopen binnen 30 dagen ({warning_n})",
            "status": "warning", "impact": "medium",
            "finding": f"{warning_n} app-registratie(s) met secret/cert dat binnen 30 dagen verloopt",
            "recommendation": "Plan het vernieuwen van deze secrets/certs.",
            "service": "App Registraties", "metric_value": float(warning_n)})
    if not findings:
        findings.append({"control": "appregs-status", "title": f"App registraties ({total})",
            "status": "ok", "impact": "low",
            "finding": f"{total} app-registratie(s) — geen verlopen of bijna-verlopen secrets",
            "recommendation": "Blijf secrets en certificaten monitoren voor verval.",
            "service": "App Registraties", "metric_value": float(total)})
    return findings


def _extract_exchange_forwarding(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    items = data.get("forwarding") or data.get("items") or []
    count = len(items)
    if count == 0:
        return [{"control": "exchange-forwarding", "title": "Externe e-mail forwarding",
            "status": "ok", "impact": "low",
            "finding": "Geen actieve externe e-mail forwardings gevonden",
            "recommendation": "Handhaven. Monitor forwarding rules regelmatig.",
            "service": "Exchange", "metric_value": 0.0}]
    return [{"control": "exchange-forwarding", "title": f"Externe forwarding actief ({count})",
        "status": "critical", "impact": "critical",
        "finding": f"{count} mailbox(en) stuurt e-mail extern door — potentieel dataverlies",
        "recommendation": "Blokkeer automatisch extern doorsturen via transport rule. Review deze forwardings direct.",
        "service": "Exchange", "metric_value": float(count)}]


def _extract_exchange_rules(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    suspicious = int(data.get("suspicious") or 0)
    total = int(data.get("total") or 0)
    if suspicious == 0:
        return [{"control": "exchange-inbox-rules", "title": "Verdachte inboxregels",
            "status": "ok", "impact": "low",
            "finding": f"Geen verdachte inboxregels gevonden ({total} regels gecontroleerd)",
            "recommendation": "Blijf inboxregels periodiek monitoren.",
            "service": "Exchange", "metric_value": 0.0}]
    return [{"control": "exchange-inbox-rules", "title": f"Verdachte inboxregels ({suspicious})",
        "status": "critical", "impact": "critical",
        "finding": f"{suspicious} verdachte inboxregel(s) gedetecteerd van {total} totaal",
        "recommendation": "Onderzoek en verwijder verdachte inboxregels. Dit kan wijzen op een gehackt account.",
        "service": "Exchange", "metric_value": float(suspicious)}]


def _extract_ca_policies(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    policies = data.get("policies") or []
    enabled = sum(1 for p in policies if (p.get("state") or "").lower() == "enabled")
    report_only = sum(1 for p in policies if (p.get("state") or "").lower() in ("enabledforreportingbutnotenforcingleway", "reportonly"))
    total = len(policies)
    if enabled >= 3:
        status = "ok"
    elif enabled >= 1:
        status = "warning"
    else:
        status = "critical"
    return [{"control": "ca-policies", "title": f"Conditional Access policies ({enabled} actief)",
        "status": status, "impact": _impact_from_status(status),
        "finding": f"{enabled} actieve CA-policies van {total} totaal ({report_only} report-only)",
        "recommendation": (
            "Goede CA-coverage. Controleer of MFA, legacy-auth blokkering en admin-bescherming zijn opgenomen." if status == "ok"
            else "Breid CA-policies uit. Implementeer minimaal: MFA voor alle users, legacy auth blokkering, admin bescherming."
            if status == "warning"
            else "Geen CA-policies actief! Implementeer direct minimale CA-bescherming."
        ),
        "service": "Zero Trust Baseline", "metric_value": float(enabled)}]


def _extract_teams(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    teams = data.get("teams") or []
    total = int(data.get("count") or len(teams))
    public = int(data.get("publicCount") or sum(1 for t in teams if (t.get("visibility") or "").lower() == "public"))
    pct_public = (public / total * 100) if total > 0 else 0
    status = "ok" if pct_public < 20 else ("warning" if pct_public < 50 else "critical")
    return [{"control": "teams-public", "title": f"Teams ({total} totaal, {public} publiek)",
        "status": status, "impact": _impact_from_status(status),
        "finding": f"{public}/{total} Teams zijn publiek zichtbaar ({pct_public:.0f}%)",
        "recommendation": "Gebruik bij voorkeur Private Teams. Review publieke Teams op gevoelige inhoud.",
        "service": "Samenwerking", "metric_value": float(public)}]


def _extract_sharepoint_settings(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    sharing = str(data.get("sharingCapability") or "unknown").lower()
    if sharing in ("disabled", "existingexternalusersharingonly"):
        status = "ok"
    elif sharing in ("externalusersharingonly",):
        status = "warning"
    elif sharing in ("externaluserandguestsharing",):
        status = "critical"
    else:
        status = "info"
    return [{"control": "sharepoint-sharing", "title": "SharePoint externe sharing",
        "status": status, "impact": _impact_from_status(status),
        "finding": f"Sharingsniveau: {data.get('sharingCapability') or 'Onbekend'}",
        "recommendation": "Beperk extern delen tot 'Existing external users' of 'Disabled'. Voorkom anonieme links.",
        "service": "Samenwerking", "metric_value": None}]


# Map van (domain, action) → extractorfunctie
_FINDING_EXTRACTORS: Dict[Tuple[str, str], Any] = {
    ("identity", "list-mfa"):               _extract_identity_mfa,
    ("identity", "list-guests"):            _extract_identity_guests,
    ("identity", "get-security-defaults"):  _extract_identity_security_defaults,
    ("identity", "list-legacy-auth"):       _extract_identity_legacy_auth,
    ("identity", "list-admin-roles"):       _extract_identity_admin_roles,
    ("apps", "list-appregs"):              _extract_appregs,
    ("exchange", "list-forwarding"):        _extract_exchange_forwarding,
    ("exchange", "list-mailbox-rules"):     _extract_exchange_rules,
    ("ca", "list-policies"):               _extract_ca_policies,
    ("collaboration", "list-teams"):        _extract_teams,
    ("collaboration", "get-sharepoint-settings"): _extract_sharepoint_settings,
}


# ══════════════════════════════════════════════════════════════════════════════
# Findings persistence
# ══════════════════════════════════════════════════════════════════════════════

def _persist_live_findings(tenant_id: str, domain: str, action: str, data: Dict[str, Any]) -> None:
    """Sla gestructureerde bevindingen op in scan_findings na een succesvolle PS-run."""
    if not data or data.get("ok") is False:
        return
    extractor = _FINDING_EXTRACTORS.get((domain, action))
    if not extractor:
        return
    try:
        findings = extractor(data)
    except Exception as e:
        logger.warning("[findings] Extractor %s/%s fout: %s", domain, action, e)
        return
    if not findings:
        return
    ts = now_iso()
    raw_json = json.dumps(data, ensure_ascii=False)[:8000]  # cap op 8KB
    conn = get_conn()
    try:
        with conn:
            conn.executemany(
                """
                INSERT INTO scan_findings
                    (id, tenant_id, domain, control, title, status, finding,
                     impact, recommendation, service, metric_value, raw_json, scanned_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                [
                    (
                        str(uuid.uuid4()), tenant_id, domain,
                        f["control"], f["title"], f["status"], f.get("finding"),
                        f.get("impact", "low"), f.get("recommendation"),
                        f.get("service"), f.get("metric_value"),
                        raw_json if i == 0 else None, ts,
                    )
                    for i, f in enumerate(findings)
                ],
            )
    except Exception as e:
        logger.warning("[findings] DB write fout tenant=%s domain=%s: %s", tenant_id, domain, e)
    finally:
        conn.close()


def _persist_snapshot_findings(tenant_id: str, run_id: str) -> int:
    """
    Leid gestructureerde scan_findings af uit de summary.json van een assessment-run.
    Gebruikt dezelfde scan_findings tabel als _persist_live_findings.
    Retourneert het aantal geschreven findings.
    """
    # Idempotence: voorkom dubbele import van dezelfde run voor dezelfde tenant.
    if _has_snapshot_findings_for_run(tenant_id, run_id):
        return 0

    run_dir = RUNS_DIR / run_id
    summary_file = _find_latest_summary_file(run_dir)
    if not summary_file or not summary_file.exists():
        return 0
    try:
        snap = json.loads(summary_file.read_text(encoding="utf-8"))
    except Exception:
        return 0
    if not isinstance(snap, dict):
        return 0

    metrics = snap.get("Metrics") or {}
    ts = snap.get("GeneratedAt") or now_iso()
    raw_json = json.dumps({"source": "snapshot", "run_id": run_id}, ensure_ascii=False)
    findings: List[Dict[str, Any]] = []

    def _pct_status(pct: Any, ok_thresh: float = 90, warn_thresh: float = 75) -> str:
        if pct is None:
            return "info"
        if pct >= ok_thresh:
            return "ok"
        if pct >= warn_thresh:
            return "warning"
        return "critical"

    def _inv_pct_status(count: Any, warn_thresh: int = 1, crit_thresh: int = 5) -> str:
        """Status voor telling waarbij 0 = OK."""
        if count is None:
            return "info"
        if count == 0:
            return "ok"
        if count <= warn_thresh:
            return "warning"
        return "critical"

    # ── Identity & MFA ────────────────────────────────────────────────────────
    mfa_pct = metrics.get("MfaCoveragePct")
    if mfa_pct is not None:
        status = _pct_status(mfa_pct, ok_thresh=95, warn_thresh=75)
        missing = metrics.get("MfaMissing", 0)
        findings.append({
            "domain": "identity", "control": "mfa-coverage",
            "title": "MFA-registratie dekking",
            "status": status,
            "finding": f"{mfa_pct}% MFA-dekking ({missing} gebruikers zonder MFA)",
            "impact": "high" if status == "critical" else ("medium" if status == "warning" else "low"),
            "recommendation": (
                "Verplicht MFA via Conditional Access voor alle gebruikers."
                if status != "ok" else None
            ),
            "service": "Identity Beheer",
            "metric_value": mfa_pct,
        })

    ca_enabled = metrics.get("CAEnabled")
    if ca_enabled is not None:
        ca_count = int(ca_enabled)
        status = "ok" if ca_count >= 3 else ("warning" if ca_count >= 1 else "critical")
        findings.append({
            "domain": "identity", "control": "ca-policies",
            "title": "Conditional Access policies",
            "status": status,
            "finding": f"{ca_count} actieve Conditional Access policy/policies",
            "impact": "high" if status == "critical" else ("medium" if status == "warning" else "low"),
            "recommendation": (
                "Implementeer minimaal 3 CA-policies: MFA, admin-bescherming en legacy auth blokkade."
                if status != "ok" else None
            ),
            "service": "Zero Trust Baseline",
            "metric_value": float(ca_count),
        })

    # ── Security Baseline ─────────────────────────────────────────────────────
    score_pct = metrics.get("SecureScorePct")
    if score_pct is not None:
        status = _pct_status(score_pct, ok_thresh=70, warn_thresh=50)
        findings.append({
            "domain": "identity", "control": "secure-score",
            "title": "Microsoft Secure Score",
            "status": status,
            "finding": f"Secure Score: {score_pct}%",
            "impact": "high" if status == "critical" else ("medium" if status == "warning" else "low"),
            "recommendation": (
                "Voer de top Secure Score aanbevelingen uit in het Microsoft 365 Defender portal."
                if status != "ok" else None
            ),
            "service": "Security Monitoring",
            "metric_value": score_pct,
        })

    alerts_high = metrics.get("AlertsHigh")
    if alerts_high is not None:
        status = _inv_pct_status(int(alerts_high), warn_thresh=0, crit_thresh=1)
        if status == "ok":
            status = "ok"  # 0 high alerts is OK
        else:
            status = "critical"
        findings.append({
            "domain": "identity", "control": "security-alerts-high",
            "title": "Hoge prioriteit beveiligingsalarmen",
            "status": status,
            "finding": f"{alerts_high} hoge prioriteitsalarmen actief",
            "impact": "high" if int(alerts_high) > 0 else "low",
            "recommendation": (
                "Onderzoek en verhelp direct alle hoge prioriteitsalarmen in Microsoft 365 Defender."
                if int(alerts_high) > 0 else None
            ),
            "service": "Security Monitoring",
            "metric_value": float(alerts_high),
        })

    alerts_medium = metrics.get("AlertsMedium")
    if alerts_medium is not None:
        a = int(alerts_medium)
        status = "ok" if a == 0 else ("warning" if a <= 5 else "critical")
        findings.append({
            "domain": "identity", "control": "security-alerts-medium",
            "title": "Gemiddelde prioriteit beveiligingsalarmen",
            "status": status,
            "finding": f"{a} gemiddelde prioriteitsalarmen actief",
            "impact": "medium" if a > 0 else "low",
            "recommendation": (
                "Bekijk en prioriteer gemiddelde alarmen; zorg dat er geen achterstanden ontstaan."
                if a > 0 else None
            ),
            "service": "Security Monitoring",
            "metric_value": float(a),
        })

    # ── Device Compliance ─────────────────────────────────────────────────────
    intune_pct = metrics.get("IntuneCompliancePct")
    if intune_pct is not None:
        status = _pct_status(intune_pct, ok_thresh=95, warn_thresh=75)
        findings.append({
            "domain": "collaboration", "control": "intune-compliance",
            "title": "Intune device compliance dekking",
            "status": status,
            "finding": f"{intune_pct}% van beheerde apparaten is compliant",
            "impact": "high" if status == "critical" else ("medium" if status == "warning" else "low"),
            "recommendation": (
                "Stel compliance policies in en herstel non-compliant apparaten via Intune."
                if status != "ok" else None
            ),
            "service": "Modern Device Management",
            "metric_value": intune_pct,
        })

    # ── License utilization ────────────────────────────────────────────────────
    licenses = snap.get("Licenses") or []
    low_util = [
        lic for lic in licenses
        if isinstance(lic, dict)
        and (lic.get("Total") or 0) > 5
        and (lic.get("Utilization") or 100) < 80
    ]
    if licenses:
        status = "ok" if not low_util else ("warning" if len(low_util) <= 2 else "critical")
        findings.append({
            "domain": "collaboration", "control": "license-efficiency",
            "title": "Licentie-efficiëntie",
            "status": status,
            "finding": (
                f"{len(low_util)} licentietypen met lage bezettingsgraad (<80%) van de {len(licenses)} totaal"
                if low_util else f"Alle {len(licenses)} licentietypen hebben voldoende bezettingsgraad"
            ),
            "impact": "medium" if low_util else "low",
            "recommendation": (
                "Verlaag het aantal licenties voor onderbenutte SKU's of herverdelens ze naar actieve gebruikers."
                if low_util else None
            ),
            "service": "Licentie Optimalisatie",
            "metric_value": float(len(low_util)),
        })

    # ── App Registrations ─────────────────────────────────────────────────────
    app_regs = snap.get("AppRegistrations") or []
    expired_secrets = [
        a for a in app_regs
        if isinstance(a, dict) and "Expired" in str(a.get("SecretExpirationStatus") or "")
    ]
    expiring_soon = [
        a for a in app_regs
        if isinstance(a, dict) and "soon" in str(a.get("SecretExpirationStatus") or "").lower()
    ]
    if app_regs:
        status = "ok" if not expired_secrets else "critical"
        if status == "ok" and expiring_soon:
            status = "warning"
        findings.append({
            "domain": "appregs", "control": "appreg-secrets",
            "title": "App registraties — secrets & certificaten",
            "status": status,
            "finding": (
                f"{len(expired_secrets)} verlopen secret(s), {len(expiring_soon)} verloopt binnenkort "
                f"van de {len(app_regs)} app registraties"
                if (expired_secrets or expiring_soon) else
                f"Alle {len(app_regs)} app registraties hebben geldige credentials"
            ),
            "impact": "high" if expired_secrets else ("medium" if expiring_soon else "low"),
            "recommendation": (
                "Vernieuw verlopen secrets/certificaten voor app registraties direct."
                if expired_secrets else (
                    "Vernieuw binnenkort verlopende secrets/certificaten proactief."
                    if expiring_soon else None
                )
            ),
            "service": "App Beheer",
            "metric_value": float(len(expired_secrets)),
        })

    if not findings:
        return 0

    conn = get_conn()
    try:
        with conn:
            conn.executemany(
                """
                INSERT INTO scan_findings
                    (id, tenant_id, domain, control, title, status, finding,
                     impact, recommendation, service, metric_value, raw_json, scanned_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                [
                    (
                        str(uuid.uuid4()), tenant_id,
                        f["domain"], f["control"], f["title"], f["status"],
                        f.get("finding"), f.get("impact", "low"),
                        f.get("recommendation"), f.get("service"),
                        f.get("metric_value"), raw_json if i == 0 else None, ts,
                    )
                    for i, f in enumerate(findings)
                ],
            )
        return len(findings)
    except Exception as e:
        logger.warning("[snapshot_findings] DB write fout tenant=%s run=%s: %s", tenant_id, run_id, e)
        return 0
    finally:
        conn.close()


def _has_snapshot_findings_for_run(tenant_id: str, run_id: str) -> bool:
    marker = f'"run_id": "{run_id}"'
    conn = get_conn()
    try:
        row = conn.execute(
            """
            SELECT 1
            FROM scan_findings
            WHERE tenant_id = ?
              AND raw_json IS NOT NULL
              AND raw_json LIKE ?
            LIMIT 1
            """,
            (tenant_id, f"%{marker}%"),
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def _get_tenant_health_score(tenant_id: str) -> Dict[str, Any]:
    """Bereken health score op basis van meest recente findings per control."""
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT f.domain, f.control, f.status, f.impact, f.title, f.scanned_at
            FROM scan_findings f
            INNER JOIN (
                SELECT domain, control, MAX(scanned_at) AS max_at
                FROM scan_findings WHERE tenant_id=?
                GROUP BY domain, control
            ) latest ON f.domain=latest.domain AND f.control=latest.control AND f.scanned_at=latest.max_at
            WHERE f.tenant_id=?
            ORDER BY f.domain, f.control
            """,
            (tenant_id, tenant_id),
        ).fetchall()
        findings = [dict(r) for r in rows]
        total = len(findings)
        ok_count = sum(1 for f in findings if f["status"] == "ok")
        warn_count = sum(1 for f in findings if f["status"] == "warning")
        crit_count = sum(1 for f in findings if f["status"] == "critical")
        score = round((ok_count * 1.0 + warn_count * 0.5) / total * 100) if total else None
        return {
            "ok": True, "tenant_id": tenant_id,
            "score": score,
            "total": total, "ok_count": ok_count,
            "warning_count": warn_count, "critical_count": crit_count,
            "findings": findings,
        }
    finally:
        conn.close()


def _get_findings_trend(tenant_id: str, days: int = 30) -> List[Dict[str, Any]]:
    """Dagelijks gemiddelde health score voor trends-grafiek."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT
                substr(scanned_at, 1, 10) AS day,
                COUNT(*) AS total,
                SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) AS ok_count,
                SUM(CASE WHEN status='warning' THEN 1 ELSE 0 END) AS warn_count,
                SUM(CASE WHEN status='critical' THEN 1 ELSE 0 END) AS crit_count
            FROM scan_findings
            WHERE tenant_id=? AND scanned_at >= ?
            GROUP BY day
            ORDER BY day ASC
            """,
            (tenant_id, cutoff),
        ).fetchall()
        result = []
        for r in rows:
            total = r["total"] or 1
            score = round((r["ok_count"] * 1.0 + r["warn_count"] * 0.5) / total * 100)
            result.append({"date": r["day"], "score": score,
                "ok": r["ok_count"], "warning": r["warn_count"], "critical": r["crit_count"]})
        return result
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# Identity, Hybrid, CIS, AppRegs, Collab
# ══════════════════════════════════════════════════════════════════════════════

def _run_identity_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _IDENTITY_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Identity script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    logger.info("[Identity] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            data = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            threading.Thread(target=_persist_live_findings, args=(tenant_id, "identity", action, data), daemon=True).start()
            return data
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


def _run_hybrid_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _HYBRID_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Hybrid script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    logger.info("[Hybrid] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            data = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            threading.Thread(target=_persist_live_findings, args=(tenant_id, "hybrid", action, data), daemon=True).start()
            return data
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


def _run_cis_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _CIS_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"CIS script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    output = proc.stdout + proc.stderr
    logger.info("[CIS] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            data = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            threading.Thread(target=_persist_live_findings, args=(tenant_id, "compliance", action, data), daemon=True).start()
            return data
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


def _run_appregs_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _APPREGS_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"AppRegs script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    logger.info("[AppRegs] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            data = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            threading.Thread(target=_persist_live_findings, args=(tenant_id, "apps", action, data), daemon=True).start()
            return data
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}


def _run_collab_ps(tenant_id: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    profile = _get_tenant_auth_profile(tenant_id, include_secret=True)
    ps_script = _COLLAB_SCRIPT.resolve()
    if not ps_script.exists():
        raise FileNotFoundError(f"Collaboration script niet gevonden: {ps_script}")
    cmd = [
        "pwsh", "-NonInteractive", "-NoProfile", "-File", str(ps_script),
        "-Action", action,
        "-TenantId", profile["auth_tenant_id"],
        "-ClientId", profile["auth_client_id"],
        "-ParamsJson", json.dumps(params),
    ]
    if profile.get("auth_cert_thumbprint"):
        cmd += ["-CertThumbprint", profile["auth_cert_thumbprint"]]
    elif profile.get("auth_client_secret"):
        cmd += ["-ClientSecret", profile["auth_client_secret"]]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    logger.info("[Collab] action=%s tenant=%s exit=%s", action, tenant_id, proc.returncode)
    if "##RESULT##" in output:
        try:
            data = json.loads(output.split("##RESULT##")[-1].strip().split("\n")[0])
            threading.Thread(target=_persist_live_findings, args=(tenant_id, "collaboration", action, data), daemon=True).start()
            return data
        except Exception:
            return {"ok": False, "error": "Parse fout"}
    return {"ok": False, "error": output[-500:] if output else "Geen output"}
