from __future__ import annotations

from typing import Any, Dict, List, Optional


def _now_iso(deps: Dict[str, Any]) -> str:
    now_iso = deps.get("now_iso")
    return now_iso() if callable(now_iso) else ""


def _status_to_severity(status: str) -> str:
    return {
        "ok": "low",
        "info": "low",
        "warning": "medium",
        "critical": "high",
    }.get((status or "").strip().lower(), "medium")


def _status_to_error_type(status: str) -> str:
    return {
        "auth_missing": "auth_missing",
        "auth_mismatch": "auth_mismatch",
        "permission_missing": "permission_missing",
        "live_unavailable": "live_unavailable",
        "data_partial": "data_partial",
    }.get((status or "").strip().lower(), "live_unavailable")


def _normalize_control_item(
    control_key: str,
    tenant_id: str,
    source: str,
    category: str,
    item: Dict[str, Any],
    captured_at: str,
) -> Dict[str, Any]:
    status = str(item.get("status") or "info").strip().lower()
    affected = item.get("affected_objects")
    if not isinstance(affected, list):
        affected = [str(affected)] if affected else []
    return {
        "status": status,
        "severity": item.get("severity") or _status_to_severity(status),
        "title": item.get("title") or "Controle-item",
        "summary": item.get("summary") or "",
        "affected_objects": [str(value) for value in affected if value],
        "recommended_action": item.get("recommended_action") or "",
        "source": source,
        "captured_at": captured_at,
        "control_key": control_key,
        "tenant_id": tenant_id,
        "category": category,
        "evidence": item.get("evidence") if isinstance(item.get("evidence"), dict) else {},
    }


