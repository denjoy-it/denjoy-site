"""
Remediation Routes Dispatcher

Handles remediation catalog, history, and execution.
Extracted from app.py for better organization and testability.
"""

import re
from typing import Tuple, Dict, Any, Optional, Callable


def dispatch_remediation_get_routes(
    path: str,
    qs: Dict[str, list],
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    Route GET requests for remediation operations.
    
    Handles:
    - GET /api/remediate/[tenant_id]/catalog - List available remediations
    - GET /api/remediate/[tenant_id]/history - Remediation history
    
    Args:
        path: Request path
        qs: Query string parameters
        deps: Dependencies dict with:
            - get_remediation_catalog: Function to get remediation catalog
            - list_remediation_history: Function to list remediation history
    
    Returns:
        (http_status, response_dict) or None if route doesn't match
    """
    # Extract injected dependencies
    get_remediation_catalog = deps.get("get_remediation_catalog")
    list_remediation_history = deps.get("list_remediation_history")
    
    # GET /api/remediate/[tenant_id]/catalog - List available remediations
    if re.fullmatch(r"/api/remediate/[^/]+/catalog", path):
        tenant_id = path.split("/")[3]
        category = qs.get("category", [None])[0]
        return (200, {"items": get_remediation_catalog(category)})
    
    # GET /api/remediate/[tenant_id]/history - Remediation history
    if re.fullmatch(r"/api/remediate/[^/]+/history", path):
        tenant_id = path.split("/")[3]
        limit = int(qs.get("limit", ["100"])[0])
        return (200, {"items": list_remediation_history(tenant_id, limit)})
    
    # Route not matched
    return None


def dispatch_remediation_post_routes(
    path: str,
    read_json: Callable,
    session: Dict[str, Any],
    client_address: Tuple[str, int],
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    Route POST requests for remediation operations.
    
    Handles:
    - POST /api/remediate/[tenant_id]/execute - Execute remediation
    
    Args:
        path: Request path
        read_json: Function to read request body as JSON
        session: Session data (user, email, role)
        client_address: (IP, port) tuple from request handler
        deps: Dependencies dict with:
            - execute_remediation: Worker function for remediation execution
            - check_rate_limit: Rate limiting function
    
    Returns:
        (http_status, response_dict) or None if route doesn't match
    """
    # Extract injected dependencies
    execute_remediation = deps.get("execute_remediation")
    check_rate_limit = deps.get("check_rate_limit")
    
    # POST /api/remediate/[tenant_id]/execute - Execute remediation
    if re.fullmatch(r"/api/remediate/[^/]+/execute", path):
        # Rate limiting: max 15 attempts per 60 seconds
        if not check_rate_limit(client_address[0], max_attempts=15, window_secs=60):
            return (429, {"error": "Te veel herstelacties tegelijk. Wacht even.", "error_code": "rate_limited"})
        
        # Admin-only gate
        if session.get("role") != "admin":
            return (403, {"error": "Onvoldoende rechten."})
        
        tenant_id = path.split("/")[3]
        payload = read_json()
        rem_id = (payload.get("remediation_id") or "").strip()
        params = payload.get("params") or {}
        dry_run = bool(payload.get("dry_run", False))
        
        # Validation
        if not rem_id:
            return (400, {"error": "remediation_id is verplicht"})
        if not isinstance(params, dict):
            params = {}
        
        # Execute remediation
        result = execute_remediation(
            tenant_id, rem_id, params, dry_run,
            executed_by=session.get("email", "admin"),
        )
        
        return (200, result)
    
    # Route not matched
    return None
