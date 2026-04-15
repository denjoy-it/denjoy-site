import re


def dispatch_integration_get_routes(path, deps):
    list_integrations = deps.get("list_integrations")

    if re.fullmatch(r"/api/integrations/[^/]+", path):
        tenant_id = path.split("/")[3]
        return (200, {"items": list_integrations(tenant_id=tenant_id), "tenant_id": tenant_id})

    if path == "/api/integrations":
        return (200, {"items": list_integrations()})

    return None


def dispatch_integration_post_routes(path, sess, read_json, deps):
    session_can = deps.get("session_can")
    db_fetchone = deps.get("db_fetchone")
    upsert_integration = deps.get("upsert_integration")

    if re.fullmatch(r"/api/integrations/[^/]+/[^/]+", path):
        if not session_can(sess, "integrations.write"):
            return (403, {"error": "Onvoldoende rechten.", "error_code": "forbidden"})
        parts = path.split("/")
        tenant_id = parts[3]
        integration_type = parts[4]
        if not db_fetchone("SELECT id FROM tenants WHERE id=?", (tenant_id,)):
            return (404, {"error": "Tenant niet gevonden", "error_code": "not_found"})
        return (201, upsert_integration(tenant_id, integration_type, read_json()))

    return None


def dispatch_integration_patch_routes(path, read_json, deps):
    get_integration = deps.get("get_integration")
    upsert_integration = deps.get("upsert_integration")

    if re.fullmatch(r"/api/integrations/[^/]+", path):
        integration_id = path.split("/")[3]
        row = get_integration(integration_id)
        if not row:
            return (404, {"error": "Integratie niet gevonden", "error_code": "not_found"})
        return (200, upsert_integration(row["tenant_id"], row["integration_type"], read_json()))

    return None
