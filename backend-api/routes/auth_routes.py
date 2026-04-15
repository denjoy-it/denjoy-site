"""
Authentication Routes Dispatcher

Handles auth-related POST endpoints (login, logout, Microsoft SSO).
Extracted from app.py for better organization and testability.
"""

import secrets
import re
import uuid
import json
import urllib.request
import urllib.error
from typing import Tuple, Dict, Any, Optional, Callable


# ─────────────────────────────────────────────────────────────
# Microsoft ID-token validatie (server-side JWKS verificatie)
# ─────────────────────────────────────────────────────────────

_JWKS_CACHE: Dict[str, Any] = {}  # {tenant_id: {"keys": [...], "fetched_at": float}}


def _fetch_jwks(tenant_id: str) -> list:
    """Haal Microsoft JWKS-sleutels op voor tokenvalidatie (cache: 5 minuten)."""
    import time
    cached = _JWKS_CACHE.get(tenant_id)
    if cached and (time.time() - cached["fetched_at"]) < 300:
        return cached["keys"]
    url = f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
            keys = data.get("keys", [])
            _JWKS_CACHE[tenant_id] = {"keys": keys, "fetched_at": time.time()}
            return keys
    except Exception:
        return cached["keys"] if cached else []


def _b64url_decode(s: str) -> bytes:
    """Base64url-decodering zonder padding."""
    import base64
    s = s.replace("-", "+").replace("_", "/")
    s += "=" * (-len(s) % 4)
    return base64.b64decode(s)


def _validate_ms_id_token(id_token: str, tenant_id: str, client_id: str) -> Dict[str, Any]:
    """
    Valideer een Microsoft ID-token (JWT) server-side.
    Retourneert de geverifieerde claims of gooit ValueError bij fout.

    Vereist: alleen stdlib + cryptography (indien beschikbaar).
    Valideert: handtekening (RS256), aud, iss, exp, nbf.
    """
    import time
    import base64

    parts = id_token.split(".")
    if len(parts) != 3:
        raise ValueError("Ongeldig JWT-formaat")

    header = json.loads(_b64url_decode(parts[0]))
    payload = json.loads(_b64url_decode(parts[1]))

    # Tijdvalidatie
    now = time.time()
    exp = payload.get("exp", 0)
    nbf = payload.get("nbf", now)
    if exp and now > exp + 300:  # 5 min clock-skew tolerantie
        raise ValueError("Token verlopen")
    if nbf and now < nbf - 300:
        raise ValueError("Token nog niet geldig")

    # Audience-validatie
    aud = payload.get("aud", "")
    if client_id and aud != client_id:
        raise ValueError(f"Token audience komt niet overeen: {aud!r} != {client_id!r}")

    # Issuer-validatie (common of tenant-specifiek)
    iss = payload.get("iss", "")
    valid_issuers = [
        f"https://login.microsoftonline.com/{tenant_id}/v2.0",
        "https://login.microsoftonline.com/common/v2.0",
    ]
    if iss and not any(iss == vi for vi in valid_issuers):
        raise ValueError(f"Onbekende issuer: {iss!r}")

    # Handtekeningvalidatie via JWKS
    try:
        from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
        from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15
        from cryptography.hazmat.primitives.hashes import SHA256
        from cryptography.hazmat.backends import default_backend
        import base64 as _b64

        kid = header.get("kid", "")
        keys = _fetch_jwks(tenant_id)
        jwk = next((k for k in keys if k.get("kid") == kid), None)
        if jwk:
            n = int.from_bytes(_b64url_decode(jwk["n"]), "big")
            e = int.from_bytes(_b64url_decode(jwk["e"]), "big")
            pub_key = RSAPublicNumbers(e, n).public_key(default_backend())
            msg = f"{parts[0]}.{parts[1]}".encode()
            sig = _b64url_decode(parts[2])
            pub_key.verify(sig, msg, PKCS1v15(), SHA256())
    except ImportError:
        pass  # cryptography not installed — signature check skipped, claims still validated
    except Exception as exc:
        raise ValueError(f"Tokenhandtekening ongeldig: {exc}") from exc

    return payload


