(function initDenjoyMspHubSections() {
  'use strict';

  function initSecurityWorkcards() {
    const root = document.getElementById('securityHubCards');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    root.querySelectorAll('[data-security-toggle]').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const card = toggle.closest('.gb-workcard');
        if (!card) return;
        const body = card.querySelector('.gb-workcard-body');
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        card.classList.toggle('is-open', !expanded);
        if (body) body.style.display = expanded ? 'none' : 'block';
      });
    });

    root.querySelectorAll('[data-hub-route-section]').forEach((button) => {
      button.addEventListener('click', () => {
        const section = button.dataset.hubRouteSection;
        const liveTab = button.dataset.hubRouteLiveTab;
        const opts = liveTab ? { liveTab } : {};
        if (section) showSection(section, opts);
      });
    });
  }

  function updateSecurityWorkcardSummary(id, text, tone = 'neutral') {
    const host = document.getElementById(id);
    if (!host) return;
    host.textContent = text || '—';
    host.className = `gb-wc-chip gb-wc-chip--${tone}`;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value || '—';
  }

  function setList(id, items, emptyText) {
    const el = document.getElementById(id);
    if (!el) return;
    const list = Array.isArray(items) ? items.filter(Boolean).slice(0, 4) : [];
    if (!list.length) {
      el.textContent = emptyText || 'Geen informatie beschikbaar.';
      return;
    }
    el.innerHTML = `<ul>${list.map((item) => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>`;
  }

  function _hubMetaPill(label, tone = 'neutral', action = null) {
    const tones = {
      neutral: { bg: '#f8fafc', fg: '#475569', border: '#e5e7eb' },
      info: { bg: '#eff6ff', fg: '#1d4ed8', border: '#93c5fd' },
      warn: { bg: '#fff7ed', fg: '#9a3412', border: '#fdba74' },
      critical: { bg: '#fef2f2', fg: '#991b1b', border: '#fca5a5' },
      good: { bg: '#ecfdf5', fg: '#166534', border: '#86efac' },
    };
    const t = tones[tone] || tones.neutral;
    return `<span style="padding:.35rem .75rem;border-radius:999px;background:${t.bg};color:${t.fg};font-size:.8rem;font-weight:600;border:1px solid ${t.border};cursor:${action ? 'pointer' : 'default'};" ${action ? `data-action="hubMetaAction" data-hub-action="${escapeHtml(action)}"` : ''}>${escapeHtml(label)}</span>`;
  }

  function _renderHubMeta(hubId, onboarding, capabilityData, latestRun = null) {
    const map = {
      gbid: { el: 'peopleHubMeta', serviceKeys: ['identity'], title: 'Identiteit' },
      security: { el: 'securityHubMeta', serviceKeys: ['security', 'alerts'], title: 'Beveiliging' },
      collab: { el: 'collabHubMeta', serviceKeys: ['exchange', 'backup'], title: 'Samenwerking' },
      devices: { el: 'devicesHubMeta', serviceKeys: ['intune', 'management_hub'], title: 'Apparaten' },
    };
    const config = map[hubId];
    if (!config) return;
    const host = document.getElementById(config.el);
    if (!host) return;
    const serviceItems = Array.isArray(onboarding?.service_items) ? onboarding.service_items.filter((item) => config.serviceKeys.includes(String(item.service_key || ''))) : [];
    const recommendations = _buildTenantCapabilityRecommendations(serviceItems, capabilityData, onboarding || {});
    const visible = recommendations.slice(0, 3);
    const pills = [];
    if (onboarding) {
      pills.push(_hubMetaPill(`Gereedheid ${escapeHtml(String(onboarding.completion_pct || 0))}%`, (onboarding.completion_pct || 0) >= 75 ? 'good' : 'warn', 'tenant_onboarding'));
      pills.push(_hubMetaPill(`Koppeling ${onboarding.auth_ready ? 'gereed' : 'ontbreekt'}`, onboarding.auth_ready ? 'good' : 'critical', 'tenant_onboarding'));
    }
    if (latestRun?.score_overall != null) {
      const tone = Number(latestRun.score_overall) >= 85 ? 'good' : Number(latestRun.score_overall) >= 60 ? 'warn' : 'critical';
      pills.push(_hubMetaPill(`Laatste score ${latestRun.score_overall}%`, tone, 'open_overview'));
    }
    visible.forEach((item) => {
      const tone = item.kind === 'critical' ? 'critical' : item.kind === 'warn' ? 'warn' : 'info';
      pills.push(_hubMetaPill(item.label, tone, item.action?.type || 'tenant_onboarding'));
    });
    if (!pills.length) {
      pills.push(_hubMetaPill(`${config.title} lijkt stabiel`, 'good', 'open_overview'));
    }
    host.innerHTML = pills.join('');
    host.querySelectorAll('[data-action="hubMetaAction"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.hubAction;
        try {
          if (action === 'tenant_onboarding') {
            await openTenantOnboardingManager(currentTenantId, currentTenantName || currentTenantId, null);
            return;
          }
          if (action === 'guardian_sync') {
            await enqueueTenantOnboardingJob(currentTenantId, 'guardian_sync', null, { limit: 25 });
            return;
          }
          if (action === 'tenant_refresh') {
            await enqueueTenantOnboardingJob(currentTenantId, 'tenant_refresh', null);
            return;
          }
          if (action === 'customer_services') {
            showSection('klantenbeheer');
            return;
          }
          showSection('overview');
        } catch (e) {
          showToast(`Fout bij hub-actie: ${e.message || e}`, 'error');
        }
      });
    });
  }

  async function loadHubSection(hubId) {
    const tid = currentTenantId;
    if (hubId === 'security') initSecurityWorkcards();

    if (hubId === 'assessment') {
      const metaEl = document.getElementById('assessmentHubMeta');
      const lastEl = document.getElementById('hubStatAssessmentLast');
      const scoreEl = document.getElementById('hubStatAssessmentScore');
      const actionsEl = document.getElementById('hubStatAssessmentActions');
      if (tid && metaEl) {
        try {
          const r = await apiFetch(`/api/tenants/${tid}/runs?limit=1`);
          const last = (r && r.items || [])[0];
          if (last) {
            if (lastEl) lastEl.textContent = `Laatste: ${formatDate(last.completed_at || last.created_at)}`;
            if (scoreEl) scoreEl.textContent = last.score_overall != null ? `Score: ${last.score_overall}%` : '—';
            if (actionsEl) actionsEl.textContent = last.critical_count != null ? `${last.critical_count} kritiek` : '—';
            metaEl.innerHTML = `
              <span style="padding:.25rem .7rem;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:.8rem;font-weight:600;">Laatste run: ${formatDate(last.completed_at || last.created_at)}</span>
              ${last.score_overall != null ? `<span style="padding:.25rem .7rem;border-radius:999px;background:${last.score_overall >= 70 ? '#dcfce7' : '#fee2e2'};color:${last.score_overall >= 70 ? '#166534' : '#991b1b'};font-size:.8rem;font-weight:600;">Score: ${last.score_overall}%</span>` : ''}
              ${last.critical_count ? `<span style="padding:.25rem .7rem;border-radius:999px;background:#fee2e2;color:#991b1b;font-size:.8rem;font-weight:600;">${last.critical_count} kritiek</span>` : ''}
            `;
          }
        } catch (_) {}
      }
      return;
    }

    if (!tid) return;

    const [onboardingResult, capabilityResult, runsResult] = await Promise.allSettled([
      apiFetchCached(`/api/tenants/${tid}/onboarding`, {}, CACHE_TTL.medium),
      apiFetchCached(API.capabilities.tenant(tid), {}, CACHE_TTL.medium),
      apiFetchCached(`/api/tenants/${tid}/runs?limit=1`, {}, CACHE_TTL.runs),
    ]);
    const onboarding = onboardingResult.status === 'fulfilled' ? onboardingResult.value : null;
    const capabilityData = capabilityResult.status === 'fulfilled' ? capabilityResult.value : null;
    const latestRun = runsResult.status === 'fulfilled' ? ((runsResult.value?.items || [])[0] || null) : null;
    _renderHubMeta?.(hubId, onboarding, capabilityData, latestRun);

    const fetchStat = async (section, subsection, statId, formatter) => {
      const el = document.getElementById(statId);
      if (!el) return;
      try {
        const data = await apiFetch(`/api/tenants/${tid}/snapshots/${section}/${subsection}`);
        if (!data) { el.textContent = '—'; return; }
        el.textContent = formatter(data);
      } catch (_) { el.textContent = '—'; }
    };

    if (hubId === 'gbid') {
      fetchStat('gebruikers', 'users', 'hubStatUsers', (d) => {
        const cnt = d?.data?.TotalUsers ?? d?.TotalUsers ?? '—';
        return cnt !== '—' ? `${cnt} gebruikers` : '—';
      });
      fetchStat('gebruikers', 'licenses', 'hubStatLicenses', (d) => {
        const cnt = (d?.data?.Licenses ?? d?.Licenses ?? []).length;
        return cnt ? `${cnt} licenties` : '—';
      });
      fetchStat('identity', 'mfa', 'hubStatMfa', (d) => {
        const pct = d?.data?.MfaRegisteredPct ?? d?.MfaRegisteredPct;
        return pct != null ? `${pct}% gedekt` : '—';
      });
      fetchStat('identity', 'guests', 'hubStatGuests', (d) => {
        const cnt = (d?.data?.Guests ?? d?.Guests ?? d?.data?.GuestUsers ?? d?.GuestUsers);
        return cnt != null ? `${cnt} gasten` : '—';
      });
      fetchStat('identity', 'admin-roles', 'hubStatAdminRoles', (d) => {
        const cnt = (d?.data?.Roles ?? d?.Roles ?? []).length;
        return cnt ? `${cnt} rollen` : '—';
      });
      fetchStat('ca', 'policies', 'hubStatCA', (d) => {
        const cnt = (d?.data?.Policies ?? d?.Policies ?? []).length;
        return cnt ? `${cnt} beleidsregels` : '—';
      });
      fetchStat('hybrid', 'sync', 'hubStatHybrid', (d) => {
        const cnt = d?.data?.SyncedUsers ?? d?.SyncedUsers ?? d?.data?.Users ?? d?.Users ?? d?.data?.Objects ?? d?.Objects;
        return cnt != null ? `${cnt} gesynchroniseerd` : '—';
      });
    }

    if (hubId === 'security') {
      fetchStat('alerts', 'secure-score', 'hubStatSecureScore', (d) => {
        const score = d?.data?.CurrentScore ?? d?.CurrentScore;
        const max = d?.data?.MaxScore ?? d?.MaxScore;
        updateSecurityWorkcardSummary('hubStatSecureScoreChip', score != null ? `Score ${score}${max ? '/' + max : ''}` : 'Score onbekend', score != null && score >= 80 ? 'ok' : score != null && score >= 65 ? 'warn' : 'error');
        setText('securityScorePreviewValue', score != null ? `${score}${max ? ` / ${max}` : ''}` : 'Onbekend');
        setList(
          'securityScorePreviewList',
          [
            score != null ? `Huidige score: ${score}${max ? ` van ${max}` : ''}` : null,
            (d?.data?.ImprovementActions ?? d?.ImprovementActions) != null ? `${d?.data?.ImprovementActions ?? d?.ImprovementActions} verbeteracties beschikbaar` : null,
            (d?.data?.CompletedActions ?? d?.CompletedActions) != null ? `${d?.data?.CompletedActions ?? d?.CompletedActions} maatregelen voltooid` : null,
          ],
          'Nog geen score-informatie geladen.'
        );
        return score != null ? `${score}${max ? '/' + max : ''} pts` : '—';
      });
      fetchStat('alerts', 'audit-logs', 'hubStatAudit', (d) => {
        const cnt = (d?.data?.Events ?? d?.Events ?? []).length;
        updateSecurityWorkcardSummary('hubStatAuditChip', cnt ? `${cnt} events` : 'Geen events', cnt > 0 ? 'neutral' : 'ok');
        setText('securityAuditPreviewValue', cnt ? `${cnt} gebeurtenissen` : 'Geen events');
        const events = (d?.data?.Events ?? d?.Events ?? []).slice(0, 4).map((event) => {
          const actor = event?.UserPrincipalName || event?.Actor || event?.User || 'Onbekende actor';
          const activity = event?.ActivityDisplayName || event?.Operation || event?.Action || 'Gebeurtenis';
          return `${activity} · ${actor}`;
        });
        if (events.length) {
          setList('securityScorePreviewList', events, 'Nog geen auditinformatie geladen.');
        }
        return cnt ? `${cnt} gebeurtenissen` : '—';
      });
      fetchStat('alerts', 'signins', 'hubStatSignins', (d) => {
        const cnt = (d?.data?.Events ?? d?.Events ?? d?.data?.SignIns ?? d?.SignIns ?? []).length;
        return cnt ? `${cnt} aanmeldingen` : '—';
      });
      fetchStat('findings', 'summary', 'hubStatFindings', (d) => {
        const cnt = d?.data?.OpenFindings ?? d?.OpenFindings ?? d?.data?.CriticalCount ?? d?.CriticalCount;
        updateSecurityWorkcardSummary('hubStatFindingsChip', cnt != null ? `${cnt} open` : 'Geen open risico’s', cnt > 0 ? 'error' : 'ok');
        setText('securityFindingsPreviewValue', cnt != null ? `${cnt}` : '0');
        const findings = d?.data?.Findings ?? d?.Findings ?? d?.data?.Items ?? d?.Items ?? [];
        setList('securityFindingsPreviewList', findings.map((item) => {
          const title = item?.Title || item?.title || item?.Control || item?.control || 'Bevinding';
          const severity = item?.Severity || item?.severity || item?.Status || item?.status;
          return severity ? `${title} · ${severity}` : title;
        }), 'Geen openstaande risico’s geladen.');
        return cnt != null ? `${cnt} open` : '—';
      });
      fetchStat('compliance', 'cis', 'hubStatCis', (d) => {
        const score = d?.data?.CompliancePct ?? d?.CompliancePct ?? d?.data?.Score ?? d?.Score;
        return score != null ? `${score}% in orde` : '—';
      });
      fetchStat('compliance', 'zerotrust', 'hubStatZeroTrust', (d) => {
        const score = d?.data?.OverallScore ?? d?.OverallScore ?? d?.data?.Score ?? d?.Score;
        return score != null ? `${score}%` : '—';
      });
      fetchStat('identity', 'legacy-auth', 'hubStatLegacyAuth', (d) => {
        const cnt = d?.data?.LegacyAuthUsers ?? d?.LegacyAuthUsers ?? d?.data?.Events ?? d?.Events;
        updateSecurityWorkcardSummary('hubStatLegacyAuthChip', cnt != null ? `${cnt} geraakt` : 'Niet beschikbaar', cnt > 0 ? 'warn' : 'ok');
        setText('securityLegacyPreviewValue', cnt != null ? `${cnt}` : 'Onbekend');
        const users = d?.data?.Users ?? d?.Users ?? d?.data?.Events ?? d?.Events ?? [];
        setList('securityLegacyPreviewList', users.map((item) => {
          if (typeof item === 'string') return item;
          return item?.UserPrincipalName || item?.UPN || item?.User || item?.DisplayName || item?.Name || null;
        }), 'Geen legacy-auth detail geladen.');
        return cnt != null ? `${cnt} geraakt` : '—';
      });
      fetchStat('domains', 'domains', 'hubStatSecurityDomains', (d) => {
        const domains = d?.data?.Domains ?? d?.Domains ?? [];
        const cnt = domains.length;
        updateSecurityWorkcardSummary('hubStatSecurityDomainsChip', cnt ? `${cnt} domeinen` : 'Geen domeinen', cnt > 0 ? 'neutral' : 'ok');
        setText('securityDomainsPreviewValue', cnt ? `${cnt}` : '0');
        setList('securityDomainsPreviewList', domains.map((domain) => {
          const name = domain?.Domain || domain?.Name || domain?.domain || 'Domein';
          const spf = domain?.SPF ?? domain?.spf;
          const dkim = domain?.DKIM ?? domain?.dkim;
          const dmarc = domain?.DMARC ?? domain?.dmarc;
          const parts = [spf != null ? `SPF ${spf}` : null, dkim != null ? `DKIM ${dkim}` : null, dmarc != null ? `DMARC ${dmarc}` : null].filter(Boolean);
          return parts.length ? `${name} · ${parts.join(' · ')}` : name;
        }), 'Nog geen domeinbeveiliging geladen.');
        return cnt ? `${cnt} domeinen` : '—';
      });
    }

    if (hubId === 'collab') {
      fetchStat('exchange', 'mailboxes', 'hubStatExchange', (d) => {
        const cnt = (d?.data?.Mailboxes ?? d?.Mailboxes ?? []).length;
        return cnt ? `${cnt} mailboxen` : '—';
      });
      fetchStat('teams', 'teams', 'hubStatTeams', (d) => {
        const cnt = (d?.data?.Teams ?? d?.Teams ?? []).length;
        return cnt ? `${cnt} teams` : '—';
      });
      fetchStat('sharepoint', 'sharepoint-sites', 'hubStatSharePoint', (d) => {
        const cnt = (d?.data?.Sites ?? d?.Sites ?? []).length;
        return cnt ? `${cnt} sites` : '—';
      });
      fetchStat('domains', 'domains', 'hubStatDomains', (d) => {
        const cnt = (d?.data?.Domains ?? d?.Domains ?? []).length;
        return cnt ? `${cnt} domeinen` : '—';
      });
      fetchStat('backup', 'overview', 'hubStatBackup', (d) => {
        const cnt = d?.data?.ProtectedWorkloads ?? d?.ProtectedWorkloads ?? d?.data?.ConfiguredPolicies ?? d?.ConfiguredPolicies;
        return cnt != null ? `${cnt} beschermd` : '—';
      });
    }

    if (hubId === 'devices') {
      fetchStat('intune', 'summary', 'hubStatIntuneOvz', (d) => {
        const total = d?.data?.TotalDevices ?? d?.TotalDevices;
        return total != null ? `${total} apparaten` : '—';
      });
      fetchStat('intune', 'devices', 'hubStatDevices', (d) => {
        const cnt = (d?.data?.Devices ?? d?.Devices ?? []).length;
        return cnt ? `${cnt} apparaten` : '—';
      });
      fetchStat('intune', 'compliance', 'hubStatCompliance', (d) => {
        const ok = (d?.data?.CompliantDevices ?? d?.CompliantDevices);
        return ok != null ? `${ok} in orde` : '—';
      });
      fetchStat('intune', 'configuratie', 'hubStatIntuneConfig', (d) => {
        const cnt = (d?.data?.Policies ?? d?.Policies ?? d?.data?.Profiles ?? d?.Profiles ?? []).length;
        return cnt ? `${cnt} profielen` : '—';
      });
    }
  }

  window.DenjoyMspHubSections = window.DenjoyMspHubSections || { loadHubSection };
  window.loadHubSection = loadHubSection;
  window._hubMetaPill = _hubMetaPill;
  window._renderHubMeta = _renderHubMeta;
}());
