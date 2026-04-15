"""
Report Upload Route Dispatcher

Handles report file uploads.
Extracted from app.py for better organization and testability.

Security: uploads vereisen een geldig API-key (machine-to-machine token).
De API-key wordt bij startup gegenereerd en opgeslagen in config.json onder
de sleutel 'upload_api_key'. PowerShell-scripts sturen deze mee als
'Authorization: Bearer <key>' header of als 'api_key' veld in de body.
"""

import os
import re
import secrets
import html
from typing import Tuple, Dict, Any, Optional, Callable


# ─── veilige bestandsnaam ───────────────────────────────────────
_SAFE_FILENAME = re.compile(r'^[A-Za-z0-9_\-\.]{1,120}\.html$')


def _sanitize_html_content(content: str) -> str:
    """
    Verwijder gevaarlijke inline-script tags en event-handlers uit
    geüploade HTML om stored-XSS te voorkomen.
    Behoudt structuur maar neutraliseert uitvoerbare code.
    """
    import re as _re
    # Verwijder <script>…</script> blokken (case-insensitive, multiline)
    content = _re.sub(r'<script[\s\S]*?</script>', '<!-- script removed -->', content, flags=_re.IGNORECASE)
    # Verwijder inline event-handlers (onclick, onerror, onload, …)
    content = _re.sub(r'\s+on\w+\s*=\s*["\'][^"\']*["\']', '', content, flags=_re.IGNORECASE)
    content = _re.sub(r'\s+on\w+\s*=\s*[^\s>]+', '', content, flags=_re.IGNORECASE)
    # Verwijder javascript: URL-schema's
    content = _re.sub(r'javascript\s*:', 'blocked:', content, flags=_re.IGNORECASE)
    return content


def dispatch_report_upload_post_routes(
    path: str,
    read_json: Callable,
    deps: Dict[str, Any],
    request_handler=None,
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    Route POST requests for report uploads.

    Handles:
    - POST /api/upload-report - Upload assessment report file

    Security:
    - Vereist Authorization: Bearer <upload_api_key> header
      OF 'api_key' veld in de request body.
    - Sanitiseert HTML-inhoud tegen stored-XSS.
    - Valideert bestandsnaam tegen een allowlist-patroon.

    Args:
        path: Request path
        read_json: Function to read request body as JSON
        deps: Dependencies dict with:
            - DEFAULT_REPORTS_DIR: Path to reports directory
            - config: Platform configuratie dict (bevat upload_api_key)
        request_handler: Optioneel HTTP request handler (voor header-toegang)

    Returns:
        (http_status, response_dict) or None if route doesn't match
    """
    DEFAULT_REPORTS_DIR = deps.get("DEFAULT_REPORTS_DIR")
    config = deps.get("config") or {}

    # POST /api/upload-report - Upload assessment report file
    if path == "/api/upload-report":

        # ── 1. Authenticatie: Bearer-token of body-key ──────────────────
        expected_key = config.get("upload_api_key") or ""
        provided_key = ""

        # Probeer Authorization-header (request_handler geeft toegang tot headers)
        if request_handler is not None:
            auth_header = request_handler.headers.get("Authorization") or ""
            if auth_header.lower().startswith("bearer "):
                provided_key = auth_header[7:].strip()

        # Lees body alvast (nodig ook voor key-check als header ontbreekt)
        data = read_json()

        if not provided_key:
            provided_key = (data.get("api_key") or "").strip()

        if not expected_key:
            # Geen upload_api_key geconfigureerd — weiger upload tot key is ingesteld
            return (503, {"error": "Upload-authenticatie niet geconfigureerd. Stel upload_api_key in via config.json."})

        if not secrets.compare_digest(provided_key, expected_key):
            return (401, {"error": "Ongeldige API-key voor rapport-upload."})

        # ── 2. Bestandsnaam-validatie ───────────────────────────────────
        raw_filename = os.path.basename(data.get("filename") or "M365-Complete-Baseline-latest.html")
        if not _SAFE_FILENAME.match(raw_filename):
            return (400, {"error": "Ongeldige bestandsnaam. Alleen alfanumeriek, koppeltekens en underscores toegestaan, extensie .html vereist."})
        filename = raw_filename

        # ── 3. Inhoud-validatie en sanitatie ───────────────────────────
        content = data.get("content") or ""
        if not content:
            return (400, {"error": "Geen inhoud opgegeven."})
        if len(content) > 50 * 1024 * 1024:  # 50 MB max
            return (413, {"error": "Bestandsinhoud te groot (max 50 MB)."})

        content = _sanitize_html_content(content)

        # ── 4. Opslaan ─────────────────────────────────────────────────
        DEFAULT_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        (DEFAULT_REPORTS_DIR / filename).write_text(content, encoding="utf-8")
        return (200, {"path": f"/reports/{filename}", "filename": filename})

    # Route not matched
    return None
