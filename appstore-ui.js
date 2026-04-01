
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function insertHomeTools() {
    const homeSection = document.querySelector('[data-page="manage"]');
    const subtitle = homeSection;
    if (!homeSection || byId('expiryTopPanel')) return;

    const panel = document.createElement('div');
    panel.className = 'expiry-top-panel';
    panel.id = 'expiryTopPanel';

    panel.innerHTML = `
      <div class="expiry-top-left">
        <div class="expiry-top-title">⏳ Går ut snart</div>
        <div class="expiry-top-subtitle">Topp 5 viktigaste varorna först</div>
      </div>
    `;

    homeSection.prepend(panel);

    const dashboard = document.createElement('div');
    dashboard.id = 'expiryDashboardPro';
    dashboard.className = 'expiry-dashboard-pro';

    panel.after(dashboard);
  }

  function boot() {
    insertHomeTools();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
