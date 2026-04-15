#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend-api"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.control_service import build_control_payload  # noqa: E402


TENANT_ID = "matrix-tenant-001"
NOW_ISO = "2026-04-11T09:00:00Z"
CONTROL_KEYS = [
    "guest-user-governance",
    "app-secrets-and-certs",
    "ca-policy-export",
    "mail-forwarding-detection",
    "inbox-rule-risk-detection",
    "mailbox-permission-governance",
    "domain-mail-auth",
    "admin-role-membership",
    "break-glass-accounts",
    "legacy-auth-exposure",
    "teams-with-guests",
    "sharepoint-sharing-risk",
]


def assert_contract(payload: Dict[str, Any], control_key: str, mode: str) -> None:
    required_top_level = {
        "ok",
        "control_key",
        "tenant_id",
        "source",
        "captured_at",
        "summary",
        "items",
        "errors",
        "category",
    }
    missing = [key for key in required_top_level if key not in payload]
    if missing:
        raise AssertionError(f"{control_key} ({mode}) mist contractvelden: {missing}")
    if payload.get("control_key") != control_key:
        raise AssertionError(f"{control_key} ({mode}) gaf verkeerde control_key terug.")
    if payload.get("tenant_id") != TENANT_ID:
        raise AssertionError(f"{control_key} ({mode}) gaf verkeerde tenant_id terug.")
    summary = payload.get("summary")
    if not isinstance(summary, dict):
        raise AssertionError(f"{control_key} ({mode}) summary is geen object.")
    for key in ("total", "warning", "critical"):
        if key not in summary:
            raise AssertionError(f"{control_key} ({mode}) mist summary.{key}.")
    items = payload.get("items")
    if not isinstance(items, list):
        raise AssertionError(f"{control_key} ({mode}) items is geen lijst.")
    for item in items:
        if not isinstance(item, dict):
            raise AssertionError(f"{control_key} ({mode}) bevat ongeldig itemtype.")
        required_item_fields = [
            "status",
            "severity",
            "title",
            "summary",
            "affected_objects",
            "recommended_action",
            "source",
            "captured_at",
            "control_key",
            "tenant_id",
            "category",
            "evidence",
        ]
        for field in required_item_fields:
            if field not in item:
                raise AssertionError(f"{control_key} ({mode}) item mist veld {field}.")
    errors = payload.get("errors")
    if not isinstance(errors, list):
        raise AssertionError(f"{control_key} ({mode}) errors is geen lijst.")
    for error in errors:
        if not isinstance(error, dict):
            raise AssertionError(f"{control_key} ({mode}) bevat ongeldige error.")
        if "type" not in error or "message" not in error:
            raise AssertionError(f"{control_key} ({mode}) error mist type/message.")


