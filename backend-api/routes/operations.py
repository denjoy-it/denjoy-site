import re
from http import HTTPStatus


def dispatch_operations_get_routes(path, qs, deps):
    list_runs = deps.get("list_runs")
    get_run = deps.get("get_run")
    assessment_json_report_for_run = deps.get("assessment_json_report_for_run")
    runs_dir = deps.get("runs_dir")
    list_run_html_files = deps.get("list_run_html_files")
    list_reports = deps.get("list_reports")
    reports_csv = deps.get("reports_csv")
    tenant_overview = deps.get("tenant_overview")
    list_tenants = deps.get("list_tenants")
    get_tenant_health_score = deps.get("get_tenant_health_score")
    get_findings_trend = deps.get("get_findings_trend")
    get_conn = deps.get("get_conn")
    suggest_kb_for_finding = deps.get("suggest_kb_for_finding")
    suggest_playbooks_for_finding = deps.get("suggest_playbooks_for_finding")

    if path == "/api/runs":
        tenant_id = qs.get("tenant_id", [None])[0]
        limit = int(qs.get("limit", ["100"])[0])
        return (200, {"items": list_runs(tenant_id, limit)})

    if re.fullmatch(r"/api/runs/[^/]+", path):
        run = get_run(path.split("/")[3])
        if not run:
            return (404, {"error": "Run niet gevonden", "error_code": "not_found"})
        return (200, run)

    if re.fullmatch(r"/api/runs/[^/]+/assessment-json", path):
        run_id = path.split("/")[3]
        try:
            return (200, assessment_json_report_for_run(run_id))
        except ValueError as exc:
            return (404, {"ok": False, "error": str(exc)})

    if re.fullmatch(r"/api/runs/[^/]+/logs", path):
        run_id = path.split("/")[3]
        log_path = runs_dir / run_id / "run.log"
        if not log_path.exists():
            return (200, {"text": "", "lines": []})
        text = log_path.read_text(encoding="utf-8", errors="ignore")
        lines = text.splitlines()[-400:]
        return (200, {"text": "\n".join(lines), "lines": lines})

    if re.fullmatch(r"/api/runs/[^/]+/files", path):
        run_id = path.split("/")[3]
        run_dir = runs_dir / run_id
        if not run_dir.exists():
            return (404, {"error": "Run niet gevonden", "error_code": "not_found"})
        files = list_run_html_files(run_dir)
        return (200, {"items": files, "run_id": run_id})

    if path == "/api/reports/list":
        runs = [r for r in list_runs(None, 200) if r.get("report_path")]
        return (
            200,
            [
                {
                    "id": r["id"],
                    "tenantId": r["tenant_id"],
                    "tenantName": r["tenant_name"],
                    "path": r["report_path"],
                    "createdDisplay": r.get("completed_at") or r.get("started_at"),
                    "sizeDisplay": "-",
                }
                for r in runs
            ],
        )

    if path == "/api/reports":
        tenant_id = qs.get("tenant_id", [None])[0]
        status = qs.get("status", [None])[0]
        date_from = qs.get("from", [None])[0]
        date_to = qs.get("to", [None])[0]
        query = qs.get("q", [None])[0]
        archived = qs.get("archived", ["exclude"])[0]
        limit = int(qs.get("limit", ["300"])[0])
        return (200, {"items": list_reports(tenant_id, status, date_from, date_to, query, archived, limit)})

    if path == "/api/reports/export.csv":
        tenant_id = qs.get("tenant_id", [None])[0]
        status = qs.get("status", [None])[0]
        date_from = qs.get("from", [None])[0]
        date_to = qs.get("to", [None])[0]
        query = qs.get("q", [None])[0]
        archived = qs.get("archived", ["exclude"])[0]
        rows = list_reports(tenant_id, status, date_from, date_to, query, archived, 1000)
        csv_text = reports_csv(rows)
        body = csv_text.encode("utf-8")

        def write_csv(handler):
            handler.send_response(HTTPStatus.OK)
            handler.send_header("Content-Type", "text/csv; charset=utf-8")
            handler.send_header("Content-Disposition", "attachment; filename=reports-export.csv")
            handler.send_header("Content-Length", str(len(body)))
            handler.end_headers()
            handler.wfile.write(body)
            return None

        return write_csv

    if re.match(r"^/api/runs/([^/]+)/export\.pdf$", path):
        m = re.match(r"^/api/runs/([^/]+)/export\.pdf$", path)
        run_id = m.group(1)
        export_run_as_pdf = deps.get("export_run_as_pdf")
        try:
            pdf_bytes = export_run_as_pdf(run_id)
        except FileNotFoundError as exc:
            return (404, {"error": str(exc), "error_code": "not_found"})

        def write_pdf(handler):
            handler.send_response(HTTPStatus.OK)
            handler.send_header("Content-Type", "application/pdf")
            handler.send_header(
                "Content-Disposition",
                f"attachment; filename=report-{run_id}.pdf",
            )
            handler.send_header("Content-Length", str(len(pdf_bytes)))
            handler.end_headers()
            handler.wfile.write(pdf_bytes)
            return None

        return write_pdf

    if path == "/api/reports/stats":
        tenant_id = qs.get("tenant_id", [None])[0]
        if tenant_id:
            return (200, tenant_overview(tenant_id))
        return (
            400,
            {
                "error": "tenant_id is verplicht voor /api/reports/stats",
                "error_code": "validation_error",
            },
        )

    if re.fullmatch(r"/api/findings/[^/]+/health", path):
        tenant_id = path.split("/")[3]
        return (200, get_tenant_health_score(tenant_id))

    if re.fullmatch(r"/api/findings/[^/]+/trend", path):
        tenant_id = path.split("/")[3]
        days = int(qs.get("days", ["30"])[0])
        trend = get_findings_trend(tenant_id, days)
        return (200, {"ok": True, "tenant_id": tenant_id, "days": days, "trend": trend})

    if re.fullmatch(r"/api/findings/[^/]+/list", path):
        tenant_id = path.split("/")[3]
        domain_filter = qs.get("domain", [None])[0]
        status_filter = qs.get("status", [None])[0]
        limit = min(int(qs.get("limit", ["200"])[0]), 1000)
        where = ["f.tenant_id=?"]
        args = [tenant_id]
        if domain_filter:
            where.append("f.domain=?")
            args.append(domain_filter)
        if status_filter:
            where.append("f.status=?")
            args.append(status_filter)
        conn = get_conn()
        try:
            rows = conn.execute(
                f"""
                SELECT f.id, f.domain, f.control, f.title, f.status, f.finding,
                       f.impact, f.recommendation, f.service, f.metric_value, f.scanned_at
                FROM scan_findings f
                INNER JOIN (
                    SELECT domain, control, MAX(scanned_at) AS max_at
                    FROM scan_findings WHERE tenant_id=?
                    GROUP BY domain, control
                ) latest ON f.domain=latest.domain AND f.control=latest.control AND f.scanned_at=latest.max_at
                WHERE {' AND '.join(where)}
                ORDER BY f.domain, f.status DESC, f.control
                LIMIT ?
                """,
                [tenant_id] + args + [limit],
            ).fetchall()
            findings = [dict(r) for r in rows]
        finally:
            conn.close()
        return (200, {"ok": True, "tenant_id": tenant_id, "findings": findings, "count": len(findings)})

    if re.fullmatch(r"/api/findings/[^/]+/workbench", path):
        tenant_id = path.split("/")[3]
        domain = qs.get("domain", [""])[0]
        control = qs.get("control", [""])[0]
        title = qs.get("title", [""])[0]
        finding_text = qs.get("finding", [""])[0]
        recommendation = qs.get("recommendation", [""])[0]
        if not domain or not control:
            return (400, {"ok": False, "error": "domain en control zijn verplicht", "error_code": "validation_error"})
        payload = suggest_kb_for_finding(
            tenant_id,
            {
                "domain": domain,
                "control": control,
                "title": title,
                "finding": finding_text,
                "recommendation": recommendation,
            },
        )
        payload["playbooks"] = suggest_playbooks_for_finding(
            tenant_id,
            {
                "domain": domain,
                "control": control,
                "title": title,
                "finding": finding_text,
                "recommendation": recommendation,
            },
        )
        return (200, {"ok": True, "tenant_id": tenant_id, **payload})

    if re.fullmatch(r"/api/findings/overview", path):
        conn = get_conn()
        try:
            tenants_rows = conn.execute(
                "SELECT id, customer_name, tenant_name FROM tenants WHERE is_active=1 ORDER BY customer_name"
            ).fetchall()
            overview = []
            for tenant in tenants_rows:
                score_data = get_tenant_health_score(tenant["id"])
                overview.append(
                    {
                        "tenant_id": tenant["id"],
                        "customer_name": tenant["customer_name"],
                        "tenant_name": tenant["tenant_name"],
                        "score": score_data.get("score"),
                        "total": score_data.get("total", 0),
                        "ok_count": score_data.get("ok_count", 0),
                        "warning_count": score_data.get("warning_count", 0),
                        "critical_count": score_data.get("critical_count", 0),
                    }
                )
        finally:
            conn.close()
        return (200, {"ok": True, "tenants": overview})

    return None


