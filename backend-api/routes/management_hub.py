import json
import re
from http import HTTPStatus


def dispatch_management_hub_get_routes(path, qs, deps):
    management_hub_overview = deps.get("management_hub_overview")
    list_management_hub_policies = deps.get("list_management_hub_policies")
    management_hub_client_payload = deps.get("management_hub_client_payload")
    management_hub_tenant_label = deps.get("management_hub_tenant_label")
    now_iso = deps.get("now_iso")
    list_management_hub_events = deps.get("list_management_hub_events")
    cpp_agent_script = deps.get("cpp_agent_script")
    cpp_bootstrap_script = deps.get("cpp_bootstrap_script")
    cpp_detection_script = deps.get("cpp_detection_script")
    cpp_remediation_script = deps.get("cpp_remediation_script")
    guardian_script = deps.get("guardian_script")

    if re.fullmatch(r"/api/management-hub/[^/]+/overview", path):
        tenant_id = path.split("/")[3]
        return (200, management_hub_overview(tenant_id))

    if re.fullmatch(r"/api/management-hub/[^/]+/policy-preferences", path):
        tenant_id = path.split("/")[3]
        return (200, {"items": list_management_hub_policies(tenant_id), "tenant_id": tenant_id})

    if re.fullmatch(r"/api/management-hub/[^/]+/policy-preferences/client", path):
        tenant_id = path.split("/")[3]
        device_id = qs.get("device_id", [None])[0]
        return (200, management_hub_client_payload(tenant_id, device_id))

    if re.fullmatch(r"/api/management-hub/[^/]+/policy-preferences/export.json", path):
        tenant_id = path.split("/")[3]
        payload = management_hub_client_payload(tenant_id, qs.get("device_id", [None])[0])
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")

        def write_export(handler):
            handler.send_response(HTTPStatus.OK)
            handler.send_header("Content-Type", "application/json; charset=utf-8")
            handler.send_header("Content-Disposition", f"attachment; filename=cloud-policy-preferences-{tenant_id}.json")
            handler.send_header("Content-Length", str(len(body)))
            handler.end_headers()
            handler.wfile.write(body)
            return None

        return write_export

    if re.fullmatch(r"/api/management-hub/[^/]+/guardian-events/export.json", path):
        tenant_id = path.split("/")[3]
        payload = {
            "tenant_id": tenant_id,
            "tenant_label": management_hub_tenant_label(tenant_id),
            "generated_at": now_iso(),
            "events": list_management_hub_events(tenant_id, 100),
        }
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")

        def write_guardian_export(handler):
            handler.send_response(HTTPStatus.OK)
            handler.send_header("Content-Type", "application/json; charset=utf-8")
            handler.send_header("Content-Disposition", f"attachment; filename=intune-guardian-{tenant_id}.json")
            handler.send_header("Content-Length", str(len(body)))
            handler.end_headers()
            handler.wfile.write(body)
            return None

        return write_guardian_export

    if re.fullmatch(r"/api/management-hub/[^/]+/policy-preferences/agent.ps1", path):
        tenant_id = path.split("/")[3]
        if not cpp_agent_script.exists():
            return (404, {"error": "Policy agent script niet gevonden"})
        body = cpp_agent_script.read_text(encoding="utf-8")
        body = (
            body.replace("__DENJOY_POLICY_URL__", f"http://127.0.0.1:8765/api/management-hub/{tenant_id}/policy-preferences/client")
            .replace("__DENJOY_TENANT_ID__", tenant_id)
        ).encode("utf-8")

        def write_agent(handler):
            handler.send_response(HTTPStatus.OK)
            handler.send_header("Content-Type", "text/plain; charset=utf-8")
            handler.send_header("Content-Disposition", f"attachment; filename=Invoke-DenjoyCloudPolicyPreferences-{tenant_id}.ps1")
            handler.send_header("Content-Length", str(len(body)))
            handler.end_headers()
            handler.wfile.write(body)
            return None

        return write_agent

    if re.fullmatch(r"/api/management-hub/[^/]+/policy-preferences/bootstrap.ps1", path):
        tenant_id = path.split("/")[3]
        if not cpp_bootstrap_script.exists():
            return (404, {"error": "Policy bootstrap script niet gevonden"})
        body = cpp_bootstrap_script.read_text(encoding="utf-8")
        body = (
            body.replace("__DENJOY_AGENT_URL__", f"http://127.0.0.1:8765/api/management-hub/{tenant_id}/policy-preferences/agent.ps1")
            .replace("__DENJOY_TENANT_ID__", tenant_id)
        ).encode("utf-8")

        def write_bootstrap(handler):
            handler.send_response(HTTPStatus.OK)
            handler.send_header("Content-Type", "text/plain; charset=utf-8")
            handler.send_header("Content-Disposition", f"attachment; filename=Install-DenjoyCloudPolicyPreferencesAgent-{tenant_id}.ps1")
            handler.send_header("Content-Length", str(len(body)))
            handler.end_headers()
            handler.wfile.write(body)
            return None

        return write_bootstrap

    if re.fullmatch(r"/api/management-hub/[^/]+/policy-preferences/detection.ps1", path):
        tenant_id = path.split("/")[3]
        if not cpp_detection_script.exists():
            return (404, {"error": "Policy detection script niet gevonden"})
        body = cpp_detection_script.read_bytes()

        def write_detection(handler):
            handler.send_response(HTTPStatus.OK)
            handler.send_header("Content-Type", "text/plain; charset=utf-8")
            handler.send_header("Content-Disposition", f"attachment; filename=Test-DenjoyCloudPolicyPreferencesAgent-{tenant_id}.ps1")
            handler.send_header("Content-Length", str(len(body)))
            handler.end_headers()
            handler.wfile.write(body)
            return None

        return write_detection

    if re.fullmatch(r"/api/management-hub/[^/]+/policy-preferences/remediation.ps1", path):
        tenant_id = path.split("/")[3]
        if not cpp_remediation_script.exists():
            return (404, {"error": "Policy remediation script niet gevonden"})
        body = cpp_remediation_script.read_text(encoding="utf-8")
        body = (
            body.replace("__DENJOY_BOOTSTRAP_URL__", f"http://127.0.0.1:8765/api/management-hub/{tenant_id}/policy-preferences/bootstrap.ps1")
            .replace("__DENJOY_TENANT_ID__", tenant_id)
        ).encode("utf-8")

        def write_remediation(handler):
            handler.send_response(HTTPStatus.OK)
            handler.send_header("Content-Type", "text/plain; charset=utf-8")
            handler.send_header("Content-Disposition", f"attachment; filename=Invoke-DenjoyCloudPolicyPreferencesRemediation-{tenant_id}.ps1")
            handler.send_header("Content-Length", str(len(body)))
            handler.end_headers()
            handler.wfile.write(body)
            return None

        return write_remediation

    if re.fullmatch(r"/api/management-hub/[^/]+/guardian-events", path):
        tenant_id = path.split("/")[3]
        limit = int(qs.get("limit", ["20"])[0])
        return (200, {"items": list_management_hub_events(tenant_id, limit), "tenant_id": tenant_id})

    if re.fullmatch(r"/api/management-hub/[^/]+/guardian-events/script.ps1", path):
        tenant_id = path.split("/")[3]
        if not guardian_script.exists():
            return (404, {"error": "Guardian script niet gevonden"})
        body = guardian_script.read_text(encoding="utf-8")
        body = (
            body.replace("__DENJOY_GUARDIAN_URL__", f"http://127.0.0.1:8765/api/management-hub/{tenant_id}/guardian-events")
            .replace("__DENJOY_TENANT_ID__", tenant_id)
        ).encode("utf-8")

        def write_guardian_script(handler):
            handler.send_response(HTTPStatus.OK)
            handler.send_header("Content-Type", "text/plain; charset=utf-8")
            handler.send_header("Content-Disposition", f"attachment; filename=Invoke-DenjoyIntuneGuardian-{tenant_id}.ps1")
            handler.send_header("Content-Length", str(len(body)))
            handler.end_headers()
            handler.wfile.write(body)
            return None

        return write_guardian_script

    return None


