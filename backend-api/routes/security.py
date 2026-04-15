import re


def dispatch_security_get_routes(path, deps):
    zt_output_folder = deps.get("zt_output_folder")
    zt_read_status = deps.get("zt_read_status")
    zt_tail_log = deps.get("zt_tail_log")
    zt_auth_profile_summary = deps.get("zt_auth_profile_summary")
    zt_linked_app_registration = deps.get("zt_linked_app_registration")
    zt_permission_summary = deps.get("zt_permission_summary")
    run_zerotrust_ps = deps.get("run_zerotrust_ps")

    if re.fullmatch(r"/api/compliance/[^/]+/zerotrust", path):
        tenant_id = path.split("/")[3]
        folder = zt_output_folder(tenant_id)
        status_info = zt_read_status(tenant_id)
        recent_logs = zt_tail_log(tenant_id, 30)
        auth_profile = zt_auth_profile_summary(tenant_id)
        linked_app = zt_linked_app_registration(tenant_id, auth_profile.get("client_id") or "")
        permission_summary = zt_permission_summary(linked_app)
        try:
            data = run_zerotrust_ps(tenant_id, "get-status", folder)
            data["install_supported"] = True
            data["status"] = status_info
            data["recent_logs"] = recent_logs
            data["auth_profile"] = auth_profile
            data["linked_app_registration"] = linked_app
            data["permission_summary"] = permission_summary
            if data.get("ok"):
                if data.get("last_report"):
                    results = run_zerotrust_ps(tenant_id, "get-results", folder)
                    data["results"] = results if isinstance(results, dict) else None
                    if isinstance(data.get("status"), dict) and data["status"].get("state") == "running":
                        data["status"]["detail"] = "Assessment draait nog. Laatste rapport is van een eerdere run."
                elif isinstance(data.get("status"), dict) and data["status"].get("state") == "running":
                    data["status"]["detail"] = "Assessment draait nog. Er is nog geen nieuw rapport gevonden."
                return (200, data)
        except Exception as exc:
            return (
                200,
                {
                    "ok": True,
                    "module": {"installed": False},
                    "last_report": None,
                    "install_supported": True,
                    "status": status_info,
                    "recent_logs": recent_logs,
                    "auth_profile": auth_profile,
                    "linked_app_registration": linked_app,
                    "permission_summary": permission_summary,
                    "error": str(exc),
                },
            )
        return (
            200,
            {
                "ok": True,
                "module": {"installed": False},
                "last_report": None,
                "install_supported": True,
                "status": status_info,
                "recent_logs": recent_logs,
                "auth_profile": auth_profile,
                "linked_app_registration": linked_app,
                "permission_summary": permission_summary,
            },
        )

    return None


