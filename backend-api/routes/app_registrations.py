import re


def dispatch_app_registration_get_routes(path, deps):
    run_appregs_ps = deps.get("run_appregs_ps")
    latest_assessment_snapshot_for_tenant = deps.get("latest_assessment_snapshot_for_tenant")
    assessment_json_payload = deps.get("assessment_json_payload")
    payload_value = deps.get("payload_value")
    attach_source_meta = deps.get("attach_source_meta")

    if re.fullmatch(r"/api/apps/[^/]+/registrations", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_appregs_ps(tenant_id, "list-appregs", {})
            if data.get("ok") is not False and ("items" in data or "registrations" in data):
                return (200, data)
        except Exception:
            pass
        snapshot = latest_assessment_snapshot_for_tenant(tenant_id)
        payload = assessment_json_payload(snapshot, "apps", "registrations")
        if isinstance(payload, dict):
            items = []
            for item in payload.get("items") or []:
                if not isinstance(item, dict):
                    continue
                permissions = payload_value(item, "Permissions", "permissions", default=None)
                items.append(
                    {
                        "displayName": payload_value(item, "DisplayName", "displayName", default=""),
                        "appId": payload_value(item, "AppId", "appId", default=""),
                        "objectId": payload_value(item, "ObjectId", "objectId", default=""),
                        "createdAt": payload_value(item, "CreatedDateTime", "createdAt"),
                        "secretCount": int(payload_value(item, "SecretCount", "secretCount", default=0) or 0),
                        "secretExpiration": payload_value(item, "SecretExpiration", "secretExpiration"),
                        "secretExpirationStatus": payload_value(item, "SecretExpirationStatus", "secretExpirationStatus"),
                        "certificateCount": int(payload_value(item, "CertificateCount", "certificateCount", default=0) or 0),
                        "certificateExpiration": payload_value(item, "CertificateExpiration", "certificateExpiration"),
                        "certificateExpirationStatus": payload_value(item, "CertificateExpirationStatus", "certificateExpirationStatus"),
                        "permissionCount": int(payload_value(item, "PermissionCount", "permissionCount", default=0) or 0),
                        "hasEnterpriseApp": bool(payload_value(item, "HasEnterpriseApp", "hasEnterpriseApp", default=False)),
                        "permissions": list(permissions) if isinstance(permissions, list) else [],
                    }
                )
            return (200, attach_source_meta({"ok": True, "items": items, "count": len(items)}, "assessment_snapshot", tenant_id=tenant_id))
        return (200, {"ok": False, "items": [], "error": "App Registraties niet beschikbaar"})

    if re.fullmatch(r"/api/apps/[^/]+/registrations/[^/]+", path):
        parts = path.split("/")
        tenant_id, app_id = parts[3], parts[5]
        try:
            data = run_appregs_ps(tenant_id, "get-appreg", {"app_id": app_id})
            if data.get("ok") is not False:
                return (200, data)
        except Exception:
            pass
        snapshot = latest_assessment_snapshot_for_tenant(tenant_id)
        payload = assessment_json_payload(snapshot, "apps", "registrations")
        if isinstance(payload, dict):
            for item in payload.get("items") or []:
                if not isinstance(item, dict):
                    continue
                if (payload_value(item, "AppId", "appId", default="") or "").lower() == app_id.lower():
                    permissions = payload_value(item, "Permissions", "permissions", default=None)
                    return (
                        200,
                        attach_source_meta(
                            {
                                "ok": True,
                                "displayName": payload_value(item, "DisplayName", "displayName", default=""),
                                "appId": payload_value(item, "AppId", "appId", default=""),
                                "signInAudience": None,
                                "createdAt": payload_value(item, "CreatedDateTime", "createdAt"),
                                "hasEnterpriseApp": bool(payload_value(item, "HasEnterpriseApp", "hasEnterpriseApp", default=False)),
                                "secrets": ([{"hint": "•••", "statusLabel": payload_value(item, "SecretExpirationStatus", "secretExpirationStatus")}]
                                            if int(payload_value(item, "SecretCount", "secretCount", default=0) or 0) > 0 else []),
                                "certs": ([{"type": "Certificate", "statusLabel": payload_value(item, "CertificateExpirationStatus", "certificateExpirationStatus")}]
                                          if int(payload_value(item, "CertificateCount", "certificateCount", default=0) or 0) > 0 else []),
                                "redirectUris": [],
                                "identifierUris": [],
                                "requiredResourceAccess": [],
                                "permissions": list(permissions) if isinstance(permissions, list) else [],
                            },
                            "assessment_snapshot",
                            tenant_id=tenant_id,
                        ),
                    )
        return (404, {"ok": False, "error": "App Registratie niet gevonden"})

    return None
