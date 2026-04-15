"""
File serving dispatcher for static files, portal resources, and reports.

Routes handled:
- /portal/* → Portal frontend application (from WEB_DIR)
- /frontend-portal/* → Redirect to /portal/* (compatibility alias)
- /site/* → Main website (from frontend-site)
- /reports/Templates/* → Assessment report templates (from assessment-engine)
- /reports/* → Assessment run artifacts (HTML reports, JSON, etc.)
- / and other root paths → Public website or portal HTML
"""

from pathlib import Path
from urllib.parse import unquote
from http import HTTPStatus
import re
import json
from datetime import datetime, timezone
from typing import Optional, Callable, Any


def dispatch_file_serving_get_routes(
    path: str,
    handler: Any,  # BaseHTTPRequestHandler instance
    web_dir: Path,
    platform_dir: Path,
    runs_dir: Path,
    csp_header: str,
) -> Optional[bool]:
    """
    Dispatcher for GET requests to file-serving routes.
    
    Handles:
    - /portal/* → Portal frontend
    - /frontend-portal/* → Portal alias redirect
    - /site/* → Main website (frontend-site)
    - /reports/Templates/* → Assessment templates (assessment-engine)
    - /reports/* → Assessment reports
    - / and static assets → Root website
    
    Returns True if route was handled (handler methods called), None if not matched.
    """

    # ── /reports/Templates/* ───────────────────────────────────────────────
    if path.startswith("/reports/Templates/"):
        rel_path = path[len("/reports/Templates/"):]
        fp = (platform_dir / "assessment-engine" / "Templates" / rel_path).resolve()
        base_dir = (platform_dir / "assessment-engine" / "Templates").resolve()
        
        # Path traversal protection
        if not str(fp).startswith(str(base_dir)):
            handler.send_error(403, "Forbidden")
            return True
        if not fp.exists() or not fp.is_file():
            handler.send_error(404, "Not Found")
            return True
        
        _serve_file(handler, fp, csp_header)
        return True

    # ── /reports/* ────────────────────────────────────────────────────────
    if path.startswith("/reports/"):
        return _serve_report(handler, path, runs_dir, csp_header)

    # ── /site/* and /site ──────────────────────────────────────────────────
    if path.startswith("/site/") or path in ("/site", "/site/index.html"):
        return _serve_site(handler, path, platform_dir, csp_header)

    # ── /frontend-portal/* compatibility redirect ───────────────────────────
    if path.startswith("/frontend-portal/") or path in ("/frontend-portal", "/frontend-portal/"):
        if path in ("/frontend-portal", "/frontend-portal/"):
            target = "/portal/"
        else:
            target = "/portal/" + path[len("/frontend-portal/"):]
        handler.send_response(302)
        handler.send_header("Location", target)
        handler.end_headers()
        return True

    # ── /portal/* and /portal ──────────────────────────────────────────────
    if path.startswith("/portal/") or path in ("/portal", "/portal/"):
        return _serve_portal(handler, path, web_dir, csp_header)

    # ── Root / and default static files ────────────────────────────────────
    if path in ("", "/") or _is_static_asset(path):
        return _serve_web(handler, path, platform_dir, csp_header)

    # Not a file-serving route
    return None


def _is_static_asset(path: str) -> bool:
    """Check if path looks like a static asset (not API, not portal special route)."""
    if path.startswith("/api/"):
        return False
    if path.startswith("/portal/"):
        return False
    
    # Common static file extensions
    static_extensions = (
        ".html", ".css", ".js", ".json",
        ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
        ".woff", ".woff2", ".ttf", ".eot", ".otf",
        ".pdf", ".txt", ".md"
    )
    
    path_lower = path.lower()
    return any(path_lower.endswith(ext) for ext in static_extensions)


