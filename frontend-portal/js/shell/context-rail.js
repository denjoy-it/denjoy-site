(function initDenjoyShellContextRail(global) {
  function esc(value) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(value == null ? '' : String(value));
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeTone(tone) {
    const value = String(tone || 'info').toLowerCase();
    if (value === 'good' || value === 'ok' || value === 'success') return 'good';
    if (value === 'error' || value === 'critical' || value === 'risk' || value === 'urgent' || value === 'crit') return 'error';
    if (value === 'muted' || value === 'neutral' || value === 'info') return 'neutral';
    return 'warn';
  }

  function toneLabel(tone) {
    const normalized = normalizeTone(tone);
    if (normalized === 'good') return 'Goed';
    if (normalized === 'error') return 'Fout';
    if (normalized === 'warn') return 'Let op';
    return 'Info';
  }

  function renderSideRailTemplate(options = {}) {
    const summaryCards = Array.isArray(options.summaryCards) ? options.summaryCards : [];
    const sections = Array.isArray(options.sections) ? options.sections : [];
    const findings = Array.isArray(options.findings) ? options.findings : [];
    const actions = Array.isArray(options.actions) ? options.actions : [];
    const notes = Array.isArray(options.notes) ? options.notes : [];
    const topTone = normalizeTone(options.tone || 'neutral');
    const topBadge = options.statusLabel || toneLabel(topTone);

    const summaryHtml = summaryCards.length ? `
      <div class="dp-summary-grid">
        ${summaryCards.map((item) => `
          <article class="dp-stat-card dp-stat-card--${normalizeTone(item.tone)}">
            <span>${esc(item.label || 'Waarde')}</span>
            <strong>${esc(item.value == null ? '—' : item.value)}</strong>
            ${item.meta ? `<small>${esc(item.meta)}</small>` : ''}
          </article>
        `).join('')}
      </div>` : '';

    const sectionsHtml = sections.map((section) => `
      <section class="dp-section">
        <div class="dp-section-head">
          <h5>${esc(section.title || 'Details')}</h5>
          ${section.badge ? `<span class="dp-inline-status dp-inline-status--${normalizeTone(section.tone)}">${esc(section.badge)}</span>` : ''}
        </div>
        ${section.bodyHtml ? section.bodyHtml : section.body ? `<p>${esc(section.body)}</p>` : '<p class="live-module-empty">Geen aanvullende details.</p>'}
      </section>
    `).join('');

    const findingsHtml = findings.length ? `
      <section class="dp-section">
        <div class="dp-section-head">
          <h5>Bevindingen</h5>
        </div>
        <div class="dp-findings">
          ${findings.map((item) => `
            <article class="dp-finding dp-finding--${normalizeTone(item.tone)}">
              <div class="dp-finding-top">
                <span class="dp-inline-status dp-inline-status--${normalizeTone(item.tone)}">${esc(item.label || toneLabel(item.tone))}</span>
                ${item.meta ? `<span class="dp-finding-meta">${esc(item.meta)}</span>` : ''}
              </div>
              <strong>${esc(item.title || 'Bevinding')}</strong>
              ${item.body ? `<p>${esc(item.body)}</p>` : ''}
            </article>
          `).join('')}
        </div>
      </section>` : '';

    const actionsHtml = actions.length ? `
      <section class="dp-action-card">
        <div class="dp-section-head">
          <h5>${esc(options.actionTitle || 'Aanbevolen actie')}</h5>
          <span class="dp-inline-status dp-inline-status--${topTone}">${esc(topBadge)}</span>
        </div>
        ${actions.map((item) => `
          <div class="dp-action-row">
            <div>
              <strong>${esc(item.title || 'Actie')}</strong>
              ${item.body ? `<p>${esc(item.body)}</p>` : ''}
            </div>
            ${item.actionHtml || ''}
          </div>
        `).join('')}
      </section>` : '';

    const notesHtml = notes.map((note) => `
      <div class="dp-note dp-note--${normalizeTone(note.tone)}">${esc(note.body || '')}</div>
    `).join('');

    return `
      <div class="dp-content-shell">
        ${summaryHtml}
        ${sectionsHtml}
        ${findingsHtml}
        ${actionsHtml}
        ${notesHtml}
      </div>
    `;
  }

  function getRailElements() {
    return {
      rail: document.getElementById('portalContextRail'),
      contentArea: document.querySelector('.content-area'),
      toggle: document.getElementById('portalContextToggle'),
      close: document.getElementById('portalContextClose'),
      title: document.getElementById('portalContextTitle'),
      content: document.getElementById('portalContextContent'),
    };
  }

  function getContextRailOpen() {
    return !!global._contextRailOpen;
  }

  function syncContextRailUi(isOpen) {
    const { rail, contentArea, toggle, close, title } = getRailElements();
    if (rail) {
      rail.classList.toggle('open', !!isOpen);
      rail.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      rail.setAttribute('aria-label', isOpen ? `Meer informatie en details${title?.textContent ? `: ${title.textContent}` : ''}` : 'Meer informatie en details');
    }
    if (contentArea) contentArea.classList.toggle('with-context-rail', !!isOpen);
    if (toggle) {
      toggle.classList.toggle('is-open', !!isOpen);
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      toggle.textContent = isOpen ? 'Sluit informatie' : 'Meer informatie';
      toggle.setAttribute('aria-label', isOpen ? 'Sluit extra informatie' : 'Open extra informatie');
    }
    if (close) close.hidden = !isOpen;
  }

  function setContextRailOpen(isOpen, options = {}) {
    const next = !!isOpen;
    const { rail, contentArea } = getRailElements();
    global._contextRailOpen = next;
    if (!next) {
      rail?.classList.remove('portal-context-rail--detail');
      contentArea?.classList.remove('detail-rail-open');
    }
    syncContextRailUi(next);
    return next;
  }

  function renderContextRail(sectionName = global._currentSection || 'overview') {
    const { rail, contentArea, title: titleEl, content: contentEl } = getRailElements();
    if (!titleEl || !contentEl) return;
    rail?.classList.remove('portal-context-rail--detail');
    contentArea?.classList.remove('detail-rail-open');
    titleEl.textContent = `Meer informatie: ${global.SECTION_META?.[sectionName]?.title || 'Inzichten'}`;
    const entries = typeof global.getContextEntries === 'function' ? global.getContextEntries(sectionName) : [];
    const introHtml = `
      <section class="portal-context-intro">
        <p class="portal-context-intro-title">Extra toelichting en samenvatting</p>
        <p class="portal-context-intro-copy">Open dit paneel alleen wanneer u meer uitleg, aandachtspunten of detailinformatie nodig heeft bij de huidige pagina.</p>
        <ul class="portal-context-intro-list">
          <li>Samenvattingen en aandachtspunten per pagina</li>
          <li>Waarschuwingen, aanbevelingen en vervolgstappen</li>
          <li>Detailinformatie zodra u op een knop of kaart klikt</li>
        </ul>
      </section>
    `;
    const cardsHtml = entries.length ? entries.map((item) => `
      <article class="portal-context-card portal-context-card--${global.escapeHtml(item.tone || 'info')}">
        <div class="portal-context-card-top">
          <span class="portal-context-pill">${global.escapeHtml((item.tone || 'info').toUpperCase())}</span>
          ${item.badge != null ? `<span class="portal-context-count">${global.escapeHtml(item.badge)}</span>` : ''}
        </div>
        <h4>${global.escapeHtml(item.title || 'Notitie')}</h4>
        <p>${global.escapeHtml(item.body || '')}</p>
        ${item.actionHtml || ''}
      </article>
    `).join('') : `
      <article class="portal-context-card portal-context-card--empty">
        <h4>Geen extra kaarten voor deze pagina</h4>
        <p>De hoofdpagina bevat hier al de belangrijkste informatie. Open de zijbalk opnieuw zodra u op een detailknop, rapportactie of verdiepend onderdeel klikt.</p>
      </article>
    `;
    contentEl.innerHTML = introHtml + cardsHtml;
    global.bindOverviewContextButtons?.(contentEl);
    rail?.setAttribute('aria-label', `Meer informatie en details: ${titleEl.textContent}`);
  }

  function openSideRailDetail(kicker, title) {
    const { title: titleEl, content: contentEl, rail, contentArea } = getRailElements();
    if (!contentEl) return;
    const savedTitle = titleEl ? titleEl.textContent : '';
    const savedHtml = contentEl.innerHTML;
    global._contextRailLastOpenedAt = Date.now();

    if (titleEl) titleEl.textContent = title || 'Details';
    if (rail) rail.classList.add('portal-context-rail--detail');
    if (contentArea) contentArea.classList.add('detail-rail-open');

    contentEl.innerHTML = `
      <div class="dp-header">
        <span class="dp-kicker">${global.escapeHtml(kicker || 'Detail')}</span>
        <h4 class="dp-title">${global.escapeHtml(title || 'Details')}</h4>
        <button type="button" class="dp-back" id="dpBackBtn">← Terug naar inzichten</button>
      </div>
      <div class="dp-body" id="dpBody">
        <p class="live-module-empty">Laden…</p>
      </div>
    `;

    document.getElementById('dpBackBtn')?.addEventListener('click', () => {
      if (titleEl) titleEl.textContent = savedTitle;
      contentEl.innerHTML = savedHtml;
      if (rail) rail.classList.remove('portal-context-rail--detail');
      if (contentArea) contentArea.classList.remove('detail-rail-open');
      rail?.setAttribute('aria-label', `Meer informatie en details: ${savedTitle}`);
    });

    if (!global._getContextRailOpen?.()) global._setContextRailOpen?.(true);
    rail?.setAttribute('aria-label', `Meer informatie en details: ${title || 'Details'}`);
  }

  function updateSideRailDetail(title, bodyHtml) {
    const titleEl = document.getElementById('portalContextTitle');
    if (titleEl && title) titleEl.textContent = title;
    const body = document.getElementById('dpBody');
    if (body) body.innerHTML = bodyHtml || '<p class="live-module-empty">Geen data beschikbaar.</p>';
  }

  global.DenjoyShellContextRail = {
    renderContextRail,
    openSideRailDetail,
    updateSideRailDetail,
    renderSideRailTemplate,
    setContextRailOpen,
    getContextRailOpen,
  };
  global._setContextRailOpen = setContextRailOpen;
  global._getContextRailOpen = getContextRailOpen;
  global.renderContextRail = renderContextRail;
  global.openSideRailDetail = openSideRailDetail;
  global.updateSideRailDetail = updateSideRailDetail;
  global.renderSideRailTemplate = renderSideRailTemplate;
})(window);
