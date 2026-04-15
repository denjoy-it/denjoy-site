"""Microsoft Graph service — client_credentials flow for Intune/Entra data."""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

GRAPH_BASE = "https://graph.microsoft.com"
LOGIN_BASE = "https://login.microsoftonline.com"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"

# Object-type registry: key → Graph BETA endpoint path
OBJECT_TYPE_ENDPOINTS: Dict[str, str] = {
    "compliance": "/beta/deviceManagement/deviceCompliancePolicies",
    "config_profiles": "/beta/deviceManagement/deviceConfigurations",
    "settings_catalog": "/beta/deviceManagement/configurationPolicies",
    "scripts": "/beta/deviceManagement/deviceManagementScripts",
    "app_protection": "/beta/deviceAppManagement/managedAppPolicies",
    "autopilot": "/beta/deviceManagement/windowsAutopilotDeploymentProfiles",
    "conditional_access": "/beta/identity/conditionalAccess/policies",
    "enrollment_restrictions": "/beta/deviceManagement/deviceEnrollmentConfigurations",
    "security_baselines": "/beta/deviceManagement/intents",
}

# Assignment endpoints per type (None = type has no separate assignments endpoint)
ASSIGNMENT_ENDPOINTS: Dict[str, Optional[str]] = {
    "compliance": "/beta/deviceManagement/deviceCompliancePolicies/{id}/assignments",
    "config_profiles": "/beta/deviceManagement/deviceConfigurations/{id}/assignments",
    "settings_catalog": "/beta/deviceManagement/configurationPolicies/{id}/assignments",
    "scripts": "/beta/deviceManagement/deviceManagementScripts/{id}/assignments",
    "app_protection": None,  # assignments embedded
    "autopilot": "/beta/deviceManagement/windowsAutopilotDeploymentProfiles/{id}/assignments",
    "conditional_access": None,
    "enrollment_restrictions": "/beta/deviceManagement/deviceEnrollmentConfigurations/{id}/assignments",
    "security_baselines": None,
}

# Simple in-process token cache: {cache_key: {"token": str, "expires_at": float}}
_TOKEN_CACHE: Dict[str, Dict[str, Any]] = {}


def _graph_request(token: str, path: str) -> Any:
    url = f"{GRAPH_BASE}{path}"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def get_token(tenant_auth: Dict[str, str]) -> str:
    """Obtain an access token via client_credentials, with in-process caching."""
    auth_tenant_id = (tenant_auth.get("auth_tenant_id") or "").strip()
    client_id = (tenant_auth.get("auth_client_id") or "").strip()
    client_secret = (tenant_auth.get("auth_client_secret") or "").strip()

    if not auth_tenant_id or not client_id or not client_secret:
        raise ValueError(
            "Tenant auth-profiel is onvolledig (auth_tenant_id, auth_client_id "
            "en auth_client_secret zijn vereist voor Graph API-toegang)."
        )

    cache_key = f"{auth_tenant_id}:{client_id}"
    cached = _TOKEN_CACHE.get(cache_key)
    if cached and cached["expires_at"] > time.time() + 60:
        return cached["token"]

    url = f"{LOGIN_BASE}/{urllib.parse.quote(auth_tenant_id)}/oauth2/v2.0/token"
    body = urllib.parse.urlencode(
        {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": GRAPH_SCOPE,
        }
    ).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read().decode())

    token = result.get("access_token", "")
    expires_in = int(result.get("expires_in", 3600))
    _TOKEN_CACHE[cache_key] = {"token": token, "expires_at": time.time() + expires_in}
    return token


def list_objects(tenant_auth: Dict[str, str], object_type: str) -> List[Dict[str, Any]]:
    """Fetch all objects of a given type from Graph, handling OData paging."""
    endpoint = OBJECT_TYPE_ENDPOINTS.get(object_type)
    if not endpoint:
        raise ValueError(f"Onbekend object type: {object_type}")

    token = get_token(tenant_auth)
    items: List[Dict[str, Any]] = []
    path = f"{endpoint}?$top=100"

    while path:
        data = _graph_request(token, path)
        items.extend(data.get("value", []))
        next_link = data.get("@odata.nextLink", "")
        if next_link:
            # nextLink contains full URL; strip base
            path = next_link.replace(GRAPH_BASE, "")
        else:
            path = ""

    return items


def get_object(tenant_auth: Dict[str, str], object_type: str, object_id: str) -> Dict[str, Any]:
    """Fetch a single object by id."""
    endpoint = OBJECT_TYPE_ENDPOINTS.get(object_type)
    if not endpoint:
        raise ValueError(f"Onbekend object type: {object_type}")
    token = get_token(tenant_auth)
    return _graph_request(token, f"{endpoint}/{urllib.parse.quote(object_id)}")


def list_object_assignments(
    tenant_auth: Dict[str, str], object_type: str, object_id: str
) -> List[Dict[str, Any]]:
    """Fetch assignments for a single object (if supported)."""
    template = ASSIGNMENT_ENDPOINTS.get(object_type)
    if not template:
        return []
    token = get_token(tenant_auth)
    path = template.replace("{id}", urllib.parse.quote(object_id))
    data = _graph_request(token, path)
    return data.get("value", [])


def list_all_assignments(tenant_auth: Dict[str, str]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Build a group-centric assignment map:
    {group_id: [{"type": object_type, "id": obj_id, "displayName": str}, ...]}
    """
    group_map: Dict[str, List[Dict[str, Any]]] = {}

    for obj_type, template in ASSIGNMENT_ENDPOINTS.items():
        if not template:
            continue
        try:
            objects = list_objects(tenant_auth, obj_type)
        except Exception:
            continue

        token = get_token(tenant_auth)
        for obj in objects:
            oid = obj.get("id", "")
            if not oid:
                continue
            try:
                path = template.replace("{id}", urllib.parse.quote(oid))
                data = _graph_request(token, path)
                for asgn in data.get("value", []):
                    target = asgn.get("target", {})
                    group_id = target.get("groupId") or target.get("@odata.type", "")
                    if not group_id:
                        continue
                    entry = {
                        "type": obj_type,
                        "id": oid,
                        "displayName": obj.get("displayName") or obj.get("name") or oid,
                        "target": target,
                    }
                    group_map.setdefault(group_id, []).append(entry)
            except Exception:
                continue

    return group_map


def get_summary(tenant_auth: Dict[str, str]) -> Dict[str, Any]:
    """Return a count-per-type summary dict."""
    summary: Dict[str, Any] = {}
    for obj_type in OBJECT_TYPE_ENDPOINTS:
        try:
            items = list_objects(tenant_auth, obj_type)
            summary[obj_type] = len(items)
        except Exception as exc:
            summary[obj_type] = {"error": str(exc)}
    return summary


class GraphService:
    """Thin wrapper kept for backwards compatibility with health check."""

    def __init__(self, tenant_id: Optional[str] = None) -> None:
        self.tenant_id = tenant_id

    def health(self) -> Dict[str, Any]:
        return {
            "status": "ready",
            "tenant_id": self.tenant_id,
            "provider": "microsoft-graph",
            "implemented": True,
        }
