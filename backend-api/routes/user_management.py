"""
User Management Routes Dispatcher

Handles user creation, offboarding, and related operations.
Extracted from app.py for better organization and testability.
"""

import re
from typing import Tuple, Dict, Any, Optional, Callable


def dispatch_user_management_post_routes(
    path: str,
    read_json: Callable,
    session: Dict[str, Any],
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    Route POST requests for user management operations.
    
    Handles:
    - POST /api/m365/[tenant_id]/users - Create user
    - POST /api/m365/[tenant_id]/users/[user_id]/offboard - Offboard user
    
    Args:
        path: Request path
        read_json: Function to read request body as JSON
        session: Session data (user, email, role)
        deps: Dependencies dict with:
            - run_user_mgmt: Worker function for user operations
    
    Returns:
        (http_status, response_dict) or None if route doesn't match
    """
    # Extract injected dependencies
    run_user_mgmt = deps.get("run_user_mgmt")
    
    # POST /api/m365/[tenant_id]/users - Create user
    if re.fullmatch(r"/api/m365/[^/]+/users", path):
        if not path.startswith("POST"):  # This check is for context; actual method checked before calling
            return None
        
        tenant_id = path.split("/")[3]
        payload = read_json()
        dry_run = bool(payload.pop("dry_run", False))
        
        result = run_user_mgmt(
            tenant_id, "create-user", payload, dry_run,
            executed_by=session.get("email", "admin"),
        )
        
        if not result["ok"]:
            return (502, {"error": result.get("error", "Fout bij aanmaken gebruiker")})
        return (200, result["result"])
    
    # POST /api/m365/[tenant_id]/users/[user_id]/offboard - Offboard user
    if re.fullmatch(r"/api/m365/[^/]+/users/[^/]+/offboard", path):
        if not path.startswith("POST"):  # This check is for context; actual method checked before calling
            return None
        
        parts = path.split("/")
        tenant_id = parts[3]
        user_id = parts[5]
        payload = read_json()
        dry_run = bool(payload.pop("dry_run", False))
        payload["user_id"] = user_id
        
        result = run_user_mgmt(
            tenant_id, "offboard-user", payload, dry_run,
            executed_by=session.get("email", "admin"),
        )
        
        if not result["ok"]:
            return (502, {"error": result.get("error", "Fout bij offboarding")})
        return (200, result["result"])
    
    # Route not matched
    return None
