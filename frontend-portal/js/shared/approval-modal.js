/**
 * Approval Workflow Modal
 * Handles HTTP 402 responses: shows modal to request approval for sensitive actions
 */
(function initApprovalModal(global) {
  
  let currentApprovalRequest = null;
  let approvalModalElement = null;
  
  /**
   * Show approval request modal
   * @param {Object} config - {actionKey, actionName, actionDescription, requiredApprovers, approvalPolicyId}
   * @param {Function} onApprovalRequested - callback(approvalId)
   * @param {Function} onCancelled - callback()
   */
  function showApprovalModal(config, onApprovalRequested, onCancelled) {
    currentApprovalRequest = config;
    
    // Create modal if not exists
    if (!approvalModalElement) {
      approvalModalElement = createApprovalModalElement();
      document.body.appendChild(approvalModalElement);
    }
    
    // Populate modal with action details
    const titleEl = approvalModalElement.querySelector('.approval-modal-title');
    const descEl = approvalModalElement.querySelector('.approval-modal-action-desc');
    const neededEl = approvalModalElement.querySelector('.approval-modal-approvers-needed');
    
    titleEl.textContent = config.actionName || 'Actie vereist goedkeuring';
    descEl.textContent = config.actionDescription || 'Deze actie vereist goedkeuring van bepaalde rollen.';
    neededEl.textContent = `${config.requiredApprovers || 1} goedkeurende(n) nodig`;
    
    // Setup button callbacks
    const requestBtn = approvalModalElement.querySelector('[data-approval-action=request]');
    const cancelBtn = approvalModalElement.querySelector('[data-approval-action=cancel]');
    
    requestBtn.onclick = async () => {
      requestBtn.disabled = true;
      requestBtn.textContent = 'Bezig...';
      try {
        const approvalId = await requestApproval(config);
        if (approvalId && onApprovalRequested) {
          onApprovalRequested(approvalId);
        }
      } finally {
        requestBtn.disabled = false;
        requestBtn.textContent = 'Goedkeuring aanvragen';
        hideApprovalModal();
      }
    };
    
    cancelBtn.onclick = () => {
      hideApprovalModal();
      if (onCancelled) onCancelled();
    };
    
    // Show modal
    approvalModalElement.style.display = 'flex';
    approvalModalElement.classList.add('is-visible');
  }
  
  function hideApprovalModal() {
    if (approvalModalElement) {
      approvalModalElement.style.display = 'none';
      approvalModalElement.classList.remove('is-visible');
    }
    currentApprovalRequest = null;
  }
  
  /**
   * Request approval via backend
   */
  async function requestApproval(config) {
    try {
      const payload = {
        action_key: config.actionKey,
        action_name: config.actionName,
        action_description: config.actionDescription,
        metadata: config.metadata || {},
        requested_at: new Date().toISOString(),
        requested_by: config.requestedBy || 'current-user',
      };
      const data = typeof global.apiFetch === 'function'
        ? await global.apiFetch('/api/approvals/request', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
        : await fallbackApprovalRequest(payload);

      if (data.approval_id) {
        showApprovalRequestedMessage(data.approval_id);
        return data.approval_id;
      }
      
      alert('Goedkeuring aanvragen mislukt: onbekende fout');
      return null;
    } catch (err) {
      console.error('Error requesting approval:', err);
      alert(`Fout bij aanvragen goedkeuring: ${err.message}`);
      return null;
    }
  }

  async function fallbackApprovalRequest(payload) {
    const token = sessionStorage.getItem('denjoy_token')
      || localStorage.getItem('denjoy_token')
      || localStorage.getItem('denjoy_auth_token')
      || '';
    const response = await fetch('/api/approvals/request', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}`, 'X-CSRF-Token': token } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error((data && data.error) || `HTTP ${response.status}`);
    }
    return data;
  }
  
  function showApprovalRequestedMessage(approvalId) {
    const msg = document.createElement('div');
    msg.className = 'approval-message approval-message-success';
    msg.innerHTML = `
      <strong>✓ Goedkeuring aangevraagd</strong>
      <p>Je aanvraag (ID: ${approvalId}) is ingediend. Wacht op goedkeuring van een beheerder.</p>
    `;
    document.body.appendChild(msg);
    
    setTimeout(() => {
      msg.classList.add('is-visible');
    }, 50);
    
    setTimeout(() => {
      msg.classList.remove('is-visible');
      setTimeout(() => msg.remove(), 300);
    }, 4000);
  }
  
  function createApprovalModalElement() {
    const modal = document.createElement('div');
    modal.className = 'approval-modal';
    modal.innerHTML = `
      <div class="approval-modal-overlay"></div>
      <div class="approval-modal-content">
        <div class="approval-modal-header">
          <h3 class="approval-modal-title">Actie vereist goedkeuring</h3>
          <button type="button" class="approval-modal-close" data-approval-action="cancel" aria-label="Sluiten">×</button>
        </div>
        <div class="approval-modal-body">
          <div class="approval-modal-icon">🔒</div>
          <p class="approval-modal-action-desc">Deze actie vereist goedkeuring van bepaalde rollen.</p>
          <div class="approval-modal-approvers">
            <label>Benodigde goedkeuringen:</label>
            <p class="approval-modal-approvers-needed">1 goedkeurende(n)</p>
          </div>
          <div class="approval-modal-info">
            <p><strong>Wat gebeurt er:</strong></p>
            <ul>
              <li>Je aanvraag wordt ingediend naar beheerders</li>
              <li>Wacht op goedkeuring van een gemachtigde rol</li>
              <li>Eenmaal goedgekeurd, kan je actie voltooien</li>
            </ul>
          </div>
        </div>
        <div class="approval-modal-footer">
          <button type="button" class="btn btn-outline" data-approval-action="cancel">Annuleren</button>
          <button type="button" class="btn btn-primary" data-approval-action="request">Goedkeuring aanvragen</button>
        </div>
      </div>
    `;
    return modal;
  }
  
  /**
   * Retry action after approval granted
   */
  async function retryActionAfterApproval(originalPath, originalOptions, approvalId) {
    const token = sessionStorage.getItem('denjoy_token')
      || localStorage.getItem('denjoy_token')
      || localStorage.getItem('denjoy_auth_token')
      || '';
    const retryOptions = {
      ...originalOptions,
      headers: {
        ...(originalOptions.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}`, 'X-CSRF-Token': token } : {}),
        'X-Approval-ID': approvalId,
      },
    };
    
    // Retry the original action
    const response = await fetch(originalPath, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...retryOptions.headers,
      },
      ...retryOptions,
    });
    
    return response;
  }
  
  // Export to global
  global.ApprovalModal = {
    show: showApprovalModal,
    hide: hideApprovalModal,
    requestApproval: requestApproval,
    retryActionAfterApproval: retryActionAfterApproval,
  };
  
})(window);