def base_deps() -> Dict[str, Any]:
    def run_identity_ps(_: str, action: str, __: Dict[str, Any]) -> Dict[str, Any]:
        if action == "list-guests":
            return {
                "ok": True,
                "_generated_at": NOW_ISO,
                "guests": [
                    {
                        "displayName": "Guest One",
                        "mail": "guest.one@external.example",
                        "userPrincipalName": "guest.one_external#EXT#@tenant.onmicrosoft.com",
                        "accountEnabled": True,
                        "lastSignIn": "2026-04-10T08:00:00Z",
                    }
                ],
            }
        if action == "list-admin-roles":
            return {
                "ok": True,
                "_generated_at": NOW_ISO,
                "roles": [
                    {
                        "roleName": "Global Administrator",
                        "memberCount": 2,
                        "members": [
                            {"upn": "admin@tenant.example", "displayName": "Main Admin"},
                            {"upn": "breakglass@tenant.example", "displayName": "Breakglass Account"},
                        ],
                    }
                ],
            }
        if action == "list-legacy-auth":
            return {
                "ok": True,
                "_generated_at": NOW_ISO,
                "users": [
                    {
                        "displayName": "Legacy User",
                        "upn": "legacy@tenant.example",
                        "clients": "IMAP",
                        "signInCount": 4,
                    }
                ],
            }
        return {"ok": False, "error": "unsupported action"}

    def run_appregs_ps(_: str, action: str, __: Dict[str, Any]) -> Dict[str, Any]:
        if action != "list-appregs":
            return {"ok": False, "error": "unsupported action"}
        return {
            "ok": True,
            "_generated_at": NOW_ISO,
            "items": [
                {
                    "displayName": "Contoso App",
                    "appId": "app-001",
                    "secretExpirationStatus": "warning (14 days)",
                    "certificateExpirationStatus": "healthy",
                    "secretCount": 2,
                    "certificateCount": 1,
                }
            ],
        }

    def run_ca_ps(_: str, action: str, __: Dict[str, Any]) -> Dict[str, Any]:
        if action != "list-policies":
            return {"ok": False, "error": "unsupported action"}
        return {
            "ok": True,
            "_generated_at": NOW_ISO,
            "policies": [
                {"displayName": "CA001 - MFA for admins", "state": "enabled", "id": "ca-001"}
            ],
        }

    def run_collab_ps(_: str, action: str, __: Dict[str, Any]) -> Dict[str, Any]:
        if action == "list-teams":
            return {
                "ok": True,
                "_generated_at": NOW_ISO,
                "teams": [
                    {"displayName": "Project Team", "mail": "project@tenant.example", "guestCount": 3, "ownerCount": 2}
                ],
            }
        if action == "get-sharepoint-settings":
            return {
                "ok": True,
                "_generated_at": NOW_ISO,
                "sharingCapability": "ExternalUserAndGuestSharing",
            }
        return {"ok": False, "error": "unsupported action"}

    def run_exchange_ps(_: str, action: str, __: Dict[str, Any]) -> Dict[str, Any]:
        if action == "list-forwarding":
            return {
                "ok": True,
                "_generated_at": NOW_ISO,
                "items": [
                    {
                        "displayName": "Mailbox One",
                        "mail": "mailbox.one@tenant.example",
                        "forwardingAddress": "alerts@external.example",
                    }
                ],
            }
        if action == "list-mailbox-rules":
            return {
                "ok": True,
                "_generated_at": NOW_ISO,
                "items": [
                    {
                        "displayName": "Mailbox One",
                        "mail": "mailbox.one@tenant.example",
                        "name": "Forward all",
                        "summary": "Forwarding to external address",
                        "isSuspicious": True,
                    }
                ],
            }
        if action == "list-shared-mailboxes":
            return {
                "ok": True,
                "_generated_at": NOW_ISO,
                "mailboxes": [
                    {
                        "displayName": "Shared Support",
                        "mail": "support@tenant.example",
                        "fullAccessCount": 3,
                        "sendAsCount": 1,
                        "sendOnBehalfCount": 0,
                    }
                ],
            }
        return {"ok": False, "error": "unsupported action"}

    def latest_assessment_snapshot_for_tenant(_: str) -> Dict[str, Any]:
        return {
            "assessment_generated_at": NOW_ISO,
            "assessment_shared_mailboxes": [
                {
                    "displayName": "Snapshot Shared",
                    "mail": "snapshot.shared@tenant.example",
                    "fullAccessCount": 1,
                    "sendAsCount": 0,
                    "sendOnBehalfCount": 1,
                }
            ],
            "assessment_domain_dns_checks": [
                {"Domain": "tenant.example", "SPF": "pass", "DKIM": "pass", "DMARC": "pass"}
            ],
        }

    def assessment_json_payload(_: Dict[str, Any], section: str, key: str) -> Dict[str, Any] | None:
        if section == "identity" and key == "guests":
            return {"generated_at": NOW_ISO, "items": [{"displayName": "Snapshot Guest", "mail": "guest@snapshot.example"}]}
        if section == "identity" and key == "admin-roles":
            return {
                "generated_at": NOW_ISO,
                "roles": [
                    {
                        "roleName": "Global Administrator",
                        "memberCount": 1,
                        "members": [{"upn": "break-glass@snapshot.example", "displayName": "Break-Glass Snapshot"}],
                    }
                ],
            }
        if section == "apps" and key == "registrations":
            return {
                "generated_at": NOW_ISO,
                "items": [
                    {
                        "displayName": "Snapshot App",
                        "appId": "snapshot-app-001",
                        "secretExpirationStatus": "healthy",
                        "certificateExpirationStatus": "healthy",
                    }
                ],
            }
        return None

    def payload_value(item: Dict[str, Any], *keys: str, default: Any = None) -> Any:
        for key in keys:
            if key in item and item.get(key) not in (None, ""):
                return item.get(key)
        return default

    def snapshot_as_users(_: str) -> List[Dict[str, Any]]:
        return [{"displayName": "Snapshot Guest User", "userPrincipalName": "user#EXT#@tenant.onmicrosoft.com", "userType": "Guest"}]

    def snapshot_as_ca_policies(_: str) -> List[Dict[str, Any]]:
        return [{"displayName": "Snapshot CA", "state": "enabled", "id": "ca-snapshot"}]

    def snapshot_as_teams(_: str) -> List[Dict[str, Any]]:
        return [{"displayName": "Snapshot Team", "mail": "snapshot.team@tenant.example", "guestCount": 1, "ownerCount": 1}]

    def snapshot_as_sharepoint_settings(_: str) -> Dict[str, Any]:
        return {"sharingCapability": "ExternalUserSharingOnly"}

    def db_fetchone(_: str, __: Any) -> Dict[str, Any]:
        return {
            "title": "Snapshot finding",
            "status": "warning",
            "finding": "Snapshot fallback finding",
            "recommendation": "Review and remediate",
            "scanned_at": NOW_ISO,
        }

    return {
        "now_iso": lambda: NOW_ISO,
        "run_identity_ps": run_identity_ps,
        "run_appregs_ps": run_appregs_ps,
        "run_ca_ps": run_ca_ps,
        "run_collab_ps": run_collab_ps,
        "run_exchange_ps": run_exchange_ps,
        "latest_assessment_snapshot_for_tenant": latest_assessment_snapshot_for_tenant,
        "assessment_json_payload": assessment_json_payload,
        "payload_value": payload_value,
        "snapshot_as_users": snapshot_as_users,
        "snapshot_as_ca_policies": snapshot_as_ca_policies,
        "snapshot_as_teams": snapshot_as_teams,
        "snapshot_as_sharepoint_settings": snapshot_as_sharepoint_settings,
        "db_fetchone": db_fetchone,
    }


