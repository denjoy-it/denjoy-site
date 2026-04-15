import re


def _normalize_exchange_mailbox(item):
    if not isinstance(item, dict):
        return None
    mail = item.get("mail") or item.get("primarySmtpAddress") or item.get("PrimarySmtpAddress") or ""
    upn = item.get("upn") or item.get("userPrincipalName") or item.get("UserPrincipalName") or mail
    display_name = item.get("displayName") or item.get("DisplayName") or mail or upn or "Mailbox"
    raw_enabled = item.get("accountEnabled")
    if raw_enabled is None:
        raw_enabled = item.get("AccountEnabled")
    if isinstance(raw_enabled, str):
        raw_enabled = raw_enabled.strip().lower() in {"1", "true", "yes", "enabled"}
    account_enabled = raw_enabled if isinstance(raw_enabled, bool) else None
    return {
        **item,
        "id": item.get("id") or mail or upn or display_name,
        "displayName": display_name,
        "mail": mail,
        "primarySmtpAddress": item.get("primarySmtpAddress") or item.get("PrimarySmtpAddress") or mail,
        "upn": upn,
        "accountEnabled": account_enabled,
        "recipientTypeDetails": item.get("recipientTypeDetails") or item.get("RecipientTypeDetails") or "UserMailbox",
        "timezone": item.get("timezone") or item.get("timeZone") or "—",
        "language": item.get("language") or "—",
        "autoReplyEnabled": bool(item.get("autoReplyEnabled")),
        "onPremSync": bool(item.get("onPremSync") or item.get("onPremisesSyncEnabled")),
    }


def _normalize_exchange_mailboxes_payload(data):
    payload = dict(data or {})
    mailboxes = []
    for item in payload.get("mailboxes") or []:
        normalized = _normalize_exchange_mailbox(item)
        if normalized:
            mailboxes.append(normalized)
    payload["mailboxes"] = mailboxes
    payload["count"] = int(payload.get("count") or len(mailboxes))
    payload["ok"] = payload.get("ok") is not False
    return payload


def _normalize_exchange_mailbox_detail(data):
    payload = dict(data or {})
    base = _normalize_exchange_mailbox(payload) or {}
    return {
        **payload,
        **base,
        "department": payload.get("department"),
        "jobTitle": payload.get("jobTitle"),
        "office": payload.get("office"),
        "mobile": payload.get("mobile"),
        "language": payload.get("language") or base.get("language") or "—",
        "timezone": payload.get("timezone") or base.get("timezone") or "—",
        "autoReply": payload.get("autoReply") or {"status": "disabled"},
        "forwarding": payload.get("forwarding") or {"enabled": False, "address": None},
        "recipientTypeDetails": payload.get("recipientTypeDetails") or base.get("recipientTypeDetails") or "UserMailbox",
        "ok": payload.get("ok") is not False,
    }


