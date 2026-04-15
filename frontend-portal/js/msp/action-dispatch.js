(function initDenjoyMspActionDispatch(global) {
  'use strict';

  function invokeIfFn(handler, ...args) {
    if (typeof handler !== 'function') return;
    return handler(...args);
  }

  function bindActions(root) {
    if (!root) return;
    root.querySelectorAll('[data-action]').forEach((btn) => {
      if (btn._actionBound) return;
      btn._actionBound = true;
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        const action = btn.dataset.action;
        const id = btn.dataset.id || '';
        const extra = btn.dataset.extra || '';
        switch (action) {
          case 'selectTenant': invokeIfFn(global.selectTenantFromManagement, id); break;
          case 'selectTenantPill': invokeIfFn(global.selectTenantFromPill, id); break;
          case 'deleteTenant': invokeIfFn(global.deleteTenantFromManagement, id); break;
          case 'viewCustomer': invokeIfFn(global._showKlantDetail, id); break;
          case 'editCustomer': invokeIfFn(global._showKlantForm, id); break;
          case 'viewPortalUser': invokeIfFn(global.openPortalUserDetail, id); break;
          case 'togglePortalUser': invokeIfFn(global._toggleUserActive, id, extra === '1'); break;
          case 'showSection': invokeIfFn(global.showSection, id || 'overview'); break;
          case 'viewRun': invokeIfFn(global.viewRunDetails, id); break;
          case 'openUrl': if (id) global.open(id, '_blank'); break;
          case 'archiveRun': invokeIfFn(global.archiveReportRun, id); break;
          case 'restoreRun': invokeIfFn(global.restoreReportRun, id); break;
          case 'deleteRun': invokeIfFn(global.deleteRunPermanently, id); break;
          case 'stopRun': invokeIfFn(global.stopRunById, id); break;
          case 'setStatus': invokeIfFn(global.setActionStatus, id, extra); break;
          case 'editFindingAction': invokeIfFn(global.startEditFindingAction, id); break;
          case 'viewFindingAction': invokeIfFn(global.openFindingActionDetail, id); break;
          case 'viewApproval': invokeIfFn(global.openApprovalDetail, id); break;
          case 'decideApproval': invokeIfFn(global._gdkDecide, id, extra); break;
          case 'viewJob': invokeIfFn(global.openJobDetail, id); break;
          case 'cancelJob': invokeIfFn(global._jmCancel, id); break;
          case 'viewCostSnapshot': invokeIfFn(global.openCostSnapshotDetail, id); break;
          case 'editCostSnapshot': invokeIfFn(global.openKostenSnapshotEditForm, id); break;
          case 'deleteCostSnapshot': invokeIfFn(global.deleteCostSnapshot, id); break;
          default:
            console.warn('Onbekende actie:', action);
        }
      });
    });
  }

  global.DenjoyMspActionDispatch = { bindActions };
  global.bindActions = bindActions;
})(window);