def dispatch_operations_post_routes(path, read_json, client_ip, deps):
    latest_completed_run_for_tenant = deps.get("latest_completed_run_for_tenant")
    persist_snapshot_findings = deps.get("persist_snapshot_findings")
    has_snapshot_findings_for_run = deps.get("has_snapshot_findings_for_run")
    create_or_get_playbook_page = deps.get("create_or_get_playbook_page")
    run_manager = deps.get("run_manager")
    append_run_log = deps.get("append_run_log")
    delete_run = deps.get("delete_run")
    archive_run = deps.get("archive_run")
    restore_run = deps.get("restore_run")
    apply_retention_policy = deps.get("apply_retention_policy")
    check_rate_limit = deps.get("check_rate_limit")
    create_run = deps.get("create_run")

    if re.fullmatch(r"/api/findings/[^/]+/import-snapshot", path):
        tenant_id = path.split("/")[3]
        run = latest_completed_run_for_tenant(tenant_id)
        if not run:
            return (404, {"ok": False, "error": "Geen voltooide assessment-run gevonden voor deze tenant."})
        if has_snapshot_findings_for_run and has_snapshot_findings_for_run(tenant_id, run["id"]):
            return (
                409,
                {
                    "ok": False,
                    "error": "Assessment-snapshot is al geimporteerd voor deze tenant.",
                    "error_code": "already_imported",
                    "tenant_id": tenant_id,
                    "run_id": run["id"],
                },
            )
        written = persist_snapshot_findings(tenant_id, run["id"])
        return (200, {"ok": True, "tenant_id": tenant_id, "run_id": run["id"], "findings_written": written})

    if re.fullmatch(r"/api/findings/[^/]+/playbook", path):
        tenant_id = path.split("/")[3]
        body = read_json()
        domain = str(body.get("domain") or "").strip()
        control = str(body.get("control") or "").strip()
        if not domain or not control:
            return (400, {"ok": False, "error": "domain en control zijn verplicht", "error_code": "validation_error"})
        result = create_or_get_playbook_page(
            tenant_id,
            {
                "domain": domain,
                "control": control,
                "title": body.get("title") or "",
                "finding": body.get("finding") or "",
                "recommendation": body.get("recommendation") or "",
                "status": body.get("status") or "",
            },
        )
        return (201 if result.get("created") else 200, {"ok": True, "tenant_id": tenant_id, **result})

    if re.fullmatch(r"/api/runs/[^/]+/stop", path):
        run_id = path.split("/")[3]
        ok = run_manager.stop(run_id)
        if ok:
            append_run_log(run_id, "⏹ Stop-verzoek ontvangen via API.")
            return (200, {"ok": True})
        return (404, {"error": "Geen actief proces gevonden voor deze run"})

    if re.fullmatch(r"/api/runs/[^/]+/delete", path):
        run_id = path.split("/")[3]
        return (200, delete_run(run_id))

    if re.fullmatch(r"/api/reports/[^/]+/archive", path):
        run_id = path.split("/")[3]
        payload = read_json()
        return (200, archive_run(run_id, payload.get("reason")))

    if re.fullmatch(r"/api/reports/[^/]+/restore", path):
        run_id = path.split("/")[3]
        return (200, restore_run(run_id))

    if path == "/api/reports/retention/apply":
        payload = read_json()
        tenant_id = payload.get("tenant_id") or None
        keep_latest = payload.get("keep_latest", 10)
        keep_days = payload.get("keep_days", 90)
        return (200, apply_retention_policy(tenant_id, keep_latest, keep_days))

    if path == "/api/runs":
        if not check_rate_limit(client_ip, max_attempts=5, window_secs=300):
            return (429, {"error": "Te veel assessment-aanvragen. Wacht enkele minuten.", "error_code": "rate_limited"})
        return (201, create_run(read_json()))

    return None


def dispatch_operations_delete_routes(path, deps):
    delete_run = deps.get("delete_run")

    if re.fullmatch(r"/api/runs/[^/]+", path):
        run_id = path.split("/")[3]
        return (200, delete_run(run_id))

    return None
