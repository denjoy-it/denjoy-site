(function (global) {
  'use strict';

  function getCurrentSection() {
    if (typeof global._getCurrentSection === 'function') {
      return global._getCurrentSection() || global._currentSection || 'overview';
    }
    return global._currentSection || 'overview';
  }

  async function callOptionalAsync(handler, ...args) {
    if (typeof handler !== 'function') return;
    await handler(...args);
  }

  function getInitials(name) {
    if (!name || name === 'Lokaal') return 'LK';
    const parts = name.trim().split(/\s+/);
    return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.substring(0, 2)).toUpperCase();
  }

  function getTenantHealthClass(score) {
    if (score == null) return 'unknown';
    if (score >= 85) return 'good';
    if (score >= 60) return 'warning';
    return 'critical';
  }

  function formatTenantRelativeDate(iso) {
    if (!iso) return 'Nog niet gescand';
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const days = Math.floor(diff / 86400000);
      if (days <= 0) return 'Vandaag gescand';
      if (days === 1) return 'Gisteren gescand';
      if (days < 30) return `Laatste scan: ${days} dagen geleden`;
      const months = Math.floor(days / 30);
      return `Laatste scan: ${months} maand${months > 1 ? 'en' : ''} geleden`;
    } catch (_) {
      return `Laatste scan: ${String(iso).slice(0, 10)}`;
    }
  }

  function renderTenantPillCard(tenant, selectedId) {
    const run = tenant.latest_run || {};
    const ops = tenant.ops_summary || {};
    const onboarding = ops.onboarding || {};
    const jobs = ops.job_summary || {};
    const score = run.score_overall ?? null;
    const scoreTone = getTenantHealthClass(score);
    const critical = Number(run.critical_count || 0);
    const warning = Number(run.warning_count || 0);
    const scoreLabel = score != null ? String(score) : '—';
    const selected = tenant.id === selectedId;

    return `
      <article class="tenant-pill-card${selected ? ' is-selected' : ''}" data-tenant-card="${global.escapeHtml(tenant.id)}">
        <div class="tenant-pill-card-head">
          <div class="tenant-pill-card-copy">
            <strong class="tenant-pill-card-name">${global.escapeHtml(tenant.customer_name || tenant.tenant_name || 'Tenant')}</strong>
            <span class="tenant-pill-card-sub">${global.escapeHtml(tenant.tenant_name || tenant.customer_name || tenant.id || '')}</span>
          </div>
          <div class="tenant-pill-card-score is-${scoreTone}">
            <span>${global.escapeHtml(scoreLabel)}</span>
            <small>score</small>
          </div>
        </div>
        <div class="tenant-pill-card-signals">
          ${critical > 0 ? `<span class="tenant-pill-chip is-critical">${critical} kritiek</span>` : ''}
          ${warning > 0 ? `<span class="tenant-pill-chip is-warning">${warning} waarschuwingen</span>` : ''}
          <span class="tenant-pill-chip">Gereedheid ${global.escapeHtml(String(onboarding.completion_pct ?? 0))}%</span>
          <span class="tenant-pill-chip">Jobs ${global.escapeHtml(String((jobs.pending || 0) + (jobs.running || 0) + (jobs.failed || 0)))}</span>
        </div>
        <div class="tenant-pill-card-meta">${global.escapeHtml(formatTenantRelativeDate(run.completed_at || run.started_at))}</div>
        <div class="tenant-pill-card-actions">
          <button type="button" class="tenant-pill-action tenant-pill-action--primary" data-tenant-pill-action="open" data-id="${global.escapeHtml(tenant.id)}">Open</button>
          <button type="button" class="tenant-pill-action" data-tenant-pill-action="refresh" data-id="${global.escapeHtml(tenant.id)}">Refresh</button>
          <button type="button" class="tenant-pill-action" data-tenant-pill-action="scan" data-id="${global.escapeHtml(tenant.id)}">Scan</button>
        </div>
      </article>
    `;
  }

  function updateTenantPill(tenants, selectedId) {
    const nameEl = document.getElementById('tenantPillName');
    const dropdown = document.getElementById('tenantPillDropdown');
    const pill = document.getElementById('tenantPill');
    if (!nameEl || !dropdown || !pill) return;

    const selected = tenants.find((tenant) => tenant.id === selectedId);
    nameEl.textContent = selected ? (selected.customer_name || selected.tenant_name) : 'Geen tenant';
    // Zet altijd data-tenant-id attribuut op de pill
    if (selected && selected.id) {
      pill.setAttribute('data-tenant-id', selected.id);
    } else {
      pill.removeAttribute('data-tenant-id');
    }

    dropdown.innerHTML = tenants.length
      ? `
        <div class="tenant-pill-dropdown-shell">
          <div class="tenant-pill-dropdown-head">
            <strong>Tenants</strong>
            <span>${global.escapeHtml(String(tenants.length))} beschikbaar</span>
          </div>
          <div class="tenant-pill-card-list">
            ${tenants.map((tenant) => renderTenantPillCard(tenant, selectedId)).join('')}
          </div>
        </div>
      `
      : '<div class="tenant-dd-empty">Geen tenants</div>';

    updateSidebarTenantArea(tenants, selectedId);
  }

  /* ── Sidebar tenant-area bijwerken ── */
  function updateSidebarTenantArea(tenants, selectedId) {
    const area  = document.getElementById('sbTenantArea');
    const dot   = document.getElementById('sbTenantDot');
    const name  = document.getElementById('sbTenantName');
    const score = document.getElementById('sbTenantScore');
    if (!area) return;

    if (!tenants.length) { area.style.display = 'none'; return; }
    area.style.display = '';

    const selected = tenants.find((t) => t.id === selectedId);
    const tenantName = selected
      ? (selected.customer_name || selected.tenant_name || 'Tenant')
      : (tenants.length === 1 ? (tenants[0].customer_name || tenants[0].tenant_name) : 'Selecteer tenant');

    if (name) name.textContent = tenantName;

    // Dot kleur op basis van health-score
    const s = selected?.latest_run?.score_overall ?? null;
    const cls = s == null ? 'is-unknown' : s >= 85 ? 'is-good' : s >= 60 ? 'is-warning' : 'is-critical';
    if (dot) dot.className = `sb-tenant-dot ${cls}`;

    // Score sub-tekst
    if (score) {
      if (s != null) {
        score.textContent = `Score: ${s} · ${tenants.length} tenants`;
      } else if (tenants.length > 1) {
        score.textContent = `${tenants.length} tenants beschikbaar`;
      } else {
        score.textContent = 'Klik om te wisselen';
      }
    }
  }

  /* ── Sidebar tenant-knop koppelen aan dropdown ── */
  function setupSidebarTenantBtn() {
    const sbBtn   = document.getElementById('sbTenantBtn');
    const dropdown = document.getElementById('tenantPillDropdown');
    if (!sbBtn || !dropdown) return;
    // Voorkom dubbele listeners
    if (sbBtn.dataset.sbSetup === '1') return;
    sbBtn.dataset.sbSetup = '1';

    // Klik op knop — openen/sluiten
    sbBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sbBtn.getAttribute('aria-expanded') === 'true';
      if (isOpen) {
        dropdown.style.display = 'none';
        sbBtn.setAttribute('aria-expanded', 'false');
        return;
      }
      // Positioneer dropdown vast onder de sidebar-knop
      const rect = sbBtn.getBoundingClientRect();
      dropdown.style.position = 'fixed';
      dropdown.style.top      = `${rect.bottom + 6}px`;
      dropdown.style.left     = `${rect.left}px`;
      dropdown.style.right    = 'auto';
      dropdown.style.bottom   = 'auto';
      dropdown.style.zIndex   = '500';
      dropdown.style.display  = '';
      sbBtn.setAttribute('aria-expanded', 'true');
    });

    // Klik BINNEN dropdown mag niet sluiten via document-handler
    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  async function refreshTenantPillData() {
    try {
      const dropdown = document.getElementById('tenantPillDropdown');
      if (dropdown) {
        dropdown.innerHTML = '<div class="tenant-dd-empty">Tenantstatus wordt vernieuwd...</div>';
      }
      global.cacheClear?.('/api/tenants');
      const tenants = await callOptionalAsync(global.loadTenants);
      return Array.isArray(tenants) ? tenants : (global.allTenants || []);
    } catch (error) {
      global.showToast?.(`Tenantlijst verversen mislukt: ${error?.message || error}`, 'warning');
      return global.allTenants || [];
    }
  }

  function updateHeroVisibility() {
    const hero = document.getElementById('portalHero');
    if (hero) hero.style.display = 'none';
  }

  async function selectTenantFromPill(tenantId, options = {}) {
    const skipRefresh = !!options.skipRefresh;
    const dropdown = document.getElementById('tenantPillDropdown');
    if (dropdown) dropdown.style.display = 'none';
    const pill = document.getElementById('tenantPill');
    if (pill) pill.classList.remove('open');

    global._setCurrentTenantId?.(tenantId);
    global._selectedTenantFocus = null;
    localStorage.setItem('local_m365_current_tenant', tenantId);
    const select = document.getElementById('tenantSelect');
    if (select) select.value = tenantId;

    updateTenantPill(global.allTenants || [], tenantId);
    updateHeroVisibility();
    global.updateWorkspaceHeader?.(getCurrentSection());
    await callOptionalAsync(global.populateSettings);
    if (!skipRefresh) {
      await callOptionalAsync(global.refreshTenantData);
    }
    global.renderNavSignals?.();
    global.renderContextRail?.(getCurrentSection());
  }

  async function openTenantWorkspaceFromPill(tenantId, sectionName = 'overview', opts = {}) {
    await selectTenantFromPill(tenantId, { skipRefresh: true });
    await global.showSection?.(sectionName, opts);
    await callOptionalAsync(global.refreshTenantData);
    global.renderNavSignals?.();
  }

  function closeUserDropdown() {
    const dropdown = document.getElementById('portalUserDropdown');
    if (dropdown) dropdown.style.display = 'none';
  }

  function closeAllDropdowns() {
    const pillDropdown = document.getElementById('tenantPillDropdown');
    const userDropdown = document.getElementById('portalUserDropdown');
    const pill = document.getElementById('tenantPill');
    const sbBtn = document.getElementById('sbTenantBtn');
    if (pillDropdown) pillDropdown.style.display = 'none';
    if (userDropdown) userDropdown.style.display = 'none';
    if (pill) pill.classList.remove('open');
    if (sbBtn) sbBtn.setAttribute('aria-expanded', 'false');
    document.querySelectorAll('.nav-dropdown.open').forEach((dropdown) => {
      if (!dropdown.classList.contains('has-active')) global.setDropdownOpen?.(dropdown, false);
    });
  }

  function setupHeaderActions() {
    const refreshBtn = document.getElementById('logoutButton');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        void callOptionalAsync(global.refreshTenantData);
      });
    }

    const tenantSelect = document.getElementById('tenantSelect');
    if (tenantSelect) {
      tenantSelect.addEventListener('change', async (event) => {
        const tenantId = event.target.value || null;
        global._setCurrentTenantId?.(tenantId);
        global._selectedTenantFocus = null;
        if (tenantId) localStorage.setItem('local_m365_current_tenant', tenantId);
        updateTenantPill(global.allTenants || [], tenantId);
        updateHeroVisibility();
        await callOptionalAsync(global.populateSettings);
        await callOptionalAsync(global.refreshTenantData);
        global.renderContextRail?.(getCurrentSection());
      });
    }

    const pill = document.getElementById('tenantPill');
    const pillDropdown = document.getElementById('tenantPillDropdown');
    if (pill && pillDropdown) {
      pill.addEventListener('click', async (event) => {
        event.stopPropagation();
        const isOpen = pillDropdown.style.display !== 'none';
        if (isOpen) {
          pillDropdown.style.display = 'none';
          pill.classList.remove('open');
          return;
        }
        pillDropdown.style.display = 'block';
        pill.classList.add('open');
        closeUserDropdown();
        await refreshTenantPillData();
      });
      pill.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          pill.click();
        }
      });
      pillDropdown.addEventListener('click', async (event) => {
        event.stopPropagation();
        const button = event.target.closest('[data-tenant-pill-action]');
        if (!button) return;
        const tenantId = button.dataset.id || '';
        const action = button.dataset.tenantPillAction || 'open';
        if (!tenantId) return;
        if (action === 'open') {
          await openTenantWorkspaceFromPill(tenantId, 'overview');
          return;
        }
        if (action === 'refresh') {
          try {
            await global.apiFetch?.('/api/jobs', {
              method: 'POST',
              body: JSON.stringify({ job_type: 'tenant_refresh', tenant_id: tenantId, payload: {} }),
            });
            global.showToast?.('Tenant refresh ingepland.', 'success');
            await refreshTenantPillData();
            await callOptionalAsync(global.loadTenantHealthDashboard);
          } catch (error) {
            global.showToast?.(`Fout bij refresh: ${error?.message || error}`, 'error');
          }
          return;
        }
        if (action === 'scan') {
          await openTenantWorkspaceFromPill(tenantId, 'assessment');
        }
      });
    }

    const avatarBtn = document.getElementById('userAvatarBtn');
    const userDropdown = document.getElementById('portalUserDropdown');
    if (avatarBtn && userDropdown) {
      avatarBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = userDropdown.style.display !== 'none';
        userDropdown.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) {
          if (pillDropdown) pillDropdown.style.display = 'none';
          if (pill) pill.classList.remove('open');
        }
      });
    }

    const signoutBtn = document.getElementById('signoutBtn');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', async () => {
        localStorage.removeItem('local_m365_current_tenant');
        try {
          await global.apiFetch('/api/auth/logout', { method: 'POST' });
        } catch (_) {}
        global.location.href = '/login.html';
      });
    }

    document.addEventListener('click', closeAllDropdowns);
    setupSidebarTenantBtn();

    const contextToggle = document.getElementById('portalContextToggle');
    const contextClose = document.getElementById('portalContextClose');
    if (contextToggle) {
      contextToggle.addEventListener('click', () => global._setContextRailOpen?.(!global._getContextRailOpen?.()));
    }
    if (contextClose) {
      contextClose.addEventListener('click', () => global._setContextRailOpen?.(false));
    }

    document.addEventListener('click', (event) => {
      if (!global._getContextRailOpen?.()) return;
      if (Date.now() - Number(global._contextRailLastOpenedAt || 0) < 250) return;
      const rail = document.getElementById('portalContextRail');
      if (!rail) return;
      const insideRail = rail.contains(event.target);
      const togglePressed = contextToggle?.contains(event.target);
      if (insideRail || togglePressed) return;
      global._setContextRailOpen?.(false, { skipPersist: true });
    });
  }

  const api = {
    getInitials,
    updateTenantPill,
    updateSidebarTenantArea,
    updateHeroVisibility,
    selectTenantFromPill,
    setupHeaderActions,
    setupSidebarTenantBtn,
    closeUserDropdown,
    closeAllDropdowns,
  };

  global.DenjoyMspHeaderUi = api;
  global.getInitials = getInitials;
  global.updateTenantPill = updateTenantPill;
  global.updateSidebarTenantArea = updateSidebarTenantArea;
  global.updateHeroVisibility = updateHeroVisibility;
  global.selectTenantFromPill = selectTenantFromPill;
  global.setupHeaderActions = setupHeaderActions;
  global.setupSidebarTenantBtn = setupSidebarTenantBtn;
  global.closeUserDropdown = closeUserDropdown;
  global.closeAllDropdowns = closeAllDropdowns;
})(window);
