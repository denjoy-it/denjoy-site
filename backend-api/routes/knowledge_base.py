import re


# ── Validatiehulpfuncties ─────────────────────────────────────────────────────

def _kb_validate_str(value, field: str, max_len: int = 500) -> str:
    """Valideer en normaliseer een verplicht string-veld."""
    if not isinstance(value, str):
        raise ValueError(f"Veld '{field}' moet een tekst zijn.")
    stripped = value.strip()
    if not stripped:
        raise ValueError(f"Veld '{field}' mag niet leeg zijn.")
    if len(stripped) > max_len:
        raise ValueError(f"Veld '{field}' mag maximaal {max_len} tekens bevatten.")
    return stripped


def _kb_validate_asset_type(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Ongeldig verzoek: JSON-object verwacht.")
    data["name"] = _kb_validate_str(data.get("name", ""), "name", 200)
    return data


def _kb_validate_asset(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Ongeldig verzoek: JSON-object verwacht.")
    data["name"] = _kb_validate_str(data.get("name", ""), "name", 300)
    return data


def _kb_validate_vlan(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Ongeldig verzoek: JSON-object verwacht.")
    data["name"] = _kb_validate_str(data.get("name", ""), "name", 200)
    vlan_id = data.get("vlan_id")
    if vlan_id is not None:
        try:
            vid = int(vlan_id)
            if not (1 <= vid <= 4094):
                raise ValueError("VLAN ID moet tussen 1 en 4094 liggen.")
            data["vlan_id"] = vid
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Ongeldig VLAN ID: {exc}") from exc
    return data


def _kb_validate_page(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Ongeldig verzoek: JSON-object verwacht.")
    data["title"] = _kb_validate_str(data.get("title", ""), "title", 300)
    return data


def _kb_validate_contact(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Ongeldig verzoek: JSON-object verwacht.")
    data["name"] = _kb_validate_str(data.get("name", ""), "name", 300)
    return data


def _kb_validate_password(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Ongeldig verzoek: JSON-object verwacht.")
    data["label"] = _kb_validate_str(data.get("label", ""), "label", 300)
    # password field may be encrypted at rest — only require non-empty label
    return data


def _kb_validate_software(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Ongeldig verzoek: JSON-object verwacht.")
    data["name"] = _kb_validate_str(data.get("name", ""), "name", 300)
    return data


def _kb_validate_domain(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Ongeldig verzoek: JSON-object verwacht.")
    data["domain"] = _kb_validate_str(data.get("domain", ""), "domain", 253)
    return data


def _kb_validate_changelog(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Ongeldig verzoek: JSON-object verwacht.")
    data["description"] = _kb_validate_str(data.get("description", ""), "description", 1000)
    return data


def dispatch_kb_get_routes(path, qs, deps):
    kb_tid = deps.get("kb_tid")
    kb_iid = deps.get("kb_iid")
    kb_list_asset_types = deps.get("kb_list_asset_types")
    kb_get_meta = deps.get("kb_get_meta")
    kb_list_assets = deps.get("kb_list_assets")
    list_actions_for_asset = deps.get("list_actions_for_asset")
    kb_list_vlans = deps.get("kb_list_vlans")
    kb_list_pages = deps.get("kb_list_pages")
    kb_get_page = deps.get("kb_get_page")
    kb_list_contacts = deps.get("kb_list_contacts")
    kb_list_passwords = deps.get("kb_list_passwords")
    kb_list_software = deps.get("kb_list_software")
    kb_list_domains = deps.get("kb_list_domains")
    latest_assessment_snapshot_for_tenant = deps.get("latest_assessment_snapshot_for_tenant")
    assessment_json_payload = deps.get("assessment_json_payload")
    payload_value = deps.get("payload_value")
    kb_get_m365_profile = deps.get("kb_get_m365_profile")
    kb_list_changelog = deps.get("kb_list_changelog")

    if re.fullmatch(r"/api/kb/[^/]+/asset-types", path):
        return (200, kb_list_asset_types(kb_tid(path)))
    if re.fullmatch(r"/api/kb/[^/]+/meta", path):
        return (200, kb_get_meta(kb_tid(path)))
    if re.fullmatch(r"/api/kb/[^/]+/assets", path):
        return (200, kb_list_assets(kb_tid(path), qs.get("type", [None])[0]))
    if re.fullmatch(r"/api/kb/[^/]+/assets/\d+", path):
        tenant_id = kb_tid(path)
        item_id = kb_iid(path)
        rows = kb_list_assets(tenant_id)
        item = next((row for row in rows if row["id"] == item_id), None)
        if not item:
            return (404, {"error": "Not found"})
        return (200, item)
    if re.fullmatch(r"/api/kb/[^/]+/assets/\d+/findings", path):
        tenant_id = kb_tid(path)
        asset_id = int(path.split("/")[5])
        return (200, {"items": list_actions_for_asset(tenant_id, asset_id)})
    if re.fullmatch(r"/api/kb/[^/]+/vlans", path):
        return (200, kb_list_vlans(kb_tid(path)))
    if re.fullmatch(r"/api/kb/[^/]+/pages", path):
        return (200, kb_list_pages(kb_tid(path)))
    if re.fullmatch(r"/api/kb/[^/]+/pages/\d+", path):
        row = kb_get_page(kb_tid(path), kb_iid(path))
        if not row:
            return (404, {"error": "Not found"})
        return (200, row)
    if re.fullmatch(r"/api/kb/[^/]+/contacts", path):
        return (200, kb_list_contacts(kb_tid(path)))
    if re.fullmatch(r"/api/kb/[^/]+/passwords", path):
        return (200, kb_list_passwords(kb_tid(path)))
    if re.fullmatch(r"/api/kb/[^/]+/software", path):
        return (200, kb_list_software(kb_tid(path)))
    if re.fullmatch(r"/api/kb/[^/]+/domains", path):
        return (200, kb_list_domains(kb_tid(path)))
    if re.fullmatch(r"/api/kb/[^/]+/appregs", path):
        tenant_id = kb_tid(path)
        snapshot = latest_assessment_snapshot_for_tenant(tenant_id) or {}
        payload = assessment_json_payload(snapshot, "apps", "registrations")
        items = []
        if isinstance(payload, dict):
            for item in payload.get("items") or []:
                if not isinstance(item, dict):
                    continue
                permissions = payload_value(item, "Permissions", "permissions", default=None)
                items.append(
                    {
                        "displayName": payload_value(item, "DisplayName", "displayName", default=""),
                        "appId": payload_value(item, "AppId", "appId", default=""),
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
        return (200, {"ok": True, "items": items, "generated_at": snapshot.get("assessment_generated_at")})
    if re.fullmatch(r"/api/kb/[^/]+/m365", path):
        return (200, kb_get_m365_profile(kb_tid(path)))
    if re.fullmatch(r"/api/kb/[^/]+/changelog", path):
        return (200, kb_list_changelog(kb_tid(path)))

    return None


def dispatch_kb_post_routes(path, read_json, deps):
    kb_tid = deps.get("kb_tid")
    kb_create_asset_type = deps.get("kb_create_asset_type")
    kb_create_asset = deps.get("kb_create_asset")
    kb_create_vlan = deps.get("kb_create_vlan")
    kb_create_page = deps.get("kb_create_page")
    kb_create_contact = deps.get("kb_create_contact")
    kb_create_password = deps.get("kb_create_password")
    kb_create_software = deps.get("kb_create_software")
    kb_create_domain = deps.get("kb_create_domain")
    kb_create_changelog = deps.get("kb_create_changelog")
    kb_sync_from_assessment = deps.get("kb_sync_from_assessment")

    if re.fullmatch(r"/api/kb/[^/]+/sync-assessment", path):
        body = read_json() or {}
        force = bool(body.get("force")) if isinstance(body, dict) else False
        return (200, kb_sync_from_assessment(kb_tid(path), force=force))
    if re.fullmatch(r"/api/kb/[^/]+/asset-types", path):
        return (201, kb_create_asset_type(kb_tid(path), _kb_validate_asset_type(read_json())))
    if re.fullmatch(r"/api/kb/[^/]+/assets", path):
        return (201, kb_create_asset(kb_tid(path), _kb_validate_asset(read_json())))
    if re.fullmatch(r"/api/kb/[^/]+/vlans", path):
        return (201, kb_create_vlan(kb_tid(path), _kb_validate_vlan(read_json())))
    if re.fullmatch(r"/api/kb/[^/]+/pages", path):
        return (201, kb_create_page(kb_tid(path), _kb_validate_page(read_json())))
    if re.fullmatch(r"/api/kb/[^/]+/contacts", path):
        return (201, kb_create_contact(kb_tid(path), _kb_validate_contact(read_json())))
    if re.fullmatch(r"/api/kb/[^/]+/passwords", path):
        return (201, kb_create_password(kb_tid(path), _kb_validate_password(read_json())))
    if re.fullmatch(r"/api/kb/[^/]+/software", path):
        return (201, kb_create_software(kb_tid(path), _kb_validate_software(read_json())))
    if re.fullmatch(r"/api/kb/[^/]+/domains", path):
        return (201, kb_create_domain(kb_tid(path), _kb_validate_domain(read_json())))
    if re.fullmatch(r"/api/kb/[^/]+/changelog", path):
        return (201, kb_create_changelog(kb_tid(path), _kb_validate_changelog(read_json())))

    return None


def dispatch_kb_delete_routes(path, deps):
    kb_tid = deps.get("kb_tid")
    kb_iid = deps.get("kb_iid")
    kb_delete_asset_type = deps.get("kb_delete_asset_type")
    kb_delete_asset = deps.get("kb_delete_asset")
    kb_delete_vlan = deps.get("kb_delete_vlan")
    kb_delete_page = deps.get("kb_delete_page")
    kb_delete_contact = deps.get("kb_delete_contact")
    kb_delete_password = deps.get("kb_delete_password")
    kb_delete_software = deps.get("kb_delete_software")
    kb_delete_domain = deps.get("kb_delete_domain")
    kb_delete_changelog = deps.get("kb_delete_changelog")

    if re.fullmatch(r"/api/kb/[^/]+/asset-types/\d+", path):
        kb_delete_asset_type(kb_tid(path), kb_iid(path))
        return (200, {"ok": True})
    if re.fullmatch(r"/api/kb/[^/]+/assets/\d+", path):
        kb_delete_asset(kb_tid(path), kb_iid(path))
        return (200, {"ok": True})
    if re.fullmatch(r"/api/kb/[^/]+/vlans/\d+", path):
        kb_delete_vlan(kb_tid(path), kb_iid(path))
        return (200, {"ok": True})
    if re.fullmatch(r"/api/kb/[^/]+/pages/\d+", path):
        kb_delete_page(kb_tid(path), kb_iid(path))
        return (200, {"ok": True})
    if re.fullmatch(r"/api/kb/[^/]+/contacts/\d+", path):
        kb_delete_contact(kb_tid(path), kb_iid(path))
        return (200, {"ok": True})
    if re.fullmatch(r"/api/kb/[^/]+/passwords/\d+", path):
        kb_delete_password(kb_tid(path), kb_iid(path))
        return (200, {"ok": True})
    if re.fullmatch(r"/api/kb/[^/]+/software/\d+", path):
        kb_delete_software(kb_tid(path), kb_iid(path))
        return (200, {"ok": True})
    if re.fullmatch(r"/api/kb/[^/]+/domains/\d+", path):
        kb_delete_domain(kb_tid(path), kb_iid(path))
        return (200, {"ok": True})
    if re.fullmatch(r"/api/kb/[^/]+/changelog/\d+", path):
        kb_delete_changelog(kb_tid(path), kb_iid(path))
        return (200, {"ok": True})

    return None


def dispatch_kb_put_routes(path, read_json, deps):
    kb_tid = deps.get("kb_tid")
    kb_iid = deps.get("kb_iid")
    kb_put_meta = deps.get("kb_put_meta")
    kb_update_asset = deps.get("kb_update_asset")
    kb_update_vlan = deps.get("kb_update_vlan")
    kb_update_page = deps.get("kb_update_page")
    kb_update_contact = deps.get("kb_update_contact")
    kb_update_password = deps.get("kb_update_password")
    kb_update_software = deps.get("kb_update_software")
    kb_update_domain = deps.get("kb_update_domain")
    kb_put_m365_profile = deps.get("kb_put_m365_profile")
    kb_update_changelog = deps.get("kb_update_changelog")

    if re.fullmatch(r"/api/kb/[^/]+/meta", path):
        return (200, kb_put_meta(kb_tid(path), read_json()))
    if re.fullmatch(r"/api/kb/[^/]+/assets/\d+", path):
        return (200, kb_update_asset(kb_tid(path), kb_iid(path), read_json()))
    if re.fullmatch(r"/api/kb/[^/]+/vlans/\d+", path):
        return (200, kb_update_vlan(kb_tid(path), kb_iid(path), read_json()))
    if re.fullmatch(r"/api/kb/[^/]+/pages/\d+", path):
        return (200, kb_update_page(kb_tid(path), kb_iid(path), read_json()))
    if re.fullmatch(r"/api/kb/[^/]+/contacts/\d+", path):
        return (200, kb_update_contact(kb_tid(path), kb_iid(path), read_json()))
    if re.fullmatch(r"/api/kb/[^/]+/passwords/\d+", path):
        return (200, kb_update_password(kb_tid(path), kb_iid(path), read_json()))
    if re.fullmatch(r"/api/kb/[^/]+/software/\d+", path):
        return (200, kb_update_software(kb_tid(path), kb_iid(path), read_json()))
    if re.fullmatch(r"/api/kb/[^/]+/domains/\d+", path):
        return (200, kb_update_domain(kb_tid(path), kb_iid(path), read_json()))
    if re.fullmatch(r"/api/kb/[^/]+/m365", path):
        return (200, kb_put_m365_profile(kb_tid(path), read_json()))
    if re.fullmatch(r"/api/kb/[^/]+/changelog/\d+", path):
        return (200, kb_update_changelog(kb_tid(path), kb_iid(path), read_json()))

    return None
