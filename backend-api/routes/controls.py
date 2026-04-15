import re

from services.control_service import build_control_payload


def dispatch_controls_get_routes(path, qs, deps):
    if re.fullmatch(r"/api/controls/[^/]+/[^/]+", path):
        parts = path.split("/")
        tenant_id, control_key = parts[3], parts[4]
        strict_live = str((qs or {}).get("strict_live", ["0"])[0]).lower() in {"1", "true", "yes"}
        return (200, build_control_payload(control_key, tenant_id, strict_live, deps))
    return None