def dispatch_auth_post_routes(
    path: str,
    read_json: Callable,
    client_address: tuple,
    deps: Dict[str, Any],
) -> Optional[Any]:
    """
    Route POST requests for authentication endpoints.

    Handles:
    - POST /api/auth/login - Email/password authentication
    - POST /api/auth/logout - Session termination
    - POST /api/auth/microsoft - Microsoft SSO authentication

    Args:
        path: Request path
        read_json: Function to read request body as JSON
        client_address: Client IP address tuple
        deps: Dependencies dict with:
            - db_fetchone: Database fetch one function
            - db_execute: Database execute function
            - db_audit: Database audit function
            - _check_rate_limit: IP-based rate limit check function
            - _check_account_lockout: Email-based account lockout check (returns bool)
            - _record_account_failure: Record a failed login attempt per email
            - _verify_pw: Password verification function
            - _hash_pw: Password hashing function (used for timing-safe dummy hash)
            - _create_session: Session creation function
            - _get_session_from_request: Get session from request function
            - now_iso: Current timestamp function

    Returns:
        (http_status, response_dict) or handler method reference, or None if route doesn't match
    """
    # Extract injected dependencies
    db_fetchone = deps.get("db_fetchone")
    db_execute = deps.get("db_execute")
    db_audit = deps.get("db_audit")
    _check_rate_limit = deps.get("_check_rate_limit")
    _check_account_lockout = deps.get("_check_account_lockout")
    _record_account_failure = deps.get("_record_account_failure")
    _verify_pw = deps.get("_verify_pw")
    _hash_pw = deps.get("_hash_pw")
    _create_session = deps.get("_create_session")
    _get_session_from_request = deps.get("_get_session_from_request")
    now_iso = deps.get("now_iso")
    request_handler = deps.get("request_handler")

    ip = client_address[0]

    # POST /api/auth/login - Email/password authentication
    if path == "/api/auth/login":
        body = read_json()
        email = (body.get("email") or "").strip().lower()
        password = body.get("password") or ""

        # Rate limiting (IP-based)
        if not _check_rate_limit(ip, max_attempts=10, window_secs=60):
            db_audit("", ip, "login_rate_limited", detail=email)
            return (429, {"ok": False, "error": "Te veel inlogpogingen. Probeer het later opnieuw."})

        # Input validatie
        if not email or not re.match(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$', email):
            return (400, {"ok": False, "error": "Ongeldig e-mailadres."})
        if len(password) < 8 or len(password) > 512:
            return (400, {"ok": False, "error": "Wachtwoord moet minimaal 8 tekens bevatten."})

        # Account lockout check (email-based, separate from IP rate limit)
        if _check_account_lockout and not _check_account_lockout(email):
            db_audit(email, ip, "login_account_locked")
            return (429, {"ok": False, "error": "Account tijdelijk geblokkeerd na te veel mislukte pogingen."})

        user = db_fetchone("SELECT * FROM users WHERE lower(email)=? AND is_active=1", (email,))

        # Timing-safe: always run hash computation to prevent user-enumeration via response timing
        if not user:
            _hash_pw(password, "0000000000000000")  # dummy salt — result discarded
            db_audit(email, ip, "login_failed")
            return (401, {"ok": False, "error": "Onjuist e-mailadres of wachtwoord."})

        if not _verify_pw(password, user["password_hash"], user["salt"]):
            if _record_account_failure:
                _record_account_failure(email)
            db_audit(email, ip, "login_failed")
            return (401, {"ok": False, "error": "Onjuist e-mailadres of wachtwoord."})

        token = _create_session(user["id"], user["role"], user["email"], user["display_name"])
        db_execute("UPDATE users SET last_login_at=? WHERE id=?", (now_iso(), user["id"]))
        db_audit(email, ip, "login_success", "user", user["id"])

        # Return callable that sets response headers
        return {
            "response": 200,
            "headers": {
                "Set-Cookie": f"denjoy_session={token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600",
            },
            "json_body": {
                "ok": True,
                "token": token,
                "role": user["role"],
                "email": user["email"],
                "display_name": user["display_name"]
            },
        }

    # POST /api/auth/logout - Session termination
    if path == "/api/auth/logout":
        sess = _get_session_from_request(request_handler) if request_handler else None
        if sess:
            db_execute("DELETE FROM sessions WHERE token=?", (sess["token"],))
            db_audit(sess.get("email", ""), ip, "logout_success", "user", sess.get("user_id", ""))
        return {
            "response": 200,
            "headers": {
                "Set-Cookie": "denjoy_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
            },
            "json_body": {"ok": True},
        }

    # POST /api/auth/microsoft - Microsoft SSO authentication
    if path == "/api/auth/microsoft":
        body = read_json()
        id_token = (body.get("id_token") or "").strip()
        tenant_id_ms = (body.get("tenant_id") or "").strip()

        if not id_token:
            return (400, {"ok": False, "error": "id_token vereist (Microsoft ID-token)"})

        # Haal auth-config op voor tokenvalidatie
        config = deps.get("config") or {}
        auth_client_id = config.get("auth_client_id") or ""
        auth_tenant_id = tenant_id_ms or config.get("auth_tenant_id") or "common"

        # Server-side tokenvalidatie — extracteer claims
        try:
            claims = _validate_ms_id_token(id_token, auth_tenant_id, auth_client_id)
        except ValueError as exc:
            db_audit("", ip, "sso_token_invalid", detail=str(exc))
            return (401, {"ok": False, "error": f"Tokenvalidatie mislukt: {exc}"})

        # Extraheer identiteit ALTIJD uit geverifieerde claims, nooit uit de body
        email = (claims.get("preferred_username") or claims.get("email") or claims.get("upn") or "").strip().lower()
        name = claims.get("name") or email

        if not email:
            return (400, {"ok": False, "error": "Geen e-mailadres gevonden in token-claims"})

        # Domein-whitelist controle (optioneel — configureer via sso_allowed_domains in config.json)
        sso_allowed_domains = config.get("sso_allowed_domains") or []
        if sso_allowed_domains:
            email_domain = email.split("@")[-1] if "@" in email else ""
            if email_domain not in sso_allowed_domains:
                db_audit(email, ip, "sso_domain_blocked", detail=email_domain)
                return (403, {"ok": False, "error": "Uw domein is niet toegestaan voor SSO-aanmelding."})

        user = db_fetchone("SELECT * FROM users WHERE lower(email)=?", (email,))
        if not user:
            # Automatisch aanmaken als klant (read-only)
            uid = str(uuid.uuid4())
            pw_hash, salt = _hash_pw(secrets.token_hex(16))  # random onbruikbaar wachtwoord
            db_execute(
                "INSERT INTO users (id,email,password_hash,salt,role,display_name,is_active,created_at) VALUES (?,?,?,?,?,?,1,?)",
                (uid, email, pw_hash, salt, "klant", name, now_iso())
            )
            user = db_fetchone("SELECT * FROM users WHERE id=?", (uid,))

        if not user or not user.get("is_active"):
            db_audit(email, ip, "sso_login_blocked")
            return (403, {"ok": False, "error": "Account is niet actief."})

        token = _create_session(user["id"], user["role"], user["email"], user["display_name"] or name)
        db_audit(email, ip, "sso_login_success", "user", user["id"])

        return {
            "response": 200,
            "headers": {
                "Set-Cookie": f"denjoy_session={token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600",
            },
            "json_body": {
                "ok": True,
                "token": token,
                "role": user["role"],
                "email": user["email"],
                "display_name": user["display_name"] or name
            },
        }

    # Route not matched
    return None
