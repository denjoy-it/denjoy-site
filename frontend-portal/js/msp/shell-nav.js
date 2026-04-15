(function (global) {
  'use strict';

  function getSubnavItemMeta(item) {
    const handler = global.DenjoyShellWorkspace?.getSubnavItemMeta;
    return handler ? handler(item) : { key: '', type: 'section' };
  }

  function activateSectionSubtab(sectionName, tabKey) {
    const handler = global.DenjoyShellWorkspace?.activateSectionSubtab;
    return handler ? handler(sectionName, tabKey) : undefined;
  }

  function updateSubnav(sectionName, activeItem) {
    const handler = global.DenjoyShellWorkspace?.updateSubnav;
    return handler ? handler(sectionName, activeItem) : undefined;
  }

  function setActiveSubnavItem(key) {
    const handler = global.DenjoyShellWorkspace?.setActiveSubnavItem;
    return handler ? handler(key) : undefined;
  }

  function refreshSubnavCounts() {
    const handler = global.DenjoyShellWorkspace?.refreshSubnavCounts;
    return handler ? handler() : undefined;
  }

  function showResultsPanel(panelName) {
    document.querySelectorAll('.nb-pane[data-results-panel]').forEach((el) => {
      el.classList.toggle('active', el.dataset.resultsPanel === panelName);
    });
    document.querySelectorAll('#resultsTabbar [data-results-panel]').forEach((el) => {
      el.classList.toggle('active', el.dataset.resultsPanel === panelName);
    });
    global._currentSubItem = panelName;
    global.setActiveNav?.('results');
    setActiveSubnavItem(panelName);
    if (panelName === 'diff') global.loadRunDiffPanel?.();
    if (panelName === 'management') global.loadReportsManagementPanel?.();
    if (panelName === 'actions') global.loadActionsPanel?.();
  }

  function showSection(sectionName, opts = {}) {
    const handler = global.DenjoyShellRouter?.showSection;
    return handler ? handler(sectionName, opts) : undefined;
  }

  global.DenjoyMspShellNav = {
    getSubnavItemMeta,
    activateSectionSubtab,
    updateSubnav,
    setActiveSubnavItem,
    refreshSubnavCounts,
    showResultsPanel,
    showSection,
  };

  global.getSubnavItemMeta = getSubnavItemMeta;
  global.activateSectionSubtab = activateSectionSubtab;
  global.updateSubnav = updateSubnav;
  global.setActiveSubnavItem = setActiveSubnavItem;
  global.refreshSubnavCounts = refreshSubnavCounts;
  global.showResultsPanel = showResultsPanel;
  global.showSection = showSection;
})(window);
