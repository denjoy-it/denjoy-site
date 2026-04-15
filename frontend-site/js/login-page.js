(function initLoginPage() {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var FETCH_TIMEOUT_MS = 10000;

  function getSafeNextPath(defaultPath) {
    try {
      var params = new URLSearchParams(window.location.search || '');
      var next = String(params.get('next') || '').trim();
      if (!next) return defaultPath;
      if (!next.startsWith('/')) return defaultPath;
      if (next.startsWith('//')) return defaultPath;
      return next;
    } catch (_) {
      return defaultPath;
    }
  }

  var NEXT_PATH = getSafeNextPath('/frontend-portal/dashboard.html');

  function showError(errDiv, inputEl, msg) {
    errDiv.textContent = msg;
    errDiv.style.display = 'block';
    if (inputEl) inputEl.setAttribute('aria-invalid', 'true');
  }

  function clearError(errDiv) {
    errDiv.style.display = 'none';
    errDiv.textContent = '';
  }

  function fetchWithTimeout(url, options) {
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .then(function(res) {
        clearTimeout(timeoutId);
        return res;
      })
      .catch(function(err) {
        clearTimeout(timeoutId);
        throw err;
      });
  }

  async function emailLogin(event) {
    event.preventDefault();
    var btn     = document.getElementById('emailLoginBtn');
    var errDiv  = document.getElementById('emailError');
    var emailEl = document.getElementById('loginEmail');
    var pwdEl   = document.getElementById('loginPassword');
    var email   = emailEl ? emailEl.value.trim() : '';
    var pwd     = pwdEl  ? pwdEl.value           : '';

    clearError(errDiv);
    if (emailEl) emailEl.removeAttribute('aria-invalid');
    if (pwdEl)   pwdEl.removeAttribute('aria-invalid');

    if (!email && !pwd) {
      showError(errDiv, emailEl, 'Vul je e-mailadres en wachtwoord in.');
      if (emailEl) emailEl.focus();
      return;
    }
    if (!email) {
      showError(errDiv, emailEl, 'Vul je e-mailadres in.');
      if (emailEl) emailEl.focus();
      return;
    }
    if (!EMAIL_RE.test(email)) {
      showError(errDiv, emailEl, 'Vul een geldig e-mailadres in.');
      if (emailEl) emailEl.focus();
      return;
    }
    if (!pwd) {
      showError(errDiv, pwdEl, 'Vul je wachtwoord in.');
      if (pwdEl) pwdEl.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Inloggen...';

    try {
      var res = await fetchWithTimeout('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: pwd }),
        credentials: 'include'
      });

      var text = await res.text();
      var data = null;
      try { data = JSON.parse(text); } catch (_) { data = null; }

      if (!res.ok || !data || !data.ok) {
        var apiMsg = data && data.error ? data.error : ('HTTP ' + res.status);
        throw new Error(apiMsg);
      }

      sessionStorage.setItem('denjoy_token', data.token);
      localStorage.removeItem('denjoy_token');
      sessionStorage.setItem('denjoy_role', data.role);
      sessionStorage.setItem('denjoy_user_name', data.display_name || data.email);
      sessionStorage.setItem('denjoy_user_email', data.email);

      window.location.href = NEXT_PATH;
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Inloggen →';
      var errorMsg = err.name === 'AbortError'
        ? 'Verbinding te traag. Controleer je netwerk en probeer opnieuw.'
        : (err && err.message ? err.message : 'Inloggen mislukt.');
      showError(errDiv, null, errorMsg);
    }
  }

  async function msalLogin() {
    var btn     = document.getElementById('msLoginBtn');
    var label   = document.getElementById('msLoginText');
    var errDiv  = document.getElementById('msLoginError');

    clearError(errDiv);
    btn.disabled = true;
    label.textContent = 'Verbinden...';

    try {
      var cfg = await fetchWithTimeout('/api/auth/msal-config')
        .then(function(r) { return r.json(); })
        .catch(function() { return {}; });

      var clientId = cfg.auth_client_id || '';
      var tenantId = cfg.auth_tenant_id || 'organizations';

      if (!clientId) {
        throw new Error('Geen Client ID ingesteld. Ga naar Instellingen → App-registratie en sla een Client ID op.');
      }

      var msalApp = new msal.PublicClientApplication({
        auth: {
          clientId: clientId,
          authority: 'https://login.microsoftonline.com/' + tenantId,
          redirectUri: window.location.origin + '/frontend-portal/dashboard.html'
        },
        cache: { cacheLocation: 'sessionStorage' }
      });
      await msalApp.initialize();

      sessionStorage.setItem('denjoy_msal_client_id', clientId);
      sessionStorage.setItem('denjoy_msal_tenant_id', tenantId);

      await msalApp.loginRedirect({ scopes: ['User.Read', 'openid', 'profile'] });
    } catch (err) {
      btn.disabled = false;
      label.textContent = 'Inloggen met Microsoft';
      var errorMsg = err.name === 'AbortError'
        ? 'Configuratie ophalen mislukt. Controleer je verbinding.'
        : (err && err.message ? err.message : 'Login mislukt.');
      showError(errDiv, null, errorMsg);
    }
  }

  (async function checkExistingSession() {
    try {
      var token = sessionStorage.getItem('denjoy_token') || localStorage.getItem('denjoy_token');
      if (!token) return;

      var res = await fetchWithTimeout('/api/auth/verify', {
        headers: { 'Authorization': 'Bearer ' + token },
        credentials: 'include'
      });

      if (res.ok) {
        sessionStorage.setItem('denjoy_token', token);
        localStorage.removeItem('denjoy_token');
        window.location.href = NEXT_PATH;
      } else {
        localStorage.removeItem('denjoy_token');
        sessionStorage.removeItem('denjoy_token');
      }
    } catch (_) {}
  })();

  // Prefer form-submit listener so Enter key works; fall back to button click
  var form = document.getElementById('emailLoginForm');
  if (form) {
    form.addEventListener('submit', function(event) {
      void emailLogin(event);
    });
  } else {
    var emailBtn = document.getElementById('emailLoginBtn');
    if (emailBtn) {
      emailBtn.addEventListener('click', function(event) {
        void emailLogin(event);
      });
    }
  }

  var msBtn = document.getElementById('msLoginBtn');
  if (msBtn) {
    msBtn.addEventListener('click', function() {
      void msalLogin();
    });
  }
})();