def _build_response(
    control_key: str,
    tenant_id: str,
    source: str,
    category: str,
    captured_at: str,
    items: List[Dict[str, Any]],
    errors: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    safe_items = items if isinstance(items, list) else []
    warning_count = sum(1 for item in safe_items if item.get("status") == "warning")
    critical_count = sum(1 for item in safe_items if item.get("status") == "critical")
    return {
        "ok": not bool(errors),
        "control_key": control_key,
        "tenant_id": tenant_id,
        "source": source,
        "captured_at": captured_at,
        "summary": {
            "total": len(safe_items),
            "warning": warning_count,
            "critical": critical_count,
        },
        "items": safe_items,
        "errors": errors or [],
        "category": category,
    }


def _error_payload(
    control_key: str,
    tenant_id: str,
    category: str,
    code: str,
    message: str,
) -> Dict[str, Any]:
    captured_at = ""
    return _build_response(
        control_key,
        tenant_id,
        "unavailable",
        category,
        captured_at,
        [],
        [{"type": _status_to_error_type(code), "message": message}],
    )


def _normalize_guest_item(item: Dict[str, Any], source: str, tenant_id: str, captured_at: str) -> Dict[str, Any]:
    display_name = item.get("displayName") or item.get("name") or item.get("userPrincipalName") or item.get("mail") or "Gastgebruiker"
    upn = item.get("userPrincipalName") or item.get("upn") or item.get("mail") or ""
    enabled = item.get("accountEnabled")
    status = "ok" if enabled is not False else "warning"
    last_sign_in = item.get("lastSignIn") or item.get("signInActivity") or item.get("createdDateTime") or "Geen recente login bekend"
    return _normalize_control_item(
        "guest-user-governance",
        tenant_id,
        source,
        "identity",
        {
            "status": status,
            "title": display_name,
            "summary": f"{upn or 'Geen UPN'} · laatste activiteit: {last_sign_in}",
            "affected_objects": [upn] if upn else [],
            "recommended_action": (
                "Controleer of deze gast nog nodig is en review de toegangsrechten."
                if enabled is not False
                else "Deze gast is uitgeschakeld. Controleer of opschonen of verwijderen passend is."
            ),
            "evidence": item,
        },
        captured_at,
    )


def _build_guest_user_governance(tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    run_identity_ps = deps.get("run_identity_ps")
    latest_assessment_snapshot_for_tenant = deps.get("latest_assessment_snapshot_for_tenant")
    assessment_json_payload = deps.get("assessment_json_payload")
    payload_value = deps.get("payload_value")
    snapshot_as_users = deps.get("snapshot_as_users")

    live_error = None
    if callable(run_identity_ps):
        try:
            data = run_identity_ps(tenant_id, "list-guests", {})
            items = data.get("guests") if isinstance(data.get("guests"), list) else data.get("items")
            if data.get("ok") is not False and isinstance(items, list):
                captured_at = str(data.get("_generated_at") or data.get("captured_at") or _now_iso(deps))
                normalized = [_normalize_guest_item(item, "live", tenant_id, captured_at) for item in items if isinstance(item, dict)]
                return _build_response("guest-user-governance", tenant_id, "live", "identity", captured_at, normalized)
            live_error = data.get("error") or data.get("message")
        except Exception as exc:
            live_error = str(exc)
    if strict_live:
        return _error_payload("guest-user-governance", tenant_id, "identity", "live_unavailable", live_error or "Live gastgebruikersdata niet beschikbaar.")

    snapshot = latest_assessment_snapshot_for_tenant(tenant_id) if callable(latest_assessment_snapshot_for_tenant) else {}
    payload = assessment_json_payload(snapshot, "identity", "guests") if callable(assessment_json_payload) else None
    if isinstance(payload, dict):
        captured_at = str(payload.get("generated_at") or snapshot.get("assessment_generated_at") or _now_iso(deps))
        raw_items = payload.get("guests")
        if not isinstance(raw_items, list):
            raw_items = payload.get("items") or []
        normalized_raw = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            normalized_raw.append(
                {
                    "displayName": payload_value(item, "DisplayName", "displayName", default="Gast") if callable(payload_value) else item.get("displayName"),
                    "mail": payload_value(item, "Mail", "mail") if callable(payload_value) else item.get("mail"),
                    "userPrincipalName": payload_value(item, "UserPrincipalName", "userPrincipalName", default="") if callable(payload_value) else item.get("userPrincipalName"),
                    "accountEnabled": bool(payload_value(item, "AccountEnabled", "accountEnabled", default=True)) if callable(payload_value) else item.get("accountEnabled"),
                    "lastSignIn": payload_value(item, "LastSignIn", "lastSignIn") if callable(payload_value) else item.get("lastSignIn"),
                    "createdDateTime": payload_value(item, "CreatedDateTime", "createdDateTime") if callable(payload_value) else item.get("createdDateTime"),
                }
            )
        items = [_normalize_guest_item(item, "assessment_snapshot", tenant_id, captured_at) for item in normalized_raw]
        return _build_response("guest-user-governance", tenant_id, "assessment_snapshot", "identity", captured_at, items)

    snapshot_users = snapshot_as_users(tenant_id) if callable(snapshot_as_users) else []
    guest_items = []
    for item in snapshot_users or []:
        if not isinstance(item, dict):
            continue
        user_type = str(item.get("userType") or "").lower()
        upn = str(item.get("userPrincipalName") or item.get("upn") or "").lower()
        if user_type != "guest" and "#ext#" not in upn:
            continue
        guest_items.append(item)
    if guest_items:
        captured_at = str(snapshot.get("assessment_generated_at") or _now_iso(deps))
        items = [_normalize_guest_item(item, "assessment_snapshot", tenant_id, captured_at) for item in guest_items]
        return _build_response("guest-user-governance", tenant_id, "assessment_snapshot", "identity", captured_at, items)
    return _error_payload("guest-user-governance", tenant_id, "identity", "data_partial", live_error or "Geen gastgebruikersdata beschikbaar.")


def _expiration_status(item: Dict[str, Any]) -> str:
    texts = [
        str(item.get("secretExpirationStatus") or item.get("SecretExpirationStatus") or ""),
        str(item.get("certificateExpirationStatus") or item.get("CertificateExpirationStatus") or ""),
    ]
    status_text = " ".join(texts).lower()
    if "expired" in status_text or "verlopen" in status_text:
        return "critical"
    if "14" in status_text or "soon" in status_text or "krit" in status_text:
        return "warning"
    if "30" in status_text or "warn" in status_text:
        return "warning"
    return "ok"


def _build_app_secrets_and_certs(tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    run_appregs_ps = deps.get("run_appregs_ps")
    latest_assessment_snapshot_for_tenant = deps.get("latest_assessment_snapshot_for_tenant")
    assessment_json_payload = deps.get("assessment_json_payload")
    payload_value = deps.get("payload_value")
    live_error = None
    raw_items = None

    if callable(run_appregs_ps):
        try:
            data = run_appregs_ps(tenant_id, "list-appregs", {})
            items = data.get("items") or data.get("registrations") or data.get("apps")
            if data.get("ok") is not False and isinstance(items, list):
                raw_items = items
                captured_at = str(data.get("_generated_at") or data.get("captured_at") or _now_iso(deps))
                source = "live"
            else:
                live_error = data.get("error") or data.get("message")
        except Exception as exc:
            live_error = str(exc)
    if raw_items is None:
        if strict_live:
            return _error_payload("app-secrets-and-certs", tenant_id, "apps", "live_unavailable", live_error or "Live appregistratiedata niet beschikbaar.")
        snapshot = latest_assessment_snapshot_for_tenant(tenant_id) if callable(latest_assessment_snapshot_for_tenant) else {}
        payload = assessment_json_payload(snapshot, "apps", "registrations") if callable(assessment_json_payload) else None
        if isinstance(payload, dict):
            raw_items = payload.get("items") or []
            captured_at = str(payload.get("generated_at") or snapshot.get("assessment_generated_at") or _now_iso(deps))
            source = "assessment_snapshot"
        else:
            return _error_payload("app-secrets-and-certs", tenant_id, "apps", "data_partial", live_error or "Geen appregistratiedata beschikbaar.")

    items = []
    for item in raw_items or []:
        if not isinstance(item, dict):
            continue
        display_name = item.get("displayName") or item.get("DisplayName") or "App registratie"
        app_id = item.get("appId") or item.get("AppId") or ""
        status = _expiration_status(item)
        secret_status = item.get("secretExpirationStatus") or item.get("SecretExpirationStatus") or "Geen secrets"
        cert_status = item.get("certificateExpirationStatus") or item.get("CertificateExpirationStatus") or "Geen certificaten"
        items.append(
            _normalize_control_item(
                "app-secrets-and-certs",
                tenant_id,
                source,
                "apps",
                {
                    "status": status,
                    "title": display_name,
                    "summary": f"Secrets: {secret_status} · Certificaten: {cert_status}",
                    "affected_objects": [app_id] if app_id else [],
                    "recommended_action": (
                        "Vernieuw secrets of certificaten direct."
                        if status == "critical"
                        else "Plan het vernieuwen van secrets/certificaten op korte termijn."
                        if status == "warning"
                        else "Geen directe actie nodig."
                    ),
                    "evidence": item,
                },
                captured_at,
            )
        )
    return _build_response("app-secrets-and-certs", tenant_id, source, "apps", captured_at, items)


def _build_ca_policy_export(tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    run_ca_ps = deps.get("run_ca_ps")
    snapshot_as_ca_policies = deps.get("snapshot_as_ca_policies")
    live_error = None
    raw_items = None

    if callable(run_ca_ps):
        try:
            data = run_ca_ps(tenant_id, "list-policies", {})
            items = data.get("policies")
            if data.get("ok") is not False and isinstance(items, list):
                raw_items = items
                captured_at = str(data.get("_generated_at") or data.get("captured_at") or _now_iso(deps))
                source = "live"
            else:
                live_error = data.get("error") or data.get("message")
        except Exception as exc:
            live_error = str(exc)
    if raw_items is None:
        if strict_live:
            return _error_payload("ca-policy-export", tenant_id, "ca", "live_unavailable", live_error or "Live Conditional Access data niet beschikbaar.")
        raw_items = snapshot_as_ca_policies(tenant_id) if callable(snapshot_as_ca_policies) else []
        source = "assessment_snapshot"
        captured_at = _now_iso(deps)
        if not raw_items:
            return _error_payload("ca-policy-export", tenant_id, "ca", "data_partial", live_error or "Geen Conditional Access data beschikbaar.")

    items = []
    for item in raw_items or []:
        if not isinstance(item, dict):
            continue
        state = str(item.get("state") or item.get("State") or "").lower()
        if state in {"enabled", "active"}:
            status = "ok"
        elif "report" in state:
            status = "warning"
        elif state:
            status = "info"
        else:
            status = "info"
        items.append(
            _normalize_control_item(
                "ca-policy-export",
                tenant_id,
                source,
                "ca",
                {
                    "status": status,
                    "title": item.get("displayName") or item.get("DisplayName") or "CA policy",
                    "summary": f"Status: {state or 'onbekend'}",
                    "affected_objects": [item.get("id") or item.get("Id")] if (item.get("id") or item.get("Id")) else [],
                    "recommended_action": (
                        "Controleer of deze report-only policy doorgevoerd moet worden."
                        if status == "warning"
                        else "Controleer policyvoorwaarden, doelgroepen en grant controls."
                    ),
                    "evidence": item,
                },
                captured_at,
            )
        )
    return _build_response("ca-policy-export", tenant_id, source, "ca", captured_at, items)


def _normalize_admin_role_item(item: Dict[str, Any], source: str, tenant_id: str, captured_at: str) -> Dict[str, Any]:
    role_name = item.get("roleName") or item.get("displayName") or "Beheerdersrol"
    member_count = int(item.get("memberCount") or len(item.get("members") or []))
    status = "warning" if member_count > 4 and "global" in role_name.lower() else "info"
    return _normalize_control_item(
        "admin-role-membership",
        tenant_id,
        source,
        "identity",
        {
            "status": status,
            "title": role_name,
            "summary": f"{member_count} leden in deze rol",
            "affected_objects": [member.get("upn") for member in (item.get("members") or []) if isinstance(member, dict) and member.get("upn")],
            "recommended_action": (
                "Beperk het aantal Global Admins en review vaste roltoewijzingen."
                if status == "warning"
                else "Controleer of de rolbezetting nog past bij least privilege."
            ),
            "evidence": item,
        },
        captured_at,
    )


def _build_admin_role_membership(tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    run_identity_ps = deps.get("run_identity_ps")
    latest_assessment_snapshot_for_tenant = deps.get("latest_assessment_snapshot_for_tenant")
    assessment_json_payload = deps.get("assessment_json_payload")
    live_error = None
    raw_items = None

    if callable(run_identity_ps):
        try:
            data = run_identity_ps(tenant_id, "list-admin-roles", {})
            items = data.get("roles")
            if data.get("ok") is not False and isinstance(items, list):
                raw_items = items
                captured_at = str(data.get("_generated_at") or data.get("captured_at") or _now_iso(deps))
                source = "live"
            else:
                live_error = data.get("error") or data.get("message")
        except Exception as exc:
            live_error = str(exc)

    if raw_items is None:
        if strict_live:
            return _error_payload("admin-role-membership", tenant_id, "identity", "live_unavailable", live_error or "Live beheerdersrollen niet beschikbaar.")
        snapshot = latest_assessment_snapshot_for_tenant(tenant_id) if callable(latest_assessment_snapshot_for_tenant) else {}
        payload = assessment_json_payload(snapshot, "identity", "admin-roles") if callable(assessment_json_payload) else None
        if isinstance(payload, dict):
            raw_items = payload.get("roles") or payload.get("items") or []
            captured_at = str(payload.get("generated_at") or snapshot.get("assessment_generated_at") or _now_iso(deps))
            source = "assessment_snapshot"
        else:
            return _error_payload("admin-role-membership", tenant_id, "identity", "data_partial", live_error or "Geen beheerdersrollen beschikbaar.")

    items = [_normalize_admin_role_item(item, source, tenant_id, captured_at) for item in raw_items if isinstance(item, dict)]
    return _build_response("admin-role-membership", tenant_id, source, "identity", captured_at, items)


def _build_break_glass_accounts(tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    admin_payload = _build_admin_role_membership(tenant_id, strict_live, deps)
    if not admin_payload.get("items"):
        if admin_payload.get("errors"):
            return _error_payload("break-glass-accounts", tenant_id, "identity", admin_payload["errors"][0].get("type") or "data_partial", admin_payload["errors"][0].get("message") or "Break-glass data niet beschikbaar.")
        return _build_response("break-glass-accounts", tenant_id, admin_payload.get("source") or "unavailable", "identity", admin_payload.get("captured_at") or "", [])

    source = admin_payload.get("source") or "unavailable"
    captured_at = admin_payload.get("captured_at") or ""
    seen = set()
    detected = []
    markers = ("breakglass", "break-glass", "emergency", "nood", "glass")
    for role_item in admin_payload.get("items") or []:
        evidence = role_item.get("evidence") or {}
        for member in evidence.get("members") or []:
            if not isinstance(member, dict):
                continue
            upn = str(member.get("upn") or member.get("mail") or "").strip()
            display_name = str(member.get("displayName") or "").strip()
            probe = f"{display_name} {upn}".lower()
            if not any(marker in probe for marker in markers):
                continue
            key = upn or display_name
            if not key or key in seen:
                continue
            seen.add(key)
            detected.append(
                _normalize_control_item(
                    "break-glass-accounts",
                    tenant_id,
                    source,
                    "identity",
                    {
                        "status": "warning",
                        "title": display_name or upn or "Break-glass account",
                        "summary": f"Privileged noodaccount gedetecteerd in rol {evidence.get('roleName') or role_item.get('title') or 'onbekend'}",
                        "affected_objects": [upn] if upn else [],
                        "recommended_action": "Valideer dat dit noodaccount MFA, monitoring en een periodieke review heeft.",
                        "evidence": member,
                    },
                    captured_at,
                )
            )
    if detected:
        return _build_response("break-glass-accounts", tenant_id, source, "identity", captured_at, detected)
    return _build_response(
        "break-glass-accounts",
        tenant_id,
        source,
        "identity",
        captured_at,
        [
            _normalize_control_item(
                "break-glass-accounts",
                tenant_id,
                source,
                "identity",
                {
                    "status": "warning",
                    "title": "Geen break-glass account gedetecteerd",
                    "summary": "Er is geen herkenbaar noodaccount gevonden in de huidige privileged rolbezetting.",
                    "affected_objects": [],
                    "recommended_action": "Overweeg minimaal één streng beheerd break-glass account in te richten en te documenteren.",
                    "evidence": {},
                },
                captured_at,
            )
        ],
    )


def _build_legacy_auth_exposure(tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    run_identity_ps = deps.get("run_identity_ps")
    live_error = None
    raw_items = None
    if callable(run_identity_ps):
        try:
            data = run_identity_ps(tenant_id, "list-legacy-auth", {})
            users = data.get("users") or data.get("items")
            if data.get("ok") is not False and isinstance(users, list):
                raw_items = users
                captured_at = str(data.get("_generated_at") or data.get("captured_at") or _now_iso(deps))
                source = "live"
            else:
                live_error = data.get("error") or data.get("message")
        except Exception as exc:
            live_error = str(exc)
    if raw_items is None:
        if strict_live:
            return _error_payload("legacy-auth-exposure", tenant_id, "identity", "live_unavailable", live_error or "Live legacy-auth data niet beschikbaar.")
        return _error_payload("legacy-auth-exposure", tenant_id, "identity", "data_partial", live_error or "Geen legacy-auth data beschikbaar.")

    items = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        upn = item.get("upn") or ""
        items.append(
            _normalize_control_item(
                "legacy-auth-exposure",
                tenant_id,
                source,
                "identity",
                {
                    "status": "critical",
                    "title": item.get("displayName") or upn or "Legacy-auth gebruiker",
                    "summary": f"Legacy clients: {item.get('clients') or 'onbekend'} · {item.get('signInCount') or 0} aanmeldingen",
                    "affected_objects": [upn] if upn else [],
                    "recommended_action": "Blokkeer legacy authenticatie via Conditional Access en onderzoek of deze clients nog nodig zijn.",
                    "evidence": item,
                },
                captured_at,
            )
        )
    return _build_response("legacy-auth-exposure", tenant_id, source, "identity", captured_at, items)


def _build_teams_with_guests(tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    run_collab_ps = deps.get("run_collab_ps")
    snapshot_as_teams = deps.get("snapshot_as_teams")
    live_error = None
    raw_items = None
    if callable(run_collab_ps):
        try:
            data = run_collab_ps(tenant_id, "list-teams", {})
            teams = data.get("teams")
            if data.get("ok") is not False and isinstance(teams, list):
                raw_items = teams
                captured_at = str(data.get("_generated_at") or data.get("captured_at") or _now_iso(deps))
                source = "live"
            else:
                live_error = data.get("error") or data.get("message")
        except Exception as exc:
            live_error = str(exc)
    if raw_items is None:
        if strict_live:
            return _error_payload("teams-with-guests", tenant_id, "teams", "live_unavailable", live_error or "Live Teams-data niet beschikbaar.")
        raw_items = snapshot_as_teams(tenant_id) if callable(snapshot_as_teams) else []
        if not raw_items:
            return _error_payload("teams-with-guests", tenant_id, "teams", "data_partial", live_error or "Geen Teams-data beschikbaar.")
        source = "assessment_snapshot"
        captured_at = _now_iso(deps)

    items = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        guest_count = int(item.get("guestCount") or 0)
        if guest_count <= 0:
            continue
        items.append(
            _normalize_control_item(
                "teams-with-guests",
                tenant_id,
                source,
                "teams",
                {
                    "status": "warning",
                    "title": item.get("displayName") or item.get("mail") or "Team",
                    "summary": f"{guest_count} gastleden · {item.get('ownerCount') or 0} owners",
                    "affected_objects": [item.get("id") or item.get("mail")] if (item.get("id") or item.get("mail")) else [],
                    "recommended_action": "Controleer of gasttoegang voor dit team nog nodig is en review de owners.",
                    "evidence": item,
                },
                captured_at,
            )
        )
    return _build_response("teams-with-guests", tenant_id, source, "teams", captured_at, items)


def _build_sharepoint_sharing_risk(tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    run_collab_ps = deps.get("run_collab_ps")
    snapshot_as_sharepoint_settings = deps.get("snapshot_as_sharepoint_settings")
    live_error = None
    settings = None
    if callable(run_collab_ps):
        try:
            data = run_collab_ps(tenant_id, "get-sharepoint-settings", {})
            if data.get("ok") is not False and isinstance(data, dict):
                settings = data
                captured_at = str(data.get("_generated_at") or data.get("captured_at") or _now_iso(deps))
                source = "live"
            else:
                live_error = data.get("error") or data.get("message")
        except Exception as exc:
            live_error = str(exc)
    if settings is None:
        if strict_live:
            return _error_payload("sharepoint-sharing-risk", tenant_id, "sharepoint", "live_unavailable", live_error or "Live SharePoint sharing-data niet beschikbaar.")
        settings = snapshot_as_sharepoint_settings(tenant_id) if callable(snapshot_as_sharepoint_settings) else None
        if not isinstance(settings, dict) or not settings:
            return _error_payload("sharepoint-sharing-risk", tenant_id, "sharepoint", "data_partial", live_error or "Geen SharePoint sharing-data beschikbaar.")
        source = "assessment_snapshot"
        captured_at = _now_iso(deps)

    sharing = str(settings.get("sharingCapability") or settings.get("ExternalSharing") or "Onbekend")
    normalized = sharing.lower()
    if normalized in {"disabled", "existingexternalusersharingonly"}:
        status = "ok"
    elif normalized in {"externalusersharingonly"}:
        status = "warning"
    else:
        status = "critical"
    item = _normalize_control_item(
        "sharepoint-sharing-risk",
        tenant_id,
        source,
        "sharepoint",
        {
            "status": status,
            "title": "SharePoint externe deling",
            "summary": f"Sharingsniveau: {sharing}",
            "affected_objects": [],
            "recommended_action": (
                "Beperk delen tot bestaande externe gebruikers of schakel anonieme toegang uit."
                if status != "ok"
                else "Huidige sharing policy lijkt passend, blijf periodiek reviewen."
            ),
            "evidence": settings,
        },
        captured_at,
    )
    return _build_response("sharepoint-sharing-risk", tenant_id, source, "sharepoint", captured_at, [item])


def _build_exchange_detection(
    tenant_id: str,
    strict_live: bool,
    deps: Dict[str, Any],
    *,
    control_key: str,
    action: str,
    category: str,
    default_title: str,
    summary_builder,
) -> Dict[str, Any]:
    run_exchange_ps = deps.get("run_exchange_ps")
    db_fetchone = deps.get("db_fetchone")
    finding_control_key = {
        "mail-forwarding-detection": "exchange-forwarding",
        "inbox-rule-risk-detection": "exchange-inbox-rules",
    }.get(control_key, control_key)
    live_error = None
    raw_items = None

    if callable(run_exchange_ps):
        try:
            data = run_exchange_ps(tenant_id, action, {})
            raw_items = data.get("items") or data.get("forwarding") or data.get("rules")
            if data.get("ok") is not False and isinstance(raw_items, list):
                captured_at = str(data.get("_generated_at") or data.get("captured_at") or _now_iso(deps))
                source = "live"
            else:
                live_error = data.get("error") or data.get("message")
                raw_items = None
        except Exception as exc:
            live_error = str(exc)
    if raw_items is None:
        if strict_live:
            return _error_payload(control_key, tenant_id, category, "live_unavailable", live_error or f"Live data voor {default_title} niet beschikbaar.")
        snapshot_row = None
        if callable(db_fetchone):
            snapshot_row = db_fetchone(
                """
                SELECT title, status, finding, recommendation, scanned_at
                FROM scan_findings
                WHERE tenant_id=? AND control=?
                ORDER BY scanned_at DESC
                LIMIT 1
                """,
                (tenant_id, finding_control_key),
            )
        if snapshot_row:
            captured_at = str(snapshot_row["scanned_at"] or "")
            items = [
                _normalize_control_item(
                    control_key,
                    tenant_id,
                    "assessment_snapshot",
                    category,
                    {
                        "status": snapshot_row["status"] or "info",
                        "title": snapshot_row["title"] or default_title,
                        "summary": snapshot_row["finding"] or "",
                        "recommended_action": snapshot_row["recommendation"] or "",
                        "affected_objects": [],
                        "evidence": {},
                    },
                    captured_at,
                )
            ]
            return _build_response(control_key, tenant_id, "assessment_snapshot", category, captured_at, items)
        return _error_payload(control_key, tenant_id, category, "data_partial", live_error or f"Geen data voor {default_title} beschikbaar.")

    captured_at = captured_at or _now_iso(deps)
    items = []
    for item in raw_items or []:
        if not isinstance(item, dict):
            continue
        items.append(summary_builder(item, source, tenant_id, captured_at))
    return _build_response(control_key, tenant_id, source, category, captured_at, items)


def _normalize_forwarding_item(item: Dict[str, Any], source: str, tenant_id: str, captured_at: str) -> Dict[str, Any]:
    mailbox = item.get("displayName") or item.get("mailbox") or item.get("mail") or item.get("userPrincipalName") or "Mailbox"
    target = item.get("forwardingAddress") or item.get("target") or item.get("forwardTo") or item.get("recipient") or "onbekend"
    affected = item.get("mail") or item.get("userPrincipalName") or mailbox
    return _normalize_control_item(
        "mail-forwarding-detection",
        tenant_id,
        source,
        "exchange",
        {
            "status": "critical",
            "title": mailbox,
            "summary": f"Doorsturen naar {target}",
            "affected_objects": [affected] if affected else [],
            "recommended_action": "Controleer of deze forwarding gewenst is en verwijder externe forwarding als die niet expliciet is goedgekeurd.",
            "evidence": item,
        },
        captured_at,
    )


def _normalize_rule_item(item: Dict[str, Any], source: str, tenant_id: str, captured_at: str) -> Dict[str, Any]:
    mailbox = item.get("displayName") or item.get("mailbox") or item.get("mail") or item.get("userPrincipalName") or "Mailbox"
    rule_name = item.get("name") or item.get("ruleName") or "Inboxregel"
    summary = item.get("summary") or item.get("description") or item.get("action") or "Verdachte inboxregel"
    affected = item.get("mail") or item.get("userPrincipalName") or mailbox
    suspicious = item.get("isSuspicious")
    status = "critical" if suspicious is not False else "warning"
    return _normalize_control_item(
        "inbox-rule-risk-detection",
        tenant_id,
        source,
        "exchange",
        {
            "status": status,
            "title": f"{mailbox} · {rule_name}",
            "summary": summary,
            "affected_objects": [affected] if affected else [],
            "recommended_action": "Onderzoek en verwijder verdachte inboxregels. Valideer of de mailbox recent is gecompromitteerd.",
            "evidence": item,
        },
        captured_at,
    )


def _build_mail_forwarding_detection(tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    return _build_exchange_detection(
        tenant_id,
        strict_live,
        deps,
        control_key="mail-forwarding-detection",
        action="list-forwarding",
        category="exchange",
        default_title="Doorsturen",
        summary_builder=_normalize_forwarding_item,
    )


def _build_inbox_rule_risk_detection(tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    return _build_exchange_detection(
        tenant_id,
        strict_live,
        deps,
        control_key="inbox-rule-risk-detection",
        action="list-mailbox-rules",
        category="exchange",
        default_title="Inboxregels",
        summary_builder=_normalize_rule_item,
    )


def _normalize_mailbox_permission_item(item: Dict[str, Any], source: str, tenant_id: str, captured_at: str) -> Dict[str, Any]:
    mailbox = item.get("displayName") or item.get("mail") or item.get("PrimarySmtpAddress") or "Shared mailbox"
    mail = item.get("mail") or item.get("PrimarySmtpAddress") or ""
    full_access = int(item.get("fullAccessCount") or item.get("FullAccessCount") or 0)
    send_as = int(item.get("sendAsCount") or item.get("SendAsCount") or 0)
    send_on_behalf = int(item.get("sendOnBehalfCount") or item.get("SendOnBehalfCount") or 0)
    total = full_access + send_as + send_on_behalf
    if total >= 6:
        status = "critical"
    elif total > 0:
        status = "warning"
    else:
        status = "ok"
    return _normalize_control_item(
        "mailbox-permission-governance",
        tenant_id,
        source,
        "exchange",
        {
            "status": status,
            "title": mailbox,
            "summary": f"Full Access: {full_access} · Send As: {send_as} · Send On Behalf: {send_on_behalf}",
            "affected_objects": [mail] if mail else [],
            "recommended_action": (
                "Controleer of alle mailboxdelegaties nog nodig zijn en beperk brede rechten."
                if total > 0
                else "Geen mailboxdelegaties gevonden die opvolging vragen."
            ),
            "evidence": {
                **item,
                "fullAccessCount": full_access,
                "sendAsCount": send_as,
                "sendOnBehalfCount": send_on_behalf,
                "permissionCount": total,
            },
        },
        captured_at,
    )


def _build_mailbox_permission_governance(tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    run_exchange_ps = deps.get("run_exchange_ps")
    latest_assessment_snapshot_for_tenant = deps.get("latest_assessment_snapshot_for_tenant")
    live_error = None
    raw_items = None
    source = "assessment_snapshot"
    captured_at = _now_iso(deps)

    if callable(run_exchange_ps):
        try:
            data = run_exchange_ps(tenant_id, "list-shared-mailboxes", {})
            items = data.get("mailboxes")
            if data.get("ok") is not False and isinstance(items, list):
                enriched = []
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    # Graph-only shared mailbox listing is useful, but permission counts are only meaningful when present.
                    evidence = dict(item)
                    evidence["fullAccessCount"] = int(item.get("fullAccessCount") or item.get("FullAccessCount") or 0)
                    evidence["sendAsCount"] = int(item.get("sendAsCount") or item.get("SendAsCount") or 0)
                    evidence["sendOnBehalfCount"] = int(item.get("sendOnBehalfCount") or item.get("SendOnBehalfCount") or 0)
                    enriched.append(evidence)
                if any((it.get("fullAccessCount") or it.get("sendAsCount") or it.get("sendOnBehalfCount")) for it in enriched):
                    raw_items = enriched
                    captured_at = str(data.get("_generated_at") or data.get("captured_at") or _now_iso(deps))
                    source = "live"
            if raw_items is None:
                live_error = data.get("error") or "Live mailboxrechten niet volledig beschikbaar; gebruik snapshotdata."
        except Exception as exc:
            live_error = str(exc)

    if raw_items is None:
        if strict_live:
            return _error_payload("mailbox-permission-governance", tenant_id, "exchange", "live_unavailable", live_error or "Live mailboxrechten niet beschikbaar.")
        snapshot = latest_assessment_snapshot_for_tenant(tenant_id) if callable(latest_assessment_snapshot_for_tenant) else {}
        raw_items = snapshot.get("assessment_shared_mailboxes") or []
        captured_at = str(snapshot.get("assessment_generated_at") or _now_iso(deps))
        source = "assessment_snapshot"
        if not raw_items:
            return _error_payload("mailbox-permission-governance", tenant_id, "exchange", "data_partial", live_error or "Geen mailboxrechten beschikbaar.")

    items = []
    for item in raw_items or []:
        if not isinstance(item, dict):
            continue
        items.append(_normalize_mailbox_permission_item(item, source, tenant_id, captured_at))
    return _build_response("mailbox-permission-governance", tenant_id, source, "exchange", captured_at, items)


def _build_domain_mail_auth(tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    latest_assessment_snapshot_for_tenant = deps.get("latest_assessment_snapshot_for_tenant")
    if strict_live:
        return _error_payload("domain-mail-auth", tenant_id, "exchange", "live_unavailable", "Live DNS-checks niet beschikbaar — gebruik assessment snapshot.")
    snapshot = latest_assessment_snapshot_for_tenant(tenant_id) if callable(latest_assessment_snapshot_for_tenant) else {}
    raw_checks: List[Dict[str, Any]] = snapshot.get("assessment_domain_dns_checks") or []
    captured_at = str(snapshot.get("assessment_generated_at") or _now_iso(deps))
    if not raw_checks:
        return _error_payload("domain-mail-auth", tenant_id, "exchange", "data_partial", "Geen e-mail authenticatie-checks gevonden in het assessment.")
    items = []
    for check in raw_checks:
        if not isinstance(check, dict):
            continue
        domain = check.get("Domain") or check.get("domain") or "Onbekend domein"
        spf = str(check.get("SPF") or check.get("spf") or "unknown").lower()
        dkim = str(check.get("DKIM") or check.get("dkim") or "unknown").lower()
        dmarc = str(check.get("DMARC") or check.get("dmarc") or "unknown").lower()
        missing = [label for label, val in [("SPF", spf), ("DKIM", dkim), ("DMARC", dmarc)] if val in {"missing", "fail", "none", "unknown", "not found"}]
        if len(missing) >= 2:
            status = "critical"
        elif missing:
            status = "warning"
        else:
            status = "ok"
        summary_parts = [f"SPF: {spf}", f"DKIM: {dkim}", f"DMARC: {dmarc}"]
        action = (
            f"Voeg ontbrekende DNS-records toe voor {domain}: {', '.join(missing)}."
            if missing
            else f"Alle e-mail authenticatie-records zijn aanwezig voor {domain}."
        )
        items.append(_normalize_control_item(
            "domain-mail-auth",
            tenant_id,
            "assessment_snapshot",
            "exchange",
            {
                "status": status,
                "title": domain,
                "summary": " · ".join(summary_parts),
                "affected_objects": [domain],
                "recommended_action": action,
                "evidence": check,
            },
            captured_at,
        ))
    return _build_response("domain-mail-auth", tenant_id, "assessment_snapshot", "exchange", captured_at, items)


def build_control_payload(control_key: str, tenant_id: str, strict_live: bool, deps: Dict[str, Any]) -> Dict[str, Any]:
    builders = {
        "guest-user-governance": _build_guest_user_governance,
        "app-secrets-and-certs": _build_app_secrets_and_certs,
        "ca-policy-export": _build_ca_policy_export,
        "mail-forwarding-detection": _build_mail_forwarding_detection,
        "inbox-rule-risk-detection": _build_inbox_rule_risk_detection,
        "mailbox-permission-governance": _build_mailbox_permission_governance,
        "domain-mail-auth": _build_domain_mail_auth,
        "admin-role-membership": _build_admin_role_membership,
        "break-glass-accounts": _build_break_glass_accounts,
        "legacy-auth-exposure": _build_legacy_auth_exposure,
        "teams-with-guests": _build_teams_with_guests,
        "sharepoint-sharing-risk": _build_sharepoint_sharing_risk,
    }
    builder = builders.get(control_key)
    if not builder:
        return _error_payload(control_key, tenant_id, "unknown", "data_partial", "Onbekende control_key.")
    return builder(tenant_id, strict_live, deps)
