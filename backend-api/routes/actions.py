"""
Actions Route Dispatcher

Handles POST requests for creating actions.
Extracted from app.py for better organization and testability.
"""

from typing import Tuple, Dict, Any, Optional, Callable


def dispatch_actions_post_routes(
    path: str,
    read_json: Callable,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    Route POST requests for action creation.
    
    Handles:
    - POST /api/actions - Create a new action
    
    Args:
        path: Request path
        read_json: Function to read request body as JSON
        deps: Dependencies dict with:
            - create_action: Function to create an action
    
    Returns:
        (http_status, response_dict) or None if route doesn't match
    """
    # Extract injected dependencies
    create_action = deps.get("create_action")
    
    # POST /api/actions - Create a new action
    if path == "/api/actions":
        return (201, create_action(read_json()))
    
    # Route not matched
    return None