def _serve_portal(handler: Any, path: str, web_dir: Path, csp_header: str) -> bool:
    """
    Serves portal frontend files from WEB_DIR.
    
    Routes:
    - /portal → /portal/index.html
    - /portal/ → /portal/index.html
    - /portal/path/to/file → /path/to/file in WEB_DIR
    """
    if path in ("/portal", "/portal/"):
        fp = web_dir / "index.html"
    else:
        rel = unquote(path[len("/portal/"):])
        
        # Path traversal protection
        try:
            rel_parts = Path(rel).parts
            if ".." in rel_parts:
                handler.send_error(403, "Forbidden")
                return True
        except ValueError:
            handler.send_error(400, "Bad Request")
            return True
        
        fp = web_dir / rel
        
        # If directory, serve index.html
        if fp.is_dir():
            fp = fp / "index.html"
    
    if not fp.exists() or not fp.is_file():
        handler.send_error(404, "Not Found")
        return True
    
    _serve_file(handler, fp, csp_header)
    return True


def _serve_site(handler: Any, path: str, platform_dir: Path, csp_header: str) -> bool:
    """
    Serves main website files from PLATFORM_DIR.
    
    Routes:
    - /site → /site/index.html
    - /site/ → /site/index.html
    - /site/index.html → explicitly request index
    - /site/path/to/file → /path/to/file in PLATFORM_DIR
    
    Redirect: /site/portal/* → /portal/*
    """
    # Extract relative path
    if path in ("/site", "/site/"):
        rel = "index.html"
    elif path.startswith("/site/"):
        rel = unquote(path[len("/site/"):])
    else:
        rel = "index.html"
    
    if not rel:
        rel = "index.html"
    
    # Path traversal protection
    try:
        rel_parts = Path(rel).parts
        if ".." in rel_parts:
            handler.send_error(403, "Forbidden")
            return True
    except ValueError:
        handler.send_error(400, "Bad Request")
        return True
    
    # Special case: /site/portal/* redirects to /portal/*
    if rel.startswith("portal/"):
        portal_rel = rel[len("portal/"):]
        handler.send_response(302)
        handler.send_header("Location", f"/{portal_rel}")
        handler.end_headers()
        return True
    
    site_dir = (platform_dir / "frontend-site").resolve()
    fp = (site_dir / rel).resolve()
    base_dir = site_dir
    
    # Path validation
    if not str(fp).startswith(str(base_dir)):
        handler.send_error(403, "Forbidden")
        return True
    
    # If directory, serve index.html
    if fp.is_dir():
        fp = fp / "index.html"
    
    if not fp.exists() or not fp.is_file():
        handler.send_error(404, "Not Found")
        return True
    
    _serve_file(handler, fp, csp_header)
    return True


