/**
 * Deferred Module Loader
 * Lazy-loads heavy feature modules only when accessed
 * Reduces initial page load from 16 script files → 5 core
 */

(function initModuleLoader(global) {
  const ASSET_VERSION = String(global.__denjoyAssetVersion || '20260414-13');
  
  const LAZY_MODULES = {
    // Feature modules: only load when user navigates to them
    zerotrust: {
      files: ['js/zerotrust.js'],
      trigger: '[data-section="zerotrust"]',
      requiresAuth: true,
    },
    remediate: {
      files: ['js/remediate.js'],
      trigger: '[data-section="remediate"]',
      requiresAuth: true,
    },
    assessment: {
      files: ['js/assessment-ui.js', 'js/assessment.js', 'js/results-viewer.js'],
      trigger: '[data-section="assessment"]',
      requiresAuth: true,
    },
    intune: {
      files: ['js/intune.js', 'js/intune-management-hub.js'],
      styles: ['css/intune-policy-mgmt.css'],
      trigger: '[data-section="intune"], [data-section="intuneManagementHub"]',
      requiresAuth: true,
    },
    bevindingen: {
      files: ['js/bevindingen.js'],
      trigger: '[data-section="bevindingen"]',
      requiresAuth: true,
    },
  };

  const loadedModules = new Set();
  let isLoadingModule = new Set();

  /**
   * Load module asynchronously
   */
  async function loadModule(moduleName) {
    if (loadedModules.has(moduleName)) {
      return; // Already loaded
    }

    if (isLoadingModule.has(moduleName)) {
      // Wait for ongoing load
      while (isLoadingModule.has(moduleName)) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return;
    }

    const module = LAZY_MODULES[moduleName];
    if (!module) {
      console.warn(`Module not found: ${moduleName}`);
      return;
    }

    isLoadingModule.add(moduleName);

    try {
      // Load all files for this module sequentially
      for (const file of module.files) {
        await loadScript(file);
      }

      // Load any stylesheets for this module
      for (const style of (module.styles || [])) {
        loadStyle(style);
      }

      loadedModules.add(moduleName);
      console.log(`✓ Module loaded: ${moduleName}`);

      // Trigger any setup after load
      window.dispatchEvent(new CustomEvent('moduleLoaded', { detail: { module: moduleName } }));
    } catch (err) {
      console.error(`Failed to load module ${moduleName}:`, err);
    } finally {
      isLoadingModule.delete(moduleName);
    }
  }

  function resolveAssetPath(src) {
    if (!src || /^https?:\/\//i.test(src)) return src;
    return src.includes('?') ? `${src}&v=${encodeURIComponent(ASSET_VERSION)}` : `${src}?v=${encodeURIComponent(ASSET_VERSION)}`;
  }

  /**
   * Load single script file
   */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const resolvedSrc = resolveAssetPath(src);
      const existing = document.querySelector(`script[src="${resolvedSrc}"]`);
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = resolvedSrc;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${resolvedSrc}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Load a CSS stylesheet (fire-and-forget, idempotent)
   */
  function loadStyle(href) {
    const resolvedHref = resolveAssetPath(href);
    if (document.querySelector(`link[href="${resolvedHref}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = resolvedHref;
    document.head.appendChild(link);
  }

  /**
   * Setup lazy-loading triggers
   * When user clicks module nav item, lazy-load the corresponding scripts
   */
  function setupTriggers() {
    document.addEventListener('click', async (event) => {
      for (const [moduleName, config] of Object.entries(LAZY_MODULES)) {
        const trigger = event.target.closest(config.trigger);
        if (trigger && !loadedModules.has(moduleName)) {
          // Show loading spinner
          const spinner = document.createElement('div');
          spinner.className = 'module-loading-spinner';
          document.body.appendChild(spinner);

          await loadModule(moduleName);

          // Remove spinner
          spinner.remove();
          break;
        }
      }
    });
  }

  /**
   * Preload module in background (optional)
   * E.g., after 2s of idle time
   */
  function preloadModule(moduleName, delayMs = 2000) {
    if (loadedModules.has(moduleName)) return;

    setTimeout(() => {
      if (document.hidden) return; // Don't preload if tab not visible
      
      console.log(`[Preload] Loading module: ${moduleName}`);
      loadModule(moduleName).catch(() => {
        // Preload errors are non-blocking
      });
    }, delayMs);
  }

  // Initialize
  setupTriggers();

  // Preload modules in this order (after 3s, 4s, 5s)
  preloadModule('assessment', 3000);
  preloadModule('zerotrust', 4000);
  preloadModule('intune', 5000);

  // Export API
  global.ModuleLoader = {
    load: loadModule,
    preload: preloadModule,
    isLoaded: (name) => loadedModules.has(name),
  };

})(window);
