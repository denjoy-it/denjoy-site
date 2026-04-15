import re


def dispatch_platform_security_get_routes(path, qs, deps):
    run_cis_ps = deps.get("run_cis_ps")
    snapshot_as_cis_data = deps.get("snapshot_as_cis_data")
    run_hybrid_ps = deps.get("run_hybrid_ps")
    snapshot_as_hybrid_sync = deps.get("snapshot_as_hybrid_sync")
    run_domains_ps = deps.get("run_domains_ps")
    snapshot_as_domains = deps.get("snapshot_as_domains")
    run_identity_ps = deps.get("run_identity_ps")
    latest_assessment_snapshot_for_tenant = deps.get("latest_assessment_snapshot_for_tenant")
    assessment_json_payload = deps.get("assessment_json_payload")
    payload_value = deps.get("payload_value")
    snapshot_raw_metrics = deps.get("snapshot_raw_metrics")
    snapshot_as_users = deps.get("snapshot_as_users")
    attach_source_meta = deps.get("attach_source_meta")
    logger = deps.get("logger")

    if re.fullmatch(r"/api/compliance/[^/]+/cis", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_cis_ps(tenant_id, "run-checks", {})
            if data.get("ok"):
                return (200, attach_source_meta(data, "live", tenant_id=tenant_id))
        except Exception as exc:
            if logger is not None:
                logger.warning("[CIS] Live script mislukt, valt terug op snapshot: %s", exc)
        payload = snapshot_as_cis_data(tenant_id)
        if isinstance(payload, dict):
            return (200, attach_source_meta(payload, "assessment_snapshot", tenant_id=tenant_id))
        return (
            200,
            attach_source_meta(
                {
                    "ok": True,
                    "summary": {"pass": 0, "fail": 0, "warning": 0, "na": 0, "total": 0, "score": 0},
                    "items": [],
                    "section": "compliance",
                    "subsection": "cis",
                },
                "assessment_snapshot",
                tenant_id=tenant_id,
            ),
        )

    if re.fullmatch(r"/api/hybrid/[^/]+/sync", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_hybrid_ps(tenant_id, "get-hybrid-sync", {})
            if data.get("ok"):
                return (200, attach_source_meta(data, "live", tenant_id=tenant_id))
        except Exception as exc:
            if logger is not None:
                logger.warning("[Hybrid] Live script mislukt, valt terug op snapshot: %s", exc)
        payload = snapshot_as_hybrid_sync(tenant_id)
        if isinstance(payload, dict):
            return (200, attach_source_meta(payload, "assessment_snapshot", tenant_id=tenant_id))
        return (
            200,
            attach_source_meta(
                {
                    "ok": True,
                    "summary": {"isHybrid": False, "syncEnabled": False, "authType": "Cloud Only", "totalUsers": 0},
                    "items": [],
                    "section": "hybrid",
                    "subsection": "sync",
                },
                "assessment_snapshot",
                tenant_id=tenant_id,
            ),
        )

    if re.fullmatch(r"/api/domains/[^/]+/list", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_domains_ps(tenant_id, "list-domains", {})
            if data.get("ok") and data.get("domains") is not None:
                return (200, data)
        except Exception:
            pass
        domains = snapshot_as_domains(tenant_id)
        return (200, {"ok": True, "domains": domains, "count": len(domains), "_source": "assessment_snapshot"})

    if re.fullmatch(r"/api/domains/[^/]+/analyse", path):
        tenant_id = path.split("/")[3]
        domain = qs.get("domain", [None])[0]
        if not domain:
            return (400, {"error": "domain parameter vereist"})
        return (200, run_domains_ps(tenant_id, "analyse-domain", {"domain": domain}))

    if re.fullmatch(r"/api/identity/[^/]+/mfa", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_identity_ps(tenant_id, "list-mfa", {})
            if data.get("ok") is not False:
                return (200, data)
        except Exception:
            pass
        snapshot = latest_assessment_snapshot_for_tenant(tenant_id)
        payload = assessment_json_payload(snapshot, "identity", "mfa")
        if isinstance(payload, dict):
            summary = payload.get("summary") or {}
            return (
                200,
                attach_source_meta(
                    {
                        "ok": True,
                        "items": payload.get("items") or [],
                        "count": len(payload.get("items") or []),
                        "enabledMemberUsers": int(summary.get("enabledMemberUsers") or 0),
                        "usersWithMfa": int(summary.get("usersWithMfa") or 0),
                        "usersWithoutMfa": int(summary.get("usersWithoutMfa") or 0),
                        "mfaCoveragePct": summary.get("mfaCoveragePct"),
                        "checkFailed": bool(summary.get("checkFailed")),
                        "notes": ((payload.get("meta") or {}).get("notes") or []),
                    },
                    "assessment_snapshot",
                    tenant_id=tenant_id,
                ),
            )
        return (200, {"ok": False, "items": [], "error": "MFA-data niet beschikbaar"})

    if re.fullmatch(r"/api/identity/[^/]+/guests", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_identity_ps(tenant_id, "list-guests", {})
            if data.get("ok") is not False:
                items = data.get("guests") if isinstance(data.get("guests"), list) else data.get("items")
                if isinstance(items, list):
                    normalized = dict(data)
                    normalized["guests"] = items
                    normalized["items"] = items
                    normalized["count"] = int(normalized.get("count") or len(items))
                    return (200, attach_source_meta(normalized, "live", tenant_id=tenant_id))
                return (200, attach_source_meta(data, "live", tenant_id=tenant_id))
        except Exception:
            pass
        snapshot = latest_assessment_snapshot_for_tenant(tenant_id)
        payload = assessment_json_payload(snapshot, "identity", "guests")
        if isinstance(payload, dict):
            items = payload.get("guests")
            if not isinstance(items, list):
                items = payload.get("items") or []
            normalized_items = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                normalized_items.append(
                    {
                        "displayName": payload_value(item, "DisplayName", "displayName", default="Gast"),
                        "mail": payload_value(item, "Mail", "mail"),
                        "userPrincipalName": payload_value(item, "UserPrincipalName", "userPrincipalName", default=""),
                        "userType": payload_value(item, "UserType", "userType", default="Guest"),
                        "accountEnabled": bool(payload_value(item, "AccountEnabled", "accountEnabled", default=True)),
                        "lastSignIn": payload_value(item, "LastSignIn", "lastSignIn"),
                        "createdDateTime": payload_value(item, "CreatedDateTime", "createdDateTime"),
                    }
                )
            return (
                200,
                attach_source_meta(
                    {
                        "ok": True,
                        "guests": normalized_items,
                        "items": normalized_items,
                        "count": len(normalized_items),
                    },
                    "assessment_snapshot",
                    tenant_id=tenant_id,
                ),
            )
        snapshot_users = snapshot_as_users(tenant_id) if callable(snapshot_as_users) else []
        guest_items = []
        for item in snapshot_users or []:
            if not isinstance(item, dict):
                continue
            upn = str(item.get("userPrincipalName") or item.get("upn") or "").strip()
            user_type = str(item.get("userType") or "").strip().lower()
            if user_type != "guest" and "#ext#" not in upn.lower():
                continue
            guest_items.append(
                {
                    "displayName": item.get("displayName") or item.get("name") or "Gast",
                    "mail": item.get("mail") or upn,
                    "userPrincipalName": upn,
                    "userType": item.get("userType") or "Guest",
                    "accountEnabled": item.get("accountEnabled") is not False,
                    "lastSignIn": item.get("lastSignIn"),
                    "createdDateTime": item.get("createdDateTime"),
                }
            )
        if guest_items:
            return (
                200,
                attach_source_meta(
                    {
                        "ok": True,
                        "guests": guest_items,
                        "items": guest_items,
                        "count": len(guest_items),
                    },
                    "assessment_snapshot",
                    tenant_id=tenant_id,
                ),
            )
        return (200, {"ok": False, "items": [], "guests": [], "count": 0, "error": "Gast-data niet beschikbaar"})

    if re.fullmatch(r"/api/identity/[^/]+/admin-roles", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_identity_ps(tenant_id, "list-admin-roles", {})
            if data.get("ok") is not False:
                return (200, data)
        except Exception:
            pass
        snapshot = latest_assessment_snapshot_for_tenant(tenant_id)
        payload = assessment_json_payload(snapshot, "identity", "admin-roles")
        if isinstance(payload, dict):
            items = []
            for item in payload.get("items") or []:
                if not isinstance(item, dict):
                    continue
                items.append(
                    {
                        "displayName": payload_value(item, "DisplayName", "displayName", default=""),
                        "userPrincipalName": payload_value(item, "UserPrincipalName", "userPrincipalName", default=""),
                        "lastPasswordChange": payload_value(item, "LastPasswordChange", "lastPasswordChange"),
                        "passwordAgeDays": payload_value(item, "PasswordAgeDays", "passwordAgeDays"),
                        "status": payload_value(item, "Status", "status"),
                    }
                )
            return (200, attach_source_meta({"ok": True, "items": items, "count": len(items)}, "assessment_snapshot", tenant_id=tenant_id))
        return (200, {"ok": False, "items": [], "error": "Rollen-data niet beschikbaar"})

    if re.fullmatch(r"/api/identity/[^/]+/security-defaults", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_identity_ps(tenant_id, "get-security-defaults", {})
            if data.get("ok") is not False:
                return (200, data)
        except Exception:
            pass
        metrics = snapshot_raw_metrics(tenant_id)
        value = metrics.get("SecurityDefaultsEnabled")
        if value is not None:
            return (
                200,
                attach_source_meta(
                    {"ok": True, "enabled": bool(value), "securityDefaultsEnabled": bool(value)},
                    "assessment_snapshot",
                    tenant_id=tenant_id,
                ),
            )
        return (200, {"ok": False, "error": "Security Defaults niet beschikbaar"})

    if re.fullmatch(r"/api/identity/[^/]+/legacy-auth", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_identity_ps(tenant_id, "list-legacy-auth", {})
            if data.get("ok") is not False:
                return (200, data)
        except Exception:
            pass
        return (200, {"ok": False, "items": [], "error": "Legacy-auth data niet beschikbaar"})

    return None
