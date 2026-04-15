"""
Tenant Vergelijking Routes — GET /api/compare/{tid1}/vs/{tid2}
"""

import re
from typing import Tuple, Dict, Any, Optional


def dispatch_comparison_get_routes(
    path: str,
    deps: Dict[str, Any],
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    GET /api/compare/{tid1}/vs/{tid2}  — vergelijk twee tenants
    """
    compare_tenants = deps.get("compare_tenants")

    m = re.fullmatch(r"/api/compare/([^/]+)/vs/([^/]+)", path)
    if m:
        tid1, tid2 = m.group(1), m.group(2)
        if tid1 == tid2:
            return (400, {"error": "Kies twee verschillende tenants om te vergelijken"})
        if not compare_tenants:
            return (500, {"error": "compare_tenants niet geconfigureerd"})
        try:
            result = compare_tenants(tid1, tid2)
            return (200, {"ok": True, **result})
        except ValueError as e:
            return (404, {"error": str(e)})
        except Exception as e:
            return (500, {"error": f"Vergelijking mislukt: {e}"})

    return None
