(function initDashboardCompat(global) {
  if (!global.loadHubSection) {
    global.loadHubSection = async () => {
      console.warn('loadHubSection: hub-sections module not loaded');
    };
  }
})(window);
