import re


def dispatch_microsoft_services_get_routes(path, qs, deps):
    run_intune_ps = deps.get("run_intune_ps")
    snapshot_as_intune_devices = deps.get("snapshot_as_intune_devices")
    snapshot_as_intune_compliance = deps.get("snapshot_as_intune_compliance")
    snapshot_as_intune_config = deps.get("snapshot_as_intune_config")
    snapshot_as_intune_summary = deps.get("snapshot_as_intune_summary")
    list_intune_history = deps.get("list_intune_history")
    run_backup_ps = deps.get("run_backup_ps")
    snapshot_as_sharepoint_sites = deps.get("snapshot_as_sharepoint_sites")
    snapshot_as_sharepoint_backup = deps.get("snapshot_as_sharepoint_backup")
    snapshot_as_onedrive_backup = deps.get("snapshot_as_onedrive_backup")
    list_backup_history = deps.get("list_backup_history")
    run_ca_ps = deps.get("run_ca_ps")
    snapshot_as_ca_policies = deps.get("snapshot_as_ca_policies")
    list_ca_history = deps.get("list_ca_history")
    attach_source_meta = deps.get("attach_source_meta")

    if re.fullmatch(r"/api/intune/[^/]+/devices", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_intune_ps(tenant_id, "list-devices", {})
            if data.get("ok") is not False and data.get("devices"):
                return (200, data)
        except Exception:
            pass
        devices = snapshot_as_intune_devices(tenant_id)
        return (200, attach_source_meta({"ok": True, "devices": devices}, "assessment_snapshot", tenant_id=tenant_id))

    if re.fullmatch(r"/api/intune/[^/]+/devices/[^/]+", path):
        parts = path.split("/")
        tenant_id, device_id = parts[3], parts[5]
        try:
            data = run_intune_ps(tenant_id, "get-device", {"device_id": device_id})
            if data.get("ok") is not False:
                return (200, data)
        except Exception:
            pass
        devices = snapshot_as_intune_devices(tenant_id)
        device = next((item for item in devices if item.get("id") == device_id or item.get("deviceName") == device_id), None)
        if device:
            return (200, attach_source_meta({"ok": True, "device": device}, "assessment_snapshot", tenant_id=tenant_id))
        return (404, {"error": "Apparaat niet gevonden"})

    if re.fullmatch(r"/api/intune/[^/]+/compliance", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_intune_ps(tenant_id, "list-compliance", {})
            if data.get("ok") is not False and data.get("policies"):
                return (200, data)
        except Exception:
            pass
        policies = snapshot_as_intune_compliance(tenant_id)
        return (200, attach_source_meta({"ok": True, "policies": policies}, "assessment_snapshot", tenant_id=tenant_id))

    if re.fullmatch(r"/api/intune/[^/]+/config", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_intune_ps(tenant_id, "list-config", {})
            if data.get("ok") is not False and data.get("profiles"):
                return (200, data)
        except Exception:
            pass
        profiles = snapshot_as_intune_config(tenant_id)
        return (200, attach_source_meta({"ok": True, "profiles": profiles}, "assessment_snapshot", tenant_id=tenant_id))

    if re.fullmatch(r"/api/intune/[^/]+/summary", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_intune_ps(tenant_id, "get-compliance-summary", {})
            if data.get("ok") is not False and ("score" in data or "total" in data):
                return (200, data)
        except Exception:
            pass
        summary = snapshot_as_intune_summary(tenant_id)
        if summary:
            return (200, attach_source_meta(summary, "assessment_snapshot", tenant_id=tenant_id))
        return (200, {"ok": False, "error": "Intune data niet beschikbaar"})

    if re.fullmatch(r"/api/intune/[^/]+/history", path):
        tenant_id = path.split("/")[3]
        limit = int(qs.get("limit", ["50"])[0])
        return (200, {"items": list_intune_history(tenant_id, limit)})

    if re.fullmatch(r"/api/backup/[^/]+/summary", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_backup_ps(tenant_id, "get-summary")
            if data.get("ok"):
                return (200, data)
        except Exception:
            pass
        sharepoint_sites = snapshot_as_sharepoint_sites(tenant_id)
        onedrive = snapshot_as_onedrive_backup(tenant_id)
        return (
            200,
            attach_source_meta(
                {
                    "ok": True,
                    "serviceStatus": "assessment_snapshot",
                    "sharePoint": {"policyCount": 1 if sharepoint_sites else 0, "resourceCount": len(sharepoint_sites)},
                    "oneDrive": {
                        "policyCount": 1 if (onedrive.get("policies") or []) else 0,
                        "resourceCount": len((onedrive.get("policies") or [{}])[0].get("drives") or []) if onedrive.get("policies") else 0,
                    },
                    "exchange": {"policyCount": 0, "resourceCount": 0},
                },
                "assessment_snapshot",
                tenant_id=tenant_id,
            ),
        )

    if re.fullmatch(r"/api/backup/[^/]+/status", path):
        tenant_id = path.split("/")[3]
        return (200, run_backup_ps(tenant_id, "get-status"))

    if re.fullmatch(r"/api/backup/[^/]+/sharepoint", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_backup_ps(tenant_id, "list-sharepoint")
            if data.get("ok"):
                return (200, data)
        except Exception:
            pass
        return (200, attach_source_meta(snapshot_as_sharepoint_backup(tenant_id), "assessment_snapshot", tenant_id=tenant_id))

    if re.fullmatch(r"/api/backup/[^/]+/onedrive", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_backup_ps(tenant_id, "list-onedrive")
            if data.get("ok"):
                return (200, data)
        except Exception:
            pass
        return (200, attach_source_meta(snapshot_as_onedrive_backup(tenant_id), "assessment_snapshot", tenant_id=tenant_id))

    if re.fullmatch(r"/api/backup/[^/]+/exchange", path):
        tenant_id = path.split("/")[3]
        return (200, run_backup_ps(tenant_id, "list-exchange"))

    if re.fullmatch(r"/api/backup/[^/]+/history", path):
        tenant_id = path.split("/")[3]
        limit = int(qs.get("limit", ["50"])[0])
        return (200, {"items": list_backup_history(tenant_id, limit)})

    if re.fullmatch(r"/api/ca/[^/]+/policies", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_ca_ps(tenant_id, "list-policies", {})
            if data.get("ok") and data.get("policies") is not None:
                return (200, data)
        except Exception:
            pass
        policies = snapshot_as_ca_policies(tenant_id)
        return (200, attach_source_meta({"ok": True, "policies": policies, "count": len(policies)}, "assessment_snapshot", tenant_id=tenant_id))

    if re.fullmatch(r"/api/ca/[^/]+/policies/[^/]+", path):
        parts = path.split("/")
        tenant_id, policy_id = parts[3], parts[5]
        try:
            data = run_ca_ps(tenant_id, "get-policy", {"policy_id": policy_id})
            if data.get("ok") and data.get("policy"):
                return (200, data)
        except Exception:
            data = None
        # Snapshot fallback: zoek policy in laatst bekende assessmentdata.
        policies = snapshot_as_ca_policies(tenant_id)
        policy = next((p for p in policies if str(p.get("id") or "") == str(policy_id)), None)
        if policy:
            payload = attach_source_meta({"ok": True, "policy": policy}, "assessment_snapshot", tenant_id=tenant_id)
            if isinstance(data, dict) and data.get("error"):
                payload["fallback_reason"] = data.get("error")
            return (200, payload)
        if isinstance(data, dict) and data.get("error"):
            return (502, {"ok": False, "error": data.get("error")})
        return (404, {"ok": False, "error": "Policy niet gevonden"})

    if re.fullmatch(r"/api/ca/[^/]+/named-locations", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_ca_ps(tenant_id, "list-named-locations", {})
            if data.get("ok") is not False:
                return (200, data)
        except Exception:
            data = None
        payload = attach_source_meta({"ok": True, "locations": [], "count": 0}, "assessment_snapshot", tenant_id=tenant_id)
        if isinstance(data, dict) and data.get("error"):
            payload["fallback_reason"] = data.get("error")
        return (200, payload)

    if re.fullmatch(r"/api/ca/[^/]+/history", path):
        tenant_id = path.split("/")[3]
        limit = int(qs.get("limit", ["50"])[0])
        return (200, {"items": list_ca_history(tenant_id, limit)})

    return None


def dispatch_microsoft_services_post_routes(path, sess, read_json, deps):
    run_intune_ps = deps.get("run_intune_ps")
    run_ca_ps = deps.get("run_ca_ps")

    if re.fullmatch(r"/api/intune/[^/]+/deploy-config", path):
        tenant_id = path.split("/")[3]
        payload = read_json()
        dry_run = payload.pop("dry_run", False)
        result = run_intune_ps(tenant_id, "deploy-config", payload, dry_run, executed_by=sess.get("email", "admin"))
        if not result.get("ok"):
            return (502, {"error": result.get("error", "Fout bij toewijzen profiel")})
        return (200, result)

    if re.fullmatch(r"/api/ca/[^/]+/policies/[^/]+/toggle", path):
        parts = path.split("/")
        tenant_id, policy_id = parts[3], parts[5]
        payload = read_json()
        action = "enable-policy" if payload.get("action") == "enable" else "disable-policy"
        result = run_ca_ps(tenant_id, action, {"policy_id": policy_id}, executed_by=sess.get("email", "admin"))
        if not result.get("ok"):
            return (502, {"error": result.get("error", "Fout bij toggle")})
        return (200, result)

    return None
