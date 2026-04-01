
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
    panel.innerHTML = `<div>⏳ Går ut snart</div>`;

    homeSection.prepend(panel);

    const dashboard = document.createElement('div');
    dashboard.id = 'expiryDashboardPro';
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