def dispatch_collaboration_services_get_routes(path, qs, deps):
    run_collab_ps = deps.get("run_collab_ps")
    build_sharepoint_capacity_summary = deps.get("build_sharepoint_capacity_summary")
    snapshot_as_sharepoint_sites = deps.get("snapshot_as_sharepoint_sites")
    snapshot_as_sharepoint_settings = deps.get("snapshot_as_sharepoint_settings")
    snapshot_as_teams = deps.get("snapshot_as_teams")
    run_alerts_ps = deps.get("run_alerts_ps")
    latest_assessment_snapshot_for_tenant = deps.get("latest_assessment_snapshot_for_tenant")
    assessment_json_payload = deps.get("assessment_json_payload")
    payload_value = deps.get("payload_value")
    snapshot_raw_metrics = deps.get("snapshot_raw_metrics")
    get_alert_config = deps.get("get_alert_config")
    run_exchange_ps = deps.get("run_exchange_ps")
    snapshot_as_mailboxes = deps.get("snapshot_as_mailboxes")
    snapshot_as_mailbox_detail = deps.get("snapshot_as_mailbox_detail")
    attach_source_meta = deps.get("attach_source_meta")
    list_actions = deps.get("list_actions")

    if re.fullmatch(r"/api/collaboration/[^/]+/sharepoint/sites", path):
        tenant_id = path.split("/")[3]
        strict_live = qs.get("strict_live", ["0"])[0] in {"1", "true", "yes"}
        live_error = None
        try:
            data = run_collab_ps(tenant_id, "list-sharepoint", {})
            if data.get("ok") is not False and data.get("sites") is not None:
                enriched = dict(data)
                enriched.update(build_sharepoint_capacity_summary(tenant_id, enriched.get("sites") or []))
                return (200, attach_source_meta(enriched, "live", tenant_id=tenant_id))
            live_error = data.get("error") or data.get("message")
        except Exception as exc:
            live_error = str(exc)
        if strict_live:
            return (502, {"ok": False, "sites": [], "error": live_error or "SharePoint live data ophalen is mislukt."})
        sites = snapshot_as_sharepoint_sites(tenant_id)
        payload = {"ok": True, "sites": sites, "count": len(sites)}
        payload.update(build_sharepoint_capacity_summary(tenant_id, sites))
        return (200, attach_source_meta(payload, "assessment_snapshot", tenant_id=tenant_id))

    if re.fullmatch(r"/api/collaboration/[^/]+/sharepoint/settings", path):
        tenant_id = path.split("/")[3]
        strict_live = qs.get("strict_live", ["0"])[0] in {"1", "true", "yes"}
        live_error = None
        try:
            data = run_collab_ps(tenant_id, "get-sharepoint-settings", {})
            if data.get("ok") is not False:
                return (200, attach_source_meta(data, "live", tenant_id=tenant_id))
            live_error = data.get("error") or data.get("message")
        except Exception as exc:
            live_error = str(exc)
        if strict_live:
            return (502, {"ok": False, "error": live_error or "SharePoint-instellingen live ophalen is mislukt."})
        settings = snapshot_as_sharepoint_settings(tenant_id)
        if settings:
            return (200, attach_source_meta(settings, "assessment_snapshot", tenant_id=tenant_id))
        return (200, {"ok": False, "message": live_error or "SharePoint-instellingen niet beschikbaar"})

    if re.fullmatch(r"/api/collaboration/[^/]+/teams", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_collab_ps(tenant_id, "list-teams", {})
            if data.get("ok") is not False:
                # Always normalize to include 'teams' and 'count'
                teams = data.get("teams") or []
                payload = dict(data)
                payload["teams"] = teams
                payload["count"] = int(payload.get("count") or len(teams))
                return (200, attach_source_meta(payload, "live", tenant_id=tenant_id))
        except Exception:
            pass
        teams = snapshot_as_teams(tenant_id)
        return (200, attach_source_meta({"ok": True, "teams": teams, "count": len(teams)}, "assessment_snapshot", tenant_id=tenant_id))

    if re.fullmatch(r"/api/collaboration/[^/]+/teams/[^/]+", path):
        parts = path.split("/")
        tenant_id, team_id = parts[3], parts[5]
        try:
            data = run_collab_ps(tenant_id, "get-team", {"team_id": team_id})
            if data.get("ok") is not False:
                return (200, data)
        except Exception:
            pass
        return (404, {"ok": False, "error": "Team detail niet beschikbaar"})

    if re.fullmatch(r"/api/collaboration/[^/]+/groups", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_collab_ps(tenant_id, "list-groups", {})
            if data.get("ok") and "groups" in data:
                return (200, data)
        except Exception:
            pass
        return (200, {"ok": True, "groups": [], "count": 0, "stats": {}})

    if re.fullmatch(r"/api/alerts/[^/]+/audit-logs", path):
        tenant_id = path.split("/")[3]
        limit = int(qs.get("limit", ["100"])[0])
        try:
            data = run_alerts_ps(tenant_id, "list-audit-logs", {"limit": limit})
            if data.get("ok") and "items" in data:
                return (200, data)
        except Exception:
            pass
        snapshot = latest_assessment_snapshot_for_tenant(tenant_id)
        payload = assessment_json_payload(snapshot, "alerts", "audit-logs")
        if isinstance(payload, dict):
            items = []
            for item in payload.get("items") or []:
                if not isinstance(item, dict):
                    continue
                items.append(
                    {
                        "title": payload_value(item, "Title", "title", default=""),
                        "severity": payload_value(item, "Severity", "severity", default=""),
                        "category": payload_value(item, "Category", "category"),
                        "status": payload_value(item, "Status", "status"),
                        "createdDateTime": payload_value(item, "CreatedDateTime", "createdDateTime"),
                    }
                )
            return (200, attach_source_meta({"ok": True, "items": items, "count": len(items)}, "assessment_snapshot", tenant_id=tenant_id))
        return (
            200,
            attach_source_meta(
                {"ok": True, "items": [], "message": "Auditlog niet beschikbaar — voer een live sessie uit voor realtime data"},
                "assessment_snapshot",
                tenant_id=tenant_id,
            ),
        )

    if re.fullmatch(r"/api/alerts/[^/]+/secure-score", path):
        tenant_id = path.split("/")[3]
        try:
            data = run_alerts_ps(tenant_id, "get-secure-score", {})
            if data.get("ok") is not False and ("score" in data or "currentScore" in data):
                return (200, data)
        except Exception:
            pass
        snapshot = latest_assessment_snapshot_for_tenant(tenant_id)
        payload = assessment_json_payload(snapshot, "alerts", "secure-score")
        if isinstance(payload, dict):
            summary = payload.get("summary") or {}
            return (
                200,
                attach_source_meta(
                    {
                        "ok": True,
                        "score": round(float(summary.get("percentage") or 0)),
                        "currentScore": float(summary.get("currentScore") or 0),
                        "maxScore": float(summary.get("maxScore") or 100),
                        "recommendations": payload.get("items") or [],
                        "createdAt": payload.get("generated_at") or snapshot.get("assessment_generated_at"),
                    },
                    "assessment_snapshot",
                    tenant_id=tenant_id,
                ),
            )
        metrics = snapshot_raw_metrics(tenant_id)
        score = metrics.get("SecureScorePct")
        if score is not None:
            return (
                200,
                attach_source_meta(
                    {
                        "ok": True,
                        "score": round(float(score)),
                        "currentScore": round(float(score)),
                        "maxScore": 100,
                        "createdAt": snapshot.get("assessment_generated_at"),
                    },
                    "assessment_snapshot",
                    tenant_id=tenant_id,
                ),
            )
        return (200, {"ok": False, "message": "Security score niet beschikbaar"})

    if re.fullmatch(r"/api/alerts/[^/]+/sign-ins", path):
        tenant_id = path.split("/")[3]
        limit = int(qs.get("limit", ["50"])[0])
        try:
            data = run_alerts_ps(tenant_id, "list-sign-ins", {"limit": limit})
            if data.get("ok") and "items" in data:
                return (200, data)
        except Exception:
            pass
        return (
            200,
            attach_source_meta(
                {"ok": True, "items": [], "message": "Aanmeldingen niet beschikbaar — voer een live sessie uit voor realtime data"},
                "assessment_snapshot",
                tenant_id=tenant_id,
            ),
        )

    if re.fullmatch(r"/api/alerts/[^/]+/config", path):
        tenant_id = path.split("/")[3]
        return (200, {"ok": True, "config": get_alert_config(tenant_id)})

    if re.fullmatch(r"/api/alerts/[^/]+/follow-up", path):
        tenant_id = path.split("/")[3]
        status = (qs.get("status", ["all"])[0] or "all").strip().lower()
        actions = list_actions(tenant_id, status if status in {"all", "open", "in_progress", "done", "accepted"} else "all")
        open_count = sum(1 for item in actions if str(item.get("status") or "") == "open")
        in_progress_count = sum(1 for item in actions if str(item.get("status") or "") == "in_progress")
        closed_count = sum(1 for item in actions if str(item.get("status") or "") in {"done", "accepted"})
        overdue_count = sum(1 for item in actions if bool(item.get("is_overdue")))
        due_soon_count = sum(1 for item in actions if str(item.get("sla_state") or "") == "due_soon")
        return (
            200,
            {
                "ok": True,
                "items": actions,
                "summary": {
                    "total": len(actions),
                    "open": open_count,
                    "in_progress": in_progress_count,
                    "closed": closed_count,
                    "overdue": overdue_count,
                    "due_soon": due_soon_count,
                },
            },
        )

    if re.fullmatch(r"/api/exchange/[^/]+/mailboxes", path):
        tenant_id = path.split("/")[3]
        strict_live = qs.get("strict_live", ["0"])[0] in {"1", "true", "yes"}
        live_error = None
        try:
            data = run_exchange_ps(tenant_id, "list-mailboxes", {})
            if data.get("ok") is not False and "mailboxes" in data:
                return (200, attach_source_meta(_normalize_exchange_mailboxes_payload(data), "live", tenant_id=tenant_id))
            live_error = data.get("error") or None
        except Exception:
            live_error = "Exchange live data ophalen is mislukt."
        if strict_live:
            return (502, {"ok": False, "mailboxes": [], "error": live_error or "Exchange live data ophalen is mislukt."})
        mailboxes = snapshot_as_mailboxes(tenant_id)
        if mailboxes:
            return (200, attach_source_meta(_normalize_exchange_mailboxes_payload({"ok": True, "mailboxes": mailboxes}), "assessment_snapshot", tenant_id=tenant_id))
        return (200, {"ok": False, "mailboxes": [], "error": live_error or "Exchange data niet beschikbaar"})

    if re.fullmatch(r"/api/exchange/[^/]+/mailboxes/[^/]+", path):
        parts = path.split("/")
        tenant_id, user_id = parts[3], parts[5]
        try:
            data = run_exchange_ps(tenant_id, "get-mailbox", {"user_id": user_id})
            if data.get("ok"):
                return (200, attach_source_meta(_normalize_exchange_mailbox_detail(data), "live", tenant_id=tenant_id))
        except Exception:
            pass
        detail = snapshot_as_mailbox_detail(tenant_id, user_id)
        if detail:
            return (200, attach_source_meta(_normalize_exchange_mailbox_detail(detail), "assessment_snapshot", tenant_id=tenant_id))
        return (200, {"ok": False, "error": "Mailbox detail niet beschikbaar"})

    if re.fullmatch(r"/api/exchange/[^/]+/forwarding", path):
        tenant_id = path.split("/")[3]
        return (200, attach_source_meta(run_exchange_ps(tenant_id, "list-forwarding", {}), "live", tenant_id=tenant_id))

    if re.fullmatch(r"/api/exchange/[^/]+/mailbox-rules", path):
        tenant_id = path.split("/")[3]
        return (200, attach_source_meta(run_exchange_ps(tenant_id, "list-mailbox-rules", {}), "live", tenant_id=tenant_id))

    return None


def dispatch_collaboration_services_post_routes(path, read_json, deps):
    upsert_alert_config = deps.get("upsert_alert_config")
    send_test_webhook = deps.get("send_test_webhook")

    if re.fullmatch(r"/api/alerts/[^/]+/config", path):
        tenant_id = path.split("/")[3]
        payload = read_json()
        try:
            threshold = int(payload.get("score_threshold", 60) or 60)
        except Exception:
            threshold = 60
        threshold = max(0, min(100, threshold))
        upsert_alert_config(
            tenant_id,
            payload.get("webhook_url", ""),
            payload.get("webhook_type", "teams"),
            payload.get("email_addr", ""),
            bool(payload.get("notify_on_critical", True)),
            threshold,
        )
        return (200, {"ok": True})

    if re.fullmatch(r"/api/alerts/[^/]+/test-webhook", path):
        payload = read_json()
        webhook_url = payload.get("webhook_url", "")
        webhook_type = payload.get("webhook_type", "teams")
        if not webhook_url:
            return (400, {"error": "webhook_url vereist"})
        result = send_test_webhook(webhook_url, webhook_type)
        return (200 if result.get("ok") else 502, result)

    return None
