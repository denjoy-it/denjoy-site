(function initDenjoyMspCustomersView(global) {
  let klantenCache = [];
  let klantenOverviewMap = new Map();
  let klantenLoadSeq = 0;

  const customerServiceOptions = [
    'identity',
    'security',
    'exchange',
    'intune',
    'backup',
    'alerts',
    'zerotrust',
    'kb',
    'management_hub',
  ];

  const serviceCapabilityMap = {
    identity: ['gebruikers', 'identity', 'ca'],
    security: ['alerts', 'ca', 'compliance'],
    exchange: ['exchange'],
    intune: ['intune'],
    backup: ['backup'],
    alerts: ['alerts'],
    zerotrust: ['identity', 'ca', 'alerts', 'intune'],
    kb: ['domains'],
    management_hub: ['intune', 'alerts', 'apps'],
  };

  function formatServiceLabel(serviceKey) {
    return String(serviceKey || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function summarizeServiceCapabilities(serviceKey, capabilityData) {
    const sections = serviceCapabilityMap[serviceKey] || [];
    const modules = Array.isArray(capabilityData?.modules) ? capabilityData.modules : [];
    const relevant = modules.filter((module) => sections.includes(String(module.section || '')));
    const counts = { ready: 0, validation_required: 0, config_required: 0, snapshot_only: 0, not_implemented: 0, total: 0 };
    relevant.forEach((module) => {
      (module.subsections || []).forEach((item) => {
        const status = String(item.status || 'not_implemented');
        if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
        counts.total += 1;
      });
    });
    return counts;
  }

  function renderServiceCapabilityPill(serviceKey, capabilityData) {
    const summary = summarizeServiceCapabilities(serviceKey, capabilityData);
    if (!summary.total) {
      return `<span style="font-size:.72rem;padding:.1rem .5rem;border-radius:999px;background:#f8fafc;color:#475569;border:1px solid var(--border-color,#e5e7eb);">${global.escapeHtml(formatServiceLabel(serviceKey))} · geen capabilityprofiel</span>`;
    }
    const liveReady = summary.ready + summary.validation_required;
    const tone = summary.config_required > 0 || summary.not_implemented > 0
      ? { bg: '#fee2e2', fg: '#991b1b' }
      : summary.snapshot_only > 0
        ? { bg: '#f8fafc', fg: '#475569' }
        : { bg: '#dcfce7', fg: '#166534' };
    return `<span style="font-size:.72rem;padding:.1rem .5rem;border-radius:999px;background:${tone.bg};color:${tone.fg};">${global.escapeHtml(formatServiceLabel(serviceKey))} · ${liveReady}/${summary.total} live-ready</span>`;
  }

  function buildTenantCapabilityRecommendations(serviceItems, capabilityData, onboardingState = {}) {
    const recommendations = [];
    const enabledKeys = new Set(
      (Array.isArray(serviceItems) ? serviceItems : [])
        .filter((item) => String(item.status || '') !== 'missing')
        .map((item) => String(item.service_key || ''))
        .filter(Boolean)
    );

    if (!onboardingState.auth_ready) {
      recommendations.push({
        kind: 'critical',
        label: 'Auth-profiel afronden',
        detail: 'GDAP, app-registratie of Lighthouse is nog niet compleet, waardoor live capabilities beperkt blijven.',
        action: { type: 'tenant_onboarding', label: 'Tenant onboarding' },
      });
    }
    if (!onboardingState.kb_ready) {
      recommendations.push({
        kind: 'info',
        label: 'KB-basis vullen',
        detail: 'Vul basisdocumentatie en kernassets, zodat runbooks en opvolging beter aansluiten op de tenant.',
        action: { type: 'tenant_onboarding', label: 'Tenant onboarding' },
      });
    }

    (Array.isArray(serviceItems) ? serviceItems : []).forEach((item) => {
      const serviceKey = String(item.service_key || '');
      if (!serviceKey) return;
      const summary = summarizeServiceCapabilities(serviceKey, capabilityData);
      const liveReady = summary.ready + summary.validation_required;
      const serviceLabel = formatServiceLabel(serviceKey);

      if (!summary.total) {
        recommendations.push({
          kind: 'info',
          label: `${serviceLabel} structureren`,
          detail: 'Deze service is gekoppeld, maar heeft nog geen expliciet capabilityprofiel in de control-plane.',
          action: { type: 'customer_services', label: 'Services beheren' },
        });
        return;
      }

      if (summary.config_required > 0 || summary.not_implemented > 0) {
        recommendations.push({
          kind: 'critical',
          label: `${serviceLabel} configureren`,
          detail: `${summary.config_required + summary.not_implemented} onderdelen vragen nog connectorbouw of tenantconfiguratie voordat deze service echt live-ready is.`,
          action: { type: 'tenant_onboarding', label: 'Configureren' },
        });
        return;
      }

      if (summary.snapshot_only > 0 && liveReady === 0) {
        recommendations.push({
          kind: 'warn',
          label: `${serviceLabel} van snapshot naar live`,
          detail: 'Deze service steunt nu nog volledig op assessment/snapshotdata. Plan connectorvalidatie of live-koppeling als volgende stap.',
          action: { type: 'guardian_sync', label: 'Guardian sync' },
        });
        return;
      }

      if (String(item.status || '') !== 'ready' && liveReady > 0) {
        recommendations.push({
          kind: 'info',
          label: `${serviceLabel} onboarding afronden`,
          detail: `Technische capabilities zijn al deels beschikbaar (${liveReady}/${summary.total} live-ready), maar de service staat nog niet als gereed gemarkeerd.`,
          action: { type: 'customer_services', label: 'Services beheren' },
        });
        return;
      }

      if (String(item.status || '') === 'ready' && summary.snapshot_only > 0) {
        recommendations.push({
          kind: 'warn',
          label: `${serviceLabel} verdiepen`,
          detail: 'De service is onboarded, maar een deel draait nog snapshot-only. Werk live-validatie of aanvullende connectoren bij.',
          action: { type: 'tenant_refresh', label: 'Tenant refresh' },
        });
      }
    });

    customerServiceOptions.forEach((serviceKey) => {
      if (enabledKeys.has(serviceKey)) return;
      const summary = summarizeServiceCapabilities(serviceKey, capabilityData);
      const liveReady = summary.ready + summary.validation_required;
      if (!summary.total || liveReady === 0) return;
      recommendations.push({
        kind: 'info',
        label: `${formatServiceLabel(serviceKey)} overwegen`,
        detail: `Deze tenant heeft al ${liveReady}/${summary.total} relevante capability-onderdelen voor ${formatServiceLabel(serviceKey)}, maar de service is nog niet gekoppeld aan de klant.`,
        action: { type: 'customer_services', label: 'Service koppelen', service_key: serviceKey },
      });
    });

    const deduped = [];
    const seen = new Set();
    recommendations.forEach((item) => {
      const key = `${item.label}::${item.detail}`;
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(item);
    });
    return deduped.slice(0, 6);
  }

  function renderTrendSparkline(points) {
    const values = (Array.isArray(points) ? points : []).map((item) => Number(item?.score || 0));
    if (!values.length) return '<span style="color:var(--text-muted,#6b7280);font-size:.82rem;">Nog geen trenddata beschikbaar.</span>';
    const w = 460;
    const h = 64;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    const coords = values.map((value, idx) => {
      const x = values.length === 1 ? 0 : (idx / (values.length - 1)) * w;
      const y = h - ((value - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const latest = values[values.length - 1];
    const previous = values.length > 1 ? values[values.length - 2] : latest;
    const delta = latest - previous;
    const tone = delta < 0 ? '#b91c1c' : delta > 0 ? '#166534' : '#475569';
    const symbol = delta < 0 ? '▼' : delta > 0 ? '▲' : '•';
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;flex-wrap:wrap;">
        <div>
          <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted,#6b7280);">Statustrend (30 dagen)</div>
          <div style="font-size:1.2rem;font-weight:800;color:var(--text-primary,#0f172a);">${latest}% <span style="font-size:.78rem;color:${tone};font-weight:700;">${symbol} ${delta >= 0 ? '+' : ''}${Math.round(delta)}%</span></div>
        </div>
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="68" style="max-width:540px;display:block;">
          <polyline fill="none" stroke="#94a3b8" stroke-width="2" points="${coords}" opacity=".45"></polyline>
          <polyline fill="none" stroke="#2563eb" stroke-width="2.6" points="${coords}"></polyline>
        </svg>
      </div>
    `;
  }

  function renderManagementInsights(items) {
    const root = document.getElementById('kbhInsightCards');
    if (!root) return;
    if (!items.length) {
      root.innerHTML = '';
      return;
    }
    const costOutliers = items.filter((c) => Number(c.finance_summary?.service_gap || 0) > 0).length;
    const staleCosts = items.filter((c) => Number(c.finance_summary?.stale_cost_snapshots || 0) > 0).length;
    const criticalTenants = items.reduce((sum, c) => sum + Number(c.health_summary?.tenants_with_critical || 0), 0);
    const onboardingRisk = items.filter((c) => Number(c.onboarding_summary?.avg_completion_pct || 0) < 60).length;
    const cards = [
      { label: 'Kritieke security signalen', value: criticalTenants, hint: 'Tenants met kritieke bevindingen', tone: criticalTenants > 0 ? ['#fef2f2', '#b91c1c'] : ['#ecfdf5', '#166534'] },
      { label: 'Kostenafwijkingen', value: costOutliers, hint: 'Klanten met service gap > 0', tone: costOutliers > 0 ? ['#fff7ed', '#9a3412'] : ['#ecfdf5', '#166534'] },
      { label: 'Verouderde kostendata', value: staleCosts, hint: 'Snapshots buiten recency-window', tone: staleCosts > 0 ? ['#fefce8', '#854d0e'] : ['#ecfdf5', '#166534'] },
      { label: 'Onboarding risico', value: onboardingRisk, hint: 'Klanten onder 60% readiness', tone: onboardingRisk > 0 ? ['#eff6ff', '#1d4ed8'] : ['#ecfdf5', '#166534'] },
    ];
    root.innerHTML = cards.map((card) => `
      <article style="padding:.75rem .9rem;border-radius:12px;border:1px solid var(--border-color,#e5e7eb);background:${card.tone[0]};color:${card.tone[1]};">
        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;font-weight:700;opacity:.9;">${global.escapeHtml(card.label)}</div>
        <div style="font-size:1.35rem;font-weight:800;line-height:1.2;margin-top:.2rem;">${global.escapeHtml(String(card.value))}</div>
        <div style="font-size:.74rem;opacity:.85;margin-top:.1rem;">${global.escapeHtml(card.hint)}</div>
      </article>
    `).join('');
  }

  function renderCustomerMixTiles(items) {
    const root = document.getElementById('kbhCustomerTiles');
    if (!root) return;
    if (!items.length) {
      root.innerHTML = '';
      return;
    }
    root.innerHTML = items.slice(0, 8).map((customer) => {
      const servicesReady = Number(customer.onboarding_summary?.ready_services || 0);
      const servicesTotal = Number(customer.onboarding_summary?.enabled_services || 0);
      const azureSubs = Number(customer.finance_summary?.subscription_count || 0);
      const cost = Number(customer.finance_summary?.latest_total_cost || 0);
      const mixScore = Math.min(100, Math.round(((servicesReady * 12) + (azureSubs * 10))));
      const mixTone = mixScore >= 70 ? '#166534' : mixScore >= 40 ? '#9a3412' : '#1d4ed8';
      return `
        <article style="padding:.8rem .9rem;border-radius:12px;border:1px solid var(--border-color,#e5e7eb);background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 100%);">
          <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:flex-start;">
            <strong style="font-size:.9rem;color:var(--text-primary,#0f172a);">${global.escapeHtml(customer.name || 'Klant')}</strong>
            <span style="font-size:.72rem;padding:.15rem .45rem;border-radius:999px;background:#fff;color:${mixTone};font-weight:700;">Mix ${mixScore}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.35rem;margin-top:.55rem;font-size:.76rem;color:var(--text-secondary,#475569);">
            <span>M365 ready</span><strong style="text-align:right;color:#0f172a;">${servicesReady}/${servicesTotal}</strong>
            <span>Azure subs</span><strong style="text-align:right;color:#0f172a;">${azureSubs}</strong>
            <span>Kosten</span><strong style="text-align:right;color:#0f172a;">€ ${cost.toFixed(0)}</strong>
            <span>Gereedheid</span><strong style="text-align:right;color:#0f172a;">${global.escapeHtml(String(customer.onboarding_summary?.avg_completion_pct || 0))}%</strong>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderOverviewWidgets(items) {
    const trendRoot = document.getElementById('kbhTrendPanel');
    if (trendRoot) {
      const bucket = new Map();
      items.forEach((customer) => {
        const series = Array.isArray(customer.trend_30d) ? customer.trend_30d : [];
        series.forEach((point) => {
          const key = String(point.date || '');
          if (!key) return;
          const row = bucket.get(key) || { sum: 0, count: 0 };
          row.sum += Number(point.score || 0);
          row.count += 1;
          bucket.set(key, row);
        });
      });
      const points = Array.from(bucket.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, row]) => ({ date, score: Math.round(row.sum / Math.max(1, row.count)) }));
      trendRoot.innerHTML = renderTrendSparkline(points);
    }
    renderManagementInsights(items);
    renderCustomerMixTiles(items);
  }

  function applyKlantenView(items) {
    renderKlantTable(items);
    renderOverviewWidgets(items);
  }

  async function fetchOverviewsWithLimit(items, concurrency = 8) {
    const queue = Array.isArray(items) ? items.slice() : [];
    const out = [];
    const workers = Array.from({ length: Math.max(1, Number(concurrency) || 1) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;
        try {
          const overview = await global.apiFetchCached(`/api/customers/${item.id}/overview`, {}, global.CACHE_TTL.medium);
          out.push([item.id, overview]);
        } catch (_) {
          out.push([item.id, { finance: { summary: {} }, signals: { avg_trend_30d: [] } }]);
        }
      }
    });
    await Promise.all(workers);
    return new Map(out);
  }

  function renderKlantTable(items) {
    const tbody = document.getElementById('kbhTableBody');
    if (!tbody) return;
    const paging = global.paginateCollection ? global.paginateCollection('kbhCustomers', items, 25) : { items, total: items.length };
    const pageItems = paging.items || items;
    if (!items.length) {
      tbody.innerHTML = '<tr class="u-table-loading-row"><td colspan="11">Geen klanten gevonden.</td></tr>';
      global.renderCollectionPager?.({ key: 'kbhCustomers', anchor: tbody, total: 0, pageSize: 25, onChange: () => renderKlantTable(items), label: 'klanten' });
      return;
    }
    tbody.innerHTML = pageItems.map((c) => `
      <tr data-klant-id="${global.escapeHtml(c.id)}">
        <td><strong>${global.escapeHtml(c.name || '-')}</strong></td>
        <td><span class="roles-status-pill ${c.status === 'active' ? 'roles-status-pill--active' : 'roles-status-pill--inactive'}">${global.escapeHtml(c.status || '-')}</span></td>
        <td>
          ${c.health_summary?.avg_score != null ? `<span style="font-weight:700;color:${Number(c.health_summary.avg_score) < 60 ? '#b91c1c' : Number(c.health_summary.avg_score) < 85 ? '#b45309' : '#166534'};">${global.escapeHtml(String(c.health_summary.avg_score))}%</span>` : '<span style="color:var(--text-muted,#6b7280);">—</span>'}
          ${c.trend_30d?.length ? `<div style="font-size:.7rem;color:var(--text-muted,#6b7280);margin-top:.15rem;">Trend 30d: ${global.escapeHtml(String(c.trend_30d[c.trend_30d.length - 1]?.score ?? '—'))}%</div>` : ''}
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:.45rem;">
            <div style="width:52px;height:6px;border-radius:999px;background:#e5e7eb;overflow:hidden;">
              <div style="height:100%;width:${global.escapeHtml(String(c.onboarding_summary?.avg_completion_pct || 0))}%;background:${(c.onboarding_summary?.avg_completion_pct || 0) >= 75 ? '#16a34a' : '#f97316'};"></div>
            </div>
            <span style="font-size:.78rem;color:var(--text-secondary,#475569);">${global.escapeHtml(String(c.onboarding_summary?.avg_completion_pct || 0))}%</span>
          </div>
        </td>
        <td>
          <div style="display:flex;flex-direction:column;gap:.15rem;">
            <strong style="font-size:.78rem;">${global.escapeHtml(c.service_tier || '—')}</strong>
            <span style="font-size:.72rem;color:var(--text-muted,#6b7280);">${global.escapeHtml(c.sla_name || 'Geen SLA')}</span>
          </div>
        </td>
        <td>${c.tenant_count ?? '-'}</td>
        <td>${c.service_count ?? '—'}</td>
        <td>${global.escapeHtml(String(c.onboarding_summary?.ready_services || 0))}/${global.escapeHtml(String(c.onboarding_summary?.enabled_services || 0))}</td>
        <td>
          <div style="display:flex;flex-direction:column;gap:.15rem;">
            <strong style="font-size:.78rem;">€ ${Number(c.finance_summary?.latest_total_cost || 0).toFixed(2)}</strong>
            <span style="font-size:.72rem;color:var(--text-muted,#6b7280);">${global.escapeHtml(String(c.finance_summary?.subscription_count || 0))} abonnementen</span>
          </div>
        </td>
        <td>${global.escapeHtml(c.primary_contact_name || '-')}</td>
        <td class="customers-actions-cell">
          <button type="button" class="btn btn-secondary u-btn-xs" data-action="viewCustomer" data-id="${global.escapeHtml(c.id)}">Details</button>
          <button type="button" class="btn btn-secondary u-btn-xs" data-action="editCustomer" data-id="${global.escapeHtml(c.id)}">Bewerken</button>
        </td>
      </tr>
    `).join('');
    global.bindActions?.(tbody);
    global.renderCollectionPager?.({ key: 'kbhCustomers', anchor: tbody, total: items.length, pageSize: 25, onChange: () => renderKlantTable(items), label: 'klanten' });
  }

  async function loadKlantenbeheer() {
    const loadSeq = ++klantenLoadSeq;
    const tbody = document.getElementById('kbhTableBody');
    const summary = document.getElementById('kbhSummary');
    if (tbody) tbody.innerHTML = '<tr class="u-table-loading-row"><td colspan="11">Laden…</td></tr>';
    try {
      const data = await global.apiFetchCached('/api/customers', {}, global.CACHE_TTL.customers);
      const items = (data && data.items) || [];

      // Render direct met basisdata voor snellere first paint.
      klantenCache = items.map((item) => ({
        ...item,
        finance_summary: {},
        trend_30d: [],
      }));
      global.resetCollectionPager?.('kbhCustomers');
      applyKlantenView(klantenCache);

      const overviewMap = await fetchOverviewsWithLimit(items, 8);
      if (loadSeq !== klantenLoadSeq) return;

      klantenCache = items.map((item) => ({
        ...item,
        finance_summary: overviewMap.get(item.id)?.finance?.summary || {},
        trend_30d: overviewMap.get(item.id)?.signals?.avg_trend_30d || [],
      }));

      applyKlantenView(klantenCache);
      if (summary) {
        const active = klantenCache.filter((c) => c.status === 'active').length;
        const ready = klantenCache.reduce((sum, c) => sum + Number(c.onboarding_summary?.ready_count || 0), 0);
        const readyServices = klantenCache.reduce((sum, c) => sum + Number(c.onboarding_summary?.ready_services || 0), 0);
        const enabledServices = klantenCache.reduce((sum, c) => sum + Number(c.onboarding_summary?.enabled_services || 0), 0);
        const critical = klantenCache.reduce((sum, c) => sum + Number(c.health_summary?.tenants_with_critical || 0), 0);
        const totalCost = klantenCache.reduce((sum, c) => sum + Number(c.finance_summary?.latest_total_cost || 0), 0);
        summary.innerHTML = `
          <span style="padding:.25rem .7rem;border-radius:999px;background:#dcfce7;color:#166534;font-size:.8rem;font-weight:600;">${active} actief</span>
          <span style="padding:.25rem .7rem;border-radius:999px;background:#f3f4f6;color:#374151;font-size:.8rem;">${klantenCache.length} totaal</span>
          <span style="padding:.25rem .7rem;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:.8rem;">${ready} tenants gereed</span>
          <span style="padding:.25rem .7rem;border-radius:999px;background:#f8fafc;color:#475569;font-size:.8rem;">${readyServices}/${enabledServices} diensten gekoppeld</span>
          <span style="padding:.25rem .7rem;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:.8rem;">€ ${totalCost.toFixed(2)} laatste kosten</span>
          ${critical > 0 ? `<span style="padding:.25rem .7rem;border-radius:999px;background:#fef2f2;color:#b91c1c;font-size:.8rem;font-weight:600;">${critical} kritieke tenants</span>` : ''}
        `;
      }
      klantenOverviewMap = overviewMap;
    } catch (e) {
      if (loadSeq !== klantenLoadSeq) return;
      if (tbody) tbody.innerHTML = `<tr class="u-table-loading-row"><td colspan="11" class="roles-error-text">Fout bij laden klanten: ${global.escapeHtml(String(e))}</td></tr>`;
    }
  }

  function filterKlantTable(query) {
    const q = (query || '').toLowerCase();
    const filtered = q ? klantenCache.filter((c) => (c.name || '').toLowerCase().includes(q)) : klantenCache;
    global.resetCollectionPager?.('kbhCustomers');
    applyKlantenView(filtered);
  }

  global.DenjoyMspCustomersView = {
    customerServiceOptions,
    formatServiceLabel,
    summarizeServiceCapabilities,
    renderServiceCapabilityPill,
    buildTenantCapabilityRecommendations,
    renderTrendSparkline,
    loadKlantenbeheer,
    filterKlantTable,
    getKlantenOverviewMap: () => new Map(klantenOverviewMap),
    getKlantenCache: () => klantenCache.slice(),
  };

  global.loadKlantenbeheer = loadKlantenbeheer;
})(window);