def _serve_report(handler: Any, path: str, runs_dir: Path, csp_header: str) -> bool:
    """
    Serves assessment report files from runs directory.
    
    Routes:
    - /reports/{run_id}/{path} → {RUNS_DIR}/{run_id}/{path}
    
    Examples:
    - /reports/run-abc123/M365-Complete-Baseline-latest.html
    - /reports/run-abc123/_snapshots/summary.json
    - /reports/run-abc123/json/manifest.json
    """
    rel = path[len("/reports/"):]
    parts = [p for p in rel.split("/") if p]
    
    if len(parts) < 2:
        handler.send_error(404, "Not Found")
        return True
    
    # First part is run_id, rest is the file path within the run directory
    run_id = parts[0]
    
    # Path traversal protection
    try:
        file_parts = parts[1:]
        if ".." in file_parts:
            handler.send_error(403, "Forbidden")
            return True
    except (ValueError, IndexError):
        handler.send_error(400, "Bad Request")
        return True
    
    fp = (runs_dir / run_id).joinpath(*parts[1:])

    # If metadata file is missing, synthesize a minimal metadata payload so report viewers
    # don't fail on newly-created runs that only have HTML + summary.
    if (not fp.exists() or not fp.is_file()) and str(fp.name).endswith(".metadata.json"):
        report_name = fp.name.replace(".metadata.json", ".html")
        report_fp = (runs_dir / run_id / report_name)
        run_dir = runs_dir / run_id
        summary_name = report_name.replace(".html", ".summary.json")
        summary_fp = run_dir / "_snapshots" / summary_name
        latest_summary_fp = run_dir / "_snapshots" / "M365-Complete-Baseline-latest.summary.json"

        if report_fp.exists() and report_fp.is_file():
            generated_at = datetime.fromtimestamp(report_fp.stat().st_mtime, timezone.utc).isoformat()
            if summary_fp.exists() and summary_fp.is_file():
                try:
                    summary_data = json.loads(summary_fp.read_text(encoding="utf-8"))
                    generated_at = str(summary_data.get("GeneratedAt") or generated_at)
                except Exception:
                    pass
            elif latest_summary_fp.exists() and latest_summary_fp.is_file():
                try:
                    summary_data = json.loads(latest_summary_fp.read_text(encoding="utf-8"))
                    generated_at = str(summary_data.get("GeneratedAt") or generated_at)
                except Exception:
                    pass

            synthesized = {
                "run_id": run_id,
                "report_file": report_name,
                "report_path": f"/reports/{run_id}/{report_name}",
                "generated_at": generated_at,
                "source": "synthesized",
            }
            try:
                fp.write_text(json.dumps(synthesized, ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception:
                pass
    
    if not fp.exists() or not fp.is_file():
        handler.send_error(404, "Not Found")
        return True
    
    _serve_file(handler, fp, csp_header)
    return True


def _serve_web(handler: Any, path: str, platform_dir: Path, csp_header: str) -> bool:
    """
    Serves root website files from PLATFORM_DIR.
    
    Routes:
    - / → /index.html
    - /static/... → /static/... in PLATFORM_DIR
    - /assets/... → /assets/... in PLATFORM_DIR
    - Any other HTML/CSS/JS files
    """
    site_dir = platform_dir / "frontend-site"
    if path in ("", "/"):
        fp = site_dir / "index.html"
    else:
        rel = unquote(path.lstrip("/"))
        
        # Path traversal protection
        try:
            rel_parts = Path(rel).parts
            if ".." in rel_parts:
                handler.send_error(403, "Forbidden")
                return True
        except ValueError:
            handler.send_error(400, "Bad Request")
            return True
        
        fp = site_dir / rel
        
        # If directory, serve index.html
        if fp.is_dir():
            fp = fp / "index.html"
    
    if not fp.exists() or not fp.is_file():
        handler.send_error(404, "Not Found")
        return True
    
    _serve_file(handler, fp, csp_header)
    return True


def _serve_file(handler: Any, fp: Path, csp_header: str) -> None:
    """
    Send file to client with appropriate MIME type and security headers.
    
    Handles:
    - Content-Type based on file extension
    - Content-Length and X-Content-Type-Options headers
    - CSP header for HTML files
    """
    try:
        data = fp.read_bytes()
    except (IOError, OSError) as e:
        handler.send_error(500, f"Error reading file: {e}")
        return
    
    # Map file extensions to MIME types
    mime_types = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".webp": "image/webp",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".eot": "application/vnd.ms-fontobject",
        ".otf": "font/otf",
        ".pdf": "application/pdf",
    }
    
    mime = mime_types.get(fp.suffix.lower(), "application/octet-stream")
    
    handler.send_response(HTTPStatus.OK)
    handler.send_header("Content-Type", mime)
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("X-Frame-Options", "SAMEORIGIN")
    handler.send_header("X-XSS-Protection", "1; mode=block")

    # Add CSP header for HTML files
    if mime.startswith("text/html"):
        handler.send_header("Content-Security-Policy", csp_header)
    
    # Add cache headers for static assets (not HTML)
    if not mime.startswith("text/html"):
        handler.send_header("Cache-Control", "public, max-age=86400")  # 1 day
    else:
        # HTML should not be cached
        handler.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
    
    handler.end_headers()
    handler.wfile.write(data)
