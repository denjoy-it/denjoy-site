(function initDenjoyMspUiFormatters(global) {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escape(value) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(value);
    return escapeHtml(value);
  }

  function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  }

  function statusBadge(status) {
    const color = {
      queued: '#667085',
      running: '#0ea5e9',
      completed: '#16a34a',
      failed: '#dc2626',
      partial: '#f59e0b',
    }[status] || '#667085';
    const label = {
      queued: 'Gepland',
      running: 'Bezig',
      completed: 'Voltooid',
      failed: 'Mislukt',
      partial: 'Gedeeltelijk',
    }[status] || status || '-';
    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${color};color:#fff;font-size:12px;font-weight:600;">${label}</span>`;
  }

  function formatPhaseList(phases) {
    if (!Array.isArray(phases) || !phases.length) return 'Alle fases';
    return phases.map((phase) => phase.replace('phase', 'F')).join(', ');
  }

  function toQuery(params) {
    const q = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value != null && value !== '') q.set(key, String(value));
    });
    const s = q.toString();
    return s ? `?${s}` : '';
  }

  function deltaText(value, reverseGood = false) {
    const n = Number(value || 0);
    const sign = n > 0 ? '+' : '';
    const className = n === 0 ? 'diff-neutral' : ((n > 0) !== reverseGood ? 'diff-bad' : 'diff-good');
    return `<span class="${className}">${sign}${n}</span>`;
  }

  function actionStatusBadge(status) {
    const colors = {
      open: '#334155',
      in_progress: '#2563eb',
      done: '#16a34a',
      accepted: '#f59e0b',
    };
    const labels = {
      open: 'Open',
      in_progress: 'In behandeling',
      done: 'Afgerond',
      accepted: 'Geaccepteerd',
    };
    const color = colors[status] || '#64748b';
    const label = labels[status] || escape(status || '-');
    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${color};color:#fff;font-size:11px;font-weight:700;">${label}</span>`;
  }

  function severityBadge(severity) {
    const colors = {
      critical: '#dc2626',
      warning: '#f59e0b',
      info: '#2563eb',
    };
    const labels = {
      critical: 'Kritiek',
      warning: 'Waarschuwing',
      info: 'Info',
    };
    const color = colors[severity] || '#64748b';
    const label = labels[severity] || escape(severity || '-');
    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${color};color:#fff;font-size:11px;font-weight:700;">${label}</span>`;
  }

  global.DenjoyMspUiFormatters = {
    escapeHtml,
    formatDate,
    statusBadge,
    formatPhaseList,
    toQuery,
    deltaText,
    actionStatusBadge,
    severityBadge,
  };

  global.escapeHtml = escapeHtml;
  global.formatDate = formatDate;
  global.statusBadge = statusBadge;
  global.formatPhaseList = formatPhaseList;
  global.toQuery = toQuery;
  global.deltaText = deltaText;
  global.actionStatusBadge = actionStatusBadge;
  global.severityBadge = severityBadge;
})(window);
