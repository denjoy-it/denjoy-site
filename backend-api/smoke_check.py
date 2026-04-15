#!/usr/bin/env python3
"""Quick backend smoke test for refactored routes.

Usage:
  python3 smoke_check.py
  python3 smoke_check.py --base-url http://127.0.0.1:8787
"""

import argparse
import json
import sys
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run backend smoke checks")
    parser.add_argument("--base-url", default="http://127.0.0.1:8787", help="Backend base URL")
    parser.add_argument("--admin-email", default="schiphorst.d@gmail.com", help="Admin email for login test")
    parser.add_argument("--admin-password", default="B3@uty104", help="Admin password for login test")
    return parser.parse_args()


def make_client():
    return build_opener(HTTPCookieProcessor(CookieJar()))


def call(client, base_url: str, method: str, path: str, payload=None, headers=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = Request(base_url + path, data=data, method=method)
    if payload is not None:
        req.add_header("Content-Type", "application/json")
    if headers:
        for key, value in headers.items():
            req.add_header(key, value)
    try:
        with client.open(req, timeout=8) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, body
    except URLError as exc:
        return None, f"URLError: {exc}"
    except Exception as exc:
        return None, f"TransportError: {exc}"


def expect(label: str, got: int, want: int, body: str, failures: list):
    ok = got == want
    status = "OK" if ok else "FAIL"
    print(f"[{status}] {label}: got={got} want={want}")
    if not ok:
        preview = (body or "")[:220]
        failures.append(f"{label}: expected {want}, got {got}, body={preview}")


def main() -> int:
    args = parse_args()
    client = make_client()
    failures = []

    s, b = call(client, args.base_url, "GET", "/api/health")
    expect("GET /api/health", s, 200, b, failures)

    s, b = call(client, args.base_url, "GET", "/api/auth/msal-config")
    expect("GET /api/auth/msal-config", s, 200, b, failures)

    s, b = call(client, args.base_url, "GET", "/api/auth/verify")
    expect("GET /api/auth/verify (anonymous)", s, 401, b, failures)

    s, b = call(client, args.base_url, "POST", "/api/auth/login", {
        "email": args.admin_email,
        "password": args.admin_password,
    })
    expect("POST /api/auth/login", s, 200, b, failures)

    s, b = call(client, args.base_url, "GET", "/api/auth/csrf-token")
    expect("GET /api/auth/csrf-token", s, 200, b, failures)
    csrf_token = None
    if s == 200:
        try:
            csrf_token = json.loads(b).get("csrf_token")
        except Exception:
            failures.append("GET /api/auth/csrf-token: response is not valid JSON")

    s, b = call(client, args.base_url, "GET", "/api/customers")
    expect("GET /api/customers", s, 200, b, failures)
    first_customer_id = None
    if s == 200:
        try:
            customers_payload = json.loads(b)
            items = customers_payload.get("items") or []
            if items:
                first_customer_id = items[0].get("id")
        except Exception:
            failures.append("GET /api/customers: response is not valid JSON")

    if first_customer_id:
        s, b = call(client, args.base_url, "GET", f"/api/customers/{first_customer_id}/azure")
        expect("GET /api/customers/{id}/azure", s, 200, b, failures)
    else:
        failures.append("GET /api/customers/{id}/azure: no customer found to test endpoint")

    s, b = call(client, args.base_url, "GET", "/api/services/catalog")
    expect("GET /api/services/catalog", s, 200, b, failures)

    s, b = call(client, args.base_url, "GET", "/api/services/requests")
    expect("GET /api/services/requests", s, 200, b, failures)

    s, b = call(client, args.base_url, "POST", "/api/services/requests", {
        "service_id": "svc-identity-hardening",
        "customer_id": first_customer_id or "",
        "customer_name": "Smoke Test Customer",
        "priority": "normal",
        "note": "smoke check aanvraag",
    }, headers={"X-CSRF-Token": csrf_token or ""})
    expect("POST /api/services/requests", s, 201, b, failures)

    s, b = call(client, args.base_url, "POST", "/api/upload-report", {
        "filename": "smoke-route-check.html",
        "content": "<h1>ok</h1>",
    }, headers={"X-CSRF-Token": csrf_token or ""})
    expect("POST /api/upload-report", s, 200, b, failures)

    s, b = call(client, args.base_url, "POST", "/api/actions", {
        "action_type": "smoke",
    }, headers={"X-CSRF-Token": csrf_token or ""})
    expect("POST /api/actions validation", s, 400, b, failures)

    s, b = call(client, args.base_url, "POST", "/api/auth/logout", {}, headers={
        "X-CSRF-Token": csrf_token or "",
    })
    expect("POST /api/auth/logout", s, 200, b, failures)

    if failures:
        print("\nSmoke test failed:")
        for item in failures:
            print(f"- {item}")
        return 1

    print("\nSmoke test passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