def dispatch_management_hub_post_routes(path, sess, read_json, deps):
    create_management_hub_policy = deps.get("create_management_hub_policy")
    sync_management_hub_guardian_events = deps.get("sync_management_hub_guardian_events")
    validate_management_hub_guardian_auth = deps.get("validate_management_hub_guardian_auth")
    delete_management_hub_policy = deps.get("delete_management_hub_policy")

    if re.fullmatch(r"/api/management-hub/[^/]+/policy-preferences", path):
        tenant_id = path.split("/")[3]
        payload = read_json()
        item = create_management_hub_policy(tenant_id, payload, sess.get("email", "admin"))
        return (201, item)
    if re.fullmatch(r"/api/management-hub/[^/]+/guardian-events/sync", path):
        tenant_id = path.split("/")[3]
        payload = read_json()
        limit = int(payload.get("limit") or 25)
        return (200, sync_management_hub_guardian_events(tenant_id, limit))
    if re.fullmatch(r"/api/management-hub/[^/]+/guardian-events/validate-auth", path):
        tenant_id = path.split("/")[3]
        return (200, validate_management_hub_guardian_auth(tenant_id))
    return None


def dispatch_management_hub_delete_routes(path, sess, deps):
    """DELETE /api/management-hub/{tenant_id}/policy-preferences/{policy_id}"""
    delete_management_hub_policy = deps.get("delete_management_hub_policy")

    if re.fullmatch(r"/api/management-hub/[^/]+/policy-preferences/[^/]+", path):
        parts = path.split("/")
        tenant_id = parts[3]
        policy_id = parts[5]
        email = (sess or {}).get("email", "admin")
        return (200, delete_management_hub_policy(tenant_id, policy_id, email))
    return None
