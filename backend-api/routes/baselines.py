import re


def dispatch_baseline_get_routes(path, qs, deps):
    list_baselines = deps.get("list_baselines")
    get_baseline = deps.get("get_baseline")
    list_assignments = deps.get("list_assignments")
    list_baseline_history = deps.get("list_baseline_history")

    if path == "/api/baselines":
        return (200, {"items": list_baselines()})
    if re.fullmatch(r"/api/baselines/[^/]+", path):
        baseline_id = path.split("/")[3]
        row = get_baseline(baseline_id)
        if not row:
            return (404, {"error": "Baseline niet gevonden", "error_code": "not_found"})
        return (200, row)
    if re.fullmatch(r"/api/baselines/[^/]+/assignments", path):
        baseline_id = path.split("/")[3]
        return (200, {"items": list_assignments(baseline_id=baseline_id)})
    if re.fullmatch(r"/api/baselines/[^/]+/history", path):
        baseline_id = path.split("/")[3]
        limit = int(qs.get("limit", ["100"])[0])
        return (200, {"items": list_baseline_history(baseline_id=baseline_id, limit=limit)})
    if path == "/api/baselines/assignments/all":
        return (200, {"items": list_assignments()})
    return None


def dispatch_baseline_post_routes(path, sess, read_json, deps):
    create_baseline = deps.get("create_baseline")
    run_baseline_ps = deps.get("run_baseline_ps")
    db_fetchone = deps.get("db_fetchone")
    assign_baseline = deps.get("assign_baseline")
    check_baseline_compliance = deps.get("check_baseline_compliance")
    apply_baseline_to_tenant = deps.get("apply_baseline_to_tenant")

    if path == "/api/baselines":
        payload = read_json()
        config = payload.get("config") or {}
        row = create_baseline(
            name=payload.get("name", ""),
            description=payload.get("description", ""),
            config=config,
            source_tenant_id=payload.get("source_tenant_id"),
            source_tenant_name=payload.get("source_tenant_name"),
            created_by=sess.get("email", "admin"),
        )
        return (201, row)
    if re.fullmatch(r"/api/baselines/export/[^/]+", path):
        tenant_id = path.split("/")[4]
        payload = read_json()
        result = run_baseline_ps(tenant_id, "export-baseline", {})
        if not result["ok"]:
            return (502, {"error": result.get("error", "Export mislukt")})
        exported_config = result["result"].get("baseline", {})
        tenant_row = db_fetchone("SELECT customer_name FROM tenants WHERE id=?", (tenant_id,))
        tenant_name = tenant_row["customer_name"] if tenant_row else tenant_id
        row = create_baseline(
            name=payload.get("name") or f"Baseline {tenant_name}",
            description=payload.get("description") or f"Geëxporteerd van {tenant_name}",
            config=exported_config,
            source_tenant_id=tenant_id,
            source_tenant_name=tenant_name,
            created_by=sess.get("email", "admin"),
        )
        return (201, row)
    if re.fullmatch(r"/api/baselines/[^/]+/assign", path):
        baseline_id = path.split("/")[3]
        payload = read_json()
        tenant_id = payload.get("tenant_id", "")
        if not tenant_id:
            return (400, {"error": "tenant_id is verplicht"})
        return (201, assign_baseline(baseline_id, tenant_id, sess.get("email", "admin")))
    if re.fullmatch(r"/api/baselines/[^/]+/check/[^/]+", path):
        parts = path.split("/")
        baseline_id = parts[3]
        tenant_id = parts[5]
        return (200, check_baseline_compliance(baseline_id, tenant_id, sess.get("email", "admin")))
    if re.fullmatch(r"/api/baselines/[^/]+/apply/[^/]+", path):
        parts = path.split("/")
        baseline_id = parts[3]
        tenant_id = parts[5]
        payload = read_json()
        dry_run = bool(payload.get("dry_run", False))
        return (200, apply_baseline_to_tenant(baseline_id, tenant_id, dry_run, sess.get("email", "admin")))
    return None


def dispatch_baseline_delete_routes(path, deps):
    delete_baseline = deps.get("delete_baseline")
    unassign_baseline = deps.get("unassign_baseline")

    if re.fullmatch(r"/api/baselines/[^/]+", path):
        baseline_id = path.split("/")[3]
        return (200, delete_baseline(baseline_id))
    if re.fullmatch(r"/api/baselines/[^/]+/assign/[^/]+", path):
        parts = path.split("/")
        baseline_id = parts[3]
        tenant_id = parts[5]
        return (200, unassign_baseline(baseline_id, tenant_id))
    return None


def dispatch_baseline_patch_routes(path, read_json, deps):
    update_baseline = deps.get("update_baseline")

    if re.fullmatch(r"/api/baselines/[^/]+", path):
        baseline_id = path.split("/")[3]
        return (200, update_baseline(baseline_id, read_json()))
    return None