def snapshot_only_deps() -> Dict[str, Any]:
    deps = base_deps()

    def down(*_: Any, **__: Any) -> Dict[str, Any]:
        return {"ok": False, "error": "live unavailable for matrix test"}

    deps["run_identity_ps"] = down
    deps["run_appregs_ps"] = down
    deps["run_ca_ps"] = down
    deps["run_collab_ps"] = down
    deps["run_exchange_ps"] = down
    return deps


def run_matrix() -> List[str]:
    failures: List[str] = []
    live_deps = base_deps()
    snap_deps = snapshot_only_deps()

    for control_key in CONTROL_KEYS:
        try:
            payload_live = build_control_payload(control_key, TENANT_ID, False, live_deps)
            assert_contract(payload_live, control_key, "live")
            if control_key != "domain-mail-auth" and payload_live.get("source") not in {"live", "assessment_snapshot"}:
                raise AssertionError(f"{control_key} (live) had onverwachte source={payload_live.get('source')}")

            payload_strict = build_control_payload(control_key, TENANT_ID, True, live_deps)
            assert_contract(payload_strict, control_key, "strict_live")
            if control_key == "domain-mail-auth":
                if payload_strict.get("ok") is not False:
                    raise AssertionError("domain-mail-auth (strict_live) moet fout geven als live-only niet kan.")
            else:
                if payload_strict.get("ok") is not True:
                    raise AssertionError(f"{control_key} (strict_live) verwacht ok=true met beschikbare live data.")

            payload_snapshot = build_control_payload(control_key, TENANT_ID, False, snap_deps)
            assert_contract(payload_snapshot, control_key, "snapshot")
            if control_key == "legacy-auth-exposure":
                if payload_snapshot.get("ok") is not False:
                    raise AssertionError("legacy-auth-exposure snapshot verwacht momenteel data_partial (geen snapshot-fallback).")
            else:
                if payload_snapshot.get("ok") is not True:
                    raise AssertionError(f"{control_key} (snapshot) verwacht ok=true met fallbackdata.")
        except Exception as exc:
            failures.append(f"{control_key}: {exc}")
    return failures


def main() -> int:
    failures = run_matrix()
    if failures:
        print("CONTROL MATRIX FAILED")
        for failure in failures:
            print(f" - {failure}")
        return 1
    print(f"CONTROL MATRIX OK ({len(CONTROL_KEYS)} controls x 3 modes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