def dispatch_security_post_routes(path, read_json, deps):
    zt_output_folder = deps.get("zt_output_folder")
    zt_write_status = deps.get("zt_write_status")
    zt_append_log = deps.get("zt_append_log")
    zt_auth_profile_summary = deps.get("zt_auth_profile_summary")
    run_zerotrust_worker = deps.get("run_zerotrust_worker")
    now_iso = deps.get("now_iso")
    threading = deps.get("threading")

    if re.fullmatch(r"/api/compliance/[^/]+/zerotrust/install", path):
        tenant_id = path.split("/")[3]
        folder = zt_output_folder(tenant_id)
        started_at = now_iso()
        zt_write_status(
            tenant_id,
            {
                "state": "queued",
                "action": "install",
                "message": "Zero Trust module-installatie staat in de wachtrij.",
                "started_at": started_at,
            },
        )

        def install_bg():
            try:
                zt_write_status(
                    tenant_id,
                    {
                        "state": "running",
                        "action": "install",
                        "message": "Zero Trust module wordt op de backend geïnstalleerd.",
                        "started_at": started_at,
                    },
                )
                result = run_zerotrust_worker(tenant_id, "install-module", folder)
                completed_at = now_iso()
                if result.get("ok"):
                    zt_write_status(
                        tenant_id,
                        {
                            "state": "completed",
                            "action": "install",
                            "message": "Zero Trust module is geïnstalleerd.",
                            "started_at": started_at,
                            "completed_at": completed_at,
                            "result": result,
                        },
                    )
                else:
                    zt_write_status(
                        tenant_id,
                        {
                            "state": "failed",
                            "action": "install",
                            "message": result.get("error") or "Module-installatie mislukt.",
                            "started_at": started_at,
                            "completed_at": completed_at,
                            "result": result,
                        },
                    )
            except Exception as exc:
                zt_append_log(tenant_id, f"Installatiefout: {exc}")
                zt_write_status(
                    tenant_id,
                    {
                        "state": "failed",
                        "action": "install",
                        "message": str(exc),
                        "started_at": started_at,
                        "completed_at": now_iso(),
                    },
                )

        threading.Thread(target=install_bg, daemon=True).start()
        return (202, {"ok": True, "message": "Zero Trust module installatie gestart op de backend.", "tenant_id": tenant_id})

    if re.fullmatch(r"/api/compliance/[^/]+/zerotrust/run", path):
        tenant_id = path.split("/")[3]
        folder = zt_output_folder(tenant_id)
        body = read_json()
        auth_profile = zt_auth_profile_summary(tenant_id)
        force_interactive = bool(body.get("force_interactive", False))
        effective_auth_mode = "interactive" if force_interactive else auth_profile.get("preferred_auth_mode", "interactive")
        started_at = now_iso()
        zt_write_status(
            tenant_id,
            {
                "state": "queued",
                "action": "run",
                "message": "Zero Trust Assessment staat in de wachtrij.",
                "started_at": started_at,
                "auth_mode": effective_auth_mode,
            },
        )

        def run_bg():
            try:
                zt_write_status(
                    tenant_id,
                    {
                        "state": "running",
                        "action": "run",
                        "message": "Zero Trust Assessment draait op de backend.",
                        "started_at": started_at,
                        "auth_mode": effective_auth_mode,
                    },
                )
                result = run_zerotrust_worker(tenant_id, "run", folder, force_interactive=force_interactive)
                completed_at = now_iso()
                if result.get("ok"):
                    zt_write_status(
                        tenant_id,
                        {
                            "state": "completed",
                            "action": "run",
                            "message": "Zero Trust Assessment afgerond.",
                            "started_at": started_at,
                            "completed_at": completed_at,
                            "result": result,
                            "auth_mode": effective_auth_mode,
                        },
                    )
                else:
                    zt_write_status(
                        tenant_id,
                        {
                            "state": "failed",
                            "action": "run",
                            "message": result.get("error") or "Zero Trust Assessment mislukt.",
                            "started_at": started_at,
                            "completed_at": completed_at,
                            "result": result,
                            "auth_mode": effective_auth_mode,
                        },
                    )
            except Exception as exc:
                zt_append_log(tenant_id, f"Assessmentfout: {exc}")
                zt_write_status(
                    tenant_id,
                    {
                        "state": "failed",
                        "action": "run",
                        "message": str(exc),
                        "started_at": started_at,
                        "completed_at": now_iso(),
                        "auth_mode": effective_auth_mode,
                    },
                )

        threading.Thread(target=run_bg, daemon=True).start()
        launch_text = (
            "Zero Trust Assessment gestart met afgedwongen interactieve loginflow."
            if force_interactive
            else (
                "Zero Trust Assessment gestart met app-registratie authenticatie."
                if effective_auth_mode == "app"
                else "Zero Trust Assessment gestart. Omdat er geen bruikbare certificaat-auth is gekoppeld, wordt interactieve login gebruikt."
            )
        )
        return (202, {"ok": True, "message": launch_text, "tenant_id": tenant_id, "auth_mode": effective_auth_mode})

    return None
